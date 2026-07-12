import { describe, expect, it, vi } from "vitest";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createProviderRegistry } from "../src/provider-registry.js";
import { buildContextPackRef } from "../src/context-packs.js";
import { buildPromptArtifact, promptArtifactAuditMetadata } from "../src/prompt-artifacts.js";
import {
  createTaskOrchestrator,
  type TaskOrchestratorBudgets
} from "../src/task-orchestrator.js";
import {
  createTaskOrchestratorProviderApprovalAdapter,
  type TaskOrchestratorProviderApprovalProof
} from "../src/task-orchestrator-approval.js";
import { taskOrchestrationStreamId } from "../src/task-orchestrator-events.js";
import { createAgentToolGateway, hashAgentToolPreview } from "../src/tool-gateway.js";

const now = "2026-07-12T10:00:00.000Z";
const runType = "evidence-triage";
const taskId = "task_task5_approval";
const runId = "run_task5_approval";
const toolRequestId = "toolreq_task5_provider_transfer";
const sourceEventId = "evt_task5_provider_source";
const contextRef = buildContextPackRef({
  contextPackId: "evidence-summary.v1",
  version: 1,
  generatedAt: now,
  payload: { taskId, sourceEventId },
  safeSummary: "Task 5 provider transfer context.",
  provenanceRefs: [sourceEventId],
  sourceEventIds: [sourceEventId],
  artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
});
const promptArtifact = buildPromptArtifact({
  promptTemplateId: "task5-provider-transfer",
  promptTemplateVersion: 1,
  generatedAt: now,
  runType: "ontology-bootstrap",
  safetyClass: "provider-approved",
  transferApprovalClass: "provider-byte-transfer",
  contextPackRefs: [contextRef],
  text: "Transfer only the reviewed provider bytes.",
  safeSummary: "Task 5 provider transfer prompt."
});
const promptHash = promptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
const contextHash = contextRef.contentHash as `sha256:${string}`;

const orchestratorActor: ActorRef = {
  id: "actor_task5_orchestrator",
  kind: "agent",
  label: "Task 5 orchestrator"
};
const humanActor: ActorRef = {
  id: "actor_task5_reviewer",
  kind: "human",
  label: "Task 5 reviewer"
};
const residentSelfApprovalActor: ActorRef = {
  id: "agent_default",
  kind: "human",
  label: "Forged resident self approval"
};

describe("task orchestrator provider approval", () => {
  it("records provider posture durably before approval wait", async () => {
    const prepared = await prepare();

    await prepared.orchestrator.tick();

    const stream = await prepared.ledger.readStream(taskOrchestrationStreamId(taskId, runType));
    const checkpoint = stream.find((event): event is KnowledgeEventOf<"agent.task.orchestration.checkpointed"> =>
      event.type === "agent.task.orchestration.checkpointed"
    );
    expect(checkpoint?.payload).toMatchObject({
      checkpointKind: "approval-wait",
      runId,
      toolRequestIds: [toolRequestId],
      approvalRequirement: {
        approvalClass: "provider-byte-transfer",
        approvalRequestEventId: prepared.request.id
      },
      providerPosture: {
        providerId: "provider_fake_remote",
        modelFamily: "fake-remote",
        selectionPolicyVersion: "provider-policy.v1",
        capabilityIds: [
          "capability_provider_provider_fake_remote",
          "capability_model_fake-remote",
          "capability_adapter_agent-provider-auth.v1"
        ]
      },
      promptArtifactHash: promptHash,
      contextBindings: [expect.objectContaining({ contentHash: contextHash })]
    });
  });

  it("requires exact provider byte transfer approval before model dispatch", async () => {
    const prepared = await prepare();

    const summary = await prepared.orchestrator.tick();

    expect(summary.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("releases worker lease while waiting for provider approval", async () => {
    const prepared = await prepare();

    const summary = await prepared.orchestrator.tick();

    expect(summary.released).toContainEqual(expect.objectContaining({
      taskId,
      releaseReason: "approval-suspended"
    }));
    expect(summary.sideEffectsScheduled).toEqual([]);
  });

  it("reclaims suspended approval checkpoint with same attempt id after valid approval", async () => {
    const prepared = await prepare();
    const waiting = await prepared.orchestrator.tick();
    const originalAttemptId = waiting.claimed[0]?.attemptId;
    await appendContextReadyCheckpoint(prepared.ledger, originalAttemptId!);
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve the exact remote provider byte-transfer preview."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toContainEqual(expect.objectContaining({
      attemptId: originalAttemptId,
      leaseClaimGeneration: 2
    }));
    expect(resumed.approvalVerified).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(resumed.sideEffectsScheduled).toEqual([
      `runner-dispatch:${taskId}:${originalAttemptId}`
    ]);
    expect(prepared.providerCall).toHaveBeenCalledOnce();
  });

  it("does not reclaim an already active approved attempt on a later tick", async () => {
    const prepared = await prepare();
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve the exact remote provider byte-transfer preview."
    });

    await prepared.orchestrator.tick();
    const repeated = await prepared.orchestrator.tick();

    expect(repeated.reclaimed).toEqual([]);
    const stream = await prepared.ledger.readStream(taskOrchestrationStreamId(taskId, runType));
    expect(stream.filter((event) => event.type === "agent.task.orchestration.claimed")).toHaveLength(2);
  });

  it("releases an approval-wait checkpoint recovered after interruption before reclaiming", async () => {
    const prepared = await prepare({ interruptApprovalRelease: true });

    await expect(prepared.orchestrator.tick()).rejects.toThrow(/interrupted approval release/i);
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve the exact remote provider byte-transfer preview."
    });
    prepared.resumeApprovalRelease();

    const recovered = await prepared.orchestrator.tick();

    expect(recovered.released).toContainEqual(expect.objectContaining({
      taskId,
      releaseReason: "approval-suspended"
    }));
    expect(recovered.reclaimed).toEqual([]);
  });

  it("rejects a valid approval proof reused for a different task", async () => {
    const prepared = await prepare();
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only the original task's provider transfer."
    });

    const inspection = await prepared.approvalAdapter.inspect({
      ledger: prepared.ledger,
      taskId: "task_task5_different",
      residentAgentId: "agent_default",
      providerId: "provider_fake_remote",
      modelId: "fake-remote",
      proof: prepared.proof
    });

    expect(inspection.status).toBe("waiting");
  });

  it("rejects approval events whose human actor does not match approvedBy", async () => {
    const prepared = await prepare();
    await prepared.orchestrator.tick();
    await appendMixedIdentityApproval(prepared.ledger, prepared.request, prepared.previewHash);

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
    expect(resumed.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("rejects approval-required proofs that supply a ready provider snapshot", async () => {
    const prepared = await prepare({ proofReadinessState: "ready" });
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only the exact remote provider byte-transfer preview."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
    expect(resumed.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("rejects provider domain approval events whose human actor does not match approvedBy", async () => {
    const prepared = await prepare({ domainApprovalActor: residentSelfApprovalActor });
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only the exact remote provider byte-transfer preview."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
    expect(resumed.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("accepts landed provider transfer previews when provider capability binds the selected model", async () => {
    const prepared = await prepare({ omitPreviewModelId: true });
    const waiting = await prepared.orchestrator.tick();
    const originalAttemptId = waiting.claimed[0]?.attemptId;
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only the complete provider transfer preview."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toContainEqual(expect.objectContaining({
      attemptId: originalAttemptId,
      leaseClaimGeneration: 2
    }));
    expect(resumed.approvalVerified).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
  });

  it("accepts mixed prompt provenance when typed source event ids are present", async () => {
    const ledger = new InMemoryEventLedger();
    await queueTaskAndRequestApproval(ledger);
    const providerApproval = await appendProviderApproval(ledger);
    const mixedContextRef = buildContextPackRef({
      contextPackId: "evidence-summary.v1",
      version: 1,
      generatedAt: now,
      payload: { taskId, sourceEventId },
      safeSummary: "Task 5 provider transfer context with mixed provenance.",
      provenanceRefs: [`event:${sourceEventId}`, sourceEventId, "ev_task5_provider_source", contextHash],
      sourceEventIds: [sourceEventId],
      artifactHashes: [contextHash]
    });
    const mixedPromptArtifact = buildPromptArtifact({
      promptTemplateId: "task5-provider-transfer",
      promptTemplateVersion: 1,
      generatedAt: now,
      runType: "ontology-bootstrap",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [mixedContextRef],
      text: "Transfer only the reviewed provider bytes.",
      safeSummary: "Task 5 provider transfer prompt."
    });
    const mixedPromptHash = mixedPromptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
    const mixedContextHash = mixedContextRef.contentHash as `sha256:${string}`;
    const preview = {
      ...previewFor(undefined),
      artifactHashes: [mixedContextHash, mixedPromptHash]
    };
    const previewHash = hashAgentToolPreview(preview);
    const gateway = createAgentToolGateway({ ledger, actor: orchestratorActor, now: () => now });
    const request = await gateway.requestTool({
      toolRequestId,
      residentAgentId: "agent_default",
      taskId,
      runId,
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      preview,
      inputArtifactHashes: [mixedContextHash, mixedPromptHash]
    });
    await gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: previewHash,
      actor: humanActor,
      rationale: "Approve only this provider transfer preview."
    });
    const proof = providerProof(
      previewHash,
      request.id,
      undefined,
      providerApproval.id,
      false,
      "requires-byte-transfer-approval",
      mixedPromptHash,
      [mixedContextHash],
      undefined
    );
    const adapter = createTaskOrchestratorProviderApprovalAdapter({
      rebuildCurrentPreview: async () => ({
        preview,
        sourceEventIds: [sourceEventId],
        inputArtifactHashes: [mixedContextHash, mixedPromptHash],
        provenanceRefs: [],
        activeLocks: [],
        freshnessChecks: []
      })
    });

    const inspection = await adapter.inspect({
      ledger,
      taskId,
      residentAgentId: "agent_default",
      providerId: "provider_fake_remote",
      modelId: "fake-remote",
      proof: {
        ...proof,
        promptArtifact: mixedPromptArtifact,
        currentPreviewInput: {
          ...proof.currentPreviewInput,
          approvedPromptArtifact: promptArtifactAuditMetadata(mixedPromptArtifact)
        }
      }
    });

    expect(inspection).toMatchObject({ status: "approved" });
  });

  it("records prompt envelope hashes instead of proof side fields in approval checkpoints", async () => {
    const prepared = await prepare({ proofPromptHash: changedHash("9") });

    await prepared.orchestrator.tick();

    const stream = await prepared.ledger.readStream(taskOrchestrationStreamId(taskId, runType));
    const checkpoint = stream.find((event): event is KnowledgeEventOf<"agent.task.orchestration.checkpointed"> =>
      event.type === "agent.task.orchestration.checkpointed"
    );
    expect(checkpoint?.payload.promptArtifactHash).toBe(promptHash);
    expect(checkpoint?.payload.contextBindings.map((binding) => binding.contentHash)).toEqual([contextHash]);
  });

  it("rejects hash-only proof fields that differ from the prompt envelope", async () => {
    for (const prepared of [
      await prepare({ proofPromptHash: changedHash("8") }),
      await prepare({ proofContextBindingHashes: [changedHash("7")] })
    ]) {
      await prepared.orchestrator.tick();
      await prepared.gateway.approveTool({
        toolRequestId,
        approvedPreviewHash: prepared.previewHash,
        actor: humanActor,
        rationale: "Approve only the exact remote provider byte-transfer preview."
      });

      const inspection = await prepared.approvalAdapter.inspect({
        ledger: prepared.ledger,
        taskId,
        residentAgentId: "agent_default",
        providerId: "provider_fake_remote",
        modelId: "fake-remote",
        proof: prepared.proof
      });

    expect(inspection.status).toBe("waiting");
    }
  });

  it("keeps malformed prompt envelopes suspended without losing the worker lease release", async () => {
    for (const malformedPromptArtifact of [
      "empty",
      "invalid-hash",
      "negative-size",
      "accessor-manifest",
      "accessor-ref",
      "accessor-ref-index",
      "accessor-provenance-index",
      "sparse-provenance"
    ] as const) {
      const prepared = await prepare({ malformedPromptArtifact });

      const waiting = await prepared.orchestrator.tick();

      expect(waiting.approvalWaiting, malformedPromptArtifact).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
      expect(waiting.released, malformedPromptArtifact).toContainEqual(expect.objectContaining({
        taskId,
        releaseReason: "approval-suspended"
      }));

      await prepared.gateway.approveTool({
        toolRequestId,
        approvedPreviewHash: prepared.previewHash,
        actor: humanActor,
        rationale: "Approve only the exact remote provider byte-transfer preview."
      });
      const resumed = await prepared.orchestrator.tick();

      expect(resumed.reclaimed, malformedPromptArtifact).toEqual([]);
      expect(resumed.approvalWaiting, malformedPromptArtifact).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    }
  });

  it("rejects approval when runner consume-time proof bindings are omitted", async () => {
    const prepared = await prepare({ omitRunnerProofBindings: true });
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only an invocation with complete runner bindings."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
  });

  it("requires approvalRequirementId to be the durable tool request event id", async () => {
    const prepared = await prepare({ approvalRequirementId: "evt_task5_wrong_tool_request" });
    await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve only the durable request event."
    });

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
  });

  it("rejects approval proof created by resident agent actor", async () => {
    const prepared = await prepare();
    await prepared.orchestrator.tick();
    await appendForgedApproval(prepared.ledger, prepared.request, residentSelfApprovalActor, prepared.previewHash);

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
    expect(resumed.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("rejects approval proof for different provider model prompt hash or payload hash set", async () => {
    for (const mismatch of ["provider", "model", "prompt", "context"] as const) {
      const prepared = await prepare({ mismatch });
      await prepared.orchestrator.tick();
      await prepared.gateway.approveTool({
        toolRequestId,
        approvedPreviewHash: prepared.previewHash,
        actor: humanActor,
        rationale: "Approve only this provider transfer preview."
      });

      const resumed = await prepared.orchestrator.tick();
      expect(resumed.reclaimed, mismatch).toEqual([]);
      expect(prepared.providerCall, mismatch).not.toHaveBeenCalled();
    }
  });

  it("does not call provider while approval is missing", async () => {
    const prepared = await prepare();

    await prepared.orchestrator.tick();

    expect(prepared.providerCall).not.toHaveBeenCalled();
  });

  it("does not call provider after task cancellation races with approval", async () => {
    const prepared = await prepare();
    const waiting = await prepared.orchestrator.tick();
    await prepared.gateway.approveTool({
      toolRequestId,
      approvedPreviewHash: prepared.previewHash,
      actor: humanActor,
      rationale: "Approve the exact provider transfer before cancellation wins."
    });
    await appendTaskStatus(prepared.ledger, "canceled", waiting.released[0]!.releaseEventId, 3);

    const resumed = await prepared.orchestrator.tick();

    expect(resumed.reclaimed).toEqual([]);
    expect(prepared.providerCall).not.toHaveBeenCalled();
  });
});

async function prepare(input: {
  readonly mismatch?: "provider" | "model" | "prompt" | "context";
  readonly interruptApprovalRelease?: boolean;
  readonly omitPreviewModelId?: boolean;
  readonly omitRunnerProofBindings?: boolean;
  readonly approvalRequirementId?: string;
  readonly proofReadinessState?: "ready" | "requires-byte-transfer-approval";
  readonly proofPromptHash?: `sha256:${string}`;
  readonly proofContextBindingHashes?: readonly `sha256:${string}`[];
  readonly domainApprovalActor?: ActorRef;
  readonly malformedPromptArtifact?: MalformedPromptArtifactKind;
} = {}) {
  const ledger = new InMemoryEventLedger();
  const request = await queueTaskAndRequestApproval(ledger);
  const providerApproval = await appendProviderApproval(ledger, input.domainApprovalActor);
  const preview = previewFor(input.mismatch, input.omitPreviewModelId);
  const previewHash = hashAgentToolPreview(preview);
  const gateway = createAgentToolGateway({ ledger, actor: orchestratorActor, now: () => now });
  const requestEvent = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId,
    runId,
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    preview,
    inputArtifactHashes: [contextHash, promptHash]
  });
  const providerCall = vi.fn();
  const proof = providerProof(
    previewHash,
    input.approvalRequirementId ?? requestEvent.id,
    input.mismatch,
    providerApproval.id,
    input.omitRunnerProofBindings === true,
    input.proofReadinessState ?? "requires-byte-transfer-approval",
    input.proofPromptHash,
    input.proofContextBindingHashes,
    input.malformedPromptArtifact
  );
  const approvalAdapter = createTaskOrchestratorProviderApprovalAdapter({
    rebuildCurrentPreview: async () => ({
      preview,
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: input.mismatch === "prompt" ? [contextHash, changedHash("c")] :
        input.mismatch === "context" ? [changedHash("d"), promptHash] : [contextHash, promptHash],
      provenanceRefs: [],
      activeLocks: [],
      freshnessChecks: []
    })
  });
  let releaseInterrupted = input.interruptApprovalRelease === true;
  const orchestratorLedger: EventLedger = new Proxy(ledger, {
    get(target, property) {
      if (property === "append") {
        return async (event: AppendableKnowledgeEvent, options: { readonly expectedNextSequence: number }) => {
          if (releaseInterrupted && event.type === "agent.task.orchestration.released") {
            throw new Error("Interrupted approval release.");
          }
          return await target.append(event, options);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const orchestrator = createTaskOrchestrator({
    ledger: orchestratorLedger,
    now: () => now,
    actor: orchestratorActor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      providerPolicy: {
        registry: createProviderRegistry.withDefaultsForTest(),
        task: {
          modality: "text",
          structuredOutputRequired: true,
          sensitivity: "workspace-safe",
          requiresRemoteHarness: false
        },
        readinessByProviderId: { provider_fake_remote: "requires-byte-transfer-approval" },
        selectionPolicy: { allowRemoteByteTransfer: true, preferredCostPolicy: "metered-api" },
        selectionPolicyVersion: "provider-policy.v1",
        approval: proof
      }
    },
    concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { [runType]: 1 } },
    budgets: budgets(),
    workflowRegistry: {},
    contextRegistry: {},
    promptRendererRegistry: {},
    providerRegistry: {},
    approvalReader: approvalAdapter,
    runnerRegistry: { dispatch: providerCall },
    handoffCapability: {}
  });
  return {
    ledger,
    request: requestEvent,
    gateway,
    orchestrator,
    previewHash,
    providerCall,
    proof,
    approvalAdapter,
    resumeApprovalRelease: () => { releaseInterrupted = false; }
  };
}

function providerProof(
  approvedPreviewHash: `sha256:${string}`,
  approvalRequirementId: string,
  mismatch: "provider" | "model" | "prompt" | "context" | undefined,
  providerApprovalEventId: string,
  omitRunnerProofBindings: boolean,
  readinessState: "ready" | "requires-byte-transfer-approval",
  proofPromptHashOverride: `sha256:${string}` | undefined,
  proofContextBindingHashesOverride: readonly `sha256:${string}`[] | undefined,
  malformedPromptArtifact: MalformedPromptArtifactKind | undefined
): TaskOrchestratorProviderApprovalProof {
  const proofPromptHash = proofPromptHashOverride ?? (mismatch === "prompt" ? changedHash("e") : promptHash);
  const proofContextBindingHashes = proofContextBindingHashesOverride ??
    [mismatch === "context" ? changedHash("f") : contextHash];
  const providerReadiness = {
    cards: [{
      providerId: "provider_fake_remote",
      label: "Fake remote provider",
      backendKind: "openai-compatible-api" as const,
      capabilitySummary: ["text"],
      credentialKindSummary: ["api-key-bearer" as const],
      state: readinessState,
      requiredApprovalClass: readinessState === "ready" ? "none" as const : "provider-byte-transfer" as const,
      credentialHealth: "local-binding-healthy" as const,
      dataHandlingPosture: readinessState === "ready" ? "local-only" as const : "remote-prompt-byte-transfer-gated" as const,
      credentialRefId: "agent_credref_task5_remote",
      safeActionIds: []
    }]
  };
  const credentialRef = {
    credentialRefId: "agent_credref_task5_remote",
    providerId: "provider_fake_remote",
    kind: "api-key-bearer" as const,
    safeLabel: "Task 5 remote access",
    authorizedBy: humanActor.id,
    authorizedAt: now,
  };
  const proof = {
    runId,
    toolRequestId,
    approvalRequirementId,
    approvedPreviewHash,
    promptArtifactHash: proofPromptHash,
    contextBindingHashes: proofContextBindingHashes,
    credentialRef,
    providerReadiness,
    promptArtifact: malformedPromptArtifact === undefined ? promptArtifact : malformedPromptArtifactFor(malformedPromptArtifact),
    currentPreviewInput: {
      approvedProviderCapability: {
        providerId: mismatch === "provider" ? "provider_fake_local" : "provider_fake_remote",
        modelFamilies: [mismatch === "model" ? "different-model" : "fake-remote"],
        adapterVersion: "agent-provider-auth.v1"
      },
      approvedProviderReadiness: providerReadiness.cards[0],
      credentialRefId: credentialRef.credentialRefId,
      reviewer: humanActor,
      approvalEventId: providerApprovalEventId,
      providerJobId: "provider_task5_remote",
      sourceCollectionId: "src_task5_remote",
      importBatchId: "imp_task5_remote",
      approvedPromptArtifact: promptArtifactAuditMetadata(promptArtifact),
      toolRequestId,
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      runId,
      taskId,
      residentAgentId: "agent_default",
      providerId: "provider_fake_remote",
      modelId: "fake-remote",
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [contextHash, promptHash],
      activeLocks: []
    } as never
  } satisfies TaskOrchestratorProviderApprovalProof;
  return omitRunnerProofBindings ? {
    ...proof,
    credentialRef: undefined,
    providerReadiness: undefined,
    promptArtifact: undefined
  } as never : proof;
}

function previewFor(
  mismatch: "provider" | "model" | "prompt" | "context" | undefined,
  omitModelId = false
) {
  return {
    summary: "Transfer the exact reviewed provider bytes.",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId,
    taskId,
    residentAgentId: "agent_default",
    providerId: mismatch === "provider" ? "provider_fake_local" : "provider_fake_remote",
    ...(omitModelId ? {} : { modelId: mismatch === "model" ? "different-model" : "fake-remote" }),
    relatedEventIds: [sourceEventId],
    artifactHashes: [contextHash, promptHash]
  };
}

async function queueTaskAndRequestApproval(ledger: EventLedger) {
  const created = await ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context("evt_task5_created"),
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: "Task 5 provider approval",
      requestedBy: humanActor.id,
      priority: "urgent",
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [contextHash]
    }
  }, { expectedNextSequence: 1 });
  await appendTaskStatus(ledger, "queued", created.id, 2);
  return created;
}

async function appendTaskStatus(
  ledger: EventLedger,
  status: KnowledgeEventOf<"agent.task.status.changed">["payload"]["status"],
  causationId: string,
  expectedNextSequence: number
) {
  return await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context(causationId),
    payload: {
      taskId,
      status,
      changedBy: orchestratorActor.id,
      reason: `Task is ${status}.`
    }
  }, { expectedNextSequence });
}

async function appendContextReadyCheckpoint(
  ledger: EventLedger,
  attemptId: string
) {
  const streamId = taskOrchestrationStreamId(taskId, runType);
  const stream = await ledger.readStream(streamId);
  const claim = stream.find((event): event is KnowledgeEventOf<"agent.task.orchestration.claimed"> =>
    event.type === "agent.task.orchestration.claimed" &&
    event.payload.attemptId === attemptId
  );
  if (claim === undefined) {
    throw new Error("Task 5 approval fixture could not find claimed attempt for context-ready proof.");
  }
  return await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: context(claim.id),
    payload: {
      taskId,
      runType,
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: claim.payload.leaseClaimGeneration,
      checkpointKind: "context-ready",
      checkpointedAt: now,
      resumeIdempotencyKey: `task-orchestrator:${taskId}:${runType}:0:${attemptId}:task5-context-ready`,
      contextBindings: [{
        contextPackId: contextRef.contextPackId,
        contentHash: contextHash,
        sizeBytes: contextRef.sizeBytes,
        schemaId: contextRef.contextPackId,
        provenanceEventIds: [...contextRef.provenanceRefs]
      }],
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [contextHash, promptHash],
      promptArtifactHash: promptHash,
      safeNextActions: ["continue to exact provider byte-transfer approval"]
    }
  }, { expectedNextSequence: stream.length + 1 }) as KnowledgeEventOf<"agent.task.orchestration.checkpointed">;
}

async function appendForgedApproval(
  ledger: EventLedger,
  request: KnowledgeEventOf<"agent.tool.requested">,
  actor: ActorRef,
  approvedPreviewHash: string
) {
  const event: AppendableKnowledgeEvent<"agent.tool.approved"> = {
    type: "agent.tool.approved",
    version: 1,
    streamId: `agent_tool_request_${toolRequestId}`,
    context: {
      ...context(request.id),
      actor
    },
    payload: {
      toolRequestId,
      approvedBy: actor.id,
      approvedPreviewHash,
      approvalClass: "provider-byte-transfer",
      rationale: "Forged resident approval.",
      approvedAt: now
    }
  };
  await ledger.append(event, { expectedNextSequence: 2 });
}

async function appendMixedIdentityApproval(
  ledger: EventLedger,
  request: KnowledgeEventOf<"agent.tool.requested">,
  approvedPreviewHash: string
) {
  const event: AppendableKnowledgeEvent<"agent.tool.approved"> = {
    type: "agent.tool.approved",
    version: 1,
    streamId: `agent_tool_request_${toolRequestId}`,
    context: {
      ...context(request.id),
      actor: residentSelfApprovalActor
    },
    payload: {
      toolRequestId,
      approvedBy: humanActor.id,
      approvedPreviewHash,
      approvalClass: "provider-byte-transfer",
      rationale: "Forged mismatched approval actor.",
      approvedAt: now
    }
  };
  await ledger.append(event, { expectedNextSequence: 2 });
}

async function appendProviderApproval(ledger: EventLedger, actor: ActorRef = humanActor) {
  return await ledger.append({
    type: "ingestion.provider.approved",
    version: 1,
    streamId: "ingestion_provider_src_task5_remote_imp_task5_remote_provider_task5_remote",
    context: { ...context(sourceEventId), actor },
    payload: {
      providerJobId: "provider_task5_remote",
      sourceCollectionId: "src_task5_remote",
      importBatchId: "imp_task5_remote",
      provider: { name: "provider_fake_remote", version: "agent-provider-auth.v1" },
      approvedBy: humanActor.id,
      approvedAt: now,
      eligibleMediaTypes: ["text/plain"],
      maxBytesPerFile: 4096,
      policy: "send-all-technically-eligible"
    }
  }, { expectedNextSequence: 1 });
}

function context(causationId: string) {
  return {
    actor: orchestratorActor,
    occurredAt: now,
    causationId,
    correlationId: "corr_task5",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function budgets(): TaskOrchestratorBudgets {
  return {
    maxProviderInvocations: 1,
    remainingProviderInvocations: 1,
    contextByteBudget: 4096,
    promptByteBudget: 4096,
    derivativeArtifactByteBudget: 4096,
    wallClockBudgetMs: 60_000
  };
}

function changedHash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

type MalformedPromptArtifactKind =
  | "empty"
  | "invalid-hash"
  | "negative-size"
  | "accessor-manifest"
  | "accessor-ref"
  | "accessor-ref-index"
  | "accessor-provenance-index"
  | "sparse-provenance";

function malformedPromptArtifactFor(kind: MalformedPromptArtifactKind): never {
  if (kind === "empty") {
    return {} as never;
  }
  if (kind === "accessor-manifest") {
    const artifact = {};
    Object.defineProperty(artifact, "manifest", {
      enumerable: true,
      get() {
        throw new Error("Accessor-backed manifest must not be read.");
      }
    });
    return artifact as never;
  }
  const ref = {
    ...promptArtifact.manifest.contextPackRefs[0],
    ...(kind === "negative-size" ? { sizeBytes: -1 } : {}),
    ...(kind === "accessor-provenance-index" ? { provenanceRefs: accessorBackedProvenanceArray() } : {}),
    ...(kind === "sparse-provenance" ? { provenanceRefs: sparseProvenanceArray() } : {})
  };
  const contextPackRefs = kind === "accessor-ref"
    ? [accessorBackedContextRef()]
    : kind === "accessor-ref-index"
      ? accessorBackedContextRefArray()
    : [ref];
  return {
    ...promptArtifact,
    manifest: {
      ...promptArtifact.manifest,
      inputArtifactHash: kind === "invalid-hash" ? "sha256:not-a-real-hash" : promptArtifact.manifest.inputArtifactHash,
      contextPackRefs
    }
  } as never;
}

function accessorBackedContextRef(): never {
  const ref = {};
  Object.defineProperty(ref, "contextPackId", {
    enumerable: true,
    get() {
      throw new Error("Accessor-backed context ref must not be read.");
    }
  });
  return ref as never;
}

function accessorBackedContextRefArray(): never {
  const refs: unknown[] = [];
  Object.defineProperty(refs, "0", {
    enumerable: true,
    get() {
      throw new Error("Accessor-backed context ref array index must not be read.");
    }
  });
  Object.defineProperty(refs, "length", { value: 1 });
  return refs as never;
}

function accessorBackedProvenanceArray(): never {
  const refs: unknown[] = [];
  Object.defineProperty(refs, "0", {
    enumerable: true,
    get() {
      throw new Error("Accessor-backed provenance index must not be read.");
    }
  });
  return refs as never;
}

function sparseProvenanceArray(): never {
  const refs: unknown[] = [];
  refs.length = 1;
  return refs as never;
}
