import { Buffer } from "node:buffer";
import {
  parsePromptArtifactEnvelope,
  serializePromptArtifactEnvelope,
  type PromptArtifactEnvelope
} from "./prompt-artifacts.js";
import type { VerifiedResolvedContextPack } from "./context-packs.js";
import type { ContextPackRef } from "./context-packs.js";
import type { ProductionRunScope } from "./production-specialist-registration-metadata.js";
import type { AgentSpecialistRunType } from "./specialists.js";

declare const mountedProductionPromptReadbackBrand: unique symbol;

/**
 * Hash-only, process-local proof that a production prompt was read back from
 * the captured portable mount. This intentionally has no public index export.
 */
export interface MountedProductionPromptReadbackWitness {
  readonly [mountedProductionPromptReadbackBrand]: "agent-mounted-production-prompt-readback.v1";
  readonly schemaVersion: "agent-mounted-production-prompt-readback.v1";
  readonly inputArtifactHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
}

export interface RegisterMountedProductionPromptReadbackInput {
  readonly envelope: PromptArtifactEnvelope;
  readonly serializedEnvelope: Uint8Array;
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[] | undefined;
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly contextPackRefs: readonly ContextPackRef[];
  /** A per-runtime identity, never a path-derived mount identity. */
  readonly mountInstanceId: string;
}

export interface ConsumedMountedProductionPromptReadback {
  readonly envelope: PromptArtifactEnvelope;
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
  readonly mountInstanceId: string;
}

export interface MountedProductionPromptReadbackExpectations {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly contextPackRefs: readonly ContextPackRef[];
}

interface MountedProductionPromptReadbackBinding extends ConsumedMountedProductionPromptReadback {
  readonly serializedEnvelope: Uint8Array;
  readonly taskId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly generatedAt: string;
  readonly scope: ProductionRunScope;
  readonly contextPackRefs: readonly ContextPackRef[];
  consumed: boolean;
}

const bindings = new WeakMap<MountedProductionPromptReadbackWitness, MountedProductionPromptReadbackBinding>();

/**
 * Internal registrar used only after mounted-store post-I/O tuple validation.
 * It rejects object envelopes: canonical serialized bytes are parsed again.
 */
export function registerMountedProductionPromptReadback(
  input: RegisterMountedProductionPromptReadbackInput
): MountedProductionPromptReadbackWitness {
  const bytes = Buffer.from(input.serializedEnvelope);
  const parsed = parsePromptArtifactEnvelope(bytes, input.authoritativeResolvedContextPacks === undefined
    ? undefined
    : { authoritativeResolvedContextPacks: input.authoritativeResolvedContextPacks });
  const production = parsed.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
    throw new Error("Mounted production prompt readback requires an exact v1 envelope.");
  }
  if (parsed.manifest.inputArtifactHash !== input.envelope.manifest.inputArtifactHash) {
    throw new Error("Mounted production prompt readback hash does not match the rendered artifact.");
  }
  const canonical = Buffer.from(serializePromptArtifactEnvelope(parsed));
  if (!canonical.equals(bytes)) {
    throw new Error("Mounted production prompt readback bytes are not canonical.");
  }

  const witness = Object.freeze({
    schemaVersion: "agent-mounted-production-prompt-readback.v1" as const,
    inputArtifactHash: parsed.manifest.inputArtifactHash as `sha256:${string}`,
    workspaceId: input.workspaceId,
    mountInstanceId: input.mountInstanceId
  }) as MountedProductionPromptReadbackWitness;
  bindings.set(witness, {
    envelope: parsed,
    serializedEnvelope: new Uint8Array(canonical),
    workspaceId: input.workspaceId,
    rootDir: input.rootDir,
    blobRoot: input.blobRoot,
    taskId: input.taskId,
    runId: input.runId,
    runType: input.runType,
    generatedAt: input.generatedAt,
    scope: input.scope,
    contextPackRefs: Object.freeze([...input.contextPackRefs]),
    mountInstanceId: input.mountInstanceId,
    consumed: false
  });
  return witness;
}

/** Consumes one exact private membership; structural/copy witnesses cannot pass. */
export function consumeMountedProductionPromptReadbackWitness(
  witness: MountedProductionPromptReadbackWitness,
  expected?: MountedProductionPromptReadbackExpectations | undefined
): ConsumedMountedProductionPromptReadback {
  const binding = bindings.get(witness);
  if (binding === undefined) {
    throw new Error("A current mounted production prompt readback witness is required.");
  }
  if (binding.consumed) {
    throw new Error("Mounted production prompt readback witness is already consumed.");
  }
  if (
    witness.schemaVersion !== "agent-mounted-production-prompt-readback.v1" ||
    witness.inputArtifactHash !== binding.envelope.manifest.inputArtifactHash ||
    witness.workspaceId !== binding.workspaceId ||
    witness.mountInstanceId !== binding.mountInstanceId
  ) {
    throw new Error("Mounted production prompt readback witness does not match its private binding.");
  }

  const reparsed = parsePromptArtifactEnvelope(binding.serializedEnvelope, binding.envelope.resolvedContextPacks === undefined
    ? undefined
    : { authoritativeResolvedContextPacks: binding.envelope.resolvedContextPacks });
  if (!Buffer.from(serializePromptArtifactEnvelope(reparsed)).equals(Buffer.from(binding.serializedEnvelope))) {
    throw new Error("Mounted production prompt readback canonical bytes changed before consumption.");
  }
  if (reparsed.manifest.inputArtifactHash !== witness.inputArtifactHash) {
    throw new Error("Mounted production prompt readback hash changed before consumption.");
  }
  if (expected !== undefined && (
    expected.workspaceId !== binding.workspaceId ||
    expected.taskId !== binding.taskId ||
    expected.runId !== binding.runId ||
    expected.runType !== binding.runType ||
    expected.generatedAt !== binding.generatedAt ||
    JSON.stringify(expected.scope) !== JSON.stringify(binding.scope) ||
    JSON.stringify(expected.contextPackRefs) !== JSON.stringify(binding.contextPackRefs)
  )) {
    throw new Error("Mounted production prompt readback does not match the current task, run, context, or checkpoint tuple.");
  }
  binding.consumed = true;
  return Object.freeze({
    envelope: reparsed,
    workspaceId: binding.workspaceId,
    rootDir: binding.rootDir,
    blobRoot: binding.blobRoot,
    mountInstanceId: binding.mountInstanceId
  });
}
