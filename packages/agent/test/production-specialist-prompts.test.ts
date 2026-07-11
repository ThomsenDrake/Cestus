import { describe, expect, it } from "vitest";
import * as publicAgentApi from "../src/index.js";
import {
  evaluateProductionContextRequirements,
  hashProductionSpecialistRendererMaterial,
  productionSpecialistPromptRegistrationFor,
  productionSpecialistPromptRegistrations,
  productionSpecialistRendererMaterialFor,
  renderProductionSpecialistPromptBytesForMaterialTest,
  renderProductionSpecialistPrompt,
  verifyProductionSpecialistPromptArtifact,
  validateProductionSpecialistProviderOutput
} from "../src/production-specialist-prompts.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  buildPromptArtifact
} from "../src/prompt-artifacts.js";
import {
  buildContextPackRef,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../src/context-packs.js";

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

  it("does not expose parser authority registration through the public package API", () => {
    expect("registerContextPackPayloadParserAuthority" in publicAgentApi).toBe(false);
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

  it("binds timeline, contradiction, and report renderers to strict provider output schemas", async () => {
    for (const [runType, providerOutputSchemaId] of [
      ["timeline-builder", "timeline-builder.sourced-timeline-output.v1"],
      ["contradiction-finder", "contradiction-finder.candidates-output.v1"],
      ["report-builder", "report-builder.packet-draft-output.v1"]
    ] as const) {
      const registry = rendererContextPackRegistry();
      const artifact = renderProductionSpecialistPrompt({
        runType,
        runId: `run_${runType}_output_contract`,
        taskId: `task_${runType}_output_contract`,
        generatedAt: "2026-07-11T12:00:00.000Z",
        scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
        resolvedContextPacks: await resolvedRendererPacks(registry, runType, false),
        omissions: []
      });

      expect(artifact.manifest.production?.providerOutputSchemaId).toBe(providerOutputSchemaId);
      expect(artifact.text).toContain(providerOutputSchemaId);
    }
  });

  it("keeps renderer hashes stable across registration lookups", () => {
    const registeredHashes = productionSpecialistPromptRegistrations.map((registration) => registration.rendererHash);
    expect(registeredHashes).toEqual(
      productionSpecialistPromptRegistrations.map((registration) => productionSpecialistPromptRegistrationFor(registration.runType).rendererHash)
    );
    expect(new Set(registeredHashes)).toHaveLength(productionSpecialistPromptRegistrations.length);
  });

  it("binds renderer hashes to every canonical provider-facing literal and payload policy", () => {
    const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
    const material = productionSpecialistRendererMaterialFor("evidence-triage");

    expect(material.template.sectionOrder).toEqual([
      "Template:",
      "Run:",
      "authority-instruction",
      "provider-output-line",
      "provider-output-schema-instruction",
      "handoff-line",
      "review-instruction",
      "omission-line",
      "verified-context-marker",
      "payload-section"
    ]);
    expect(material.template.contextPackIdLine).toBe("Context pack ID: {contextPackId}");
    expect(material.template.contentHashLine).toBe("Content hash: {contentHash}");
    expect(material.template.packLabelLine).toBe("Pack label: {packLabel}");
    expect(material.payloadRenderers["evidence-summary.v1"]).toEqual(expect.objectContaining({
      label: "Evidence summary",
      kind: "evidence-summary.v1",
      collectionPaths: expect.arrayContaining([
        expect.objectContaining({ path: "items", label: "Evidence", fieldRule: "evidenceSummary" })
      ])
    }));
    expect(material.limits.redactionBehavior).toBe("exclude-unregistered-fields");
    expect(material.limits.truncationSuffix).toBe(" [truncated]");
    expect(hashProductionSpecialistRendererMaterial(material)).toBe(registration.rendererHash);
    for (const registered of productionSpecialistPromptRegistrations) {
      expect(hashProductionSpecialistRendererMaterial(
        productionSpecialistRendererMaterialFor(registered.runType)
      )).toBe(registered.rendererHash);
    }

    const changedLayoutLiteral = {
      ...material,
      template: {
        ...material.template,
        contextPackIdLine: "Context ID: {contextPackId}"
      }
    };
    const changedTruncationLiteral = {
      ...material,
      limits: {
        ...material.limits,
        truncationSuffix: " [trimmed]"
      }
    };
    expect(hashProductionSpecialistRendererMaterial(changedLayoutLiteral)).not.toBe(registration.rendererHash);
    expect(hashProductionSpecialistRendererMaterial(changedTruncationLiteral)).not.toBe(registration.rendererHash);
  });

  it("renders output-only instructions with validator-valid JSON skeletons for every run type", async () => {
    for (const registration of productionSpecialistPromptRegistrations) {
      const artifact = await renderedArtifactForRunType(registration.runType);
      const instruction = extractRenderedOutputInstruction(artifact.text);

      expect(instruction).toContain("Return exactly one JSON object");
      expect(instruction).toContain("Do not use Markdown");
      expect(instruction).toContain("code fences");
      expect(instruction).toContain("preamble");
      expect(instruction).toContain("trailing commentary");
      expect(instruction).toContain("unknown fields");
      expect(instruction).toContain("concise");
      expect(instruction).not.toContain("```");

      const skeleton = extractSkeletonJson(instruction);
      expect(validateProductionSpecialistProviderOutput({
        runType: registration.runType,
        value: skeleton
      }).runType).toBe(registration.runType);
    }
  });

  it("renders run-specific output guidance from canonical material", async () => {
    const evidenceArtifact = await renderedArtifactForRunType("evidence-triage");
    const evidenceInstruction = extractRenderedOutputInstruction(evidenceArtifact.text);
    expect(evidenceInstruction).toContain("safeSummaries");
    expect(evidenceInstruction).toContain("distinctive");
    expect(evidenceInstruction).toContain("evidence-summary.v1");
    expect(evidenceInstruction).not.toContain("PAYLOAD_SENTINEL_CITY_LEDGER_427");

    const prrArtifact = await renderedArtifactForRunType("prr-negotiation");
    const prrInstruction = extractRenderedOutputInstruction(prrArtifact.text);
    expect(prrInstruction).toContain("exact cited rule refs");
    expect(prrInstruction).toContain("jurisdiction-pack-summary.v1");
    expect(prrInstruction).toContain("advisory draft");
    expect(prrInstruction).toContain("Do not claim that a follow-up, send, or legal escalation occurred");
  });

  it("binds renderer hash and rendered text to output instruction material", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const input = {
      runType: "evidence-triage" as const,
      runId: "run_instruction_material_001",
      taskId: "task_instruction_material_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_material_001"] },
      resolvedContextPacks,
      omissions: []
    };
    const material = productionSpecialistRendererMaterialFor("evidence-triage");
    const changedInstruction = {
      ...material,
      template: {
        ...material.template,
        providerOutputInstructions: {
          ...material.template.providerOutputInstructions,
          "evidence-triage": material.template.providerOutputInstructions["evidence-triage"]
            .replace("Return exactly one JSON object", "Return exactly one JSON object with deterministic Task 7 framing")
        }
      }
    };

    expect(hashProductionSpecialistRendererMaterial(changedInstruction)).not.toBe(hashProductionSpecialistRendererMaterial(material));
    expect(renderProductionSpecialistPromptBytesForMaterialTest(input, changedInstruction))
      .not.toBe(renderProductionSpecialistPromptBytesForMaterialTest(input, material));
  });

  it("uses canonical renderer material for provider-visible bytes as well as the renderer hash", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const input = {
      runType: "evidence-triage" as const,
      runId: "run_material_001",
      taskId: "task_material_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_material_001"] },
      resolvedContextPacks,
      omissions: []
    };
    const material = productionSpecialistRendererMaterialFor("evidence-triage");
    const changed = {
      ...material,
      template: {
        ...material.template,
        contextPackIdLine: "Pack identity: {contextPackId}"
      }
    };

    expect(hashProductionSpecialistRendererMaterial(changed)).not.toBe(hashProductionSpecialistRendererMaterial(material));
    expect(renderProductionSpecialistPromptBytesForMaterialTest(input, changed))
      .not.toBe(renderProductionSpecialistPromptBytesForMaterialTest(input, material));
    expect(renderProductionSpecialistPromptBytesForMaterialTest(input, changed)).toContain("Pack identity:");

    const changedFieldGrammar = {
      ...material,
      fieldRules: {
        ...material.fieldRules,
        evidenceSummary: material.fieldRules.evidenceSummary.filter((field) => field !== "safeNarrative")
      }
    };

    expect(hashProductionSpecialistRendererMaterial(changedFieldGrammar)).not.toBe(hashProductionSpecialistRendererMaterial(material));
    expect(renderProductionSpecialistPromptBytesForMaterialTest(input, changedFieldGrammar))
      .not.toBe(renderProductionSpecialistPromptBytesForMaterialTest(input, material));
  });

  it("requires a complete production binding before every production run type can transfer", () => {
    const ref = buildContextPackRef({
      contextPackId: "task-run-history.v1",
      version: 1,
      generatedAt: "2026-07-10T12:00:00.000Z",
      payload: { task: "run_001" },
      safeSummary: "One task history item.",
      provenanceRefs: ["evt_task_001"]
    });

    for (const registration of productionSpecialistPromptRegistrations) {
      const artifact = buildPromptArtifact({
        promptTemplateId: registration.promptTemplateId,
        promptTemplateVersion: registration.promptTemplateVersion,
        generatedAt: "2026-07-10T12:00:00.000Z",
        runType: registration.runType,
        safetyClass: "provider-approved",
        transferApprovalClass: "provider-byte-transfer",
        contextPackRefs: [ref],
        text: "Provider prompt text requires a registered production binding.",
        safeSummary: "Provider-approved specialist prompt artifact."
      });

      expect(() => assertPromptArtifactCanTransferToRemoteProvider(artifact)).toThrow(/production binding/i);
    }
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

  it("rejects completed task, crawl, and plural provider-byte effects while retaining bounded instructions", () => {
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
      "Tasks were created.",
      "We created the review task.",
      "We created three tasks.",
      "We launched multiple tasks.",
      "The review task must be created; it was created.",
      "task_was_created",
      "The portal was crawled.",
      "We scraped the site.",
      "Sites were scraped.",
      "We crawled the sites.",
      "The portal should be crawled; it was crawled.",
      "portal_was_scraped",
      "Provider bytes were transferred.",
      "We transferred provider bytes.",
      "Provider byte transfers were completed.",
      "We completed provider byte transfers.",
      "Provider bytes must be transferred; they were transferred.",
      "provider_bytes_were_transferred"
    ]) {
      expect(() => triage(claim)).toThrow(/authority|external effect|ontology/i);
    }

    for (const instruction of [
      "Create a review task.",
      "The investigator should crawl the portal after approval.",
      "Provider bytes must not be transferred without approval.",
      "Task candidate: review the public records after a human decision."
    ]) {
      expect(triage(instruction).runType).toBe("evidence-triage");
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

  it("renders payload-only sentinel content and keeps clock changes out of rendered prompt hash", async () => {
    const registry = rendererContextPackRegistry({
      "evidence-summary.v1": {
        items: [evidenceSummaryItem("PAYLOAD_SENTINEL_CITY_LEDGER_427")]
      }
    });
    const resolved = await resolvedRendererPacks(registry, "evidence-triage", false);
    const input = {
      runType: "evidence-triage" as const,
      runId: "run_render_001",
      taskId: "task_render_001",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks: resolved,
      omissions: []
    };
    const first = renderProductionSpecialistPrompt({ ...input, generatedAt: "2026-07-10T12:00:00.000Z" });
    const second = renderProductionSpecialistPrompt({ ...input, generatedAt: "2026-07-10T12:05:00.000Z" });

    expect(first.text).toContain("PAYLOAD_SENTINEL_CITY_LEDGER_427");
    expect(first.text).not.toContain("Evidence summary does not include the sentinel.");
    expect(first.text).toContain("dossierSummary");
    expect(first.text).toMatch(/send PRRs/i);
    expect(first.text).toMatch(/accept ontology truth/i);
    expect(first.manifest.production?.renderedPromptHash).toBe(second.manifest.production?.renderedPromptHash);
    expect(first.manifest.inputArtifactHash).not.toBe(second.manifest.inputArtifactHash);
    expect(() => assertPromptArtifactCanTransferToRemoteProvider(first)).not.toThrow();
  });

  it("renders only approved evidence-summary fields", async () => {
    const registry = rendererContextPackRegistry({
      "evidence-summary.v1": {
        items: [{
          ...evidenceSummaryItem("EVIDENCE_ALLOWED_SENTINEL_427"),
          forbiddenProviderField: "EVIDENCE_FORBIDDEN_FIELD_427"
        }],
        forbiddenTopLevelField: "EVIDENCE_FORBIDDEN_TOP_LEVEL_427"
      }
    });
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);

    const artifact = renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_evidence_allowlist_001",
      taskId: "task_evidence_allowlist_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks,
      omissions: []
    });

    expect(artifact.text).toContain("EVIDENCE_ALLOWED_SENTINEL_427");
    expect(artifact.text).not.toContain("EVIDENCE_FORBIDDEN_FIELD_427");
    expect(artifact.text).not.toContain("EVIDENCE_FORBIDDEN_TOP_LEVEL_427");
  });

  it("excludes unregistered fields from non-evidence context packs", async () => {
    const registry = rendererContextPackRegistry({
      "task-run-history.v1": {
        history: {
          ...taskRunHistory("TASK_HISTORY_ALLOWED_SENTINEL_427"),
          forbiddenProviderField: "TASK_HISTORY_FORBIDDEN_FIELD_427"
        }
      }
    });
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);

    const artifact = renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_non_evidence_allowlist_001",
      taskId: "task_non_evidence_allowlist_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks,
      omissions: []
    });

    expect(artifact.text).toContain("TASK_HISTORY_ALLOWED_SENTINEL_427");
    expect(artifact.text).not.toContain("TASK_HISTORY_FORBIDDEN_FIELD_427");
  });

  it("renders authoritative memory summaries while excluding unregistered memory fields", async () => {
    const registry = rendererContextPackRegistry({
      "agent-memory-summary.v1": {
        memory: {
          activeMemory: [{
            memoryId: "memory_001",
            scope: "task",
            memoryKind: "agent-observation",
            summary: "MEMORY_AUTHORITATIVE_SUMMARY_SENTINEL_427",
            confidence: 0.8,
            sourceEventIds: ["evt_memory_001"],
            artifactHashes: [hash],
            expiresAt: "2026-07-12T12:00:00.000Z",
            unregisteredProviderField: "MEMORY_UNREGISTERED_FIELD_SENTINEL_427"
          }],
          aggregateCounts: { active: 1 },
          sourceEventIds: ["evt_memory_001"],
          artifactHashes: [hash]
        }
      }
    });
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);

    const artifact = renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_memory_allowlist_001",
      taskId: "task_memory_allowlist_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks,
      omissions: []
    });

    expect(artifact.text).toContain("MEMORY_AUTHORITATIVE_SUMMARY_SENTINEL_427");
    expect(artifact.text).toContain("memoryKind");
    expect(artifact.text).toContain("confidence");
    expect(artifact.text).not.toContain("MEMORY_UNREGISTERED_FIELD_SENTINEL_427");
  });

  it("binds scope applicability to the task identity", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const base = {
      runType: "evidence-triage" as const,
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks
    };

    const first = evaluateProductionContextRequirements({ ...base, taskId: "task_scope_001" });
    const second = evaluateProductionContextRequirements({ ...base, taskId: "task_scope_002" });

    expect(first.scopeApplicabilityHash).not.toBe(second.scopeApplicabilityHash);
  });

  it("records no-associated-prr only for non-PRR triage, planner, and report scopes", async () => {
    for (const runType of ["evidence-triage", "investigation-planner", "report-builder"] as const) {
      const registry = rendererContextPackRegistry();
      const resolvedContextPacks = await resolvedRendererPacks(registry, runType, false);
      const artifact = renderProductionSpecialistPrompt({
        runType,
        runId: `run_${runType}`,
        taskId: `task_${runType}`,
        generatedAt: "2026-07-10T12:00:00.000Z",
        scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
        resolvedContextPacks,
        omissions: []
      });

      expect(artifact.manifest.omissions).toEqual([expect.objectContaining({
        reason: "no-associated-prr",
        sourceRef: "prr-read-model.v1"
      })]);
      expect(artifact.manifest.production?.evaluatedContextRequirements).toContainEqual(expect.objectContaining({
        contextPackId: "prr-read-model.v1",
        status: "not-applicable",
        omissionReason: "no-associated-prr"
      }));
    }
  });

  it("requires the PRR read model for PRR-linked triage, planner, and report scopes", async () => {
    for (const runType of ["evidence-triage", "investigation-planner", "report-builder"] as const) {
      const registry = rendererContextPackRegistry();
      const resolvedContextPacks = await resolvedRendererPacks(registry, runType, false);

      expect(() => renderProductionSpecialistPrompt({
        runType,
        runId: `run_prr_${runType}`,
        taskId: `task_prr_${runType}`,
        generatedAt: "2026-07-10T12:00:00.000Z",
        scope: { kind: "prr", refs: ["prr_001"], associatedPrrRequestId: "prr_001" },
        resolvedContextPacks,
        omissions: []
      })).toThrow(/prr-read-model|missing/i);
    }
  });

  it("rejects associated PRRs outside the scope and swapped PRR context", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", true);
    const input = {
      runType: "evidence-triage" as const,
      runId: "run_swapped_prr_001",
      taskId: "task_swapped_prr_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      resolvedContextPacks,
      omissions: []
    };

    expect(() => renderProductionSpecialistPrompt({
      ...input,
      scope: { kind: "prr", refs: ["prr_other_001"], associatedPrrRequestId: "prr_selected_001" }
    })).toThrow(/associated PRR|scope/i);
    expect(() => renderProductionSpecialistPrompt({
      ...input,
      scope: { kind: "prr", refs: ["prr_selected_001"], associatedPrrRequestId: "prr_selected_001" }
    })).toThrow(/prr-read-model.*scope|associated PRR/i);

    const payloadSwappedRegistry = rendererContextPackRegistry({
      "prr-read-model.v1": {
        ...(defaultRendererPayload("prr-read-model.v1") as Record<string, unknown>),
        scope: { kind: "prr-request", id: "prr_other_001" }
      }
    }, {}, new Set(), {
      "prr-read-model.v1": { kind: "prr-request", id: "prr_selected_001" }
    });
    const payloadSwappedPacks = await resolvedRendererPacks(payloadSwappedRegistry, "evidence-triage", true);
    expect(() => renderProductionSpecialistPrompt({
      ...input,
      resolvedContextPacks: payloadSwappedPacks,
      scope: { kind: "prr", refs: ["prr_selected_001"], associatedPrrRequestId: "prr_selected_001" }
    })).toThrow(/prr-read-model.*payload scope|associated PRR/i);
  });

  it("rejects matching-hash invalid pack-specific payload shapes before renderer envelope creation", async () => {
    for (const contextPackId of rendererPackIds) {
      const registry = rendererContextPackRegistry({
        [contextPackId]: { invalid: "not the registered payload shape" }
      });

      await expect(registry.buildResolved(contextPackId)).rejects.toThrow(/payload-schema-mismatch/i);
    }
  });

  it("rejects forged plain objects that imitate verified resolved context envelopes", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const first = resolvedContextPacks[0];
    if (first === undefined) throw new Error("Expected evidence summary pack.");

    expect(() => renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_forged_001",
      taskId: "task_forged_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks: [{ ...first }, ...resolvedContextPacks.slice(1)],
      omissions: []
    })).toThrow(/unverified|verified/i);
  });

  it("rejects production packs branded by a foreign parser identity", async () => {
    const registry = rendererContextPackRegistry({}, {
      "evidence-summary.v1": "foreign-permissive-parser.v1"
    });
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);

    expect(() => renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_foreign_parser_001",
      taskId: "task_foreign_parser_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_foreign_parser_001"] },
      resolvedContextPacks,
      omissions: []
    })).toThrow(/parser authority|approved parser/i);
  });

  it("rejects an exact-ID permissive parser before production rendering", async () => {
    const registry = rendererContextPackRegistry({}, {}, new Set(["evidence-summary.v1"]));
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);

    expect(() => renderProductionSpecialistPrompt({
      runType: "evidence-triage",
      runId: "run_exact_id_permissive_001",
      taskId: "task_exact_id_permissive_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_exact_id_001"] },
      resolvedContextPacks,
      omissions: []
    })).toThrow(/parser authority|approved parser/i);
  });

  it("rejects malformed production scopes before applicability is evaluated", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const input = {
      runType: "evidence-triage" as const,
      taskId: "task_scope_validation_001",
      resolvedContextPacks
    };
    const accessorScope = { refs: ["ev_scope_001"] } as Record<string, unknown>;
    Object.defineProperty(accessorScope, "kind", { enumerable: true, get: () => "imported-evidence" });
    const symbolScope = { kind: "imported-evidence", refs: ["ev_scope_001"] };
    Object.defineProperty(symbolScope, Symbol("scope"), { value: "unexpected" });
    const sparseRefs = new Array<string>(1);

    for (const scope of [
      Object.create(null),
      accessorScope,
      symbolScope,
      { kind: "", refs: ["ev_scope_001"] },
      { kind: "imported-evidence", refs: sparseRefs },
      { kind: "imported-evidence", refs: [""] },
      { kind: "imported-evidence", refs: ["ev_scope_001"], associatedPrrRequestId: "" },
      { kind: "imported-evidence", refs: ["ev_scope_001"], associatedPrrRequestId: 1 }
    ]) {
      expect(() => evaluateProductionContextRequirements({ ...input, scope: scope as never })).toThrow(/scope|plain|safe|refs|associated/i);
    }
  });

  it("rejects supplied artifacts that mismatch current renderer bindings and payload state", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const source = {
      runType: "evidence-triage" as const,
      runId: "run_verify_001",
      taskId: "task_verify_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks,
      omissions: []
    };
    const artifact = renderProductionSpecialistPrompt(source);
    const production = artifact.manifest.production;
    if (production === undefined) throw new Error("Expected production binding.");
    const mismatched = (manifest: typeof artifact.manifest) => ({ ...artifact, manifest });
    const badHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, rendererId: "wrong.renderer.v1" }
    }) })).toThrow(/renderer identity/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, rendererHash: badHash }
    }) })).toThrow(/renderer hash/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, renderedPromptHash: badHash }
    }) })).toThrow(/rendered prompt hash/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, inputArtifactHash: badHash
    }) })).toThrow(/artifact hash/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, contextPackRefs: [...artifact.manifest.contextPackRefs].reverse()
    }) })).toThrow(/context order|context hashes/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, scopeApplicabilityHash: badHash }
    }) })).toThrow(/scope hash/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, providerOutputSchemaId: "wrong.output.v1" }
    }) })).toThrow(/output schema/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, handoffSchemaId: "wrong.handoff.v1" }
    }) })).toThrow(/handoff schema/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, safetyClass: "workspace-safe"
    }) })).toThrow(/safety class/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, transferApprovalClass: "none"
    }) })).toThrow(/transfer class/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, production: { ...production, resolvedPayloadAudits: [] }
    }) })).toThrow(/payload audit/i);
    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: mismatched({
      ...artifact.manifest, omissions: []
    }) })).toThrow(/omission/i);
  });

  it("rejects artifact verification that supplies only refs, hashes, and summaries", async () => {
    const registry = rendererContextPackRegistry();
    const resolvedContextPacks = await resolvedRendererPacks(registry, "evidence-triage", false);
    const source = {
      runType: "evidence-triage" as const,
      runId: "run_ref_only_001",
      taskId: "task_ref_only_001",
      generatedAt: "2026-07-10T12:00:00.000Z",
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      resolvedContextPacks,
      omissions: []
    };
    const artifact = renderProductionSpecialistPrompt(source);
    const refsOnly = { ...artifact };
    delete (refsOnly as { resolvedContextPacks?: unknown }).resolvedContextPacks;

    expect(() => verifyProductionSpecialistPromptArtifact({ ...source, artifact: refsOnly })).toThrow(/resolved context packs|payload/i);
  });
});

const rendererPackIds = [
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "timeline-draft-summary.v1",
  "contradiction-candidate-summary.v1",
  "governance-locks.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1",
  "prr-read-model.v1",
  "jurisdiction-pack-summary.v1"
] as const;

function rendererContextPackRegistry(
  payloads: Readonly<Record<string, unknown>> = {},
  parserIdentities: Readonly<Partial<Record<typeof rendererPackIds[number], string>>> = {},
  permissiveExactIdParsers: ReadonlySet<typeof rendererPackIds[number]> = new Set(),
  refScopes: Readonly<Partial<Record<typeof rendererPackIds[number], { readonly kind: string; readonly id: string }>>> = {}
) {
  const registry = createContextPackRegistry();
  for (const contextPackId of rendererPackIds) {
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `Renderer ${contextPackId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: "2026-07-10T12:00:00.000Z",
        payload: payloads[contextPackId] ?? defaultRendererPayload(contextPackId),
        safeSummary: contextPackId === "evidence-summary.v1"
          ? "Evidence summary does not include the sentinel."
          : `Verified ${contextPackId} summary.`,
        provenanceRefs: ["evt_renderer_context_001"],
        ...(refScopes[contextPackId] === undefined ? {} : { scope: refScopes[contextPackId] })
      }),
      parsePayload: rendererParser(
        parserIdentities[contextPackId] ?? productionParserIdentity(contextPackId),
        permissiveExactIdParsers.has(contextPackId)
          ? (payload) => payload
          : (payload) => parseRendererPayload(contextPackId, payload),
        !permissiveExactIdParsers.has(contextPackId)
      )
    });
  }
  return registry;
}

function rendererParser(
  parserIdentity: string,
  parser: (payload: AgentContextPackJsonValue) => AgentContextPackJsonValue,
  registryOwned = true
) {
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: parserIdentity,
    enumerable: false,
    writable: false,
    configurable: false
  });
  if (registryOwned) registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function productionParserIdentity(contextPackId: typeof rendererPackIds[number]): string {
  switch (contextPackId) {
    case "timeline-draft-summary.v1": return "timeline-draft-summary.production-test-parser.v1";
    case "contradiction-candidate-summary.v1": return "contradiction-candidate-summary.production-test-parser.v1";
    default: return contextPackId;
  }
}

function parseRendererPayload(
  contextPackId: typeof rendererPackIds[number],
  payload: AgentContextPackJsonValue
): AgentContextPackJsonValue {
  const record = asRecord(payload);
  const items = asRecord(record?.items);
  const memory = asRecord(record?.memory);
  const history = asRecord(record?.history);
  const runtime = asRecord(record?.runtime);

  const valid = (() => {
    switch (contextPackId) {
      case "accepted-graph-projection.v1":
        return items !== undefined && Array.isArray(items.assertions) && Array.isArray(items.entities) && Array.isArray(items.relationships);
      case "evidence-summary.v1":
      case "timeline-draft-summary.v1":
      case "contradiction-candidate-summary.v1":
        return Array.isArray(record?.items);
      case "governance-locks.v1":
        return items !== undefined && Array.isArray(items.activeLocks) && Array.isArray(items.governanceRestrictions);
      case "agent-memory-summary.v1":
        return memory !== undefined && Array.isArray(memory.activeMemory) && Array.isArray(memory.sourceEventIds) && Array.isArray(memory.artifactHashes);
      case "task-run-history.v1":
        return history !== undefined && Array.isArray(history.tasks) && Array.isArray(history.runs) && Array.isArray(history.modelInvocations) && Array.isArray(history.toolRequests);
      case "workspace-runtime-status.v1":
        return runtime !== undefined && Array.isArray(runtime.providerStates) && Array.isArray(runtime.diagnostics) && Array.isArray(runtime.omissionCodes);
      case "prr-read-model.v1":
        return record !== undefined && asRecord(record.lifecycle) !== undefined && asRecord(record.requestStream) !== undefined && Array.isArray(record.diagnostics) && Array.isArray(record.gates) && Array.isArray(record.omissions);
      case "jurisdiction-pack-summary.v1":
        return record !== undefined && typeof record.packName === "string" && typeof record.packVersion === "string" && Array.isArray(record.citedRules) && Array.isArray(record.omissions);
    }
  })();
  if (!valid) throw new Error(`invalid ${contextPackId} payload`);
  return payload;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function defaultRendererPayload(contextPackId: string): unknown {
  switch (contextPackId) {
    case "evidence-summary.v1": return { items: [evidenceSummaryItem("Verified evidence is available.")] };
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_imported_001", evidenceContentHash: hash, proposedByEventId: "evt_proposed_001", acceptedByEventId: "evt_accepted_001", sourceEventIds: ["evt_proposed_001"], rowHash: hash, safeStatement: "Verified graph statement." }], entities: [], relationships: [] } };
    case "governance-locks.v1": return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Review required.", activatedBy: "agent_001", activatedAt: "2026-07-10T12:00:00.000Z", relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: ["Verified memory."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: taskRunHistory("Verified task history.") };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    case "prr-read-model.v1": return { lifecycle: { status: "draft", agencyName: "Agency", jurisdictionPack: { name: "pack", version: "1" } }, requestStream: { requestCreatedEventId: "evt_prr_001", streamHeadEventId: "evt_prr_001", streamHighWaterMark: 1, sourceEventIds: ["evt_prr_001"] }, deadline: null, fee: null, narrowing: null, correspondence: [], production: {}, diagnostics: [], gates: [], sourceRefs: {}, omissions: [] };
    case "jurisdiction-pack-summary.v1": return { packName: "pack", packVersion: "1", jurisdiction: "test", citedRules: [], advisoryPosture: { summary: "Advisory only." }, omissions: [] };
    case "timeline-draft-summary.v1": return { items: [{ itemId: "timeline_001", summary: "Verified timeline item." }], omissions: [] };
    case "contradiction-candidate-summary.v1": return { items: [{ candidateId: "contradiction_001", rationale: "Verified candidate." }], omissions: [] };
    default: throw new Error(`Unknown renderer context pack ${contextPackId}`);
  }
}

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

function evidenceSummaryItem(safeNarrative: string) {
  return { evidenceId: "ev_imported_001", ingestionEventId: "evt_ingested_001", contentHash: hash, occurrenceIds: ["occurrence_001"], parseJobs: [], governanceTags: [], safeNarrative };
}

function taskRunHistory(summary: string) {
  return { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_001", status: "queued", statusReasonCode: summary }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [], window: { order: "created-at", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] } };
}

async function resolvedRendererPacks(
  registry: ReturnType<typeof rendererContextPackRegistry>,
  runType: typeof productionSpecialistPromptRegistrations[number]["runType"],
  includePrr: boolean
) {
  const requirements = productionSpecialistPromptRegistrationFor(runType).contextRequirements
    .filter((requirement) => requirement.requirementMode === "always" || includePrr);
  return Promise.all(requirements.map((requirement) => registry.buildResolved(requirement.contextPackId)));
}

async function renderedArtifactForRunType(
  runType: typeof productionSpecialistPromptRegistrations[number]["runType"]
) {
  const associatedPrrRequestId = "prr_selected_001";
  const includePrr = runType === "prr-negotiation";
  const registry = includePrr
    ? rendererContextPackRegistry({
      "prr-read-model.v1": {
        ...(defaultRendererPayload("prr-read-model.v1") as Record<string, unknown>),
        scope: { kind: "prr-request", id: associatedPrrRequestId }
      }
    }, {}, new Set(), {
      "prr-read-model.v1": { kind: "prr-request", id: associatedPrrRequestId }
    })
    : rendererContextPackRegistry();
  return renderProductionSpecialistPrompt({
    runType,
    runId: `run_${runType}_instruction_001`,
    taskId: `task_${runType}_instruction_001`,
    generatedAt: "2026-07-10T12:00:00.000Z",
    scope: includePrr
      ? { kind: "prr-negotiation", refs: ["ws_renderer", associatedPrrRequestId], associatedPrrRequestId }
      : { kind: "imported-evidence", refs: ["ev_imported_001"] },
    resolvedContextPacks: await resolvedRendererPacks(registry, runType, includePrr),
    omissions: []
  });
}

function extractRenderedOutputInstruction(text: string): string {
  const start = text.indexOf("Provider output requirements:");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n\nHandoff schema:", start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

function extractSkeletonJson(instruction: string): unknown {
  const markerIndex = instruction.indexOf("Skeleton JSON:");
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const jsonStart = instruction.indexOf("{", markerIndex);
  expect(jsonStart).toBeGreaterThan(markerIndex);
  const jsonEnd = matchingJsonObjectEnd(instruction, jsonStart);
  return JSON.parse(instruction.slice(jsonStart, jsonEnd + 1));
}

function matchingJsonObjectEnd(value: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Could not find the end of the JSON skeleton.");
}
