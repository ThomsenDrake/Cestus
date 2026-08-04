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
import { assembleLocalReportPacket } from "../src/report-builder-workflow.js";
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
import type { TimelineBuilderSourcedTimelineOutput } from "../src/production-specialist-output-contracts.js";
import type { ProductionRunScope } from "../src/production-specialist-registration-metadata.js";
import { parseSpecialistHandoffMaterial } from "../src/specialist-handoff-manifest.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildGraphProjection } from "../../ontology/src/graph-projection.js";
import { goldenGovernanceLedgerEvents } from "../../ontology/test/fixtures/golden-governance-ledger.js";
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

  it.each([
    {
      label: "a selected evidence ID is absent",
      mutate(output: TimelineBuilderSourcedTimelineOutput) {
        output.omittedSources = [];
      }
    },
    {
      label: "a selected evidence ID is cited twice",
      mutate(output: TimelineBuilderSourcedTimelineOutput) {
        output.timelineItems[0] = {
          ...output.timelineItems[0]!,
          evidenceRefs: ["ev_source_001", "ev_source_001"]
        };
      }
    },
    {
      label: "a selected evidence ID is omitted twice",
      mutate(output: TimelineBuilderSourcedTimelineOutput) {
        output.omittedSources = [
          ...output.omittedSources,
          { sourceRef: "ev_source_002", reason: "A duplicate omission must not appear." }
        ];
      }
    },
    {
      label: "cited and omitted selected-evidence sets overlap",
      mutate(output: TimelineBuilderSourcedTimelineOutput) {
        output.omittedSources = [
          ...output.omittedSources,
          { sourceRef: "ev_source_001", reason: "A cited source cannot also be omitted." }
        ];
      }
    },
    {
      label: "an omission names an unknown evidence ID",
      mutate(output: TimelineBuilderSourcedTimelineOutput) {
        output.omittedSources = [{ sourceRef: "ev_source_unknown", reason: "Unknown source." }];
      }
    }
  ])("rejects timeline creation when $label", async ({ mutate }) => {
    const store = memoryArtifactStore();
    const output = sourcedTimelineOutput();
    mutate(output);

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_exact_coverage_001",
      taskId: "task_timeline_exact_coverage_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_exact_coverage_001",
        promptRunId: "run_timeline_exact_coverage_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/selected evidence|coverage|exactly once|duplicate|overlap|unknown/i);
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

  it("replays two timeline items that share one aggregate artifact and handoff provenance", async () => {
    const registry = createContextPackRegistry();
    const sharedArtifactHash = hash("d");
    const sharedSourceEventIds = ["evt_timeline_shared_001", "evt_timeline_shared_002"];
    registerTimelineDraftSummaryContextPack(registry, {
      scope: { kind: "investigation", id: "investigation_shared_timeline_001" },
      generatedAt: sourcedGeneratedAt,
      safeSummary: "Two advisory timeline items share one replayed aggregate artifact.",
      sourceEventIds: sharedSourceEventIds,
      items: [{
        itemId: "timeline_shared_001",
        artifactHash: sharedArtifactHash,
        summary: "The first item retains the shared aggregate provenance.",
        uncertaintyCategories: ["date-precision"],
        sourceEventIds: sharedSourceEventIds
      }, {
        itemId: "timeline_shared_002",
        artifactHash: sharedArtifactHash,
        summary: "The second item retains the shared aggregate provenance.",
        uncertaintyCategories: ["date-precision"],
        sourceEventIds: sharedSourceEventIds
      }],
      omissions: []
    });

    const resolved = await registry.buildResolved("timeline-draft-summary.v1");
    expect(resolved.ref.artifactHashes).toEqual([sharedArtifactHash]);
    expect(resolved.ref.sourceEventIds).toEqual(sharedSourceEventIds);
    expect(resolved.payload).toMatchObject({
      items: [
        { itemId: "timeline_shared_001", artifactHash: sharedArtifactHash, sourceEventIds: sharedSourceEventIds },
        { itemId: "timeline_shared_002", artifactHash: sharedArtifactHash, sourceEventIds: sharedSourceEventIds }
      ]
    });

    const duplicateItemRegistry = createContextPackRegistry();
    expect(() => registerTimelineDraftSummaryContextPack(duplicateItemRegistry, {
      scope: { kind: "investigation", id: "investigation_duplicate_timeline_001" },
      generatedAt: sourcedGeneratedAt,
      safeSummary: "Duplicate timeline item identity must remain invalid.",
      sourceEventIds: sharedSourceEventIds,
      items: [0, 1].map(() => ({
        itemId: "timeline_duplicate_001",
        artifactHash: sharedArtifactHash,
        summary: "A duplicate item must not become ambiguous replay state.",
        uncertaintyCategories: [],
        sourceEventIds: sharedSourceEventIds
      })),
      omissions: []
    })).toThrow(/item ids.*unique/i);

    const mismatchedProvenanceRegistry = createContextPackRegistry();
    expect(() => registerTimelineDraftSummaryContextPack(mismatchedProvenanceRegistry, {
      scope: { kind: "investigation", id: "investigation_mismatched_timeline_001" },
      generatedAt: sourcedGeneratedAt,
      safeSummary: "Mismatched timeline provenance must remain invalid.",
      sourceEventIds: ["evt_timeline_unrelated_001"],
      items: [{
        itemId: "timeline_mismatched_001",
        artifactHash: sharedArtifactHash,
        summary: "An item cannot escape its exact handoff provenance.",
        uncertaintyCategories: [],
        sourceEventIds: sharedSourceEventIds
      }],
      omissions: []
    })).toThrow(/source events.*exactly match/i);
  });

  it.each([
    {
      runType: "timeline-builder" as const,
      field: "summary" as const,
      value: "The reviewer rejected the assertion."
    },
    {
      runType: "timeline-builder" as const,
      field: "uncertaintyNotes" as const,
      value: "Should the reviewer contest the claim?"
    },
    {
      runType: "timeline-builder" as const,
      field: "omissionReasons" as const,
      value: "The source superseded the assertion."
    },
    {
      runType: "timeline-builder" as const,
      field: "omittedSourceReason" as const,
      value: "A reviewer should relink the claim after comparing sources."
    },
    {
      runType: "timeline-builder" as const,
      field: "unresolvedPrompts" as const,
      value: "Should the assertion be accepted?"
    },
    {
      runType: "timeline-builder" as const,
      field: "omissionReasons" as const,
      value: "The panel finalized the assertion."
    },
    {
      runType: "contradiction-finder" as const,
      field: "rationale" as const,
      value: "A reviewer should supersede the assertion after comparing the sources."
    },
    {
      runType: "contradiction-finder" as const,
      field: "confidenceCaveat" as const,
      value: "Was the claim rejected?"
    },
    {
      runType: "contradiction-finder" as const,
      field: "alternativeExplanations" as const,
      value: "A reviewer may contest the assertion."
    },
    {
      runType: "contradiction-finder" as const,
      field: "requestedFollowupEvidence" as const,
      value: "Relink the claim after obtaining the dated source."
    },
    {
      runType: "timeline-builder" as const,
      field: "summary" as const,
      value: "The reviewer re\u2011linked the claim."
    },
    {
      runType: "timeline-builder" as const,
      field: "uncertaintyNotes" as const,
      value: "The reviewer re\u2014linked the claim."
    },
    {
      runType: "contradiction-finder" as const,
      field: "rationale" as const,
      value: "The reviewer re\u00b7jected the assertion."
    },
    {
      runType: "contradiction-finder" as const,
      field: "requestedFollowupEvidence" as const,
      value: "The reviewer re\u200bjected the assertion."
    },
    {
      runType: "timeline-builder" as const,
      field: "unresolvedPrompts" as const,
      value: "Should the assertion be re\u034fjected?"
    },
    {
      runType: "contradiction-finder" as const,
      field: "alternativeExplanations" as const,
      value: "A reviewer should re\u2060link the claim."
    }
  ])("rejects governed $field prose for $runType before artifact storage: $value", async ({ runType, field, value }) => {
    const store = memoryArtifactStore();
    let rejected = false;
    if (runType === "timeline-builder") {
      const output = sourcedTimelineOutput();
      switch (field) {
        case "summary":
          output.timelineItems[0] = { ...output.timelineItems[0]!, summary: value };
          break;
        case "uncertaintyNotes":
          output.timelineItems[0] = { ...output.timelineItems[0]!, uncertaintyNotes: [value] };
          break;
        case "omissionReasons":
          output.omissionReasons = [value];
          break;
        case "omittedSourceReason":
          output.omittedSources = [{ ...output.omittedSources[0]!, reason: value }];
          break;
        case "unresolvedPrompts":
          output.unresolvedPrompts = [value];
          break;
      }
      try {
        await executeSourcedInvestigationWorkflow({
          runType,
          runId: "run_timeline_neutrality_001",
          taskId: "task_timeline_neutrality_001",
          ...await sourcedWorkflowAuthority({
            runType,
            taskId: "task_timeline_neutrality_001",
            promptRunId: "run_timeline_neutrality_001"
          }),
          artifactStore: store,
          execution: { mode: "fake", invoke: async () => output }
        });
      } catch (error) {
        rejected = true;
        expect(error).toBeInstanceOf(Error);
      }
    } else {
      const output = sourcedContradictionOutput();
      const candidate = output.candidates[0]!;
      switch (field) {
        case "rationale":
          output.candidates[0] = { ...candidate, rationale: value };
          break;
        case "confidenceCaveat":
          output.candidates[0] = { ...candidate, confidenceCaveat: value };
          break;
        case "alternativeExplanations":
          output.candidates[0] = { ...candidate, alternativeExplanations: [value] };
          break;
        case "requestedFollowupEvidence":
          output.candidates[0] = { ...candidate, requestedFollowupEvidence: [value] };
          break;
      }
      try {
        await executeSourcedInvestigationWorkflow({
          runType,
          runId: "run_contradiction_neutrality_001",
          taskId: "task_contradiction_neutrality_001",
          ...await sourcedWorkflowAuthority({
            runType,
            taskId: "task_contradiction_neutrality_001",
            promptRunId: "run_contradiction_neutrality_001"
          }),
          artifactStore: store,
          execution: { mode: "fake", invoke: async () => output }
        });
      } catch (error) {
        rejected = true;
        expect(error).toBeInstanceOf(Error);
      }
    }
    expect({ rejected, storedArtifacts: store.putCount() }).toEqual({
      rejected: true,
      storedArtifacts: 0
    });
  });

  it("accepts neutral source comparison, rationale, alternative, and follow-up prose", async () => {
    const timelineStore = memoryArtifactStore();
    const timelineOutput = sourcedTimelineOutput();
    timelineOutput.timelineItems[0] = {
      ...timelineOutput.timelineItems[0]!,
      summary: "Source A records March\u2014source B records April.",
      uncertaintyNotes: ["The exact sources use day\u2011level and month\u2011level precision."]
    };
    timelineOutput.unresolvedPrompts = ["Request a source with day-level date precision."];
    const timeline = await executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_neutral_prose_001",
      taskId: "task_timeline_neutral_prose_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_neutral_prose_001",
        promptRunId: "run_timeline_neutral_prose_001"
      }),
      artifactStore: timelineStore,
      execution: { mode: "fake", invoke: async () => timelineOutput }
    });
    expect(timeline).toMatchObject({
      artifact: { truthBoundary: { advisoryOnly: true, acceptedGraphMutationAllowed: false } }
    });
    expect(timeline.handoffMaterial.nextSafeActions).toEqual([
      expect.objectContaining({ label: "Human review required", kind: "review", effect: "none" })
    ]);
    expect(Object.isFrozen(timeline.artifact)).toBe(true);
    expect(Object.isFrozen(timeline.handoffMaterial.nextSafeActions[0])).toBe(true);
    expect(timelineStore.putCount()).toBeGreaterThan(0);

    const contradictionStore = memoryArtifactStore();
    const contradictionOutput = sourcedContradictionOutput();
    contradictionOutput.candidates[0] = {
      ...contradictionOutput.candidates[0]!,
      rationale: "The exact sources record different dates\u00b7one in March and one in April.",
      confidenceCaveat: "The comparison is limited to selected source\u200b bytes.",
      alternativeExplanations: ["The records may describe different reporting periods."],
      requestedFollowupEvidence: ["Request a dated source that distinguishes the reporting periods."]
    };
    const contradiction = await executeSourcedInvestigationWorkflow({
      runType: "contradiction-finder",
      runId: "run_contradiction_neutral_prose_001",
      taskId: "task_contradiction_neutral_prose_001",
      ...await sourcedWorkflowAuthority({
        runType: "contradiction-finder",
        taskId: "task_contradiction_neutral_prose_001",
        promptRunId: "run_contradiction_neutral_prose_001"
      }),
      artifactStore: contradictionStore,
      execution: { mode: "fake", invoke: async () => contradictionOutput }
    });
    expect(contradiction).toMatchObject({
      artifact: {
        truthBoundary: {
          advisoryOnly: true,
          canRejectAssertion: false,
          canContestAssertion: false,
          canSupersedeAssertion: false,
          canRelinkClaim: false,
          acceptedGraphMutationAllowed: false
        },
        candidates: [{ requiredReviewerAction: "request-evidence" }]
      }
    });
    const replayedArtifact = JSON.parse(contradiction.artifactBytes.toString("utf8")) as {
      readonly truthBoundary: Readonly<Record<string, boolean>>;
      readonly candidates: readonly { readonly requiredReviewerAction: string }[];
    };
    expect(replayedArtifact).toMatchObject({
      truthBoundary: {
        advisoryOnly: true,
        canRejectAssertion: false,
        canContestAssertion: false,
        canSupersedeAssertion: false,
        canRelinkClaim: false,
        acceptedGraphMutationAllowed: false,
        publicationAllowed: false
      },
      candidates: [{ requiredReviewerAction: "request-evidence" }]
    });
    const replayedHandoff = parseSpecialistHandoffMaterial(JSON.parse(
      contradiction.handoffMaterialBytes.toString("utf8")
    ));
    expect(replayedHandoff.nextSafeActions).toEqual([
      expect.objectContaining({ label: "Human review required", kind: "review", effect: "none" })
    ]);
    expect(replayedHandoff.outputArtifacts[0]?.artifactHash).toBe(contradiction.artifactHash);
    expect(Object.isFrozen(contradiction.artifact)).toBe(true);
    if (contradiction.artifact.schemaVersion !== "contradiction-candidate-dossier.v1") {
      throw new Error("Expected contradiction candidate dossier artifact.");
    }
    expect(Object.isFrozen(contradiction.artifact.candidates[0])).toBe(true);
    expect(Object.isFrozen(contradiction.handoffMaterial.nextSafeActions[0])).toBe(true);
    expect(contradictionStore.putCount()).toBeGreaterThan(0);
  });

  it.each([
    { label: "invalid calendar day", date: "2026-99-99", precision: "day" as const },
    { label: "non-leap February day", date: "2026-02-29", precision: "day" as const },
    { label: "non-leap century day", date: "1900-02-29", precision: "day" as const },
    { label: "invalid month day", date: "2026-04-31", precision: "day" as const },
    { label: "day with month precision", date: "2026-04-30", precision: "month" as const },
    { label: "month with year precision", date: "2026-04", precision: "year" as const },
    { label: "year with day precision", date: "2026", precision: "day" as const }
  ])("rejects timeline $label before artifact storage", async ({ date, precision }) => {
    const store = memoryArtifactStore();
    const output = sourcedTimelineOutput();
    const { dateRange: _dateRange, ...base } = output.timelineItems[0]!;
    output.timelineItems[0] = { ...base, date, precision };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_invalid_date_001",
      taskId: "task_timeline_invalid_date_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_invalid_date_001",
        promptRunId: "run_timeline_invalid_date_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/date|precision|calendar/i);
    expect(store.putCount()).toBe(0);
  });

  it.each([
    {
      label: "both date and range",
      values: { date: "2026-03-01", dateRange: { start: "2026-03-01", end: "2026-03-31" }, precision: "range" as const }
    },
    {
      label: "reversed range",
      values: { dateRange: { start: "2026-03-31", end: "2026-03-01" }, precision: "range" as const }
    },
    {
      label: "range with day precision",
      values: { dateRange: { start: "2026-03-01", end: "2026-03-31" }, precision: "day" as const }
    }
  ])("rejects timeline $label before artifact storage", async ({ values }) => {
    const store = memoryArtifactStore();
    const output = sourcedTimelineOutput();
    output.timelineItems[0] = { ...output.timelineItems[0]!, ...values };

    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_invalid_range_001",
      taskId: "task_timeline_invalid_range_001",
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: "task_timeline_invalid_range_001",
        promptRunId: "run_timeline_invalid_range_001"
      }),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => output }
    })).rejects.toThrow(/date|range|precision/i);
    expect(store.putCount()).toBe(0);
  });

  it.each([
    { date: "2026", precision: "year" as const },
    { date: "2026-02", precision: "month" as const },
    { date: "2024-02-29", precision: "day" as const },
    { date: "2000-02-29", precision: "day" as const }
  ])("preserves a valid $precision timeline date", async ({ date, precision }) => {
    const output = sourcedTimelineOutput();
    const { dateRange: _dateRange, ...base } = output.timelineItems[0]!;
    output.timelineItems[0] = { ...base, date, precision };
    const result = await executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: `run_timeline_valid_${precision}_001`,
      taskId: `task_timeline_valid_${precision}_001`,
      ...await sourcedWorkflowAuthority({
        runType: "timeline-builder",
        taskId: `task_timeline_valid_${precision}_001`,
        promptRunId: `run_timeline_valid_${precision}_001`
      }),
      artifactStore: memoryArtifactStore(),
      execution: { mode: "fake", invoke: async () => output }
    });
    expect(result.artifact).toMatchObject({ items: [{ date, precision }] });
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

  it("assembles a citation-complete local report while keeping the default preview public-safe", () => {
    const packet = assembleLocalReportPacket({
      runId: "run_report_packet_001",
      taskId: "task_report_packet_001",
      generatedAt: "2026-08-04T12:00:00.000Z",
      governanceEvents: goldenGovernanceLedgerEvents,
      requestedEvidenceIds: ["ev_source_public", "ev_source_private"],
      acceptedAssertions: [{
        assertionId: "assertion_report_public_001",
        evidenceId: "ev_source_public",
        evidenceContentHash: hash("1"),
        proposedByEventId: "evt_assertion_report_proposed_001",
        acceptedByEventId: "evt_assertion_report_accepted_001",
        sourceEventIds: ["evt_assertion_report_proposed_001", "evt_assertion_report_accepted_001"],
        safeStatement: "The public agenda records the meeting date."
      }],
      reviewedClaims: [{
        claimId: "claim_report_private_001",
        evidenceId: "ev_source_private",
        evidenceContentHash: hash("2"),
        reviewedByEventId: "evt_claim_report_reviewed_001",
        sourceEventIds: ["evt_claim_report_reviewed_001"],
        safeStatement: "A reviewed private note identifies a disputed response date."
      }],
      passages: [{
        passageId: "passage_report_public_001",
        sectionId: "section_report_findings",
        sectionTitle: "Findings",
        text: "The public agenda records the meeting date.",
        sourceRefs: ["assertion_report_public_001"]
      }, {
        passageId: "passage_report_private_001",
        sectionId: "section_report_findings",
        sectionTitle: "Findings",
        text: "A reviewed private note identifies a disputed response date.",
        sourceRefs: ["claim_report_private_001"]
      }],
      uncertaintyNotes: [{
        noteId: "risk_uncertain_date_001",
        summary: "The exact response date remains uncertain.",
        sourceRefs: ["claim_report_private_001"]
      }],
      contradictionCandidates: [{
        candidateId: "contradiction_report_001",
        rationale: "The reviewed date conflicts with the public chronology.",
        confidenceCaveat: "The private record still requires source review.",
        sourceRefs: ["assertion_report_public_001", "claim_report_private_001"]
      }]
    });

    expect(packet.truthBoundary).toEqual({
      localDerivativeOnly: true,
      advisoryOnly: true,
      exportAllowed: false,
      publicationAllowed: false,
      sensitiveOptInConsumed: false
    });
    expect(packet.citationMap).toEqual([
      expect.objectContaining({
        passageId: "passage_report_public_001",
        acceptedAssertionRefs: ["assertion_report_public_001"],
        reviewedClaimRefs: [],
        evidenceCitations: [{ evidenceId: "ev_source_public", contentHash: hash("1") }]
      }),
      expect.objectContaining({
        passageId: "passage_report_private_001",
        acceptedAssertionRefs: [],
        reviewedClaimRefs: ["claim_report_private_001"],
        evidenceCitations: [{ evidenceId: "ev_source_private", contentHash: hash("2") }]
      })
    ]);
    expect(packet.riskNotes.map((note) => note.kind)).toEqual(["contradiction", "uncertainty"]);
    expect(packet.publicSafePreview.includedEvidence.map((item) => item.evidenceRef)).toEqual(["ev_source_public"]);
    expect(packet.publicSafePreview.excludedEvidence.map((item) => item.evidenceRef)).toEqual(["ev_source_private"]);
    expect(packet.sensitiveOptInRequirements).toEqual([{
      evidenceRef: "ev_source_private",
      category: "private",
      approvalId: "human-approve-private-evidence-inclusion"
    }]);
    expect(JSON.stringify(packet.publicSafePreview)).not.toContain("reviewed private note");
  });

  it("blocks report readiness when a factual passage lacks an exact citation", () => {
    expect(() => assembleLocalReportPacket({
      runId: "run_report_missing_citation_001",
      taskId: "task_report_missing_citation_001",
      generatedAt: "2026-08-04T12:00:00.000Z",
      governanceEvents: goldenGovernanceLedgerEvents,
      requestedEvidenceIds: ["ev_source_public"],
      acceptedAssertions: [],
      reviewedClaims: [],
      passages: [{
        passageId: "passage_report_missing_citation_001",
        sectionId: "section_report_findings",
        sectionTitle: "Findings",
        text: "An uncited factual statement must not become ready.",
        sourceRefs: ["assertion_missing_001"]
      }],
      uncertaintyNotes: [],
      contradictionCandidates: []
    })).toThrow("Every factual report passage requires an exact accepted-assertion or reviewed-claim citation.");
  });
});

function sourcedTimelineOutput(): TimelineBuilderSourcedTimelineOutput {
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
