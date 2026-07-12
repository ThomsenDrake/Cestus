import { createHash } from "node:crypto";
import type {
  TaskAttemptIdentityInput,
  TaskOrchestrationBoundaryInput,
  TaskOrchestrationClaimAppendInput,
  TaskOrchestrationClaimAppendTarget,
  TaskOrchestratorIdempotencyKeyInput
} from "./task-orchestrator-types.js";

export function taskOrchestrationStreamId(
  taskIdOrInput: string | TaskOrchestrationBoundaryInput,
  runType?: TaskOrchestrationBoundaryInput["runType"]
): string {
  const taskId = typeof taskIdOrInput === "string" ? taskIdOrInput : taskIdOrInput.taskId;
  const boundaryRunType = typeof taskIdOrInput === "string" ? runType : taskIdOrInput.runType;
  if (boundaryRunType === undefined) {
    throw new Error("runType is required to build a task orchestration stream ID");
  }
  return `agent_task_orchestration_${taskId}_${boundaryRunType}`;
}

export function buildTaskAttemptId(input: TaskAttemptIdentityInput): `attempt_${string}` {
  assertNonNegativeInteger(input.retryGeneration, "retryGeneration");
  const digest = createHash("sha256")
    .update(`agent-task-attempt:v1:${input.taskId}:${input.runType}:${input.retryGeneration}`)
    .digest("hex");
  return `attempt_${digest}`;
}

export function buildTaskOrchestratorIdempotencyKey(input: TaskOrchestratorIdempotencyKeyInput): string {
  assertNonNegativeInteger(input.retryGeneration, "retryGeneration");
  return [
    "task-orchestrator",
    input.taskId,
    input.runType,
    String(input.retryGeneration),
    input.attemptId,
    input.phase
  ].join(":");
}

export function buildTaskOrchestrationClaimAppendInput(
  input: TaskOrchestrationClaimAppendInput
): TaskOrchestrationClaimAppendTarget {
  assertNonNegativeInteger(input.latestSequence, "latestSequence");
  return {
    streamId: taskOrchestrationStreamId(input),
    expectedNextSequence: input.latestSequence + 1
  };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer`);
  }
}
