import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  calculateEstimatedDeadline,
  type DeadlineCalculationInput,
  type EstimatedDeadline
} from "./deadlines.js";
import {
  buildDeadlineEstimatedEvent,
  buildDraftRequestCreatedEvent,
  draftRequestCorrelationId,
  resolveJurisdictionPack,
  type ActorRef,
  type CreateDraftRequestInput
} from "./draft-events.js";
import type { JurisdictionPack } from "./jurisdiction-packs.js";
import { buildPrrProjection } from "./projection.js";
import { buildPrrWorkspaceDto, type PrrWorkspaceDto } from "./read-api.js";

export type PrrRuntimeNow = string | (() => string);

export interface PrrRuntimeDependencies {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now?: PrrRuntimeNow;
  readonly requestIdFactory?: () => string;
  readonly deadlineCalculator?: DeadlineCalculator;
}

export type DeadlineCalculator = (
  pack: JurisdictionPack,
  input: DeadlineCalculationInput
) => EstimatedDeadline;

export interface SeedIfEmptyResult {
  readonly appendedCount: number;
  readonly skipped?: true;
}

export interface PrrRuntimeDiagnostic {
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}

export type CreateDraftRequestFailedStep =
  | "validate-input"
  | "append-request"
  | "estimate-deadline"
  | "append-deadline";

export type CreateDraftRequestResult =
  | {
      readonly ok: true;
      readonly committedEventIds: readonly string[];
      readonly workspace: PrrWorkspaceDto;
    }
  | {
      readonly ok: false;
      readonly failedStep: CreateDraftRequestFailedStep;
      readonly committedEventIds: readonly string[];
      readonly diagnostic: PrrRuntimeDiagnostic;
      readonly workspace: PrrWorkspaceDto;
    };

export interface PrrRuntime {
  loadWorkspace(): Promise<PrrWorkspaceDto>;
  seedIfEmpty(events: readonly KnowledgeEvent[]): Promise<SeedIfEmptyResult>;
  createDraftRequest(input: CreateDraftRequestInput): Promise<CreateDraftRequestResult>;
  readEvents(): Promise<KnowledgeEvent[]>;
}

export function createPrrRuntime(dependencies: PrrRuntimeDependencies): PrrRuntime {
  const now = dependencies.now ?? (() => new Date().toISOString());
  let nextGeneratedRequestId = 1;
  const requestIdFactory =
    dependencies.requestIdFactory ??
    (() => {
      const requestNumber = nextGeneratedRequestId;
      nextGeneratedRequestId += 1;
      return `prr_draft_${currentTimestamp(now).replaceAll(/[^a-zA-Z0-9]/g, "_")}_${requestNumber}`;
    });
  const deadlineCalculator = dependencies.deadlineCalculator ?? calculateEstimatedDeadline;

  async function loadWorkspace(): Promise<PrrWorkspaceDto> {
    return buildWorkspace(await dependencies.ledger.readAll(), currentTimestamp(now));
  }

  async function createDraftRequest(input: CreateDraftRequestInput): Promise<CreateDraftRequestResult> {
    const occurredAt = currentTimestamp(now);
    const prrRequestId = requestIdFactory();
    const correlationId = draftRequestCorrelationId({ prrRequestId, occurredAt });
    let jurisdictionPack: JurisdictionPack;
    try {
      jurisdictionPack = resolveJurisdictionPack(input.jurisdictionPack);
    } catch {
      return failure(
        "validate-input",
        [],
        safeDiagnostic("Unsupported jurisdiction pack", ["choose a supported jurisdiction pack"])
      );
    }

    const requestCreated = buildDraftRequestCreatedEvent({
      ...input,
      prrRequestId,
      actor: dependencies.actor,
      occurredAt,
      correlationId
    });
    const validation = validateAppendableEvent(requestCreated, 1);

    if (!validation.success) {
      return failure("validate-input", [], safeDiagnostic(validation.message, ["review draft request input"]));
    }

    let committedCreated: KnowledgeEvent;
    try {
      committedCreated = await dependencies.ledger.append(requestCreated, { expectedNextSequence: 1 });
    } catch (error) {
      return failure("append-request", [], safeDiagnostic(error, ["choose a new request ID", "reload workspace"]));
    }

    let estimate: EstimatedDeadline;
    try {
      estimate = deadlineCalculator(jurisdictionPack, {
        prrRequestId,
        receivedAt: input.receivedAt,
        ...(input.deadlineEstimateKind === undefined ? {} : { estimateKind: input.deadlineEstimateKind })
      });
    } catch (error) {
      return failure(
        "estimate-deadline",
        [committedCreated.id],
        safeDiagnostic(error, ["review jurisdiction pack selection", "retry deadline estimate"])
      );
    }

    const deadlineEstimated = buildDeadlineEstimatedEvent({
      prrRequestId,
      jurisdictionPack: input.jurisdictionPack,
      actor: dependencies.actor,
      occurredAt,
      correlationId,
      causationId: committedCreated.id,
      estimate
    });

    try {
      const committedDeadline = await dependencies.ledger.append(deadlineEstimated, { expectedNextSequence: 2 });
      return {
        ok: true,
        committedEventIds: Object.freeze([committedCreated.id, committedDeadline.id]),
        workspace: await loadWorkspace()
      };
    } catch (error) {
      return failure(
        "append-deadline",
        [committedCreated.id],
        safeDiagnostic(error, ["reload workspace", "retry deadline estimate"])
      );
    }
  }

  async function failure(
    failedStep: CreateDraftRequestFailedStep,
    committedEventIds: readonly string[],
    diagnostic: PrrRuntimeDiagnostic
  ): Promise<CreateDraftRequestResult> {
    return {
      ok: false,
      failedStep,
      committedEventIds: Object.freeze([...committedEventIds]),
      diagnostic,
      workspace: await loadWorkspace()
    };
  }

  return {
    loadWorkspace,
    async seedIfEmpty(events: readonly KnowledgeEvent[]): Promise<SeedIfEmptyResult> {
      if ((await dependencies.ledger.readAll()).length > 0) {
        return { appendedCount: 0, skipped: true };
      }

      const committedIdsByFixtureId = new Map<string, string>();
      const fixtureIds = new Set(events.map((event) => event.id));
      for (const event of events) {
        const appendable = appendableSeedEvent(event, committedIdsByFixtureId, fixtureIds);
        const committed = await dependencies.ledger.append(appendable);
        committedIdsByFixtureId.set(event.id, committed.id);
      }

      return { appendedCount: events.length };
    },
    createDraftRequest,
    readEvents() {
      return dependencies.ledger.readAll();
    }
  };
}

function buildWorkspace(events: readonly KnowledgeEvent[], now: string): PrrWorkspaceDto {
  return buildPrrWorkspaceDto(buildPrrProjection(events), { now });
}

function appendableSeedEvent(
  event: KnowledgeEvent,
  committedIdsByFixtureId: ReadonlyMap<string, string>,
  fixtureIds: ReadonlySet<string>
): AppendableKnowledgeEvent {
  const rewrittenCausationId = rewriteSeedCausationId(event, committedIdsByFixtureId, fixtureIds);
  const context = {
    ...event.context,
    ...(rewrittenCausationId === undefined ? {} : { causationId: rewrittenCausationId })
  };
  const { id: _id, sequence: _sequence, ...appendable } = {
    ...event,
    context
  };

  return appendable;
}

function rewriteSeedCausationId(
  event: KnowledgeEvent,
  committedIdsByFixtureId: ReadonlyMap<string, string>,
  fixtureIds: ReadonlySet<string>
): string | undefined {
  const fixtureCausationId = event.context.causationId;
  if (fixtureCausationId === undefined) {
    return undefined;
  }

  if (!fixtureIds.has(fixtureCausationId)) {
    throw new Error(
      `Cannot seed ${event.id}: causationId ${fixtureCausationId} is not present in the seed fixture set`
    );
  }

  const committedCausationId = committedIdsByFixtureId.get(fixtureCausationId);
  if (committedCausationId === undefined) {
    throw new Error(
      `Cannot seed ${event.id}: causationId ${fixtureCausationId} has not been committed earlier in seed order`
    );
  }

  return committedCausationId;
}

function validateAppendableEvent(
  event: AppendableKnowledgeEvent,
  sequence: number
): { readonly success: true } | { readonly success: false; readonly message: string } {
  const result = validateKnowledgeEvent({
    ...event,
    id: "evt_prr_runtime_validation",
    sequence
  });

  if (result.success) {
    return { success: true };
  }

  return { success: false, message: result.error.message };
}

function currentTimestamp(now: PrrRuntimeNow): string {
  return typeof now === "function" ? now() : now;
}

function safeDiagnostic(error: unknown, allowedRepairActions: readonly string[]): PrrRuntimeDiagnostic {
  return Object.freeze({
    message: safeMessage(error),
    allowedRepairActions: Object.freeze([...allowedRepairActions])
  });
}

function safeMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (containsSecretTerm(rawMessage)) {
    return "Runtime diagnostic redacted because the failure message referenced sensitive material.";
  }
  return rawMessage;
}

function containsSecretTerm(message: string): boolean {
  return /token|secret|password|oauth|credential|authorization|bearer|api_key|private_key|session/i.test(
    message
  );
}
