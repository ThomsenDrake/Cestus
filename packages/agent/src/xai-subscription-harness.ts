import {
  createOfficialFlowAbsenceWitness,
  type OfficialFlowAbsenceWitnessV1
} from "./official-flow-feasibility.js";
import { isAgentSecretSafeText } from "./secret-safety.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const workspaceIdPattern = /^ws_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-f0-9]{64}$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const xaiProviderIdPattern = /^provider_xai_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
const policyVersionPattern = /^policy_[a-zA-Z0-9_.-]+$/;
const officialFlowIdPattern = /^xai-[a-z0-9][a-z0-9.-]{0,127}$/;

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

export interface XaiSubscriptionHarness {
  assess(input: unknown): Promise<XaiSubscriptionHarnessResult>;
}

type OfficialFlowClassifierBlockedCategory =
  | "unsafe-input"
  | "posture-mismatch"
  | "prohibited-credential-source";

type OfficialFlowClassifierBlockedMember<C extends OfficialFlowClassifierBlockedCategory> = {
  readonly kind: "blocked";
  readonly category: C;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityHash: string;
  readonly safeDiagnosticCodes: readonly [C];
};

type OfficialFlowClassifierBlocked = {
  [C in OfficialFlowClassifierBlockedCategory]: OfficialFlowClassifierBlockedMember<C>;
}[OfficialFlowClassifierBlockedCategory];

export type XaiSubscriptionHarnessResult =
  | {
    readonly kind: "official-flow-absence-classified";
    readonly category: "official-flow-absent";
    readonly witness: OfficialFlowAbsenceWitnessV1;
  }
  | OfficialFlowClassifierBlocked;

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
  readonly causationEventId: string;
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
  readonly capabilityScopes: readonly string[];
  readonly policyVersion: string;
  readonly officialFlowId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly approvalBindingHash: string;
  readonly sourceEventIds: readonly string[];
  readonly causationEventId: string;
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

const blockedProviderId = "provider_xai_blocked";
const blockedModelId = "xai-blocked";
const blockedHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

/**
 * xAI absence classification is deliberately pure: it cannot inspect secrets,
 * talk to a provider, append evidence, or accept a mounted authority port.
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

      try {
        const witness = createOfficialFlowAbsenceWitness({
          configuredPosture: asOfficialFlowAbsencePosture(configured.currentPosture),
          assessedPosture: asOfficialFlowAbsencePosture(assessment.posture),
          officialFlow: undefined
        });
        return Object.freeze({
          kind: "official-flow-absence-classified" as const,
          category: "official-flow-absent" as const,
          witness
        });
      } catch {
        return blocked("unsafe-input", configured.currentPosture);
      }
    }
  });
}

function normalizeCreateInput(value: unknown): NormalizedCreateInput | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, ["currentPosture"])) {
    return undefined;
  }
  const currentPosture = normalizePosture(record.currentPosture);
  return currentPosture === undefined ? undefined : Object.freeze({ currentPosture });
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
    return kind !== undefined && "value" in kind &&
      typeof kind.value === "string" && prohibitedOfficialFlowKinds.has(kind.value);
  } catch {
    return false;
  }
}

function normalizePosture(value: unknown): NormalizedPosture | undefined {
  const record = plainOwnDataRecord(value);
  if (record === undefined || !hasExactKeys(record, [
    "residentAgentId", "workspaceId", "mountInstanceId", "taskId", "attemptId", "runId", "providerId", "modelId",
    "capabilityHash", "credentialReference", "policy", "approval", "sourceEventIds", "causationEventId"
  ]) || record.residentAgentId !== "agent_default" ||
      !isSafeId(record.workspaceId, workspaceIdPattern) || !isSafeId(record.mountInstanceId, mountInstanceIdPattern) ||
      !isSafeId(record.taskId, taskIdPattern) || !isSafeId(record.attemptId, attemptIdPattern) || !isSafeId(record.runId, runIdPattern) ||
      !isSafeId(record.providerId, xaiProviderIdPattern) || !isSafeId(record.modelId, modelIdPattern) || !isSafeHash(record.capabilityHash) ||
      !isSafeId(record.causationEventId, eventIdPattern)) {
    return undefined;
  }
  const credential = normalizeCredentialReference(record.credentialReference);
  const policy = normalizePolicy(record.policy);
  const approval = normalizeApproval(record.approval);
  const sourceEventIds = plainSafeStringArray(record.sourceEventIds, eventIdPattern);
  if (credential === undefined || policy === undefined || approval === undefined || sourceEventIds === undefined ||
      credential.providerId !== record.providerId || policy.providerId !== record.providerId ||
      policy.modelId !== record.modelId || policy.capabilityHash !== record.capabilityHash ||
      !sourceEventIds.includes(record.causationEventId)) {
    return undefined;
  }
  const facts = {
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
    capabilityScopes: credential.capabilityScopes,
    policyVersion: policy.policyVersion,
    officialFlowId: policy.officialFlowId,
    approvalClass: approval.approvalClass,
    approvalBindingHash: approval.bindingHash,
    sourceEventIds,
    causationEventId: record.causationEventId
  };
  return Object.freeze({
    ...facts,
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

function asOfficialFlowAbsencePosture(posture: NormalizedPosture): object {
  return Object.freeze({
    residentAgentId: posture.residentAgentId,
    workspaceId: posture.workspaceId,
    mountInstanceId: posture.mountInstanceId,
    taskId: posture.taskId,
    attemptId: posture.attemptId,
    runId: posture.runId,
    providerFamily: "xai" as const,
    providerId: posture.providerId,
    modelId: posture.modelId,
    capabilityHash: posture.capabilityHash,
    credentialRefId: posture.credentialRefId,
    credentialKind: posture.credentialKind,
    capabilityScopes: posture.capabilityScopes,
    policyVersion: posture.policyVersion,
    officialFlowId: posture.officialFlowId,
    approvalClass: posture.approvalClass,
    approvalBindingHash: posture.approvalBindingHash,
    sourceEventIds: posture.sourceEventIds,
    causationEventId: posture.causationEventId
  });
}

function blocked<C extends OfficialFlowClassifierBlockedCategory>(
  category: C,
  posture?: NormalizedPosture
): OfficialFlowClassifierBlockedMember<C> {
  const safeDiagnosticCodes: readonly [C] = [category];

  return Object.freeze({
    kind: "blocked" as const,
    category,
    providerId: posture?.providerId ?? blockedProviderId,
    modelId: posture?.modelId ?? blockedModelId,
    capabilityHash: posture?.capabilityHash ?? blockedHash,
    safeDiagnosticCodes
  });
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
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
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
    if (Object.keys(descriptors).length !== lengthDescriptor.value + 1 || new Set(values).size !== values.length) {
      return undefined;
    }
    return Object.freeze(values.sort());
  } catch {
    return undefined;
  }
}

function plainOwnDataRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
        Object.getOwnPropertySymbols(value).length > 0) {
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
