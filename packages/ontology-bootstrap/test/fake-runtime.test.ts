import { describe, expect, it } from "vitest";
import { runFakeOntologyBootstrapSpecialist } from "../src/fake-runtime.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("runFakeOntologyBootstrapSpecialist", () => {
  it("returns a dossier and tool previews without model calls or side effects", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dossier.phase).toBe("staging-review");
    expect(result.toolPreviews.map((preview) => preview.toolId)).toEqual([
      "legacy.staging.approval.request"
    ]);
    expect(result.toolPreviews[0]?.evidenceRefs[0]?.evidenceId).toBe("ev_legacy_claims");
    expect(result.sideEffects).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/);
  });

  it("returns a safe failure when no report is present", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: [],
      selectedCandidateIds: [],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "legacy-report-required",
        message: "A legacy migration report is required before ontology bootstrap.",
        allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
      }
    });
  });

  it("returns a safe failure when launch source and report source disagree", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: {
        ...bootstrapReportFixture,
        sourceCollectionId: "src_other_collection"
      },
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "legacy-report-mismatch",
        message: "Legacy report identity does not match the ontology bootstrap launch context.",
        allowedRepairActions: ["select the matching legacy report", "refresh the legacy review projection"]
      }
    });
  });

  it("returns a safe failure when review latest report id disagrees with the report", () => {
    const result = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: "legacy_report_other"
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-07T23:00:00.000Z"
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        code: "legacy-report-mismatch",
        message: "Legacy report identity does not match the ontology bootstrap launch context.",
        allowedRepairActions: ["select the matching legacy report", "refresh the legacy review projection"]
      }
    });
  });
});
