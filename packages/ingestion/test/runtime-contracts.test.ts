import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  ingestionErrorCodes,
  mountedWorkspaceCapabilities,
  stableIngestionError,
  type IngestionRuntimeDiagnosticDto,
  type IngestionRuntimeResult,
  type MountedWorkspace,
  type WorkspaceBlobStore
} from "../src/index.js";

describe("ingestion runtime contracts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports the stable error codes required by runtime, CLI, HTTP, and UI adapters", () => {
    expect(ingestionErrorCodes).toEqual([
      "INGESTION_WORKSPACE_NOT_MOUNTED",
      "INGESTION_WORKSPACE_NOT_WRITABLE",
      "INGESTION_SOURCE_NOT_REGISTERED",
      "INGESTION_SCAN_REQUIRED",
      "INGESTION_IMPORT_APPROVAL_REQUIRED",
      "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
      "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH",
      "INGESTION_PROVIDER_APPROVAL_REQUIRED",
      "INGESTION_PROVIDER_SEND_NOT_PERMITTED",
      "INGESTION_JOB_NOT_RETRYABLE",
      "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
      "INGESTION_COMMAND_UNSUPPORTED",
      "INGESTION_RUNTIME_INTERNAL"
    ]);
  });

  it("creates secret-safe stable error envelopes", () => {
    const diagnostic = {
      diagnosticId: "diag_runtime_001",
      severity: "warning",
      category: "mount",
      message: "Workspace mount needs attention.",
      secret: "provider-token",
      debugPath: "/private/workspace/token-cache"
    } as unknown as IngestionRuntimeDiagnosticDto;
    const result: IngestionRuntimeResult<never> = stableIngestionError({
      code: "INGESTION_WORKSPACE_NOT_MOUNTED",
      message: "Portable workspace is not mounted.",
      allowedRepairActions: ["mount the portable workspace", "retry the command"],
      diagnostics: [diagnostic]
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace is not mounted.",
        allowedRepairActions: ["mount the portable workspace", "retry the command"],
        diagnostics: [{
          diagnosticId: "diag_runtime_001",
          severity: "warning",
          category: "mount",
          message: "Workspace mount needs attention."
        }]
      }
    });
    expect(result.error.diagnostics[0]).not.toBe(diagnostic);
    expect(JSON.stringify(result)).not.toMatch(/secret|token|debugPath|private/i);
  });

  it("keeps mounted workspace capabilities explicit and storage-agnostic", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cestus-mounted-workspace-"));
    tempDirs.push(rootDir);
    const fakeDerivativeStore = {
      async put(content: Buffer) {
        return {
          contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
          sizeBytes: content.byteLength,
          path: "memory://derivatives/alpha"
        };
      },
      async get(_contentHash: `sha256:${string}`) {
        return Buffer.from("alpha");
      }
    } satisfies WorkspaceBlobStore;
    const workspace = {
      workspaceId: "ws_runtime_001",
      label: "Mounted runtime workspace",
      ledger: new InMemoryEventLedger(),
      blobStore: new FileBlobStore(join(rootDir, "blobs")),
      derivativeStore: fakeDerivativeStore,
      jobStateRoot: join(rootDir, "jobs"),
      diagnosticsRoot: join(rootDir, "diagnostics"),
      projectionCacheRoot: join(rootDir, "projection-cache"),
      capabilities: mountedWorkspaceCapabilities(({
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true,
        secretToken: "mount-secret"
      }) as unknown as Parameters<typeof mountedWorkspaceCapabilities>[0])
    } satisfies MountedWorkspace;

    expect(workspace.capabilities.canWriteBlobs).toBe(true);
    expect(workspace.capabilities).toEqual({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    });
    expect(workspace.diagnosticsRoot).toBe(join(rootDir, "diagnostics"));
    expect(workspace.projectionCacheRoot).toBe(join(rootDir, "projection-cache"));
    await expect(workspace.derivativeStore.get("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .resolves.toEqual(Buffer.from("alpha"));
    expect(JSON.stringify(workspace)).not.toMatch(/token|secret|password/i);
  });

  it("keeps the public mounted workspace contract independent of FileBlobStore", () => {
    const source = readFileSync(new URL("../src/mount-contract.ts", import.meta.url), "utf8");

    expect(source).not.toContain("FileBlobStore");
  });
});
