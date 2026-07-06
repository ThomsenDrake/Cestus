import { describe, expect, it } from "vitest";
import {
  validateKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { buildLegacyImportProjection } from "../src/legacy-projection.js";
import { goldenLegacyLedgerEvents } from "./fixtures/golden-legacy-ledger.js";

const context: KnowledgeEvent["context"] = {
  actor: { id: "actor_system", kind: "system", label: "legacy projection test" },
  occurredAt: "2026-07-06T12:10:00.000Z",
  correlationId: "corr_legacy_projection_test",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
};

const humanContext: KnowledgeEvent["context"] = {
  ...context,
  actor: { id: "actor_investigator", kind: "human", label: "Investigator" }
};

const reportStreamId = "legacy_report_src_a_scan_b_scan_c_legacy_report_d";
const stagingStreamId = "legacy_staging_src_a_scan_b_scan_c_legacy_stage_d";

describe("buildLegacyImportProjection", () => {
  it("rebuilds report, staging approval, and diagnostics", () => {
    for (const event of goldenLegacyLedgerEvents) {
      expect(validateKnowledgeEvent(event).success, event.type).toBe(true);
    }

    const projection = buildLegacyImportProjection(goldenLegacyLedgerEvents);

    expect(projection.reports.get("legacy_report_001")?.candidateSetHash).toBe(
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );
    expect(projection.latestReportBySource.get("src_old_cestus")).toBe("legacy_report_001");
    expect(projection.stagingApprovals.get("legacy_stage_001")?.approvedAssertionCandidateIds).toEqual([
      "legacy_candidate_001"
    ]);
    expect(projection.diagnosticsBySourceCollectionId.get("src_old_cestus")).toEqual(["diag_legacy_quarantine"]);
  });

  it("uses validated report stream mappings when component IDs contain underscores", () => {
    const report = reportGeneratedEvent();
    const diagnostic = diagnosticRecordedEvent(
      "evt_legacy_report_underscore_diag",
      reportStreamId,
      "diag_legacy_report_underscore"
    );

    expect(validateKnowledgeEvent(report).success, report.type).toBe(true);
    expect(validateKnowledgeEvent(diagnostic).success, diagnostic.type).toBe(true);

    const projection = buildLegacyImportProjection([report, diagnostic]);

    expect(projection.diagnosticsBySourceCollectionId.get("src_a")).toEqual(["diag_legacy_report_underscore"]);
    expect(projection.diagnostics.get("diag_legacy_report_underscore")).toMatchObject({
      sourceCollectionId: "src_a",
      scanBatchId: "scan_b_scan_c",
      legacyReportId: "legacy_report_d"
    });
    expect(projection.diagnosticsBySourceCollectionId.has("src_a_scan_b")).toBe(false);
  });

  it("uses validated staging stream mappings when component IDs contain underscores", () => {
    const staging = stagingApprovedEvent();
    const diagnostic = diagnosticRecordedEvent(
      "evt_legacy_staging_underscore_diag",
      stagingStreamId,
      "diag_legacy_staging_underscore"
    );

    expect(validateKnowledgeEvent(staging).success, staging.type).toBe(true);
    expect(validateKnowledgeEvent(diagnostic).success, diagnostic.type).toBe(true);

    const projection = buildLegacyImportProjection([staging, diagnostic]);

    expect(projection.diagnosticsBySourceCollectionId.get("src_a")).toEqual(["diag_legacy_staging_underscore"]);
    expect(projection.diagnostics.get("diag_legacy_staging_underscore")).toMatchObject({
      sourceCollectionId: "src_a",
      scanBatchId: "scan_b_scan_c",
      stagingBatchId: "legacy_stage_d"
    });
    expect(projection.diagnosticsBySourceCollectionId.has("src_a_scan_b")).toBe(false);
  });

  it("records unmapped ambiguous legacy stream diagnostics without guessing a source", () => {
    const diagnostic = diagnosticRecordedEvent(
      "evt_legacy_unmapped_ambiguous_diag",
      reportStreamId,
      "diag_legacy_unmapped_ambiguous"
    );

    const projection = buildLegacyImportProjection([diagnostic]);

    expect(projection.diagnostics.get("diag_legacy_unmapped_ambiguous")).toMatchObject({
      diagnosticId: "diag_legacy_unmapped_ambiguous",
      streamId: reportStreamId
    });
    expect(projection.diagnostics.get("diag_legacy_unmapped_ambiguous")).not.toHaveProperty("sourceCollectionId");
    expect(projection.diagnosticsBySourceCollectionId.has("src_a")).toBe(false);
    expect(projection.diagnosticsBySourceCollectionId.has("src_a_scan_b")).toBe(false);
  });
});

function reportGeneratedEvent(): KnowledgeEventOf<"legacy.import.report.generated"> {
  return {
    id: "evt_legacy_report_underscore",
    type: "legacy.import.report.generated",
    version: 1,
    streamId: reportStreamId,
    sequence: 1,
    context,
    payload: {
      legacyReportId: "legacy_report_d",
      sourceCollectionId: "src_a",
      scanBatchId: "scan_b_scan_c",
      reportHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      candidateSetHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      generatedAt: "2026-07-06T12:10:00.000Z",
      generator: { name: "legacy-cestus-inspector", version: "0.1.0" },
      totals: {
        inspectedFiles: 1,
        candidateMetadataFiles: 1,
        proposedAssertionCandidates: 1,
        quarantineEntries: 0,
        unresolvedReferences: 0
      }
    }
  };
}

function stagingApprovedEvent(): KnowledgeEventOf<"legacy.ontology.staging.approved"> {
  return {
    id: "evt_legacy_staging_underscore",
    type: "legacy.ontology.staging.approved",
    version: 1,
    streamId: stagingStreamId,
    sequence: 1,
    context: humanContext,
    payload: {
      stagingBatchId: "legacy_stage_d",
      legacyReportId: "legacy_report_d",
      sourceCollectionId: "src_a",
      scanBatchId: "scan_b_scan_c",
      reportHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      candidateSetHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-06T12:11:00.000Z",
      approvedAssertionCandidateIds: ["legacy_candidate_d"]
    }
  };
}

function diagnosticRecordedEvent(
  id: string,
  streamId: string,
  diagnosticId: string
): KnowledgeEventOf<"diagnostic.recorded"> {
  return {
    id,
    type: "diagnostic.recorded",
    version: 1,
    streamId,
    sequence: 2,
    context,
    payload: {
      diagnosticId,
      severity: "warning",
      category: "migration",
      message: "Legacy diagnostic remained in migration review state.",
      repairHint: {
        contract: "legacy projection",
        violatedPath: "streamId",
        allowedActions: ["Review mapped report or staging event before source indexing."]
      }
    }
  };
}
