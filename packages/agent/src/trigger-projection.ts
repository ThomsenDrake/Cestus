import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import {
  buildTriggerGateKey,
  deriveTriggerRequestIdentity,
  deriveAdmissionScope,
  type MountedTriggerPolicy,
  type ProposedTriggerAdmissionScopeV1,
  type TriggerSourceRef,
  type VerifiedTriggerRequestFields
} from "./proactive-triggers.js";

type TriggerRequestEvent = KnowledgeEventOf<"agent.trigger.requested.v1">;

export interface TriggerPolicyReadback {
  readPolicy(input: { readonly policyVersion: string; readonly policyArtifactHash: `sha256:${string}` }): MountedTriggerPolicy | undefined;
  verifyAuthority(input: TriggerRequestEvent["payload"]["provenance"]): boolean;
  verifySource(input: TriggerSourceRef): boolean;
}

export interface TriggerProjectionDiagnostic {
  readonly category: "invalid-scope" | "dedupe-conflict" | "stale-source" | "readback-failed";
}

export interface TriggerRequestProjectionRecord {
  readonly eventId: string;
  readonly requestId: string;
  readonly requestFingerprint: `sha256:${string}`;
  readonly dedupeKey: `sha256:${string}`;
  readonly admissionScope: ProposedTriggerAdmissionScopeV1;
  readonly sourceHighWaterMark: TriggerRequestEvent["payload"]["sourceHighWaterMark"];
}

export interface TriggerRequestProjectionV1 {
  readonly projectionVersion: "trigger-request-projection.v1";
  readonly state: "ready" | "blocked";
  readonly records: readonly TriggerRequestProjectionRecord[];
  readonly highWater: readonly TriggerRequestEvent["payload"]["sourceHighWaterMark"][];
  readonly diagnostics: readonly TriggerProjectionDiagnostic[];
}

/**
 * Pure replay over immutable trigger request records. The reader supplies only
 * pre-verified mounted policy, authority, and source metadata; this projector
 * writes no checkpoint, cache, or replacement high-water store.
 */
export function buildTriggerRequestProjection(
  events: readonly KnowledgeEvent[],
  reader: TriggerPolicyReadback
): TriggerRequestProjectionV1 {
  const diagnostics: TriggerProjectionDiagnostic[] = [];
  const trusted: TriggerRequestEvent[] = [];
  const dedupe = new Map<string, TriggerRequestEvent>();

  for (const rawEvent of events) {
    if (rawEvent.type !== "agent.trigger.requested.v1") continue;
    const parsed = validateKnowledgeEvent(rawEvent);
    if (!parsed.success || parsed.data.type !== "agent.trigger.requested.v1") {
      diagnostics.push(diagnostic("invalid-scope"));
      continue;
    }
    const event = parsed.data;
    const policy = safely(() => reader.readPolicy({
      policyVersion: event.payload.policyVersion,
      policyArtifactHash: event.payload.policyArtifactHash
    }));
    if (policy === undefined ||
      policy.policyVersion !== event.payload.policyVersion ||
      policy.policyArtifactHash !== event.payload.policyArtifactHash ||
      !safely(() => reader.verifyAuthority(event.payload.provenance))) {
      diagnostics.push(diagnostic("readback-failed"));
      continue;
    }
    if (!event.payload.sourceRefs.every((source) => safely(() => reader.verifySource(source)))) {
      diagnostics.push(diagnostic("stale-source"));
      continue;
    }
    if (!reconstructsExactly(event, policy)) {
      diagnostics.push(diagnostic("invalid-scope"));
      continue;
    }
    const previous = dedupe.get(event.payload.dedupeKey);
    if (previous !== undefined) {
      if (previous.payload.requestFingerprint !== event.payload.requestFingerprint ||
        previous.payload.requestId !== event.payload.requestId ||
        !sameScope(previous.payload.admissionScope, event.payload.admissionScope)) {
        diagnostics.push(diagnostic("dedupe-conflict"));
      }
      continue;
    }
    dedupe.set(event.payload.dedupeKey, event);
    trusted.push(event);
  }

  if (diagnostics.length === 0 && !respectsProjectedAdmission(trusted, reader)) {
    diagnostics.push(diagnostic("invalid-scope"));
  }
  if (diagnostics.length > 0) return blocked(diagnostics);

  const ordered = [...trusted].sort(compareSources);
  const records = ordered.map((event) => freeze({
    eventId: event.id,
    requestId: event.payload.requestId,
    requestFingerprint: event.payload.requestFingerprint,
    dedupeKey: event.payload.dedupeKey,
    admissionScope: event.payload.admissionScope,
    sourceHighWaterMark: event.payload.sourceHighWaterMark
  }));
  const highWater = [...new Map(ordered.map((event) => [scopeKey(event.payload.admissionScope), event])).values()]
    .map((event) => event.payload.sourceHighWaterMark)
    .sort(compareHighWater);
  return freeze({
    projectionVersion: "trigger-request-projection.v1",
    state: "ready",
    records: freeze(records),
    highWater: freeze(highWater),
    diagnostics: freeze([])
  });
}

function reconstructsExactly(event: TriggerRequestEvent, policy: MountedTriggerPolicy): boolean {
  const payload = event.payload;
  const request = requestFields(payload);
  let scope: ProposedTriggerAdmissionScopeV1;
  let identity: ReturnType<typeof deriveTriggerRequestIdentity>;
  try {
    scope = deriveAdmissionScope(policy, request);
    identity = deriveTriggerRequestIdentity(request);
  } catch {
    return false;
  }
  return sameScope(scope, payload.admissionScope) &&
    payload.triggerGateKey === buildTriggerGateKey(scope) &&
    payload.requestFingerprint === identity.requestFingerprint &&
    payload.requestId === identity.requestId &&
    payload.dedupeKey === identity.dedupeKey &&
    payload.sourceHighWaterMark.workspaceId === payload.workspaceId &&
    payload.sourceHighWaterMark.triggerId === payload.triggerId &&
    payload.sourceHighWaterMark.policyVersion === payload.policyVersion &&
    payload.sourceHighWaterMark.sourcePartition === scope.policySourcePartition &&
    sameHighWater(payload.sourceHighWaterMark, highestSource(payload.sourceRefs)) &&
    payload.provenance.policyVersion === payload.policyVersion &&
    payload.provenance.policyArtifactHash === payload.policyArtifactHash &&
    payload.provenance.correlationId === payload.requestId &&
    payload.provenance.causationId === payload.sourceRefs[0]?.sourceEventId &&
    payload.provenance.evaluationSourceEventIds.length === payload.sourceRefs.length &&
    payload.provenance.evaluationSourceEventIds.every((id, index) => id === payload.sourceRefs[index]?.sourceEventId);
}

function requestFields(payload: TriggerRequestEvent["payload"]): VerifiedTriggerRequestFields {
  return {
    descriptor: {
      descriptorVersion: "resident-trigger-descriptor.v1",
      triggerId: payload.triggerId,
      triggerFamily: payload.triggerFamily,
      descriptorRevision: payload.provenance.descriptorRevision,
      requestedRunType: payload.requestedRunType,
      policyRef: { policyVersion: payload.policyVersion, policyArtifactHash: payload.policyArtifactHash },
      allowedSourceKinds: payload.sourceRefs.map((source) => source.sourceKind)
    },
    workspaceId: payload.workspaceId,
    residentAgentId: "agent_default",
    subjectRef: payload.subjectRef,
    sourceRefs: payload.sourceRefs,
    sourceHighWaterMark: payload.sourceHighWaterMark,
    workspaceIdentityEventId: payload.provenance.workspaceIdentityEventId,
    mountInstanceId: payload.provenance.mountInstanceId,
    mountHash: payload.provenance.mountHash,
    lockHash: payload.provenance.lockHash,
    causationId: payload.provenance.causationId
  };
}

function respectsProjectedAdmission(events: readonly TriggerRequestEvent[], reader: TriggerPolicyReadback): boolean {
  const byScope = new Map<string, TriggerRequestEvent[]>();
  for (const event of events) {
    const key = scopeKey(event.payload.admissionScope);
    byScope.set(key, [...(byScope.get(key) ?? []), event]);
  }
  for (const scoped of byScope.values()) {
    const ordered = [...scoped].sort((left, right) => Date.parse(left.context.occurredAt) - Date.parse(right.context.occurredAt) || compareSources(left, right));
    const policy = safely(() => reader.readPolicy({
      policyVersion: ordered[0]!.payload.policyVersion,
      policyArtifactHash: ordered[0]!.payload.policyArtifactHash
    }));
    if (policy === undefined) return false;
    for (let index = 0; index < ordered.length; index += 1) {
      const event = ordered[index]!;
      const at = Date.parse(event.context.occurredAt);
      const prior = ordered.slice(0, index);
      if (policy.cooldownMs > 0 && prior.some((candidate) => at - Date.parse(candidate.context.occurredAt) < policy.cooldownMs)) return false;
      if (prior.filter((candidate) => at - Date.parse(candidate.context.occurredAt) < policy.budgetWindowMs).length >= policy.maxRequests) return false;
    }
  }
  return true;
}

function highestSource(sources: readonly TriggerSourceRef[]): TriggerSourceRef | undefined {
  return [...sources].sort((left, right) =>
    left.sourceStreamId.localeCompare(right.sourceStreamId) || left.sourceSequence - right.sourceSequence || left.sourceEventId.localeCompare(right.sourceEventId)
  ).at(-1);
}

function sameHighWater(
  highWater: TriggerRequestEvent["payload"]["sourceHighWaterMark"],
  source: TriggerSourceRef | undefined
): boolean {
  return source !== undefined && highWater.sourceStreamId === source.sourceStreamId &&
    highWater.sourceSequence === source.sourceSequence && highWater.sourceEventId === source.sourceEventId;
}

function compareSources(left: TriggerRequestEvent, right: TriggerRequestEvent): number {
  const leftHigh = left.payload.sourceHighWaterMark;
  const rightHigh = right.payload.sourceHighWaterMark;
  return leftHigh.sourceStreamId.localeCompare(rightHigh.sourceStreamId) ||
    leftHigh.sourceSequence - rightHigh.sourceSequence || leftHigh.sourceEventId.localeCompare(rightHigh.sourceEventId);
}

function compareHighWater(
  left: TriggerRequestEvent["payload"]["sourceHighWaterMark"],
  right: TriggerRequestEvent["payload"]["sourceHighWaterMark"]
): number {
  return left.sourceStreamId.localeCompare(right.sourceStreamId) || left.sourceSequence - right.sourceSequence || left.sourceEventId.localeCompare(right.sourceEventId);
}

function sameScope(left: ProposedTriggerAdmissionScopeV1, right: ProposedTriggerAdmissionScopeV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scopeKey(scope: ProposedTriggerAdmissionScopeV1): string {
  return JSON.stringify(scope);
}

function safely<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch {
    return undefined;
  }
}

function diagnostic(category: TriggerProjectionDiagnostic["category"]): TriggerProjectionDiagnostic {
  return freeze({ category });
}

function blocked(diagnostics: readonly TriggerProjectionDiagnostic[]): TriggerRequestProjectionV1 {
  return freeze({
    projectionVersion: "trigger-request-projection.v1",
    state: "blocked",
    records: freeze([]),
    highWater: freeze([]),
    diagnostics: freeze([...diagnostics])
  });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}
