import { describe, expect, it } from "vitest";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  buildTaskAttemptId,
  taskOrchestrationStreamId
} from "../src/task-orchestrator-events.js";
import { buildTaskOrchestratorProjection } from "../src/task-orchestrator-projection.js";
import type { AgentSpecialistRunType, AgentTaskStatus } from "../src/projection-types.js";

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const hash444 = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
const runType = "evidence-triage" satisfies AgentSpecialistRunType;
const now = "2026-07-10T14:06:00.000Z";

describe("buildTaskOrchestratorProjection", () => {
  it("projects queued task awaiting claim from task status source", () => {
    const taskId = "task_projection_queued";
    const createdOnly = buildTaskOrchestratorProjection([taskCreated(taskId)], { now });
    expect(createdOnly.tasks.has(taskId)).toBe(false);

    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "queued", "evt_task2_status_queued", "2026-07-10T14:00:01.000Z")
    ], { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      taskId,
      taskStatus: "queued",
      state: "queued",
      statusEventId: "evt_task2_status_queued"
    });
    expect(projection.toDto().tasks).toHaveLength(1);
  });

  it("projects claimed running attempt from orchestration claim and task status", () => {
    const taskId = "task_projection_claimed";
    const claim = orchestrationClaimed(taskId);
    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", "evt_task2_status_running", "2026-07-10T14:00:01.000Z"),
      claim
    ], { now });

    const attempt = projection.attempts.get(attemptKey(taskId));
    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "claimed",
      activeAttemptKey: attemptKey(taskId)
    });
    expect(attempt).toMatchObject({
      taskId,
      runType,
      retryGeneration: 0,
      attemptId: attemptIdFor(taskId),
      state: "claimed",
      activeLease: {
        claimEventId: claim.id,
        leaseClaimGeneration: 1,
        workerId: "actor_task_orchestrator_worker",
        leaseExpiresAt: "2026-07-10T14:10:00.000Z",
        expired: false
      }
    });
  });

  it("projects approval-suspended checkpoint without an active lease", () => {
    const taskId = "task_projection_approval";
    const claim = orchestrationClaimed(taskId);
    const checkpoint = orchestrationCheckpointed(taskId, "approval-wait", "evt_task2_checkpoint_approval");
    const release = orchestrationReleased(taskId, "approval-suspended", claim.id, checkpoint.id);
    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "waiting-for-approval", "evt_task2_status_waiting", "2026-07-10T14:00:01.000Z"),
      claim,
      checkpoint,
      release
    ], { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "approval-suspended",
      activeAttemptKey: attemptKey(taskId)
    });
    expect(projection.attempts.get(attemptKey(taskId))).toMatchObject({
      state: "approval-suspended",
      activeLease: undefined,
      suspendedCheckpoint: {
        checkpointEventId: checkpoint.id,
        checkpointKind: "approval-wait",
        releaseEventId: release.id
      }
    });
  });

  it("projects stale claim recoverable when lease expires without terminal event", () => {
    const taskId = "task_projection_stale";
    const claim = orchestrationClaimed(taskId, {
      claimedAt: "2026-07-10T13:50:00.000Z",
      leaseExpiresAt: "2026-07-10T13:55:00.000Z"
    });
    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", "evt_task2_status_stale_running", "2026-07-10T13:50:01.000Z"),
      claim
    ], { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "stale-claim-recoverable",
      diagnosticReason: "claim-lease-expired"
    });
    expect(projection.attempts.get(attemptKey(taskId))).toMatchObject({
      state: "stale-claim-recoverable",
      recoverable: true,
      activeLease: {
        claimEventId: claim.id,
        expired: true
      }
    });
  });

  it("projects handoff-pending when final output or prepared manifest exists without verified handoff readback", () => {
    const taskId = "task_projection_handoff_pending";
    const events = [
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", "evt_task2_status_handoff_running", "2026-07-10T14:00:01.000Z"),
      orchestrationClaimed(taskId),
      specialistRunStarted(taskId),
      finalOutputStep(taskId),
      handoffPrepared(taskId)
    ];
    const projection = buildTaskOrchestratorProjection(events, { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "handoff-pending",
      diagnosticReason: "handoff-readback-missing"
    });
    expect(projection.attempts.get(attemptKey(taskId))).toMatchObject({
      state: "handoff-pending",
      finalOutputStepEventId: "evt_task2_final_output_task_projection_handoff_pending",
      handoffPreparedEventId: "evt_task2_handoff_prepared_task_projection_handoff_pending",
      handoffRecordedEventId: undefined
    });

    const preparedOnlyTaskId = "task_projection_prepared_only_handoff_pending";
    const preparedOnly = buildTaskOrchestratorProjection([
      taskCreated(preparedOnlyTaskId),
      taskStatusChanged(preparedOnlyTaskId, "running", "evt_task2_status_prepared_only_running", "2026-07-10T14:00:01.000Z"),
      orchestrationClaimed(preparedOnlyTaskId),
      specialistRunStarted(preparedOnlyTaskId),
      handoffPrepared(preparedOnlyTaskId)
    ], { now });

    expect(preparedOnly.tasks.get(preparedOnlyTaskId)).toMatchObject({
      state: "handoff-pending",
      diagnosticReason: "handoff-readback-missing"
    });
  });

  it("does not project completed from orchestration completed without causal task status changed event", () => {
    const taskId = "task_projection_missing_status";
    const projection = buildTaskOrchestratorProjection(completedSequence(taskId, {
      includeTaskCompletedStatus: false
    }), { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-task-status-missing"
    });
    expect(projection.tasks.get(taskId)?.state).not.toBe("completed");
  });

  it("does not project completed from task status changed without preceding orchestration completed event", () => {
    const taskId = "task_projection_missing_orchestration";
    const projection = buildTaskOrchestratorProjection(completedSequence(taskId, {
      includeOrchestrationCompleted: false
    }), { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-status-without-orchestration-completion"
    });
    expect(projection.tasks.get(taskId)?.state).not.toBe("completed");
  });

  it("rebuilds the same projection from a shuffled stream read sorted by ledger sequence", () => {
    const taskId = "task_projection_shuffled";
    const ordered = completedSequence(taskId);
    const shuffled = [
      ordered[5],
      ordered[1],
      ordered[8],
      ordered[0],
      ordered[4],
      ordered[9],
      ordered[2],
      ordered[7],
      ordered[3],
      ordered[6]
    ].filter((event): event is LedgerEvent => event !== undefined);

    expect(buildTaskOrchestratorProjection(shuffled, { now }).toDto()).toEqual(
      buildTaskOrchestratorProjection(ordered, { now }).toDto()
    );
  });

  it("preserves ledger readAll input order when no global sequence field is available", () => {
    const taskId = "task_projection_read_all_order";
    const ordered = completedSequence(taskId).map((event, index) => {
      const { globalSequence: _globalSequence, ...withoutGlobalSequence } = event;
      if (index === 9) {
        return {
          ...withoutGlobalSequence,
          context: {
            ...withoutGlobalSequence.context,
            occurredAt: "2026-07-10T14:00:02.000Z"
          }
        };
      }
      return withoutGlobalSequence;
    }) as KnowledgeEvent[];

    expect(buildTaskOrchestratorProjection(ordered, { now }).tasks.get(taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("does not project completed when terminal task status names a different run", () => {
    const taskId = "task_projection_wrong_terminal_run";
    const events: KnowledgeEvent[] = completedSequence(taskId);
    const completedStatus = events.at(-1);
    if (completedStatus === undefined) {
      throw new Error("completion fixture missing task status event");
    }
    events[events.length - 1] = {
      ...completedStatus,
      payload: {
        ...(completedStatus.payload as Record<string, unknown>),
        runId: "run_wrong_terminal"
      }
    } as KnowledgeEvent;

    expect(buildTaskOrchestratorProjection(events, { now }).tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-status-run-mismatch"
    });
  });

  it("does not project completed when run terminal precedes handoff readback", () => {
    const taskId = "task_projection_run_terminal_before_handoff";
    const events: KnowledgeEvent[] = completedSequence(taskId);
    const handoffRecordedIndex = events.findIndex((event) => event.id === `evt_task2_handoff_recorded_${taskId}`);
    const runCompletedIndex = events.findIndex((event) => event.id === `evt_task2_run_completed_${taskId}`);
    const handoffRecordedEvent = events[handoffRecordedIndex] as LedgerEvent | undefined;
    const runCompletedEvent = events[runCompletedIndex] as LedgerEvent | undefined;
    if (handoffRecordedEvent === undefined || runCompletedEvent === undefined) {
      throw new Error("completion fixture missing handoff or run terminal event");
    }

    events[handoffRecordedIndex] = {
      ...handoffRecordedEvent,
      globalSequence: runCompletedEvent.globalSequence + 1,
      context: {
        ...handoffRecordedEvent.context,
        occurredAt: "2026-07-10T14:07:30.000Z"
      }
    } as unknown as KnowledgeEvent;
    events[runCompletedIndex] = {
      ...runCompletedEvent,
      globalSequence: runCompletedEvent.globalSequence,
      context: {
        ...runCompletedEvent.context,
        occurredAt: "2026-07-10T14:06:30.000Z"
      }
    } as unknown as KnowledgeEvent;

    expect(buildTaskOrchestratorProjection(events, { now }).tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-sequence-invalid"
    });
  });

  it("keeps completed task bound to exact handoff recorded event when a later same-run revision exists", () => {
    const taskId = "task_projection_later_handoff_revision";
    const events = completedSequence(taskId);
    const originalRecorded = events.find((event) => event.id === `evt_task2_handoff_recorded_${taskId}`) as LedgerEvent | undefined;
    if (originalRecorded === undefined) {
      throw new Error("completion fixture missing handoff recorded event");
    }
    events.push({
      ...originalRecorded,
      id: `evt_task2_handoff_recorded_later_${taskId}`,
      sequence: 6,
      globalSequence: originalRecorded.globalSequence + 20,
      context: {
        ...originalRecorded.context,
        occurredAt: "2026-07-10T14:10:00.000Z",
        causationId: `evt_task2_status_completed_${taskId}`
      },
      payload: {
        ...(originalRecorded.payload as Record<string, unknown>),
        handoffId: `${handoffIdFor(taskId)}_later`,
        handoffManifestHash: hash333,
        verifiedAt: "2026-07-10T14:10:00.000Z"
      }
    } as unknown as LedgerEvent);

    const attempt = buildTaskOrchestratorProjection(events, { now }).attempts.get(attemptKey(taskId));

    expect(buildTaskOrchestratorProjection(events, { now }).tasks.get(taskId)).toMatchObject({
      state: "completed"
    });
    expect(attempt).toMatchObject({
      state: "completed",
      handoffRecordedEventId: `evt_task2_handoff_recorded_${taskId}`,
      handoffReadback: {
        handoffId: handoffIdFor(taskId),
        handoffManifestHash: hash222,
        handoffRecordedEventId: `evt_task2_handoff_recorded_${taskId}`
      }
    });
  });

  it("does not project failed without causally linked orchestration failed and task status terminal events", () => {
    const taskId = "task_projection_failure_terminal_truth";
    const statusOnly = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", `evt_task2_status_running_${taskId}`, "2026-07-10T14:00:01.000Z"),
      orchestrationClaimed(taskId),
      taskStatusChanged(taskId, "failed", `evt_task2_status_failed_${taskId}`, "2026-07-10T14:09:00.000Z", `evt_task2_claimed_${taskId}`)
    ], { now });

    expect(statusOnly.tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-status-without-orchestration-failure"
    });

    const orchestrationOnly = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", `evt_task2_status_running_${taskId}`, "2026-07-10T14:00:01.000Z"),
      orchestrationClaimed(taskId),
      orchestrationFailed(taskId)
    ], { now });

    expect(orchestrationOnly.tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-task-status-missing"
    });

    const linkedFailure = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", `evt_task2_status_running_${taskId}`, "2026-07-10T14:00:01.000Z"),
      orchestrationClaimed(taskId),
      orchestrationFailed(taskId),
      taskStatusChanged(taskId, "failed", `evt_task2_status_failed_${taskId}`, "2026-07-10T14:09:00.000Z", `evt_task2_orchestration_failed_${taskId}`)
    ], { now });

    expect(linkedFailure.tasks.get(taskId)).toMatchObject({
      state: "failed"
    });
  });

  it("ignores unrelated releases and blocks mismatched approval suspension checkpoints", () => {
    const taskId = "task_projection_release_match";
    const firstClaim = orchestrationClaimed(taskId, {
      eventId: "evt_task2_release_match_first_claim",
      leaseClaimGeneration: 1,
      streamSequence: 1
    });
    const secondClaim = orchestrationClaimed(taskId, {
      eventId: "evt_task2_release_match_second_claim",
      leaseClaimGeneration: 2,
      streamSequence: 2
    });
    const staleRelease = orchestrationReleased(taskId, "stale-recovered", firstClaim.id, undefined, {
      eventId: "evt_task2_release_match_stale_release",
      streamSequence: 3
    });

    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", `evt_task2_status_running_${taskId}`, "2026-07-10T14:00:01.000Z"),
      firstClaim,
      secondClaim,
      staleRelease
    ], { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "claimed"
    });
    expect(projection.attempts.get(attemptKey(taskId))?.activeLease).toMatchObject({
      claimEventId: secondClaim.id
    });

    const approvalTaskId = "task_projection_release_checkpoint_mismatch";
    const claim = orchestrationClaimed(approvalTaskId);
    const checkpoint = orchestrationCheckpointed(approvalTaskId, "approval-wait", "evt_task2_checkpoint_real_approval");
    const mismatchedRelease = orchestrationReleased(
      approvalTaskId,
      "approval-suspended",
      claim.id,
      "evt_task2_checkpoint_other_approval"
    );

    expect(buildTaskOrchestratorProjection([
      taskCreated(approvalTaskId),
      taskStatusChanged(approvalTaskId, "waiting-for-approval", `evt_task2_status_running_${approvalTaskId}`, "2026-07-10T14:00:01.000Z"),
      claim,
      checkpoint,
      mismatchedRelease
    ], { now }).tasks.get(approvalTaskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "release-checkpoint-mismatch"
    });
  });

  it("fails closed on duplicate active attempts for the same task specialist retry generation", () => {
    const taskId = "task_projection_duplicate";
    const firstClaim = orchestrationClaimed(taskId, {
      eventId: "evt_task2_duplicate_first_claim",
      leaseClaimGeneration: 1,
      streamSequence: 3
    });
    const secondClaim = orchestrationClaimed(taskId, {
      eventId: "evt_task2_duplicate_second_claim",
      attemptId: "attempt_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      leaseClaimGeneration: 2,
      streamSequence: 4
    });
    const projection = buildTaskOrchestratorProjection([
      taskCreated(taskId),
      taskStatusChanged(taskId, "running", "evt_task2_duplicate_running", "2026-07-10T14:00:01.000Z"),
      firstClaim,
      secondClaim
    ], { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "duplicate-active-attempt"
    });
    expect(projection.attempts.get(attemptKey(taskId))).toMatchObject({
      state: "blocked",
      diagnosticReason: "duplicate-active-attempt"
    });
  });
});

type LedgerEvent = KnowledgeEvent & {
  readonly globalSequence: number;
};

let globalSequence = 0;

function ledgerEvent(input: {
  readonly id: string;
  readonly type: KnowledgeEvent["type"];
  readonly streamId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
  readonly causationId?: string | undefined;
}): LedgerEvent {
  globalSequence += 1;
  return {
    id: input.id,
    type: input.type,
    version: 1,
    streamId: input.streamId,
    sequence: input.sequence,
    globalSequence,
    context: {
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      occurredAt: input.occurredAt,
      causationId: input.causationId,
      correlationId: "corr_task_orchestrator_projection",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: input.payload
  } as unknown as LedgerEvent;
}

function taskCreated(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_created_${taskId}`,
    type: "agent.task.created",
    streamId: `agent_task_${taskId}`,
    sequence: 1,
    occurredAt: "2026-07-10T14:00:00.000Z",
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: `Projection task ${taskId}`,
      requestedBy: "actor_case_owner",
      priority: "normal",
      sourceEventIds: ["evt_task2_source"],
      inputArtifactHashes: [hash111]
    }
  });
}

function taskStatusChanged(
  taskId: string,
  status: AgentTaskStatus,
  eventId: string,
  occurredAt: string,
  causationId?: string
): LedgerEvent {
  return ledgerEvent({
    id: eventId,
    type: "agent.task.status.changed",
    streamId: `agent_task_${taskId}`,
    sequence: status === "queued" ? 2 : status === "completed" ? 4 : 3,
    occurredAt,
    causationId,
    payload: {
      taskId,
      status,
      changedBy: "actor_cestus_agent",
      reason: `Task is ${status}.`,
      runId: status === "queued" ? undefined : runIdFor(taskId)
    }
  });
}

function orchestrationClaimed(
  taskId: string,
  options: {
    readonly eventId?: string | undefined;
    readonly attemptId?: string | undefined;
    readonly leaseClaimGeneration?: number | undefined;
    readonly claimedAt?: string | undefined;
    readonly leaseExpiresAt?: string | undefined;
    readonly streamSequence?: number | undefined;
  } = {}
): LedgerEvent {
  const attemptId = options.attemptId ?? attemptIdFor(taskId);
  return ledgerEvent({
    id: options.eventId ?? `evt_task2_claimed_${taskId}`,
    type: "agent.task.orchestration.claimed",
    streamId: taskOrchestrationStreamId(taskId, runType),
    sequence: options.streamSequence ?? 1,
    occurredAt: options.claimedAt ?? "2026-07-10T14:01:00.000Z",
    causationId: `evt_task2_created_${taskId}`,
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: options.leaseClaimGeneration ?? 1,
      workerId: "actor_task_orchestrator_worker",
      claimedAt: options.claimedAt ?? "2026-07-10T14:01:00.000Z",
      leaseExpiresAt: options.leaseExpiresAt ?? "2026-07-10T14:10:00.000Z",
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
      causationEventId: `evt_task2_status_running`
    }
  });
}

function orchestrationCheckpointed(
  taskId: string,
  checkpointKind: "approval-wait" | "handoff-pending" | "blocked",
  eventId: string
): LedgerEvent {
  return ledgerEvent({
    id: eventId,
    type: "agent.task.orchestration.checkpointed",
    streamId: taskOrchestrationStreamId(taskId, runType),
    sequence: 2,
    occurredAt: "2026-07-10T14:02:00.000Z",
    causationId: `evt_task2_claimed_${taskId}`,
    payload: {
      taskId,
      runType,
      attemptId: attemptIdFor(taskId),
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind,
      checkpointedAt: "2026-07-10T14:02:00.000Z",
      runId: runIdFor(taskId),
      resumeIdempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${attemptIdFor(taskId)}:resume-${checkpointKind}`,
      toolRequestIds: checkpointKind === "approval-wait" ? ["toolreq_provider_transfer"] : undefined,
      approvalRequirement: checkpointKind === "approval-wait"
        ? {
          approvalClass: "provider-byte-transfer",
          previewHash: hash333,
          approvalRequestEventId: "evt_task2_provider_transfer_requested"
        }
        : undefined,
      providerPosture: checkpointKind === "approval-wait"
        ? {
          providerId: "provider_nous_portal",
          modelFamily: "tencent-hy3-free",
          adapterVersion: "0.1.0",
          credentialRefId: "agent_credref_local",
          credentialKind: "local-no-secret",
          readinessState: "ready",
          approvalProfile: "provider-byte-transfer",
          dataHandlingPosture: "remote-provider-approved",
          selectionPolicyVersion: "agent-provider-policy-v1",
          sensitivityClass: "provider-approved",
          requiredApprovalClass: "provider-byte-transfer"
        }
        : undefined,
      contextBindings: [{
        contextPackId: "task-run-history.v1",
        contentHash: hash222,
        sizeBytes: 512,
        schemaId: "task-run-history.v1",
        provenanceEventIds: [`evt_task2_created_${taskId}`],
        projectionHighWaterMark: 42,
        stalenessInputCount: 1
      }],
      sourceEventIds: [`evt_task2_created_${taskId}`],
      inputArtifactHashes: [hash111],
      promptArtifactHash: checkpointKind === "approval-wait" ? hash111 : undefined,
      lockSnapshot: checkpointKind === "approval-wait" ? { activeLockIds: [], highWaterMark: 42 } : undefined,
      safeNextActions: ["resume from durable projection state"]
    }
  });
}

function orchestrationReleased(
  taskId: string,
  releaseReason: "approval-suspended" | "stale-recovered" | "handoff-pending",
  claimEventId: string,
  checkpointEventId?: string,
  options: {
    readonly eventId?: string | undefined;
    readonly streamSequence?: number | undefined;
  } = {}
): LedgerEvent {
  return ledgerEvent({
    id: options.eventId ?? `evt_task2_released_${taskId}`,
    type: "agent.task.orchestration.released",
    streamId: taskOrchestrationStreamId(taskId, runType),
    sequence: options.streamSequence ?? 3,
    occurredAt: "2026-07-10T14:03:00.000Z",
    causationId: checkpointEventId ?? claimEventId,
    payload: {
      taskId,
      runType,
      attemptId: attemptIdFor(taskId),
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      releasedBy: "actor_task_orchestrator_worker",
      releasedAt: "2026-07-10T14:03:00.000Z",
      releaseReason,
      claimEventId,
      checkpointEventId,
      safeNextActions: ["reclaim after exact durable proof is current"]
    }
  });
}

function orchestrationFailed(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_orchestration_failed_${taskId}`,
    type: "agent.task.orchestration.failed",
    streamId: taskOrchestrationStreamId(taskId, runType),
    sequence: 2,
    occurredAt: "2026-07-10T14:08:00.000Z",
    causationId: `evt_task2_claimed_${taskId}`,
    payload: {
      taskId,
      runType,
      attemptId: attemptIdFor(taskId),
      retryGeneration: 0,
      failedAt: "2026-07-10T14:08:00.000Z",
      category: "model-output-invalid",
      message: "Structured specialist output failed validation.",
      retryable: true,
      allowedActions: ["retry after preserving durable failure context"],
      runId: runIdFor(taskId),
      relatedEventIds: [`evt_task2_claimed_${taskId}`]
    }
  });
}

function specialistRunStarted(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_run_started_${taskId}`,
    type: "agent.specialist-run.started",
    streamId: `agent_run_${runIdFor(taskId)}`,
    sequence: 1,
    occurredAt: "2026-07-10T14:04:00.000Z",
    causationId: `evt_task2_claimed_${taskId}`,
    payload: {
      runId: runIdFor(taskId),
      residentAgentId: "agent_default",
      runType,
      startedBy: "actor_cestus_agent",
      taskId,
      workspaceId: "ws_case_001",
      sourceEventIds: [`evt_task2_created_${taskId}`],
      inputArtifactHashes: [hash111]
    }
  });
}

function finalOutputStep(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_final_output_${taskId}`,
    type: "agent.specialist-run.step.recorded",
    streamId: `agent_run_${runIdFor(taskId)}`,
    sequence: 2,
    occurredAt: "2026-07-10T14:05:00.000Z",
    causationId: `evt_task2_run_started_${taskId}`,
    payload: {
      runId: runIdFor(taskId),
      stepId: `step_${runIdFor(taskId)}_final_output`,
      summary: "Final durable output artifacts are persisted.",
      stepKind: "final-output",
      stepSchemaId: "evidence-triage-final-output.v1",
      idempotencyKey: `specialist-final-output:${runIdFor(taskId)}:${taskId}:${runType}:ready-for-review:${hash222}`,
      handoffMaterialArtifactHash: hash444,
      inputArtifactHashes: [hash111],
      outputArtifactHashes: [hash222, hash444]
    }
  });
}

function handoffPrepared(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_handoff_prepared_${taskId}`,
    type: "agent.specialist-handoff.prepared",
    streamId: `agent_run_${runIdFor(taskId)}`,
    sequence: 3,
    occurredAt: "2026-07-10T14:05:30.000Z",
    causationId: `evt_task2_final_output_${taskId}`,
    payload: handoffPayload(taskId)
  });
}

function handoffRecorded(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_handoff_recorded_${taskId}`,
    type: "agent.specialist-handoff.recorded",
    streamId: `agent_run_${runIdFor(taskId)}`,
    sequence: 4,
    occurredAt: "2026-07-10T14:06:00.000Z",
    causationId: `evt_task2_handoff_prepared_${taskId}`,
    payload: {
      ...handoffPayload(taskId),
      preparedEventId: `evt_task2_handoff_prepared_${taskId}`,
      verifiedAt: "2026-07-10T14:06:00.000Z"
    }
  });
}

function specialistRunCompleted(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_run_completed_${taskId}`,
    type: "agent.specialist-run.completed",
    streamId: `agent_run_${runIdFor(taskId)}`,
    sequence: 5,
    occurredAt: "2026-07-10T14:07:00.000Z",
    causationId: `evt_task2_handoff_recorded_${taskId}`,
    payload: {
      runId: runIdFor(taskId),
      completedAt: "2026-07-10T14:07:00.000Z",
      outputArtifactHashes: [hash222, hash444],
      relatedEventIds: [`evt_task2_handoff_recorded_${taskId}`],
      summary: "Evidence triage handoff is ready for review."
    }
  });
}

function orchestrationCompleted(taskId: string): LedgerEvent {
  return ledgerEvent({
    id: `evt_task2_orchestration_completed_${taskId}`,
    type: "agent.task.orchestration.completed",
    streamId: taskOrchestrationStreamId(taskId, runType),
    sequence: 2,
    occurredAt: "2026-07-10T14:08:00.000Z",
    causationId: `evt_task2_run_completed_${taskId}`,
    payload: {
      taskId,
      runType,
      attemptId: attemptIdFor(taskId),
      retryGeneration: 0,
      runId: runIdFor(taskId),
      completedAt: "2026-07-10T14:08:00.000Z",
      specialistRunCompletedEventId: `evt_task2_run_completed_${taskId}`,
      finalOutputStepEventId: `evt_task2_final_output_${taskId}`,
      handoffPreparedEventId: `evt_task2_handoff_prepared_${taskId}`,
      handoffRecordedEventId: `evt_task2_handoff_recorded_${taskId}`,
      handoffReadback: {
        handoffId: handoffIdFor(taskId),
        handoffManifestHash: hash222,
        handoffRecordedEventId: `evt_task2_handoff_recorded_${taskId}`,
        verifiedAt: "2026-07-10T14:06:00.000Z"
      }
    }
  });
}

function completedSequence(
  taskId: string,
  options: {
    readonly includeOrchestrationCompleted?: boolean | undefined;
    readonly includeTaskCompletedStatus?: boolean | undefined;
  } = {}
): LedgerEvent[] {
  const includeOrchestrationCompleted = options.includeOrchestrationCompleted ?? true;
  const includeTaskCompletedStatus = options.includeTaskCompletedStatus ?? true;
  const events = [
    taskCreated(taskId),
    taskStatusChanged(taskId, "running", `evt_task2_status_running_${taskId}`, "2026-07-10T14:00:01.000Z"),
    orchestrationClaimed(taskId),
    specialistRunStarted(taskId),
    finalOutputStep(taskId),
    handoffPrepared(taskId),
    handoffRecorded(taskId),
    specialistRunCompleted(taskId)
  ];
  if (includeOrchestrationCompleted) {
    events.push(orchestrationCompleted(taskId));
  }
  if (includeTaskCompletedStatus) {
    events.push(taskStatusChanged(
      taskId,
      "completed",
      `evt_task2_status_completed_${taskId}`,
      "2026-07-10T14:09:00.000Z",
      includeOrchestrationCompleted ? `evt_task2_orchestration_completed_${taskId}` : `evt_task2_run_completed_${taskId}`
    ));
  }
  return events;
}

function handoffPayload(taskId: string): Record<string, unknown> {
  return {
    handoffId: handoffIdFor(taskId),
    handoffRevision: 1,
    idempotencyKey: `specialist-handoff:${runIdFor(taskId)}:${taskId}:${runType}:ready-for-review:${hash222}`,
    handoffManifestHash: hash222,
    handoffDtoHash: hash333,
    handoffMaterialArtifactHash: hash444,
    runId: runIdFor(taskId),
    taskId,
    runType,
    residentAgentId: "agent_default",
    status: "ready-for-review",
    safeSummary: "Evidence triage handoff is ready for human review.",
    finalOutputStepId: `step_${runIdFor(taskId)}_final_output`,
    finalOutputEventId: `evt_task2_final_output_${taskId}`,
    contextPackHashes: [hash111],
    promptArtifactHash: hash111,
    outputArtifactHashes: [hash222, hash444],
    toolRequestIds: [],
    sourceEventIds: [`evt_task2_created_${taskId}`],
    relatedEventIds: [`evt_task2_final_output_${taskId}`]
  };
}

function attemptIdFor(taskId: string): `attempt_${string}` {
  return buildTaskAttemptId({ taskId, runType, retryGeneration: 0 });
}

function attemptKey(taskId: string): string {
  return `${taskId}:${runType}:0`;
}

function runIdFor(taskId: string): string {
  return `run_${taskId.replace(/^task_/, "")}`;
}

function handoffIdFor(taskId: string): string {
  return `handoff_${runIdFor(taskId)}_0123456789abcdef`;
}
