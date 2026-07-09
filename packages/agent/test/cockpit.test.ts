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

const hashA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const hashC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const hashD = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const hashE = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

describe("agent cockpit dto", () => {
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
      kind: "run-start",
      safeAction: "start-run",
      relatedTaskId: "task_unstarted"
    }));
    expect(cockpit.forbiddenDirectEffects).toContain("provider-byte-transfer");
    expect(JSON.stringify(cockpit)).not.toMatch(/raw-token|authorization|bearer|sk_live|password/i);
  });

  it("projects model invocation audit, context packs, memory snippets, and final handoff refs", () => {
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
      usageSummary: "12 input, 8 output, 20 total"
    }));
    expect(cockpit.selectedRun?.contextPacks).toContainEqual(expect.objectContaining({
      contextPackId: "task-run-history.v1",
      contentHash: hashC,
      safeSummary: "Prior agent task history."
    }));
    expect(cockpit.memorySnippets).toContainEqual(expect.objectContaining({
      memoryId: "mem_case_goal",
      scope: "investigation",
      summary: "Keep PRR drafts human-reviewed."
    }));
    expect(cockpit.selectedRun?.handoff).toMatchObject({
      state: "ready-for-human-review",
      summary: "Draft report outline produced.",
      artifactHashes: [hashD]
    });
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
    artifactHashes: [hashA]
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
      omissions: [],
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
      summary: "Keep PRR drafts human-reviewed.",
      sourceEventIds: ["evt_mem_case_goal"],
      artifactHashes: [hashD],
      confidence: 0.8,
      createdAt: "2026-07-09T10:50:00.000Z",
      state: "active",
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
