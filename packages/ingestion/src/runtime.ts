import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import { LocalFilesystemScanner } from "./local-filesystem.js";
import type { MountedWorkspace } from "./mount-contract.js";
import { buildIngestionProjection } from "./projection.js";
import { buildIngestionReviewDto } from "./read-api.js";
import {
  stableIngestionError,
  type IngestionRuntimeResult
} from "./runtime-types.js";
import { IngestionSourceRegistry } from "./source-registry.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type IngestionReview = ReturnType<typeof buildIngestionReviewDto>;

export interface CreateIngestionRuntimeInput {
  readonly mountedWorkspace?: MountedWorkspace | undefined;
  readonly actor: ActorRef;
}

export interface RegisterSourceInput {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly rootUri: string;
  readonly sourceRoot: string;
}

export interface DryRunScanInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
}

export function createIngestionRuntime(input: CreateIngestionRuntimeInput) {
  return {
    async registerSource(command: RegisterSourceInput): Promise<IngestionRuntimeResult<{
      review: IngestionReview;
      eventIds: string[];
    }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const registry = new IngestionSourceRegistry({
        ledger: workspace.workspace.ledger,
        actor: input.actor
      });
      const event = await registry.registerLocalSource({
        sourceCollectionId: command.sourceCollectionId,
        label: command.label,
        rootUri: command.rootUri,
        workspaceUri: `cestus-workspace://${workspace.workspace.workspaceId}`
      });

      return {
        ok: true,
        review: await reviewFor(workspace.workspace, command.sourceCollectionId),
        eventIds: [event.id]
      };
    },

    async dryRunScan(command: DryRunScanInput): Promise<IngestionRuntimeResult<{
      scanBatchId: string;
      inventoryHash: string;
      review: IngestionReview;
      eventIds: string[];
    }>> {
      const workspace = requireMountedWorkspace(input.mountedWorkspace, "write");
      if (!workspace.ok) {
        return workspace;
      }

      const source = await sourceFor(workspace.workspace, command.sourceCollectionId);
      if (source === undefined) {
        return stableIngestionError({
          code: "INGESTION_SOURCE_NOT_REGISTERED",
          message: `Source collection ${command.sourceCollectionId} is not registered.`,
          allowedRepairActions: ["register the source collection", "retry dry-run"]
        });
      }

      const scanner = new LocalFilesystemScanner({
        ledger: workspace.workspace.ledger,
        actor: input.actor
      });
      const rootDir = rootDirFromRegisteredSource(source.rootUri);
      if (!rootDir.ok) {
        return rootDir;
      }

      try {
        const result = await scanner.scan({
          sourceCollectionId: command.sourceCollectionId,
          scanBatchId: command.scanBatchId,
          rootDir: rootDir.rootDir
        });

        return {
          ok: true,
          scanBatchId: result.scanBatchId,
          inventoryHash: result.inventoryHash,
          review: await reviewFor(workspace.workspace, command.sourceCollectionId),
          eventIds: await scanEventIdsFor(
            workspace.workspace,
            command.sourceCollectionId,
            command.scanBatchId
          )
        };
      } catch {
        return runtimeInternalError();
      }
    }
  };
}

async function reviewFor(workspace: MountedWorkspace, sourceCollectionId: string): Promise<IngestionReview> {
  return buildIngestionReviewDto(
    buildIngestionProjection(await workspace.ledger.readAll()),
    sourceCollectionId
  );
}

async function sourceFor(workspace: MountedWorkspace, sourceCollectionId: string) {
  return buildIngestionProjection(await workspace.ledger.readAll()).sources.get(sourceCollectionId);
}

function requireMountedWorkspace(
  workspace: MountedWorkspace | undefined,
  mode: "read" | "write"
): IngestionRuntimeResult<{ workspace: MountedWorkspace }> {
  if (workspace === undefined) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the portable workspace", "retry the ingestion action"]
    });
  }

  if (!workspace.capabilities.canReadLedger) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_WRITABLE",
      message: "Mounted workspace is not readable/writable for ingestion.",
      allowedRepairActions: ["remount the workspace read-write", "retry the ingestion action"]
    });
  }

  if (mode === "write" && (!workspace.capabilities.canAppendLedger || !workspace.capabilities.canWriteJobState)) {
    return stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_WRITABLE",
      message: "Mounted workspace is not readable/writable for ingestion.",
      allowedRepairActions: ["remount the workspace read-write", "retry the ingestion action"]
    });
  }

  return { ok: true, workspace };
}

function rootDirFromRegisteredSource(rootUri: string): IngestionRuntimeResult<{ rootDir: string }> {
  try {
    return { ok: true, rootDir: fileURLToPath(rootUri) };
  } catch {
    return runtimeInternalError();
  }
}

async function scanEventIdsFor(
  workspace: MountedWorkspace,
  sourceCollectionId: string,
  scanBatchId: string
): Promise<string[]> {
  return (await workspace.ledger.readStream(`ingestion_scan_${scanBatchId}`))
    .filter((event) => {
      if (
        event.type !== "ingestion.scan.started"
        && event.type !== "ingestion.occurrence.observed"
        && event.type !== "ingestion.scan.completed"
      ) {
        return false;
      }

      return event.payload.sourceCollectionId === sourceCollectionId
        && event.payload.scanBatchId === scanBatchId;
    })
    .map((event) => event.id);
}

function runtimeInternalError(): IngestionRuntimeResult<never> {
  return stableIngestionError({
    code: "INGESTION_RUNTIME_INTERNAL",
    message: "Ingestion runtime could not complete the requested dry-run.",
    allowedRepairActions: ["verify the registered source", "retry dry-run", "inspect runtime diagnostics"]
  });
}
