import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  LocalFilesystemScanner,
  stableLocalFilesystemOccurrenceId
} from "../src/local-filesystem.js";

let root: string;
const duplicateText = "same";
const notesText = JSON.stringify({ agency: "Example" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cestus-scan-"));
  mkdirSync(join(root, "contracts"), { recursive: true });
  writeFileSync(join(root, "contracts", "a.txt"), duplicateText);
  writeFileSync(join(root, "contracts", "copy.txt"), duplicateText);
  writeFileSync(join(root, "notes.json"), notesText);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LocalFilesystemScanner", () => {
  it("runs a dry-run scan with hashes, duplicate counts, and occurrence events", async () => {
    const duplicateBytes = Buffer.byteLength(duplicateText);
    const notesBytes = Buffer.byteLength(notesText);
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });

    expect(result.totals).toMatchObject({
      observedFiles: 3,
      uniqueContent: 2,
      duplicateOccurrences: 1,
      skipped: 0,
      bytes: duplicateBytes * 2 + notesBytes,
      estimatedNewBlobBytes: duplicateBytes + notesBytes
    });
    expect(result.occurrences.map((occurrence) => occurrence.status).sort()).toEqual([
      "duplicate",
      "new",
      "new"
    ]);
    expect(result.inventoryHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual([
      "ingestion.scan.started",
      "ingestion.occurrence.observed",
      "ingestion.occurrence.observed",
      "ingestion.occurrence.observed",
      "ingestion.scan.completed"
    ]);
  });

  it("keeps the inventory hash stable across scan batches for the same tree", async () => {
    const firstLedger = new InMemoryEventLedger();
    const secondLedger = new InMemoryEventLedger();
    const firstScanner = new LocalFilesystemScanner({
      ledger: firstLedger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });
    const secondScanner = new LocalFilesystemScanner({
      ledger: secondLedger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const first = await firstScanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });
    const second = await secondScanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_002",
      rootDir: root
    });

    expect(second.inventoryHash).toBe(first.inventoryHash);
  });

  it("uses stable occurrence IDs for the same batch, path, and hash in fresh ledgers", async () => {
    const firstLedger = new InMemoryEventLedger();
    const secondLedger = new InMemoryEventLedger();
    const firstScanner = new LocalFilesystemScanner({
      ledger: firstLedger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });
    const secondScanner = new LocalFilesystemScanner({
      ledger: secondLedger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const first = await firstScanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });
    const second = await secondScanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });

    expect(second.occurrences.map((occurrence) => occurrence.occurrenceId).sort()).toEqual(
      first.occurrences.map((occurrence) => occurrence.occurrenceId).sort()
    );
  });

  it("uses the exported helper for regular file occurrence IDs", async () => {
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });
    const notesOccurrence = result.occurrences.find((occurrence) => occurrence.sourcePath === "notes.json");
    if (notesOccurrence === undefined) {
      throw new Error("Expected scan to include notes.json");
    }

    expect(notesOccurrence.occurrenceId).toBe(stableLocalFilesystemOccurrenceId({
      kind: "file",
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      sourcePath: "notes.json",
      contentHash: notesOccurrence.contentHash
    }));
  });

  it("skips symlinks without hashing targets or emitting occurrence events", async () => {
    symlinkSync(join(root, "contracts", "a.txt"), join(root, "contracts", "linked.txt"));
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    const result = await scanner.scan({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      rootDir: root
    });

    expect(result.totals).toMatchObject({ observedFiles: 3, skipped: 1 });
    expect(result.occurrences.map((occurrence) => occurrence.sourcePath)).not.toContain("contracts/linked.txt");
    expect((await ledger.readAll()).filter((event) => event.type === "ingestion.occurrence.observed")).toHaveLength(3);
  });

  it("leaves the ledger empty when collection fails before append", async () => {
    const ledger = new InMemoryEventLedger();
    const scanner = new LocalFilesystemScanner({
      ledger,
      actor: { id: "actor_system", kind: "system", label: "Scanner" }
    });

    await expect(
      scanner.scan({
        sourceCollectionId: "src_drive_001",
        scanBatchId: "scan_001",
        rootDir: join(root, "missing")
      })
    ).rejects.toThrow();
    expect(await ledger.readAll()).toEqual([]);
  });
});
