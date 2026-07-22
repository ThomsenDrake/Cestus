import { describe, expect, it } from "vitest";
import {
  hashAgentTaskOrchestratorPromptBindingReceipt,
  validateKnowledgeEvent
} from "../../ontology/src/contracts.js";
import {
  buildTaskAttemptId,
  buildTaskOrchestrationClaimAppendInput,
  buildTaskOrchestratorIdempotencyKey,
  taskOrchestrationStreamId
} from "../src/task-orchestrator-events.js";
import type {
  TaskOrchestrationDerivedState,
  TaskOrchestratorPromptBindingReceiptV1
} from "../src/task-orchestrator-types.js";
import * as taskOrchestratorTypes from "../src/task-orchestrator-types.js";

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

  it("appends and reads one strict hash-only prompt-bound receipt", () => {
    const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    const receipt = promptBindingReceiptFixture({
      taskId: "task_001",
      attemptId: buildTaskAttemptId({ taskId: "task_001", runType: "evidence-triage", retryGeneration: 0 }),
      runId: "run_001",
      sourceApprovedPromptArtifactHash: hash,
      boundPromptArtifactHash: hash,
      generatedAt: "2026-07-10T14:00:00.000Z",
      approvalEventId: "evt_agent_tool_approved_provider_transfer",
      providerPostureHash: hash,
      exactRunBindingHash: hash,
      workspaceId: "ws_001",
      mountInstanceId: "mount_001",
    });
    const event = {
      id: "evt_agent_task_orchestration_prompt_bound",
      type: "agent.task.orchestration.checkpointed",
      version: 1,
      streamId: taskOrchestrationStreamId("task_001", "evidence-triage"),
      sequence: 1,
      context: {
        actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
        occurredAt: receipt.generatedAt,
        correlationId: "corr_task_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        taskId: "task_001",
        runType: "evidence-triage",
        attemptId: buildTaskAttemptId({ taskId: "task_001", runType: "evidence-triage", retryGeneration: 0 }),
        retryGeneration: 0,
        leaseClaimGeneration: 1,
        checkpointKind: "prompt-bound",
        checkpointedAt: receipt.generatedAt,
        runId: "run_001",
        resumeIdempotencyKey: "task-orchestrator:task_001:evidence-triage:0:prompt-bound",
        toolRequestIds: ["toolreq_provider_transfer"],
        approvalRequirement: { approvalClass: "provider-byte-transfer", previewHash: hash, approvalRequestEventId: receipt.approvalEventId },
        providerPosture: {
          providerId: "provider_test",
          modelFamily: "test-model",
          adapterVersion: "test-adapter.v1",
          capabilityIds: ["capability_test"],
          readinessState: "ready",
          approvalProfile: "provider-byte-transfer",
          dataHandlingPosture: "remote-provider-approved",
          selectionPolicyVersion: "policy.v1",
          sensitivityClass: "provider-approved",
          requiredApprovalClass: "provider-byte-transfer"
        },
        contextBindings: [{ contextPackId: "evidence-summary.v1", contentHash: hash, sizeBytes: 1, schemaId: "evidence-summary.v1", provenanceEventIds: [receipt.approvalEventId] }],
        sourceEventIds: [receipt.approvalEventId],
        inputArtifactHashes: [hash],
        promptArtifactHash: hash,
        lockSnapshot: { activeLockIds: [], highWaterMark: 1 },
        promptBindingReceipt: receipt,
        safeNextActions: ["continue after exact prompt binding"]
      }
    };

    expect(validateKnowledgeEvent(event).success).toBe(true);
  });

  it("exposes no generic production prompt binding receipt constructor", () => {
    expect("buildTaskOrchestratorPromptBindingReceipt" in taskOrchestratorTypes).toBe(false);
    expect("buildTaskOrchestratorPromptBindingReceiptForCheckpoint" in taskOrchestratorTypes).toBe(false);
  });

  it("rejects forged receipts and receipts outside prompt-bound checkpoints", () => {
    const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    const receipt = promptBindingReceiptFixture({
      taskId: "task_001",
      attemptId: buildTaskAttemptId({ taskId: "task_001", runType: "evidence-triage", retryGeneration: 0 }),
      runId: "run_001",
      sourceApprovedPromptArtifactHash: hash,
      boundPromptArtifactHash: hash,
      generatedAt: "2026-07-10T14:00:00.000Z",
      approvalEventId: "evt_agent_tool_approved_provider_transfer",
      providerPostureHash: hash,
      exactRunBindingHash: hash,
      workspaceId: "ws_001",
      mountInstanceId: "mount_001"
    });
    const payload = {
      taskId: "task_001",
      runType: "evidence-triage",
      attemptId: buildTaskAttemptId({ taskId: "task_001", runType: "evidence-triage", retryGeneration: 0 }),
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      checkpointKind: "prompt-bound",
      checkpointedAt: receipt.generatedAt,
      runId: "run_001",
      resumeIdempotencyKey: "task-orchestrator:task_001:evidence-triage:0:prompt-bound",
      toolRequestIds: ["toolreq_provider_transfer"],
      approvalRequirement: { approvalClass: "provider-byte-transfer", previewHash: hash, approvalRequestEventId: receipt.approvalEventId },
      providerPosture: {
        providerId: "provider_test", modelFamily: "test-model", adapterVersion: "test-adapter.v1",
        capabilityIds: ["capability_test"], readinessState: "ready", approvalProfile: "provider-byte-transfer",
        dataHandlingPosture: "remote-provider-approved", selectionPolicyVersion: "policy.v1",
        sensitivityClass: "provider-approved", requiredApprovalClass: "provider-byte-transfer"
      },
      contextBindings: [{ contextPackId: "evidence-summary.v1", contentHash: hash, sizeBytes: 1, schemaId: "evidence-summary.v1", provenanceEventIds: [receipt.approvalEventId] }],
      sourceEventIds: [receipt.approvalEventId],
      inputArtifactHashes: [hash],
      promptArtifactHash: hash,
      lockSnapshot: { activeLockIds: [], highWaterMark: 1 },
      promptBindingReceipt: receipt,
      safeNextActions: ["continue after exact prompt binding"]
    } as const;
    const event = {
      id: "evt_agent_task_orchestration_prompt_bound_forged",
      type: "agent.task.orchestration.checkpointed",
      version: 1,
      streamId: taskOrchestrationStreamId("task_001", "evidence-triage"),
      sequence: 1,
      context: {
        actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
        occurredAt: receipt.generatedAt,
        correlationId: "corr_task_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload
    };

    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...payload, promptBindingReceipt: { ...receipt, receiptHash: hash.replace("1", "2") } }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...event,
      payload: { ...payload, checkpointKind: "planning", promptBindingReceipt: receipt }
    }).success).toBe(false);
  });
});
