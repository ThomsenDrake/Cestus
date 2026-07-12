import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ActorRef, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { buildPromptArtifact } from "../src/prompt-artifacts.js";
import { createProviderRegistry } from "../src/provider-registry.js";
import { buildSpecialistHandoffMaterial } from "../src/specialist-handoff-manifest.js";
import {
  appendSpecialistFinalOutputStep,
  recordSpecialistHandoff,
  type SpecialistHandoffManifestStore
} from "../src/specialist-runner-kernel.js";
import {
  createTaskOrchestrator,
  type TaskOrchestratorRunnerRegistry
} from "../src/task-orchestrator.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../src/task-orchestrator-events.js";
import { buildTaskOrchestratorProjection } from "../src/task-orchestrator-projection.js";
import type { TaskOrchestratorProviderApprovalProof } from "../src/task-orchestrator-approval.js";

const runType = "evidence-triage" as const;
const now = "2026-07-12T07:30:00.000Z";
const actor: ActorRef = { id: "actor_task8_recovery_orchestrator", kind: "agent", label: "Task 8 recovery orchestrator" };
const humanActor: ActorRef = { id: "actor_task8_recovery_reviewer", kind: "human", label: "Task 8 recovery reviewer" };

describe("task orchestrator evidence triage recovery", () => {
  it("evidence triage restart before claim reconstructs queued", async () => {
    const ledger = new InMemoryEventLedger();
    const { taskId } = await appendQueuedTask(ledger, "before_claim");

    const projection = buildTaskOrchestratorProjection(await ledger.readAll(), { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "queued",
      taskStatus: "queued"
    });
  });

  it("evidence triage restart after claim reconstructs active attempt", async () => {
    const ledger = new InMemoryEventLedger();
    const { taskId, queuedStatus } = await appendQueuedTask(ledger, "after_claim");
    const claim = await appendClaim(ledger, taskId, 1, queuedStatus.id);

    const projection = buildTaskOrchestratorProjection(await ledger.readAll(), { now });

    expect(projection.tasks.get(taskId)).toMatchObject({
      state: "claimed",
      activeAttemptKey: `${taskId}:${runType}:0`
    });
    expect(projection.attempts.get(`${taskId}:${runType}:0`)).toMatchObject({
      attemptId: claim.payload.attemptId,
      leaseClaimGeneration: 1,
      activeLease: expect.objectContaining({ expired: false })
    });
  });

  it("evidence triage restart after context checkpoint reconstructs context bindings", async () => {
    const ledger = new InMemoryEventLedger();
    const { taskId, queuedStatus } = await appendQueuedTask(ledger, "after_context");
    const claim = await appendClaim(ledger, taskId, 1, queuedStatus.id);
    const proof = providerProof(taskId, "run_task8_recovery_after_context");
    const checkpoint = await appendContextReadyCheckpoint(ledger, claim, proof);

    const replayed = await ledger.readStream(taskOrchestrationStreamId(taskId, runType));

    expect(checkpoint.payload.contextBindings).toEqual([
      expect.objectContaining({
        contextPackId: "evidence-summary.v1",
        contentHash: proof.contextRef.contentHash,
        schemaId: "evidence-summary.v1"
      })
    ]);
    expect(JSON.stringify(replayed)).not.toContain("task8-recovery-payload-secret");
    expect(buildTaskOrchestratorProjection(await ledger.readAll(), { now }).attempts.get(`${taskId}:${runType}:0`)).toMatchObject({
      state: "claimed"
    });
  });

  it("evidence triage restart during provider approval reconstructs suspended checkpoint without lease", async () => {
    const fixture = await approvedSuspendedAttempt("during_approval", { activeAfterApproval: false });

    const projection = buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now });
    const task = projection.tasks.get(fixture.taskId);
    const attempt = projection.attempts.get(`${fixture.taskId}:${runType}:0`);

    expect(task).toMatchObject({ state: "approval-suspended" });
    expect(attempt).toMatchObject({
      state: "approval-suspended",
      activeLease: undefined,
      suspendedCheckpoint: expect.objectContaining({
        checkpointEventId: fixture.approvalCheckpoint.id,
        releaseEventId: fixture.release.id
      })
    });
  });

  it("evidence triage restart after approval before provider call uses stable idempotent dispatch identity", async () => {
    const fixture = await approvedSuspendedAttempt("approved_before_provider", { activeAfterApproval: true });
    const runnerCalls: string[] = [];
    const orchestrator = recoveryOrchestrator(fixture, {
      async dispatch(input) {
        runnerCalls.push(`${input.taskId}:${input.approvedRunId}`);
      }
    });

    const summary = await orchestrator.tick();

    expect(summary.approvalVerified).toContainEqual(expect.objectContaining({
      taskId: fixture.taskId,
      toolRequestId: fixture.proof.toolRequestId
    }));
    expect(runnerCalls).toEqual([`${fixture.taskId}:${fixture.runId}`]);
    const secondSummary = await orchestrator.tick();
    expect(secondSummary.sideEffectsScheduled).toEqual([`runner-dispatch:${fixture.taskId}:${fixture.activeClaim!.payload.attemptId}`]);
    expect(runnerCalls).toEqual([
      `${fixture.taskId}:${fixture.runId}`,
      `${fixture.taskId}:${fixture.runId}`
    ]);
  });

  it("evidence triage restart after runner dispatch checkpoint before provider call remains recoverable", async () => {
    const fixture = await approvedSuspendedAttempt("dispatch_checkpoint_crash", { activeAfterApproval: true });
    await appendRunnerDispatchingCheckpoint(fixture.ledger, fixture.activeClaim!, fixture.proof);
    const runnerCalls: string[] = [];
    const orchestrator = recoveryOrchestrator(fixture, {
      async dispatch(input) {
        runnerCalls.push(`${input.taskId}:${input.approvedRunId}`);
      }
    });

    const summary = await orchestrator.tick();

    expect(runnerCalls).toEqual([`${fixture.taskId}:${fixture.runId}`]);
    expect(summary.sideEffectsScheduled).toEqual([`runner-dispatch:${fixture.taskId}:${fixture.activeClaim!.payload.attemptId}`]);
  });

  it("evidence triage restart after approval blocks dispatch without durable context-ready proof", async () => {
    const fixture = await approvedSuspendedAttempt("approved_without_context", {
      activeAfterApproval: true,
      includeContextReady: false
    });
    const runnerCalls: string[] = [];
    const orchestrator = recoveryOrchestrator(fixture, {
      async dispatch(input) {
        runnerCalls.push(`${input.taskId}:${input.approvedRunId}`);
      }
    });

    const summary = await orchestrator.tick();

    expect(runnerCalls).toEqual([]);
    expect(summary.blocked).toContainEqual(expect.objectContaining({
      taskId: fixture.taskId,
      reason: "context-not-ready"
    }));
    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now }).tasks.get(fixture.taskId)).toMatchObject({
      state: "blocked"
    });
  });

  it("evidence triage restart after provider final output completes handoff before terminal", async () => {
    const fixture = await approvedSuspendedAttempt("after_final_output", { activeAfterApproval: true });
    const started = await appendRunStarted(fixture.ledger, fixture.taskId, fixture.runId);
    fixture.handoffMaterial = recoveryHandoffMaterial(fixture, "after_final_output", started.id);
    await appendSpecialistFinalOutputStep({
      ledger: fixture.ledger,
      materialStore: fixture.store,
      actor,
      now: () => now,
      runId: fixture.runId,
      taskId: fixture.taskId,
      handoffMaterial: fixture.handoffMaterial
    });

    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now }).tasks.get(fixture.taskId)).toMatchObject({
      state: "handoff-pending"
    });

    await recoveryOrchestrator(fixture, handoffRunner(fixture)).tick();

    const order = eventOrder(await fixture.ledger.readAll(), [
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]);
    expect(order).toEqual([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]);
  });

  it("evidence triage restart after handoff readback completes run and task terminal", async () => {
    const fixture = await approvedSuspendedAttempt("after_handoff_readback", { activeAfterApproval: true });
    const started = await appendRunStarted(fixture.ledger, fixture.taskId, fixture.runId);
    fixture.handoffMaterial = recoveryHandoffMaterial(fixture, "after_handoff_readback", started.id);
    await appendSpecialistFinalOutputStep({
      ledger: fixture.ledger,
      materialStore: fixture.store,
      actor,
      now: () => now,
      runId: fixture.runId,
      taskId: fixture.taskId,
      handoffMaterial: fixture.handoffMaterial
    });
    await recordSpecialistHandoff({
      ledger: fixture.ledger,
      manifestStore: fixture.store,
      actor,
      now: () => now,
      runId: fixture.runId,
      taskId: fixture.taskId
    });

    await recoveryOrchestrator(fixture, handoffRunner(fixture)).tick();

    expect(buildTaskOrchestratorProjection(await fixture.ledger.readAll(), { now }).tasks.get(fixture.taskId)).toMatchObject({
      state: "completed",
      taskStatus: "completed"
    });
    expect(eventOrder(await fixture.ledger.readAll(), [
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.task.orchestration.completed",
      "agent.task.status.changed:completed"
    ])).toEqual([
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.task.orchestration.completed",
      "agent.task.status.changed:completed"
    ]);
  });
});

async function approvedSuspendedAttempt(
  suffix: string,
  options: {
    readonly activeAfterApproval: boolean;
    readonly includeContextReady?: boolean;
  }
) {
  const ledger = new InMemoryEventLedger();
  const task = await appendQueuedTask(ledger, suffix);
  const runId = `run_task8_recovery_${suffix}`;
  const proof = providerProof(task.taskId, runId, task.queuedStatus.id);
  const claim = await appendClaim(ledger, task.taskId, 1, task.queuedStatus.id);
  if (options.includeContextReady !== false) {
    await appendContextReadyCheckpoint(ledger, claim, proof);
  }
  const approvalCheckpoint = await appendApprovalWaitCheckpoint(ledger, claim, proof);
  const release = await appendRelease(ledger, claim, approvalCheckpoint.id);
  const activeClaim = options.activeAfterApproval
    ? await appendClaim(ledger, task.taskId, 2, approvalCheckpoint.id, claim.payload.attemptId)
    : undefined;
  const store = new MemoryManifestStore();
  const outputBytes = Buffer.from(`Task 8 recovery output ${suffix}.`);
  const outputHash = hashBytes(outputBytes);
  store.seed(proof.contextRef.contentHash as `sha256:${string}`, proof.contextBytes);
  store.seed(outputHash, outputBytes);
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "Task 8 recovery handoff is ready for review.",
    contextPackRefs: [proof.contextRef],
    outputArtifacts: [{
      artifactId: `artifact_task8_recovery_${suffix}`,
      artifactKind: "triage-dossier",
      schemaId: "evidence-triage-output.v1",
      artifactHash: outputHash,
      safeSummary: "Task 8 recovery output artifact."
    }],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `review_task8_recovery_${suffix}`,
      label: "Review Task 8 recovery handoff",
      kind: "review",
      effect: "none",
      artifactId: `artifact_task8_recovery_${suffix}`
    }],
    sourceEventIds: [task.queuedStatus.id],
    relatedEventIds: [task.queuedStatus.id]
  });
  return {
    ledger,
    taskId: task.taskId,
    runId,
    proof,
    claim,
    activeClaim,
    approvalCheckpoint,
    release,
    store,
    handoffMaterial
  };
}

function recoveryHandoffMaterial(
  fixture: Awaited<ReturnType<typeof approvedSuspendedAttempt>>,
  suffix: string,
  runStartedEventId: string
) {
  const outputBytes = Buffer.from(`Task 8 recovery output ${suffix}.`);
  const outputHash = hashBytes(outputBytes);
  fixture.store.seed(outputHash, outputBytes);
  return buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "Task 8 recovery handoff is ready for review.",
    contextPackRefs: [fixture.proof.contextRef],
    outputArtifacts: [{
      artifactId: `artifact_task8_recovery_${suffix}`,
      artifactKind: "triage-dossier",
      schemaId: "evidence-triage-output.v1",
      artifactHash: outputHash,
      safeSummary: "Task 8 recovery output artifact."
    }],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `review_task8_recovery_${suffix}`,
      label: "Review Task 8 recovery handoff",
      kind: "review",
      effect: "none",
      artifactId: `artifact_task8_recovery_${suffix}`
    }],
    sourceEventIds: [runStartedEventId],
    relatedEventIds: [runStartedEventId]
  });
}

function recoveryOrchestrator(
  fixture: Awaited<ReturnType<typeof approvedSuspendedAttempt>>,
  runnerRegistry: TaskOrchestratorRunnerRegistry
) {
  return createTaskOrchestrator({
    ledger: fixture.ledger,
    now: () => now,
    actor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      providerPolicy: fixture.proof.policy
    },
    concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { [runType]: 1 } },
    budgets: {
      maxProviderInvocations: 1,
      remainingProviderInvocations: 1,
      contextByteBudget: 65_536,
      promptByteBudget: 65_536,
      derivativeArtifactByteBudget: 65_536,
      wallClockBudgetMs: 120_000
    },
    workflowRegistry: {},
    contextRegistry: {},
    promptRendererRegistry: {
      render() {
        throw new Error("Recovery must not re-render prompt bytes after a durable approval checkpoint.");
      }
    },
    providerRegistry: createProviderRegistry.withDefaultsForTest(),
    approvalReader: { inspect: async () => ({ status: "approved", approvalEventId: "evt_task8_recovery_approval" }) },
    runnerRegistry,
    handoffCapability: {}
  });
}

function handoffRunner(fixture: Awaited<ReturnType<typeof approvedSuspendedAttempt>>): TaskOrchestratorRunnerRegistry {
  return {
    async dispatch() {
      return {
        durableHandoff: {
          runId: fixture.runId,
          taskId: fixture.taskId,
          materialStore: fixture.store,
          manifestStore: fixture.store,
          handoffMaterial: fixture.handoffMaterial
        }
      };
    }
  };
}

async function appendQueuedTask(ledger: EventLedger, suffix: string) {
  const taskId = `task_task8_recovery_${suffix}`;
  const created = await ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: eventContext("evt_task8_recovery_source", now),
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: `Task 8 recovery ${suffix}`,
      requestedBy: humanActor.id,
      priority: "urgent",
      sourceEventIds: ["evt_task8_recovery_source"],
      inputArtifactHashes: [hashString(`input:${suffix}`)]
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"agent.task.created">;
  const queuedStatus = await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: eventContext(created.id, now),
    payload: {
      taskId,
      status: "queued",
      changedBy: actor.id,
      reason: "Task queued for evidence triage recovery test."
    }
  }, { expectedNextSequence: 2 }) as KnowledgeEventOf<"agent.task.status.changed">;
  return { taskId, created, queuedStatus };
}

async function appendClaim(
  ledger: EventLedger,
  taskId: string,
  leaseClaimGeneration: number,
  causationId: string,
  attemptId: KnowledgeEventOf<"agent.task.orchestration.claimed">["payload"]["attemptId"] =
    buildTaskAttemptId({ taskId, runType, retryGeneration: 0 })
) {
  const streamId = taskOrchestrationStreamId(taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId,
    context: eventContext(causationId, now),
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration,
      workerId: actor.id,
      claimedAt: now,
      leaseExpiresAt: "2026-07-12T07:40:00.000Z",
      idempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${attemptId}:claim`,
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: now,
        taskId,
        runType,
        retryGeneration: 0
      },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 65_536,
        promptByteBudget: 65_536,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId: causationId
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.claimed">;
}

async function appendContextReadyCheckpoint(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  proof: ReturnType<typeof providerProof>
) {
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(claim.id, now),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: now,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:resume-context`,
      contextBindings: [contextBinding(proof)],
      sourceEventIds: ["evt_task8_recovery_source"],
      inputArtifactHashes: [proof.contextRef.contentHash, proof.promptArtifactHash],
      promptArtifactHash: proof.promptArtifactHash,
      safeNextActions: ["continue to provider approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendApprovalWaitCheckpoint(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  proof: ReturnType<typeof providerProof>
) {
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(claim.id, now),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "approval-wait",
      checkpointedAt: now,
      runId: proof.runId,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:resume-approval`,
      toolRequestIds: [proof.toolRequestId],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        previewHash: proof.approvedPreviewHash,
        approvalRequestEventId: proof.approvalRequirementId
      },
      providerPosture: {
        providerId: "provider_fake_remote",
        modelFamily: "fake-remote",
        adapterVersion: "agent-provider-auth.v1",
        capabilityIds: ["provider_fake_remote:text:fake-remote"],
        readinessState: "approval-required",
        approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: "Remote prompt bytes require provider-byte-transfer approval.",
        selectionPolicyVersion: "provider-policy.v1",
        sensitivityClass: "workspace-safe",
        requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: [contextBinding(proof)],
      sourceEventIds: ["evt_task8_recovery_source"],
      inputArtifactHashes: [proof.contextRef.contentHash, proof.promptArtifactHash],
      promptArtifactHash: proof.promptArtifactHash,
      lockSnapshot: { activeLockIds: [], highWaterMark: 0 },
      safeNextActions: [`review ${proof.approvalRequirementId}`]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendRelease(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  checkpointEventId: string
) {
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.released",
    version: 1,
    streamId,
    context: eventContext(checkpointEventId, now),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      releasedBy: actor.id,
      releasedAt: now,
      releaseReason: "approval-suspended",
      claimEventId: claim.id,
      checkpointEventId,
      safeNextActions: ["wait for exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.released">;
}

async function appendRunnerDispatchingCheckpoint(
  ledger: EventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  proof: ReturnType<typeof providerProof>
) {
  const streamId = taskOrchestrationStreamId(claim.payload.taskId, runType);
  const stream = await ledger.readStream(streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: eventContext(claim.id, now),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "runner-dispatching",
      checkpointedAt: now,
      runId: proof.runId,
      resumeIdempotencyKey: `task-orchestrator:${claim.payload.taskId}:${runType}:0:${claim.payload.attemptId}:dispatch-runner`,
      contextBindings: [contextBinding(proof)],
      sourceEventIds: ["evt_task8_recovery_source"],
      inputArtifactHashes: [proof.contextRef.contentHash, proof.promptArtifactHash],
      promptArtifactHash: proof.promptArtifactHash,
      safeNextActions: ["dispatch the approved specialist runner"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendRunStarted(ledger: EventLedger, taskId: string, runId: string) {
  return await ledger.append({
    type: "agent.specialist-run.started",
    version: 1,
    streamId: `agent_run_${runId}`,
    context: eventContext("evt_task8_recovery_source", now),
    payload: {
      runId,
      residentAgentId: "agent_default",
      runType,
      startedBy: actor.id,
      taskId,
      sourceEventIds: ["evt_task8_recovery_source"],
      inputArtifactHashes: [hashString(`run:${runId}`)]
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"agent.specialist-run.started">;
}

function providerProof(taskId: string, runId: string, sourceEventId = "evt_task8_recovery_source") {
  const contextBytes = Buffer.from(`Task 8 recovery verified context for ${taskId}.`);
  const contextRef = {
    contextPackId: "evidence-summary.v1",
    version: 1,
    generatedAt: now,
    contentHash: hashBytes(contextBytes),
    sizeBytes: contextBytes.byteLength,
    safeSummary: "Task 8 recovery evidence context.",
    provenanceRefs: [sourceEventId],
    sourceEventIds: [sourceEventId]
  } as const;
  const promptArtifact = buildPromptArtifact({
    promptTemplateId: "evidence-triage.classify.v1",
    promptTemplateVersion: 1,
    generatedAt: now,
    runType,
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [contextRef],
    text: "Use verified recovery context.",
    safeSummary: "Task 8 recovery prompt."
  });
  const promptArtifactHash = promptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
  const proof: TaskOrchestratorProviderApprovalProof = {
    runId,
    toolRequestId: `toolreq_task8_recovery_${taskId}`,
    approvalRequirementId: `evt_task8_recovery_request_${taskId}`,
    approvedPreviewHash: hashString(`preview:${taskId}:${runId}`),
    promptArtifactHash,
    contextBindingHashes: [contextRef.contentHash as `sha256:${string}`],
    credentialRef: {
      credentialRefId: "agent_credref_task8_recovery_remote",
      providerId: "provider_fake_remote",
      kind: "api-key-bearer",
      safeLabel: "Task 8 recovery fake remote credential"
    },
    providerReadiness: { cards: [] },
    promptArtifact,
    currentPreviewInput: {} as never
  };
  return {
    runId,
    contextRef,
    contextBytes,
    promptArtifactHash,
    toolRequestId: proof.toolRequestId,
    approvalRequirementId: proof.approvalRequirementId,
    approvedPreviewHash: proof.approvedPreviewHash,
    policy: {
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
      approval: proof
    }
  };
}

function contextBinding(proof: ReturnType<typeof providerProof>) {
  return {
    contextPackId: proof.contextRef.contextPackId,
    contentHash: proof.contextRef.contentHash,
    sizeBytes: proof.contextRef.sizeBytes,
    schemaId: proof.contextRef.contextPackId,
    provenanceEventIds: [...proof.contextRef.provenanceRefs]
  };
}

function eventContext(causationId: string, occurredAt: string) {
  return {
    actor,
    occurredAt,
    causationId,
    correlationId: "corr_task8_recovery",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function eventOrder(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][], expected: readonly string[]): string[] {
  return events
    .map((event) => event.type === "agent.task.status.changed" ? `${event.type}:${event.payload.status}` : event.type)
    .filter((type) => expected.includes(type));
}

class MemoryManifestStore implements SpecialistHandoffManifestStore {
  private readonly contents = new Map<`sha256:${string}`, Buffer>();

  seed(contentHash: `sha256:${string}`, content: Buffer): void {
    this.contents.set(contentHash, Buffer.from(content));
  }

  async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
    const contentHash = hashBytes(content);
    this.contents.set(contentHash, Buffer.from(content));
    return { contentHash, sizeBytes: content.byteLength };
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    const content = this.contents.get(contentHash);
    if (content === undefined) {
      throw new Error(`Task 8 recovery manifest ${contentHash} is unavailable.`);
    }
    return Buffer.from(content);
  }
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hashString(value: string): `sha256:${string}` {
  return hashBytes(Buffer.from(value, "utf8"));
}
