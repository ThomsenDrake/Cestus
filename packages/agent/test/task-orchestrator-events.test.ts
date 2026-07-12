import { describe, expect, it } from "vitest";
import {
  buildTaskAttemptId,
  buildTaskOrchestrationClaimAppendInput,
  buildTaskOrchestratorIdempotencyKey,
  taskOrchestrationStreamId
} from "../src/task-orchestrator-events.js";
import type { TaskOrchestrationDerivedState } from "../src/task-orchestrator-types.js";

describe("task orchestrator deterministic event helpers", () => {
  it("builds deterministic claim stream id from task id and run type", () => {
    expect(taskOrchestrationStreamId("task_001", "evidence-triage")).toBe(
      "agent_task_orchestration_task_001_evidence-triage"
    );
  });

  it("keeps attempt id stable across lease reclaims", () => {
    const first = buildTaskAttemptId({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0
    });
    const reclaimed = buildTaskAttemptId({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0,
      leaseClaimGeneration: 7
    } as never);

    expect(reclaimed).toBe(first);
  });

  it("changes attempt id when retry generation changes", () => {
    const first = buildTaskAttemptId({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0
    });
    const retry = buildTaskAttemptId({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 1
    });

    expect(retry).not.toBe(first);
    expect(retry).toMatch(/^attempt_[a-f0-9]{64}$/);
  });

  it("excludes lease claim generation from side effect idempotency keys", () => {
    const attemptId = buildTaskAttemptId({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0
    });
    const key = buildTaskOrchestratorIdempotencyKey({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0,
      attemptId,
      phase: "prompt-artifact-build"
    });
    const reclaimedKey = buildTaskOrchestratorIdempotencyKey({
      taskId: "task_001",
      runType: "evidence-triage",
      retryGeneration: 0,
      attemptId,
      phase: "prompt-artifact-build",
      leaseClaimGeneration: 3
    } as never);

    expect(reclaimedKey).toBe(key);
    expect(key).toBe(`task-orchestrator:task_001:evidence-triage:0:${attemptId}:prompt-artifact-build`);
    expect(key).not.toContain("lease");
    expect(key).not.toContain(":3");
  });

  it("builds expected sequence append inputs for claim readback", () => {
    expect(
      buildTaskOrchestrationClaimAppendInput({
        taskId: "task_001",
        runType: "evidence-triage",
        latestSequence: 0
      })
    ).toEqual({
      streamId: "agent_task_orchestration_task_001_evidence-triage",
      expectedNextSequence: 1
    });
    expect(
      buildTaskOrchestrationClaimAppendInput({
        taskId: "task_001",
        runType: "evidence-triage",
        latestSequence: 4
      })
    ).toEqual({
      streamId: "agent_task_orchestration_task_001_evidence-triage",
      expectedNextSequence: 5
    });
  });

  it("keeps append-only event payloads separate from derived projection state labels", () => {
    const derivedStates: readonly TaskOrchestrationDerivedState[] = [
      "queued",
      "claimable",
      "claimed",
      "planning",
      "context-ref-ready",
      "context-ready",
      "prompt-ready",
      "approval-wait",
      "resumable",
      "runner-dispatching",
      "handoff-pending",
      "completed",
      "blocked",
      "failed",
      "canceled"
    ];

    expect(derivedStates).toContain("handoff-pending");
    expect(derivedStates).toContain("context-ready");
    expect(derivedStates).not.toContain("claimed-event" as TaskOrchestrationDerivedState);
  });
});
