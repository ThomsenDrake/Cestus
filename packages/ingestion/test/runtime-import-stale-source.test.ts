import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { stableLocalFilesystemOccurrenceId } from "../src/local-filesystem.js";
import { buildIngestionProjection } from "../src/projection.js";
import { buildIngestionReviewDto } from "../src/read-api.js";
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
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("keeps stale diagnostics off the import stream so restored-byte retries can complete", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "a.txt"), "changed");

    const stale = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    expectStableSourceDiagnostic(await workspace.ledger.readAll(), stale);

    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const retry = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(retry).toMatchObject({
      ok: true,
      importBatchId: "imp_001",
      totals: { evidenceCreated: 1, occurrencesLinked: 1 }
    });
    expect(JSON.stringify(retry)).not.toContain("INGESTION_RUNTIME_INTERNAL");
    const events = await workspace.ledger.readAll();
    expect(events.some((event) => event.type === "evidence.ingested")).toBe(true);
    expect(events.some((event) => event.type === "ingestion.evidence.linked")).toBe(true);
    expect(events.some((event) => event.type === "ingestion.import.completed")).toBe(true);
    expect((await workspace.ledger.readStream("ingestion_import_src_drive_001_scan_001_imp_001")).map((event) => event.type)).toEqual([
      "ingestion.import.approved",
      "ingestion.import.completed"
    ]);
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
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects added regular files before blob writes", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    writeFileSync(join(sourceRoot, "new.txt"), "new content");

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects post-approval forged occurrences that try to widen the approved inventory", async () => {
    const { workspace, runtime, sourceRoot } = await preparedRuntime({ "a.txt": "alpha" });
    await approve(runtime);
    const content = Buffer.from("new content");
    const contentHash = sha256(content);
    writeFileSync(join(sourceRoot, "new.txt"), content);

    await workspace.ledger.append({
      type: "ingestion.occurrence.observed",
      version: 1,
      streamId: "ingestion_scan_scan_001",
      context: {
        actor,
        occurredAt: "2026-07-06T15:00:00.000Z",
        correlationId: "corr_scan_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        occurrenceId: stableLocalFilesystemOccurrenceId({
          kind: "file",
          sourceCollectionId: "src_drive_001",
          scanBatchId: "scan_001",
          sourcePath: "new.txt",
          contentHash
        }),
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        contentHash,
        sourcePath: "new.txt",
        sizeBytes: content.byteLength,
        observedAt: "2026-07-06T15:00:00.000Z",
        status: "new",
        adapter: { name: "local-filesystem", version: "0.1.0" }
      }
    });

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects approved regular occurrence IDs that do not match scanner identity before blob writes", async () => {
    const { workspace, runtime } = await preparedRuntime({ "a.txt": "alpha" });
    const [occurrence] = [...buildIngestionProjection(await workspace.ledger.readAll()).occurrencesById.values()];
    if (occurrence === undefined) {
      throw new Error("Expected prepared runtime to observe one occurrence");
    }

    await workspace.ledger.append({
      type: "ingestion.occurrence.observed",
      version: 1,
      streamId: "ingestion_scan_scan_001",
      context: {
        actor,
        occurredAt: "2026-07-06T15:00:00.000Z",
        correlationId: "corr_scan_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        occurrenceId: "occ_wrong_identity",
        scanBatchId: occurrence.scanBatchId,
        sourceCollectionId: occurrence.sourceCollectionId,
        contentHash: occurrence.contentHash,
        sourcePath: occurrence.sourcePath,
        sizeBytes: occurrence.sizeBytes,
        observedAt: "2026-07-06T15:00:00.000Z",
        status: occurrence.status,
        adapter: { name: "local-filesystem", version: "0.1.0" }
      }
    });
    await approve(runtime);

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
  });

  it("rejects duplicate regular inventory keys with forged occurrence IDs before blob writes", async () => {
    const { workspace, runtime } = await preparedRuntime({ "a.txt": "alpha" });
    const [occurrence] = [...buildIngestionProjection(await workspace.ledger.readAll()).occurrencesById.values()];
    if (occurrence === undefined) {
      throw new Error("Expected prepared runtime to observe one occurrence");
    }

    await workspace.ledger.append({
      type: "ingestion.occurrence.observed",
      version: 1,
      streamId: "ingestion_scan_scan_001",
      context: {
        actor,
        occurredAt: "2026-07-06T15:00:00.000Z",
        correlationId: "corr_scan_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        occurrenceId: "occ_-wrong_identity",
        scanBatchId: occurrence.scanBatchId,
        sourceCollectionId: occurrence.sourceCollectionId,
        contentHash: occurrence.contentHash,
        sourcePath: occurrence.sourcePath,
        sizeBytes: occurrence.sizeBytes,
        observedAt: "2026-07-06T15:00:00.000Z",
        status: occurrence.status,
        adapter: { name: "local-filesystem", version: "0.1.0" }
      }
    });
    await approve(runtime);

    const result = await runtime.importApproved({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL" }
    });
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
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
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
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
    const events = await workspace.ledger.readAll();
    expectStableSourceDiagnostic(events, result);
    expectNoImportWrites(events);
    expect(readdirSync(join(workspace.rootDir, "blobs"), { recursive: true })).toEqual([]);
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

function sha256(content: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function expectStableSourceDiagnostic(
  events: Awaited<ReturnType<ReturnType<typeof createFakeMountedWorkspace>["ledger"]["readAll"]>>,
  result: Awaited<ReturnType<ReturnType<typeof createIngestionRuntime>["importApproved"]>>
) {
  if (result.ok) {
    throw new Error("Expected import to fail before asserting diagnostic details");
  }

  const diagnostics = events.filter((event) => event.type === "diagnostic.recorded");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({
    streamId: diagnosticStreamId("src_drive_001", "scan_001", "imp_001"),
    payload: {
      diagnosticId: "diag_ingestion_stale_src_drive_001_scan_001_imp_001",
      severity: "error",
      category: "ingestion",
      message: "Approved dry-run inventory no longer matches current source bytes.",
      repairHint: {
        contract: "IngestionRuntime.importApproved",
        violatedPath: "approvedDryRunInventory",
        allowedActions: result.error.allowedRepairActions
      }
    }
  });
  expect(JSON.stringify(diagnostics[0])).not.toMatch(/cestus-ingestion-runtime|\/tmp\/|sourceRoot|bundle\.zip|a\.txt/i);

  const projection = buildIngestionProjection(events);
  const diagnosticId = "diag_ingestion_stale_src_drive_001_scan_001_imp_001";
  expect(projection.diagnostics.get(diagnosticId)).toMatchObject({
    diagnosticId,
    sourceCollectionId: "src_drive_001",
    scanBatchId: "scan_001",
    streamId: diagnosticStreamId("src_drive_001", "scan_001", "imp_001")
  });
  expect(projection.diagnosticsBySourceCollectionId.get("src_drive_001")).toContain(diagnosticId);
  expect(projection.sources.get("src_drive_001")?.diagnosticIds).toContain(diagnosticId);
  expect(projection.scans.get("scan_001")?.diagnosticIds).toContain(diagnosticId);
  expect(buildIngestionReviewDto(projection, "src_drive_001").diagnostics).toContainEqual(
    expect.objectContaining({
      diagnosticId,
      category: "ingestion",
      message: "Approved dry-run inventory no longer matches current source bytes."
    })
  );
}

function expectNoImportWrites(
  events: Awaited<ReturnType<ReturnType<typeof createFakeMountedWorkspace>["ledger"]["readAll"]>>
) {
  expect(events.some((event) => event.type === "evidence.ingested")).toBe(false);
  expect(events.some((event) => event.type === "ingestion.evidence.linked")).toBe(false);
  expect(events.some((event) => event.type === "ingestion.import.completed")).toBe(false);
}

function diagnosticStreamId(sourceCollectionId: string, scanBatchId: string, importBatchId: string): string {
  return `ingestion_diagnostic_v1.${base64Url(sourceCollectionId)}.${base64Url(scanBatchId)}.${base64Url(importBatchId)}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
