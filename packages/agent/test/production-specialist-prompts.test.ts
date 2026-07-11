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

  it("rejects provider output that claims external effects or accepted ontology truth", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_unsafe_001",
        outlineRefs: [],
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
});
