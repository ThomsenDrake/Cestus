import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_runtime_test", kind: "human" as const, label: "Runtime Test" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime core workflows", () => {
  it("reports unmounted workspaces without appending events", async () => {
    const runtime = createIngestionRuntime({ mountedWorkspace: undefined, actor });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_WORKSPACE_NOT_MOUNTED" }
    });
  });

  it("registers a source, runs a dry-run scan, and returns a review DTO from ledger projection", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });

    const registered = await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    const scanned = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(registered.ok).toBe(true);
    expect(scanned).toMatchObject({
      ok: true,
      scanBatchId: "scan_001",
      review: {
        sourceCollectionId: "src_drive_001",
        latestScanBatchId: "scan_001",
        totals: { observedFiles: 1, uniqueContent: 1 }
      }
    });
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered",
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ]);
  });

  it("requires source registration before dry-run scans", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_missing",
      scanBatchId: "scan_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_NOT_REGISTERED" }
    });
    expect(await workspace.ledger.readAll()).toEqual([]);
  });
});
