import { describe, expect, it } from "vitest";
import {
  createRawImportApprovalPreview,
  createStagingApprovalPreview,
  createStagingExecutionPreview
} from "../src/tool-previews.js";
import { bootstrapReportFixture, metadataHash, rawHash } from "./fixtures/bootstrap-fixtures.js";

describe("ontology bootstrap tool previews", () => {
  const emptyReport = {
    ...bootstrapReportFixture,
    candidateSetHash: "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" as const,
    proposedAssertionCandidates: [],
    totals: {
      ...bootstrapReportFixture.totals,
      proposedAssertionCandidates: 0
    }
  };

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

  it("builds exact empty staging approval and execution previews only for an empty report", () => {
    const approval = createStagingApprovalPreview({
      report: emptyReport,
      stagingBatchId: "legacy_stage_empty",
      selectedCandidateIds: [],
      evidenceRefs: []
    });
    const execution = createStagingExecutionPreview({
      report: emptyReport,
      stagingBatchId: "legacy_stage_empty",
      selectedCandidateIds: []
    });

    expect(approval).toMatchObject({
      toolId: "legacy.staging.approval.request",
      selectedCandidateIds: [],
      evidenceRefs: [],
      requiresHumanApproval: true
    });
    expect(execution).toMatchObject({
      toolId: "legacy.staging.execute",
      selectedCandidateIds: [],
      allowedEventTypes: ["assertion.proposed"]
    });
  });

  it("rejects empty staging previews when the report contains any candidate", () => {
    expect(() =>
      createStagingApprovalPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_nonempty",
        selectedCandidateIds: [],
        evidenceRefs: []
      })
    ).toThrow(/candidate/i);
    expect(() =>
      createStagingExecutionPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_nonempty",
        selectedCandidateIds: []
      })
    ).toThrow(/candidate/i);
  });

  it("rejects staging approval for selected candidates that are absent from the report", () => {
    expect(() =>
      createStagingApprovalPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: ["legacy_candidate_999"],
        evidenceRefs: [
          {
            candidateId: "legacy_candidate_999",
            evidenceId: "ev_legacy_claims",
            evidenceContentHash: metadataHash
          }
        ]
      })
    ).toThrow(/report/i);
  });

  it("rejects staging approval when evidence content hash differs from the report candidate", () => {
    expect(() =>
      createStagingApprovalPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        evidenceRefs: [
          {
            candidateId: "legacy_candidate_001",
            evidenceId: "ev_legacy_claims",
            evidenceContentHash: rawHash
          }
        ]
      })
    ).toThrow(/content hash/i);
  });

  it("rejects staging approval evidence refs for unselected candidates", () => {
    expect(() =>
      createStagingApprovalPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        evidenceRefs: [
          {
            candidateId: "legacy_candidate_001",
            evidenceId: "ev_legacy_claims",
            evidenceContentHash: metadataHash
          },
          {
            candidateId: "legacy_candidate_missing",
            evidenceId: "ev_legacy_contract",
            evidenceContentHash: rawHash
          }
        ]
      })
    ).toThrow(/selected/i);
  });

  it("rejects staging execution for selected candidates that are absent from the report", () => {
    expect(() =>
      createStagingExecutionPreview({
        report: bootstrapReportFixture,
        stagingBatchId: "legacy_stage_001",
        selectedCandidateIds: ["legacy_candidate_999"]
      })
    ).toThrow(/report/i);
  });
});
