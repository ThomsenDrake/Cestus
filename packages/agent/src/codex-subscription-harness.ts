import { isAgentSecretSafeText } from "./secret-safety.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const workspaceIdPattern = /^workspace_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const providerIdPattern = /^provider_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
const policyVersionPattern = /^policy_[a-zA-Z0-9_.-]+$/;
const officialFlowIdPattern = /^codex-[a-z0-9][a-z0-9.-]{0,127}$/;

const forbiddenOfficialFlowKinds = new Set([
  "browser-cookie",
  "browser-session-storage",
  "token-cache",
  "cli-auth-store",
  "environment-token",
  "intercepted-header",
  "undocumented-api",
  "reverse-engineered-device-grant",
  "subscription-token-as-api-key"
]);

export interface CodexOfficialFlowUnavailableEvidence {
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

export interface CodexSubscriptionHarness {
  assess(input: unknown): Promise<CodexSubscriptionHarnessResult>;
}

export type CodexSubscriptionHarnessResult =
  | {
    readonly kind: "unavailable";
    readonly category: "official-flow-unavailable";
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly ["official-flow-unavailable"];
  }
  | {
    readonly kind: "interface-demonstrated";
    readonly category: "official-flow-interface-only";
    readonly actualCodexFeasibility: false;
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly ["official-flow-interface-only"];
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

export interface CreateCodexSubscriptionHarnessInput {
  readonly currentPosture: CodexSubscriptionHarnessPosture;
  readonly feasibilityAuthority: CodexFeasibilityAuthority;
}

export interface CodexFeasibilityAuthority {
  appendOfficialFlowUnavailable(evidence: CodexOfficialFlowUnavailableEvidence): Promise<unknown>;
}

export interface CodexSubscriptionHarnessPosture {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialReference: CodexHarnessCredentialReference;
  readonly policy: CodexHarnessPolicy;
  readonly approval: CodexHarnessApproval;
  readonly sourceEventIds: readonly string[];
}

export interface CodexHarnessCredentialReference {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly status: "healthy";
  readonly capabilityScopes: readonly ["harness-execution", ..."harness-execution"[]];
}

export interface CodexHarnessPolicy {
  readonly policyVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly allowOfficialCodexHarness: true;
  readonly officialFlowId: string;
}

export interface CodexHarnessApproval {
  readonly approvalClass: "provider-byte-transfer";
  readonly status: "approved";
  readonly bindingHash: string;
}

interface NormalizedCreateInput {
  readonly currentPosture: NormalizedPosture;
  readonly feasibilityAuthority: CodexFeasibilityAuthority;
}

interface NormalizedPosture {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly credentialRefId: string;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly credentialScopeIdentity: string;
  readonly policyVersion: string;
  readonly officialFlowId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly approvalBindingHash: string;
  readonly sourceEventIds: readonly string[];
  readonly identity: string;
}

type NormalizedOfficialFlow =
  | { readonly kind: "absent" }
  | { readonly kind: "test-interface"; readonly officialFlowId: string; readonly documentationHash: string }
  | { readonly kind: "prohibited" }
  | { readonly kind: "invalid" };

interface NormalizedAssessment {
  readonly posture: NormalizedPosture;
  readonly officialFlow: NormalizedOfficialFlow;
}

const unavailableProviderId = "provider_openai_codex_unavailable";
const unavailableModelId = "codex-unavailable";
const unavailableHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

/**
 * This adapter has no network, secret-resolution, token, or provider-request
 * port. It can only record safe unavailable feasibility through its supplied
 * mounted authority or demonstrate a credential-free test interface route.
 */
export function createCodexSubscriptionHarness(input: unknown): CodexSubscriptionHarness {
  const configured = normalizeCreateInput(input);

  return Object.freeze({
    async assess(candidate: unknown): Promise<CodexSubscriptionHarnessResult> {
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
      if (assessment.officialFlow.kind === "test-interface") {
        if (assessment.officialFlow.officialFlowId !== configured.currentPosture.officialFlowId) {
          return blocked("posture-mismatch", configured.currentPosture);
        }
        return interfaceDemonstrated(configured.currentPosture);
      }

      const evidence = unavailableEvidence(configured.currentPosture);
      try {
        await configured.feasibilityAuthority.appendOfficialFlowUnavailable(evidence);
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
  if (currentPosture === undefined || feasibilityAuthority === undefined) {
    return undefined;
  }
  return Object.freeze({ currentPosture, feasibilityAuthority });
}

function normalizeFeasibilityAuthority(value: unknown): CodexFeasibilityAuthority | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined ||
      !hasExactKeys(record, ["appendOfficialFlowUnavailable"]) ||
      typeof record.appendOfficialFlowUnavailable !== "function") {
    return undefined;
  }
  return Object.freeze({
    appendOfficialFlowUnavailable: record.appendOfficialFlowUnavailable as CodexFeasibilityAuthority["appendOfficialFlowUnavailable"]
  });
}

function normalizeAssessment(value: unknown): NormalizedAssessment | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["posture", "officialFlow"])) {
    return undefined;
  }
  const posture = normalizePosture(record.posture);
  const officialFlow = normalizeOfficialFlow(record.officialFlow);
  if (posture === undefined) {
    return undefined;
  }
  return Object.freeze({ posture, officialFlow });
}

function normalizeOfficialFlow(value: unknown): NormalizedOfficialFlow {
  if (value === undefined) {
    return Object.freeze({ kind: "absent" });
  }
  const record = plainOwnDataRecord(value);
  if (record === undefined || typeof record.kind !== "string") {
    return Object.freeze({ kind: "invalid" });
  }
  if (forbiddenOfficialFlowKinds.has(record.kind)) {
    return Object.freeze({ kind: "prohibited" });
  }
  if (!hasExactKeys(record, ["kind", "officialFlowId", "documentationHash", "interfaceOnly"]) ||
      record.kind !== "test-official-codex-route" ||
      !isSafeId(record.officialFlowId, officialFlowIdPattern) ||
      !isSafeHash(record.documentationHash) ||
      record.interfaceOnly !== true) {
    return Object.freeze({ kind: "invalid" });
  }
  return Object.freeze({
    kind: "test-interface",
    officialFlowId: record.officialFlowId,
    documentationHash: record.documentationHash
  });
}

function normalizePosture(value: unknown): NormalizedPosture | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "residentAgentId",
    "workspaceId",
    "mountInstanceId",
    "taskId",
    "attemptId",
    "runId",
    "providerId",
    "modelId",
    "capabilityHash",
    "credentialReference",
    "policy",
    "approval",
    "sourceEventIds"
  ])) {
    return undefined;
  }
  if (record.residentAgentId !== "agent_default" ||
      !isSafeId(record.workspaceId, workspaceIdPattern) ||
      !isSafeId(record.mountInstanceId, mountInstanceIdPattern) ||
      !isSafeId(record.taskId, taskIdPattern) ||
      !isSafeId(record.attemptId, attemptIdPattern) ||
      !isSafeId(record.runId, runIdPattern) ||
      !isSafeId(record.providerId, providerIdPattern) ||
      !isSafeId(record.modelId, modelIdPattern) ||
      !isSafeHash(record.capabilityHash)) {
    return undefined;
  }

  const credential = normalizeCredentialReference(record.credentialReference);
  const policy = normalizePolicy(record.policy);
  const approval = normalizeApproval(record.approval);
  const sourceEventIds = plainSafeStringArray(record.sourceEventIds, eventIdPattern);
  if (credential === undefined || policy === undefined || approval === undefined || sourceEventIds === undefined ||
      credential.providerId !== record.providerId ||
      policy.providerId !== record.providerId ||
      policy.modelId !== record.modelId ||
      policy.capabilityHash !== record.capabilityHash) {
    return undefined;
  }

  const normalized = {
    residentAgentId: "agent_default" as const,
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
    credentialScopeIdentity: JSON.stringify(credential.capabilityScopes),
    policyVersion: policy.policyVersion,
    officialFlowId: policy.officialFlowId,
    approvalClass: approval.approvalClass,
    approvalBindingHash: approval.bindingHash,
    sourceEventIds,
    identity: ""
  };
  normalized.identity = JSON.stringify(normalized);
  return Object.freeze({
    ...normalized,
    sourceEventIds: Object.freeze([...sourceEventIds])
  });
}

function normalizeCredentialReference(value: unknown): {
  readonly credentialRefId: string;
  readonly providerId: string;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScopes: readonly string[];
} | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "credentialRefId",
    "providerId",
    "credentialKind",
    "status",
    "capabilityScopes"
  ]) ||
      !isSafeId(record.credentialRefId, credentialRefIdPattern) ||
      !isSafeId(record.providerId, providerIdPattern) ||
      (record.credentialKind !== "subscription-oauth" && record.credentialKind !== "device-code-oauth") ||
      record.status !== "healthy") {
    return undefined;
  }
  const scopes = plainSafeStringArray(record.capabilityScopes, /^[a-z-]+$/);
  if (scopes === undefined || !scopes.includes("harness-execution")) {
    return undefined;
  }
  return Object.freeze({
    credentialRefId: record.credentialRefId,
    providerId: record.providerId,
    credentialKind: record.credentialKind,
    capabilityScopes: Object.freeze([...scopes])
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
    "policyVersion",
    "providerId",
    "modelId",
    "capabilityHash",
    "allowOfficialCodexHarness",
    "officialFlowId"
  ]) ||
      !isSafeId(record.policyVersion, policyVersionPattern) ||
      !isSafeId(record.providerId, providerIdPattern) ||
      !isSafeId(record.modelId, modelIdPattern) ||
      !isSafeHash(record.capabilityHash) ||
      record.allowOfficialCodexHarness !== true ||
      !isSafeId(record.officialFlowId, officialFlowIdPattern)) {
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

function normalizeApproval(value: unknown): {
  readonly approvalClass: "provider-byte-transfer";
  readonly bindingHash: string;
} | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["approvalClass", "status", "bindingHash"]) ||
      record.approvalClass !== "provider-byte-transfer" ||
      record.status !== "approved" ||
      !isSafeHash(record.bindingHash)) {
    return undefined;
  }
  return Object.freeze({ approvalClass: "provider-byte-transfer", bindingHash: record.bindingHash });
}

function unavailableEvidence(posture: NormalizedPosture): CodexOfficialFlowUnavailableEvidence {
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

function unavailable(posture: NormalizedPosture): CodexSubscriptionHarnessResult {
  return Object.freeze({
    kind: "unavailable",
    category: "official-flow-unavailable",
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityHash: posture.capabilityHash,
    safeDiagnosticCodes: Object.freeze(["official-flow-unavailable"] as const)
  });
}

function interfaceDemonstrated(posture: NormalizedPosture): CodexSubscriptionHarnessResult {
  return Object.freeze({
    kind: "interface-demonstrated",
    category: "official-flow-interface-only",
    actualCodexFeasibility: false,
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityHash: posture.capabilityHash,
    safeDiagnosticCodes: Object.freeze(["official-flow-interface-only"] as const)
  });
}

function blocked(
  category: Extract<CodexSubscriptionHarnessResult, { readonly kind: "blocked" }>["category"],
  posture?: NormalizedPosture
): CodexSubscriptionHarnessResult {
  return Object.freeze({
    kind: "blocked",
    category,
    providerId: posture?.providerId ?? unavailableProviderId,
    modelId: posture?.modelId ?? unavailableModelId,
    capabilityHash: posture?.capabilityHash ?? unavailableHash,
    safeDiagnosticCodes: Object.freeze([category])
  }) as CodexSubscriptionHarnessResult;
}

function isSafeHash(value: unknown): value is string {
  return isSafeId(value, hashPattern);
}

function isSafeId(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value) && isAgentSecretSafeText(value);
}

function plainSafeStringArray(value: unknown, itemPattern: RegExp): readonly string[] | undefined {
  try {
    if (!Array.isArray(value)) {
      return undefined;
    }
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = descriptors.length;
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" ||
        lengthDescriptor.value < 1 || !Number.isSafeInteger(lengthDescriptor.value)) {
      return undefined;
    }
    const length = lengthDescriptor.value;
    const values: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable ||
          !isSafeId(descriptor.value, itemPattern)) {
        return undefined;
      }
      values.push(descriptor.value);
    }
    if (Object.keys(descriptors).length !== length + 1) {
      return undefined;
    }
    return Object.freeze(values);
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
    if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copy = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
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
