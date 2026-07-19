import { isIP } from "node:net";
import { types } from "node:util";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";
import { createAgentProviderConfiguration } from "./agent-provider-configuration.js";
import { inspectMountedProviderAuthority } from "./mounted-provider-authority.js";

const configurationVersion = "agent-provider-configuration.v1";
const postureVersion = "resident-loop-provider-posture.v1";
const mountedReadbackVersion = "mounted-provider-authority-readback.v1";
const apiKeyBearer = "api-key-bearer";
const remoteApprovalProfile = "remote-byte-transfer-gated";
const providerByteTransfer = "provider-byte-transfer";
const workspaceIdPattern = /^ws_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const admissionGenerationIdPattern = /^admission_generation_[0-9]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uriSchemePattern = /(?:^|[^a-z0-9])[a-z][a-z0-9+.-]*:/i;
const ipShapedTokenPattern = /\[[^\]\s]+\]|(?:::|[0-9a-f]{1,4}:)[0-9a-f:.]*(?:%[a-z0-9_.-]+)?|(?:\d{1,3}\.){3}\d{1,3}/gi;
const standardUrlIpv4TokenPattern = /(?:^|[^a-z0-9])((?:[0-9a-fx]+\.)+[0-9a-fx]+|0x[0-9a-f]+|\d{8,})(?=$|[^a-z0-9])/gi;
const wholeNumericUrlHostPattern = /^(?:0x[0-9a-f]+|\d+)(?::\d+)?$/i;
const localhostPattern = /\blocalhost\b/i;
const dnsHostTokenPattern = /(?:^|[^\p{L}\p{N}\p{M}_-])((?:[\p{L}\p{N}\p{M}-]+\.)+[\p{L}\p{N}\p{M}-]+)(?=$|[^\p{L}\p{N}\p{M}_-])/gu;
const idnaDotEquivalentPattern = /[\u3002\uFF0E\uFF61]/gu;
const idnaDotEquivalentInOriginalPattern = /[\u3002\uFF0E\uFF61]/u;
const releasedVersionPattern = /^(?:agent-provider-auth|policy|adapter)\.v1$/;
const p2ReleasedVersionPattern = /^(?:agent-provider-configuration|mounted-provider-authority-readback)\.v1$/;

interface NormalizedArray extends ReadonlyArray<NormalizedValue> {}

interface NormalizedRecord {
  readonly [key: string]: NormalizedValue;
}

type NormalizedValue = string | number | boolean | null | NormalizedArray | NormalizedRecord;

export interface ResidentLoopProviderPosture {
  readonly schemaVersion: "resident-loop-provider-posture.v1";
  readonly residentAgentId: "agent_default";
  readonly workspace: {
    readonly workspaceId: string;
    readonly mountInstanceId: string;
    readonly admissionGenerationId: string;
    readonly policyVersion: string;
    readonly policyDigest: `sha256:${string}`;
    readonly lockStateDigest: `sha256:${string}`;
    readonly highWaterMark: string;
    readonly highWaterOrdinal: number;
  };
  readonly run: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
  };
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
    readonly adapterVersion: string;
    readonly selectionPolicyVersion: string;
    readonly endpointPolicyId: string;
  };
  readonly capability: {
    readonly capabilityId: string;
    readonly capabilityVersion: "agent-provider-capability.v2";
    readonly capabilityHash: `sha256:${string}`;
    readonly capabilitySourceEventId: string;
    readonly capabilityRevision: string;
  };
  readonly credentialReference: {
    readonly credentialRefId: string;
    readonly credentialKind: "api-key-bearer";
    readonly sourceEventIds: readonly string[];
  };
  readonly feasibility: {
    readonly feasibilityId: string;
    readonly lane: "byok";
    readonly assessedAt: string;
    readonly sourceEventIds: readonly string[];
  };
  readonly approval: {
    readonly required: true;
    readonly approvalProfile: "remote-byte-transfer-gated";
    readonly requiredApprovalClass: "provider-byte-transfer";
  };
  readonly binding: {
    readonly promptArtifactHash: `sha256:${string}`;
    readonly approvalPreviewHash: `sha256:${string}`;
  };
}

export interface ResidentLoopProviderPostureCapability {
  read(input: unknown): Promise<ResidentLoopProviderPosture>;
}

interface ProviderConfigurationSnapshot {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterVersion: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly capabilitySourceEventId: string;
  readonly capabilityRevision: string;
  readonly credentialRefId: string;
  readonly credentialSourceEventIds: readonly string[];
  readonly endpointPolicyId: string;
  readonly policyVersion: string;
  readonly feasibilityId: string;
  readonly assessedAt: string;
  readonly feasibilitySourceEventIds: readonly string[];
}

interface RequestedBinding {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly admissionGenerationId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly approvalPreviewHash: `sha256:${string}`;
  readonly policyVersion: string;
  readonly policyDigest: `sha256:${string}`;
  readonly lockStateDigest: `sha256:${string}`;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
}

interface MountedCurrentness {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly admissionGenerationId: string;
  readonly policyVersion: string;
  readonly policyDigest: `sha256:${string}`;
  readonly lockStateDigest: `sha256:${string}`;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly durableLedgerEventCount: number;
}

/**
 * Creates a data-only provider-posture reader. PM's opaque mounted authority
 * remains the only currentness authority; P1 and every read request are
 * normalized binding data that cannot grant provider, credential, or workspace
 * authority on their own.
 */
export function createResidentLoopProviderPosture(input: unknown): ResidentLoopProviderPostureCapability {
  const creation = exactOwnDataObject(input, ["configuration", "authority"]);
  const configuration = normalizeConfiguration(creation.configuration);
  const authority = requireOpaqueAuthority(creation.authority);
  let burned = false;
  let binding: RequestedBinding | undefined;

  return Object.freeze({
    async read(readInput: unknown): Promise<ResidentLoopProviderPosture> {
      if (burned) throw unavailable();

      try {
        const requested = normalizeRequestedBinding(readInput);
        if (binding !== undefined && !sameBinding(binding, requested)) {
          burned = true;
          throw unavailable();
        }
        binding = requested;

        const before = normalizeMountedCurrentness(await inspectMountedProviderAuthority(authority));
        requireCurrentBinding(configuration, requested, before);

        const after = normalizeMountedCurrentness(await inspectMountedProviderAuthority(authority));
        if (!sameMountedCurrentness(before, after)) throw unavailable();

        return buildPosture(configuration, requested, after);
      } catch {
        burned = true;
        throw unavailable();
      }
    }
  });
}

function normalizeConfiguration(value: unknown): ProviderConfigurationSnapshot {
  const configuration = requireExactRecord(normalizeImmutablePlainData(value), [
    "version", "capabilities", "credentialReferences", "endpointPolicies", "feasibility"
  ]);
  if (requiredString(configuration, "version") !== configurationVersion) throw unavailable();
  let released;
  try {
    released = createAgentProviderConfiguration(Object.freeze({
      capabilities: requiredValue(configuration, "capabilities"),
      credentialReferences: requiredValue(configuration, "credentialReferences"),
      endpointPolicies: requiredValue(configuration, "endpointPolicies"),
      feasibility: requiredValue(configuration, "feasibility")
    }));
  } catch {
    throw unavailable();
  }

  const capabilityRecord = exactOne(released.capabilities);
  const capability = capabilityRecord.capability;
  const reference = exactOne(released.credentialReferences);
  const endpointPolicy = exactOne(released.endpointPolicies);
  const feasibility = exactOne(released.feasibility);
  const providerId = capability.providerId;
  const adapterVersion = capability.adapterVersion;
  const modelId = exactOne(capability.modelFamilies);
  if (
    capability.backendKind !== "openai-compatible-api" ||
    capability.approvalProfile !== remoteApprovalProfile ||
    capability.costPolicy !== "metered-api" ||
    capability.fakeSupport !== false ||
    capability.credentialRequirements.length !== 1 ||
    capability.credentialRequirements[0]?.credentialKind !== apiKeyBearer ||
    capability.credentialRequirements[0]?.required !== true
  ) {
    throw unavailable();
  }

  const capabilityHash = capabilityRecord.capabilityHash;
  const capabilitySourceEventId = capabilityRecord.capabilitySourceEventId;
  const capabilityRevision = capabilityRecord.capabilityRevision;
  const credentialRefId = reference.credentialRefId;
  const credentialSourceEventIds = reference.sourceEventIds;
  const policyVersion = reference.policyVersion;
  if (
    reference.providerId !== providerId ||
    reference.credentialKind !== apiKeyBearer ||
    reference.status !== "healthy"
  ) {
    throw unavailable();
  }

  const endpointPolicyId = endpointPolicy.endpointPolicyId;
  const endpointSourceEventIds = endpointPolicy.sourceEventIds;
  if (
    endpointPolicy.providerId !== providerId ||
    endpointPolicy.modelId !== modelId ||
    endpointPolicy.adapterVersion !== adapterVersion ||
    endpointPolicy.policyVersion !== policyVersion ||
    endpointPolicy.scope !== "exact-provider-model" ||
    endpointPolicy.status !== "approved"
  ) {
    throw unavailable();
  }

  const feasibilityId = feasibility.feasibilityId;
  const assessedAt = feasibility.assessedAt;
  const feasibilitySourceEventIds = feasibility.sourceEventIds;
  const expectedFeasibilitySources = sortedUnique([
    capabilitySourceEventId,
    ...credentialSourceEventIds,
    ...endpointSourceEventIds
  ]);
  if (
    feasibility.state !== "current" ||
    feasibility.lane !== "byok" ||
    feasibility.providerId !== providerId ||
    feasibility.modelId !== modelId ||
    feasibility.capabilityHash !== capabilityHash ||
    feasibility.capabilitySourceEventId !== capabilitySourceEventId ||
    feasibility.capabilityRevision !== capabilityRevision ||
    feasibility.credentialRefId !== credentialRefId ||
    feasibility.credentialKind !== apiKeyBearer ||
    feasibility.endpointPolicyId !== endpointPolicyId ||
    feasibility.policyVersion !== policyVersion ||
    !sameStrings(feasibilitySourceEventIds, expectedFeasibilitySources)
  ) {
    throw unavailable();
  }

  return Object.freeze({
    providerId,
    modelId,
    adapterVersion,
    capabilityHash,
    capabilitySourceEventId,
    capabilityRevision,
    credentialRefId,
    credentialSourceEventIds,
    endpointPolicyId,
    policyVersion,
    feasibilityId,
    assessedAt,
    feasibilitySourceEventIds
  });
}

function normalizeRequestedBinding(value: unknown): RequestedBinding {
  const request = exactOwnDataObject(value, [
    "workspaceId", "mountInstanceId", "admissionGenerationId", "taskId", "attemptId", "runId", "promptArtifactHash",
    "approvalPreviewHash", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "highWaterOrdinal"
  ]);
  return Object.freeze({
    workspaceId: requiredPatternUnknown(request, "workspaceId", workspaceIdPattern),
    mountInstanceId: requiredPatternUnknown(request, "mountInstanceId", mountInstanceIdPattern),
    admissionGenerationId: requiredPatternUnknown(request, "admissionGenerationId", admissionGenerationIdPattern),
    taskId: requiredPatternUnknown(request, "taskId", taskIdPattern),
    attemptId: requiredPatternUnknown(request, "attemptId", attemptIdPattern),
    runId: requiredPatternUnknown(request, "runId", runIdPattern),
    promptArtifactHash: requiredHashUnknown(request, "promptArtifactHash"),
    approvalPreviewHash: requiredHashUnknown(request, "approvalPreviewHash"),
    policyVersion: requiredUnknownString(request, "policyVersion"),
    policyDigest: requiredHashUnknown(request, "policyDigest"),
    lockStateDigest: requiredHashUnknown(request, "lockStateDigest"),
    highWaterMark: requiredPatternUnknown(request, "highWaterMark", eventIdPattern),
    highWaterOrdinal: requiredNonnegativeIntegerUnknown(request, "highWaterOrdinal")
  });
}

function normalizeMountedCurrentness(value: unknown): MountedCurrentness {
  const readback = requireExactRecord(normalizeImmutablePlainData(value), [
    "schemaVersion", "stage", "workspaceId", "mountInstanceId", "admissionGenerationId", "policyVersion", "policyDigest",
    "lockStateDigest", "highWaterMark", "highWaterOrdinal", "durableLedgerEventCount"
  ]);
  if (readback.schemaVersion !== mountedReadbackVersion || readback.stage !== "locator") throw unavailable();
  return Object.freeze({
    workspaceId: requiredPatternString(readback, "workspaceId", workspaceIdPattern),
    mountInstanceId: requiredPatternString(readback, "mountInstanceId", mountInstanceIdPattern),
    admissionGenerationId: requiredPatternString(readback, "admissionGenerationId", admissionGenerationIdPattern),
    policyVersion: requiredString(readback, "policyVersion"),
    policyDigest: requiredHash(readback, "policyDigest"),
    lockStateDigest: requiredHash(readback, "lockStateDigest"),
    highWaterMark: requiredPatternString(readback, "highWaterMark", eventIdPattern),
    highWaterOrdinal: requiredNonnegativeInteger(readback, "highWaterOrdinal"),
    durableLedgerEventCount: requiredNonnegativeInteger(readback, "durableLedgerEventCount")
  });
}

function requireCurrentBinding(
  configuration: ProviderConfigurationSnapshot,
  requested: RequestedBinding,
  mounted: MountedCurrentness
): void {
  if (
    configuration.policyVersion !== mounted.policyVersion ||
    requested.workspaceId !== mounted.workspaceId ||
    requested.mountInstanceId !== mounted.mountInstanceId ||
    requested.admissionGenerationId !== mounted.admissionGenerationId ||
    requested.policyVersion !== mounted.policyVersion ||
    requested.policyDigest !== mounted.policyDigest ||
    requested.lockStateDigest !== mounted.lockStateDigest ||
    requested.highWaterMark !== mounted.highWaterMark ||
    requested.highWaterOrdinal !== mounted.highWaterOrdinal
  ) {
    throw unavailable();
  }
}

function buildPosture(
  configuration: ProviderConfigurationSnapshot,
  requested: RequestedBinding,
  mounted: MountedCurrentness
): ResidentLoopProviderPosture {
  return Object.freeze({
    schemaVersion: postureVersion,
    residentAgentId: "agent_default",
    workspace: Object.freeze({
      workspaceId: mounted.workspaceId,
      mountInstanceId: mounted.mountInstanceId,
      admissionGenerationId: mounted.admissionGenerationId,
      policyVersion: mounted.policyVersion,
      policyDigest: mounted.policyDigest,
      lockStateDigest: mounted.lockStateDigest,
      highWaterMark: mounted.highWaterMark,
      highWaterOrdinal: mounted.highWaterOrdinal
    }),
    run: Object.freeze({
      taskId: requested.taskId,
      attemptId: requested.attemptId,
      runId: requested.runId
    }),
    selection: Object.freeze({
      providerId: configuration.providerId,
      modelId: configuration.modelId,
      adapterVersion: configuration.adapterVersion,
      selectionPolicyVersion: configuration.policyVersion,
      endpointPolicyId: configuration.endpointPolicyId
    }),
    capability: Object.freeze({
      capabilityId: configuration.providerId,
      capabilityVersion: "agent-provider-capability.v2",
      capabilityHash: configuration.capabilityHash,
      capabilitySourceEventId: configuration.capabilitySourceEventId,
      capabilityRevision: configuration.capabilityRevision
    }),
    credentialReference: Object.freeze({
      credentialRefId: configuration.credentialRefId,
      credentialKind: apiKeyBearer,
      sourceEventIds: Object.freeze([...configuration.credentialSourceEventIds])
    }),
    feasibility: Object.freeze({
      feasibilityId: configuration.feasibilityId,
      lane: "byok",
      assessedAt: configuration.assessedAt,
      sourceEventIds: Object.freeze([...configuration.feasibilitySourceEventIds])
    }),
    approval: Object.freeze({
      required: true,
      approvalProfile: remoteApprovalProfile,
      requiredApprovalClass: providerByteTransfer
    }),
    binding: Object.freeze({
      promptArtifactHash: requested.promptArtifactHash,
      approvalPreviewHash: requested.approvalPreviewHash
    })
  });
}

function exactOwnDataObject(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw unavailable();
  }
  const actualKeys = Reflect.ownKeys(input);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw unavailable();
  }
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable
    ) {
      throw unavailable();
    }
    Object.defineProperty(normalized, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(normalized);
}

function requireOpaqueAuthority(value: unknown): object {
  if (
    types.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw unavailable();
  }
  return value;
}

function normalizeImmutablePlainData(value: unknown): NormalizedValue {
  if (typeof value === "string") {
    if (!isSafeText(value)) throw unavailable();
    return value;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw unavailable();
    return value;
  }
  if (
    types.isProxy(value) ||
    typeof value !== "object" ||
    !Object.isFrozen(value)
  ) {
    throw unavailable();
  }
  if (Array.isArray(value)) return normalizeImmutableArray(value);
  if (Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) throw unavailable();
  const normalized: Record<string, NormalizedValue> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable
    ) {
      throw unavailable();
    }
    Object.defineProperty(normalized, key, {
      value: normalizeImmutablePlainData(descriptor.value),
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(normalized);
}

function normalizeImmutableArray(value: readonly unknown[]): readonly NormalizedValue[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw unavailable();
  const length = Object.getOwnPropertyDescriptor(value, "length");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    length === undefined ||
    !("value" in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Object.getOwnPropertyNames(value).length !== length.value + 1
  ) {
    throw unavailable();
  }
  const normalized: NormalizedValue[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable
    ) {
      throw unavailable();
    }
    normalized.push(normalizeImmutablePlainData(descriptor.value));
  }
  return Object.freeze(normalized);
}

function isSafeText(value: string): boolean {
  return (isAgentSecretSafeText(value) || value === apiKeyBearer) &&
    !hasForbiddenTextMaterial(value);
}

function hasForbiddenTextMaterial(value: string): boolean {
  if (isCanonicalIsoTimestamp(value) || p2ReleasedVersionPattern.test(value)) return false;
  return (
    (!hashPattern.test(value) && uriSchemePattern.test(value)) ||
    hasIpAddress(value) ||
    localhostPattern.test(value) ||
    hasDnsHostMaterial(value)
  );
}

function isCanonicalIsoTimestamp(value: string): boolean {
  if (!timestampPattern.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasDnsHostMaterial(value: string): boolean {
  const containsIdnaDotEquivalent = idnaDotEquivalentInOriginalPattern.test(value);
  const classificationText = value.normalize("NFC").replace(idnaDotEquivalentPattern, ".");
  for (const match of classificationText.matchAll(dnsHostTokenPattern)) {
    const token = match[1];
    if (token !== undefined && (containsIdnaDotEquivalent || !releasedVersionPattern.test(token))) return true;
  }
  return false;
}

function hasIpAddress(value: string): boolean {
  const tokens = value.match(ipShapedTokenPattern);
  return (tokens !== null && tokens.some((token) => {
    const bracketless = token.startsWith("[") && token.endsWith("]") ? token.slice(1, -1) : token;
    const scopeIndex = bracketless.indexOf("%");
    const address = scopeIndex === -1 ? bracketless : bracketless.slice(0, scopeIndex);
    return isIP(address) !== 0;
  })) || hasStandardUrlIpv4Host(value);
}

function hasStandardUrlIpv4Host(value: string): boolean {
  if (isCanonicalIsoTimestamp(value)) return false;
  if (wholeNumericUrlHostPattern.test(value) && isStandardUrlIpv4Host(value)) return true;
  for (const match of value.matchAll(standardUrlIpv4TokenPattern)) {
    const token = match[1];
    if (token !== undefined && isStandardUrlIpv4Host(token)) return true;
  }
  return false;
}

function isStandardUrlIpv4Host(token: string): boolean {
  try {
    return isIP(new URL(`http://${token}`).hostname) === 4;
  } catch {
    return false;
  }
}

function requireExactRecord(value: NormalizedValue, keys: readonly string[]): Readonly<Record<string, NormalizedValue>> {
  const record = requireRecord(value);
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) throw unavailable();
  return record;
}

function requireRecord(value: NormalizedValue): Readonly<Record<string, NormalizedValue>> {
  if (!isNormalizedRecord(value)) throw unavailable();
  return value;
}

function isNormalizedRecord(value: NormalizedValue): value is NormalizedRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredValue(record: Readonly<Record<string, NormalizedValue>>, key: string): NormalizedValue {
  const value = record[key];
  if (value === undefined) throw unavailable();
  return value;
}

function requiredString(record: Readonly<Record<string, NormalizedValue>>, key: string): string {
  const value = requiredValue(record, key);
  if (typeof value !== "string") throw unavailable();
  return value;
}

function requiredPatternString(
  record: Readonly<Record<string, NormalizedValue>>,
  key: string,
  pattern: RegExp
): string {
  const value = requiredString(record, key);
  if (!pattern.test(value)) throw unavailable();
  return value;
}

function requiredHash(record: Readonly<Record<string, NormalizedValue>>, key: string): `sha256:${string}` {
  const value = requiredString(record, key);
  if (!isHash(value)) throw unavailable();
  return value;
}

function exactOne<T>(values: readonly T[]): T {
  if (values.length !== 1) throw unavailable();
  const value = values[0];
  if (value === undefined) throw unavailable();
  return value;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  const normalized = [...values].sort(compareStrings);
  if (new Set(normalized).size !== normalized.length) throw unavailable();
  return Object.freeze(normalized);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredUnknownValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const value = record[key];
  if (value === undefined) throw unavailable();
  return value;
}

function requiredUnknownString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredUnknownValue(record, key);
  if (typeof value !== "string" || !isSafeText(value)) throw unavailable();
  return value;
}

function requiredPatternUnknown(record: Readonly<Record<string, unknown>>, key: string, pattern: RegExp): string {
  const value = requiredUnknownString(record, key);
  if (!pattern.test(value)) throw unavailable();
  return value;
}

function requiredHashUnknown(record: Readonly<Record<string, unknown>>, key: string): `sha256:${string}` {
  const value = requiredUnknownString(record, key);
  if (!isHash(value)) throw unavailable();
  return value;
}

function isHash(value: string): value is `sha256:${string}` {
  return hashPattern.test(value);
}

function requiredNonnegativeIntegerUnknown(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = requiredUnknownValue(record, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

function requiredNonnegativeInteger(record: Readonly<Record<string, NormalizedValue>>, key: string): number {
  const value = requiredValue(record, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

function sameBinding(left: RequestedBinding, right: RequestedBinding): boolean {
  return left.workspaceId === right.workspaceId &&
    left.mountInstanceId === right.mountInstanceId &&
    left.admissionGenerationId === right.admissionGenerationId &&
    left.taskId === right.taskId &&
    left.attemptId === right.attemptId &&
    left.runId === right.runId &&
    left.promptArtifactHash === right.promptArtifactHash &&
    left.approvalPreviewHash === right.approvalPreviewHash &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.highWaterOrdinal === right.highWaterOrdinal;
}

function sameMountedCurrentness(left: MountedCurrentness, right: MountedCurrentness): boolean {
  return left.workspaceId === right.workspaceId &&
    left.mountInstanceId === right.mountInstanceId &&
    left.admissionGenerationId === right.admissionGenerationId &&
    left.policyVersion === right.policyVersion &&
    left.policyDigest === right.policyDigest &&
    left.lockStateDigest === right.lockStateDigest &&
    left.highWaterMark === right.highWaterMark &&
    left.highWaterOrdinal === right.highWaterOrdinal &&
    left.durableLedgerEventCount === right.durableLedgerEventCount;
}

function unavailable(): Error {
  return new Error("resident loop provider posture is unavailable");
}
