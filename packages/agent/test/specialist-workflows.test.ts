import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { buildResolvedContextPack } from "../src/context-packs.js";
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
      contextPacks: sourcedContextPacks(),
      ...promptArtifact(),
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
      contextPacks: sourcedContextPacks(),
      ...promptArtifact(),
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
      contextPacks: sourcedContextPacks(),
      ...promptArtifact(),
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

  it("blocks remote context transfer before executor or store access", async () => {
    let executorCalls = 0;
    const store = memoryArtifactStore();
    await expect(executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_remote_001",
      taskId: "task_timeline_remote_001",
      contextPacks: sourcedContextPacks(),
      ...promptArtifact(),
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
    const result = await executeSourcedInvestigationWorkflow({
      runType: "timeline-builder",
      runId: "run_timeline_replay_001",
      taskId: "task_timeline_replay_001",
      contextPacks: replayContextPacks(sourceEventIds as [string, string, string]),
      ...promptArtifact(),
      artifactStore: store,
      execution: { mode: "fake", invoke: async () => replayTimelineOutput() }
    });
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
      contentHashRefs: [hash("a")],
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

function replayContextPacks(sourceEventIds: readonly [string, string, string]) {
  const common = {
    version: 1,
    generatedAt: "2026-08-03T12:00:00.000Z",
    safeSummary: "Exact replay source context.",
    provenanceRefs: [...sourceEventIds],
    sourceEventIds: [...sourceEventIds]
  };
  return [
    buildResolvedContextPack({
      ...common,
      contextPackId: "evidence-summary.v1",
      payload: { items: [{
        evidenceId: "ev_replay_001",
        ingestionEventId: sourceEventIds[0],
        contentHash: hash("a")
      }] }
    }),
    buildResolvedContextPack({
      ...common,
      contextPackId: "accepted-graph-projection.v1",
      payload: { items: { assertions: [{
        assertionId: "assertion_replay_001",
        evidenceId: "ev_replay_001",
        evidenceContentHash: hash("a"),
        proposedByEventId: sourceEventIds[1],
        acceptedByEventId: sourceEventIds[2],
        sourceEventIds: [sourceEventIds[1], sourceEventIds[2]],
        rowHash: hash("b"),
        safeStatement: "The replay source has a reviewed date."
      }], entities: [], relationships: [] } }
    })
  ];
}

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
      payload: { items: [{ itemId: "timeline_source_001", summary: "A prior sourced timeline item.", artifactHash: hash("d") }], omissions: [] }
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

function promptArtifact() {
  const promptArtifactBytes = Buffer.from("canonical sourced investigation prompt", "utf8");
  return Object.freeze({
    promptArtifactBytes,
    promptArtifactHash: hashBytes(promptArtifactBytes)
  });
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
