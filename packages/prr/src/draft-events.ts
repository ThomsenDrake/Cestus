import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  calculateEstimatedDeadline,
  type DeadlineEstimateKind,
  type EstimatedDeadline
} from "./deadlines.js";
import {
  floridaPublicRecordsPack,
  usFederalFoiaPack,
  type JurisdictionPack
} from "./jurisdiction-packs.js";
import type { ContactRef, JurisdictionPackRef } from "./types.js";

export type { ContactRef, DeadlineEstimateKind, JurisdictionPackRef };

export interface ActorRef {
  readonly id: string;
  readonly kind: "human" | "extractor" | "system";
  readonly label: string;
}

export interface BuildDraftRequestEventsInput {
  readonly prrRequestId: string;
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly agency: ContactRef;
  readonly requester: ContactRef;
  readonly requestText: string;
  readonly receivedAt: string;
  readonly actor: ActorRef;
  readonly occurredAt: string;
  readonly deadlineEstimateKind?: DeadlineEstimateKind;
}

export interface CreateDraftRequestInput {
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly agency: ContactRef;
  readonly requester: ContactRef;
  readonly requestText: string;
  readonly receivedAt: string;
  readonly deadlineEstimateKind?: DeadlineEstimateKind;
}

export interface DraftRequestAppendableEvents {
  readonly requestCreated: AppendableKnowledgeEvent<"prr.request.created">;
  readonly deadlineEstimated: AppendableKnowledgeEvent<"prr.deadline.estimated">;
}

export interface BuildDeadlineEstimatedEventInput {
  readonly prrRequestId: string;
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly actor: ActorRef;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly estimate: EstimatedDeadline;
  readonly causationId?: string;
}

export function buildDraftRequestEvents(
  input: BuildDraftRequestEventsInput
): DraftRequestAppendableEvents {
  const correlationId = draftRequestCorrelationId(input);
  const pack = resolveJurisdictionPack(input.jurisdictionPack);
  const estimate = calculateEstimatedDeadline(pack, {
    prrRequestId: input.prrRequestId,
    receivedAt: input.receivedAt,
    ...(input.deadlineEstimateKind === undefined ? {} : { estimateKind: input.deadlineEstimateKind })
  });

  return {
    requestCreated: buildDraftRequestCreatedEvent({ ...input, correlationId }),
    deadlineEstimated: buildDeadlineEstimatedEvent({
      prrRequestId: input.prrRequestId,
      jurisdictionPack: input.jurisdictionPack,
      actor: input.actor,
      occurredAt: input.occurredAt,
      correlationId,
      estimate
    })
  };
}

export function buildDraftRequestCreatedEvent(
  input: BuildDraftRequestEventsInput & { readonly correlationId?: string }
): AppendableKnowledgeEvent<"prr.request.created"> {
  return {
    type: "prr.request.created",
    version: 1,
    streamId: input.prrRequestId,
    context: eventContext(input),
    payload: {
      prrRequestId: input.prrRequestId,
      jurisdictionPack: cloneJurisdictionPackRef(input.jurisdictionPack),
      agency: cloneContactRef(input.agency),
      requester: cloneContactRef(input.requester),
      requestText: input.requestText,
      status: "draft"
    }
  };
}

export function buildDeadlineEstimatedEvent(
  input: BuildDeadlineEstimatedEventInput
): AppendableKnowledgeEvent<"prr.deadline.estimated"> {
  return {
    type: "prr.deadline.estimated",
    version: 1,
    streamId: input.prrRequestId,
    context: eventContext(input),
    payload: {
      prrRequestId: input.prrRequestId,
      deadlineDate: input.estimate.deadlineDate,
      confidence: input.estimate.confidence,
      explanation: input.estimate.explanation,
      citedRules: input.estimate.citedRules.map((rule) => ({
        jurisdictionPack: cloneJurisdictionPackRef(rule.jurisdictionPack),
        label: rule.label,
        citation: rule.citation,
        ...(rule.url === undefined ? {} : { url: rule.url })
      }))
    }
  };
}

export function draftRequestCorrelationId(input: {
  readonly prrRequestId: string;
  readonly occurredAt: string;
}): string {
  return `corr_${input.prrRequestId}_${input.occurredAt.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function resolveJurisdictionPack(ref: JurisdictionPackRef): JurisdictionPack {
  const pack = [floridaPublicRecordsPack, usFederalFoiaPack].find(
    (candidate) => candidate.name === ref.name && candidate.version === ref.version
  );

  if (pack === undefined) {
    throw new Error(`Unsupported jurisdiction pack ${ref.name}@${ref.version}`);
  }

  return pack;
}

function eventContext(input: {
  readonly prrRequestId?: string;
  readonly actor: ActorRef;
  readonly occurredAt: string;
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly correlationId?: string;
  readonly causationId?: string;
}): KnowledgeEvent["context"] {
  return {
    actor: {
      id: input.actor.id,
      kind: input.actor.kind,
      label: input.actor.label
    },
    occurredAt: input.occurredAt,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    correlationId:
      input.correlationId ??
      draftRequestCorrelationId({
        prrRequestId: requirePrrRequestId(input.prrRequestId),
        occurredAt: input.occurredAt
      }),
    coreVersion: "0.1.0",
    packVersions: {
      core: "0.1.0",
      [input.jurisdictionPack.name]: input.jurisdictionPack.version
    }
  };
}

function cloneJurisdictionPackRef(ref: JurisdictionPackRef): JurisdictionPackRef {
  return {
    name: ref.name,
    version: ref.version
  };
}

function cloneContactRef(contact: ContactRef): ContactRef {
  return {
    name: contact.name,
    ...(contact.email === undefined ? {} : { email: contact.email }),
    ...(contact.phone === undefined ? {} : { phone: contact.phone })
  };
}

function requirePrrRequestId(prrRequestId: string | undefined): string {
  if (prrRequestId === undefined) {
    throw new Error("Cannot build PRR event context without correlationId or prrRequestId");
  }
  return prrRequestId;
}
