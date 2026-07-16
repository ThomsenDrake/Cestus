import { createHash } from "node:crypto";
import {
  inspectOfficialFlowAbsenceWitness,
  type OfficialFlowAbsenceClassificationV1
} from "../../agent/src/official-flow-feasibility.js";
import {
  eventContextSchema,
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent
} from "../../ontology/src/contracts.js";
import { isConcurrencyConflict, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility,
  type MountedArtifactAuthorityOperation
} from "./mounted-artifact-authority-operation.js";

export type MountedOfficialFlowFeasibilityBlockedCategory =
  | "unsafe-input"
  | "classification-witness-invalid"
  | "source-evidence-missing"
  | "source-evidence-mismatch"
  | "mounted-authority-stale"
  | "concurrency-conflict"
  | "persistence-unconfirmed"
  | "record-conflict";

export type MountedOfficialFlowFeasibilityRetry<C extends MountedOfficialFlowFeasibilityBlockedCategory> =
  C extends "unsafe-input" | "classification-witness-invalid" | "record-conflict"
    ? "none"
    : C extends "source-evidence-missing" | "source-evidence-mismatch"
      ? "after-source-repair"
      : C extends "mounted-authority-stale"
        ? "after-remount"
        : "after-ledger-refresh";

export type MountedOfficialFlowFeasibilityResult =
  | {
      readonly kind: "unavailable";
      readonly category: "official-flow-unavailable";
      readonly eventId: `evt_${string}`;
      readonly sequence: number;
      readonly idempotencyKey: `sha256:${string}`;
      readonly providerId: `provider_${string}`;
      readonly modelId: string;
      readonly capabilityHash: `sha256:${string}`;
      readonly safeDiagnosticCodes: readonly ["official-flow-unavailable"];
    }
  | {
      [C in MountedOfficialFlowFeasibilityBlockedCategory]: {
        readonly kind: "blocked";
        readonly category: C;
        readonly retry: MountedOfficialFlowFeasibilityRetry<C>;
        readonly safeDiagnosticCodes: readonly [C];
      }
    }[MountedOfficialFlowFeasibilityBlockedCategory];

interface Invocation {
  readonly operation: MountedArtifactAuthorityOperation;
  readonly witness: unknown;
  readonly occurredAt: string;
  readonly correlationId: string;
}

interface SafeLedgerRecord {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly streamId: string;
  readonly sequence: number;
  readonly context: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
}

interface MountedAuthoritySnapshot {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly admissionGenerationId: string;
}

const secretLikeText = /api[_-]?key|authorization|bearer|token|secret|password|private[_ -]?key|(?:^|[\s;])(?:(?:(?:x|set)-)?cookie\s*:|session\s*=\s*\S+)|(?:^|[\s;_-])(?:(?:(?:x|set)-)?(?:oauth|credential)\s*(?:[:=]\s*|\s+(?=[a-z0-9._~+/=-]{3,}))[a-z0-9._~+/=-]+|(?:sk[_-](?:live|test|proj)|gh[pousr]_|github[_-]?pat[_-]|glpat[_-]|xox[baprs]?_|AKIA|ASIA|AIza|ya29|eyJ|hf[_-]|rk[_-]live|pk[_-]live|sg[._-])[a-z0-9_-]{3,})/i;

export async function recordMountedOfficialFlowUnavailability(input: unknown): Promise<MountedOfficialFlowFeasibilityResult> {
  const invocation = normalizeInvocation(input);
  if (invocation === undefined) return blocked("unsafe-input");

  const initial = inspectCurrent(invocation.operation);
  if (initial === undefined) return blocked("mounted-authority-stale");

  const classification = inspectOfficialFlowAbsenceWitness(invocation.witness);
  if (classification === undefined || !classificationMatchesMounted(classification, initial.snapshot)) {
    return blocked("classification-witness-invalid");
  }

  let records: readonly SafeLedgerRecord[] | undefined;
  try {
    const sourceRecords = await initial.ledger.readAll();
    const afterSourceRead = inspectCurrent(invocation.operation);
    if (afterSourceRead === undefined || !sameInspection(initial, afterSourceRead)) {
      return blocked("mounted-authority-stale");
    }
    records = normalizeLedgerRecords(sourceRecords);
  } catch {
    const afterFailedSourceRead = inspectCurrent(invocation.operation);
    if (afterFailedSourceRead === undefined || !sameInspection(initial, afterFailedSourceRead)) {
      return blocked("mounted-authority-stale");
    }
    return blocked("persistence-unconfirmed");
  }
  if (records === undefined) return blocked("persistence-unconfirmed");

  const sourceStatus = inspectSources(records, classification);
  if (sourceStatus !== "ok") return blocked(sourceStatus);

  const idempotencyKey = idempotencyKeyFor(classification, initial.snapshot);
  const expected = expectedEvent(classification, initial.snapshot, invocation, idempotencyKey);
  const matching = records.filter((record) =>
    record.type === "agent.provider.feasibility.observed.v1" && record.payload.idempotencyKey === idempotencyKey
  );
  if (matching.length > 0) {
    if (matching.some((record) => !sameExpectedEvent(record, expected))) return blocked("record-conflict");
    const event = matching[0];
    if (event === undefined) return blocked("record-conflict");
    return await readBackExpected(initial.ledger, invocation.operation, initial, expected, event.id, idempotencyKey, classification);
  }

  try {
    const appendResult: unknown = await initial.ledger.append(expected, { expectedGlobalEventCount: records.length });
    const afterAppend = inspectCurrent(invocation.operation);
    if (afterAppend === undefined || !sameInspection(initial, afterAppend)) {
      return blocked("mounted-authority-stale");
    }
    const appended = normalizeLedgerRecords([appendResult])?.[0];
    if (appended === undefined) return blocked("persistence-unconfirmed");
    return await readBackExpected(afterAppend.ledger, invocation.operation, afterAppend, expected, appended.id, idempotencyKey, classification);
  } catch (error) {
    const afterFailedAppend = inspectCurrent(invocation.operation);
    if (afterFailedAppend === undefined || !sameInspection(initial, afterFailedAppend)) {
      return blocked("mounted-authority-stale");
    }
    let concurrencyConflict = false;
    try {
      concurrencyConflict = isConcurrencyConflict(error);
    } catch {
      return blocked("persistence-unconfirmed");
    }
    if (!concurrencyConflict) return blocked("persistence-unconfirmed");
    let concurrent: readonly SafeLedgerRecord[] | undefined;
    let afterConcurrentRead: { readonly snapshot: MountedAuthoritySnapshot; readonly ledger: EventLedger } | undefined;
    try {
      const concurrentRecords = await afterFailedAppend.ledger.readAll();
      afterConcurrentRead = inspectCurrent(invocation.operation);
      if (afterConcurrentRead === undefined || !sameInspection(initial, afterConcurrentRead)) {
        return blocked("mounted-authority-stale");
      }
      concurrent = normalizeLedgerRecords(concurrentRecords);
    } catch {
      const afterFailedConcurrentRead = inspectCurrent(invocation.operation);
      if (afterFailedConcurrentRead === undefined || !sameInspection(initial, afterFailedConcurrentRead)) {
        return blocked("mounted-authority-stale");
      }
      return blocked("concurrency-conflict");
    }
    if (concurrent === undefined) return blocked("concurrency-conflict");
    const matching = concurrent.filter((record) =>
      record.type === "agent.provider.feasibility.observed.v1" && record.payload.idempotencyKey === idempotencyKey
    );
    if (matching.some((record) => !sameExpectedEvent(record, expected))) return blocked("record-conflict");
    const event = matching.find((record) => sameExpectedEvent(record, expected));
    if (event === undefined) return blocked("concurrency-conflict");
    if (afterConcurrentRead === undefined) return blocked("mounted-authority-stale");
    return await readBackExpected(afterConcurrentRead.ledger, invocation.operation, afterConcurrentRead, expected, event.id, idempotencyKey, classification);
  }
}

function normalizeInvocation(value: unknown): Invocation | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return undefined;
    }
    const expected = ["operation", "witness", "occurredAt", "correlationId"] as const;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some((key) => typeof key !== "string" || !expected.includes(key as typeof expected[number]))) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const values: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return undefined;
      }
      values[key] = descriptor.value;
    }
    if (
      typeof values.operation !== "object" || values.operation === null ||
      typeof values.occurredAt !== "string" || !eventContextSchema.shape.occurredAt.safeParse(values.occurredAt).success ||
      typeof values.correlationId !== "string" || values.correlationId.length < 3 || secretLikeText.test(values.correlationId)
    ) {
      return undefined;
    }
    return Object.freeze({
      operation: values.operation as MountedArtifactAuthorityOperation,
      witness: values.witness,
      occurredAt: values.occurredAt,
      correlationId: values.correlationId
    });
  } catch {
    return undefined;
  }
}

function inspectCurrent(operation: MountedArtifactAuthorityOperation): {
  readonly snapshot: MountedAuthoritySnapshot;
  readonly ledger: EventLedger;
} | undefined {
  try {
    const inspection = inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(operation);
    return Object.freeze({ snapshot: inspection.snapshot, ledger: inspection.ledger });
  } catch {
    return undefined;
  }
}

function classificationMatchesMounted(
  classification: OfficialFlowAbsenceClassificationV1,
  snapshot: MountedAuthoritySnapshot
): boolean {
  return classification.residentAgentId === "agent_default" &&
    classification.workspaceId === snapshot.workspaceId &&
    classification.mountInstanceId === snapshot.mountInstanceId &&
    classification.policyVersion === snapshot.policyVersion;
}

function inspectSources(
  records: readonly SafeLedgerRecord[],
  classification: OfficialFlowAbsenceClassificationV1
): "ok" | "source-evidence-missing" | "source-evidence-mismatch" {
  const byId = new Map(records.map((record) => [record.id, record]));
  if (classification.sourceEventIds.some((id) => !byId.has(id))) return "source-evidence-missing";
  const checkpoint = byId.get(classification.causationEventId);
  if (checkpoint === undefined || checkpoint.type !== "agent.task.orchestration.checkpointed") return "source-evidence-mismatch";
  const payload = checkpoint.payload;
  const providerPosture = recordValue(payload.providerPosture);
  const approvalRequirement = recordValue(payload.approvalRequirement);
  const receipt = recordValue(payload.promptBindingReceipt);
  const checkpointSourceIds = stringArray(payload.sourceEventIds);
  const toolRequestIds = stringArray(payload.toolRequestIds);
  const expectedCapabilityIds = [
    classification.capabilityHash,
    classification.officialFlowId,
    ...classification.capabilityScopes.map((scope) => `scope:${scope}`)
  ];
  if (
    payload.checkpointKind !== "prompt-bound" ||
    payload.taskId !== classification.taskId || payload.attemptId !== classification.attemptId || payload.runId !== classification.runId ||
    providerPosture === undefined || approvalRequirement === undefined || receipt === undefined || checkpointSourceIds === undefined || toolRequestIds === undefined ||
    !checkpointSourceIds.every((id) => classification.sourceEventIds.includes(id as `evt_${string}`)) ||
    providerPosture.providerId !== classification.providerId || providerPosture.modelFamily !== classification.modelId ||
    providerPosture.credentialRefId !== classification.credentialRefId || providerPosture.credentialKind !== classification.credentialKind ||
    providerPosture.selectionPolicyVersion !== classification.policyVersion ||
    providerPosture.approvalProfile !== "provider-byte-transfer" || providerPosture.requiredApprovalClass !== "provider-byte-transfer" ||
    !sameStringArray(stringArray(providerPosture.capabilityIds), expectedCapabilityIds) ||
    approvalRequirement.approvalClass !== "provider-byte-transfer" || approvalRequirement.previewHash !== classification.approvalBindingHash ||
    receipt.approvalEventId === undefined || typeof receipt.approvalEventId !== "string" || !classification.sourceEventIds.includes(receipt.approvalEventId as `evt_${string}`)
  ) {
    return "source-evidence-mismatch";
  }

  const approval = byId.get(receipt.approvalEventId);
  const toolRequestId = toolRequestIds[0];
  if (
    approval === undefined || approval.type !== "agent.tool.approved" || toolRequestId === undefined ||
    approval.streamId !== `agent_tool_request_${toolRequestId}` || approval.context.actor === undefined ||
    !isRecord(approval.context.actor) || approval.context.actor.kind !== "human" ||
    approval.payload.toolRequestId !== toolRequestId || approval.payload.approvalClass !== "provider-byte-transfer" ||
    approval.payload.approvedPreviewHash !== classification.approvalBindingHash ||
    approval.payload.approvedBy !== approval.context.actor.id
  ) {
    return "source-evidence-mismatch";
  }
  return "ok";
}

function idempotencyKeyFor(
  classification: OfficialFlowAbsenceClassificationV1,
  snapshot: MountedAuthoritySnapshot
): `sha256:${string}` {
  return hash({
    schemaVersion: "agent-provider-feasibility-idempotency.v1",
    classificationHash: classification.classificationHash,
    workspaceId: classification.workspaceId,
    mountInstanceId: classification.mountInstanceId,
    admissionGenerationId: snapshot.admissionGenerationId,
    workspaceIdentityEventId: snapshot.workspaceIdentityEventId,
    mountEvidenceId: snapshot.mountEvidenceId,
    authorityEvidenceId: snapshot.authorityEvidenceId,
    ledgerStoreEvidenceId: snapshot.ledgerStoreEvidenceId,
    policyVersion: snapshot.policyVersion,
    policyDigest: snapshot.policyDigest,
    lockStateDigest: snapshot.lockStateDigest,
    highWaterMark: snapshot.highWaterMark,
    highWaterOrdinal: snapshot.highWaterOrdinal
  });
}

function expectedEvent(
  classification: OfficialFlowAbsenceClassificationV1,
  snapshot: MountedAuthoritySnapshot,
  invocation: Invocation,
  idempotencyKey: `sha256:${string}`
): AppendableKnowledgeEvent<"agent.provider.feasibility.observed.v1"> {
  return {
    type: "agent.provider.feasibility.observed.v1",
    version: 1,
    streamId: `agent_provider_feasibility_${classification.taskId}_${classification.attemptId}_${classification.runId}_${classification.providerId}`,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      occurredAt: invocation.occurredAt,
      causationId: classification.causationEventId,
      correlationId: invocation.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      recordVersion: "agent-provider-feasibility.v1",
      residentAgentId: "agent_default",
      workspaceId: classification.workspaceId,
      mountInstanceId: classification.mountInstanceId,
      admissionGenerationId: snapshot.admissionGenerationId,
      workspaceIdentityEventId: snapshot.workspaceIdentityEventId,
      mountEvidenceId: snapshot.mountEvidenceId,
      authorityEvidenceId: snapshot.authorityEvidenceId,
      ledgerStoreEvidenceId: snapshot.ledgerStoreEvidenceId,
      policyVersion: snapshot.policyVersion,
      policyDigest: snapshot.policyDigest,
      lockStateDigest: snapshot.lockStateDigest,
      highWaterMark: snapshot.highWaterMark,
      highWaterOrdinal: snapshot.highWaterOrdinal,
      taskId: classification.taskId,
      attemptId: classification.attemptId,
      runId: classification.runId,
      providerFamily: classification.providerFamily,
      providerId: classification.providerId,
      modelId: classification.modelId,
      capabilityHash: classification.capabilityHash,
      credentialRefId: classification.credentialRefId,
      credentialKind: classification.credentialKind,
      capabilityScopes: [...classification.capabilityScopes],
      officialFlowId: classification.officialFlowId,
      approvalClass: "provider-byte-transfer",
      approvalBindingHash: classification.approvalBindingHash,
      posture: "unavailable",
      category: "official-flow-unavailable",
      classification: "official-flow-absent",
      classificationHash: classification.classificationHash,
      sourceEventIds: [...classification.sourceEventIds],
      idempotencyKey,
      observedAt: invocation.occurredAt
    }
  };
}

async function readBackExpected(
  ledger: EventLedger,
  operation: MountedArtifactAuthorityOperation,
  inspection: { readonly snapshot: MountedAuthoritySnapshot; readonly ledger: EventLedger },
  expected: AppendableKnowledgeEvent<"agent.provider.feasibility.observed.v1">,
  eventId: string,
  idempotencyKey: `sha256:${string}`,
  classification: OfficialFlowAbsenceClassificationV1
): Promise<MountedOfficialFlowFeasibilityResult> {
  const beforeReadback = inspectCurrent(operation);
  if (beforeReadback === undefined || !sameInspection(inspection, beforeReadback)) return blocked("mounted-authority-stale");
  let records: readonly SafeLedgerRecord[] | undefined;
  try {
    const readbackRecords = await ledger.readStream(expected.streamId);
    const afterReadback = inspectCurrent(operation);
    if (afterReadback === undefined || !sameInspection(inspection, afterReadback)) return blocked("mounted-authority-stale");
    records = normalizeLedgerRecords(readbackRecords);
  } catch {
    const afterFailedReadback = inspectCurrent(operation);
    if (afterFailedReadback === undefined || !sameInspection(inspection, afterFailedReadback)) return blocked("mounted-authority-stale");
    return blocked("persistence-unconfirmed");
  }
  if (records === undefined) return blocked("persistence-unconfirmed");
  const record = records.find((candidate) => candidate.id === eventId);
  if (record === undefined || !sameExpectedEvent(record, expected)) return blocked("persistence-unconfirmed");
  if (!record.id.startsWith("evt_") || !Number.isInteger(record.sequence) || record.sequence < 1) return blocked("persistence-unconfirmed");
  return Object.freeze({
    kind: "unavailable" as const,
    category: "official-flow-unavailable" as const,
    eventId: record.id as `evt_${string}`,
    sequence: record.sequence,
    idempotencyKey,
    providerId: classification.providerId,
    modelId: classification.modelId,
    capabilityHash: classification.capabilityHash,
    safeDiagnosticCodes: ["official-flow-unavailable"] as const
  });
}

function sameExpectedEvent(
  record: SafeLedgerRecord,
  expected: AppendableKnowledgeEvent<"agent.provider.feasibility.observed.v1">
): boolean {
  return record.type === expected.type && record.version === expected.version && record.streamId === expected.streamId &&
    JSON.stringify(record.context) === JSON.stringify(expected.context) &&
    JSON.stringify(record.payload) === JSON.stringify(expected.payload);
}

function sameInspection(
  left: { readonly snapshot: MountedAuthoritySnapshot; readonly ledger: EventLedger },
  right: { readonly snapshot: MountedAuthoritySnapshot; readonly ledger: EventLedger }
): boolean {
  return left.ledger === right.ledger && JSON.stringify(left.snapshot) === JSON.stringify(right.snapshot);
}

function normalizeLedgerRecords(value: unknown): readonly SafeLedgerRecord[] | undefined {
  const normalized = normalizePlainOwnData(value);
  if (!Array.isArray(normalized)) return undefined;
  const records: SafeLedgerRecord[] = [];
  for (const item of normalized) {
    if (!isRecord(item) || !hasExactKeys(item, ["id", "type", "version", "streamId", "sequence", "context", "payload"])) return undefined;
    if (
      typeof item.id !== "string" || typeof item.type !== "string" || typeof item.version !== "number" ||
      typeof item.streamId !== "string" || typeof item.sequence !== "number" || !isRecord(item.context) || !isRecord(item.payload)
    ) {
      return undefined;
    }
    if (!validateKnowledgeEvent(item).success) return undefined;
    records.push(Object.freeze({
      id: item.id,
      type: item.type,
      version: item.version,
      streamId: item.streamId,
      sequence: item.sequence,
      context: item.context,
      payload: item.payload
    }));
  }
  return Object.freeze(records);
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

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hash(value: object): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function blocked<C extends MountedOfficialFlowFeasibilityBlockedCategory>(category: C): MountedOfficialFlowFeasibilityResult {
  const retry = category === "unsafe-input" || category === "classification-witness-invalid" || category === "record-conflict"
    ? "none"
    : category === "source-evidence-missing" || category === "source-evidence-mismatch"
      ? "after-source-repair"
      : category === "mounted-authority-stale"
        ? "after-remount"
        : "after-ledger-refresh";
  return Object.freeze({
    kind: "blocked" as const,
    category,
    retry,
    safeDiagnosticCodes: [category] as const
  }) as MountedOfficialFlowFeasibilityResult;
}
