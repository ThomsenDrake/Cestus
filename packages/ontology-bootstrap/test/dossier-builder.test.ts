import { describe, expect, it } from "vitest";
import { buildOntologyBootstrapDossier } from "../src/dossier-builder.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "./fixtures/bootstrap-fixtures.js";

describe("buildOntologyBootstrapDossier", () => {
  it("groups eligible candidates only when evidence is linked from the same source collection", () => {
    const dossier = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      now: () => "2026-07-07T22:30:00.000Z"
    });

    expect(dossier.phase).toBe("staging-review");
    expect(dossier.summary).toMatchObject({
      evidenceFiles: 2,
      importedEvidenceFiles: 1,
      eligibleAssertionCandidates: 1,
      blockedAssertionCandidates: 1,
      quarantineEntries: 1
    });
    expect(dossier.candidateBatches).toHaveLength(2);
    expect(dossier.candidateBatches[0]?.readiness).toBe("eligible");
    expect(dossier.candidateBatches[0]?.candidates[0]).toMatchObject({
      candidateId: "legacy_candidate_001",
      evidenceId: "ev_legacy_claims"
    });
    expect(dossier.candidateBatches[1]?.readiness).toBe("blocked");
    expect(JSON.stringify(dossier)).not.toContain("ev_other_source");
  });

  it("is deterministic for the same inputs and marks staging-approved dossiers ready to stage", () => {
    const first = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: { ...bootstrapReviewFixture, ontologyStagingApproved: true },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      now: () => "2026-07-07T22:30:00.000Z"
    });
    const second = buildOntologyBootstrapDossier({
      report: bootstrapReportFixture,
      review: { ...bootstrapReviewFixture, ontologyStagingApproved: true },
      evidenceLinks: [...bootstrapEvidenceLinksFixture].reverse(),
      now: () => "2026-07-07T22:30:00.000Z"
    });

    expect(first.phase).toBe("ready-to-stage");
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });

  it("rejects review source mismatches before building a dossier", () => {
    expect(() =>
      buildOntologyBootstrapDossier({
        report: bootstrapReportFixture,
        review: {
          ...bootstrapReviewFixture,
          sourceCollectionId: "src_other_collection",
          ontologyStagingApproved: true
        },
        evidenceLinks: bootstrapEvidenceLinksFixture,
        now: () => "2026-07-07T23:00:00.000Z"
      })
    ).toThrow(/legacy report identity/i);
  });

  it("rejects latest report id mismatches before building a dossier", () => {
    expect(() =>
      buildOntologyBootstrapDossier({
        report: bootstrapReportFixture,
        review: {
          ...bootstrapReviewFixture,
          latestReportId: "legacy_report_other",
          ontologyStagingApproved: true
        },
        evidenceLinks: bootstrapEvidenceLinksFixture,
        now: () => "2026-07-07T23:00:00.000Z"
      })
    ).toThrow(/legacy report identity/i);
  });
});
