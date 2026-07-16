import { createHash } from "node:crypto";

export interface OfficialFlowAbsenceWitnessV1 {
  readonly schemaVersion: "agent-official-flow-absence-witness.v1";
  readonly providerFamily: "codex" | "xai";
}

export interface OfficialFlowAbsenceClassificationV1 {
  readonly schemaVersion: "agent-official-flow-absence.v1";
  readonly residentAgentId: "agent_default";
  readonly workspaceId: `ws_${string}`;
  readonly mountInstanceId: `mount_${string}`;
  readonly taskId: `task_${string}`;
  readonly attemptId: `attempt_${string}`;
  readonly runId: `run_${string}`;
  readonly providerFamily: "codex" | "xai";
  readonly providerId: `provider_${string}`;
  readonly modelId: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly credentialRefId: `agent_credref_${string}`;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScopes: readonly string[];
  readonly policyVersion: string;
  readonly officialFlowId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly approvalBindingHash: `sha256:${string}`;
  readonly sourceEventIds: readonly `evt_${string}`[];
  readonly causationEventId: `evt_${string}`;
  readonly classification: "official-flow-absent";
  readonly classificationHash: `sha256:${string}`;
}

type OfficialFlowAbsencePostureV1 = Omit<
  OfficialFlowAbsenceClassificationV1,
  "schemaVersion" | "classification" | "classificationHash"
>;

const witnessClassifications = new WeakMap<object, OfficialFlowAbsenceClassificationV1>();
const secretLikeText = /api[_-]?key|authorization|bearer|token|secret|password|private[_ -]?key|(?:^|[\s;])(?:(?:set-)?cookie\s*:|session\s*=\s*\S+)/i;

export function createOfficialFlowAbsenceWitness(input: unknown): OfficialFlowAbsenceWitnessV1 {
  const normalized = normalizePlainOwnData(input);
  if (normalized === undefined || !isRecord(normalized) || !hasExactKeys(normalized, [
    "configuredPosture", "assessedPosture", "officialFlow"
  ])) {
    throw invalidInput();
  }
  if (normalized.officialFlow !== undefined) throw invalidInput();

  const configured = normalizePosture(normalized.configuredPosture);
  const assessed = normalizePosture(normalized.assessedPosture);
  if (JSON.stringify(configured) !== JSON.stringify(assessed)) throw invalidInput();

  const preimage = {
    schemaVersion: "agent-official-flow-absence.v1" as const,
    residentAgentId: configured.residentAgentId,
    workspaceId: configured.workspaceId,
    mountInstanceId: configured.mountInstanceId,
    taskId: configured.taskId,
    attemptId: configured.attemptId,
    runId: configured.runId,
    providerFamily: configured.providerFamily,
    providerId: configured.providerId,
    modelId: configured.modelId,
    capabilityHash: configured.capabilityHash,
    credentialRefId: configured.credentialRefId,
    credentialKind: configured.credentialKind,
    capabilityScopes: configured.capabilityScopes,
    policyVersion: configured.policyVersion,
    officialFlowId: configured.officialFlowId,
    approvalClass: configured.approvalClass,
    approvalBindingHash: configured.approvalBindingHash,
    sourceEventIds: configured.sourceEventIds,
    causationEventId: configured.causationEventId,
    classification: "official-flow-absent" as const
  };
  const classification = Object.freeze({
    ...preimage,
    classificationHash: hash(preimage)
  });
  const witness = Object.freeze({
    schemaVersion: "agent-official-flow-absence-witness.v1" as const,
    providerFamily: classification.providerFamily
  });
  witnessClassifications.set(witness, classification);
  return witness;
}

/**
 * This source-local inspector is the only way the mounted recorder can see
 * the posture. Public witnesses intentionally remain opaque and portable only
 * by object identity inside this process.
 */
export function inspectOfficialFlowAbsenceWitness(witness: unknown): OfficialFlowAbsenceClassificationV1 | undefined {
  if (typeof witness !== "object" || witness === null) return undefined;
  return witnessClassifications.get(witness);
}

function normalizePosture(value: unknown): OfficialFlowAbsencePostureV1 {
  const posture = normalizePlainOwnData(value);
  const keys = [
    "residentAgentId", "workspaceId", "mountInstanceId", "taskId", "attemptId", "runId",
    "providerFamily", "providerId", "modelId", "capabilityHash", "credentialRefId", "credentialKind",
    "capabilityScopes", "policyVersion", "officialFlowId", "approvalClass", "approvalBindingHash",
    "sourceEventIds", "causationEventId"
  ] as const;
  if (posture === undefined || !isRecord(posture) || !hasExactKeys(posture, keys)) throw invalidInput();

  const residentAgentId = stringValue(posture.residentAgentId, /^agent_default$/) as "agent_default";
  const workspaceId = stringValue(posture.workspaceId, /^ws_[a-zA-Z0-9_-]+$/) as `ws_${string}`;
  const mountInstanceId = stringValue(posture.mountInstanceId, /^mount_[a-zA-Z0-9_-]+$/) as `mount_${string}`;
  const taskId = stringValue(posture.taskId, /^task_[a-zA-Z0-9_-]+$/) as `task_${string}`;
  const attemptId = stringValue(posture.attemptId, /^attempt_[a-f0-9]{64}$/) as `attempt_${string}`;
  const runId = stringValue(posture.runId, /^run_[a-zA-Z0-9_-]+$/) as `run_${string}`;
  const providerFamily = enumValue(posture.providerFamily, ["codex", "xai"] as const);
  const providerId = stringValue(posture.providerId, /^provider_[a-zA-Z0-9_-]+$/) as `provider_${string}`;
  const modelId = stringValue(posture.modelId);
  const capabilityHash = stringValue(posture.capabilityHash, /^sha256:[a-f0-9]{64}$/) as `sha256:${string}`;
  const credentialRefId = stringValue(posture.credentialRefId, /^agent_credref_[a-zA-Z0-9_-]+$/) as `agent_credref_${string}`;
  const credentialKind = enumValue(posture.credentialKind, ["subscription-oauth", "device-code-oauth"] as const);
  const capabilityScopes = sortedUniqueStrings(posture.capabilityScopes, true);
  const policyVersion = stringValue(posture.policyVersion);
  const officialFlowId = stringValue(posture.officialFlowId);
  const approvalClass = enumValue(posture.approvalClass, ["provider-byte-transfer"] as const);
  const approvalBindingHash = stringValue(posture.approvalBindingHash, /^sha256:[a-f0-9]{64}$/) as `sha256:${string}`;
  const sourceEventIds = sortedUniqueStrings(posture.sourceEventIds, true, /^evt_[a-zA-Z0-9_-]+$/) as readonly `evt_${string}`[];
  const causationEventId = stringValue(posture.causationEventId, /^evt_[a-zA-Z0-9_-]+$/) as `evt_${string}`;

  if (!capabilityScopes.includes("harness-execution") || !sourceEventIds.includes(causationEventId)) throw invalidInput();
  if (
    (providerFamily === "codex" && (!providerId.startsWith("provider_openai_codex_") || !officialFlowId.startsWith("codex-"))) ||
    (providerFamily === "xai" && (!providerId.startsWith("provider_xai_") || !officialFlowId.startsWith("xai-")))
  ) {
    throw invalidInput();
  }

  return Object.freeze({
    residentAgentId,
    workspaceId,
    mountInstanceId,
    taskId,
    attemptId,
    runId,
    providerFamily,
    providerId,
    modelId,
    capabilityHash,
    credentialRefId,
    credentialKind,
    capabilityScopes,
    policyVersion,
    officialFlowId,
    approvalClass,
    approvalBindingHash,
    sourceEventIds,
    causationEventId
  });
}

function sortedUniqueStrings(value: unknown, nonempty: boolean, pattern?: RegExp): readonly string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) throw invalidInput();
  const values = value.map((item) => stringValue(item, pattern));
  const sorted = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (new Set(sorted).size !== sorted.length) throw invalidInput();
  return Object.freeze(sorted);
}

function stringValue(value: unknown, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || secretLikeText.test(value) || (pattern !== undefined && !pattern.test(value))) {
    throw invalidInput();
  }
  return value;
}

function enumValue<const Value extends string>(value: unknown, values: readonly Value[]): Value {
  if (typeof value !== "string" || !values.includes(value as Value)) throw invalidInput();
  return value as Value;
}

function hash(value: object): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(): Error {
  return new Error("official flow absence witness input is invalid");
}

function normalizePlainOwnData(value: unknown): unknown | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "undefined") {
    return value;
  }
  if (typeof value !== "object") return undefined;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return undefined;
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return undefined;
      const length = value.length;
      if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return undefined;
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return undefined;
        const child = normalizePlainOwnData(descriptor.value);
        if (child === undefined && descriptor.value !== undefined) return undefined;
        result.push(child);
      }
      return Object.freeze(result);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const result: Record<string, unknown> = {};
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return undefined;
      const child = normalizePlainOwnData(descriptor.value);
      if (child === undefined && descriptor.value !== undefined) return undefined;
      Object.defineProperty(result, key, { value: child, enumerable: true, writable: false, configurable: false });
    }
    return Object.freeze(result);
  } catch {
    return undefined;
  }
}
