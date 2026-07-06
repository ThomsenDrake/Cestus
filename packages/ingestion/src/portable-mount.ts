import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { mountPortableWorkspace } from "../../workspace/src/index.js";
import {
  mountedWorkspaceCapabilities,
  type IngestionWorkspaceMountResolver,
  type MountedWorkspace
} from "./mount-contract.js";

export interface ClosableMountedWorkspace {
  close?(): void;
}

export function createPortableIngestionMountResolver(): IngestionWorkspaceMountResolver {
  return {
    async resolve(request) {
      const workspaceRoot = request.workspaceRoot ?? request.env?.CESTUS_WORKSPACE_ROOT ?? "";
      const mounted = mountPortableWorkspace({ rootDir: workspaceRoot });
      if (!mounted.ok) {
        return {
          ok: false,
          error: {
            code:
              mounted.diagnostic.code === "workspace-ledger-unavailable"
                ? "INGESTION_WORKSPACE_NOT_WRITABLE"
                : "INGESTION_WORKSPACE_NOT_MOUNTED",
            message: mounted.diagnostic.message,
            allowedRepairActions: [...mounted.diagnostic.allowedRepairActions]
          }
        };
      }

      let ledger: SQLiteEventLedger;
      try {
        ledger = new SQLiteEventLedger(mounted.workspace.paths.ledgerPath);
      } catch {
        return ledgerUnavailableError();
      }

      const workspace: MountedWorkspace & { close(): void } = {
        workspaceId: mounted.workspace.workspaceId,
        label: mounted.workspace.label,
        ledger,
        blobStore: new FileBlobStore(mounted.workspace.paths.blobRoot),
        derivativeStore: new FileBlobStore(mounted.workspace.paths.derivativeRoot),
        jobStateRoot: mounted.workspace.paths.jobRoot,
        diagnosticsRoot: mounted.workspace.paths.cacheRoot,
        projectionCacheRoot: mounted.workspace.paths.projectionRoot,
        capabilities: mountedWorkspaceCapabilities({
          canReadLedger: true,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        }),
        close() {
          ledger.close();
        }
      };

      return {
        ok: true,
        workspace
      };
    }
  };
}

function ledgerUnavailableError() {
  return {
    ok: false,
    error: {
      code: "INGESTION_WORKSPACE_NOT_WRITABLE",
      message: "Portable workspace ledger path is unavailable.",
      allowedRepairActions: [
        "restore ledger/ontology.sqlite as a SQLite database file",
        "choose a valid portable workspace root"
      ]
    }
  } as const;
}
