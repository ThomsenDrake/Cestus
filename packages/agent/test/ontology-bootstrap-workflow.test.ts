import { describe, expect, it } from "vitest";
import {
  buildOntologyBootstrapAgentReviewBundle,
  buildOntologyBootstrapDossierContextPack,
  hashOntologyBootstrapReviewBundle,
  toAgentOntologyBootstrapToolPreview
} from "../src/ontology-bootstrap-workflow.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";
import type { LegacyMigrationReport } from "../../ingestion/src/legacy-report.js";

const now = () => "2026-07-08T14:00:00.000Z";

describe("ontology bootstrap resident-agent review bundle", () => {
  it("builds a stable review bundle from an evidence-tied bootstrap dossier", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });

    expect(bundle.schemaVersion).toBe("agent-ontology-bootstrap-review.v1");
    expect(bundle.dossier.legacyReportId).toBe("legacy_report_001");
    expect(bundle.stagingReview.selectedCandidateIds).toEqual(["legacy_candidate_001"]);
    expect(bundle.candidateBundles[0]).toMatchObject({
      bundleId: "bootstrap_bundle_src_old_cestus_scan_old_cestus_001_0001",
      chunkId: "bootstrap_chunk_src_old_cestus_scan_old_cestus_001_0001",
      eligibleCount: 1,
      blockedCount: 1
    });
    expect(bundle.candidateBundles[0]?.candidates[0]).toMatchObject({
      candidateId: "legacy_candidate_001",
      status: "eligible",
      proposedAssertion: {
        predicate: "agency.name",
        object: "Example Agency",
        reviewState: "proposed-material"
      },
      evidenceRefs: [{
        evidenceId: "ev_legacy_claims",
        evidenceContentHash: expect.stringMatching(/^sha256:/),
        sourceCollectionId: "src_old_cestus"
      }],
      sourceArtifactHashes: expect.arrayContaining([
        bootstrapReportFixture.reportHash,
        bootstrapReportFixture.candidateSetHash
      ]),
      rationale: expect.stringContaining("parser"),
      alternatives: expect.any(Array),
      uncertainty: expect.any(String),
      blockedReasons: []
    });
    expect(hashOntologyBootstrapReviewBundle(bundle)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashOntologyBootstrapReviewBundle(buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    }))).toBe(hashOntologyBootstrapReviewBundle(bundle));
    expect(JSON.stringify(bundle)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("chunks candidate bundles with stable cursors for high-volume review", () => {
    const baseCandidate = bootstrapReportFixture.proposedAssertionCandidates[0];
    expect(baseCandidate).toBeDefined();
    if (baseCandidate === undefined) return;

    const report: LegacyMigrationReport = {
      ...bootstrapReportFixture,
      proposedAssertionCandidates: [
        ...bootstrapReportFixture.proposedAssertionCandidates,
        {
          ...baseCandidate,
          candidateId: "legacy_candidate_002",
          observationId: "legacy_observation_002",
          object: "Example Agency Alternative"
        }
      ]
    };
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001", "legacy_candidate_002"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews,
      maxCandidatesPerBundle: 1
    });

    expect(bundle.candidateBundles).toHaveLength(3);
    expect(bundle.candidateBundles.map((candidateBundle) => candidateBundle.cursor.currentOffset)).toEqual([0, 1, 2]);
    expect(bundle.candidateBundles[0]?.cursor.nextOffset).toBe(1);
    expect(bundle.candidateBundles[2]?.cursor.nextOffset).toBeUndefined();
    expect(new Set(bundle.candidateBundles.map((candidateBundle) => candidateBundle.bundleHash)).size).toBe(3);
  });

  it("creates a context pack ref bound to report, candidate set, and dossier hashes", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const contextPack = buildOntologyBootstrapDossierContextPack({
      generatedAt: now(),
      dossier: bootstrap.dossier,
      reviewBundleHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    });

    expect(contextPack.contextPackId).toBe("ontology-bootstrap-dossier.v1");
    expect(contextPack.provenanceRefs).toEqual(expect.arrayContaining([
      bootstrap.dossier.reportHash,
      bootstrap.dossier.candidateSetHash
    ]));
    expect(contextPack.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("maps ontology-bootstrap tool previews to agent-safe preview objects", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const toolPreview = bootstrap.toolPreviews[0];
    expect(toolPreview).toBeDefined();
    if (toolPreview === undefined) return;

    const preview = toAgentOntologyBootstrapToolPreview(toolPreview);

    expect(preview.summary).toContain("ontology staging approval");
    expect(preview.bootstrapPreviewHash).toMatch(/^sha256:/);
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      { kind: "legacy-report", id: "legacy_report_001", hash: bootstrapReportFixture.reportHash },
      { kind: "candidate-set", id: "legacy_report_001", hash: bootstrapReportFixture.candidateSetHash },
      { kind: "legacy-candidate", id: "legacy_candidate_001" }
    ]));
    expect(JSON.stringify(preview)).not.toMatch(/api key|authorization|bearer|password|secret/i);
  });

  it("rejects invalid agent IDs and unsafe staging previews", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    expect(() => buildOntologyBootstrapAgentReviewBundle({
      runId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    })).toThrow();

    const toolPreview = bootstrap.toolPreviews[0];
    expect(toolPreview).toBeDefined();
    if (toolPreview === undefined) return;

    expect(() => toAgentOntologyBootstrapToolPreview({
      ...toolPreview,
      evidenceRefs: []
    })).toThrow(/Evidence ref is required/);

    expect(() => toAgentOntologyBootstrapToolPreview({
      ...toolPreview,
      allowedEventTypes: ["assertion.accepted"]
    })).toThrow();
  });
});
