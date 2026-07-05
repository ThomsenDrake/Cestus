import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../../../ontology/src/contracts.js";
import {
  buildDraftRequestEvents,
  type ActorRef,
  type ContactRef,
  type DeadlineEstimateKind,
  type JurisdictionPackRef
} from "../../../prr/src/draft-events.js";
import { buildPrrProjection } from "../../../prr/src/projection.js";
import { buildPrrWorkspaceDto, type PrrWorkspaceDto } from "../../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../../prr/src/workspace-seed.js";

export type RequestsAdapterNow = string | (() => string);

export interface RequestsCreateDraftInput {
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly agency: ContactRef;
  readonly requester: ContactRef;
  readonly requestText: string;
  readonly receivedAt?: string;
  readonly deadlineEstimateKind?: DeadlineEstimateKind;
}

export type RequestsCreateDraftFailedStep =
  | "validate-input"
  | "append-request"
  | "estimate-deadline"
  | "append-deadline";

export interface RequestsDraftDiagnostic {
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}

export type RequestsCreateDraftResult =
  | {
      readonly ok: true;
      readonly prrRequestId: string;
      readonly committedEventIds: readonly string[];
      readonly workspace: PrrWorkspaceDto;
    }
  | {
      readonly ok: false;
      readonly failedStep: RequestsCreateDraftFailedStep;
      readonly committedEventIds: readonly string[];
      readonly diagnostic: RequestsDraftDiagnostic;
      readonly workspace: PrrWorkspaceDto;
    };

export interface RequestsWorkspaceAdapter {
  loadRequestsWorkspace(): Promise<PrrWorkspaceDto>;
  createDraftRequest(input: RequestsCreateDraftInput): Promise<RequestsCreateDraftResult>;
}

export interface LocalReplayRequestsAdapter extends RequestsWorkspaceAdapter {
  readEventsForTest(): readonly KnowledgeEvent[];
}

export interface LocalReplayRequestsAdapterOptions {
  readonly actor?: ActorRef;
  readonly now?: RequestsAdapterNow;
  readonly requestIdFactory?: () => string;
  readonly idFactory?: () => string;
}

export interface StaticRequestsAdapterOptions {
  readonly createDraftResult?:
    | RequestsCreateDraftResult
    | ((input: RequestsCreateDraftInput) => RequestsCreateDraftResult | Promise<RequestsCreateDraftResult>);
}

export interface HttpRequestsAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly fetcher?: typeof fetch;
}

const defaultActor: ActorRef = Object.freeze({
  id: "actor_ui_local",
  kind: "human",
  label: "Local UI user"
});

const draftDiagnostics: Record<RequestsCreateDraftFailedStep, RequestsDraftDiagnostic> = Object.freeze({
  "validate-input": Object.freeze({
    message: "Draft creation input did not match the request event contract. Review the required fields and try again.",
    allowedRepairActions: Object.freeze(["review draft request input"])
  }),
  "append-request": Object.freeze({
    message: "Draft creation could not start because the request stream already exists. Reload Requests and try again.",
    allowedRepairActions: Object.freeze(["reload Requests", "create a new draft"])
  }),
  "estimate-deadline": Object.freeze({
    message: "Draft creation could not estimate a deadline for the selected jurisdiction pack.",
    allowedRepairActions: Object.freeze(["select a supported jurisdiction pack", "retry deadline estimate"])
  }),
  "append-deadline": Object.freeze({
    message: "Draft was created, but the deadline estimate could not be committed. Reload Requests to inspect the draft.",
    allowedRepairActions: Object.freeze(["reload Requests", "retry deadline estimate"])
  })
});

export function createLocalReplayRequestsAdapter(
  seedEvents: readonly KnowledgeEvent[],
  options: LocalReplayRequestsAdapterOptions = {}
): LocalReplayRequestsAdapter {
  const events = seedEvents.map((event) => structuredClone(event));
  const usedEventIds = new Set(events.map((event) => event.id));
  const now = options.now ?? (() => new Date().toISOString());
  const actor = options.actor ?? defaultActor;
  let nextGeneratedRequestId = 1;
  const requestIdFactory =
    options.requestIdFactory ??
    (() => {
      const requestNumber = nextGeneratedRequestId;
      nextGeneratedRequestId += 1;
      return `prr_draft_${normalizeIdentifierPart(currentTimestamp(now))}_${requestNumber}`;
    });

  function buildWorkspace(generatedAt: string): PrrWorkspaceDto {
    return buildPrrWorkspaceDto(buildPrrProjection(events), { now: generatedAt });
  }

  async function createDraftRequest(input: RequestsCreateDraftInput): Promise<RequestsCreateDraftResult> {
    const occurredAt = currentTimestamp(now);
    const receivedAt = normalizeOptionalInput(input.receivedAt) ?? occurredAt;
    const prrRequestId = requestIdFactory();
    if (nextStreamSequence(events, prrRequestId) !== 1) {
      return createFailure("append-request", [], diagnosticForStep("append-request"), occurredAt);
    }

    let appendableEvents: {
      readonly requestCreated: AppendableKnowledgeEvent<"prr.request.created">;
      readonly deadlineEstimated: AppendableKnowledgeEvent<"prr.deadline.estimated">;
    };

    try {
      appendableEvents = buildDraftRequestEvents({
        ...input,
        prrRequestId,
        actor,
        occurredAt,
        receivedAt
      });
    } catch (error) {
      return createFailure(
        "estimate-deadline",
        [],
        diagnosticForStep("estimate-deadline"),
        occurredAt
      );
    }

    let committedCreated: KnowledgeEvent;
    try {
      committedCreated = commitAppendableEvent(
        appendableEvents.requestCreated,
        reserveEventId(options.idFactory, usedEventIds),
        1
      );
    } catch (error) {
      return createFailure("validate-input", [], diagnosticForStep("validate-input"), occurredAt);
    }

    try {
      const committedDeadline = commitAppendableEvent(
        {
          ...appendableEvents.deadlineEstimated,
          context: {
            ...appendableEvents.deadlineEstimated.context,
            causationId: committedCreated.id
          }
        },
        reserveEventId(options.idFactory, usedEventIds),
        2
      );

      return Object.freeze({
        ok: true,
        prrRequestId,
        committedEventIds: Object.freeze([committedCreated.id, committedDeadline.id]),
        workspace: buildWorkspace(occurredAt)
      });
    } catch (error) {
      return createFailure(
        "append-deadline",
        [committedCreated.id],
        diagnosticForStep("append-deadline"),
        occurredAt
      );
    }
  }

  function commitAppendableEvent(
    appendable: AppendableKnowledgeEvent,
    id: string,
    sequence: number
  ): KnowledgeEvent {
    const nextSequence = nextStreamSequence(events, appendable.streamId);
    if (nextSequence !== sequence) {
      throw new Error(
        `Concurrency conflict for ${appendable.streamId}: expected sequence ${sequence}, next sequence ${nextSequence}`
      );
    }

    const committed = {
      ...appendable,
      id,
      sequence
    } as KnowledgeEvent;
    const validation = validateKnowledgeEvent(committed);
    if (!validation.success) {
      throw new Error(validation.error.message);
    }

    events.push(structuredClone(committed));
    return committed;
  }

  function createFailure(
    failedStep: RequestsCreateDraftFailedStep,
    committedEventIds: readonly string[],
    diagnostic: RequestsDraftDiagnostic,
    generatedAt: string
  ): RequestsCreateDraftResult {
    return Object.freeze({
      ok: false,
      failedStep,
      committedEventIds: Object.freeze([...committedEventIds]),
      diagnostic,
      workspace: buildWorkspace(generatedAt)
    });
  }

  return Object.freeze({
    async loadRequestsWorkspace() {
      return buildWorkspace(currentTimestamp(now));
    },
    createDraftRequest,
    readEventsForTest() {
      return Object.freeze(events.map((event) => structuredClone(event)));
    }
  });
}

export function createStaticRequestsAdapter(
  workspace: PrrWorkspaceDto,
  options: StaticRequestsAdapterOptions = {}
): RequestsWorkspaceAdapter {
  let currentWorkspace = workspace;

  return Object.freeze({
    async loadRequestsWorkspace() {
      return currentWorkspace;
    },
    async createDraftRequest(input: RequestsCreateDraftInput) {
      const result =
        typeof options.createDraftResult === "function"
          ? await options.createDraftResult(input)
          : options.createDraftResult ??
            Object.freeze({
              ok: false,
              failedStep: "append-request",
              committedEventIds: Object.freeze([]),
              diagnostic: Object.freeze({
                message: "This Requests adapter cannot create draft requests.",
                allowedRepairActions: Object.freeze(["use a replay-capable Requests adapter"])
              }),
              workspace: currentWorkspace
            });

      currentWorkspace = result.workspace;
      return result;
    }
  });
}

export function createHttpRequestsAdapter(
  options: HttpRequestsAdapterOptions = {}
): RequestsWorkspaceAdapter {
  const baseUrl = options.baseUrl ?? "";
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  return Object.freeze({
    async loadRequestsWorkspace() {
      const response = await fetcher(`${baseUrl}/api/requests/workspace`, {
        headers: authHeaders(options.authToken),
        method: "GET"
      });
      if (!response.ok) {
        throw new Error(`Requests runtime returned HTTP ${response.status}.`);
      }

      try {
        return (await response.json()) as PrrWorkspaceDto;
      } catch (error) {
        throw new Error("Requests runtime returned invalid workspace JSON.");
      }
    },
    async createDraftRequest(input: RequestsCreateDraftInput) {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/api/requests/drafts`, {
          body: JSON.stringify(input),
          headers: {
            ...authHeaders(options.authToken),
            "content-type": "application/json"
          },
          method: "POST"
        });
      } catch (error) {
        return httpFailure("request failed", await safeWorkspaceFallback());
      }

      if (!response.ok) {
        return httpFailure(`HTTP ${response.status}`, await safeWorkspaceFallback());
      }

      try {
        return (await response.json()) as RequestsCreateDraftResult;
      } catch (error) {
        return httpFailure("invalid JSON", await safeWorkspaceFallback());
      }
    }
  });
}

export const httpRequestsAdapter = createHttpRequestsAdapter();

export const localReplayRequestsAdapter = createLocalReplayRequestsAdapter(prrWorkspaceSeedEvents);

export function loadRequestsWorkspace(): Promise<PrrWorkspaceDto> {
  return localReplayRequestsAdapter.loadRequestsWorkspace();
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

async function safeWorkspaceFallback(): Promise<PrrWorkspaceDto> {
  return buildPrrWorkspaceDto(buildPrrProjection([]), { now: new Date().toISOString() });
}

async function httpFailure(reason: string, workspace: PrrWorkspaceDto): Promise<RequestsCreateDraftResult> {
  return Object.freeze({
    ok: false,
    failedStep: "append-request",
    committedEventIds: Object.freeze([]),
    diagnostic: Object.freeze({
      message: `Requests runtime returned ${reason}.`,
      allowedRepairActions: Object.freeze(["reload Requests", "check the local runtime"])
    }),
    workspace
  });
}

function nextStreamSequence(events: readonly KnowledgeEvent[], streamId: string): number {
  return events.filter((event) => event.streamId === streamId).length + 1;
}

function reserveEventId(idFactory: (() => string) | undefined, usedEventIds: Set<string>): string {
  const baseId = normalizeEventId(idFactory?.() ?? randomEventId());
  let candidate = baseId;
  let suffix = 2;

  while (usedEventIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }

  usedEventIds.add(candidate);
  return candidate;
}

function randomEventId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID !== undefined) {
    return `evt_${randomUUID.call(globalThis.crypto)}`;
  }

  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeEventId(id: string): string {
  return id.startsWith("evt_") ? id : `evt_${id}`;
}

function normalizeIdentifierPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeOptionalInput(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function currentTimestamp(now: RequestsAdapterNow): string {
  return typeof now === "function" ? now() : now;
}

function diagnosticForStep(failedStep: RequestsCreateDraftFailedStep): RequestsDraftDiagnostic {
  const diagnostic = draftDiagnostics[failedStep];

  return Object.freeze({
    message: diagnostic.message,
    allowedRepairActions: Object.freeze([...diagnostic.allowedRepairActions])
  });
}
