import type { WorkspaceAdmissionSnapshot } from "../../agent/src/wake-supervisor.js";
import {
  assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority,
  inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority,
  type PortableWorkspaceLifecyclePorts,
  type PortableWorkspaceMountedFacts
} from "./portable-workspace-lifecycle.js";
import {
  captureFactoryIssuedMountedRuntime,
  inspectFactoryIssuedMountedRuntimeCapture,
  type FactoryIssuedMountedRuntimeSourceHighWater,
  type FactoryIssuedMountedWorkspaceSnapshot,
  type LocalRuntimeHandle
} from "./runtime-factory.js";

export interface MountedArtifactAuthorityOperation {
  readonly schemaVersion: "mounted-artifact-authority-operation.v1";
}

export interface MountedArtifactAuthoritySnapshot {
  readonly schemaVersion: "mounted-artifact-authority-snapshot.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly artifactStoreEvidenceId: string;
  readonly derivativeStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly admissionGenerationId: string;
}

const portableMountedArtifactAuthorityOperationInspectionBrand = Symbol(
  "portable-mounted-artifact-authority-operation-inspection"
);
const mountedOfficialFlowFeasibilityInspectionBrand = Symbol(
  "mounted-official-flow-feasibility-inspection"
);

/**
 * Private Task135B handoff. It is intentionally neither indexed nor accepted
 * from callers: an exact operation identity is its only input.
 */
export interface PortableMountedArtifactAuthorityOperationInspection {
  readonly [portableMountedArtifactAuthorityOperationInspectionBrand]: "portable-mounted-artifact-authority-operation-inspection.v1";
  readonly snapshot: MountedArtifactAuthoritySnapshot;
  readonly ledger: LocalRuntimeHandle["ledger"];
  readonly mountedWorkspace: NonNullable<LocalRuntimeHandle["mountedWorkspace"]>;
  readonly workspace: FactoryIssuedMountedWorkspaceSnapshot;
  readonly sourceHighWater: FactoryIssuedMountedRuntimeSourceHighWater;
}

/**
 * This is a source-private capability bridge for mounted feasibility evidence.
 * It deliberately omits the runtime handle, workspace paths, and any caller
 * supplied append/read callbacks.
 */
export interface MountedOfficialFlowFeasibilityOperationInspection {
  readonly [mountedOfficialFlowFeasibilityInspectionBrand]: "mounted-official-flow-feasibility-inspection.v1";
  readonly snapshot: MountedArtifactAuthoritySnapshot;
  readonly ledger: LocalRuntimeHandle["ledger"];
}

export interface FactoryAuthenticatedMountedWakeCapability {
  readonly schemaVersion: "factory-authenticated-mounted-wake-capability.v1";
}

interface FactoryAuthenticatedMountedWakeCapturedState {
  readonly ledger: LocalRuntimeHandle["ledger"];
  readonly mountedWorkspace: NonNullable<LocalRuntimeHandle["mountedWorkspace"]>;
  readonly workspace: FactoryIssuedMountedWorkspaceSnapshot;
  readonly sourceHighWater: FactoryIssuedMountedRuntimeSourceHighWater;
}

interface WakeRuntimeRegistration {
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly capability: FactoryAuthenticatedMountedWakeCapability;
  lastIssuedAdmission?: WorkspaceAdmissionSnapshot;
}

interface OperationState {
  readonly registration: WakeRuntimeRegistration;
  readonly admission: WorkspaceAdmissionSnapshot;
  readonly facts: PortableWorkspaceMountedFacts;
  mountedRuntimeInspection?: FactoryAuthenticatedMountedWakeCapturedState;
  burned: boolean;
}

interface LegacyMountedArtifactAuthorityRegistrationInput {
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly runtimeHandle: LocalRuntimeHandle;
}

interface FactoryAuthenticatedMountedWakeCapabilityState {
  readonly runtimeHandle: LocalRuntimeHandle;
  readonly initial: FactoryAuthenticatedMountedWakeCapturedState;
  boundWakeRuntime?: object;
  burned: boolean;
}

const wakeRuntimeRegistrations = new WeakMap<object, WakeRuntimeRegistration>();
const operationStates = new WeakMap<MountedArtifactAuthorityOperation, OperationState>();
const factoryAuthenticatedMountedWakeCapabilities = new WeakMap<
  FactoryAuthenticatedMountedWakeCapability,
  FactoryAuthenticatedMountedWakeCapabilityState
>();

export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly phase: "authenticate";
  readonly runtimeHandle: unknown;
}): FactoryAuthenticatedMountedWakeCapability;
export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly phase: "bind";
  readonly capability: FactoryAuthenticatedMountedWakeCapability;
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
}): void;
/** @deprecated Existing released callers are routed through the two phases. */
export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: LegacyMountedArtifactAuthorityRegistrationInput): void;
export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: unknown): FactoryAuthenticatedMountedWakeCapability | void {
  const record = normalizedRegistrationRecord(input);
  if (record.phase === "authenticate") {
    requireRegistrationKeys(record, ["phase", "runtimeHandle"]);
    return authenticateMountedWakeCapability(record.runtimeHandle);
  }
  if (record.phase === "bind") {
    requireRegistrationKeys(record, ["phase", "capability", "wakeRuntime", "lifecyclePorts"]);
    bindMountedWakeCapability({
      capability: record.capability as FactoryAuthenticatedMountedWakeCapability,
      wakeRuntime: record.wakeRuntime,
      lifecyclePorts: record.lifecyclePorts as PortableWorkspaceLifecyclePorts
    });
    return;
  }

  requireRegistrationKeys(record, ["wakeRuntime", "lifecyclePorts", "runtimeHandle"]);
  const legacy = Object.freeze({
    wakeRuntime: record.wakeRuntime,
    lifecyclePorts: record.lifecyclePorts as PortableWorkspaceLifecyclePorts,
    runtimeHandle: record.runtimeHandle
  });
  const capability = authenticateMountedWakeCapability(legacy.runtimeHandle);
  bindMountedWakeCapability({
    capability,
    wakeRuntime: legacy.wakeRuntime,
    lifecyclePorts: legacy.lifecyclePorts
  });
}

/**
 * This is the sole capability-to-mounted-store seam. Its returned state is
 * module-private; the opaque capability never carries handle-owned data.
 */
export function inspectFactoryAuthenticatedMountedWakeCapabilityForMountedWakeLifecycleStore(
  capability: FactoryAuthenticatedMountedWakeCapability
): FactoryAuthenticatedMountedWakeCapturedState {
  return inspectCurrentMountedWakeCapability(capability);
}

function authenticateMountedWakeCapability(runtimeHandle: unknown): FactoryAuthenticatedMountedWakeCapability {
  const captured = captureCurrentMountedWakeState(runtimeHandle);
  const capability = Object.freeze({
    schemaVersion: "factory-authenticated-mounted-wake-capability.v1" as const
  });
  factoryAuthenticatedMountedWakeCapabilities.set(capability, {
    runtimeHandle: runtimeHandle as LocalRuntimeHandle,
    initial: captured,
    burned: false
  });
  return capability;
}

function bindMountedWakeCapability(input: {
  readonly capability: FactoryAuthenticatedMountedWakeCapability;
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
}): void {
  const state = factoryAuthenticatedMountedWakeCapabilities.get(input.capability);
  if (state === undefined || state.burned) {
    throw new Error("factory-authenticated mounted wake capability is required");
  }
  inspectCurrentMountedWakeCapability(input.capability);
  if (!isObject(input.wakeRuntime)) {
    throw new Error("wake runtime identity is required");
  }
  if (state.boundWakeRuntime !== undefined && state.boundWakeRuntime !== input.wakeRuntime) {
    throw new Error("factory-authenticated mounted wake capability is already bound");
  }
  if (wakeRuntimeRegistrations.has(input.wakeRuntime)) {
    throw new Error("wake runtime authority issuer is already registered");
  }
  assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority(input.lifecyclePorts);
  const registration: WakeRuntimeRegistration = {
    lifecyclePorts: input.lifecyclePorts,
    capability: input.capability
  };
  state.boundWakeRuntime = input.wakeRuntime;
  wakeRuntimeRegistrations.set(input.wakeRuntime, registration);
}

export function issueMountedArtifactAuthorityOperationForFactory(
  wakeRuntime: object
): MountedArtifactAuthorityOperation {
  const registration = wakeRuntimeRegistrations.get(wakeRuntime);
  if (registration === undefined) {
    throw new Error("registered wake runtime identity is required");
  }
  const current = inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority(
    registration.lifecyclePorts
  );
  if (registration.lastIssuedAdmission === current.admission) {
    throw new Error("current portable workspace admission already issued an authority operation");
  }
  inspectCurrentMountedWakeCapability(registration.capability);
  const operation = Object.freeze({
    schemaVersion: "mounted-artifact-authority-operation.v1" as const
  });
  operationStates.set(operation, {
    registration,
    admission: current.admission,
    facts: current.facts,
    burned: false
  });
  registration.lastIssuedAdmission = current.admission;
  return operation;
}

export function inspectMountedArtifactAuthorityOperation(
  operation: MountedArtifactAuthorityOperation
): MountedArtifactAuthoritySnapshot {
  const state = currentOperationState(operation);
  inspectAndRememberMountedRuntime(state);
  return snapshotFor(state.facts, state.admission);
}

/**
 * The sole non-public operation-to-Task135B seam. It rereads currentness on
 * every call through the factory-authenticated wake capability.
 */
export function inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(
  operation: MountedArtifactAuthorityOperation
): PortableMountedArtifactAuthorityOperationInspection {
  const state = currentOperationState(operation);
  const captured = inspectAndRememberMountedRuntime(state);
  return Object.freeze({
    [portableMountedArtifactAuthorityOperationInspectionBrand]: "portable-mounted-artifact-authority-operation-inspection.v1" as const,
    snapshot: snapshotFor(state.facts, state.admission),
    ledger: captured.ledger,
    mountedWorkspace: captured.mountedWorkspace,
    workspace: captured.workspace,
    sourceHighWater: captured.sourceHighWater
  });
}

export function inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility(
  operation: MountedArtifactAuthorityOperation
): MountedOfficialFlowFeasibilityOperationInspection {
  const state = currentOperationState(operation);
  const captured = inspectAndRememberMountedRuntime(state);
  return Object.freeze({
    [mountedOfficialFlowFeasibilityInspectionBrand]: "mounted-official-flow-feasibility-inspection.v1" as const,
    snapshot: snapshotFor(state.facts, state.admission),
    ledger: captured.ledger
  });
}

function currentOperationState(operation: MountedArtifactAuthorityOperation): OperationState {
  const state = operationStates.get(operation);
  if (state === undefined || state.burned) {
    throw new Error("mounted artifact authority operation is burned");
  }
  try {
    const current = inspectCurrentPortableWorkspaceAdmissionForMountedArtifactAuthority(
      state.registration.lifecyclePorts
    );
    if (current.admission !== state.admission) {
      burnOperation(state);
      throw new Error("mounted artifact authority operation is no longer current");
    }
  } catch (error) {
    burnOperation(state);
    if (error instanceof Error && /mounted artifact authority operation/.test(error.message)) {
      throw error;
    }
    throw new Error("mounted artifact authority operation is no longer current");
  }
  return state;
}

function burnOperation(state: OperationState): void {
  if (state.burned) return;
  state.burned = true;
}

function inspectAndRememberMountedRuntime(
  state: OperationState
): FactoryAuthenticatedMountedWakeCapturedState {
  try {
    const cached = state.mountedRuntimeInspection;
    const captured = inspectCurrentMountedWakeCapability(state.registration.capability);
    if (
      captured.mountedWorkspace.workspaceId !== state.facts.workspaceId
      || captured.workspace.workspaceId !== state.facts.workspaceId
      || captured.mountedWorkspace.rootDir !== captured.workspace.rootDir
      || captured.sourceHighWater.ledger !== captured.ledger
      || captured.sourceHighWater.workspaceId !== captured.workspace.workspaceId
      || captured.sourceHighWater.rootDir !== captured.workspace.rootDir
    ) {
      throw new Error("factory-issued mounted runtime capture does not match the authority operation");
    }
    if (cached === undefined) state.mountedRuntimeInspection = captured;
    return cached ?? captured;
  } catch {
    burnOperation(state);
    throw new Error("mounted artifact authority operation is no longer current");
  }
}

function inspectCurrentMountedWakeCapability(
  capability: FactoryAuthenticatedMountedWakeCapability
): FactoryAuthenticatedMountedWakeCapturedState {
  const state = factoryAuthenticatedMountedWakeCapabilities.get(capability);
  if (state === undefined || state.burned) {
    throw new Error("factory-authenticated mounted wake capability is no longer current");
  }
  try {
    const captured = captureCurrentMountedWakeState(state.runtimeHandle);
    if (!sameCapturedMountedWakeState(captured, state.initial)) {
      throw new Error("factory-authenticated mounted wake capability is no longer current");
    }
    return captured;
  } catch {
    state.burned = true;
    throw new Error("factory-authenticated mounted wake capability is no longer current");
  }
}

function captureCurrentMountedWakeState(runtimeHandle: unknown): FactoryAuthenticatedMountedWakeCapturedState {
  const capture = captureFactoryIssuedMountedRuntime(runtimeHandle as LocalRuntimeHandle);
  const inspected = inspectFactoryIssuedMountedRuntimeCapture(capture);
  return Object.freeze({
    ledger: inspected.ledger,
    mountedWorkspace: inspected.mountedWorkspace,
    workspace: inspected.workspace,
    sourceHighWater: inspected.sourceHighWater
  });
}

function sameCapturedMountedWakeState(
  left: FactoryAuthenticatedMountedWakeCapturedState,
  right: FactoryAuthenticatedMountedWakeCapturedState
): boolean {
  return left.ledger === right.ledger
    && left.mountedWorkspace === right.mountedWorkspace
    && left.workspace === right.workspace
    && left.sourceHighWater === right.sourceHighWater;
}

function snapshotFor(
  facts: PortableWorkspaceMountedFacts,
  admission: WorkspaceAdmissionSnapshot
): MountedArtifactAuthoritySnapshot {
  return Object.freeze({
    schemaVersion: "mounted-artifact-authority-snapshot.v1" as const,
    workspaceId: facts.workspaceId,
    mountInstanceId: facts.mountInstanceId,
    workspaceIdentityEventId: facts.workspaceIdentityEventId,
    mountEvidenceId: facts.mountEvidenceId,
    authorityEvidenceId: facts.authorityEvidenceId,
    ledgerStoreEvidenceId: facts.ledgerStoreEvidenceId,
    artifactStoreEvidenceId: facts.artifactStoreEvidenceId,
    derivativeStoreEvidenceId: facts.derivativeStoreEvidenceId,
    policyVersion: facts.policyVersion,
    policyDigest: facts.policyDigest,
    lockStateDigest: facts.lockStateDigest,
    highWaterMark: facts.highWaterMark,
    highWaterOrdinal: facts.highWaterOrdinal,
    admissionGenerationId: admission.admissionGeneration.generationId
  });
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function normalizedRegistrationRecord(input: unknown): Record<string, unknown> {
  if (!isObject(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("mounted authority registration input must be a plain own-data object");
  }
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) {
    throw new Error("mounted authority registration input must be a plain own-data object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const record: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error("mounted authority registration input must be a plain own-data object");
    }
    record[key] = descriptor.value;
  }
  return record;
}

function requireRegistrationKeys(record: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(record).sort();
  if (keys.length !== expected.length || !expected.every((key) => Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error("mounted authority registration input must be a plain own-data object");
  }
}
