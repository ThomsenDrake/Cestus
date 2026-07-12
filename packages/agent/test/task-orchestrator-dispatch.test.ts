import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { buildContextPackRef } from "../src/context-packs.js";
import { buildPromptArtifact } from "../src/prompt-artifacts.js";
import { createProviderRegistry } from "../src/provider-registry.js";
import { createAgentRuntime } from "../src/runtime.js";
import {
  buildSpecialistHandoffMaterial,
  type SpecialistHandoffMaterial
} from "../src/specialist-handoff-manifest.js";
import {
  appendSpecialistFinalOutputStep,
  finalizeSpecialistRunAfterHandoff,
  recordSpecialistHandoff,
  type RecordSpecialistHandoffResult,
  type SpecialistHandoffManifestStore
} from "../src/specialist-runner-kernel.js";
import {
  completeTaskOrchestrationAfterHandoff,
  createTaskOrchestrator,
  dispatchVerifiedTaskRunner,
  sequenceTaskOrchestratorHandoff,
  type TaskOrchestratorRunnerRegistry
} from "../src/task-orchestrator.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../src/task-orchestrator-events.js";
import { buildTaskOrchestratorProjection } from "../src/task-orchestrator-projection.js";

const runType = "evidence-triage" as const;
const actor = { id: "actor_task6_orchestrator", kind: "agent" as const, label: "Task 6 Orchestrator" };
const baseNow = "2026-07-12T05:00:00.000Z";

describe("task orchestrator runner dispatch", () => {
  it("dispatches runner only after verified prompt provider approval and context bindings", async () => {
    const calls: string[] = [];
    const registry: TaskOrchestratorRunnerRegistry = {
      dispatch: async () => {
        calls.push("runner");
      }
    };

    await expect(dispatchVerifiedTaskRunner({
      registry,
      verifiedProviderApproval: false,
      verifiedContextBindings: true,
      taskId: "task_dispatch_001",
      runType,
      attemptId: "attempt_dispatch_001",
      approvedRunId: "run_dispatch_approved_001"
    })).rejects.toThrow(/approval/i);
    await expect(dispatchVerifiedTaskRunner({
      registry,
      verifiedProviderApproval: true,
      verifiedContextBindings: false,
      taskId: "task_dispatch_001",
      runType,
      attemptId: "attempt_dispatch_001",
      approvedRunId: "run_dispatch_approved_001"
    })).rejects.toThrow(/context/i);
    expect(calls).toEqual([]);

    await dispatchVerifiedTaskRunner({
      registry,
      verifiedProviderApproval: true,
      verifiedContextBindings: true,
      taskId: "task_dispatch_001",
      runType,
      attemptId: "attempt_dispatch_001",
      approvedRunId: "run_dispatch_approved_001"
    });
    expect(calls).toEqual(["runner"]);
  });

  it("records final output artifact before handoff prepare", async () => {
    const fixture = await orchestratorHandoffFixture("final_output_before_prepare");

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventOrder(await fixture.ledger.readAll(), [
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared"
    ])).toEqual(["agent.specialist-run.step.recorded", "agent.specialist-handoff.prepared"]);
  });

  it("prepares handoff before handoff record", async () => {
    const fixture = await orchestratorHandoffFixture("prepare_before_record");

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    const events = await fixture.ledger.readStream(`agent_run_${fixture.runId}`);
    const prepared = events.find((event) => event.type === "agent.specialist-handoff.prepared");
    const recorded = events.find((event) => event.type === "agent.specialist-handoff.recorded");
    expect(prepared?.sequence).toBeLessThan(recorded?.sequence ?? 0);
    expect(recorded?.context.causationId).toBe(prepared?.id);
  });

  it("requires verified handoff readback before specialist run completed", async () => {
    const fixture = await orchestratorHandoffFixture("readback_before_run_terminal");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    fixture.manifestStore.delete(recorded.recorded.payload.handoffManifestHash as `sha256:${string}`);

    await expect(completeTaskOrchestrationAfterHandoff({
      ledger: fixture.ledger,
      actor,
      now: fixture.clock.now,
      claim: fixture.claim,
      recorded
    })).rejects.toThrow(/readback|manifest/i);
    expect((await fixture.ledger.readAll()).some((event) => event.type === "agent.specialist-run.completed")).toBe(false);
  });

  it("appends orchestration completed only after specialist run completed", async () => {
    const fixture = await orchestratorHandoffFixture("orchestration_after_run_terminal");

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    const events = await fixture.ledger.readAll();
    expect(orderOf(events, "agent.specialist-run.completed")).toBeLessThan(orderOf(events, "agent.task.orchestration.completed"));
    const orchestration = events.find((event) => event.type === "agent.task.orchestration.completed");
    const runTerminal = events.find((event) => event.type === "agent.specialist-run.completed");
    expect(orchestration?.context.causationId).toBe(runTerminal?.id);
  });

  it("appends task status completed only after orchestration completed", async () => {
    const fixture = await orchestratorHandoffFixture("task_status_after_orchestration");

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    const events = await fixture.ledger.readAll();
    const orchestration = events.find((event) => event.type === "agent.task.orchestration.completed");
    const taskStatus = events.findLast((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
      event.type === "agent.task.status.changed"
    );
    expect(orderOf(events, "agent.task.orchestration.completed")).toBeLessThan(orderOf(events, "agent.task.status.changed", "completed"));
    expect(taskStatus?.context.causationId).toBe(orchestration?.id);
    expect(taskStatus?.payload.status).toBe("completed");
  });

  it("does not ask runner to append completed before durable handoff readback", async () => {
    const fixture = await orchestratorHandoffFixture("no_terminal_before_readback");
    const ledger = new ThrowBeforeAppendLedger(fixture.ledger, "agent.specialist-handoff.recorded");

    await expect(sequenceTaskOrchestratorHandoff(sequenceInput({ ...fixture, ledger }))).rejects.toThrow(/Injected crash/);

    expect((await fixture.ledger.readAll()).some((event) => event.type === "agent.specialist-run.completed")).toBe(false);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "handoff-pending"
    });
  });

  it("approved task orchestrator tick sequences returned runner handoff before terminal state", async () => {
    const ledger = new InMemoryEventLedger();
    const taskId = "task_task6_tick_dispatch";
    const runId = "run_task6_tick_dispatch";
    const runtime = createAgentRuntime({ ledger, actor, now: () => baseNow, providers: [] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_task6_tick_dispatch" });
    await runtime.createTask({ taskId, title: "Task 6 approved dispatch", requestedBy: actor.id, priority: "urgent" });
    const providerPolicy = approvedProviderPolicy(taskId, runId);
    const claim = await appendClaim(ledger, taskId);
    await appendDispatchContextReadyCheckpoint(ledger, taskId, claim, providerPolicy);
    const dispatchCalls: string[] = [];
    const handoffCalls: string[] = [];
    const orchestrator = createTaskOrchestrator({
      ledger,
      now: () => baseNow,
      actor,
      policy: {
        defaultRunType: runType,
        leaseDurationMs: 600_000,
        providerPolicy
      },
      concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { [runType]: 1 } },
      budgets: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      workflowRegistry: {},
      contextRegistry: {},
      promptRendererRegistry: {},
      providerRegistry: {},
      approvalReader: { inspect: async () => ({ status: "approved", approvalEventId: "evt_task6_tick_approval" }) },
      runnerRegistry: {
        async dispatch() {
          dispatchCalls.push("dispatch");
          const started = await runtime.startRun({ runId, taskId, runType, scope: { kind: "workspace", refs: ["ws_task6_tick_dispatch"] } });
          if (!started.ok) throw new Error("Unable to start Task 6 tick dispatch run.");
          const manifestStore = new MemoryManifestStore();
          const material = materialFor({
            suffix: "tick_dispatch",
            runStartedEventId: started.eventIds[0]!,
            manifestStore
          });
          return {
            durableHandoff: {
              runId,
              taskId,
              materialStore: manifestStore,
              manifestStore,
              handoffMaterial: material
            }
          };
        }
      },
      handoffCapability: {
        async prepare(input: Parameters<typeof appendSpecialistFinalOutputStep>[0]) {
          handoffCalls.push("prepare");
          return await appendSpecialistFinalOutputStep(input);
        },
        async bind(input: Parameters<typeof recordSpecialistHandoff>[0]) {
          handoffCalls.push("bind");
          return await recordSpecialistHandoff(input);
        },
        async readback(input: { readonly recorded: RecordSpecialistHandoffResult }) {
          handoffCalls.push("readback");
          return input.recorded;
        }
      }
    });

    const summary = await orchestrator.tick();

    expect(dispatchCalls).toEqual(["dispatch"]);
    expect(handoffCalls).toEqual(["prepare", "bind", "readback"]);
    expect(summary.sideEffectsScheduled).toEqual([
      expect.stringMatching(/^runner-dispatch:/),
      `runner-handoff-completed:${taskId}:${runId}`
    ]);
    expect(buildTaskOrchestratorProjection(await ledger.readAll(), { now: baseNow }).tasks.get(taskId)).toMatchObject({
      state: "completed"
    });
    const events = await ledger.readAll();
    expect(orderOf(events, "agent.specialist-run.step.recorded", "final-output")).toBeLessThan(orderOf(events, "agent.specialist-handoff.prepared"));
    expect(orderOf(events, "agent.specialist-handoff.recorded")).toBeLessThan(orderOf(events, "agent.specialist-run.completed"));
    expect(orderOf(events, "agent.specialist-run.completed")).toBeLessThan(orderOf(events, "agent.task.orchestration.completed"));
    expect(orderOf(events, "agent.task.orchestration.completed")).toBeLessThan(orderOf(events, "agent.task.status.changed", "completed"));
  });

  it("rejects a runner handoff for a different run than the approved byte-transfer proof", async () => {
    const ledger = new InMemoryEventLedger();
    const taskId = "task_task6_wrong_run";
    const approvedRunId = "run_task6_approved";
    const returnedRunId = "run_task6_returned";
    const runtime = createAgentRuntime({ ledger, actor, now: () => baseNow, providers: [] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_task6_wrong_run" });
    await runtime.createTask({ taskId, title: "Task 6 wrong run dispatch", requestedBy: actor.id, priority: "urgent" });
    const providerPolicy = approvedProviderPolicy(taskId, approvedRunId);
    const claim = await appendClaim(ledger, taskId);
    await appendDispatchContextReadyCheckpoint(ledger, taskId, claim, providerPolicy);
    const orchestrator = createTaskOrchestrator({
      ledger,
      now: () => baseNow,
      actor,
      policy: {
        defaultRunType: runType,
        leaseDurationMs: 600_000,
        providerPolicy
      },
      concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { [runType]: 1 } },
      budgets: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      workflowRegistry: {},
      contextRegistry: {},
      promptRendererRegistry: {},
      providerRegistry: {},
      approvalReader: { inspect: async () => ({ status: "approved", approvalEventId: "evt_task6_wrong_run_approval" }) },
      runnerRegistry: {
        async dispatch(input: Parameters<TaskOrchestratorRunnerRegistry["dispatch"]>[0]) {
          expect(input.approvedRunId).toBe(approvedRunId);
          const started = await runtime.startRun({ runId: returnedRunId, taskId, runType, scope: { kind: "workspace", refs: ["ws_task6_wrong_run"] } });
          if (!started.ok) throw new Error("Unable to start wrong-run dispatch fixture.");
          const manifestStore = new MemoryManifestStore();
          const material = materialFor({
            suffix: "wrong_run",
            runStartedEventId: started.eventIds[0]!,
            manifestStore
          });
          return {
            durableHandoff: {
              runId: returnedRunId,
              taskId,
              materialStore: manifestStore,
              manifestStore,
              handoffMaterial: material
            }
          };
        }
      },
      handoffCapability: {}
    });

    await expect(orchestrator.tick()).rejects.toThrow(/approved.*run/i);

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).not.toContain("agent.specialist-handoff.prepared");
    expect(eventTypes).not.toContain("agent.specialist-handoff.recorded");
    expect(eventTypes).not.toContain("agent.specialist-run.completed");
    expect(buildTaskOrchestratorProjection(await ledger.readAll(), { now: baseNow }).tasks.get(taskId)?.state).not.toBe("completed");
  });

  it("projects handoff pending when prepared manifest exists without recorded readback", async () => {
    const fixture = await orchestratorHandoffFixture("prepared_pending_projection");

    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await expect(recordSpecialistHandoff({
      ...recordInput(fixture),
      ledger: new ThrowBeforeAppendLedger(fixture.ledger, "agent.specialist-handoff.recorded")
    })).rejects.toThrow(/Injected crash/);

    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "handoff-pending",
      diagnosticReason: "handoff-readback-missing"
    });
  });

  it("recovers from crash after final output before prepared handoff", async () => {
    const fixture = await orchestratorHandoffFixture("recover_after_final_output");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-run.step.recorded")).toHaveLength(1);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("recovers from crash after prepared handoff before recorded readback", async () => {
    const fixture = await orchestratorHandoffFixture("recover_after_prepared");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await expect(recordSpecialistHandoff({
      ...recordInput(fixture),
      ledger: new ThrowBeforeAppendLedger(fixture.ledger, "agent.specialist-handoff.recorded")
    })).rejects.toThrow(/Injected crash/);

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-handoff.prepared")).toHaveLength(1);
    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-handoff.recorded")).toHaveLength(1);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("does not terminal the run or task when cancellation is present after handoff readback", async () => {
    const fixture = await orchestratorHandoffFixture("cancel_after_recorded");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    await appendTaskCanceled(fixture.ledger, fixture.taskId, recorded.recorded.id);

    const result = await completeTaskOrchestrationAfterHandoff({
      ledger: fixture.ledger,
      actor,
      now: fixture.clock.now,
      claim: fixture.claim,
      recorded
    });

    expect(result.specialistRunCompletedEventId).toBeUndefined();
    const events = await fixture.ledger.readAll();
    expect(eventsOfType(events, "agent.specialist-handoff.recorded")).toHaveLength(1);
    expect(eventsOfType(events, "agent.specialist-run.completed")).toHaveLength(0);
    expect(eventsOfType(events, "agent.task.orchestration.completed")).toHaveLength(0);
    expect(events.findLast((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
      event.type === "agent.task.status.changed"
    )?.payload.status).toBe("canceled");
    expect(buildTaskOrchestratorProjection(events, { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "canceled"
    });
  });

  it("recovers from crash after recorded readback before run terminal", async () => {
    const fixture = await orchestratorHandoffFixture("recover_after_recorded");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    await recordSpecialistHandoff(recordInput(fixture));

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-handoff.recorded")).toHaveLength(1);
    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-run.completed")).toHaveLength(1);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("recovers from crash after run terminal before orchestration terminal", async () => {
    const fixture = await orchestratorHandoffFixture("recover_after_run_terminal");
    await appendSpecialistFinalOutputStep(finalOutputInput(fixture));
    const recorded = await recordSpecialistHandoff(recordInput(fixture));
    await finalizeSpecialistRunAfterHandoff({
      ledger: fixture.ledger,
      actor,
      now: fixture.clock.now,
      recorded,
      appendTaskStatus: false
    });

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventsOfType(await fixture.ledger.readAll(), "agent.specialist-run.completed")).toHaveLength(1);
    expect(eventsOfType(await fixture.ledger.readAll(), "agent.task.orchestration.completed")).toHaveLength(1);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("recovers from crash after orchestration terminal before task status terminal", async () => {
    const fixture = await orchestratorHandoffFixture("recover_after_orchestration");
    await sequenceTaskOrchestratorHandoff({
      ...sequenceInput(fixture),
      appendTaskStatus: false
    });

    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "blocked",
      diagnosticReason: "terminal-task-status-missing"
    });

    await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    expect(eventsOfType(await fixture.ledger.readAll(), "agent.task.orchestration.completed")).toHaveLength(1);
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed"
    });
  });

  it("does not append completed task status over cancellation after orchestration terminal", async () => {
    const fixture = await orchestratorHandoffFixture("cancel_after_orchestration");
    await sequenceTaskOrchestratorHandoff({
      ...sequenceInput(fixture),
      appendTaskStatus: false
    });
    const orchestration = eventsOfType(await fixture.ledger.readAll(), "agent.task.orchestration.completed")[0]!;
    await appendTaskCanceled(fixture.ledger, fixture.taskId, orchestration.id);

    const resumed = await sequenceTaskOrchestratorHandoff(sequenceInput(fixture));

    const events = await fixture.ledger.readAll();
    expect(resumed.taskStatusEventId).toBeUndefined();
    expect(events.filter((event) =>
      event.type === "agent.task.status.changed" && event.payload.status === "completed"
    )).toHaveLength(0);
    expect(buildTaskOrchestratorProjection(events, { now: baseNow }).tasks.get(fixture.taskId)).toMatchObject({
      state: "canceled"
    });
  });

  it("rejects orchestration completion when handoff readback belongs to another task boundary", async () => {
    const fixture = await orchestratorHandoffFixture("reject_foreign_task_handoff");
    const foreignTaskId = "task_task6_foreign_same_ledger";
    const foreignRunId = "run_task6_foreign_same_ledger";
    const runtime = createAgentRuntime({ ledger: fixture.ledger, actor, now: () => baseNow, providers: [] });
    await runtime.createTask({ taskId: foreignTaskId, title: "Foreign handoff", requestedBy: actor.id, priority: "normal" });
    const started = await runtime.startRun({ runId: foreignRunId, taskId: foreignTaskId, runType, scope: { kind: "workspace", refs: ["ws_task6_foreign"] } });
    if (!started.ok) throw new Error("Unable to start foreign handoff run.");
    const foreignStore = new MemoryManifestStore();
    const foreignMaterial = materialFor({
      suffix: "foreign_same_ledger",
      runStartedEventId: started.eventIds[0]!,
      manifestStore: foreignStore
    });
    await appendSpecialistFinalOutputStep({
      ledger: fixture.ledger,
      materialStore: foreignStore,
      actor,
      now: fixture.clock.now,
      runId: foreignRunId,
      taskId: foreignTaskId,
      handoffMaterial: foreignMaterial
    });
    const recorded = await recordSpecialistHandoff({
      ledger: fixture.ledger,
      manifestStore: foreignStore,
      actor,
      now: fixture.clock.now,
      runId: foreignRunId,
      taskId: foreignTaskId
    });

    await expect(completeTaskOrchestrationAfterHandoff({
      ledger: fixture.ledger,
      actor,
      now: fixture.clock.now,
      claim: fixture.claim,
      recorded
    })).rejects.toThrow(/task.*handoff|run type/i);
    expect(eventsOfType(await fixture.ledger.readAll(), "agent.task.orchestration.completed")).toHaveLength(0);
  });
});

interface OrchestratorHandoffFixture {
  readonly ledger: EventLedger;
  readonly backingLedger: InMemoryEventLedger;
  readonly taskId: string;
  readonly runId: string;
  readonly claim: KnowledgeEventOf<"agent.task.orchestration.claimed">;
  readonly manifestStore: MemoryManifestStore;
  readonly material: SpecialistHandoffMaterial;
  readonly clock: { readonly now: () => string };
}

async function orchestratorHandoffFixture(suffix: string): Promise<OrchestratorHandoffFixture> {
  const ledger = new InMemoryEventLedger();
  const taskId = `task_task6_${suffix}`;
  const runId = `run_task6_${suffix}`;
  const runtime = createAgentRuntime({ ledger, actor, now: () => baseNow, providers: [] });
  await runtime.initializeDefaultIdentity({ workspaceId: `ws_task6_${suffix}` });
  await runtime.createTask({ taskId, title: "Task 6 durable handoff", requestedBy: actor.id, priority: "normal" });
  const started = await runtime.startRun({ runId, taskId, runType, scope: { kind: "workspace", refs: [`ws_task6_${suffix}`] } });
  if (!started.ok) throw new Error("Task 6 fixture could not start specialist run.");
  const claim = await appendClaim(ledger, taskId);
  const manifestStore = new MemoryManifestStore();
  const material = materialFor({ suffix, runStartedEventId: started.eventIds[0]!, manifestStore });

  return {
    ledger,
    backingLedger: ledger,
    taskId,
    runId,
    claim,
    manifestStore,
    material,
    clock: steppedClock()
  };
}

function materialFor(input: {
  readonly suffix: string;
  readonly runStartedEventId: string;
  readonly manifestStore: MemoryManifestStore;
}) {
  const contextBytes = Buffer.from(`context bytes ${input.suffix}`);
  const promptBytes = Buffer.from(`prompt bytes ${input.suffix}`);
  const outputBytes = Buffer.from(`output bytes ${input.suffix}`);
  const contextHash = hashBytes(contextBytes);
  const promptHash = hashBytes(promptBytes);
  const outputHash = hashBytes(outputBytes);
  input.manifestStore.seed(contextHash, contextBytes);
  input.manifestStore.seed(promptHash, promptBytes);
  input.manifestStore.seed(outputHash, outputBytes);
  return buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "Task 6 durable handoff is available for review.",
    contextPackRefs: [{
      contextPackId: "evidence-summary.v1",
      version: 1,
      contentHash: contextHash,
      sizeBytes: contextBytes.byteLength,
      generatedAt: baseNow,
      safeSummary: "Task 6 verified context.",
      provenanceRefs: [input.runStartedEventId],
      sourceEventIds: [input.runStartedEventId]
    }],
    promptArtifactHash: promptHash,
    outputArtifacts: [{
      artifactId: `artifact_${input.suffix}`,
      artifactKind: "triage-dossier",
      schemaId: "evidence-triage-output.v1",
      artifactHash: outputHash,
      safeSummary: "Task 6 output artifact."
    }],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `review_${input.suffix}`,
      label: "Review Task 6 handoff",
      kind: "review",
      effect: "none",
      artifactId: `artifact_${input.suffix}`
    }],
    sourceEventIds: [input.runStartedEventId],
    relatedEventIds: [input.runStartedEventId]
  });
}

function approvedProviderPolicy(taskId: string, runId: string) {
  const sourceEventId = "evt_task6_tick_context";
  const contextRef = buildContextPackRef({
    contextPackId: "evidence-summary.v1",
    version: 1,
    generatedAt: baseNow,
    payload: { taskId, sourceEventId },
    safeSummary: "Task 6 approved dispatch context.",
    provenanceRefs: [sourceEventId],
    sourceEventIds: [sourceEventId]
  });
  const promptArtifact = buildPromptArtifact({
    promptTemplateId: "task6-approved-dispatch",
    promptTemplateVersion: 1,
    generatedAt: baseNow,
    runType,
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [contextRef],
    text: "Dispatch only after approval.",
    safeSummary: "Task 6 approved dispatch prompt."
  });
  return {
    registry: createProviderRegistry.withDefaultsForTest(),
    task: {
      modality: "text" as const,
      structuredOutputRequired: true,
      sensitivity: "workspace-safe" as const,
      requiresRemoteHarness: false
    },
    readinessByProviderId: { provider_fake_remote: "requires-byte-transfer-approval" as const },
    selectionPolicy: { allowRemoteByteTransfer: true, preferredCostPolicy: "metered-api" as const },
    selectionPolicyVersion: "provider-policy.v1",
    approval: {
      runId,
      toolRequestId: "toolreq_task6_tick_provider_transfer",
      approvalRequirementId: "evt_task6_tick_tool_requested",
      approvedPreviewHash: hashString("task6 tick preview"),
      promptArtifactHash: promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
      contextBindingHashes: [contextRef.contentHash as `sha256:${string}`],
      credentialRef: {
        credentialRefId: "agent_credref_task6_remote",
        providerId: "provider_fake_remote",
        kind: "api-key-bearer" as const,
        safeLabel: "Task 6 fake remote credential",
        authorizedBy: "actor_task6_reviewer",
        authorizedAt: baseNow
      },
      providerReadiness: { cards: [] },
      promptArtifact,
      currentPreviewInput: {} as never
    }
  };
}

function sequenceInput(fixture: OrchestratorHandoffFixture) {
  return {
    ledger: fixture.ledger,
    actor,
    now: fixture.clock.now,
    claim: fixture.claim,
    runId: fixture.runId,
    taskId: fixture.taskId,
    materialStore: fixture.manifestStore,
    manifestStore: fixture.manifestStore,
    handoffMaterial: fixture.material
  };
}

function finalOutputInput(fixture: OrchestratorHandoffFixture) {
  return {
    ledger: fixture.ledger,
    materialStore: fixture.manifestStore,
    actor,
    now: fixture.clock.now,
    runId: fixture.runId,
    taskId: fixture.taskId,
    handoffMaterial: fixture.material
  };
}

function recordInput(fixture: OrchestratorHandoffFixture) {
  return {
    ledger: fixture.ledger,
    manifestStore: fixture.manifestStore,
    actor,
    now: fixture.clock.now,
    runId: fixture.runId,
    taskId: fixture.taskId
  };
}

async function appendClaim(
  ledger: EventLedger,
  taskId: string
): Promise<KnowledgeEventOf<"agent.task.orchestration.claimed">> {
  const streamId = taskOrchestrationStreamId(taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId,
    context: context("evt_task_created", baseNow),
    payload: {
      taskId,
      runType,
      attemptId: buildTaskAttemptId({ taskId, runType, retryGeneration: 0 }),
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      workerId: actor.id,
      claimedAt: baseNow,
      leaseExpiresAt: "2026-07-12T05:10:00.000Z",
      idempotencyKey: `task-orchestrator:${taskId}:${runType}:0:claim`,
      selectedOrderingPosition: {
        priorityRank: 2,
        queuedAt: baseNow,
        taskId,
        runType,
        retryGeneration: 0
      },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId: "evt_task_created"
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.claimed">;
}

async function appendDispatchContextReadyCheckpoint(
  ledger: EventLedger,
  taskId: string,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  providerPolicy: ReturnType<typeof approvedProviderPolicy>
) {
  const streamId = taskOrchestrationStreamId(taskId, runType);
  const stream = await ledger.readStream(streamId);
  const ref = providerPolicy.approval.promptArtifact.manifest.contextPackRefs[0];
  if (ref === undefined) {
    throw new Error("Task 6 dispatch fixture requires a prompt context ref.");
  }
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: context(claim.id, baseNow),
    payload: {
      taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: claim.payload.retryGeneration,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: baseNow,
      resumeIdempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${claim.payload.attemptId}:task6-context-ready`,
      contextBindings: [{
        contextPackId: ref.contextPackId,
        contentHash: providerPolicy.approval.contextBindingHashes[0] ?? ref.contentHash,
        sizeBytes: ref.sizeBytes,
        schemaId: ref.contextPackId,
        provenanceEventIds: [...ref.provenanceRefs]
      }],
      sourceEventIds: [...(ref.sourceEventIds ?? ref.provenanceRefs)],
      inputArtifactHashes: [
        providerPolicy.approval.contextBindingHashes[0] ?? ref.contentHash,
        providerPolicy.approval.promptArtifactHash
      ],
      promptArtifactHash: providerPolicy.approval.promptArtifactHash,
      safeNextActions: ["continue to exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

function context(causationId: string, occurredAt: string) {
  return {
    actor,
    occurredAt,
    causationId,
    correlationId: "corr_task6_dispatch",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

async function appendTaskCanceled(ledger: EventLedger, taskId: string, causationId: string): Promise<KnowledgeEventOf<"agent.task.status.changed">> {
  const taskStream = await ledger.readStream(`agent_task_${taskId}`);
  return await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context(causationId, "2026-07-12T05:00:06.500Z"),
    payload: {
      taskId,
      status: "canceled",
      changedBy: actor.id,
      reason: "Cancellation won the durable handoff completion race."
    }
  }, { expectedNextSequence: taskStream.length + 1 }) as KnowledgeEventOf<"agent.task.status.changed">;
}

function steppedClock() {
  let index = 0;
  const values = [
    "2026-07-12T05:00:01.000Z",
    "2026-07-12T05:00:02.000Z",
    "2026-07-12T05:00:03.000Z",
    "2026-07-12T05:00:04.000Z",
    "2026-07-12T05:00:05.000Z",
    "2026-07-12T05:00:06.000Z",
    "2026-07-12T05:00:07.000Z"
  ];
  return {
    now: () => values[index++] ?? values.at(-1)!
  };
}

class MemoryManifestStore implements SpecialistHandoffManifestStore {
  private readonly contents = new Map<`sha256:${string}`, Buffer>();

  seed(contentHash: `sha256:${string}`, content: Buffer): void {
    this.contents.set(contentHash, Buffer.from(content));
  }

  delete(contentHash: `sha256:${string}`): void {
    this.contents.delete(contentHash);
  }

  async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
    const contentHash = hashBytes(content);
    this.contents.set(contentHash, Buffer.from(content));
    return { contentHash, sizeBytes: content.byteLength };
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    const content = this.contents.get(contentHash);
    if (content === undefined) {
      throw new Error(`Manifest ${contentHash} is unavailable.`);
    }
    return Buffer.from(content);
  }
}

class ThrowBeforeAppendLedger implements EventLedger {
  private thrown = false;

  constructor(
    private readonly delegate: EventLedger,
    private readonly eventType: AppendableKnowledgeEvent["type"]
  ) {}

  async append(event: Parameters<EventLedger["append"]>[0], options?: Parameters<EventLedger["append"]>[1]) {
    if (!this.thrown && event.type === this.eventType) {
      this.thrown = true;
      throw new Error(`Injected crash before ${this.eventType}.`);
    }
    return await this.delegate.append(event, options);
  }

  async readStream(streamId: string) {
    return await this.delegate.readStream(streamId);
  }

  async readAll() {
    return await this.delegate.readAll();
  }
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hashString(value: string): `sha256:${string}` {
  return hashBytes(Buffer.from(value, "utf8"));
}

function eventsOfType(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][], type: string) {
  return events.filter((event) => event.type === type);
}

function eventOrder(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][], types: readonly string[]) {
  return events.filter((event) => types.includes(event.type)).map((event) => event.type);
}

function orderOf(
  events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][],
  type: string,
  status?: string
): number {
  const index = events.findIndex((event) =>
    event.type === type && (
      status === undefined ||
      (event.payload as Record<string, unknown>).status === status ||
      (event.payload as Record<string, unknown>).stepKind === status
    )
  );
  if (index < 0) {
    throw new Error(`Expected ${type} ${status ?? ""} in ledger.`);
  }
  return index;
}
