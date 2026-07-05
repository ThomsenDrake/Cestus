import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { ZipArchiveAdapter } from "../src/archive-adapter.js";
import { LocalFilesystemScanner } from "../src/local-filesystem.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cestus-archive-scan-"));
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("zip archive expansion", () => {
  it("observes zip children as evidence candidates with container provenance", async () => {
    const archive = Buffer.from(zipSync({
      "folder/a.txt": strToU8("alpha"),
      "folder/b.txt": strToU8("beta")
    }));
    const containerPath = join(root, "bundle.zip");
    writeFileSync(containerPath, archive);
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_001",
      rootDir: root
    });

    const containerHash = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
    expect(result.occurrences).toHaveLength(2);
    expect(result.occurrences.map((occurrence) => occurrence.internalPath).sort()).toEqual([
      "folder/a.txt",
      "folder/b.txt"
    ]);
    expect(result.occurrences.every((occurrence) => occurrence.sourcePath === "bundle.zip")).toBe(true);
    expect(result.occurrences.every((occurrence) => occurrence.containerPath === "bundle.zip")).toBe(true);
    expect(result.occurrences.every((occurrence) => occurrence.containerHash === containerHash)).toBe(true);
    expect(result.occurrences.every((occurrence) => occurrence.archiveAdapter?.name === "fflate")).toBe(true);

    const occurrenceEvents = (await ledger.readAll()).filter((event) => event.type === "ingestion.occurrence.observed");
    expect(occurrenceEvents).toHaveLength(2);
    expect(occurrenceEvents.map((event) => event.payload).map((payload) => ({
      containerPath: payload.containerPath,
      containerHash: payload.containerHash,
      internalPath: payload.internalPath,
      archiveAdapter: payload.archiveAdapter
    }))).toEqual([
      {
        containerPath: "bundle.zip",
        containerHash,
        internalPath: "folder/a.txt",
        archiveAdapter: { name: "fflate", version: "0.8.x" }
      },
      {
        containerPath: "bundle.zip",
        containerHash,
        internalPath: "folder/b.txt",
        archiveAdapter: { name: "fflate", version: "0.8.x" }
      }
    ]);
  });

  it("rejects unsafe zip internal paths before occurrence creation and records a durable diagnostic", async () => {
    writeFileSync(join(root, "bad.zip"), zipSync({
      "../escape.txt": strToU8("nope")
    }));
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_002",
      rootDir: root
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      category: "ingestion",
      message: expect.stringMatching(/unsafe archive path/)
    }));
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "diagnostic.recorded",
      "ingestion.scan.completed"
    ]);
    expect(events[1]?.payload).toMatchObject({
      severity: "error",
      category: "ingestion",
      message: expect.stringMatching(/unsafe archive path/),
      repairHint: {
        contract: "ZipArchiveAdapter.expand",
        violatedPath: "bad.zip",
        allowedActions: ["skip archive", "rebuild archive without unsafe paths", "rerun dry-run"]
      }
    });
  });

  it("rejects Windows drive-root internal paths before occurrence creation", async () => {
    writeFileSync(join(root, "bad-windows-path.zip"), zipSync({
      "C:/escape.txt": strToU8("nope")
    }));
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_003",
      rootDir: root
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      category: "ingestion",
      message: expect.stringMatching(/unsafe archive path/)
    }));
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "diagnostic.recorded",
      "ingestion.scan.completed"
    ]);
  });

  it("records no scanner child occurrences for over-limit archives", async () => {
    writeFileSync(join(root, "too-large.zip"), zipSync({
      "large.txt": strToU8("too large")
    }));
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" },
      archiveLimits: { maxEntries: 10, maxExpandedBytes: 3 }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_004",
      rootDir: root
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      category: "ingestion",
      message: expect.stringMatching(/archive expansion byte limit exceeded/)
    }));
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "diagnostic.recorded",
      "ingestion.scan.completed"
    ]);
    expect(events[1]?.payload).toMatchObject({
      severity: "error",
      category: "ingestion",
      message: "archive expansion byte limit exceeded",
      repairHint: {
        contract: "ZipArchiveAdapter.expand",
        violatedPath: "too-large.zip",
        allowedActions: ["reduce archive contents", "increase reviewed archive limits", "rerun dry-run"]
      }
    });
  });

  it("uses distinct occurrence IDs for archive children and literal matching filesystem paths", async () => {
    const content = strToU8("same");
    writeFileSync(join(root, "bundle.zip"), zipSync({
      "folder/a.txt": content
    }));
    mkdirSync(join(root, "bundle.zip!", "folder"), { recursive: true });
    writeFileSync(join(root, "bundle.zip!", "folder", "a.txt"), content);
    const scanner = new LocalFilesystemScanner({
      ledger: new InMemoryEventLedger(),
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_zip_005",
      rootDir: root
    });

    expect(result.occurrences.map((occurrence) => occurrence.sourcePath).sort()).toEqual([
      "bundle.zip",
      "bundle.zip!/folder/a.txt"
    ]);
    expect(new Set(result.occurrences.map((occurrence) => occurrence.occurrenceId)).size).toBe(2);
  });

  it("enforces configured zip entry count and expansion byte limits", () => {
    const archive = Buffer.from(zipSync({
      "a.txt": strToU8("alpha"),
      "b.txt": strToU8("beta")
    }));
    const adapter = new ZipArchiveAdapter();

    expect(() => adapter.expand(archive, {
      containerHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      maxEntries: 1,
      maxExpandedBytes: 100
    })).toThrow(/archive entry count limit exceeded/);

    expect(() => adapter.expand(archive, {
      containerHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      maxEntries: 10,
      maxExpandedBytes: 3
    })).toThrow(/archive expansion byte limit exceeded/);
  });
});
