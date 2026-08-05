import { describe, expect, it } from "vitest";
import { buildAgentCockpit } from "../src/cockpit.js";
import { buildAgentProjection } from "../src/projection.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { requestResidentSourceBoundaryApproval } from "../src/resident-source-boundary.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../src/task-orchestrator-events.js";
import type { AgentStatusDto } from "../src/runtime-types.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

describe("buildAgentProjection", () => {
  it("derives resident boundary review provenance only from the exact durable request binding", async () => {
    const ledger = new InMemoryEventLedger();
    const hash = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as `sha256:${string}`;
    await requestResidentSourceBoundaryApproval({
      ledger,
      gateway: createAgentToolGateway({
        ledger,
        actor: { id: "agent_default", kind: "agent", label: "Resident" },
        now: () => "2026-08-05T12:00:00.000Z"
      }),
      toolRequestId: "toolreq_boundary_projection_001",
      taskId: "task_boundary_projection_001",
      runId: "run_boundary_projection_001",
      workflowId: "workflow_projection_001",
      workspaceId: "ws_projection_001",
      sourceCollectionId: "src_projection_001",
      sourceIdentity: `source_${"d".repeat(64)}`,
      sourceRootHash: hash("1"),
      discoveryArtifactHash: hash("2"),
      discoveryHash: hash("3"),
      manifestArtifactHash: hash("4"),
      manifestHash: hash("5"),
      archivePolicy: "reject",
      regularFileCount: 1,
      includedFileCount: 1,
      excludedFileCount: 0,
      includedBytes: 8,
      excludedBytes: 0,
      totalBytes: 8
    });

    const request = buildAgentProjection(await ledger.readAll()).toolRequests.get("toolreq_boundary_projection_001");

    expect(request?.residentSourceBoundaryReview).toMatchObject({
      schemaVersion: "resident-source-boundary-review.v1",
      requestEventId: expect.stringMatching(/^evt_/)
    });
    expect(JSON.stringify(request?.residentSourceBoundaryReview)).not.toContain("/selected");
  });

  it("rebuilds resident identity, tasks, runs, tools, memory, permissions, and locks", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    expect(projection.identity?.residentAgentId).toBe("agent_default");
    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.activeMemory.map((memory) => memory.memoryId)).toEqual(["mem_workspace_policy"]);
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");
  });

  it("exposes task orchestration projection without changing task status source", () => {
    const dto = buildAgentProjection(taskOrchestratorProjectionEvents()).toDto();

    expect(dto.tasks.find((task) => task.taskId === "task_projection_integration")?.status).toBe("queued");
    expect(dto.taskOrchestrator?.tasks).toContainEqual(expect.objectContaining({
      taskId: "task_projection_integration",
      taskStatus: "queued",
      state: "queued",
      statusEventId: "evt_agent_projection_integration_status_queued"
    }));
  });

  it("passes deterministic time into embedded task orchestration projection", () => {
    const projection = buildAgentProjection(taskOrchestratorClaimedEvents(), {
      now: "2026-07-10T14:05:00.000Z"
    });

    expect(projection.toDto().taskOrchestrator?.tasks).toContainEqual(expect.objectContaining({
      taskId: "task_projection_integration",
      state: "claimed"
    }));
  });

  it("is deterministic across replay and preserves memory history after retraction", () => {
    const first = buildAgentProjection(goldenAgentLedgerEvents);
    const second = buildAgentProjection([...goldenAgentLedgerEvents]);

    expect(JSON.stringify(first.toDto())).toEqual(JSON.stringify(second.toDto()));
    expect(first.memoryHistory.get("mem_retracted_context")?.state).toBe("retracted");
    expect(first.activeMemory.some((memory) => memory.memoryId === "mem_retracted_context")).toBe(false);
  });

  it("does not let public map mutations change replayed projection state", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    tryRuntimeMapClear(projection.tasks);
    tryRuntimeMapClear(projection.runs);
    tryRuntimeMapClear(projection.toolRequests);
    tryRuntimeMapClear(projection.memoryHistory);
    tryRuntimeMapClear(projection.permissions);
    tryRuntimeMapClear(projection.locks);

    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.memoryHistory.get("mem_workspace_policy")?.state).toBe("active");
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");

    expect(projection.toDto().tasks.map((task) => task.taskId)).toContain("task_provider_readiness");
    expect(projection.toDto().runs.map((run) => run.runId)).toContain("run_provider_readiness");
    expect(projection.toDto().toolRequests.map((toolRequest) => toolRequest.toolRequestId)).toContain("toolreq_provider_preview");
    expect(projection.toDto().permissions.map((permission) => permission.permissionId)).toContain("perm_read_workspace");
    expect(projection.toDto().locks.map((lock) => lock.lockId)).toContain("lock_legal_escalation");
  });

  it("tracks tool request transitions with full provenance", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const completedTool = projection.toolRequests.get("toolreq_provider_transfer");
    expect(completedTool?.state).toBe("completed");
    expect(completedTool?.approvedBy).toBe("actor_case_owner");
    expect(completedTool?.resultEventIds).toEqual(["evt_agent_fixture_evidence"]);
    expect(completedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_provider_transfer",
      "evt_agent_tool_approved_provider_transfer",
      "evt_agent_tool_completed_provider_transfer"
    ]);
    expect(completedTool?.causationIds).toEqual([
      "evt_agent_run_started_provider_readiness",
      "evt_agent_tool_requested_provider_transfer",
      "evt_agent_tool_approved_provider_transfer"
    ]);

    const deniedTool = projection.toolRequests.get("toolreq_export_denied");
    expect(deniedTool?.state).toBe("denied");
    expect(deniedTool?.deniedBy).toBe("actor_case_owner");
    expect(deniedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_export_denied",
      "evt_agent_tool_denied_export_denied"
    ]);

    const failedTool = projection.toolRequests.get("toolreq_local_failed");
    expect(failedTool?.state).toBe("failed");
    expect(failedTool?.failureCategory).toBe("projection-lag");
    expect(failedTool?.allowedActions).toEqual(["rebuild the stale projection before retrying"]);
    expect(failedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_local_failed",
      "evt_agent_tool_failed_local_failed"
    ]);
  });

  it("projects tool execution claims with lease metadata for active and expired claim handling", () => {
    const projection = buildAgentProjection(toolExecutionClaimEvents());

    const claimedTool = projection.toolRequests.get("toolreq_claimed_execution");
    expect(claimedTool).toMatchObject({
      toolRequestId: "toolreq_claimed_execution",
      state: "executing",
      approvedBy: "actor_case_owner",
      executionClaimedBy: "actor_agent_scheduler",
      executionClaimedAt: "2026-07-09T12:06:00.000Z",
      executionLeaseExpiresAt: "2026-07-09T12:11:00.000Z",
      executionApprovedPreviewHash: hash222,
      executionClaimEventId: "evt_agent_tool_execution_claimed_reclaim"
    });
    expect(claimedTool?.eventIds).toEqual([
      "evt_agent_tool_requested_claimed_execution",
      "evt_agent_tool_approved_claimed_execution",
      "evt_agent_tool_execution_claimed_expired",
      "evt_agent_tool_execution_claimed_reclaim"
    ]);
    expect(claimedTool?.causationIds).toEqual([
      "evt_agent_run_started_claim_projection",
      "evt_agent_tool_requested_claimed_execution",
      "evt_agent_tool_approved_claimed_execution",
      "evt_agent_tool_execution_claimed_expired"
    ]);
  });

  it("tracks memory supersession, permission revocation, and lock clearing", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const supersededMemory = projection.memoryHistory.get("mem_superseded_context");
    expect(supersededMemory?.state).toBe("superseded");
    expect(supersededMemory?.memoryKind).toBe("agent-observation");
    expect(supersededMemory?.recordedBy).toBe("actor_cestus_agent");
    expect(supersededMemory?.recordedByKind).toBe("agent");
    expect(supersededMemory?.supersededByMemoryId).toBe("mem_workspace_policy");
    expect(supersededMemory?.eventIds).toEqual([
      "evt_agent_memory_recorded_superseded_context",
      "evt_agent_memory_superseded_context"
    ]);
    expect(supersededMemory?.memoryHistoryEntries).toEqual([
      {
        eventId: "evt_agent_memory_recorded_superseded_context",
        eventType: "agent.memory.recorded",
        occurredAt: "2026-07-07T18:06:30.000Z"
      },
      {
        eventId: "evt_agent_memory_superseded_context",
        eventType: "agent.memory.superseded",
        occurredAt: "2026-07-07T18:06:40.000Z"
      }
    ]);
    expect(projection.activeMemory.some((memory) => memory.memoryId === "mem_superseded_context")).toBe(false);

    const revokedPermission = projection.permissions.get("perm_export_review");
    expect(revokedPermission?.state).toBe("revoked");
    expect(revokedPermission?.revokedBy).toBe("actor_case_owner");
    expect(revokedPermission?.eventIds).toEqual([
      "evt_agent_permission_granted_export_review",
      "evt_agent_permission_revoked_export_review"
    ]);

    const clearedLock = projection.locks.get("lock_export_review");
    expect(clearedLock?.state).toBe("cleared");
    expect(clearedLock?.clearedBy).toBe("actor_case_owner");
    expect(clearedLock?.clearRelatedEventIds).toEqual(["evt_agent_tool_denied_export_denied"]);
    expect(clearedLock?.eventIds).toEqual([
      "evt_agent_lock_activated_export_review",
      "evt_agent_lock_cleared_export_review"
    ]);
  });

  it("tracks run completion and failure paths with provenance and related event IDs", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    const completedRun = projection.runs.get("run_completed_triage");
    expect(completedRun?.state).toBe("completed");
    expect(completedRun?.outputArtifactHashes).toEqual([
      "sha256:5555555555555555555555555555555555555555555555555555555555555555"
    ]);
    expect(completedRun?.relatedEventIds).toEqual(["evt_agent_tool_completed_provider_transfer"]);
    expect(completedRun?.eventIds).toEqual([
      "evt_agent_run_started_completed_triage",
      "evt_agent_run_completed_completed_triage"
    ]);
    expect(completedRun?.causationIds).toEqual([
      "evt_agent_task_created_provider_readiness",
      "evt_agent_tool_completed_provider_transfer"
    ]);

    const cockpit = buildAgentCockpit({
      status: statusFromProjection(projection.toDto()),
      selectedRunId: "run_completed_triage",
      generatedAt: "2026-07-10T15:20:00.000Z"
    });
    expect(cockpit.selectedRun?.handoff).toBeUndefined();
    expect(cockpit.needsNext.some((action) => action.kind === "handoff")).toBe(false);

    const failedRun = projection.runs.get("run_failed_triage");
    expect(failedRun?.state).toBe("failed");
    expect(failedRun?.failureCategory).toBe("projection-lag");
    expect(failedRun?.retryable).toBe(true);
    expect(failedRun?.eventIds).toEqual([
      "evt_agent_run_started_failed_triage",
      "evt_agent_run_failed_failed_triage"
    ]);
    expect(failedRun?.causationIds).toEqual([
      "evt_agent_task_created_provider_readiness",
      "evt_agent_run_started_failed_triage"
    ]);
  });

  it("round trips explicit production binding v1 without defaulting", () => {
    const dto = buildAgentProjection(modelInvocationAuditEvents()).toDto() as ReturnType<
      ReturnType<typeof buildAgentProjection>["toDto"]
    > & {
      readonly modelInvocations?: readonly Record<string, unknown>[];
    };
    const invocation = dto.modelInvocations?.find((item) => item.invocationId === "inv_prompt_audit");

    expect(invocation).toMatchObject({
      invocationId: "inv_prompt_audit",
      runId: "run_prompt_audit",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      inputArtifactHash: hash222,
      safetyClass: "provider-approved",
      status: "completed",
      contextPackRefs: [contextPackRef()],
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      runType: "evidence-triage",
      safePromptSummary: "Prompt artifact assembled from safe context pack summaries.",
      omissions: [promptOmission()],
      transferApprovalClass: "provider-byte-transfer",
      production: productionPromptAuditBinding(),
      providerOutputArtifactHash: hash333,
      usage: { inputTokens: 10, outputTokens: 12, totalTokens: 22 },
      eventIds: [
        "evt_agent_model_requested_prompt_audit",
        "evt_agent_model_completed_prompt_audit"
      ]
    });
    expect(invocation?.inputArtifactHash).not.toBe(invocation?.providerOutputArtifactHash);
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("Use the listed context pack summaries");
    expect(serialized).not.toContain("resolved-payload-sentinel");
  });

  it("round trips strict v2 with source v1 and all owner hashes", () => {
    const events = modelInvocationAuditEvents().map((event) => event.type !== "agent.model-invocation.requested"
      ? event
      : {
        ...event,
        payload: {
          ...event.payload,
          production: {
            ...productionPromptAuditBinding(),
            schemaVersion: "agent-production-prompt-binding.v2",
            sourceApprovedPromptArtifactHash: hash111,
            providerPostureHash: hash222,
            exactRunBindingHash: hash333,
            exactRunBinding: {
              taskId: "task_prompt_audit",
              attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              approvedRunId: "run_prompt_audit",
              runId: "run_prompt_audit",
              runType: "evidence-triage",
              residentAgentId: "agent_default",
              workspaceId: "ws_case_001",
              mountInstanceId: "mount_case_001",
              workflowDescriptorHash: hash111,
              policyVersion: "policy.v1",
              providerPosture: {
                providerId: "provider_remote_model",
                modelId: "remote-safe",
                capabilityIds: ["capability_remote_model"],
                selectionPolicyVersion: "policy.v1",
                readinessState: "ready",
                approvalRequirementId: "toolreq_provider_transfer"
              }
            }
          }
        }
      }
    );
    const invocation = buildAgentProjection(events as Parameters<typeof buildAgentProjection>[0])
      .toDto().modelInvocations?.find((item) => item.invocationId === "inv_prompt_audit");

    expect(invocation?.production).toMatchObject({
      schemaVersion: "agent-production-prompt-binding.v2",
      sourceApprovedPromptArtifactHash: hash111,
      providerPostureHash: hash222,
      exactRunBindingHash: hash333
    });
  });
});

function tryRuntimeMapClear(map: ReadonlyMap<string, unknown>): void {
  try {
    (map as unknown as { clear?: () => void }).clear?.call(map);
  } catch {
    // Immutable map snapshots may reject runtime mutation attempts.
  }
}

function statusFromProjection(projection: ReturnType<ReturnType<typeof buildAgentProjection>["toDto"]>): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-10T15:20:00.000Z",
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
    ...projection,
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: projection.locks.filter((lock) => lock.state === "active").length,
    diagnostics: []
  };
}

function modelInvocationAuditEvents(): Parameters<typeof buildAgentProjection>[0] {
  return [
    {
      id: "evt_agent_run_started_prompt_audit",
      type: "agent.specialist-run.started",
      version: 1,
      streamId: "agent_run_run_prompt_audit",
      sequence: 1,
      context: agentContext("2026-07-08T12:00:00.000Z"),
      payload: {
        runId: "run_prompt_audit",
        residentAgentId: "agent_default",
        runType: "evidence-triage",
        startedBy: "actor_cestus_agent",
        taskId: "task_prompt_audit",
        workspaceId: "ws_case_001"
      }
    },
    {
      id: "evt_agent_model_requested_prompt_audit",
      type: "agent.model-invocation.requested",
      version: 1,
      streamId: "agent_model_invocation_inv_prompt_audit",
      sequence: 1,
      context: {
        ...agentContext("2026-07-08T12:01:00.000Z"),
        causationId: "evt_agent_run_started_prompt_audit"
      },
      payload: {
        invocationId: "inv_prompt_audit",
        runId: "run_prompt_audit",
        providerId: "provider_remote_model",
        modelFamily: "remote-safe",
        inputArtifactHash: hash222,
        safetyClass: "provider-approved",
        credentialRefId: "agent_credref_remote_model",
        credentialKind: "api-key-bearer",
        contextPackRefs: [contextPackRef()],
        promptTemplateId: "resident-agent-context-pack.v1",
        promptTemplateVersion: 1,
        runType: "evidence-triage",
        safePromptSummary: "Prompt artifact assembled from safe context pack summaries.",
        omissions: [promptOmission()],
        transferApprovalClass: "provider-byte-transfer",
        production: productionPromptAuditBinding()
      }
    },
    {
      id: "evt_agent_model_completed_prompt_audit",
      type: "agent.model-invocation.completed",
      version: 1,
      streamId: "agent_model_invocation_inv_prompt_audit",
      sequence: 2,
      context: {
        ...agentContext("2026-07-08T12:02:00.000Z"),
        causationId: "evt_agent_model_requested_prompt_audit"
      },
      payload: {
        invocationId: "inv_prompt_audit",
        runId: "run_prompt_audit",
        providerId: "provider_remote_model",
        outputArtifactHash: hash333,
        completedAt: "2026-07-08T12:02:00.000Z",
        modelFamily: "remote-safe",
        usage: { inputTokens: 10, outputTokens: 12, totalTokens: 22 }
      }
    }
  ] as Parameters<typeof buildAgentProjection>[0];
}

function taskOrchestratorProjectionEvents(): Parameters<typeof buildAgentProjection>[0] {
  return [
    {
      id: "evt_agent_projection_integration_task_created",
      type: "agent.task.created",
      version: 1,
      streamId: "agent_task_task_projection_integration",
      sequence: 1,
      context: agentContext("2026-07-10T14:00:00.000Z"),
      payload: {
        taskId: "task_projection_integration",
        residentAgentId: "agent_default",
        title: "Projection integration task",
        requestedBy: "actor_case_owner",
        priority: "normal",
        sourceEventIds: ["evt_agent_projection_integration_source"],
        inputArtifactHashes: [hash111]
      }
    },
    {
      id: "evt_agent_projection_integration_status_queued",
      type: "agent.task.status.changed",
      version: 1,
      streamId: "agent_task_task_projection_integration",
      sequence: 2,
      context: {
        ...agentContext("2026-07-10T14:00:01.000Z"),
        causationId: "evt_agent_projection_integration_task_created"
      },
      payload: {
        taskId: "task_projection_integration",
        status: "queued",
        changedBy: "actor_cestus_agent",
        reason: "Queued for orchestration projection."
      }
    }
  ] as Parameters<typeof buildAgentProjection>[0];
}

function taskOrchestratorClaimedEvents(): Parameters<typeof buildAgentProjection>[0] {
  const taskId = "task_projection_integration";
  const runType = "evidence-triage";
  const attemptId = buildTaskAttemptId({ taskId, runType, retryGeneration: 0 });
  return [
    ...taskOrchestratorProjectionEvents().map((event) => event.id === "evt_agent_projection_integration_status_queued"
      ? {
        ...event,
        payload: {
          ...event.payload,
          status: "running",
          runId: "run_projection_integration"
        }
      }
      : event),
    {
      id: "evt_agent_projection_integration_claimed",
      type: "agent.task.orchestration.claimed",
      version: 1,
      streamId: taskOrchestrationStreamId(taskId, runType),
      sequence: 1,
      context: {
        ...agentContext("2026-07-10T14:01:00.000Z"),
        causationId: "evt_agent_projection_integration_status_queued"
      },
      payload: {
        taskId,
        runType,
        attemptId,
        retryGeneration: 0,
        leaseClaimGeneration: 1,
        workerId: "actor_task_orchestrator_worker",
        claimedAt: "2026-07-10T14:01:00.000Z",
        leaseExpiresAt: "2026-07-10T14:10:00.000Z",
        idempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${attemptId}:claim`,
        selectedOrderingPosition: {
          priorityRank: 2,
          queuedAt: "2026-07-10T14:00:01.000Z",
          taskId,
          runType,
          retryGeneration: 0
        },
        activeBudgetSnapshot: {
          maxProviderInvocations: 1,
          remainingProviderInvocations: 1,
          contextByteBudget: 16384,
          promptByteBudget: 8192,
          derivativeArtifactByteBudget: 65536,
          wallClockBudgetMs: 300000
        },
        causationEventId: "evt_agent_projection_integration_status_queued"
      }
    }
  ] as Parameters<typeof buildAgentProjection>[0];
}

function agentContext(occurredAt: string) {
  return {
    actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
    occurredAt,
    correlationId: "corr_prompt_audit",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function contextPackRef(): Record<string, unknown> {
  return {
    contextPackId: "task-run-history.v1",
    version: 1,
    contentHash: hash111,
    sizeBytes: 512,
    generatedAt: "2026-07-08T12:00:00.000Z",
    safeSummary: "One resident-agent task event.",
    provenanceRefs: ["evt_agent_task_created"],
    projectionHighWaterMark: 42,
    sourceEventIds: ["evt_agent_task_created"],
    artifactHashes: [hash222],
    policyVersion: "agent-policy-v1",
    scope: { kind: "workspace", id: "ws_case_001" },
    sizeBudgetBytes: 16384,
    stalenessInputs: [
      {
        kind: "projection-high-water-mark",
        ref: "agent.projection",
        value: "42"
      }
    ]
  };
}

function promptOmission(): Record<string, unknown> {
  return {
    reason: "budget",
    sourceRef: "evidence-summary.v1",
    safeSummary: "One evidence pack was omitted because the size budget was reached."
  };
}

function productionPromptAuditBinding(): Record<string, unknown> {
  return {
    schemaVersion: "agent-production-prompt-binding.v1",
    rendererId: "evidence-triage.classify.renderer",
    rendererVersion: 1,
    rendererHash: hash111,
    renderedPromptHash: hash222,
    providerOutputSchemaId: "evidence-triage.classify-output.v1",
    providerOutputSchemaVersion: 1,
    handoffSchemaId: "evidence-triage-handoff.v1",
    handoffSchemaVersion: 1,
    scopeApplicabilityHash: hash333,
    evaluatedContextRequirements: [{
      contextPackId: "task-run-history.v1",
      requirementMode: "always",
      status: "applicable",
      contentHash: hash111
    }, {
      contextPackId: "prr-read-model.v1",
      requirementMode: "when-scope-associated-prr",
      status: "not-applicable",
      omissionReason: "no-associated-prr"
    }],
    resolvedPayloadAudits: [{
      contextPackId: "task-run-history.v1",
      contentHash: hash111,
      sizeBytes: 512,
      schemaId: "task-run-history.v1"
    }]
  };
}

function toolExecutionClaimEvents(): Parameters<typeof buildAgentProjection>[0] {
  const request = {
    id: "evt_agent_tool_requested_claimed_execution",
    type: "agent.tool.requested",
    version: 1,
    streamId: "agent_tool_request_toolreq_claimed_execution",
    sequence: 1,
    context: {
      ...agentContext("2026-07-09T12:00:00.000Z"),
      causationId: "evt_agent_run_started_claim_projection"
    },
    payload: {
      toolRequestId: "toolreq_claimed_execution",
      runId: "run_claim_projection",
      toolId: "tool_claim_projection",
      toolVersion: "1.0.0",
      requestedBy: "agent_default",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      previewHash: hash222,
      scope: "Claim projection test.",
      estimatedEffect: "Records a scheduler execution claim.",
      sourceEventIds: ["evt_agent_run_started_claim_projection"],
      inputArtifactHashes: [hash111]
    }
  };
  const approval = {
    id: "evt_agent_tool_approved_claimed_execution",
    type: "agent.tool.approved",
    version: 1,
    streamId: "agent_tool_request_toolreq_claimed_execution",
    sequence: 2,
    context: {
      ...agentContext("2026-07-09T12:01:00.000Z"),
      actor: { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" },
      causationId: request.id
    },
    payload: {
      toolRequestId: "toolreq_claimed_execution",
      approvedBy: "actor_case_owner",
      approvedPreviewHash: hash222,
      approvalClass: "ledger-review",
      rationale: "Approved the projection claim test.",
      approvedAt: "2026-07-09T12:01:00.000Z"
    }
  };
  const expiredClaim = {
    id: "evt_agent_tool_execution_claimed_expired",
    type: "agent.tool.execution.claimed",
    version: 1,
    streamId: "agent_tool_request_toolreq_claimed_execution",
    sequence: 3,
    context: {
      ...agentContext("2026-07-09T12:02:00.000Z"),
      actor: { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" },
      causationId: approval.id
    },
    payload: {
      toolRequestId: "toolreq_claimed_execution",
      claimedBy: "actor_agent_scheduler",
      claimedAt: "2026-07-09T12:02:00.000Z",
      approvedPreviewHash: hash222,
      leaseExpiresAt: "2026-07-09T12:05:00.000Z"
    }
  };
  const reclaim = {
    id: "evt_agent_tool_execution_claimed_reclaim",
    type: "agent.tool.execution.claimed",
    version: 1,
    streamId: "agent_tool_request_toolreq_claimed_execution",
    sequence: 4,
    context: {
      ...agentContext("2026-07-09T12:06:00.000Z"),
      actor: { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" },
      causationId: expiredClaim.id
    },
    payload: {
      toolRequestId: "toolreq_claimed_execution",
      claimedBy: "actor_agent_scheduler",
      claimedAt: "2026-07-09T12:06:00.000Z",
      approvedPreviewHash: hash222,
      leaseExpiresAt: "2026-07-09T12:11:00.000Z"
    }
  };

  return [request, approval, expiredClaim, reclaim] as Parameters<typeof buildAgentProjection>[0];
}
