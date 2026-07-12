import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import type { ActorRef, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  serializeContextPackPayload,
  type AgentContextPackJsonValue,
  type ContextPackPayloadParser,
  type ContextPackRegistry,
  type VerifiedResolvedContextPack
} from "../src/context-packs.js";
import {
  SecretMaterial,
  StaticSecretStore,
  buildPromptArtifact,
  createAgentRuntime,
  createAgentToolGateway,
  createNousPortalProvider,
  createProviderCapabilityDescriptor,
  createProviderRegistry,
  hashAgentToolPreview,
  promptArtifactAuditMetadata,
  rebuildProviderByteTransferCurrentPreview,
  renderProductionSpecialistPrompt,
  type ProviderReadinessDto,
  type ProviderSetupCard,
  type RebuildProviderByteTransferCurrentPreviewInput
} from "../src/index.js";
import { buildTaskOrchestratorProjection } from "../src/task-orchestrator-projection.js";
import {
  createTaskOrchestratorHandoffCapability,
  createTaskOrchestrator,
  type TaskOrchestratorRunnerRegistry
} from "../src/task-orchestrator.js";
import {
  createTaskOrchestratorProviderApprovalAdapter,
  type TaskOrchestratorProviderApprovalProof
} from "../src/task-orchestrator-approval.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";
import { buildSpecialistHandoffMaterial } from "../src/specialist-handoff-manifest.js";
import {
  invokeSpecialistModel,
  prepareSpecialistRun,
  type SpecialistHandoffManifestStore
} from "../src/specialist-runner-kernel.js";
import {
  validateProductionSpecialistProviderOutput,
  type EvidenceTriageClassifyOutput
} from "../src/production-specialist-output-contracts.js";
import type { ProductionRunScope } from "../src/production-specialist-registration-metadata.js";

const liveDescribe = process.env.CESTUS_AGENT_LIVE_NOUS === "1" ? describe : describe.skip;
const env = liveNousEnv();
const now = "2026-07-12T08:15:00.000Z";
const runType = "evidence-triage" as const;
const taskId = "task_evidence_triage_orchestrator_live";
const runId = "run_evidence_triage_orchestrator_live";
const toolRequestId = "toolreq_evidence_triage_orchestrator_live_transfer";
const providerId = "provider_nous_portal";
const credentialRefId = "agent_credref_nous_portal";
const defaultModel = "tencent/hy3:free";
const evidenceId = "ev_evidence_triage_orchestrator_live";
const evidenceSourceBytes = Buffer.from("orchestrator live evidence triage source", "utf8");
const evidenceHash = hashBytes(evidenceSourceBytes);
const providerJobId = "provider_orchestrator_live_evidence_triage";
const sourceCollectionId = "src_orchestrator_live_evidence_triage";
const importBatchId = "imp_orchestrator_live_evidence_triage";
const payloadSentinel = "PAYLOAD_SENTINEL_ORCHESTRATOR_LEDGER_927";
const actor: ActorRef = { id: "actor_task9_orchestrator", kind: "agent", label: "Task 9 orchestrator" };
const human: ActorRef = { id: "actor_task9_provider_reviewer", kind: "human", label: "Task 9 provider reviewer" };
const scope: ProductionRunScope = { kind: "task", refs: [taskId] };
const requiredNonPrrPacks = [
  "evidence-summary.v1",
  "governance-locks.v1",
  "accepted-graph-projection.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1"
] as const;

interface RemotePromptEvidenceRefs {
  readonly evidenceEventId: string;
  readonly linkEventId: string;
}

liveDescribe("live Nous resident task orchestrator evidence triage acceptance", () => {
  it("real nous evidence triage emits structured output containing resolved payload sentinel", async () => {
    const apiKey = requireLiveNousApiKey();
    const modelFamily = env.model ?? defaultModel;
    const fixture = await prepareLiveOrchestrator({
      apiKey,
      modelFamily,
      refOnlyContext: false
    });

    const waiting = await fixture.orchestrator.tick();
    expect(waiting.approvalWaiting).toContainEqual(expect.objectContaining({ taskId, runType, toolRequestId }));
    expect(fixture.remoteInvocationCount()).toBe(0);
    expect(JSON.stringify(await fixture.ledger.readAll())).not.toContain(payloadSentinel);

    await fixture.approveProviderTransfer();
    const resumed = await fixture.orchestrator.tick();

    expect(resumed.approvalVerified).toContainEqual(expect.objectContaining({ taskId, runType, toolRequestId }));
    expect(resumed.sideEffectsScheduled).toEqual([
      expect.stringMatching(/^runner-dispatch:/),
      `runner-handoff-completed:${taskId}:${runId}`
    ]);
    expect(fixture.remoteInvocationCount()).toBe(1);
    expect(fixture.modelOutput()?.safeSummaries.some((summary) => summary.includes(payloadSentinel))).toBe(true);

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
    assertNoLiveLeakage({
      ledgerEvents: events,
      projectionDto: buildTaskOrchestratorProjection(events, { now }).toDto(),
      preview: fixture.preview,
      apiKey
    });
  }, 120_000);

  it("live readiness fails when sentinel exists only behind unresolved context ref", async () => {
    const apiKey = requireLiveNousApiKey();
    const modelFamily = env.model ?? defaultModel;
    const fixture = await prepareLiveOrchestrator({
      apiKey,
      modelFamily,
      refOnlyContext: true
    });

    const summary = await fixture.orchestrator.tick();

    expect(summary.blocked).toContainEqual(expect.objectContaining({
      taskId,
      runType,
      reason: "context-not-ready"
    }));
    expect(summary.approvalWaiting).toEqual([]);
    expect(fixture.remoteInvocationCount()).toBe(0);
    expect((await fixture.ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  }, 30_000);
});

describe("Task 9 live fixture content-addressed handoff artifacts", () => {
  it("seeds the exact evidence source bytes referenced by live context refs", async () => {
    const fixture = await prepareLiveOrchestrator({
      apiKey: "test-live-api-key-placeholder",
      modelFamily: defaultModel,
      refOnlyContext: false
    });

    await expect(fixture.readManifestArtifact(evidenceHash))
      .resolves.toEqual(Buffer.from("orchestrator live evidence triage source", "utf8"));
  });
});

describe("Task 9 live leakage helper", () => {
  it("allows public credential-kind vocabulary but rejects actual credential material", () => {
    const apiKey = "task9-live-secret-material";
    const safePublicCredentialMetadata = {
      providerReadiness: {
        credentialKindSummary: ["api-key-bearer"],
        credentialKind: "api-key-bearer"
      },
      invocation: {
        credentialRef: {
          kind: "api-key-bearer",
          safeLabel: "Nous Portal local binding"
        }
      }
    };

    expect(() => assertNoLiveLeakage({
      ledgerEvents: [safePublicCredentialMetadata],
      projectionDto: { credentialKindSummary: ["api-key-bearer"] },
      preview: { requiredCredentialKind: "api-key-bearer" },
      apiKey
    })).not.toThrow();

    expect(() => assertNoLiveLeakage({
      ledgerEvents: [{ provider: { credentialValue: apiKey } }],
      projectionDto: {},
      preview: {},
      apiKey
    })).toThrow(/credential material/i);

    expect(() => assertNoLiveLeakage({
      ledgerEvents: [{ request: { authorization: `Bearer ${apiKey}` } }],
      projectionDto: {},
      preview: {},
      apiKey: "different-secret-material"
    })).toThrow(/credential material/i);
  });
});

async function prepareLiveOrchestrator(input: {
  readonly apiKey: string;
  readonly modelFamily: string;
  readonly refOnlyContext: boolean;
}) {
  const ledger = new InMemoryEventLedger();
  const remoteEvidence = await appendLiveEvidence(ledger);
  const contextRegistry = createLiveContextRegistry(remoteEvidence, input.refOnlyContext);
  const resolved = input.refOnlyContext
    ? []
    : await Promise.all(requiredNonPrrPacks.map(async (packId) => await contextRegistry.buildResolved(packId)));
  const contextRefs = input.refOnlyContext
    ? await Promise.all(requiredNonPrrPacks.map(async (packId) => await contextRegistry.build(packId)))
    : resolved.map((pack) => pack.ref);
  const promptArtifact = input.refOnlyContext
    ? renderRefOnlyPrompt(contextRefs)
    : renderProductionSpecialistPrompt({
      runId,
      taskId,
      runType,
      generatedAt: now,
      scope,
      resolvedContextPacks: resolved
    });
  const promptHash = promptArtifact.manifest.inputArtifactHash as `sha256:${string}`;
  const contextHashes = contextRefs.map((ref) => ref.contentHash as `sha256:${string}`);
  const providerCapability = providerCapabilityDescriptor(input.modelFamily);
  const providerReadiness = providerReadinessDto(input.modelFamily);
  const providerReadinessCard = providerReadiness.cards[0]!;
  const provider = createNousPortalProvider({
    secretStore: new StaticSecretStore({
      [credentialRefId]: SecretMaterial.fromRuntimeValue(input.apiKey)
    }),
    ...(env.endpoint === undefined ? {} : { endpointUrl: env.endpoint }),
    modelId: input.modelFamily,
    includeReasoning: false,
    reasoningEffort: "none",
    temperature: 0
  });
  const runtime = createAgentRuntime({ ledger, actor, now: () => now, providers: [provider] });
  await runtime.initializeDefaultIdentity({ workspaceId: "ws_task9_orchestrator_live" });
  await runtime.createTask({
    taskId,
    title: "Live resident orchestrator evidence triage",
    requestedBy: human.id,
    priority: "urgent"
  });

  const gateway = createAgentToolGateway({ ledger, actor, now: () => now });
  const approvalSetup = input.refOnlyContext
    ? refOnlyApprovalSetup(promptArtifact, contextHashes)
    : await providerApprovalSetup({
      ledger,
      gateway,
      remoteEvidence,
      providerCapability,
      providerReadiness,
      providerReadinessCard,
      promptArtifact,
      contextHashes
    });
  const proof: TaskOrchestratorProviderApprovalProof = {
    runId,
    toolRequestId,
    approvalRequirementId: approvalSetup.approvalRequirementId,
    approvedPreviewHash: approvalSetup.approvedPreviewHash,
    promptArtifactHash: promptHash,
    contextBindingHashes: contextHashes,
    credentialRef: {
      credentialRefId,
      providerId,
      kind: "api-key-bearer",
      safeLabel: "Nous Portal local binding"
    },
    providerReadiness,
    promptArtifact,
    currentPreviewInput: approvalSetup.currentPreviewInput
  };
  const approvalReader = approvalSetup.approvalReader;
  const capabilityRegistry = createProviderRegistry();
  capabilityRegistry.register(providerCapability);
  const store = new MemoryManifestStore();
  seedResolvedContextPayloads(store, resolved);
  seedPromptArtifact(store, promptArtifact);
  seedLiveEvidenceSourceArtifact(store);
  let remoteInvocationCount = 0;
  let modelOutput: EvidenceTriageClassifyOutput | undefined;
  const runnerRegistry: TaskOrchestratorRunnerRegistry = {
    async dispatch(dispatchInput) {
      remoteInvocationCount += 1;
      const started = await runtime.startRun({
        runId: dispatchInput.approvedRunId,
        taskId: dispatchInput.taskId,
        runType,
        scope: { kind: "workspace", refs: ["ws_task9_orchestrator_live"] }
      });
      if (!started.ok) {
        throw new Error("Live evidence triage run start failed.");
      }
      const runnerInput = {
        ledger,
        actor,
        now: () => now,
        contextPacks: contextRegistry,
        scope,
        runId: dispatchInput.approvedRunId,
        taskId: dispatchInput.taskId,
        providerId,
        modelFamily: input.modelFamily,
        credentialRef: proof.credentialRef!,
        runtime,
        providerReadiness,
        providerTransferApproval: {
          currentPreviewInput: approvalSetup.currentPreviewInput,
          approvedPreviewHash: approvalSetup.approvedPreviewHash
        },
        promptArtifact,
        derivativeStore: store
      };
      const prepared = await prepareSpecialistRun(runnerInput, runType);
      const invocation = await invokeSpecialistModel(
        runnerInput,
        prepared,
        "inv_evidence_triage_orchestrator_live"
      );
      modelOutput = parseLiveEvidenceTriageOutput(invocation.outputText);
      if (!modelOutput.safeSummaries.some((summary) => summary.includes(payloadSentinel))) {
        throw new Error(`Live Nous output missing resolved-payload sentinel; outputChars=${invocation.outputText.length}; safeSummaries=${modelOutput.safeSummaries.length}`);
      }
      const outputBytes = Buffer.from(JSON.stringify({
        schemaVersion: "task9-live-evidence-triage-output.v1",
        output: modelOutput
      }));
      const outputStored = await store.put(outputBytes);
      return {
        durableHandoff: {
          runId: dispatchInput.approvedRunId,
          taskId: dispatchInput.taskId,
          materialStore: store,
          manifestStore: store,
          handoffMaterial: buildSpecialistHandoffMaterial({
            status: "ready-for-review",
            safeSummary: "Live evidence triage output is ready for local human review.",
            contextPackRefs: prepared.contextPackRefs,
            promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`,
            outputArtifacts: [{
              artifactId: "artifact_task9_live_evidence_triage_output",
              artifactKind: "safe-evidence-summaries",
              schemaId: "task9-live-evidence-triage-output.v1",
              artifactHash: outputStored.contentHash,
              safeSummary: "Structured live evidence triage output hash is ready for review."
            }],
            toolRequestIds: [],
            approvalRequirements: [],
            nextSafeActions: [{
              actionId: "action_task9_review_live_triage",
              label: "Review live triage output",
              kind: "review",
              effect: "none",
              artifactId: "artifact_task9_live_evidence_triage_output"
            }],
            sourceEventIds: [started.eventIds[0]!, ...invocation.eventIds],
            relatedEventIds: [started.eventIds[0]!, ...invocation.eventIds]
          })
        }
      };
    }
  };
  const orchestrator = createTaskOrchestrator({
    ledger,
    now: () => now,
    actor,
    policy: {
      defaultRunType: runType,
      leaseDurationMs: 600_000,
      scope,
      providerPolicy: {
        registry: capabilityRegistry,
        task: {
          modality: "text",
          structuredOutputRequired: false,
          sensitivity: "workspace-safe",
          requiresRemoteHarness: false
        },
        readinessByProviderId: { [providerId]: "requires-byte-transfer-approval" },
        selectionPolicy: { allowRemoteByteTransfer: true, preferredCostPolicy: "metered-api" },
        selectionPolicyVersion: "provider-policy.v1",
        approval: proof
      }
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
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry,
    promptRendererRegistry: {
      render() {
        return promptArtifact;
      }
    },
    providerRegistry: capabilityRegistry,
    approvalReader,
    runnerRegistry,
    handoffCapability: createTaskOrchestratorHandoffCapability()
  });
  return {
    ledger,
    orchestrator,
    gateway,
    preview: approvalSetup.preview,
    approveProviderTransfer: async () => {
      if (approvalSetup.requested !== true) {
        throw new Error("Ref-only live negative path cannot approve provider transfer.");
      }
      await gateway.approveTool({
        toolRequestId,
        approvedPreviewHash: approvalSetup.approvedPreviewHash,
        actor: human,
        rationale: "Approve exact live Task 9 provider byte-transfer preview."
      });
    },
    remoteInvocationCount: () => remoteInvocationCount,
    modelOutput: () => modelOutput,
    readManifestArtifact: async (contentHash: `sha256:${string}`) => await store.get(contentHash)
  };
}

async function providerApprovalSetup(input: {
  readonly ledger: EventLedger;
  readonly gateway: ReturnType<typeof createAgentToolGateway>;
  readonly remoteEvidence: RemotePromptEvidenceRefs;
  readonly providerCapability: ReturnType<typeof providerCapabilityDescriptor>;
  readonly providerReadiness: ProviderReadinessDto;
  readonly providerReadinessCard: ProviderSetupCard;
  readonly promptArtifact: ReturnType<typeof renderProductionSpecialistPrompt>;
  readonly contextHashes: readonly `sha256:${string}`[];
}) {
  const domainApproval = await new ProviderParseApprovalService({ ledger: input.ledger, actor: human }).approveProviderBatch({
    providerJobId,
    sourceCollectionId,
    importBatchId,
    provider: { name: providerId, version: input.providerCapability.adapterVersion },
    approvedBy: human.id,
    approvedAt: now,
    eligibleMediaTypes: ["text/plain"],
    maxBytesPerFile: 10_000
  });
  const currentPreviewInput: RebuildProviderByteTransferCurrentPreviewInput = {
    ledger: input.ledger,
    reviewer: human,
    residentAgentId: "agent_default",
    taskId,
    providerJobId,
    sourceCollectionId,
    importBatchId,
    providerId,
    approvalEventId: domainApproval.id,
    credentialRefId,
    evidenceBindings: [{
      evidenceId,
      evidenceEventId: input.remoteEvidence.evidenceEventId,
      linkEventId: input.remoteEvidence.linkEventId,
      contentHash: evidenceHash,
      byteCount: 512,
      mediaType: "text/plain"
    }],
    approvedProviderCapability: input.providerCapability,
    approvedProviderReadiness: input.providerReadinessCard,
    approvedPromptArtifact: promptArtifactAuditMetadata(input.promptArtifact),
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => input.providerCapability },
    readProviderReadiness: async () => input.providerReadiness,
    readPromptArtifactAudit: async () => promptArtifactAuditMetadata(input.promptArtifact),
    toolRequestId,
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId
  };
  const current = await rebuildProviderByteTransferCurrentPreview(currentPreviewInput);
  const approvedPreviewHash = hashAgentToolPreview(current.preview);
  const request = await input.gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId,
    runId,
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    preview: current.preview,
    inputArtifactHashes: current.inputArtifactHashes
  });
  return {
    currentPreviewInput,
    approvedPreviewHash,
    approvalRequirementId: request.id,
    approvalReader: createTaskOrchestratorProviderApprovalAdapter({
      rebuildCurrentPreview: async () => current
    }),
    preview: current.preview,
    requested: true as const
  };
}

function refOnlyApprovalSetup(
  promptArtifact: ReturnType<typeof buildPromptArtifact>,
  contextHashes: readonly `sha256:${string}`[]
) {
  const preview = {
    summary: "Unreachable ref-only provider transfer preview.",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId,
    taskId,
    residentAgentId: "agent_default",
    providerId,
    modelId: env.model ?? defaultModel,
    relatedEventIds: ["evt_task9_ref_only_unreachable"],
    artifactHashes: [...contextHashes, promptArtifact.manifest.inputArtifactHash]
  };
  return {
    currentPreviewInput: {} as RebuildProviderByteTransferCurrentPreviewInput,
    approvedPreviewHash: hashString("task9 ref-only unreachable preview"),
    approvalRequirementId: "evt_task9_ref_only_unreachable",
    approvalReader: { inspect: async () => ({ status: "waiting" as const }) },
    preview,
    requested: false as const
  };
}

function createLiveContextRegistry(
  remoteRefs: RemotePromptEvidenceRefs,
  refOnlyContext: boolean
): ContextPackRegistry {
  const registry = createContextPackRegistry();
  for (const packId of requiredNonPrrPacks) {
    registry.register({
      descriptor: {
        contextPackId: packId,
        version: 1,
        label: `Task 9 ${packId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event"],
        redactionPolicy: "safe-summary-only",
        sourceProjection: `task9.${packId}`
      },
      build: () => {
        const resolved = buildResolvedContextPack({
          contextPackId: packId,
          version: 1,
          generatedAt: now,
          payload: liveContextPayload(packId, remoteRefs),
          safeSummary: `Task 9 ${packId} live summary.`,
          provenanceRefs: [
            `event:${remoteRefs.evidenceEventId}`,
            `event:${remoteRefs.linkEventId}`,
            evidenceId,
            remoteRefs.evidenceEventId,
            remoteRefs.linkEventId,
            evidenceHash
          ],
          sourceEventIds: [remoteRefs.evidenceEventId, remoteRefs.linkEventId],
          artifactHashes: [evidenceHash],
          sizeBudgetBytes: 16_384
        });
        return refOnlyContext ? resolved.ref : resolved;
      },
      parsePayload: parserFor(packId)
    });
  }
  return registry;
}

function liveContextPayload(contextPackId: string, remoteRefs: RemotePromptEvidenceRefs): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "evidence-summary.v1":
      return {
        items: [{
          evidenceId,
          ingestionEventId: remoteRefs.evidenceEventId,
          contentHash: evidenceHash,
          mediaType: "text/plain",
          sizeBytes: 512,
          sourceCollectionId,
          importBatchId,
          occurrenceIds: ["occ_task9_orchestrator_live"],
          parseJobs: [],
          governanceTags: [],
          safeNarrative: `The live orchestrator evidence includes ${payloadSentinel} for local review only.`
        }]
      };
    case "accepted-graph-projection.v1":
      return {
        items: {
          assertions: [{
            assertionId: "assertion_task9_live",
            evidenceId,
            evidenceContentHash: evidenceHash,
            proposedByEventId: remoteRefs.evidenceEventId,
            acceptedByEventId: remoteRefs.linkEventId,
            sourceEventIds: [remoteRefs.evidenceEventId],
            rowHash: hashString("task9 assertion row"),
            safeStatement: "Imported evidence requires local human review."
          }],
          entities: [],
          relationships: []
        }
      };
    case "governance-locks.v1":
      return {
        items: {
          activeLocks: [{
            lockId: "lock_task9_live_review",
            lockKind: "review",
            safeReason: "Local human review is required.",
            activatedBy: human.id,
            activatedAt: now,
            relatedEventIds: [remoteRefs.evidenceEventId],
            projectionEventIds: [remoteRefs.linkEventId]
          }],
          governanceRestrictions: []
        }
      };
    case "agent-memory-summary.v1":
      return {
        memory: {
          activeMemory: ["Live evidence triage must remain advisory until local review."],
          aggregateCounts: { active: 1 },
          sourceEventIds: [remoteRefs.evidenceEventId],
          artifactHashes: [evidenceHash]
        }
      };
    case "task-run-history.v1":
      return {
        history: {
          projectionHighWaterMark: 1,
          projectionSourceRef: "agent.projection.task-run-history",
          tasks: [{ taskId, status: "queued", priority: "urgent", runId, sourceEventIds: [remoteRefs.evidenceEventId] }],
          runs: [],
          modelInvocations: [],
          toolRequests: [],
          aggregateCounts: { tasks: 1 },
          sourceEventIds: [remoteRefs.evidenceEventId],
          artifactHashes: [evidenceHash],
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
      throw new Error(`Unsupported Task 9 live context pack ${contextPackId}`);
  }
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

function renderRefOnlyPrompt(contextRefs: readonly VerifiedResolvedContextPack["ref"][]) {
  return buildPromptArtifact({
    promptTemplateId: "evidence-triage.classify.v1",
    promptTemplateVersion: 1,
    generatedAt: now,
    runType,
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: contextRefs,
    text: "Classify evidence from verified local payloads only.",
    safeSummary: "Task 9 ref-only live negative prompt."
  });
}

async function appendLiveEvidence(ledger: EventLedger): Promise<RemotePromptEvidenceRefs> {
  const evidence = await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context: context("evt_task9_source"),
    payload: {
      evidenceId,
      source: { kind: "file", label: "task9-live-orchestrator-evidence.txt" },
      contentHash: evidenceHash,
      mediaType: "text/plain",
      sizeBytes: 512
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"evidence.ingested">;
  const link = await ledger.append({
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: `ingestion_evidence_link_${sourceCollectionId}_${importBatchId}`,
    context: context(evidence.id),
    payload: {
      evidenceId,
      importBatchId,
      sourceCollectionId,
      contentHash: evidenceHash,
      occurrenceIds: ["occ_task9_orchestrator_live"]
    }
  }, { expectedNextSequence: 1 }) as KnowledgeEventOf<"ingestion.evidence.linked">;
  return { evidenceEventId: evidence.id, linkEventId: link.id };
}

function providerReadinessDto(modelFamily: string): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: now,
    cards: [{
      providerId,
      label: "Nous Portal",
      backendKind: "openai-compatible-api",
      capabilitySummary: ["text", modelFamily],
      credentialKindSummary: ["api-key-bearer"],
      state: "requires-byte-transfer-approval",
      requiredApprovalClass: "provider-byte-transfer",
      credentialHealth: "local-binding-healthy",
      dataHandlingPosture: "remote-prompt-byte-transfer-gated",
      credentialRefId,
      safeActionIds: ["action_request_provider_byte_transfer_approval"]
    }],
    diagnostics: []
  };
}

function providerCapabilityDescriptor(modelFamily: string) {
  return createProviderCapabilityDescriptor({
    providerId,
    label: "Nous Portal",
    adapterVersion: "openai-compatible-chat.v1",
    backendKind: "openai-compatible-api",
    modelFamilies: [modelFamily],
    modalities: ["text"],
    toolSupport: "none",
    structuredOutputSupport: "unsupported",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
    dataHandlingNotes: "Remote Nous Portal provider used only after provider byte-transfer approval.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["requires-byte-transfer-approval"],
    fakeSupport: false
  });
}

function parseLiveEvidenceTriageOutput(outputText: string): EvidenceTriageClassifyOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error(`Live Nous output invalid JSON; outputChars=${outputText.length}`);
  }
  try {
    const validated = validateProductionSpecialistProviderOutput({ runType, value: parsed });
    if (validated.runType !== runType) {
      throw new Error("wrong-run-type");
    }
    return validated.value;
  } catch (error) {
    const issues = typeof error === "object" && error !== null && "issues" in error && Array.isArray((error as { readonly issues?: unknown }).issues)
      ? (error as { readonly issues: readonly { readonly path?: readonly unknown[]; readonly code?: string }[] }).issues
        .slice(0, 8)
        .map((issue) => `${issue.code ?? "issue"}:${(issue.path ?? []).join(".")}`)
        .join(",")
      : "unknown";
    throw new Error(`Live Nous output schema invalid; outputChars=${outputText.length}; issues=${issues}`);
  }
}

function seedResolvedContextPayloads(
  store: MemoryManifestStore,
  resolvedContextPacks: readonly VerifiedResolvedContextPack[]
): void {
  for (const resolved of resolvedContextPacks) {
    const bytes = serializeContextPackPayload(resolved.payload);
    store.seed(
      resolved.ref.contentHash as `sha256:${string}`,
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    );
  }
}

function seedPromptArtifact(
  store: MemoryManifestStore,
  promptArtifact: ReturnType<typeof renderProductionSpecialistPrompt>
): void {
  const bytes = promptArtifactReferenceBytes(promptArtifact);
  store.seed(promptArtifact.manifest.inputArtifactHash as `sha256:${string}`, bytes);
}

function seedLiveEvidenceSourceArtifact(store: MemoryManifestStore): void {
  store.seed(evidenceHash, evidenceSourceBytes);
}

function promptArtifactReferenceBytes(
  promptArtifact: ReturnType<typeof renderProductionSpecialistPrompt>
): Buffer {
  const { inputArtifactHash: _inputArtifactHash, ...manifestWithoutHash } = promptArtifact.manifest;
  return Buffer.from(serializeContextPackPayload({
    manifest: manifestWithoutHash,
    text: promptArtifact.text
  }));
}

function assertNoLiveLeakage(input: {
  readonly ledgerEvents: readonly unknown[];
  readonly projectionDto: unknown;
  readonly preview: unknown;
  readonly apiKey: string;
}): void {
  const serialized = JSON.stringify({
    events: input.ledgerEvents,
    projection: input.projectionDto,
    preview: input.preview
  });
  if (serialized.includes(payloadSentinel)) {
    throw new Error("Live acceptance leaked resolved payload sentinel outside provider/model derivative path.");
  }
  const hasCredentialMaterial = serialized.includes(input.apiKey) ||
    /"authorization"\s*:\s*"[^"]+"/i.test(serialized) ||
    /\bauthorization\s*[:=]\s*(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{8,}/i.test(serialized) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(serialized);
  if (hasCredentialMaterial) {
    throw new Error("Live acceptance leaked provider credential material.");
  }
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
      throw new Error(`Task 9 live manifest artifact is unavailable: ${contentHash}`);
    }
    return Buffer.from(content);
  }
}

function eventOrder(events: readonly Awaited<ReturnType<EventLedger["readAll"]>>[number][], expected: readonly string[]): string[] {
  return events
    .map((event) => event.type === "agent.task.status.changed" ? `${event.type}:${event.payload.status}` : event.type)
    .filter((type) => expected.includes(type));
}

function requireLiveNousApiKey(): string {
  if (env.apiKey === undefined || env.apiKey.length === 0) {
    throw new Error("Live Nous auth binding is missing; source the repo-local environment before running this acceptance.");
  }
  return env.apiKey;
}

function liveNousEnv(): {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly model?: string;
} {
  const apiKey = process.env.CESTUS_AGENT_NOUS_API_KEY;
  const endpoint = process.env.CESTUS_AGENT_NOUS_ENDPOINT;
  const model = process.env.CESTUS_AGENT_NOUS_MODEL;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(model === undefined ? {} : { model })
  };
}

function context(causationId: string) {
  return {
    actor,
    occurredAt: now,
    causationId,
    correlationId: "corr_task9_evidence_triage_live",
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
