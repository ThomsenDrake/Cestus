import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { IngestionWorkspaceMountResolver, MountedWorkspace, WorkspaceBlobStore } from "../../ingestion/src/mount-contract.js";
import type { createSqlitePrrRuntime } from "./runtime-factory.js";
import { inspectPortableWorkspaceCurrentness } from "./wake-supervisor-runtime.js";

/** Human HTTP import authority is deliberately separate from the resident resolver. */
export function humanIngestionMountResolver(
  handle: ReturnType<typeof createSqlitePrrRuntime>, actor: ActorRef
): IngestionWorkspaceMountResolver | undefined {
  const mounted = handle.mountedWorkspace;
  if (!mounted || actor.kind !== "human") return undefined;
  let unavailable = false;
  function assertCurrent() {
    if (unavailable || !inspectPortableWorkspaceCurrentness(handle).ok) {
      unavailable = true;
      throw new Error("Portable workspace is unavailable; restore storage and restart.");
    }
  }
  function guardedStore(root: string): WorkspaceBlobStore {
    const store = new FileBlobStore(root);
    return {
      get(hash) { assertCurrent(); return store.get(hash); },
      put(bytes) { assertCurrent(); return store.put(bytes); }
    };
  }
  const workspace: MountedWorkspace = {
    workspaceId: mounted.workspaceId, label: mounted.label,
    ledger: {
      append(event, options) { assertCurrent(); return handle.ledger.append(event, options); },
      readAll() { assertCurrent(); return handle.ledger.readAll(); },
      readStream(id) { assertCurrent(); return handle.ledger.readStream(id); }
    },
    blobStore: guardedStore(mounted.paths.blobRoot),
    derivativeStore: guardedStore(mounted.paths.derivativeRoot),
    jobStateRoot: mounted.paths.jobRoot,
    projectionCacheRoot: mounted.paths.projectionRoot,
    capabilities: Object.freeze({ canReadLedger: true, canAppendLedger: true, canWriteBlobs: true, canWriteDerivatives: true, canWriteJobState: true })
  };
  return { async resolve() {
    try { assertCurrent(); return { ok: true, workspace }; }
    catch { return { ok: false, error: { code: "INGESTION_WORKSPACE_NOT_MOUNTED", message: "Portable workspace is unavailable; restore storage and restart.", allowedRepairActions: ["restore the mounted workspace", "restart Cestus"] } }; }
  } };
}
