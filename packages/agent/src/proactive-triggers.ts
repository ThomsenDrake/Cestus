import { createHash } from "node:crypto";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";

export type TriggerFamily =
  | "prr-monitoring"
  | "ingestion-production"
  | "evidence-gap-contradiction"
  | "investigation-cadence"
  | "workspace-recovery";

export type TriggerDecisionKind =
  | "requested"
  | "duplicate"
  | "ineligible"
  | "cooldown-active"
  | "budget-exhausted"
  | "workspace-unavailable"
  | "stale-source"
  | "dedupe-conflict"
  | "invalid-scope"
  | "readback-failed";

export interface TriggerSubjectRef {
  readonly kind: string;
  readonly id: string;
}

export interface TriggerSourceRef {
  readonly sourceEventId: string;
  readonly sourceStreamId: string;
  readonly sourceSequence: number;
  readonly sourceKind: string;
  readonly contentHash?: `sha256:${string}` | undefined;
  readonly observedAt: string;
}

export interface TriggerHighWaterMark {
  readonly workspaceId: string;
  readonly triggerId: string;
  readonly policyVersion: string;
  readonly sourcePartition: string;
  readonly sourceStreamId: string;
  readonly sourceSequence: number;
  readonly sourceEventId: string;
}

export interface ResidentTriggerDescriptor {
  readonly descriptorVersion: "resident-trigger-descriptor.v1";
  readonly triggerId: string;
  readonly triggerFamily: TriggerFamily;
  readonly descriptorRevision: string;
  readonly requestedRunType: string;
  readonly policyRef: {
    readonly policyVersion: string;
    readonly policyArtifactHash: `sha256:${string}`;
  };
  readonly allowedSourceKinds: readonly string[];
}

export interface PreverifiedTriggerDescriptorMetadata {
  readonly triggerId: string;
  readonly descriptorRevision: string;
  readonly requestedRunType: string;
  readonly policyRef: ResidentTriggerDescriptor["policyRef"];
  readonly allowedSourceKinds: readonly string[];
}

export interface MountedTriggerPolicy {
  readonly policyVersion: string;
  readonly policyArtifactHash: `sha256:${string}`;
  readonly cooldownMs: number;
  readonly maxRequests: number;
  readonly budgetWindowMs: number;
  readonly subjectScope: "none" | "subject-ref";
  readonly sourcePartition: string;
  readonly cooldownScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
  readonly budgetScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
}

export interface ProposedTriggerAdmissionScopeV1 {
  readonly admissionScopeVersion: "resident-trigger-admission-scope.v1";
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly triggerId: string;
  readonly policyVersion: string;
  readonly policyArtifactHash: `sha256:${string}`;
  readonly cooldownScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
  readonly budgetScopeSelector: "workspace-trigger" | "workspace-trigger-subject";
  readonly policySubjectScope: "none" | "subject-ref";
  readonly scopedSubjectRef?: TriggerSubjectRef | undefined;
  readonly policySourcePartition: string;
}

export interface VerifiedTriggerCandidate {
  readonly candidateVersion: "verified-trigger-candidate.v1";
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly subjectRef: TriggerSubjectRef;
  readonly sourceRefs: readonly TriggerSourceRef[];
  readonly sourceHighWaterMark: TriggerHighWaterMark;
  readonly workspaceIdentityEventId: string;
  readonly mountInstanceId: string;
  readonly mountHash: `sha256:${string}`;
  readonly lockHash: `sha256:${string}`;
  readonly causationId: string;
}

export interface VerifiedTriggerRequestFields {
  readonly descriptor: ResidentTriggerDescriptor;
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly subjectRef: TriggerSubjectRef;
  readonly sourceRefs: readonly TriggerSourceRef[];
  readonly sourceHighWaterMark: TriggerHighWaterMark;
  readonly workspaceIdentityEventId: string;
  readonly mountInstanceId: string;
  readonly mountHash: `sha256:${string}`;
  readonly lockHash: `sha256:${string}`;
  readonly causationId: string;
}

export type ProposedTriggerRequest = KnowledgeEventOf<"agent.trigger.requested.v1">["payload"];

export interface TriggerAuthoritySnapshot {
  readonly revision: string;
  readonly authorityVersion: "mounted-trigger-authority.v1";
  readonly workspaceId: string;
  readonly residentAgentId: "agent_default";
  readonly available: boolean;
  readonly policy?: MountedTriggerPolicy | undefined;
  readonly workspaceIdentityEventId: string;
  readonly mountInstanceId: string;
  readonly mountHash: `sha256:${string}`;
  readonly lockHash: `sha256:${string}`;
  readonly lockActive: boolean;
  readonly sourceRecords: readonly TriggerSourceRef[];
  readonly requests: readonly KnowledgeEventOf<"agent.trigger.requested.v1">[];
}

export interface TriggerAuthorityReadInput {
  readonly descriptor: ResidentTriggerDescriptor;
  readonly candidate: VerifiedTriggerCandidate;
}

export interface ConditionalTriggerAppendInput {
  readonly snapshotRevision: string;
  readonly triggerGateKey: `sha256:${string}`;
  readonly attemptedAt: string;
  readonly proposed: ProposedTriggerRequest;
}

export type ConditionalTriggerAppendResult =
  | { readonly kind: "appended" | "duplicate"; readonly eventId: string }
  | { readonly kind: "conflict" | "dedupe-conflict" | "cooldown-active" | "budget-exhausted" | "stale-source" | "workspace-unavailable"; readonly notBefore?: string | undefined };

export interface MountedTriggerAuthority {
  readonly authorityVersion?: "mounted-trigger-authority.v1" | undefined;
  readSnapshot(input: TriggerAuthorityReadInput): Promise<TriggerAuthoritySnapshot>;
  appendRequestedIfCurrent(input: ConditionalTriggerAppendInput): Promise<ConditionalTriggerAppendResult>;
  readEventById(input: { readonly eventId: string }): Promise<unknown>;
}

export interface TriggerEvaluationInput {
  readonly descriptor: ResidentTriggerDescriptor;
  readonly candidate: VerifiedTriggerCandidate;
  readonly authority: MountedTriggerAuthority;
  readonly attemptedAt?: string | undefined;
}

export interface TriggerSafeDiagnostic {
  readonly category: TriggerDecisionKind;
  readonly allowedAction: "reconnect-workspace" | "rebuild-authoritative-projection" | "wait-for-cooldown" | "wait-for-budget-window" | "refresh-source" | "request-human-review";
}

export type TriggerDecision = Readonly<{
  readonly kind: TriggerDecisionKind;
  readonly requestId?: string | undefined;
  readonly requestFingerprint?: `sha256:${string}` | undefined;
  readonly eventId?: string | undefined;
  readonly notBefore?: string | undefined;
  readonly diagnostic: TriggerSafeDiagnostic;
}>;

export type TriggerRequestIdentity = Readonly<{
  requestFingerprint: `sha256:${string}`;
  requestId: string;
  dedupeKey: `sha256:${string}`;
}>;

type NormalizedEvaluation = Readonly<{
  descriptor: ResidentTriggerDescriptor;
  candidate: VerifiedTriggerCandidate;
  authority: MountedTriggerAuthority;
  attemptedAt: string;
}>;

const evaluationKeys = new Set(["descriptor", "candidate", "authority", "attemptedAt"]);
const descriptorKeys = new Set(["descriptorVersion", "triggerId", "triggerFamily", "descriptorRevision", "requestedRunType", "policyRef", "allowedSourceKinds"]);
const descriptorMetadataKeys = new Set(["triggerId", "descriptorRevision", "requestedRunType", "policyRef", "allowedSourceKinds"]);
const candidateKeys = new Set([
  "candidateVersion", "workspaceId", "residentAgentId", "subjectRef", "sourceRefs", "sourceHighWaterMark",
  "workspaceIdentityEventId", "mountInstanceId", "mountHash", "lockHash", "causationId"
]);

export function verifiedRequestFields(input: TriggerEvaluationInput): VerifiedTriggerRequestFields {
  const normalized = normalizeTriggerEvaluationInput(input);
  return requestFields(normalized.descriptor, normalized.candidate, normalized.candidate.sourceHighWaterMark.sourcePartition);
}

export function deriveAdmissionScope(
  policy: MountedTriggerPolicy,
  request: VerifiedTriggerRequestFields
): ProposedTriggerAdmissionScopeV1 {
  if (
    policy.policyVersion !== request.descriptor.policyRef.policyVersion ||
    policy.policyArtifactHash !== request.descriptor.policyRef.policyArtifactHash ||
    policy.cooldownScopeSelector !== policy.budgetScopeSelector ||
    !isPolicySelector(policy.cooldownScopeSelector) ||
    !isPolicySelector(policy.budgetScopeSelector)
  ) {
    throw new Error("invalid trigger policy scope");
  }
  if (policy.cooldownScopeSelector === "workspace-trigger") {
    if (policy.subjectScope !== "none") throw new Error("invalid trigger subject scope");
    return freeze({
      admissionScopeVersion: "resident-trigger-admission-scope.v1",
      workspaceId: request.workspaceId,
      residentAgentId: "agent_default",
      triggerId: request.descriptor.triggerId,
      policyVersion: policy.policyVersion,
      policyArtifactHash: policy.policyArtifactHash,
      cooldownScopeSelector: policy.cooldownScopeSelector,
      budgetScopeSelector: policy.budgetScopeSelector,
      policySubjectScope: "none",
      policySourcePartition: policy.sourcePartition
    });
  }
  if (policy.subjectScope !== "subject-ref") throw new Error("invalid trigger subject scope");
  return freeze({
    admissionScopeVersion: "resident-trigger-admission-scope.v1",
    workspaceId: request.workspaceId,
    residentAgentId: "agent_default",
    triggerId: request.descriptor.triggerId,
    policyVersion: policy.policyVersion,
    policyArtifactHash: policy.policyArtifactHash,
    cooldownScopeSelector: policy.cooldownScopeSelector,
    budgetScopeSelector: policy.budgetScopeSelector,
    policySubjectScope: "subject-ref",
    scopedSubjectRef: freeze({ ...request.subjectRef }),
    policySourcePartition: policy.sourcePartition
  });
}

export function buildTriggerRequestFingerprint(input: Record<string, unknown>): `sha256:${string}` {
  return sha256(canonicalJson(input));
}

export function buildTriggerGateKey(scope: ProposedTriggerAdmissionScopeV1): `sha256:${string}` {
  return sha256(canonicalJson(scope as unknown as Record<string, unknown>));
}

export function canonicalTriggerIdentity(input: TriggerEvaluationInput): Readonly<{
  requestFingerprint: `sha256:${string}`;
  requestId: string;
  dedupeKey: `sha256:${string}`;
}> {
  const normalized = normalizeTriggerEvaluationInput(input);
  const request = requestFields(normalized.descriptor, normalized.candidate, normalized.candidate.sourceHighWaterMark.sourcePartition);
  return deriveTriggerRequestIdentity(request);
}

export function deriveTriggerRequestIdentity(request: VerifiedTriggerRequestFields): TriggerRequestIdentity {
  const requestFingerprint = buildTriggerRequestFingerprint(fingerprintInput(request));
  return freeze({
    requestFingerprint,
    requestId: requestIdFor(requestFingerprint),
    dedupeKey: sha256(canonicalJson({ dedupeVersion: "resident-trigger-dedupe.v1", requestFingerprint }))
  });
}

export function createEvidenceGapContradictionDescriptor(
  metadata: PreverifiedTriggerDescriptorMetadata
): ResidentTriggerDescriptor {
  return createDescriptor("evidence-gap-contradiction", metadata);
}

export function createWorkspaceRecoveryDescriptor(
  metadata: PreverifiedTriggerDescriptorMetadata
): ResidentTriggerDescriptor {
  return createDescriptor("workspace-recovery", metadata);
}

export async function evaluateResidentTrigger(input: TriggerEvaluationInput): Promise<TriggerDecision> {
  let normalized: NormalizedEvaluation;
  try {
    normalized = normalizeTriggerEvaluationInput(input);
  } catch {
    return safeDecision("invalid-scope");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let snapshot: TriggerAuthoritySnapshot;
    try {
      snapshot = normalizeSnapshot(await normalized.authority.readSnapshot(readInputFor(normalized)));
    } catch {
      return safeDecision("workspace-unavailable");
    }
    const verified = verifyMountedCandidate(normalized, snapshot);
    if (!verified.ok) return safeDecision(verified.kind);

    let scope: ProposedTriggerAdmissionScopeV1;
    try {
      scope = deriveAdmissionScope(snapshot.policy!, verified.request);
    } catch {
      return safeDecision("invalid-scope");
    }
    const identity = identityFor(verified.request);
    const existing = inspectExisting(snapshot.requests, scope, identity, normalized.attemptedAt, snapshot.policy!);
    if (existing !== undefined) {
      if (existing.kind === "duplicate") {
        if (existing.eventId === undefined) return safeDecision("readback-failed");
        return await readbackTriggerDecision(normalized.authority, snapshot.policy!, existing.eventId, verified.request, identity, scope, "duplicate");
      }
      return safeDecision(existing.kind, existing.notBefore);
    }

    const proposed = buildProposedTriggerRequest(verified.request, scope, identity);
    let appended: ConditionalTriggerAppendResult;
    try {
      appended = await normalized.authority.appendRequestedIfCurrent({
        snapshotRevision: snapshot.revision,
        triggerGateKey: proposed.triggerGateKey,
        attemptedAt: normalized.attemptedAt,
        proposed
      });
    } catch {
      return safeDecision("workspace-unavailable");
    }
    if (appended.kind === "conflict") continue;
    if (appended.kind === "appended" || appended.kind === "duplicate") {
      return await readbackTriggerDecision(normalized.authority, snapshot.policy!, appended.eventId, verified.request, identity, scope, appended.kind === "appended" ? "requested" : "duplicate");
    }
    return safeDecision(appended.kind, "notBefore" in appended ? appended.notBefore : undefined);
  }
  return safeDecision("readback-failed");
}

export async function readbackTriggerDecision(
  authority: MountedTriggerAuthority,
  policy: MountedTriggerPolicy,
  eventId: string,
  expectedRequest: VerifiedTriggerRequestFields,
  identity: TriggerRequestIdentity,
  expectedScope: ProposedTriggerAdmissionScopeV1,
  kind: "requested" | "duplicate"
): Promise<TriggerDecision> {
  let event: unknown;
  try {
    event = await authority.readEventById({ eventId });
  } catch {
    return safeDecision("readback-failed");
  }
  const parsed = readbackPayload(event);
  if (parsed === undefined) return safeDecision("readback-failed");
  let persistedRequest: VerifiedTriggerRequestFields;
  let reconstructed: ProposedTriggerAdmissionScopeV1;
  let persistedIdentity: TriggerRequestIdentity;
  try {
    persistedRequest = requestFieldsFromPayload(parsed);
    reconstructed = deriveAdmissionScope(policy, persistedRequest);
    persistedIdentity = deriveTriggerRequestIdentity(persistedRequest);
  } catch {
    return safeDecision("invalid-scope");
  }
  if (
    !sameVerifiedRequestFacts(persistedRequest, expectedRequest) ||
    !sameScope(parsed.admissionScope, expectedScope) ||
    !sameScope(parsed.admissionScope, reconstructed) ||
    parsed.triggerGateKey !== buildTriggerGateKey(reconstructed) ||
    parsed.requestFingerprint !== identity.requestFingerprint ||
    parsed.requestId !== identity.requestId ||
    parsed.dedupeKey !== identity.dedupeKey ||
    parsed.requestFingerprint !== persistedIdentity.requestFingerprint ||
    parsed.requestId !== persistedIdentity.requestId ||
    parsed.dedupeKey !== persistedIdentity.dedupeKey ||
    parsed.residentAgentId !== "agent_default"
  ) return safeDecision("invalid-scope");
  return freeze({
    kind,
    requestId: parsed.requestId,
    requestFingerprint: parsed.requestFingerprint,
    eventId,
    diagnostic: diagnostic(kind)
  });
}

function normalizeTriggerEvaluationInput(input: unknown): NormalizedEvaluation {
  const top = ownDataRecord(input, evaluationKeys, false);
  const descriptor = ownDataRecord(top.descriptor, descriptorKeys, true) as unknown as ResidentTriggerDescriptor;
  const candidate = ownDataRecord(top.candidate, candidateKeys, true) as unknown as VerifiedTriggerCandidate;
  const attemptedAt = top.attemptedAt === undefined ? "1970-01-01T00:00:00.000Z" : stringValue(top.attemptedAt);
  if (!isIsoDate(attemptedAt) || !isDescriptor(descriptor) || !isCandidate(candidate)) throw new Error("invalid trigger input");
  const authority = top.authority as MountedTriggerAuthority;
  if (!isAuthority(authority)) throw new Error("invalid trigger authority");
  return freeze({ descriptor: freezeDescriptor(descriptor), candidate: freezeCandidate(candidate), authority, attemptedAt });
}

function createDescriptor(
  triggerFamily: TriggerFamily,
  metadata: PreverifiedTriggerDescriptorMetadata
): ResidentTriggerDescriptor {
  const normalized = ownDataRecord(metadata, descriptorMetadataKeys, true) as unknown as PreverifiedTriggerDescriptorMetadata;
  const descriptor = freezeDescriptor({
    descriptorVersion: "resident-trigger-descriptor.v1",
    triggerFamily,
    triggerId: normalized.triggerId,
    descriptorRevision: normalized.descriptorRevision,
    requestedRunType: normalized.requestedRunType,
    policyRef: normalized.policyRef,
    allowedSourceKinds: normalized.allowedSourceKinds
  });
  if (!isDescriptor(descriptor)) throw new Error("invalid pre-verified trigger descriptor metadata");
  return descriptor;
}

function normalizeSnapshot(value: unknown): TriggerAuthoritySnapshot {
  const snapshot = normalizeData(value) as TriggerAuthoritySnapshot;
  if (
    !isRecord(snapshot) || snapshot.authorityVersion !== "mounted-trigger-authority.v1" ||
    typeof snapshot.revision !== "string" || typeof snapshot.workspaceId !== "string" ||
    typeof snapshot.residentAgentId !== "string" || typeof snapshot.available !== "boolean" ||
    !Array.isArray(snapshot.sourceRecords) || !Array.isArray(snapshot.requests)
  ) throw new Error("invalid mounted snapshot");
  return snapshot;
}

function verifyMountedCandidate(normalized: NormalizedEvaluation, snapshot: TriggerAuthoritySnapshot):
  | { readonly ok: true; readonly request: VerifiedTriggerRequestFields }
  | { readonly ok: false; readonly kind: TriggerDecisionKind } {
  if (!snapshot.available || snapshot.policy === undefined) return { ok: false, kind: "workspace-unavailable" };
  const request = requestFields(normalized.descriptor, normalized.candidate, snapshot.policy.sourcePartition);
  if (snapshot.lockActive) return { ok: false, kind: "ineligible" };
  if (
    snapshot.workspaceId !== request.workspaceId ||
    snapshot.residentAgentId !== "agent_default" ||
    snapshot.workspaceIdentityEventId !== request.workspaceIdentityEventId ||
    snapshot.mountInstanceId !== request.mountInstanceId ||
    snapshot.mountHash !== request.mountHash ||
    snapshot.lockHash !== request.lockHash ||
    snapshot.policy.policyVersion !== request.descriptor.policyRef.policyVersion ||
    snapshot.policy.policyArtifactHash !== request.descriptor.policyRef.policyArtifactHash
  ) return { ok: false, kind: "invalid-scope" };
  if (!request.sourceRefs.every((source) =>
    normalized.descriptor.allowedSourceKinds.includes(source.sourceKind) &&
    snapshot.sourceRecords.some((record) => sameSource(record, source))
  )) return { ok: false, kind: "stale-source" };
  return { ok: true, request };
}

function requestFields(
  descriptor: ResidentTriggerDescriptor,
  candidate: VerifiedTriggerCandidate,
  sourcePartition: string
): VerifiedTriggerRequestFields {
  const sourceRefs = canonicalSources(candidate.sourceRefs);
  const high = sourceRefs[sourceRefs.length - 1];
  if (high === undefined) throw new Error("missing trigger sources");
  const sourceHighWaterMark: TriggerHighWaterMark = freeze({
    workspaceId: candidate.workspaceId,
    triggerId: descriptor.triggerId,
    policyVersion: descriptor.policyRef.policyVersion,
    sourcePartition,
    sourceStreamId: high.sourceStreamId,
    sourceSequence: high.sourceSequence,
    sourceEventId: high.sourceEventId
  });
  return freeze({
    descriptor,
    workspaceId: candidate.workspaceId,
    residentAgentId: "agent_default",
    subjectRef: freeze({ ...candidate.subjectRef }),
    sourceRefs,
    sourceHighWaterMark,
    workspaceIdentityEventId: candidate.workspaceIdentityEventId,
    mountInstanceId: candidate.mountInstanceId,
    mountHash: candidate.mountHash,
    lockHash: candidate.lockHash,
    causationId: sourceRefs[0]!.sourceEventId
  });
}

function requestFieldsFromPayload(payload: ProposedTriggerRequest): VerifiedTriggerRequestFields {
  const descriptor: ResidentTriggerDescriptor = freeze({
    descriptorVersion: "resident-trigger-descriptor.v1",
    triggerId: payload.triggerId,
    triggerFamily: payload.triggerFamily,
    descriptorRevision: payload.provenance.descriptorRevision,
    requestedRunType: payload.requestedRunType,
    policyRef: freeze({ policyVersion: payload.policyVersion, policyArtifactHash: payload.policyArtifactHash }),
    allowedSourceKinds: freeze(payload.sourceRefs.map((source) => source.sourceKind))
  });
  return freeze({
    descriptor,
    workspaceId: payload.workspaceId,
    residentAgentId: "agent_default",
    subjectRef: freeze({ ...payload.subjectRef }),
    sourceRefs: canonicalSources(payload.sourceRefs),
    sourceHighWaterMark: freeze({ ...payload.sourceHighWaterMark }),
    workspaceIdentityEventId: payload.provenance.workspaceIdentityEventId,
    mountInstanceId: payload.provenance.mountInstanceId,
    mountHash: payload.provenance.mountHash,
    lockHash: payload.provenance.lockHash,
    causationId: payload.provenance.causationId
  });
}

const identityFor = deriveTriggerRequestIdentity;

function fingerprintInput(request: VerifiedTriggerRequestFields): Record<string, unknown> {
  return {
    fingerprintVersion: "resident-trigger-request-fingerprint.v1",
    residentAgentId: request.residentAgentId,
    workspaceId: request.workspaceId,
    triggerId: request.descriptor.triggerId,
    triggerFamily: request.descriptor.triggerFamily,
    descriptorRevision: request.descriptor.descriptorRevision,
    policyVersion: request.descriptor.policyRef.policyVersion,
    policyArtifactHash: request.descriptor.policyRef.policyArtifactHash,
    subjectRef: request.subjectRef,
    requestedRunType: request.descriptor.requestedRunType,
    sourceRefs: request.sourceRefs,
    sourceHighWaterMark: request.sourceHighWaterMark,
    workspaceIdentityEventId: request.workspaceIdentityEventId,
    causationId: request.causationId
  };
}

function buildProposedTriggerRequest(
  request: VerifiedTriggerRequestFields,
  admissionScope: ProposedTriggerAdmissionScopeV1,
  identity: Readonly<{ requestFingerprint: `sha256:${string}`; requestId: string; dedupeKey: `sha256:${string}` }>
): ProposedTriggerRequest {
  return freeze({
    requestId: identity.requestId,
    dedupeKey: identity.dedupeKey,
    requestFingerprint: identity.requestFingerprint,
    admissionScope,
    triggerGateKey: buildTriggerGateKey(admissionScope),
    residentAgentId: "agent_default",
    workspaceId: request.workspaceId,
    triggerId: request.descriptor.triggerId,
    triggerFamily: request.descriptor.triggerFamily,
    policyVersion: request.descriptor.policyRef.policyVersion,
    policyArtifactHash: request.descriptor.policyRef.policyArtifactHash,
    subjectRef: request.subjectRef,
    sourceRefs: freeze(request.sourceRefs.map((source) => freeze({ ...source }))),
    sourceHighWaterMark: request.sourceHighWaterMark,
    requestedRunType: request.descriptor.requestedRunType,
    provenance: freeze({
      descriptorRevision: request.descriptor.descriptorRevision,
      policyVersion: request.descriptor.policyRef.policyVersion,
      policyArtifactHash: request.descriptor.policyRef.policyArtifactHash,
      workspaceIdentityEventId: request.workspaceIdentityEventId,
      mountInstanceId: request.mountInstanceId,
      mountHash: request.mountHash,
      lockHash: request.lockHash,
      evaluationSourceEventIds: freeze(request.sourceRefs.map((source) => source.sourceEventId)),
      causationId: request.causationId,
      correlationId: identity.requestId
    })
  });
}

function inspectExisting(
  events: readonly KnowledgeEventOf<"agent.trigger.requested.v1">[],
  scope: ProposedTriggerAdmissionScopeV1,
  identity: Readonly<{ requestFingerprint: `sha256:${string}`; requestId: string; dedupeKey: `sha256:${string}` }>,
  attemptedAt: string,
  policy: MountedTriggerPolicy
): { readonly kind: TriggerDecisionKind; readonly eventId?: string; readonly notBefore?: string } | undefined {
  const scoped = events.filter((event) => sameScope(event.payload.admissionScope, scope) && event.payload.triggerGateKey === buildTriggerGateKey(scope));
  const dedupe = events.filter((event) => event.payload.dedupeKey === identity.dedupeKey);
  if (dedupe.some((event) => event.payload.requestFingerprint !== identity.requestFingerprint)) return { kind: "dedupe-conflict" };
  const matching = dedupe.find((event) => event.payload.requestFingerprint === identity.requestFingerprint);
  if (matching !== undefined) return { kind: "duplicate", eventId: matching.id };
  const now = Date.parse(attemptedAt);
  const mostRecent = scoped.map((event) => Date.parse(event.context.occurredAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (mostRecent !== undefined && policy.cooldownMs > 0 && now < mostRecent + policy.cooldownMs) {
    return { kind: "cooldown-active", notBefore: new Date(mostRecent + policy.cooldownMs).toISOString() };
  }
  const inWindow = scoped.filter((event) => now - Date.parse(event.context.occurredAt) < policy.budgetWindowMs);
  if (inWindow.length >= policy.maxRequests) return { kind: "budget-exhausted" };
  return undefined;
}

function readInputFor(input: NormalizedEvaluation): TriggerAuthorityReadInput {
  return freeze({ descriptor: input.descriptor, candidate: input.candidate });
}

function readbackPayload(value: unknown): ProposedTriggerRequest | undefined {
  try {
    const event = normalizeData(value) as { readonly type?: unknown; readonly payload?: unknown };
    if (event.type !== "agent.trigger.requested.v1") return undefined;
    const payload = normalizeData(event.payload) as ProposedTriggerRequest;
    return isRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function safeDecision(kind: TriggerDecisionKind, notBefore?: string): TriggerDecision {
  return freeze({ kind, ...(notBefore === undefined ? {} : { notBefore }), diagnostic: diagnostic(kind) });
}

function diagnostic(category: TriggerDecisionKind): TriggerSafeDiagnostic {
  const allowedAction = category === "workspace-unavailable" ? "reconnect-workspace"
    : category === "cooldown-active" ? "wait-for-cooldown"
      : category === "budget-exhausted" ? "wait-for-budget-window"
        : category === "stale-source" ? "refresh-source"
          : category === "readback-failed" ? "rebuild-authoritative-projection"
            : "request-human-review";
  return freeze({ category, allowedAction });
}

function isDescriptor(value: ResidentTriggerDescriptor): boolean {
  return value.descriptorVersion === "resident-trigger-descriptor.v1" &&
    typeof value.triggerId === "string" && typeof value.descriptorRevision === "string" &&
    typeof value.requestedRunType === "string" && isRecord(value.policyRef) &&
    typeof value.policyRef.policyVersion === "string" && isHash(value.policyRef.policyArtifactHash) &&
    Array.isArray(value.allowedSourceKinds) && value.allowedSourceKinds.every((kind) => typeof kind === "string") &&
    ["prr-monitoring", "ingestion-production", "evidence-gap-contradiction", "investigation-cadence", "workspace-recovery"].includes(value.triggerFamily);
}

function isCandidate(value: VerifiedTriggerCandidate): boolean {
  return value.candidateVersion === "verified-trigger-candidate.v1" && value.residentAgentId === "agent_default" &&
    typeof value.workspaceId === "string" && isSubject(value.subjectRef) && Array.isArray(value.sourceRefs) &&
    value.sourceRefs.length > 0 && value.sourceRefs.every(isSource) && isHighWater(value.sourceHighWaterMark) &&
    typeof value.workspaceIdentityEventId === "string" && typeof value.mountInstanceId === "string" &&
    isHash(value.mountHash) && isHash(value.lockHash) && typeof value.causationId === "string";
}

function isAuthority(value: unknown): value is MountedTriggerAuthority {
  try {
    return typeof value === "object" && value !== null &&
      typeof (value as MountedTriggerAuthority).readSnapshot === "function" &&
      typeof (value as MountedTriggerAuthority).appendRequestedIfCurrent === "function" &&
      typeof (value as MountedTriggerAuthority).readEventById === "function";
  } catch {
    return false;
  }
}

function freezeDescriptor(value: ResidentTriggerDescriptor): ResidentTriggerDescriptor {
  return freeze({ ...value, policyRef: freeze({ ...value.policyRef }), allowedSourceKinds: freeze([...value.allowedSourceKinds]) });
}

function freezeCandidate(value: VerifiedTriggerCandidate): VerifiedTriggerCandidate {
  return freeze({
    ...value,
    subjectRef: freeze({ ...value.subjectRef }),
    sourceRefs: canonicalSources(value.sourceRefs),
    sourceHighWaterMark: freeze({ ...value.sourceHighWaterMark })
  });
}

function canonicalSources(sources: readonly TriggerSourceRef[]): readonly TriggerSourceRef[] {
  return freeze([...sources].map((source) => freeze({ ...source })).sort((left, right) =>
    left.sourceStreamId.localeCompare(right.sourceStreamId) || left.sourceSequence - right.sourceSequence || left.sourceEventId.localeCompare(right.sourceEventId)
  ));
}

function sameSource(left: TriggerSourceRef, right: TriggerSourceRef): boolean {
  return left.sourceEventId === right.sourceEventId && left.sourceStreamId === right.sourceStreamId &&
    left.sourceSequence === right.sourceSequence && left.sourceKind === right.sourceKind &&
    left.contentHash === right.contentHash && left.observedAt === right.observedAt;
}

function sameScope(left: ProposedTriggerAdmissionScopeV1, right: ProposedTriggerAdmissionScopeV1): boolean {
  return canonicalJson(left as unknown as Record<string, unknown>) === canonicalJson(right as unknown as Record<string, unknown>);
}

function sameVerifiedRequestFacts(left: VerifiedTriggerRequestFields, right: VerifiedTriggerRequestFields): boolean {
  return canonicalJson(fingerprintInput(left)) === canonicalJson(fingerprintInput(right)) &&
    left.mountInstanceId === right.mountInstanceId &&
    left.mountHash === right.mountHash &&
    left.lockHash === right.lockHash;
}

function isSubject(value: unknown): value is TriggerSubjectRef {
  return isRecord(value) && typeof value.kind === "string" && typeof value.id === "string";
}

function isSource(value: unknown): value is TriggerSourceRef {
  return isRecord(value) && typeof value.sourceEventId === "string" && typeof value.sourceStreamId === "string" &&
    Number.isInteger(value.sourceSequence) && (value.sourceSequence as number) > 0 && typeof value.sourceKind === "string" &&
    (value.contentHash === undefined || isHash(value.contentHash)) && typeof value.observedAt === "string" && isIsoDate(value.observedAt);
}

function isHighWater(value: unknown): value is TriggerHighWaterMark {
  return isRecord(value) && typeof value.workspaceId === "string" && typeof value.triggerId === "string" &&
    typeof value.policyVersion === "string" && typeof value.sourcePartition === "string" && typeof value.sourceStreamId === "string" &&
    Number.isInteger(value.sourceSequence) && (value.sourceSequence as number) > 0 && typeof value.sourceEventId === "string";
}

function isPolicySelector(value: unknown): value is "workspace-trigger" | "workspace-trigger-subject" {
  return value === "workspace-trigger" || value === "workspace-trigger-subject";
}

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function ownDataRecord(value: unknown, allowed: Set<string>, deep: boolean): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("not a plain record");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) throw new Error("unknown trigger field");
  const result: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("unsafe trigger field");
    result[key] = deep ? normalizeData(descriptor.value) : descriptor.value;
  }
  return result;
}

function normalizeData(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") throw new Error("unsafe boundary value");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new Error("symbol boundary value");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || keys.length !== value.length + 1) throw new Error("unsafe array");
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("unsafe array value");
      output.push(normalizeData(descriptor.value));
    }
    return freeze(output);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("unsafe object");
  const output: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("unsafe object field");
    output[key] = normalizeData(descriptor.value);
  }
  return freeze(output);
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function canonicalJson(value: Record<string, unknown>): string {
  const serialize = (item: unknown): string => {
    if (item === null || typeof item === "boolean" || typeof item === "number" || typeof item === "string") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(",")}]`;
    if (!isRecord(item)) throw new Error("non-json canonical input");
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${serialize(item[key])}`).join(",")}}`;
  };
  return serialize(value);
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requestIdFor(fingerprint: `sha256:${string}`): string {
  const bytes = Buffer.from(fingerprint.slice("sha256:".length), "hex");
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return `trq_${output}`;
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}
