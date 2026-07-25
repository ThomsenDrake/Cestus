import {
  validateKnowledgeEvent,
  type ActorRef,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { isConcurrencyConflict, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  buildTaskAttemptId,
  buildTaskOrchestrationClaimAppendInput,
  buildTaskOrchestratorIdempotencyKey,
  taskOrchestrationStreamId
} from "./task-orchestrator-events.js";
import type {
  AssembleTaskOrchestratorContextInput,
  TaskOrchestratorContextBinding,
  TaskOrchestrationCheckpointedEventPayload,
  TaskOrchestrationReleasedEventPayload,
  TaskOrchestratorBlockedReason,
  TaskOrchestratorBlockedSummary,
  TaskOrchestratorCandidateSummary,
  TaskOrchestratorClaimSummary,
  TaskOrchestratorConflictSummary,
  TaskOrchestratorApprovalSummary,
  TaskOrchestratorProviderPolicy,
  TaskOrchestratorReclaimSummary,
  TaskOrchestratorReleaseSummary,
  TaskOrchestratorRunType,
  TaskOrchestratorSkipSummary,
  TaskOrchestratorTickSummary
} from "./task-orchestrator-types.js";
import { assembleTaskOrchestratorContext } from "./task-orchestrator-context.js";
import { selectProviderForTask } from "./provider-selection.js";
import {
  createTaskOrchestratorProviderApprovalAdapter,
  taskOrchestratorApprovalContextBindingHashes,
  taskOrchestratorApprovalContextPackRefs,
  taskOrchestratorApprovalPromptArtifactHash,
  type TaskOrchestratorProviderApprovalInspection
} from "./task-orchestrator-approval.js";
import {
  appendSpecialistFinalOutputStep,
  finalizeSpecialistRunAfterHandoff,
  recordSpecialistHandoff,
  type AppendSpecialistFinalOutputStepInput,
  type RecordSpecialistHandoffInput,
  type RecordSpecialistHandoffResult,
  type SpecialistHandoffManifestStore
} from "./specialist-runner-kernel.js";
import type { SpecialistHandoffMaterial } from "./specialist-handoff-manifest.js";
import type { UntrustedSpecialistHandoffPreparationV1 } from "./specialist-handoff-preparation.js";
import type { ContextPackRegistry } from "./context-packs.js";
import type { SpecialistWorkflowDescriptor } from "./specialist-workflows.js";
import type { PromptArtifactEnvelope } from "./prompt-artifacts.js";
import type { ProductionRunScope } from "./production-specialist-registration-metadata.js";

export { assembleTaskOrchestratorContext } from "./task-orchestrator-context.js";

export interface TaskOrchestratorBudgets {
  readonly maxProviderInvocations: number;
  readonly remainingProviderInvocations: number;
  readonly contextByteBudget: number;
  readonly promptByteBudget: number;
  readonly derivativeArtifactByteBudget: number;
  readonly wallClockBudgetMs: number;
}

export interface TaskOrchestratorConcurrencyPolicy {
  readonly globalMaxActiveAttempts: number;
  readonly perRunTypeMaxActiveAttempts: Partial<Record<TaskOrchestratorRunType, number>>;
}

export interface TaskOrchestratorExplicitRetryGeneration {
  readonly taskId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly retryGeneration: number;
  readonly retryPolicyEventId: string;
}

export interface TaskOrchestratorPolicy {
  readonly defaultRunType: TaskOrchestratorRunType;
  readonly leaseDurationMs: number;
  readonly scope?: ProductionRunScope | undefined;
  readonly explicitRetryGenerations?: readonly TaskOrchestratorExplicitRetryGeneration[] | undefined;
  readonly providerPolicy?: TaskOrchestratorProviderPolicy | undefined;
}

export interface CreateTaskOrchestratorInput {
  readonly ledger: EventLedger;
  readonly now: () => string | Date;
  readonly actor: ActorRef;
  readonly policy: TaskOrchestratorPolicy;
  readonly concurrency: TaskOrchestratorConcurrencyPolicy;
  readonly budgets: TaskOrchestratorBudgets;
  readonly workflowRegistry: unknown;
  readonly contextRegistry: unknown;
  readonly promptRendererRegistry: unknown;
  readonly providerRegistry: unknown;
  readonly approvalReader: {
    inspect(input: Parameters<ReturnType<typeof createTaskOrchestratorProviderApprovalAdapter>["inspect"]>[0]): Promise<TaskOrchestratorProviderApprovalInspection>;
  } | unknown;
  readonly runnerRegistry: unknown;
  readonly handoffCapability: unknown;
}

export interface TaskOrchestratorRunnerDispatchInput {
  readonly taskId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly attemptId: string;
  readonly approvedRunId: string;
}

export interface TaskOrchestratorRunnerDurableHandoffResult {
  readonly runId: string;
  readonly taskId?: string;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
  readonly handoffMaterial: SpecialistHandoffMaterial;
}

export interface TaskOrchestratorRunnerPreparationResult {
  readonly schemaVersion: "agent.task-orchestrator.runner-preparation.v1";
  readonly preparation: UntrustedSpecialistHandoffPreparationV1;
}

export interface TaskOrchestratorRunnerDispatchResult {
  readonly preparation?: TaskOrchestratorRunnerPreparationResult;
  readonly durableHandoff?: TaskOrchestratorRunnerDurableHandoffResult;
}

export interface TaskOrchestratorRunnerRegistry {
  dispatch(input: TaskOrchestratorRunnerDispatchInput): Promise<TaskOrchestratorRunnerDispatchResult | void>;
}

export interface DispatchVerifiedTaskRunnerInput extends TaskOrchestratorRunnerDispatchInput {
  readonly registry: TaskOrchestratorRunnerRegistry;
  readonly verifiedProviderApproval: boolean;
  readonly verifiedContextBindings: boolean;
}

export interface CompleteTaskOrchestrationAfterHandoffInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly claim: ClaimEvent;
  readonly recorded: RecordSpecialistHandoffResult;
  readonly expectedRunId?: string;
  readonly appendTaskStatus?: boolean;
}

export interface SequenceTaskOrchestratorHandoffInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly claim: ClaimEvent;
  readonly runId: string;
  readonly taskId?: string;
  readonly expectedRunId?: string;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
  readonly handoffMaterial: SpecialistHandoffMaterial;
  readonly appendTaskStatus?: boolean;
  readonly handoffCapability?: TaskOrchestratorHandoffCapability | undefined;
}

export interface TaskOrchestratorHandoffSequenceResult {
  readonly finalOutputStepEventId: string;
  readonly handoffPreparedEventId: string;
  readonly handoffRecordedEventId: string;
  readonly specialistRunCompletedEventId?: string;
  readonly orchestrationCompletedEventId?: string;
  readonly taskStatusEventId?: string;
}

export type TaskOrchestratorHandoffPrepareInput = AppendSpecialistFinalOutputStepInput;
export type TaskOrchestratorHandoffBindInput = RecordSpecialistHandoffInput;

export interface TaskOrchestratorHandoffReadbackInput {
  readonly claim: ClaimEvent;
  readonly recorded: RecordSpecialistHandoffResult;
  readonly expectedRunId?: string | undefined;
}

export interface TaskOrchestratorHandoffCapability {
  prepare(input: TaskOrchestratorHandoffPrepareInput): Promise<KnowledgeEventOf<"agent.specialist-run.step.recorded">> | KnowledgeEventOf<"agent.specialist-run.step.recorded">;
  bind(input: TaskOrchestratorHandoffBindInput): Promise<RecordSpecialistHandoffResult> | RecordSpecialistHandoffResult;
  readback(input: TaskOrchestratorHandoffReadbackInput): Promise<RecordSpecialistHandoffResult> | RecordSpecialistHandoffResult;
}

export interface TaskOrchestrator {
  tick(): Promise<TaskOrchestratorTickSummary>;
}

/** The orchestrator only crosses into a runner after its exact approval gate. */
export async function dispatchVerifiedTaskRunner(
  input: DispatchVerifiedTaskRunnerInput
): Promise<TaskOrchestratorRunnerDispatchResult | void> {
  if (!input.verifiedProviderApproval) {
    throw new Error("Runner dispatch requires verified provider approval.");
  }
  if (!input.verifiedContextBindings) {
    throw new Error("Runner dispatch requires verified context bindings.");
  }
  return await input.registry.dispatch({
    taskId: input.taskId,
    runType: input.runType,
    attemptId: input.attemptId,
    approvedRunId: input.approvedRunId
  });
}

export async function sequenceTaskOrchestratorHandoff(
  input: SequenceTaskOrchestratorHandoffInput
): Promise<TaskOrchestratorHandoffSequenceResult> {
  const taskId = input.taskId ?? input.claim.payload.taskId;
  const handoffCapability = input.handoffCapability ?? createTaskOrchestratorHandoffCapability();
  const finalOutput = await handoffCapability.prepare({
    ledger: input.ledger,
    materialStore: input.materialStore,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    taskId,
    handoffMaterial: input.handoffMaterial
  });
  const bound = await handoffCapability.bind({
    ledger: input.ledger,
    manifestStore: input.manifestStore,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    taskId
  });
  const recorded = await handoffCapability.readback({
    claim: input.claim,
    recorded: bound,
    ...(input.expectedRunId === undefined ? {} : { expectedRunId: input.expectedRunId })
  });
  const completed = await completeTaskOrchestrationAfterHandoff({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    claim: input.claim,
    recorded,
    ...(input.expectedRunId === undefined ? {} : { expectedRunId: input.expectedRunId }),
    ...(input.appendTaskStatus === undefined ? {} : { appendTaskStatus: input.appendTaskStatus })
  });
  return Object.freeze({
    finalOutputStepEventId: finalOutput.id,
    handoffPreparedEventId: recorded.prepared.id,
    handoffRecordedEventId: recorded.recorded.id,
    ...(completed.specialistRunCompletedEventId === undefined ? {} : {
      specialistRunCompletedEventId: completed.specialistRunCompletedEventId
    }),
    ...(completed.orchestrationCompletedEventId === undefined ? {} : {
      orchestrationCompletedEventId: completed.orchestrationCompletedEventId
    }),
    ...(completed.taskStatusEventId === undefined ? {} : {
      taskStatusEventId: completed.taskStatusEventId
    })
  });
}

export function createTaskOrchestratorHandoffCapability(): TaskOrchestratorHandoffCapability {
  return Object.freeze({
    async prepare(input: TaskOrchestratorHandoffPrepareInput) {
      return await appendSpecialistFinalOutputStep(input);
    },
    async bind(input: TaskOrchestratorHandoffBindInput) {
      return await recordSpecialistHandoff(input);
    },
    async readback(input: TaskOrchestratorHandoffReadbackInput) {
      const expectedRunId = input.expectedRunId ?? input.recorded.recorded.payload.runId;
      if (input.recorded.recorded.payload.runId !== expectedRunId) {
        throw new Error("Durable specialist handoff readback runId does not match the approved run.");
      }
      const manifestHash = input.recorded.recorded.payload.handoffManifestHash as `sha256:${string}`;
      await input.recorded.manifestStore.get(manifestHash);
      return input.recorded;
    }
  });
}

export async function completeTaskOrchestrationAfterHandoff(
  input: CompleteTaskOrchestrationAfterHandoffInput
): Promise<{
  readonly specialistRunCompletedEventId?: string;
  readonly orchestrationCompletedEventId?: string;
  readonly taskStatusEventId?: string;
}> {
  assertRecordedHandoffMatchesClaim(input);
  if (await taskHasCanceledStatus(input)) {
    return Object.freeze({});
  }
  const finalized = await finalizeSpecialistRunAfterHandoff({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    recorded: input.recorded,
    appendTaskStatus: false
  });
  if (await taskHasCanceledStatus(input) || input.recorded.manifest.status !== "ready-for-review") {
    return Object.freeze({ specialistRunCompletedEventId: finalized.terminal.id });
  }
  const orchestration = await appendOrReuseOrchestrationCompleted(input, finalized.terminal.id);
  if (input.appendTaskStatus === false) {
    return Object.freeze({
      specialistRunCompletedEventId: finalized.terminal.id,
      orchestrationCompletedEventId: orchestration.id
    });
  }
  const taskStatus = await appendOrReuseTaskCompletedStatus(input, orchestration);
  return Object.freeze({
    specialistRunCompletedEventId: finalized.terminal.id,
    orchestrationCompletedEventId: orchestration.id,
    taskStatusEventId: taskStatus.id
  });
}

/**
 * Task 4's provider-facing readiness boundary. Task 3's tick intentionally
 * does not invoke this yet: provider, approval, and runner dispatch stay in
 * their later owned slices.
 */
export async function prepareTaskOrchestratorContext(
  input: AssembleTaskOrchestratorContextInput
) {
  return await assembleTaskOrchestratorContext(input);
}

type AgentTaskStatus = KnowledgeEventOf<"agent.task.status.changed">["payload"]["status"];
type Priority = KnowledgeEventOf<"agent.task.created">["payload"]["priority"];
type ClaimEvent = KnowledgeEventOf<"agent.task.orchestration.claimed">;
type ReleaseEvent = KnowledgeEventOf<"agent.task.orchestration.released">;
type CheckpointEvent = KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
type FailedEvent = KnowledgeEventOf<"agent.task.orchestration.failed">;
type CompletedEvent = KnowledgeEventOf<"agent.task.orchestration.completed">;

interface OrderedEvent<Event extends KnowledgeEvent = KnowledgeEvent> {
  readonly event: Event;
  readonly order: number;
}

interface TaskRecord {
  readonly taskId: string;
  readonly priority: Priority;
  readonly createdOrder: number;
  readonly createdEvent: KnowledgeEventOf<"agent.task.created">;
  readonly latestStatus?: OrderedEvent<KnowledgeEventOf<"agent.task.status.changed">> | undefined;
}

interface AttemptRecord {
  readonly taskId: string;
  readonly runType: TaskOrchestratorRunType;
  readonly retryGeneration: number;
  readonly claims: OrderedEvent<ClaimEvent>[];
  readonly releases: OrderedEvent<ReleaseEvent>[];
  readonly checkpoints: OrderedEvent<CheckpointEvent>[];
  readonly failed?: OrderedEvent<FailedEvent> | undefined;
  readonly completed?: OrderedEvent<CompletedEvent> | undefined;
}

interface ProjectionSnapshot {
  readonly tasks: ReadonlyMap<string, TaskRecord>;
  readonly attempts: readonly AttemptRecord[];
  readonly eventIds: ReadonlySet<string>;
}

interface MutableSummary {
  tickedAt: string;
  workerId: string;
  orderedCandidates: TaskOrchestratorCandidateSummary[];
  claimed: TaskOrchestratorClaimSummary[];
  reclaimed: TaskOrchestratorReclaimSummary[];
  released: TaskOrchestratorReleaseSummary[];
  skipped: TaskOrchestratorSkipSummary[];
  conflicts: TaskOrchestratorConflictSummary[];
  blocked: TaskOrchestratorBlockedSummary[];
  approvalWaiting: TaskOrchestratorApprovalSummary[];
  approvalVerified: TaskOrchestratorApprovalSummary[];
  sideEffectsScheduled: string[];
}

const priorityRank: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

export function createTaskOrchestrator(input: CreateTaskOrchestratorInput): TaskOrchestrator {
  void input.providerRegistry;

  return {
    async tick(): Promise<TaskOrchestratorTickSummary> {
      const tickedAt = normalizeNow(input.now());
      const summary: MutableSummary = {
        tickedAt,
        workerId: input.actor.id,
        orderedCandidates: [],
        claimed: [],
        reclaimed: [],
        released: [],
        skipped: [],
        conflicts: [],
        blocked: [],
        approvalWaiting: [],
        approvalVerified: [],
        sideEffectsScheduled: []
      };

      const snapshot = await readProjection(input.ledger);

      if (await handleCancellationRaces(input, snapshot, summary, tickedAt)) {
        return freezeSummary(summary);
      }

      if (await handleSuspendedApprovalWaits(input, snapshot, summary, tickedAt)) {
        return freezeSummary(summary);
      }

      if (await handleActiveClaims(input, snapshot, summary, tickedAt)) {
        return freezeSummary(summary);
      }

      if (await handleStaleClaims(input, snapshot, summary, tickedAt)) {
        return freezeSummary(summary);
      }

      const activeCounts = activeAttemptCounts(snapshot, tickedAt);
      summary.skipped.push(...nonClaimableTaskSkips(snapshot, input.policy));
      const candidates = candidateTasks(snapshot, input.policy).sort(compareCandidates);
      summary.orderedCandidates.push(...candidates.map((candidate) => candidate.summary));

      for (const candidate of candidates) {
        if (candidate.activeBoundary) {
          continue;
        }

        if (!hasConcurrencyCapacity(activeCounts, input.concurrency, candidate.runType)) {
          summary.skipped.push({ taskId: candidate.task.taskId, runType: candidate.runType, reason: "concurrency-limit" });
          continue;
        }

        const claim = await appendAndVerifyClaim(input, {
          task: candidate.task,
          runType: candidate.runType,
          retryGeneration: candidate.retryGeneration,
          leaseClaimGeneration: 1,
          tickedAt,
          causationEventId: candidate.retryPolicyEventId ?? candidate.task.latestStatus?.event.id ?? candidate.task.createdEvent.id
        });

        if (claim.kind === "conflict") {
          summary.conflicts.push({ taskId: candidate.task.taskId, runType: candidate.runType, reason: claim.reason });
          return freezeSummary(summary);
        }

        if (budgetBlocksProviderDispatch(input.budgets)) {
          const blocked = await appendBlockedCheckpoint(input, {
            taskId: candidate.task.taskId,
            runType: candidate.runType,
            attemptId: claim.event.payload.attemptId,
            retryGeneration: candidate.retryGeneration,
            leaseClaimGeneration: claim.event.payload.leaseClaimGeneration,
            checkpointKind: "blocked",
            reason: "provider-invocation-budget-exhausted",
            safeNextActions: ["raise provider invocation budget or cancel the task"],
            causationId: claim.event.id,
            tickedAt
          });
          const released = await appendRelease(input, {
            taskId: candidate.task.taskId,
            runType: candidate.runType,
            attemptId: claim.event.payload.attemptId,
            retryGeneration: candidate.retryGeneration,
            leaseClaimGeneration: claim.event.payload.leaseClaimGeneration,
            claimEventId: claim.event.id,
            checkpointEventId: blocked.id,
            releaseReason: "budget-blocked",
            safeNextActions: ["raise provider invocation budget or cancel the task"],
            causationId: blocked.id,
            tickedAt
          });
          summary.blocked.push({ taskId: candidate.task.taskId, runType: candidate.runType, reason: "provider-invocation-budget-exhausted" });
          summary.released.push(releaseSummary(released, claim.event));
          return freezeSummary(summary);
        }

        summary.claimed.push(claimSummary(claim.event, claim.expectedNextSequence));
        if (await checkpointContextOrBlock(input, claim.event, summary, tickedAt)) {
          if (summary.blocked.length > 0) {
            return freezeSummary(summary);
          }
        }
        if (await suspendForProviderApprovalIfNeeded(input, claim.event, summary, tickedAt)) {
          return freezeSummary(summary);
        }
        return freezeSummary(summary);
      }

      return freezeSummary(summary);
    }
  };
}

async function readProjection(ledger: EventLedger): Promise<ProjectionSnapshot> {
  const events = await ledger.readAll();
  const tasks = new Map<string, TaskRecord>();
  const attempts = new Map<string, AttemptRecord>();
  const eventIds = new Set<string>();

  for (const [order, event] of events.entries()) {
    eventIds.add(event.id);

    if (event.type === "agent.task.created") {
      tasks.set(event.payload.taskId, {
        taskId: event.payload.taskId,
        priority: event.payload.priority,
        createdOrder: order,
        createdEvent: event
      });
      continue;
    }

    if (event.type === "agent.task.status.changed") {
      const existing = tasks.get(event.payload.taskId);
      if (existing !== undefined) {
        tasks.set(event.payload.taskId, {
          ...existing,
          latestStatus: { event, order }
        });
      }
      continue;
    }

    if (isOrchestrationAttemptEvent(event)) {
      const key = attemptKey(event.payload.taskId, event.payload.runType, event.payload.retryGeneration);
      const existing = attempts.get(key) ?? {
        taskId: event.payload.taskId,
        runType: event.payload.runType,
        retryGeneration: event.payload.retryGeneration,
        claims: [],
        releases: [],
        checkpoints: []
      };
      if (event.type === "agent.task.orchestration.claimed") {
        existing.claims.push({ event, order });
      } else if (event.type === "agent.task.orchestration.released") {
        existing.releases.push({ event, order });
      } else if (event.type === "agent.task.orchestration.checkpointed") {
        existing.checkpoints.push({ event, order });
      }
      attempts.set(key, existing);
      continue;
    }

    if (event.type === "agent.task.orchestration.failed") {
      const key = attemptKey(event.payload.taskId, event.payload.runType, event.payload.retryGeneration);
      const existing = attempts.get(key) ?? {
        taskId: event.payload.taskId,
        runType: event.payload.runType,
        retryGeneration: event.payload.retryGeneration,
        claims: [],
        releases: [],
        checkpoints: []
      };
      attempts.set(key, { ...existing, failed: { event, order } });
      continue;
    }

    if (event.type === "agent.task.orchestration.completed") {
      const key = attemptKey(event.payload.taskId, event.payload.runType, event.payload.retryGeneration);
      const existing = attempts.get(key) ?? {
        taskId: event.payload.taskId,
        runType: event.payload.runType,
        retryGeneration: event.payload.retryGeneration,
        claims: [],
        releases: [],
        checkpoints: []
      };
      attempts.set(key, { ...existing, completed: { event, order } });
    }
  }

  return { tasks, attempts: [...attempts.values()], eventIds };
}

async function handleCancellationRaces(
  input: CreateTaskOrchestratorInput,
  snapshot: ProjectionSnapshot,
  summary: MutableSummary,
  tickedAt: string
): Promise<boolean> {
  for (const attempt of snapshot.attempts) {
    const task = snapshot.tasks.get(attempt.taskId);
    if (task?.latestStatus?.event.payload.status !== "canceled") {
      continue;
    }
    const active = activeClaimForAttempt(attempt, tickedAt, { includeExpired: true });
    if (active === undefined || isClaimReleased(attempt, active)) {
      continue;
    }
    const residentSuspensionInterlock = residentSuspensionInterlockFor(attempt, active);
    if (residentSuspensionInterlock !== undefined) {
      summary.skipped.push(residentSuspensionInterlock);
      return true;
    }

    const latestCheckpoint = attempt.checkpoints.at(-1);
    if (
      latestCheckpoint?.event.payload.checkpointKind === "handoff-pending" ||
      latestCheckpoint?.event.payload.checkpointKind === "runner-dispatching"
    ) {
      const blocked = await appendBlockedCheckpoint(input, {
        taskId: attempt.taskId,
        runType: attempt.runType,
        attemptId: active.event.payload.attemptId,
        retryGeneration: attempt.retryGeneration,
        leaseClaimGeneration: active.event.payload.leaseClaimGeneration,
        checkpointKind: "blocked",
        reason: "handoff-cancellation-pending",
        safeNextActions: ["complete durable handoff protocol before honoring cancellation"],
        causationId: latestCheckpoint.event.id,
        tickedAt
      });
      const released = await appendRelease(input, {
        taskId: attempt.taskId,
        runType: attempt.runType,
        attemptId: active.event.payload.attemptId,
        retryGeneration: attempt.retryGeneration,
        leaseClaimGeneration: active.event.payload.leaseClaimGeneration,
        claimEventId: active.event.id,
        checkpointEventId: blocked.id,
        releaseReason: "handoff-pending",
        safeNextActions: ["resume from durable handoff readback before terminal cancellation"],
        causationId: blocked.id,
        tickedAt
      });
      summary.blocked.push({ taskId: attempt.taskId, runType: attempt.runType, reason: "handoff-cancellation-pending" });
      summary.released.push(releaseSummary(released, active.event));
      return true;
    }

    const released = await appendRelease(input, {
      taskId: attempt.taskId,
      runType: attempt.runType,
      attemptId: active.event.payload.attemptId,
      retryGeneration: attempt.retryGeneration,
      leaseClaimGeneration: active.event.payload.leaseClaimGeneration,
      claimEventId: active.event.id,
      releaseReason: "canceled-before-dispatch",
      safeNextActions: ["leave the task canceled without dispatching provider or runner side effects"],
      causationId: task.latestStatus.event.id,
      tickedAt
    });
    summary.released.push(releaseSummary(released, active.event));
    return true;
  }

  for (const task of snapshot.tasks.values()) {
    if (task.latestStatus?.event.payload.status === "canceled") {
      summary.skipped.push({ taskId: task.taskId, runType: input.policy.defaultRunType, reason: "canceled-before-claim" });
    }
  }

  return false;
}

async function handleStaleClaims(
  input: CreateTaskOrchestratorInput,
  snapshot: ProjectionSnapshot,
  summary: MutableSummary,
  tickedAt: string
): Promise<boolean> {
  for (const attempt of snapshot.attempts) {
    const active = activeClaimForAttempt(attempt, tickedAt, { includeExpired: true });
    if (active === undefined || isClaimReleased(attempt, active) || !claimExpired(active.event, tickedAt)) {
      continue;
    }
    const residentSuspensionInterlock = residentSuspensionInterlockFor(attempt, active);
    if (residentSuspensionInterlock !== undefined) {
      summary.skipped.push(residentSuspensionInterlock);
      return true;
    }
    if (staleClaimSupersededByDurableState(attempt, active, snapshot.tasks.get(attempt.taskId))) {
      summary.skipped.push({ taskId: attempt.taskId, runType: attempt.runType, reason: "not-claimable" });
      continue;
    }
    const release = await appendRelease(input, {
      taskId: attempt.taskId,
      runType: attempt.runType,
      attemptId: active.event.payload.attemptId,
      retryGeneration: attempt.retryGeneration,
      leaseClaimGeneration: active.event.payload.leaseClaimGeneration,
      claimEventId: active.event.id,
      releaseReason: "stale-recovered",
      safeNextActions: ["reclaim the same attempt with a higher lease generation"],
      causationId: active.event.id,
      tickedAt
    });
    const task = snapshot.tasks.get(attempt.taskId);
    const claim = await appendAndVerifyClaim(input, {
      task,
      runType: attempt.runType,
      retryGeneration: attempt.retryGeneration,
      leaseClaimGeneration: active.event.payload.leaseClaimGeneration + 1,
      attemptId: active.event.payload.attemptId,
      tickedAt,
      causationEventId: release.id
    });
    if (claim.kind === "conflict") {
      summary.conflicts.push({ taskId: attempt.taskId, runType: attempt.runType, reason: claim.reason });
      return true;
    }
    summary.reclaimed.push({
      ...claimSummary(claim.event, claim.expectedNextSequence),
      previousClaimEventId: active.event.id,
      previousLeaseClaimGeneration: active.event.payload.leaseClaimGeneration,
      releaseEventId: release.id
    });
    return true;
  }

  return false;
}

async function handleActiveClaims(
  input: CreateTaskOrchestratorInput,
  snapshot: ProjectionSnapshot,
  summary: MutableSummary,
  tickedAt: string
): Promise<boolean> {
  for (const attempt of snapshot.attempts) {
    const active = activeClaimForAttempt(attempt, tickedAt);
    if (active === undefined) {
      continue;
    }
    const residentSuspensionInterlock = residentSuspensionInterlockFor(attempt, active);
    if (residentSuspensionInterlock !== undefined) {
      summary.skipped.push(residentSuspensionInterlock);
      return true;
    }
    const task = snapshot.tasks.get(attempt.taskId);
    if (task?.latestStatus?.event.payload.status === "canceled") {
      continue;
    }
    if (await checkpointContextOrBlock(input, active.event, summary, tickedAt, attempt)) {
      return true;
    }
    if (await suspendForProviderApprovalIfNeeded(input, active.event, summary, tickedAt)) {
      return true;
    }
  }
  return false;
}

async function checkpointContextOrBlock(
  input: CreateTaskOrchestratorInput,
  claim: ClaimEvent,
  summary: MutableSummary,
  tickedAt: string,
  attempt?: AttemptRecord | undefined
): Promise<boolean> {
  const capabilities = contextAssemblyCapabilities(input);
  if (capabilities === undefined || hasContextReadyCheckpoint(attempt)) {
    return false;
  }

  let mountedPromptHash: string | undefined;
  let revalidateMountedPromptAfterFinalLedgerRead: (() => Promise<void>) | undefined;
  try {
    // Claim identity and the normalized tick time are Task133.5 render inputs.
    // Capture them before any context resolution can suspend.
    const attemptId = claim.payload.attemptId;
    const generatedAt = tickedAt;
    const taskId = claim.payload.taskId;
    const runType = claim.payload.runType;
    const scope = input.policy.scope ?? { kind: "task" as const, refs: [taskId] };
    const workflow = capabilities.workflowRegistry.require(claim.payload.runType);
    const assembled = await assembleTaskOrchestratorContext({
      taskId,
      attemptId,
      generatedAt,
      runType,
      scope,
      workflow,
      contextRegistry: capabilities.contextRegistry,
      renderPrompt: async (renderInput) => {
        const rendered = await capabilities.promptRendererRegistry.render(renderInput);
        const renderedPromptHash = promptArtifactHashFrom(rendered);
        const readback = await capabilities.promptRendererRegistry.readback(renderInput, rendered);
        if (typeof readback === "string") {
          mountedPromptHash = readback;
        } else {
          mountedPromptHash = readback.inputArtifactHash;
          revalidateMountedPromptAfterFinalLedgerRead = readback.revalidateAfterFinalLedgerRead;
        }
        if (!isSha256(mountedPromptHash) || mountedPromptHash !== renderedPromptHash) {
          throw new Error("Task orchestrator context-ready prompt did not have exact mounted readback authority.");
        }
        return rendered;
      }
    });
    await appendContextReadyCheckpoint(input, {
      claim,
      contextBindings: assembled.checkpointContextBindings,
      promptArtifactHash: mountedPromptHash,
      revalidateMountedPromptAfterFinalLedgerRead,
      tickedAt
    });
    return true;
  } catch {
    const blocked = await appendBlockedCheckpoint(input, {
      taskId: claim.payload.taskId,
      runType: claim.payload.runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "blocked",
      reason: "context-not-ready",
      safeNextActions: ["repair registered resolved context packs before provider transfer"],
      causationId: claim.id,
      tickedAt
    });
    const released = await appendRelease(input, {
      taskId: claim.payload.taskId,
      runType: claim.payload.runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      claimEventId: claim.id,
      checkpointEventId: blocked.id,
      releaseReason: "worker-shutdown",
      safeNextActions: ["repair registered resolved context packs before provider transfer"],
      causationId: blocked.id,
      tickedAt
    });
    summary.blocked.push({ taskId: claim.payload.taskId, runType: claim.payload.runType, reason: "context-not-ready" });
    summary.released.push(releaseSummary(released, claim));
    return true;
  }
}

async function suspendForProviderApprovalIfNeeded(
  input: CreateTaskOrchestratorInput,
  claim: ClaimEvent,
  summary: MutableSummary,
  tickedAt: string
): Promise<boolean> {
  const providerPolicy = input.policy.providerPolicy;
  const approval = providerApprovalAdapter(input);
  if (providerPolicy === undefined || approval === undefined) {
    return false;
  }

  const selected = selectProviderForTask({
    registry: providerPolicy.registry,
    task: providerPolicy.task,
    readinessByProviderId: providerPolicy.readinessByProviderId,
    policy: providerPolicy.selectionPolicy
  });
  if (!selected.ok || selected.approvalClass !== "provider-byte-transfer") {
    return false;
  }

  const inspection = await approval.inspect({
    ledger: input.ledger,
    taskId: claim.payload.taskId,
    residentAgentId: "agent_default",
    providerId: selected.providerId,
    modelId: selected.modelId,
    proof: providerPolicy.approval
  });
  if (inspection.status === "approved") {
    summary.approvalVerified.push(approvalSummary(claim, providerPolicy));
    await dispatchApprovedRunner(input, claim, providerPolicy, summary);
    return false;
  }

  const request = await readProviderApprovalRequest(input.ledger, providerPolicy);
  const checkpoint = await appendApprovalWaitCheckpoint(input, {
    claim,
    providerPolicy,
    providerId: selected.providerId,
    modelId: selected.modelId,
    capabilityIds: selected.capabilityIds,
    sourceEventIds: request.payload.sourceEventIds ?? [],
    inputArtifactHashes: request.payload.inputArtifactHashes ?? [],
    tickedAt
  });
  const released = await appendRelease(input, {
    taskId: claim.payload.taskId,
    runType: claim.payload.runType,
    attemptId: claim.payload.attemptId,
    retryGeneration: claim.payload.retryGeneration,
    leaseClaimGeneration: claim.payload.leaseClaimGeneration,
    claimEventId: claim.id,
    checkpointEventId: checkpoint.id,
    releaseReason: "approval-suspended",
    safeNextActions: ["wait for exact provider byte-transfer approval before reclaiming this attempt"],
    causationId: checkpoint.id,
    tickedAt
  });
  summary.approvalWaiting.push(approvalSummary(claim, providerPolicy));
  summary.released.push(releaseSummary(released, claim));
  return true;
}

async function handleSuspendedApprovalWaits(
  input: CreateTaskOrchestratorInput,
  snapshot: ProjectionSnapshot,
  summary: MutableSummary,
  tickedAt: string
): Promise<boolean> {
  const providerPolicy = input.policy.providerPolicy;
  const approval = providerApprovalAdapter(input);
  if (providerPolicy === undefined || approval === undefined) {
    return false;
  }
  const selected = selectProviderForTask({
    registry: providerPolicy.registry,
    task: providerPolicy.task,
    readinessByProviderId: providerPolicy.readinessByProviderId,
    policy: providerPolicy.selectionPolicy
  });
  if (!selected.ok || selected.approvalClass !== "provider-byte-transfer") {
    return false;
  }

  for (const attempt of snapshot.attempts) {
    const checkpoint = latestResumableApprovalWaitCheckpoint(attempt);
    if (checkpoint === undefined) {
      continue;
    }
    const checkpointClaim = attempt.claims.findLast((claim) =>
      claim.order < checkpoint.order &&
      claim.event.payload.attemptId === checkpoint.event.payload.attemptId &&
      claim.event.payload.leaseClaimGeneration === checkpoint.event.payload.leaseClaimGeneration
    );
    if (checkpointClaim === undefined) {
      continue;
    }
    const task = snapshot.tasks.get(attempt.taskId);
    if (task?.latestStatus?.event.payload.status === "canceled") {
      continue;
    }
    const owningClaim = activeClaimForAttempt(attempt, tickedAt, { includeExpired: true });
    if (owningClaim !== undefined) {
      const residentSuspensionInterlock = residentSuspensionInterlockFor(attempt, owningClaim);
      if (residentSuspensionInterlock !== undefined) {
        summary.skipped.push(residentSuspensionInterlock);
        return true;
      }
    }
    const checkpointRelease = attempt.releases.findLast((release) =>
      release.event.payload.checkpointEventId === checkpoint.event.id
    );
    if (checkpointRelease === undefined) {
      const released = await appendRelease(input, {
        taskId: attempt.taskId,
        runType: attempt.runType,
        attemptId: checkpointClaim.event.payload.attemptId,
        retryGeneration: attempt.retryGeneration,
        leaseClaimGeneration: checkpointClaim.event.payload.leaseClaimGeneration,
        claimEventId: checkpointClaim.event.id,
        checkpointEventId: checkpoint.event.id,
        releaseReason: "approval-suspended",
        safeNextActions: ["wait for exact provider byte-transfer approval before reclaiming this attempt"],
        causationId: checkpoint.event.id,
        tickedAt
      });
      summary.approvalWaiting.push(approvalSummary(checkpointClaim.event, providerPolicy));
      summary.released.push(releaseSummary(released, checkpointClaim.event));
      return true;
    }
    if (!checkpointMatchesProviderApprovalPolicy(checkpoint.event, providerPolicy, selected)) {
      summary.approvalWaiting.push(approvalSummary(checkpointClaim.event, providerPolicy));
      return true;
    }
    const inspection = await approval.inspect({
      ledger: input.ledger,
      taskId: attempt.taskId,
      residentAgentId: "agent_default",
      providerId: selected.providerId,
      modelId: selected.modelId,
      proof: providerPolicy.approval
    });
    const activeClaim = activeClaimForAttempt(attempt, tickedAt);
    if (activeClaim !== undefined && activeClaim.order > checkpoint.order) {
      if (inspection.status === "waiting") {
        summary.approvalWaiting.push(approvalSummary(activeClaim.event, providerPolicy));
      } else {
        summary.approvalVerified.push(approvalSummary(activeClaim.event, providerPolicy));
        await dispatchApprovedRunner(input, activeClaim.event, providerPolicy, summary);
      }
      return true;
    }
    if (inspection.status === "waiting") {
      summary.approvalWaiting.push(approvalSummary(checkpointClaim.event, providerPolicy));
      return true;
    }
    const claim = await appendAndVerifyClaim(input, {
      task,
      runType: attempt.runType,
      retryGeneration: attempt.retryGeneration,
      leaseClaimGeneration: Math.max(...attempt.claims.map((item) => item.event.payload.leaseClaimGeneration)) + 1,
      attemptId: checkpointClaim.event.payload.attemptId,
      tickedAt,
      causationEventId: checkpoint.event.id
    });
    if (claim.kind === "conflict") {
      summary.conflicts.push({ taskId: attempt.taskId, runType: attempt.runType, reason: claim.reason });
      return true;
    }
    const afterClaim = await readProjection(input.ledger);
    const currentTask = afterClaim.tasks.get(attempt.taskId);
    if (currentTask?.latestStatus?.event.payload.status === "canceled") {
      const released = await appendRelease(input, {
        taskId: attempt.taskId,
        runType: attempt.runType,
        attemptId: claim.event.payload.attemptId,
        retryGeneration: attempt.retryGeneration,
        leaseClaimGeneration: claim.event.payload.leaseClaimGeneration,
        claimEventId: claim.event.id,
        releaseReason: "canceled-before-dispatch",
        safeNextActions: ["leave the task canceled without provider dispatch"],
        causationId: currentTask.latestStatus.event.id,
        tickedAt
      });
      summary.released.push(releaseSummary(released, claim.event));
      return true;
    }
    summary.reclaimed.push({
      ...claimSummary(claim.event, claim.expectedNextSequence),
      previousClaimEventId: checkpointClaim.event.id,
      previousLeaseClaimGeneration: checkpointClaim.event.payload.leaseClaimGeneration,
      releaseEventId: checkpointRelease.event.id
    });
    summary.approvalVerified.push(approvalSummary(claim.event, providerPolicy));
    await dispatchApprovedRunner(input, claim.event, providerPolicy, summary);
    return true;
  }
  return false;
}

async function dispatchApprovedRunner(
  input: CreateTaskOrchestratorInput,
  claim: ClaimEvent,
  providerPolicy: TaskOrchestratorProviderPolicy,
  summary: MutableSummary
): Promise<void> {
  const registry = input.runnerRegistry;
  if (typeof registry !== "object" || registry === null || !("dispatch" in registry) || typeof registry.dispatch !== "function") {
    return;
  }

  const contextReady = await readVerifiedContextReadyCheckpoint(input.ledger, claim, providerPolicy);
  if (contextReady === undefined) {
    await blockClaimForMissingContext(input, claim, summary, normalizeNow(input.now()));
    return;
  }
  const dispatchCheckpoint = await appendRunnerDispatchingCheckpoint(input, claim, contextReady.event, providerPolicy, normalizeNow(input.now()));
  if (!dispatchCheckpoint.appended) {
    return;
  }
  const dispatchResult = await dispatchVerifiedTaskRunner({
    registry: registry as TaskOrchestratorRunnerRegistry,
    verifiedProviderApproval: true,
    verifiedContextBindings: contextReady.event.payload.contextBindings.length > 0,
    taskId: claim.payload.taskId,
    runType: claim.payload.runType,
    attemptId: claim.payload.attemptId,
    approvedRunId: providerPolicy.approval.runId
  });
  summary.sideEffectsScheduled.push(`runner-dispatch:${claim.payload.taskId}:${claim.payload.attemptId}`);
  const durableHandoff = dispatchResult?.durableHandoff;
  if (durableHandoff !== undefined) {
    if (durableHandoff.runId !== providerPolicy.approval.runId) {
      throw new Error("Runner durable handoff runId must match the exact approved provider-transfer run.");
    }
    await sequenceTaskOrchestratorHandoff({
      ledger: input.ledger,
      actor: input.actor,
      now: () => normalizeNow(input.now()),
      claim,
      runId: durableHandoff.runId,
      expectedRunId: providerPolicy.approval.runId,
      ...(durableHandoff.taskId === undefined ? {} : { taskId: durableHandoff.taskId }),
      materialStore: durableHandoff.materialStore,
      manifestStore: durableHandoff.manifestStore,
      handoffMaterial: durableHandoff.handoffMaterial,
      handoffCapability: taskOrchestratorHandoffCapability(input.handoffCapability)
    });
    summary.sideEffectsScheduled.push(`runner-handoff-completed:${claim.payload.taskId}:${durableHandoff.runId}`);
  }
}

async function readVerifiedContextReadyCheckpoint(
  ledger: EventLedger,
  claim: ClaimEvent,
  providerPolicy: TaskOrchestratorProviderPolicy
): Promise<OrderedEvent<CheckpointEvent> | undefined> {
  const stream = await ledger.readStream(taskOrchestrationStreamId(claim.payload.taskId, claim.payload.runType));
  const approvedContextHashes = taskOrchestratorApprovalContextBindingHashes(providerPolicy.approval);
  const approvedPromptHash = taskOrchestratorApprovalPromptArtifactHash(providerPolicy.approval);
  return stream
    .map((event, order) => ({ event, order }))
    .filter((ordered): ordered is OrderedEvent<CheckpointEvent> =>
      ordered.event.type === "agent.task.orchestration.checkpointed" &&
      ordered.event.payload.taskId === claim.payload.taskId &&
      ordered.event.payload.runType === claim.payload.runType &&
      ordered.event.payload.attemptId === claim.payload.attemptId &&
      ordered.event.payload.retryGeneration === claim.payload.retryGeneration &&
      ordered.event.payload.checkpointKind === "context-ready" &&
      ordered.event.payload.promptArtifactHash === approvedPromptHash &&
      sameOrderedStrings(
        ordered.event.payload.contextBindings.map((binding) => binding.contentHash),
        approvedContextHashes
      )
    )
    .at(-1);
}

async function blockClaimForMissingContext(
  input: CreateTaskOrchestratorInput,
  claim: ClaimEvent,
  summary: MutableSummary,
  tickedAt: string
): Promise<void> {
  const blocked = await appendBlockedCheckpoint(input, {
    taskId: claim.payload.taskId,
    runType: claim.payload.runType,
    attemptId: claim.payload.attemptId,
    retryGeneration: claim.payload.retryGeneration,
    leaseClaimGeneration: claim.payload.leaseClaimGeneration,
    checkpointKind: "blocked",
    reason: "context-not-ready",
    safeNextActions: ["repair registered resolved context packs before provider transfer"],
    causationId: claim.id,
    tickedAt
  });
  const released = await appendRelease(input, {
    taskId: claim.payload.taskId,
    runType: claim.payload.runType,
    attemptId: claim.payload.attemptId,
    retryGeneration: claim.payload.retryGeneration,
    leaseClaimGeneration: claim.payload.leaseClaimGeneration,
    claimEventId: claim.id,
    checkpointEventId: blocked.id,
    releaseReason: "worker-shutdown",
    safeNextActions: ["repair registered resolved context packs before provider transfer"],
    causationId: blocked.id,
    tickedAt
  });
  summary.blocked.push({ taskId: claim.payload.taskId, runType: claim.payload.runType, reason: "context-not-ready" });
  summary.released.push(releaseSummary(released, claim));
}

function checkpointMatchesProviderApprovalPolicy(
  checkpoint: CheckpointEvent,
  providerPolicy: TaskOrchestratorProviderPolicy,
  selected: Extract<ReturnType<typeof selectProviderForTask>, { readonly ok: true }>
): boolean {
  const payload = checkpoint.payload;
  return payload.runId === providerPolicy.approval.runId &&
    payload.toolRequestIds?.length === 1 &&
    payload.toolRequestIds[0] === providerPolicy.approval.toolRequestId &&
    payload.approvalRequirement?.approvalClass === "provider-byte-transfer" &&
    payload.approvalRequirement.approvalRequestEventId === providerPolicy.approval.approvalRequirementId &&
    payload.approvalRequirement.previewHash === providerPolicy.approval.approvedPreviewHash &&
    payload.providerPosture?.providerId === selected.providerId &&
    // The durable checkpoint schema calls this a model family. The provider
    // selector's stable modelId is the same provider capability family key.
    payload.providerPosture.modelFamily === selected.modelId &&
    payload.providerPosture.selectionPolicyVersion === providerPolicy.selectionPolicyVersion &&
    payload.promptArtifactHash === taskOrchestratorApprovalPromptArtifactHash(providerPolicy.approval) &&
    sameOrderedStrings(
      payload.contextBindings.map((binding) => binding.contentHash),
      taskOrchestratorApprovalContextBindingHashes(providerPolicy.approval)
    );
}

function lastClaimForAttempt(attempt: AttemptRecord): ClaimEvent {
  const claim = attempt.claims.at(-1)?.event;
  if (claim === undefined) {
    throw new Error("Approval-wait checkpoint has no task orchestration claim.");
  }
  return claim;
}

async function appendApprovalWaitCheckpoint(
  input: CreateTaskOrchestratorInput,
  checkpoint: {
    readonly claim: ClaimEvent;
    readonly providerPolicy: TaskOrchestratorProviderPolicy;
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityIds: readonly string[];
    readonly sourceEventIds: readonly string[];
    readonly inputArtifactHashes: readonly string[];
    readonly tickedAt: string;
  }
): Promise<CheckpointEvent> {
  const { claim, providerPolicy } = checkpoint;
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, claim.payload.runType);
  const stream = await input.ledger.readStream(streamId);
  const descriptor = providerPolicy.registry.require(checkpoint.providerId);
  const promptContextBindingHashes = taskOrchestratorApprovalContextBindingHashes(providerPolicy.approval);
  const promptContextPackRefs = taskOrchestratorApprovalContextPackRefs(providerPolicy.approval);
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(input, `corr_${claim.payload.taskId}`, claim.id, checkpoint.tickedAt),
    payload: {
      taskId: claim.payload.taskId,
      runType: claim.payload.runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "approval-wait",
      checkpointedAt: checkpoint.tickedAt,
      runId: providerPolicy.approval.runId,
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: claim.payload.taskId,
        runType: claim.payload.runType,
        retryGeneration: claim.payload.retryGeneration,
        attemptId: claim.payload.attemptId,
        phase: "resume-provider-byte-transfer-approval"
      }),
      toolRequestIds: [providerPolicy.approval.toolRequestId],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        previewHash: providerPolicy.approval.approvedPreviewHash,
        approvalRequestEventId: providerPolicy.approval.approvalRequirementId
      },
      providerPosture: {
        providerId: checkpoint.providerId,
        modelFamily: checkpoint.modelId,
        adapterVersion: descriptor.adapterVersion,
        capabilityIds: [...checkpoint.capabilityIds],
        readinessState: "approval-required",
        approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: descriptor.dataHandlingNotes,
        selectionPolicyVersion: providerPolicy.selectionPolicyVersion,
        sensitivityClass: providerPolicy.task.sensitivity,
        requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: promptContextPackRefs.map((ref, index) => ({
        contextPackId: ref.contextPackId,
        contentHash: promptContextBindingHashes[index] ?? ref.contentHash,
        sizeBytes: ref.sizeBytes,
        schemaId: ref.contextPackId,
        provenanceEventIds: [...(ref.sourceEventIds ?? ref.provenanceRefs).filter((value) => value.startsWith("evt_"))]
      })),
      sourceEventIds: [...checkpoint.sourceEventIds],
      inputArtifactHashes: [...checkpoint.inputArtifactHashes],
      promptArtifactHash: taskOrchestratorApprovalPromptArtifactHash(providerPolicy.approval),
      lockSnapshot: { activeLockIds: [], highWaterMark: 0 },
      safeNextActions: [
        `review ${providerPolicy.approval.approvalRequirementId}`,
        `confirm ${checkpoint.capabilityIds.join(",")}`
      ]
    }
  };
  return await input.ledger.append(event, { expectedNextSequence: stream.length + 1 }) as CheckpointEvent;
}

async function appendContextReadyCheckpoint(
  input: CreateTaskOrchestratorInput,
  checkpoint: {
    readonly claim: ClaimEvent;
    readonly contextBindings: readonly TaskOrchestratorContextBinding[];
    readonly promptArtifactHash?: string | undefined;
    /** Factory-held closure, invoked after the last stream read before append. */
    readonly revalidateMountedPromptAfterFinalLedgerRead?: (() => Promise<void>) | undefined;
    readonly tickedAt: string;
  }
): Promise<CheckpointEvent> {
  const { claim } = checkpoint;
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, claim.payload.runType);
  const contextBindings = checkpoint.contextBindings.map(checkpointBindingPayload);
  const sourceEventIds = uniqueStrings(contextBindings.flatMap((binding) => binding.provenanceEventIds));
  const inputArtifactHashes = uniqueStrings([
    ...contextBindings.map((binding) => binding.contentHash),
    ...(isSha256(checkpoint.promptArtifactHash) ? [checkpoint.promptArtifactHash] : [])
  ]);
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(input, `corr_${claim.payload.taskId}`, claim.id, checkpoint.tickedAt),
    payload: {
      taskId: claim.payload.taskId,
      runType: claim.payload.runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: checkpoint.tickedAt,
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: claim.payload.taskId,
        runType: claim.payload.runType,
        retryGeneration: claim.payload.retryGeneration,
        attemptId: claim.payload.attemptId,
        phase: "resume-context-ready"
      }),
      contextBindings,
      ...(sourceEventIds.length === 0 ? {} : { sourceEventIds }),
      ...(inputArtifactHashes.length === 0 ? {} : { inputArtifactHashes }),
      ...(isSha256(checkpoint.promptArtifactHash) ? { promptArtifactHash: checkpoint.promptArtifactHash } : {}),
      safeNextActions: ["continue to exact provider byte-transfer approval"]
    }
  };
  const stream = await input.ledger.readStream(streamId);
  await checkpoint.revalidateMountedPromptAfterFinalLedgerRead?.();
  return await input.ledger.append(event, { expectedNextSequence: stream.length + 1 }) as CheckpointEvent;
}

async function appendRunnerDispatchingCheckpoint(
  input: CreateTaskOrchestratorInput,
  claim: ClaimEvent,
  contextReady: CheckpointEvent,
  providerPolicy: TaskOrchestratorProviderPolicy,
  tickedAt: string
): Promise<{ readonly appended: boolean; readonly event?: CheckpointEvent | undefined }> {
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, claim.payload.runType);
  const stream = await input.ledger.readStream(streamId);
  const existing = stream.find((event) =>
    event.type === "agent.task.orchestration.checkpointed" &&
    event.payload.attemptId === claim.payload.attemptId &&
    event.payload.retryGeneration === claim.payload.retryGeneration &&
    event.payload.checkpointKind === "runner-dispatching" &&
    event.payload.runId === providerPolicy.approval.runId
  );
  if (existing !== undefined) {
    return { appended: false, event: existing as CheckpointEvent };
  }
  const promptArtifactHash = taskOrchestratorApprovalPromptArtifactHash(providerPolicy.approval);
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(input, `corr_${claim.payload.taskId}`, claim.id, tickedAt),
    payload: {
      taskId: claim.payload.taskId,
      runType: claim.payload.runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "runner-dispatching",
      checkpointedAt: tickedAt,
      runId: providerPolicy.approval.runId,
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: claim.payload.taskId,
        runType: claim.payload.runType,
        retryGeneration: claim.payload.retryGeneration,
        attemptId: claim.payload.attemptId,
        phase: "resume-runner-dispatch"
      }),
      toolRequestIds: [providerPolicy.approval.toolRequestId],
      contextBindings: contextReady.payload.contextBindings,
      inputArtifactHashes: uniqueStrings([...contextReady.payload.contextBindings.map((binding) => binding.contentHash), promptArtifactHash]),
      promptArtifactHash,
      safeNextActions: ["wait for durable specialist handoff readback"]
    }
  };
  const appended = await input.ledger.append(event, { expectedNextSequence: stream.length + 1 }) as CheckpointEvent;
  return { appended: true, event: appended };
}

async function readProviderApprovalRequest(
  ledger: EventLedger,
  providerPolicy: TaskOrchestratorProviderPolicy
): Promise<KnowledgeEventOf<"agent.tool.requested">> {
  const events = await ledger.readStream(`agent_tool_request_${providerPolicy.approval.toolRequestId}`);
  const request = events.find((event): event is KnowledgeEventOf<"agent.tool.requested"> =>
    event.type === "agent.tool.requested"
  );
  if (request === undefined || (request.payload.sourceEventIds?.length ?? 0) === 0 || (request.payload.inputArtifactHashes?.length ?? 0) === 0) {
    throw new Error("Provider byte-transfer approval wait requires a durable gateway request with source and artifact bindings.");
  }
  return request;
}

function providerApprovalAdapter(input: CreateTaskOrchestratorInput): ReturnType<typeof createTaskOrchestratorProviderApprovalAdapter> | undefined {
  const candidate = input.approvalReader;
  return typeof candidate === "object" && candidate !== null && "inspect" in candidate &&
    typeof candidate.inspect === "function"
    ? candidate as ReturnType<typeof createTaskOrchestratorProviderApprovalAdapter>
    : undefined;
}

function taskOrchestratorHandoffCapability(value: unknown): TaskOrchestratorHandoffCapability {
  if (
    typeof value === "object" && value !== null &&
    "prepare" in value && typeof value.prepare === "function" &&
    "bind" in value && typeof value.bind === "function" &&
    "readback" in value && typeof value.readback === "function"
  ) {
    return value as TaskOrchestratorHandoffCapability;
  }
  throw new Error("Task orchestrator durable handoff capability is not registered.");
}

function contextAssemblyCapabilities(input: CreateTaskOrchestratorInput): {
  readonly workflowRegistry: { require(runType: TaskOrchestratorRunType): SpecialistWorkflowDescriptor };
  readonly contextRegistry: ContextPackRegistry;
  readonly promptRendererRegistry: {
    render(renderInput: Parameters<NonNullable<AssembleTaskOrchestratorContextInput["renderPrompt"]>>[0]): unknown | Promise<unknown>;
    readback(renderInput: Parameters<NonNullable<AssembleTaskOrchestratorContextInput["renderPrompt"]>>[0], rendered: unknown):
      | string
      | { readonly inputArtifactHash: string; readonly revalidateAfterFinalLedgerRead?: (() => Promise<void>) | undefined }
      | Promise<string | { readonly inputArtifactHash: string; readonly revalidateAfterFinalLedgerRead?: (() => Promise<void>) | undefined }>;
  };
} | undefined {
  const workflowRegistry = input.workflowRegistry;
  const contextRegistry = input.contextRegistry;
  const promptRendererRegistry = input.promptRendererRegistry;
  if (
    typeof workflowRegistry !== "object" || workflowRegistry === null ||
    !("require" in workflowRegistry) || typeof workflowRegistry.require !== "function"
  ) {
    return undefined;
  }
  if (
    typeof contextRegistry !== "object" || contextRegistry === null ||
    !("buildResolved" in contextRegistry) || typeof contextRegistry.buildResolved !== "function" ||
    !("getDescriptor" in contextRegistry) || typeof contextRegistry.getDescriptor !== "function"
  ) {
    return undefined;
  }
  if (
    typeof promptRendererRegistry !== "object" || promptRendererRegistry === null ||
    !("render" in promptRendererRegistry) || typeof promptRendererRegistry.render !== "function" ||
    !("readback" in promptRendererRegistry) || typeof promptRendererRegistry.readback !== "function"
  ) {
    return undefined;
  }
  return {
    workflowRegistry: workflowRegistry as { require(runType: TaskOrchestratorRunType): SpecialistWorkflowDescriptor },
    contextRegistry: contextRegistry as ContextPackRegistry,
    promptRendererRegistry: promptRendererRegistry as {
      render(renderInput: Parameters<NonNullable<AssembleTaskOrchestratorContextInput["renderPrompt"]>>[0]): unknown | Promise<unknown>;
      readback(renderInput: Parameters<NonNullable<AssembleTaskOrchestratorContextInput["renderPrompt"]>>[0], rendered: unknown):
        | string
        | { readonly inputArtifactHash: string; readonly revalidateAfterFinalLedgerRead?: (() => Promise<void>) | undefined }
        | Promise<string | { readonly inputArtifactHash: string; readonly revalidateAfterFinalLedgerRead?: (() => Promise<void>) | undefined }>;
    }
  };
}

function hasContextReadyCheckpoint(attempt: AttemptRecord | undefined): boolean {
  return attempt?.checkpoints.some((checkpoint) => checkpoint.event.payload.checkpointKind === "context-ready") === true;
}

function latestResumableApprovalWaitCheckpoint(
  attempt: AttemptRecord
): OrderedEvent<CheckpointEvent> | undefined {
  const checkpoint = attempt.checkpoints.findLast((item) =>
    item.event.payload.checkpointKind === "approval-wait"
  );
  if (checkpoint === undefined) {
    return undefined;
  }
  const superseded = attempt.checkpoints.some((item) =>
    item.order > checkpoint.order &&
    (
      item.event.payload.checkpointKind === "blocked" ||
      item.event.payload.checkpointKind === "handoff-pending" ||
      item.event.payload.checkpointKind === "runner-dispatching"
    )
  );
  return superseded ? undefined : checkpoint;
}

function hasRunnerDispatchingCheckpointAfterClaim(
  attempt: AttemptRecord,
  claim: OrderedEvent<ClaimEvent>
): boolean {
  return attempt.checkpoints.some((checkpoint) =>
    checkpoint.order > claim.order &&
    checkpoint.event.payload.attemptId === claim.event.payload.attemptId &&
    checkpoint.event.payload.retryGeneration === claim.event.payload.retryGeneration &&
    checkpoint.event.payload.checkpointKind === "runner-dispatching"
  );
}

function checkpointBindingPayload(binding: TaskOrchestratorContextBinding) {
  return {
    contextPackId: binding.contextPackId,
    contentHash: binding.contentHash,
    sizeBytes: binding.byteLength,
    schemaId: binding.schemaId,
    provenanceEventIds: [...binding.provenanceEventIds]
  };
}

function promptArtifactHashFrom(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("manifest" in value)) {
    return undefined;
  }
  const manifest = (value as PromptArtifactEnvelope).manifest;
  return typeof manifest?.inputArtifactHash === "string" ? manifest.inputArtifactHash : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function isSha256(value: string | undefined): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function approvalSummary(
  claim: ClaimEvent,
  providerPolicy: TaskOrchestratorProviderPolicy
): TaskOrchestratorApprovalSummary {
  return Object.freeze({
    taskId: claim.payload.taskId,
    runType: claim.payload.runType,
    attemptId: claim.payload.attemptId,
    toolRequestId: providerPolicy.approval.toolRequestId,
    approvalRequirementId: providerPolicy.approval.approvalRequirementId
  });
}

function candidateTasks(snapshot: ProjectionSnapshot, policy: TaskOrchestratorPolicy): Array<{
  readonly task: TaskRecord;
  readonly runType: TaskOrchestratorRunType;
  readonly retryGeneration: number;
  readonly retryPolicyEventId?: string | undefined;
  readonly activeBoundary: boolean;
  readonly summary: TaskOrchestratorCandidateSummary;
}> {
  const candidates = [];
  for (const task of snapshot.tasks.values()) {
    const status = task.latestStatus?.event.payload.status;
    const runType = policy.defaultRunType;
    const explicitRetry = explicitRetryFor(policy, task.taskId, runType);

    if (status === "canceled" || status === "completed" || status === "running" || status === "waiting-for-approval") {
      continue;
    }
    if (status !== "queued" && explicitRetry === undefined) {
      continue;
    }
    if (explicitRetry !== undefined && !snapshot.eventIds.has(explicitRetry.retryPolicyEventId)) {
      continue;
    }
    const retryGeneration = explicitRetry?.retryGeneration ?? 0;
    const existingAttempt = snapshot.attempts.find((attempt) =>
      attempt.taskId === task.taskId && attempt.runType === runType && attempt.retryGeneration === retryGeneration
    );
    const activeBoundary = existingAttempt !== undefined &&
      existingAttempt.failed === undefined &&
      existingAttempt.completed === undefined;

    if (explicitRetry !== undefined && !hasRetryablePreviousFailure(snapshot, task.taskId, runType, explicitRetry.retryGeneration)) {
      continue;
    }

    if (existingAttempt?.completed !== undefined || (existingAttempt?.failed !== undefined && explicitRetry === undefined)) {
      continue;
    }

    candidates.push({
      task,
      runType,
      retryGeneration,
      retryPolicyEventId: explicitRetry?.retryPolicyEventId,
      activeBoundary,
      summary: {
        taskId: task.taskId,
        runType,
        priorityRank: priorityRank[task.priority],
        createdSequence: task.createdOrder
      }
    });
  }
  return candidates;
}

function nonClaimableTaskSkips(
  snapshot: ProjectionSnapshot,
  policy: TaskOrchestratorPolicy
): TaskOrchestratorSkipSummary[] {
  const skips: TaskOrchestratorSkipSummary[] = [];
  for (const task of snapshot.tasks.values()) {
    const status = task.latestStatus?.event.payload.status;
    if (status !== "failed" && status !== "blocked") {
      continue;
    }
    const runType = policy.defaultRunType;
    const explicitRetry = explicitRetryFor(policy, task.taskId, runType);
    if (
      explicitRetry === undefined ||
      !snapshot.eventIds.has(explicitRetry.retryPolicyEventId) ||
      !hasRetryablePreviousFailure(snapshot, task.taskId, runType, explicitRetry.retryGeneration)
    ) {
      skips.push({ taskId: task.taskId, runType, reason: "not-claimable" });
    }
  }
  return skips;
}

function compareCandidates(
  left: { readonly task: TaskRecord; readonly summary: TaskOrchestratorCandidateSummary; readonly retryGeneration: number; readonly runType: TaskOrchestratorRunType },
  right: { readonly task: TaskRecord; readonly summary: TaskOrchestratorCandidateSummary; readonly retryGeneration: number; readonly runType: TaskOrchestratorRunType }
): number {
  return left.summary.priorityRank - right.summary.priorityRank ||
    left.summary.createdSequence - right.summary.createdSequence ||
    left.task.taskId.localeCompare(right.task.taskId) ||
    left.retryGeneration - right.retryGeneration ||
    left.runType.localeCompare(right.runType);
}

function activeAttemptCounts(snapshot: ProjectionSnapshot, tickedAt: string): {
  readonly global: number;
  readonly byRunType: ReadonlyMap<TaskOrchestratorRunType, number>;
} {
  let global = 0;
  const byRunType = new Map<TaskOrchestratorRunType, number>();
  for (const attempt of snapshot.attempts) {
    const active = activeClaimForAttempt(attempt, tickedAt);
    if (active === undefined || attempt.failed !== undefined || attempt.completed !== undefined) {
      continue;
    }
    global += 1;
    byRunType.set(attempt.runType, (byRunType.get(attempt.runType) ?? 0) + 1);
  }
  return { global, byRunType };
}

function hasConcurrencyCapacity(
  counts: { readonly global: number; readonly byRunType: ReadonlyMap<TaskOrchestratorRunType, number> },
  policy: TaskOrchestratorConcurrencyPolicy,
  runType: TaskOrchestratorRunType
): boolean {
  if (counts.global >= policy.globalMaxActiveAttempts) {
    return false;
  }
  const runTypeLimit = policy.perRunTypeMaxActiveAttempts[runType] ?? policy.globalMaxActiveAttempts;
  return (counts.byRunType.get(runType) ?? 0) < runTypeLimit;
}

async function appendAndVerifyClaim(
  input: CreateTaskOrchestratorInput,
  claimInput: {
    readonly task?: TaskRecord | undefined;
    readonly runType: TaskOrchestratorRunType;
    readonly retryGeneration: number;
    readonly leaseClaimGeneration: number;
    readonly attemptId?: string | undefined;
    readonly tickedAt: string;
    readonly causationEventId: string;
  }
): Promise<{
  readonly kind: "claimed";
  readonly event: ClaimEvent;
  readonly expectedNextSequence: number;
} | {
  readonly kind: "conflict";
  readonly reason: TaskOrchestratorConflictSummary["reason"];
}> {
  const task = claimInput.task;
  if (task === undefined) {
    return { kind: "conflict", reason: "claim-readback-not-owned" };
  }
  const stream = await input.ledger.readStream(taskOrchestrationStreamId(task.taskId, claimInput.runType));
  const appendTarget = buildTaskOrchestrationClaimAppendInput({
    taskId: task.taskId,
    runType: claimInput.runType,
    latestSequence: stream.length
  });
  const attemptId = claimInput.attemptId ?? buildTaskAttemptId({
    taskId: task.taskId,
    runType: claimInput.runType,
    retryGeneration: claimInput.retryGeneration
  });
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.claimed"> = {
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: appendTarget.streamId,
    context: eventContext(input, `corr_${task.taskId}`, claimInput.causationEventId, claimInput.tickedAt),
    payload: {
      taskId: task.taskId,
      runType: claimInput.runType,
      attemptId,
      retryGeneration: claimInput.retryGeneration,
      leaseClaimGeneration: claimInput.leaseClaimGeneration,
      workerId: input.actor.id,
      claimedAt: claimInput.tickedAt,
      leaseExpiresAt: new Date(Date.parse(claimInput.tickedAt) + input.policy.leaseDurationMs).toISOString(),
      idempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: task.taskId,
        runType: claimInput.runType,
        retryGeneration: claimInput.retryGeneration,
        attemptId,
        phase: "claim"
      }),
      selectedOrderingPosition: {
        priorityRank: priorityRank[task.priority],
        queuedAt: task.latestStatus?.event.context.occurredAt ?? task.createdEvent.context.occurredAt,
        taskId: task.taskId,
        runType: claimInput.runType,
        retryGeneration: claimInput.retryGeneration
      },
      activeBudgetSnapshot: input.budgets,
      causationEventId: claimInput.causationEventId
    }
  };

  let committed: ClaimEvent;
  try {
    committed = await input.ledger.append(event, { expectedNextSequence: appendTarget.expectedNextSequence }) as ClaimEvent;
  } catch (error) {
    if (isConcurrencyConflict(error)) {
      return { kind: "conflict", reason: "claim-concurrency-conflict" };
    }
    throw error;
  }

  const readback = await input.ledger.readStream(appendTarget.streamId);
  if (!ownsLatestClaim(readback, committed)) {
    return { kind: "conflict", reason: "claim-readback-not-owned" };
  }

  return {
    kind: "claimed",
    event: committed,
    expectedNextSequence: appendTarget.expectedNextSequence
  };
}

async function appendBlockedCheckpoint(
  input: CreateTaskOrchestratorInput,
  checkpoint: {
    readonly taskId: string;
    readonly runType: TaskOrchestratorRunType;
    readonly attemptId: string;
    readonly retryGeneration: number;
    readonly leaseClaimGeneration: number;
    readonly checkpointKind: TaskOrchestrationCheckpointedEventPayload["checkpointKind"];
    readonly reason: TaskOrchestratorBlockedReason;
    readonly safeNextActions: readonly string[];
    readonly causationId: string;
    readonly tickedAt: string;
  }
): Promise<CheckpointEvent> {
  const streamId = taskOrchestrationStreamId(checkpoint.taskId, checkpoint.runType);
  const stream = await input.ledger.readStream(streamId);
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.checkpointed"> = {
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(input, `corr_${checkpoint.taskId}`, checkpoint.causationId, checkpoint.tickedAt),
    payload: {
      taskId: checkpoint.taskId,
      runType: checkpoint.runType,
      attemptId: checkpoint.attemptId,
      retryGeneration: checkpoint.retryGeneration,
      leaseClaimGeneration: checkpoint.leaseClaimGeneration,
      checkpointKind: checkpoint.checkpointKind,
      checkpointedAt: checkpoint.tickedAt,
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: checkpoint.taskId,
        runType: checkpoint.runType,
        retryGeneration: checkpoint.retryGeneration,
        attemptId: checkpoint.attemptId,
        phase: `resume-${checkpoint.reason}`
      }),
      contextBindings: [],
      safeNextActions: [...checkpoint.safeNextActions]
    }
  };
  return await input.ledger.append(event, { expectedNextSequence: stream.length + 1 }) as CheckpointEvent;
}

async function appendRelease(
  input: CreateTaskOrchestratorInput,
  release: {
    readonly taskId: string;
    readonly runType: TaskOrchestratorRunType;
    readonly attemptId: string;
    readonly retryGeneration: number;
    readonly leaseClaimGeneration: number;
    readonly claimEventId: string;
    readonly checkpointEventId?: string | undefined;
    readonly releaseReason: TaskOrchestrationReleasedEventPayload["releaseReason"];
    readonly safeNextActions: readonly string[];
    readonly causationId: string;
    readonly tickedAt: string;
  }
): Promise<ReleaseEvent> {
  const streamId = taskOrchestrationStreamId(release.taskId, release.runType);
  const stream = await input.ledger.readStream(streamId);
  const event: AppendableKnowledgeEvent<"agent.task.orchestration.released"> = {
    type: "agent.task.orchestration.released",
    version: 1,
    streamId,
    context: eventContext(input, `corr_${release.taskId}`, release.causationId, release.tickedAt),
    payload: {
      taskId: release.taskId,
      runType: release.runType,
      attemptId: release.attemptId,
      retryGeneration: release.retryGeneration,
      leaseClaimGeneration: release.leaseClaimGeneration,
      releasedBy: input.actor.id,
      releasedAt: release.tickedAt,
      releaseReason: release.releaseReason,
      claimEventId: release.claimEventId,
      ...(release.checkpointEventId === undefined ? {} : { checkpointEventId: release.checkpointEventId }),
      safeNextActions: [...release.safeNextActions]
    }
  };
  return await input.ledger.append(event, { expectedNextSequence: stream.length + 1 }) as ReleaseEvent;
}

function isOrchestrationAttemptEvent(
  event: KnowledgeEvent
): event is ClaimEvent | CheckpointEvent | ReleaseEvent {
  return event.type === "agent.task.orchestration.claimed" ||
    event.type === "agent.task.orchestration.checkpointed" ||
    event.type === "agent.task.orchestration.released";
}

function activeClaimForAttempt(
  attempt: AttemptRecord,
  tickedAt: string,
  options: { readonly includeExpired?: boolean | undefined } = {}
): OrderedEvent<ClaimEvent> | undefined {
  const claims = [...attempt.claims].sort((left, right) =>
    left.event.payload.leaseClaimGeneration - right.event.payload.leaseClaimGeneration || left.order - right.order
  );
  for (const claim of claims.toReversed()) {
    if (isClaimReleased(attempt, claim) || attempt.failed !== undefined || attempt.completed !== undefined) {
      continue;
    }
    if (options.includeExpired !== true && claimExpired(claim.event, tickedAt)) {
      continue;
    }
    return claim;
  }
  return undefined;
}

function isClaimReleased(attempt: AttemptRecord, claim: OrderedEvent<ClaimEvent>): boolean {
  return attempt.releases.some((release) =>
    release.event.payload.claimEventId === claim.event.id && release.order > claim.order
  );
}

function claimExpired(claim: ClaimEvent, tickedAt: string): boolean {
  return Date.parse(claim.payload.leaseExpiresAt) <= Date.parse(tickedAt);
}

function residentSuspensionInterlockFor(
  attempt: AttemptRecord,
  claim: OrderedEvent<ClaimEvent>
): TaskOrchestratorSkipSummary | undefined {
  const checkpoint = attempt.checkpoints.findLast((candidate) =>
    isSameClaimResidentLoopSuspension(candidate, claim)
  );
  if (checkpoint === undefined) {
    return undefined;
  }
  const residentSuspensionInterlock: TaskOrchestratorSkipSummary = {
    taskId: checkpoint.event.payload.taskId,
    runType: checkpoint.event.payload.runType,
    reason: "not-claimable"
  };
  return Object.freeze(residentSuspensionInterlock);
}

function isSameClaimResidentLoopSuspension(
  checkpoint: OrderedEvent<CheckpointEvent>,
  claim: OrderedEvent<ClaimEvent>
): boolean {
  if (checkpoint.order <= claim.order) {
    return false;
  }
  const parsed = validateKnowledgeEvent(checkpoint.event);
  if (!parsed.success || parsed.data.type !== "agent.task.orchestration.checkpointed") {
    return false;
  }
  const payload = parsed.data.payload;
  const instruction = payload.residentLoopSuspension;
  return payload.checkpointKind === "resident-loop-suspension" &&
    instruction !== undefined &&
    parsed.data.streamId === claim.event.streamId &&
    payload.taskId === claim.event.payload.taskId &&
    payload.runType === claim.event.payload.runType &&
    payload.attemptId === claim.event.payload.attemptId &&
    payload.retryGeneration === claim.event.payload.retryGeneration &&
    payload.leaseClaimGeneration === claim.event.payload.leaseClaimGeneration &&
    parsed.data.context.causationId === claim.event.id &&
    payload.runId === instruction.runId &&
    instruction.taskId === claim.event.payload.taskId &&
    instruction.attemptId === claim.event.payload.attemptId &&
    instruction.orchestrationClaimEventId === claim.event.id &&
    instruction.leaseClaimGeneration === claim.event.payload.leaseClaimGeneration;
}

function ownsLatestClaim(stream: readonly KnowledgeEvent[], claim: ClaimEvent): boolean {
  const latestEvent = stream.at(-1);
  if (latestEvent?.id !== claim.id) {
    return false;
  }
  const latestClaim = latestEvent.type === "agent.task.orchestration.claimed" ? latestEvent : undefined;
  return latestClaim?.id === claim.id &&
    latestClaim.payload.taskId === claim.payload.taskId &&
    latestClaim.payload.runType === claim.payload.runType &&
    latestClaim.payload.attemptId === claim.payload.attemptId &&
    latestClaim.payload.retryGeneration === claim.payload.retryGeneration &&
    latestClaim.payload.leaseClaimGeneration === claim.payload.leaseClaimGeneration;
}

function explicitRetryFor(
  policy: TaskOrchestratorPolicy,
  taskId: string,
  runType: TaskOrchestratorRunType
): TaskOrchestratorExplicitRetryGeneration | undefined {
  return policy.explicitRetryGenerations
    ?.filter((retry) =>
      retry.taskId === taskId &&
      retry.runType === runType &&
      typeof retry.retryPolicyEventId === "string" &&
      retry.retryPolicyEventId.length > 0
    )
    .sort((left, right) => right.retryGeneration - left.retryGeneration)
    .at(0);
}

function staleClaimSupersededByDurableState(
  attempt: AttemptRecord,
  claim: OrderedEvent<ClaimEvent>,
  task: TaskRecord | undefined
): boolean {
  const supersedingCheckpoint = attempt.checkpoints.some((checkpoint) =>
    checkpoint.order > claim.order &&
    (
      checkpoint.event.payload.checkpointKind === "approval-wait" ||
      checkpoint.event.payload.checkpointKind === "handoff-pending" ||
      checkpoint.event.payload.checkpointKind === "runner-dispatching"
    )
  );
  if (supersedingCheckpoint) {
    return true;
  }

  const status = task?.latestStatus;
  return status !== undefined &&
    status.order > claim.order &&
    (
      status.event.payload.status === "waiting-for-approval" ||
      status.event.payload.status === "failed" ||
      status.event.payload.status === "completed"
    );
}

function hasRetryablePreviousFailure(
  snapshot: ProjectionSnapshot,
  taskId: string,
  runType: TaskOrchestratorRunType,
  retryGeneration: number
): boolean {
  return snapshot.attempts.some((attempt) =>
    attempt.taskId === taskId &&
    attempt.runType === runType &&
    attempt.retryGeneration === retryGeneration - 1 &&
    attempt.failed?.event.payload.retryable === true
  );
}

function budgetBlocksProviderDispatch(budgets: TaskOrchestratorBudgets): boolean {
  return budgets.maxProviderInvocations <= 0 ||
    budgets.remainingProviderInvocations <= 0 ||
    budgets.contextByteBudget <= 0 ||
    budgets.promptByteBudget <= 0 ||
    budgets.derivativeArtifactByteBudget <= 0 ||
    budgets.wallClockBudgetMs <= 0;
}

function claimSummary(event: ClaimEvent, expectedNextSequence: number): TaskOrchestratorClaimSummary {
  return Object.freeze({
    taskId: event.payload.taskId,
    runType: event.payload.runType,
    attemptId: event.payload.attemptId,
    retryGeneration: event.payload.retryGeneration,
    leaseClaimGeneration: event.payload.leaseClaimGeneration,
    claimEventId: event.id,
    expectedNextSequence
  });
}

function releaseSummary(release: ReleaseEvent, claim: ClaimEvent): TaskOrchestratorReleaseSummary {
  return Object.freeze({
    taskId: release.payload.taskId,
    runType: release.payload.runType,
    attemptId: release.payload.attemptId,
    retryGeneration: release.payload.retryGeneration,
    leaseClaimGeneration: release.payload.leaseClaimGeneration,
    claimEventId: claim.id,
    releaseEventId: release.id,
    releaseReason: release.payload.releaseReason
  });
}

function eventContext(
  input: CreateTaskOrchestratorInput,
  correlationId: string,
  causationId: string,
  occurredAt: string
): KnowledgeEvent["context"] {
  return {
    actor: input.actor,
    occurredAt,
    causationId,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function completionEventContext(
  input: Pick<CompleteTaskOrchestrationAfterHandoffInput, "actor">,
  causationId: string,
  occurredAt: string
): KnowledgeEvent["context"] {
  return {
    actor: input.actor,
    occurredAt,
    causationId,
    correlationId: `corr_${input.actor.id}_orchestration_completion`,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function assertRecordedHandoffMatchesClaim(input: CompleteTaskOrchestrationAfterHandoffInput): void {
  const manifest = input.recorded.manifest;
  if (input.expectedRunId !== undefined && manifest.runId !== input.expectedRunId) {
    throw new Error("Task orchestration completion requires the recorded handoff to match the approved run.");
  }
  if (manifest.taskId !== input.claim.payload.taskId) {
    throw new Error("Task orchestration completion requires the recorded handoff to match the claimed task.");
  }
  if (manifest.runType !== input.claim.payload.runType) {
    throw new Error("Task orchestration completion requires the recorded handoff run type to match the claim.");
  }
  if (
    input.recorded.prepared.payload.taskId !== input.claim.payload.taskId ||
    input.recorded.recorded.payload.taskId !== input.claim.payload.taskId ||
    (input.expectedRunId !== undefined && input.recorded.prepared.payload.runId !== input.expectedRunId) ||
    (input.expectedRunId !== undefined && input.recorded.recorded.payload.runId !== input.expectedRunId) ||
    (input.expectedRunId !== undefined && input.recorded.handoff.runId !== input.expectedRunId) ||
    input.recorded.prepared.payload.runType !== input.claim.payload.runType ||
    input.recorded.recorded.payload.runType !== input.claim.payload.runType ||
    input.recorded.handoff.taskId !== input.claim.payload.taskId ||
    input.recorded.handoff.runType !== input.claim.payload.runType
  ) {
    throw new Error("Task orchestration completion requires exact task handoff readback for the claimed boundary.");
  }
}

async function appendOrReuseOrchestrationCompleted(
  input: CompleteTaskOrchestrationAfterHandoffInput,
  specialistRunCompletedEventId: string
): Promise<CompletedEvent> {
  const streamId = taskOrchestrationStreamId(input.claim.payload.taskId, input.claim.payload.runType);
  const stream = await input.ledger.readStream(streamId);
  const existing = stream.filter((event): event is CompletedEvent =>
    event.type === "agent.task.orchestration.completed" &&
    event.payload.taskId === input.claim.payload.taskId &&
    event.payload.runType === input.claim.payload.runType &&
    event.payload.retryGeneration === input.claim.payload.retryGeneration
  );
  const exact = existing.find((event) =>
    orchestrationCompletionMatches(event, input, specialistRunCompletedEventId)
  );
  if (exact !== undefined) {
    if (existing.some((event) => event.id !== exact.id && !orchestrationCompletionMatches(event, input, specialistRunCompletedEventId))) {
      throw new Error("Conflicting task orchestration completion exists for the durable handoff.");
    }
    return exact;
  }
  if (existing.length > 0) {
    throw new Error("Conflicting task orchestration completion exists for the durable handoff.");
  }
  const completedAt = input.now();
  return await input.ledger.append({
    type: "agent.task.orchestration.completed",
    version: 1,
    streamId,
    context: completionEventContext(input, specialistRunCompletedEventId, completedAt),
    payload: orchestrationCompletionPayload(input, specialistRunCompletedEventId, completedAt)
  }, { expectedNextSequence: stream.length + 1 }) as CompletedEvent;
}

async function appendOrReuseTaskCompletedStatus(
  input: CompleteTaskOrchestrationAfterHandoffInput,
  orchestration: CompletedEvent
): Promise<KnowledgeEventOf<"agent.task.status.changed">> {
  const taskStreamId = `agent_task_${input.claim.payload.taskId}`;
  const taskStream = await input.ledger.readStream(taskStreamId);
  const terminalStatuses = new Set(["completed", "waiting-for-approval", "blocked", "failed", "canceled"]);
  const taskStatuses = taskStream.filter((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
    event.type === "agent.task.status.changed"
  );
  const exact = taskStatuses.find((event) =>
    event.payload.status === "completed" &&
    event.payload.taskId === input.claim.payload.taskId &&
    event.payload.runId === input.recorded.manifest.runId &&
    event.context.causationId === orchestration.id
  );
  if (exact !== undefined) {
    if (taskStatuses.some((event) =>
      taskStatusConflictsWithOrchestrationTerminal(event, input, terminalStatuses) &&
      event.id !== exact.id &&
      (event.payload.status !== "completed" || event.context.causationId !== orchestration.id)
    )) {
      throw new Error("Conflicting task status terminal exists for the durable orchestration handoff.");
    }
    return exact;
  }
  if (taskStatuses.some((event) =>
    taskStatusConflictsWithOrchestrationTerminal(event, input, terminalStatuses) &&
    event.context.causationId !== orchestration.id
  )) {
    throw new Error("Conflicting task status terminal exists for the durable orchestration handoff.");
  }
  return await input.ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: taskStreamId,
    context: completionEventContext(input, orchestration.id, input.now()),
    payload: {
      taskId: input.claim.payload.taskId,
      status: "completed",
      changedBy: input.actor.id,
      reason: "Task transitioned to completed after durable orchestration handoff readback.",
      runId: input.recorded.manifest.runId
    }
  }, { expectedNextSequence: taskStream.length + 1 }) as KnowledgeEventOf<"agent.task.status.changed">;
}

function taskStatusConflictsWithOrchestrationTerminal(
  event: KnowledgeEventOf<"agent.task.status.changed">,
  input: CompleteTaskOrchestrationAfterHandoffInput,
  terminalStatuses: ReadonlySet<string>
): boolean {
  if (!terminalStatuses.has(event.payload.status)) return false;
  if (event.payload.status === "canceled") return event.payload.taskId === input.claim.payload.taskId;
  return event.payload.runId === input.recorded.manifest.runId;
}

async function taskHasCanceledStatus(input: Pick<CompleteTaskOrchestrationAfterHandoffInput, "ledger" | "claim">): Promise<boolean> {
  const statuses = await input.ledger.readStream(`agent_task_${input.claim.payload.taskId}`);
  const latestStatus = statuses.findLast((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
    event.type === "agent.task.status.changed"
  );
  return latestStatus?.payload.status === "canceled";
}

function orchestrationCompletionPayload(
  input: CompleteTaskOrchestrationAfterHandoffInput,
  specialistRunCompletedEventId: string,
  completedAt: string
): CompletedEvent["payload"] {
  return {
    taskId: input.claim.payload.taskId,
    runType: input.claim.payload.runType,
    attemptId: input.claim.payload.attemptId,
    retryGeneration: input.claim.payload.retryGeneration,
    runId: input.recorded.manifest.runId,
    completedAt,
    specialistRunCompletedEventId,
    finalOutputStepEventId: input.recorded.manifest.finalOutputEventId,
    handoffPreparedEventId: input.recorded.prepared.id,
    handoffRecordedEventId: input.recorded.recorded.id,
    handoffReadback: {
      handoffId: input.recorded.manifest.handoffId,
      handoffManifestHash: input.recorded.recorded.payload.handoffManifestHash,
      handoffRecordedEventId: input.recorded.recorded.id,
      verifiedAt: input.recorded.recorded.payload.verifiedAt
    }
  };
}

function orchestrationCompletionMatches(
  event: CompletedEvent,
  input: CompleteTaskOrchestrationAfterHandoffInput,
  specialistRunCompletedEventId: string
): boolean {
  const expected = orchestrationCompletionPayload(input, specialistRunCompletedEventId, event.payload.completedAt);
  return event.payload.taskId === expected.taskId &&
    event.payload.runType === expected.runType &&
    event.payload.attemptId === expected.attemptId &&
    event.payload.retryGeneration === expected.retryGeneration &&
    event.payload.runId === expected.runId &&
    event.payload.specialistRunCompletedEventId === expected.specialistRunCompletedEventId &&
    event.payload.finalOutputStepEventId === expected.finalOutputStepEventId &&
    event.payload.handoffPreparedEventId === expected.handoffPreparedEventId &&
    event.payload.handoffRecordedEventId === expected.handoffRecordedEventId &&
    event.payload.handoffReadback.handoffId === expected.handoffReadback.handoffId &&
    event.payload.handoffReadback.handoffManifestHash === expected.handoffReadback.handoffManifestHash &&
    event.payload.handoffReadback.handoffRecordedEventId === expected.handoffReadback.handoffRecordedEventId &&
    event.payload.handoffReadback.verifiedAt === expected.handoffReadback.verifiedAt;
}

function attemptKey(taskId: string, runType: string, retryGeneration: number): string {
  return `${taskId}:${runType}:${retryGeneration}`;
}

function normalizeNow(now: string | Date): string {
  return now instanceof Date ? now.toISOString() : now;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeSummary(summary: MutableSummary): TaskOrchestratorTickSummary {
  return Object.freeze({
    tickedAt: summary.tickedAt,
    workerId: summary.workerId,
    orderedCandidates: Object.freeze([...summary.orderedCandidates]),
    claimed: Object.freeze([...summary.claimed]),
    reclaimed: Object.freeze([...summary.reclaimed]),
    released: Object.freeze([...summary.released]),
    skipped: Object.freeze([...summary.skipped]),
    conflicts: Object.freeze([...summary.conflicts]),
    blocked: Object.freeze([...summary.blocked]),
    approvalWaiting: Object.freeze([...summary.approvalWaiting]),
    approvalVerified: Object.freeze([...summary.approvalVerified]),
    sideEffectsScheduled: Object.freeze([...summary.sideEffectsScheduled])
  });
}
