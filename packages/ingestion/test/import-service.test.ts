import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { validateKnowledgeEvent, type AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { IngestionImportService } from "../src/import-service.js";

let dir: string;

const actor = { id: "actor_import_approver", kind: "human" as const, label: "Import Approver" };
const systemActor = { id: "actor_import_executor", kind: "system" as const, label: "Import Executor" };

function contentHashFor(content: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function evidenceIdForContentHash(contentHash: string): string {
  return `ev_ing_${createHash("sha256").update(contentHash).digest("hex")}`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("IngestionImportService", () => {
  it("requires a matching human approver while still allowing system import execution", async () => {
    const ledger = new InMemoryEventLedger();
    const blobStore = new FileBlobStore(dir);
    const humanService = new IngestionImportService({ ledger, blobStore, actor });
    const systemService = new IngestionImportService({ ledger, blobStore, actor: systemActor });

    await expect(humanService.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_mismatched_human",
      approvedBy: "actor_other_human"
    })).rejects.toThrow("Raw import approval requires the configured human service actor.");
    await expect(systemService.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_configured_system",
      approvedBy: systemActor.id
    })).rejects.toThrow("Raw import approval requires the configured human service actor.");
    expect(await ledger.readAll()).toEqual([]);

    await humanService.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_system_execution",
      approvedBy: actor.id
    });
    await expect(systemService.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_system_execution",
      occurrences: [{
        occurrenceId: "occ_system_execution",
        content: Buffer.from("system execution"),
        sourcePath: "/source/system.txt",
        mediaType: "text/plain"
      }]
    })).resolves.toMatchObject({ totals: { evidenceCreated: 1, occurrencesLinked: 1 } });
  });

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

  it("rejects a stored raw approval whose actor does not match approvedBy at consume time", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor: systemActor
    });
    await ledger.append({
      type: "ingestion.import.approved",
      version: 1,
      streamId: "ingestion_import_src_drive_001_scan_001_imp_forged_actor",
      context: {
        actor: systemActor,
        occurredAt: "2026-08-01T12:00:00.000Z",
        correlationId: "corr_imp_forged_actor",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        importBatchId: "imp_forged_actor",
        scanBatchId: "scan_001",
        sourceCollectionId: "src_drive_001",
        approvedBy: "actor_other_human",
        approvedAt: "2026-08-01T12:00:00.000Z"
      }
    });
    const eventsBeforeImport = await ledger.readAll();

    await expect(service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_forged_actor",
      occurrences: [{
        occurrenceId: "occ_forged_actor",
        content: Buffer.from("must not import"),
        sourcePath: "/source/forged.txt",
        mediaType: "text/plain"
      }]
    })).rejects.toThrow(/approval is required/i);
    expect(await ledger.readAll()).toEqual(eventsBeforeImport);
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
      approvedBy: actor.id
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

  it("is safe to retry after a completed import without appending duplicate events", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new IngestionImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor
    });
    const input = {
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
    };

    await service.approveImport({
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      importBatchId: input.importBatchId,
      approvedBy: actor.id
    });
    const firstResult = await service.importApprovedOccurrences(input);
    const eventsAfterFirstImport = await ledger.readAll();

    const retryResult = await service.importApprovedOccurrences(input);
    const eventsAfterRetry = await ledger.readAll();

    expect(retryResult.totals).toEqual(firstResult.totals);
    expect(eventsAfterRetry).toEqual(eventsAfterFirstImport);
    expect(eventsAfterRetry.filter((event) => event.type === "evidence.ingested")).toHaveLength(1);
    expect(eventsAfterRetry.filter((event) => event.type === "ingestion.evidence.linked")).toHaveLength(1);
    expect(eventsAfterRetry.filter((event) => event.type === "ingestion.import.completed")).toHaveLength(1);
  });

  it("reuses existing evidence for an already imported content hash", async () => {
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
      approvedBy: actor.id
    });
    await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [
        {
          occurrenceId: "occ_001",
          content: Buffer.from("same"),
          sourcePath: "/source/a.txt",
          mediaType: "text/plain"
        }
      ]
    });

    await service.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_002",
      importBatchId: "imp_002",
      approvedBy: actor.id
    });
    const result = await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_002",
      importBatchId: "imp_002",
      occurrences: [
        {
          occurrenceId: "occ_002",
          content: Buffer.from("same"),
          sourcePath: "/source/b.txt",
          mediaType: "text/plain"
        }
      ]
    });
    const events = await ledger.readAll();

    expect(result.totals).toEqual({
      evidenceCreated: 0,
      occurrencesLinked: 1,
      duplicatesReused: 1,
      skipped: 0
    });
    expect(events.filter((event) => event.type === "evidence.ingested")).toHaveLength(1);
    expect(events.filter((event) => event.type === "ingestion.evidence.linked")).toHaveLength(2);
    expect(events.every((event) => validateKnowledgeEvent(event).success)).toBe(true);
  });

  it("rejects invalid occurrence input before evidence or linkage is appended", async () => {
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
      approvedBy: actor.id
    });

    await expect(
      service.importApprovedOccurrences({
        sourceCollectionId: "src_drive_001",
        scanBatchId: "scan_001",
        importBatchId: "imp_001",
        occurrences: [
          {
            occurrenceId: "not_an_occurrence_id",
            content: Buffer.from("orphan-risk"),
            sourcePath: "/source/bad.txt",
            mediaType: "text/plain"
          }
        ]
      })
    ).rejects.toThrow(/occurrenceId/i);

    expect((await ledger.readAll()).map((event) => event.type)).toEqual(["ingestion.import.approved"]);
  });

  it("derives completion totals from partial evidence and link events on retry", async () => {
    const ledger = new InMemoryEventLedger();
    const blobStore = new FileBlobStore(dir);
    const service = new IngestionImportService({ ledger, blobStore, actor });
    const evidenceService = new EvidenceService({ ledger, blobStore });
    const alphaHash = contentHashFor("alpha");
    const alphaEvidenceId = evidenceIdForContentHash(alphaHash);

    const approval = await service.approveImport({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      approvedBy: actor.id
    });
    await evidenceService.ingest({
      evidenceId: alphaEvidenceId,
      content: Buffer.from("alpha"),
      mediaType: "text/plain",
      source: {
        kind: "dataset",
        label: "Public ingestion import src_drive_001/imp_001",
        uri: `cestus://ingestion/source-collections/src_drive_001/imports/imp_001/content/${alphaHash.replace("sha256:", "")}`
      },
      actor
    });
    const partialLink: AppendableKnowledgeEvent<"ingestion.evidence.linked"> = {
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: `ingestion_evidence_link_src_drive_001_scan_001_imp_001_${alphaHash.replace("sha256:", "")}`,
      context: {
        actor,
        occurredAt: new Date().toISOString(),
        causationId: approval.id,
        correlationId: "corr_imp_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: alphaEvidenceId,
        importBatchId: "imp_001",
        sourceCollectionId: "src_drive_001",
        contentHash: alphaHash,
        occurrenceIds: ["occ_001"]
      }
    };
    await ledger.append(partialLink);

    const result = await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [
        {
          occurrenceId: "occ_001",
          content: Buffer.from("alpha"),
          sourcePath: "/source/a.txt",
          mediaType: "text/plain"
        },
        {
          occurrenceId: "occ_002",
          content: Buffer.from("bravo"),
          sourcePath: "/source/b.txt",
          mediaType: "text/plain"
        }
      ]
    });
    const completedEvents = (await ledger.readAll()).filter((event) => event.type === "ingestion.import.completed");

    expect(result.totals).toEqual({
      evidenceCreated: 2,
      occurrencesLinked: 2,
      duplicatesReused: 0,
      skipped: 0
    });
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]?.payload.totals).toEqual(result.totals);
  });

  it("uses source collection, scan, import, and hash in evidence link stream identity", async () => {
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
      approvedBy: actor.id
    });
    const contentHash = contentHashFor("same");
    await service.importApprovedOccurrences({
      sourceCollectionId: "src_drive_001",
      scanBatchId: "scan_001",
      importBatchId: "imp_001",
      occurrences: [
        {
          occurrenceId: "occ_001",
          content: Buffer.from("same"),
          sourcePath: "/source/a.txt",
          mediaType: "text/plain"
        }
      ]
    });
    const linkedEvents = (await ledger.readAll()).filter((event) => event.type === "ingestion.evidence.linked");

    expect(linkedEvents[0]?.streamId).toBe(
      `ingestion_evidence_link_src_drive_001_scan_001_imp_001_${contentHash.replace("sha256:", "")}`
    );
  });
});
