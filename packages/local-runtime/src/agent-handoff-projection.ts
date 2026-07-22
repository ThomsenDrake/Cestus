import type { Buffer } from "node:buffer";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { HandoffAuthorityBinding } from "../../agent/src/specialist-handoff-authority.js";
import {
  buildSpecialistHandoffProjection,
  type SpecialistHandoffProjectionDiagnostic
} from "../../agent/src/specialist-handoff-projection.js";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";
import type {
  SpecialistApprovalRequirement,
  SpecialistNextAction,
  SpecialistOutputArtifactRef,
  SpecialistWorkflowHandoffDto
} from "../../agent/src/specialist-handoffs.js";

type ContentHash = `sha256:${string}`;

const supportedRunTypes = [
  "prr-negotiation",
  "investigation-planner",
  "ontology-bootstrap"
] as const;

export type ResidentHandoffRunType = typeof supportedRunTypes[number];

export type HandoffLifecycle =
  | "no-output"
  | "output-persisted"
  | "handoff-pending"
  | "handoff-recorded"
  | "terminal-consistent"
  | "task-completed"
  | "legacy-unbound"
  | "unavailable"
  | "inconsistent";

export type HandoffDiagnosticCategory =
  | "workspace-unavailable"
  | "mount-identity-mismatch"
  | "mount-store-identity-mismatch"
  | "mount-authority-stale"
  | "legacy-manifest-unbound"
  | "manifest-missing"
  | "manifest-hash-mismatch"
  | "manifest-content-mismatch"
  | "artifact-missing"
  | "artifact-hash-mismatch"
  | "source-missing"
  | "source-stale"
  | "source-swapped"
  | "provenance-missing"
  | "provenance-cross-run"
  | "run-identity-missing"
  | "run-identity-duplicate"
  | "task-binding-conflict"
  | "final-output-conflict"
  | "expected-sequence-conflict"
  | "terminal-before-readback"
  | "terminal-status-conflict"
  | "supersession-conflict"
  | "dto-invalid"
  | "dto-cross-run"
  | "unsafe-boundary-value"
  | "secret-safety-rejection";

export interface HandoffDiagnosticDto {
  readonly category: HandoffDiagnosticCategory;
  readonly retry: "none" | "after-remount" | "after-repair" | "after-review";
  readonly safeMessage: string;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly ContentHash[];
}

export interface ResidentHandoffProvenanceDto {
  readonly manifestSchemaVersion: "agent-specialist-handoff-manifest.v2";
  readonly handoffManifestHash: ContentHash;
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly preparedEventId: string;
  readonly recordedEventId: string;
  readonly terminalRunEventId?: string;
  readonly taskStatusEventId?: string;
}

export interface SafeHandoffArtifactRef {
  readonly artifactId: string;
  readonly artifactKind: string;
  readonly schemaId: string;
  readonly artifactHash: ContentHash;
  readonly safeSummary: string;
}

export interface SafeApprovalRequirement {
  readonly approvalClass: string;
  readonly state: "not-requested" | "waiting" | "approved" | "rejected" | "stale";
  readonly previewHash?: ContentHash;
}

export interface SafeNextAction {
  readonly kind: "review" | "request-approval" | "resume-after-remount" | "repair";
  readonly effect: "none";
  readonly label: string;
}

export interface ResidentHandoffDto {
  readonly schemaVersion: "resident-handoff.v1";
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: ResidentHandoffRunType;
  readonly handoffId?: string;
  readonly revision?: number;
  readonly lifecycle: HandoffLifecycle;
  readonly status?: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly stateKind?: "completed" | "failed" | "resumable";
  readonly safeSummary?: string;
  readonly provenance?: ResidentHandoffProvenanceDto;
  readonly artifactRefs: readonly SafeHandoffArtifactRef[];
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly approvalRequirements: readonly SafeApprovalRequirement[];
  readonly nextSafeActions: readonly SafeNextAction[];
  readonly diagnostics: readonly HandoffDiagnosticDto[];
}

export interface MountedHandoffArtifactReader {
  get(contentHash: ContentHash): Promise<Buffer>;
}

export interface CreateAgentHandoffProjectionInput {
  readonly runId: string;
  readonly events: readonly KnowledgeEvent[];
  readonly materialStore: MountedHandoffArtifactReader;
  readonly manifestStore: MountedHandoffArtifactReader;
  readonly authorityBinding: HandoffAuthorityBinding;
}

interface NormalizedInput {
  readonly runId: string;
  readonly events: readonly KnowledgeEvent[];
  readonly materialGet: (hash: ContentHash) => Promise<Buffer>;
  readonly manifestGet: (hash: ContentHash) => Promise<Buffer>;
  readonly authorityBinding: HandoffAuthorityBinding;
  readonly identity: TargetIdentity;
}

interface TargetIdentity {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: ResidentHandoffRunType;
}

const invalidTargetIdentity: TargetIdentity = Object.freeze({
  runId: "unavailable-run",
  runType: "ontology-bootstrap"
});

interface ReadFailure {
  readonly availability: "missing" | "unavailable";
}

class BoundaryFailure extends Error {
  constructor(readonly category: HandoffDiagnosticCategory) {
    super("Resident handoff projection input is invalid.");
  }
}

/**
 * Rebuilds one browser-safe handoff DTO from an immutable event snapshot and
 * exact, injected mounted readers. It has no append, write, provider, witness,
 * registry, path, or fallback-storage capability.
 */
export async function buildResidentHandoffDto(
  input: CreateAgentHandoffProjectionInput
): Promise<ResidentHandoffDto> {
  let normalized: NormalizedInput;
  try {
    normalized = normalizeInput(input);
  } catch (error) {
    const category = error instanceof BoundaryFailure ? error.category : "unsafe-boundary-value";
    return closedDto(invalidTargetIdentity, "inconsistent", category);
  }

  try {
    const dto = await buildResidentHandoffDtoFromNormalized(normalized);
    return hasBrowserSafeStringLeaves(dto)
      ? dto
      : closedDto(normalized.identity, "inconsistent", "secret-safety-rejection");
  } catch (error) {
    const category = error instanceof BoundaryFailure ? error.category : "dto-invalid";
    return closedDto(normalized.identity, "inconsistent", category);
  }
}

function hasBrowserSafeStringLeaves(value: unknown): boolean {
  if (typeof value === "string") {
    return isAgentSecretSafeText(value) && !containsAbsolutePath(value);
  }
  if (Array.isArray(value)) return value.every(hasBrowserSafeStringLeaves);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(hasBrowserSafeStringLeaves);
  }
  return true;
}

function containsAbsolutePath(value: string): boolean {
  const containsNestedNonHttpUri = value.split(/\s+/u).some((token) => {
    for (const match of token.matchAll(/(?:^|[^\p{ID_Continue}_+.\-:])([a-z][a-z0-9+.-]*):/giu)) {
      const scheme = match[1]?.toLowerCase();
      const schemePayload = token.slice(match.index + match[0].length);
      if (scheme !== undefined &&
        scheme !== "http" &&
        scheme !== "https" &&
        (/^\/\/[^/?#\s]+(?:[/?#]|$)/u.test(schemePayload) ||
          /https?:\/\//i.test(schemePayload))) {
        return true;
      }
    }
    return false;
  });

  const nativePathText = value.split(/\s+/u).map((token) => {
    for (const match of token.matchAll(/(?:^|[^\p{ID_Continue}_+.\-:/\\])(https?:\/\/)/giu)) {
      const httpPrefix = match[1];
      if (httpPrefix === undefined) continue;
      const urlStart = match.index + match[0].length - httpPrefix.length;
      try {
        const parsed = new URL(token.slice(urlStart));
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return token.slice(0, urlStart);
        }
      } catch {
        // Incomplete HTTP-like text does not establish an outer URL context.
      }
    }
    return token;
  }).join(" ");
  const absolutePathText = nativePathText.replace(
    /((?:^|[^\p{ID_Continue}_/\\])(?:\.{1,2}|~))[\\/]/gu,
    "$1_"
  );

  return containsNestedNonHttpUri ||
    /(?:^|[^\p{ID_Continue}_/\\])(?<!(?:^|[^\p{ID_Continue}_+.\-:/\\])http:)(?<!(?:^|[^\p{ID_Continue}_+.\-:/\\])https:)\//iu.test(absolutePathText) ||
    /(?:^|[^\p{ID_Continue}_/\\])[a-z]:[\\/]/iu.test(absolutePathText) ||
    /(?:^|[^\p{ID_Continue}_/\\])\\(?:[^\\/\s]|$)/u.test(absolutePathText) ||
    /(?:^|[^\p{ID_Continue}_/\\])\\\\[^\\/\s]+(?:[\\/][^\\/\s]*)?/u.test(absolutePathText) ||
    /\bfile:\/\//i.test(value);
}

async function buildResidentHandoffDtoFromNormalized(
  normalized: NormalizedInput
): Promise<ResidentHandoffDto> {
  const sourceFailure = validateTargetSources(normalized.events, normalized.identity);
  if (sourceFailure !== undefined) {
    return closedDto(normalized.identity, "inconsistent", sourceFailure);
  }

  const materialHashes = new Set<ContentHash>();
  const manifestHashes = new Set<ContentHash>();
  collectDeclaredHashes(normalized.events, normalized.runId, materialHashes, manifestHashes);
  if ([...materialHashes].some((hash) => manifestHashes.has(hash))) {
    return closedDto(normalized.identity, "inconsistent", "mount-store-identity-mismatch");
  }

  const failures: ReadFailure[] = [];
  const reader = Object.freeze({
    get: async (hash: ContentHash): Promise<Buffer> => {
      const read = materialHashes.has(hash)
        ? normalized.materialGet
        : manifestHashes.has(hash)
          ? normalized.manifestGet
          : undefined;
      if (read === undefined) {
        throw new Error("Undeclared handoff artifact hash.");
      }
      try {
        return await read(hash);
      } catch (error) {
        failures.push(Object.freeze({
          availability: isReleasedMissingArtifactError(error) ? "missing" : "unavailable"
        }));
        throw new Error("Mounted handoff read failed.");
      }
    }
  });

  let projection: Awaited<ReturnType<typeof buildSpecialistHandoffProjection>>;
  try {
    projection = await buildSpecialistHandoffProjection({
      events: normalized.events,
      manifestReader: reader,
      runId: normalized.runId
    });
  } catch {
    return closedDto(normalized.identity, "inconsistent", "dto-invalid");
  }

  if (failures.some((failure) => failure.availability === "unavailable")) {
    return closedDto(normalized.identity, "unavailable", "workspace-unavailable");
  }

  if (projection.state === "inconsistent") {
    const projectionDiagnostic = projection.diagnostics[0];
    return closedDto(
      normalized.identity,
      "inconsistent",
      mapProjectionDiagnostic(projectionDiagnostic),
      projectionDiagnostic
    );
  }

  if (projection.state === "legacy-unbound") {
    return legacyDto(normalized.identity);
  }

  const handoff = projection.selectedHandoff;
  if (handoff === undefined) {
    return nonterminalDto(normalized.identity, projection.state);
  }
  if (!sameTargetIdentity(normalized.identity, handoff)) {
    return closedDto(normalized.identity, "inconsistent", "dto-cross-run");
  }

  const recordedEventId = authoritativeRecordedEventId(projection, handoff);
  if (recordedEventId === undefined) {
    return closedDto(normalized.identity, "inconsistent", "provenance-missing");
  }
  const recorded = findRecordedEventById(normalized.events, handoff, recordedEventId);
  if (recorded === undefined) {
    return closedDto(normalized.identity, "inconsistent", "provenance-missing");
  }
  const compact = recorded.payload as unknown as Record<string, unknown>;
  const replayAuthority = authorityBindingFrom(compact);
  if (compact.manifestSchemaVersion === "agent-specialist-handoff-manifest.v2" && replayAuthority === undefined) {
    return closedDto(normalized.identity, "inconsistent", "provenance-missing");
  }
  if (replayAuthority !== undefined && !sameAuthorityBinding(replayAuthority, normalized.authorityBinding)) {
    return closedDto(normalized.identity, "inconsistent", "mount-authority-stale");
  }

  const provenance = projection.selectedReadback === undefined
    ? undefined
    : provenanceFromReadback(projection.selectedReadback, normalized.authorityBinding);
  if (projection.selectedReadback !== undefined && provenance === undefined) {
    return closedDto(
      normalized.identity,
      "inconsistent",
      sameAuthorityBinding(projection.selectedReadback.authorityBinding, normalized.authorityBinding)
        ? "secret-safety-rejection"
        : "mount-authority-stale"
    );
  }

  return verifiedDto({
    identity: normalized.identity,
    lifecycle: lifecycleForVerifiedProjection(
      projection.state,
      handoff.status,
      provenance !== undefined,
      normalized.events,
      recordedEventId,
      handoff.runId
    ),
    handoff,
    compact,
    provenance
  });
}

function normalizeInput(input: unknown): NormalizedInput {
  const record = exactOwnDataRecord(input, ["runId", "events", "materialStore", "manifestStore", "authorityBinding"]);
  const runId = requiredText(record.runId);
  const rawEvents = normalizeJsonValue(record.events, { nodes: 0 }, 0);
  if (!Array.isArray(rawEvents)) throw new BoundaryFailure("unsafe-boundary-value");
  if (containsSecretShapedUnknownField(rawEvents)) throw new BoundaryFailure("secret-safety-rejection");
  const parsedEvents = rawEvents.map((event) => {
    const parsed = validateKnowledgeEvent(event);
    if (!parsed.success) throw new BoundaryFailure("dto-invalid");
    return parsed.data;
  });

  const frozenEvents = Object.freeze([...parsedEvents]);
  const identity = targetIdentity(frozenEvents, runId);
  const authorityBinding = normalizeAuthorityBinding(record.authorityBinding);
  const materialGet = captureReader(record.materialStore);
  const manifestGet = captureReader(record.manifestStore);
  if (record.materialStore === record.manifestStore || materialGet === manifestGet) {
    throw new BoundaryFailure("mount-store-identity-mismatch");
  }
  return Object.freeze({ runId, events: frozenEvents, materialGet, manifestGet, authorityBinding, identity });
}

function targetIdentity(events: readonly KnowledgeEvent[], runId: string): TargetIdentity {
  const starts: KnowledgeEventOf<"agent.specialist-run.started">[] = [];
  for (const event of events) {
    if (event.type === "agent.specialist-run.started" && event.payload.runId === runId) starts.push(event);
  }
  if (starts.length === 0) throw new BoundaryFailure("run-identity-missing");
  if (starts.length !== 1) throw new BoundaryFailure("provenance-cross-run");
  const started = starts[0]!;
  if (!isResidentRunType(started.payload.runType)) throw new BoundaryFailure("dto-invalid");
  if (!isAgentSecretSafeText(runId) ||
    (started.payload.taskId !== undefined && !isAgentSecretSafeText(started.payload.taskId))) {
    throw new BoundaryFailure("secret-safety-rejection");
  }
  return Object.freeze({
    runId,
    ...(started.payload.taskId === undefined ? {} : { taskId: started.payload.taskId }),
    runType: started.payload.runType
  });
}

function validateTargetSources(
  events: readonly KnowledgeEvent[],
  identity: TargetIdentity
): HandoffDiagnosticCategory | undefined {
  const byId = new Map(events.map((event) => [event.id, event]));
  const sourceIds = new Set<string>();
  for (const event of events) {
    if (
      (event.type === "agent.specialist-handoff.prepared" || event.type === "agent.specialist-handoff.recorded") &&
      event.payload.runId === identity.runId
    ) {
      event.payload.sourceEventIds.forEach((id) => sourceIds.add(id));
    }
  }
  for (const sourceId of sourceIds) {
    const source = byId.get(sourceId);
    if (source === undefined) return "source-missing";
    const sourceRunId = runIdForEvent(source);
    if (sourceRunId !== undefined && sourceRunId !== identity.runId) return "source-swapped";
  }
  return undefined;
}

function collectDeclaredHashes(
  events: readonly KnowledgeEvent[],
  runId: string,
  material: Set<ContentHash>,
  manifest: Set<ContentHash>
): void {
  for (const event of events) {
    if (event.type === "agent.specialist-run.step.recorded" && event.payload.runId === runId) {
      if (isContentHash(event.payload.handoffMaterialArtifactHash)) material.add(event.payload.handoffMaterialArtifactHash);
    }
    if (
      (event.type === "agent.specialist-handoff.prepared" || event.type === "agent.specialist-handoff.recorded") &&
      event.payload.runId === runId
    ) {
      if (isContentHash(event.payload.handoffMaterialArtifactHash)) material.add(event.payload.handoffMaterialArtifactHash);
      if (isContentHash(event.payload.handoffManifestHash)) manifest.add(event.payload.handoffManifestHash);
    }
  }
}

function authoritativeRecordedEventId(
  projection: Awaited<ReturnType<typeof buildSpecialistHandoffProjection>>,
  handoff: SpecialistWorkflowHandoffDto
): string | undefined {
  return projection.history.find((entry) =>
    entry.state === "handoff-recorded" &&
    entry.runId === handoff.runId &&
    entry.taskId === handoff.taskId &&
    entry.handoffId === handoff.handoffId
  )?.recordedEventId;
}

function findRecordedEventById(
  events: readonly KnowledgeEvent[],
  handoff: SpecialistWorkflowHandoffDto,
  recordedEventId: string
): KnowledgeEventOf<"agent.specialist-handoff.recorded"> | undefined {
  return events.find((candidate): candidate is KnowledgeEventOf<"agent.specialist-handoff.recorded"> =>
    candidate.type === "agent.specialist-handoff.recorded" &&
    candidate.id === recordedEventId &&
    candidate.payload.runId === handoff.runId &&
    candidate.payload.handoffId === handoff.handoffId
  );
}

function authorityBindingFrom(compact: Record<string, unknown>): HandoffAuthorityBinding | undefined {
  if (compact.manifestSchemaVersion !== "agent-specialist-handoff-manifest.v2") return undefined;
  try {
    return normalizeAuthorityBinding(compact.authorityBinding);
  } catch {
    return undefined;
  }
}

function provenanceFromReadback(
  readback: NonNullable<Awaited<ReturnType<typeof buildSpecialistHandoffProjection>>["selectedReadback"]>,
  authorityBinding: HandoffAuthorityBinding
): ResidentHandoffProvenanceDto | undefined {
  if (!sameAuthorityBinding(readback.authorityBinding, authorityBinding)) return undefined;
  if (![
    readback.finalOutputEventId,
    readback.preparedEventId,
    readback.recordedEventId,
    readback.terminalRunEventId,
    readback.taskStatusEventId
  ].every(isAgentSecretSafeText)) return undefined;
  return Object.freeze({
    manifestSchemaVersion: "agent-specialist-handoff-manifest.v2" as const,
    handoffManifestHash: readback.manifestHash,
    finalOutputStepId: readback.finalOutputStepId,
    finalOutputEventId: readback.finalOutputEventId,
    preparedEventId: readback.preparedEventId,
    recordedEventId: readback.recordedEventId,
    terminalRunEventId: readback.terminalRunEventId,
    taskStatusEventId: readback.taskStatusEventId
  });
}

function lifecycleForVerifiedProjection(
  state: Awaited<ReturnType<typeof buildSpecialistHandoffProjection>>["state"],
  status: SpecialistWorkflowHandoffDto["status"],
  hasTerminalReadback: boolean,
  events: readonly KnowledgeEvent[],
  recordedEventId: string,
  runId: string
): HandoffLifecycle {
  if (status === "failed" && hasTerminalReadback) return "terminal-consistent";
  if ((status === "waiting-for-approval" || status === "blocked") && state === "task-completed") {
    return "terminal-consistent";
  }
  if (
    state === "handoff-recorded" &&
    (status === "ready-for-review" || status === "failed") &&
    hasReleasedValidatedTerminal(events, runId, recordedEventId, status)
  ) {
    return "terminal-consistent";
  }
  return state;
}

function hasReleasedValidatedTerminal(
  events: readonly KnowledgeEvent[],
  runId: string,
  recordedEventId: string,
  status: SpecialistWorkflowHandoffDto["status"]
): boolean {
  const terminals = events.filter((event) =>
    (event.type === "agent.specialist-run.completed" || event.type === "agent.specialist-run.failed") &&
    event.payload.runId === runId &&
    event.context.causationId === recordedEventId &&
    (status === "failed"
      ? event.type === "agent.specialist-run.failed"
      : event.type === "agent.specialist-run.completed")
  );
  // The released projector has already rejected incompatible ordering,
  // status, causation, and completed-output hashes before this classification.
  return terminals.length === 1;
}

function verifiedDto(input: {
  readonly identity: TargetIdentity;
  readonly lifecycle: HandoffLifecycle;
  readonly handoff: SpecialistWorkflowHandoffDto;
  readonly compact: Record<string, unknown>;
  readonly provenance: ResidentHandoffProvenanceDto | undefined;
}): ResidentHandoffDto {
  const artifacts = Object.freeze(input.handoff.outputArtifacts.map(freezeArtifact));
  const sourceEventIds = freezeSafeIds(input.compact.sourceEventIds);
  const relatedEventIds = freezeSafeIds(input.compact.relatedEventIds);
  const approvals = Object.freeze(input.handoff.approvalRequirements.map((requirement) =>
    freezeApproval(requirement, input.handoff.status)
  ));
  const actions = safeActions(input.handoff.nextSafeActions, input.handoff.status);
  return freezeDto({
    schemaVersion: "resident-handoff.v1",
    runId: input.identity.runId,
    ...(input.identity.taskId === undefined ? {} : { taskId: input.identity.taskId }),
    runType: input.identity.runType,
    handoffId: input.handoff.handoffId,
    revision: input.handoff.handoffRevision,
    lifecycle: input.lifecycle,
    status: input.handoff.status,
    stateKind: stateKindFor(input.handoff.status),
    safeSummary: input.handoff.safeSummary,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    artifactRefs: artifacts,
    sourceEventIds,
    relatedEventIds,
    approvalRequirements: approvals,
    nextSafeActions: actions,
    diagnostics: Object.freeze([])
  });
}

function nonterminalDto(identity: TargetIdentity, lifecycle: HandoffLifecycle): ResidentHandoffDto {
  const actions: readonly SafeNextAction[] = lifecycle === "output-persisted" || lifecycle === "handoff-pending"
    ? Object.freeze([Object.freeze({ kind: "repair" as const, effect: "none" as const, label: "Resume durable handoff recording" })])
    : Object.freeze([]);
  return freezeDto({
    schemaVersion: "resident-handoff.v1",
    runId: identity.runId,
    ...(identity.taskId === undefined ? {} : { taskId: identity.taskId }),
    runType: identity.runType,
    lifecycle,
    artifactRefs: Object.freeze([]),
    sourceEventIds: Object.freeze([]),
    relatedEventIds: Object.freeze([]),
    approvalRequirements: Object.freeze([]),
    nextSafeActions: actions,
    diagnostics: Object.freeze([])
  });
}

function legacyDto(identity: TargetIdentity): ResidentHandoffDto {
  return freezeDto({
    schemaVersion: "resident-handoff.v1",
    runId: identity.runId,
    ...(identity.taskId === undefined ? {} : { taskId: identity.taskId }),
    runType: identity.runType,
    lifecycle: "legacy-unbound",
    artifactRefs: Object.freeze([]),
    sourceEventIds: Object.freeze([]),
    relatedEventIds: Object.freeze([]),
    approvalRequirements: Object.freeze([]),
    nextSafeActions: Object.freeze([Object.freeze({
      kind: "repair" as const,
      effect: "none" as const,
      label: "Migrate the legacy handoff after authority review"
    })]),
    diagnostics: Object.freeze([diagnostic("legacy-manifest-unbound")])
  });
}

function closedDto(
  identity: TargetIdentity,
  lifecycle: "unavailable" | "inconsistent",
  category: HandoffDiagnosticCategory,
  projectionDiagnostic?: SpecialistHandoffProjectionDiagnostic
): ResidentHandoffDto {
  const unavailable = lifecycle === "unavailable";
  return freezeDto({
    schemaVersion: "resident-handoff.v1",
    runId: identity.runId,
    ...(identity.taskId === undefined ? {} : { taskId: identity.taskId }),
    runType: identity.runType,
    lifecycle,
    artifactRefs: Object.freeze([]),
    sourceEventIds: Object.freeze([]),
    relatedEventIds: Object.freeze([]),
    approvalRequirements: Object.freeze([]),
    nextSafeActions: Object.freeze([Object.freeze({
      kind: unavailable ? "resume-after-remount" as const : "repair" as const,
      effect: "none" as const,
      label: unavailable ? "Restore mounted workspace access" : "Review and repair the handoff binding"
    })]),
    diagnostics: Object.freeze([diagnostic(category, projectionDiagnostic)])
  });
}

function diagnostic(
  category: HandoffDiagnosticCategory,
  projectionDiagnostic?: SpecialistHandoffProjectionDiagnostic
): HandoffDiagnosticDto {
  const remount = category === "workspace-unavailable" || category.startsWith("mount-");
  const review = category === "legacy-manifest-unbound";
  return Object.freeze({
    category,
    retry: remount ? "after-remount" as const : review ? "after-review" as const : "after-repair" as const,
    safeMessage: safeDiagnosticMessage(category),
    eventIds: freezeSafeEventIds(projectionDiagnostic?.relatedEventIds),
    artifactHashes: freezeSafeHashes(projectionDiagnostic?.artifactHashes)
  });
}

function freezeSafeEventIds(value: readonly string[] | undefined): readonly string[] {
  return Object.freeze((value ?? []).filter((item) =>
    /^evt_[a-zA-Z0-9_-]+$/.test(item) && isAgentSecretSafeText(item)
  ));
}

function freezeSafeHashes(value: readonly string[] | undefined): readonly ContentHash[] {
  return Object.freeze((value ?? []).filter(isContentHash));
}

function safeDiagnosticMessage(category: HandoffDiagnosticCategory): string {
  if (category === "workspace-unavailable") return "Mounted handoff authority is unavailable.";
  if (category === "legacy-manifest-unbound") return "The historical handoff has no current mounted authority binding.";
  if (category.startsWith("mount-")) return "Mounted handoff authority does not match replayed state.";
  if (category.startsWith("source-")) return "Handoff source provenance is incomplete or inconsistent.";
  if (category.startsWith("manifest-")) return "The ledger-bound handoff manifest could not be verified.";
  if (category.startsWith("artifact-")) return "A ledger-bound handoff artifact could not be verified.";
  if (category === "secret-safety-rejection" || category === "unsafe-boundary-value") {
    return "The handoff boundary rejected an unsafe value.";
  }
  return "The durable handoff replay is inconsistent.";
}

function mapProjectionDiagnostic(
  diagnosticValue: SpecialistHandoffProjectionDiagnostic | undefined
): HandoffDiagnosticCategory {
  switch (diagnosticValue?.code) {
    case "manifest-missing": return "manifest-missing";
    case "manifest-hash-mismatch": return "manifest-hash-mismatch";
    case "manifest-malformed":
    case "manifest-dto-mismatch": return "manifest-content-mismatch";
    case "handoff-material-missing": return "artifact-missing";
    case "handoff-material-hash-mismatch":
    case "handoff-material-mismatch": return "artifact-hash-mismatch";
    case "run-identity-mismatch": return "provenance-cross-run";
    case "terminal-before-handoff": return "terminal-before-readback";
    case "terminal-causation-mismatch":
    case "terminal-status-mismatch":
    case "terminal-output-mismatch": return "terminal-status-conflict";
    case "supersession-violation":
    case "same-revision-manifest-change": return "supersession-conflict";
    case "conflicting-final-output": return "final-output-conflict";
    case "recorded-without-prepared":
    case "recorded-before-prepared":
    case "conflicting-prepared":
    case "conflicting-recorded":
    case "handoff-causation-mismatch":
    case "compact-binding-mismatch":
    case "idempotency-key-mismatch": return "expected-sequence-conflict";
    default: return "provenance-missing";
  }
}

function safeActions(
  actions: readonly SpecialistNextAction[],
  status: SpecialistWorkflowHandoffDto["status"]
): readonly SafeNextAction[] {
  const projected = actions.map((action): SafeNextAction => Object.freeze({
    kind: action.kind === "request-approval"
      ? "request-approval"
      : action.kind === "retry"
        ? "repair"
        : "review",
    effect: "none",
    label: action.label
  }));
  if (projected.length > 0) return Object.freeze(projected);
  if (status === "blocked" || status === "failed") {
    return Object.freeze([Object.freeze({ kind: "repair", effect: "none", label: "Review and repair the handoff" })]);
  }
  return Object.freeze([]);
}

function freezeArtifact(artifact: SpecialistOutputArtifactRef): SafeHandoffArtifactRef {
  return Object.freeze({
    artifactId: artifact.artifactId,
    artifactKind: artifact.artifactKind,
    schemaId: artifact.schemaId,
    artifactHash: artifact.artifactHash,
    safeSummary: artifact.safeSummary
  });
}

function freezeApproval(
  requirement: SpecialistApprovalRequirement,
  status: SpecialistWorkflowHandoffDto["status"]
): SafeApprovalRequirement {
  return Object.freeze({
    approvalClass: requirement.approvalClass,
    state: status === "waiting-for-approval" ? "waiting" : "not-requested"
  });
}

function stateKindFor(status: SpecialistWorkflowHandoffDto["status"]): "completed" | "failed" | "resumable" {
  return status === "ready-for-review" ? "completed" : status === "failed" ? "failed" : "resumable";
}

function freezeSafeIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.filter((item): item is string => typeof item === "string"));
}

function freezeDto(dto: ResidentHandoffDto): ResidentHandoffDto {
  return Object.freeze(dto);
}

function captureReader(value: unknown): (hash: ContentHash) => Promise<Buffer> {
  if (typeof value !== "object" || value === null) throw new BoundaryFailure("mount-store-identity-mismatch");
  const descriptor = Object.getOwnPropertyDescriptor(value, "get");
  if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "function") {
    throw new BoundaryFailure("mount-store-identity-mismatch");
  }
  const get = descriptor.value as (hash: ContentHash) => Promise<Buffer>;
  return async (hash) => await get.call(value, hash);
}

function normalizeAuthorityBinding(value: unknown): HandoffAuthorityBinding {
  const record = exactOwnDataRecord(value, [
    "workspaceIdentityHash",
    "mountGeneration",
    "ledgerStoreIdentity",
    "artifactStoreIdentity",
    "ledgerHighWaterEventId",
    "policyHash",
    "activeLocksHash"
  ]);
  return Object.freeze({
    workspaceIdentityHash: requiredHash(record.workspaceIdentityHash),
    mountGeneration: requiredText(record.mountGeneration),
    ledgerStoreIdentity: requiredText(record.ledgerStoreIdentity),
    artifactStoreIdentity: requiredText(record.artifactStoreIdentity),
    ledgerHighWaterEventId: requiredText(record.ledgerHighWaterEventId),
    policyHash: requiredHash(record.policyHash),
    activeLocksHash: requiredHash(record.activeLocksHash)
  });
}

function sameAuthorityBinding(left: HandoffAuthorityBinding, right: HandoffAuthorityBinding): boolean {
  return left.workspaceIdentityHash === right.workspaceIdentityHash &&
    left.mountGeneration === right.mountGeneration &&
    left.ledgerStoreIdentity === right.ledgerStoreIdentity &&
    left.artifactStoreIdentity === right.artifactStoreIdentity &&
    left.ledgerHighWaterEventId === right.ledgerHighWaterEventId &&
    left.policyHash === right.policyHash &&
    left.activeLocksHash === right.activeLocksHash;
}

function sameTargetIdentity(identity: TargetIdentity, handoff: SpecialistWorkflowHandoffDto): boolean {
  return handoff.runId === identity.runId &&
    handoff.taskId === identity.taskId &&
    handoff.runType === identity.runType;
}

function runIdForEvent(event: KnowledgeEvent): string | undefined {
  const payload = event.payload as unknown as Record<string, unknown>;
  return typeof payload.runId === "string" ? payload.runId : undefined;
}

function exactOwnDataRecord(value: unknown, expectedFields: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new BoundaryFailure("unsafe-boundary-value");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new BoundaryFailure("unsafe-boundary-value");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const field of expectedFields) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new BoundaryFailure("unsafe-boundary-value");
    }
    result[field] = descriptor.value;
  }
  return Object.freeze(result);
}

function normalizeJsonValue(value: unknown, budget: { nodes: number }, depth: number): unknown {
  budget.nodes += 1;
  if (budget.nodes > 20_000 || depth > 64) throw new BoundaryFailure("unsafe-boundary-value");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
      throw new BoundaryFailure("unsafe-boundary-value");
    }
    const descriptors = numericArrayDataDescriptors(value);
    if (descriptors.length !== value.length || descriptors.some((descriptor) => descriptor === undefined)) {
      throw new BoundaryFailure("unsafe-boundary-value");
    }
    return Object.freeze(descriptors.map((descriptor) => {
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        throw new BoundaryFailure("unsafe-boundary-value");
      }
      return normalizeJsonValue(descriptor.value, budget, depth + 1);
    }));
  }
  if (typeof value !== "object" || value === null) throw new BoundaryFailure("unsafe-boundary-value");
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new BoundaryFailure("unsafe-boundary-value");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [field, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !("value" in descriptor)) throw new BoundaryFailure("unsafe-boundary-value");
    result[field] = normalizeJsonValue(descriptor.value, budget, depth + 1);
  }
  return Object.freeze(result);
}

function numericArrayDataDescriptors(value: readonly unknown[]): Array<PropertyDescriptor | undefined> {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1 || !ownNames.includes("length")) return [];
  const result: Array<PropertyDescriptor | undefined> = [];
  for (let index = 0; index < value.length; index += 1) result.push(descriptors[String(index)]);
  return result;
}

function containsSecretShapedUnknownField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretShapedUnknownField);
  if (typeof value !== "object" || value === null) return false;
  for (const [field, nested] of Object.entries(value)) {
    if (/(?:credential|password|secret|token).*(?:value|bytes|raw|secret|token)|(?:value|bytes|raw).*(?:credential|password|secret|token)/i.test(field)) {
      return true;
    }
    if (containsSecretShapedUnknownField(nested)) return true;
  }
  return false;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new BoundaryFailure("unsafe-boundary-value");
  return value;
}

function requiredHash(value: unknown): ContentHash {
  if (!isContentHash(value)) throw new BoundaryFailure("unsafe-boundary-value");
  return value;
}

function isContentHash(value: unknown): value is ContentHash {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isResidentRunType(value: string): value is ResidentHandoffRunType {
  return supportedRunTypes.some((candidate) => candidate === value);
}

function isReleasedMissingArtifactError(error: unknown): boolean {
  return error instanceof Error && error.message === "Mounted handoff artifact store operation failed.";
}
