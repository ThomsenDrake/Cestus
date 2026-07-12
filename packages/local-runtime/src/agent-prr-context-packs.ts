import {
  buildJurisdictionPackSummaryContextPack,
  buildPrrReadModelContextPack,
  hashAgentContextPack,
  jurisdictionPackSummaryPayloadParser,
  prrReadModelPayloadParser,
  registerPrrContextPackBuilders,
  type ContextPackDescriptor,
  type ContextPackRegistry,
  type PrrContextGateSnapshot,
  type PrrContextPackHashRef,
  type PrrContextPackRegistrationEntry
} from "../../agent/src/index.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildPrrProjection, type PrrRequestReadModel, type PrrTimelineEntry } from "../../prr/src/projection.js";
import { resolveJurisdictionPack } from "../../prr/src/draft-events.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface RegisterLocalRuntimeSelectedPrrContextPacksInput {
  readonly registry: ContextPackRegistry;
  readonly handle: LocalRuntimeHandle;
  readonly prrRequestId: string;
  readonly now: () => string;
  readonly policyVersion?: string;
}

const prrReadModelDescriptor = Object.freeze({
  contextPackId: "prr-read-model.v1",
  version: 1,
  label: "Selected request PRR read model",
  maxBytes: 32_768,
  requiredProvenanceKinds: Object.freeze(["event-id"]),
  redactionPolicy: "safe-normalized-summary",
  sourceProjection: "prr.projection.selected-request"
} satisfies ContextPackDescriptor);

const jurisdictionPackSummaryDescriptor = Object.freeze({
  contextPackId: "jurisdiction-pack-summary.v1",
  version: 1,
  label: "Selected request jurisdiction pack summary",
  maxBytes: 16_384,
  requiredProvenanceKinds: Object.freeze(["event-id", "content-hash"]),
  redactionPolicy: "safe-normalized-summary",
  sourceProjection: "prr.jurisdiction-pack.selected-request"
} satisfies ContextPackDescriptor);

export function registerLocalRuntimeSelectedPrrContextPacks(
  input: RegisterLocalRuntimeSelectedPrrContextPacksInput
): void {
  registerPrrContextPackBuilders({
    registry: input.registry,
    prrReadModel: prrReadModelRegistration(input),
    jurisdictionPackSummary: jurisdictionPackSummaryRegistration(input)
  });
}

function prrReadModelRegistration(
  input: RegisterLocalRuntimeSelectedPrrContextPacksInput
): PrrContextPackRegistrationEntry {
  return {
    descriptor: prrReadModelDescriptor,
    payloadParser: prrReadModelPayloadParser,
    registrationIdentity: "packages/local-runtime/agent-prr-context-packs:prr-read-model.v1@1",
    builder: {
      descriptor: prrReadModelDescriptor,
      async build() {
        const snapshot = await selectedPrrSnapshot(input);
        return buildPrrReadModelContextPack({
          generatedAt: input.now(),
          ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
          scope: { kind: "prr-request", id: input.prrRequestId },
          request: snapshot.request,
          timeline: snapshot.timeline,
          requestStream: streamProof(input.prrRequestId, snapshot.timeline),
          projectionHighWaterMark: snapshot.projectionHighWaterMark,
          workspace: workspaceProof(snapshot.totalPrrRequestCount, snapshot.projectionHighWaterMark),
          correspondenceHashes: correspondenceHashRefs(snapshot.request, snapshot.timeline),
          evidenceHashes: evidenceHashRefs(snapshot.request, snapshot.timeline, snapshot.evidenceHashesById),
          gates: snapshot.gates,
          sizeBudgetBytes: prrReadModelDescriptor.maxBytes
        });
      }
    }
  };
}

function jurisdictionPackSummaryRegistration(
  input: RegisterLocalRuntimeSelectedPrrContextPacksInput
): PrrContextPackRegistrationEntry {
  return {
    descriptor: jurisdictionPackSummaryDescriptor,
    payloadParser: jurisdictionPackSummaryPayloadParser,
    registrationIdentity: "packages/local-runtime/agent-prr-context-packs:jurisdiction-pack-summary.v1@1",
    builder: {
      descriptor: jurisdictionPackSummaryDescriptor,
      async build() {
        const snapshot = await selectedPrrSnapshot(input);
        const jurisdictionPack = resolveJurisdictionPack(snapshot.request.jurisdictionPack);
        return buildJurisdictionPackSummaryContextPack({
          generatedAt: input.now(),
          ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
          scope: { kind: "prr-request", id: input.prrRequestId },
          selectedRequestEventId: streamProof(input.prrRequestId, snapshot.timeline).requestCreatedEventId,
          selectedRequestJurisdictionPack: snapshot.request.jurisdictionPack,
          jurisdictionPack,
          jurisdictionArtifactHash: hashAgentContextPack(jurisdictionPack) as `sha256:${string}`,
          projectionHighWaterMark: snapshot.projectionHighWaterMark,
          sizeBudgetBytes: jurisdictionPackSummaryDescriptor.maxBytes
        });
      }
    }
  };
}

async function selectedPrrSnapshot(input: RegisterLocalRuntimeSelectedPrrContextPacksInput) {
  const events = await input.handle.runtime.readEvents();
  const projection = buildPrrProjection(events);
  const request = projection.requests.get(input.prrRequestId);
  if (request === undefined) {
    throw new Error("prr-request-missing: selected PRR request is missing from the local runtime projection");
  }
  const timeline = projection.timelineForRequest(input.prrRequestId);
  const evidenceHashes = evidenceHashesById(events);
  return Object.freeze({
    request: sanitizedRequest(request),
    timeline,
    totalPrrRequestCount: projection.requests.size,
    projectionHighWaterMark: events.length,
    evidenceHashesById: evidenceHashes,
    gates: selectedGateSnapshots(request, evidenceHashes)
  });
}

function sanitizedRequest(request: PrrRequestReadModel): PrrRequestReadModel {
  return {
    ...request,
    ...(request.latestOutboundCorrespondence === undefined
      ? {}
      : { latestOutboundCorrespondence: sanitizedCorrespondence(request.latestOutboundCorrespondence) }),
    ...(request.latestInboundCorrespondence === undefined
      ? {}
      : { latestInboundCorrespondence: sanitizedCorrespondence(request.latestInboundCorrespondence) })
  };
}

function sanitizedCorrespondence(
  correspondence: NonNullable<PrrRequestReadModel["latestOutboundCorrespondence"]>
): NonNullable<PrrRequestReadModel["latestOutboundCorrespondence"]> {
  const {
    rawMetadata: _rawMetadata,
    provider: _provider,
    providerMessageId: _providerMessageId,
    providerThreadId: _providerThreadId,
    ...safe
  } = correspondence;
  return safe as NonNullable<PrrRequestReadModel["latestOutboundCorrespondence"]>;
}

function streamProof(prrRequestId: string, timeline: readonly PrrTimelineEntry[]) {
  if (timeline.length === 0) {
    throw new Error("missing-provenance: selected PRR request stream is empty");
  }
  const requestCreated = timeline.find((entry) => entry.type === "prr.request.created");
  if (requestCreated === undefined) {
    throw new Error("missing-provenance: selected PRR request has no creation event");
  }
  const sourceEventIds = timeline.map((entry) => {
    const payload = entry.payload as { readonly prrRequestId?: unknown };
    if (payload.prrRequestId !== prrRequestId) {
      throw new Error("schema-conflict: selected PRR timeline contains an unrelated request");
    }
    return entry.eventId;
  });
  return {
    requestCreatedEventId: requestCreated.eventId,
    streamHeadEventId: sourceEventIds[sourceEventIds.length - 1] as string,
    streamHighWaterMark: timeline.length,
    sourceEventIds
  };
}

function workspaceProof(totalPrrRequestCount: number, projectionHighWaterMark: number) {
  if (totalPrrRequestCount <= 1) {
    return { totalPrrRequestCount };
  }
  return {
    totalPrrRequestCount,
    otherRequests: {
      kind: "all-other-prr-requests" as const,
      reason: "out-of-scope-selected-request" as const,
      omittedCount: totalPrrRequestCount - 1,
      projectionHighWaterMark
    }
  };
}

function correspondenceHashRefs(
  request: PrrRequestReadModel,
  timeline: readonly PrrTimelineEntry[]
): readonly PrrContextPackHashRef[] {
  return [request.latestOutboundCorrespondence, request.latestInboundCorrespondence]
    .flatMap((correspondence) => {
      if (correspondence?.bodyHash === undefined) {
        return [];
      }
      return [{
        id: `${correspondence.correspondenceId}_body`,
        contentHash: correspondence.bodyHash as `sha256:${string}`,
        sourceEventId: correspondenceSourceEventId(correspondence.correspondenceId, timeline)
      }];
    })
    .sort(byJson);
}

function correspondenceSourceEventId(
  correspondenceId: string,
  timeline: readonly PrrTimelineEntry[]
): string {
  const entry = timeline.find((candidate) => {
    const payload = candidate.payload as { readonly correspondenceId?: unknown };
    return payload.correspondenceId === correspondenceId;
  });
  if (entry === undefined) {
    throw new Error("missing-provenance: selected correspondence source event is missing");
  }
  return entry.eventId;
}

function evidenceHashRefs(
  request: PrrRequestReadModel,
  timeline: readonly PrrTimelineEntry[],
  hashesById: ReadonlyMap<string, `sha256:${string}`>
): readonly PrrContextPackHashRef[] {
  const sourceEventsByEvidenceId = selectedEvidenceSourceEvents(timeline);
  return selectedEvidenceIds(request).map((evidenceId) => {
    const contentHash = hashesById.get(evidenceId);
    const sourceEventId = sourceEventsByEvidenceId.get(evidenceId);
    if (contentHash === undefined || sourceEventId === undefined) {
      throw new Error("missing-provenance: selected evidence hash is missing");
    }
    return { id: evidenceId, contentHash, sourceEventId };
  }).sort(byJson);
}

function selectedEvidenceIds(request: PrrRequestReadModel): readonly string[] {
  return [...new Set([
    ...correspondenceEvidenceIds(request.latestOutboundCorrespondence),
    ...correspondenceEvidenceIds(request.latestInboundCorrespondence),
    ...request.productionEvidenceIds,
    ...request.productionBatches.flatMap((batch) => batch.evidenceIds),
    ...(request.legalEscalation?.evidenceIds ?? [])
  ])].sort();
}

function correspondenceEvidenceIds(
  correspondence: PrrRequestReadModel["latestOutboundCorrespondence"] | undefined
): readonly string[] {
  if (correspondence === undefined) {
    return [];
  }
  return [...correspondence.evidenceIds, ...(correspondence.attachmentEvidenceIds ?? [])];
}

function selectedEvidenceSourceEvents(
  timeline: readonly PrrTimelineEntry[]
): ReadonlyMap<string, string> {
  const sourceEventsByEvidenceId = new Map<string, string>();
  for (const entry of timeline) {
    const payload = entry.payload as {
      readonly evidenceIds?: unknown;
      readonly attachmentEvidenceIds?: unknown;
      readonly sourceEvidenceId?: unknown;
    };
    for (const evidenceId of evidenceIdsFromValue(payload.evidenceIds)) {
      if (!sourceEventsByEvidenceId.has(evidenceId)) sourceEventsByEvidenceId.set(evidenceId, entry.eventId);
    }
    for (const evidenceId of evidenceIdsFromValue(payload.attachmentEvidenceIds)) {
      if (!sourceEventsByEvidenceId.has(evidenceId)) sourceEventsByEvidenceId.set(evidenceId, entry.eventId);
    }
    if (typeof payload.sourceEvidenceId === "string" && !sourceEventsByEvidenceId.has(payload.sourceEvidenceId)) {
      sourceEventsByEvidenceId.set(payload.sourceEvidenceId, entry.eventId);
    }
  }
  return sourceEventsByEvidenceId;
}

function evidenceIdsFromValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function evidenceHashesById(events: readonly KnowledgeEvent[]): ReadonlyMap<string, `sha256:${string}`> {
  const hashesById = new Map<string, `sha256:${string}`>();
  for (const event of events) {
    if (event.type === "evidence.ingested") {
      hashesById.set(event.payload.evidenceId, event.payload.contentHash as `sha256:${string}`);
    }
  }
  return hashesById;
}

function selectedGateSnapshots(
  request: PrrRequestReadModel,
  evidenceHashes: ReadonlyMap<string, `sha256:${string}`>
): readonly PrrContextGateSnapshot[] {
  return [
    gateSnapshot(request.prrRequestId, "send", [
      gateCheck("draft-body", false, true, request.requestText.trim().length > 0
        ? "Request text exists, but send readiness must be backed by an explicit review event."
        : "No request text is available from replay."),
      gateCheck("recipient", false, true, request.agency.email === undefined
        ? "Agency email is absent from replayed request state."
        : "Agency contact exists, but recipient readiness must be backed by an explicit review event."),
      gateCheck("subject", false, true, "Subject readiness has no event-backed review in this slice."),
      gateCheck("citations", false, true, "Jurisdiction citations are guidance only until reviewed for this draft."),
      gateCheck("attachments", false, true, "Attachment readiness requires explicit review event evidence."),
      gateCheck("risk-review", false, true, "Risk review cannot be inferred from request estimates."),
      gateCheck(
        "provider-ready",
        request.latestOutboundCorrespondence !== undefined,
        request.latestOutboundCorrespondence === undefined,
        request.latestOutboundCorrespondence !== undefined
          ? "Outbound correspondence exists in replayed events."
          : "No outbound provider event proves send capability."
      )
    ]),
    gateSnapshot(request.prrRequestId, "legal-escalation", [
      gateCheck(
        "confirmed-deadline-or-stalling",
        request.activeDeadline?.source === "confirmed" || request.confirmedStalling,
        !(request.activeDeadline?.source === "confirmed" || request.confirmedStalling),
        request.activeDeadline?.source === "confirmed"
          ? "A confirmed deadline exists in replayed events."
          : request.confirmedStalling
            ? "User-confirmed stalling exists in replayed events."
            : "Estimated deadlines alone do not satisfy legal escalation."
      ),
      gateCheck(
        "jurisdiction-guidance",
        (request.legalEscalation?.citedRules.length ?? 0) > 0,
        (request.legalEscalation?.citedRules.length ?? 0) === 0,
        (request.legalEscalation?.citedRules.length ?? 0) > 0
          ? "Legal escalation cited rules are present in replayed events."
          : "No escalation-specific cited rules are present."
      ),
      gateCheck(
        "correspondence-evidence",
        (request.legalEscalation?.evidenceIds.length ?? 0) > 0,
        (request.legalEscalation?.evidenceIds.length ?? 0) === 0,
        (request.legalEscalation?.evidenceIds.length ?? 0) > 0
          ? "Escalation evidence IDs are present in replayed events."
          : "No escalation correspondence evidence is present.",
        legalEvidenceHashes(request.legalEscalation?.evidenceIds ?? [], evidenceHashes)
      ),
      gateCheck(
        "user-confirmed-escalation",
        request.legalEscalation !== undefined,
        request.legalEscalation === undefined,
        request.legalEscalation !== undefined
          ? "A user-confirmed legal escalation event exists."
          : "Legal escalation requires an explicit user confirmation event."
      )
    ])
  ];
}

function gateSnapshot(
  prrRequestId: string,
  kind: PrrContextGateSnapshot["kind"],
  checks: readonly PrrContextGateSnapshot["checks"][number][]
): PrrContextGateSnapshot {
  const ready = checks.every((check) => check.ready);
  return {
    gateId: `${prrRequestId}:${kind}`,
    kind,
    ready,
    locked: !ready || checks.some((check) => check.locked),
    checks
  };
}

function gateCheck(
  id: string,
  ready: boolean,
  locked: boolean,
  detail: string,
  evidenceHashes: readonly `sha256:${string}`[] = []
): PrrContextGateSnapshot["checks"][number] {
  return {
    id,
    ready,
    locked,
    detail,
    ...(evidenceHashes.length === 0 ? {} : { evidenceHashes })
  };
}

function legalEvidenceHashes(
  evidenceIds: readonly string[],
  hashesById: ReadonlyMap<string, `sha256:${string}`>
): readonly `sha256:${string}`[] {
  return evidenceIds.map((evidenceId) => {
    const hash = hashesById.get(evidenceId);
    if (hash === undefined) {
      throw new Error("missing-provenance: legal gate evidence hash is missing");
    }
    return hash;
  }).sort();
}

function byJson<T>(left: T, right: T): number {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}
