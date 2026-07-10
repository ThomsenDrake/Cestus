import type {
  AgentContextPackJsonValue,
  BuildContextPackRefInput,
  ContextPackDescriptor,
  ContextPackPayloadParser,
  ContextPackRef,
  ContextPackScope,
  ResolvedContextPack
} from "./context-packs.js";
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

const operationalCapabilities = new Set<OperationalContextPackCapability>([
  "workspace-runtime-status",
  "task-run-history",
  "agent-memory-summary"
]);

export const operationalContextPackDescriptors: readonly ContextPackDescriptor[] = Object.freeze([
  Object.freeze({
    contextPackId: "workspace-runtime-status.v1",
    version: 1,
    label: "Workspace runtime status",
    maxBytes: 16_384,
    requiredProvenanceKinds: Object.freeze(["event-id"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "runtime.status"
  }),
  Object.freeze({
    contextPackId: "task-run-history.v1",
    version: 1,
    label: "Task and run history",
    maxBytes: 32_768,
    requiredProvenanceKinds: Object.freeze(["event-id", "empty-projection"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "agent.projection.task-run-history"
  }),
  Object.freeze({
    contextPackId: "agent-memory-summary.v1",
    version: 1,
    label: "Agent memory summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: Object.freeze(["event-id", "empty-projection"]),
    redactionPolicy: "operational-safe-summary",
    sourceProjection: "agent.projection.memory"
  })
]);

export const operationalContextPackPayloadParsers: Readonly<Record<`${OperationalContextPackId}@1`, ContextPackPayloadParser>> = Object.freeze({
  "workspace-runtime-status.v1@1": createOperationalPayloadParser("workspace-runtime-status.v1", "runtime"),
  "task-run-history.v1@1": createOperationalPayloadParser("task-run-history.v1", "history"),
  "agent-memory-summary.v1@1": createOperationalPayloadParser("agent-memory-summary.v1", "memory")
});

export function assertOperationalContextPackProviderMetadata(
  value: OperationalContextPackProviderMetadata
): asserts value is OperationalContextPackProviderMetadata {
  assertPlainDataObject(value, "provider metadata");
  assertSafeToken(value.providerId, "providerId");
  assertSafeToken(value.policyVersion, "policyVersion", true);
  assertUtcTimestamp(value.generatedAt, "generatedAt");
  assertSafeScope(value.scope);
  assertSizeBudgets(value.sizeBudgets);

  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0) {
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

function createOperationalPayloadParser(
  schemaVersion: OperationalContextPackId,
  requiredSection: string
): ContextPackPayloadParser {
  return (payload) => {
    if (!isPlainJsonObject(payload) || payload.schemaVersion !== schemaVersion || !Object.hasOwn(payload, requiredSection)) {
      throw new Error(`invalid ${schemaVersion} payload`);
    }
    return payload;
  };
}

function assertPlainDataObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor)) {
      throw new Error(`${label} must not contain accessors`);
    }
  }
}

function assertSafeScope(scope: ContextPackScope): void {
  assertPlainDataObject(scope, "scope");
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
  assertPlainDataObject(value, "sizeBudgets");
  for (const budget of [value.workspaceRuntimeStatus, value.taskRunHistory, value.agentMemorySummary]) {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new Error("sizeBudgets must contain positive integer byte budgets");
    }
  }
}

function isPlainJsonObject(value: AgentContextPackJsonValue): value is { readonly [key: string]: AgentContextPackJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
