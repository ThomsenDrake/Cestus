import { open, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parsePromptArtifactEnvelope,
  serializePromptArtifactEnvelope,
  type PromptArtifactEnvelope
} from "../../agent/src/prompt-artifacts.js";
import {
  createMountedProductionPromptReadbackAuthority,
  issueMountedProductionPromptReadback,
  revalidateMountedProductionPromptReadbackWitness,
  type MountedProductionPromptReadbackWitness
} from "../../agent/src/production-prompt-readback.js";
import type { VerifiedResolvedContextPack } from "../../agent/src/context-packs.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface MountedPromptArtifactStore {
  put(envelope: PromptArtifactEnvelope): Promise<{ readonly inputArtifactHash: `sha256:${string}` }>;
  read(input: MountedPromptArtifactReadInput): Promise<MountedPromptArtifactReadResult>;
}

export interface MountedPromptArtifactReadInput {
  readonly inputArtifactHash: `sha256:${string}`;
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[] | undefined;
}

export interface MountedPromptArtifactReadResult {
  readonly envelope: PromptArtifactEnvelope;
  readonly witness?: MountedProductionPromptReadbackWitness | undefined;
  /** Private factory handoff: rechecks the same mounted bytes without consumption. */
  readonly revalidateCurrent?: (() => Promise<void>) | undefined;
}

interface PortableTuple {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly blobRoot: string;
}

/**
 * Opens an asynchronous store bound to one already mounted portable workspace.
 * Each operation remounts and compares the captured identity/root/blob tuple.
 */
export async function createMountedPromptArtifactStore(input: {
  readonly handle: LocalRuntimeHandle;
}): Promise<MountedPromptArtifactStore> {
  const handle = input.handle;
  if (handle === undefined || handle.config.storage.strategy !== "portable-workspace" || handle.mountedWorkspace === undefined) {
    throw new Error("A verified portable mounted runtime is required for the prompt artifact store.");
  }
  const captured = tupleFor(handle.mountedWorkspace);
  if (
    handle.config.storage.workspaceRoot !== captured.rootDir ||
    handle.config.storage.expectedWorkspaceId !== undefined && handle.config.storage.expectedWorkspaceId !== captured.workspaceId
  ) {
    throw new Error("Portable prompt artifact store configuration does not match the mounted workspace.");
  }
  const remount = (): PortableTuple => {
    const mounted = mountPortableWorkspace({ rootDir: captured.rootDir, expectedWorkspaceId: captured.workspaceId });
    if (!mounted.ok) throw new Error("Portable prompt artifact store mount is unavailable.");
    const current = tupleFor(mounted.workspace);
    if (!sameTuple(captured, current)) {
      throw new Error("Portable prompt artifact store mount tuple changed.");
    }
    return current;
  };
  // Establish the initial current tuple before returning an object capable of I/O.
  remount();
  const authority = createMountedProductionPromptReadbackAuthority({ currentMount: remount });
  const mountedAwait = async <T>(operation: () => Promise<T>): Promise<T> => {
    remount();
    try {
      return await operation();
    } finally {
      remount();
    }
  };
  const readCanonical = async (
    inputArtifactHash: `sha256:${string}`,
    authoritativeResolvedContextPacks: readonly VerifiedResolvedContextPack[] | undefined
  ): Promise<{ readonly envelope: PromptArtifactEnvelope; readonly canonical: Uint8Array }> => {
    const before = remount();
    const bytes = await mountedAwait(async () => await readFile(artifactPath(before.blobRoot, inputArtifactHash)));
    const parsed = parsePromptArtifactEnvelope(bytes, authoritativeResolvedContextPacks === undefined
      ? undefined
      : { authoritativeResolvedContextPacks });
    if (parsed.manifest.inputArtifactHash !== inputArtifactHash) {
      throw new Error("Portable prompt artifact readback hash does not match the requested artifact.");
    }
    const canonical = Buffer.from(serializePromptArtifactEnvelope(parsed));
    if (!canonical.equals(Buffer.from(bytes))) {
      throw new Error("Portable prompt artifact readback bytes are not canonical.");
    }
    remount();
    return Object.freeze({ envelope: parsed, canonical });
  };

  return Object.freeze({
    async put(envelope: PromptArtifactEnvelope) {
      const bytes = Buffer.from(serializePromptArtifactEnvelope(envelope));
      const parsed = parsePromptArtifactEnvelope(bytes, envelope.resolvedContextPacks === undefined
        ? undefined
        : { authoritativeResolvedContextPacks: envelope.resolvedContextPacks });
      const inputArtifactHash = parsed.manifest.inputArtifactHash as `sha256:${string}`;
      const before = remount();
      const path = artifactPath(before.blobRoot, inputArtifactHash);
      await mountedAwait(async () => await mkdir(join(before.blobRoot, "agent-prompt-artifacts", "sha256", digestFor(inputArtifactHash).slice(0, 2)), { recursive: true }));
      try {
        const file = await mountedAwait(async () => await open(path, "wx"));
        try {
          await mountedAwait(async () => await file.writeFile(bytes));
        } finally {
          await mountedAwait(async () => await file.close());
        }
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const existing = await mountedAwait(async () => await readFile(path));
        if (!Buffer.from(existing).equals(bytes)) {
          throw new Error("Portable prompt artifact store EEXIST bytes differ from the canonical envelope.");
        }
      }
      remount();
      return Object.freeze({ inputArtifactHash });
    },

    async read(readInput: MountedPromptArtifactReadInput) {
      const { inputArtifactHash, authoritativeResolvedContextPacks } = normalizeReadInput(readInput);
      const readback = await readCanonical(inputArtifactHash, authoritativeResolvedContextPacks);
      const production = readback.envelope.manifest.production;
      if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
        return Object.freeze({ envelope: readback.envelope });
      }
      const witness = await issueMountedProductionPromptReadback({
        serializedEnvelope: readback.canonical,
        ...(authoritativeResolvedContextPacks === undefined ? {} : {
          authoritativeResolvedContextPacks
        }),
        authority,
        rereadCanonicalBytes: async () => (await readCanonical(inputArtifactHash, authoritativeResolvedContextPacks)).canonical
      });
      return Object.freeze({
        envelope: readback.envelope,
        witness,
        revalidateCurrent: async () => await revalidateMountedProductionPromptReadbackWitness(witness)
      });
    }
  });
}

function normalizeReadInput(value: unknown): {
  readonly inputArtifactHash: `sha256:${string}`;
  readonly authoritativeResolvedContextPacks: readonly VerifiedResolvedContextPack[] | undefined;
} {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("Portable prompt artifact read input must be a plain data object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    !keys.every((key) => key === "inputArtifactHash" || key === "authoritativeResolvedContextPacks") ||
    !Object.prototype.hasOwnProperty.call(descriptors, "inputArtifactHash")
  ) {
    throw new Error("Portable prompt artifact read input has unexpected fields.");
  }
  const hash = descriptors.inputArtifactHash;
  if (hash === undefined || !("value" in hash) || typeof hash.value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash.value)) {
    throw new Error("Portable prompt artifact read input requires a canonical inputArtifactHash data field.");
  }
  const packs = descriptors.authoritativeResolvedContextPacks;
  if (packs === undefined) return Object.freeze({ inputArtifactHash: hash.value as `sha256:${string}`, authoritativeResolvedContextPacks: undefined });
  if (!("value" in packs)) throw new Error("Portable prompt artifact read input context packs must be data-only.");
  return Object.freeze({
    inputArtifactHash: hash.value as `sha256:${string}`,
    authoritativeResolvedContextPacks: normalizeContextPackArray(packs.value)
  });
}

function normalizeContextPackArray(value: unknown): readonly VerifiedResolvedContextPack[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("Portable prompt artifact read input context packs must be a plain dense array.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Object.keys(descriptors).length !== expected.size || !Object.keys(descriptors).every((key) => expected.has(key))) {
    throw new Error("Portable prompt artifact read input context packs must be dense without extra properties.");
  }
  const packs: VerifiedResolvedContextPack[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("Portable prompt artifact read input context packs must be data-only.");
    }
    packs.push(descriptor.value as VerifiedResolvedContextPack);
  }
  return Object.freeze(packs);
}

function tupleFor(workspace: MountedPortableWorkspace): PortableTuple {
  return Object.freeze({
    workspaceId: workspace.workspaceId,
    rootDir: workspace.rootDir,
    blobRoot: workspace.paths.blobRoot
  });
}

function sameTuple(left: PortableTuple, right: PortableTuple): boolean {
  return left.workspaceId === right.workspaceId && left.rootDir === right.rootDir && left.blobRoot === right.blobRoot;
}

function digestFor(inputArtifactHash: `sha256:${string}`): string {
  const digest = inputArtifactHash.slice("sha256:".length);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Portable prompt artifact hash must be canonical SHA-256.");
  return digest;
}

function artifactPath(blobRoot: string, inputArtifactHash: `sha256:${string}`): string {
  const digest = digestFor(inputArtifactHash);
  return join(blobRoot, "agent-prompt-artifacts", "sha256", digest.slice(0, 2), `${digest}.json`);
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}
