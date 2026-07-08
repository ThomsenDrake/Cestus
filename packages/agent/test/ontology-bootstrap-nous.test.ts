import { describe, expect, it } from "vitest";
import {
  buildOntologyBootstrapAgentReviewBundle
} from "../src/ontology-bootstrap-workflow.js";
import {
  buildOntologyBootstrapNousPrompt,
  validateOntologyBootstrapNousMemo
} from "../src/ontology-bootstrap-nous.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";

const now = () => "2026-07-08T15:00:00.000Z";

describe("ontology bootstrap Nous prompt helpers", () => {
  it("builds a raw-content-free prompt from safe dossier metadata", () => {
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

    const prompt = buildOntologyBootstrapNousPrompt({ bundle });

    expect(prompt).toContain("ontology-bootstrap");
    expect(prompt).toContain("legacy_report_001");
    expect(prompt).toContain("legacy_candidate_001");
    expect(prompt).toContain(bootstrapReportFixture.reportHash);
    expect(prompt).not.toMatch(/api key|authorization|bearer|password|secret/i);
    expect(prompt).not.toContain("{\"legacyCestusType\"");
  });

  it("validates a bounded model memo without treating it as ontology truth", () => {
    const memo = validateOntologyBootstrapNousMemo([
      "Review note: prioritize the eligible candidate batch and inspect malformed quarantine first.",
      "No accepted graph events are authorized by this memo."
    ].join("\n"));

    expect(memo.summary).toContain("prioritize");
    expect(memo.allowedUse).toBe("review-note-only");
    expect(JSON.stringify(memo)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("rejects model memo text that tries to authorize graph truth", () => {
    expect(() => validateOntologyBootstrapNousMemo(
      "Review note: record assertion.accepted now because the old graph says it is true."
    )).toThrow();
  });
});
