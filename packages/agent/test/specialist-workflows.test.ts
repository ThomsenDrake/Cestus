import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  serializeContextPackPayload
} from "../src/context-packs.js";
import { createResidentAgentDomainAdapterRegistry } from "../src/domain-execution-adapter-registry.js";
import { approvalClassForSideEffect } from "../src/permission-policy.js";
import { createAgentRuntime } from "../src/runtime.js";
import {
  appendSpecialistFinalOutputStep,
  recordSpecialistHandoff
} from "../src/specialist-runner-kernel.js";
import { buildSpecialistHandoffProjection } from "../src/specialist-handoff-projection.js";
import {
  executeSourcedInvestigationWorkflow,
  type SourcedInvestigationArtifactStore
} from "../src/sourced-investigation-workflows.js";
import {
  buildSelectionManifestHash,
  investigativeRegistrationIdentity,
  registerInvestigativeContextPacks,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../src/investigative-context-packs.js";
import {
  registerOperationalContextPackBuilders,
  type OperationalContextPackProvider
} from "../src/operational-context-packs.js";
import {
  buildJurisdictionPackSummaryContextPack,
  buildPrrReadModelContextPack,
  jurisdictionPackSummaryPayloadParser,
  prrReadModelPayloadParser,
  registerPrrContextPackBuilders,
  type PrrContextPackRegistrationEntry
} from "../src/prr-context-packs.js";
import { registerTimelineDraftSummaryContextPack } from "../src/sourced-investigation-context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../src/production-specialist-prompts.js";
import type { ProductionRunScope } from "../src/production-specialist-registration-metadata.js";
import { parseSpecialistHandoffMaterial } from "../src/specialist-handoff-manifest.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildGraphProjection } from "../../ontology/src/graph-projection.js";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";
import {
  specialistWorkflowDescriptorFor,
  specialistWorkflowDescriptors,
  specialistWorkflowRegistrySnapshot
} from "../src/specialist-workflows.js";

const mvpRunTypes = [
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const;

const expectedPromptTemplateIdsByRunType = {
  "prr-negotiation": "prr-negotiation.review.v1",
  "evidence-triage": "evidence-triage.classify.v1",
  "timeline-builder": "timeline-builder.sourced-timeline.v1",
  "contradiction-finder": "contradiction-finder.candidates.v1",
  "investigation-planner": "investigation-planner.next-steps.v1",
  "report-builder": "report-builder.packet-draft.v1"
} satisfies Record<(typeof mvpRunTypes)[number], string>;

const expectedOutputArtifactKindsByRunType = {
  "prr-negotiation": [
    "correspondence-draft-artifact",
    "deadline-review-artifact",
    "fee-stalling-note",
    "narrowing-options",
    "legal-risk-note",
    "pending-send-followup-approval-request",
    "unresolved-question-list"
  ],
  "evidence-triage": [
    "triage-dossier",
    "safe-evidence-summaries",
    "sensitive-quarantine-flags",
    "duplicate-groups",
    "assertion-candidate-bundle",
    "evidence-gap-list",
    "review-queue-suggestions"
  ],
  "timeline-builder": [
    "timeline-artifact",
    "item-level-citation-map",
    "date-precision-notes",
    "uncertainty-flags",
    "omitted-source-list",
    "unresolved-evidence-prompts"
  ],
  "contradiction-finder": [
    "contradiction-candidate-dossier",
    "paired-source-refs",
    "confidence-caveats",
    "alternative-explanations",
    "requested-followup-evidence",
    "review-queue-items"
  ],
  "investigation-planner": [
    "investigation-plan-artifact",
    "prioritized-evidence-gaps",
    "task-suggestion-bundle",
    "draft-prr-candidate-bundle",
    "risk-notes",
    "dependencies",
    "safe-next-action-list"
  ],
  "report-builder": [
    "report-outline",
    "draft-sections",
    "citation-map",
    "unresolved-risk-note",
    "excluded-evidence-list",
    "export-preview",
    "pending-export-publication-approval-request"
  ]
} satisfies Record<(typeof mvpRunTypes)[number], readonly string[]>;

describe("MVP specialist workflow descriptors", () => {
  it("describes exactly the six MVP modes without adding agent identities", () => {
    expect(specialistWorkflowDescriptors.map((descriptor) => descriptor.runType)).toEqual([...mvpRunTypes]);
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(approvedAgentSpecialistRunTypes).toContain(descriptor.runType);
      expect(descriptor.executionEnabled).toBe(false);
      expect(descriptor.residentIdentity).toBe("agent_default");
      expect(JSON.stringify(descriptor)).not.toMatch(/persona|new agent|durable agent identity/i);
    }
  });

  it("keeps runtime execution fail-closed for every MVP mode", () => {
    for (const runType of mvpRunTypes) {
      const descriptor = specialistWorkflowDescriptorFor(runType);
      const status = specialistExecutionStatusFor(runType);

      expect(specialistExecutionStatusFor(runType)).toMatchObject({
        enabled: false,
        diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
        registeredWorkflowMode: true,
        residentAgentId: "agent_default",
        executionReady: false,
        prerequisiteContractIds: descriptor.prerequisiteContractIds,
        requiredContextPackIds: descriptor.contextPacks.map((pack) => pack.contextPackId),
        missingExecutionCapabilities: [
          "specialist workflow runner",
          "model provider readiness",
          "domain adapter readiness"
        ]
      });
      expect(status.allowedRepairActions).toContain(
        `wire specialist workflow readiness for ${descriptor.prerequisiteContractIds.join(", ")}`
      );
      expect(status.allowedRepairActions).toContain(
        `construct required context packs: ${descriptor.contextPacks.map((pack) => pack.contextPackId).join(", ")}`
      );
      expect(status.allowedRepairActions.join(" ")).not.toMatch(/\bland\b|contracts are absent|contracts still need/i);
    }
  });

  it("declares context packs, prompt template, allowed tools, approvals, outputs, and failures for each mode", () => {
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(descriptor.contextPacks.length).toBeGreaterThanOrEqual(5);
      expect(descriptor.contextPacks.map((pack) => pack.contextPackId)).toContain("governance-locks.v1");
      expect(descriptor.promptTemplate.promptTemplateId).toBe(expectedPromptTemplateIdsByRunType[descriptor.runType]);
      expect(descriptor.handoffSchemaId).toBe(`${descriptor.runType}-handoff.v1`);
      expect(descriptor.allowedTools.length).toBeGreaterThan(0);
      expect(descriptor.approvalRequirements.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.map((artifact) => artifact.artifactKind)).toEqual(
        expectedOutputArtifactKindsByRunType[descriptor.runType]
      );
      expect(descriptor.failureModes).toContain("secret-detected");
      expect(descriptor.prerequisiteContractIds).toEqual(
        expect.arrayContaining(["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"])
      );
    }
  });

  it("binds descriptor context applicability and production schema identities to the approved registry", () => {
    const prr = specialistWorkflowDescriptorFor("prr-negotiation");
    expect(prr.contextPacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ contextPackId: "prr-read-model.v1", requirementMode: "always" }),
      expect.objectContaining({ contextPackId: "jurisdiction-pack-summary.v1", requirementMode: "always" })
    ]));

    for (const runType of ["evidence-triage", "timeline-builder", "contradiction-finder", "investigation-planner", "report-builder"] as const) {
      const descriptor = specialistWorkflowDescriptorFor(runType);
      expect(descriptor.contextPacks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextPackId: "prr-read-model.v1",
          requirementMode: "when-scope-associated-prr",
          omissionWhenNotApplicable: "no-associated-prr"
        })
      ]));
      expect(descriptor.promptTemplate).toMatchObject({
        promptTemplateId: expectedPromptTemplateIdsByRunType[runType],
        providerOutputSchemaId: `${runType}.${runType === "evidence-triage" ? "classify" : runType === "timeline-builder" ? "sourced-timeline" : runType === "contradiction-finder" ? "candidates" : runType === "investigation-planner" ? "next-steps" : "packet-draft"}-output.v1`,
        providerOutputSchemaVersion: 1,
        handoffSchemaId: `${runType}-handoff.v1`,
        handoffSchemaVersion: 1
      });
    }
  });

  it("declares evidence triage review queues as inert specialist request metadata", () => {
    const descriptor = specialistWorkflowDescriptorFor("evidence-triage");
    const adapterRegistry = createResidentAgentDomainAdapterRegistry();
    const reviewQueueToolIds = [
      "governance.classification.propose",
      "governance.quarantine-review.request",
      "ontology.assertion-proposal.request"
    ];

    for (const toolId of reviewQueueToolIds) {
      const tool = descriptor.allowedTools.find((candidate) => candidate.toolId === toolId);
      expect(tool).toMatchObject({
        sideEffectClass: "ledger-proposal",
        requiredApprovalClass: "human-review"
      });
      expect(() => adapterRegistry.require(toolId, "0.1.0")).toThrow(/not found/i);
    }
  });

  it("keeps future diagnostic review descriptors aligned with the tool permission matrix", () => {
    const descriptor = specialistWorkflowDescriptorFor("contradiction-finder");
    const diagnostic = descriptor.allowedTools.find((tool) =>
      tool.toolId === "diagnostic.investigative-signal.request"
    );

    expect(diagnostic).toMatchObject({
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review"
    });
    expect(diagnostic?.requiredApprovalClass).toBe(approvalClassForSideEffect(diagnostic!.sideEffectClass));
  });

  it("exposes a frozen registry snapshot for browser-safe inspection", () => {
    const snapshot = specialistWorkflowRegistrySnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("agent-specialist-workflow-registry.v1");
    expect(snapshot.descriptors).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
    expect(serializedSnapshot).toContain("\"failureModes\"");
    expect(serializedSnapshot).toContain("\"secret-detected\"");
    expect(() => specialistWorkflowDescriptorFor("ontology-bootstrap")).toThrow(/not part of MVP workflow registry/i);
    expect(serializedSnapshot).not.toMatch(/api key|authorization|bearer|password|rawProviderError/i);
  });

  it("builds a replayable sourced timeline with exact evidence, assertion, PRR, hash, and uncertainty provenance", async () => {
    const store = memoryArtifactStore();
    const result = await executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_source_001",
      taskId: "task_timeline_source_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_source_001",
        promptRunId: "run_timeline_source_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => sourcedTimelineOutput() }
    });

    expect(result.artifact).toMatchObject({
      schemaVersion: "sourced-timeline-artifact.v1",
      truthBoundary: {
        advisoryOnly: true,
        acceptedGraphMutationAllowed: false,
        publicationAllowed: false
      },
      items: [{
        itemId: "timeline_source_001",
        evidence: [{
          evidenceId: "ev_source_001",
          contentHash: hash("a"),
          ingestionEventId: "evt_evidence_ingested_001"
        }],
        assertions: [{
          assertionId: "assertion_source_001",
          evidenceId: "ev_source_001",
          evidenceContentHash: hash("a"),
          proposedByEventId: "evt_assertion_proposed_001",
          acceptedByEventId: "evt_assertion_accepted_001"
        }],
        prrEvents: [{ eventId: "evt_prr_reply_001" }],
        contentHashRefs: [hash("a")],
        uncertainty: {
          categories: ["source-conflict"],
          notes: ["The sources use different date precision."],
          sourceRefs: ["ev_source_001", "evt_prr_reply_001"]
        }
      }],
      omittedSources: [{
        sourceRef: "ev_source_002",
        reason: "The second record has no date-bearing statement."
      }]
    });
    expect(result.handoffMaterial.outputArtifacts).toEqual([
      expect.objectContaining({
        artifactKind: "timeline-artifact",
        schemaId: "timeline-builder-handoff.v1",
        artifactHash: result.artifactHash
      })
    ]);
    expect(result.handoffMaterial.sourceEventIds).toEqual(expect.arrayContaining([
      "evt_evidence_ingested_001",
      "evt_assertion_proposed_001",
      "evt_assertion_accepted_001",
      "evt_prr_reply_001"
    ]));

    const replayed = parseSpecialistHandoffMaterial(JSON.parse(
      Buffer.from(result.handoffMaterialBytes).toString("utf8")
    ));
    expect(replayed).toEqual(result.handoffMaterial);
    expect(await store.get(result.artifactHash)).toEqual(result.artifactBytes);
  });

  it("rejects an unsourced timeline item before writing any derivative artifact", async () => {
    const store = memoryArtifactStore();
    const output = sourcedTimelineOutput();
    output.timelineItems[0] = {
      ...output.timelineItems[0]!,
      evidenceRefs: [],
      assertionRefs: [],
      prrEventRefs: [],
      contentHashRefs: [],
      uncertaintySourceRefs: []
    };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_unsourced_001",
      taskId: "task_timeline_unsourced_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_unsourced_001",
        promptRunId: "run_timeline_unsourced_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/source ref|citation|unsourced/i);
    expect(store.putCount()).toBe(0);
  });

  it("builds an advisory contradiction dossier from distinct exact refs with caveats and follow-up evidence", async () => {
    const store = memoryArtifactStore();
    const result = await executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_source_001",
      taskId: "task_contradiction_source_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_source_001",
        promptRunId: "run_contradiction_source_001"
      }),
      artifactStore: store,
      execution: { mode: "local", invoke: async () => sourcedContradictionOutput() }
    });

    expect(result.artifact).toMatchObject({
      schemaVersion: "contradiction-candidate-dossier.v1",
      truthBoundary: {
        advisoryOnly: true,
        canRejectAssertion: false,
        canContestAssertion: false,
        canSupersedeAssertion: false,
        canRelinkClaim: false
      },
      candidates: [{
        candidateId: "contradiction_source_001",
        comparedSourceRefs: ["ev_source_001", "assertion_source_001", "evt_prr_reply_001", "timeline_source_001"],
        evidence: [{ evidenceId: "ev_source_001", contentHash: hash("a") }],
        assertions: [{ assertionId: "assertion_source_001", acceptedByEventId: "evt_assertion_accepted_001" }],
        prrEvents: [{ eventId: "evt_prr_reply_001" }],
        category: "timeline-conflict",
        confidenceCaveat: "Confidence is limited by the PRR event's month-only date.",
        alternativeExplanations: ["The agency may be describing the end of the same date range."],
        requestedFollowupEvidence: ["Request the dated transmittal cover sheet."]
      }]
    });
    expect(JSON.stringify(result.artifact)).not.toMatch(/assertion\.(?:rejected|contested|superseded)|claim\.relinked/i);
    expect(result.handoffMaterial.outputArtifacts[0]).toMatchObject({
      artifactKind: "contradiction-candidate-dossier",
      schemaId: "contradiction-finder-handoff.v1",
      artifactHash: result.artifactHash
    });
  });

  it("rejects a contradiction when a compared source omits its exact typed citation binding", async () => {
    const store = memoryArtifactStore();
    const output = sourcedContradictionOutput();
    output.candidates[0] = {
      ...output.candidates[0]!,
      timelineItemIds: []
    };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_missing_binding_001",
      taskId: "task_contradiction_missing_binding_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_missing_binding_001",
        promptRunId: "run_contradiction_missing_binding_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/compared.*(?:binding|citation)|exact.*source/i);
    expect(store.putCount()).toBe(0);
  });

  it("rejects nonempty contradiction comparisons when every typed citation array is empty", async () => {
    const store = memoryArtifactStore();
    const output = sourcedContradictionOutput();
    output.candidates[0] = {
      ...output.candidates[0]!,
      evidenceIds: [],
      evidenceContentHashes: [],
      assertionIds: [],
      prrEventRefs: [],
      timelineItemIds: []
    };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_empty_bindings_001",
      taskId: "task_contradiction_empty_bindings_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_empty_bindings_001",
        promptRunId: "run_contradiction_empty_bindings_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/compared.*(?:binding|citation)|exact.*source/i);
    expect(store.putCount()).toBe(0);
  });

  it("retains every artifact hash for a timeline-only contradiction comparison", async () => {
    const store = memoryArtifactStore();
    const result = await executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_timeline_only_001",
      taskId: "task_contradiction_timeline_only_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_timeline_only_001",
        promptRunId: "run_contradiction_timeline_only_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => ({
        candidates: [{
          candidateId: "contradiction_timeline_only_001",
          comparedSourceRefs: ["timeline_source_001", "timeline_source_002"],
          evidenceIds: [],
          evidenceContentHashes: [],
          assertionIds: [],
          prrEventRefs: [],
          timelineItemIds: ["timeline_source_001", "timeline_source_002"],
          category: "timeline-conflict",
          confidence: 0.52,
          confidenceCaveat: "Confidence is limited to two advisory timeline artifacts.",
          rationale: "The two sourced timeline items carry incompatible dates.",
          uncertaintyRefs: ["timeline_source_001", "timeline_source_002"],
          alternativeExplanations: ["The items may describe different phases of the same event."],
          requestedFollowupEvidence: ["Request a dated source that distinguishes the phases."],
          requiredReviewerAction: "request-evidence"
        }]
      }) }
    });

    expect(result.artifact).toMatchObject({
      candidates: [{
        timelineItems: [
          { itemId: "timeline_source_001", artifactHashes: [hash("d")] },
          { itemId: "timeline_source_002", artifactHashes: [hash("e")] }
        ],
        contentHashRefs: [hash("d"), hash("e")]
      }]
    });
  });

  it("rejects completed reject, contest, supersede, and relink claims in contradiction narratives", async () => {
    const store = memoryArtifactStore();
    const output = sourcedContradictionOutput();
    output.candidates[0] = {
      ...output.candidates[0]!,
      rationale: "The assertion was rejected.",
      confidenceCaveat: "The assertion has been contested.",
      alternativeExplanations: ["The assertion was superseded."],
      requestedFollowupEvidence: ["The claim was relinked."]
    };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_forbidden_claims_001",
      taskId: "task_contradiction_forbidden_claims_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_forbidden_claims_001",
        promptRunId: "run_contradiction_forbidden_claims_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/authority|ontology|reject|contest|supersed|relink/i);
    expect(store.putCount()).toBe(0);
  });

  it.each([
    { field: "rationale" as const, value: "Assertion rejection has occurred." },
    { field: "confidenceCaveat" as const, value: "Assertion contestation has occurred." },
    { field: "alternativeExplanations" as const, value: "Assertion supersession has occurred." },
    { field: "requestedFollowupEvidence" as const, value: "Claim relinking has occurred." }
  ])("rejects completed authority nominalization in $field", async ({ field, value }) => {
    const store = memoryArtifactStore();
    const output = sourcedContradictionOutput();
    const candidate = output.candidates[0]!;
    output.candidates[0] = field === "alternativeExplanations" || field === "requestedFollowupEvidence"
      ? { ...candidate, [field]: [value] }
      : { ...candidate, [field]: value };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_forbidden_nominalizations_001",
      taskId: "task_contradiction_forbidden_nominalizations_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_forbidden_nominalizations_001",
        promptRunId: "run_contradiction_forbidden_nominalizations_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/authority|ontology|reject|contest|supersess|relink/i);
    expect(store.putCount()).toBe(0);
  });

  it("permits modal requests for human review of reject, contest, supersede, and relink actions", async () => {
    const output = sourcedContradictionOutput();
    output.candidates[0] = {
      ...output.candidates[0]!,
      rationale: "A human reviewer should reject the assertion only after reviewing the exact sources.",
      confidenceCaveat: "A human reviewer may contest the assertion after resolving the date uncertainty.",
      alternativeExplanations: ["A human reviewer could supersede the assertion if later evidence warrants it."],
      requestedFollowupEvidence: ["A human reviewer must decide whether to relink the claim after obtaining the source."]
    };

    const result = await executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_modal_review_001",
      taskId: "task_contradiction_modal_review_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_modal_review_001",
        promptRunId: "run_contradiction_modal_review_001"
      }),
      artifactStore: memoryArtifactStore(),
      execution: { mode: "fake", invoke: async () => output }
    });

    expect(result.artifact).toMatchObject({ candidates: [{ requiredReviewerAction: "request-evidence" }] });
  });

  it("blocks remote context transfer before executor or store access", async () => {
    let executorCalls = 0;
    const store = memoryArtifactStore();
    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_remote_001",
      taskId: "task_timeline_remote_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_remote_001",
        promptRunId: "run_timeline_remote_001"
      }),
      artifactStore: store,
      execution: {
        mode: "remote",
        invoke: async () => {
          executorCalls += 1;
          return sourcedTimelineOutput();
        }
      }
    })).rejects.toThrow(/provider byte-transfer approval|remote.*blocked/i);
    expect(executorCalls).toBe(0);
    expect(store.putCount()).toBe(0);
  });

  it("rejects self-authored packs and a noncanonical prompt before executor or store access", async () => {
    let executorCalls = 0;
    const store = memoryArtifactStore();
    const directPacks = sourcedContextPacks();
    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_untrusted_context_001",
      taskId: "task_timeline_untrusted_context_001",
      contextPacks: directPacks,
      contextRegistry: {
        async buildResolved(contextPackId: string) {
          const pack = directPacks.find((candidate) => candidate.ref.contextPackId === contextPackId);
          if (pack === undefined) throw new Error("missing pack");
          return pack;
        },
        getDescriptor() {
          return undefined;
        }
      },
      scope: { kind: "task", refs: ["task_timeline_untrusted_context_001"] },
      promptArtifact: Object.freeze({ manifest: {}, text: "self-authored prompt" }),
      promptRunId: "run_timeline_untrusted_context_001",
      artifactStore: store,
      execution: {
        mode: "fake",
        invoke: async () => {
          executorCalls += 1;
          return sourcedTimelineOutput();
        }
      }
    } as never)).rejects.toThrow(/registrar|parser authority|canonical prompt|production prompt|context.*authority/i);
    expect(executorCalls).toBe(0);
    expect(store.putCount()).toBe(0);
  });

  it("rejects a noncanonical prompt even when every context pack has package-owned authority", async () => {
    let executorCalls = 0;
    const store = memoryArtifactStore();
    const authority = await sourcedWorkflowAuthority({
      runType: "timeline-builder",
      taskId: "task_timeline_noncanonical_prompt_001",
      promptRunId: "run_timeline_noncanonical_prompt_001"
    });
    const promptArtifact = Object.freeze({
      ...authority.promptArtifact,
      text: `${authority.promptArtifact.text}\nSelf-authored instruction.`
    });

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_noncanonical_prompt_001",
      taskId: "task_timeline_noncanonical_prompt_001",
      ...authority,
      promptArtifact,
      artifactStore: store,
      execution: {
        mode: "fake",
        invoke: async () => {
          executorCalls += 1;
          return sourcedTimelineOutput();
        }
      }
    })).rejects.toThrow(/production.*prompt|rendered prompt|prompt.*hash/i);
    expect(executorCalls).toBe(0);
    expect(store.putCount()).toBe(0);
  });

  it("rejects a canonical prompt reused under a different exact production scope", async () => {
    let executorCalls = 0;
    const store = memoryArtifactStore();
    const authority = await sourcedWorkflowAuthority({
      runType: "timeline-builder",
      taskId: "task_timeline_scope_binding_001",
      promptRunId: "run_timeline_scope_binding_001"
    });

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_scope_binding_001",
      taskId: "task_timeline_scope_binding_001",
      ...authority,
      scope: { kind: "investigation", refs: ["investigation_wrong_scope_001"] },
      artifactStore: store,
      execution: {
        mode: "fake",
        invoke: async () => {
          executorCalls += 1;
          return sourcedTimelineOutput();
        }
      }
    })).rejects.toThrow(/scope.*(?:hash|applicability)|production.*prompt/i);
    expect(executorCalls).toBe(0);
    expect(store.putCount()).toBe(0);
  });

  it("replays the exact timeline handoff from ledger and artifacts without mutating accepted graph truth", async () => {
    const ledger = new InMemoryEventLedger();
    const actor = { id: "actor_timeline_replay", kind: "agent" as const, label: "Timeline Replay" };
    const now = () => "2026-08-03T12:00:00.000Z";
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_timeline_replay" });
    await runtime.createTask({
      taskId: "task_timeline_replay_001",
      title: "Build a sourced timeline",
      requestedBy: actor.id,
      priority: "normal"
    });
    const started = await runtime.startRun({
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001",
      runType: "timeline-builder",
      scope: { kind: "investigation", refs: ["investigation_timeline_replay"] }
    });
    if (!started.ok) throw new Error("timeline replay run did not start");
    const existingEvents = await ledger.readAll();
    const sourceEventIds = existingEvents.slice(0, 3).map((event) => event.id);
    if (sourceEventIds.length < 3) throw new Error("timeline replay source events are unavailable");
    const store = memoryArtifactStore();
    const authority = await sourcedWorkflowAuthority({
      runType: "timeline-builder",
      taskId: "task_timeline_replay_001",
      promptRunId: "run_timeline_replay_001",
      replaySourceEventIds: sourceEventIds as [string, string, string]
    });
    const result = await executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001",
      ...authority,
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => replayTimelineOutput() }
    });
    await store.put(replayEvidenceArtifactBytes);
    await store.put(replayAssertionRowArtifactBytes);
    const replayEvidencePack = await authority.contextRegistry.buildResolved("evidence-summary.v1");
    const selectionManifest = (replayEvidencePack.payload as unknown as {
      readonly selectionManifest: Readonly<Record<string, unknown>>;
    }).selectionManifest;
    const { manifestHash: _manifestHash, ...selectionManifestBody } = selectionManifest;
    await store.put(Buffer.from(serializeContextPackPayload(selectionManifestBody)));
    for (const artifactHash of [
      ...result.handoffMaterial.contextPackRefs.flatMap((ref) => ref.artifactHashes ?? []),
      result.handoffMaterial.promptArtifactHash,
      ...result.handoffMaterial.outputArtifacts.map((artifact) => artifact.artifactHash)
    ]) {
      try {
        expect(await store.get(artifactHash as `sha256:${string}`)).toBeInstanceOf(Buffer);
      } catch {
        throw new Error(`missing replay material ${artifactHash}`);
      }
    }
    const graphBefore = buildGraphProjection(await ledger.readAll());
    await appendSpecialistFinalOutputStep({
      ledger,
      materialStore: store,
      actor,
      now,
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001",
      handoffMaterial: result.handoffMaterial
    });
    const recorded = await recordSpecialistHandoff({
      ledger,
      manifestStore: store,
      actor,
      now,
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001"
    });
    const replayed = await buildSpecialistHandoffProjection({
      events: await ledger.readAll(),
      manifestReader: store,
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001"
    });
    const graphAfter = buildGraphProjection(await ledger.readAll());

    expect(replayed.state).toBe("legacy-unbound");
    expect(replayed.selectedHandoff).toEqual(recorded.handoff);
    expect(replayed.selectedHandoff?.outputArtifacts[0]).toMatchObject({
      artifactKind: "timeline-artifact",
      artifactHash: result.artifactHash
    });
    expect([...graphAfter.assertions.entries()]).toEqual([...graphBefore.assertions.entries()]);
    expect([...graphAfter.entities.entries()]).toEqual([...graphBefore.entities.entries()]);
    expect([...graphAfter.relationships.entries()]).toEqual([...graphBefore.relationships.entries()]);
  });
});

function sourcedTimelineOutput() {
  return {
    timelineItems: [{
      itemId: "timeline_source_001",
      dateRange: { start: "2026-03-01", end: "2026-03-31" },
      precision: "range" as const,
      evidenceRefs: ["ev_source_001"],
      assertionRefs: ["assertion_source_001"],
      prrEventRefs: ["evt_prr_reply_001"],
      contentHashRefs: [hash("a")],
      summary: "Two source-bound dates require chronology review.",
      uncertaintyCategories: ["source-conflict" as const],
      uncertaintyNotes: ["The sources use different date precision."],
      uncertaintySourceRefs: ["ev_source_001", "evt_prr_reply_001"]
    }],
    omissionReasons: ["One source lacks a date-bearing statement."],
    omittedSources: [{
      sourceRef: "ev_source_002",
      reason: "The second record has no date-bearing statement."
    }],
    unresolvedPrompts: ["Confirm the precise PRR response date."]
  };
}

function sourcedContradictionOutput() {
  return {
    candidates: [{
      candidateId: "contradiction_source_001",
      comparedSourceRefs: ["ev_source_001", "assertion_source_001", "evt_prr_reply_001", "timeline_source_001"],
      evidenceIds: ["ev_source_001"],
      evidenceContentHashes: [hash("a")],
      assertionIds: ["assertion_source_001"],
      prrEventRefs: ["evt_prr_reply_001"],
      timelineItemIds: ["timeline_source_001"],
      category: "timeline-conflict" as const,
      confidence: 0.61,
      confidenceCaveat: "Confidence is limited by the PRR event's month-only date.",
      rationale: "The exact sources place the same event in different date ranges.",
      uncertaintyRefs: ["timeline_source_001", "evt_prr_reply_001"],
      alternativeExplanations: ["The agency may be describing the end of the same date range."],
      requestedFollowupEvidence: ["Request the dated transmittal cover sheet."],
      requiredReviewerAction: "request-evidence" as const
    }]
  };
}

function replayTimelineOutput() {
  return {
    timelineItems: [{
      itemId: "timeline_replay_001",
      date: "2026-03-01",
      precision: "day" as const,
      evidenceRefs: ["ev_replay_001"],
      assertionRefs: ["assertion_replay_001"],
      prrEventRefs: [],
      contentHashRefs: [replayEvidenceArtifactHash],
      summary: "Exact replay sources anchor this advisory date.",
      uncertaintyCategories: ["inference-required" as const],
      uncertaintyNotes: ["The date depends on a reviewed source statement."],
      uncertaintySourceRefs: ["ev_replay_001", "assertion_replay_001"]
    }],
    omissionReasons: [],
    omittedSources: [],
    unresolvedPrompts: []
  };
}

async function sourcedWorkflowAuthority(input: {
  readonly runType: "timeline-builder" | "contradiction-finder";
  readonly taskId: string;
  readonly promptRunId: string;
  readonly replaySourceEventIds?: readonly [string, string, string];
}) {
  const registry = createContextPackRegistry();
  const source = input.replaySourceEventIds === undefined
    ? Object.freeze({
        evidenceIngested: "evt_evidence_ingested_001",
        secondEvidenceIngested: "evt_evidence_ingested_002",
        assertionProposed: "evt_assertion_proposed_001",
        assertionAccepted: "evt_assertion_accepted_001"
      })
    : Object.freeze({
        evidenceIngested: input.replaySourceEventIds[0],
        secondEvidenceIngested: input.replaySourceEventIds[0],
        assertionProposed: input.replaySourceEventIds[1],
        assertionAccepted: input.replaySourceEventIds[2]
      });
  const replay = input.replaySourceEventIds !== undefined;
  const evidenceId = replay ? "ev_replay_001" : "ev_source_001";
  const assertionId = replay ? "assertion_replay_001" : "assertion_source_001";
  registerInvestigativeContextPacks(registry, investigativeSourcedRegistration({
    source,
    evidenceId,
    assertionId,
    replay
  }));
  registerOperationalContextPackBuilders(registry, sourcedOperationalProvider());

  const includePrr = !replay;
  if (includePrr) registerSourcedPrrContextPacks(registry);
  if (input.runType === "contradiction-finder") {
    registerTimelineDraftSummaryContextPack(registry, {
      scope: { kind: "investigation", id: "investigation_source_001" },
      generatedAt: sourcedGeneratedAt,
      safeSummary: "Prior advisory timeline items with exact artifact and event provenance.",
      sourceEventIds: ["evt_assertion_accepted_001", "evt_prr_reply_001"],
      items: [{
        itemId: "timeline_source_001",
        summary: "A prior sourced timeline item.",
        artifactHash: hash("d"),
        uncertaintyCategories: ["source-conflict"],
        sourceEventIds: ["evt_assertion_accepted_001"]
      }, {
        itemId: "timeline_source_002",
        summary: "A second prior sourced timeline item.",
        artifactHash: hash("e"),
        uncertaintyCategories: ["date-precision"],
        sourceEventIds: ["evt_prr_reply_001"]
      }],
      omissions: []
    });
  }

  const scope: ProductionRunScope = includePrr
    ? {
        kind: "investigation",
        refs: ["investigation_source_001", sourcedPrrRequestId],
        associatedPrrRequestId: sourcedPrrRequestId
      }
    : { kind: "investigation", refs: ["investigation_replay_001"] };
  const requirements = productionSpecialistPromptRegistrationFor(input.runType).contextRequirements
    .filter((requirement) => requirement.requirementMode === "always" || includePrr);
  const resolvedContextPacks = await Promise.all(
    requirements.map((requirement) => registry.buildResolved(requirement.contextPackId))
  );
  const promptArtifact = renderProductionSpecialistPrompt({
    runType: input.runType,
    runId: input.promptRunId,
    taskId: input.taskId,
    generatedAt: sourcedGeneratedAt,
    scope,
    resolvedContextPacks,
    omissions: []
  });
  return Object.freeze({
    contextRegistry: registry,
    scope,
    promptRunId: input.promptRunId,
    promptArtifact
  });
}

function investigativeSourcedRegistration(input: {
  readonly source: {
    readonly evidenceIngested: string;
    readonly secondEvidenceIngested: string;
    readonly assertionProposed: string;
    readonly assertionAccepted: string;
  };
  readonly evidenceId: string;
  readonly assertionId: string;
  readonly replay: boolean;
}) {
  const evidenceContentHash = input.replay ? replayEvidenceArtifactHash : hash("a");
  const assertionRowHash = input.replay ? replayAssertionRowArtifactHash : hash("c");
  const scope = { kind: "investigation" as const, id: input.replay ? "investigation_replay_001" : "investigation_source_001" };
  const evidenceRows: readonly InvestigativeEvidenceRow[] = Object.freeze([{
    evidenceId: input.evidenceId,
    ingestionEventId: input.source.evidenceIngested,
    contentHash: evidenceContentHash,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: [],
    safeNarrative: input.replay ? "A replay-bound date-bearing local record." : "A date-bearing local record."
  }, ...(input.replay ? [] : [{
    evidenceId: "ev_source_002",
    ingestionEventId: input.source.secondEvidenceIngested,
    contentHash: hash("b"),
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: [],
    safeNarrative: "A local record without a usable date."
  } satisfies InvestigativeEvidenceRow])]);
  const includedRefs: InvestigativeSelectionManifestBody["includedRefs"] = Object.freeze([
    {
      refKind: "assertion" as const,
      refId: input.assertionId,
      sortKey: `assertion/${input.assertionId}/${assertionRowHash}`,
      rowHash: assertionRowHash,
      sourceEventIds: [input.source.assertionProposed, input.source.assertionAccepted],
      mandatory: true
    },
    ...evidenceRows.map((row) => ({
      refKind: "evidence" as const,
      refId: row.evidenceId,
      sortKey: `evidence/${row.evidenceId}/${row.contentHash}`,
      contentHash: row.contentHash,
      sourceEventIds: [row.ingestionEventId],
      mandatory: true
    }))
  ].sort((left, right) => left.sortKey.localeCompare(right.sortKey)));
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope,
    sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41, governance: 40, agent: 39 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: { cursor: "cursor_sourced_001", offset: 0, limit: 10, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: includedRefs.length,
    includedRefs,
    aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const deps: InvestigativeContextPackDependencies = {
    selection: { capabilityVersion: "investigative-selection.v1", select: async () => manifest },
    evidenceReader: {
      readEvidenceByIds: async ({ evidenceIds }) => evidenceRows.filter((row) => evidenceIds.includes(row.evidenceId))
    },
    graphReader: {
      readAcceptedGraphByIds: async ({ assertionIds }) => ({
        assertions: assertionIds.includes(input.assertionId) ? [{
          assertionId: input.assertionId,
          evidenceId: input.evidenceId,
          evidenceContentHash,
          proposedByEventId: input.source.assertionProposed,
          acceptedByEventId: input.source.assertionAccepted,
          sourceEventIds: [input.source.assertionProposed, input.source.assertionAccepted],
          rowHash: assertionRowHash,
          safeStatement: input.replay
            ? "The replay source has a reviewed date."
            : "The record carries a March date."
        }] : [],
        entities: [],
        relationships: [],
        relationshipProjectionAvailable: true
      })
    },
    governanceReader: { readActiveRestrictionsByIds: async () => [] },
    agentLockReader: { readActiveLocksByIds: async () => [] },
    eventReader: { readEventsByIds: async () => [] },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async ({ evidenceId, contentHash }) => ({
        ok: true as const,
        stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidenceId, value: contentHash }]
      })
    },
    now: () => sourcedGeneratedAt,
    policyVersion: sourcedPolicyVersion,
    ontologyCoreVersion: "ontology.v1",
    packVersions: { ingestion: "ingestion.v1" },
    registrationIdentity: investigativeRegistrationIdentity
  };
  return { deps, scope, window: body.window };
}

function sourcedOperationalProvider(): OperationalContextPackProvider {
  const scope = { kind: "workspace", id: "ws_sourced_fixture" } as const;
  return {
    providerId: "sourced-workflow-test-provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion: sourcedPolicyVersion,
    generatedAt: sourcedGeneratedAt,
    scope,
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    async workspaceRuntimeStatus() {
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId: scope.id,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [],
        diagnostics: [],
        projectionHighWaterMarks: { agent: 42 },
        omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks: [],
        runs: [],
        modelInvocations: [],
        toolRequests: [],
        aggregateCounts: { total: 0 },
        sourceEventIds: [],
        artifactHashes: [],
        window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.task-run-history",
          scope,
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: sourcedGeneratedAt,
          emptyReasonCode: "empty"
        }
      };
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [],
        aggregateCounts: { active: 0, totalCount: 0 },
        sourceEventIds: [],
        artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory",
          scope,
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: sourcedGeneratedAt,
          emptyReasonCode: "empty"
        }
      };
    }
  };
}

function registerSourcedPrrContextPacks(registry: ReturnType<typeof createContextPackRegistry>): void {
  registerPrrContextPackBuilders({
    registry,
    prrReadModel: sourcedPrrRegistration(),
    jurisdictionPackSummary: sourcedJurisdictionRegistration()
  });
}

function sourcedPrrRegistration(): PrrContextPackRegistrationEntry {
  const descriptor = Object.freeze({
    contextPackId: "prr-read-model.v1",
    version: 1,
    label: "Selected request PRR read model",
    maxBytes: 32_768,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.projection.selected-request"
  });
  return Object.freeze({
    descriptor,
    payloadParser: prrReadModelPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:prr-read-model.v1@1:sourced-workflow-test",
    builder: Object.freeze({ descriptor, build: () => buildSourcedPrrPack() })
  });
}

function sourcedJurisdictionRegistration(): PrrContextPackRegistrationEntry {
  const descriptor = Object.freeze({
    contextPackId: "jurisdiction-pack-summary.v1",
    version: 1,
    label: "Selected request jurisdiction pack summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.jurisdiction-pack.selected-request"
  });
  return Object.freeze({
    descriptor,
    payloadParser: jurisdictionPackSummaryPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:jurisdiction-pack-summary.v1@1:sourced-workflow-test",
    builder: Object.freeze({
      descriptor,
      build: () => buildJurisdictionPackSummaryContextPack({
        generatedAt: sourcedGeneratedAt,
        policyVersion: sourcedPolicyVersion,
        scope: { kind: "prr-request", id: sourcedPrrRequestId },
        selectedRequestEventId: "evt_prr_created_001",
        selectedRequestJurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        jurisdictionPack: {
          name: "us-federal-foia",
          version: "0.1.0",
          jurisdiction: "US Federal",
          description: "Federal FOIA starter jurisdiction pack.",
          agentGuidance: "Use cited rules as advisory workflow guidance.",
          rules: [{
            id: "federal-determination-20-working-days",
            label: "20 working days determination estimate",
            kind: "deadline",
            description: "Federal timing guidance.",
            citations: [{
              label: "5 U.S.C. 552(a)(6)(A)(i)",
              citation: "5 U.S.C. 552(a)(6)(A)(i)",
              url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
            }],
            agentWarning: "Confirm tolling facts before legal escalation language."
          }]
        },
        jurisdictionArtifactHash: hash("f"),
        projectionHighWaterMark: 77,
        sizeBudgetBytes: 16_384
      })
    })
  });
}

function buildSourcedPrrPack() {
  return buildPrrReadModelContextPack({
    generatedAt: sourcedGeneratedAt,
    policyVersion: sourcedPolicyVersion,
    scope: { kind: "prr-request", id: sourcedPrrRequestId },
    request: {
      prrRequestId: sourcedPrrRequestId,
      status: "sent",
      agencyName: "Selected Agency",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Selected Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Safe request summary.",
      latestOutboundCorrespondence: {
        correspondenceId: "corr_source_001",
        provider: "gmail",
        providerMessageId: "msg_source_001",
        subject: "Selected PRR follow-up",
        occurredAt: sourcedGeneratedAt,
        bodyHash: hash("9"),
        evidenceIds: ["ev_source_001"],
        attachmentEvidenceIds: ["ev_source_001"],
        approvedBy: "actor_investigator"
      },
      productionBatches: [],
      productionEvidenceIds: [],
      exemptions: [],
      possibleStalling: false,
      confirmedStalling: false,
      stallingSignals: []
    },
    timeline: [{
      eventId: "evt_prr_created_001",
      type: "prr.request.created",
      occurredAt: "2026-03-01T00:00:00.000Z",
      payload: { prrRequestId: sourcedPrrRequestId }
    }, {
      eventId: "evt_prr_reply_001",
      type: "prr.correspondence.received",
      occurredAt: "2026-04-01T00:00:00.000Z",
      payload: { prrRequestId: sourcedPrrRequestId }
    }] as never,
    requestStream: {
      requestCreatedEventId: "evt_prr_created_001",
      streamHeadEventId: "evt_prr_reply_001",
      streamHighWaterMark: 9,
      sourceEventIds: ["evt_prr_created_001", "evt_prr_reply_001"]
    },
    projectionHighWaterMark: 77,
    workspace: { totalPrrRequestCount: 1 },
    correspondenceHashes: [{
      id: "corr_source_001",
      contentHash: hash("9"),
      sourceEventId: "evt_prr_created_001"
    }],
    evidenceHashes: [{
      id: "ev_source_001",
      contentHash: hash("a"),
      sourceEventId: "evt_prr_reply_001"
    }],
    gates: [],
    sizeBudgetBytes: 32_768
  });
}

const sourcedGeneratedAt = "2026-08-03T12:00:00.000Z";
const sourcedPolicyVersion = "policy.sourced-workflow.v1";
const sourcedPrrRequestId = "prr_source_001";
const replayEvidenceArtifactBytes = Buffer.from("replay evidence source bytes", "utf8");
const replayEvidenceArtifactHash = hashBytes(replayEvidenceArtifactBytes);
const replayAssertionRowArtifactBytes = Buffer.from("replay accepted assertion row bytes", "utf8");
const replayAssertionRowArtifactHash = hashBytes(replayAssertionRowArtifactBytes);

function sourcedContextPacks() {
  const common = {
    version: 1,
    generatedAt: "2026-08-03T12:00:00.000Z",
    safeSummary: "Verified source context for advisory review.",
    provenanceRefs: ["evt_evidence_ingested_001"],
    sourceEventIds: [
      "evt_evidence_ingested_001",
      "evt_evidence_ingested_002",
      "evt_assertion_proposed_001",
      "evt_assertion_accepted_001",
      "evt_prr_created_001",
      "evt_prr_reply_001"
    ]
  } as const;
  return [
    buildResolvedContextPack({
      ...common,
      contextPackId: "evidence-summary.v1",
      payload: { items: [
        { evidenceId: "ev_source_001", ingestionEventId: "evt_evidence_ingested_001", contentHash: hash("a"), safeNarrative: "A date-bearing local record." },
        { evidenceId: "ev_source_002", ingestionEventId: "evt_evidence_ingested_002", contentHash: hash("b"), safeNarrative: "A local record without a usable date." }
      ] }
    }),
    buildResolvedContextPack({
      ...common,
      contextPackId: "accepted-graph-projection.v1",
      payload: { items: { assertions: [{
        assertionId: "assertion_source_001",
        evidenceId: "ev_source_001",
        evidenceContentHash: hash("a"),
        proposedByEventId: "evt_assertion_proposed_001",
        acceptedByEventId: "evt_assertion_accepted_001",
        sourceEventIds: ["evt_assertion_proposed_001", "evt_assertion_accepted_001"],
        rowHash: hash("c"),
        safeStatement: "The record carries a March date."
      }], entities: [], relationships: [] } }
    }),
    buildResolvedContextPack({
      ...common,
      contextPackId: "prr-read-model.v1",
      payload: {
        requestStream: {
          requestCreatedEventId: "evt_prr_created_001",
          streamHeadEventId: "evt_prr_reply_001",
          sourceEventIds: ["evt_prr_created_001", "evt_prr_reply_001"]
        },
        diagnostics: [
          { eventId: "evt_prr_created_001", type: "prr.request.created", occurredAt: "2026-03-01T00:00:00.000Z" },
          { eventId: "evt_prr_reply_001", type: "prr.correspondence.received", occurredAt: "2026-04-01T00:00:00.000Z" }
        ],
        sourceRefs: { evidence: [{ id: "ev_source_001", contentHash: hash("a"), sourceEventId: "evt_prr_reply_001" }], correspondence: [] }
      }
    }),
    buildResolvedContextPack({
      ...common,
      contextPackId: "timeline-draft-summary.v1",
      payload: { items: [
        { itemId: "timeline_source_001", summary: "A prior sourced timeline item.", artifactHash: hash("d") },
        { itemId: "timeline_source_002", summary: "A second prior sourced timeline item.", artifactHash: hash("e") }
      ], omissions: [] }
    })
  ];
}

function memoryArtifactStore(): SourcedInvestigationArtifactStore & { readonly putCount: () => number } {
  const values = new Map<string, Buffer>();
  let puts = 0;
  return Object.freeze({
    async put(content: Buffer) {
      puts += 1;
      const contentHash = hashBytes(content);
      values.set(contentHash, Buffer.from(content));
      return Object.freeze({ contentHash, sizeBytes: content.byteLength });
    },
    async get(contentHash: `sha256:${string}`) {
      const value = values.get(contentHash);
      if (value === undefined) throw new Error("artifact missing");
      return Buffer.from(value);
    },
    putCount: () => puts
  });
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
