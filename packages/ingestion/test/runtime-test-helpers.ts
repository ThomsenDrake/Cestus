import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { mountedWorkspaceCapabilities, type MountedWorkspace } from "../src/mount-contract.js";

export function createFakeMountedWorkspace(label = "Runtime test workspace"): MountedWorkspace & {
  ledger: InMemoryEventLedger;
  blobStore: FileBlobStore;
  derivativeStore: FileBlobStore;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "cestus-ingestion-runtime-"));
  return {
    workspaceId: "ws_runtime_001",
    label,
    rootDir,
    ledger: new InMemoryEventLedger(),
    blobStore: new FileBlobStore(join(rootDir, "blobs")),
    derivativeStore: new FileBlobStore(join(rootDir, "derivatives")),
    jobStateRoot: join(rootDir, "jobs"),
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    })
  };
}
