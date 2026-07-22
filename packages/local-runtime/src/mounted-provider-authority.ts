import { types } from "node:util";
import {
  inspectMountedArtifactAuthorityOperationForMountedProviderAuthority,
  type MountedProviderAuthorityOperationInspection
} from "./mounted-artifact-authority-operation.js";

export interface MountedProviderAuthority {
  readonly schemaVersion: "mounted-provider-authority.v1";
}

export interface MountedProviderAuthorityReadback {
  readonly schemaVersion: "mounted-provider-authority-readback.v1";
  readonly stage: "locator";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly admissionGenerationId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly durableLedgerEventCount: number;
}

interface MountedProviderAuthorityState {
  readonly operation: object;
  readonly binding: MountedProviderAuthorityOperationInspection;
  burned: boolean;
}

const mountedProviderAuthorityStates = new WeakMap<object, MountedProviderAuthorityState>();

/**
 * Issues a process-local locator only after the transferred factory operation
 * seam authenticates the exact mounted authority identity. P1 configuration
 * data and every other caller value are intentionally excluded.
 */
export function issueMountedProviderAuthority(input: unknown): MountedProviderAuthority {
  const operation = operationFromInput(input);
  const binding = currentBinding(operation);
  const authority: MountedProviderAuthority = Object.freeze({
    schemaVersion: "mounted-provider-authority.v1"
  });
  mountedProviderAuthorityStates.set(authority, { operation, binding, burned: false });
  return authority;
}

/**
 * Rereads only the mounted durable ledger and fails closed if any exact
 * operation, runtime, admission, policy, lock, high-water, or ledger binding
 * changes across the asynchronous boundary.
 */
export async function inspectMountedProviderAuthority(authority: unknown): Promise<MountedProviderAuthorityReadback> {
  const state = authorityState(authority);
  const initial = currentFor(state);
  let records: Awaited<ReturnType<MountedProviderAuthorityOperationInspection["ledger"]["readAll"]>>;
  try {
    records = await initial.ledger.readAll();
  } catch {
    burn(state);
    throw unavailable();
  }

  const current = currentFor(state);
  if (!sameInspection(initial, current) || !isExactLedgerArray(records)) {
    burn(state);
    throw unavailable();
  }

  const snapshot = current.snapshot;
  return Object.freeze({
    schemaVersion: "mounted-provider-authority-readback.v1",
    stage: "locator",
    workspaceId: snapshot.workspaceId,
    mountInstanceId: snapshot.mountInstanceId,
    admissionGenerationId: projectedAdmissionGenerationId(snapshot.admissionGenerationId),
    policyVersion: snapshot.policyVersion,
    policyDigest: snapshot.policyDigest,
    lockStateDigest: snapshot.lockStateDigest,
    highWaterMark: snapshot.highWaterMark,
    highWaterOrdinal: snapshot.highWaterOrdinal,
    durableLedgerEventCount: records.length
  });
}

function operationFromInput(input: unknown): object {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw unavailable();
  }
  if (Reflect.ownKeys(input).length !== 1 || !Object.prototype.hasOwnProperty.call(input, "operation")) {
    throw unavailable();
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "operation");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    !descriptor.enumerable ||
    descriptor.value === null ||
    typeof descriptor.value !== "object"
  ) {
    throw unavailable();
  }
  return authenticatedOperation(descriptor.value);
}

function authenticatedOperation(value: object): object {
  try {
    inspectMountedArtifactAuthorityOperationForMountedProviderAuthority(value);
    return value;
  } catch {
    throw unavailable();
  }
}

function authorityState(authority: unknown): MountedProviderAuthorityState {
  if (authority === null || typeof authority !== "object") throw unavailable();
  const state = mountedProviderAuthorityStates.get(authority);
  if (state === undefined || state.burned) throw unavailable();
  return state;
}

function currentFor(state: MountedProviderAuthorityState): MountedProviderAuthorityOperationInspection {
  let current: MountedProviderAuthorityOperationInspection;
  try {
    current = currentBinding(state.operation);
  } catch {
    burn(state);
    throw unavailable();
  }
  if (!sameInspection(state.binding, current)) {
    burn(state);
    throw unavailable();
  }
  return current;
}

function currentBinding(operation: object): MountedProviderAuthorityOperationInspection {
  try {
    return inspectMountedArtifactAuthorityOperationForMountedProviderAuthority(operation);
  } catch {
    throw unavailable();
  }
}

function sameInspection(
  left: MountedProviderAuthorityOperationInspection,
  right: MountedProviderAuthorityOperationInspection
): boolean {
  const a = left.snapshot;
  const b = right.snapshot;
  return left.ledger === right.ledger &&
    a.workspaceId === b.workspaceId &&
    a.mountInstanceId === b.mountInstanceId &&
    a.workspaceIdentityEventId === b.workspaceIdentityEventId &&
    a.mountEvidenceId === b.mountEvidenceId &&
    a.authorityEvidenceId === b.authorityEvidenceId &&
    a.ledgerStoreEvidenceId === b.ledgerStoreEvidenceId &&
    a.artifactStoreEvidenceId === b.artifactStoreEvidenceId &&
    a.derivativeStoreEvidenceId === b.derivativeStoreEvidenceId &&
    a.policyVersion === b.policyVersion &&
    a.policyDigest === b.policyDigest &&
    a.lockStateDigest === b.lockStateDigest &&
    a.highWaterMark === b.highWaterMark &&
    a.highWaterOrdinal === b.highWaterOrdinal &&
    a.admissionGenerationId === b.admissionGenerationId;
}

function isExactLedgerArray(value: readonly unknown[]): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (
    length === undefined ||
    !("value" in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string") ||
    Object.getOwnPropertyNames(value).length !== length.value + 1
  ) {
    return false;
  }
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      return false;
    }
  }
  return true;
}

function projectedAdmissionGenerationId(value: string): string {
  const match = /^admission:([0-9]+)$/.exec(value);
  if (match === null) throw unavailable();
  const generation = match[1];
  if (generation === undefined) throw unavailable();
  return `admission_generation_${generation}`;
}

function burn(state: MountedProviderAuthorityState): void {
  state.burned = true;
}

function unavailable(): Error {
  return new Error("mounted provider authority is unavailable");
}
