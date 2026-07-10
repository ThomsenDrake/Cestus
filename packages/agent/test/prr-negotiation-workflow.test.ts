import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import {
  buildPromptArtifact,
  createAgentRuntime,
  createAgentToolGateway,
  createContextPackRegistry,
  createProviderCapabilityDescriptor,
  FakeModelProvider,
  hashAgentToolPreview,
  promptArtifactAuditMetadata,
  rebuildProviderByteTransferCurrentPreview,
  runPrrNegotiationWorkflow
} from "../src/index.js";
import type {
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProviderAdapter,
  ProviderDescriptor,
  PrrNegotiationFollowUpApprovalPreviewInput,
  ProviderReadinessDto,
  ProviderSetupCard,
  RebuildProviderByteTransferCurrentPreviewInput
} from "../src/index.js";

const now = () => "2026-07-10T01:00:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };
const bodyHash = hashText("follow up body");
const renderedBodyHash = hashText("follow up rendered body");
const subjectHash = hashText("PRR follow-up");
const capabilityRef = hashText("gmail capability");
const remoteEvidenceId = "ev_remote_prompt_001";
const remoteEvidenceEventId = "evt_remote_prompt_evidence_001";
const remoteLinkEventId = "evt_remote_prompt_link_001";
const remoteEvidenceHash = hashText("remote prompt approved evidence");
const remoteProviderJobId = "provider_specialist_prompt_001";
const remoteSourceCollectionId = "src_specialist_prompt";
const remoteImportBatchId = "imp_specialist_prompt_001";

interface RemotePromptEvidenceRefs {
  readonly evidenceEventId: string;
  readonly linkEventId: string;
}

describe("PRR negotiation workflow", () => {
  it("builds declared context, invokes the configured model boundary, drafts locally, and requests follow-up approval", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Private case narrative for investigator review only.",
        requestFollowUpApproval: true,
        citedRuleRefs: ["rule_foia_deadline_001"]
      })
    });
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_prr" });
    await runtime.createTask({
      taskId: "task_prr_001",
      title: "Review PRR deadline",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_001",
      taskId: "task_prr_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_prr"] }
    });

    const builtContextPackIds: string[] = [];
    const contextPacks = createWorkflowContextPacks([
      "prr-read-model.v1",
      "jurisdiction-pack-summary.v1",
      "governance-locks.v1",
      "evidence-summary.v1",
      "agent-memory-summary.v1",
      "task-run-history.v1",
      "workspace-runtime-status.v1"
    ], builtContextPackIds);

    const result = await runPrrNegotiationWorkflow({
      ledger,
      actor,
      now,
      contextPacks,
      runtime,
      providerReadiness: providerReadinessDto("works-locally"),
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    });

    expect(result.handoff.runType).toBe("prr-negotiation");
    expect(result.handoff.status).toBe("waiting-for-approval");
    expect(result.handoff.outputArtifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ artifactKind: "correspondence-draft-artifact", schemaId: "prr-negotiation-handoff.v1" })
    ]));
    expect(result.handoff.toolRequestIds).toHaveLength(1);
    expect(JSON.stringify(result.handoff)).not.toContain("Private case narrative");
    expect(builtContextPackIds).toEqual(expect.arrayContaining([
      "prr-read-model.v1", "jurisdiction-pack-summary.v1", "governance-locks.v1",
      "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"
    ]));

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed"
    ]));
    expect(events.map((event) => event.type)).toContain("agent.specialist-run.step.recorded");
    const drafted = events.find((event) => event.type === "prr.followup.drafted");
    expect(drafted?.payload).toMatchObject({
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      subject: "PRR follow-up",
      bodyHash: renderedBodyHash
    });
    const requested = events.find((event) => event.type === "agent.tool.requested");
    expect(requested?.payload).toMatchObject({
      toolId: "prr.follow-up.execute",
      requiredApprovalClass: "external-message-send",
      sideEffectClass: "external-message-send"
    });
    expect(requested?.payload.sourceEventIds).toEqual(expect.arrayContaining([
      "evt_prr_created_001",
      "evt_prr_initial_sent_001",
      drafted?.id
    ]));
    expect(events.filter((event) => event.type === "agent.tool.requested")).toHaveLength(1);
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "prr.request.sent", "prr.followup.sent", "prr.legal-escalation.confirmed"
    ]));
  });

  it("blocks before model invocation when the selected provider is not ready", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Draft a narrow follow-up for records staff review.",
        requestFollowUpApproval: true,
        citedRuleRefs: ["rule_foia_deadline_001"]
      })
    });
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_prr" });
    await runtime.createTask({
      taskId: "task_prr_001",
      title: "Review PRR deadline",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_001",
      taskId: "task_prr_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_prr"] }
    });

    await expect(runPrrNegotiationWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createWorkflowContextPacks([
        "prr-read-model.v1",
        "jurisdiction-pack-summary.v1",
        "governance-locks.v1",
        "evidence-summary.v1",
        "agent-memory-summary.v1",
        "task-run-history.v1",
        "workspace-runtime-status.v1"
      ], []),
      runtime,
      providerReadiness: providerReadinessDto("provider-unavailable"),
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    })).rejects.toThrow(/provider readiness/i);

    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  });

  it("blocks before model invocation when follow-up approval preview is missing", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Draft a narrow follow-up for records staff review.",
        requestFollowUpApproval: true,
        citedRuleRefs: ["rule_foia_deadline_001"]
      })
    });
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_prr" });
    await runtime.createTask({
      taskId: "task_prr_001",
      title: "Review PRR deadline",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_001",
      taskId: "task_prr_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_prr"] }
    });

    await expect(runPrrNegotiationWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createWorkflowContextPacks([
        "prr-read-model.v1",
        "jurisdiction-pack-summary.v1",
        "governance-locks.v1",
        "evidence-summary.v1",
        "agent-memory-summary.v1",
        "task-run-history.v1",
        "workspace-runtime-status.v1"
      ], []),
      runtime,
      providerReadiness: providerReadinessDto("works-locally"),
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"]
    })).rejects.toThrow(/approval preview/i);

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).not.toContain("agent.model-invocation.requested");
    expect(eventTypes).not.toContain("prr.followup.drafted");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
  });

  it("requires exact provider byte-transfer approval before invoking a remote provider", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new CountingRemoteProvider();
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_prr" });
    await runtime.createTask({
      taskId: "task_prr_001",
      title: "Review PRR deadline",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_001",
      taskId: "task_prr_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_prr"] }
    });
    const remoteEvidence = await appendRemotePromptEvidence(
      ledger,
      remoteSourceCollectionId,
      remoteImportBatchId
    );
    const contextPacks = createWorkflowContextPacks([
      "prr-read-model.v1",
      "jurisdiction-pack-summary.v1",
      "governance-locks.v1",
      "evidence-summary.v1",
      "agent-memory-summary.v1",
      "task-run-history.v1",
      "workspace-runtime-status.v1"
    ], [], remoteEvidence);
    const promptArtifact = await providerApprovedPromptArtifact(contextPacks);
    const remoteReadiness = providerReadinessDto("requires-byte-transfer-approval");

    const runInput = {
      ledger,
      actor,
      now,
      contextPacks,
      runtime,
      providerReadiness: remoteReadiness,
      promptArtifact,
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      credentialRef: {
        credentialRefId: "agent_credref_remote_model",
        providerId: "provider_remote_model",
        kind: "api-key-bearer" as const
      },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    };

    await expect(runPrrNegotiationWorkflow(runInput)).rejects.toThrow(/provider byte-transfer approval/i);
    expect(provider.calls).toHaveLength(0);
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");

    const proof = await providerTransferApprovalProof(ledger, promptArtifact, remoteReadiness.cards[0]!, remoteEvidence);
    const result = await runPrrNegotiationWorkflow({ ...runInput, providerTransferApproval: proof });

    expect(result.handoff.status).toBe("waiting-for-approval");
    expect(provider.calls).toHaveLength(1);
    expect((await ledger.readAll()).map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed"
    ]));
  });

  it("records invalid model output as a safe failed handoff without requesting tools", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "not-json"
    });
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_prr" });
    await runtime.createTask({
      taskId: "task_prr_001",
      title: "Review PRR deadline",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_prr_001",
      taskId: "task_prr_001",
      runType: "prr-negotiation",
      scope: { kind: "workspace", refs: ["ws_prr"] }
    });

    const result = await runPrrNegotiationWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createWorkflowContextPacks([
        "prr-read-model.v1",
        "jurisdiction-pack-summary.v1",
        "governance-locks.v1",
        "evidence-summary.v1",
        "agent-memory-summary.v1",
        "task-run-history.v1",
        "workspace-runtime-status.v1"
      ], []),
      runtime,
      providerReadiness: providerReadinessDto("works-locally"),
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    });

    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: { category: "model-output-invalid", retryable: true }
    });
    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.tool.requested");
    expect(eventTypes).not.toContain("prr.followup.drafted");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
  });
});

function createWorkflowContextPacks(
  ids: readonly string[],
  builtIds: string[],
  remoteRefs: RemotePromptEvidenceRefs = {
    evidenceEventId: remoteEvidenceEventId,
    linkEventId: remoteLinkEventId
  }
) {
  const registry = createContextPackRegistry();
  for (const contextPackId of ids) {
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `${contextPackId} summary`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event"],
        redactionPolicy: "safe-summary-only",
        sourceProjection: "test-projection"
      },
      build: () => {
        builtIds.push(contextPackId);
        return {
          contextPackId,
          version: 1,
          generatedAt: now(),
          payload: { refs: ["evt_context_001"] },
          safeSummary: `${contextPackId} is safe for planning.`,
          provenanceRefs: ["event:evt_context_001", remoteEvidenceId, remoteRefs.evidenceEventId, remoteEvidenceHash],
          sourceEventIds: ["evt_context_001", remoteRefs.evidenceEventId, remoteRefs.linkEventId],
          artifactHashes: [remoteEvidenceHash],
          sizeBudgetBytes: 16_384
        };
      }
    });
  }
  return registry;
}

function followUpApprovalPreview(): PrrNegotiationFollowUpApprovalPreviewInput {
  return {
    provider: "gmail",
    messageSourceEventId: "evt_prr_initial_sent_001",
    message: {
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      cc: [],
      subject: "PRR follow-up",
      subjectHash,
      bodyHash,
      renderedBodyHash,
      attachments: [],
      requiresLegalConfirmation: false,
      providerIdempotencyKey: "followup_prr_req_001_corr_prr_001"
    },
    requestState: {
      requestCreatedEventId: "evt_prr_created_001",
      status: "sent",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false,
      initialSentEventId: "evt_prr_initial_sent_001"
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

function providerReadinessDto(
  state: "works-locally" | "provider-unavailable" | "requires-byte-transfer-approval"
): ProviderReadinessDto {
  const remote = state === "requires-byte-transfer-approval";
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: now(),
    cards: [{
      providerId: remote ? "provider_remote_model" : "provider_fake_local",
      label: remote ? "Remote Model Provider" : "Fake Local Model Provider",
      backendKind: remote ? "openai-compatible-api" : "local-engine",
      capabilitySummary: ["text"],
      credentialKindSummary: [remote ? "api-key-bearer" : "local-no-secret"],
      state,
      requiredApprovalClass: remote ? "provider-byte-transfer" : "none",
      credentialHealth: remote
        ? "local-binding-healthy"
        : state === "works-locally" ? "not-required" : "unverified",
      dataHandlingPosture: remote ? "remote-prompt-byte-transfer-gated" : "local-only",
      ...(remote ? { credentialRefId: "agent_credref_remote_model" } : {}),
      safeActionIds: [remote ? "action_request_provider_byte_transfer_approval" : "action_use_local_provider"]
    }],
    diagnostics: []
  };
}

async function providerApprovedPromptArtifact(
  contextPacks: ReturnType<typeof createContextPackRegistry>
) {
  const contextPackIds = [
    "prr-read-model.v1",
    "jurisdiction-pack-summary.v1",
    "governance-locks.v1",
    "evidence-summary.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ];
  const contextPackRefs = await Promise.all(contextPackIds.map(async (contextPackId) =>
    await contextPacks.build(contextPackId)
  ));
  return buildPromptArtifact({
    promptTemplateId: "prr-negotiation.review.v1",
    promptTemplateVersion: 1,
    generatedAt: now(),
    runType: "prr-negotiation",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs,
    text: "Use safe context hashes to draft a PRR negotiation review JSON object.",
    safeSummary: "Provider-approved PRR negotiation prompt artifact."
  });
}

async function providerTransferApprovalProof(
  ledger: InMemoryEventLedger,
  promptArtifact: Awaited<ReturnType<typeof providerApprovedPromptArtifact>>,
  providerReadiness: ProviderSetupCard,
  remoteEvidence: RemotePromptEvidenceRefs
) {
  const human = { id: "actor_provider_reviewer", kind: "human" as const, label: "Provider Reviewer" };
  const providerCapability = createProviderCapabilityDescriptor({
    providerId: "provider_remote_model",
    label: "Remote Model Provider",
    adapterVersion: "remote-provider.v1",
    backendKind: "openai-compatible-api",
    modelFamilies: ["remote-safe"],
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
  const providerJobId = remoteProviderJobId;
  const sourceCollectionId = remoteSourceCollectionId;
  const importBatchId = remoteImportBatchId;
  const approval = await new ProviderParseApprovalService({ ledger, actor: human }).approveProviderBatch({
    providerJobId,
    sourceCollectionId,
    importBatchId,
    provider: { name: "provider_remote_model", version: providerCapability.adapterVersion },
    approvedBy: human.id,
    approvedAt: now(),
    eligibleMediaTypes: ["text/plain"],
    maxBytesPerFile: 10_000
  });
  const currentPreviewInput: RebuildProviderByteTransferCurrentPreviewInput = {
    ledger,
    reviewer: human,
    residentAgentId: "agent_default",
    taskId: "task_prr_001",
    providerJobId,
    sourceCollectionId,
    importBatchId,
    providerId: "provider_remote_model",
    approvalEventId: approval.id,
    credentialRefId: "agent_credref_remote_model",
    evidenceBindings: [{
      evidenceId: remoteEvidenceId,
      evidenceEventId: remoteEvidence.evidenceEventId,
      linkEventId: remoteEvidence.linkEventId,
      contentHash: remoteEvidenceHash,
      byteCount: 422,
      mediaType: "text/plain"
    }],
    approvedProviderCapability: providerCapability,
    approvedProviderReadiness: providerReadiness,
    approvedPromptArtifact: promptArtifactAuditMetadata(promptArtifact),
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => providerCapability },
    readProviderReadiness: async () => ({
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: now(),
      cards: [providerReadiness],
      diagnostics: []
    }),
    readPromptArtifactAudit: async () => promptArtifactAuditMetadata(promptArtifact),
    toolRequestId: "toolreq_provider_transfer_prr_001",
    toolId: "provider.bytes.transfer",
    toolVersion: "0.1.0",
    runId: "run_prr_001",
  };
  const current = await rebuildProviderByteTransferCurrentPreview(currentPreviewInput);
  const approvedPreviewHash = hashAgentToolPreview(current.preview);
  const gateway = createAgentToolGateway({ ledger, actor, now });
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
    rationale: "Approve provider byte transfer for the PRR negotiation prompt."
  });
  return { currentPreviewInput, approvedPreviewHash };
}

async function appendRemotePromptEvidence(
  ledger: InMemoryEventLedger,
  sourceCollectionId: string,
  importBatchId: string
) {
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
      source: { kind: "file", label: "approved-specialist-prompt.txt" },
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
      occurrenceIds: ["occ_remote_prompt_001"]
    }
  });
  return { evidenceEventId: evidenceEvent.id, linkEventId: linkEvent.id };
}

class CountingRemoteProvider implements ModelProviderAdapter {
  readonly calls: ModelInvocationRequest[] = [];

  describe(): ProviderDescriptor {
    return {
      providerId: "provider_remote_model",
      label: "Remote Model Provider",
      adapterVersion: "remote-provider.v1",
      endpointKind: "openai-compatible-api",
      modelFamilies: ["remote-safe"],
      credentialKinds: ["api-key-bearer"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Remote provider used only with approved prompt artifacts."
    };
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    this.calls.push(request);
    return {
      outputText: JSON.stringify({
        draftSummary: "Remote private case narrative for review.",
        requestFollowUpApproval: true,
        citedRuleRefs: ["rule_foia_deadline_001"]
      }),
      outputArtifactHash: hashText(`remote:${request.invocationId}`),
      usage: { inputUnits: 13, outputUnits: 17 }
    };
  }
}

function hashText(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
