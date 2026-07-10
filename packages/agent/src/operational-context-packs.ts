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
  assertJsonArrayField(value, "providerStates", schemaVersion);
  assertJsonArrayField(value, "diagnostics", schemaVersion);
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
  assertJsonArrayField(value, "tasks", schemaVersion);
  assertJsonArrayField(value, "runs", schemaVersion);
  assertJsonArrayField(value, "modelInvocations", schemaVersion);
  assertJsonArrayField(value, "toolRequests", schemaVersion);
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
  assertJsonArrayField(value, "activeMemory", schemaVersion);
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
