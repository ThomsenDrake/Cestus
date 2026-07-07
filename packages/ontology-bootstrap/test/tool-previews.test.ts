import { describe, expect, it } from "vitest";
import {
  createRawImportApprovalPreview,
  createStagingApprovalPreview,
  createStagingExecutionPreview
} from "../src/tool-previews.js";
import { bootstrapReportFixture, metadataHash } from "./fixtures/bootstrap-fixtures.js";

describe("ontology bootstrap tool previews", () => {
  it("builds preview hashes from exact raw import identity", () => {
    const preview = createRawImportApprovalPreview({
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      legacyReportId: "legacy_report_001",
      reportHash: bootstrapReportFixture.reportHash
    });

    expect(preview).toMatchObject({
      toolId: "legacy.raw-import.approval.request",
      effect: "ledger-review",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      requiresHumanApproval: true,
      allowedEventTypes: []
    });
    expect(preview.previewHash).toMatch(/^sha256:/);
    expect(preview.summary).toMatch(/does not copy bytes or stage ontology assertions/i);
  });

  it("binds staging approval to selected candidate ids, evidence ids, and candidate-set hash", () => {
    const preview = createStagingApprovalPreview({
      report: bootstrapReportFixture,
      stagingBatchId: "legacy_stage_001",
      selectedCandidateIds: ["legacy_candidate_001"],
      evidenceRefs: [
        {
          candidateId: "legacy_candidate_001",
          evidenceId: "ev_legacy_claims",
          evidenceContentHash: metadataHash
        }
      ]
    });

    expect(preview).toMatchObject({
      toolId: "legacy.staging.approval.request",
      effect: "ledger-review",
      stagingBatchId: "legacy_stage_001",
      selectedCandidateIds: ["legacy_candidate_001"],
      allowedEventTypes: [],
      evidenceRefs: [
        {
          candidateId: "legacy_candidate_001",
          evidenceId: "ev_legacy_claims",
          evidenceContentHash: metadataHash
        }
      ]
    });
    expect(preview.candidateSetHash).toBe(bootstrapReportFixture.candidateSetHash);
    expect(JSON.stringify(preview)).toContain("ev_legacy_claims");
  });

  it("limits staging execution previews to assertion.proposed", () => {
    const preview = createStagingExecutionPreview({
      report: bootstrapReportFixture,
      stagingBatchId: "legacy_stage_001",
      selectedCandidateIds: ["legacy_candidate_001"]
    });

    expect(preview.allowedEventTypes).toEqual(["assertion.proposed"]);
    expect(JSON.stringify(preview)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/);
    expect(() =>
      createStagingExecutionPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: []
      })
    ).toThrow(/candidate/i);
  });
});
