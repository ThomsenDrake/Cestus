import { describe, expect, it } from "vitest";
import {
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  validateProductionSpecialistProviderOutput
} from "../src/production-specialist-prompts.js";

describe("production specialist prompt registrations", () => {
  const validEvidenceTriageOutput = () => ({
    dossierSummary: "Evidence needs review.",
    safeSummaries: ["The source remains available for review."],
    governanceFlags: [{
      evidenceId: "ev_001",
      tag: "review",
      confidence: 0.5,
      rationale: "Review the source evidence."
    }],
    duplicateGroups: [],
    evidenceGaps: [],
    assertionCandidates: [],
    requestProviderParseApproval: false,
    requestGovernanceReview: false,
    requestQuarantineReview: false,
    requestAssertionProposalReview: false
  });

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
    expect(prr.allowedOmissions).not.toContain("no-associated-prr");

    for (const runType of ["evidence-triage", "timeline-builder", "contradiction-finder", "investigation-planner", "report-builder"] as const) {
      const registration = productionSpecialistPromptRegistrationFor(runType);
      expect(registration.contextRequirements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextPackId: "prr-read-model.v1",
          requirementMode: "when-scope-associated-prr",
          omissionWhenNotApplicable: "no-associated-prr"
        })
      ]));
      expect(registration.allowedOmissions).toContain("no-associated-prr");
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

  it("rejects accessor-backed provider output without invoking its getter", () => {
    const value = validEvidenceTriageOutput();
    let getterInvoked = false;
    Object.defineProperty(value, "dossierSummary", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "This getter must not run.";
      }
    });

    expect(() => validateProductionSpecialistProviderOutput({ runType: "evidence-triage", value })).toThrow(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects an outer runType accessor without invoking its getter", () => {
    let getterInvoked = false;
    const input = {
      value: validEvidenceTriageOutput()
    };
    Object.defineProperty(input, "runType", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "evidence-triage";
      }
    });

    expect(() => validateProductionSpecialistProviderOutput(input as unknown as {
      readonly runType: "evidence-triage";
      readonly value: unknown;
    })).toThrow(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects an outer value accessor without invoking its getter", () => {
    let getterInvoked = false;
    const input = {
      runType: "evidence-triage"
    };
    Object.defineProperty(input, "value", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return validEvidenceTriageOutput();
      }
    });

    expect(() => validateProductionSpecialistProviderOutput(input as unknown as {
      readonly runType: "evidence-triage";
      readonly value: unknown;
    })).toThrow(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects a changing outer runType getter before it can mismatch the parsed schema", () => {
    let getterInvocations = 0;
    const input = {
      value: validEvidenceTriageOutput()
    };
    Object.defineProperty(input, "runType", {
      enumerable: true,
      get() {
        getterInvocations += 1;
        return getterInvocations === 1 ? "evidence-triage" : "report-builder";
      }
    });

    expect(() => validateProductionSpecialistProviderOutput(input as unknown as {
      readonly runType: "evidence-triage";
      readonly value: unknown;
    })).toThrow(/JSON DTO-safe/i);
    expect(getterInvocations).toBe(0);
  });

  it("rejects symbol-keyed and custom-prototype provider objects", () => {
    const symbolKeyed = validEvidenceTriageOutput();
    Object.defineProperty(symbolKeyed, Symbol("provider-output"), { enumerable: true, value: "unexpected" });

    class ProviderOutput {
      readonly dossierSummary = "Evidence needs review.";
      readonly safeSummaries = ["The source remains available for review."];
      readonly governanceFlags = [];
      readonly duplicateGroups = [];
      readonly evidenceGaps = [];
      readonly assertionCandidates = [];
      readonly requestProviderParseApproval = false;
      readonly requestGovernanceReview = false;
      readonly requestQuarantineReview = false;
      readonly requestAssertionProposalReview = false;
    }

    for (const value of [symbolKeyed, new ProviderOutput()]) {
      expect(() => validateProductionSpecialistProviderOutput({ runType: "evidence-triage", value })).toThrow(/JSON DTO-safe/i);
    }
  });

  it("rejects sparse and custom provider arrays with unsupported own properties", () => {
    const sparse = validEvidenceTriageOutput();
    sparse.safeSummaries = new Array(1);
    const customPrototype = validEvidenceTriageOutput();
    Object.setPrototypeOf(customPrototype.safeSummaries, { unexpected: true });
    const extraProperty = validEvidenceTriageOutput();
    Object.defineProperty(extraProperty.safeSummaries, "unexpected", { enumerable: true, value: "unexpected" });

    for (const value of [sparse, customPrototype, extraProperty]) {
      expect(() => validateProductionSpecialistProviderOutput({ runType: "evidence-triage", value })).toThrow(/JSON DTO-safe/i);
    }
  });

  it("rejects unsupported JSON values and deeply freezes parsed provider output", () => {
    for (const unsafeValue of [undefined, () => undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const value = validEvidenceTriageOutput();
      value.safeSummaries = [unsafeValue as unknown as string];
      expect(() => validateProductionSpecialistProviderOutput({ runType: "evidence-triage", value })).toThrow(/JSON DTO-safe/i);
    }

    const parsed = validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: validEvidenceTriageOutput()
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.runType).toBe("evidence-triage");
    if (parsed.runType !== "evidence-triage") {
      throw new Error("Expected evidence-triage output.");
    }
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.safeSummaries)).toBe(true);
    expect(Object.isFrozen(parsed.value.governanceFlags)).toBe(true);
    expect(Object.isFrozen(parsed.value.governanceFlags[0])).toBe(true);
  });

  it("rejects ontology-bootstrap provider output at runtime", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "ontology-bootstrap",
      value: {}
    } as unknown as Parameters<typeof validateProductionSpecialistProviderOutput>[0])).toThrow(/unsupported production specialist run type/i);
  });

  it("rejects arbitrary provider output run types at runtime", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "untrusted-run-type",
      value: {}
    } as unknown as Parameters<typeof validateProductionSpecialistProviderOutput>[0])).toThrow(/unsupported production specialist run type/i);
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
      "The PRR was faxed.",
      "Legal escalation was completed.",
      "The report packet was published.",
      "The repair was performed.",
      "The lock was cleared.",
      "The entity was resolved.",
      "The ontology is now accepted.",
      "Provider byte transfer is approved.",
      "A human approved the provider byte transfer.",
      "The provider byte transfer was performed.",
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

  it("allows non-PRR authority policy and instruction language", () => {
    const triage = (dossierSummary: string) => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary,
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
    });

    for (const instruction of [
      "Provider byte transfer approval is required before upload.",
      "Legal escalation must be approved by a human reviewer.",
      "The repair should be executed after review.",
      "The report should be published after review.",
      "The graph must be accepted by a human reviewer.",
      "The lock should be cleared only after approval."
    ]) {
      expect(triage(instruction).runType).toBe("evidence-triage");
    }
  });

  it("rejects non-PRR completed effects after an earlier modal instruction", () => {
    const triage = (dossierSummary: string) => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary,
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
    });

    for (const claim of [
      "The report must be published and was published.",
      "Legal escalation must be approved and was approved.",
      "The repair should be executed and was executed.",
      "The lock should be cleared and was cleared."
    ]) {
      expect(() => triage(claim)).toThrow(/authority|external effect|ontology/i);
    }
  });

  it("rejects pronoun-led completed authority claims after a delimiter for every authority category", () => {
    const triage = (dossierSummary: string) => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary,
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
    });

    for (const claim of [
      "The PRR must be filed; it was filed.",
      "The report must be published; it was published.",
      "Legal escalation must be approved; it was approved.",
      "The repair should be executed; it was executed.",
      "The ontology must be accepted; it was accepted.",
      "The entity must be resolved; it was resolved.",
      "The relationship must be accepted; it was accepted.",
      "The lock should be cleared; it was cleared.",
      "Provider byte transfer approval must be granted; it was granted.",
      "Provider byte transfer must be completed; it was completed."
    ]) {
      expect(() => triage(claim)).toThrow(/authority|external effect|ontology/i);
    }
  });

  const triageSafeSummary = (safeSummary: string) => validateProductionSpecialistProviderOutput({
    runType: "evidence-triage",
    value: {
      dossierSummary: "Evidence needs review.",
      safeSummaries: [safeSummary],
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

  it("rejects active-voice publication authority claims", () => {
    expect(() => triageSafeSummary("I published the report.")).toThrow(/authority|external effect|ontology/i);
  });

  it("rejects active-voice export authority claims", () => {
    expect(() => triageSafeSummary("We exported the evidence.")).toThrow(/authority|external effect|ontology/i);
  });

  it("allows ordinary error and publication wording in safe source evidence", () => {
    const parsed = validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Source review identifies an error in the date.",
        safeSummaries: ["The report cites a published 2023 public record."],
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

  it("keeps non-PRR authority completion matching shared across narrative, identifier, and reference fields", () => {
    const triage = (dossierSummary: string) => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary,
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
    });
    const report = (reportPacketId: string, outlineRefs: string[], packetSummary = "This is a draft packet for review.") =>
      validateProductionSpecialistProviderOutput({
        runType: "report-builder",
        value: {
          reportPacketId,
          outlineRefs,
          draftSectionRefs: [],
          citationMapRefs: [],
          includedEvidenceIds: [],
          excludedEvidenceIds: [],
          governancePolicyRefs: [],
          sensitiveOptInRequirements: [],
          legalReviewFlags: [],
          exportPublicationApprovalRefs: [],
          packetSummary
        }
      });

    for (const completedClaim of [
      "Provider byte transfer approval was completed.",
      "Legal escalation was approved.",
      "The repair was executed."
    ]) {
      expect(() => triage(completedClaim)).toThrow(/authority|external effect|ontology/i);
    }

    expect(report(
      "packet_provider_byte_transfer_approval_is_required_before_upload",
      ["policy_repair_should_be_executed_after_review"],
      "Legal escalation must be approved by a human reviewer."
    ).runType).toBe("report-builder");
    expect(() => report("packet_provider_byte_transfer_approval_was_completed", [])).toThrow(/authority|external effect|ontology/i);
    expect(() => report("packet_001", ["legal_escalation_was_approved"])).toThrow(/authority|external effect|ontology/i);
    expect(() => report("packet_001", ["repair_was_executed"])).toThrow(/authority|external effect|ontology/i);
  });

  it("rejects completed-effect nominalizations in narrative fields", () => {
    for (const claim of [
      "The PRR delivery was completed.",
      "The PRR submission was completed.",
      "The publication was completed.",
      "The entity resolution was completed.",
      "The lock clearing was completed.",
      "The legal escalation completion was recorded.",
      "The entity resolution completion was recorded.",
      "Lock clearing completion was recorded.",
      "Provider byte transfer is complete."
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

  it("rejects completed-effect authority synonyms in narrative fields", () => {
    for (const claim of [
      "The PRR was dispatched.",
      "The provider transfer was completed.",
      "The repair ran successfully."
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

  it("rejects cookie-style authentication headers in narrative fields", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Cookie: sessionid=provider-session-secret",
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
    })).toThrow(/secret-safe/i);
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

  it("rejects provider-transfer approval claims through narrative, identifier, and reference fields", () => {
    for (const claim of [
      "Provider byte-transfer approval was completed.",
      "Approval for the provider byte transfer was granted."
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

    expect(() => validateProductionSpecialistProviderOutput({
      runType: "report-builder",
      value: {
        reportPacketId: "packet_provider_byte_transfer_approval_granted",
        outlineRefs: ["Provider byte-transfer approval was completed."],
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

  it("rejects provider byte-transfer completion claims in narrative and reference fields", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Evidence needs review.",
        safeSummaries: ["Provider byte transfer completion was recorded."],
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
        reportPacketId: "packet_001",
        outlineRefs: ["Provider byte transfer completion was recorded."],
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

  it("rejects session headers, provider diagnostics, and Windows forward-slash user paths", () => {
    for (const unsafeNarrative of [
      "Session: provider-session-secret",
      "X-Session-Id: provider-session-secret",
      "C:/Users/name/provider-response.json",
      "Provider failure: timeout"
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
      })).toThrow(/secret-safe|provider error|hidden local path/i);
    }
  });

  it("rejects raw provider diagnostics without relying on a provider allowlist", () => {
    expect(() => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Anthropic error: timeout",
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
    })).toThrow(/raw provider error/i);
  });

  it("allows PRR filing instructions that do not claim completion", () => {
    expect(validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary: "Public filing instructions say the request should be mailed to the records office.",
        safeSummaries: ["The policy instructs staff to send the request after review."],
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

  it("rejects completed PRR effects and generic diagnostics without rejecting filing instructions", () => {
    const triage = (dossierSummary: string) => validateProductionSpecialistProviderOutput({
      runType: "evidence-triage",
      value: {
        dossierSummary,
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
    });

    expect(() => triage("The PRR was filed; filing instructions are attached.")).toThrow(/authority|external effect|ontology/i);
    expect(() => triage("The PRR was filed, and it should be visible in the portal tomorrow.")).toThrow(/authority|external effect|ontology/i);
    expect(() => triage("The PRR was filed and should be logged.")).toThrow(/authority|external effect|ontology/i);
    expect(() => triage("The PRR must be filed and was filed.")).toThrow(/authority|external effect|ontology/i);
    expect(() => triage("The PRR must be filed, and it was filed.")).toThrow(/authority|external effect|ontology/i);
    expect(() => triage("Error: upstream request timed out")).toThrow(/raw provider error/i);
    expect(() => triage("HTTP 429: request timed out")).toThrow(/raw provider error/i);
    expect(triage("Public filing instructions say the request should be mailed to the records office.").runType).toBe("evidence-triage");
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
    expect(() => timeline("Anthropic error: timeout", "2026-02-03")).toThrow(/raw provider error/i);
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
