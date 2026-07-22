import {
  hashCanonicalSpecialistHandoffJson,
  hashSpecialistHandoffMaterial,
  parseSpecialistHandoffMaterial,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";

export interface UntrustedSpecialistHandoffPreparationV1 {
  readonly schemaVersion: "agent-specialist-handoff-preparation.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: string;
  readonly handoffMaterial: SpecialistHandoffMaterial;
  readonly handoffMaterialHash: `sha256:${string}`;
  readonly preparationHash: `sha256:${string}`;
}

export interface MountedSpecialistHandoffPreparationReadbackV1 {
  readonly schemaVersion: "agent-specialist-handoff-preparation-readback.v1";
  readonly preparationHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly materialStoreBindingHash: `sha256:${string}`;
  readonly manifestStoreBindingHash: `sha256:${string}`;
  readonly readbackHash: `sha256:${string}`;
}

type UnsignedPreparation = Omit<UntrustedSpecialistHandoffPreparationV1, "preparationHash">;
type UnsignedReadback = Omit<MountedSpecialistHandoffPreparationReadbackV1, "readbackHash">;

const preparationFields = [
  "schemaVersion",
  "taskId",
  "attemptId",
  "approvedRunId",
  "runType",
  "handoffMaterial",
  "handoffMaterialHash"
] as const;
const preparationWithHashFields = [...preparationFields, "preparationHash"] as const;
const readbackFields = [
  "schemaVersion",
  "preparationHash",
  "workspaceId",
  "mountInstanceId",
  "materialStoreBindingHash",
  "manifestStoreBindingHash"
] as const;
const readbackWithHashFields = [...readbackFields, "readbackHash"] as const;

export function parseUntrustedSpecialistHandoffPreparation(value: unknown): UntrustedSpecialistHandoffPreparationV1 {
  const raw = exactOwnDataObject(value, preparationWithHashFields, "preparation");
  const unsigned = parseUnsignedPreparation(raw);
  const preparationHash = requiredHash(raw.preparationHash, "preparationHash");
  const expectedHash = hashUntrustedSpecialistHandoffPreparation(unsigned);
  if (preparationHash !== expectedHash) {
    throw new Error("Specialist handoff preparation hash does not match canonical preparation bytes.");
  }
  return Object.freeze({ ...unsigned, preparationHash });
}

export function hashUntrustedSpecialistHandoffPreparation(value: UnsignedPreparation): `sha256:${string}` {
  const unsigned = parseUnsignedPreparation(exactOwnDataObject(value, preparationFields, "preparation"));
  return hashCanonicalSpecialistHandoffJson(unsigned);
}

export function parseMountedSpecialistHandoffPreparationReadback(value: unknown): MountedSpecialistHandoffPreparationReadbackV1 {
  const raw = exactOwnDataObject(value, readbackWithHashFields, "readback");
  const unsigned = parseUnsignedReadback(raw);
  const readbackHash = requiredHash(raw.readbackHash, "readbackHash");
  const expectedHash = hashMountedSpecialistHandoffPreparationReadback(unsigned);
  if (readbackHash !== expectedHash) {
    throw new Error("Specialist handoff preparation readback hash does not match canonical readback bytes.");
  }
  return Object.freeze({ ...unsigned, readbackHash });
}

export function hashMountedSpecialistHandoffPreparationReadback(value: UnsignedReadback): `sha256:${string}` {
  const unsigned = parseUnsignedReadback(exactOwnDataObject(value, readbackFields, "readback"));
  return hashCanonicalSpecialistHandoffJson(unsigned);
}

function parseUnsignedPreparation(raw: Record<string, unknown>): UnsignedPreparation {
  if (raw.schemaVersion !== "agent-specialist-handoff-preparation.v1") {
    throw new Error("Specialist handoff preparation schemaVersion is invalid.");
  }
  const handoffMaterial = parseSpecialistHandoffMaterial(raw.handoffMaterial);
  const handoffMaterialHash = requiredHash(raw.handoffMaterialHash, "handoffMaterialHash");
  if (handoffMaterialHash !== hashSpecialistHandoffMaterial(handoffMaterial)) {
    throw new Error("Specialist handoff preparation handoffMaterialHash does not match canonical material bytes.");
  }
  return Object.freeze({
    schemaVersion: "agent-specialist-handoff-preparation.v1",
    taskId: requiredText(raw.taskId, "taskId"),
    attemptId: requiredText(raw.attemptId, "attemptId"),
    approvedRunId: requiredText(raw.approvedRunId, "approvedRunId"),
    runType: requiredText(raw.runType, "runType"),
    handoffMaterial,
    handoffMaterialHash
  });
}

function parseUnsignedReadback(raw: Record<string, unknown>): UnsignedReadback {
  if (raw.schemaVersion !== "agent-specialist-handoff-preparation-readback.v1") {
    throw new Error("Specialist handoff preparation readback schemaVersion is invalid.");
  }
  return Object.freeze({
    schemaVersion: "agent-specialist-handoff-preparation-readback.v1",
    preparationHash: requiredHash(raw.preparationHash, "preparationHash"),
    workspaceId: requiredText(raw.workspaceId, "workspaceId"),
    mountInstanceId: requiredText(raw.mountInstanceId, "mountInstanceId"),
    materialStoreBindingHash: requiredHash(raw.materialStoreBindingHash, "materialStoreBindingHash"),
    manifestStoreBindingHash: requiredHash(raw.manifestStoreBindingHash, "manifestStoreBindingHash")
  });
}

function exactOwnDataObject(value: unknown, expectedFields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Specialist handoff ${label} must be a plain own-data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`Specialist handoff ${label} must be a plain own-data object.`);
  }
  const actualFields = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedFields].sort();
  if (actualFields.length !== expected.length || actualFields.some((field, index) => field !== expected[index])) {
    throw new Error(`Specialist handoff ${label} must contain exactly its declared fields.`);
  }
  const normalized: Record<string, unknown> = Object.create(null);
  for (const field of expectedFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`Specialist handoff ${label} must be a plain own-data object.`);
    }
    normalized[field] = descriptor.value;
  }
  return Object.freeze(normalized);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Specialist handoff preparation ${field} must be a non-empty string.`);
  }
  return value;
}

function requiredHash(value: unknown, field: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Specialist handoff preparation ${field} must be a SHA-256 hash.`);
  }
  return value as `sha256:${string}`;
}
