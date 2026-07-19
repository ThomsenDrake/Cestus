import { types } from "node:util";
import type { ResidentLoopFactoryAuthorityReadback } from "./resident-loop-factory-composition.js";
import type { ResidentLoopProviderPosture } from "./resident-loop-provider-posture.js";

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
      capability: Object.freeze({ ...posture.capability }),
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
  if (requiredText(posture, "schemaVersion") !== "resident-loop-provider-posture.v1" || requiredText(posture, "residentAgentId") !== "agent_default") {
    throw unavailable();
  }
  const workspace = normalizeWorkspaceBinding(exactFrozenRecord(posture.workspace, [
    "workspaceId", "mountInstanceId", "admissionGenerationId", "policyVersion", "policyDigest", "lockStateDigest", "highWaterMark", "highWaterOrdinal"
  ]));
  const run = exactFrozenRecord(posture.run, ["taskId", "attemptId", "runId"]);
  const selection = exactFrozenRecord(posture.selection, ["providerId", "modelId", "adapterVersion", "selectionPolicyVersion", "endpointPolicyId"]);
  const capability = exactFrozenRecord(posture.capability, ["capabilityId", "capabilityVersion", "capabilityHash", "capabilitySourceEventId", "capabilityRevision"]);
  const approval = exactFrozenRecord(posture.approval, ["required", "approvalProfile", "requiredApprovalClass"]);
  const binding = exactFrozenRecord(posture.binding, ["promptArtifactHash", "approvalPreviewHash"]);

  if (
    requiredText(selection, "selectionPolicyVersion") !== workspace.policyVersion ||
    !safeIdentifier(requiredText(selection, "providerId")) ||
    !safeIdentifier(requiredText(selection, "modelId")) ||
    !safeIdentifier(requiredText(selection, "adapterVersion")) ||
    !safeIdentifier(requiredText(capability, "capabilityId")) ||
    requiredText(capability, "capabilityVersion") !== "agent-provider-capability.v2" ||
    !safeIdentifier(requiredText(capability, "capabilityRevision")) ||
    requiredBoolean(approval, "required") !== true ||
    requiredText(approval, "approvalProfile") !== "remote-byte-transfer-gated" ||
    requiredText(approval, "requiredApprovalClass") !== "provider-byte-transfer"
  ) throw unavailable();

  return Object.freeze({
    ...workspace,
    taskId: requiredText(run, "taskId"),
    attemptId: requiredText(run, "attemptId"),
    runId: requiredText(run, "runId"),
    selection: Object.freeze({
      providerId: requiredText(selection, "providerId"),
      modelId: requiredText(selection, "modelId"),
      adapterVersion: requiredText(selection, "adapterVersion")
    }),
    capability: Object.freeze({
      capabilityId: requiredText(capability, "capabilityId"),
      capabilityVersion: "agent-provider-capability.v2" as const,
      capabilityHash: requiredHash(capability, "capabilityHash"),
      capabilityRevision: requiredText(capability, "capabilityRevision")
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
    workspaceId: requiredPattern(record, "workspaceId", /^ws_[a-zA-Z0-9_-]+$/),
    mountInstanceId: requiredPattern(record, "mountInstanceId", /^mount_[a-zA-Z0-9_-]+$/),
    admissionGenerationId: requiredPattern(record, "admissionGenerationId", /^admission_generation_[0-9]+$/),
    policyVersion: requiredText(record, "policyVersion"),
    policyDigest: requiredHash(record, "policyDigest"),
    lockStateDigest: requiredHash(record, "lockStateDigest"),
    highWaterMark: requiredPattern(record, "highWaterMark", /^evt_[a-zA-Z0-9_-]+$/),
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

function requiredPattern(record: Readonly<Record<string, unknown>>, key: string, pattern: RegExp): string {
  const value = requiredText(record, key);
  if (!pattern.test(value)) throw unavailable();
  return value;
}

function requiredHash(record: Readonly<Record<string, unknown>>, key: string): `sha256:${string}` {
  const value = requiredText(record, key);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw unavailable();
  return value as `sha256:${string}`;
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

function safeIdentifier(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
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
