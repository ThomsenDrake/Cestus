import type {
  AgentContextPackJsonValue,
  BuildContextPackRefInput,
  ContextPackDescriptor,
  ContextPackPayloadParser,
  ContextPackRef,
  ContextPackRegistry,
  ContextPackScope,
  ContextPackStalenessInput,
  ResolvedContextPack
} from "./context-packs.js";
import { buildResolvedContextPack, serializeContextPackPayload } from "./context-packs.js";
import {
  assertOperationalContextSafeText,
  buildAgentMemorySummaryResolvedContextPack,
  type BuildAgentMemorySummaryContextPackInput
} from "./memory.js";
import type {
  AgentFailureCategory,
  AgentModelInvocationStatus,
  AgentRunState,
  AgentSpecialistRunType,
  AgentTaskPriority,
  AgentTaskStatus,
  AgentToolApprovalClass,
  AgentToolRequestState,
  AgentToolSideEffectClass
} from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export type OperationalContextPackId =
  | "workspace-runtime-status.v1"
  | "task-run-history.v1"
  | "agent-memory-summary.v1";

export type OperationalContextPackCapability =
  | "workspace-runtime-status"
  | "task-run-history"
  | "agent-memory-summary";

export type OperationalContextPackOmissionCode =
  | "omitted.raw-paths"
  | "omitted.raw-provider-errors"
  | "omitted.prompts"
  | "omitted.model-output"
  | "omitted.credentials"
  | "omitted.raw-source-content"
  | "omitted.out-of-scope"
  | "omitted.size-budget";

export type OperationalContextPackBlockingCode =
  | "blocked.missing-scope"
  | "blocked.missing-high-water-mark"
  | "blocked.missing-empty-proof"
  | "blocked.projection-stale"
  | "blocked.projection-source-mismatch"
  | "blocked.size-budget"
  | "blocked.unsafe-diagnostic"
  | "blocked.unbounded-source"
  | "blocked.missing-payload"
  | "blocked.missing-payload-parser"
  | "blocked.payload-hash-mismatch"
  | "blocked.payload-schema-mismatch"
  | "blocked.invalid-payload-shape"
  | "blocked.missing-capability"
  | "blocked.conflicting-registration";

export interface OperationalContextPackSizeBudgets {
  readonly workspaceRuntimeStatus: number;
  readonly taskRunHistory: number;
  readonly agentMemorySummary: number;
}

export interface OperationalContextPackSourceMetadata {
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly scope: ContextPackScope;
  readonly sizeBudgetBytes: number;
  readonly stalenessInputs: readonly ContextPackStalenessInput[];
}

export interface OperationalEmptyProjectionProof {
  readonly projectionName: string;
  readonly scope: ContextPackScope;
  readonly projectionHighWaterMark: number;
  readonly sourceEventCount: number;
  readonly generatedAt: string;
  readonly emptyReasonCode: string;
}

export interface OperationalBoundedWindow {
  readonly order: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly hasMore: boolean;
  readonly totalCount: number;
  readonly omissionCodes: readonly OperationalContextPackOmissionCode[];
}

export type OperationalTaskSummaryStatus = AgentTaskStatus;

export interface OperationalTaskSummaryDto {
  readonly taskId: string;
  readonly status: OperationalTaskSummaryStatus;
  readonly priority?: AgentTaskPriority;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly residentAgentId?: string;
  readonly requestedBy?: string;
  readonly runId?: string;
  readonly statusReasonCode?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
}

export interface OperationalRunSummaryDto {
  readonly runId: string;
  readonly state: AgentRunState;
  readonly runType?: AgentSpecialistRunType;
  readonly residentAgentId?: string;
  readonly startedBy?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly taskId?: string;
  readonly workspaceId?: string;
  readonly investigationId?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
  readonly relatedEventIds?: readonly string[];
  readonly outputArtifactHashes?: readonly string[];
  readonly stepCount?: number;
  readonly invocationIds?: readonly string[];
  readonly toolRequestIds?: readonly string[];
  readonly failureCategory?: AgentFailureCategory;
  readonly retryable?: boolean;
  readonly allowedActions?: readonly string[];
  readonly summaryCode?: string;
}

export interface OperationalModelInvocationSummaryDto {
  readonly invocationId: string;
  readonly status: AgentModelInvocationStatus;
  readonly runId?: string;
  readonly providerId?: string;
  readonly modelFamily?: string;
  readonly safetyClass?: "workspace-safe" | "public-safe" | "sensitive-local-only" | "provider-approved";
  readonly requestedAt?: string;
  readonly completedAt?: string;
  readonly inputArtifactHash?: string;
  readonly providerOutputArtifactHash?: string;
  readonly promptTemplateId?: string;
  readonly promptTemplateVersion?: number;
  readonly runType?: AgentSpecialistRunType;
  readonly contextPackRefs?: readonly OperationalContextPackLinkDto[];
  readonly omissionCount?: number;
  readonly transferApprovalClass?: "none" | "provider-byte-transfer";
  readonly usage?: OperationalModelInvocationUsageDto;
  readonly failureCategory?: AgentFailureCategory;
  readonly retryable?: boolean;
  readonly allowedActions?: readonly string[];
  readonly sourceEventIds?: readonly string[];
}

export interface OperationalContextPackLinkDto {
  readonly contextPackId: string;
  readonly version: number;
  readonly contentHash: string;
}

export interface OperationalModelInvocationUsageDto {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface OperationalToolReadModelChangeDto {
  readonly projectionName: string;
  readonly change: string;
  readonly relatedIds?: readonly string[];
}

export interface OperationalToolRequestSummaryDto {
  readonly toolRequestId: string;
  readonly state: AgentToolRequestState;
  readonly runId?: string;
  readonly toolId?: string;
  readonly toolVersion?: string;
  readonly requestedBy?: string;
  readonly sideEffectClass?: AgentToolSideEffectClass;
  readonly requiredApprovalClass?: AgentToolApprovalClass;
  readonly previewHash?: string;
  readonly scope?: string;
  readonly requestedAt?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
  readonly approvedBy?: string;
  readonly approvedPreviewHash?: string;
  readonly approvalClass?: AgentToolApprovalClass;
  readonly approvedAt?: string;
  readonly executionClaimedBy?: string;
  readonly executionClaimedAt?: string;
  readonly executionLeaseExpiresAt?: string;
  readonly executionApprovedPreviewHash?: string;
  readonly executionClaimEventId?: string;
  readonly deniedBy?: string;
  readonly deniedAt?: string;
  readonly completedAt?: string;
  readonly resultEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly readModelChanges?: readonly OperationalToolReadModelChangeDto[];
  readonly failedAt?: string;
  readonly failureCategory?: AgentFailureCategory;
  readonly retryable?: boolean;
  readonly allowedActions?: readonly string[];
}

export interface OperationalTaskRunHistorySnapshot {
  readonly projectionHighWaterMark: number;
  readonly projectionSourceRef: string;
  readonly tasks: readonly OperationalTaskSummaryDto[];
  readonly runs: readonly OperationalRunSummaryDto[];
  readonly modelInvocations: readonly OperationalModelInvocationSummaryDto[];
  readonly toolRequests: readonly OperationalToolRequestSummaryDto[];
  readonly aggregateCounts: Readonly<Record<string, number>>;
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly window: OperationalBoundedWindow;
  readonly emptyProof?: OperationalEmptyProjectionProof;
}

export interface OperationalAgentMemorySnapshot {
  readonly projectionHighWaterMark: number;
  readonly projectionSourceRef: string;
  readonly activeMemory: readonly AgentContextPackJsonValue[];
  readonly aggregateCounts: Readonly<Record<string, number>>;
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly window: OperationalBoundedWindow;
  readonly emptyProof?: OperationalEmptyProjectionProof;
}

export interface OperationalWorkspaceRuntimeSource {
  readonly runtimeHighWaterMark: number;
  readonly workspaceMounted: boolean;
  readonly workspaceId?: string;
  readonly storageStrategy: string;
  readonly bindPosture: string;
  readonly authPosture: string;
  readonly providerStates: readonly AgentContextPackJsonValue[];
  readonly diagnostics: readonly AgentContextPackJsonValue[];
  readonly projectionHighWaterMarks: Readonly<Record<string, number>>;
  readonly omissionCodes: readonly OperationalContextPackOmissionCode[];
}

export interface OperationalContextPackProviderMetadata {
  readonly providerId: string;
  readonly capabilities: readonly OperationalContextPackCapability[];
  readonly policyVersion: string;
  readonly generatedAt: string;
  readonly scope: ContextPackScope;
  readonly sizeBudgets: OperationalContextPackSizeBudgets;
}

export interface OperationalContextPackProvider extends OperationalContextPackProviderMetadata {
  workspaceRuntimeStatus(): Promise<OperationalWorkspaceRuntimeSource>;
  taskRunHistorySnapshot(): Promise<OperationalTaskRunHistorySnapshot>;
  agentMemorySnapshot(): Promise<OperationalAgentMemorySnapshot>;
}

export interface OperationalContextPackRegistrationResult {
  readonly contextPackIds: readonly OperationalContextPackId[];
  readonly registrationKey: string;
}

export interface OperationalContextPackReadinessInputs {
  readonly resolvedContextPacks: readonly ResolvedContextPack[];
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly currentProjectionHighWaterMarks: Readonly<Record<string, number>>;
  readonly descriptors: readonly ContextPackDescriptor[];
  readonly blockingReasons: readonly OperationalContextPackBlockingCode[];
  readonly omissionCodes: readonly OperationalContextPackOmissionCode[];
}

export type OperationalContextPackBuilderResult = ResolvedContextPack | BuildContextPackRefInput;

export interface BuildWorkspaceRuntimeStatusContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly scope: ContextPackScope;
  readonly projectionHighWaterMark: number;
  readonly sizeBudgetBytes: number;
  readonly runtimeSource: OperationalWorkspaceRuntimeSource;
}

export interface BuildTaskRunHistoryContextPackInput {
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly scope: ContextPackScope;
  readonly projectionHighWaterMark: number;
  readonly sizeBudgetBytes: number;
  readonly taskRunHistorySnapshot: OperationalTaskRunHistorySnapshot;
}

const operationalCapabilities = new Set<OperationalContextPackCapability>([
  "workspace-runtime-status",
  "task-run-history",
  "agent-memory-summary"
]);

const taskStatuses = new Set<OperationalTaskSummaryStatus>([
  "queued", "running", "waiting-for-approval", "blocked", "completed", "failed", "canceled"
]);
const taskPriorities = new Set<AgentTaskPriority>(["low", "normal", "high", "urgent"]);
const runStates = new Set<AgentRunState>(["running", "completed", "failed"]);
const modelInvocationStatuses = new Set<AgentModelInvocationStatus>(["requested", "completed", "failed"]);
const toolRequestStates = new Set<AgentToolRequestState>(["requested", "approved", "executing", "denied", "completed", "failed"]);
const specialistRunTypes = new Set<AgentSpecialistRunType>([
  "ontology-bootstrap", "prr-negotiation", "evidence-triage", "timeline-builder", "contradiction-finder",
  "investigation-planner", "report-builder"
]);
const failureCategories = new Set<AgentFailureCategory>([
  "provider-unavailable", "provider-rate-limited", "credential-missing", "credential-revoked", "approval-required",
  "approval-denied", "approval-stale", "permission-denied", "secret-detected", "legal-lock-active", "lock-active",
  "projection-lag", "context-budget-exceeded", "missing-provenance", "provenance-missing", "model-output-invalid",
  "domain-gate-failed", "stale-source", "external-effect-failed", "data-loss-risk"
]);
const toolSideEffectClasses = new Set<AgentToolSideEffectClass>([
  "read-only", "local-derivative", "ledger-proposal", "ledger-review", "external-byte-transfer",
  "external-message-send", "export-or-publication", "destructive-or-repair", "legal-escalation"
]);
const toolApprovalClasses = new Set<AgentToolApprovalClass>([
  "none", "human-review", "provider-byte-transfer", "external-message-send", "export-or-publication",
  "destructive-or-repair", "legal-escalation", "ledger-review"
]);
const memoryScopes = new Set(["workspace", "investigation", "task", "provider", "policy"]);
const memoryKinds = new Set(["operator-preference", "agent-observation", "policy-caveat", "provider-note"]);

const providerStates = new Set(["ready", "degraded", "unavailable", "disabled", "blocked"]);

const operationalContextPackRegistrationState = new WeakMap<ContextPackRegistry, Map<OperationalContextPackId, {
  readonly registrationKey: string;
  readonly descriptorFingerprint: string;
}>>();

export const operationalContextPackDescriptors: readonly ContextPackDescriptor[] = Object.freeze([
  Object.freeze({
    contextPackId: "workspace-runtime-status.v1",
    version: 1,
    label: "Workspace runtime status",
    maxBytes: 16_384,
    requiredProvenanceKinds: Object.freeze(["operational-source-proof"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "runtime.status"
  }),
  Object.freeze({
    contextPackId: "task-run-history.v1",
    version: 1,
    label: "Task and run history",
    maxBytes: 32_768,
    requiredProvenanceKinds: Object.freeze(["operational-source-proof"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "agent.projection.task-run-history"
  }),
  Object.freeze({
    contextPackId: "agent-memory-summary.v1",
    version: 1,
    label: "Agent memory summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: Object.freeze(["operational-source-proof"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "agent.projection.memory"
  })
]);

export const operationalContextPackPayloadParsers: Readonly<Record<`${OperationalContextPackId}@1`, ContextPackPayloadParser>> = Object.freeze({
  "workspace-runtime-status.v1@1": createOperationalPayloadParser("workspace-runtime-status.v1", "runtime"),
  "task-run-history.v1@1": createOperationalPayloadParser("task-run-history.v1", "history"),
  "agent-memory-summary.v1@1": createOperationalPayloadParser("agent-memory-summary.v1", "memory")
});

/** Builds a resolved, provider-free summary from injected runtime facts only. */
export function buildWorkspaceRuntimeStatusContextPack(
  input: BuildWorkspaceRuntimeStatusContextPackInput
): ResolvedContextPack {
  assertBuilderMetadata(input, "runtimeSource");
  const runtime = normalizeRuntimeSource(input.runtimeSource);
  if (runtime.runtimeHighWaterMark !== input.projectionHighWaterMark) {
    throw new Error("blocked.projection-source-mismatch: workspace runtime high-water mark does not match the context pack ref high-water mark");
  }
  if (input.scope.kind === "workspace" && runtime.workspaceId !== undefined && runtime.workspaceId !== input.scope.id) {
    throw new Error("blocked.projection-source-mismatch: workspace runtime does not match the context pack scope");
  }
  const provenanceRefs = uniqueStrings([
    operationalSourceProof("workspace-runtime-status.v1", "event"),
    ...runtime.diagnostics.flatMap((diagnostic) => diagnosticIds(diagnostic)),
    `runtime.status:hwm:${runtime.runtimeHighWaterMark}`
  ]);
  const stalenessInputs = [
    { kind: "projection-high-water-mark", ref: "runtime.status", value: String(input.projectionHighWaterMark) },
    ...runtime.omissionCodes.map((code) => ({ kind: "omission-code", ref: "runtime.status", value: code }))
  ];
  return buildWithBudget({
    contextPackId: "workspace-runtime-status.v1",
    generatedAt: input.generatedAt,
    payload: { schemaVersion: "workspace-runtime-status.v1", source: operationalSourceMetadata(input, stalenessInputs), runtime },
    safeSummary: `Workspace runtime status at high-water mark ${runtime.runtimeHighWaterMark}.`,
    provenanceRefs,
    projectionHighWaterMark: input.projectionHighWaterMark,
    policyVersion: input.policyVersion,
    scope: input.scope,
    sizeBudgetBytes: input.sizeBudgetBytes,
    stalenessInputs
  });
}

/** Builds a resolved pack from a caller-bounded history snapshot, never an AgentProjection. */
export function buildTaskRunHistoryContextPack(
  input: BuildTaskRunHistoryContextPackInput
): ResolvedContextPack {
  assertBuilderMetadata(input, "taskRunHistorySnapshot");
  const snapshot = normalizeTaskRunHistorySnapshot(input.taskRunHistorySnapshot);
  if (snapshot.projectionHighWaterMark !== input.projectionHighWaterMark ||
    snapshot.projectionSourceRef !== "agent.projection.task-run-history") {
    throw new Error("blocked.projection-source-mismatch: task/run history snapshot does not match its projection source");
  }
  const isEmpty = historyItemCount(snapshot) === 0;
  const emptyProof = isEmpty ? assertEmptyHistoryProof(snapshot.emptyProof, input, snapshot) : undefined;
  if (!isEmpty && snapshot.emptyProof !== undefined) {
    throw new Error("blocked.projection-source-mismatch: non-empty task/run history must not include empty proof");
  }

  let candidate = snapshot;
  const stalenessInputs = [{
    kind: "projection-high-water-mark",
    ref: "agent.projection.task-run-history",
    value: String(input.projectionHighWaterMark)
  }];
  while (true) {
    const provenanceRefs = emptyProof === undefined
      ? uniqueStrings([operationalSourceProof("task-run-history.v1", "event"), ...candidate.sourceEventIds, ...candidate.artifactHashes])
      : [operationalSourceProof("task-run-history.v1", "empty-projection"), emptyProjectionProvenanceRef(emptyProof)];
    const payload = {
      schemaVersion: "task-run-history.v1" as const,
      source: operationalSourceMetadata(input, stalenessInputs),
      history: {
        projectionHighWaterMark: candidate.projectionHighWaterMark,
        projectionSourceRef: candidate.projectionSourceRef,
        tasks: candidate.tasks,
        runs: candidate.runs,
        modelInvocations: candidate.modelInvocations,
        toolRequests: candidate.toolRequests,
        aggregateCounts: candidate.aggregateCounts,
        sourceEventIds: candidate.sourceEventIds,
        artifactHashes: candidate.artifactHashes,
        window: candidate.window,
        ...(emptyProof === undefined ? {} : { emptyProof })
      }
    };
    try {
      return buildWithBudget({
        contextPackId: "task-run-history.v1",
        generatedAt: input.generatedAt,
        payload,
        safeSummary: `${historyItemCount(candidate)} bounded task/run history item${historyItemCount(candidate) === 1 ? "" : "s"}.`,
        provenanceRefs,
        projectionHighWaterMark: input.projectionHighWaterMark,
        sourceEventIds: candidate.sourceEventIds,
        artifactHashes: candidate.artifactHashes,
        policyVersion: input.policyVersion,
        scope: input.scope,
        sizeBudgetBytes: input.sizeBudgetBytes,
        stalenessInputs
      });
    } catch (error) {
      if (!(error instanceof Error) || !/sizeBudgetBytes must be at least/.test(error.message)) {
        throw error;
      }
      const trimmed = trimQuietHistory(candidate);
      if (trimmed === undefined || historyItemCount(trimmed) === 0) {
        throw new Error("blocked.size-budget: no safety-relevant task/run history source fits the size budget");
      }
      candidate = trimmed;
    }
  }
}

export function assertOperationalContextPackProviderMetadata(
  value: OperationalContextPackProviderMetadata
): asserts value is OperationalContextPackProviderMetadata {
  assertPlainDataObject(value, "provider metadata", [
    "providerId",
    "capabilities",
    "policyVersion",
    "generatedAt",
    "scope",
    "sizeBudgets"
  ]);
  assertSafeToken(value.providerId, "providerId");
  assertSafeToken(value.policyVersion, "policyVersion", true);
  assertUtcTimestamp(value.generatedAt, "generatedAt");
  assertSafeScope(value.scope);
  assertSizeBudgets(value.sizeBudgets);

  assertPlainDataArray(value.capabilities, "provider capabilities");
  if (value.capabilities.length === 0) {
    throw new Error("provider capabilities must not be empty");
  }
  for (const capability of value.capabilities) {
    if (typeof capability !== "string" || !operationalCapabilities.has(capability as OperationalContextPackCapability)) {
      throw new Error("provider capabilities must contain only known operational capabilities");
    }
    assertSafeToken(capability, "capability");
  }
}

export function operationalContextPackProviderRegistrationKey(
  metadata: OperationalContextPackProviderMetadata
): string {
  assertOperationalContextPackProviderMetadata(metadata);
  const capabilities = [...new Set(metadata.capabilities)].sort();
  const segments = [
    "operational-context-packs",
    metadata.providerId,
    metadata.policyVersion,
    metadata.scope.kind,
    metadata.scope.id,
    capabilities.join(",")
  ];
  for (const segment of segments) {
    assertAgentSecretSafeText(segment, "operational context pack registration key segment");
  }
  return segments.join(":");
}

/** Registers the package-owned, async bounded operational pack builders. */
export function registerOperationalContextPackBuilders(
  registry: ContextPackRegistry,
  provider: OperationalContextPackProvider
): OperationalContextPackRegistrationResult {
  const capturedProvider = captureOperationalProvider(provider);
  const metadata = capturedProvider.metadata;
  const registrationKey = operationalContextPackProviderRegistrationKey(metadata);
  const state = operationalContextPackRegistrationState.get(registry);

  for (const descriptor of operationalContextPackDescriptors) {
    const contextPackId = descriptor.contextPackId as OperationalContextPackId;
    const descriptorFingerprint = operationalDescriptorFingerprint(descriptor);
    const registered = state?.get(contextPackId);
    const existingDescriptor = registry.getDescriptor(contextPackId);
    if (registered !== undefined) {
      if (registered.registrationKey !== registrationKey || registered.descriptorFingerprint !== descriptorFingerprint ||
        existingDescriptor === undefined || operationalDescriptorFingerprint(existingDescriptor) !== descriptorFingerprint) {
        throw new Error("blocked.conflicting-registration: operational context pack registration conflicts with existing registration");
      }
      continue;
    }
    if (existingDescriptor !== undefined) {
      throw new Error("blocked.conflicting-registration: operational context pack ID is already registered by another builder");
    }
  }

  if (!hasAllOperationalCapabilities(metadata.capabilities)) {
    throw new Error("blocked.missing-capability: operational provider does not declare every required capability");
  }

  if (state === undefined) {
    const nextState = new Map<OperationalContextPackId, { readonly registrationKey: string; readonly descriptorFingerprint: string }>();
    operationalContextPackRegistrationState.set(registry, nextState);
    for (const descriptor of operationalContextPackDescriptors) {
      const contextPackId = descriptor.contextPackId as OperationalContextPackId;
      registry.register(operationalContextPackBuilder(descriptor, capturedProvider));
      nextState.set(contextPackId, { registrationKey, descriptorFingerprint: operationalDescriptorFingerprint(descriptor) });
    }
  }

  return Object.freeze({
    contextPackIds: Object.freeze(operationalContextPackDescriptors.map((descriptor) => descriptor.contextPackId as OperationalContextPackId)),
    registrationKey
  });
}

/** Builds bounded resolved envelopes and ref-only readiness inputs without runtime adapters. */
export function buildOperationalAgentMemorySummaryContextPack(
  input: BuildAgentMemorySummaryContextPackInput
): ResolvedContextPack {
  return withOperationalSourceProof(buildAgentMemorySummaryResolvedContextPack(input));
}

/** Builds bounded resolved envelopes and ref-only readiness inputs without runtime adapters. */
export async function buildOperationalContextPackReadinessInputs(
  provider: OperationalContextPackProvider
): Promise<OperationalContextPackReadinessInputs> {
  const capturedProvider = captureOperationalProvider(provider);
  const metadata = capturedProvider.metadata;
  if (!hasAllOperationalCapabilities(metadata.capabilities)) {
    return Object.freeze({
      resolvedContextPacks: Object.freeze([]),
      contextPackRefs: Object.freeze([]),
      currentProjectionHighWaterMarks: Object.freeze({}),
      descriptors: operationalContextPackDescriptors,
      blockingReasons: Object.freeze(["blocked.missing-capability"] as const),
      omissionCodes: Object.freeze([])
    });
  }
  const [runtimeSource, taskRunHistorySnapshot, agentMemorySnapshot] = await Promise.all([
    callOperationalProvider(capturedProvider.workspaceRuntimeStatus),
    callOperationalProvider(capturedProvider.taskRunHistorySnapshot),
    callOperationalProvider(capturedProvider.agentMemorySnapshot)
  ]);
  const resolvedContextPacks = Object.freeze([
    buildWorkspaceRuntimeStatusContextPack({
      generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
      projectionHighWaterMark: runtimeSource.runtimeHighWaterMark,
      sizeBudgetBytes: metadata.sizeBudgets.workspaceRuntimeStatus, runtimeSource
    }),
    buildTaskRunHistoryContextPack({
      generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
      projectionHighWaterMark: taskRunHistorySnapshot.projectionHighWaterMark,
      sizeBudgetBytes: metadata.sizeBudgets.taskRunHistory, taskRunHistorySnapshot
    }),
    buildOperationalAgentMemorySummaryContextPack({
      generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
      projectionHighWaterMark: agentMemorySnapshot.projectionHighWaterMark,
      sizeBudgetBytes: metadata.sizeBudgets.agentMemorySummary, memorySnapshot: agentMemorySnapshot
    })
  ]);
  const omissionCodes = Object.freeze([...uniqueStrings([
    ...runtimeSource.omissionCodes,
    ...taskRunHistorySnapshot.window.omissionCodes,
    ...agentMemorySnapshot.window.omissionCodes
  ])].sort() as OperationalContextPackOmissionCode[]);
  return Object.freeze({
    resolvedContextPacks,
    contextPackRefs: Object.freeze(resolvedContextPacks.map((resolved) => resolved.ref)),
    currentProjectionHighWaterMarks: Object.freeze({
      "workspace-runtime-status.v1": runtimeSource.runtimeHighWaterMark,
      "task-run-history.v1": taskRunHistorySnapshot.projectionHighWaterMark,
      "agent-memory-summary.v1": agentMemorySnapshot.projectionHighWaterMark
    }),
    descriptors: operationalContextPackDescriptors,
    blockingReasons: Object.freeze([]),
    omissionCodes
  });
}

function operationalContextPackBuilder(
  descriptor: ContextPackDescriptor,
  provider: CapturedOperationalProvider
): { readonly descriptor: ContextPackDescriptor; readonly parsePayload: ContextPackPayloadParser; build(): Promise<ResolvedContextPack> } {
  const contextPackId = descriptor.contextPackId as OperationalContextPackId;
  return Object.freeze({
    descriptor,
    parsePayload: operationalContextPackPayloadParsers[`${contextPackId}@1`],
    async build(): Promise<ResolvedContextPack> {
      const metadata = provider.metadata;
      if (contextPackId === "workspace-runtime-status.v1") {
        const runtimeSource = await callOperationalProvider(provider.workspaceRuntimeStatus);
        return buildWorkspaceRuntimeStatusContextPack({
          generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
          projectionHighWaterMark: runtimeSource.runtimeHighWaterMark,
          sizeBudgetBytes: metadata.sizeBudgets.workspaceRuntimeStatus, runtimeSource
        });
      }
      if (contextPackId === "task-run-history.v1") {
        const taskRunHistorySnapshot = await callOperationalProvider(provider.taskRunHistorySnapshot);
        return buildTaskRunHistoryContextPack({
          generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
          projectionHighWaterMark: taskRunHistorySnapshot.projectionHighWaterMark,
          sizeBudgetBytes: metadata.sizeBudgets.taskRunHistory, taskRunHistorySnapshot
        });
      }
      const memorySnapshot = await callOperationalProvider(provider.agentMemorySnapshot);
      return buildOperationalAgentMemorySummaryContextPack({
        generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
        projectionHighWaterMark: memorySnapshot.projectionHighWaterMark,
        sizeBudgetBytes: metadata.sizeBudgets.agentMemorySummary, memorySnapshot
      });
    }
  });
}

interface CapturedOperationalProvider {
  readonly metadata: OperationalContextPackProviderMetadata;
  readonly workspaceRuntimeStatus: () => Promise<OperationalWorkspaceRuntimeSource>;
  readonly taskRunHistorySnapshot: () => Promise<OperationalTaskRunHistorySnapshot>;
  readonly agentMemorySnapshot: () => Promise<OperationalAgentMemorySnapshot>;
}

function captureOperationalProvider(provider: OperationalContextPackProvider): CapturedOperationalProvider {
  if (typeof provider !== "object" || provider === null) {
    throw new Error("blocked.invalid-payload-shape");
  }
  const descriptors = Object.getOwnPropertyDescriptors(provider);
  const ownValue = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("blocked.invalid-payload-shape");
    }
    return descriptor.value;
  };
  const metadata = {
    providerId: ownValue("providerId"),
    capabilities: ownValue("capabilities"),
    policyVersion: ownValue("policyVersion"),
    generatedAt: ownValue("generatedAt"),
    scope: ownValue("scope"),
    sizeBudgets: ownValue("sizeBudgets")
  } as OperationalContextPackProviderMetadata;
  assertOperationalContextPackProviderMetadata(metadata);
  const method = <T>(key: string): (() => Promise<T>) => {
    const value = ownValue(key);
    if (typeof value !== "function") {
      throw new Error("blocked.missing-capability");
    }
    return value.bind(provider) as () => Promise<T>;
  };
  return Object.freeze({
    metadata: Object.freeze({
      providerId: metadata.providerId,
      capabilities: Object.freeze([...metadata.capabilities]),
      policyVersion: metadata.policyVersion,
      generatedAt: metadata.generatedAt,
      scope: Object.freeze({ ...metadata.scope }),
      sizeBudgets: Object.freeze({ ...metadata.sizeBudgets })
    }),
    workspaceRuntimeStatus: method<OperationalWorkspaceRuntimeSource>("workspaceRuntimeStatus"),
    taskRunHistorySnapshot: method<OperationalTaskRunHistorySnapshot>("taskRunHistorySnapshot"),
    agentMemorySnapshot: method<OperationalAgentMemorySnapshot>("agentMemorySnapshot")
  });
}

async function callOperationalProvider<T>(method: () => Promise<T>): Promise<T> {
  try {
    return await method();
  } catch {
    throw new Error("blocked.operational-provider-failed");
  }
}

function hasAllOperationalCapabilities(capabilities: readonly OperationalContextPackCapability[]): boolean {
  return [...operationalCapabilities].every((capability) => capabilities.includes(capability));
}

function operationalDescriptorFingerprint(descriptor: ContextPackDescriptor): string {
  return new TextDecoder().decode(serializeContextPackPayload(descriptor));
}

function operationalSourceProof(
  contextPackId: OperationalContextPackId,
  sourceKind: "event" | "empty-projection"
): string {
  return `operational-source-proof:${contextPackId}:${sourceKind}`;
}

function withOperationalSourceProof(resolved: ResolvedContextPack): ResolvedContextPack {
  const sourceKind = resolved.ref.provenanceRefs.some((ref) => ref.startsWith("empty-projection:"))
    ? "empty-projection"
    : "event";
  const proof = operationalSourceProof(resolved.ref.contextPackId as OperationalContextPackId, sourceKind);
  if (resolved.ref.provenanceRefs.includes(proof)) return resolved;
  return Object.freeze({
    ref: Object.freeze({ ...resolved.ref, provenanceRefs: Object.freeze(uniqueStrings([...resolved.ref.provenanceRefs, proof])) }),
    payload: resolved.payload
  });
}

function createOperationalPayloadParser(
  schemaVersion: OperationalContextPackId,
  requiredSection: string
): ContextPackPayloadParser {
  return (payload, ref) => {
    assertOperationalPayloadEnvelope(payload, schemaVersion, requiredSection);
    if (schemaVersion === "workspace-runtime-status.v1") {
      assertWorkspaceRuntimePayloadSection(requiredJsonField(payload, "runtime", schemaVersion), schemaVersion);
    } else if (schemaVersion === "task-run-history.v1") {
      assertTaskRunHistoryPayloadSection(requiredJsonField(payload, "history", schemaVersion), schemaVersion);
    } else {
      assertAgentMemoryPayloadSection(requiredJsonField(payload, "memory", schemaVersion), schemaVersion);
    }
    assertOperationalSourceMetadataSemantics(payload, schemaVersion, requiredSection);
    if (ref !== undefined) {
      assertOperationalRefSemantics(payload, ref, schemaVersion, requiredSection);
    }
    return payload;
  };
}

function assertPlainDataObject(
  value: unknown,
  label: string,
  allowedKeys?: readonly string[]
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
  for (const key of Object.keys(descriptors)) {
    if (allowed !== undefined && !allowed.has(key)) {
      throw new Error(`${label} contains an unexpected field`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} must not contain accessors`);
    }
  }
}

function assertPlainDataArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be a plain array`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const indexes = Object.keys(descriptors).filter((key) => key !== "length");
  for (const key of indexes) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new Error(`${label} contains an unexpected field`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} must not contain accessors`);
    }
  }
  if (indexes.length !== value.length) {
    throw new Error(`${label} must be dense`);
  }
}

function assertOperationalPayloadEnvelope(
  payload: AgentContextPackJsonValue,
  schemaVersion: OperationalContextPackId,
  section: string
): asserts payload is { readonly [key: string]: AgentContextPackJsonValue } {
  assertJsonObjectWithAllowedKeys(payload, schemaVersion, ["schemaVersion", "source", section]);
  const payloadSchemaVersion = requiredJsonField(payload, "schemaVersion", schemaVersion);
  if (payloadSchemaVersion !== schemaVersion) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertOperationalSourceMetadata(requiredJsonField(payload, "source", schemaVersion), schemaVersion);
}

function assertOperationalSourceMetadata(value: AgentContextPackJsonValue, schemaVersion: OperationalContextPackId): void {
  assertJsonObjectWithAllowedKeys(value, schemaVersion, ["generatedAt", "policyVersion", "scope", "sizeBudgetBytes", "stalenessInputs"]);
  assertUtcTimestamp(requiredJsonField(value, "generatedAt", schemaVersion), "source.generatedAt");
  assertSafeToken(requiredJsonField(value, "policyVersion", schemaVersion), "source.policyVersion", true);
  assertScopePayloadField(value, "scope", schemaVersion);
  assertPositiveIntegerField(value, "sizeBudgetBytes", schemaVersion);
  for (const stalenessInput of assertJsonArrayField(value, "stalenessInputs", schemaVersion)) {
    assertJsonObjectWithAllowedKeys(stalenessInput, schemaVersion, ["kind", "ref", "value"]);
    for (const key of ["kind", "ref", "value"] as const) {
      assertStringField(stalenessInput, key, schemaVersion);
    }
  }
}

function assertOperationalSourceMetadataSemantics(
  payload: { readonly [key: string]: AgentContextPackJsonValue },
  schemaVersion: OperationalContextPackId,
  sectionName: string
): void {
  const source = requiredJsonField(payload, "source", schemaVersion);
  const section = requiredJsonField(payload, sectionName, schemaVersion);
  if (!isOperationalJsonObject(source) || !isOperationalJsonObject(section) || !Array.isArray(source.stalenessInputs)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const projectionHighWaterMark = schemaVersion === "workspace-runtime-status.v1"
    ? section.runtimeHighWaterMark
    : section.projectionHighWaterMark;
  if (typeof projectionHighWaterMark !== "number") {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertOperationalStalenessInputs(
    source.stalenessInputs as unknown as readonly ContextPackStalenessInput[],
    schemaVersion,
    projectionHighWaterMark
  );
}

function assertWorkspaceRuntimePayloadSection(value: AgentContextPackJsonValue, schemaVersion: OperationalContextPackId): void {
  assertJsonObjectWithAllowedKeys(value, schemaVersion, [
    "runtimeHighWaterMark",
    "workspaceMounted",
    "workspaceId",
    "storageStrategy",
    "bindPosture",
    "authPosture",
    "providerStates",
    "diagnostics",
    "projectionHighWaterMarks",
    "omissionCodes"
  ]);
  assertNonnegativeIntegerField(value, "runtimeHighWaterMark", schemaVersion);
  assertBooleanField(value, "workspaceMounted", schemaVersion);
  assertOptionalSafeIdentifierField(value, "workspaceId", schemaVersion);
  for (const key of ["storageStrategy", "bindPosture", "authPosture"] as const) {
    assertMachineReadableOperationalToken(requiredJsonField(value, key, schemaVersion), `runtime ${key}`);
  }
  for (const providerState of assertJsonArrayField(value, "providerStates", schemaVersion)) {
    projectRuntimeProviderState(providerState);
  }
  for (const diagnostic of assertJsonArrayField(value, "diagnostics", schemaVersion)) {
    projectRuntimeDiagnostic(diagnostic);
  }
  assertNumberRecordField(value, "projectionHighWaterMarks", schemaVersion);
  assertOmissionCodesField(value, "omissionCodes", schemaVersion);
}

function assertTaskRunHistoryPayloadSection(value: AgentContextPackJsonValue, schemaVersion: OperationalContextPackId): void {
  assertJsonObjectWithAllowedKeys(value, schemaVersion, [
    "projectionHighWaterMark",
    "projectionSourceRef",
    "tasks",
    "runs",
    "modelInvocations",
    "toolRequests",
    "aggregateCounts",
    "sourceEventIds",
    "artifactHashes",
    "window",
    "emptyProof"
  ]);
  assertCommonProjectionPayloadSection(value, schemaVersion);
  const tasks = assertJsonArrayField(value, "tasks", schemaVersion).map(projectTaskHistoryItem);
  const runs = assertJsonArrayField(value, "runs", schemaVersion).map(projectRunHistoryItem);
  const modelInvocations = assertJsonArrayField(value, "modelInvocations", schemaVersion).map(projectModelInvocationHistoryItem);
  const toolRequests = assertJsonArrayField(value, "toolRequests", schemaVersion).map(projectToolRequestHistoryItem);
  const items = [...tasks, ...runs, ...modelInvocations, ...toolRequests];
  assertProjectionPayloadSemantics(value, schemaVersion, "agent.projection.task-run-history", items.length);
  assertHistoryIdentityAndLinks(tasks, runs, modelInvocations, toolRequests);
  assertHistoryItemsHaveProvenance(items);
  assertHistoryProvenanceMatches(value, items, schemaVersion);
}

function assertAgentMemoryPayloadSection(value: AgentContextPackJsonValue, schemaVersion: OperationalContextPackId): void {
  assertJsonObjectWithAllowedKeys(value, schemaVersion, [
    "truthBoundary",
    "projectionHighWaterMark",
    "projectionSourceRef",
    "activeMemory",
    "aggregateCounts",
    "sourceEventIds",
    "artifactHashes",
    "window",
    "emptyProof"
  ]);
  const truthBoundary = requiredJsonField(value, "truthBoundary", schemaVersion);
  assertJsonObjectWithAllowedKeys(truthBoundary, schemaVersion, ["authoritativeForOntology"]);
  if (requiredJsonField(truthBoundary, "authoritativeForOntology", schemaVersion) !== false) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertCommonProjectionPayloadSection(value, schemaVersion);
  const activeMemory = assertJsonArrayField(value, "activeMemory", schemaVersion);
  for (const memory of activeMemory) {
    assertMemoryPayloadItem(memory, schemaVersion);
  }
  assertProjectionPayloadSemantics(value, schemaVersion, "agent.projection.memory", activeMemory.length);
  assertMemoryProvenanceMatches(value, activeMemory, schemaVersion);
}

function assertCommonProjectionPayloadSection(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  schemaVersion: OperationalContextPackId
): void {
  assertNonnegativeIntegerField(value, "projectionHighWaterMark", schemaVersion);
  assertStringField(value, "projectionSourceRef", schemaVersion);
  assertNumberRecordField(value, "aggregateCounts", schemaVersion);
  assertEventIdsField(value, "sourceEventIds", schemaVersion);
  assertArtifactHashesField(value, "artifactHashes", schemaVersion);
  assertWindowField(value, "window", schemaVersion);
  if (hasJsonField(value, "emptyProof")) {
    assertEmptyProofField(value, "emptyProof", schemaVersion);
  }
}

function assertWindowField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const window = requiredJsonField(value, key, schemaVersion);
  assertJsonObjectWithAllowedKeys(window, schemaVersion, ["order", "limit", "cursor", "hasMore", "totalCount", "omissionCodes"]);
  assertStringField(window, "order", schemaVersion);
  assertPositiveIntegerField(window, "limit", schemaVersion);
  if (hasJsonField(window, "cursor")) {
    assertStringField(window, "cursor", schemaVersion);
  }
  assertBooleanField(window, "hasMore", schemaVersion);
  assertNonnegativeIntegerField(window, "totalCount", schemaVersion);
  assertOmissionCodesField(window, "omissionCodes", schemaVersion);
}

function assertEmptyProofField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const emptyProof = requiredJsonField(value, key, schemaVersion);
  assertJsonObjectWithAllowedKeys(emptyProof, schemaVersion, [
    "projectionName",
    "scope",
    "projectionHighWaterMark",
    "sourceEventCount",
    "generatedAt",
    "emptyReasonCode"
  ]);
  assertStringField(emptyProof, "projectionName", schemaVersion);
  assertScopePayloadField(emptyProof, "scope", schemaVersion);
  assertNonnegativeIntegerField(emptyProof, "projectionHighWaterMark", schemaVersion);
  assertNonnegativeIntegerField(emptyProof, "sourceEventCount", schemaVersion);
  assertUtcTimestamp(requiredJsonField(emptyProof, "generatedAt", schemaVersion), "emptyProof.generatedAt");
  assertMachineReadableOperationalToken(requiredJsonField(emptyProof, "emptyReasonCode", schemaVersion), "emptyProof.emptyReasonCode");
}

function assertProjectionPayloadSemantics(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  schemaVersion: OperationalContextPackId,
  expectedProjectionSource: "agent.projection.task-run-history" | "agent.projection.memory",
  visibleItemCount: number
): void {
  if (requiredJsonField(value, "projectionSourceRef", schemaVersion) !== expectedProjectionSource) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const window = requiredJsonField(value, "window", schemaVersion);
  const aggregateCounts = requiredJsonField(value, "aggregateCounts", schemaVersion);
  if (!isOperationalJsonObject(window) || !isOperationalJsonObject(aggregateCounts) || typeof window.limit !== "number" ||
    typeof window.totalCount !== "number" || typeof window.hasMore !== "boolean" ||
    visibleItemCount > window.limit || window.totalCount < visibleItemCount ||
    (window.hasMore && window.totalCount <= visibleItemCount)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  if (expectedProjectionSource === "agent.projection.memory") {
    if (typeof aggregateCounts.active !== "number" || typeof aggregateCounts.totalCount !== "number" ||
      aggregateCounts.active < visibleItemCount || aggregateCounts.totalCount < visibleItemCount) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  } else {
    assertHistoryAggregateCountsCoverVisibleItems(aggregateCounts, value, visibleItemCount, schemaVersion);
  }
  const isEmpty = visibleItemCount === 0;
  const hasEmptyProof = hasJsonField(value, "emptyProof");
  if (isEmpty !== hasEmptyProof) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  if (!isEmpty) return;

  const emptyProof = requiredJsonField(value, "emptyProof", schemaVersion);
  const sourceEventIds = assertJsonArrayField(value, "sourceEventIds", schemaVersion);
  const artifactHashes = assertJsonArrayField(value, "artifactHashes", schemaVersion);
  if (!isOperationalJsonObject(emptyProof) || !isOperationalJsonObject(aggregateCounts) ||
    emptyProof.projectionName !== expectedProjectionSource ||
    emptyProof.projectionHighWaterMark !== value.projectionHighWaterMark ||
    sourceEventIds.length !== 0 || artifactHashes.length !== 0 ||
    window.totalCount !== 0 || window.hasMore !== false) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  if (expectedProjectionSource === "agent.projection.memory") {
    const omissionCodes = Array.isArray(window.omissionCodes) ? window.omissionCodes : [];
    if (aggregateCounts.active !== 0 || typeof aggregateCounts.totalCount !== "number" ||
      emptyProof.sourceEventCount !== aggregateCounts.totalCount ||
      (aggregateCounts.totalCount > 0 && !omissionCodes.includes("omitted.out-of-scope"))) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  } else if (emptyProof.sourceEventCount !== 0 || Object.values(aggregateCounts).some((count) => count !== 0)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertOperationalRefSemantics(
  payload: { readonly [key: string]: AgentContextPackJsonValue },
  ref: ContextPackRef,
  schemaVersion: OperationalContextPackId,
  sectionName: string
): void {
  assertOperationalRefMetadata(ref, schemaVersion);
  if (ref.contextPackId !== schemaVersion || ref.version !== 1 || ref.policyVersion === undefined || ref.scope === undefined ||
    ref.projectionHighWaterMark === undefined) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const source = requiredJsonField(payload, "source", schemaVersion);
  if (!isOperationalJsonObject(source)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const sourceScope = source.scope;
  if (source.generatedAt !== ref.generatedAt || source.policyVersion !== ref.policyVersion ||
    source.sizeBudgetBytes !== ref.sizeBudgetBytes ||
    sourceScope === undefined || !isOperationalJsonObject(sourceScope) ||
    sourceScope.kind !== ref.scope.kind || sourceScope.id !== ref.scope.id) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const sourceStalenessInputs = source.stalenessInputs;
  if (!Array.isArray(sourceStalenessInputs) || ref.stalenessInputs === undefined ||
    stableJsonText(sourceStalenessInputs) !== stableJsonText(ref.stalenessInputs as unknown as AgentContextPackJsonValue)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  const section = requiredJsonField(payload, sectionName, schemaVersion);
  if (!isOperationalJsonObject(section)) throw new Error(`invalid ${schemaVersion} payload`);
  const expectedProjection = schemaVersion === "workspace-runtime-status.v1" ? "runtime.status" :
    schemaVersion === "task-run-history.v1" ? "agent.projection.task-run-history" : "agent.projection.memory";
  const payloadHighWaterMark = schemaVersion === "workspace-runtime-status.v1"
    ? section.runtimeHighWaterMark
    : section.projectionHighWaterMark;
  const highWaterInputs = ref.stalenessInputs?.filter((input) => input.kind === "projection-high-water-mark") ?? [];
  if (payloadHighWaterMark !== ref.projectionHighWaterMark || highWaterInputs.length !== 1 ||
    highWaterInputs[0]?.ref !== expectedProjection || highWaterInputs[0]?.value !== String(ref.projectionHighWaterMark)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  if (schemaVersion !== "workspace-runtime-status.v1") {
    if (section.projectionSourceRef !== expectedProjection) throw new Error(`invalid ${schemaVersion} payload`);
    assertExactStringArray(section.sourceEventIds as AgentContextPackJsonValue, ref.sourceEventIds ?? [], schemaVersion);
    assertExactStringArray(section.artifactHashes as AgentContextPackJsonValue, ref.artifactHashes ?? [], schemaVersion);
  } else {
    if ((ref.sourceEventIds?.length ?? 0) !== 0 || (ref.artifactHashes?.length ?? 0) !== 0) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
    if (ref.scope.kind === "workspace" && typeof section.workspaceId === "string" && section.workspaceId !== ref.scope.id) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
  const emptyProof = section.emptyProof;
  if (emptyProof !== undefined && isOperationalJsonObject(emptyProof)) {
    const proof = emptyProof;
    const proofScope = proof.scope;
    if (proofScope === undefined || !isOperationalJsonObject(proofScope) || proofScope.kind !== ref.scope.kind || proofScope.id !== ref.scope.id ||
      proof.generatedAt !== ref.generatedAt || proof.projectionHighWaterMark !== ref.projectionHighWaterMark) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
}

function assertOperationalRefMetadata(ref: ContextPackRef, schemaVersion: OperationalContextPackId): void {
  assertSafeOperationalText(ref.safeSummary, "ref.safeSummary");
  for (const provenanceRef of ref.provenanceRefs) {
    if (typeof provenanceRef !== "string" || !/^[a-z][A-Za-z0-9._-]*(?::[A-Za-z0-9._-]+)*$/.test(provenanceRef)) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
    assertAgentSecretSafeText(provenanceRef, "ref.provenanceRef");
  }
  if (ref.policyVersion === undefined || ref.scope === undefined || ref.projectionHighWaterMark === undefined || ref.stalenessInputs === undefined) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertSafeToken(ref.policyVersion, "ref.policyVersion", true);
  assertSafeScope(ref.scope);
  assertOperationalStalenessInputs(ref.stalenessInputs, schemaVersion, ref.projectionHighWaterMark);
}

function assertOperationalStalenessInputs(
  stalenessInputs: readonly ContextPackStalenessInput[],
  schemaVersion: OperationalContextPackId,
  projectionHighWaterMark: number
): void {
  const projectionRef = schemaVersion === "workspace-runtime-status.v1"
    ? "runtime.status"
    : schemaVersion === "task-run-history.v1"
      ? "agent.projection.task-run-history"
      : "agent.projection.memory";
  const highWaterInputs = stalenessInputs.filter((input) => input.kind === "projection-high-water-mark");
  if (highWaterInputs.length !== 1 || highWaterInputs[0]?.ref !== projectionRef ||
    highWaterInputs[0]?.value !== String(projectionHighWaterMark)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  for (const input of stalenessInputs) {
    if (input.kind === "projection-high-water-mark") {
      continue;
    }
    if (schemaVersion === "workspace-runtime-status.v1" && input.kind === "omission-code" &&
      input.ref === projectionRef && isOperationalOmissionCode(input.value)) {
      continue;
    }
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertHistoryAggregateCountsCoverVisibleItems(
  aggregateCounts: { readonly [key: string]: AgentContextPackJsonValue },
  value: { readonly [key: string]: AgentContextPackJsonValue },
  visibleItemCount: number,
  schemaVersion: OperationalContextPackId
): void {
  if (typeof aggregateCounts.total === "number") {
    if (aggregateCounts.total < visibleItemCount) throw new Error(`blocked.projection-source-mismatch: invalid ${schemaVersion} aggregate counts`);
    return;
  }
  const families = ["tasks", "runs", "modelInvocations", "toolRequests"] as const;
  let covered = 0;
  let hasFamilyCount = false;
  for (const family of families) {
    if (typeof aggregateCounts[family] === "number") {
      hasFamilyCount = true;
      const visible = Array.isArray(value[family]) ? value[family].length : 0;
      if ((aggregateCounts[family] as number) < visible) throw new Error(`blocked.projection-source-mismatch: invalid ${schemaVersion} aggregate counts`);
      covered += aggregateCounts[family] as number;
    }
  }
  if (!hasFamilyCount || covered < visibleItemCount) throw new Error(`blocked.projection-source-mismatch: invalid ${schemaVersion} aggregate counts`);
}

function assertScopePayloadField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const scope = requiredJsonField(value, key, schemaVersion);
  assertJsonObjectWithAllowedKeys(scope, schemaVersion, ["kind", "id"]);
  assertSafeToken(requiredJsonField(scope, "kind", schemaVersion), "scope.kind");
  const scopeId = requiredJsonField(scope, "id", schemaVersion);
  if (typeof scopeId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(scopeId)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertAgentSecretSafeText(scopeId, "scope.id");
}

function assertJsonObjectWithAllowedKeys(
  value: AgentContextPackJsonValue,
  label: string,
  allowedKeys: readonly string[]
): asserts value is { readonly [key: string]: AgentContextPackJsonValue } {
  if (!isOperationalJsonObject(value)) {
    throw new Error(`invalid ${label} payload`);
  }
  const allowed = new Set(allowedKeys);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`invalid ${label} payload`);
  }
  for (const key of Object.keys(descriptors)) {
    assertAgentSecretSafeText(key, `${label} key`);
    if (!allowed.has(key)) {
      throw new Error(`invalid ${label} payload`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`invalid ${label} payload`);
    }
    assertJsonValueSafe(descriptor.value, label);
  }
}

function assertJsonValueSafe(value: AgentContextPackJsonValue, label: string): void {
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "string") {
    assertAgentSecretSafeText(value, label);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`invalid ${label} payload`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`invalid ${label} payload`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const indexes = Object.keys(descriptors).filter((key) => key !== "length");
    if (indexes.length !== value.length) {
      throw new Error(`invalid ${label} payload`);
    }
    for (const key of indexes) {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) {
        throw new Error(`invalid ${label} payload`);
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`invalid ${label} payload`);
      }
      assertJsonValueSafe(descriptor.value, label);
    }
    return;
  }
  assertJsonObjectWithAllowedKeys(value, label, Object.keys(value));
}

function requiredJsonField(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  key: string,
  schemaVersion: OperationalContextPackId
): AgentContextPackJsonValue {
  if (!Object.hasOwn(value, key)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  return value[key] as AgentContextPackJsonValue;
}

function hasJsonField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string): boolean {
  return Object.hasOwn(value, key);
}

function assertStringField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const field = requiredJsonField(value, key, schemaVersion);
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertAgentSecretSafeText(field, key);
}

function assertOptionalSafeIdentifierField(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  key: string,
  schemaVersion: OperationalContextPackId
): void {
  if (!hasJsonField(value, key)) {
    return;
  }
  const field = requiredJsonField(value, key, schemaVersion);
  if (typeof field !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(field)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertAgentSecretSafeText(field, key);
}

function assertBooleanField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  if (typeof requiredJsonField(value, key, schemaVersion) !== "boolean") {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertNonnegativeIntegerField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const field = requiredJsonField(value, key, schemaVersion);
  if (typeof field !== "number" || !Number.isInteger(field) || field < 0) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertPositiveIntegerField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const field = requiredJsonField(value, key, schemaVersion);
  if (typeof field !== "number" || !Number.isInteger(field) || field <= 0) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertJsonArrayField(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  key: string,
  schemaVersion: OperationalContextPackId
): readonly AgentContextPackJsonValue[] {
  const field = requiredJsonField(value, key, schemaVersion);
  if (!Array.isArray(field)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  return field;
}

function assertNumberRecordField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  const record = requiredJsonField(value, key, schemaVersion);
  if (!isOperationalJsonObject(record)) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertJsonObjectWithAllowedKeys(record, schemaVersion, Object.keys(record));
  for (const amount of Object.values(record)) {
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
}

function assertEventIdsField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  for (const eventId of assertJsonArrayField(value, key, schemaVersion)) {
    if (typeof eventId !== "string" || !/^evt_[a-zA-Z0-9_-]+$/.test(eventId)) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
}

function assertArtifactHashesField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  for (const hash of assertJsonArrayField(value, key, schemaVersion)) {
    if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
}

function assertOmissionCodesField(value: { readonly [key: string]: AgentContextPackJsonValue }, key: string, schemaVersion: OperationalContextPackId): void {
  for (const omissionCode of assertJsonArrayField(value, key, schemaVersion)) {
    if (typeof omissionCode !== "string" || !isOperationalOmissionCode(omissionCode)) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
  }
}

function isOperationalOmissionCode(value: string): value is OperationalContextPackOmissionCode {
  return value === "omitted.raw-paths" ||
    value === "omitted.raw-provider-errors" ||
    value === "omitted.prompts" ||
    value === "omitted.model-output" ||
    value === "omitted.credentials" ||
    value === "omitted.raw-source-content" ||
    value === "omitted.out-of-scope" ||
    value === "omitted.size-budget";
}

function isOperationalJsonObject(value: AgentContextPackJsonValue): value is { readonly [key: string]: AgentContextPackJsonValue } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeScope(scope: ContextPackScope): void {
  assertPlainDataObject(scope, "scope", ["kind", "id"]);
  assertSafeToken(scope.kind, "scope.kind");
  if (typeof scope.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(scope.id)) {
    throw new Error("scope.id must be a safe identifier");
  }
  assertAgentSecretSafeText(scope.id, "scope.id");
}

function assertSafeToken(value: unknown, label: string, allowVersionDots = false): asserts value is string {
  const pattern = allowVersionDots ? /^[a-z][a-z0-9.-]*$/ : /^[a-z][a-z0-9_-]*$/;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} must be a safe machine-readable identifier`);
  }
  assertAgentSecretSafeText(value, label);
}

function assertUtcTimestamp(value: unknown, label: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !value.endsWith("Z")) {
    throw new Error(`${label} must be a UTC timestamp`);
  }
  assertAgentSecretSafeText(value, label);
}

function assertSizeBudgets(value: OperationalContextPackSizeBudgets): void {
  assertPlainDataObject(value, "sizeBudgets", ["workspaceRuntimeStatus", "taskRunHistory", "agentMemorySummary"]);
  for (const budget of [value.workspaceRuntimeStatus, value.taskRunHistory, value.agentMemorySummary]) {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new Error("sizeBudgets must contain positive integer byte budgets");
    }
  }
}

function assertBuilderMetadata(
  input: BuildWorkspaceRuntimeStatusContextPackInput | BuildTaskRunHistoryContextPackInput,
  sourceKey: "runtimeSource" | "taskRunHistorySnapshot"
): void {
  assertPlainDataObject(input, "operational context pack builder input", [
    "generatedAt", "policyVersion", "scope", "projectionHighWaterMark", "sizeBudgetBytes", sourceKey
  ]);
  assertUtcTimestamp(input.generatedAt, "generatedAt");
  assertSafeToken(input.policyVersion, "policyVersion", true);
  assertSafeScope(input.scope);
  if (!Number.isInteger(input.projectionHighWaterMark) || input.projectionHighWaterMark < 0) {
    throw new Error("blocked.missing-high-water-mark: projectionHighWaterMark must be a nonnegative integer");
  }
  if (!Number.isInteger(input.sizeBudgetBytes) || input.sizeBudgetBytes <= 0) {
    throw new Error("blocked.size-budget: sizeBudgetBytes must be a positive integer");
  }
}

function normalizeRuntimeSource(value: OperationalWorkspaceRuntimeSource): {
  readonly runtimeHighWaterMark: number;
  readonly workspaceMounted: boolean;
  readonly workspaceId?: string;
  readonly storageStrategy: string;
  readonly bindPosture: string;
  readonly authPosture: string;
  readonly providerStates: readonly AgentContextPackJsonValue[];
  readonly diagnostics: readonly AgentContextPackJsonValue[];
  readonly projectionHighWaterMarks: Readonly<Record<string, number>>;
  readonly omissionCodes: readonly OperationalContextPackOmissionCode[];
} {
  assertPlainDataObject(value, "runtime source", [
    "runtimeHighWaterMark", "workspaceMounted", "workspaceId", "storageStrategy", "bindPosture", "authPosture",
    "providerStates", "diagnostics", "projectionHighWaterMarks", "omissionCodes"
  ]);
  if (!Number.isInteger(value.runtimeHighWaterMark) || value.runtimeHighWaterMark < 0 || typeof value.workspaceMounted !== "boolean") {
    throw new Error("blocked.invalid-payload-shape: runtime source is incomplete");
  }
  for (const [label, safeValue] of [["storageStrategy", value.storageStrategy], ["bindPosture", value.bindPosture], ["authPosture", value.authPosture]] as const) {
    assertMachineReadableOperationalToken(safeValue, label);
  }
  if (value.workspaceId !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.workspaceId)) {
      throw new Error("blocked.unsafe-diagnostic: workspaceId must be a safe identifier");
    }
    assertSafeOperationalText(value.workspaceId, "workspaceId");
  }
  assertPlainDataArray(value.providerStates, "runtime providerStates");
  assertPlainDataArray(value.diagnostics, "runtime diagnostics");
  const providerStates = value.providerStates.map(projectRuntimeProviderState);
  const diagnostics = value.diagnostics.map(projectRuntimeDiagnostic);
  assertPlainDataObject(value.projectionHighWaterMarks, "runtime projection high-water marks");
  const projectionHighWaterMarks: Record<string, number> = {};
  for (const [key, highWaterMark] of Object.entries(value.projectionHighWaterMarks)) {
    assertSafeOperationalText(key, "projection name");
    if (!Number.isInteger(highWaterMark) || highWaterMark < 0) {
      throw new Error("blocked.invalid-payload-shape: runtime projection high-water mark is invalid");
    }
    projectionHighWaterMarks[key] = highWaterMark;
  }
  const omissionCodes = normalizeOmissionCodes(value.omissionCodes);
  return {
    runtimeHighWaterMark: value.runtimeHighWaterMark,
    workspaceMounted: value.workspaceMounted,
    ...(value.workspaceId === undefined ? {} : { workspaceId: value.workspaceId }),
    storageStrategy: value.storageStrategy,
    bindPosture: value.bindPosture,
    authPosture: value.authPosture,
    providerStates: sortJsonItems(providerStates),
    diagnostics: sortJsonItems(diagnostics),
    projectionHighWaterMarks,
    omissionCodes
  };
}

function normalizeTaskRunHistorySnapshot(value: OperationalTaskRunHistorySnapshot): OperationalTaskRunHistorySnapshot {
  assertPlainDataObject(value, "task/run history snapshot", [
    "projectionHighWaterMark", "projectionSourceRef", "tasks", "runs", "modelInvocations", "toolRequests",
    "aggregateCounts", "sourceEventIds", "artifactHashes", "window", "emptyProof"
  ]);
  if (!Number.isInteger(value.projectionHighWaterMark) || value.projectionHighWaterMark < 0) {
    throw new Error("blocked.missing-high-water-mark: task/run history snapshot requires a nonnegative high-water mark");
  }
  assertSafeOperationalText(value.projectionSourceRef, "projectionSourceRef");
  assertPlainDataArray(value.tasks, "tasks");
  assertPlainDataArray(value.runs, "runs");
  assertPlainDataArray(value.modelInvocations, "model invocations");
  assertPlainDataArray(value.toolRequests, "tool requests");
  assertPlainDataObject(value.aggregateCounts, "task/run aggregate counts");
  const aggregateCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value.aggregateCounts)) {
    assertSafeOperationalText(key, "aggregate count key");
    if (!Number.isInteger(count) || count < 0) throw new Error("blocked.invalid-payload-shape: aggregate count is invalid");
    aggregateCounts[key] = count;
  }
  const callerSourceEventIds = normalizeEventIds(value.sourceEventIds);
  const callerArtifactHashes = normalizeArtifactHashes(value.artifactHashes);
  const window = normalizeWindow(value.window);
  const emptyProof = value.emptyProof === undefined ? undefined : normalizeEmptyProof(value.emptyProof);
  const rawVisibleItemCount = value.tasks.length + value.runs.length + value.modelInvocations.length + value.toolRequests.length;
  if (rawVisibleItemCount > window.limit || window.totalCount < rawVisibleItemCount ||
    (window.hasMore && window.totalCount <= rawVisibleItemCount)) {
    throw new Error("blocked.unbounded-source: task/run history window does not cover visible items");
  }
  const tasks = sortHistoryItems(value.tasks.map((item) => projectTaskHistoryItem(item as unknown as AgentContextPackJsonValue)));
  const runs = sortHistoryItems(value.runs.map((item) => projectRunHistoryItem(item as unknown as AgentContextPackJsonValue)));
  const modelInvocations = sortHistoryItems(value.modelInvocations.map((item) => projectModelInvocationHistoryItem(item as unknown as AgentContextPackJsonValue)));
  const toolRequests = sortHistoryItems(value.toolRequests.map((item) => projectToolRequestHistoryItem(item as unknown as AgentContextPackJsonValue)));
  const visibleItemCount = tasks.length + runs.length + modelInvocations.length + toolRequests.length;
  if (visibleItemCount === 0 && (callerSourceEventIds.length !== 0 || callerArtifactHashes.length !== 0)) {
    throw new Error("blocked.projection-source-mismatch: empty task/run history must not retain item provenance");
  }
  if (visibleItemCount > window.limit || window.totalCount < visibleItemCount || (window.hasMore && window.totalCount <= visibleItemCount)) {
    throw new Error("blocked.unbounded-source: task/run history window does not cover visible items");
  }
  assertHistoryAggregateCountsCoverVisibleItems(
    aggregateCounts as unknown as { readonly [key: string]: AgentContextPackJsonValue },
    { tasks, runs, modelInvocations, toolRequests } as unknown as { readonly [key: string]: AgentContextPackJsonValue },
    visibleItemCount,
    "task-run-history.v1"
  );
  assertHistoryIdentityAndLinks(tasks, runs, modelInvocations, toolRequests);
  assertHistoryItemsHaveProvenance([...tasks, ...runs, ...modelInvocations, ...toolRequests]);
  const normalized = {
    projectionHighWaterMark: value.projectionHighWaterMark,
    projectionSourceRef: value.projectionSourceRef,
    tasks,
    runs,
    modelInvocations,
    toolRequests,
    aggregateCounts,
    sourceEventIds: [],
    artifactHashes: [],
    window,
    ...(emptyProof === undefined ? {} : { emptyProof })
  };
  return closeHistoryProvenance(normalized);
}

function normalizeWindow(value: OperationalBoundedWindow): OperationalBoundedWindow {
  assertPlainDataObject(value, "task/run history window", ["order", "limit", "cursor", "hasMore", "totalCount", "omissionCodes"]);
  assertSafeOperationalText(value.order, "window order");
  if (!Number.isInteger(value.limit) || value.limit <= 0 || typeof value.hasMore !== "boolean" ||
    !Number.isInteger(value.totalCount) || value.totalCount < 0) {
    throw new Error("blocked.unbounded-source: task/run history requires bounded deterministic window metadata");
  }
  if (value.cursor !== undefined) assertSafeOperationalText(value.cursor, "window cursor");
  return { order: value.order, limit: value.limit, ...(value.cursor === undefined ? {} : { cursor: value.cursor }), hasMore: value.hasMore, totalCount: value.totalCount, omissionCodes: normalizeOmissionCodes(value.omissionCodes) };
}

function normalizeEmptyProof(value: OperationalEmptyProjectionProof): OperationalEmptyProjectionProof {
  assertPlainDataObject(value, "empty projection proof", ["projectionName", "scope", "projectionHighWaterMark", "sourceEventCount", "generatedAt", "emptyReasonCode"]);
  assertSafeOperationalText(value.projectionName, "empty proof projection name");
  assertSafeScope(value.scope);
  assertUtcTimestamp(value.generatedAt, "empty proof generatedAt");
  assertMachineReadableOperationalToken(value.emptyReasonCode, "empty proof reason");
  if (!Number.isInteger(value.projectionHighWaterMark) || value.projectionHighWaterMark < 0 || !Number.isInteger(value.sourceEventCount) || value.sourceEventCount < 0) {
    throw new Error("blocked.projection-source-mismatch: empty proof has invalid counts");
  }
  return { ...value };
}

function assertEmptyHistoryProof(
  proof: OperationalEmptyProjectionProof | undefined,
  input: BuildTaskRunHistoryContextPackInput,
  snapshot: OperationalTaskRunHistorySnapshot
): OperationalEmptyProjectionProof {
  if (proof === undefined) throw new Error("blocked.missing-empty-proof: empty task/run history requires proof");
  if (proof.projectionName !== "agent.projection.task-run-history" || proof.scope.kind !== input.scope.kind || proof.scope.id !== input.scope.id ||
    proof.projectionHighWaterMark !== input.projectionHighWaterMark || proof.generatedAt !== input.generatedAt || proof.sourceEventCount !== 0 ||
    snapshot.sourceEventIds.length !== 0 || snapshot.artifactHashes.length !== 0 || snapshot.window.totalCount !== 0 || snapshot.window.hasMore ||
    Object.values(snapshot.aggregateCounts).some((count) => count !== 0)) {
    throw new Error("blocked.projection-source-mismatch: empty proof does not match task/run history snapshot");
  }
  return proof;
}

function trimQuietHistory(snapshot: OperationalTaskRunHistorySnapshot): OperationalTaskRunHistorySnapshot | undefined {
  const groups = ["tasks", "runs", "modelInvocations", "toolRequests"] as const;
  const candidates = groups.flatMap((group) => snapshot[group].map((item, index) => ({ group, item, index })));
  const safetyCount = candidates.filter(({ item }) => historyStatePriority(itemState(item)) === 0).length;
  const removable = candidates.filter(({ item }) =>
    historyStatePriority(itemState(item)) !== 0 || safetyCount > 1
  ).sort((left, right) => {
    const byPriority = historyStatePriority(itemState(right.item)) - historyStatePriority(itemState(left.item));
    if (byPriority !== 0) return byPriority;
    const byTimestamp = historyItemTimestamp(left.item).localeCompare(historyItemTimestamp(right.item));
    if (byTimestamp !== 0) return byTimestamp;
    return stableJsonText(left.item as unknown as AgentContextPackJsonValue)
      .localeCompare(stableJsonText(right.item as unknown as AgentContextPackJsonValue));
  });
  const removed = removable[0];
  if (removed === undefined) return undefined;
  const nextItems = snapshot[removed.group].filter((_, index) => index !== removed.index);
  const windowOmissions = uniqueOmissionCodes([...snapshot.window.omissionCodes, "omitted.size-budget"]);
  return closeHistoryProvenance({
    ...snapshot,
    [removed.group]: nextItems,
    window: { ...snapshot.window, omissionCodes: windowOmissions }
  });
}

function historyItemCount(snapshot: OperationalTaskRunHistorySnapshot): number {
  return snapshot.tasks.length + snapshot.runs.length + snapshot.modelInvocations.length + snapshot.toolRequests.length;
}

function sortHistoryItems<T>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => {
    const priority = historyStatePriority(itemState(left)) - historyStatePriority(itemState(right));
    return priority === 0
      ? stableJsonText(left as unknown as AgentContextPackJsonValue).localeCompare(stableJsonText(right as unknown as AgentContextPackJsonValue))
      : priority;
  });
}

function sortJsonItems(items: readonly AgentContextPackJsonValue[]): readonly AgentContextPackJsonValue[] {
  return [...items].sort((left, right) => stableJsonText(left).localeCompare(stableJsonText(right)));
}

function itemState(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const item = value as { readonly state?: unknown; readonly status?: unknown };
  if (typeof item.status === "string") return item.status;
  return typeof item.state === "string" ? item.state : undefined;
}

function historyStatePriority(state: string | undefined): number {
  if (state === "failed" || state === "blocked" || state === "denied" || state === "waiting-for-approval") return 0;
  if (state === "executing" || state === "approved" || state === "requested" || state === "queued" || state === "running") return 1;
  if (state === "completed") return 2;
  return 1;
}

function historyItemTimestamp(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const item = value as Record<string, unknown>;
  for (const key of ["updatedAt", "failedAt", "deniedAt", "completedAt", "executionClaimedAt", "approvedAt", "requestedAt", "startedAt", "createdAt"] as const) {
    if (typeof item[key] === "string") return item[key];
  }
  return "";
}

function normalizeEventIds(value: readonly string[]): readonly string[] {
  assertPlainDataArray(value, "source event IDs");
  for (const eventId of value) {
    if (typeof eventId !== "string" || !/^evt_[a-zA-Z0-9_-]+$/.test(eventId)) throw new Error("blocked.invalid-payload-shape: invalid source event ID");
    assertSafeOperationalText(eventId, "source event ID");
  }
  return uniqueStrings(value);
}

function normalizeArtifactHashes(value: readonly string[]): readonly string[] {
  assertPlainDataArray(value, "artifact hashes");
  for (const hash of value) {
    if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error("blocked.invalid-payload-shape: invalid artifact hash");
  }
  return uniqueStrings(value);
}

function normalizeOmissionCodes(value: readonly OperationalContextPackOmissionCode[]): readonly OperationalContextPackOmissionCode[] {
  assertPlainDataArray(value, "omission codes");
  for (const code of value) if (typeof code !== "string" || !isOperationalOmissionCode(code)) throw new Error("blocked.invalid-payload-shape: invalid omission code");
  return uniqueOmissionCodes(value);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function uniqueOmissionCodes(values: readonly OperationalContextPackOmissionCode[]): readonly OperationalContextPackOmissionCode[] {
  return [...new Set(values)].sort() as readonly OperationalContextPackOmissionCode[];
}

function stableJsonText(value: AgentContextPackJsonValue): string {
  return Buffer.from(serializeContextPackPayload(value)).toString("utf8");
}

function diagnosticIds(value: AgentContextPackJsonValue): readonly string[] {
  if (!isOperationalJsonObject(value)) return [];
  const diagnosticId = value.diagnosticId;
  return typeof diagnosticId === "string" && /^diag_[a-zA-Z0-9_-]+$/.test(diagnosticId) ? [diagnosticId] : [];
}

function projectRuntimeProviderState(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  const provider = assertStrictOperationalObject(value, "provider state", ["providerId", "state", "category"]);
  return {
    providerId: requiredSafeIdentifier(provider, "providerId", "provider state"),
    state: requiredSafeProviderState(provider, "state"),
    ...(provider.category === undefined ? {} : { category: requiredSafeOperationalField(provider, "category", "provider state") })
  };
}

function projectRuntimeDiagnostic(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  const diagnostic = assertStrictOperationalObject(value, "diagnostic", ["diagnosticId", "category"]);
  return {
    diagnosticId: requiredSafeIdentifier(diagnostic, "diagnosticId", "diagnostic", "diag_"),
    category: requiredSafeOperationalField(diagnostic, "category", "diagnostic")
  };
}

function projectTaskHistoryItem(value: AgentContextPackJsonValue): OperationalTaskSummaryDto {
  const item = assertStrictOperationalObject(value, "task", [
    "taskId", "status", "priority", "createdAt", "updatedAt", "residentAgentId", "requestedBy", "runId",
    "statusReasonCode", "sourceEventIds", "inputArtifactHashes"
  ]);
  return {
    taskId: requiredSafeIdentifier(item, "taskId", "task"),
    status: requiredEnum(item, "status", taskStatuses, "task") as OperationalTaskSummaryStatus,
    ...optionalEnumProperty(item, "priority", taskPriorities, "task"),
    ...optionalTimestampProperty(item, "createdAt", "task"),
    ...optionalTimestampProperty(item, "updatedAt", "task"),
    ...optionalIdentifierProperty(item, "residentAgentId", "task"),
    ...optionalIdentifierProperty(item, "requestedBy", "task"),
    ...optionalIdentifierProperty(item, "runId", "task"),
    ...optionalTokenProperty(item, "statusReasonCode", "task"),
    ...optionalEventIdsProperty(item, "sourceEventIds"),
    ...optionalArtifactHashesProperty(item, "inputArtifactHashes")
  };
}

function projectRunHistoryItem(value: AgentContextPackJsonValue): OperationalRunSummaryDto {
  const item = assertStrictOperationalObject(value, "run", [
    "runId", "state", "runType", "residentAgentId", "startedBy", "startedAt", "completedAt", "failedAt",
    "taskId", "workspaceId", "investigationId", "sourceEventIds", "inputArtifactHashes", "relatedEventIds",
    "outputArtifactHashes", "stepCount", "invocationIds", "toolRequestIds", "failureCategory", "retryable",
    "allowedActions", "summaryCode"
  ]);
  const projected: OperationalRunSummaryDto = {
    runId: requiredSafeIdentifier(item, "runId", "run"),
    state: requiredEnum(item, "state", runStates, "run") as AgentRunState,
    ...optionalEnumProperty(item, "runType", specialistRunTypes, "run"),
    ...optionalIdentifierProperty(item, "residentAgentId", "run"),
    ...optionalIdentifierProperty(item, "startedBy", "run"),
    ...optionalTimestampProperty(item, "startedAt", "run"),
    ...optionalTimestampProperty(item, "completedAt", "run"),
    ...optionalTimestampProperty(item, "failedAt", "run"),
    ...optionalIdentifierProperty(item, "taskId", "run"),
    ...optionalIdentifierProperty(item, "workspaceId", "run"),
    ...optionalIdentifierProperty(item, "investigationId", "run"),
    ...optionalEventIdsProperty(item, "sourceEventIds"),
    ...optionalArtifactHashesProperty(item, "inputArtifactHashes"),
    ...optionalEventIdsProperty(item, "relatedEventIds"),
    ...optionalArtifactHashesProperty(item, "outputArtifactHashes"),
    ...optionalNonnegativeIntegerProperty(item, "stepCount", "run"),
    ...optionalIdentifierArrayProperty(item, "invocationIds", "run"),
    ...optionalIdentifierArrayProperty(item, "toolRequestIds", "run"),
    ...optionalEnumProperty(item, "failureCategory", failureCategories, "run"),
    ...optionalBooleanProperty(item, "retryable", "run"),
    ...optionalTokenArrayProperty(item, "allowedActions", "run"),
    ...optionalTokenProperty(item, "summaryCode", "run")
  };
  assertRunLifecycle(projected);
  return projected;
}

function projectModelInvocationHistoryItem(value: AgentContextPackJsonValue): OperationalModelInvocationSummaryDto {
  const item = assertStrictOperationalObject(value, "model invocation", [
    "invocationId", "status", "runId", "providerId", "modelFamily", "safetyClass", "requestedAt", "completedAt",
    "inputArtifactHash", "providerOutputArtifactHash", "promptTemplateId", "promptTemplateVersion", "runType",
    "contextPackRefs", "omissionCount", "transferApprovalClass", "usage", "failureCategory", "retryable",
    "allowedActions", "sourceEventIds"
  ]);
  const projected: OperationalModelInvocationSummaryDto = {
    invocationId: requiredSafeIdentifier(item, "invocationId", "model invocation"),
    status: requiredEnum(item, "status", modelInvocationStatuses, "model invocation") as AgentModelInvocationStatus,
    ...optionalIdentifierProperty(item, "runId", "model invocation"),
    ...optionalIdentifierProperty(item, "providerId", "model invocation"),
    ...optionalIdentifierProperty(item, "modelFamily", "model invocation"),
    ...optionalEnumProperty(item, "safetyClass", new Set(["workspace-safe", "public-safe", "sensitive-local-only", "provider-approved"]), "model invocation"),
    ...optionalTimestampProperty(item, "requestedAt", "model invocation"),
    ...optionalTimestampProperty(item, "completedAt", "model invocation"),
    ...optionalArtifactHashProperty(item, "inputArtifactHash", "model invocation"),
    ...optionalArtifactHashProperty(item, "providerOutputArtifactHash", "model invocation"),
    ...optionalIdentifierProperty(item, "promptTemplateId", "model invocation"),
    ...optionalPositiveIntegerProperty(item, "promptTemplateVersion", "model invocation"),
    ...optionalEnumProperty(item, "runType", specialistRunTypes, "model invocation"),
    ...optionalContextPackRefsProperty(item),
    ...optionalNonnegativeIntegerProperty(item, "omissionCount", "model invocation"),
    ...optionalEnumProperty(item, "transferApprovalClass", new Set(["none", "provider-byte-transfer"]), "model invocation"),
    ...optionalUsageProperty(item),
    ...optionalEnumProperty(item, "failureCategory", failureCategories, "model invocation"),
    ...optionalBooleanProperty(item, "retryable", "model invocation"),
    ...optionalTokenArrayProperty(item, "allowedActions", "model invocation"),
    ...optionalEventIdsProperty(item, "sourceEventIds")
  };
  assertModelInvocationLifecycle(projected);
  return projected;
}

function projectToolRequestHistoryItem(value: AgentContextPackJsonValue): OperationalToolRequestSummaryDto {
  const item = assertStrictOperationalObject(value, "tool request", [
    "toolRequestId", "state", "runId", "toolId", "toolVersion", "requestedBy", "sideEffectClass",
    "requiredApprovalClass", "previewHash", "scope", "requestedAt", "sourceEventIds", "inputArtifactHashes",
    "approvedBy", "approvedPreviewHash", "approvalClass", "approvedAt", "executionClaimedBy", "executionClaimedAt",
    "executionLeaseExpiresAt", "executionApprovedPreviewHash", "executionClaimEventId", "deniedBy", "deniedAt",
    "completedAt", "resultEventIds", "artifactHashes", "readModelChanges", "failedAt", "failureCategory",
    "retryable", "allowedActions"
  ]);
  const projected: OperationalToolRequestSummaryDto = {
    toolRequestId: requiredSafeIdentifier(item, "toolRequestId", "tool request"),
    state: requiredEnum(item, "state", toolRequestStates, "tool request") as AgentToolRequestState,
    ...optionalIdentifierProperty(item, "runId", "tool request"),
    ...optionalIdentifierProperty(item, "toolId", "tool request"),
    ...optionalIdentifierProperty(item, "toolVersion", "tool request"),
    ...optionalIdentifierProperty(item, "requestedBy", "tool request"),
    ...optionalEnumProperty(item, "sideEffectClass", toolSideEffectClasses, "tool request"),
    ...optionalEnumProperty(item, "requiredApprovalClass", toolApprovalClasses, "tool request"),
    ...optionalArtifactHashProperty(item, "previewHash", "tool request"),
    ...optionalTokenProperty(item, "scope", "tool request"),
    ...optionalTimestampProperty(item, "requestedAt", "tool request"),
    ...optionalEventIdsProperty(item, "sourceEventIds"),
    ...optionalArtifactHashesProperty(item, "inputArtifactHashes"),
    ...optionalIdentifierProperty(item, "approvedBy", "tool request"),
    ...optionalArtifactHashProperty(item, "approvedPreviewHash", "tool request"),
    ...optionalEnumProperty(item, "approvalClass", toolApprovalClasses, "tool request"),
    ...optionalTimestampProperty(item, "approvedAt", "tool request"),
    ...optionalIdentifierProperty(item, "executionClaimedBy", "tool request"),
    ...optionalTimestampProperty(item, "executionClaimedAt", "tool request"),
    ...optionalTimestampProperty(item, "executionLeaseExpiresAt", "tool request"),
    ...optionalArtifactHashProperty(item, "executionApprovedPreviewHash", "tool request"),
    ...optionalEventIdProperty(item, "executionClaimEventId", "tool request"),
    ...optionalIdentifierProperty(item, "deniedBy", "tool request"),
    ...optionalTimestampProperty(item, "deniedAt", "tool request"),
    ...optionalTimestampProperty(item, "completedAt", "tool request"),
    ...optionalEventIdsProperty(item, "resultEventIds"),
    ...optionalArtifactHashesProperty(item, "artifactHashes"),
    ...optionalReadModelChangesProperty(item),
    ...optionalTimestampProperty(item, "failedAt", "tool request"),
    ...optionalEnumProperty(item, "failureCategory", failureCategories, "tool request"),
    ...optionalBooleanProperty(item, "retryable", "tool request"),
    ...optionalTokenArrayProperty(item, "allowedActions", "tool request")
  };
  assertToolRequestLifecycle(projected);
  return projected;
}

function assertRunLifecycle(run: OperationalRunSummaryDto): void {
  if (run.state === "completed" && (run.completedAt === undefined || run.failedAt !== undefined ||
    run.failureCategory !== undefined || run.retryable !== undefined || run.allowedActions !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: completed run lifecycle is inconsistent");
  }
  if (run.state === "failed" && (run.failedAt === undefined || run.failureCategory === undefined ||
    run.completedAt !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: failed run lifecycle is inconsistent");
  }
  if (run.state === "running" && (run.completedAt !== undefined || run.failedAt !== undefined ||
    run.failureCategory !== undefined || run.retryable !== undefined || run.allowedActions !== undefined ||
    run.outputArtifactHashes !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: running run lifecycle is inconsistent");
  }
}

function assertModelInvocationLifecycle(invocation: OperationalModelInvocationSummaryDto): void {
  if (invocation.status === "completed" && (invocation.runId === undefined || invocation.providerId === undefined ||
    invocation.modelFamily === undefined || invocation.inputArtifactHash === undefined ||
    invocation.providerOutputArtifactHash === undefined || invocation.completedAt === undefined ||
    invocation.failureCategory !== undefined || invocation.retryable !== undefined || invocation.allowedActions !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: completed model invocation lifecycle is incomplete");
  }
  if (invocation.status === "failed" && (invocation.runId === undefined || invocation.inputArtifactHash === undefined ||
    invocation.failureCategory === undefined || invocation.completedAt !== undefined ||
    invocation.providerOutputArtifactHash !== undefined || invocation.usage !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: failed model invocation lifecycle is incomplete");
  }
  if (invocation.status === "requested" && (invocation.runId === undefined || invocation.inputArtifactHash === undefined ||
    invocation.requestedAt === undefined || invocation.completedAt !== undefined || invocation.providerOutputArtifactHash !== undefined ||
    invocation.failureCategory !== undefined || invocation.retryable !== undefined || invocation.allowedActions !== undefined ||
    invocation.usage !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: requested model invocation lifecycle is inconsistent");
  }
}

function assertToolRequestLifecycle(tool: OperationalToolRequestSummaryDto): void {
  const approvalFields = [tool.approvedBy, tool.approvedPreviewHash, tool.approvalClass, tool.approvedAt];
  const executionFields = [tool.executionClaimedBy, tool.executionClaimedAt, tool.executionLeaseExpiresAt,
    tool.executionApprovedPreviewHash, tool.executionClaimEventId];
  const hasResult = (tool.resultEventIds?.length ?? 0) + (tool.artifactHashes?.length ?? 0) +
    (tool.readModelChanges?.length ?? 0) > 0;
  const terminalFields = [tool.deniedBy, tool.deniedAt, tool.completedAt, tool.failedAt, tool.failureCategory,
    tool.retryable, hasResult ? true : undefined];
  if (["approved", "executing", "completed", "failed"].includes(tool.state) && approvalFields.some((field) => field === undefined)) {
    throw new Error("blocked.invalid-payload-shape: tool request approval lifecycle is incomplete");
  }
  if (tool.state === "executing" && [tool.executionClaimedBy, tool.executionClaimedAt,
    tool.executionLeaseExpiresAt, tool.executionClaimEventId].some((field) => field === undefined)) {
    throw new Error("blocked.invalid-payload-shape: executing tool request claim is incomplete");
  }
  if (tool.state === "completed" && (tool.completedAt === undefined || !hasResult)) {
    throw new Error("blocked.invalid-payload-shape: completed tool request result is incomplete");
  }
  if (tool.state === "failed" && (tool.failedAt === undefined || tool.failureCategory === undefined)) {
    throw new Error("blocked.invalid-payload-shape: failed tool request lifecycle is incomplete");
  }
  if (tool.state === "approved" && [...executionFields, ...terminalFields].some((field) => field !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: approved tool request lifecycle is inconsistent");
  }
  if (tool.state === "executing" && terminalFields.some((field) => field !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: executing tool request lifecycle is inconsistent");
  }
  if (tool.state === "completed" && (tool.deniedBy !== undefined || tool.deniedAt !== undefined ||
    tool.failedAt !== undefined || tool.failureCategory !== undefined || tool.retryable !== undefined || tool.allowedActions !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: completed tool request lifecycle is inconsistent");
  }
  if (tool.state === "failed" && (tool.deniedBy !== undefined || tool.deniedAt !== undefined ||
    tool.completedAt !== undefined || hasResult)) {
    throw new Error("blocked.invalid-payload-shape: failed tool request lifecycle is inconsistent");
  }
  if (tool.state === "denied" && (tool.deniedBy === undefined || tool.deniedAt === undefined ||
    approvalFields.some((field) => field !== undefined) || executionFields.some((field) => field !== undefined) ||
    tool.completedAt !== undefined || tool.failedAt !== undefined || tool.failureCategory !== undefined ||
    tool.retryable !== undefined || tool.allowedActions !== undefined || hasResult)) {
    throw new Error("blocked.invalid-payload-shape: denied tool request lifecycle is inconsistent");
  }
  if (tool.state === "requested" && [...approvalFields, ...executionFields, ...terminalFields].some((field) => field !== undefined)) {
    throw new Error("blocked.invalid-payload-shape: requested tool request lifecycle is inconsistent");
  }
}

function requiredEnum(
  value: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<string>,
  label: string
): string {
  const field = value[key];
  if (typeof field !== "string" || !allowed.has(field)) {
    throw new Error(`blocked.invalid-payload-shape: ${label} ${key} is invalid`);
  }
  return field;
}

function optionalEnumProperty(
  value: Record<string, unknown>, key: string, allowed: ReadonlySet<string>, label: string
): Record<string, string> {
  return value[key] === undefined ? {} : { [key]: requiredEnum(value, key, allowed, label) };
}

function optionalIdentifierProperty(value: Record<string, unknown>, key: string, label: string): Record<string, string> {
  return value[key] === undefined ? {} : { [key]: requiredSafeIdentifier(value, key, label) };
}

function optionalTokenProperty(value: Record<string, unknown>, key: string, label: string): Record<string, string> {
  return value[key] === undefined ? {} : { [key]: requiredSafeOperationalField(value, key, label) };
}

function optionalTimestampProperty(value: Record<string, unknown>, key: string, label: string): Record<string, string> {
  if (value[key] === undefined) return {};
  assertUtcTimestamp(value[key], `${label} ${key}`);
  return { [key]: value[key] as string };
}

function optionalBooleanProperty(value: Record<string, unknown>, key: string, label: string): Record<string, boolean> {
  if (value[key] === undefined) return {};
  if (typeof value[key] !== "boolean") throw new Error(`blocked.invalid-payload-shape: ${label} ${key} must be boolean`);
  return { [key]: value[key] as boolean };
}

function optionalNonnegativeIntegerProperty(value: Record<string, unknown>, key: string, label: string): Record<string, number> {
  if (value[key] === undefined) return {};
  if (!Number.isInteger(value[key]) || (value[key] as number) < 0) {
    throw new Error(`blocked.invalid-payload-shape: ${label} ${key} must be a nonnegative integer`);
  }
  return { [key]: value[key] as number };
}

function optionalPositiveIntegerProperty(value: Record<string, unknown>, key: string, label: string): Record<string, number> {
  if (value[key] === undefined) return {};
  if (!Number.isInteger(value[key]) || (value[key] as number) <= 0) {
    throw new Error(`blocked.invalid-payload-shape: ${label} ${key} must be a positive integer`);
  }
  return { [key]: value[key] as number };
}

function optionalEventIdsProperty(value: Record<string, unknown>, key: string): Record<string, readonly string[]> {
  return value[key] === undefined ? {} : { [key]: normalizeEventIds(value[key] as readonly string[]) };
}

function optionalEventIdProperty(value: Record<string, unknown>, key: string, label: string): Record<string, string> {
  if (value[key] === undefined) return {};
  const normalized = normalizeEventIds([value[key] as string]);
  if (normalized.length !== 1) throw new Error(`blocked.invalid-payload-shape: ${label} ${key} is invalid`);
  return { [key]: normalized[0]! };
}

function optionalArtifactHashesProperty(value: Record<string, unknown>, key: string): Record<string, readonly string[]> {
  return value[key] === undefined ? {} : { [key]: normalizeArtifactHashes(value[key] as readonly string[]) };
}

function optionalArtifactHashProperty(value: Record<string, unknown>, key: string, label: string): Record<string, string> {
  if (value[key] === undefined) return {};
  const normalized = normalizeArtifactHashes([value[key] as string]);
  if (normalized.length !== 1) throw new Error(`blocked.invalid-payload-shape: ${label} ${key} is invalid`);
  return { [key]: normalized[0]! };
}

function optionalIdentifierArrayProperty(value: Record<string, unknown>, key: string, label: string): Record<string, readonly string[]> {
  if (value[key] === undefined) return {};
  assertPlainDataArray(value[key], `${label} ${key}`);
  const normalized = (value[key] as readonly unknown[]).map((entry) => {
    if (typeof entry !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry)) {
      throw new Error(`blocked.invalid-payload-shape: ${label} ${key} contains an invalid identifier`);
    }
    assertSafeOperationalText(entry, `${label} ${key}`);
    return entry;
  });
  return { [key]: uniqueStrings(normalized) };
}

function optionalTokenArrayProperty(value: Record<string, unknown>, key: string, label: string): Record<string, readonly string[]> {
  if (value[key] === undefined) return {};
  assertPlainDataArray(value[key], `${label} ${key}`);
  const normalized = (value[key] as readonly unknown[]).map((entry) => {
    assertMachineReadableOperationalToken(entry, `${label} ${key}`);
    return entry;
  });
  return { [key]: uniqueStrings(normalized) };
}

function optionalUsageProperty(value: Record<string, unknown>): Record<string, OperationalModelInvocationUsageDto> {
  if (value.usage === undefined) return {};
  assertPlainDataObject(value.usage, "model invocation usage", ["inputTokens", "outputTokens", "totalTokens"]);
  const usage = value.usage as Record<string, unknown>;
  const normalized = {
    ...optionalNonnegativeIntegerProperty(usage, "inputTokens", "model invocation usage"),
    ...optionalNonnegativeIntegerProperty(usage, "outputTokens", "model invocation usage"),
    ...optionalNonnegativeIntegerProperty(usage, "totalTokens", "model invocation usage")
  };
  return { usage: normalized };
}

function optionalContextPackRefsProperty(value: Record<string, unknown>): Record<string, readonly OperationalContextPackLinkDto[]> {
  if (value.contextPackRefs === undefined) return {};
  assertPlainDataArray(value.contextPackRefs, "model invocation contextPackRefs");
  const contextPackRefs = (value.contextPackRefs as readonly unknown[]).map((entry) => {
    assertPlainDataObject(entry, "model invocation context pack ref", ["contextPackId", "version", "contentHash"]);
    const ref = entry as Record<string, unknown>;
    const contextPackId = requiredSafeIdentifier(ref, "contextPackId", "model invocation context pack ref");
    if (!Number.isInteger(ref.version) || (ref.version as number) <= 0) {
      throw new Error("blocked.invalid-payload-shape: model invocation context pack ref version is invalid");
    }
    const contentHash = normalizeArtifactHashes([ref.contentHash as string])[0]!;
    return { contextPackId, version: ref.version as number, contentHash };
  }).sort((left, right) => left.contextPackId.localeCompare(right.contextPackId) || left.version - right.version);
  return { contextPackRefs };
}

function optionalReadModelChangesProperty(value: Record<string, unknown>): Record<string, readonly OperationalToolReadModelChangeDto[]> {
  if (value.readModelChanges === undefined) return {};
  assertPlainDataArray(value.readModelChanges, "tool request readModelChanges");
  const readModelChanges = (value.readModelChanges as readonly unknown[]).map((entry) => {
    assertPlainDataObject(entry, "tool read-model change", ["projectionName", "change", "relatedIds"]);
    const change = entry as Record<string, unknown>;
    const projectionName = requiredSafeOperationalField(change, "projectionName", "tool read-model change");
    const changeCode = requiredSafeOperationalField(change, "change", "tool read-model change");
    return {
      projectionName,
      change: changeCode,
      ...optionalIdentifierArrayProperty(change, "relatedIds", "tool read-model change")
    };
  }).sort((left, right) => left.projectionName.localeCompare(right.projectionName) || left.change.localeCompare(right.change));
  return { readModelChanges };
}

function closeHistoryProvenance(snapshot: OperationalTaskRunHistorySnapshot): OperationalTaskRunHistorySnapshot {
  const provenance = historyProvenance([
    ...snapshot.tasks,
    ...snapshot.runs,
    ...snapshot.modelInvocations,
    ...snapshot.toolRequests
  ]);
  return { ...snapshot, sourceEventIds: provenance.sourceEventIds, artifactHashes: provenance.artifactHashes };
}

function assertHistoryIdentityAndLinks(
  tasks: readonly OperationalTaskSummaryDto[],
  runs: readonly OperationalRunSummaryDto[],
  modelInvocations: readonly OperationalModelInvocationSummaryDto[],
  toolRequests: readonly OperationalToolRequestSummaryDto[]
): void {
  assertUniqueHistoryIds(tasks, "taskId");
  assertUniqueHistoryIds(runs, "runId");
  assertUniqueHistoryIds(modelInvocations, "invocationId");
  assertUniqueHistoryIds(toolRequests, "toolRequestId");
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
  const runsById = new Map(runs.map((run) => [run.runId, run]));
  const invocationsById = new Map(modelInvocations.map((invocation) => [invocation.invocationId, invocation]));
  const toolsById = new Map(toolRequests.map((tool) => [tool.toolRequestId, tool]));

  if (runs.length > 0) {
    for (const task of tasks) {
      if (task.runId !== undefined) {
        const run = runsById.get(task.runId);
        if (run !== undefined && run.taskId !== undefined && run.taskId !== task.taskId) {
          throw new Error("blocked.projection-source-mismatch: task/run links are inconsistent");
        }
      }
    }
  }
  if (tasks.length > 0) {
    for (const run of runs) {
      const task = run.taskId === undefined ? undefined : tasksById.get(run.taskId);
      if (task !== undefined && task.runId !== undefined && task.runId !== run.runId) {
        throw new Error("blocked.projection-source-mismatch: run/task links are inconsistent");
      }
    }
  }
  for (const run of runs) {
    if (run.invocationIds?.some((id) => {
      const invocation = invocationsById.get(id);
      return invocation !== undefined && invocation.runId !== undefined && invocation.runId !== run.runId;
    })) {
      throw new Error("blocked.projection-source-mismatch: run/model links are inconsistent");
    }
    if (run.toolRequestIds?.some((id) => {
      const tool = toolsById.get(id);
      return tool !== undefined && tool.runId !== undefined && tool.runId !== run.runId;
    })) {
      throw new Error("blocked.projection-source-mismatch: run/tool links are inconsistent");
    }
  }
  for (const run of runs) {
    if (run.state === "running") continue;
    const linkedInvocationIds = new Set(run.invocationIds ?? []);
    const linkedToolIds = new Set(run.toolRequestIds ?? []);
    if (modelInvocations.some((invocation) => (invocation.runId === run.runId || linkedInvocationIds.has(invocation.invocationId)) &&
      invocation.status === "requested") ||
      toolRequests.some((tool) => (tool.runId === run.runId || linkedToolIds.has(tool.toolRequestId)) &&
        (tool.state === "requested" || tool.state === "executing"))) {
      throw new Error("blocked.projection-source-mismatch: terminal run has nonterminal linked work");
    }
  }
}

function operationalSourceMetadata(input: {
  readonly generatedAt: string;
  readonly policyVersion: string;
  readonly scope: ContextPackScope;
  readonly sizeBudgetBytes: number;
}, stalenessInputs: readonly ContextPackStalenessInput[]): OperationalContextPackSourceMetadata {
  return {
    generatedAt: input.generatedAt,
    policyVersion: input.policyVersion,
    scope: { kind: input.scope.kind, id: input.scope.id },
    sizeBudgetBytes: input.sizeBudgetBytes,
    stalenessInputs: stalenessInputs.map((entry) => ({ ...entry }))
  };
}

function assertUniqueHistoryIds(items: readonly object[], idKey: string): void {
  const ids = items.map((item) => (item as Record<string, unknown>)[idKey] as string);
  if (new Set(ids).size !== ids.length) {
    throw new Error("blocked.invalid-payload-shape: duplicate history entity ID");
  }
}

function assertHistoryItemsHaveProvenance(items: readonly unknown[]): void {
  for (const item of items) {
    const provenance = historyProvenance([item]);
    if (provenance.sourceEventIds.length === 0 && provenance.artifactHashes.length === 0) {
      throw new Error("blocked.missing-provenance: every history item requires a durable source");
    }
  }
}

function historyProvenance(items: readonly unknown[]): { readonly sourceEventIds: readonly string[]; readonly artifactHashes: readonly string[] } {
  const sourceEventIds: string[] = [];
  const artifactHashes: string[] = [];
  for (const item of items) {
    const record = item as Record<string, unknown>;
    for (const key of ["sourceEventIds", "relatedEventIds", "resultEventIds"] as const) {
      if (Array.isArray(record[key])) sourceEventIds.push(...record[key] as string[]);
    }
    if (typeof record.executionClaimEventId === "string") sourceEventIds.push(record.executionClaimEventId);
    for (const key of ["inputArtifactHashes", "outputArtifactHashes", "artifactHashes"] as const) {
      if (Array.isArray(record[key])) artifactHashes.push(...record[key] as string[]);
    }
    for (const key of ["inputArtifactHash", "providerOutputArtifactHash", "previewHash", "approvedPreviewHash", "executionApprovedPreviewHash"] as const) {
      if (typeof record[key] === "string") artifactHashes.push(record[key] as string);
    }
  }
  return { sourceEventIds: uniqueStrings(sourceEventIds), artifactHashes: uniqueStrings(artifactHashes) };
}

function assertHistoryProvenanceMatches(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  items: readonly unknown[],
  schemaVersion: OperationalContextPackId
): void {
  const expected = historyProvenance(items);
  assertExactStringArray(requiredJsonField(value, "sourceEventIds", schemaVersion), expected.sourceEventIds, schemaVersion);
  assertExactStringArray(requiredJsonField(value, "artifactHashes", schemaVersion), expected.artifactHashes, schemaVersion);
}

function assertMemoryProvenanceMatches(
  value: { readonly [key: string]: AgentContextPackJsonValue },
  items: readonly AgentContextPackJsonValue[],
  schemaVersion: OperationalContextPackId
): void {
  const sourceEventIds = uniqueStrings(items.flatMap((item) => (item as { sourceEventIds: readonly string[] }).sourceEventIds));
  const artifactHashes = uniqueStrings(items.flatMap((item) => (item as { artifactHashes: readonly string[] }).artifactHashes));
  assertExactStringArray(requiredJsonField(value, "sourceEventIds", schemaVersion), sourceEventIds, schemaVersion);
  assertExactStringArray(requiredJsonField(value, "artifactHashes", schemaVersion), artifactHashes, schemaVersion);
}

function assertExactStringArray(
  actual: AgentContextPackJsonValue,
  expected: readonly string[],
  schemaVersion: OperationalContextPackId
): void {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
}

function assertMemoryPayloadItem(value: AgentContextPackJsonValue, schemaVersion: OperationalContextPackId): void {
  const item = assertStrictOperationalObject(value, "memory item", [
    "memoryId",
    "scope",
    "memoryKind",
    "summary",
    "confidence",
    "sourceEventIds",
    "artifactHashes",
    "expiresAt"
  ]);
  requiredSafeIdentifier(item, "memoryId", "memory item");
  requiredEnum(item, "scope", memoryScopes, "memory item");
  requiredEnum(item, "memoryKind", memoryKinds, "memory item");
  const summary = item.summary;
  if (typeof summary !== "string" || summary.length === 0) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  assertSafeOperationalText(summary, "memory item summary");
  const confidence = item.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  normalizeEventIds(item.sourceEventIds as readonly string[]);
  const sourceEventIds = normalizeEventIds(item.sourceEventIds as readonly string[]);
  const artifactHashes = normalizeArtifactHashes(item.artifactHashes as readonly string[]);
  if (sourceEventIds.length === 0 && artifactHashes.length === 0) {
    throw new Error(`invalid ${schemaVersion} payload: missing provenance`);
  }
  if (item.expiresAt !== undefined) {
    assertUtcTimestamp(item.expiresAt, "memory item expiresAt");
  }
}

function assertStrictOperationalObject(
  value: AgentContextPackJsonValue,
  label: string,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  try {
    assertJsonObjectWithAllowedKeys(value, label, allowedKeys);
  } catch (error) {
    throw new Error(`blocked.invalid-payload-shape: ${error instanceof Error ? error.message : `${label} is invalid`}`);
  }
  return value;
}

function requiredSafeIdentifier(
  value: Record<string, unknown>,
  key: string,
  label: string,
  prefix?: string
): string {
  const field = value[key];
  if (typeof field !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(field) || (prefix !== undefined && !field.startsWith(prefix))) {
    throw new Error(`blocked.invalid-payload-shape: ${label} ${key} must be a safe identifier`);
  }
  assertSafeOperationalText(field, `${label} ${key}`);
  return field;
}

function requiredSafeProviderState(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !providerStates.has(field)) {
    throw new Error("blocked.invalid-payload-shape: provider state is invalid");
  }
  return field;
}

function requiredSafeOperationalField(value: Record<string, unknown>, key: string, label: string): string {
  const field = value[key];
  assertMachineReadableOperationalToken(field, `${label} ${key}`);
  return field;
}

function assertMachineReadableOperationalToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new Error(`blocked.invalid-payload-shape: ${label} must be a machine-readable token`);
  }
  assertSafeOperationalText(value, label);
}

function assertSafeOperationalText(value: unknown, label: string): asserts value is string {
  assertOperationalContextSafeText(value, label);
}

function buildWithBudget(input: Omit<BuildContextPackRefInput, "version">): ResolvedContextPack {
  return buildResolvedContextPack({ ...input, version: 1 });
}

function emptyProjectionProvenanceRef(proof: OperationalEmptyProjectionProof): string {
  return `empty-projection:${proof.projectionName}:${proof.scope.kind}:${proof.scope.id}:hwm:${proof.projectionHighWaterMark}`;
}
