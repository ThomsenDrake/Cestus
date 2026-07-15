import { open, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  parsePromptArtifactEnvelope,
  serializePromptArtifactEnvelope,
  type PromptArtifactEnvelope
} from "../../agent/src/prompt-artifacts.js";
import {
  registerMountedProductionPromptReadback,
  type MountedProductionPromptReadbackWitness
} from "../../agent/src/production-prompt-readback.js";
import type { VerifiedResolvedContextPack } from "../../agent/src/context-packs.js";
import type { ProductionRunScope } from "../../agent/src/production-specialist-registration-metadata.js";
import type { TaskOrchestratorRunType } from "../../agent/src/task-orchestrator-types.js";
import { mountPortableWorkspace, type MountedPortableWorkspace } from "../../workspace/src/index.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface MountedPromptArtifactStore {
  put(envelope: PromptArtifactEnvelope): Promise<{ readonly inputArtifactHash: `sha256:${string}` }>;
  read(input: MountedPromptArtifactReadInput): Promise<MountedPromptArtifactReadResult>;
}

export interface MountedPromptArtifactReadInput {
  readonly inputArtifactHash: `sha256:${string}`;
  readonly authoritativeResolvedContextPacks?: readonly VerifiedResolvedContextPack[] | undefined;
  readonly taskId?: string | undefined;
  readonly attemptId?: string | undefined;
  readonly runType?: TaskOrchestratorRunType | undefined;
  readonly generatedAt?: string | undefined;
  readonly scope?: ProductionRunScope | undefined;
}

export interface MountedPromptArtifactReadResult {
  readonly envelope: PromptArtifactEnvelope;
  readonly witness?: MountedProductionPromptReadbackWitness | undefined;
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
  const mountInstanceId = `mounted-prompt-readback-process-${randomUUID()}`;
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

  return Object.freeze({
    async put(envelope: PromptArtifactEnvelope) {
      const bytes = Buffer.from(serializePromptArtifactEnvelope(envelope));
      const parsed = parsePromptArtifactEnvelope(bytes, envelope.resolvedContextPacks === undefined
        ? undefined
        : { authoritativeResolvedContextPacks: envelope.resolvedContextPacks });
      const inputArtifactHash = parsed.manifest.inputArtifactHash as `sha256:${string}`;
      const before = remount();
      const path = artifactPath(before.blobRoot, inputArtifactHash);
      await mkdir(join(before.blobRoot, "agent-prompt-artifacts", "sha256", digestFor(inputArtifactHash).slice(0, 2)), { recursive: true });
      try {
        const file = await open(path, "wx");
        try {
          await file.writeFile(bytes);
        } finally {
          await file.close();
        }
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const existing = await readFile(path);
        if (!Buffer.from(existing).equals(bytes)) {
          throw new Error("Portable prompt artifact store EEXIST bytes differ from the canonical envelope.");
        }
      }
      remount();
      return Object.freeze({ inputArtifactHash });
    },

    async read(readInput: MountedPromptArtifactReadInput) {
      const before = remount();
      const bytes = await readFile(artifactPath(before.blobRoot, readInput.inputArtifactHash));
      const parsed = parsePromptArtifactEnvelope(bytes, readInput.authoritativeResolvedContextPacks === undefined
        ? undefined
        : { authoritativeResolvedContextPacks: readInput.authoritativeResolvedContextPacks });
      if (parsed.manifest.inputArtifactHash !== readInput.inputArtifactHash) {
        throw new Error("Portable prompt artifact readback hash does not match the requested artifact.");
      }
      const canonical = Buffer.from(serializePromptArtifactEnvelope(parsed));
      if (!canonical.equals(Buffer.from(bytes))) {
        throw new Error("Portable prompt artifact readback bytes are not canonical.");
      }
      const after = remount();
      const production = parsed.manifest.production;
      if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
        return Object.freeze({ envelope: parsed });
      }
      if (
        readInput.taskId === undefined || readInput.attemptId === undefined || readInput.runType === undefined ||
        readInput.generatedAt === undefined || readInput.scope === undefined
      ) {
        throw new Error("Mounted production prompt readback requires the captured Task133.5 render tuple.");
      }
      if (readInput.runType === "ontology-bootstrap") {
        throw new Error("Mounted production prompt readback does not support ontology-bootstrap.");
      }
      const witness = registerMountedProductionPromptReadback({
        envelope: parsed,
        serializedEnvelope: canonical,
        ...(readInput.authoritativeResolvedContextPacks === undefined ? {} : {
          authoritativeResolvedContextPacks: readInput.authoritativeResolvedContextPacks
        }),
        workspaceId: after.workspaceId,
        rootDir: after.rootDir,
        blobRoot: after.blobRoot,
        taskId: readInput.taskId,
        runId: readInput.attemptId,
        runType: readInput.runType,
        generatedAt: readInput.generatedAt,
        scope: readInput.scope,
        contextPackRefs: parsed.manifest.contextPackRefs,
        mountInstanceId
      });
      return Object.freeze({ envelope: parsed, witness });
    }
  });
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
