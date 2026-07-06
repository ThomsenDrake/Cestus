import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { LegacyRawImportService } from "../src/legacy-import-service.js";

let dir: string;

const actor = { id: "actor_system", kind: "system" as const, label: "Legacy importer" };
const metadataFile = {
  occurrenceId: "occ_legacy_claims",
  sourcePath: "ontology/claims.json",
  content: Buffer.from("{\"legacyCestusType\":\"claims\"}"),
  mediaType: "application/json"
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legacy-raw-import-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("LegacyRawImportService", () => {
  it("requires existing raw import approval through the ingestion import service", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyRawImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor
    });

    await expect(
      service.importReportFiles({
        sourceCollectionId: "src_old_cestus",
        scanBatchId: "scan_old_cestus_001",
        importBatchId: "imp_old_cestus_001",
        files: [metadataFile]
      })
    ).rejects.toThrow(/approval/i);

    expect(await ledger.readAll()).toHaveLength(0);
  });

  it("imports metadata files as evidence before ontology staging", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new LegacyRawImportService({
      ledger,
      blobStore: new FileBlobStore(dir),
      actor
    });

    const approval = await service.approveRawImport({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      approvedBy: "actor_investigator"
    });
    await service.importReportFiles({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      files: [metadataFile]
    });

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(approval.type).toBe("ingestion.import.approved");
    expect(eventTypes).toContain("evidence.ingested");
    expect(eventTypes).toContain("ingestion.evidence.linked");
    expect(eventTypes).not.toContain("assertion.proposed");
    expect(eventTypes).not.toContain("assertion.accepted");
    expect(eventTypes).not.toContain("entity.resolved");
    expect(eventTypes).not.toContain("relationship.accepted");
  });
});
