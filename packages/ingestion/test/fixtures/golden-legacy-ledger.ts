import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";

const context: KnowledgeEvent["context"] = {
  actor: { id: "actor_system", kind: "system", label: "legacy fixture" },
  occurredAt: "2026-07-06T12:00:00.000Z",
  correlationId: "corr_legacy_fixture",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
};

const humanContext: KnowledgeEvent["context"] = {
  ...context,
  actor: { id: "actor_investigator", kind: "human", label: "Investigator" }
};

export const goldenLegacyLedgerEvents: KnowledgeEvent[] = [
  {
    id: "evt_legacy_source_registered",
    type: "ingestion.source.registered",
    version: 1,
    streamId: "ingestion_source_src_old_cestus",
    sequence: 1,
    context,
    payload: {
      sourceCollectionId: "src_old_cestus",
      label: "Old Cestus root",
      mode: "read-only",
      adapter: { name: "local-filesystem", version: "0.1.0" },
      rootUri: "file:///old-cestus",
      workspaceUri: "file:///portable-workspace"
    }
  },
  {
    id: "evt_legacy_scan_started",
    type: "ingestion.scan.started",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 1,
    context,
    payload: {
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      hashPolicy: "sha256-dry-run",
      startedAt: "2026-07-06T12:00:00.000Z"
    }
  },
  {
    id: "evt_legacy_occurrence",
    type: "ingestion.occurrence.observed",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 2,
    context,
    payload: {
      occurrenceId: "occ_legacy_claims",
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      contentHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      sourcePath: "ontology/claims.json",
      sizeBytes: 60,
      observedAt: "2026-07-06T12:01:00.000Z",
      status: "new",
      adapter: { name: "local-filesystem", version: "0.1.0" }
    }
  },
  {
    id: "evt_legacy_scan_completed",
    type: "ingestion.scan.completed",
    version: 1,
    streamId: "ingestion_scan_scan_old_cestus_001",
    sequence: 3,
    context,
    payload: {
      scanBatchId: "scan_old_cestus_001",
      sourceCollectionId: "src_old_cestus",
      completedAt: "2026-07-06T12:02:00.000Z",
      inventoryHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      totals: {
        observedFiles: 1,
        uniqueContent: 1,
        duplicateOccurrences: 0,
        skipped: 0,
        bytes: 60,
        estimatedNewBlobBytes: 60
      }
    }
  },
  {
    id: "evt_legacy_report",
    type: "legacy.import.report.generated",
    version: 1,
    streamId: "legacy_report_src_old_cestus_scan_old_cestus_001_legacy_report_001",
    sequence: 1,
    context,
    payload: {
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      generatedAt: "2026-07-06T12:03:00.000Z",
      generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
      totals: {
        inspectedFiles: 1,
        candidateMetadataFiles: 1,
        proposedAssertionCandidates: 1,
        quarantineEntries: 1,
        unresolvedReferences: 0
      }
    }
  },
  {
    id: "evt_legacy_quarantine_diag",
    type: "diagnostic.recorded",
    version: 1,
    streamId: "legacy_report_src_old_cestus_scan_old_cestus_001_legacy_report_001",
    sequence: 2,
    context,
    payload: {
      diagnosticId: "diag_legacy_quarantine",
      severity: "warning",
      category: "migration",
      message: "Legacy relationship record remained in migration report state.",
      repairHint: {
        contract: "legacy migration report",
        violatedPath: "candidateRelationships",
        allowedActions: ["Review candidate relationship before adding a strict candidate event contract."]
      }
    }
  },
  {
    id: "evt_legacy_staging",
    type: "legacy.ontology.staging.approved",
    version: 1,
    streamId: "legacy_staging_src_old_cestus_scan_old_cestus_001_legacy_stage_001",
    sequence: 1,
    context: humanContext,
    payload: {
      stagingBatchId: "legacy_stage_001",
      legacyReportId: "legacy_report_001",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      reportHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidateSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-06T12:05:00.000Z",
      approvedAssertionCandidateIds: ["legacy_candidate_001"]
    }
  }
];
