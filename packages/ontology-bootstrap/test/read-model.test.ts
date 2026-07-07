import { describe, expect, it } from "vitest";
import { buildOntologyBootstrapReadiness } from "../src/read-model.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("buildOntologyBootstrapReadiness", () => {
  it("blocks on missing reports without guessing from legacy paths", () => {
    const readiness = buildOntologyBootstrapReadiness({
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: []
    });

    expect(readiness).toMatchObject({
      sourceCollectionId: "src_old_cestus",
      phase: "report-required",
      eligibleCandidateCount: 0,
      blockedCandidateCount: 0,
      failures: [
        {
          code: "legacy-report-required",
          message: "A legacy migration report is required before ontology bootstrap.",
          allowedRepairActions: ["run legacy inspect", "review the first artifact ask"]
        }
      ]
    });
    expect(readiness.latestReportId).toBeUndefined();
  });

  it("reports staging review counts from a verified report and same-source evidence links", () => {
    const readiness = buildOntologyBootstrapReadiness({
      sourceCollectionId: "src_old_cestus",
      review: bootstrapReviewFixture,
      report: bootstrapReportFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture
    });

    expect(readiness.phase).toBe("staging-review");
    expect(readiness.latestReportId).toBe("legacy_report_001");
    expect(readiness.eligibleCandidateCount).toBe(1);
    expect(readiness.blockedCandidateCount).toBe(1);
    expect(readiness.failures).toEqual([]);
  });
});
