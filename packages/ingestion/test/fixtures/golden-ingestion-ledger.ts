import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";

const fixedHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const context: KnowledgeEvent["context"] = {
  actor: {
    id: "actor_investigator",
    kind: "human",
    label: "Investigator"
  },
  occurredAt: "2026-07-05T12:00:00.000Z",
  correlationId: "corr_ingestion_golden",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", ingestion: "0.1.0" }
};

export const goldenIngestionLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_ing_source_registered",
    type: "ingestion.source.registered",
    version: 1,
    streamId: "ingestion_source_src_drive_001",
    sequence: 1,
    context,
    payload: {
      sourceCollectionId: "src_drive_001",
      label: "External investigation archive",
      mode: "read-only",
      adapter: { name: "local-filesystem", version: "0.1.0" },
      rootUri: "file:///mnt/investigation-drive/source",
      workspaceUri: "file:///mnt/investigation-drive/cestus-workspace"
    }
  },
  {
    id: "evt_ing_scan_started",
    type: "ingestion.scan.started",
    version: 1,
    streamId: "ingestion_scan_scan_001",
    sequence: 1,
    context,
    payload: {
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      hashPolicy: "sha256-dry-run",
      startedAt: "2026-07-05T12:00:00.000Z"
    }
  },
  {
    id: "evt_ing_occurrence_observed_001",
    type: "ingestion.occurrence.observed",
    version: 1,
    streamId: "ingestion_scan_scan_001",
    sequence: 2,
    context,
    payload: {
      occurrenceId: "occ_001",
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      contentHash: fixedHash,
      sourcePath: "contracts/a.txt",
      sizeBytes: 4,
      observedAt: "2026-07-05T12:01:00.000Z",
      status: "new",
      adapter: { name: "local-filesystem", version: "0.1.0" }
    }
  },
  {
    id: "evt_ing_occurrence_observed_002",
    type: "ingestion.occurrence.observed",
    version: 1,
    streamId: "ingestion_scan_scan_001",
    sequence: 3,
    context,
    payload: {
      occurrenceId: "occ_002",
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      contentHash: fixedHash,
      sourcePath: "duplicates/a-copy.txt",
      sizeBytes: 4,
      observedAt: "2026-07-05T12:01:30.000Z",
      status: "duplicate",
      adapter: { name: "local-filesystem", version: "0.1.0" }
    }
  },
  {
    id: "evt_ing_scan_completed",
    type: "ingestion.scan.completed",
    version: 1,
    streamId: "ingestion_scan_scan_001",
    sequence: 4,
    context,
    payload: {
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      completedAt: "2026-07-05T12:02:00.000Z",
      inventoryHash: fixedHash,
      totals: {
        observedFiles: 2,
        uniqueContent: 1,
        duplicateOccurrences: 1,
        skipped: 0,
        bytes: 8,
        estimatedNewBlobBytes: 4
      }
    }
  },
  {
    id: "evt_ing_import_approved",
    type: "ingestion.import.approved",
    version: 1,
    streamId: "ingestion_import_src_drive_001_scan_001_imp_001",
    sequence: 1,
    context: { ...context, causationId: "evt_ing_scan_completed" },
    payload: {
      importBatchId: "imp_001",
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-05T12:03:00.000Z"
    }
  },
  {
    id: "evt_ing_import_completed",
    type: "ingestion.import.completed",
    version: 1,
    streamId: "ingestion_import_src_drive_001_scan_001_imp_001",
    sequence: 2,
    context: { ...context, causationId: "evt_ing_import_approved" },
    payload: {
      importBatchId: "imp_001",
      scanBatchId: "scan_001",
      sourceCollectionId: "src_drive_001",
      completedAt: "2026-07-05T12:04:00.000Z",
      totals: {
        evidenceCreated: 1,
        occurrencesLinked: 2,
        duplicatesReused: 1,
        skipped: 0
      }
    }
  },
  {
    id: "evt_ing_evidence_linked",
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: "ingestion_evidence_link_src_drive_001_scan_001_imp_001_1111111111111111111111111111111111111111111111111111111111111111",
    sequence: 1,
    context: { ...context, causationId: "evt_ing_import_approved" },
    payload: {
      evidenceId: "ev_ing_001",
      importBatchId: "imp_001",
      sourceCollectionId: "src_drive_001",
      contentHash: fixedHash,
      occurrenceIds: ["occ_001", "occ_002"]
    }
  },
  {
    id: "evt_ing_parse_created",
    type: "ingestion.parse.job.created",
    version: 1,
    streamId: "ingestion_parse_parse_001",
    sequence: 1,
    context: { ...context, causationId: "evt_ing_import_completed" },
    payload: {
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      lane: "local",
      parser: { name: "local-text", version: "0.1.0" },
      state: "queued"
    }
  },
  {
    id: "evt_ing_parse_completed",
    type: "ingestion.parse.completed",
    version: 1,
    streamId: "ingestion_parse_parse_001",
    sequence: 2,
    context: { ...context, causationId: "evt_ing_parse_created" },
    payload: {
      parseJobId: "parse_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      evidenceId: "ev_ing_001",
      lane: "local",
      parser: { name: "local-text", version: "0.1.0" },
      outputHash: fixedHash,
      outputMediaType: "text/plain",
      completedAt: "2026-07-05T12:05:00.000Z"
    }
  }
];
