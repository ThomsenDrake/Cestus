import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  SecretMaterial,
  StaticSecretStore,
  buildPromptArtifact,
  createAgentRuntime,
  createAgentToolGateway,
  createContextPackRegistry,
  createNousPortalProvider,
  createProviderCapabilityDescriptor,
  createSpecialistDerivativeArtifactStore,
  hashAgentToolPreview,
  promptArtifactAuditMetadata,
  rebuildProviderByteTransferCurrentPreview,
  runPrrNegotiationWorkflow
} from "../src/index.js";
import type {
  ContextPackRegistry,
  ProviderReadinessDto,
  ProviderSetupCard,
  PrrNegotiationFollowUpApprovalPreviewInput,
  RebuildProviderByteTransferCurrentPreviewInput
} from "../src/index.js";

const liveFlag = process.env.CESTUS_AGENT_LIVE_NOUS;
const env = loadNousEnv(process.cwd());
const liveDescribe = liveFlag === "1" ? describe : describe.skip;
const now = () => "2026-07-10T02:00:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };
const human = { id: "actor_provider_reviewer", kind: "human" as const, label: "Provider Reviewer" };
const defaultModel = "tencent/hy3:free";
const providerId = "provider_nous_portal";
const credentialRefId = "agent_credref_nous_portal";
const prrRequestId = "prr_req_live_001";
const correspondenceId = "corr_prr_live_001";
const remoteEvidenceId = "ev_live_prompt_001";
const remoteEvidenceHash = hashText("live prr negotiation approved prompt evidence");
const providerJobId = "provider_live_prr_prompt_001";
const sourceCollectionId = "src_live_prr_prompt";
const importBatchId = "imp_live_prr_prompt_001";
const bodyHash = hashText("live follow up body");
const renderedBodyHash = hashText("live follow up rendered body");
const subjectHash = hashText("Live PRR follow-up");
const capabilityRef = hashText("live gmail capability");

interface RemotePromptEvidenceRefs {
  readonly evidenceEventId: string;
  readonly linkEventId: string;
}

liveDescribe("live Nous PRR negotiation workflow acceptance", () => {
  it("runs through the resident runtime with current provider-transfer approval and safe outputs only", async () => {
    if (env.apiKey === undefined) {
      throw new Error("Live Nous auth binding is missing.");
    }
    const modelFamily = env.model ?? defaultModel;
    const ledger = new InMemoryEventLedger();
    const provider = createNousPortalProvider({
      secretStore: new StaticSecretStore({
        [credentialRefId]: SecretMaterial.fromRuntimeValue(env.apiKey)
      }),
      ...(env.endpoint === undefined ? {} : { endpointUrl: env.endpoint }),
      modelId: modelFamily,
      includeReasoning: false,
      reasoningEffort: "none"
    });
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_live_prr" });
    await runtime.createTask({
      taskId: "task_prr_live_001",
      title: "Live PRR negotiation acceptance",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_live_001",
      taskId: "task_prr_live_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_live_prr"] }
    });
    const derivativeStore = createDerivativeStore();

    const remoteEvidence = await appendLivePromptEvidence(ledger);
    const contextPacks = createLiveContextPacks(remoteEvidence);
    const promptArtifact = await providerApprovedPromptArtifact(contextPacks);
    const providerCapability = providerCapabilityDescriptor(modelFamily);
    const providerReadiness = providerReadinessDto(modelFamily).cards[0]!;
    const proof = await providerTransferApprovalProof({
      ledger,
      promptArtifact,
      providerReadiness,
      providerCapability,
      remoteEvidence
    });

    const result = await runPrrNegotiationWorkflow({
      ledger,
      actor,
      now,
      contextPacks,
      runtime,
      providerReadiness: providerReadinessDto(modelFamily),
      providerTransferApproval: proof,
      promptArtifact,
      runId: "run_prr_live_001",
      taskId: "task_prr_live_001",
      providerId,
      modelFamily,
      credentialRef: {
        credentialRefId,
        providerId,
        kind: "api-key-bearer"
      },
      derivativeStore,
      prrRequestId,
      correspondenceId,
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    });

    expect(result.handoff.residentAgentId).toBe("agent_default");
    expect(["ready-for-review", "waiting-for-approval"]).toContain(result.handoff.status);
    expect(result.handoff.outputArtifacts).toHaveLength(1);
    expect(result.handoff.outputArtifacts[0]?.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(derivativeStore.get(result.handoff.outputArtifacts[0]!.artifactHash)).resolves.toBeInstanceOf(Buffer);
    expect(result.handoff.promptArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.specialist-run.step.recorded"
    ]));
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      "prr.request.sent",
      "prr.followup.sent",
      "prr.legal-escalation.confirmed",
      "agent.tool.completed",
      "agent.tool.execution.claimed"
    ]));
    expect(events.filter((event) => event.type === "agent.model-invocation.completed")).toHaveLength(1);

    if (result.handoff.status === "waiting-for-approval") {
      expect(result.handoff.toolRequestIds).toHaveLength(1);
      const prrRequest = events.find((event): event is Extract<typeof events[number], { type: "agent.tool.requested" }> =>
        event.type === "agent.tool.requested" &&
        event.payload.toolId === "prr.follow-up.execute"
      );
      expect(prrRequest?.payload.requiredApprovalClass).toBe("external-message-send");
    } else {
      expect(result.handoff.toolRequestIds).toHaveLength(0);
    }

    assertNoSensitiveLiveMaterial(JSON.stringify({ events, handoff: result.handoff }), env);
  }, 90_000);
});

function createDerivativeStore() {
  const blobStore = new FileBlobStore(mkdtempSync(join(tmpdir(), "cestus-agent-prr-live-")));
  const derivativeStore = createSpecialistDerivativeArtifactStore(blobStore);
  return Object.freeze({
    put: derivativeStore.put,
    get: blobStore.get.bind(blobStore)
  });
}

function createLiveContextPacks(remoteRefs: RemotePromptEvidenceRefs): ContextPackRegistry {
  const registry = createContextPackRegistry();
  for (const contextPackId of [
    "prr-read-model.v1",
    "jurisdiction-pack-summary.v1",
    "governance-locks.v1",
    "evidence-summary.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ]) {
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `${contextPackId} live summary`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event"],
        redactionPolicy: "safe-summary-only",
        sourceProjection: "live-test-projection"
      },
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: now(),
        payload: {
          prrRequestId,
          correspondenceId,
          citedRuleRefs: ["rule_foia_deadline_001"],
          providerBoundary: "provider-byte-transfer-approved"
        },
        safeSummary: `${contextPackId} contains safe live acceptance references.`,
        provenanceRefs: ["event:evt_context_live_001", remoteEvidenceId, remoteRefs.evidenceEventId, remoteEvidenceHash],
        sourceEventIds: ["evt_context_live_001", remoteRefs.evidenceEventId, remoteRefs.linkEventId],
        artifactHashes: [remoteEvidenceHash],
        sizeBudgetBytes: 16_384
      })
    });
  }
  return registry;
}

async function providerApprovedPromptArtifact(contextPacks: ContextPackRegistry) {
  const contextPackRefs = await Promise.all([
    "prr-read-model.v1",
    "jurisdiction-pack-summary.v1",
    "governance-locks.v1",
    "evidence-summary.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ].map(async (contextPackId) => await contextPacks.build(contextPackId)));
  return buildPromptArtifact({
    promptTemplateId: "prr-negotiation.review.v1",
    promptTemplateVersion: 1,
    generatedAt: now(),
    runType: "prr-negotiation",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs,
    text: strictPrrNegotiationPrompt(),
    safeSummary: "Provider-approved live PRR negotiation prompt artifact."
  });
}

function strictPrrNegotiationPrompt(): string {
  return [
    "Return only one JSON object and no markdown.",
    "The object must have exactly these keys: draftSummary, requestFollowUpApproval, citedRuleRefs.",
    "draftSummary must be a short safe review summary for a local PRR follow-up draft.",
    "requestFollowUpApproval must be a boolean.",
    "citedRuleRefs must be an array containing only safe rule reference strings.",
    "Use this exact minimal valid shape if unsure:",
    "{\"draftSummary\":\"Local PRR follow-up draft is ready for human review.\",\"requestFollowUpApproval\":false,\"citedRuleRefs\":[\"rule_foia_deadline_001\"]}",
    "Do not include extra keys. Do not claim anything was sent, approved, escalated, exported, or accepted as graph truth."
  ].join("\n");
}

function providerReadinessDto(modelFamily: string): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: now(),
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
    dataHandlingNotes: "Remote provider used only with approved prompt artifacts.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["requires-byte-transfer-approval"],
    fakeSupport: false
  });
}

async function providerTransferApprovalProof(input: {
  readonly ledger: InMemoryEventLedger;
  readonly promptArtifact: Awaited<ReturnType<typeof providerApprovedPromptArtifact>>;
  readonly providerReadiness: ProviderSetupCard;
  readonly providerCapability: ReturnType<typeof providerCapabilityDescriptor>;
  readonly remoteEvidence: RemotePromptEvidenceRefs;
}) {
  const approval = await new ProviderParseApprovalService({ ledger: input.ledger, actor: human }).approveProviderBatch({
    providerJobId,
    sourceCollectionId,
    importBatchId,
    provider: { name: providerId, version: input.providerCapability.adapterVersion },
    approvedBy: human.id,
    approvedAt: now(),
    eligibleMediaTypes: ["text/plain"],
    maxBytesPerFile: 10_000
  });
  const currentPreviewInput: RebuildProviderByteTransferCurrentPreviewInput = {
    ledger: input.ledger,
    reviewer: human,
    residentAgentId: "agent_default",
    taskId: "task_prr_live_001",
    providerJobId,
    sourceCollectionId,
    importBatchId,
    providerId,
    approvalEventId: approval.id,
    credentialRefId,
    evidenceBindings: [{
      evidenceId: remoteEvidenceId,
      evidenceEventId: input.remoteEvidence.evidenceEventId,
      linkEventId: input.remoteEvidence.linkEventId,
      contentHash: remoteEvidenceHash,
      byteCount: 422,
      mediaType: "text/plain"
    }],
    approvedProviderCapability: input.providerCapability,
    approvedProviderReadiness: input.providerReadiness,
    approvedPromptArtifact: promptArtifactAuditMetadata(input.promptArtifact),
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => input.providerCapability },
    readProviderReadiness: async () => ({
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: now(),
      cards: [input.providerReadiness],
      diagnostics: []
    }),
    readPromptArtifactAudit: async () => promptArtifactAuditMetadata(input.promptArtifact),
    toolRequestId: "toolreq_provider_transfer_prr_live_001",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId: "run_prr_live_001"
  };
  const current = await rebuildProviderByteTransferCurrentPreview(currentPreviewInput);
  const approvedPreviewHash = hashAgentToolPreview(current.preview);
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor, now });
  await gateway.requestTool({
    toolRequestId: currentPreviewInput.toolRequestId,
    residentAgentId: "agent_default",
    taskId: currentPreviewInput.taskId,
    runId: currentPreviewInput.runId,
    toolId: currentPreviewInput.toolId,
    toolVersion: currentPreviewInput.toolVersion,
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    preview: current.preview,
    inputArtifactHashes: current.inputArtifactHashes
  });
  await gateway.approveTool({
    toolRequestId: currentPreviewInput.toolRequestId,
    approvedPreviewHash,
    actor: human,
    rationale: "Approve provider byte transfer for the live PRR negotiation prompt."
  });
  return { currentPreviewInput, approvedPreviewHash };
}

async function appendLivePromptEvidence(ledger: InMemoryEventLedger): Promise<RemotePromptEvidenceRefs> {
  const evidenceEvent = await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${remoteEvidenceId}`,
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: now(),
      correlationId: `corr_${remoteEvidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: remoteEvidenceId,
      source: { kind: "file", label: "approved-live-prr-prompt.txt" },
      contentHash: remoteEvidenceHash,
      mediaType: "text/plain",
      sizeBytes: 422
    }
  });
  const linkEvent = await ledger.append({
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: `ingestion_evidence_link_${sourceCollectionId}_${importBatchId}`,
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: now(),
      causationId: evidenceEvent.id,
      correlationId: `corr_${importBatchId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: remoteEvidenceId,
      importBatchId,
      sourceCollectionId,
      contentHash: remoteEvidenceHash,
      occurrenceIds: ["occ_live_prompt_001"]
    }
  });
  return { evidenceEventId: evidenceEvent.id, linkEventId: linkEvent.id };
}

function followUpApprovalPreview(): PrrNegotiationFollowUpApprovalPreviewInput {
  return {
    provider: "gmail",
    messageSourceEventId: "evt_prr_initial_sent_live_001",
    message: {
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      cc: [],
      subject: "Live PRR follow-up",
      subjectHash,
      bodyHash,
      renderedBodyHash,
      attachments: [],
      requiresLegalConfirmation: false,
      providerIdempotencyKey: "followup_prr_req_live_001_corr_prr_live_001"
    },
    requestState: {
      requestCreatedEventId: "evt_prr_created_live_001",
      status: "sent",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false,
      initialSentEventId: "evt_prr_initial_sent_live_001"
    },
    providerCapability: {
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: false,
      capabilityRef
    },
    legalGateChecks: [{
      id: "legal-confirmation-not-required",
      ready: true,
      locked: false,
      detail: "Routine follow-up does not require legal escalation confirmation."
    }],
    legalEvidenceBindings: [],
    lockSnapshot: [],
    projectionHighWaterMark: 7
  };
}

function loadNousEnv(cwd: string): {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly model?: string;
} {
  const values: Record<string, string> = {};
  const envPath = join(cwd, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0) {
        values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  const apiKey = process.env.CESTUS_AGENT_NOUS_API_KEY ?? values.CESTUS_AGENT_NOUS_API_KEY;
  const endpoint = process.env.CESTUS_AGENT_NOUS_ENDPOINT ?? values.CESTUS_AGENT_NOUS_ENDPOINT;
  const model = process.env.CESTUS_AGENT_NOUS_MODEL ?? values.CESTUS_AGENT_NOUS_MODEL;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(model === undefined ? {} : { model })
  };
}

function assertNoSensitiveLiveMaterial(serialized: string, liveEnv: ReturnType<typeof loadNousEnv>): void {
  if (liveEnv.apiKey !== undefined && serialized.includes(liveEnv.apiKey)) {
    throw new Error("Live acceptance leaked provider auth material.");
  }
  if (serialized.includes(strictPrrNegotiationPrompt())) {
    throw new Error("Live acceptance persisted prompt text.");
  }
  if (/authorization\s*[:=]|Bearer\s+/i.test(serialized)) {
    throw new Error("Live acceptance leaked provider auth header material.");
  }
}

function hashText(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
