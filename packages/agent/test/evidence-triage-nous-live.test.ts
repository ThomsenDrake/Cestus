import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import {
  SecretMaterial,
  StaticSecretStore,
  buildProviderByteTransferApprovalPreview,
  createAgentRuntime,
  createAgentToolGateway,
  createContextPackRegistry,
  createNousPortalProvider,
  createProviderCapabilityDescriptor,
  createSpecialistDerivativeArtifactStore,
  hashAgentToolPreview,
  promptArtifactAuditMetadata,
  providerParseExecuteDescriptor,
  renderProductionSpecialistPrompt,
  rebuildProviderByteTransferCurrentPreview,
  runEvidenceTriageWorkflow
} from "../src/index.js";
import type {
  AgentToolPreview,
  AgentContextPackJsonValue,
  ContextPackRegistry,
  ProviderReadinessDto,
  ProviderSetupCard,
  RebuildProviderByteTransferCurrentPreviewInput
} from "../src/index.js";

const liveFlag = process.env.CESTUS_AGENT_LIVE_NOUS;
const env = loadNousEnv(process.cwd());
const liveDescribe = liveFlag === "1" ? describe : describe.skip;
const now = () => "2026-07-10T02:45:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };
const human = { id: "actor_provider_reviewer", kind: "human" as const, label: "Provider Reviewer" };
const defaultModel = "tencent/hy3:free";
const providerId = "provider_nous_portal";
const credentialRefId = "agent_credref_nous_portal";
const runId = "run_evidence_triage_live_001";
const taskId = "task_evidence_triage_live_001";
const remoteEvidenceId = "ev_live_evidence_triage_prompt_001";
const remoteEvidenceHash = hashText("live evidence triage approved prompt evidence");
const providerJobId = "provider_live_evidence_triage_prompt_001";
const sourceCollectionId = "src_live_evidence_triage_prompt";
const importBatchId = "imp_live_evidence_triage_prompt_001";
const payloadSentinel = "PAYLOAD_SENTINEL_CITY_LEDGER_427";
const importedEvidenceScope = { kind: "imported-evidence", refs: ["ev_live_imported_non_prr_001"] } as const;

interface RemotePromptEvidenceRefs {
  readonly evidenceEventId: string;
  readonly linkEventId: string;
}

liveDescribe("live Nous evidence triage workflow acceptance", () => {
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
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_live_evidence_triage" });
    await runtime.createTask({
      taskId,
      title: "Live evidence triage acceptance",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId,
      taskId,
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_live_evidence_triage"] }
    });
    const derivativeStore = createDerivativeStore();

    const remoteEvidence = await appendLivePromptEvidence(ledger);
    const contextPacks = createLiveContextPacks(remoteEvidence);
    const promptArtifact = await providerApprovedPromptArtifact(contextPacks);
    const evidenceSummary = promptArtifact.resolvedContextPacks?.find((pack) => pack.ref.contextPackId === "evidence-summary.v1");
    expect(evidenceSummary?.ref.safeSummary).not.toContain(payloadSentinel);
    expect(JSON.stringify(evidenceSummary?.payload)).toContain(payloadSentinel);
    expect(promptArtifact.manifest.contextPackRefs.map((ref) => ref.contextPackId)).not.toContain("prr-read-model.v1");
    expect(promptArtifact.manifest.omissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "no-associated-prr", sourceRef: "prr-read-model.v1" })
    ]));
    const providerCapability = providerCapabilityDescriptor(modelFamily);
    const providerReadiness = providerReadinessDto(modelFamily).cards[0]!;
    const proof = await providerTransferApprovalProof({
      ledger,
      promptArtifact,
      providerReadiness,
      providerCapability,
      remoteEvidence
    });

    const result = await runEvidenceTriageWorkflow({
      ledger,
      actor,
      now,
      contextPacks,
      runtime,
      providerReadiness: providerReadinessDto(modelFamily),
      providerTransferApproval: proof,
      promptArtifact,
      runId,
      taskId,
      providerId,
      modelFamily,
      credentialRef: {
        credentialRefId,
        providerId,
        kind: "api-key-bearer"
      },
      derivativeStore,
      evidenceIds: [remoteEvidenceId],
      providerParseApprovalPreview: providerParsePreview(promptArtifact, remoteEvidence),
      scope: importedEvidenceScope
    });

    expect(result.handoff.residentAgentId).toBe("agent_default");
    expect(result.handoff.status).toBe("ready-for-review");
    expect(result.handoff.outputArtifacts.length).toBeGreaterThanOrEqual(6);
    const artifactBuffers = await Promise.all(result.handoff.outputArtifacts.map(async (artifact) => ({
      artifact,
      buffer: await derivativeStore.get(artifact.artifactHash)
    })));
    for (const artifact of result.handoff.outputArtifacts) {
      expect(artifact.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      await expect(derivativeStore.get(artifact.artifactHash)).resolves.toBeInstanceOf(Buffer);
    }
    expect(result.handoff.promptArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const safeSummariesArtifact = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "safe-evidence-summaries");
    const providerSafeOutput = artifactBuffers.find(({ artifact }) => artifact.artifactHash === safeSummariesArtifact!.artifactHash)!.buffer.toString("utf8");
    const parsedProviderSafeOutput = JSON.parse(providerSafeOutput) as { readonly safeSummaries?: readonly string[] };
    expect(parsedProviderSafeOutput.safeSummaries?.some((summary) => summary.includes(payloadSentinel))).toBe(true);
    for (const { artifact, buffer } of artifactBuffers) {
      if (artifact.artifactKind !== "safe-evidence-summaries") {
        expect(buffer.toString("utf8")).not.toContain(payloadSentinel);
      }
    }

    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.specialist-run.step.recorded"
    ]));
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      "evidence.governance.classified",
      "evidence.governance.reviewed",
      "evidence.quarantined",
      "assertion.proposed",
      "assertion.accepted",
      "entity.resolved",
      "relationship.accepted",
      "export.generated",
      "report.generated",
      "prr.request.sent",
      "prr.followup.sent",
      "prr.legal-escalation.confirmed",
      "agent.tool.completed",
      "agent.tool.execution.claimed"
    ]));
    expect(events.filter((event) => event.type === "agent.model-invocation.completed")).toHaveLength(1);

    const requestedTools = events.filter((event) => event.type === "agent.tool.requested");
    expect(result.handoff.toolRequestIds).toEqual([]);
    expect(result.handoff.approvalRequirements).toEqual([]);
    expect(result.handoff.nextSafeActions.map((action) => action.actionId)).toEqual(expect.arrayContaining([
      `action_${runId}_review`,
      `action_${runId}_review_governance`,
      `action_${runId}_review_quarantine`,
      `action_${runId}_review_assertions`
    ]));
    expect(requestedTools).toHaveLength(1);
    expect(requestedTools[0]?.payload).toMatchObject({
      toolRequestId: "toolreq_provider_transfer_evidence_triage_live_001",
      toolId: "provider.bytes.transfer",
      requiredApprovalClass: "provider-byte-transfer"
    });

    assertNoSensitiveLiveMaterial(JSON.stringify({ events, handoff: result.handoff }), env, promptArtifact.text, providerSafeOutput);
  }, 90_000);
});

function createDerivativeStore() {
  const blobStore = new FileBlobStore(mkdtempSync(join(tmpdir(), "cestus-agent-evidence-triage-live-")));
  const derivativeStore = createSpecialistDerivativeArtifactStore(blobStore);
  return Object.freeze({
    put: derivativeStore.put,
    get: blobStore.get.bind(blobStore)
  });
}

function createLiveContextPacks(remoteRefs: RemotePromptEvidenceRefs): ContextPackRegistry {
  const registry = createContextPackRegistry();
  for (const contextPackId of [
    "evidence-summary.v1",
    "governance-locks.v1",
    "accepted-graph-projection.v1",
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
        payload: liveContextPayload(contextPackId, remoteRefs),
        safeSummary: `${contextPackId} contains safe live evidence triage references.`,
        provenanceRefs: ["event:evt_context_live_evidence_001", remoteEvidenceId, remoteRefs.evidenceEventId, remoteEvidenceHash],
        sourceEventIds: ["evt_context_live_evidence_001", remoteRefs.evidenceEventId, remoteRefs.linkEventId],
        artifactHashes: [remoteEvidenceHash],
        sizeBudgetBytes: 16_384
      }),
      parsePayload: liveContextPayloadParser(contextPackId)
    });
  }
  return registry;
}

async function providerApprovedPromptArtifact(contextPacks: ContextPackRegistry) {
  const resolvedContextPacks = await Promise.all([
    "evidence-summary.v1",
    "governance-locks.v1",
    "accepted-graph-projection.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ].map(async (contextPackId) => await contextPacks.buildResolved(contextPackId)));
  return renderProductionSpecialistPrompt({
    runType: "evidence-triage",
    runId,
    taskId,
    generatedAt: now(),
    scope: importedEvidenceScope,
    resolvedContextPacks
  });
}

function liveContextPayload(contextPackId: string, remoteRefs: RemotePromptEvidenceRefs): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "evidence-summary.v1": return { items: [{ evidenceId: remoteEvidenceId, ingestionEventId: remoteRefs.evidenceEventId, contentHash: remoteEvidenceHash, mediaType: "text/plain", sizeBytes: 422, sourceCollectionId, importBatchId, occurrenceIds: ["occ_live_evidence_triage_prompt_001"], parseJobs: [], governanceTags: [], safeNarrative: payloadSentinel }] };
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_live_001", evidenceId: remoteEvidenceId, evidenceContentHash: remoteEvidenceHash, proposedByEventId: remoteRefs.evidenceEventId, acceptedByEventId: remoteRefs.linkEventId, sourceEventIds: [remoteRefs.evidenceEventId], rowHash: remoteEvidenceHash, safeStatement: "Imported evidence requires human review." }], entities: [], relationships: [] } };
    case "governance-locks.v1": return { items: { activeLocks: [{ lockId: "lock_live_review_001", lockKind: "review", safeReason: "Human review is required.", activatedBy: "actor_provider_reviewer", activatedAt: now(), relatedEventIds: [remoteRefs.evidenceEventId], projectionEventIds: [remoteRefs.linkEventId] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: ["Imported evidence triage is pending review."], aggregateCounts: { active: 1 }, sourceEventIds: [remoteRefs.evidenceEventId], artifactHashes: [remoteEvidenceHash] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId, status: "running", priority: "normal", runId, sourceEventIds: [remoteRefs.evidenceEventId] }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: [remoteRefs.evidenceEventId], artifactHashes: [remoteEvidenceHash] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default: throw new Error(`Unsupported live context pack ${contextPackId}`);
  }
}

function liveContextPayloadParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue): AgentContextPackJsonValue => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`Invalid ${contextPackId} live payload`);
    return payload;
  };
  Object.defineProperty(parser, "cestusContextPackParserId", { value: contextPackId });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
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
    taskId,
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
    toolRequestId: "toolreq_provider_transfer_evidence_triage_live_001",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId
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
    rationale: "Approve provider byte transfer for the live evidence triage prompt."
  });
  return { currentPreviewInput, approvedPreviewHash };
}

function providerParsePreview(
  promptArtifact: Awaited<ReturnType<typeof providerApprovedPromptArtifact>>,
  remoteEvidence: RemotePromptEvidenceRefs
): AgentToolPreview {
  return buildProviderByteTransferApprovalPreview({
    toolRequestId: "toolreq_evidence_triage_live_provider_parse",
    toolId: providerParseExecuteDescriptor.toolId,
    toolVersion: providerParseExecuteDescriptor.toolVersion,
    runId,
    taskId,
    residentAgentId: "agent_default",
    providerJobId: "provider_parse_evidence_triage_live_001",
    sourceCollectionId: "src_evidence_triage_live",
    importBatchId: "imp_evidence_triage_live_001",
    providerId,
    providerCapability: providerCapabilityDescriptor(env.model ?? defaultModel),
    providerReadiness: providerReadinessDto(env.model ?? defaultModel).cards[0]!,
    credentialRefId,
    providerApprovalEventId: "evt_provider_parse_live_001",
    providerApproval: {
      eventId: "evt_provider_parse_live_001",
      providerJobId: "provider_parse_evidence_triage_live_001",
      sourceCollectionId: "src_evidence_triage_live",
      importBatchId: "imp_evidence_triage_live_001",
      provider: { name: providerId, version: "openai-compatible-chat.v1" },
      approvedBy: human.id,
      approvedAt: now(),
      eligibleMediaTypes: ["text/plain"],
      maxBytesPerFile: 10_000,
      policy: "send-all-technically-eligible"
    },
    evidenceBindings: [{
      evidenceId: remoteEvidenceId,
      evidenceEventId: remoteEvidence.evidenceEventId,
      linkEventId: remoteEvidence.linkEventId,
      contentHash: remoteEvidenceHash,
      byteCount: 422,
      mediaType: "text/plain"
    }],
    promptArtifact: promptArtifactAuditMetadata(promptArtifact),
    excerptPolicy: "send-full-technically-eligible",
    governanceTags: ["public_record"],
    activeLocks: [],
    projectionHighWaterMark: 9,
    domainReviewerId: human.id
  });
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
      source: { kind: "file", label: "approved-live-evidence-triage-prompt.txt" },
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
      occurrenceIds: ["occ_live_evidence_triage_prompt_001"]
    }
  });
  return { evidenceEventId: evidenceEvent.id, linkEventId: linkEvent.id };
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

function assertNoSensitiveLiveMaterial(serialized: string, liveEnv: ReturnType<typeof loadNousEnv>, promptText: string, providerSafeOutput: string): void {
  if (liveEnv.apiKey !== undefined && serialized.includes(liveEnv.apiKey)) {
    throw new Error("Live acceptance leaked provider auth material.");
  }
  if (serialized.includes(promptText)) {
    throw new Error("Live acceptance persisted prompt text.");
  }
  if (serialized.includes(providerSafeOutput) || serialized.includes(payloadSentinel)) {
    throw new Error("Live acceptance persisted provider or resolved-payload text.");
  }
  if (/authorization\s*[:=]|Bearer\s+/i.test(serialized)) {
    throw new Error("Live acceptance leaked provider auth header material.");
  }
}

function hashText(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
