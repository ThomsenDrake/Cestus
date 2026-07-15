import type { SpecialistHandoffMaterial } from "../../agent/src/specialist-handoff-manifest.js";
import type {
  TaskOrchestratorHandoffCapability,
  TaskOrchestratorHandoffReadbackInput,
  TaskOrchestratorRunnerDispatchInput,
  TaskOrchestratorRunnerDispatchResult,
  TaskOrchestratorRunnerDurableHandoffResult
} from "../../agent/src/task-orchestrator.js";
import type { TaskOrchestratorRunType } from "../../agent/src/task-orchestrator-types.js";
import type { SpecialistHandoffManifestStore } from "../../agent/src/specialist-runner-kernel.js";

export interface MountedWorkspaceRuntimeAuthority {
  readonly authorityVersion: "mounted-workspace-runtime-authority.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly ledgerHighWaterMark: number;
}

export interface MountedStoreBindingReadback {
  readonly bindingVersion: "mounted-store-binding-readback.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly verified: true;
}

export interface MountedAgentArtifactStores {
  readonly storesVersion: "mounted-agent-artifact-stores.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  verifyBinding(input: {
    readonly authority: MountedWorkspaceRuntimeAuthority;
    readonly registration: SpecialistRunnerRegistrationBinding;
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
  }): Promise<MountedStoreBindingReadback>;
  readonly materialTrace?: (() => void) | undefined;
  readonly manifestTrace?: (() => void) | undefined;
}

export interface SpecialistRunnerRegistrationBinding {
  readonly runType: TaskOrchestratorRunType;
  readonly runnerId: string;
  readonly runnerVersion: number;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly requiredContextPackIds: readonly string[];
  readonly promptTemplateId: string;
  readonly providerPolicyVersion: string;
  readonly handoffSchemaVersion: string;
  readonly requiredAdapterFamilies: readonly string[];
}

export interface Task134FrozenRegistrationProvenanceV1 {
  readonly runnerId: string;
  readonly runnerVersion: number;
  readonly workflowDescriptorHash: `sha256:${string}`;
}

export interface VerifiedSpecialistDispatchReadiness {
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly expectedTaskId: string;
  readonly expectedRunType: TaskOrchestratorRunType;
  readonly expectedAttemptId: string;
  readonly expectedRunId: string;
  readonly authorityHighWaterMark: number;
  readonly workflowDescriptorHash: `sha256:${string}`;
  readonly expectedContextBindingHash: `sha256:${string}`;
  readonly contextBindingHash: `sha256:${string}`;
  readonly expectedPromptBindingHash: `sha256:${string}`;
  readonly promptBindingHash: `sha256:${string}`;
  readonly approvalVerified: boolean;
  readonly budgetAvailable: boolean;
  readonly activeLock: boolean;
  readonly providerReady: boolean;
  readonly storeBindingVerified: boolean;
  readonly adapterFamilies: readonly string[];
}

/**
 * This is the only construction-time tuple accepted by Task134. It is
 * normalized into a private closure before any await; public dispatch never
 * receives any of these values.
 */
export interface FactoryClosedSpecialistRunnerBinding {
  readonly bindingVersion: "task134-factory-closed-specialist-runner.v1";
  readonly artifactStores: MountedAgentArtifactStores;
  readonly registration: SpecialistRunnerRegistrationBinding;
  readonly registrationProvenance: Task134FrozenRegistrationProvenanceV1;
  readonly handoffCapability: TaskOrchestratorHandoffCapability;
  readonly readiness: VerifiedSpecialistDispatchReadiness;
}

/** Internal delegate input. It cannot be supplied through the public registry dispatch. */
export interface VerifiedSpecialistDispatchInput extends TaskOrchestratorRunnerDispatchInput {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly registration: SpecialistRunnerRegistrationBinding;
  readonly registrationProvenance: Task134FrozenRegistrationProvenanceV1;
  readonly handoffCapability: TaskOrchestratorHandoffCapability;
  readonly readiness: VerifiedSpecialistDispatchReadiness;
}

export interface VerifiedTask134DurableHandoff extends TaskOrchestratorRunnerDurableHandoffResult {
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
  readonly handoffMaterial: SpecialistHandoffMaterial;
}

/** Delegate output is incomplete until Task134 invokes the closed H readback. */
export interface VerifiedSpecialistRunnerDispatchResult extends TaskOrchestratorRunnerDispatchResult {
  readonly durableHandoff: VerifiedTask134DurableHandoff;
  readonly handoffReadbackInput: TaskOrchestratorHandoffReadbackInput;
}

export interface ProductionSpecialistRunnerCapability {
  readonly capabilityVersion: "production-specialist-runner-registry.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult>;
}

export type SpecialistRunnerReadinessCode =
  | "runner-registration-invalid"
  | "workspace-identity-mismatch"
  | "handoff-readback-failed";

export class SpecialistRunnerReadinessError extends Error {
  readonly code: SpecialistRunnerReadinessCode;

  constructor(code: SpecialistRunnerReadinessCode) {
    super(code);
    this.name = "SpecialistRunnerReadinessError";
    this.code = code;
    Object.freeze(this);
  }
}

export function createProductionSpecialistRunnerCapability(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  readonly closedBinding: FactoryClosedSpecialistRunnerBinding;
  readonly dispatchVerified: (input: VerifiedSpecialistDispatchInput) => Promise<VerifiedSpecialistRunnerDispatchResult>;
}): ProductionSpecialistRunnerCapability {
  const closed = normalizeFactoryClosedBinding(input);

  return Object.freeze({
    capabilityVersion: "production-specialist-runner-registry.v1" as const,
    workspaceId: closed.authority.workspaceId,
    mountInstanceId: closed.authority.mountInstanceId,
    registrations: Object.freeze([closed.registration]),
    async dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult> {
      const publicDispatch = normalizePublicDispatch(input);
      const verified = buildVerifiedDispatch(closed, publicDispatch);
      let storeReadback: MountedStoreBindingReadback;
      try {
        storeReadback = await closed.verifyStoreBinding({
          authority: closed.authority,
          registration: closed.registration,
          taskId: publicDispatch.taskId,
          attemptId: publicDispatch.attemptId,
          runId: publicDispatch.approvedRunId
        });
      } catch {
        throw readinessError("runner-registration-invalid");
      }
      if (!isMountedStoreBindingReadback(storeReadback, closed.authority)) {
        throw readinessError("runner-registration-invalid");
      }

      const result = await closed.dispatchVerified(verified);
      return await verifyDurableRunnerResult({ closed, verified, result });
    }
  });
}

interface ClosedSpecialistRunnerBinding {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registration: SpecialistRunnerRegistrationBinding;
  readonly registrationProvenance: Task134FrozenRegistrationProvenanceV1;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly handoffCapability: TaskOrchestratorHandoffCapability;
  readonly readiness: VerifiedSpecialistDispatchReadiness;
  readonly verifyStoreBinding: MountedAgentArtifactStores["verifyBinding"];
  readonly readbackHandoff: TaskOrchestratorHandoffCapability["readback"];
  readonly dispatchVerified: (input: VerifiedSpecialistDispatchInput) => Promise<VerifiedSpecialistRunnerDispatchResult>;
}

function normalizeFactoryClosedBinding(input: {
  readonly authority: MountedWorkspaceRuntimeAuthority;
  readonly registrations: readonly SpecialistRunnerRegistrationBinding[];
  readonly closedBinding: FactoryClosedSpecialistRunnerBinding;
  readonly dispatchVerified: (input: VerifiedSpecialistDispatchInput) => Promise<VerifiedSpecialistRunnerDispatchResult>;
}): ClosedSpecialistRunnerBinding {
  if (!isPlainOwnDataObject(input) || !hasOwnDataFunction(input, "dispatchVerified")) {
    throw readinessError("runner-registration-invalid");
  }
  const authority = normalizeAuthority(input.authority);
  if (!isPlainArray(input.registrations) || !isFactoryClosedBinding(input.closedBinding)) {
    throw readinessError("runner-registration-invalid");
  }
  const rawBinding = input.closedBinding;
  if (!input.registrations.includes(rawBinding.registration)) {
    throw readinessError("runner-registration-invalid");
  }
  if (
    rawBinding.artifactStores.workspaceId !== authority.workspaceId ||
    rawBinding.artifactStores.mountInstanceId !== authority.mountInstanceId
  ) {
    throw readinessError("workspace-identity-mismatch");
  }
  if (!isRegistrationCompatible(rawBinding.registration, rawBinding.registrationProvenance)) {
    throw readinessError("runner-registration-invalid");
  }

  const registration = normalizeRegistration(rawBinding.registration);
  const readiness = normalizeReadiness(rawBinding.readiness);
  if (!isReadinessCompatible(authority, registration, readiness)) {
    throw readinessError("runner-registration-invalid");
  }
  const artifactStores = normalizeArtifactStores(rawBinding.artifactStores);
  const handoffCapability = normalizeHandoffCapability(rawBinding.handoffCapability);
  const registrationProvenance = Object.freeze({
    runnerId: rawBinding.registrationProvenance.runnerId,
    runnerVersion: rawBinding.registrationProvenance.runnerVersion,
    workflowDescriptorHash: rawBinding.registrationProvenance.workflowDescriptorHash
  });

  return Object.freeze({
    authority,
    registration,
    registrationProvenance,
    artifactStores,
    handoffCapability,
    readiness,
    verifyStoreBinding: artifactStores.verifyBinding,
    readbackHandoff: handoffCapability.readback,
    dispatchVerified: input.dispatchVerified
  });
}

function normalizePublicDispatch(value: TaskOrchestratorRunnerDispatchInput): TaskOrchestratorRunnerDispatchInput {
  if (!isPlainOwnDataObject(value)) {
    throw readinessError("runner-registration-invalid");
  }
  const keys = Object.keys(value).sort();
  const expected = ["approvedRunId", "attemptId", "runType", "taskId"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw readinessError("runner-registration-invalid");
  }
  if (!isNonEmptyString(value.taskId) || !isNonEmptyString(value.attemptId) || !isNonEmptyString(value.approvedRunId) || !isNonEmptyString(value.runType)) {
    throw readinessError("runner-registration-invalid");
  }
  return Object.freeze({
    taskId: value.taskId,
    runType: value.runType as TaskOrchestratorRunType,
    attemptId: value.attemptId,
    approvedRunId: value.approvedRunId
  });
}

function buildVerifiedDispatch(
  closed: ClosedSpecialistRunnerBinding,
  publicDispatch: TaskOrchestratorRunnerDispatchInput
): VerifiedSpecialistDispatchInput {
  const readiness = closed.readiness;
  if (
    publicDispatch.taskId !== readiness.expectedTaskId ||
    publicDispatch.runType !== readiness.expectedRunType ||
    publicDispatch.attemptId !== readiness.expectedAttemptId ||
    publicDispatch.approvedRunId !== readiness.expectedRunId
  ) {
    throw readinessError("runner-registration-invalid");
  }
  return Object.freeze({
    ...publicDispatch,
    authority: closed.authority,
    artifactStores: closed.artifactStores,
    registration: closed.registration,
    registrationProvenance: closed.registrationProvenance,
    handoffCapability: closed.handoffCapability,
    readiness
  });
}

async function verifyDurableRunnerResult(input: {
  readonly closed: ClosedSpecialistRunnerBinding;
  readonly verified: VerifiedSpecialistDispatchInput;
  readonly result: VerifiedSpecialistRunnerDispatchResult;
}): Promise<TaskOrchestratorRunnerDispatchResult> {
  if (!isVerifiedDelegateResult(input.result)) {
    throw readinessError("handoff-readback-failed");
  }
  const durableHandoff = input.result.durableHandoff;
  const readbackInput = input.result.handoffReadbackInput;
  if (
    durableHandoff.runId !== input.verified.approvedRunId ||
    durableHandoff.taskId !== input.verified.taskId ||
    !isHandoffReadbackInputBound(readbackInput, input.verified)
  ) {
    throw readinessError("handoff-readback-failed");
  }

  let actualReadback: unknown;
  try {
    actualReadback = await input.closed.readbackHandoff.call(input.closed.handoffCapability, readbackInput);
  } catch {
    throw readinessError("handoff-readback-failed");
  }
  if (actualReadback !== readbackInput.recorded) {
    throw readinessError("handoff-readback-failed");
  }
  return input.result;
}

function isFactoryClosedBinding(value: unknown): value is FactoryClosedSpecialistRunnerBinding {
  return isPlainOwnDataObject(value) &&
    value.bindingVersion === "task134-factory-closed-specialist-runner.v1" &&
    isMountedArtifactStores(value.artifactStores) &&
    isRegistration(value.registration) &&
    isRegistrationProvenance(value.registrationProvenance) &&
    isHandoffCapability(value.handoffCapability) &&
    isReadiness(value.readiness);
}

function isVerifiedDelegateResult(value: unknown): value is VerifiedSpecialistRunnerDispatchResult {
  if (!isPlainOwnDataObject(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "durableHandoff" || keys[1] !== "handoffReadbackInput") {
    return false;
  }
  return isDurableHandoff(value.durableHandoff) && isHandoffReadbackInput(value.handoffReadbackInput);
}

function isDurableHandoff(value: unknown): value is VerifiedTask134DurableHandoff {
  return isPlainOwnDataObject(value) &&
    isNonEmptyString(value.runId) &&
    (value.taskId === undefined || isNonEmptyString(value.taskId)) &&
    isManifestStore(value.materialStore) &&
    isManifestStore(value.manifestStore) &&
    hasOwnDataKey(value, "handoffMaterial");
}

function isHandoffReadbackInput(value: unknown): value is TaskOrchestratorHandoffReadbackInput {
  return isPlainOwnDataObject(value) &&
    hasOwnDataKey(value, "claim") &&
    hasOwnDataKey(value, "recorded") &&
    (value.expectedRunId === undefined || isNonEmptyString(value.expectedRunId));
}

function isHandoffReadbackInputBound(
  value: TaskOrchestratorHandoffReadbackInput,
  verified: VerifiedSpecialistDispatchInput
): boolean {
  return value.expectedRunId === verified.approvedRunId;
}

function normalizeAuthority(value: unknown): MountedWorkspaceRuntimeAuthority {
  if (!isMountedAuthority(value)) {
    throw readinessError("workspace-identity-mismatch");
  }
  return Object.freeze({
    authorityVersion: value.authorityVersion,
    workspaceId: value.workspaceId,
    mountInstanceId: value.mountInstanceId,
    ledgerHighWaterMark: value.ledgerHighWaterMark
  });
}

function normalizeArtifactStores(value: MountedAgentArtifactStores): MountedAgentArtifactStores {
  if (!isMountedArtifactStores(value)) {
    throw readinessError("runner-registration-invalid");
  }
  const verifyBinding = Object.getOwnPropertyDescriptor(value, "verifyBinding")?.value as MountedAgentArtifactStores["verifyBinding"];
  return Object.freeze({
    storesVersion: value.storesVersion,
    workspaceId: value.workspaceId,
    mountInstanceId: value.mountInstanceId,
    async verifyBinding(input: Parameters<MountedAgentArtifactStores["verifyBinding"]>[0]) {
      return await verifyBinding.call(value, input);
    }
  });
}

function normalizeHandoffCapability(value: TaskOrchestratorHandoffCapability): TaskOrchestratorHandoffCapability {
  if (!isHandoffCapability(value)) {
    throw readinessError("runner-registration-invalid");
  }
  const prepare = Object.getOwnPropertyDescriptor(value, "prepare")?.value as TaskOrchestratorHandoffCapability["prepare"];
  const bind = Object.getOwnPropertyDescriptor(value, "bind")?.value as TaskOrchestratorHandoffCapability["bind"];
  const readback = Object.getOwnPropertyDescriptor(value, "readback")?.value as TaskOrchestratorHandoffCapability["readback"];
  return Object.freeze({
    async prepare(input: Parameters<TaskOrchestratorHandoffCapability["prepare"]>[0]) {
      return await prepare.call(value, input);
    },
    async bind(input: Parameters<TaskOrchestratorHandoffCapability["bind"]>[0]) {
      return await bind.call(value, input);
    },
    async readback(input: Parameters<TaskOrchestratorHandoffCapability["readback"]>[0]) {
      return await readback.call(value, input);
    }
  });
}

function normalizeRegistration(value: SpecialistRunnerRegistrationBinding): SpecialistRunnerRegistrationBinding {
  if (!isRegistration(value)) {
    throw readinessError("runner-registration-invalid");
  }
  return Object.freeze({
    runType: value.runType,
    runnerId: value.runnerId,
    runnerVersion: value.runnerVersion,
    workflowDescriptorHash: value.workflowDescriptorHash,
    requiredContextPackIds: Object.freeze([...value.requiredContextPackIds]),
    promptTemplateId: value.promptTemplateId,
    providerPolicyVersion: value.providerPolicyVersion,
    handoffSchemaVersion: value.handoffSchemaVersion,
    requiredAdapterFamilies: Object.freeze([...value.requiredAdapterFamilies])
  });
}

function normalizeReadiness(value: VerifiedSpecialistDispatchReadiness): VerifiedSpecialistDispatchReadiness {
  if (!isReadiness(value)) {
    throw readinessError("runner-registration-invalid");
  }
  return Object.freeze({ ...value, adapterFamilies: Object.freeze([...value.adapterFamilies]) });
}

function isReadinessCompatible(
  authority: MountedWorkspaceRuntimeAuthority,
  registration: SpecialistRunnerRegistrationBinding,
  readiness: VerifiedSpecialistDispatchReadiness
): boolean {
  return readiness.residentAgentId === "agent_default" &&
    readiness.workspaceId === authority.workspaceId &&
    readiness.mountInstanceId === authority.mountInstanceId &&
    readiness.authorityHighWaterMark === authority.ledgerHighWaterMark &&
    readiness.workflowDescriptorHash === registration.workflowDescriptorHash &&
    readiness.expectedContextBindingHash === readiness.contextBindingHash &&
    readiness.expectedPromptBindingHash === readiness.promptBindingHash &&
    readiness.approvalVerified === true &&
    readiness.budgetAvailable === true &&
    readiness.activeLock === false &&
    readiness.providerReady === true &&
    readiness.storeBindingVerified === true &&
    registration.requiredAdapterFamilies.every((family) => readiness.adapterFamilies.includes(family));
}

function isReadiness(value: unknown): value is VerifiedSpecialistDispatchReadiness {
  return isPlainOwnDataObject(value) &&
    value.residentAgentId === "agent_default" &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.mountInstanceId) &&
    isNonEmptyString(value.expectedTaskId) &&
    isNonEmptyString(value.expectedRunType) &&
    isNonEmptyString(value.expectedAttemptId) &&
    isNonEmptyString(value.expectedRunId) &&
    isFiniteNonNegativeInteger(value.authorityHighWaterMark) &&
    isHash(value.workflowDescriptorHash) &&
    isHash(value.expectedContextBindingHash) &&
    isHash(value.contextBindingHash) &&
    isHash(value.expectedPromptBindingHash) &&
    isHash(value.promptBindingHash) &&
    typeof value.approvalVerified === "boolean" &&
    typeof value.budgetAvailable === "boolean" &&
    typeof value.activeLock === "boolean" &&
    typeof value.providerReady === "boolean" &&
    typeof value.storeBindingVerified === "boolean" &&
    isPlainArray(value.adapterFamilies) && value.adapterFamilies.every(isNonEmptyString);
}

function isMountedAuthority(value: unknown): value is MountedWorkspaceRuntimeAuthority {
  return isPlainOwnDataObject(value) &&
    value.authorityVersion === "mounted-workspace-runtime-authority.v1" &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.mountInstanceId) &&
    isFiniteNonNegativeInteger(value.ledgerHighWaterMark);
}

function isMountedArtifactStores(value: unknown): value is MountedAgentArtifactStores {
  return isPlainOwnDataObject(value) &&
    value.storesVersion === "mounted-agent-artifact-stores.v1" &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.mountInstanceId) &&
    hasOwnDataFunction(value, "verifyBinding");
}

function isRegistration(value: unknown): value is SpecialistRunnerRegistrationBinding {
  return isPlainOwnDataObject(value) &&
    isNonEmptyString(value.runType) &&
    isNonEmptyString(value.runnerId) &&
    isFiniteNonNegativeInteger(value.runnerVersion) &&
    isHash(value.workflowDescriptorHash) &&
    isNonEmptyString(value.promptTemplateId) &&
    isNonEmptyString(value.providerPolicyVersion) &&
    isNonEmptyString(value.handoffSchemaVersion) &&
    isPlainArray(value.requiredContextPackIds) && value.requiredContextPackIds.every(isNonEmptyString) &&
    isPlainArray(value.requiredAdapterFamilies) && value.requiredAdapterFamilies.every(isNonEmptyString);
}

function isRegistrationProvenance(value: unknown): value is Task134FrozenRegistrationProvenanceV1 {
  return isPlainOwnDataObject(value) &&
    isNonEmptyString(value.runnerId) &&
    isFiniteNonNegativeInteger(value.runnerVersion) &&
    isHash(value.workflowDescriptorHash);
}

function isRegistrationCompatible(
  registration: SpecialistRunnerRegistrationBinding,
  provenance: Task134FrozenRegistrationProvenanceV1
): boolean {
  return registration.runnerId === provenance.runnerId &&
    registration.runnerVersion === provenance.runnerVersion &&
    registration.workflowDescriptorHash === provenance.workflowDescriptorHash;
}

function isHandoffCapability(value: unknown): value is TaskOrchestratorHandoffCapability {
  return isPlainOwnDataObject(value) &&
    hasOwnDataFunction(value, "prepare") &&
    hasOwnDataFunction(value, "bind") &&
    hasOwnDataFunction(value, "readback");
}

function isMountedStoreBindingReadback(value: unknown, authority: MountedWorkspaceRuntimeAuthority): value is MountedStoreBindingReadback {
  return isPlainOwnDataObject(value) &&
    value.bindingVersion === "mounted-store-binding-readback.v1" &&
    value.workspaceId === authority.workspaceId &&
    value.mountInstanceId === authority.mountInstanceId &&
    value.verified === true;
}

function isManifestStore(value: unknown): value is SpecialistHandoffManifestStore {
  return isPlainOwnDataObject(value) && hasOwnDataFunction(value, "put") && hasOwnDataFunction(value, "get");
}

function isPlainOwnDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) =>
    Object.prototype.hasOwnProperty.call(descriptor, "value")
  );
}

function isPlainArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) =>
      Object.prototype.hasOwnProperty.call(descriptor, "value")
    );
}

function hasOwnDataKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) &&
    Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value");
}

function hasOwnDataFunction(value: Record<string, unknown>, key: string): boolean {
  return hasOwnDataKey(value, key) && typeof Object.getOwnPropertyDescriptor(value, key)?.value === "function";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && value.startsWith("sha256:") && value.length > "sha256:".length;
}

function readinessError(code: SpecialistRunnerReadinessCode): SpecialistRunnerReadinessError {
  return new SpecialistRunnerReadinessError(code);
}
