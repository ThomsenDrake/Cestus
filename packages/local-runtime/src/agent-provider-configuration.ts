import { isIP } from "node:net";
import {
  createCredentialReference,
  credentialKindSchema,
  credentialReferenceSchema,
  type CredentialReference,
  type CredentialKind
} from "../../agent/src/credential-reference.js";
import {
  createProviderCapabilityDescriptor,
  type ProviderCapabilityDescriptor
} from "../../agent/src/provider-registry.js";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";

const configurationVersion = "agent-provider-configuration.v1";
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const capabilityIdPattern = /^provider_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const endpointPolicyIdPattern = /^endpoint_policy_[a-zA-Z0-9_-]+$/;
const feasibilityIdPattern = /^provider_feasibility_[a-zA-Z0-9_-]+$/;
const evidenceIdPattern = /^evidence_[a-zA-Z0-9_-]+$/;
const openaiCodexProviderIdPattern = /^provider_openai_codex_[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const xaiProviderIdPattern = /^provider_xai_[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const uriSchemePattern = /(?:^|[^a-z0-9])[a-z][a-z0-9+.-]*:(?=\/\/|[^\s])/i;
const ipShapedTokenPattern = /\[[^\]\s]+\]|(?:::|[0-9a-f]{1,4}:)[0-9a-f:.]*(?:%[a-z0-9_.-]+)?|(?:\d{1,3}\.){3}\d{1,3}/gi;
const standardUrlIpv4TokenPattern = /(?:^|[^a-z0-9_:-])([0-9a-fx]+(?:\.[0-9a-fx]+){0,3})(?=$|[^a-z0-9_:-])/gi;
const localhostPattern = /\blocalhost\b/i;
const dnsHostPattern = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i;

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
    if (
      capability.fakeSupport || capability.modelFamilies.length !== 1 || !seen.add(capability.providerId)
    ) {
      throw invalidConfiguration();
    }
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
    const parsed = credentialReferenceSchema.safeParse(value);
    if (!parsed.success) throw invalidConfiguration();
    const reference = createCredentialReference({
      ...parsed.data,
      sourceEventIds: sortEventIds(parsed.data.sourceEventIds.map(requireEventId))
    });
    if (
      !seen.add(reference.credentialRefId) || reference.status !== "healthy" || !validEventIds(reference.sourceEventIds)
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
    const policy: CanonicalEndpointPolicy = {
      endpointPolicyId,
      providerId: requireId(value.providerId, capabilityIdPattern),
      modelId: requireSafeText(value.modelId),
      adapterVersion: requireSafeText(value.adapterVersion),
      policyVersion: requireSafeText(value.policyVersion),
      scope: "exact-provider-model",
      status: "approved",
      sourceEventIds: freezeEventIds(value.sourceEventIds)
    };
    return Object.freeze(policy);
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
  if (
    capabilities.length === 0 ||
    credentialReferences.length !== capabilities.length ||
    endpointPolicies.length !== capabilities.length ||
    feasibility.length !== capabilities.length
  ) {
    throw invalidConfiguration();
  }
  const capabilityByProvider = new Map(capabilities.map((entry) => [entry.capability.providerId, entry]));
  const referenceById = new Map(credentialReferences.map((entry) => [entry.credentialRefId, entry]));
  const policyById = new Map(endpointPolicies.map((entry) => [entry.endpointPolicyId, entry]));
  const assessedScopes = new Set<string>();
  const boundProviders = new Set<string>();
  const boundReferences = new Set<string>();
  const boundPolicies = new Set<string>();

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
      capability.capability.modelFamilies.length !== 1 ||
      capability.capability.modelFamilies[0] !== record.modelId ||
      capability.capability.adapterVersion !== policy.adapterVersion ||
      reference.providerId !== record.providerId ||
      reference.credentialKind !== record.credentialKind ||
      reference.policyVersion !== record.policyVersion ||
      policy.providerId !== record.providerId ||
      policy.modelId !== record.modelId ||
      policy.policyVersion !== record.policyVersion ||
      !reference.sourceEventIds.every((id) => validEventId(id)) ||
      !isReferenceCurrentAt(reference, record.assessedAt) ||
      !boundProviders.add(record.providerId) ||
      !boundReferences.add(record.credentialRefId) ||
      !boundPolicies.add(record.endpointPolicyId)
    ) {
      throw invalidConfiguration();
    }
    validateExactProvenance(record, capability, reference, policy);
    validateLane(record, capability.capability, reference);
  }
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
      !hasExactStringList(reference.capabilityScopes, ["model-inference"]) ||
      capability.costPolicy !== "local-compute" || capability.approvalProfile !== "local-only" ||
      !hasExactCredentialRequirement(capability, "local-no-secret")
    ) {
      throw invalidConfiguration();
    }
    return;
  }

  if (isOfficialHarness) {
    if (
      record.lane !== "official-harness" || record.officialEvidence === undefined ||
      !hasCanonicalOfficialHarnessIdentity(capability, reference) ||
      !hasExactStringList(reference.capabilityScopes, ["harness-execution"]) ||
      capability.costPolicy !== "subscription-entitlement" || capability.approvalProfile !== "harness-workspace-gated" ||
      capability.toolSupport !== "harness-tools" || capability.structuredOutputSupport !== "harness-mediated" ||
      !hasExactStringList(capability.workspaceScopes, ["workspace", "user"]) ||
      !capability.diagnosticContract.includes("needs-device-sign-in") ||
      !hasExactCredentialRequirement(capability, reference.credentialKind)
    ) {
      throw invalidConfiguration();
    }
    return;
  }

  if (
    record.lane !== "byok" || record.officialEvidence !== undefined ||
    capability.backendKind !== "openai-compatible-api" ||
    reference.credentialKind !== "api-key-bearer" ||
    !hasExactStringList(reference.capabilityScopes, ["model-inference"]) ||
    capability.costPolicy !== "metered-api" || capability.approvalProfile !== "remote-byte-transfer-gated" ||
    !capability.diagnosticContract.includes("requires-byte-transfer-approval") ||
    !hasExactCredentialRequirement(capability, "api-key-bearer")
  ) {
    throw invalidConfiguration();
  }
}

function validateExactProvenance(
  record: CurrentProviderFeasibility,
  capability: CanonicalProviderCapability,
  reference: CredentialReference,
  policy: CanonicalEndpointPolicy
): void {
  const required = [
    capability.capabilitySourceEventId,
    ...reference.sourceEventIds,
    ...policy.sourceEventIds,
    ...(record.officialEvidence?.officialSourceEventIds ?? [])
  ];
  if (new Set(required).size !== required.length || !hasExactStringList(record.sourceEventIds, sortStrings(required))) {
    throw invalidConfiguration();
  }
}

function hasCanonicalOfficialHarnessIdentity(
  capability: ProviderCapabilityDescriptor,
  reference: CredentialReference
): boolean {
  return (
    capability.backendKind === "openai-codex-harness" &&
    openaiCodexProviderIdPattern.test(capability.providerId) &&
    isOfficialHarnessCredentialKind(reference.credentialKind)
  ) || (
    capability.backendKind === "xai-harness" &&
    xaiProviderIdPattern.test(capability.providerId) &&
    isOfficialHarnessCredentialKind(reference.credentialKind)
  );
}

function isOfficialHarnessCredentialKind(credentialKind: CredentialKind): boolean {
  return credentialKind === "subscription-oauth" || credentialKind === "device-code-oauth";
}

function hasExactCredentialRequirement(capability: ProviderCapabilityDescriptor, credentialKind: CredentialKind): boolean {
  const requirement = capability.credentialRequirements[0];
  return capability.credentialRequirements.length === 1 &&
    requirement !== undefined &&
    requirement.credentialKind === credentialKind &&
    requirement.required;
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
  const parsed = credentialKindSchema.safeParse(value);
  if (!parsed.success) throw invalidConfiguration();
  return parsed.data;
}

function requireHash(value: unknown): `sha256:${string}` {
  if (!isHash(value)) throw invalidConfiguration();
  return value;
}

function requireEventId(value: unknown): `evt_${string}` {
  if (!isEventId(value)) throw invalidConfiguration();
  return value;
}

function freezeEventIds(value: unknown): readonly `evt_${string}`[] {
  if (!Array.isArray(value) || value.length === 0) throw invalidConfiguration();
  const ids = value.map(requireEventId);
  if (new Set(ids).size !== ids.length) throw invalidConfiguration();
  return Object.freeze(sortEventIds(ids));
}

function validEventIds(value: readonly string[]): boolean {
  return value.length > 0 && new Set(value).size === value.length && value.every(validEventId);
}

function validEventId(value: string): boolean {
  return eventIdPattern.test(value) && isSafeText(value);
}

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && hashPattern.test(value);
}

function isEventId(value: unknown): value is `evt_${string}` {
  return typeof value === "string" && eventIdPattern.test(value) && isSafeText(value);
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
  return value.length > 0 && isAgentSecretSafeText(value);
}

function requireIsoDate(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !isSafeText(value)) throw invalidConfiguration();
  return value;
}

function freezeSorted<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  return Object.freeze([...values].sort((left, right) => compareStrings(key(left), key(right))));
}

function sortStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort(compareStrings));
}

function sortEventIds(ids: readonly `evt_${string}`[]): `evt_${string}`[] {
  return [...ids].sort(compareStrings);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasExactStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlainOwnData(value: unknown): unknown {
  if (typeof value === "string") {
    if (hasForbiddenTextMaterial(value)) throw invalidConfiguration();
    return value;
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
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
  const normalized: Record<string, unknown> = {};
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

function hasForbiddenTextMaterial(value: string): boolean {
  return (
    (!hashPattern.test(value) && uriSchemePattern.test(value)) ||
    hasIpAddress(value) ||
    localhostPattern.test(value) ||
    dnsHostPattern.test(value)
  );
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
  for (const match of value.matchAll(standardUrlIpv4TokenPattern)) {
    const token = match[1];
    if (token !== undefined && isIP(new URL(`http://${token}`).hostname) === 4) return true;
  }
  return false;
}

function invalidConfiguration(): TypeError {
  return new TypeError("invalid provider configuration");
}
