import { describe, expect, it } from "vitest";
import {
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  validateProductionSpecialistProviderOutput
} from "../src/production-specialist-prompts.js";

describe("production specialist prompt registrations", () => {
  it("registers exactly the six approved production templates", () => {
    expect(productionSpecialistPromptRegistrations.map((registration) => registration.promptTemplateId)).toEqual([
      "prr-negotiation.review.v1",
      "evidence-triage.classify.v1",
      "timeline-builder.sourced-timeline.v1",
      "contradiction-finder.candidates.v1",
      "investigation-planner.next-steps.v1",
      "report-builder.packet-draft.v1"
    ]);
    for (const registration of productionSpecialistPromptRegistrations) {
      expect(registration.promptTemplateVersion).toBe(1);
      expect(registration.rendererVersion).toBe(1);
      expect(registration.providerOutputSchemaVersion).toBe(1);
      expect(registration.handoffSchemaVersion).toBe(1);
      expect(registration.safetyClass).toBe("provider-approved");
      expect(registration.transferApprovalClass).toBe("provider-byte-transfer");
      expect(registration.rendererHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("keeps renderer hashes stable across registration lookups", () => {
    expect(productionSpecialistPromptRegistrations.map((registration) => registration.rendererHash)).toEqual(
      productionSpecialistPromptRegistrations.map((registration) => productionSpecialistPromptRegistrationFor(registration.runType).rendererHash)
    );
  });

  it("requires selected PRR context only where the approved spec requires it", () => {
    const prr = productionSpecialistPromptRegistrationFor("prr-negotiation");
    expect(prr.contextRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ contextPackId: "prr-read-model.v1", requirementMode: "always" }),
      expect.objectContaining({ contextPackId: "jurisdiction-pack-summary.v1", requirementMode: "always" })
    ]));

    for (const runType of ["evidence-triage", "timeline-builder", "contradiction-finder", "investigation-planner", "report-builder"] as const) {
      const registration = productionSpecialistPromptRegistrationFor(runType);
      expect(registration.contextRequirements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextPackId: "prr-read-model.v1",
          requirementMode: "when-scope-associated-prr",
          omissionWhenNotApplicable: "no-associated-prr"
        })
      ]));
    }
  });

  it("validates untrusted provider output without blanket rejecting narrative command-like evidence text", () => {
    const parsed = validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Imported command policy evidence needs review.",
        safeSummaries: ["Public instructions mention curl as evidence text, not an action."],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    });
    expect(parsed.runType).toBe("evidence-triage");
  });

  it("rejects narrative completed-effect claims in every representative reference schema", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "prr-negotiation",
      value: {
        draftSummary: "Review the request before any follow-up.",
        requestFollowUpApproval: false,
        citedRuleRefs: ["The agency sent the response"],
        deadlineNotes: [],
        feeOrStallingSignals: [],
        unresolvedQuestions: []
      }
    })).toThrow(/reference|authority|external effect/i);

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "timeline-builder",
      value: {
        timelineItems: [{
          itemId: "timeline_001",
          date: "2026-07-10",
          precision: "day",
          evidenceRefs: ["The evidence was exported"],
          assertionRefs: [],
          prrEventRefs: [],
          summary: "Evidence is available for review.",
          uncertaintyCategories: []
        }],
        omissionReasons: [],
        unresolvedPrompts: []
      }
    })).toThrow(/reference|authority|external effect/i);

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "contradiction-finder",
      value: {
        candidates: [{
          candidateId: "contradiction_001",
          comparedSourceRefs: ["The legal escalation completed", "ev_report_001"],
          evidenceIds: [],
          evidenceContentHashes: [],
          assertionIds: [],
          timelineItemIds: [],
          category: "direct-conflict",
          confidence: 0.5,
          rationale: "The sources disagree.",
          alternativeExplanations: [],
          requiredReviewerAction: "review"
        }]
      }
    })).toThrow(/reference|authority|external effect/i);

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "investigation-planner",
      value: {
        planSummary: "Review the open leads.",
        objectiveRefs: ["The report was published"],
        gapIds: [],
        taskCandidates: [],
        prrDraftCandidates: []
      }
    })).toThrow(/reference|authority|external effect/i);
  });

  it("accepts canonical identifiers in reference fields while rejecting authority claims in narrative fields", () => {
    expect(validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_001",
        outlineRefs: ["outline_report-001"],
        draftSectionRefs: ["section_report-001"],
        citationMapRefs: ["citation_map-001"],
        includedEvidenceIds: ["ev_report_001"],
        excludedEvidenceIds: [],
        governancePolicyRefs: ["policy_governance-001"],
        sensitiveOptInRequirements: [],
        legalReviewFlags: [],
        exportPublicationApprovalRefs: ["approval_export-001"],
        packetSummary: "This is a draft packet for review."
      }
    }).runType).toBe("report-builder");

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Evidence needs review.",
        safeSummaries: ["Provider byte-transfer approved."],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    })).toThrow(/authority|external effect|ontology/i);
  });

  it("rejects provider output that claims external effects or accepted ontology truth", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_unsafe_001",
        outlineRefs: ["The report was published"],
        draftSectionRefs: [],
        citationMapRefs: [],
        includedEvidenceIds: [],
        excludedEvidenceIds: [],
        governancePolicyRefs: [],
        sensitiveOptInRequirements: [],
        legalReviewFlags: [],
        exportPublicationApprovalRefs: [],
        packetSummary: "The report was published and the accepted graph was updated."
      }
    })).toThrow(/authority|external effect|ontology/i);
  });

  it("rejects equivalent completed-effect and authority claims", () => {
    for (const claim of [
      "The PRR response was sent.",
      "The PRR response was emailed.",
      "Legal escalation was completed.",
      "The report packet was published.",
      "The repair was performed.",
      "The lock was cleared.",
      "The entity was resolved.",
      "The ontology is now accepted.",
      "Provider byte transfer is approved.",
      "A human approved the provider byte transfer.",
      "The request was filed."
    ]) {
      expect(() => validateProductionSpecialistProviderOutput({
        runType: "evidence-triage",
        value: {
          dossierSummary: "Evidence needs review.",
          safeSummaries: [claim],
          governanceFlags: [],
          duplicateGroups: [],
          evidenceGaps: [],
          assertionCandidates: [],
          requestProviderParseApproval: false,
          requestGovernanceReview: false,
          requestQuarantineReview: false,
          requestAssertionProposalReview: false
        }
      })).toThrow(/authority|external effect|ontology/i);
    }
  });

  it("rejects normalized authority variants across narrative, identifier, and reference fields", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "The PRR was filed.",
        safeSummaries: ["The provider byte transfer was human-approved."],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    })).toThrow(/authority|external effect|ontology/i);

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_prr_was_emailed",
        outlineRefs: ["Legal escalation was performed."],
        draftSectionRefs: [],
        citationMapRefs: [],
        includedEvidenceIds: [],
        excludedEvidenceIds: [],
        governancePolicyRefs: [],
        sensitiveOptInRequirements: [],
        legalReviewFlags: [],
        exportPublicationApprovalRefs: [],
        packetSummary: "This remains a draft packet for review."
      }
    })).toThrow(/authority|external effect|ontology/i);
  });

  it("allows command-like narrative evidence that does not claim a completed effect", () => {
    expect(validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "The policy instructs staff to send a PRR response only after review.",
        safeSummaries: ["The evidence describes the steps for filing a request and makes no execution claim."],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    }).runType).toBe("evidence-triage");
  });

  it("rejects completed-effect nominalizations in narrative fields", () => {
    for (const claim of [
      "The PRR delivery was completed.",
      "The PRR submission was completed.",
      "The publication was completed.",
      "The entity resolution was completed.",
      "The lock clearing was completed."
    ]) {
      expect(() => validateProductionSpecialistProviderOutput({
        runType: "evidence-triage",
        value: {
          dossierSummary: "Evidence needs review.",
          safeSummaries: [claim],
          governanceFlags: [],
          duplicateGroups: [],
          evidenceGaps: [],
          assertionCandidates: [],
          requestProviderParseApproval: false,
          requestGovernanceReview: false,
          requestQuarantineReview: false,
          requestAssertionProposalReview: false
        }
      })).toThrow(/authority|external effect|ontology/i);
    }
  });

  it("rejects raw provider errors and hidden local paths in narrative fields", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Provider error 429 from /home/user/provider-response.json",
        safeSummaries: [],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    })).toThrow(/provider error|hidden local path/i);
  });

  it("rejects broader provider diagnostics and local path forms without rejecting public URLs", () => {
    for (const unsafeNarrative of [
      "OpenAI API returned HTTP 429 rate limit exceeded",
      "file:///home/user/provider-response.json",
      "C:\\Users\\user\\provider-response.json"
    ]) {
      expect(() => validateProductionSpecialistProviderOutput({
        runType: "evidence-triage",
        value: {
          dossierSummary: unsafeNarrative,
          safeSummaries: [],
          governanceFlags: [],
          duplicateGroups: [],
          evidenceGaps: [],
          assertionCandidates: [],
          requestProviderParseApproval: false,
          requestGovernanceReview: false,
          requestQuarantineReview: false,
          requestAssertionProposalReview: false
        }
      })).toThrow(/provider error|hidden local path/i);
    }

    expect(validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Public evidence is available at https://example.org/report.pdf.",
        safeSummaries: [],
        governanceFlags: [],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    }).runType).toBe("evidence-triage");
  });

  it("requires normalized safe dates for timeline ranges", () => {
    const timeline = (start: string, end: string) => validateProductionSpecialistProviderOutput({
      runType: "timeline-builder",
      value: {
        timelineItems: [{
          itemId: "timeline_range_001",
          dateRange: { start, end },
          precision: "range",
          evidenceRefs: ["ev_report_001"],
          assertionRefs: [],
          prrEventRefs: [],
          summary: "The date range remains subject to source review.",
          uncertaintyCategories: []
        }],
        omissionReasons: [],
        unresolvedPrompts: []
      }
    });

    expect(timeline("2026-01", "2026-02-03").runType).toBe("timeline-builder");
    expect(() => timeline("sk-live-secret", "2026-02-03")).toThrow();
    expect(() => timeline("The report was published", "2026-02-03")).toThrow();
  });

  it("applies secret and authority validation to identifier fields", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Evidence needs review.",
        safeSummaries: [],
        governanceFlags: [{ evidenceId: "ev_sk-live-secret", tag: "review", confidence: 0.5, rationale: "Review the evidence." }],
        duplicateGroups: [],
        evidenceGaps: [],
        assertionCandidates: [],
        requestProviderParseApproval: false,
        requestGovernanceReview: false,
        requestQuarantineReview: false,
        requestAssertionProposalReview: false
      }
    })).toThrow(/secret-safe/i);

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_report_was_published",
        outlineRefs: [],
        draftSectionRefs: [],
        citationMapRefs: [],
        includedEvidenceIds: [],
        excludedEvidenceIds: [],
        governancePolicyRefs: [],
        sensitiveOptInRequirements: [],
        legalReviewFlags: [],
        exportPublicationApprovalRefs: [],
        packetSummary: "This is a draft packet for review."
      }
    })).toThrow(/authority|external effect|ontology/i);
  });
});
