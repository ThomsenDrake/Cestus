import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LocalFilesystemScanner } from "../src/local-filesystem.js";

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
});
