import { describe, expect, it } from "vitest";
import {
  ontologyBootstrapDossierSchema,
  ontologyBootstrapFailureSchema,
  ontologyBootstrapPhaseSchema,
  ontologyBootstrapToolPreviewSchema
} from "../src/contracts.js";

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("ontology bootstrap contracts", () => {
  it("accepts a strict evidence-tied bootstrap dossier", () => {
    const dossier = ontologyBootstrapDossierSchema.parse({
      schemaVersion: "ontology-bootstrap.v1",
      dossierId: "bootstrap_dossier_src_old_cestus_001",
      generatedAt: "2026-07-07T22:00:00.000Z",
      phase: "staging-review",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      legacyReportId: "legacy_report_001",
      reportHash: hash,
      candidateSetHash: hash,
      summary: {
        evidenceFiles: 2,
        importedEvidenceFiles: 1,
        parserDetections: 1,
        eligibleAssertionCandidates: 1,
        blockedAssertionCandidates: 1,
        quarantineEntries: 1,
        localExtensionSuggestions: 0
      },
      evidenceInventory: [
        {
          sourcePath: "ontology/claims.json",
          contentHash: hash,
          mediaType: "application/json",
          sizeBytes: 128,
          imported: true,
          evidenceId: "ev_legacy_claims"
        }
      ],
      parserConfidence: [
        {
          pluginName: "legacy-json-claim-parser",
          pluginVersion: "0.1.0",
          shape: "json-legacy-metadata",
          sourcePath: "ontology/claims.json",
          confidence: 0.8,
          parserEligible: true
        }
      ],
      quarantineGroups: [
        {
          issueCategory: "malformed",
          count: 1,
          sourcePaths: ["ontology/corrupt.json"],
          repairActions: ["Review the legacy claims metadata shape."]
        }
      ],
      candidateBatches: [
        {
          batchId: "bootstrap_batch_eligible",
          label: "Eligible assertion candidates",
          readiness: "eligible",
          candidates: [
            {
              candidateId: "legacy_candidate_001",
              observationId: "legacy_observation_001",
              evidenceContentHash: hash,
              evidenceId: "ev_legacy_claims",
              sourcePath: "ontology/claims.json",
              predicate: "agency.name",
              object: "Example Agency",
              confidence: 0.8,
              provenance: {
                legacyReportId: "legacy_report_001",
                reportHash: hash,
                candidateSetHash: hash,
                sourceCollectionId: "src_old_cestus",
                scanBatchId: "scan_old_cestus_001"
              }
            }
          ]
        }
      ],
      reportOnlyNotes: [
        {
          noteId: "bootstrap_note_relationships",
          kind: "candidate-relationship",
          message: "Legacy relationship material remains report-only until a reviewed candidate contract exists.",
          sourceRefs: ["legacy_report_001"]
        }
      ],
      questions: [
        {
          questionId: "bootstrap_question_review_batch",
          prompt: "Which candidate batch should move to staging review?",
          reason: "Eligible candidates need human staging approval before assertion proposals.",
          relatedRefs: ["legacy_candidate_001"]
        }
      ],
      localExtensionSuggestions: [],
      nextSafeAction: {
        actionId: "bootstrap_action_approve_staging",
        label: "Approve selected staging candidates",
        kind: "request-tool",
        effect: "ledger-review"
      },
      provenanceRefs: ["evt_legacy_report_001"]
    });

    expect(dossier.phase).toBe("staging-review");
    expect(Object.isFrozen(dossier)).toBe(false);
  });

  it("rejects unknown fields and secret-shaped text", () => {
    expect(() =>
      ontologyBootstrapFailureSchema.parse({
        code: "secret-detected",
        message: "token=abc123",
        allowedRepairActions: ["review safe diagnostics"]
      })
    ).toThrow(/secret-safe/i);

    expect(() => ontologyBootstrapPhaseSchema.parse("accepted-graph-import")).toThrow();

    expect(() =>
      ontologyBootstrapFailureSchema.parse({
        code: "projection-lag",
        message: "Projection has not caught up to the report event.",
        allowedRepairActions: ["Refresh the legacy review projection."],
        rawLegacyTruth: true
      })
    ).toThrow();
  });

  it("rejects tool previews for accepted graph events", () => {
    expect(() =>
      ontologyBootstrapToolPreviewSchema.parse({
        previewId: "bootstrap_preview_bad",
        toolId: "legacy.staging.execute",
        effect: "ledger-proposal",
        previewHash: hash,
        summary: "Attempt accepted graph write.",
        sourceCollectionId: "src_old_cestus",
        legacyReportId: "legacy_report_001",
        reportHash: hash,
        candidateSetHash: hash,
        selectedCandidateIds: ["legacy_candidate_001"],
        allowedEventTypes: ["assertion.proposed", "assertion.accepted"],
        requiresHumanApproval: true
      })
    ).toThrow(/accepted graph/i);
  });
});
