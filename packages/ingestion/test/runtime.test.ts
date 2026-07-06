import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryEventLedger,
  type AppendableKnowledgeEvent,
  type AppendOptions
} from "../../ontology/src/event-ledger.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { mountedWorkspaceCapabilities } from "../src/mount-contract.js";
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
