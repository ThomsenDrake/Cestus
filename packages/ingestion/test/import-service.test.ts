import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionImportService } from "../src/import-service.js";

let dir: string;

const actor = { id: "actor_system", kind: "system" as const, label: "Importer" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("IngestionImportService", () => {
  it("requires raw import approval before evidence creation", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor
    });

    await expect(
      service.importApprovedOccurrences({
        sourceCollectionId: "src_drive_001",
        scanBatchId: "scan_001",
        importBatchId: "imp_001",
        occurrences: [
          {
            occurrenceId: "occ_001",
            content: Buffer.from("alpha"),
            sourcePath: "/source/a.txt",
            mediaType: "text/plain"
          }
        ]
      })
    ).rejects.toThrow(/approval/i);

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("creates one evidence item for duplicate content with multiple occurrences", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor
    });

    await service.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: "actor_investigator"
    });

    const contentHash = `sha256:${createHash("sha256").update("same").digest("hex")}`;
    const expectedEvidenceId = `ev_ing_${createHash("sha256").update(contentHash).digest("hex")}`;
    const result = await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [
        {
          occurrenceId: "occ_001",
          content: Buffer.from("same"),
          sourcePath: "/source/a.txt",
          mediaType: "text/plain"
        },
        {
          occurrenceId: "occ_002",
          content: Buffer.from("same"),
          sourcePath: "/source/b.txt",
          mediaType: "text/plain"
        }
      ]
    });

    const events = await ledger.readAll();
    const evidenceEvents = events.filter((event) => event.type === "evidence.ingested");
    const linkedEvents = events.filter((event) => event.type === "ingestion.evidence.linked");

    expect(result.totals).toEqual({
      evidenceCreated: 1,
      occurrencesLinked: 2,
      duplicatesReused: 1,
      skipped: 0
    });
    expect(events.map((event) => event.type)).toEqual([
      "ingestion.import.approved",
      "evidence.ingested",
      "ingestion.evidence.linked",
      "ingestion.import.completed"
    ]);
    expect(events.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
    expect(evidenceEvents).toHaveLength(1);
    expect(linkedEvents).toHaveLength(1);
    expect(evidenceEvents[0]?.payload).toMatchObject({
      evidenceId: expectedEvidenceId,
      contentHash,
      source: {
        kind: "dataset",
        label: "Public ingestion import src_drive_001/imp_001"
      }
    });
    expect(evidenceEvents[0]?.payload.source.uri).toContain(
      "cestus://ingestion/source-collections/src_drive_001/imports/imp_001/content/"
    );
    expect(linkedEvents[0]?.payload).toEqual({
      evidenceId: expectedEvidenceId,
      importBatchId: "imp_001",
      sourceCollectionId: "src_drive_001",
      contentHash,
      occurrenceIds: ["occ_001", "occ_002"]
    });
  });
});
