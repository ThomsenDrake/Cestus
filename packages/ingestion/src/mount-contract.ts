import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

export interface MountedWorkspaceCapabilities {
  readonly canReadLedger: boolean;
  readonly canAppendLedger: boolean;
  readonly canWriteBlobs: boolean;
  readonly canWriteDerivatives: boolean;
  readonly canWriteJobState: boolean;
}

export interface MountedWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly ledger: EventLedger;
  readonly blobStore: FileBlobStore;
  readonly derivativeStore: FileBlobStore;
  readonly jobStateRoot: string;
  readonly diagnosticsRoot?: string;
  readonly projectionCacheRoot?: string;
  readonly capabilities: MountedWorkspaceCapabilities;
}

export interface IngestionMountRequest {
  readonly workspaceRoot?: string;
  readonly env?: Record<string, string | undefined>;
}

export type IngestionMountResult =
  | { readonly ok: true; readonly workspace: MountedWorkspace }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "INGESTION_WORKSPACE_NOT_MOUNTED" | "INGESTION_WORKSPACE_NOT_WRITABLE";
        readonly message: string;
        readonly allowedRepairActions: readonly string[];
      };
    };

export interface IngestionWorkspaceMountResolver {
  resolve(request: IngestionMountRequest): Promise<IngestionMountResult>;
}

export function mountedWorkspaceCapabilities(
  capabilities: MountedWorkspaceCapabilities
): MountedWorkspaceCapabilities {
  return Object.freeze({ ...capabilities });
}
