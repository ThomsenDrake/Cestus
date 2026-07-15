import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { hashAgentTaskOrchestratorPromptBindingReceipt } from "../../ontology/src/contracts.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import { buildTaskOrchestratorProjection } from "../../agent/src/task-orchestrator-projection.js";
import type { TaskOrchestratorPromptBindingReceiptV1 } from "../../agent/src/task-orchestrator-types.js";
import {
  projectionRebuildDtoSchema,
  workspaceOpsEnvelopeSchema,
  workspaceOpsSchemaVersion
} from "../src/contracts.js";
import { createProvisionalWorkspaceLayout } from "../src/layout.js";
import {
  rebuildProjection,
  rebuildProjectionReadiness,
  type ProjectionArtifactFileSystem
} from "../src/projection-rebuild.js";

const layout = createProvisionalWorkspaceLayout("/workspace");

function promptBindingReceiptFixture(
  material: Omit<TaskOrchestratorPromptBindingReceiptV1, "schemaVersion" | "receiptHash">
): TaskOrchestratorPromptBindingReceiptV1 {
  const receiptMaterial = {
    schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1" as const,
    ...material
  };
  return Object.freeze({
    ...receiptMaterial,
    receiptHash: hashAgentTaskOrchestratorPromptBindingReceipt(receiptMaterial)
  });
}

class RecordingProjectionFs implements ProjectionArtifactFileSystem {
  readonly existsCalls: string[] = [];
  readonly writes: Array<{ readonly path: string; readonly content: string }> = [];
  readonly removed: string[] = [];
  readonly promoted: Array<{ readonly from: string; readonly to: string }> = [];
  readonly availableBytesCalls: string[] = [];

  constructor(
    private readonly options: {
      readonly exists?: boolean;
      readonly failWrite?: boolean;
      readonly availableBytes?: number | undefined;
    } = {}
  ) {}

  async exists(path: string): Promise<boolean> {
    this.assertProjectionPath(path);
    this.existsCalls.push(path);
    return this.options.exists ?? true;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.assertProjectionPath(path);
    if (this.options.failWrite) {
      throw new Error("private projection write failed");
    }
    this.writes.push({ path, content });
  }

  async remove(path: string): Promise<void> {
    this.assertProjectionPath(path);
    this.removed.push(path);
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    this.assertProjectionPath(from);
    this.assertProjectionPath(to);
    this.promoted.push({ from, to });
  }

  async availableBytes(path: string): Promise<number | undefined> {
    this.assertProjectionPath(path);
    this.availableBytesCalls.push(path);
    return this.options.availableBytes ?? 1_000_000;
  }

  private assertProjectionPath(path: string): void {
    if (path !== layout.projectionRoot && !path.startsWith(`${layout.projectionRoot}/`)) {
      throw new Error(`canonical projection filesystem access attempted: ${path}`);
    }
  }
}

describe("projection rebuild", () => {
  it("ledger replay retains prompt bound receipt after runner dispatching", async () => {
    const ledger = new InMemoryEventLedger();
    const taskId = "task_projection_rebuild_prompt_receipt";
    const runId = "run_projection_rebuild_prompt_receipt";
    const runType = "evidence-triage" as const;
    const attemptId = buildTaskAttemptId({ taskId, runType, retryGeneration: 0 });
    const receipt = promptBindingReceiptFixture({
      taskId,
      attemptId,
      runId,
      sourceApprovedPromptArtifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      boundPromptArtifactHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      generatedAt: "2026-07-15T13:00:03.000Z",
      approvalEventId: "evt_projection_rebuild_provider_approved",
      providerPostureHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      exactRunBindingHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      workspaceId: "ws_projection_rebuild",
      mountInstanceId: "mount_projection_rebuild"
    });
    await appendReplayEvent(ledger, {
      type: "agent.task.created",
      streamId: `agent_task_${taskId}`,
      occurredAt: "2026-07-15T13:00:00.000Z",
      payload: {
        taskId,
        residentAgentId: "agent_default",
        title: "Projection receipt rebuild",
        requestedBy: "actor_projection_rebuild",
        priority: "normal",
        sourceEventIds: ["evt_projection_rebuild_source"],
        inputArtifactHashes: [receipt.sourceApprovedPromptArtifactHash]
      }
    });
    await appendReplayEvent(ledger, {
      type: "agent.task.status.changed",
      streamId: `agent_task_${taskId}`,
      occurredAt: "2026-07-15T13:00:01.000Z",
      payload: {
        taskId,
        status: "running",
        changedBy: "actor_projection_rebuild",
        reason: "Projection receipt rebuild is running.",
        runId
      }
    });
    await appendReplayEvent(ledger, {
      type: "agent.task.orchestration.claimed",
      streamId: taskOrchestrationStreamId(taskId, runType),
      occurredAt: "2026-07-15T13:00:02.000Z",
      payload: {
        taskId,
        runType,
        attemptId,
        retryGeneration: 0,
        leaseClaimGeneration: 1,
        workerId: "actor_projection_rebuild",
        claimedAt: "2026-07-15T13:00:02.000Z",
        leaseExpiresAt: "2026-07-15T13:10:02.000Z",
        idempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${attemptId}:claim`,
        selectedOrderingPosition: { priorityRank: 1, queuedAt: "2026-07-15T13:00:00.000Z", taskId, runType, retryGeneration: 0 },
        activeBudgetSnapshot: {
          maxProviderInvocations: 1,
          remainingProviderInvocations: 1,
          contextByteBudget: 4096,
          promptByteBudget: 4096,
          derivativeArtifactByteBudget: 4096,
          wallClockBudgetMs: 60000
        },
        causationEventId: "evt_projection_rebuild_status"
      }
    });
    await appendReplayCheckpoint(ledger, {
      taskId,
      runId,
      runType,
      attemptId,
      checkpointKind: "prompt-bound",
      occurredAt: "2026-07-15T13:00:03.000Z",
      promptBindingReceipt: receipt
    });
    await appendReplayCheckpoint(ledger, {
      taskId,
      runId,
      runType,
      attemptId,
      checkpointKind: "runner-dispatching",
      occurredAt: "2026-07-15T13:00:04.000Z"
    });

    const fileSystem = new RecordingProjectionFs();
    const result = await rebuildProjection({
      layout,
      projectionName: "task-orchestrator",
      fileSystem,
      eventReader: { readAll: async () => await ledger.readAll() },
      builder: {
        projectionName: "task-orchestrator",
        build: async (events) => {
          const attempt = buildTaskOrchestratorProjection(events, { now: "2026-07-15T13:00:05.000Z" })
            .attempts.get(`${taskId}:${runType}:0`);
          return { "attempt.json": JSON.stringify({
            latestCheckpoint: attempt?.latestCheckpoint,
            latestPromptBindingReceipt: attempt?.latestPromptBindingReceipt
          }) };
        }
      },
      rebuildId: "rb_prompt_receipt_replay"
    });

    expect(result.status).toBe("ready");
    expect(fileSystem.writes[0]?.content).toContain("runner-dispatching");
    expect(fileSystem.writes[0]?.content).toContain(receipt.receiptHash);
  });

  it("ledger replay rejects task attempt and run receipt transplants without projecting them", async () => {
    const taskId = "task_projection_rebuild_transplant_target";
    const runId = "run_projection_rebuild_transplant_target";
    const runType = "evidence-triage" as const;
    const attemptId = buildTaskAttemptId({ taskId, runType, retryGeneration: 0 });
    const identityCases = [
      {
        taskId: "task_projection_rebuild_transplant_source",
        attemptId,
        runId
      },
      {
        taskId,
        attemptId: buildTaskAttemptId({ taskId, runType, retryGeneration: 1 }),
        runId
      },
      {
        taskId,
        attemptId,
        runId: "run_projection_rebuild_transplant_source"
      }
    ];

    const validReceipt = promptBindingReceiptFixture({
      taskId,
      attemptId,
      runId,
      sourceApprovedPromptArtifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      boundPromptArtifactHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      generatedAt: "2026-07-15T14:00:03.000Z",
      approvalEventId: "evt_projection_rebuild_provider_approved",
      providerPostureHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      exactRunBindingHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      workspaceId: "ws_projection_rebuild",
      mountInstanceId: "mount_projection_rebuild"
    });
    const { schemaVersion: _schemaVersion, receiptHash: _receiptHash, ...receiptMaterial } = validReceipt;

    for (const receiptIdentity of identityCases) {
      const ledger = new InMemoryEventLedger();
      const receipt = promptBindingReceiptFixture({ ...receiptMaterial, ...receiptIdentity });
      await appendReplayTaskLifecycle(ledger, { taskId, runId, runType, attemptId });

      await expect.soft(appendReplayCheckpoint(ledger, {
        taskId,
        runId,
        runType,
        attemptId,
        checkpointKind: "prompt-bound",
        occurredAt: "2026-07-15T14:00:03.000Z",
        promptBindingReceipt: receipt
      })).rejects.toThrow(/current checkpoint facts/i);

      const fileSystem = new RecordingProjectionFs();
      const result = await rebuildProjection({
        layout,
        projectionName: "task-orchestrator",
        fileSystem,
        eventReader: { readAll: async () => await ledger.readAll() },
        builder: {
          projectionName: "task-orchestrator",
          build: async (events) => {
            const attempt = buildTaskOrchestratorProjection(events, { now: "2026-07-15T14:00:05.000Z" })
              .attempts.get(`${taskId}:${runType}:0`);
            return { "attempt.json": JSON.stringify({ latestPromptBindingReceipt: attempt?.latestPromptBindingReceipt }) };
          }
        },
        rebuildId: `rb_prompt_receipt_transplant_${receiptIdentity.taskId}_${receiptIdentity.attemptId}_${receiptIdentity.runId}`
      });

      expect.soft(result.status).toBe("ready");
      expect.soft(fileSystem.writes[0]?.content).not.toContain(receipt.receiptHash);
    }
  });

  it("ledger rebuild reproduces exact v1 v2 and receipt hashes", async () => {
    const fileSystem = new RecordingProjectionFs();
    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "prompt-binding-hashes.json": JSON.stringify({
          v1: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          v2: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          receipt: "sha256:3333333333333333333333333333333333333333333333333333333333333333"
        }) })
      },
      rebuildId: "rb_prompt_binding_hashes"
    });

    expect(result.status).toBe("ready");
    expect(fileSystem.writes[0]?.content).toContain("sha256:2222222222222222222222222222222222222222222222222222222222222222");
  });

  it("reports rebuild readiness with the readiness DTO mode and no artifact writes", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjectionReadiness({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] }
    });

    expect(result.command).toBe("projection rebuild-readiness");
    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      mode: "readiness",
      requestedProjections: ["graph"],
      inputLedger: { readable: true, eventCount: 0, highWaterMark: 0 },
      readiness: { ready: true },
      artifactOutputs: [],
      failures: [],
      wroteExpendableArtifactsOnly: true
    });
    expect(result.payload?.validationResults).toContainEqual(
      expect.objectContaining({ validationId: "validation_ledger_events", status: "pass" })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.removed).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(projectionRebuildDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks readiness for invalid ledger events without writing projection artifacts", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjectionReadiness({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [{ not: "a knowledge event" }] }
    });

    expect(result.status).toBe("blocked");
    expect(result.payload?.mode).toBe("readiness");
    expect(result.payload?.inputLedger).toEqual({ readable: true, eventCount: 1, highWaterMark: 1 });
    expect(result.payload?.readiness.ready).toBe(false);
    expect(result.payload?.validationResults).toContainEqual(
      expect.objectContaining({ validationId: "validation_ledger_events", status: "fail" })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_ledger_event_validation_failed",
        repairHint: expect.objectContaining({
          allowedNextCommands: ["diagnostics inspect"],
          requiresHumanApproval: true
        })
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        allowedNextCommands: ["diagnostics inspect"]
      })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.removed).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("blocks rebuild on ledger read failure with a human-approved canonical repair action", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: {
        readAll: async () => {
          throw new Error("private ledger read failure");
        }
      },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_ledger_failed"
    });

    expect(result.status).toBe("blocked");
    expect(result.payload?.mode).toBe("result");
    expect(result.payload?.inputLedger).toEqual({ readable: false, eventCount: 0, highWaterMark: 0 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_ledger_read_failed",
        repairHint: expect.objectContaining({
          allowedNextCommands: ["diagnostics inspect"],
          requiresHumanApproval: true
        })
      })
    );
    expect(result.proposedActions).toContainEqual(
      expect.objectContaining({
        kind: "append-repair-event-required",
        requiresHumanApproval: true,
        mutatesCanonicalState: true,
        allowedNextCommands: ["diagnostics inspect"]
      })
    );
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private ledger read failure");
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("writes only expendable temp artifacts and promotes after all writes succeed", async () => {
    const fileSystem = new RecordingProjectionFs();

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": JSON.stringify({ nodes: [] }) })
      },
      rebuildId: "rb_001"
    });

    expect(result.command).toBe("projection rebuild");
    expect(result.status).toBe("ready");
    expect(result.payload).toMatchObject({
      schemaVersion: workspaceOpsSchemaVersion,
      mode: "result",
      requestedProjections: ["graph"],
      readiness: { ready: true },
      failures: [],
      wroteExpendableArtifactsOnly: true
    });
    expect(result.payload?.validationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validationId: "validation_ledger_events", status: "pass" }),
        expect.objectContaining({ validationId: "validation_projection_output", status: "pass" })
      ])
    );
    expect(result.payload?.artifactOutputs).toEqual([
      expect.objectContaining({
        projectionName: "graph",
        artifactId: "artifact_graph_projection_json",
        byteCount: JSON.stringify({ nodes: [] }).length,
        expendable: true
      })
    ]);
    expect(result.payload?.artifactOutputs[0]?.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fileSystem.writes.map((write) => write.path)).toEqual([
      "/workspace/projections/.tmp-rb_001/projection.json"
    ]);
    expect(fileSystem.promoted).toEqual([
      { from: "/workspace/projections/.tmp-rb_001", to: "/workspace/projections/graph" }
    ]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
    expect(projectionRebuildDtoSchema.parse(result.payload)).toEqual(result.payload);
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("preserves prior artifacts when writes fail before promotion", async () => {
    const fileSystem = new RecordingProjectionFs({ failWrite: true });

    const result = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_002"
    });

    expect(result.status).toBe("degraded");
    expect(result.payload?.mode).toBe("result");
    expect(result.payload?.failures).toContainEqual(
      expect.objectContaining({
        failureId: "failure_projection_rebuild",
        retryable: true
      })
    );
    expect(fileSystem.promoted).toEqual([]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        diagnosticId: "diag_projection_rebuild_failed",
        category: "projection",
        durable: false
      })
    );
    expect(JSON.stringify(result)).not.toContain("private projection write failed");
    expect(workspaceOpsEnvelopeSchema.parse(result)).toEqual(result);
  });

  it("rejects traversal names before projection artifact mutation", async () => {
    const fileSystem = new RecordingProjectionFs();

    const unsafeProjection = await rebuildProjection({
      layout,
      projectionName: "../ledger",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "../ledger",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "rb_003"
    });

    const unsafeRebuild = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "projection.json": "{}" })
      },
      rebuildId: "../rb_004"
    });

    const unsafeArtifact = await rebuildProjection({
      layout,
      projectionName: "graph",
      fileSystem,
      eventReader: { readAll: async () => [] },
      builder: {
        projectionName: "graph",
        build: async () => ({ "../ledger/ontology.sqlite": "{}" })
      },
      rebuildId: "rb_005"
    });

    expect(unsafeProjection.status).toBe("blocked");
    expect(unsafeRebuild.status).toBe("blocked");
    expect(unsafeArtifact.status).toBe("degraded");
    expect(fileSystem.writes).toEqual([]);
    expect(fileSystem.promoted).toEqual([]);
    expect(fileSystem.removed).not.toContain("/workspace/projections/graph");
  });
});

async function appendReplayEvent(
  ledger: InMemoryEventLedger,
  input: {
    readonly type: string;
    readonly streamId: string;
    readonly occurredAt: string;
    readonly payload: Record<string, unknown>;
  }
): Promise<void> {
  await ledger.append({
    type: input.type,
    version: 1,
    streamId: input.streamId,
    context: {
      actor: { id: "actor_projection_rebuild", kind: "agent", label: "Projection rebuild" },
      occurredAt: input.occurredAt,
      correlationId: "corr_projection_rebuild",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: input.payload
  } as never);
}

async function appendReplayTaskLifecycle(
  ledger: InMemoryEventLedger,
  input: {
    readonly taskId: string;
    readonly runId: string;
    readonly runType: "evidence-triage";
    readonly attemptId: string;
  }
): Promise<void> {
  await appendReplayEvent(ledger, {
    type: "agent.task.created",
    streamId: `agent_task_${input.taskId}`,
    occurredAt: "2026-07-15T14:00:00.000Z",
    payload: {
      taskId: input.taskId,
      residentAgentId: "agent_default",
      title: "Projection receipt transplant",
      requestedBy: "actor_projection_rebuild",
      priority: "normal",
      sourceEventIds: ["evt_projection_rebuild_source"],
      inputArtifactHashes: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"]
    }
  });
  await appendReplayEvent(ledger, {
    type: "agent.task.status.changed",
    streamId: `agent_task_${input.taskId}`,
    occurredAt: "2026-07-15T14:00:01.000Z",
    payload: {
      taskId: input.taskId,
      status: "running",
      changedBy: "actor_projection_rebuild",
      reason: "Projection receipt transplant is running.",
      runId: input.runId
    }
  });
  await appendReplayEvent(ledger, {
    type: "agent.task.orchestration.claimed",
    streamId: taskOrchestrationStreamId(input.taskId, input.runType),
    occurredAt: "2026-07-15T14:00:02.000Z",
    payload: {
      taskId: input.taskId,
      runType: input.runType,
      attemptId: input.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      workerId: "actor_projection_rebuild",
      claimedAt: "2026-07-15T14:00:02.000Z",
      leaseExpiresAt: "2026-07-15T14:10:02.000Z",
      idempotencyKey: `task-orchestrator:${input.taskId}:${input.runType}:0:${input.attemptId}:claim`,
      selectedOrderingPosition: { priorityRank: 1, queuedAt: "2026-07-15T14:00:00.000Z", taskId: input.taskId, runType: input.runType, retryGeneration: 0 },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 4096,
        promptByteBudget: 4096,
        derivativeArtifactByteBudget: 4096,
        wallClockBudgetMs: 60000
      },
      causationEventId: "evt_projection_rebuild_status"
    }
  });
}

async function appendReplayCheckpoint(
  ledger: InMemoryEventLedger,
  input: {
    readonly taskId: string;
    readonly runId: string;
    readonly runType: "evidence-triage";
    readonly attemptId: string;
    readonly checkpointKind: "prompt-bound" | "runner-dispatching";
    readonly occurredAt: string;
    readonly promptBindingReceipt?: TaskOrchestratorPromptBindingReceiptV1 | undefined;
  }
): Promise<void> {
  await appendReplayEvent(ledger, {
    type: "agent.task.orchestration.checkpointed",
    streamId: taskOrchestrationStreamId(input.taskId, input.runType),
    occurredAt: input.occurredAt,
    payload: {
      taskId: input.taskId,
      runType: input.runType,
      attemptId: input.attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: input.checkpointKind,
      checkpointedAt: input.occurredAt,
      runId: input.runId,
      resumeIdempotencyKey: `task-orchestrator:${input.taskId}:${input.runType}:0:${input.attemptId}:resume-${input.checkpointKind}`,
      contextBindings: [{
        contextPackId: "evidence-summary.v1",
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        sizeBytes: 1,
        schemaId: "evidence-summary.v1",
        provenanceEventIds: ["evt_projection_rebuild_source"]
      }],
      sourceEventIds: input.checkpointKind === "prompt-bound"
        ? ["evt_projection_rebuild_provider_approved"]
        : ["evt_projection_rebuild_source"],
      inputArtifactHashes: input.checkpointKind === "prompt-bound" && input.promptBindingReceipt !== undefined
        ? [input.promptBindingReceipt.boundPromptArtifactHash]
        : ["sha256:1111111111111111111111111111111111111111111111111111111111111111"],
      safeNextActions: ["resume from durable projection state"],
      ...(input.promptBindingReceipt === undefined ? {} : {
        toolRequestIds: ["toolreq_projection_rebuild_provider_transfer"],
        approvalRequirement: {
          approvalClass: "provider-byte-transfer",
          previewHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
          approvalRequestEventId: "evt_projection_rebuild_provider_approved"
        },
        providerPosture: {
          providerId: "provider_projection_rebuild",
          modelFamily: "projection-model",
          adapterVersion: "projection-adapter.v1",
          capabilityIds: ["capability_projection_rebuild"],
          readinessState: "ready",
          approvalProfile: "provider-byte-transfer",
          dataHandlingPosture: "remote-provider-approved",
          selectionPolicyVersion: "projection-policy.v1",
          sensitivityClass: "provider-approved",
          requiredApprovalClass: "provider-byte-transfer"
        },
        promptArtifactHash: input.promptBindingReceipt.boundPromptArtifactHash,
        lockSnapshot: { activeLockIds: [], highWaterMark: 1 },
        promptBindingReceipt: input.promptBindingReceipt
      })
    }
  });
}
