import { hashCanonicalSpecialistHandoffJson } from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashMountedSpecialistHandoffPreparationReadback,
  hashUntrustedSpecialistHandoffPreparation,
  parseMountedSpecialistHandoffPreparationReadback,
  parseUntrustedSpecialistHandoffPreparation,
  type MountedSpecialistHandoffPreparationReadbackV1,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import type { SpecialistHandoffManifestStore } from "../../agent/src/specialist-runner-kernel.js";

export interface MountedPreparationAuthority {
  readonly authorityVersion: "mounted-workspace-runtime-authority.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly policyVersion: string;
  readonly sourceHighWaterMark: number;
}

export interface MountedAgentArtifactStores {
  readonly storesVersion: "mounted-agent-artifact-stores.v1";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
}

export interface MountedSpecialistHandoffPreparationBinder {
  prepare(preparation: UntrustedSpecialistHandoffPreparationV1): MountedSpecialistHandoffPreparationReadbackV1;
}

export interface CreateMountedSpecialistHandoffPreparationBinderInput {
  readonly authority: MountedPreparationAuthority;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
}

interface CapturedMountedPreparationBinding {
  readonly authoritySource: unknown;
  readonly artifactStoresSource: unknown;
  readonly authority: MountedPreparationAuthority;
  readonly artifactStores: MountedAgentArtifactStores;
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
}

const capturedBindings = new WeakMap<object, CapturedMountedPreparationBinding>();

/**
 * Captures factory-owned mounted stores and returns the non-indexed binder that
 * Task140R0 will invoke directly. It never reads or writes either store.
 */
export function createMountedSpecialistHandoffPreparationBinder(
  value: CreateMountedSpecialistHandoffPreparationBinderInput
): MountedSpecialistHandoffPreparationBinder {
  const captured = captureBinding(value);
  const binder: MountedSpecialistHandoffPreparationBinder = {
    prepare(preparation: UntrustedSpecialistHandoffPreparationV1): MountedSpecialistHandoffPreparationReadbackV1 {
      const binding = capturedBindings.get(this);
      if (binding === undefined) {
        throw bindingError();
      }
      return prepareWithCapturedBinding(binding, preparation);
    }
  };
  capturedBindings.set(binder, captured);
  return Object.freeze(binder);
}

function prepareWithCapturedBinding(
  captured: CapturedMountedPreparationBinding,
  value: unknown
): MountedSpecialistHandoffPreparationReadbackV1 {
  assertCapturedBindingCurrent(captured);

  let preparation: UntrustedSpecialistHandoffPreparationV1;
  try {
    preparation = parseUntrustedSpecialistHandoffPreparation(value);
    const { preparationHash, ...unsigned } = preparation;
    if (hashUntrustedSpecialistHandoffPreparation(unsigned) !== preparationHash) {
      throw bindingError();
    }
  } catch {
    throw bindingError();
  }

  if (
    preparation.taskId !== captured.taskId ||
    preparation.attemptId !== captured.attemptId ||
    preparation.approvedRunId !== captured.approvedRunId ||
    preparation.runType !== captured.runType
  ) {
    throw bindingError();
  }

  const unsignedReadback = {
    schemaVersion: "agent-specialist-handoff-preparation-readback.v1" as const,
    preparationHash: preparation.preparationHash,
    workspaceId: captured.authority.workspaceId,
    mountInstanceId: captured.authority.mountInstanceId,
    materialStoreBindingHash: storeBindingHash(captured.authority, "material"),
    manifestStoreBindingHash: storeBindingHash(captured.authority, "manifest")
  };
  const readback = {
    ...unsignedReadback,
    readbackHash: hashMountedSpecialistHandoffPreparationReadback(unsignedReadback)
  };
  try {
    return parseMountedSpecialistHandoffPreparationReadback(readback);
  } catch {
    throw bindingError();
  }
}

function captureBinding(value: unknown): CapturedMountedPreparationBinding {
  const input = exactOwnDataObject(value, ["authority", "artifactStores", "taskId", "attemptId", "approvedRunId", "runType"]);
  const authority = captureAuthority(input.authority);
  const artifactStores = captureArtifactStores(input.artifactStores);
  const taskId = requiredText(input.taskId);
  const attemptId = requiredText(input.attemptId);
  const approvedRunId = requiredText(input.approvedRunId);
  const runType = requiredText(input.runType);

  if (
    authority.workspaceId !== artifactStores.workspaceId ||
    authority.mountInstanceId !== artifactStores.mountInstanceId
  ) {
    throw bindingError();
  }
  return Object.freeze({
    authoritySource: input.authority,
    artifactStoresSource: input.artifactStores,
    authority,
    artifactStores,
    taskId,
    attemptId,
    approvedRunId,
    runType
  });
}

function assertCapturedBindingCurrent(captured: CapturedMountedPreparationBinding): void {
  const currentAuthority = captureAuthority(captured.authoritySource);
  const currentStores = captureArtifactStores(captured.artifactStoresSource);
  if (
    currentAuthority.workspaceId !== captured.authority.workspaceId ||
    currentAuthority.mountInstanceId !== captured.authority.mountInstanceId ||
    currentAuthority.workspaceIdentityEventId !== captured.authority.workspaceIdentityEventId ||
    currentAuthority.policyVersion !== captured.authority.policyVersion ||
    currentAuthority.sourceHighWaterMark !== captured.authority.sourceHighWaterMark ||
    currentStores.workspaceId !== captured.artifactStores.workspaceId ||
    currentStores.mountInstanceId !== captured.artifactStores.mountInstanceId ||
    currentStores.materialStore !== captured.artifactStores.materialStore ||
    currentStores.manifestStore !== captured.artifactStores.manifestStore ||
    currentAuthority.workspaceId !== currentStores.workspaceId ||
    currentAuthority.mountInstanceId !== currentStores.mountInstanceId
  ) {
    throw bindingError();
  }
}

function captureAuthority(value: unknown): MountedPreparationAuthority {
  const authority = ownDataRecord(value);
  if (
    authority.authorityVersion !== "mounted-workspace-runtime-authority.v1" ||
    !isText(authority.workspaceId) ||
    !isText(authority.mountInstanceId) ||
    !isText(authority.workspaceIdentityEventId) ||
    !isText(authority.policyVersion) ||
    !isNonnegativeInteger(authority.sourceHighWaterMark)
  ) {
    throw bindingError();
  }
  return Object.freeze({
    authorityVersion: "mounted-workspace-runtime-authority.v1",
    workspaceId: authority.workspaceId,
    mountInstanceId: authority.mountInstanceId,
    workspaceIdentityEventId: authority.workspaceIdentityEventId,
    policyVersion: authority.policyVersion,
    sourceHighWaterMark: authority.sourceHighWaterMark
  });
}

function captureArtifactStores(value: unknown): MountedAgentArtifactStores {
  const stores = exactOwnDataObject(value, ["storesVersion", "workspaceId", "mountInstanceId", "materialStore", "manifestStore"]);
  if (
    stores.storesVersion !== "mounted-agent-artifact-stores.v1" ||
    !isText(stores.workspaceId) ||
    !isText(stores.mountInstanceId) ||
    !isManifestStore(stores.materialStore) ||
    !isManifestStore(stores.manifestStore) ||
    stores.materialStore === stores.manifestStore
  ) {
    throw bindingError();
  }
  return Object.freeze({
    storesVersion: "mounted-agent-artifact-stores.v1",
    workspaceId: stores.workspaceId,
    mountInstanceId: stores.mountInstanceId,
    materialStore: stores.materialStore,
    manifestStore: stores.manifestStore
  });
}

function isManifestStore(value: unknown): value is SpecialistHandoffManifestStore {
  const store = ownDataRecord(value);
  return typeof store.put === "function" && typeof store.get === "function";
}

function storeBindingHash(
  authority: MountedPreparationAuthority,
  role: "material" | "manifest"
): `sha256:${string}` {
  return hashCanonicalSpecialistHandoffJson({
    schemaVersion: "mounted-specialist-handoff-store-binding.v1",
    role,
    authorityVersion: authority.authorityVersion,
    workspaceId: authority.workspaceId,
    mountInstanceId: authority.mountInstanceId,
    workspaceIdentityEventId: authority.workspaceIdentityEventId,
    policyVersion: authority.policyVersion,
    sourceHighWaterMark: authority.sourceHighWaterMark
  });
}

function exactOwnDataObject(value: unknown, expectedFields: readonly string[]): Record<string, unknown> {
  const record = ownDataRecord(value);
  const actualFields = Object.getOwnPropertyNames(record).sort();
  const expected = [...expectedFields].sort();
  if (actualFields.length !== expected.length || actualFields.some((field, index) => field !== expected[index])) {
    throw bindingError();
  }
  return record;
}

function ownDataRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw bindingError();
  }
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw bindingError();
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const field of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw bindingError();
    }
    result[field] = descriptor.value;
  }
  return Object.freeze(result);
}

function requiredText(value: unknown): string {
  if (!isText(value)) {
    throw bindingError();
  }
  return value;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function bindingError(): Error {
  return new Error("mounted-specialist-handoff-preparation-binding-invalid");
}
