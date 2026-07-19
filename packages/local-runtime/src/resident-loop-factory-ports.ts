import { isIP } from "node:net";
import { types } from "node:util";
import { isAgentSecretSafeText } from "../../agent/src/secret-safety.js";
import type { ResidentLoopFactoryAuthorityReadback } from "./resident-loop-factory-composition.js";
import type { ResidentLoopProviderPosture } from "./resident-loop-provider-posture.js";

const workspaceIdPattern = /^ws_[a-zA-Z0-9_-]+$/;
const mountInstanceIdPattern = /^mount_[a-zA-Z0-9_-]+$/;
const admissionGenerationIdPattern = /^admission_generation_[0-9]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const providerIdPattern = /^provider_[a-zA-Z0-9_-]+$/;
const credentialRefIdPattern = /^agent_credref_[a-zA-Z0-9_-]+$/;
const endpointPolicyIdPattern = /^endpoint_policy_[a-zA-Z0-9_-]+$/;
const feasibilityIdPattern = /^provider_feasibility_[a-zA-Z0-9_-]+$/;
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
const releasedVersionPattern = /^(?:resident-loop-provider-posture|agent-provider-capability|agent-provider-auth|policy|adapter)\.v[12]$/;

export interface ResidentLoopFactoryPortsInput {
  readonly authorityReadback: ResidentLoopFactoryAuthorityReadback;
  readonly providerPosture: ResidentLoopProviderPosture;
}

export interface ResidentLoopFactoryPorts {
  readonly schemaVersion: "resident-loop-factory-ports.v1";
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
  readonly providerPosture: {
    readonly selection: {
      readonly providerId: string;
      readonly modelId: string;
      readonly adapterVersion: string;
    };
    readonly capability: {
      readonly capabilityId: string;
      readonly capabilityVersion: "agent-provider-capability.v2";
      readonly capabilityHash: `sha256:${string}`;
      readonly capabilityRevision: string;
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
  };
}

interface AuthorityReadback {
  readonly provider: WorkspaceBinding;
  readonly handoff: RunBinding & { readonly authorityBinding: HandoffBinding };
}

interface WorkspaceBinding {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly admissionGenerationId: string;
  readonly policyVersion: string;
  readonly policyDigest: `sha256:${string}`;
  readonly lockStateDigest: `sha256:${string}`;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
}

interface RunBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
}

interface HandoffBinding {
  readonly mountGeneration: string;
  readonly ledgerHighWaterEventId: string;
  readonly policyHash: `sha256:${string}`;
  readonly activeLocksHash: `sha256:${string}`;
}

interface ProviderPosture extends WorkspaceBinding, RunBinding {
  readonly selection: {
    readonly providerId: string;
    readonly modelId: string;
    readonly adapterVersion: string;
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

/**
 * Converts independently authenticated Core and P2 readbacks into the small,
 * data-only factory input consumed by the later bounded-loop factory. This
 * function has no issuer, handle, witness, storage, provider, or async path.
 */
export function createResidentLoopFactoryPorts(input: unknown): ResidentLoopFactoryPorts {
  const envelope = exactFrozenRecord(input, ["authorityReadback", "providerPosture"]);
  const authority = normalizeAuthorityReadback(envelope.authorityReadback);
  const posture = normalizeProviderPosture(envelope.providerPosture);
  requireExactBinding(authority, posture);

  return Object.freeze({
    schemaVersion: "resident-loop-factory-ports.v1" as const,
    residentAgentId: "agent_default" as const,
    workspace: Object.freeze({
      workspaceId: posture.workspaceId,
      mountInstanceId: posture.mountInstanceId,
      admissionGenerationId: posture.admissionGenerationId,
      policyVersion: posture.policyVersion,
      policyDigest: posture.policyDigest,
      lockStateDigest: posture.lockStateDigest,
      highWaterMark: posture.highWaterMark,
      highWaterOrdinal: posture.highWaterOrdinal
    }),
    run: Object.freeze({
      taskId: posture.taskId,
      attemptId: posture.attemptId,
      runId: posture.runId
    }),
    providerPosture: Object.freeze({
      selection: Object.freeze({ ...posture.selection }),
      capability: Object.freeze({
        capabilityId: posture.capability.capabilityId,
        capabilityVersion: posture.capability.capabilityVersion,
        capabilityHash: posture.capability.capabilityHash,
        capabilityRevision: posture.capability.capabilityRevision
      }),
      approval: Object.freeze({ ...posture.approval }),
      binding: Object.freeze({ ...posture.binding })
    })
  });
}

function normalizeAuthorityReadback(value: unknown): AuthorityReadback {
  const readback = exactFrozenRecord(value, ["provider", "handoff"]);
  const providerRecord = exactFrozenRecord(readback.provider, [
    "schemaVersion", "stage", "workspaceId", "mountInstanceId", "admissionGenerationId", "policyVersion",
    "policyDigest", "lockStateDigest", "highWaterMark", "highWaterOrdinal", "durableLedgerEventCount"
  ]);
  if (
    requiredText(providerRecord, "schemaVersion") !== "mounted-provider-authority-readback.v1" ||
    requiredText(providerRecord, "stage") !== "locator" ||
    requiredNonnegativeInteger(providerRecord, "durableLedgerEventCount") < 0
  ) throw unavailable();

  const handoffRecord = exactFrozenRecord(readback.handoff, [
    "taskId", "attemptId", "runId", "runType", "retryGeneration", "authorityBinding"
  ]);
  if (requiredText(handoffRecord, "runType").length === 0 || requiredNonnegativeInteger(handoffRecord, "retryGeneration") < 0) {
    throw unavailable();
  }
  const bindingRecord = exactFrozenRecord(handoffRecord.authorityBinding, [
    "workspaceIdentityHash", "mountGeneration", "ledgerStoreIdentity", "artifactStoreIdentity", "ledgerHighWaterEventId",
    "policyHash", "activeLocksHash"
  ]);
  requiredHash(bindingRecord, "workspaceIdentityHash");
  requiredText(bindingRecord, "ledgerStoreIdentity");
  requiredText(bindingRecord, "artifactStoreIdentity");

  return Object.freeze({
    provider: normalizeWorkspaceBinding(providerRecord),
    handoff: Object.freeze({
      taskId: requiredText(handoffRecord, "taskId"),
      attemptId: requiredText(handoffRecord, "attemptId"),
      runId: requiredText(handoffRecord, "runId"),
      authorityBinding: Object.freeze({
        mountGeneration: requiredText(bindingRecord, "mountGeneration"),
        ledgerHighWaterEventId: requiredText(bindingRecord, "ledgerHighWaterEventId"),
        policyHash: requiredHash(bindingRecord, "policyHash"),
        activeLocksHash: requiredHash(bindingRecord, "activeLocksHash")
      })
    })
  });
}

function normalizeProviderPosture(value: unknown): ProviderPosture {
  const posture = exactFrozenRecord(value, [
    "schemaVersion", "residentAgentId", "workspace", "run", "selection", "capability", "credentialReference", "feasibility",
    "approval", "binding"
  ]);
  if (
    requiredSafeText(posture, "schemaVersion") !== "resident-loop-provider-posture.v1" ||
    requiredSafeText(posture, "residentAgentId") !== "agent_default"
  ) {
    throw unavailable();
  }
  const workspace = normalizeWorkspaceBinding(exactFrozenRecord(posture.workspace, [
    "workspaceId", "mountInstanceId", "admissionGenerationId", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "highWaterOrdinal"
  ]));
  const run = exactFrozenRecord(posture.run, ["taskId", "attemptId", "runId"]);
  const selection = exactFrozenRecord(posture.selection, ["providerId", "modelId", "adapterVersion", "selectionPolicyVersion", "endpointPolicyId"]);
  const capability = exactFrozenRecord(posture.capability, ["capabilityId", "capabilityVersion", "capabilityHash", "capabilitySourceEventId", "capabilityRevision"]);
  const credentialReference = exactFrozenRecord(posture.credentialReference, ["credentialRefId", "credentialKind", "sourceEventIds"]);
  const feasibility = exactFrozenRecord(posture.feasibility, ["feasibilityId", "lane", "assessedAt", "sourceEventIds"]);
  const approval = exactFrozenRecord(posture.approval, ["required", "approvalProfile", "requiredApprovalClass"]);
  const binding = exactFrozenRecord(posture.binding, ["promptArtifactHash", "approvalPreviewHash"]);

  const providerId = requiredPattern(selection, "providerId", providerIdPattern);
  const modelId = requiredSafeText(selection, "modelId");
  const adapterVersion = requiredSafeText(selection, "adapterVersion");
  const selectionPolicyVersion = requiredSafeText(selection, "selectionPolicyVersion");
  requiredPattern(selection, "endpointPolicyId", endpointPolicyIdPattern);
  const capabilityId = requiredPattern(capability, "capabilityId", providerIdPattern);
  const capabilitySourceEventId = requiredPattern(capability, "capabilitySourceEventId", eventIdPattern);
  const credentialSourceEventIds = exactFrozenEventIds(credentialReference, "sourceEventIds");
  const feasibilitySourceEventIds = exactFrozenEventIds(feasibility, "sourceEventIds");

  if (
    selectionPolicyVersion !== workspace.policyVersion ||
    capabilityId !== providerId ||
    requiredSafeText(capability, "capabilityVersion") !== "agent-provider-capability.v2" ||
    requiredSafeText(capability, "capabilityRevision").length === 0 ||
    requiredPattern(credentialReference, "credentialRefId", credentialRefIdPattern).length === 0 ||
    requiredSafeText(credentialReference, "credentialKind") !== "api-key-bearer" ||
    requiredPattern(feasibility, "feasibilityId", feasibilityIdPattern).length === 0 ||
    requiredSafeText(feasibility, "lane") !== "byok" ||
    !isCanonicalIsoTimestamp(requiredSafeText(feasibility, "assessedAt")) ||
    !hasRequiredFeasibilityProvenance(capabilitySourceEventId, credentialSourceEventIds, feasibilitySourceEventIds) ||
    requiredBoolean(approval, "required") !== true ||
    requiredSafeText(approval, "approvalProfile") !== "remote-byte-transfer-gated" ||
    requiredSafeText(approval, "requiredApprovalClass") !== "provider-byte-transfer"
  ) throw unavailable();

  return Object.freeze({
    ...workspace,
    taskId: requiredPattern(run, "taskId", taskIdPattern),
    attemptId: requiredPattern(run, "attemptId", attemptIdPattern),
    runId: requiredPattern(run, "runId", runIdPattern),
    selection: Object.freeze({
      providerId,
      modelId,
      adapterVersion
    }),
    capability: Object.freeze({
      capabilityId,
      capabilityVersion: "agent-provider-capability.v2" as const,
      capabilityHash: requiredHash(capability, "capabilityHash"),
      capabilitySourceEventId,
      capabilityRevision: requiredSafeText(capability, "capabilityRevision")
    }),
    credentialReference: Object.freeze({
      credentialRefId: requiredPattern(credentialReference, "credentialRefId", credentialRefIdPattern),
      credentialKind: "api-key-bearer" as const,
      sourceEventIds: credentialSourceEventIds
    }),
    feasibility: Object.freeze({
      feasibilityId: requiredPattern(feasibility, "feasibilityId", feasibilityIdPattern),
      lane: "byok" as const,
      assessedAt: requiredSafeText(feasibility, "assessedAt"),
      sourceEventIds: feasibilitySourceEventIds
    }),
    approval: Object.freeze({
      required: true as const,
      approvalProfile: "remote-byte-transfer-gated" as const,
      requiredApprovalClass: "provider-byte-transfer" as const
    }),
    binding: Object.freeze({
      promptArtifactHash: requiredHash(binding, "promptArtifactHash"),
      approvalPreviewHash: requiredHash(binding, "approvalPreviewHash")
    })
  });
}

function normalizeWorkspaceBinding(record: Readonly<Record<string, unknown>>): WorkspaceBinding {
  return Object.freeze({
    workspaceId: requiredPattern(record, "workspaceId", workspaceIdPattern),
    mountInstanceId: requiredPattern(record, "mountInstanceId", mountInstanceIdPattern),
    admissionGenerationId: requiredPattern(record, "admissionGenerationId", admissionGenerationIdPattern),
    policyVersion: requiredSafeText(record, "policyVersion"),
    policyDigest: requiredHash(record, "policyDigest"),
    lockStateDigest: requiredHash(record, "lockStateDigest"),
    highWaterMark: requiredPattern(record, "highWaterMark", eventIdPattern),
    highWaterOrdinal: requiredNonnegativeInteger(record, "highWaterOrdinal")
  });
}

function requireExactBinding(authority: AuthorityReadback, posture: ProviderPosture): void {
  const provider = authority.provider;
  const handoff = authority.handoff;
  if (
    provider.workspaceId !== posture.workspaceId ||
    provider.mountInstanceId !== posture.mountInstanceId ||
    provider.admissionGenerationId !== posture.admissionGenerationId ||
    provider.policyVersion !== posture.policyVersion ||
    provider.policyDigest !== posture.policyDigest ||
    provider.lockStateDigest !== posture.lockStateDigest ||
    provider.highWaterMark !== posture.highWaterMark ||
    provider.highWaterOrdinal !== posture.highWaterOrdinal ||
    handoff.taskId !== posture.taskId ||
    handoff.attemptId !== posture.attemptId ||
    handoff.runId !== posture.runId ||
    handoff.authorityBinding.mountGeneration !== admissionGeneration(provider.admissionGenerationId) ||
    handoff.authorityBinding.ledgerHighWaterEventId !== provider.highWaterMark ||
    handoff.authorityBinding.policyHash !== provider.policyDigest ||
    handoff.authorityBinding.activeLocksHash !== provider.lockStateDigest
  ) throw unavailable();
}

function exactFrozenRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (
    types.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const expectedKeys = [...keys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) throw unavailable();

  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function requiredText(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw unavailable();
  return value;
}

function requiredSafeText(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = requiredText(record, key);
  if (!isSafePostureText(value)) throw unavailable();
  return value;
}

function requiredPattern(record: Readonly<Record<string, unknown>>, key: string, pattern: RegExp): string {
  const value = requiredSafeText(record, key);
  if (!pattern.test(value)) throw unavailable();
  return value;
}

function requiredHash(record: Readonly<Record<string, unknown>>, key: string): `sha256:${string}` {
  const value = requiredSafeText(record, key);
  if (!isHash(value)) throw unavailable();
  return value;
}

function requiredNonnegativeInteger(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

function requiredBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw unavailable();
  return value;
}

function exactFrozenEventIds(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = record[key];
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    !Object.isFrozen(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) throw unavailable();

  const length = Object.getOwnPropertyDescriptor(value, "length");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    length === undefined ||
    !("value" in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value <= 0 ||
    Object.getOwnPropertyNames(value).length !== length.value + 1
  ) throw unavailable();

  const eventIds: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !descriptor.enumerable ||
      typeof descriptor.value !== "string" ||
      !eventIdPattern.test(descriptor.value) ||
      !isSafePostureText(descriptor.value)
    ) throw unavailable();
    eventIds.push(descriptor.value);
  }
  if (
    new Set(eventIds).size !== eventIds.length ||
    eventIds.some((eventId, index) => {
      const previous = eventIds[index - 1];
      return index > 0 && previous !== undefined && previous >= eventId;
    })
  ) throw unavailable();
  return Object.freeze(eventIds);
}

function hasRequiredFeasibilityProvenance(
  capabilitySourceEventId: string,
  credentialSourceEventIds: readonly string[],
  feasibilitySourceEventIds: readonly string[]
): boolean {
  return feasibilitySourceEventIds.length > credentialSourceEventIds.length + 1 &&
    feasibilitySourceEventIds.includes(capabilitySourceEventId) &&
    credentialSourceEventIds.every((eventId) => feasibilitySourceEventIds.includes(eventId));
}

function isHash(value: string): value is `sha256:${string}` {
  return hashPattern.test(value);
}

function isSafePostureText(value: string): boolean {
  return (isAgentSecretSafeText(value) || value === "api-key-bearer") && !hasForbiddenTextMaterial(value);
}

function hasForbiddenTextMaterial(value: string): boolean {
  if (isCanonicalIsoTimestamp(value) || releasedVersionPattern.test(value)) return false;
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

function admissionGeneration(value: string): string {
  const match = /^admission_generation_([0-9]+)$/.exec(value);
  const generation = match?.[1];
  if (generation === undefined) throw unavailable();
  return `admission:${generation}`;
}

function unavailable(): Error {
  return new Error("resident loop factory ports are unavailable");
}
