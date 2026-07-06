import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { createIngestionRuntime } from "../src/runtime.js";
import { createFakeMountedWorkspace } from "./runtime-test-helpers.js";

const actor = { id: "actor_import_safety", kind: "human" as const, label: "Import Safety" };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("IngestionRuntime stale-source import verification", () => {
  it("raw import approval records approval only and writes no blobs", async () => {
    const { workspace, runtime } = await preparedRuntime({ "a.txt": "alpha" });

    const approved = await runtime.approveRawImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });

    expect(approved).toMatchObject({ ok: true, review: { latestImportBatchId: "imp_001" } });
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered",
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed",
      "ingestion.import.approved"
    ]);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects changed regular files before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "a.txt"), "changed");

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects missing regular files before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    rmSync(join(sourceRoot, "a.txt"));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });

  it("rejects changed archive container hashes before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntimeWithArchive({ "folder/a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "bundle.zip"), Buffer.from(zipSync({
      "folder/a.txt": strToU8("alpha"),
      "extra.txt": strToU8("extra")
    })));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });

  it("rejects changed archive child hashes before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntimeWithArchive({ "folder/a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "bundle.zip"), Buffer.from(zipSync({ "folder/a.txt": strToU8("changed") })));

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH" }
    });
    expect((await workspace.ledger.readAll()).some((event) => event.type === "evidence.ingested")).toBe(false);
  });
});

async function preparedRuntime(files: Record<string, string | Buffer>) {
  const workspace = createFakeMountedWorkspace();
  roots.push(workspace.rootDir);
  const sourceRoot = join(workspace.rootDir, "source");
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(join(workspace.rootDir, "blobs"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(sourceRoot, path), content);
  }
  const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
  await runtime.registerSource({
    sourceCollectionId: "src_drive_001",
    label: "Old archive",
    rootUri: `file://${sourceRoot}`,
    sourceRoot
  });
  await runtime.dryRunScan({ sourceCollectionId: "src_drive_001", scanBatchId: "scan_001" });
  return { workspace, runtime, sourceRoot };
}

async function preparedRuntimeWithArchive(entries: Record<string, string>) {
  const zipped = Object.fromEntries(Object.entries(entries).map(([path, content]) => [path, strToU8(content)]));
  return preparedRuntime({ "bundle.zip": Buffer.from(zipSync(zipped)) });
}

async function approve(runtime: ReturnType<typeof createIngestionRuntime>) {
  await runtime.approveRawImport({
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    importBatchId: "imp_001",
    approvedBy: "actor_investigator"
  });
}
