import {
  createCredentialReference,
  type CredentialReference,
  type CredentialKind
} from "../../agent/src/credential-reference.js";
import {
  createProviderCapabilityDescriptor,
  type ProviderCapabilityDescriptor
} from "../../agent/src/provider-registry.js";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";

const configurationVersion = "agent-provider-configuration.v1" as const;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const capabilityIdPattern = /^provider_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const endpointPolicyIdPattern = /^endpoint_policy_[a-zA-Z0-9_-]+$/;
const feasibilityIdPattern = /^provider_feasibility_[a-zA-Z0-9_-]+$/;
const evidenceIdPattern = /^evidence_[a-zA-Z0-9_-]+$/;
const urlOrHostPattern = /(?:https?:\/\/|\b(?:localhost|(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|ai|app|co|uk|invalid))\b)/i;

export type ProviderConfigurationLane = "byok" | "local-engine" | "official-harness";

export interface CanonicalProviderCapability {
  readonly capability: ProviderCapabilityDescriptor;
  readonly capabilityHash: `sha256:${string}`;
  readonly capabilitySourceEventId: `evt_${string}`;
  readonly capabilityRevision: string;
}

export interface CanonicalEndpointPolicy {
  readonly endpointPolicyId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterVersion: string;
  readonly policyVersion: string;
  readonly scope: "exact-provider-model";
  readonly status: "approved";
  readonly sourceEventIds: readonly `evt_${string}`[];
}

export interface OfficialHarnessEvidence {
  readonly evidenceId: string;
  readonly evidenceHash: `sha256:${string}`;
  readonly officialFlow: "subscription-device-oauth";
  readonly approvedScope: "model-inference";
  readonly approvedCostPolicy: "subscription-entitlement";
  readonly officialSourceEventIds: readonly `evt_${string}`[];
}

export interface CurrentProviderFeasibility {
  readonly feasibilityId: string;
  readonly state: "current";
  readonly lane: ProviderConfigurationLane;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly capabilitySourceEventId: `evt_${string}`;
  readonly capabilityRevision: string;
  readonly credentialRefId: string;
  readonly credentialKind: CredentialKind;
  readonly endpointPolicyId: string;
  readonly policyVersion: string;
  readonly assessedAt: string;
  readonly sourceEventIds: readonly `evt_${string}`[];
  readonly officialEvidence?: OfficialHarnessEvidence;
}

/**
 * Immutable, credential-free source data for the later mounted provider
 * authority. This value is deliberately only data: it has no reader, resolver,
 * registry singleton, secret handle, readiness claim, or provider adapter.
 */
export interface AgentProviderConfiguration {
  readonly version: typeof configurationVersion;
  readonly capabilities: readonly CanonicalProviderCapability[];
  readonly credentialReferences: readonly CredentialReference[];
  readonly endpointPolicies: readonly CanonicalEndpointPolicy[];
  readonly feasibility: readonly CurrentProviderFeasibility[];
}

/**
 * Validates and snapshots the current provider configuration facts. Nothing in
 * this function discovers credentials, calls a provider, or writes durable or
 * process-global state. The mounted Task139-PM card is the sole reader and
 * authority composition point.
 */
export function createAgentProviderConfiguration(input: unknown): AgentProviderConfiguration {
  try {
    const snapshot = normalizePlainOwnData(input);
    if (!isRecord(snapshot) || !hasExactKeys(snapshot, configurationKeys)) throw invalidConfiguration();

    const capabilities = normalizeCapabilities(snapshot.capabilities);
    const credentialReferences = normalizeCredentialReferences(snapshot.credentialReferences);
    const endpointPolicies = normalizeEndpointPolicies(snapshot.endpointPolicies);
    const feasibility = normalizeFeasibility(snapshot.feasibility);

    validateBindings(capabilities, credentialReferences, endpointPolicies, feasibility);

    return Object.freeze({
      version: configurationVersion,
      capabilities: freezeSorted(capabilities, (entry) => entry.capability.providerId),
      credentialReferences: freezeSorted(credentialReferences, (entry) => entry.credentialRefId),
      endpointPolicies: freezeSorted(endpointPolicies, (entry) => entry.endpointPolicyId),
      feasibility: freezeSorted(feasibility, (entry) => `${entry.providerId}\u0000${entry.modelId}\u0000${entry.feasibilityId}`)
    });
  } catch {
    throw invalidConfiguration();
  }
}

const configurationKeys = new Set(["capabilities", "credentialReferences", "endpointPolicies", "feasibility"]);
const capabilityKeys = new Set(["capability", "capabilityHash", "capabilitySourceEventId", "capabilityRevision"]);
const endpointPolicyKeys = new Set([
  "endpointPolicyId", "providerId", "modelId", "adapterVersion", "policyVersion", "scope", "status", "sourceEventIds"
]);
const feasibilityKeys = new Set([
  "feasibilityId", "state", "lane", "providerId", "modelId", "capabilityHash", "capabilitySourceEventId",
  "capabilityRevision", "credentialRefId", "credentialKind", "endpointPolicyId", "policyVersion", "assessedAt", "sourceEventIds"
]);
const officialFeasibilityKeys = new Set([...feasibilityKeys, "officialEvidence"]);
const officialEvidenceKeys = new Set([
  "evidenceId", "evidenceHash", "officialFlow", "approvedScope", "approvedCostPolicy", "officialSourceEventIds"
]);

function normalizeCapabilities(value: unknown): readonly CanonicalProviderCapability[] {
  const records = requireArray(value);
  const seen = new Set<string>();
  return records.map((value) => {
    if (!isRecord(value) || !hasExactKeys(value, capabilityKeys)) throw invalidConfiguration();
    const capability = createProviderCapabilityDescriptor(value.capability);
    if (capability.fakeSupport || !seen.add(capability.providerId)) throw invalidConfiguration();
    const capabilityHash = requireHash(value.capabilityHash);
    const capabilitySourceEventId = requireEventId(value.capabilitySourceEventId);
    const capabilityRevision = requireSafeText(value.capabilityRevision);
    return Object.freeze({ capability, capabilityHash, capabilitySourceEventId, capabilityRevision });
  });
}

function normalizeCredentialReferences(value: unknown): readonly CredentialReference[] {
  const records = requireArray(value);
  const seen = new Set<string>();
  return records.map((value) => {
    const reference = createCredentialReference(value);
    if (
      !seen.add(reference.credentialRefId) ||
      reference.status !== "healthy" ||
      !reference.capabilityScopes.includes("model-inference") ||
      !validEventIds(reference.sourceEventIds)
    ) {
      throw invalidConfiguration();
    }
    return reference;
  });
}

function normalizeEndpointPolicies(value: unknown): readonly CanonicalEndpointPolicy[] {
  const records = requireArray(value);
  const seen = new Set<string>();
  return records.map((value) => {
    if (!isRecord(value) || !hasExactKeys(value, endpointPolicyKeys)) throw invalidConfiguration();
    const endpointPolicyId = requireId(value.endpointPolicyId, endpointPolicyIdPattern);
    if (!seen.add(endpointPolicyId)) throw invalidConfiguration();
    if (value.scope !== "exact-provider-model" || value.status !== "approved") throw invalidConfiguration();
    return Object.freeze({
      endpointPolicyId,
      providerId: requireId(value.providerId, capabilityIdPattern),
      modelId: requireSafeText(value.modelId),
      adapterVersion: requireSafeText(value.adapterVersion),
      policyVersion: requireSafeText(value.policyVersion),
      scope: "exact-provider-model" as const,
      status: "approved" as const,
      sourceEventIds: freezeEventIds(value.sourceEventIds)
    });
  });
}

function normalizeFeasibility(value: unknown): readonly CurrentProviderFeasibility[] {
  const records = requireArray(value);
  const seen = new Set<string>();
  return records.map((value) => {
    if (!isRecord(value)) throw invalidConfiguration();
    const lane = value.lane;
    if (lane !== "byok" && lane !== "local-engine" && lane !== "official-harness") throw invalidConfiguration();
    if (!hasExactKeys(value, lane === "official-harness" ? officialFeasibilityKeys : feasibilityKeys)) {
      throw invalidConfiguration();
    }
    const feasibilityId = requireId(value.feasibilityId, feasibilityIdPattern);
    if (!seen.add(feasibilityId) || value.state !== "current") throw invalidConfiguration();
    const assessedAt = requireIsoDate(value.assessedAt);
    const result: CurrentProviderFeasibility = {
      feasibilityId,
      state: "current",
      lane,
      providerId: requireId(value.providerId, capabilityIdPattern),
      modelId: requireSafeText(value.modelId),
      capabilityHash: requireHash(value.capabilityHash),
      capabilitySourceEventId: requireEventId(value.capabilitySourceEventId),
      capabilityRevision: requireSafeText(value.capabilityRevision),
      credentialRefId: requireId(value.credentialRefId, credentialRefIdPattern),
      credentialKind: requireCredentialKind(value.credentialKind),
      endpointPolicyId: requireId(value.endpointPolicyId, endpointPolicyIdPattern),
      policyVersion: requireSafeText(value.policyVersion),
      assessedAt,
      sourceEventIds: freezeEventIds(value.sourceEventIds),
      ...(lane === "official-harness" ? { officialEvidence: normalizeOfficialEvidence(value.officialEvidence) } : {})
    };
    return Object.freeze(result);
  });
}

function normalizeOfficialEvidence(value: unknown): OfficialHarnessEvidence {
  if (!isRecord(value) || !hasExactKeys(value, officialEvidenceKeys)) throw invalidConfiguration();
  if (
    value.officialFlow !== "subscription-device-oauth" ||
    value.approvedScope !== "model-inference" ||
    value.approvedCostPolicy !== "subscription-entitlement"
  ) {
    throw invalidConfiguration();
  }
  return Object.freeze({
    evidenceId: requireId(value.evidenceId, evidenceIdPattern),
    evidenceHash: requireHash(value.evidenceHash),
    officialFlow: "subscription-device-oauth",
    approvedScope: "model-inference",
    approvedCostPolicy: "subscription-entitlement",
    officialSourceEventIds: freezeEventIds(value.officialSourceEventIds)
  });
}

function validateBindings(
  capabilities: readonly CanonicalProviderCapability[],
  credentialReferences: readonly CredentialReference[],
  endpointPolicies: readonly CanonicalEndpointPolicy[],
  feasibility: readonly CurrentProviderFeasibility[]
): void {
  const capabilityByProvider = new Map(capabilities.map((entry) => [entry.capability.providerId, entry]));
  const referenceById = new Map(credentialReferences.map((entry) => [entry.credentialRefId, entry]));
  const policyById = new Map(endpointPolicies.map((entry) => [entry.endpointPolicyId, entry]));
  const assessedScopes = new Set<string>();

  for (const record of feasibility) {
    const capability = capabilityByProvider.get(record.providerId);
    const reference = referenceById.get(record.credentialRefId);
    const policy = policyById.get(record.endpointPolicyId);
    if (
      capability === undefined || reference === undefined || policy === undefined ||
      !assessedScopes.add(`${record.providerId}\u0000${record.modelId}`) ||
      capability.capabilityHash !== record.capabilityHash ||
      capability.capabilitySourceEventId !== record.capabilitySourceEventId ||
      capability.capabilityRevision !== record.capabilityRevision ||
      !capability.capability.modelFamilies.includes(record.modelId) ||
      capability.capability.adapterVersion !== policy.adapterVersion ||
      reference.providerId !== record.providerId ||
      reference.credentialKind !== record.credentialKind ||
      reference.policyVersion !== record.policyVersion ||
      policy.providerId !== record.providerId ||
      policy.modelId !== record.modelId ||
      policy.policyVersion !== record.policyVersion ||
      !reference.sourceEventIds.every((id) => validEventId(id)) ||
      !isReferenceCurrentAt(reference, record.assessedAt)
    ) {
      throw invalidConfiguration();
    }
    validateLane(record, capability.capability, reference);
  }

  if (feasibility.length !== capabilities.length) throw invalidConfiguration();
}

function validateLane(
  record: CurrentProviderFeasibility,
  capability: ProviderCapabilityDescriptor,
  reference: CredentialReference
): void {
  const isLocalEngine = capability.backendKind === "local-engine";
  const isOfficialHarness = capability.backendKind === "openai-codex-harness" || capability.backendKind === "xai-harness";

  if (isLocalEngine) {
    if (
      record.lane !== "local-engine" || record.officialEvidence !== undefined ||
      reference.credentialKind !== "local-no-secret" ||
      capability.costPolicy !== "local-compute" || capability.approvalProfile !== "local-only"
    ) {
      throw invalidConfiguration();
    }
    return;
  }

  if (isOfficialHarness) {
    if (
      record.lane !== "official-harness" || record.officialEvidence === undefined ||
      (reference.credentialKind !== "subscription-oauth" && reference.credentialKind !== "device-code-oauth") ||
      capability.costPolicy !== "subscription-entitlement" || capability.approvalProfile !== "harness-workspace-gated"
    ) {
      throw invalidConfiguration();
    }
    return;
  }

  if (record.lane !== "byok" || record.officialEvidence !== undefined || reference.credentialKind === "local-no-secret") {
    throw invalidConfiguration();
  }
}

function isReferenceCurrentAt(reference: CredentialReference, assessedAt: string): boolean {
  if (reference.expiresAt === undefined) return true;
  return Date.parse(reference.expiresAt) > Date.parse(assessedAt);
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidConfiguration();
  return value;
}

function requireCredentialKind(value: unknown): CredentialKind {
  const kinds: readonly CredentialKind[] = [
    "api-key-bearer", "workload-identity-token", "subscription-oauth", "device-code-oauth", "local-no-secret", "mtls-certificate", "enterprise-gateway"
  ];
  if (typeof value !== "string" || !kinds.includes(value as CredentialKind)) throw invalidConfiguration();
  return value as CredentialKind;
}

function requireHash(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !hashPattern.test(value)) throw invalidConfiguration();
  return value;
}

function requireEventId(value: unknown): `evt_${string}` {
  if (typeof value !== "string" || !eventIdPattern.test(value) || !isSafeText(value)) throw invalidConfiguration();
  return value as `evt_${string}`;
}

function freezeEventIds(value: unknown): readonly `evt_${string}`[] {
  if (!Array.isArray(value) || value.length === 0) throw invalidConfiguration();
  const ids = value.map(requireEventId);
  if (new Set(ids).size !== ids.length) throw invalidConfiguration();
  return Object.freeze(ids);
}

function validEventIds(value: readonly string[]): boolean {
  return value.length > 0 && new Set(value).size === value.length && value.every(validEventId);
}

function validEventId(value: string): boolean {
  return eventIdPattern.test(value) && isSafeText(value);
}

function requireId(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value) || !isSafeText(value)) throw invalidConfiguration();
  return value;
}

function requireSafeText(value: unknown): string {
  if (typeof value !== "string" || !isSafeText(value)) throw invalidConfiguration();
  return value;
}

function isSafeText(value: string): boolean {
  return value.length > 0 && isAgentSecretSafeText(value) && !urlOrHostPattern.test(value);
}

function requireIsoDate(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !isSafeText(value)) throw invalidConfiguration();
  return value;
}

function freezeSorted<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  return Object.freeze([...values].sort((left, right) => key(left).localeCompare(key(right))));
}

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlainOwnData(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") throw invalidConfiguration();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw invalidConfiguration();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, "length");
    if (length === undefined || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0) {
      throw invalidConfiguration();
    }
    if (
      Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
      Object.getOwnPropertyNames(value).length !== length.value + 1
    ) {
      throw invalidConfiguration();
    }
    const normalized: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
        throw invalidConfiguration();
      }
      normalized.push(normalizePlainOwnData(descriptor.value));
    }
    return Object.freeze(normalized);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw invalidConfiguration();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) throw invalidConfiguration();
  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw invalidConfiguration();
    }
    Object.defineProperty(normalized, key, {
      value: normalizePlainOwnData(descriptor.value),
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(normalized);
}

function invalidConfiguration(): TypeError {
  return new TypeError("invalid provider configuration");
}
