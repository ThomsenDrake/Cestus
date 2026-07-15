import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  parsePromptArtifactEnvelope,
  serializePromptArtifactEnvelope,
  type PromptArtifactEnvelope
} from "./prompt-artifacts.js";
import type { VerifiedResolvedContextPack } from "./context-packs.js";
import type { ContextPackRef } from "./context-packs.js";
import type { AgentSpecialistRunType } from "./specialists.js";

declare const mountedProductionPromptReadbackBrand: unique symbol;

/**
 * Hash-only, process-local proof that a production prompt was read back from
 * the current portable mount. This intentionally has no public index export.
 */
export interface MountedProductionPromptReadbackWitness {
  readonly [mountedProductionPromptReadbackBrand]: "agent-mounted-production-prompt-readback.v1";
  readonly schemaVersion: "agent-mounted-production-prompt-readback.v1";
  readonly inputArtifactHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
}

interface MountedProductionPromptReadbackMount {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
}

declare const mountedProductionPromptReadbackAuthorityBrand: unique symbol;

/**
 * Private, non-indexed authority created only by the mounted store. Its mount
 * instance is generated here, never supplied by a caller.
 */
export interface MountedProductionPromptReadbackAuthority {
  readonly [mountedProductionPromptReadbackAuthorityBrand]: "agent-mounted-production-prompt-readback-authority.v1";
}

export interface IssueMountedProductionPromptReadbackInput {
  readonly serializedEnvelope: Uint8Array;
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[] | undefined;
  readonly authority: MountedProductionPromptReadbackAuthority;
  /** Rereads canonical bytes through the current mounted store. */
  readonly rereadCanonicalBytes: () => Promise<Uint8Array>;
}

export interface ConsumedMountedProductionPromptReadback {
  readonly envelope: PromptArtifactEnvelope;
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  /** Rechecks current mount/process identity and exact mounted bytes. */
  readonly revalidateCurrent: () => Promise<void>;
}

export interface MountedProductionPromptReadbackExpectations {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
}

interface DerivedArtifactTuple {
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
}

interface MountedProductionPromptReadbackBinding {
  readonly envelope: PromptArtifactEnvelope;
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scopeApplicabilityHash: `sha256:${string}`;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly serializedEnvelope: Uint8Array;
  readonly tuple: DerivedArtifactTuple;
  readonly authority: MountedProductionPromptReadbackAuthority;
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[] | undefined;
  readonly rereadCanonicalBytes: () => Promise<Uint8Array>;
  readonly revalidateCurrent: () => Promise<void>;
  consumed: boolean;
}

interface MountedAuthorityBinding extends MountedProductionPromptReadbackMount {
  readonly mountInstanceId: string;
  readonly currentMount: () => MountedProductionPromptReadbackMount;
}

const bindings = new WeakMap<object, MountedProductionPromptReadbackBinding>();
const authorityBindings = new WeakMap<MountedProductionPromptReadbackAuthority, MountedAuthorityBinding>();
const currentAuthorities = new Map<string, MountedProductionPromptReadbackAuthority>();

/**
 * Creates a private issuer tied to one current mounted tuple. Creating a new
 * authority for the same tuple invalidates all witnesses from the prior mount.
 */
export function createMountedProductionPromptReadbackAuthority(input: {
  readonly currentMount: () => MountedProductionPromptReadbackMount;
}): MountedProductionPromptReadbackAuthority {
  const captured = normalizeMount(input.currentMount());
  const authority = Object.freeze({}) as MountedProductionPromptReadbackAuthority;
  const binding = Object.freeze({
    ...captured,
    mountInstanceId: `mounted-prompt-readback-process-${randomUUID()}`,
    currentMount: input.currentMount
  });
  authorityBindings.set(authority, binding);
  currentAuthorities.set(mountKey(captured), authority);
  return authority;
}

/**
 * Internal issuer used only by the mounted store. It receives canonical bytes
 * and an opaque mounted authority, never caller-supplied task/run/scope/root
 * or process facts.
 */
export async function issueMountedProductionPromptReadback(
  input: IssueMountedProductionPromptReadbackInput
): Promise<MountedProductionPromptReadbackWitness> {
  const bytes = Buffer.from(input.serializedEnvelope);
  const parsed = parseCanonicalProductionEnvelope(bytes, input.authoritativeResolvedContextPacks);
  const tuple = deriveArtifactTuple(parsed);
  const mount = assertCurrentAuthority(input.authority);
  const reread = await assertExactCurrentBytes(input.authority, input.rereadCanonicalBytes, bytes);
  const rereadParsed = parseCanonicalProductionEnvelope(reread, input.authoritativeResolvedContextPacks);
  if (!sameArtifactTuple(tuple, deriveArtifactTuple(rereadParsed))) {
    throw new Error("Mounted production prompt readback artifact tuple changed before issuance.");
  }

  const witness = Object.freeze({
    schemaVersion: "agent-mounted-production-prompt-readback.v1" as const,
    inputArtifactHash: parsed.manifest.inputArtifactHash as `sha256:${string}`,
    workspaceId: mount.workspaceId,
    mountInstanceId: mount.mountInstanceId
  }) as MountedProductionPromptReadbackWitness;
  const revalidateCurrent = async () => {
    await assertExactCurrentBytes(input.authority, input.rereadCanonicalBytes, bytes);
  };
  bindings.set(witness, {
    envelope: parsed,
    serializedEnvelope: new Uint8Array(bytes),
    workspaceId: mount.workspaceId,
    rootDir: mount.rootDir,
    blobRoot: mount.blobRoot,
    mountInstanceId: mount.mountInstanceId,
    taskId: tuple.taskId,
    runId: tuple.runId,
    runType: tuple.runType,
    generatedAt: tuple.generatedAt,
    scopeApplicabilityHash: tuple.scopeApplicabilityHash,
    contextPackRefs: tuple.contextPackRefs,
    tuple,
    authority: input.authority,
    ...(input.authoritativeResolvedContextPacks === undefined ? {} : {
      authoritativeResolvedContextPacks: input.authoritativeResolvedContextPacks
    }),
    rereadCanonicalBytes: input.rereadCanonicalBytes,
    revalidateCurrent,
    consumed: false
  });
  return witness;
}

/** Consumes one exact private membership; structural/copy witnesses cannot pass. */
export async function consumeMountedProductionPromptReadbackWitness(
  witness: unknown,
  expected?: MountedProductionPromptReadbackExpectations
): Promise<ConsumedMountedProductionPromptReadback> {
  if (typeof witness !== "object" || witness === null) {
    throw new Error("A current mounted production prompt readback witness is required.");
  }
  const binding = bindings.get(witness);
  if (binding === undefined) {
    throw new Error("A current mounted production prompt readback witness is required.");
  }
  if (binding.consumed) {
    throw new Error("Mounted production prompt readback witness is already consumed.");
  }
  await binding.revalidateCurrent();
  if (expected === undefined) {
    throw new Error("Mounted production prompt readback expectations are required.");
  }
  if (
    expected.workspaceId !== binding.workspaceId ||
    expected.taskId !== binding.taskId ||
    expected.runId !== binding.runId ||
    expected.runType !== binding.runType ||
    expected.scopeApplicabilityHash !== binding.scopeApplicabilityHash ||
    !sameCanonicalJson(expected.contextPackRefs, binding.contextPackRefs)
  ) {
    throw new Error("Mounted production prompt readback does not match the current task, run, scope, context, or checkpoint tuple.");
  }
  binding.consumed = true;
  return Object.freeze({
    envelope: binding.envelope,
    workspaceId: binding.workspaceId,
    rootDir: binding.rootDir,
    blobRoot: binding.blobRoot,
    mountInstanceId: binding.mountInstanceId,
    taskId: binding.taskId,
    runId: binding.runId,
    runType: binding.runType,
    generatedAt: binding.generatedAt,
    scopeApplicabilityHash: binding.scopeApplicabilityHash,
    contextPackRefs: binding.contextPackRefs,
    revalidateCurrent: binding.revalidateCurrent
  });
}

function parseCanonicalProductionEnvelope(
  bytes: Uint8Array,
  authoritativeResolvedContextPacks: readonly VerifiedResolvedContextPack[] | undefined
): PromptArtifactEnvelope {
  const parsed = parsePromptArtifactEnvelope(bytes, authoritativeResolvedContextPacks === undefined
    ? undefined
    : { authoritativeResolvedContextPacks });
  const production = parsed.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
    throw new Error("Mounted production prompt readback requires an exact v1 envelope.");
  }
  const canonical = Buffer.from(serializePromptArtifactEnvelope(parsed));
  if (!canonical.equals(Buffer.from(bytes))) {
    throw new Error("Mounted production prompt readback bytes are not canonical.");
  }
  return parsed;
}

function deriveArtifactTuple(envelope: PromptArtifactEnvelope): DerivedArtifactTuple {
  const production = envelope.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
    throw new Error("Mounted production prompt readback requires an exact v1 envelope.");
  }
  const run = parseCanonicalRunLine(envelope.text);
  if (run.runType === "ontology-bootstrap" || run.runType !== envelope.manifest.runType) {
    throw new Error("Mounted production prompt readback run type is not authoritative.");
  }
  return Object.freeze({
    taskId: run.taskId,
    runId: run.runId,
    runType: run.runType,
    generatedAt: envelope.manifest.generatedAt,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    contextPackRefs: Object.freeze([...envelope.manifest.contextPackRefs])
  });
}

function parseCanonicalRunLine(text: string): {
  readonly taskId: string;
  readonly runId: string;
  readonly runType: AgentSpecialistRunType;
} {
  const lines = text.split("\n").filter((line) => line.startsWith("Run: "));
  if (lines.length !== 1) throw new Error("Mounted production prompt readback is missing one canonical run line.");
  const encoded = lines[0]!.slice("Run: ".length);
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new Error("Mounted production prompt readback run line is not canonical JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Mounted production prompt readback run line is not a plain object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.keys(descriptors).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(descriptors, "taskId") ||
    !Object.prototype.hasOwnProperty.call(descriptors, "runId") ||
    !Object.prototype.hasOwnProperty.call(descriptors, "runType")
  ) {
    throw new Error("Mounted production prompt readback run line has unexpected fields.");
  }
  const taskId = descriptors.taskId;
  const runId = descriptors.runId;
  const runType = descriptors.runType;
  if (
    taskId === undefined || runId === undefined || runType === undefined ||
    !("value" in taskId) || !("value" in runId) || !("value" in runType) ||
    typeof taskId.value !== "string" || taskId.value.length === 0 ||
    typeof runId.value !== "string" || runId.value.length === 0 ||
    typeof runType.value !== "string" || runType.value.length === 0
  ) {
    throw new Error("Mounted production prompt readback run line fields are invalid.");
  }
  return Object.freeze({ taskId: taskId.value, runId: runId.value, runType: runType.value as AgentSpecialistRunType });
}

async function assertExactCurrentBytes(
  authority: MountedProductionPromptReadbackAuthority,
  rereadCanonicalBytes: () => Promise<Uint8Array>,
  expected: Uint8Array
): Promise<Uint8Array> {
  assertCurrentAuthority(authority);
  const reread = new Uint8Array(await rereadCanonicalBytes());
  assertCurrentAuthority(authority);
  if (!Buffer.from(reread).equals(Buffer.from(expected))) {
    throw new Error("Mounted production prompt readback bytes changed on the current mount.");
  }
  return reread;
}

function assertCurrentAuthority(authority: MountedProductionPromptReadbackAuthority): MountedAuthorityBinding {
  const binding = authorityBindings.get(authority);
  if (binding === undefined) throw new Error("A current mounted production prompt readback authority is required.");
  const current = normalizeMount(binding.currentMount());
  if (!sameMount(binding, current) || currentAuthorities.get(mountKey(binding)) !== authority) {
    throw new Error("Mounted production prompt readback mount or process identity changed.");
  }
  return binding;
}

function normalizeMount(value: MountedProductionPromptReadbackMount): MountedProductionPromptReadbackMount {
  if (
    typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("Mounted production prompt readback requires a plain mounted tuple.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = ["workspaceId", "rootDir", "blobRoot"] as const;
  if (Object.keys(descriptors).length !== fields.length || !fields.every((field) => field in descriptors)) {
    throw new Error("Mounted production prompt readback requires an exact mounted tuple.");
  }
  const result: Record<string, string> = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string" || descriptor.value.length === 0) {
      throw new Error("Mounted production prompt readback requires data-only mounted tuple fields.");
    }
    result[field] = descriptor.value;
  }
  return Object.freeze({ workspaceId: result.workspaceId!, rootDir: result.rootDir!, blobRoot: result.blobRoot! });
}

function sameMount(left: MountedProductionPromptReadbackMount, right: MountedProductionPromptReadbackMount): boolean {
  return left.workspaceId === right.workspaceId && left.rootDir === right.rootDir && left.blobRoot === right.blobRoot;
}

function mountKey(value: MountedProductionPromptReadbackMount): string {
  return JSON.stringify([value.workspaceId, value.rootDir, value.blobRoot]);
}

function sameArtifactTuple(left: DerivedArtifactTuple, right: DerivedArtifactTuple): boolean {
  return left.taskId === right.taskId &&
    left.runId === right.runId &&
    left.runType === right.runType &&
    left.generatedAt === right.generatedAt &&
    left.scopeApplicabilityHash === right.scopeApplicabilityHash &&
    sameCanonicalJson(left.contextPackRefs, right.contextPackRefs);
}

function sameCanonicalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
