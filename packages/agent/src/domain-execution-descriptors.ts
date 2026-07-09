import { createHash } from "node:crypto";
import type {
  AgentToolFailureCategory,
  AgentToolPreview,
  AgentToolResult
} from "./tool-gateway.js";
import type {
  AgentToolApprovalClass,
  AgentToolSideEffectClass
} from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

const secretShapedDtoKeyTerms = new Set([
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "oauth",
  "passwd",
  "password",
  "secret",
  "token"
]);
const unsafeDtoKeys = new Set(["__proto__", "constructor", "prototype"]);
const artifactHashPattern = /^sha256:[a-f0-9]{64}$/;
const allowedSideEffectClasses = new Set<AgentToolSideEffectClass>([
  "read-only",
  "local-derivative",
  "ledger-proposal",
  "ledger-review",
  "external-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation"
]);
const allowedApprovalClasses = new Set<AgentToolApprovalClass>([
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
]);

export type AgentDomainToolFamily =
  | "provider-byte-transfer"
  | "prr-correspondence"
  | "accepted-graph-review"
  | "export-report"
  | "destructive-repair"
  | "legacy-staging";

export interface AgentDomainPreviewProjectionHighWaterMark {
  readonly projectionName: string;
  readonly highWaterMark: number;
}

export interface AgentDomainPreviewStaleAfter {
  readonly kind: string;
  readonly refs: readonly string[];
  readonly [key: string]: unknown;
}

export interface AgentDomainPreview extends AgentToolPreview {
  readonly schemaVersion: string;
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly targetDomainService: string;
  readonly inputSchemaId: string;
  readonly normalizedInputHash: `sha256:${string}`;
  readonly summary: string;
  readonly scope: string;
  readonly estimatedEffect: string;
  readonly consequence: string;
  readonly affectedRefs: readonly Record<string, unknown>[];
  readonly expectedOutputs: readonly Record<string, unknown>[];
  readonly contextPackRefs: readonly Record<string, unknown>[];
  readonly governancePolicyVersion: string;
  readonly lockSnapshot: readonly Record<string, unknown>[];
  readonly projectionHighWaterMarks: readonly AgentDomainPreviewProjectionHighWaterMark[];
  readonly idempotencyKey: string;
  readonly staleAfter?: AgentDomainPreviewStaleAfter | undefined;
}

export interface AgentDomainExecutionResult extends AgentToolResult {
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly readModelChanges: AgentToolResult["readModelChanges"];
  readonly resultSummary: string;
}

export interface AgentDomainExecutionFailure {
  readonly category: AgentToolFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

export interface AgentDomainToolDescriptor {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly family: AgentDomainToolFamily;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly targetDomainService: string;
  readonly idempotencyKeyFields: readonly string[];
  readonly forbiddenEffects: readonly string[];
}

export interface AgentDomainToolRegistry {
  register(descriptor: unknown): AgentDomainToolDescriptor;
  require(toolId: string, toolVersion: string): AgentDomainToolDescriptor;
  requireByKey(toolIdAtVersion: string): AgentDomainToolDescriptor;
  list(): readonly AgentDomainToolDescriptor[];
}

const allowedDescriptorProfilesByFamily: Record<
  AgentDomainToolFamily,
  ReadonlySet<`${AgentToolSideEffectClass}|${AgentToolApprovalClass}`>
> = {
  "provider-byte-transfer": new Set(["external-byte-transfer|provider-byte-transfer"]),
  "prr-correspondence": new Set(["external-message-send|external-message-send"]),
  "accepted-graph-review": new Set(["ledger-review|ledger-review"]),
  "export-report": new Set(["export-or-publication|export-or-publication"]),
  "destructive-repair": new Set(["destructive-or-repair|destructive-or-repair"]),
  "legacy-staging": new Set(["ledger-review|ledger-review", "ledger-proposal|none"])
};

export function createAgentDomainToolRegistry(
  descriptors: readonly unknown[] = []
): AgentDomainToolRegistry {
  const registry = new InMemoryAgentDomainToolRegistry();
  for (const descriptor of descriptors) {
    registry.register(descriptor);
  }
  return registry;
}

export function hashAgentDomainPreview(preview: AgentDomainPreview): `sha256:${string}` {
  const normalized = sanitizeAgentDomainPreview(preview);
  const digest = createHash("sha256").update(stableJsonStringify(normalized)).digest("hex");
  return `sha256:${digest}`;
}

class InMemoryAgentDomainToolRegistry implements AgentDomainToolRegistry {
  private readonly descriptors = new Map<string, AgentDomainToolDescriptor>();

  register(descriptor: unknown): AgentDomainToolDescriptor {
    const parsed = createAgentDomainToolDescriptor(descriptor);
    const key = descriptorKey(parsed.toolId, parsed.toolVersion);
    if (this.descriptors.has(key)) {
      throw new Error("Agent domain tool descriptor is already registered");
    }
    this.descriptors.set(key, parsed);
    return parsed;
  }

  require(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
    const key = descriptorKey(assertSecretSafeString(toolId, "tool id"), assertSecretSafeString(toolVersion, "tool version"));
    const descriptor = this.descriptors.get(key);
    if (descriptor === undefined) {
      throw new Error("Agent domain tool descriptor was not found");
    }
    return descriptor;
  }

  requireByKey(toolIdAtVersion: string): AgentDomainToolDescriptor {
    const [toolId, toolVersion] = splitToolReference(toolIdAtVersion);
    return this.require(toolId, toolVersion);
  }

  list(): readonly AgentDomainToolDescriptor[] {
    return deepFreeze([...this.descriptors.values()]);
  }
}

function createAgentDomainToolDescriptor(descriptor: unknown): AgentDomainToolDescriptor {
  const record = dataRecordFromObject(descriptor, "agent domain tool descriptor");
  rejectUnsupportedKeys(record, [
    "toolId",
    "toolVersion",
    "family",
    "sideEffectClass",
    "requiredApprovalClass",
    "inputSchemaId",
    "outputSchemaId",
    "targetDomainService",
    "idempotencyKeyFields",
    "forbiddenEffects"
  ], "agent domain tool descriptor");

  const toolId = assertSecretSafeString(record.toolId, "tool id");
  const toolVersion = assertSecretSafeString(record.toolVersion, "tool version");
  const family = parseFamily(record.family);
  const sideEffectClass = parseSideEffectClass(record.sideEffectClass);
  const requiredApprovalClass = parseApprovalClass(record.requiredApprovalClass);
  const inputSchemaId = assertSecretSafeString(record.inputSchemaId, "input schema id");
  const outputSchemaId = assertSecretSafeString(record.outputSchemaId, "output schema id");
  const targetDomainService = assertSecretSafeString(record.targetDomainService, "target domain service");
  const idempotencyKeyFields = sanitizeStringArray(record.idempotencyKeyFields, "idempotency key field", true);
  const forbiddenEffects = sanitizeStringArray(record.forbiddenEffects, "forbidden effect", false);

  assertDescriptorProfileMatchesFamily(family, sideEffectClass, requiredApprovalClass);

  return deepFreeze({
    toolId,
    toolVersion,
    family,
    sideEffectClass,
    requiredApprovalClass,
    inputSchemaId,
    outputSchemaId,
    targetDomainService,
    idempotencyKeyFields,
    forbiddenEffects
  });
}

function sanitizeAgentDomainPreview(preview: AgentDomainPreview): AgentDomainPreview {
  const record = sanitizePlainJsonObject(preview, "agent domain preview") as Record<string, unknown>;

  const normalized: Record<string, unknown> = {
    ...record,
    schemaVersion: assertSecretSafeString(record.schemaVersion, "preview schema version"),
    toolRequestId: assertSecretSafeString(record.toolRequestId, "preview tool request id"),
    toolId: assertSecretSafeString(record.toolId, "preview tool id"),
    toolVersion: assertSecretSafeString(record.toolVersion, "preview tool version"),
    runId: assertSecretSafeString(record.runId, "preview run id"),
    taskId: assertSecretSafeString(record.taskId, "preview task id"),
    residentAgentId: assertSecretSafeString(record.residentAgentId, "preview resident agent id"),
    sideEffectClass: parseSideEffectClass(record.sideEffectClass),
    requiredApprovalClass: parseApprovalClass(record.requiredApprovalClass),
    targetDomainService: assertSecretSafeString(record.targetDomainService, "preview target domain service"),
    inputSchemaId: assertSecretSafeString(record.inputSchemaId, "preview input schema id"),
    normalizedInputHash: parseArtifactHash(record.normalizedInputHash, "preview normalized input hash"),
    summary: assertSecretSafeString(record.summary, "preview summary"),
    scope: assertSecretSafeString(record.scope, "preview scope"),
    estimatedEffect: assertSecretSafeString(record.estimatedEffect, "preview estimated effect"),
    consequence: assertSecretSafeString(record.consequence, "preview consequence"),
    governancePolicyVersion: assertSecretSafeString(record.governancePolicyVersion, "preview governance policy version"),
    idempotencyKey: assertSecretSafeString(record.idempotencyKey, "preview idempotency key"),
    affectedRefs: sanitizeRecordArray(record.affectedRefs, "preview affected ref"),
    expectedOutputs: sanitizeRecordArray(record.expectedOutputs, "preview expected output"),
    contextPackRefs: sanitizeRecordArray(record.contextPackRefs, "preview context pack ref"),
    lockSnapshot: sanitizeRecordArray(record.lockSnapshot, "preview lock snapshot"),
    projectionHighWaterMarks: sanitizeProjectionHighWaterMarks(record.projectionHighWaterMarks)
  };

  if (record.staleAfter !== undefined) {
    normalized.staleAfter = sanitizeStaleAfter(record.staleAfter);
  }

  return deepFreeze(normalized) as AgentDomainPreview;
}

function sanitizeProjectionHighWaterMarks(value: unknown): readonly AgentDomainPreviewProjectionHighWaterMark[] {
  const marks = sanitizeJsonArray(value, "preview projection high water marks");
  return deepFreeze(
    marks.map((item) => {
      const record = dataRecordFromObject(item, "preview projection high water mark");
      rejectUnsupportedKeys(record, ["projectionName", "highWaterMark"], "preview projection high water mark");
      const projectionName = assertSecretSafeString(record.projectionName, "preview projection name");
      const highWaterMark = assertNonNegativeInteger(record.highWaterMark, "preview projection high water mark");
      return { projectionName, highWaterMark };
    })
  );
}

function sanitizeStaleAfter(value: unknown): AgentDomainPreviewStaleAfter {
  const record = sanitizePlainJsonObject(value, "preview stale-after") as Record<string, unknown>;
  return deepFreeze({
    ...record,
    kind: assertSecretSafeString(record.kind, "preview stale-after kind"),
    refs: sanitizeStringArray(record.refs, "preview stale-after ref", true)
  }) as AgentDomainPreviewStaleAfter;
}

function descriptorKey(toolId: string, toolVersion: string): string {
  return `${toolId}@${toolVersion}`;
}

function splitToolReference(toolIdAtVersion: string): [string, string] {
  const reference = assertSecretSafeString(toolIdAtVersion, "tool reference");
  const separatorIndex = reference.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === reference.length - 1) {
    throw new Error("Tool reference must be formatted as toolId@toolVersion");
  }
  return [reference.slice(0, separatorIndex), reference.slice(separatorIndex + 1)];
}

function parseFamily(value: unknown): AgentDomainToolFamily {
  const family = assertSecretSafeString(value, "descriptor family");
  switch (family) {
    case "provider-byte-transfer":
    case "prr-correspondence":
    case "accepted-graph-review":
    case "export-report":
    case "destructive-repair":
    case "legacy-staging":
      return family;
    default:
      throw new Error("Agent domain tool descriptor family is not supported");
  }
}

function parseSideEffectClass(value: unknown): AgentToolSideEffectClass {
  const sideEffectClass = assertSecretSafeString(value, "side-effect class");
  if (!allowedSideEffectClasses.has(sideEffectClass as AgentToolSideEffectClass)) {
    throw new Error("Agent domain tool descriptor side-effect class is not supported");
  }
  return sideEffectClass as AgentToolSideEffectClass;
}

function parseApprovalClass(value: unknown): AgentToolApprovalClass {
  const approvalClass = assertSecretSafeString(value, "approval class");
  if (!allowedApprovalClasses.has(approvalClass as AgentToolApprovalClass)) {
    throw new Error("Agent domain tool descriptor approval class is not supported");
  }
  return approvalClass as AgentToolApprovalClass;
}

function assertDescriptorProfileMatchesFamily(
  family: AgentDomainToolFamily,
  sideEffectClass: AgentToolSideEffectClass,
  requiredApprovalClass: AgentToolApprovalClass
): void {
  const profile = `${sideEffectClass}|${requiredApprovalClass}` as const;
  if (!allowedDescriptorProfilesByFamily[family].has(profile)) {
    throw new Error("Agent domain tool descriptor approval class must match the descriptor family side-effect contract");
  }
}

function sanitizeRecordArray(value: unknown, label: string): readonly Record<string, unknown>[] {
  const items = sanitizeJsonArray(value, `${label}s`);
  return deepFreeze(items.map((item) => sanitizePlainJsonObject(item, label) as Record<string, unknown>));
}

function sanitizeStringArray(value: unknown, label: string, requireNonEmpty: boolean): readonly string[] {
  const items = sanitizeJsonArray(value, `${label}s`).map((item, index) =>
    assertSecretSafeString(item, `${label} ${index + 1}`)
  );
  if (requireNonEmpty && items.length === 0) {
    throw new Error(`${label}s must not be empty`);
  }
  return deepFreeze(items);
}

function parseArtifactHash(value: unknown, label: string): `sha256:${string}` {
  const hash = assertSecretSafeString(value, label);
  if (!artifactHashPattern.test(hash)) {
    throw new Error(`${label} must be a sha256 hash`);
  }
  return hash as `sha256:${string}`;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function sanitizePlainJsonObject(value: unknown, label: string): unknown {
  const record = dataRecordFromObject(value, label);
  const sanitized = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    assertSafeDtoKey(key, label);
    sanitized[key] = sanitizeJsonValue(record[key], `${label} field`);
  }

  return sanitized;
}

function sanitizeJsonArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item) => sanitizeJsonValue(item, label));
}

function sanitizeJsonValue(value: unknown, label: string): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    assertAgentSecretSafeText(value, label);
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, label));
  }

  if (typeof value === "object") {
    return sanitizePlainJsonObject(value, label);
  }

  throw new Error(`${label} must be plain JSON data`);
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnsupportedKeys(
  record: Record<string, unknown>,
  supportedKeys: readonly string[],
  label: string
): void {
  const allowedKeys = new Set(supportedKeys);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} includes an unsupported field`);
    }
  }
}

function assertSafeDtoKey(key: string, label: string): void {
  if (unsafeDtoKeys.has(key)) {
    throw new Error(`${label} must be a plain JSON object`);
  }
  const normalized = key.toLowerCase();
  for (const term of secretShapedDtoKeyTerms) {
    if (normalized.includes(term)) {
      throw new Error(`${label} field names must be secret-safe`);
    }
  }
}

function assertSecretSafeString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  assertAgentSecretSafeText(value, label);
  return value;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stabilizeJsonValue(value));
}

function stabilizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stabilizeJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const stable = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      stable[key] = stabilizeJsonValue(record[key]);
    }
    return stable;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const nested of Object.values(record)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }

  return value;
}
