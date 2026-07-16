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
  type FactoryIssuedMountedRuntimeCapture,
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

interface WakeRuntimeRegistration {
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly runtimeHandle: LocalRuntimeHandle;
  mountedRuntimeCapture?: FactoryIssuedMountedRuntimeCapture;
  lastIssuedAdmission?: WorkspaceAdmissionSnapshot;
}

interface OperationState {
  readonly registration: WakeRuntimeRegistration;
  readonly admission: WorkspaceAdmissionSnapshot;
  readonly facts: PortableWorkspaceMountedFacts;
  readonly mountedRuntimeCapture: FactoryIssuedMountedRuntimeCapture;
  mountedRuntimeInspection?: ReturnType<typeof inspectFactoryIssuedMountedRuntimeCapture>;
  mountedRuntimeCaptureInspected: boolean;
  burned: boolean;
}

interface MountedArtifactAuthorityRegistrationInput {
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly runtimeHandle: LocalRuntimeHandle;
}

const wakeRuntimeRegistrations = new WeakMap<object, WakeRuntimeRegistration>();
const operationStates = new WeakMap<MountedArtifactAuthorityOperation, OperationState>();

export function registerMountedArtifactAuthorityIssuerForWakeRuntime(input: {
  readonly wakeRuntime: object;
  readonly lifecyclePorts: PortableWorkspaceLifecyclePorts;
  readonly runtimeHandle: LocalRuntimeHandle;
}): void {
  const normalized = normalizeRegistrationInput(input);
  if (!isObject(normalized.wakeRuntime)) {
    throw new Error("wake runtime identity is required");
  }
  if (wakeRuntimeRegistrations.has(normalized.wakeRuntime)) {
    throw new Error("wake runtime authority issuer is already registered");
  }
  assertPortableWorkspaceLifecyclePortsForMountedArtifactAuthority(normalized.lifecyclePorts);
  const mountedRuntimeCapture = captureFactoryIssuedMountedRuntime(normalized.runtimeHandle);
  const registration: WakeRuntimeRegistration = {
    lifecyclePorts: normalized.lifecyclePorts,
    runtimeHandle: normalized.runtimeHandle,
    mountedRuntimeCapture
  };
  wakeRuntimeRegistrations.set(normalized.wakeRuntime, registration);
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
  const mountedRuntimeCapture = registration.mountedRuntimeCapture
    ?? captureFactoryIssuedMountedRuntime(registration.runtimeHandle);
  const operation = Object.freeze({
    schemaVersion: "mounted-artifact-authority-operation.v1" as const
  });
  operationStates.set(operation, {
    registration,
    admission: current.admission,
    facts: current.facts,
    mountedRuntimeCapture,
    mountedRuntimeCaptureInspected: false,
    burned: false
  });
  registration.lastIssuedAdmission = current.admission;
  delete registration.mountedRuntimeCapture;
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
 * every call but consumes Task135D's one-shot capture at most once.
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

/**
 * A stale operation must not surface a capture inspection, but it still drains
 * its private one-shot capture so the runtime factory no longer retains it.
 */
function burnOperation(state: OperationState): void {
  if (state.burned) return;
  state.burned = true;
  if (state.mountedRuntimeInspection !== undefined) return;
  if (state.mountedRuntimeCaptureInspected) return;
  state.mountedRuntimeCaptureInspected = true;
  try {
    inspectFactoryIssuedMountedRuntimeCapture(state.mountedRuntimeCapture);
  } catch {
    // A closed or forged capture cannot restore stale authority.
  }
}

function inspectAndRememberMountedRuntime(
  state: OperationState
): ReturnType<typeof inspectFactoryIssuedMountedRuntimeCapture> {
  try {
    const cached = state.mountedRuntimeInspection;
    const capture = cached === undefined
      ? state.mountedRuntimeCapture
      : captureFactoryIssuedMountedRuntime(state.registration.runtimeHandle);
    if (cached === undefined) state.mountedRuntimeCaptureInspected = true;
    const captured = inspectFactoryIssuedMountedRuntimeCapture(capture);
    if (
      captured.runtimeHandle !== state.registration.runtimeHandle
      || captured.ledger !== state.registration.runtimeHandle.ledger
      || captured.mountedWorkspace.workspaceId !== state.facts.workspaceId
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

function normalizeRegistrationInput(input: unknown): MountedArtifactAuthorityRegistrationInput {
  if (!isObject(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("mounted authority registration input must be a plain own-data object");
  }
  const ownKeys = Reflect.ownKeys(input);
  const expectedKeys = ["wakeRuntime", "lifecyclePorts", "runtimeHandle"] as const;
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => key !== "wakeRuntime" && key !== "lifecyclePorts" && key !== "runtimeHandle")
  ) {
    throw new Error("mounted authority registration input must be a plain own-data object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const values = expectedKeys.map((key) => {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error("mounted authority registration input must be a plain own-data object");
    }
    return descriptor.value;
  });
  return Object.freeze({
    wakeRuntime: values[0] as object,
    lifecyclePorts: values[1] as PortableWorkspaceLifecyclePorts,
    runtimeHandle: values[2] as LocalRuntimeHandle
  });
}
