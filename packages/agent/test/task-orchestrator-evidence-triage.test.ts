import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  type ContextPackPayloadParser,
  type ContextPackRegistry
} from "../src/context-packs.js";
import { buildPromptArtifact, promptArtifactAuditMetadata } from "../src/prompt-artifacts.js";
import { renderProductionSpecialistPrompt } from "../src/production-specialist-prompts.js";
import { createProviderRegistry } from "../src/provider-registry.js";
import { createAgentRuntime } from "../src/runtime.js";
import { buildSpecialistHandoffMaterial } from "../src/specialist-handoff-manifest.js";
import {
  type SpecialistHandoffManifestStore
} from "../src/specialist-runner-kernel.js";
import { createAgentToolGateway, hashAgentToolPreview } from "../src/tool-gateway.js";
import {
  createTaskOrchestrator,
  createTaskOrchestratorHandoffCapability,
  type TaskOrchestratorRunnerRegistry
} from "../src/task-orchestrator.js";
import { createTaskOrchestratorProviderApprovalAdapter, type TaskOrchestratorProviderApprovalProof } from "../src/task-orchestrator-approval.js";
import { buildTaskOrchestratorProjection } from "../src/task-orchestrator-projection.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";
import type { ProductionRunScope } from "../src/production-specialist-registration-metadata.js";

const runType = "evidence-triage" as const;
const now = "2026-07-12T07:00:00.000Z";
const taskId = "task_evidence_triage_vertical";
const runId = "run_evidence_triage_vertical";
const toolRequestId = "toolreq_evidence_triage_vertical_provider_transfer";
const sentinel = "resolved-payload-sentinel-task8";
const humanActor: ActorRef = { id: "actor_task8_reviewer", kind: "human", label: "Task 8 reviewer" };
const orchestratorActor: ActorRef = { id: "actor_task8_orchestrator", kind: "agent", label: "Task 8 orchestrator" };
const requiredNonPrrPacks = [
  "evidence-summary.v1",
  "governance-locks.v1",
  "accepted-graph-projection.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1"
] as const;

describe("task orchestrator deterministic evidence triage vertical", () => {
  it("legacy deterministic caller remains explicit v1", async () => {
    const fixture = await prepareEvidenceTriageVertical();

    expect(fixture.promptArtifact.manifest.production).toMatchObject({
      schemaVersion: "agent-production-prompt-binding.v1"
    });
  });

  it("evidence triage queue claim plan context approval wait reclaim deterministic test provider final output handoff run terminal task terminal", async () => {
    const fixture = await prepareEvidenceTriageVertical();

    const waiting = await fixture.orchestrator.tick();

    expect(waiting.claimed).toContainEqual(expect.objectContaining({ taskId, runType }));
    expect(waiting.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(fixture.renderedPayloads()).toContain(sentinel);
    expect(checkpointKinds(await fixture.ledger.readStream(fixture.claimStreamId))).toEqual([
      "context-ready",
      "approval-wait"
    ]);
    expect(JSON.stringify(await fixture.ledger.readAll())).not.toContain(sentinel);

    await fixture.approve();
    const resumed = await fixture.orchestrator.tick();

    expect(resumed.reclaimed).toContainEqual(expect.objectContaining({ taskId, leaseClaimGeneration: 2 }));
    expect(resumed.approvalVerified).toContainEqual(expect.objectContaining({ taskId, toolRequestId }));
    expect(resumed.sideEffectsScheduled).toEqual([
      expect.stringMatching(/^runner-dispatch:/),
      `runner-handoff-completed:${taskId}:${runId}`
    ]);
    expect(fixture.runnerCalls).toEqual([`${taskId}:${runId}`]);

    const events = await fixture.ledger.readAll();
    expect(eventOrder(events, [
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.task.orchestration.completed",
      "agent.task.status.changed:completed"
    ])).toEqual([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.task.orchestration.completed",
      "agent.task.status.changed:completed"
    ]);
    expect(buildTaskOrchestratorProjection(events, { now }).tasks.get(taskId)).toMatchObject({
      state: "completed",
      taskStatus: "completed"
    });
    expect(JSON.stringify(buildTaskOrchestratorProjection(events, { now }).toDto())).not.toContain(sentinel);
  });

  it("evidence triage rejects ref only fake readiness", async () => {
    const fixture = await prepareEvidenceTriageVertical({ refOnlyContext: true });

    const summary = await fixture.orchestrator.tick();

    expect(summary.blocked).toContainEqual(expect.objectContaining({
      taskId,
      runType,
      reason: "context-not-ready"
    }));
    expect(summary.approvalWaiting).toEqual([]);
    expect(fixture.runnerCalls).toEqual([]);
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain("agent.specialist-run.started");
  });

  it("evidence triage never calls approved tool scheduler for task claims", async () => {
    const fixture = await prepareEvidenceTriageVertical();
    const schedulerExecute = vi.fn();
    const preview = {
      summary: "Approved scheduler work must stay separate from task orchestration.",
      relatedEventIds: ["evt_task8_scheduler_source"],
      artifactHashes: [hashString("scheduler-preview")]
    };
    const runtime = createAgentRuntime({
      ledger: fixture.ledger,
      actor: orchestratorActor,
      now: () => now,
      approvedToolExecutors: [{
        toolId: "agent.task8.scheduler",
        toolVersion: "1.0.0",
        sideEffectClass: "ledger-review",
        approvalClass: "ledger-review",
        async buildCurrentPreview() {
          return {
            preview,
            sourceEventIds: ["evt_task8_scheduler_source"],
            inputArtifactHashes: [hashString("scheduler-preview")],
            provenanceRefs: ["evt_task8_scheduler_source"],
            activeLocks: [],
            freshnessChecks: []
          };
        },
        async executeApproved() {
          schedulerExecute();
          return { eventIds: [], artifactHashes: [], readModelChanges: [], resultSummary: "scheduler executed" };
        }
      }]
    });
    await runtime.gateway.requestTool({
      toolRequestId: "toolreq_task8_scheduler_separation",
      residentAgentId: "agent_default",
      taskId,
      runId,
      toolId: "agent.task8.scheduler",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview
    });
    await runtime.gateway.approveTool({
      toolRequestId: "toolreq_task8_scheduler_separation",
      approvedPreviewHash: hashAgentToolPreview(preview),
      actor: humanActor,
      rationale: "Approve scheduler work separately."
    });

    await fixture.orchestrator.tick();

    expect(schedulerExecute).not.toHaveBeenCalled();
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain("agent.tool.completed");
  });

  it("non prr evidence triage does not require prr timeline or contradiction packs", async () => {
    const fixture = await prepareEvidenceTriageVertical();

    const summary = await fixture.orchestrator.tick();

    expect(summary.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, runType }));
    const checkpoint = (await fixture.ledger.readStream(fixture.claimStreamId))
      .find((event): event is KnowledgeEventOf<"agent.task.orchestration.checkpointed"> =>
        event.type === "agent.task.orchestration.checkpointed" && event.payload.checkpointKind === "context-ready"
      );
    expect(checkpoint?.payload.contextBindings.map((binding) => binding.contextPackId).sort()).toEqual([...requiredNonPrrPacks].sort());
    expect(JSON.stringify(checkpoint)).not.toContain("timeline-draft-summary.v1");
    expect(JSON.stringify(checkpoint)).not.toContain("contradiction-candidate-summary.v1");
    expect(JSON.stringify(checkpoint)).not.toContain("prr-read-model.v1");
  });

  it("prr linked evidence triage remains blocked until prr packs are ready", async () => {
    const fixture = await prepareEvidenceTriageVertical({
      scope: { kind: "task", refs: [taskId, "prr_task8_linked"], associatedPrrRequestId: "prr_task8_linked" }
    });

    const summary = await fixture.orchestrator.tick();

    expect(summary.blocked).toContainEqual(expect.objectContaining({
      taskId,
      runType,
      reason: "context-not-ready"
    }));
    expect(summary.approvalWaiting).toEqual([]);
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain("agent.specialist-run.started");
  });
});

async function prepareEvidenceTriageVertical(options: {
  readonly refOnlyContext?: boolean;
  readonly scope?: ProductionRunScope;
} = {}) {
  const ledger = new InMemoryEventLedger();
  const scope = options.scope ?? { kind: "task", refs: [taskId] };
  const contextRegistry = createTask8ContextRegistry({ refOnly: options.refOnlyContext === true });
  const resolved = options.refOnlyContext === true
    ? []
    : await Promise.all(requiredNonPrrPacks.map(async (packId) => await contextRegistry.buildResolved(packId)));
  const contextRefs = options.refOnlyContext === true
    ? await Promise.all(requiredNonPrrPacks.map(async (packId) => await contextRegistry.build(packId)))
    : resolved.map((pack) => pack.ref);
  const promptArtifact = options.refOnlyContext === true || options.scope?.associatedPrrRequestId !== undefined
    ? buildPromptArtifact({
      promptTemplateId: "evidence-triage.classify.v1",
      promptTemplateVersion: 1,
      generatedAt: now,
      runType,
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: contextRefs,
      text: "Classify evidence from verified context only.",
      safeSummary: "Task 8 deterministic evidence triage prompt."
    })
    : renderProductionSpecialistPrompt({
      runId,
      taskId,
      runType,
      scope,
      generatedAt: now,
      resolvedContextPacks: resolved
    });
  const promptHash = promptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
  const contextHashes = contextRefs.map((ref) => ref.contentHash as `sha256:${string}`);
  const preview = providerPreview(promptHash, contextHashes);
  const previewHash = hashAgentToolPreview(preview);
  const gateway = createAgentToolGateway({ ledger, actor: orchestratorActor, now: () => now });

  await queueTask(ledger);
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
    inputArtifactHashes: [...contextHashes, promptHash]
  });
  const providerApproval = await appendProviderApproval(ledger);
  const proof = providerProof({ previewHash, approvalRequirementId: request.id, providerApprovalEventId: providerApproval.id, promptArtifact, contextHashes });
  const approvalReader = createTaskOrchestratorProviderApprovalAdapter({
    rebuildCurrentPreview: async () => ({
      preview,
      sourceEventIds: ["evt_task8_source"],
      inputArtifactHashes: [...contextHashes, promptHash],
      provenanceRefs: [],
      activeLocks: [],
      freshnessChecks: []
    })
  });
  const runtime = createAgentRuntime({ ledger, actor: orchestratorActor, now: () => now, providers: [] });
  await runtime.initializeDefaultIdentity({ workspaceId: "ws_task8_vertical" });
  const manifestStore = new MemoryManifestStore();
  const runnerCalls: string[] = [];
  const renderedPayloadTexts: string[] = [];
  const runnerRegistry: TaskOrchestratorRunnerRegistry = {
    async dispatch(input) {
      runnerCalls.push(`${input.taskId}:${input.approvedRunId}`);
      const started = await runtime.startRun({
        runId: input.approvedRunId,
        taskId: input.taskId,
        runType,
        scope: { kind: "workspace", refs: ["ws_task8_vertical"] }
      });
      if (!started.ok) {
        throw new Error("Task 8 deterministic run could not start.");
      }
      const material = handoffMaterial(started.eventIds[0]!, manifestStore, resolved);
      return {
        durableHandoff: {
          runId: input.approvedRunId,
          taskId: input.taskId,
          materialStore: manifestStore,
          manifestStore,
          handoffMaterial: material
        }
      };
    }
  };
  const orchestrator = createTaskOrchestrator({
    ledger,
    now: () => now,
    actor: orchestratorActor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      scope,
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
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry,
    promptRendererRegistry: {
      render(input: { readonly resolvedContextPacks: readonly { readonly payload: unknown }[] }) {
        const text = JSON.stringify(input.resolvedContextPacks.map((pack: { readonly payload: unknown }) => pack.payload));
        renderedPayloadTexts.push(text);
        if (!text.includes(sentinel) && options.refOnlyContext !== true) {
          throw new Error("Task 8 prompt renderer did not receive resolved payload sentinel.");
        }
        return promptArtifact;
      },
      readback(_input: unknown, rendered: unknown) {
        if (rendered !== promptArtifact) throw new Error("Expected exact rendered prompt artifact.");
        return promptArtifact.manifest.inputArtifactHash;
      }
    },
    providerRegistry: createProviderRegistry.withDefaultsForTest(),
    approvalReader,
    runnerRegistry,
    handoffCapability: createTaskOrchestratorHandoffCapability()
  });

  return {
    ledger,
    promptArtifact,
    orchestrator,
    gateway,
    runnerCalls,
    claimStreamId: `agent_task_orchestration_${taskId}_${runType}`,
    renderedPayloads: () => renderedPayloadTexts.join("\n"),
    approve: async () => {
      await gateway.approveTool({
        toolRequestId,
        approvedPreviewHash: previewHash,
        actor: humanActor,
        rationale: "Approve exact Task 8 provider-byte-transfer preview."
      });
    }
  };
}

function createTask8ContextRegistry(options: { readonly refOnly: boolean }): ContextPackRegistry {
  const registry = createContextPackRegistry();
  for (const packId of requiredNonPrrPacks) {
    const parser = parserFor(packId);
    registry.register({
      descriptor: {
        contextPackId: packId,
        version: 1,
        label: `Task 8 ${packId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "task8-safe-summary",
        sourceProjection: `task8.${packId}`
      },
      parsePayload: parser,
      build() {
        const resolved = buildResolvedContextPack({
          contextPackId: packId,
          version: 1,
          generatedAt: now,
          payload: payloadFor(packId),
          safeSummary: `Task 8 resolved ${packId}.`,
          provenanceRefs: ["evt_task8_source"]
        });
        return options.refOnly ? resolved.ref : resolved;
      }
    });
  }
  return registry;
}

function parserFor(packId: string): ContextPackPayloadParser {
  const parser: ContextPackPayloadParser = (payload: AgentContextPackJsonValue) => payload;
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: packId,
    enumerable: false,
    configurable: false,
    writable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function payloadFor(packId: string): AgentContextPackJsonValue {
  switch (packId) {
    case "evidence-summary.v1":
      return {
        items: [{
          evidenceId: "ev_task8",
          ingestionEventId: "evt_task8_ingested",
          contentHash: hashString("evidence"),
          occurrenceIds: ["occurrence_task8"],
          parseJobs: [],
          governanceTags: [],
          safeNarrative: sentinel
        }]
      };
    case "governance-locks.v1":
      return {
        items: {
          activeLocks: [{
            lockId: "lock_task8_review",
            lockKind: "review",
            safeReason: "Task 8 review lock.",
            activatedBy: "agent_default",
            activatedAt: now,
            relatedEventIds: ["evt_task8_source"],
            projectionEventIds: ["evt_task8_source"]
          }],
          governanceRestrictions: []
        }
      };
    case "accepted-graph-projection.v1":
      return {
        items: {
          assertions: [{
            assertionId: "assertion_task8",
            evidenceId: "ev_task8",
            evidenceContentHash: hashString("evidence"),
            proposedByEventId: "evt_task8_source",
            acceptedByEventId: "evt_task8_source",
            sourceEventIds: ["evt_task8_source"],
            rowHash: hashString("assertion"),
            safeStatement: "Verified Task 8 graph statement."
          }],
          entities: [],
          relationships: []
        }
      };
    case "agent-memory-summary.v1":
      return {
        memory: {
          activeMemory: ["Task 8 memory preserves prior review caveats."],
          aggregateCounts: { active: 1 },
          sourceEventIds: ["evt_task8_source"],
          artifactHashes: []
        }
      };
    case "task-run-history.v1":
      return {
        history: {
          projectionHighWaterMark: 1,
          projectionSourceRef: "agent.projection.task-run-history",
          tasks: [{ taskId, status: "queued", statusReasonCode: "Task 8 queued." }],
          runs: [],
          modelInvocations: [],
          toolRequests: [],
          aggregateCounts: { tasks: 1 },
          sourceEventIds: ["evt_task8_source"],
          artifactHashes: [],
          window: { order: "created-at", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] }
        }
      };
    case "workspace-runtime-status.v1":
      return {
        runtime: {
          runtimeHighWaterMark: 1,
          workspaceMounted: true,
          storageStrategy: "local",
          bindPosture: "bound",
          authPosture: "none",
          providerStates: [],
          diagnostics: [],
          projectionHighWaterMarks: { agent: 1 },
          omissionCodes: []
        }
      };
    default:
      return { items: [{ safeSummary: `Task 8 ${packId}` }] };
  }
}

function providerPreview(promptHash: `sha256:${string}`, contextHashes: readonly `sha256:${string}`[]) {
  return {
    summary: "Transfer exact Task 8 deterministic evidence-triage provider bytes.",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId,
    taskId,
    residentAgentId: "agent_default",
    providerId: "provider_fake_remote",
    modelId: "fake-remote",
    relatedEventIds: ["evt_task8_source"],
    artifactHashes: [...contextHashes, promptHash]
  };
}

function providerProof(input: {
  readonly previewHash: `sha256:${string}`;
  readonly approvalRequirementId: string;
  readonly providerApprovalEventId: string;
  readonly promptArtifact: ReturnType<typeof buildPromptArtifact>;
  readonly contextHashes: readonly `sha256:${string}`[];
}): TaskOrchestratorProviderApprovalProof {
  const providerReadiness = {
    cards: [{
      providerId: "provider_fake_remote",
      label: "Fake remote provider",
      backendKind: "openai-compatible-api" as const,
      capabilitySummary: ["text"],
      credentialKindSummary: ["api-key-bearer" as const],
      state: "requires-byte-transfer-approval" as const,
      requiredApprovalClass: "provider-byte-transfer" as const,
      credentialHealth: "local-binding-healthy" as const,
      dataHandlingPosture: "remote-prompt-byte-transfer-gated" as const,
      credentialRefId: "agent_credref_task8_remote",
      safeActionIds: []
    }]
  };
  const credentialRef = {
    credentialRefId: "agent_credref_task8_remote",
    providerId: "provider_fake_remote",
    kind: "api-key-bearer" as const,
    safeLabel: "Task 8 remote access",
    authorizedBy: humanActor.id,
    authorizedAt: now
  };
  return {
    runId,
    toolRequestId,
    approvalRequirementId: input.approvalRequirementId,
    approvedPreviewHash: input.previewHash,
    promptArtifactHash: input.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
    contextBindingHashes: input.contextHashes,
    credentialRef,
    providerReadiness,
    promptArtifact: input.promptArtifact,
    currentPreviewInput: {
      approvedProviderCapability: {
        providerId: "provider_fake_remote",
        modelFamilies: ["fake-remote"],
        adapterVersion: "agent-provider-auth.v1"
      },
      approvedProviderReadiness: providerReadiness.cards[0],
      credentialRefId: credentialRef.credentialRefId,
      reviewer: humanActor,
      approvalEventId: input.providerApprovalEventId,
      providerJobId: "provider_task8_remote",
      sourceCollectionId: "src_task8_remote",
      importBatchId: "imp_task8_remote",
      approvedPromptArtifact: promptArtifactAuditMetadata(input.promptArtifact),
      toolRequestId,
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      runId,
      taskId,
      residentAgentId: "agent_default",
      providerId: "provider_fake_remote",
      modelId: "fake-remote",
      sourceEventIds: ["evt_task8_source"],
      inputArtifactHashes: [...input.contextHashes, input.promptArtifact.manifest.inputArtifactHash],
      activeLocks: []
    } as never
  };
}

async function queueTask(ledger: EventLedger) {
  const created = await ledger.append({
    type: "agent.task.created",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context("evt_task8_source"),
    payload: {
      taskId,
      residentAgentId: "agent_default",
      title: "Task 8 deterministic evidence triage",
      requestedBy: humanActor.id,
      priority: "urgent",
      sourceEventIds: ["evt_task8_source"],
      inputArtifactHashes: [hashString("task-input")]
    }
  }, { expectedNextSequence: 1 });
  await ledger.append({
    type: "agent.task.status.changed",
    version: 1,
    streamId: `agent_task_${taskId}`,
    context: context(created.id),
    payload: {
      taskId,
      status: "queued",
      changedBy: orchestratorActor.id,
      reason: "Task queued for deterministic evidence triage."
    }
  }, { expectedNextSequence: 2 });
}

async function appendProviderApproval(ledger: EventLedger) {
  return await ledger.append({
    type: "ingestion.provider.approved",
    version: 1,
    streamId: "ingestion_provider_src_task8_remote_imp_task8_remote_provider_task8_remote",
    context: { ...context("evt_task8_source"), actor: humanActor },
    payload: {
      providerJobId: "provider_task8_remote",
      sourceCollectionId: "src_task8_remote",
      importBatchId: "imp_task8_remote",
      provider: { name: "provider_fake_remote", version: "agent-provider-auth.v1" },
      approvedBy: humanActor.id,
      approvedAt: now,
      eligibleMediaTypes: ["text/plain"],
      maxBytesPerFile: 4096,
      policy: "send-all-technically-eligible"
    }
  }, { expectedNextSequence: 1 });
}

function handoffMaterial(
  runStartedEventId: string,
  store: MemoryManifestStore,
  resolvedContextPacks: readonly Awaited<ReturnType<ContextPackRegistry["buildResolved"]>>[]
) {
  for (const resolved of resolvedContextPacks) {
    const contextBytes = serializeContextPackPayload(resolved.payload);
    store.seed(
      resolved.ref.contentHash as `sha256:${string}`,
      Buffer.from(contextBytes.buffer, contextBytes.byteOffset, contextBytes.byteLength)
    );
  }
  const outputBytes = Buffer.from("Task 8 deterministic evidence triage output.");
  const outputHash = hashBytes(outputBytes);
  store.seed(outputHash, outputBytes);
  return buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "Task 8 deterministic evidence triage is ready for review.",
    contextPackRefs: resolvedContextPacks.map((resolved) => resolved.ref),
    outputArtifacts: [{
      artifactId: "artifact_task8_triage",
      artifactKind: "triage-dossier",
      schemaId: "evidence-triage-output.v1",
      artifactHash: outputHash,
      safeSummary: "Task 8 deterministic output artifact."
    }],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: "review_task8_triage",
      label: "Review deterministic triage",
      kind: "review",
      effect: "none",
      artifactId: "artifact_task8_triage"
    }],
    sourceEventIds: [runStartedEventId],
    relatedEventIds: [runStartedEventId]
  });
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
      throw new Error(`Task 8 manifest ${contentHash} is unavailable.`);
    }
    return Buffer.from(content);
  }
}

function checkpointKinds(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][]): string[] {
  return events
    .filter((event): event is KnowledgeEventOf<"agent.task.orchestration.checkpointed"> =>
      event.type === "agent.task.orchestration.checkpointed"
    )
    .map((event) => event.payload.checkpointKind);
}

function eventOrder(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][], expected: readonly string[]): string[] {
  return events
    .map((event) => event.type === "agent.task.status.changed" ? `${event.type}:${event.payload.status}` : event.type)
    .filter((type) => expected.includes(type));
}

function budgets() {
  return {
    maxProviderInvocations: 1,
    remainingProviderInvocations: 1,
    contextByteBudget: 65_536,
    promptByteBudget: 65_536,
    derivativeArtifactByteBudget: 65_536,
    wallClockBudgetMs: 120_000
  };
}

function context(causationId: string) {
  return {
    actor: orchestratorActor,
    occurredAt: now,
    causationId,
    correlationId: "corr_task8_evidence_triage",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hashString(value: string): `sha256:${string}` {
  return hashBytes(Buffer.from(value, "utf8"));
}
