import { describe, expect, it } from "vitest";
import {
  agentCockpitDtoSchema,
  buildAgentCockpit
} from "../src/cockpit.js";
import {
  buildAgentApprovalCockpit,
  type AgentApprovalCockpitDto
} from "../src/approval-cockpit.js";
import type {
  ProjectedAgentContextPackRef,
  ProjectedAgentModelInvocation
} from "../src/projection-types.js";
import type { AgentStatusDto } from "../src/runtime-types.js";
import type { SpecialistWorkflowHandoffDto } from "../src/specialist-handoffs.js";
import {
  assembleTaskOrchestratorContext,
  assertTaskOrchestratorContextHasNoPayloadBytes
} from "../src/task-orchestrator-context.js";
import {
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../src/context-packs.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";

const hashA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const hashC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const hashD = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const hashE = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

describe("agent cockpit dto", () => {
  it("does not expose resolved payload bytes in cockpit projection", async () => {
    const workflow = specialistWorkflowDescriptorFor("evidence-triage");
    const registry = createContextPackRegistry();
    for (const requirement of workflow.contextPacks) {
      registry.register({
        descriptor: {
          contextPackId: requirement.contextPackId,
          version: 1,
          label: `Cockpit ${requirement.contextPackId}`,
          maxBytes: 16_384,
          requiredProvenanceKinds: ["event-id"],
          redactionPolicy: "safe-summary",
          sourceProjection: "agent.projection"
        },
        build: () => ({
          contextPackId: requirement.contextPackId,
          version: 1,
          generatedAt: "2026-07-12T05:00:00.000Z",
          payload: { secretPayloadMarker: "cockpit-must-not-see-this" },
          safeSummary: `Safe ${requirement.contextPackId} metadata.`,
          provenanceRefs: ["evt_cockpit_context"]
        }),
        parsePayload: productionParser(requirement.contextPackId)
      });
    }
    const assembled = await assembleTaskOrchestratorContext({
      taskId: "task_task4_cockpit_leakage",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      workflow,
      contextRegistry: registry
    });
    const cockpit = buildAgentCockpit({ status: statusFixture(), selectedRunId: "run_provider_review" });

    assertTaskOrchestratorContextHasNoPayloadBytes(
      [cockpit, assembled.cockpitContext],
      assembled.resolvedContextPacks
    );
  });
  it("surfaces resident identity lifecycle as the first cockpit need when blocked", () => {
    const cockpit = buildAgentCockpit({
      status: {
        ...statusFixture(),
        identityLifecycle: {
          schemaVersion: "resident-identity-lifecycle.v1",
          state: "blocked",
          residentAgentId: "agent_default",
          workspaceId: "ws_blocked_identity",
          initialized: false,
          eventIds: [],
          safeMessage: "Resident identity belongs to a different workspace.",
          allowedRepairActions: ["inspect resident identity events before retrying"]
        }
      }
    });

    expect(cockpit.needsNext[0]).toMatchObject({
      kind: "lock",
      severity: "action-required",
      label: "Resident identity belongs to a different workspace.",
      safeAction: "refresh-status"
    });
  });

  it("summarizes task queue, active run, approvals, and what the agent needs next", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture(),
      approvalCockpit: approvalCockpitFixture(),
      selectedRunId: "run_provider_review",
      generatedAt: "2026-07-09T12:00:00.000Z",
      mergeAfterScheduler: true
    });

    expect(agentCockpitDtoSchema.parse(cockpit)).toEqual(cockpit);
    expect(cockpit.schemaVersion).toBe("agent-cockpit.v1");
    expect(cockpit.summary).toMatchObject({
      activeTaskCount: 2,
      activeRunCount: 1,
      pendingApprovalCount: 1,
      activeLockCount: 1,
      mergeAfterScheduler: true
    });
    expect(cockpit.taskQueue.map((task) => task.taskId)).toEqual([
      "task_provider_review",
      "task_unstarted"
    ]);
    expect(cockpit.runQueue[0]).toMatchObject({
      runId: "run_provider_review",
      taskId: "task_provider_review",
      runType: "evidence-triage",
      state: "running",
      currentStepCount: 1,
      modelInvocationCount: 2,
      pendingApprovalCount: 1
    });
    expect(cockpit.selectedRun?.runId).toBe("run_provider_review");
    expect(cockpit.needsNext[0]).toMatchObject({
      kind: "approval",
      severity: "action-required",
      label: "Review provider byte-transfer approval",
      relatedRunId: "run_provider_review",
      relatedTaskId: "task_provider_review",
      safeAction: "review-approval"
    });
    expect(cockpit.needsNext).toContainEqual(expect.objectContaining({
      kind: "queued-task",
      safeAction: "queued-task",
      relatedTaskId: "task_unstarted"
    }));
    expect(cockpit.specialists.registry.schemaVersion).toBe("agent-specialist-workflow-registry.v1");
    expect(cockpit.specialists.registry.descriptors.map((descriptor) => descriptor.runType)).toEqual([
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]);
    expect(cockpit.specialists.readiness.every((readiness) => readiness.executionReady === false)).toBe(true);
    expect(cockpit.forbiddenDirectEffects).toContain("provider-byte-transfer");
    expect(JSON.stringify(cockpit)).not.toMatch(/raw-token|authorization|bearer|sk_live|password/i);
  });

  it("projects model invocation audit, context packs, memory snippets, and does not invent handoffs from run hashes", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture({ completedRun: true }),
      generatedAt: "2026-07-09T12:05:00.000Z",
      selectedRunId: "run_report_done"
    });

    expect(cockpit.selectedRun?.modelInvocations).toContainEqual(expect.objectContaining({
      invocationId: "inv_report_done",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      status: "completed",
      inputArtifactHash: hashA,
      outputArtifactHash: hashB,
      omissionCount: 2,
      usageSummary: "12 input, 8 output, 20 total"
    }));
    expect(cockpit.selectedRun?.contextPacks).toContainEqual(expect.objectContaining({
      contextPackId: "task-run-history.v1",
      contentHash: hashC,
      safeSummary: "Prior agent task history.",
      stalenessInputCount: 3
    }));
    expect(cockpit.memorySnippets).toContainEqual(expect.objectContaining({
      memoryId: "mem_case_goal",
      scope: "investigation",
      summary: "Keep PRR drafts human-reviewed."
    }));
    expect(cockpit.selectedRun?.handoff).toBeUndefined();
    expect(cockpit.needsNext.some((action) => action.kind === "handoff")).toBe(false);
    expect(cockpit.needsNext).not.toContainEqual(expect.objectContaining({
      kind: "handoff",
      relatedRunId: "run_report_done"
    }));
  });

  it("projects canonical specialist handoffs when the runtime supplies real handoff DTOs", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture({ completedRun: true }),
      generatedAt: "2026-07-09T12:06:00.000Z",
      selectedRunId: "run_report_done",
      specialistHandoffs: [reportBuilderHandoffFixture()]
    });

    expect(cockpit.selectedRun?.handoff).toMatchObject({
      schemaVersion: "agent-specialist-handoff.v1",
      runType: "report-builder",
      runId: "run_report_done",
      status: "ready-for-review",
      safeSummary: "Draft report outline ready for human review.",
      outputArtifacts: [expect.objectContaining({
        artifactId: "artifact_report_outline",
        artifactKind: "report-outline",
        schemaId: "report-builder-handoff.v1",
        artifactHash: hashD
      })],
      nextSafeActions: [expect.objectContaining({
        actionId: "action_review_report_outline",
        effect: "none"
      })]
    });
    expect(cockpit.needsNext).toContainEqual(expect.objectContaining({
      kind: "handoff",
      relatedRunId: "run_report_done",
      safeAction: "review-handoff"
    }));
  });

  it("joins durable resident plan and observation history only to the exact selected run and task", () => {
    const attemptId = "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cockpit = buildAgentCockpit({
      status: statusFixture({ completedRun: true }),
      generatedAt: "2026-07-09T12:06:15.000Z",
      selectedRunId: "run_report_done",
      residentPlans: [
        {
          eventId: "evt_plan_report_revision_1",
          runId: "run_report_done",
          taskId: "task_report_done",
          attemptId,
          planId: "plan_report_revision_1",
          planRevision: 1,
          recordedAt: "2026-07-09T11:02:00.000Z",
          steps: [{
            ordinal: 1,
            purpose: "Revise the local report outline.",
            toolId: "local.report-outline",
            expectedSafeOutputClass: "derivative"
          }]
        },
        {
          eventId: "evt_plan_report_revision_0",
          runId: "run_report_done",
          taskId: "task_report_done",
          attemptId,
          planId: "plan_report_revision_0",
          planRevision: 0,
          recordedAt: "2026-07-09T11:01:00.000Z",
          steps: [{
            ordinal: 1,
            purpose: "Prepare the local report outline.",
            toolId: "local.report-outline",
            expectedSafeOutputClass: "derivative"
          }]
        },
        {
          eventId: "evt_plan_wrong_task",
          runId: "run_report_done",
          taskId: "task_other_report",
          attemptId,
          planId: "plan_wrong_task",
          planRevision: 0,
          recordedAt: "2026-07-09T11:00:00.000Z",
          steps: [{
            ordinal: 1,
            purpose: "Unrelated task plan.",
            toolId: "local.report-outline",
            expectedSafeOutputClass: "derivative"
          }]
        }
      ],
      residentObservations: [
        {
          eventId: "evt_observation_report",
          runId: "run_report_done",
          taskId: "task_report_done",
          attemptId,
          observationId: "observation_report",
          planId: "plan_report_revision_1",
          planRevision: 1,
          stepOrdinal: 1,
          kind: "tool-result",
          safeSummary: "Revised report outline recorded locally.",
          artifactHashes: [hashD],
          recordedAt: "2026-07-09T11:03:00.000Z"
        },
        {
          eventId: "evt_observation_wrong_task",
          runId: "run_report_done",
          taskId: "task_other_report",
          attemptId,
          observationId: "observation_wrong_task",
          planId: "plan_wrong_task",
          planRevision: 0,
          stepOrdinal: 1,
          kind: "tool-result",
          safeSummary: "Unrelated task observation.",
          artifactHashes: [hashE],
          recordedAt: "2026-07-09T11:00:30.000Z"
        }
      ]
    });

    expect(cockpit.selectedRun?.planHistory.map((plan) => plan.eventId)).toEqual([
      "evt_plan_report_revision_0",
      "evt_plan_report_revision_1"
    ]);
    expect(cockpit.selectedRun?.observationHistory.map((observation) => observation.eventId)).toEqual([
      "evt_observation_report"
    ]);
  });

  it("ignores supplied specialist handoffs that do not exactly match run, run type, and task", () => {
    const wrongRunType = {
      ...reportBuilderHandoffFixture(),
      runType: "evidence-triage"
    } satisfies SpecialistWorkflowHandoffDto;
    const wrongTask = {
      ...reportBuilderHandoffFixture(),
      taskId: "task_other_report"
    } satisfies SpecialistWorkflowHandoffDto;
    const cockpit = buildAgentCockpit({
      status: statusFixture({ completedRun: true }),
      generatedAt: "2026-07-09T12:06:30.000Z",
      selectedRunId: "run_report_done",
      specialistHandoffs: [wrongRunType, wrongTask]
    });

    expect(cockpit.selectedRun?.handoff).toBeUndefined();
    expect(cockpit.needsNext).not.toContainEqual(expect.objectContaining({
      kind: "handoff",
      relatedRunId: "run_report_done"
    }));
  });

  it("surfaces blocked canonical specialist readiness with exact missing contracts, context, provider, and adapters", () => {
    const { providerReadiness: _providerReadiness, ...statusWithoutProviderReadiness } = statusFixture();
    const cockpit = buildAgentCockpit({
      status: {
        ...statusWithoutProviderReadiness,
        locks: [],
        activeLockCount: 0
      },
      generatedAt: "2026-07-09T12:07:00.000Z",
      availableSpecialistContracts: ["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"],
      availableDomainAdapterFamilies: [
        "provider-byte-transfer",
        "prr-correspondence",
        "accepted-graph-review",
        "export-report",
        "destructive-repair",
        "legacy-staging"
      ]
    });

    const contradiction = cockpit.specialists.readiness.find((readiness) =>
      readiness.runType === "contradiction-finder"
    );

    expect(cockpit.specialists.readiness).toHaveLength(6);
    expect(contradiction).toMatchObject({
      schemaVersion: "agent-specialist-workflow-readiness.v1",
      runType: "contradiction-finder",
      residentAgentId: "agent_default",
      status: "blocked",
      category: "blocked-provenance",
      contextReady: false,
      executionReady: false,
      missingContractIds: [],
      missingProviderStates: [expect.objectContaining({
        providerId: "provider:missing",
        state: "provider-unavailable",
        safeActionIds: ["action_choose_provider"]
      })],
      missingPromptTemplateIds: []
    });
    expect(contradiction?.missingContextPackIds).toEqual(expect.arrayContaining([
      "accepted-graph-projection.v1",
      "timeline-draft-summary.v1",
      "workspace-runtime-status.v1"
    ]));
    expect(contradiction?.missingAdapterFamilies).toEqual(["contradiction-claim-review"]);
    expect(contradiction?.nextSafeActions).toEqual(expect.arrayContaining([
      "build context pack accepted-graph-projection.v1",
      "action_choose_provider",
      "register domain adapter family contradiction-claim-review",
      "keep specialist execution disabled until a workflow runner is approved"
    ]));
    expect(contradiction?.nextSafeActions).not.toContain("register contract agent.scheduler-resumer.v1");
    expect(contradiction?.nextSafeActions).not.toContain("register domain adapter family provider-byte-transfer");
    expect(cockpit.specialists.readiness.flatMap((readiness) => readiness.missingContractIds)).not.toEqual(
      expect.arrayContaining(["agent.scheduler-resumer.v1", "agent.domain-adapter.v1"])
    );
  });

  it("counts current blockers from pending approvals and active locks without treating retryable invocation failures as current blocks", () => {
    const cockpit = buildAgentCockpit({
      status: statusFixture(),
      approvalCockpit: approvalCockpitFixture(),
      selectedRunId: "run_provider_review",
      generatedAt: "2026-07-09T12:10:00.000Z"
    });

    expect(cockpit.runQueue[0]?.blockedReasonCount).toBe(2);
    expect(cockpit.selectedRun?.blockedReasons).toEqual([
      "pending-approval",
      "lock-legal-escalation"
    ]);
    expect(cockpit.selectedRun?.blockedReasons).not.toContain("retryable-provider-unavailable");
  });

  it("normalizes compatibility approval classes when deriving a fallback approval need without approval cockpit state", () => {
    const baseStatus = statusFixture();
    const cockpit = buildAgentCockpit({
      status: {
        ...baseStatus,
        toolRequests: [{
          ...baseStatus.toolRequests[0]!,
          requiredApprovalClass: "external-message-send"
        }]
      },
      generatedAt: "2026-07-09T12:15:00.000Z",
      selectedRunId: "run_provider_review"
    });

    expect(cockpit.needsNext[0]).toMatchObject({
      kind: "approval",
      label: "Review PRR send/follow-up approval",
      safeAction: "review-approval",
      relatedRunId: "run_provider_review",
      relatedTaskId: "task_provider_review"
    });
  });

  it("falls back to a quiet need when no higher-priority action exists", () => {
    const baseStatus = statusFixture();
    const cockpit = buildAgentCockpit({
      status: {
        ...baseStatus,
        pendingApprovalCount: 0,
        activeLockCount: 0,
        tasks: [],
        runs: [],
        modelInvocations: [],
        toolRequests: [],
        locks: []
      },
      generatedAt: "2026-07-09T12:20:00.000Z"
    });

    expect(cockpit.needsNext).toEqual([expect.objectContaining({
      kind: "quiet",
      safeAction: "refresh-status"
    })]);
  });

  it("rejects secret-shaped text before projecting a browser DTO", () => {
    expect(() =>
      buildAgentCockpit({
        status: statusFixture({
          tasks: [{
            ...statusFixture().tasks[0]!,
            title: "Review authorization bearer token flow."
          }]
        })
      })
    ).toThrow(/secret/i);
  });
});

function approvalCockpitFixture(): AgentApprovalCockpitDto {
  return buildAgentApprovalCockpit({
    status: statusFixture(),
    generatedAt: "2026-07-09T12:00:00.000Z"
  });
}

function reportBuilderHandoffFixture(): SpecialistWorkflowHandoffDto {
  return {
    schemaVersion: "agent-specialist-handoff.v1",
    handoffId: "handoff_run_report_done_0123456789abcdef",
    handoffRevision: 1,
    runType: "report-builder",
    runId: "run_report_done",
    taskId: "task_report_done",
    residentAgentId: "agent_default",
    generatedAt: "2026-07-09T11:16:00.000Z",
    status: "ready-for-review",
    safeSummary: "Draft report outline ready for human review.",
    contextPackRefs: [{
      contextPackId: "task-run-history.v1",
      version: 1,
      contentHash: hashC,
      sizeBytes: 120,
      generatedAt: "2026-07-09T11:12:00.000Z",
      safeSummary: "Prior agent task history.",
      provenanceRefs: ["evt_task_report_done"],
      sourceEventIds: ["evt_task_report_done"],
      artifactHashes: [hashA]
    }],
    outputArtifacts: [{
      artifactId: "artifact_report_outline",
      artifactKind: "report-outline",
      schemaId: "report-builder-handoff.v1",
      artifactHash: hashD,
      safeSummary: "Local draft outline artifact."
    }],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: "action_review_report_outline",
      label: "Review draft report outline",
      kind: "review",
      effect: "none",
      artifactId: "artifact_report_outline"
    }]
  };
}

function statusFixture(options: {
  readonly completedRun?: boolean;
  readonly tasks?: AgentStatusDto["tasks"];
} = {}): AgentStatusDto {
  const taskProviderReview = {
    taskId: "task_provider_review",
    residentAgentId: "agent_default",
    title: "Review provider byte-transfer approval",
    requestedBy: "actor_case_owner",
    priority: "high",
    status: "waiting-for-approval",
    createdAt: "2026-07-09T11:00:00.000Z",
    updatedAt: "2026-07-09T11:05:00.000Z",
    description: "Inspect provider readiness and pause on risky transfer.",
    sourceEventIds: ["evt_task_provider_review"],
    inputArtifactHashes: [hashA],
    changedBy: "actor_cestus_agent",
    statusReason: "Waiting for human approval on provider transfer.",
    runId: "run_provider_review",
    eventIds: ["evt_task_provider_review"],
    causationIds: ["evt_task_provider_review"]
  } satisfies AgentStatusDto["tasks"][number];

  const taskUnstarted = {
    taskId: "task_unstarted",
    residentAgentId: "agent_default",
    title: "Start report builder run",
    requestedBy: "actor_case_owner",
    priority: "normal",
    status: "queued",
    createdAt: "2026-07-09T11:10:00.000Z",
    description: "Queue a report-builder specialist run for human review.",
    sourceEventIds: ["evt_task_unstarted"],
    inputArtifactHashes: [hashE],
    eventIds: ["evt_task_unstarted"],
    causationIds: ["evt_task_unstarted"]
  } satisfies AgentStatusDto["tasks"][number];

  const taskReportDone = {
    taskId: "task_report_done",
    residentAgentId: "agent_default",
    title: "Prepare draft report outline",
    requestedBy: "actor_case_owner",
    priority: "normal",
    status: "completed",
    createdAt: "2026-07-09T10:30:00.000Z",
    updatedAt: "2026-07-09T11:15:00.000Z",
    description: "Completed draft handoff for human review.",
    sourceEventIds: ["evt_task_report_done"],
    inputArtifactHashes: [hashA],
    changedBy: "actor_cestus_agent",
    statusReason: "Handoff artifact bundle ready.",
    runId: "run_report_done",
    eventIds: ["evt_task_report_done"],
    causationIds: ["evt_task_report_done"]
  } satisfies AgentStatusDto["tasks"][number];

  const runningContextPack = {
    contextPackId: "accepted-graph-projection.v1",
    version: 1,
    contentHash: hashE,
    sizeBytes: 180,
    generatedAt: "2026-07-09T11:01:00.000Z",
    safeSummary: "Accepted graph review snapshot.",
    provenanceRefs: ["evt_task_provider_review"],
    sourceEventIds: ["evt_task_provider_review"],
    artifactHashes: [hashA]
  } satisfies ProjectedAgentContextPackRef;

  const completedContextPack = {
    contextPackId: "task-run-history.v1",
    version: 1,
    contentHash: hashC,
    sizeBytes: 120,
    generatedAt: "2026-07-09T11:12:00.000Z",
    safeSummary: "Prior agent task history.",
    provenanceRefs: ["evt_task_report_done"],
    sourceEventIds: ["evt_task_report_done"],
    artifactHashes: [hashA],
    stalenessInputs: [
      { kind: "projection", ref: "agent-projection", value: "18" },
      { kind: "event", ref: "evt_task_report_done", value: "present" },
      { kind: "artifact", ref: hashA, value: "sha256-bound" }
    ]
  } satisfies ProjectedAgentContextPackRef;

  const runProviderReview = {
    runId: "run_provider_review",
    residentAgentId: "agent_default",
    runType: "evidence-triage",
    state: "running",
    startedBy: "actor_cestus_agent",
    startedAt: "2026-07-09T11:01:00.000Z",
    taskId: "task_provider_review",
    workspaceId: "ws_case_001",
    sourceEventIds: ["evt_task_provider_review"],
    inputArtifactHashes: [hashA],
    relatedEventIds: ["evt_tool_provider_review"],
    outputArtifactHashes: [],
    stepIds: ["step_provider_review"],
    invocationIds: ["inv_provider_failed", "inv_provider_done"],
    toolRequestIds: ["toolreq_provider_review"],
    allowedActions: ["wait-for-approval"],
    summary: "Reviewing provider readiness before any byte transfer.",
    eventIds: ["evt_run_provider_review"],
    causationIds: ["evt_task_provider_review"]
  } satisfies AgentStatusDto["runs"][number];

  const runReportDone = {
    runId: "run_report_done",
    residentAgentId: "agent_default",
    runType: "report-builder",
    state: "completed",
    startedBy: "actor_cestus_agent",
    startedAt: "2026-07-09T10:40:00.000Z",
    taskId: "task_report_done",
    workspaceId: "ws_case_001",
    sourceEventIds: ["evt_task_report_done"],
    inputArtifactHashes: [hashA],
    relatedEventIds: ["evt_report_handoff"],
    outputArtifactHashes: [hashD],
    stepIds: ["step_report_outline"],
    invocationIds: ["inv_report_done"],
    toolRequestIds: [],
    completedAt: "2026-07-09T11:15:00.000Z",
    allowedActions: ["review-handoff"],
    summary: "Draft report outline produced.",
    eventIds: ["evt_run_report_done"],
    causationIds: ["evt_task_report_done"]
  } satisfies AgentStatusDto["runs"][number];

  const toolRequest = {
    toolRequestId: "toolreq_provider_review",
    runId: "run_provider_review",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    requestedBy: "agent_default",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash: hashA,
    scope: "Selected evidence excerpts for provider processing.",
    estimatedEffect: "Send selected evidence excerpts to the configured provider after approval.",
    state: "requested",
    requestedAt: "2026-07-09T11:04:00.000Z",
    sourceEventIds: ["evt_tool_provider_review"],
    inputArtifactHashes: [hashA],
    resultEventIds: [],
    artifactHashes: [],
    readModelChanges: [],
    allowedActions: [],
    eventIds: ["evt_tool_provider_review"],
    causationIds: ["evt_run_provider_review"]
  } satisfies AgentStatusDto["toolRequests"][number];

  const invocations: ProjectedAgentModelInvocation[] = [
    {
      invocationId: "inv_provider_failed",
      runId: "run_provider_review",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      inputArtifactHash: hashA,
      safetyClass: "workspace-safe",
      status: "failed",
      requestedAt: "2026-07-09T11:02:00.000Z",
      contextPackRefs: [runningContextPack],
      omissions: [],
      failureCategory: "provider-unavailable",
      failureMessage: "Provider unavailable during retryable check.",
      retryable: true,
      allowedActions: ["retry-run"],
      eventIds: ["evt_inv_provider_failed"],
      causationIds: ["evt_run_provider_review"]
    },
    {
      invocationId: "inv_provider_done",
      runId: "run_provider_review",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      inputArtifactHash: hashE,
      safetyClass: "provider-approved",
      status: "completed",
      requestedAt: "2026-07-09T11:03:00.000Z",
      contextPackRefs: [runningContextPack],
      omissions: [],
      transferApprovalClass: "provider-byte-transfer",
      providerOutputArtifactHash: hashB,
      completedAt: "2026-07-09T11:03:10.000Z",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18
      },
      allowedActions: [],
      eventIds: ["evt_inv_provider_done"],
      causationIds: ["evt_run_provider_review"]
    }
  ];

  if (options.completedRun) {
    invocations.push({
      invocationId: "inv_report_done",
      runId: "run_report_done",
      providerId: "provider_fake",
      modelFamily: "fake-local",
      inputArtifactHash: hashA,
      safetyClass: "workspace-safe",
      status: "completed",
      requestedAt: "2026-07-09T11:13:00.000Z",
      contextPackRefs: [completedContextPack],
      omissions: [
        {
          reason: "context-budget",
          sourceRef: "evidence:oversized-video",
          safeSummary: "Oversized video transcript was omitted."
        },
        {
          reason: "policy-filter",
          sourceRef: "evidence:sealed-record",
          safeSummary: "Sealed record summary was omitted."
        }
      ],
      providerOutputArtifactHash: hashB,
      completedAt: "2026-07-09T11:13:10.000Z",
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20
      },
      allowedActions: [],
      eventIds: ["evt_inv_report_done"],
      causationIds: ["evt_run_report_done"]
    });
  }

  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-09T11:20:00.000Z",
    identityLifecycle: {
      schemaVersion: "resident-identity-lifecycle.v1",
      state: "ready",
      residentAgentId: "agent_default",
      workspaceId: "ws_case_001",
      initialized: true,
      eventIds: ["evt_agent_identity"],
      safeMessage: "Resident identity is ready.",
      allowedRepairActions: []
    },
    residentAgentId: "agent_default",
    tasks: options.tasks ?? [
      taskProviderReview,
      taskUnstarted,
      ...(options.completedRun ? [taskReportDone] : [])
    ],
    runs: [
      runProviderReview,
      ...(options.completedRun ? [runReportDone] : [])
    ],
    modelInvocations: invocations,
    toolRequests: [toolRequest],
    activeMemory: [{
      memoryId: "mem_case_goal",
      residentAgentId: "agent_default",
      scope: "investigation",
      memoryKind: "agent-observation",
      summary: "Keep PRR drafts human-reviewed.",
      recordedBy: "actor_cestus_agent",
      recordedByKind: "agent",
      sourceEventIds: ["evt_mem_case_goal"],
      artifactHashes: [hashD],
      confidence: 0.8,
      createdAt: "2026-07-09T10:50:00.000Z",
      state: "active",
      memoryHistoryEntries: [{
        eventId: "evt_mem_case_goal",
        eventType: "agent.memory.recorded",
        occurredAt: "2026-07-09T10:50:00.000Z"
      }],
      eventIds: ["evt_mem_case_goal"],
      causationIds: ["evt_task_provider_review"]
    }],
    permissions: [],
    locks: [{
      lockId: "lock_legal_review",
      residentAgentId: "agent_default",
      kind: "legal-escalation",
      activatedBy: "actor_case_owner",
      reason: "Legal review remains human-gated.",
      activatedAt: "2026-07-09T10:45:00.000Z",
      relatedEventIds: ["evt_lock_legal_review"],
      state: "active",
      clearRelatedEventIds: [],
      eventIds: ["evt_lock_legal_review"],
      causationIds: []
    }],
    providers: [{
      providerId: "provider_fake",
      label: "Fake local provider",
      adapterVersion: "fake-provider.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: true,
      supportsToolCalling: false,
      safeDataNotes: "Deterministic local fake provider."
    }],
    providerReadiness: {
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-09T11:19:00.000Z",
      cards: [{
        providerId: "provider_fake",
        label: "Fake local provider",
        backendKind: "local-engine",
        capabilitySummary: ["Local deterministic model"],
        credentialKindSummary: ["local-no-secret"],
        state: "works-locally",
        requiredApprovalClass: "none",
        credentialHealth: "not-required",
        dataHandlingPosture: "local-only",
        safeActionIds: ["action_open_provider_settings"]
      }],
      diagnostics: []
    },
    pendingApprovalCount: 1,
    activeLockCount: 1,
    diagnostics: []
  };
}

function productionParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue) => payload;
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}
