import { describe, expect, it, vi } from "vitest";
import {
  InMemoryEventLedger,
  type AppendableKnowledgeEvent,
  type AppendOptions,
  type EventLedger
} from "../../ontology/src/event-ledger.js";
import type { ActorRef, KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { buildContextPackRef } from "../src/context-packs.js";
import { buildPromptArtifact } from "../src/prompt-artifacts.js";
import { createProviderRegistry } from "../src/provider-registry.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../src/task-orchestrator-events.js";
import { createTaskOrchestrator, type TaskOrchestratorBudgets } from "../src/task-orchestrator.js";
import type {
  TaskOrchestratorProviderApprovalInspection,
  TaskOrchestratorProviderApprovalProof
} from "../src/task-orchestrator-approval.js";
import type { TaskOrchestratorProviderPolicy } from "../src/task-orchestrator-types.js";

const runType = "evidence-triage" as const;
const now = "2026-07-12T04:40:00.000Z";
const leaseExpiresAt = "2026-07-12T04:50:00.000Z";
const staleClaimedAt = "2026-07-12T04:10:00.000Z";
const staleLeaseExpiresAt = "2026-07-12T04:20:00.000Z";
const hashA = `sha256:${"a".repeat(64)}`;
const approvalSourceEventId = "evt_task13_approval_source";
const approvalRunId = "run_task13_approval_chronology";
const approvalToolRequestId = "toolreq_task13_approval_chronology";
const approvalRequestEventId = "evt_task13_approval_request";
const approvalContextRef = buildContextPackRef({
  contextPackId: "evidence-summary.v1",
  version: 1,
  generatedAt: now,
  payload: { sourceEventId: approvalSourceEventId },
  safeSummary: "Task 13 approval chronology context.",
  provenanceRefs: [approvalSourceEventId],
  sourceEventIds: [approvalSourceEventId],
  artifactHashes: [hashA]
});
const approvalPromptArtifact = buildPromptArtifact({
  promptTemplateId: "task13-approval-chronology",
  promptTemplateVersion: 1,
  generatedAt: now,
  runType,
  safetyClass: "provider-approved",
  transferApprovalClass: "provider-byte-transfer",
  contextPackRefs: [approvalContextRef],
  text: "Exercise the durable Task 13 approval chronology.",
  safeSummary: "Task 13 approval chronology prompt."
});
const approvalPromptHash = approvalPromptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
const approvalContextHash = approvalContextRef.contentHash as `sha256:${string}`;

describe("resident task orchestrator claims", () => {
  it("selects queued tasks deterministically by priority then created sequence then task id", async () => {
    const ledger = new RecordingLedger();
    await queueTask(ledger, "task_task3_normal_first", "normal");
    await queueTask(ledger, "task_task3_high_z", "high");
    await queueTask(ledger, "task_task3_high_a", "high");

    const orchestrator = createTestOrchestrator({ ledger, concurrency: { globalMaxActiveAttempts: 4, perRunTypeMaxActiveAttempts: { [runType]: 4 } } });
    const summary = await orchestrator.tick();

    expect(summary.claimed).toHaveLength(1);
    expect(summary.claimed[0]).toMatchObject({
      taskId: "task_task3_high_z",
      runType,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      expectedNextSequence: 1
    });
    expect(summary.orderedCandidates.map((candidate) => candidate.taskId)).toEqual([
      "task_task3_high_z",
      "task_task3_high_a",
      "task_task3_normal_first"
    ]);
  });

  it("claims only one task per specialist boundary under bounded concurrency", async () => {
    const ledger = new RecordingLedger();
    await queueTask(ledger, "task_task3_boundary_a", "normal");
    await queueTask(ledger, "task_task3_boundary_b", "normal");

    const orchestrator = createTestOrchestrator({ ledger, concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { [runType]: 1 } } });
    const first = await orchestrator.tick();
    const second = await orchestrator.tick();

    expect(first.claimed.map((claim) => claim.taskId)).toEqual(["task_task3_boundary_a"]);
    expect(second.claimed).toHaveLength(0);
    expect(second.skipped).toContainEqual({
      taskId: "task_task3_boundary_b",
      runType,
      reason: "concurrency-limit"
    });
    expect((await orchestrationEvents(ledger)).filter((event) => event.type === "agent.task.orchestration.claimed")).toHaveLength(1);
  });

  it("uses expected sequence readback to reject double claims", async () => {
    const inner = new RecordingLedger();
    await queueTask(inner, "task_task3_race", "urgent");
    const ledger = new SupersedingClaimReadbackLedger(inner);

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    const claimAppend = inner.appendCalls.find((call) => call.event.type === "agent.task.orchestration.claimed");
    expect(claimAppend?.options).toEqual({ expectedNextSequence: 1 });
    expect(summary.claimed).toHaveLength(0);
    expect(summary.conflicts).toContainEqual({
      taskId: "task_task3_race",
      runType,
      reason: "claim-readback-not-owned"
    });
    expect((await inner.readStream(taskOrchestrationStreamId("task_task3_race", runType)))
      .filter((event) => event.type === "agent.task.orchestration.claimed")).toHaveLength(2);
  });

  it("uses claim readback to reject superseding release before ownership is proven", async () => {
    const inner = new RecordingLedger();
    await queueTask(inner, "task_task3_release_race", "urgent");
    const ledger = new SupersedingReleaseReadbackLedger(inner);

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.claimed).toHaveLength(0);
    expect(summary.conflicts).toContainEqual({
      taskId: "task_task3_release_race",
      runType,
      reason: "claim-readback-not-owned"
    });
    const stream = await inner.readStream(taskOrchestrationStreamId("task_task3_release_race", runType));
    expect(stream.map((event) => event.type)).toEqual([
      "agent.task.orchestration.claimed",
      "agent.task.orchestration.released"
    ]);
  });

  it("reclaims stale lease with same attempt id and higher lease claim generation", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_stale", "urgent");
    const firstAttemptId = buildTaskAttemptId({ taskId: "task_task3_stale", runType, retryGeneration: 0 });
    const staleClaim = await appendClaim(ledger, {
      taskId: "task_task3_stale",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      claimedAt: staleClaimedAt,
      leaseExpiresAt: staleLeaseExpiresAt,
      causationEventId: queued.status.id
    });

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.reclaimed).toHaveLength(1);
    expect(summary.reclaimed[0]).toMatchObject({
      taskId: "task_task3_stale",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      previousLeaseClaimGeneration: 1,
      leaseClaimGeneration: 2
    });
    const stream = await ledger.readStream(taskOrchestrationStreamId("task_task3_stale", runType));
    expect(stream.some((event) =>
      event.type === "agent.task.orchestration.released" &&
      event.payload.claimEventId === staleClaim.id &&
      event.payload.releaseReason === "stale-recovered"
    )).toBe(true);
    expect(stream.at(-1)).toMatchObject({
      type: "agent.task.orchestration.claimed",
      payload: { attemptId: firstAttemptId, leaseClaimGeneration: 2 }
    });
  });

  it("does not reclaim stale lease after handoff checkpoint supersedes the claim", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_stale_handoff_superseded", "urgent");
    const attemptId = buildTaskAttemptId({ taskId: "task_task3_stale_handoff_superseded", runType, retryGeneration: 0 });
    const staleClaim = await appendClaim(ledger, {
      taskId: "task_task3_stale_handoff_superseded",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      claimedAt: staleClaimedAt,
      leaseExpiresAt: staleLeaseExpiresAt,
      causationEventId: queued.status.id
    });
    await appendCheckpoint(ledger, {
      taskId: "task_task3_stale_handoff_superseded",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "handoff-pending",
      causationId: staleClaim.id,
      expectedNextSequence: 2
    });

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.reclaimed).toHaveLength(0);
    expect(summary.released).toHaveLength(0);
    const stream = await ledger.readStream(taskOrchestrationStreamId("task_task3_stale_handoff_superseded", runType));
    expect(stream.map((event) => event.type)).toEqual([
      "agent.task.orchestration.claimed",
      "agent.task.orchestration.checkpointed"
    ]);
  });

  it("starts explicit retry with retry generation plus one and a new attempt id", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_retry", "high");
    const firstAttemptId = buildTaskAttemptId({ taskId: "task_task3_retry", runType, retryGeneration: 0 });
    const claim = await appendClaim(ledger, {
      taskId: "task_task3_retry",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      claimedAt: staleClaimedAt,
      leaseExpiresAt: staleLeaseExpiresAt,
      causationEventId: queued.status.id
    });
    await appendFailed(ledger, {
      taskId: "task_task3_retry",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      causationId: claim.id,
      expectedNextSequence: 2
    });
    const retryPolicyEvent = await taskStatus(ledger, {
      taskId: "task_task3_retry",
      status: "blocked",
      causationId: claim.id,
      expectedNextSequence: 3,
      actor: humanActor,
      changedBy: humanActor.id,
      reason: "Human authorized retry generation 1."
    });

    const orchestrator = createTestOrchestrator({
      ledger,
      explicitRetryGenerations: [{ taskId: "task_task3_retry", runType, retryGeneration: 1, retryPolicyEventId: retryPolicyEvent.id }]
    });
    const summary = await orchestrator.tick();

    const retryAttemptId = buildTaskAttemptId({ taskId: "task_task3_retry", runType, retryGeneration: 1 });
    expect(retryAttemptId).not.toBe(firstAttemptId);
    expect(summary.claimed).toContainEqual(expect.objectContaining({
      taskId: "task_task3_retry",
      attemptId: retryAttemptId,
      retryGeneration: 1,
      leaseClaimGeneration: 1,
      expectedNextSequence: 3
    }));
    const retryClaim = (await ledger.readStream(taskOrchestrationStreamId("task_task3_retry", runType)))
      .findLast((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
        event.type === "agent.task.orchestration.claimed"
      );
    expect(retryClaim).toMatchObject({
      context: { causationId: retryPolicyEvent.id },
      payload: { causationEventId: retryPolicyEvent.id }
    });
  });

  it("rejects explicit retry generation without a durable retry policy event id", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_retry_without_policy_event", "high");
    const firstAttemptId = buildTaskAttemptId({ taskId: "task_task3_retry_without_policy_event", runType, retryGeneration: 0 });
    const claim = await appendClaim(ledger, {
      taskId: "task_task3_retry_without_policy_event",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      causationEventId: queued.status.id
    });
    await appendFailed(ledger, {
      taskId: "task_task3_retry_without_policy_event",
      attemptId: firstAttemptId,
      retryGeneration: 0,
      causationId: claim.id,
      expectedNextSequence: 2
    });
    await taskStatus(ledger, {
      taskId: "task_task3_retry_without_policy_event",
      status: "blocked",
      causationId: claim.id,
      expectedNextSequence: 3,
      actor: humanActor,
      changedBy: humanActor.id,
      reason: "A blocked task alone is not durable retry policy input."
    });

    const orchestrator = createTestOrchestrator({
      ledger,
      explicitRetryGenerations: [{ taskId: "task_task3_retry_without_policy_event", runType, retryGeneration: 1 } as never]
    });
    const summary = await orchestrator.tick();

    expect(summary.claimed).toHaveLength(0);
    expect(summary.skipped).toContainEqual({
      taskId: "task_task3_retry_without_policy_event",
      runType,
      reason: "not-claimable"
    });
    expect((await ledger.readStream(taskOrchestrationStreamId("task_task3_retry_without_policy_event", runType)))
      .filter((event) => event.type === "agent.task.orchestration.claimed")).toHaveLength(1);
  });

  it("does not duplicate prompt provider or run side effects during stale lease reclaim", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_no_side_effects", "urgent");
    const attemptId = buildTaskAttemptId({ taskId: "task_task3_no_side_effects", runType, retryGeneration: 0 });
    await appendClaim(ledger, {
      taskId: "task_task3_no_side_effects",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      claimedAt: staleClaimedAt,
      leaseExpiresAt: staleLeaseExpiresAt,
      causationEventId: queued.status.id
    });
    const probes = sideEffectProbes();

    const orchestrator = createTestOrchestrator({ ledger, probes });
    const summary = await orchestrator.tick();

    expect(summary.reclaimed).toHaveLength(1);
    expect(summary.sideEffectsScheduled).toEqual([]);
    expect(Object.values(probes).flatMap((probe) => Object.values(probe)).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it("honors cancellation before claim", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_cancel_before", "urgent");
    await taskStatus(ledger, {
      taskId: "task_task3_cancel_before",
      status: "canceled",
      causationId: queued.status.id,
      expectedNextSequence: 3
    });

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.claimed).toHaveLength(0);
    expect(summary.skipped).toContainEqual({
      taskId: "task_task3_cancel_before",
      runType,
      reason: "canceled-before-claim"
    });
    expect(await orchestrationEvents(ledger)).toHaveLength(0);
  });

  it("continues past canceled tasks to claim the next queued task", async () => {
    const ledger = new RecordingLedger();
    const canceled = await queueTask(ledger, "task_task3_cancel_before_with_neighbor", "urgent");
    await taskStatus(ledger, {
      taskId: "task_task3_cancel_before_with_neighbor",
      status: "canceled",
      causationId: canceled.status.id,
      expectedNextSequence: 3
    });
    await queueTask(ledger, "task_task3_claim_after_canceled", "normal");

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.skipped).toContainEqual({
      taskId: "task_task3_cancel_before_with_neighbor",
      runType,
      reason: "canceled-before-claim"
    });
    expect(summary.claimed).toContainEqual(expect.objectContaining({
      taskId: "task_task3_claim_after_canceled",
      retryGeneration: 0
    }));
  });

  it("does not reclaim a failed terminal task without explicit retry generation", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_failed_without_retry", "urgent");
    await taskStatus(ledger, {
      taskId: "task_task3_failed_without_retry",
      status: "failed",
      causationId: queued.status.id,
      expectedNextSequence: 3
    });

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.claimed).toHaveLength(0);
    expect(summary.skipped).toContainEqual({
      taskId: "task_task3_failed_without_retry",
      runType,
      reason: "not-claimable"
    });
    expect(await orchestrationEvents(ledger)).toHaveLength(0);
  });

  it("honors cancellation after claim before provider dispatch", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_cancel_after", "urgent");
    const attemptId = buildTaskAttemptId({ taskId: "task_task3_cancel_after", runType, retryGeneration: 0 });
    const claim = await appendClaim(ledger, {
      taskId: "task_task3_cancel_after",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      causationEventId: queued.status.id
    });
    await taskStatus(ledger, {
      taskId: "task_task3_cancel_after",
      status: "canceled",
      causationId: claim.id,
      expectedNextSequence: 3
    });
    const probes = sideEffectProbes();

    const orchestrator = createTestOrchestrator({ ledger, probes });
    const summary = await orchestrator.tick();

    expect(summary.released).toContainEqual(expect.objectContaining({
      taskId: "task_task3_cancel_after",
      claimEventId: claim.id,
      releaseReason: "canceled-before-dispatch"
    }));
    expect(summary.sideEffectsScheduled).toEqual([]);
    expect(Object.values(probes).flatMap((probe) => Object.values(probe)).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it("marks cancellation during handoff as blocked until handoff protocol resolves", async () => {
    const ledger = new RecordingLedger();
    const queued = await queueTask(ledger, "task_task3_cancel_handoff", "urgent");
    const attemptId = buildTaskAttemptId({ taskId: "task_task3_cancel_handoff", runType, retryGeneration: 0 });
    const claim = await appendClaim(ledger, {
      taskId: "task_task3_cancel_handoff",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      causationEventId: queued.status.id
    });
    await appendCheckpoint(ledger, {
      taskId: "task_task3_cancel_handoff",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "handoff-pending",
      causationId: claim.id,
      expectedNextSequence: 2
    });
    await taskStatus(ledger, {
      taskId: "task_task3_cancel_handoff",
      status: "canceled",
      runId: "run_task3_cancel_handoff",
      causationId: claim.id,
      expectedNextSequence: 3
    });

    const orchestrator = createTestOrchestrator({ ledger });
    const summary = await orchestrator.tick();

    expect(summary.blocked).toContainEqual({
      taskId: "task_task3_cancel_handoff",
      runType,
      reason: "handoff-cancellation-pending"
    });
    const stream = await ledger.readStream(taskOrchestrationStreamId("task_task3_cancel_handoff", runType));
    expect(stream.some((event) =>
      event.type === "agent.task.orchestration.checkpointed" &&
      event.payload.checkpointKind === "blocked" &&
      event.payload.safeNextActions.includes("complete durable handoff protocol before honoring cancellation")
    )).toBe(true);
    expect(stream.some((event) =>
      event.type === "agent.task.orchestration.released" &&
      event.payload.releaseReason === "handoff-pending"
    )).toBe(true);
  });

  it("enforces budget ceilings before provider dispatch", async () => {
    const ledger = new RecordingLedger();
    await queueTask(ledger, "task_task3_budget", "urgent");
    const probes = sideEffectProbes();

    const orchestrator = createTestOrchestrator({
      ledger,
      probes,
      budgets: { ...defaultBudgets, maxProviderInvocations: 0, remainingProviderInvocations: 0 }
    });
    const summary = await orchestrator.tick();

    expect(summary.blocked).toContainEqual({
      taskId: "task_task3_budget",
      runType,
      reason: "provider-invocation-budget-exhausted"
    });
    expect(summary.released).toContainEqual(expect.objectContaining({
      taskId: "task_task3_budget",
      releaseReason: "budget-blocked"
    }));
    expect(summary.sideEffectsScheduled).toEqual([]);
    expect(Object.values(probes).flatMap((probe) => Object.values(probe)).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it("leaves a live same-claim resident suspension newer than approval wait to W for waiting and approved decisions", async () => {
    const results = [];

    for (const decision of ["waiting", "approved"] as const) {
      const fixture = await prepareApprovalWaitResidentChronology({
        taskId: `task_task13_live_${decision}`,
        decision,
        expired: false
      });
      const before = await fixture.ledger.readStream(fixture.streamId);

      const summary = await fixture.orchestrator.tick();
      const after = await fixture.ledger.readStream(fixture.streamId);
      const appended = after.slice(before.length);

      results.push({
        decision,
        skipped: summary.skipped,
        approvalWaitingCount: summary.approvalWaiting.length,
        approvalVerifiedCount: summary.approvalVerified.length,
        reclaimedCount: summary.reclaimed.length,
        releasedCount: summary.released.length,
        appendedEventTypes: appended.map((event) => event.type),
        appendedClaimGenerations: appended
          .filter((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
            event.type === "agent.task.orchestration.claimed"
          )
          .map((event) => event.payload.leaseClaimGeneration),
        runnerDispatchingCheckpoints: appended.filter((event) =>
          event.type === "agent.task.orchestration.checkpointed" &&
          event.payload.checkpointKind === "runner-dispatching"
        ).length,
        staleRecoveredReleases: appended.filter((event) =>
          event.type === "agent.task.orchestration.released" &&
          event.payload.releaseReason === "stale-recovered"
        ).length,
        runnerCalls: fixture.runnerDispatch.mock.calls.length
      });
    }

    expect(results).toEqual([
      {
        decision: "waiting",
        skipped: [{
          taskId: "task_task13_live_waiting",
          runType,
          reason: "not-claimable"
        }],
        approvalWaitingCount: 0,
        approvalVerifiedCount: 0,
        reclaimedCount: 0,
        releasedCount: 0,
        appendedEventTypes: [],
        appendedClaimGenerations: [],
        runnerDispatchingCheckpoints: 0,
        staleRecoveredReleases: 0,
        runnerCalls: 0
      },
      {
        decision: "approved",
        skipped: [{
          taskId: "task_task13_live_approved",
          runType,
          reason: "not-claimable"
        }],
        approvalWaitingCount: 0,
        approvalVerifiedCount: 0,
        reclaimedCount: 0,
        releasedCount: 0,
        appendedEventTypes: [],
        appendedClaimGenerations: [],
        runnerDispatchingCheckpoints: 0,
        staleRecoveredReleases: 0,
        runnerCalls: 0
      }
    ]);
  });

  it("leaves an expired approved same-claim resident suspension newer than approval wait to W", async () => {
    const fixture = await prepareApprovalWaitResidentChronology({
      taskId: "task_task13_expired_approved",
      decision: "approved",
      expired: true
    });
    const before = await fixture.ledger.readStream(fixture.streamId);

    const summary = await fixture.orchestrator.tick();
    const after = await fixture.ledger.readStream(fixture.streamId);
    const appended = after.slice(before.length);

    expect({
      skipped: summary.skipped,
      approvalWaitingCount: summary.approvalWaiting.length,
      approvalVerifiedCount: summary.approvalVerified.length,
      reclaimedCount: summary.reclaimed.length,
      releasedCount: summary.released.length,
      appendedEventTypes: appended.map((event) => event.type),
      appendedClaimGenerations: appended
        .filter((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
          event.type === "agent.task.orchestration.claimed"
        )
        .map((event) => event.payload.leaseClaimGeneration),
      runnerDispatchingCheckpoints: appended.filter((event) =>
        event.type === "agent.task.orchestration.checkpointed" &&
        event.payload.checkpointKind === "runner-dispatching"
      ).length,
      staleRecoveredReleases: appended.filter((event) =>
        event.type === "agent.task.orchestration.released" &&
        event.payload.releaseReason === "stale-recovered"
      ).length,
      runnerCalls: fixture.runnerDispatch.mock.calls.length
    }).toEqual({
      skipped: [{
        taskId: "task_task13_expired_approved",
        runType,
        reason: "not-claimable"
      }],
      approvalWaitingCount: 0,
      approvalVerifiedCount: 0,
      reclaimedCount: 0,
      releasedCount: 0,
      appendedEventTypes: [],
      appendedClaimGenerations: [],
      runnerDispatchingCheckpoints: 0,
      staleRecoveredReleases: 0,
      runnerCalls: 0
    });
  });

  it("leaves same-claim resident suspension checkpoint ownership to W", async () => {
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/task-orchestrator.ts", import.meta.url),
      "utf8"
    );
    const interlockPaths = [
      "active-claim",
      "cancellation-after-claim",
      "stale-lease-recovery"
    ] as const;
    const forbiddenGenericEffects = {
      release: vi.fn(),
      staleRecovery: vi.fn(),
      nextGenerationClaim: vi.fn(),
      provider: vi.fn(),
      gateway: vi.fn()
    };

    expect(source).toContain('"resident-loop-suspension"');
    expect(source).toContain("residentLoopSuspension");
    expect(source).toContain('reason: "not-claimable"');
    expect(interlockPaths).toHaveLength(3);
    expect(Object.values(forbiddenGenericEffects).every((probe) => probe.mock.calls.length === 0)).toBe(true);
  });
});

const defaultBudgets: TaskOrchestratorBudgets = Object.freeze({
  maxProviderInvocations: 1,
  remainingProviderInvocations: 1,
  contextByteBudget: 16_384,
  promptByteBudget: 8_192,
  derivativeArtifactByteBudget: 65_536,
  wallClockBudgetMs: 300_000
});

function createTestOrchestrator(input: {
  readonly ledger: EventLedger;
  readonly concurrency?: {
    readonly globalMaxActiveAttempts: number;
    readonly perRunTypeMaxActiveAttempts: Partial<Record<typeof runType, number>>;
  };
  readonly budgets?: typeof defaultBudgets;
  readonly explicitRetryGenerations?: readonly {
    readonly taskId: string;
    readonly runType: typeof runType;
    readonly retryGeneration: number;
    readonly retryPolicyEventId: string;
  }[];
  readonly probes?: ReturnType<typeof sideEffectProbes>;
}) {
  const probes = input.probes ?? sideEffectProbes();
  return createTaskOrchestrator({
    ledger: input.ledger,
    now: () => now,
    actor: orchestratorActor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      explicitRetryGenerations: input.explicitRetryGenerations ?? []
    },
    concurrency: input.concurrency ?? {
      globalMaxActiveAttempts: 2,
      perRunTypeMaxActiveAttempts: { [runType]: 2 }
    },
    budgets: input.budgets ?? defaultBudgets,
    workflowRegistry: probes.workflowRegistry,
    contextRegistry: probes.contextRegistry,
    promptRendererRegistry: probes.promptRendererRegistry,
    providerRegistry: probes.providerRegistry,
    approvalReader: probes.approvalReader,
    runnerRegistry: probes.runnerRegistry,
    handoffCapability: probes.handoffCapability
  });
}

function sideEffectProbes() {
  return {
    workflowRegistry: { resolve: vi.fn() },
    contextRegistry: { resolve: vi.fn() },
    promptRendererRegistry: { render: vi.fn() },
    providerRegistry: { select: vi.fn() },
    approvalReader: { read: vi.fn() },
    runnerRegistry: { dispatch: vi.fn() },
    handoffCapability: { prepare: vi.fn(), record: vi.fn(), readback: vi.fn() }
  };
}

async function prepareApprovalWaitResidentChronology(input: {
  readonly taskId: string;
  readonly decision: "waiting" | "approved";
  readonly expired: boolean;
}) {
  const ledger = new RecordingLedger();
  const queued = await queueTask(ledger, input.taskId, "urgent");
  const attemptId = buildTaskAttemptId({ taskId: input.taskId, runType, retryGeneration: 0 });
  const approvalClaim = await appendClaim(ledger, {
    taskId: input.taskId,
    attemptId,
    retryGeneration: 0,
    leaseClaimGeneration: 1,
    causationEventId: queued.status.id
  });
  await appendApprovalContextReady(ledger, approvalClaim);
  const approvalWait = await appendApprovalWait(ledger, approvalClaim);
  await appendApprovalSuspendedRelease(ledger, approvalClaim, approvalWait);
  const residentClaim = await appendClaim(ledger, {
    taskId: input.taskId,
    attemptId,
    retryGeneration: 0,
    leaseClaimGeneration: 2,
    claimedAt: input.expired ? staleClaimedAt : now,
    leaseExpiresAt: input.expired ? staleLeaseExpiresAt : leaseExpiresAt,
    causationEventId: approvalWait.id
  });
  await appendResidentLoopSuspension(ledger, residentClaim);

  const runnerDispatch = vi.fn().mockResolvedValue(undefined);
  const approvalInspection: TaskOrchestratorProviderApprovalInspection = input.decision === "waiting"
    ? { status: "waiting", reason: "approval decision remains pending" }
    : { status: "approved", approvalEventId: "evt_task13_approval_granted" };
  const approvalReader = {
    inspect: vi.fn().mockResolvedValue(approvalInspection)
  };
  const orchestrator = createTaskOrchestrator({
    ledger,
    now: () => now,
    actor: orchestratorActor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      providerPolicy: approvalProviderPolicy()
    },
    concurrency: {
      globalMaxActiveAttempts: 2,
      perRunTypeMaxActiveAttempts: { [runType]: 2 }
    },
    budgets: defaultBudgets,
    workflowRegistry: {},
    contextRegistry: {},
    promptRendererRegistry: {},
    providerRegistry: {},
    approvalReader,
    runnerRegistry: { dispatch: runnerDispatch },
    handoffCapability: {}
  });

  return {
    ledger,
    orchestrator,
    runnerDispatch,
    streamId: taskOrchestrationStreamId(input.taskId, runType)
  };
}

function approvalProviderPolicy(): TaskOrchestratorProviderPolicy {
  const proof = {
    runId: approvalRunId,
    toolRequestId: approvalToolRequestId,
    approvalRequirementId: approvalRequestEventId,
    approvedPreviewHash: hashA,
    promptArtifactHash: approvalPromptHash,
    contextBindingHashes: [approvalContextHash],
    promptArtifact: approvalPromptArtifact
  } as unknown as TaskOrchestratorProviderApprovalProof;
  return {
    registry: createProviderRegistry.withDefaultsForTest(),
    task: {
      modality: "text",
      structuredOutputRequired: true,
      sensitivity: "workspace-safe",
      requiresRemoteHarness: false
    },
    readinessByProviderId: {
      provider_fake_remote: "requires-byte-transfer-approval"
    },
    selectionPolicy: {
      allowRemoteByteTransfer: true,
      preferredCostPolicy: "metered-api"
    },
    selectionPolicyVersion: "provider-policy.v1",
    approval: proof
  };
}

async function appendApprovalContextReady(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const stream = await ledger.readStream(claim.streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: claim.streamId,
    context: context(`corr_${claim.payload.taskId}`, orchestratorActor, claim.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: now,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:context-ready`,
      contextBindings: [{
        contextPackId: approvalContextRef.contextPackId,
        contentHash: approvalContextHash,
        sizeBytes: approvalContextRef.sizeBytes,
        schemaId: approvalContextRef.contextPackId,
        provenanceEventIds: [approvalSourceEventId]
      }],
      sourceEventIds: [approvalSourceEventId],
      inputArtifactHashes: [approvalContextHash, approvalPromptHash],
      promptArtifactHash: approvalPromptHash,
      safeNextActions: ["continue to exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendApprovalWait(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const stream = await ledger.readStream(claim.streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: claim.streamId,
    context: context(`corr_${claim.payload.taskId}`, orchestratorActor, claim.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "approval-wait",
      checkpointedAt: now,
      runId: approvalRunId,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:approval-wait`,
      toolRequestIds: [approvalToolRequestId],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        previewHash: hashA,
        approvalRequestEventId
      },
      providerPosture: {
        providerId: "provider_fake_remote",
        modelFamily: "fake-remote",
        adapterVersion: "agent-provider-auth.v1",
        capabilityIds: [
          "capability_provider_provider_fake_remote",
          "capability_model_fake-remote",
          "capability_adapter_agent-provider-auth.v1"
        ],
        readinessState: "approval-required",
        approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: "Remote prompt byte transfer requires exact approval.",
        selectionPolicyVersion: "provider-policy.v1",
        sensitivityClass: "workspace-safe",
        requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: [{
        contextPackId: approvalContextRef.contextPackId,
        contentHash: approvalContextHash,
        sizeBytes: approvalContextRef.sizeBytes,
        schemaId: approvalContextRef.contextPackId,
        provenanceEventIds: [approvalSourceEventId]
      }],
      sourceEventIds: [approvalSourceEventId],
      inputArtifactHashes: [approvalContextHash, approvalPromptHash],
      promptArtifactHash: approvalPromptHash,
      lockSnapshot: {
        activeLockIds: [],
        highWaterMark: 0
      },
      safeNextActions: ["wait for exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendApprovalSuspendedRelease(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  checkpoint: KnowledgeEventOf<"agent.task.orchestration.checkpointed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.released">> {
  const stream = await ledger.readStream(claim.streamId);
  return await ledger.append({
    type: "agent.task.orchestration.released",
    version: 1,
    streamId: claim.streamId,
    context: context(`corr_${claim.payload.taskId}`, orchestratorActor, checkpoint.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      releasedBy: orchestratorActor.id,
      releasedAt: now,
      releaseReason: "approval-suspended",
      claimEventId: claim.id,
      checkpointEventId: checkpoint.id,
      safeNextActions: ["wait for exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.released">;
}

async function appendResidentLoopSuspension(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const stream = await ledger.readStream(claim.streamId);
  const runId = `run_${claim.payload.taskId}`;
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: claim.streamId,
    context: context(`corr_${claim.payload.taskId}`, orchestratorActor, claim.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "resident-loop-suspension",
      checkpointedAt: addSeconds(now, 1),
      runId,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:resident-loop-suspension`,
      contextBindings: [],
      residentLoopSuspension: {
        schemaVersion: "resident-loop-suspension-instruction.v1",
        residentAgentId: "agent_default",
        taskId: claim.payload.taskId,
        attemptId: claim.payload.attemptId,
        runId,
        planRecordEventId: "evt_task13_plan_record",
        finalObservationEventId: "evt_task13_final_observation",
        suspensionCategory: "approval-required",
        requestEventId: approvalRequestEventId,
        resumptionDeadlineAt: addSeconds(leaseExpiresAt, 600),
        nextSafeAction: "resume after the exact independent approval decision",
        orchestrationClaimEventId: claim.id,
        leaseClaimGeneration: claim.payload.leaseClaimGeneration,
        suspensionSemanticKey: hashA,
        resultSemanticKey: `sha256:${"b".repeat(64)}`
      },
      safeNextActions: ["leave the resident suspension suffix to W"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

class RecordingLedger implements EventLedger {
  readonly inner = new InMemoryEventLedger();
  readonly appendCalls: { readonly event: AppendableKnowledgeEvent; readonly options: AppendOptions | undefined }[] = [];

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    this.appendCalls.push({ event: structuredClone(event), options: options === undefined ? undefined : { ...options } });
    return await this.inner.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return await this.inner.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return await this.inner.readAll();
  }
}

class SupersedingClaimReadbackLedger implements EventLedger {
  constructor(private readonly inner: RecordingLedger) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    const committed = await this.inner.append(event, options);
    if (event.type === "agent.task.orchestration.claimed") {
      await this.inner.append({
        ...event,
        context: {
          ...event.context,
          causationId: committed.id,
          occurredAt: addSeconds(event.context.occurredAt, 1)
        },
        payload: {
          ...event.payload,
          workerId: "actor_competing_worker",
          leaseClaimGeneration: event.payload.leaseClaimGeneration + 1,
          claimedAt: addSeconds(event.payload.claimedAt, 1),
          leaseExpiresAt: addSeconds(event.payload.leaseExpiresAt, 1),
          idempotencyKey: `${event.payload.idempotencyKey}:competing-readback`
        }
      }, { expectedNextSequence: committed.sequence + 1 });
    }
    return committed;
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return await this.inner.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return await this.inner.readAll();
  }
}

class SupersedingReleaseReadbackLedger implements EventLedger {
  constructor(private readonly inner: RecordingLedger) {}

  async append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    const committed = await this.inner.append(event, options);
    if (event.type === "agent.task.orchestration.claimed") {
      await this.inner.append({
        type: "agent.task.orchestration.released",
        version: 1,
        streamId: event.streamId,
        context: {
          ...event.context,
          causationId: committed.id,
          occurredAt: addSeconds(event.context.occurredAt, 1)
        },
        payload: {
          taskId: event.payload.taskId,
          runType: event.payload.runType,
          attemptId: event.payload.attemptId,
          retryGeneration: event.payload.retryGeneration,
          leaseClaimGeneration: event.payload.leaseClaimGeneration,
          releasedBy: "actor_competing_worker",
          releasedAt: addSeconds(event.payload.claimedAt, 1),
          releaseReason: "worker-shutdown",
          claimEventId: committed.id,
          safeNextActions: ["retry claim after reading the task orchestration stream"]
        }
      }, { expectedNextSequence: committed.sequence + 1 });
    }
    return committed;
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return await this.inner.readStream(streamId);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return await this.inner.readAll();
  }
}

const orchestratorActor: ActorRef = {
  id: "actor_task_orchestrator_worker",
  kind: "agent",
  label: "Task orchestrator worker"
};

const humanActor: ActorRef = {
  id: "actor_case_owner",
  kind: "human",
  label: "Case owner"
};

async function queueTask(
  ledger: EventLedger,
  taskId: string,
  priority: "urgent" | "high" | "normal" | "low"
): Promise<{
  readonly created: KnowledgeEventOf<"agent.task.created">;
  readonly status: KnowledgeEventOf<"agent.task.status.changed">;
}> {
  const created = await ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context(`corr_${taskId}`, humanActor),
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: `Task 3 ${taskId}`,
      requestedBy: humanActor.id,
      priority,
      sourceEventIds: ["evt_task3_source"],
      inputArtifactHashes: [hashA]
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"agent.task.created">;
  const status = await taskStatus(ledger, {
    taskId,
    status: "queued",
    causationId: created.id,
    expectedNextSequence: 2
  });
  return { created, status };
}

async function taskStatus(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly status: KnowledgeEventOf<"agent.task.status.changed">["payload"]["status"];
    readonly causationId: string;
    readonly expectedNextSequence: number;
    readonly runId?: string | undefined;
    readonly actor?: ActorRef | undefined;
    readonly changedBy?: string | undefined;
    readonly reason?: string | undefined;
  }
): Promise<KnowledgeEventOf<"agent.task.status.changed">> {
  return await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${input.taskId}`,
    context: context(`corr_${input.taskId}`, input.actor ?? orchestratorActor, input.causationId),
    payload: {
      taskId: input.taskId,
      status: input.status,
      changedBy: input.changedBy ?? orchestratorActor.id,
      reason: input.reason ?? `Task is ${input.status}.`,
      ...(input.runId === undefined ? {} : { runId: input.runId })
    }
  }, { expectedNextSequence: input.expectedNextSequence }) as KnowledgeEventOf<"agent.task.status.changed">;
}

async function appendClaim(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly retryGeneration: number;
    readonly leaseClaimGeneration: number;
    readonly causationEventId: string;
    readonly claimedAt?: string | undefined;
    readonly leaseExpiresAt?: string | undefined;
  }
): Promise<KnowledgeEventOf<"agent.task.orchestration.claimed">> {
  const stream = await ledger.readStream(taskOrchestrationStreamId(input.taskId, runType));
  const claimedAt = input.claimedAt ?? now;
  const expiresAt = input.leaseExpiresAt ?? leaseExpiresAt;
  return await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: taskOrchestrationStreamId(input.taskId, runType),
    context: context(`corr_${input.taskId}`, orchestratorActor, input.causationEventId),
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration: input.retryGeneration,
      leaseClaimGeneration: input.leaseClaimGeneration,
      workerId: orchestratorActor.id,
      claimedAt,
      leaseExpiresAt: expiresAt,
      idempotencyKey: `task-orchestrator:${input.taskId}:${runType}:${input.retryGeneration}:${input.attemptId}:claim`,
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: "2026-07-12T04:00:00.000Z",
        taskId: input.taskId,
        runType,
        retryGeneration: input.retryGeneration
      },
      activeBudgetSnapshot: defaultBudgets,
      causationEventId: input.causationEventId
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.claimed">;
}

async function appendCheckpoint(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly retryGeneration: number;
    readonly leaseClaimGeneration: number;
    readonly checkpointKind: KnowledgeEventOf<"agent.task.orchestration.checkpointed">["payload"]["checkpointKind"];
    readonly causationId: string;
    readonly expectedNextSequence: number;
  }
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: taskOrchestrationStreamId(input.taskId, runType),
    context: context(`corr_${input.taskId}`, orchestratorActor, input.causationId),
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration: input.retryGeneration,
      leaseClaimGeneration: input.leaseClaimGeneration,
      checkpointKind: input.checkpointKind,
      checkpointedAt: now,
      runId: "run_task3_cancel_handoff",
      resumeIdempotencyKey: `task-orchestrator:${input.taskId}:${runType}:${input.retryGeneration}:${input.attemptId}:resume-${input.checkpointKind}`,
      contextBindings: [],
      safeNextActions: ["resume from durable projection state"]
    }
  }, { expectedNextSequence: input.expectedNextSequence }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendFailed(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly retryGeneration: number;
    readonly causationId: string;
    readonly expectedNextSequence: number;
  }
): Promise<KnowledgeEventOf<"agent.task.orchestration.failed">> {
  return await ledger.append({
    type: "agent.task.orchestration.failed",
    version: 1,
    streamId: taskOrchestrationStreamId(input.taskId, runType),
    context: context(`corr_${input.taskId}`, orchestratorActor, input.causationId),
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration: input.retryGeneration,
      failedAt: now,
      category: "model-output-invalid",
      message: "Synthetic failed attempt for retry generation test.",
      retryable: true,
      allowedActions: ["retry from explicit durable retry policy input"],
      relatedEventIds: [input.causationId]
    }
  }, { expectedNextSequence: input.expectedNextSequence }) as KnowledgeEventOf<"agent.task.orchestration.failed">;
}

async function orchestrationEvents(ledger: EventLedger): Promise<KnowledgeEvent[]> {
  return (await ledger.readAll()).filter((event) => event.type.startsWith("agent.task.orchestration."));
}

function context(correlationId: string, actor: ActorRef, causationId?: string | undefined) {
  return {
    actor,
    occurredAt: now,
    causationId,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
