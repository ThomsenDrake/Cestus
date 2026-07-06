import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { createPortableIngestionMountResolver } from "../src/portable-mount.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("portable ingestion mount resolver", () => {
  it("mounts a portable workspace as an ingestion MountedWorkspace", async () => {
    const rootDir = tempDir("portable-ingestion-");
    createPortableWorkspace({
      rootDir,
      workspaceId: "ws_legacy_cli",
      label: "Legacy CLI workspace",
      createdBy: "test"
    });

    const resolver = createPortableIngestionMountResolver();
    const result = await resolver.resolve({ workspaceRoot: rootDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace).toMatchObject({
      workspaceId: "ws_legacy_cli",
      label: "Legacy CLI workspace",
      jobStateRoot: join(rootDir, "jobs"),
      capabilities: {
        canReadLedger: true,
        canAppendLedger: true,
        canWriteBlobs: true,
        canWriteDerivatives: true,
        canWriteJobState: true
      }
    });
    expect(JSON.stringify(result.workspace)).not.toMatch(/token|secret|password/i);
    await result.workspace.ledger.readAll();
    (result.workspace as typeof result.workspace & { close?: () => void }).close?.();
  });

  it("returns stable mount errors without constructing storage", async () => {
    const resolver = createPortableIngestionMountResolver();
    const result = await resolver.resolve({ workspaceRoot: "" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INGESTION_WORKSPACE_NOT_MOUNTED",
        message: "Portable workspace root is required.",
        allowedRepairActions: ["set CESTUS_WORKSPACE_ROOT", "pass --workspace <root>"]
      }
    });
  });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
