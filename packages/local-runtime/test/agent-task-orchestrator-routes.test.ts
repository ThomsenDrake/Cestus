import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTaskAttemptId,
  buildTaskOrchestratorIdempotencyKey,
  createAgentRuntime,
  createContextPackRegistry,
  createProviderRegistry,
  specialistWorkflowDescriptorFor,
  taskOrchestrationStreamId
} from "../../agent/src/index.js";
import type { AgentTaskOrchestratorRuntimeCapabilities } from "../../agent/src/index.js";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import type { ActorRef } from "../../prr/src/draft-events.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createLocalRuntimeHttpHandler,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
const actor: ActorRef = { id: "actor_task_orchestrator_route", kind: "human", label: "Task Orchestrator Route" };
const now = "2026-07-12T06:00:00.000Z";
const contentHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const runType = "evidence-triage" as const;

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent task orchestrator runtime routes", () => {
  it("http route labels task orchestration and approved tool scheduling separately", async () => {
    const config = portableConfig("ws_task_orchestrator_wake");
    const handler = testHandler(config, taskOrchestratorAgentRuntimeFactory());
    await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_orchestrator_wake",
        title: "Route task orchestrator wake",
        priority: "urgent"
      })
    });

    const response = await handler({ method: "POST", url: "/api/agent/wake" });

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly taskOrchestrator: { readonly claimed: readonly unknown[] };
      readonly approvedToolScheduler: { readonly schemaVersion: string };
    };
    expect(body.schemaVersion).toBe("agent-runtime-wake-result.v1");
    expect(body.taskOrchestrator.claimed).toHaveLength(1);
    expect(body.approvedToolScheduler.schemaVersion).toBe("agent-scheduler-wake-result.v1");
    expect(response.body).not.toContain("createAgentScheduler");
  });

  it("http route fails closed before task claim when orchestrator capabilities are not registered", async () => {
    const config = portableConfig("ws_task_orchestrator_missing_caps");
    const handler = testHandler(config);
    await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_missing_orchestrator_caps",
        title: "Route missing orchestrator capabilities",
        priority: "urgent"
      })
    });

    const response = await handler({ method: "POST", url: "/api/agent/task-orchestrator/tick" });
    const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
    try {
      expect(response.status).toBe(500);
      expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.task.orchestration.claimed");
    } finally {
      ledger.close();
    }
  });

  it("http route returns suspended approval and handoff pending projection without payload bytes", async () => {
    const config = portableConfig("ws_task_orchestrator_projection");
    const handler = testHandler(config, taskOrchestratorAgentRuntimeFactory());
    await seedTaskOrchestratorProjectionStates(config);

    const response = await handler({ method: "POST", url: "/api/agent/task-orchestrator/tick" });

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly taskOrchestrator: unknown;
      readonly projection: {
        readonly tasks: readonly { readonly taskId: string; readonly state: string }[];
        readonly attempts: readonly { readonly taskId: string; readonly state: string }[];
      };
    };
    expect(body.schemaVersion).toBe("agent-task-orchestrator-tick-result.v1");
    expect(body.projection.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: "task_route_approval_wait", state: "approval-suspended" }),
      expect.objectContaining({ taskId: "task_route_handoff_pending", state: "handoff-pending" })
    ]));
    expect(body.projection.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: "task_route_approval_wait", state: "approval-suspended" }),
      expect.objectContaining({ taskId: "task_route_handoff_pending", state: "handoff-pending" })
    ]));
    expect(response.body).not.toContain("payload");
    expect(response.body).not.toContain("resolvedContextPacks");
    expect(response.body).not.toContain("prompt text sentinel");
  });
});

function testHandler(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  agentRuntimeFactory?: LocalAgentRuntimeFactory
) {
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor,
    now: () => now,
    ...(agentRuntimeFactory === undefined ? {} : { agentRuntimeFactory })
  });
  handlers.push(handler);
  return handler;
}

function taskOrchestratorAgentRuntimeFactory(): LocalAgentRuntimeFactory {
  return (input) => createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    identityLifecycle: () => input.handle.residentIdentity.lifecycle(),
    identityLifecycleReady: () => input.handle.residentIdentity.ready(),
    approvedToolExecutors: input.approvedToolExecutors ?? [],
    taskOrchestratorCapabilities: taskOrchestratorCapabilitiesForTest()
  });
}

function taskOrchestratorCapabilitiesForTest(): AgentTaskOrchestratorRuntimeCapabilities {
  return {
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry: createContextPackRegistry(),
    promptRendererRegistry: {
      async render() {
        throw new Error("Route task orchestrator prompt renderer should not be invoked by Task 7 route tests.");
      }
    },
    providerRegistry: createProviderRegistry.withDefaultsForTest(),
    approvalReader: { inspect: async () => ({ status: "waiting" as const, reason: "test approval reader" }) },
    runnerRegistry: {
      async dispatch() {
        throw new Error("Route task orchestrator runner should not be dispatched by Task 7 route tests.");
      }
    },
    handoffCapability: {
      prepare() {
        throw new Error("Route task orchestrator handoff prepare should not be invoked by Task 7 route tests.");
      },
      bind() {
        throw new Error("Route task orchestrator handoff bind should not be invoked by Task 7 route tests.");
      },
      readback() {
        throw new Error("Route task orchestrator handoff readback should not be invoked by Task 7 route tests.");
      }
    }
  };
}

function portableConfig(workspaceId: string): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: now,
    createdBy: "task-orchestrator-route-test"
  });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-task-orchestrator-route-"));
  tempDirs.push(cwd);
  return cwd;
}

async function seedTaskOrchestratorProjectionStates(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<void> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    await seedTask(ledger, "task_route_approval_wait", "Approval wait projection");
    const approvalClaim = await seedClaim(ledger, "task_route_approval_wait");
    const approvalCheckpoint = await seedApprovalWaitCheckpoint(ledger, approvalClaim);
    await seedRelease(ledger, approvalClaim, approvalCheckpoint, "approval-suspended");

    await seedTask(ledger, "task_route_handoff_pending", "Handoff pending projection");
    const handoffClaim = await seedClaim(ledger, "task_route_handoff_pending");
    const handoffCheckpoint = await seedHandoffPendingCheckpoint(ledger, handoffClaim);
    await seedRelease(ledger, handoffClaim, handoffCheckpoint, "handoff-pending");
  } finally {
    ledger.close();
  }
}

async function seedTask(ledger: SQLiteEventLedger, taskId: string, title: string): Promise<KnowledgeEventOf<"agent.task.status.changed">> {
  const created = await ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: eventContext(`corr_${taskId}`, "evt_identity_route"),
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title,
      requestedBy: actor.id,
      priority: "urgent"
    }
  }, { expectedNextSequence: 1 });
  return await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: eventContext(`corr_${taskId}`, created.id),
    payload: {
      taskId,
      status: "queued",
      changedBy: actor.id,
      reason: "Task queued for route projection."
    }
  }, { expectedNextSequence: 2 }) as KnowledgeEventOf<"agent.task.status.changed">;
}

async function seedClaim(ledger: SQLiteEventLedger, taskId: string): Promise<KnowledgeEventOf<"agent.task.orchestration.claimed">> {
  const streamId = taskOrchestrationStreamId(taskId, runType);
  const attemptId = buildTaskAttemptId({ taskId, runType, retryGeneration: 0 });
  return await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId,
    context: eventContext(`corr_${taskId}`, `evt_${taskId}_queued`),
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      workerId: actor.id,
      claimedAt: now,
      leaseExpiresAt: "2026-07-12T06:10:00.000Z",
      idempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId,
        runType,
        retryGeneration: 0,
        attemptId,
        phase: "claim"
      }),
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
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId: `evt_${taskId}_queued`
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"agent.task.orchestration.claimed">;
}

async function seedApprovalWaitCheckpoint(
  ledger: SQLiteEventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const { taskId, attemptId } = claim.payload;
  const stream = await ledger.readStream(claim.streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: claim.streamId,
    context: eventContext(`corr_${taskId}`, claim.id),
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "approval-wait",
      checkpointedAt: now,
      runId: "run_route_approval_wait",
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId,
        runType,
        retryGeneration: 0,
        attemptId,
        phase: "resume-provider-byte-transfer-approval"
      }),
      toolRequestIds: ["toolreq_route_provider_transfer"],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        previewHash: contentHash,
        approvalRequestEventId: "evt_route_provider_transfer_requested"
      },
      providerPosture: {
        providerId: "provider_route_remote",
        modelFamily: "route-model",
        adapterVersion: "route-provider.v1",
        capabilityIds: ["cap_route_structured_output"],
        readinessState: "approval-required",
        approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: "remote prompt transfer gated",
        selectionPolicyVersion: "provider-policy.v1",
        sensitivityClass: "workspace-safe",
        requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: [contextBinding("evidence-summary.v1", claim.id)],
      sourceEventIds: [claim.id],
      inputArtifactHashes: [contentHash],
      promptArtifactHash: contentHash,
      lockSnapshot: { activeLockIds: [], highWaterMark: 0 },
      safeNextActions: ["wait for exact provider-byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function seedHandoffPendingCheckpoint(
  ledger: SQLiteEventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">
): Promise<KnowledgeEventOf<"agent.task.orchestration.checkpointed">> {
  const stream = await ledger.readStream(claim.streamId);
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId: claim.streamId,
    context: eventContext(`corr_${claim.payload.taskId}`, claim.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "handoff-pending",
      checkpointedAt: now,
      resumeIdempotencyKey: buildTaskOrchestratorIdempotencyKey({
        taskId: claim.payload.taskId,
        runType,
        retryGeneration: 0,
        attemptId: claim.payload.attemptId,
        phase: "resume-handoff-pending"
      }),
      contextBindings: [],
      safeNextActions: ["resume durable handoff readback"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function seedRelease(
  ledger: SQLiteEventLedger,
  claim: KnowledgeEventOf<"agent.task.orchestration.claimed">,
  checkpoint: KnowledgeEventOf<"agent.task.orchestration.checkpointed">,
  releaseReason: "approval-suspended" | "handoff-pending"
): Promise<void> {
  const stream = await ledger.readStream(claim.streamId);
  await ledger.append({
    type: "agent.task.orchestration.released",
    version: 1,
    streamId: claim.streamId,
    context: eventContext(`corr_${claim.payload.taskId}`, checkpoint.id),
    payload: {
      taskId: claim.payload.taskId,
      runType,
      attemptId: claim.payload.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      releasedBy: actor.id,
      releasedAt: now,
      releaseReason,
      claimEventId: claim.id,
      checkpointEventId: checkpoint.id,
      safeNextActions: releaseReason === "approval-suspended"
        ? ["resume after provider-byte-transfer approval"]
        : ["resume durable handoff readback"]
    }
  }, { expectedNextSequence: stream.length + 1 });
}

function contextBinding(contextPackId: string, eventId: string) {
  return {
    contextPackId,
    contentHash,
    sizeBytes: 128,
    schemaId: contextPackId,
    provenanceEventIds: [eventId]
  };
}

function eventContext(correlationId: string, causationId: string) {
  return {
    actor,
    occurredAt: now,
    causationId,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}
