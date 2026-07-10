import type {
  AgentContextPackJsonValue,
  BuildContextPackRefInput,
  ContextPackDescriptor,
  ContextPackPayloadParser,
  ContextPackRef,
  ContextPackRegistry,
  ContextPackScope,
  ResolvedContextPack
} from "./context-packs.js";
import { buildResolvedContextPack, serializeContextPackPayload } from "./context-packs.js";
import {
  buildAgentMemorySummaryResolvedContextPack,
  type BuildAgentMemorySummaryContextPackInput
} from "./memory.js";
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

export interface OperationalTaskRunHistorySnapshot {
  readonly projectionHighWaterMark: number;
  readonly projectionSourceRef: string;
  readonly tasks: readonly AgentContextPackJsonValue[];
  readonly runs: readonly AgentContextPackJsonValue[];
  readonly modelInvocations: readonly AgentContextPackJsonValue[];
  readonly toolRequests: readonly AgentContextPackJsonValue[];
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

const historyStates = new Set([
  "completed", "blocked", "denied", "failed", "executing", "approved", "requested", "queued", "running", "pending"
]);

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
  const provenanceRefs = uniqueStrings([
    operationalSourceProof("workspace-runtime-status.v1", "event"),
    ...runtime.diagnostics.flatMap((diagnostic) => diagnosticIds(diagnostic)),
    `runtime.status:hwm:${runtime.runtimeHighWaterMark}`
  ]);
  return buildWithBudget({
    contextPackId: "workspace-runtime-status.v1",
    generatedAt: input.generatedAt,
    payload: { schemaVersion: "workspace-runtime-status.v1", runtime },
    safeSummary: `Workspace runtime status at high-water mark ${runtime.runtimeHighWaterMark}.`,
    provenanceRefs,
    projectionHighWaterMark: input.projectionHighWaterMark,
    policyVersion: input.policyVersion,
    scope: input.scope,
    sizeBudgetBytes: input.sizeBudgetBytes,
    stalenessInputs: [
      { kind: "projection-high-water-mark", ref: "runtime.status", value: String(input.projectionHighWaterMark) },
      ...runtime.omissionCodes.map((code) => ({ kind: "omission-code", ref: "runtime.status", value: code }))
    ]
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
  while (true) {
    const provenanceRefs = emptyProof === undefined
      ? uniqueStrings([operationalSourceProof("task-run-history.v1", "event"), ...candidate.sourceEventIds, ...candidate.artifactHashes])
      : [operationalSourceProof("task-run-history.v1", "empty-projection"), emptyProjectionProvenanceRef(emptyProof)];
    const payload = {
      schemaVersion: "task-run-history.v1" as const,
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
        stalenessInputs: [{ kind: "projection-high-water-mark", ref: candidate.projectionSourceRef, value: String(input.projectionHighWaterMark) }]
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
  const metadata = operationalProviderMetadata(provider);
  const registrationKey = operationalContextPackProviderRegistrationKey(metadata);
  assertOperationalProviderCapabilities(provider);
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
      registry.register(operationalContextPackBuilder(descriptor, provider));
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
  const metadata = operationalProviderMetadata(provider);
  assertOperationalContextPackProviderMetadata(metadata);
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
  assertOperationalProviderCapabilities(provider);
  const [runtimeSource, taskRunHistorySnapshot, agentMemorySnapshot] = await Promise.all([
    provider.workspaceRuntimeStatus(), provider.taskRunHistorySnapshot(), provider.agentMemorySnapshot()
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
  provider: OperationalContextPackProvider
): { readonly descriptor: ContextPackDescriptor; readonly parsePayload: ContextPackPayloadParser; build(): Promise<ResolvedContextPack> } {
  const contextPackId = descriptor.contextPackId as OperationalContextPackId;
  return Object.freeze({
    descriptor,
    parsePayload: operationalContextPackPayloadParsers[`${contextPackId}@1`],
    async build(): Promise<ResolvedContextPack> {
      const metadata = operationalProviderMetadata(provider);
      assertOperationalContextPackProviderMetadata(metadata);
      if (contextPackId === "workspace-runtime-status.v1") {
        const runtimeSource = await provider.workspaceRuntimeStatus();
        return buildWorkspaceRuntimeStatusContextPack({
          generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
          projectionHighWaterMark: runtimeSource.runtimeHighWaterMark,
          sizeBudgetBytes: metadata.sizeBudgets.workspaceRuntimeStatus, runtimeSource
        });
      }
      if (contextPackId === "task-run-history.v1") {
        const taskRunHistorySnapshot = await provider.taskRunHistorySnapshot();
        return buildTaskRunHistoryContextPack({
          generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
          projectionHighWaterMark: taskRunHistorySnapshot.projectionHighWaterMark,
          sizeBudgetBytes: metadata.sizeBudgets.taskRunHistory, taskRunHistorySnapshot
        });
      }
      const memorySnapshot = await provider.agentMemorySnapshot();
      return buildOperationalAgentMemorySummaryContextPack({
        generatedAt: metadata.generatedAt, policyVersion: metadata.policyVersion, scope: metadata.scope,
        projectionHighWaterMark: memorySnapshot.projectionHighWaterMark,
        sizeBudgetBytes: metadata.sizeBudgets.agentMemorySummary, memorySnapshot
      });
    }
  });
}

function operationalProviderMetadata(provider: OperationalContextPackProvider): OperationalContextPackProviderMetadata {
  return {
    providerId: provider.providerId,
    capabilities: provider.capabilities,
    policyVersion: provider.policyVersion,
    generatedAt: provider.generatedAt,
    scope: provider.scope,
    sizeBudgets: provider.sizeBudgets
  };
}

function assertOperationalProviderCapabilities(provider: OperationalContextPackProvider): void {
  if (typeof provider.workspaceRuntimeStatus !== "function" || typeof provider.taskRunHistorySnapshot !== "function" ||
    typeof provider.agentMemorySnapshot !== "function") {
    throw new Error("blocked.missing-capability: operational provider lacks a required bounded source method");
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
  return (payload) => {
    assertOperationalPayloadEnvelope(payload, schemaVersion, requiredSection);
    if (schemaVersion === "workspace-runtime-status.v1") {
      assertWorkspaceRuntimePayloadSection(requiredJsonField(payload, "runtime", schemaVersion), schemaVersion);
    } else if (schemaVersion === "task-run-history.v1") {
      assertTaskRunHistoryPayloadSection(requiredJsonField(payload, "history", schemaVersion), schemaVersion);
    } else {
      assertAgentMemoryPayloadSection(requiredJsonField(payload, "memory", schemaVersion), schemaVersion);
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
  assertJsonObjectWithAllowedKeys(payload, schemaVersion, ["schemaVersion", section]);
  const payloadSchemaVersion = requiredJsonField(payload, "schemaVersion", schemaVersion);
  if (payloadSchemaVersion !== schemaVersion) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
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
  assertStringField(value, "storageStrategy", schemaVersion);
  assertStringField(value, "bindPosture", schemaVersion);
  assertStringField(value, "authPosture", schemaVersion);
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
  for (const task of assertJsonArrayField(value, "tasks", schemaVersion)) {
    projectTaskHistoryItem(task);
  }
  for (const run of assertJsonArrayField(value, "runs", schemaVersion)) {
    projectRunHistoryItem(run);
  }
  for (const modelInvocation of assertJsonArrayField(value, "modelInvocations", schemaVersion)) {
    projectModelInvocationHistoryItem(modelInvocation);
  }
  for (const toolRequest of assertJsonArrayField(value, "toolRequests", schemaVersion)) {
    projectToolRequestHistoryItem(toolRequest);
  }
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
  const window = requiredJsonField(value, "window", schemaVersion);
  if (isOperationalJsonObject(window) && typeof window.limit === "number" && activeMemory.length > window.limit) {
    throw new Error(`invalid ${schemaVersion} payload`);
  }
  for (const memory of activeMemory) {
    assertMemoryPayloadItem(memory, schemaVersion);
  }
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
  assertStringField(emptyProof, "emptyReasonCode", schemaVersion);
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
  const visibleItemCount = value.tasks.length + value.runs.length + value.modelInvocations.length + value.toolRequests.length;
  assertPlainDataObject(value.aggregateCounts, "task/run aggregate counts");
  const aggregateCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value.aggregateCounts)) {
    assertSafeOperationalText(key, "aggregate count key");
    if (!Number.isInteger(count) || count < 0) throw new Error("blocked.invalid-payload-shape: aggregate count is invalid");
    aggregateCounts[key] = count;
  }
  const sourceEventIds = normalizeEventIds(value.sourceEventIds);
  const artifactHashes = normalizeArtifactHashes(value.artifactHashes);
  const window = normalizeWindow(value.window);
  if (visibleItemCount > window.limit) {
    throw new Error("blocked.unbounded-source: task/run history visible items exceed the bounded window limit");
  }
  const emptyProof = value.emptyProof === undefined ? undefined : normalizeEmptyProof(value.emptyProof);
  return {
    projectionHighWaterMark: value.projectionHighWaterMark,
    projectionSourceRef: value.projectionSourceRef,
    tasks: sortHistoryItems(value.tasks.map(projectTaskHistoryItem)),
    runs: sortHistoryItems(value.runs.map(projectRunHistoryItem)),
    modelInvocations: sortHistoryItems(value.modelInvocations.map(projectModelInvocationHistoryItem)),
    toolRequests: sortHistoryItems(value.toolRequests.map(projectToolRequestHistoryItem)),
    aggregateCounts,
    sourceEventIds,
    artifactHashes,
    window,
    ...(emptyProof === undefined ? {} : { emptyProof })
  };
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
  assertSafeOperationalText(value.emptyReasonCode, "empty proof reason");
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
  for (const group of groups) {
    const items = snapshot[group];
    const index = [...items].map((item, index) => ({ item, index })).reverse().find(({ item }) => itemState(item) === "completed")?.index;
    if (index === undefined) continue;
    const nextItems = items.filter((_, current) => current !== index);
    const windowOmissions = uniqueOmissionCodes([...snapshot.window.omissionCodes, "omitted.size-budget"]);
    return { ...snapshot, [group]: nextItems, window: { ...snapshot.window, omissionCodes: windowOmissions } };
  }
  return undefined;
}

function historyItemCount(snapshot: OperationalTaskRunHistorySnapshot): number {
  return snapshot.tasks.length + snapshot.runs.length + snapshot.modelInvocations.length + snapshot.toolRequests.length;
}

function sortHistoryItems(items: readonly AgentContextPackJsonValue[]): readonly AgentContextPackJsonValue[] {
  return [...items].sort((left, right) => {
    const priority = historyStatePriority(itemState(left)) - historyStatePriority(itemState(right));
    return priority === 0 ? stableJsonText(left).localeCompare(stableJsonText(right)) : priority;
  });
}

function sortJsonItems(items: readonly AgentContextPackJsonValue[]): readonly AgentContextPackJsonValue[] {
  return [...items].sort((left, right) => stableJsonText(left).localeCompare(stableJsonText(right)));
}

function itemState(value: AgentContextPackJsonValue): string | undefined {
  return isOperationalJsonObject(value) && typeof value.state === "string" ? value.state : undefined;
}

function historyStatePriority(state: string | undefined): number {
  if (state === "failed" || state === "blocked" || state === "denied" || state === "pending") return 0;
  if (state === "executing" || state === "approved" || state === "requested" || state === "queued" || state === "running") return 1;
  if (state === "completed") return 2;
  return 1;
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

function projectTaskHistoryItem(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  return projectHistoryItem(value, "task", "taskId");
}

function projectRunHistoryItem(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  return projectHistoryItem(value, "run", "runId");
}

function projectModelInvocationHistoryItem(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  return projectHistoryItem(value, "model invocation", "invocationId");
}

function projectToolRequestHistoryItem(value: AgentContextPackJsonValue): AgentContextPackJsonValue {
  return projectHistoryItem(value, "tool request", "requestId");
}

function projectHistoryItem(
  value: AgentContextPackJsonValue,
  label: string,
  identifierKey: "taskId" | "runId" | "invocationId" | "requestId"
): AgentContextPackJsonValue {
  const item = assertStrictOperationalObject(value, label, [identifierKey, "state", "category", "sourceEventIds", "artifactHashes"]);
  return {
    [identifierKey]: requiredSafeIdentifier(item, identifierKey, label),
    state: requiredSafeState(item, "state", label),
    ...(item.category === undefined ? {} : { category: requiredSafeOperationalField(item, "category", label) }),
    ...(item.sourceEventIds === undefined ? {} : { sourceEventIds: normalizeEventIds(item.sourceEventIds as readonly string[]) }),
    ...(item.artifactHashes === undefined ? {} : { artifactHashes: normalizeArtifactHashes(item.artifactHashes as readonly string[]) })
  };
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
  requiredSafeOperationalField(item, "scope", "memory item");
  requiredSafeOperationalField(item, "memoryKind", "memory item");
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
  normalizeArtifactHashes(item.artifactHashes as readonly string[]);
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

function requiredSafeState(value: Record<string, unknown>, key: string, label: string): string {
  const field = value[key];
  if (typeof field !== "string" || !historyStates.has(field)) {
    throw new Error(`blocked.invalid-payload-shape: ${label} state is invalid`);
  }
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
  if (typeof value !== "string") throw new Error(`blocked.unsafe-diagnostic: ${label} must be text`);
  assertAgentSecretSafeText(value, label);
  if (/(?:\/home\/|\\\\|\bprompt\b|model[ -]?output|provider[ -]?error|\bstdout\b|\bstderr\b|\bstack\s*trace\b|\berror:)/i.test(value)) {
    throw new Error(`blocked.unsafe-diagnostic: ${label} contains unsafe operational material`);
  }
}

function buildWithBudget(input: Omit<BuildContextPackRefInput, "version">): ResolvedContextPack {
  return buildResolvedContextPack({ ...input, version: 1 });
}

function emptyProjectionProvenanceRef(proof: OperationalEmptyProjectionProof): string {
  return `empty-projection:${proof.projectionName}:${proof.scope.kind}:${proof.scope.id}:hwm:${proof.projectionHighWaterMark}`;
}
