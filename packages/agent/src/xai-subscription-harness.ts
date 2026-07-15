import { isAgentSecretSafeText } from "./secret-safety.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const workspaceIdPattern = /^workspace_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const xaiProviderIdPattern = /^provider_xai_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
const policyVersionPattern = /^policy_[a-zA-Z0-9_.-]+$/;
const officialFlowIdPattern = /^xai-[a-z0-9][a-z0-9.-]{0,127}$/;
const idempotencyKeyPattern = /^[a-zA-Z0-9_.|:-]+$/;

const prohibitedOfficialFlowKinds = new Set([
  "browser-cookie",
  "browser-session-storage",
  "browser-session-data",
  "token-cache",
  "cli-auth-store",
  "environment-token",
  "intercepted-header",
  "undocumented-endpoint",
  "reverse-engineered-grant",
  "subscription-to-api-key-conversion"
]);

export interface XaiOfficialFlowUnavailableEvidence {
  readonly recordVersion: "agent-provider-feasibility.v1";
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialRefId: string;
  readonly posture: "unavailable";
  readonly category: "official-flow-unavailable";
  readonly policyVersion: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly runId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly sourceEventIds: readonly string[];
  readonly documentationHash: string | undefined;
  readonly idempotencyKey: string;
}

export interface XaiSubscriptionHarness {
  assess(input: unknown): Promise<XaiSubscriptionHarnessResult>;
}

export type XaiSubscriptionHarnessResult =
  | {
    readonly kind: "unavailable";
    readonly category: "official-flow-unavailable";
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly ["official-flow-unavailable"];
  }
  | {
    readonly kind: "blocked";
    readonly category:
      | "unsafe-input"
      | "posture-mismatch"
      | "prohibited-credential-source"
      | "feasibility-append-unavailable";
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly [
      "unsafe-input" | "posture-mismatch" | "prohibited-credential-source" | "feasibility-append-unavailable"
    ];
  };

export interface XaiFeasibilityAuthority {
  appendOfficialFlowUnavailable(
    evidence: XaiOfficialFlowUnavailableEvidence
  ): Promise<XaiOfficialFlowUnavailableAppendReadback>;
}

export interface XaiOfficialFlowUnavailableAppendReadback {
  readonly record: XaiOfficialFlowUnavailableEvidence;
  readonly feasibilityEventId: string;
  readonly readbackEventId: string;
}

export interface XaiSubscriptionHarnessPosture {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialReference: XaiHarnessCredentialReference;
  readonly policy: XaiHarnessPolicy;
  readonly approval: XaiHarnessApproval;
  readonly sourceEventIds: readonly string[];
}

export interface XaiHarnessCredentialReference {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly status: "healthy";
  readonly capabilityScopes: readonly ["harness-execution", ..."harness-execution"[]];
}

export interface XaiHarnessPolicy {
  readonly policyVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly allowOfficialXaiHarness: true;
  readonly officialFlowId: string;
}

export interface XaiHarnessApproval {
  readonly approvalClass: "provider-byte-transfer";
  readonly status: "approved";
  readonly bindingHash: string;
}

interface NormalizedCreateInput {
  readonly currentPosture: NormalizedPosture;
  readonly feasibilityAuthority: XaiFeasibilityAuthority;
}

interface NormalizedPosture {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialRefId: string;
  readonly policyVersion: string;
  readonly officialFlowId: string;
  readonly sourceEventIds: readonly string[];
  readonly identity: string;
}

type NormalizedOfficialFlow =
  | { readonly kind: "absent" }
  | { readonly kind: "prohibited" }
  | { readonly kind: "invalid" };

interface NormalizedAssessment {
  readonly posture: NormalizedPosture;
  readonly officialFlow: NormalizedOfficialFlow;
}

const unavailableProviderId = "provider_xai_unavailable";
const unavailableModelId = "xai-unavailable";
const unavailableHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

/**
 * xAI feasibility is intentionally limited to a supplied mounted append port.
 * It has no secret, network, token, API-key, or alternate-provider port.
 */
export function createXaiSubscriptionHarness(input: unknown): XaiSubscriptionHarness {
  const configured = normalizeCreateInput(input);

  return Object.freeze({
    async assess(candidate: unknown): Promise<XaiSubscriptionHarnessResult> {
      const assessment = normalizeAssessment(candidate);
      if (assessment === undefined) {
        return blocked("unsafe-input");
      }
      if (configured === undefined) {
        return blocked("unsafe-input", assessment.posture);
      }
      if (assessment.posture.identity !== configured.currentPosture.identity) {
        return blocked("posture-mismatch", configured.currentPosture);
      }
      if (assessment.officialFlow.kind === "prohibited") {
        return blocked("prohibited-credential-source", configured.currentPosture);
      }
      if (assessment.officialFlow.kind === "invalid") {
        return blocked("unsafe-input", configured.currentPosture);
      }
      const evidence = unavailableEvidence(configured.currentPosture);
      try {
        const readback = await configured.feasibilityAuthority.appendOfficialFlowUnavailable(evidence);
        if (!isExactMountedAppendReadback(readback, evidence)) {
          return blocked("feasibility-append-unavailable", configured.currentPosture);
        }
      } catch {
        return blocked("feasibility-append-unavailable", configured.currentPosture);
      }
      return unavailable(configured.currentPosture);
    }
  });
}

function normalizeCreateInput(value: unknown): NormalizedCreateInput | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["currentPosture", "feasibilityAuthority"])) {
    return undefined;
  }
  const currentPosture = normalizePosture(record.currentPosture);
  const feasibilityAuthority = normalizeFeasibilityAuthority(record.feasibilityAuthority);
  return currentPosture === undefined || feasibilityAuthority === undefined
    ? undefined
    : Object.freeze({ currentPosture, feasibilityAuthority });
}

function normalizeFeasibilityAuthority(value: unknown): XaiFeasibilityAuthority | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["appendOfficialFlowUnavailable"]) ||
      typeof record.appendOfficialFlowUnavailable !== "function") {
    return undefined;
  }
  return Object.freeze({
    appendOfficialFlowUnavailable: record.appendOfficialFlowUnavailable as XaiFeasibilityAuthority["appendOfficialFlowUnavailable"]
  });
}

function normalizeAssessment(value: unknown): NormalizedAssessment | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["posture", "officialFlow"])) {
    return undefined;
  }
  const posture = normalizePosture(record.posture);
  return posture === undefined
    ? undefined
    : Object.freeze({ posture, officialFlow: normalizeOfficialFlow(record.officialFlow) });
}

function normalizeOfficialFlow(value: unknown): NormalizedOfficialFlow {
  if (value === undefined) {
    return Object.freeze({ kind: "absent" });
  }
  if (hasProhibitedOfficialFlowKind(value)) {
    return Object.freeze({ kind: "prohibited" });
  }
  return Object.freeze({ kind: "invalid" });
}

function hasProhibitedOfficialFlowKind(value: unknown): boolean {
  try {
    if (value === null || typeof value !== "object") {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const kind = Object.getOwnPropertyDescriptor(value, "kind");
    return kind !== undefined && "value" in kind && typeof kind.value === "string" && prohibitedOfficialFlowKinds.has(kind.value);
  } catch {
    return false;
  }
}

function normalizePosture(value: unknown): NormalizedPosture | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "residentAgentId", "workspaceId", "mountInstanceId", "taskId", "attemptId", "runId", "providerId", "modelId",
    "capabilityHash", "credentialReference", "policy", "approval", "sourceEventIds"
  ]) || record.residentAgentId !== "agent_default" ||
      !isSafeId(record.workspaceId, workspaceIdPattern) || !isSafeId(record.mountInstanceId, mountInstanceIdPattern) ||
      !isSafeId(record.taskId, taskIdPattern) || !isSafeId(record.attemptId, attemptIdPattern) || !isSafeId(record.runId, runIdPattern) ||
      !isSafeId(record.providerId, xaiProviderIdPattern) || !isSafeId(record.modelId, modelIdPattern) || !isSafeHash(record.capabilityHash)) {
    return undefined;
  }
  const credential = normalizeCredentialReference(record.credentialReference);
  const policy = normalizePolicy(record.policy);
  const approval = normalizeApproval(record.approval);
  const sourceEventIds = plainSafeStringArray(record.sourceEventIds, eventIdPattern);
  if (credential === undefined || policy === undefined || approval === undefined || sourceEventIds === undefined ||
      credential.providerId !== record.providerId || policy.providerId !== record.providerId ||
      policy.modelId !== record.modelId || policy.capabilityHash !== record.capabilityHash) {
    return undefined;
  }
  const facts = {
    workspaceId: record.workspaceId,
    mountInstanceId: record.mountInstanceId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    runId: record.runId,
    providerId: record.providerId,
    modelId: record.modelId,
    capabilityHash: record.capabilityHash,
    credentialRefId: credential.credentialRefId,
    credentialKind: credential.credentialKind,
    credentialScopes: credential.capabilityScopes,
    policyVersion: policy.policyVersion,
    officialFlowId: policy.officialFlowId,
    approvalClass: approval.approvalClass,
    approvalBindingHash: approval.bindingHash,
    sourceEventIds
  };
  return Object.freeze({
    workspaceId: facts.workspaceId,
    mountInstanceId: facts.mountInstanceId,
    runId: facts.runId,
    providerId: facts.providerId,
    modelId: facts.modelId,
    capabilityHash: facts.capabilityHash,
    credentialRefId: facts.credentialRefId,
    policyVersion: facts.policyVersion,
    officialFlowId: facts.officialFlowId,
    sourceEventIds: Object.freeze([...sourceEventIds]),
    identity: JSON.stringify(facts)
  });
}

function normalizeCredentialReference(value: unknown): {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScopes: readonly string[];
} | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["credentialRefId", "providerId", "credentialKind", "status", "capabilityScopes"]) ||
      !isSafeId(record.credentialRefId, credentialRefIdPattern) || !isSafeId(record.providerId, xaiProviderIdPattern) ||
      (record.credentialKind !== "subscription-oauth" && record.credentialKind !== "device-code-oauth") || record.status !== "healthy") {
    return undefined;
  }
  const capabilityScopes = plainSafeStringArray(record.capabilityScopes, /^[a-z-]+$/);
  if (capabilityScopes === undefined || !capabilityScopes.includes("harness-execution")) {
    return undefined;
  }
  return Object.freeze({
    credentialRefId: record.credentialRefId,
    providerId: record.providerId,
    credentialKind: record.credentialKind,
    capabilityScopes
  });
}

function normalizePolicy(value: unknown): {
  readonly policyVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly officialFlowId: string;
} | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "policyVersion", "providerId", "modelId", "capabilityHash", "allowOfficialXaiHarness", "officialFlowId"
  ]) || !isSafeId(record.policyVersion, policyVersionPattern) || !isSafeId(record.providerId, xaiProviderIdPattern) ||
      !isSafeId(record.modelId, modelIdPattern) || !isSafeHash(record.capabilityHash) ||
      record.allowOfficialXaiHarness !== true || !isSafeId(record.officialFlowId, officialFlowIdPattern)) {
    return undefined;
  }
  return Object.freeze({
    policyVersion: record.policyVersion,
    providerId: record.providerId,
    modelId: record.modelId,
    capabilityHash: record.capabilityHash,
    officialFlowId: record.officialFlowId
  });
}

function normalizeApproval(value: unknown): { readonly approvalClass: "provider-byte-transfer"; readonly bindingHash: string } | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["approvalClass", "status", "bindingHash"]) ||
      record.approvalClass !== "provider-byte-transfer" || record.status !== "approved" || !isSafeHash(record.bindingHash)) {
    return undefined;
  }
  return Object.freeze({ approvalClass: "provider-byte-transfer", bindingHash: record.bindingHash });
}

function unavailableEvidence(posture: NormalizedPosture): XaiOfficialFlowUnavailableEvidence {
  return Object.freeze({
    recordVersion: "agent-provider-feasibility.v1",
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityHash: posture.capabilityHash,
    credentialRefId: posture.credentialRefId,
    posture: "unavailable",
    category: "official-flow-unavailable",
    policyVersion: posture.policyVersion,
    workspaceId: posture.workspaceId,
    mountInstanceId: posture.mountInstanceId,
    runId: posture.runId,
    approvalClass: "provider-byte-transfer",
    sourceEventIds: Object.freeze([...posture.sourceEventIds]),
    documentationHash: undefined,
    idempotencyKey: [posture.providerId, posture.officialFlowId, posture.policyVersion, posture.mountInstanceId].join("|")
  });
}

function isExactMountedAppendReadback(value: unknown, expected: XaiOfficialFlowUnavailableEvidence): boolean {
  const readback = plainOwnDataRecord(value);
  if (readback === undefined || !hasExactKeys(readback, ["record", "feasibilityEventId", "readbackEventId"]) ||
      !isSafeId(readback.feasibilityEventId, eventIdPattern) || !isSafeId(readback.readbackEventId, eventIdPattern) ||
      readback.feasibilityEventId === readback.readbackEventId) {
    return false;
  }
  const evidence = normalizeOfficialFlowUnavailableEvidence(readback.record);
  return evidence !== undefined && sameUnavailableEvidence(evidence, expected);
}

function normalizeOfficialFlowUnavailableEvidence(value: unknown): XaiOfficialFlowUnavailableEvidence | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "recordVersion", "providerId", "modelId", "capabilityHash", "credentialRefId", "posture", "category", "policyVersion",
    "workspaceId", "mountInstanceId", "runId", "approvalClass", "sourceEventIds", "documentationHash", "idempotencyKey"
  ]) || record.recordVersion !== "agent-provider-feasibility.v1" ||
      !isSafeId(record.providerId, xaiProviderIdPattern) || !isSafeId(record.modelId, modelIdPattern) ||
      !isSafeHash(record.capabilityHash) || !isSafeId(record.credentialRefId, credentialRefIdPattern) ||
      record.posture !== "unavailable" || record.category !== "official-flow-unavailable" ||
      !isSafeId(record.policyVersion, policyVersionPattern) || !isSafeId(record.workspaceId, workspaceIdPattern) ||
      !isSafeId(record.mountInstanceId, mountInstanceIdPattern) || !isSafeId(record.runId, runIdPattern) ||
      record.approvalClass !== "provider-byte-transfer" || record.documentationHash !== undefined ||
      !isSafeId(record.idempotencyKey, idempotencyKeyPattern)) {
    return undefined;
  }
  const sourceEventIds = plainSafeStringArray(record.sourceEventIds, eventIdPattern);
  if (sourceEventIds === undefined) {
    return undefined;
  }
  return Object.freeze({
    recordVersion: "agent-provider-feasibility.v1",
    providerId: record.providerId,
    modelId: record.modelId,
    capabilityHash: record.capabilityHash,
    credentialRefId: record.credentialRefId,
    posture: "unavailable",
    category: "official-flow-unavailable",
    policyVersion: record.policyVersion,
    workspaceId: record.workspaceId,
    mountInstanceId: record.mountInstanceId,
    runId: record.runId,
    approvalClass: "provider-byte-transfer",
    sourceEventIds,
    documentationHash: undefined,
    idempotencyKey: record.idempotencyKey
  });
}

function sameUnavailableEvidence(
  actual: XaiOfficialFlowUnavailableEvidence,
  expected: XaiOfficialFlowUnavailableEvidence
): boolean {
  return actual.recordVersion === expected.recordVersion &&
    actual.providerId === expected.providerId && actual.modelId === expected.modelId &&
    actual.capabilityHash === expected.capabilityHash && actual.credentialRefId === expected.credentialRefId &&
    actual.posture === expected.posture && actual.category === expected.category && actual.policyVersion === expected.policyVersion &&
    actual.workspaceId === expected.workspaceId && actual.mountInstanceId === expected.mountInstanceId && actual.runId === expected.runId &&
    actual.approvalClass === expected.approvalClass && actual.documentationHash === expected.documentationHash &&
    actual.idempotencyKey === expected.idempotencyKey && sameStrings(actual.sourceEventIds, expected.sourceEventIds);
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function unavailable(posture: NormalizedPosture): XaiSubscriptionHarnessResult {
  return Object.freeze({
    kind: "unavailable",
    category: "official-flow-unavailable",
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityHash: posture.capabilityHash,
    safeDiagnosticCodes: Object.freeze(["official-flow-unavailable"] as const)
  });
}

function blocked(
  category: Extract<XaiSubscriptionHarnessResult, { readonly kind: "blocked" }>["category"],
  posture?: NormalizedPosture
): XaiSubscriptionHarnessResult {
  return Object.freeze({
    kind: "blocked",
    category,
    providerId: posture?.providerId ?? unavailableProviderId,
    modelId: posture?.modelId ?? unavailableModelId,
    capabilityHash: posture?.capabilityHash ?? unavailableHash,
    safeDiagnosticCodes: Object.freeze([category])
  }) as XaiSubscriptionHarnessResult;
}

function isSafeHash(value: unknown): value is string {
  return isSafeId(value, hashPattern);
}

function isSafeId(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value) && isAgentSecretSafeText(value);
}

function plainSafeStringArray(value: unknown, itemPattern: RegExp): readonly string[] | undefined {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = descriptors.length;
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number" ||
        lengthDescriptor.value < 1 || !Number.isSafeInteger(lengthDescriptor.value)) {
      return undefined;
    }
    const values: string[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable || !isSafeId(descriptor.value, itemPattern)) {
        return undefined;
      }
      values.push(descriptor.value);
    }
    return Object.keys(descriptors).length === lengthDescriptor.value + 1 ? Object.freeze(values) : undefined;
  } catch {
    return undefined;
  }
}

function plainOwnDataRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const copy = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (key === "__proto__" || !descriptor.enumerable || !("value" in descriptor)) {
        return undefined;
      }
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch {
    return undefined;
  }
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}
