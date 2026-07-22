import {
  hashAgentTaskOrchestratorPromptBindingReceipt,
  type KnowledgeEvent
} from "../../ontology/src/contracts.js";
import type {
  AgentSpecialistRunType,
  AgentTaskStatus,
  ProjectedTaskOrchestratorTask,
  TaskOrchestratorAttemptProjection,
  TaskOrchestratorLeaseProjection,
  TaskOrchestratorLatestCheckpointProjection,
  TaskOrchestratorProjectionDto,
  TaskOrchestratorProjectionState,
  TaskOrchestratorSuspendedCheckpointProjection
} from "./projection-types.js";

export interface BuildTaskOrchestratorProjectionOptions {
  readonly now?: string | Date | undefined;
}

export interface TaskOrchestratorProjection {
  readonly tasks: ReadonlyMap<string, ProjectedTaskOrchestratorTask>;
  readonly attempts: ReadonlyMap<string, TaskOrchestratorAttemptProjection>;
  toDto(): TaskOrchestratorProjectionDto;
}

type OrderedEvent = KnowledgeEvent & {
  readonly globalSequence?: number | undefined;
};

interface StatusRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly taskId: string;
  readonly status: AgentTaskStatus;
  readonly runId?: string | undefined;
}

interface ClaimRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly attemptId: string;
  readonly leaseClaimGeneration: number;
  readonly workerId: string;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
}

interface CheckpointRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly checkpointKind: string;
  readonly checkpointedAt: string;
  readonly runId?: string | undefined;
  readonly toolRequestIds: readonly string[];
  readonly safeNextActions: readonly string[];
  readonly latestPromptBindingReceipt?: TaskOrchestratorAttemptProjection["latestPromptBindingReceipt"];
}

interface ReleaseRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly releaseReason: string;
  readonly claimEventId: string;
  readonly checkpointEventId?: string | undefined;
}

interface CompletionRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly attemptId: string;
  readonly runId: string;
  readonly specialistRunCompletedEventId: string;
  readonly finalOutputStepEventId: string;
  readonly handoffPreparedEventId: string;
  readonly handoffRecordedEventId: string;
  readonly handoffReadback: {
    readonly handoffId: string;
    readonly handoffManifestHash: string;
    readonly handoffRecordedEventId: string;
    readonly verifiedAt: string;
  };
}

interface FailureRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly runId?: string | undefined;
}

interface AttemptDraft {
  readonly attemptKey: string;
  readonly taskId: string;
  readonly runType: AgentSpecialistRunType;
  readonly retryGeneration: number;
  readonly eventIds: string[];
  readonly causationIds: string[];
  readonly claims: ClaimRecord[];
  readonly checkpoints: CheckpointRecord[];
  readonly releases: ReleaseRecord[];
  completion?: CompletionRecord | undefined;
  failure?: FailureRecord | undefined;
}

interface RunRecord {
  readonly event: OrderedEvent;
  readonly order: number;
  readonly runId: string;
  readonly taskId?: string | undefined;
  readonly runType: AgentSpecialistRunType;
}

interface RunProofRecord {
  readonly event: OrderedEvent;
  readonly order: number;
}

interface HandoffRecordedRecord extends RunProofRecord {
  readonly handoffId: string;
  readonly handoffManifestHash: string;
  readonly verifiedAt: string;
}

export function buildTaskOrchestratorProjection(
  events: readonly KnowledgeEvent[],
  options: BuildTaskOrchestratorProjectionOptions = {}
): TaskOrchestratorProjection {
  const orderedEvents = canonicalizeEvents(events);
  const orderByEventId = new Map<string, number>();
  const statusByTask = new Map<string, StatusRecord>();
  const attempts = new Map<string, AttemptDraft>();
  const runsById = new Map<string, RunRecord>();
  const finalOutputByRunId = new Map<string, RunProofRecord>();
  const handoffPreparedByRunId = new Map<string, RunProofRecord>();
  const handoffRecordedByRunId = new Map<string, HandoffRecordedRecord>();
  const runCompletedByRunId = new Map<string, RunProofRecord>();
  const eventById = new Map<string, OrderedEvent>();

  for (const [order, event] of orderedEvents.entries()) {
    orderByEventId.set(event.id, order);
    eventById.set(event.id, event);

    switch (event.type) {
      case "agent.task.status.changed":
        statusByTask.set(event.payload.taskId as string, {
          event,
          order,
          taskId: event.payload.taskId as string,
          status: event.payload.status as AgentTaskStatus,
          runId: event.payload.runId as string | undefined
        });
        break;

      case "agent.task.orchestration.claimed": {
        const draft = ensureAttemptDraft(attempts, event);
        draft.claims.push({
          event,
          order,
          attemptId: event.payload.attemptId as string,
          leaseClaimGeneration: event.payload.leaseClaimGeneration as number,
          workerId: event.payload.workerId as string,
          claimedAt: event.payload.claimedAt as string,
          leaseExpiresAt: event.payload.leaseExpiresAt as string
        });
        rememberAttemptEvent(draft, event);
        break;
      }

      case "agent.task.orchestration.checkpointed": {
        const draft = ensureAttemptDraft(attempts, event);
        draft.checkpoints.push({
          event,
          order,
          checkpointKind: event.payload.checkpointKind as string,
          checkpointedAt: event.payload.checkpointedAt as string,
          runId: event.payload.runId as string | undefined,
          toolRequestIds: freezeArray((event.payload.toolRequestIds as readonly string[] | undefined) ?? []),
          safeNextActions: freezeArray((event.payload.safeNextActions as readonly string[] | undefined) ?? []),
          latestPromptBindingReceipt: projectPromptBindingReceipt({
            checkpointEventId: event.id,
            checkpointKind: event.payload.checkpointKind,
            taskId: event.payload.taskId,
            attemptId: event.payload.attemptId,
            runId: event.payload.runId
          }, event.payload.promptBindingReceipt
          )
        });
        rememberAttemptEvent(draft, event);
        break;
      }

      case "agent.task.orchestration.released": {
        const draft = ensureAttemptDraft(attempts, event);
        draft.releases.push({
          event,
          order,
          releaseReason: event.payload.releaseReason as string,
          claimEventId: event.payload.claimEventId as string,
          checkpointEventId: event.payload.checkpointEventId as string | undefined
        });
        rememberAttemptEvent(draft, event);
        break;
      }

      case "agent.task.orchestration.completed": {
        const draft = ensureAttemptDraft(attempts, event);
        const handoffReadback = event.payload.handoffReadback as CompletionRecord["handoffReadback"];
        draft.completion = {
          event,
          order,
          attemptId: event.payload.attemptId as string,
          runId: event.payload.runId as string,
          specialistRunCompletedEventId: event.payload.specialistRunCompletedEventId as string,
          finalOutputStepEventId: event.payload.finalOutputStepEventId as string,
          handoffPreparedEventId: event.payload.handoffPreparedEventId as string,
          handoffRecordedEventId: event.payload.handoffRecordedEventId as string,
          handoffReadback
        };
        rememberAttemptEvent(draft, event);
        break;
      }

      case "agent.task.orchestration.failed": {
        const draft = ensureAttemptDraft(attempts, event);
        draft.failure = {
          event,
          order,
          runId: event.payload.runId as string | undefined
        };
        rememberAttemptEvent(draft, event);
        break;
      }

      case "agent.specialist-run.started":
        runsById.set(event.payload.runId as string, {
          event,
          order,
          runId: event.payload.runId as string,
          taskId: event.payload.taskId as string | undefined,
          runType: event.payload.runType as AgentSpecialistRunType
        });
        break;

      case "agent.specialist-run.step.recorded":
        if (event.payload.stepKind === "final-output") {
          finalOutputByRunId.set(event.payload.runId as string, { event, order });
        }
        break;

      case "agent.specialist-handoff.prepared":
        handoffPreparedByRunId.set(event.payload.runId as string, { event, order });
        break;

      case "agent.specialist-handoff.recorded":
        handoffRecordedByRunId.set(event.payload.runId as string, {
          event,
          order,
          handoffId: event.payload.handoffId as string,
          handoffManifestHash: event.payload.handoffManifestHash as string,
          verifiedAt: event.payload.verifiedAt as string
        });
        break;

      case "agent.specialist-run.completed":
        runCompletedByRunId.set(event.payload.runId as string, { event, order });
        break;

      default:
        break;
    }
  }

  const nowMs = options.now === undefined ? Date.now() : Date.parse(options.now instanceof Date ? options.now.toISOString() : options.now);
  const projectedAttempts = new Map<string, TaskOrchestratorAttemptProjection>();
  for (const draft of attempts.values()) {
    const status = statusByTask.get(draft.taskId);
    const runId = attemptRunId(draft, status, runsById);
    const projected = projectAttempt({
      draft,
      runId,
      nowMs,
      finalOutput: runId === undefined ? undefined : finalOutputByRunId.get(runId),
      handoffPrepared: runId === undefined ? undefined : handoffPreparedByRunId.get(runId),
      handoffRecorded: runId === undefined ? undefined : handoffRecordedByRunId.get(runId),
      runCompleted: runId === undefined ? undefined : runCompletedByRunId.get(runId),
      eventById,
      orderByEventId
    });
    projectedAttempts.set(draft.attemptKey, projected);
  }

  const projectedTasks = new Map<string, ProjectedTaskOrchestratorTask>();
  for (const status of statusByTask.values()) {
    const taskAttempts = [...projectedAttempts.values()].filter((attempt) => attempt.taskId === status.taskId);
    const projectedTask = projectTask(status, taskAttempts, orderByEventId);
    projectedTasks.set(status.taskId, projectedTask);
  }

  const taskSnapshot = readonlyMapSnapshot(projectedTasks);
  const attemptSnapshot = readonlyMapSnapshot(projectedAttempts);
  return freezeProjected({
    tasks: taskSnapshot,
    attempts: attemptSnapshot,
    toDto() {
      return freezeProjected({
        tasks: sortedById([...taskSnapshot.values()], (task) => task.taskId),
        attempts: sortedById([...attemptSnapshot.values()], (attempt) => attempt.attemptKey)
      });
    }
  });
}

function projectAttempt(input: {
  readonly draft: AttemptDraft;
  readonly runId?: string | undefined;
  readonly nowMs: number;
  readonly finalOutput?: RunProofRecord | undefined;
  readonly handoffPrepared?: RunProofRecord | undefined;
  readonly handoffRecorded?: HandoffRecordedRecord | undefined;
  readonly runCompleted?: RunProofRecord | undefined;
  readonly eventById: ReadonlyMap<string, OrderedEvent>;
  readonly orderByEventId: ReadonlyMap<string, number>;
}): TaskOrchestratorAttemptProjection {
  const latestClaim = input.draft.claims.at(-1);
  const latestCheckpoint = input.draft.checkpoints.at(-1);
  const latestPromptBindingReceipt = input.draft.checkpoints.findLast(
    (checkpoint) => checkpoint.latestPromptBindingReceipt !== undefined
  )?.latestPromptBindingReceipt;
  const latestRelease = input.draft.releases.at(-1);
  const latestClaimRelease = latestClaim === undefined
    ? undefined
    : input.draft.releases.findLast((release) => release.claimEventId === latestClaim.event.id && release.order > latestClaim.order);
  const activeClaims = input.draft.claims.filter((claim) =>
    !input.draft.releases.some((release) => release.claimEventId === claim.event.id && release.order > claim.order) &&
    input.draft.completion === undefined &&
    input.draft.failure === undefined
  );
  const duplicateActive = activeClaims.length > 1;
  const completionValidity = completionValidityFor(input);
  const activeLease = latestClaim === undefined || latestClaimRelease !== undefined
    ? undefined
    : projectLease(latestClaim, input.nowMs);
  const approvalSuspensionRelease = latestClaimRelease?.releaseReason === "approval-suspended" ? latestClaimRelease : undefined;
  const approvalSuspensionMatchesCheckpoint =
    approvalSuspensionRelease !== undefined &&
    latestCheckpoint?.checkpointKind === "approval-wait" &&
    approvalSuspensionRelease.checkpointEventId === latestCheckpoint.event.id &&
    approvalSuspensionRelease.order > latestCheckpoint.order;

  let state: TaskOrchestratorProjectionState = "blocked";
  let recoverable = false;
  let diagnosticReason: string | undefined;
  let suspendedCheckpoint: TaskOrchestratorSuspendedCheckpointProjection | undefined;
  const completedProof = input.draft.completion !== undefined && completionValidity.valid
    ? input.draft.completion
    : undefined;

  if (input.draft.failure !== undefined) {
    state = "failed";
  } else if (input.draft.completion !== undefined && completionValidity.valid) {
    state = "completed";
  } else if (input.draft.completion !== undefined) {
    state = completionValidity.reason === "handoff-readback-missing" ? "handoff-pending" : "blocked";
    diagnosticReason = completionValidity.reason;
    recoverable = state === "handoff-pending";
  } else if (duplicateActive) {
    state = "blocked";
    diagnosticReason = "duplicate-active-attempt";
  } else if ((input.finalOutput !== undefined || input.handoffPrepared !== undefined) && input.handoffRecorded === undefined) {
    state = "handoff-pending";
    diagnosticReason = "handoff-readback-missing";
    recoverable = true;
  } else if (approvalSuspensionMatchesCheckpoint) {
    state = "approval-suspended";
    suspendedCheckpoint = projectSuspendedCheckpoint(latestCheckpoint, approvalSuspensionRelease);
    recoverable = true;
  } else if (approvalSuspensionRelease !== undefined && latestCheckpoint?.checkpointKind === "approval-wait") {
    state = "blocked";
    diagnosticReason = "release-checkpoint-mismatch";
  } else if (latestCheckpoint?.checkpointKind === "runner-dispatching") {
    state = "handoff-pending";
    diagnosticReason = "handoff-readback-missing";
    recoverable = true;
  } else if (activeLease?.expired === true) {
    state = "stale-claim-recoverable";
    diagnosticReason = "claim-lease-expired";
    recoverable = true;
  } else if (activeLease !== undefined) {
    state = "claimed";
  } else if (latestCheckpoint?.checkpointKind === "handoff-pending") {
    state = "handoff-pending";
    diagnosticReason = "handoff-readback-missing";
    recoverable = true;
  } else if (latestCheckpoint?.checkpointKind === "blocked") {
    state = "blocked";
    diagnosticReason = "checkpoint-blocked";
  }

  const attemptId = latestClaim?.attemptId ?? input.draft.completion?.attemptId ?? "attempt_unknown";
  const latestCheckpointProjection: TaskOrchestratorLatestCheckpointProjection | undefined = latestCheckpoint === undefined
    ? undefined
    : freezeProjected({
      checkpointEventId: latestCheckpoint.event.id,
      checkpointKind: latestCheckpoint.checkpointKind,
      attemptId,
      ...(latestCheckpoint.runId === undefined ? {} : { runId: latestCheckpoint.runId })
    });

  return freezeProjected({
    attemptKey: input.draft.attemptKey,
    taskId: input.draft.taskId,
    runType: input.draft.runType,
    attemptId,
    retryGeneration: input.draft.retryGeneration,
    state,
    recoverable,
    leaseClaimGeneration: latestClaim?.leaseClaimGeneration,
    runId: input.runId,
    activeLease,
    suspendedCheckpoint,
    finalOutputStepEventId: completedProof?.finalOutputStepEventId ?? input.finalOutput?.event.id,
    handoffPreparedEventId: completedProof?.handoffPreparedEventId ?? input.handoffPrepared?.event.id,
    handoffRecordedEventId: completedProof?.handoffRecordedEventId ?? input.handoffRecorded?.event.id,
    handoffReadback: completedProof !== undefined
      ? freezeProjected(completedProof.handoffReadback)
      : input.handoffRecorded === undefined
      ? undefined
      : freezeProjected({
        handoffId: input.handoffRecorded.handoffId,
        handoffManifestHash: input.handoffRecorded.handoffManifestHash,
        handoffRecordedEventId: input.handoffRecorded.event.id,
        verifiedAt: input.handoffRecorded.verifiedAt
      }),
    latestCheckpoint: latestCheckpointProjection,
    latestPromptBindingReceipt,
    specialistRunCompletedEventId: completedProof?.specialistRunCompletedEventId ?? input.runCompleted?.event.id,
    orchestrationCompletedEventId: input.draft.completion?.event.id,
    orchestrationFailedEventId: input.draft.failure?.event.id,
    diagnosticReason,
    eventIds: freezeArray(input.draft.eventIds),
    causationIds: freezeArray(input.draft.causationIds)
  });
}

function projectPromptBindingReceipt(
  checkpoint: {
    readonly checkpointEventId: unknown;
    readonly checkpointKind: unknown;
    readonly taskId: unknown;
    readonly attemptId: unknown;
    readonly runId: unknown;
  },
  value: unknown
): TaskOrchestratorAttemptProjection["latestPromptBindingReceipt"] {
  if (
    checkpoint.checkpointKind !== "prompt-bound" ||
    typeof checkpoint.checkpointEventId !== "string" ||
    checkpoint.checkpointEventId.length === 0 ||
    typeof checkpoint.taskId !== "string" ||
    checkpoint.taskId.length === 0 ||
    typeof checkpoint.attemptId !== "string" ||
    checkpoint.attemptId.length === 0 ||
    typeof checkpoint.runId !== "string" ||
    checkpoint.runId.length === 0
  ) {
    return undefined;
  }
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const receipt = value as Record<string, unknown>;
  const keys = [
    "schemaVersion", "taskId", "attemptId", "runId", "sourceApprovedPromptArtifactHash", "boundPromptArtifactHash", "generatedAt", "approvalEventId",
    "providerPostureHash", "exactRunBindingHash", "workspaceId", "mountInstanceId", "receiptHash"
  ] as const;
  if (Object.keys(receipt).length !== keys.length || keys.some((key) => typeof receipt[key] !== "string")) {
    return undefined;
  }
  if (receipt.schemaVersion !== "agent-task-orchestrator.prompt-binding-receipt.v1") {
    return undefined;
  }
  const stringReceipt = receipt as Record<(typeof keys)[number], string>;
  let expectedReceiptHash: `sha256:${string}`;
  try {
    expectedReceiptHash = hashAgentTaskOrchestratorPromptBindingReceipt(stringReceipt);
  } catch {
    return undefined;
  }
  if (stringReceipt.receiptHash !== expectedReceiptHash) {
    return undefined;
  }
  if (
    stringReceipt.taskId !== checkpoint.taskId ||
    stringReceipt.attemptId !== checkpoint.attemptId ||
    stringReceipt.runId !== checkpoint.runId
  ) {
    return undefined;
  }
  return freezeProjected({
    checkpointEventId: checkpoint.checkpointEventId,
    taskId: stringReceipt.taskId,
    attemptId: stringReceipt.attemptId,
    runId: stringReceipt.runId,
    sourceApprovedPromptArtifactHash: stringReceipt.sourceApprovedPromptArtifactHash,
    boundPromptArtifactHash: stringReceipt.boundPromptArtifactHash,
    approvalEventId: stringReceipt.approvalEventId,
    providerPostureHash: stringReceipt.providerPostureHash,
    exactRunBindingHash: stringReceipt.exactRunBindingHash,
    receiptHash: stringReceipt.receiptHash
  });
}

function projectTask(
  status: StatusRecord,
  attempts: readonly TaskOrchestratorAttemptProjection[],
  orderByEventId: ReadonlyMap<string, number>
): ProjectedTaskOrchestratorTask {
  const activeAttempt = latestAttempt(attempts);
  let state: TaskOrchestratorProjectionState = status.status === "queued" ? "queued" : "blocked";
  let diagnosticReason: string | undefined;

  if (status.status === "canceled") {
    state = "canceled";
  } else if (status.status === "failed") {
    const failedAttempt = attempts.find((attempt) => attempt.orchestrationFailedEventId === status.event.context.causationId);
    const statusOrder = orderByEventId.get(status.event.id) ?? -1;
    const orchestrationFailureOrder = failedAttempt?.orchestrationFailedEventId === undefined
      ? undefined
      : orderByEventId.get(failedAttempt.orchestrationFailedEventId);
    if (failedAttempt?.state === "failed" && orchestrationFailureOrder !== undefined && orchestrationFailureOrder < statusOrder) {
      if (status.runId !== undefined && failedAttempt.runId !== undefined && status.runId !== failedAttempt.runId) {
        state = "blocked";
        diagnosticReason = "terminal-status-run-mismatch";
      } else {
        state = "failed";
      }
    } else {
      state = "blocked";
      diagnosticReason = "terminal-status-without-orchestration-failure";
    }
  } else if (status.status === "completed") {
    const completedAttempt = attempts.find((attempt) => attempt.orchestrationCompletedEventId === status.event.context.causationId);
    const statusOrder = orderByEventId.get(status.event.id) ?? -1;
    const orchestrationOrder = completedAttempt?.orchestrationCompletedEventId === undefined
      ? undefined
      : orderByEventId.get(completedAttempt.orchestrationCompletedEventId);
    if (completedAttempt?.state === "completed" && orchestrationOrder !== undefined && orchestrationOrder < statusOrder) {
      if (status.runId !== undefined && completedAttempt.runId !== undefined && status.runId !== completedAttempt.runId) {
        state = "blocked";
        diagnosticReason = "terminal-status-run-mismatch";
      } else {
        state = "completed";
      }
    } else {
      state = "blocked";
      diagnosticReason = completedAttempt?.diagnosticReason ?? "terminal-status-without-orchestration-completion";
    }
  } else if (activeAttempt?.state === "completed") {
    state = "blocked";
    diagnosticReason = "terminal-task-status-missing";
  } else if (activeAttempt?.state === "failed") {
    state = "blocked";
    diagnosticReason = "terminal-task-status-missing";
  } else if (activeAttempt !== undefined) {
    state = activeAttempt.state;
    diagnosticReason = activeAttempt.diagnosticReason;
  }

  return freezeProjected({
    taskId: status.taskId,
    taskStatus: status.status,
    state,
    statusEventId: status.event.id,
    statusChangedAt: status.event.context.occurredAt,
    activeAttemptKey: activeAttempt?.attemptKey,
    runId: status.runId ?? activeAttempt?.runId,
    diagnosticReason,
    eventIds: freezeArray([status.event.id, ...(activeAttempt?.eventIds ?? [])]),
    causationIds: freezeArray([
      ...(status.event.context.causationId === undefined ? [] : [status.event.context.causationId]),
      ...(activeAttempt?.causationIds ?? [])
    ])
  });
}

function completionValidityFor(input: {
  readonly draft: AttemptDraft;
  readonly finalOutput?: RunProofRecord | undefined;
  readonly handoffPrepared?: RunProofRecord | undefined;
  readonly handoffRecorded?: HandoffRecordedRecord | undefined;
  readonly runCompleted?: RunProofRecord | undefined;
  readonly eventById: ReadonlyMap<string, OrderedEvent>;
  readonly orderByEventId: ReadonlyMap<string, number>;
}): { readonly valid: boolean; readonly reason?: string | undefined } {
  const completion = input.draft.completion;
  if (completion === undefined) {
    return { valid: false, reason: "orchestration-completion-missing" };
  }
  const finalOutput = exactRunProof(input, completion.finalOutputStepEventId, completion.runId, "agent.specialist-run.step.recorded", (event) =>
    (event.payload as Record<string, unknown>).stepKind === "final-output"
  );
  if (finalOutput === undefined) {
    return { valid: false, reason: "final-output-missing" };
  }
  const handoffPrepared = exactRunProof(input, completion.handoffPreparedEventId, completion.runId, "agent.specialist-handoff.prepared");
  if (handoffPrepared === undefined) {
    return { valid: false, reason: "handoff-prepared-missing" };
  }
  const handoffRecorded = exactHandoffRecorded(input, completion.handoffRecordedEventId, completion.runId);
  if (handoffRecorded === undefined || completion.handoffReadback.handoffRecordedEventId !== completion.handoffRecordedEventId) {
    return { valid: false, reason: "handoff-readback-missing" };
  }
  const runCompleted = exactRunProof(input, completion.specialistRunCompletedEventId, completion.runId, "agent.specialist-run.completed");
  if (runCompleted === undefined) {
    return { valid: false, reason: "specialist-run-completion-missing" };
  }
  if (input.eventById.get(completion.handoffReadback.handoffRecordedEventId)?.id !== completion.handoffRecordedEventId) {
    return { valid: false, reason: "handoff-readback-missing" };
  }
  if (
    completion.handoffReadback.handoffId !== handoffRecorded.handoffId ||
    completion.handoffReadback.handoffManifestHash !== handoffRecorded.handoffManifestHash
  ) {
    return { valid: false, reason: "handoff-readback-missing" };
  }
  if (
    !(finalOutput.order < handoffPrepared.order) ||
    !(handoffPrepared.order < handoffRecorded.order) ||
    !(handoffRecorded.order < runCompleted.order) ||
    !(runCompleted.order < completion.order)
  ) {
    return { valid: false, reason: "terminal-sequence-invalid" };
  }
  return { valid: true };
}

function exactRunProof(
  input: {
    readonly eventById: ReadonlyMap<string, OrderedEvent>;
    readonly orderByEventId: ReadonlyMap<string, number>;
  },
  eventId: string,
  runId: string,
  eventType: KnowledgeEvent["type"],
  predicate: (event: OrderedEvent) => boolean = () => true
): RunProofRecord | undefined {
  const event = input.eventById.get(eventId);
  const order = input.orderByEventId.get(eventId);
  const payload = event?.payload as Record<string, unknown> | undefined;
  if (event === undefined || order === undefined || event.type !== eventType || payload?.runId !== runId || !predicate(event)) {
    return undefined;
  }
  return { event, order };
}

function exactHandoffRecorded(
  input: {
    readonly eventById: ReadonlyMap<string, OrderedEvent>;
    readonly orderByEventId: ReadonlyMap<string, number>;
  },
  eventId: string,
  runId: string
): HandoffRecordedRecord | undefined {
  const proof = exactRunProof(input, eventId, runId, "agent.specialist-handoff.recorded");
  if (proof === undefined) {
    return undefined;
  }
  return {
    event: proof.event,
    order: proof.order,
    handoffId: (proof.event.payload as Record<string, unknown>).handoffId as string,
    handoffManifestHash: (proof.event.payload as Record<string, unknown>).handoffManifestHash as string,
    verifiedAt: (proof.event.payload as Record<string, unknown>).verifiedAt as string
  };
}

function ensureAttemptDraft(attempts: Map<string, AttemptDraft>, event: OrderedEvent): AttemptDraft {
  const payload = event.payload as {
    readonly taskId: string;
    readonly runType: AgentSpecialistRunType;
    readonly retryGeneration: number;
  };
  const taskId = payload.taskId;
  const runType = payload.runType;
  const retryGeneration = payload.retryGeneration;
  const key = attemptKey(taskId, runType, retryGeneration);
  let draft = attempts.get(key);
  if (draft === undefined) {
    draft = {
      attemptKey: key,
      taskId,
      runType,
      retryGeneration,
      eventIds: [],
      causationIds: [],
      claims: [],
      checkpoints: [],
      releases: []
    };
    attempts.set(key, draft);
  }
  return draft;
}

function rememberAttemptEvent(draft: AttemptDraft, event: OrderedEvent): void {
  if (!draft.eventIds.includes(event.id)) {
    draft.eventIds.push(event.id);
  }
  if (event.context.causationId !== undefined && !draft.causationIds.includes(event.context.causationId)) {
    draft.causationIds.push(event.context.causationId);
  }
}

function attemptRunId(
  draft: AttemptDraft,
  status: StatusRecord | undefined,
  runsById: ReadonlyMap<string, RunRecord>
): string | undefined {
  if (draft.completion?.runId !== undefined) {
    return draft.completion.runId;
  }
  const checkpointRunId = draft.checkpoints.findLast((checkpoint) => checkpoint.runId !== undefined)?.runId;
  if (checkpointRunId !== undefined) {
    return checkpointRunId;
  }
  if (status?.runId !== undefined) {
    return status.runId;
  }
  return [...runsById.values()].find((run) => run.taskId === draft.taskId && run.runType === draft.runType)?.runId;
}

function projectLease(claim: ClaimRecord, nowMs: number): TaskOrchestratorLeaseProjection {
  return freezeProjected({
    claimEventId: claim.event.id,
    leaseClaimGeneration: claim.leaseClaimGeneration,
    workerId: claim.workerId,
    claimedAt: claim.claimedAt,
    leaseExpiresAt: claim.leaseExpiresAt,
    expired: Date.parse(claim.leaseExpiresAt) <= nowMs
  });
}

function projectSuspendedCheckpoint(
  checkpoint: CheckpointRecord,
  release: ReleaseRecord
): TaskOrchestratorSuspendedCheckpointProjection {
  return freezeProjected({
    checkpointEventId: checkpoint.event.id,
    checkpointKind: checkpoint.checkpointKind,
    checkpointedAt: checkpoint.checkpointedAt,
    releaseEventId: release.event.id,
    runId: checkpoint.runId,
    toolRequestIds: freezeArray(checkpoint.toolRequestIds),
    safeNextActions: freezeArray(checkpoint.safeNextActions)
  });
}

function latestAttempt(attempts: readonly TaskOrchestratorAttemptProjection[]): TaskOrchestratorAttemptProjection | undefined {
  return attempts.at(-1);
}

function canonicalizeEvents(events: readonly KnowledgeEvent[]): readonly OrderedEvent[] {
  const indexedEvents = [...events as readonly OrderedEvent[]].map((event, index) => ({ event, index }));
  const allEventsHaveGlobalSequence = indexedEvents.every(({ event }) =>
    event.globalSequence !== undefined && Number.isFinite(event.globalSequence)
  );

  if (!allEventsHaveGlobalSequence) {
    return freezeArray(indexedEvents.sort((left, right) => left.index - right.index).map(({ event }) => event));
  }

  return freezeArray(
    indexedEvents.sort((left, right) => {
      const leftEvent = left.event;
      const rightEvent = right.event;
      const globalOrder = compareOptionalNumber(leftEvent.globalSequence, rightEvent.globalSequence);
      if (globalOrder !== 0) {
        return globalOrder;
      }
      const occurredAtOrder = Date.parse(leftEvent.context.occurredAt) - Date.parse(rightEvent.context.occurredAt);
      if (occurredAtOrder !== 0) {
        return occurredAtOrder;
      }
      const streamOrder = leftEvent.streamId.localeCompare(rightEvent.streamId);
      if (streamOrder !== 0) {
        return streamOrder;
      }
      if (leftEvent.sequence !== rightEvent.sequence) {
        return leftEvent.sequence - rightEvent.sequence;
      }
      return leftEvent.id.localeCompare(rightEvent.id);
    }).map(({ event }) => event)
  );
}

function compareOptionalNumber(left: number | undefined, right: number | undefined): number {
  const leftFinite = left !== undefined && Number.isFinite(left);
  const rightFinite = right !== undefined && Number.isFinite(right);
  if (leftFinite && rightFinite && left !== right) {
    return (left ?? 0) - (right ?? 0);
  }
  if (leftFinite !== rightFinite) {
    return leftFinite ? -1 : 1;
  }
  return 0;
}

function attemptKey(taskId: string, runType: AgentSpecialistRunType, retryGeneration: number): string {
  return `${taskId}:${runType}:${retryGeneration}`;
}

function sortedById<T>(values: readonly T[], idFor: (value: T) => string): readonly T[] {
  return freezeArray([...values].sort((left, right) => idFor(left).localeCompare(idFor(right))));
}

function readonlyMapSnapshot<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source);
  let readonlyMap: ReadonlyMap<K, V>;

  readonlyMap = Object.freeze({
    get size() {
      return snapshot.size;
    },
    get(key: K) {
      return snapshot.get(key);
    },
    has(key: K) {
      return snapshot.has(key);
    },
    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
      snapshot.forEach((value, key) => callbackfn.call(thisArg, value, key, readonlyMap));
    },
    entries() {
      return snapshot.entries();
    },
    keys() {
      return snapshot.keys();
    },
    values() {
      return snapshot.values();
    },
    [Symbol.iterator]() {
      return snapshot[Symbol.iterator]();
    },
    get [Symbol.toStringTag]() {
      return "ReadonlyMap";
    }
  });

  return readonlyMap;
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeProjected<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
