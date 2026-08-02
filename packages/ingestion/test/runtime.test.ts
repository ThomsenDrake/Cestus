import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryEventLedger,
  type AppendableKnowledgeEvent,
  type AppendOptions
} from "../../ontology/src/event-ledger.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { mountedWorkspaceCapabilities } from "../src/mount-contract.js";
import { buildIngestionProjection } from "../src/projection.js";
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
    expect(scanned.ok).toBe(true);
    if (!scanned.ok) {
      throw new Error("Expected dry-run scan to succeed");
    }
    const scanEvents = await workspace.ledger.readStream("ingestion_scan_scan_001");
    expect(scanned.eventIds).toEqual(scanEvents.map((event) => event.id));
    expect(scanned.eventIds).not.toContain((await workspace.ledger.readStream("ingestion_source_src_drive_001"))[0]?.id);
  });

  it("rejects raw import approval from a mismatched human or configured system actor", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const humanRuntime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    await humanRuntime.registerSource({
      sourceCollectionId: "src_approval_actor_001",
      label: "Approval actor fixture",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    await humanRuntime.dryRunScan({
      sourceCollectionId: "src_approval_actor_001",
      scanBatchId: "scan_approval_actor_001"
    });
    const eventsBeforeApproval = await workspace.ledger.readAll();

    const mismatchedHuman = await humanRuntime.approveRawImport({
      sourceCollectionId: "src_approval_actor_001",
      scanBatchId: "scan_approval_actor_001",
      importBatchId: "imp_approval_actor_mismatch",
      approvedBy: "actor_other_human"
    });
    const systemActor = { id: "actor_approval_system", kind: "system" as const, label: "Approval System" };
    const systemRuntime = createIngestionRuntime({ mountedWorkspace: workspace, actor: systemActor });
    const configuredSystem = await systemRuntime.approveRawImport({
      sourceCollectionId: "src_approval_actor_001",
      scanBatchId: "scan_approval_actor_001",
      importBatchId: "imp_approval_actor_system",
      approvedBy: systemActor.id
    });

    const expectedError = {
      ok: false,
      error: {
        code: "INGESTION_IMPORT_APPROVAL_REQUIRED",
        message: "Raw import approval requires the configured human runtime actor.",
        allowedRepairActions: ["retry raw import approval as the configured human runtime actor"],
        diagnostics: []
      }
    };
    expect(mismatchedHuman).toEqual(expectedError);
    expect(configuredSystem).toEqual(expectedError);
    expect(await workspace.ledger.readAll()).toEqual(eventsBeforeApproval);
    expect(JSON.stringify([mismatchedHuman, configuredSystem])).not.toMatch(
      /actor_other_human|actor_approval_system|cestus-ingestion-runtime-/i
    );
  });

  it("builds a deduplicated evidence corpus without changing the read-only fixture or invoking a provider", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    const firstPath = join(sourceRoot, "first", "record.txt");
    const secondPath = join(sourceRoot, "second", "copy.txt");
    const sourceBytes = Buffer.from("same source bytes", "utf8");
    mkdirSync(join(sourceRoot, "first"), { recursive: true });
    mkdirSync(join(sourceRoot, "second"), { recursive: true });
    writeFileSync(firstPath, sourceBytes);
    writeFileSync(secondPath, sourceBytes);
    const providerParse = vi.fn();
    const runtime = createIngestionRuntime({
      mountedWorkspace: workspace,
      actor,
      providerRegistry: { "fixture-provider": { parse: providerParse } }
    });
    const expectReadOnlyFixture = () => {
      expect(readFileSync(firstPath)).toEqual(sourceBytes);
      expect(readFileSync(secondPath)).toEqual(sourceBytes);
    };

    await runtime.registerSource({
      sourceCollectionId: "src_corpus_001",
      label: "Portable fixture corpus",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    const scanned = await runtime.dryRunScan({
      sourceCollectionId: "src_corpus_001",
      scanBatchId: "scan_corpus_001"
    });

    expect(scanned).toMatchObject({
      ok: true,
      review: {
        totals: { observedFiles: 2, uniqueContent: 1, duplicateOccurrences: 1 },
        approvalRequired: true,
        duplicateGroups: [{
          occurrenceCount: 2,
          sourcePaths: ["first/record.txt", "second/copy.txt"]
        }]
      }
    });
    expectReadOnlyFixture();
    const dryRunEvents = await workspace.ledger.readAll();
    expect(dryRunEvents.some((event) => event.type === "evidence.ingested")).toBe(false);
    const observed = dryRunEvents.filter((event) => event.type === "ingestion.occurrence.observed");
    expect(observed).toHaveLength(2);
    const contentHash = expectSha256ContentHash(observed[0]?.payload.contentHash);
    await expect(workspace.blobStore.get(contentHash)).rejects.toThrow();

    const blocked = await runtime.importApproved({
      sourceCollectionId: "src_corpus_001",
      scanBatchId: "scan_corpus_001",
      importBatchId: "imp_corpus_001"
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: "INGESTION_IMPORT_APPROVAL_REQUIRED" }
    });
    expectReadOnlyFixture();

    await runtime.approveRawImport({
      sourceCollectionId: "src_corpus_001",
      scanBatchId: "scan_corpus_001",
      importBatchId: "imp_corpus_001",
      approvedBy: actor.id
    });
    await expect(workspace.blobStore.get(contentHash)).rejects.toThrow();
    expectReadOnlyFixture();

    const imported = await runtime.importApproved({
      sourceCollectionId: "src_corpus_001",
      scanBatchId: "scan_corpus_001",
      importBatchId: "imp_corpus_001"
    });
    expect(imported).toMatchObject({
      ok: true,
      totals: {
        evidenceCreated: 1,
        occurrencesLinked: 2,
        duplicatesReused: 1,
        skipped: 0
      },
      review: {
        evidenceLinks: [{
          contentHash,
          occurrenceIds: expect.arrayContaining(observed.map((event) => event.payload.occurrenceId))
        }],
        parseJobs: [{ lane: "local", state: "queued" }]
      }
    });
    expect(await workspace.blobStore.get(contentHash)).toEqual(sourceBytes);
    expectReadOnlyFixture();

    const firstImportEvents = await workspace.ledger.readAll();
    expect(firstImportEvents.filter((event) => event.type === "evidence.ingested")).toHaveLength(1);
    expect(firstImportEvents.filter((event) => event.type === "ingestion.evidence.linked")).toHaveLength(1);
    expect(firstImportEvents.filter((event) => event.type === "ingestion.import.completed")).toHaveLength(1);
    expect(firstImportEvents.filter((event) => event.type === "ingestion.parse.job.created")).toHaveLength(1);
    expect(buildIngestionProjection(firstImportEvents).evidenceByHash.size).toBe(1);

    const repeated = await runtime.importApproved({
      sourceCollectionId: "src_corpus_001",
      scanBatchId: "scan_corpus_001",
      importBatchId: "imp_corpus_001"
    });
    expect(repeated).toMatchObject({ ok: true, eventIds: [] });
    expect(await workspace.ledger.readAll()).toEqual(firstImportEvents);
    expectReadOnlyFixture();

    const wrongBatchProviderApproval = await runtime.approveProviderParsing({
      providerJobId: "provider_corpus_wrong_batch",
      sourceCollectionId: "src_corpus_001",
      importBatchId: "imp_corpus_missing",
      provider: { name: "fixture-provider", version: "0.1.0" },
      approvedBy: actor.id,
      eligibleMediaTypes: ["text/plain"],
      maxBytesPerFile: 1024
    });
    expect(wrongBatchProviderApproval).toMatchObject({
      ok: false,
      error: { code: "INGESTION_IMPORT_APPROVAL_REQUIRED" }
    });

    const exactBatchProviderApproval = await runtime.approveProviderParsing({
      providerJobId: "provider_corpus_001",
      sourceCollectionId: "src_corpus_001",
      importBatchId: "imp_corpus_001",
      provider: { name: "fixture-provider", version: "0.1.0" },
      approvedBy: actor.id,
      eligibleMediaTypes: ["text/plain"],
      maxBytesPerFile: 1024
    });
    expect(exactBatchProviderApproval.ok).toBe(true);
    expect(providerParse).not.toHaveBeenCalled();
    expectReadOnlyFixture();
  });

  it("preserves old and new path provenance when source bytes change between approved batches", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    const sourcePath = join(sourceRoot, "record.txt");
    const oldBytes = Buffer.from("old bytes", "utf8");
    const newBytes = Buffer.from("new bytes", "utf8");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(sourcePath, oldBytes);
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });

    await runtime.registerSource({
      sourceCollectionId: "src_refresh_001",
      label: "Refresh fixture",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    await runtime.dryRunScan({ sourceCollectionId: "src_refresh_001", scanBatchId: "scan_refresh_001" });
    await runtime.approveRawImport({
      sourceCollectionId: "src_refresh_001",
      scanBatchId: "scan_refresh_001",
      importBatchId: "imp_refresh_001",
      approvedBy: actor.id
    });
    await runtime.importApproved({
      sourceCollectionId: "src_refresh_001",
      scanBatchId: "scan_refresh_001",
      importBatchId: "imp_refresh_001"
    });
    expect(readFileSync(sourcePath)).toEqual(oldBytes);

    writeFileSync(sourcePath, newBytes);
    await runtime.dryRunScan({ sourceCollectionId: "src_refresh_001", scanBatchId: "scan_refresh_002" });
    await runtime.approveRawImport({
      sourceCollectionId: "src_refresh_001",
      scanBatchId: "scan_refresh_002",
      importBatchId: "imp_refresh_002",
      approvedBy: actor.id
    });
    await runtime.importApproved({
      sourceCollectionId: "src_refresh_001",
      scanBatchId: "scan_refresh_002",
      importBatchId: "imp_refresh_002"
    });

    const events = await workspace.ledger.readAll();
    const projection = buildIngestionProjection(events);
    const occurrences = [...projection.occurrencesById.values()]
      .filter((occurrence) => occurrence.sourceCollectionId === "src_refresh_001");
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((occurrence) => occurrence.scanBatchId).sort()).toEqual([
      "scan_refresh_001",
      "scan_refresh_002"
    ]);
    expect(new Set(occurrences.map((occurrence) => occurrence.contentHash)).size).toBe(2);
    expect(occurrences.every((occurrence) => occurrence.sourcePath === "record.txt")).toBe(true);
    expect(events.filter((event) => event.type === "evidence.ingested")).toHaveLength(2);
    expect(events.filter((event) => event.type === "ingestion.evidence.linked")).toHaveLength(2);
    expect(projection.evidenceByHash.size).toBe(2);
    expect(projection.parseJobs.size).toBe(2);
    expect(readFileSync(sourcePath)).toEqual(newBytes);
  });

  it("lists source summaries through the runtime without exposing source roots", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });
    await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    const sources = await runtime.listSources({});

    expect(sources).toEqual({
      ok: true,
      sources: [{
        sourceCollectionId: "src_drive_001",
        label: "Old archive",
        latestScanBatchId: "scan_001",
        scanBatchIds: ["scan_001"],
        importBatchIds: [],
        diagnosticIds: []
      }]
    });
    expect(JSON.stringify(sources)).not.toContain(sourceRoot);
    expect(JSON.stringify(sources)).not.toContain("rootUri");
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

  it("includes scanner diagnostics from the scan stream in dry-run event IDs", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "bad.zip"), Buffer.from(zipSync({
      "../escape.txt": strToU8("nope")
    })));
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });

    const scanned = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(scanned.ok).toBe(true);
    if (!scanned.ok) {
      throw new Error("Expected dry-run scan to succeed with diagnostics");
    }
    const scanEvents = await workspace.ledger.readStream("ingestion_scan_scan_001");
    const diagnosticEvent = scanEvents.find((event) => event.type === "diagnostic.recorded");
    expect(scanEvents.map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "diagnostic.recorded",
      "ingestion.scan.completed"
    ]);
    expect(diagnosticEvent?.id).toBeDefined();
    expect(scanned.eventIds).toEqual(scanEvents.map((event) => event.id));
    expect(scanned.eventIds).toContain(diagnosticEvent?.id);
  });

  it("reports dry-run event IDs from the scan stream only", async () => {
    const workspace = {
      ...createFakeMountedWorkspace(),
      ledger: new InterleavingEventLedger()
    };
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, "a.txt"), "alpha");
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    });

    const scanned = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(scanned.ok).toBe(true);
    if (!scanned.ok) {
      throw new Error("Expected dry-run scan to succeed");
    }
    const scanEvents = await workspace.ledger.readStream("ingestion_scan_scan_001");
    expect(scanEvents.map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ]);
    expect(scanned.eventIds).toEqual(scanEvents.map((event) => event.id));
    expect(scanned.eventIds).not.toContain(
      (await workspace.ledger.readStream("diagnostic_diag_runtime_interleaved"))[0]?.id
    );
    expect(scanned.eventIds).not.toContain(
      (await workspace.ledger.readStream("ingestion_source_src_drive_001"))[0]?.id
    );
  });

  it("requires readable writable workspace capabilities before dry-run scans", async () => {
    const baseWorkspace = createFakeMountedWorkspace();
    roots.push(baseWorkspace.rootDir);
    const ledger = {
      append: vi.fn(async () => {
        throw new Error("runtime must not append without ledger read capability");
      }),
      readAll: vi.fn(async () => {
        throw new Error("runtime must not read all events without ledger read capability");
      }),
      readStream: vi.fn(async () => {
        throw new Error("runtime must not read streams without ledger read capability");
      })
    };
    const runtime = createIngestionRuntime({
      mountedWorkspace: {
        ...baseWorkspace,
        ledger,
        capabilities: mountedWorkspaceCapabilities({
          canReadLedger: false,
          canAppendLedger: true,
          canWriteBlobs: true,
          canWriteDerivatives: true,
          canWriteJobState: true
        })
      },
      actor
    });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_WORKSPACE_NOT_WRITABLE" }
    });
    expect(JSON.stringify(result)).not.toMatch(/tmp|cestus-ingestion-runtime|source/i);
    expect(ledger.readAll).not.toHaveBeenCalled();
    expect(ledger.readStream).not.toHaveBeenCalled();
    expect(ledger.append).not.toHaveBeenCalled();
  });

  it("returns a stable secret-safe error for unsupported registered source URI schemes", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    const registered = await runtime.registerSource({
      sourceCollectionId: "src_drive_001",
      label: "Cloud archive",
      rootUri: "s3://private-bucket/case-files",
      sourceRoot: "s3://private-bucket/case-files"
    });

    const result = await runtime.dryRunScan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001"
    });

    expect(registered.ok).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INGESTION_RUNTIME_INTERNAL" }
    });
    expect(JSON.stringify(result)).not.toMatch(/private-bucket|case-files|s3:\/\//i);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered"
    ]);
  });

  it("returns a stable secret-safe error for duplicate source registration", async () => {
    const workspace = createFakeMountedWorkspace();
    roots.push(workspace.rootDir);
    const sourceRoot = join(workspace.rootDir, "source");
    mkdirSync(sourceRoot, { recursive: true });
    const runtime = createIngestionRuntime({ mountedWorkspace: workspace, actor });
    const input = {
      sourceCollectionId: "src_drive_001",
      label: "Old archive",
      rootUri: `file://${sourceRoot}`,
      sourceRoot
    };

    const first = await runtime.registerSource(input);
    const second = await runtime.registerSource(input);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      error: { code: "INGESTION_RUNTIME_INTERNAL" }
    });
    expect(JSON.stringify(second)).not.toContain(sourceRoot);
    expect((await workspace.ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.source.registered"
    ]);
  });
});

class InterleavingEventLedger extends InMemoryEventLedger {
  private injected = false;

  override async append(
    event: AppendableKnowledgeEvent,
    options?: AppendOptions
  ): Promise<KnowledgeEvent> {
    const committed = await super.append(event, options);

    if (!this.injected && committed.type === "ingestion.scan.started") {
      this.injected = true;
      await super.append({
        type: "diagnostic.recorded",
        version: 1,
        streamId: "diagnostic_diag_runtime_interleaved",
        context: {
          actor,
          occurredAt: "2026-07-06T13:30:00.000Z",
          correlationId: "corr_runtime_interleaved",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          diagnosticId: "diag_runtime_interleaved",
          severity: "warning",
          category: "ingestion",
          message: "Unrelated runtime diagnostic.",
          repairHint: {
            contract: "runtime-test",
            violatedPath: "interleaved-event",
            allowedActions: ["ignore unrelated event"]
          }
        }
      });
    }

    return committed;
  }
}

function expectSha256ContentHash(value: string | undefined): `sha256:${string}` {
  if (value === undefined || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("Expected the dry-run to compute a SHA-256 content hash");
  }
  return value as `sha256:${string}`;
}
