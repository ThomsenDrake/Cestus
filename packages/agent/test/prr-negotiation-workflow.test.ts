import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import {
  FakeCorrespondenceAdapter,
  PrrCorrespondenceService,
  PrrLifecycleService,
  type AdapterCapabilities
} from "../../prr/src/index.js";
import {
  buildAgentProjection,
  buildPrrCorrespondenceApprovalPreview,
  buildPromptArtifact,
  assertResolvedContextPacksForExecution,
  createAgentRuntime,
  createAgentToolGateway,
  createContextPackRegistry,
  createSpecialistDerivativeArtifactStore,
  createPrrFollowUpExecutionAdapter,
  createProviderCapabilityDescriptor,
  FakeModelProvider,
  hashAgentToolPreview,
  promptArtifactAuditMetadata,
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt,
  prrFollowUpExecuteDescriptor,
  rebuildPrrCorrespondenceCurrentPreview,
  rebuildProviderByteTransferCurrentPreview,
  runPrrNegotiationWorkflow
} from "../src/index.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import type {
  AgentApprovedToolExecutionInput,
  AgentContextPackJsonValue,
  ModelInvocationRequest,
  ModelInvocationResult,
  ModelProviderAdapter,
  PrrCorrespondenceAdapterContext,
  PrrCorrespondenceCurrentMessage,
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

interface AuthoritativePrrFollowUpFixture {
  readonly ledger: InMemoryEventLedger;
  readonly created: Awaited<ReturnType<PrrLifecycleService["createRequest"]>>;
  readonly initialSent: Awaited<ReturnType<PrrCorrespondenceService["sendInitialRequest"]>>;
  readonly capabilities: AdapterCapabilities;
  readonly currentMessage: PrrCorrespondenceCurrentMessage;
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
    const derivativeStore = createDerivativeStore();
    const followUpPreview = followUpApprovalPreview();
    const expectedPreflightPreview = buildPrrCorrespondenceApprovalPreview({
      ...followUpPreview,
      toolRequestId: "toolreq_run_prr_001_followup",
      toolId: prrFollowUpExecuteDescriptor.toolId,
      toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
      runId: "run_prr_001",
      taskId: "task_prr_001",
      residentAgentId: "agent_default",
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      messageSourceEventId: followUpPreview.messageSourceEventId
    });

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
      derivativeStore,
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpPreview
    });

    expect(result.handoff.runType).toBe("prr-negotiation");
    expect(result.handoff.status).toBe("waiting-for-approval");
    expect(result.handoff.outputArtifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ artifactKind: "correspondence-draft-artifact", schemaId: "prr-negotiation-handoff.v1" })
    ]));
    const draftHash = result.handoff.outputArtifacts[0]!.artifactHash;
    const draftPayload = JSON.parse((await derivativeStore.get(draftHash)).toString("utf8"));
    expect(draftPayload).toMatchObject({
      schemaVersion: "prr-negotiation-handoff.v1",
      artifactKind: "correspondence-draft-artifact",
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001"
    });
    expect(draftPayload.domainSourceBindings).toEqual({
      normalizedInputHash: expectedPreflightPreview.normalizedInputHash,
      relatedEventIds: expectedPreflightPreview.relatedEventIds,
      artifactHashes: [...new Set(expectedPreflightPreview.artifactHashes ?? [])],
      provider: expectedPreflightPreview.provider,
      subjectHash,
      bodyHash,
      renderedBodyHash,
      projectionHighWaterMarks: expectedPreflightPreview.projectionHighWaterMarks
    });
    expect(JSON.stringify(draftPayload.domainSourceBindings)).not.toMatch(
      /investigator@example\.org|foia@example\.gov|follow up body|follow up rendered body|PRR follow-up/
    );
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
    const step = events.find((event) => event.type === "agent.specialist-run.step.recorded");
    const completed = events.find((event): event is Extract<typeof events[number], { type: "agent.specialist-run.completed" }> =>
      event.type === "agent.specialist-run.completed"
    );
    expect(completed?.payload.outputArtifactHashes).toEqual([draftHash]);
    expect(completed?.payload.relatedEventIds).toEqual([step?.id, requested?.id]);
    expect(result.eventIds).toEqual(expect.arrayContaining([completed!.id]));
    expect(buildAgentProjection(events).runs.get("run_prr_001")).toMatchObject({
      state: "completed",
      toolRequestIds: [requested?.payload.toolRequestId]
    });
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "prr.request.sent", "prr.followup.sent", "prr.legal-escalation.confirmed"
    ]));
  });

  it("completes the local PRR advisory run when no follow-up approval is requested", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Private case narrative for investigator review only.",
        requestFollowUpApproval: false,
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
      derivativeStore: createDerivativeStore(),
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    });

    expect(result.handoff.status).toBe("ready-for-review");
    expect(result.handoff.toolRequestIds).toEqual([]);
    const events = await ledger.readAll();
    const step = events.find((event) => event.type === "agent.specialist-run.step.recorded");
    const completed = events.find((event): event is Extract<typeof events[number], { type: "agent.specialist-run.completed" }> =>
      event.type === "agent.specialist-run.completed"
    );
    expect(completed?.payload.relatedEventIds).toEqual([step?.id]);
    expect(events.map((event) => event.type)).not.toContain("agent.tool.requested");
    expect(buildAgentProjection(events).runs.get("run_prr_001")).toMatchObject({
      state: "completed",
      toolRequestIds: []
    });
  });

  it("records PRR follow-up requests with exact rebuildable correspondence adapter bindings", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Private negotiation advisory for investigator review only.",
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
    const authoritative = await prepareAuthoritativePrrFollowUp(ledger);
    const derivativeStore = createDerivativeStore();

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
      derivativeStore,
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview({
        requestCreatedEventId: authoritative.created.id,
        initialSentEventId: authoritative.initialSent.id,
        providerCapabilities: authoritative.capabilities,
        projectionHighWaterMark: 3
      })
    });

    const draftHash = result.handoff.outputArtifacts[0]!.artifactHash;
    await expect(derivativeStore.get(draftHash)).resolves.toBeInstanceOf(Buffer);

    const events = await ledger.readAll();
    const drafted = events.find((event): event is Extract<typeof events[number], { type: "prr.followup.drafted" }> =>
      event.type === "prr.followup.drafted" && event.payload.correspondenceId === "corr_prr_001"
    );
    expect(drafted).toBeDefined();
    const context = prrFollowUpAdapterContext(authoritative, drafted!.id);
    const current = await rebuildPrrCorrespondenceCurrentPreview({
      ...context,
      toolRequestId: "toolreq_run_prr_001_followup",
      toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
      runId: "run_prr_001"
    });
    const request = requestedToolPayload(events, prrFollowUpExecuteDescriptor.toolId);

    expect(request.sourceEventIds).toEqual(current.sourceEventIds);
    expect(request.inputArtifactHashes).toEqual(current.inputArtifactHashes);
    expect(request.inputArtifactHashes).toEqual(current.preview.artifactHashes);
    expect(request.inputArtifactHashes).not.toContain(draftHash);
    expect(request.previewHash).toBe(hashAgentToolPreview(current.preview));

    expect(request.previewHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const execution = prrExecutionInput(context, current, request.previewHash as `sha256:${string}`);
    const executionResult = await createPrrFollowUpExecutionAdapter(context).executeApproved(execution);
    expect(executionResult.eventIds).toHaveLength(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("prr.followup.sent");
  });

  it("deduplicates PRR follow-up request artifact hashes exactly like the correspondence adapter", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        draftSummary: "Private negotiation advisory for investigator review only.",
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
    const duplicateMessage: PrrCorrespondenceCurrentMessage = {
      ...defaultPrrFollowUpMessage(),
      body: "follow up body",
      renderedBody: "follow up body"
    };
    const authoritative = await prepareAuthoritativePrrFollowUp(ledger, { currentMessage: duplicateMessage });

    await runPrrNegotiationWorkflow({
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
      derivativeStore: createDerivativeStore(),
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview({
        requestCreatedEventId: authoritative.created.id,
        initialSentEventId: authoritative.initialSent.id,
        providerCapabilities: authoritative.capabilities,
        projectionHighWaterMark: 3,
        message: authoritative.currentMessage
      })
    });

    const events = await ledger.readAll();
    const drafted = events.find((event): event is Extract<typeof events[number], { type: "prr.followup.drafted" }> =>
      event.type === "prr.followup.drafted" && event.payload.correspondenceId === "corr_prr_001"
    );
    expect(drafted).toBeDefined();
    const context = prrFollowUpAdapterContext(authoritative, drafted!.id);
    const current = await rebuildPrrCorrespondenceCurrentPreview({
      ...context,
      toolRequestId: "toolreq_run_prr_001_followup",
      toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
      runId: "run_prr_001"
    });
    const request = requestedToolPayload(events, prrFollowUpExecuteDescriptor.toolId);

    expect(current.preview.artifactHashes).toEqual([bodyHash, bodyHash]);
    expect(current.inputArtifactHashes).toEqual([bodyHash]);
    expect(request.inputArtifactHashes).toEqual(current.inputArtifactHashes);
    expect(request.inputArtifactHashes).not.toEqual(current.preview.artifactHashes);
    expect(request.previewHash).toBe(hashAgentToolPreview(current.preview));

    const execution = prrExecutionInput(context, current, request.previewHash as `sha256:${string}`);
    const executionResult = await createPrrFollowUpExecutionAdapter(context).executeApproved(execution);
    expect(executionResult.eventIds).toHaveLength(1);
    expect((await ledger.readAll()).map((event) => event.type)).toContain("prr.followup.sent");
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
      derivativeStore: createDerivativeStore(),
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
      derivativeStore: createDerivativeStore(),
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"]
    })).rejects.toThrow(/approval preview/i);

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).not.toContain("agent.model-invocation.requested");
    expect(eventTypes).not.toContain("prr.followup.drafted");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
  });

  it("rejects hostile follow-up approval previews before model, blob, PRR, or tool effects", async () => {
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

    const preview = followUpApprovalPreview();
    const hostileMessage = { ...preview.message };
    let getterCalls = 0;
    Object.defineProperty(hostileMessage, "subject", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return "PRR follow-up";
      }
    });
    const derivativeStore = createCountingDerivativeStore();

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
      derivativeStore: derivativeStore.store,
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: {
        ...preview,
        message: hostileMessage as typeof preview.message
      }
    })).rejects.toThrow(/data properties|approval preview|PRR correspondence preview input/i);

    expect(getterCalls).toBe(0);
    expect(derivativeStore.putCalls()).toBe(0);
    expectNoPrrPreflightEffects(await ledger.readAll());
  });

  it("rejects stale follow-up approval preview identity before model, blob, PRR, or tool effects", async () => {
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
    const preview = followUpApprovalPreview();
    const derivativeStore = createCountingDerivativeStore();

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
      derivativeStore: derivativeStore.store,
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: {
        ...preview,
        message: {
          ...preview.message,
          providerIdempotencyKey: "followup_prr_req_999_corr_prr_001"
        }
      }
    })).rejects.toThrow(/idempotency key/i);

    expect(derivativeStore.putCalls()).toBe(0);
    expectNoPrrPreflightEffects(await ledger.readAll());
  });

  it("blocks before model invocation when derivative storage is unavailable", async () => {
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
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    })).rejects.toThrow(/derivative artifact store/i);

    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  });

  it("records a safe failed handoff when advisory artifact storage fails after model invocation", async () => {
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
      derivativeStore: { put: async () => { throw new Error("private PRR storage failure"); } },
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_prr_001",
      jurisdictionRuleRefs: ["rule_foia_deadline_001"],
      followUpApprovalPreview: followUpApprovalPreview()
    });

    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: {
        category: "external-effect-failed",
        code: "prr-negotiation-derivative-storage-failed",
        retryable: true
      },
      outputArtifacts: [],
      toolRequestIds: []
    });
    expect(JSON.stringify(result.handoff)).not.toContain("private PRR storage failure");
    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toContain("prr.followup.drafted");
    expect(eventTypes).not.toContain("agent.tool.requested");
    expect(buildAgentProjection(events).runs.get("run_prr_001")?.state).toBe("failed");
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
      scope: { kind: "prr-request", refs: ["prr_req_001"], associatedPrrRequestId: "prr_req_001" },
      runId: "run_prr_001",
      taskId: "task_prr_001",
      providerId: "provider_remote_model",
      modelFamily: "remote-safe",
      credentialRef: {
        credentialRefId: "agent_credref_remote_model",
        providerId: "provider_remote_model",
        kind: "api-key-bearer" as const
      },
      derivativeStore: createDerivativeStore(),
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
      derivativeStore: createDerivativeStore(),
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
      parsePayload: workflowContextPackParser(contextPackId),
      build: () => {
        builtIds.push(contextPackId);
        return {
          contextPackId,
          version: 1,
          generatedAt: now(),
          payload: workflowContextPayload(contextPackId),
          safeSummary: `${contextPackId} is safe for planning.`,
          provenanceRefs: ["event:evt_context_001", remoteEvidenceId, remoteRefs.evidenceEventId, remoteEvidenceHash],
          sourceEventIds: ["evt_context_001", remoteRefs.evidenceEventId, remoteRefs.linkEventId],
          artifactHashes: [remoteEvidenceHash],
          ...(contextPackId === "prr-read-model.v1" ? { scope: { kind: "prr-request", id: "prr_req_001" } } : {}),
          sizeBudgetBytes: 16_384
        };
      }
    });
  }
  return registry;
}

function workflowContextPackParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue, ref?: { readonly contextPackId: string }): AgentContextPackJsonValue => {
    if (ref?.contextPackId !== contextPackId || !isWorkflowContextPayloadForPack(contextPackId, payload)) {
      throw new Error("invalid workflow context pack payload");
    }
    return payload;
  };
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    configurable: false,
    writable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function isWorkflowContextPayloadForPack(contextPackId: string, payload: AgentContextPackJsonValue): boolean {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const value = payload as Readonly<Record<string, AgentContextPackJsonValue>>;
  switch (contextPackId) {
    case "prr-read-model.v1":
      return "lifecycle" in value && "requestStream" in value && "diagnostics" in value && "gates" in value;
    case "jurisdiction-pack-summary.v1":
      return "packName" in value && "packVersion" in value && "citedRules" in value;
    case "governance-locks.v1":
    case "accepted-graph-projection.v1":
      return "items" in value;
    case "evidence-summary.v1":
      return Array.isArray(value.items);
    case "agent-memory-summary.v1":
      return "memory" in value;
    case "task-run-history.v1":
      return "history" in value;
    case "workspace-runtime-status.v1":
      return "runtime" in value;
    default:
      return false;
  }
}

function workflowContextPayload(contextPackId: string): unknown {
  switch (contextPackId) {
    case "prr-read-model.v1":
      return {
        scope: { kind: "prr-request", id: "prr_req_001" },
        lifecycle: { status: "sent", agencyName: "Example Agency", jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" } },
        requestStream: { requestCreatedEventId: "evt_prr_created_001", streamHeadEventId: "evt_prr_initial_sent_001", streamHighWaterMark: 7, sourceEventIds: ["evt_prr_created_001", "evt_prr_initial_sent_001"] },
        deadline: { deadlineDate: "2026-08-01", source: "jurisdiction-pack", confidence: 0.9, explanation: "Statutory response window." },
        fee: null,
        narrowing: null,
        correspondence: {
          outbound: [{ correspondenceId: "corr_prr_initial_setup", subject: "Public records request", occurredAt: now(), evidenceIds: [remoteEvidenceId], attachmentEvidenceIds: [] }],
          inbound: []
        },
        production: {
          batches: [],
          evidenceIds: [remoteEvidenceId],
          exemptions: [],
          denial: null,
          appeal: null,
          stalling: { possible: false, confirmed: false, signals: [] },
          escalation: null
        },
        diagnostics: [{ code: "prr-ready", category: "workflow", safeSummary: "PRR context is ready.", sourceEventIds: ["evt_prr_created_001"], artifactHashes: [] }],
        gates: [{ gateId: "provider-transfer", kind: "provider-byte-transfer", ready: true, locked: false }],
        sourceRefs: { correspondence: [], evidence: [{ id: remoteEvidenceId, contentHash: remoteEvidenceHash, sourceEventId: remoteEvidenceEventId }] },
        omissions: []
      };
    case "jurisdiction-pack-summary.v1":
      return {
        packName: "us-federal-foia",
        packVersion: "0.1.0",
        jurisdiction: "US federal",
        citedRules: [{ label: "FOIA response deadline", citation: "5 USC 552(a)(6)(A)" }],
        advisoryPosture: { summary: "Advisory only." },
        omissions: []
      };
    case "governance-locks.v1":
      return {
        items: {
          activeLocks: [{
            lockId: "lock_provider_review_001",
            lockKind: "provider-byte-transfer",
            safeReason: "Remote provider transfer requires approval.",
            activatedBy: "agent_default",
            activatedAt: now(),
            relatedEventIds: ["evt_context_001"],
            projectionEventIds: ["evt_context_001"]
          }],
          governanceRestrictions: []
        }
      };
    case "evidence-summary.v1":
      return { items: [{ evidenceId: remoteEvidenceId, ingestionEventId: remoteEvidenceEventId, contentHash: remoteEvidenceHash, occurrenceIds: ["occurrence_remote_001"], parseJobs: [], governanceTags: [], safeNarrative: "Remote evidence approved for provider prompt transfer." }] };
    case "agent-memory-summary.v1":
      return { memory: { activeMemory: [{ memoryId: "memory_prr_001", scope: "workspace", memoryKind: "agent-observation", summary: "Use conservative PRR follow-up language.", confidence: 0.8, sourceEventIds: ["evt_context_001"], artifactHashes: [] }], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_context_001"], artifactHashes: [] } };
    case "task-run-history.v1":
      return { history: { projectionHighWaterMark: 7, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_prr_001", status: "running", statusReasonCode: "prr-negotiation" }], runs: [{ runId: "run_prr_001", state: "running", runType: "prr-negotiation", taskId: "task_prr_001", sourceEventIds: ["evt_context_001"] }], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1, runs: 1 }, sourceEventIds: ["evt_context_001"], artifactHashes: [], window: { order: "created-at", limit: 2, hasMore: false, totalCount: 2, omissionCodes: [] } } };
    case "workspace-runtime-status.v1":
      return { runtime: { runtimeHighWaterMark: 7, workspaceMounted: true, workspaceId: "ws_prr", storageStrategy: "local", bindPosture: "bound", authPosture: "ready", providerStates: [{ providerId: "provider_remote_model", state: "requires-approval", reasonCode: "provider-byte-transfer" }], diagnostics: [], projectionHighWaterMarks: { agent: 7 }, omissionCodes: [] } };
    default:
      return { items: [{ itemId: `${contextPackId}_item_001`, summary: `${contextPackId} summary.` }], omissions: [] };
  }
}

function createDerivativeStore() {
  const blobStore = new FileBlobStore(mkdtempSync(join(tmpdir(), "cestus-agent-prr-negotiation-")));
  const derivativeStore = createSpecialistDerivativeArtifactStore(blobStore);
  return Object.freeze({
    put: derivativeStore.put,
    get: blobStore.get.bind(blobStore)
  });
}

function createCountingDerivativeStore() {
  let putCalls = 0;
  return {
    putCalls: () => putCalls,
    store: {
      async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
        putCalls += 1;
        return {
          contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
          sizeBytes: content.byteLength
        };
      }
    }
  };
}

function expectNoPrrPreflightEffects(events: Awaited<ReturnType<InMemoryEventLedger["readAll"]>>): void {
  const eventTypes = events.map((event) => event.type);
  expect(eventTypes).not.toContain("agent.model-invocation.requested");
  expect(eventTypes).not.toContain("agent.model-invocation.completed");
  expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
  expect(eventTypes).not.toContain("prr.followup.drafted");
  expect(eventTypes).not.toContain("agent.tool.requested");
}

function followUpApprovalPreview(input: {
  readonly requestCreatedEventId?: string;
  readonly initialSentEventId?: string;
  readonly providerCapabilities?: AdapterCapabilities;
  readonly projectionHighWaterMark?: number;
  readonly message?: PrrCorrespondenceCurrentMessage;
} = {}): PrrNegotiationFollowUpApprovalPreviewInput {
  const providerCapabilities = input.providerCapabilities ?? defaultPrrProviderCapabilities();
  const message = input.message ?? defaultPrrFollowUpMessage();
  return {
    provider: "gmail",
    messageSourceEventId: "evt_prr_initial_sent_001",
    message: {
      from: message.from,
      to: [...message.to],
      cc: [...message.cc],
      subject: message.subject,
      subjectHash: hashText(message.subject),
      bodyHash: hashText(message.body),
      renderedBodyHash: hashText(message.renderedBody),
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
      requiresLegalConfirmation: message.requiresLegalConfirmation,
      providerIdempotencyKey: "followup_prr_req_001_corr_prr_001"
    },
    requestState: {
      requestCreatedEventId: input.requestCreatedEventId ?? "evt_prr_created_001",
      status: "sent",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false,
      initialSentEventId: input.initialSentEventId ?? "evt_prr_initial_sent_001"
    },
    providerCapability: {
      provider: "gmail",
      canSend: providerCapabilities.canSend,
      canSync: providerCapabilities.canSync,
      canFetchAttachments: providerCapabilities.canFetchAttachments,
      capabilityRef: capabilityRefFor(providerCapabilities)
    },
    legalGateChecks: [{
      id: "legal-confirmation-not-required",
      ready: true,
      locked: false,
      detail: "Routine correspondence does not require legal escalation confirmation."
    }],
    legalEvidenceBindings: [],
    lockSnapshot: [],
    projectionHighWaterMark: input.projectionHighWaterMark ?? 7
  };
}

async function prepareAuthoritativePrrFollowUp(
  ledger: InMemoryEventLedger,
  input: { readonly currentMessage?: PrrCorrespondenceCurrentMessage } = {}
): Promise<AuthoritativePrrFollowUpFixture> {
  const domainActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
  const lifecycle = new PrrLifecycleService({ ledger, actor: domainActor });
  const created = await lifecycle.createRequest({
    prrRequestId: "prr_req_001",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: "Example Agency", email: "foia@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText: "Please provide records."
  });
  const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });
  const correspondenceService = new PrrCorrespondenceService({
    ledger,
    actor: domainActor,
    adapters: { gmail: adapter }
  });
  const initialSent = await correspondenceService.sendInitialRequest({
    prrRequestId: "prr_req_001",
    correspondenceId: "corr_prr_initial_setup",
    provider: "gmail",
    from: "investigator@example.org",
    to: ["foia@example.gov"],
    subject: "Public records request",
    body: "Please provide records.",
    approvedBy: domainActor.id
  });
  const capabilities = await adapter.capabilities();
  const currentMessage: PrrCorrespondenceCurrentMessage = input.currentMessage ?? defaultPrrFollowUpMessage();
  return { ledger, created, initialSent, capabilities, currentMessage };
}

function prrFollowUpAdapterContext(
  fixture: AuthoritativePrrFollowUpFixture,
  messageSourceEventId: string
): PrrCorrespondenceAdapterContext {
  const domainActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
  const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });
  return {
    ledger: fixture.ledger,
    correspondenceService: new PrrCorrespondenceService({
      ledger: fixture.ledger,
      actor: domainActor,
      adapters: { gmail: adapter }
    }),
    domainActor,
    residentAgentId: "agent_default",
    taskId: "task_prr_001",
    toolId: prrFollowUpExecuteDescriptor.toolId,
    prrRequestId: "prr_req_001",
    correspondenceId: "corr_prr_001",
    provider: "gmail",
    messageSourceEventId,
    approvedMessage: {
      from: fixture.currentMessage.from,
      to: fixture.currentMessage.to,
      cc: fixture.currentMessage.cc,
      subject: fixture.currentMessage.subject,
      subjectHash: hashText(fixture.currentMessage.subject),
      bodyHash: hashText(fixture.currentMessage.body),
      renderedBodyHash: hashText(fixture.currentMessage.renderedBody),
      attachments: fixture.currentMessage.attachments.map((attachment) => ({ ...attachment })),
      requiresLegalConfirmation: fixture.currentMessage.requiresLegalConfirmation,
      providerIdempotencyKey: "followup_prr_req_001_corr_prr_001"
    },
    approvedRequestState: {
      requestCreatedEventId: fixture.created.id,
      status: "sent",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false,
      initialSentEventId: fixture.initialSent.id
    },
    approvedProviderCapabilities: fixture.capabilities,
    readCurrentMessage: async () => fixture.currentMessage,
    readProviderCapabilities: async () => fixture.capabilities
  };
}

function defaultPrrFollowUpMessage(): PrrCorrespondenceCurrentMessage {
  return {
    from: "investigator@example.org",
    to: ["foia@example.gov"],
    cc: [],
    subject: "PRR follow-up",
    body: "follow up body",
    renderedBody: "follow up rendered body",
    attachments: [],
    requiresLegalConfirmation: false
  };
}

function prrExecutionInput(
  context: PrrCorrespondenceAdapterContext,
  current: Awaited<ReturnType<typeof rebuildPrrCorrespondenceCurrentPreview>>,
  previewHash: `sha256:${string}`
): AgentApprovedToolExecutionInput {
  return {
    toolRequestId: "toolreq_run_prr_001_followup",
    runId: "run_prr_001",
    taskId: context.taskId,
    toolId: context.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    sideEffectClass: "external-message-send",
    approvalClass: "external-message-send",
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: context.domainActor.id,
    sourceEventIds: current.sourceEventIds,
    inputArtifactHashes: current.inputArtifactHashes,
    provenanceRefs: current.provenanceRefs
  };
}

type ToolRequestedEvent = Extract<Awaited<ReturnType<InMemoryEventLedger["readAll"]>>[number], { type: "agent.tool.requested" }>;

function requestedToolPayload(events: Awaited<ReturnType<InMemoryEventLedger["readAll"]>>, toolId: string): ToolRequestedEvent["payload"] {
  const event = events.find((candidate): candidate is ToolRequestedEvent =>
    candidate.type === "agent.tool.requested" && candidate.payload.toolId === toolId
  );
  if (event === undefined) {
    throw new Error(`Missing requested tool payload for ${toolId}.`);
  }
  return event.payload;
}

function defaultPrrProviderCapabilities(): AdapterCapabilities {
  return {
    provider: "gmail",
    canSend: true,
    canSync: true,
    canFetchAttachments: true,
    credentialMode: "cestus-oauth"
  };
}

function capabilityRefFor(capabilities: AdapterCapabilities): `sha256:${string}` {
  return hashText(stableJson(capabilities));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
  const registration = productionSpecialistPromptRegistrationFor("prr-negotiation");
  const resolvedContextPacks = await Promise.all(registration.contextRequirements.map(async (requirement) =>
    await contextPacks.buildResolved(requirement.contextPackId)
  ));
  const contextPackRefs = resolvedContextPacks.map((contextPack) => contextPack.ref);
  const verifiedResolvedContextPacks = assertResolvedContextPacksForExecution(
    contextPackRefs,
    resolvedContextPacks
  );
  return renderProductionSpecialistPrompt({
    runType: "prr-negotiation",
    runId: "run_prr_001",
    taskId: "task_prr_001",
    generatedAt: now(),
    scope: { kind: "prr-request", refs: ["prr_req_001"], associatedPrrRequestId: "prr_req_001" },
    resolvedContextPacks: verifiedResolvedContextPacks,
    omissions: []
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
  const approvedPromptArtifact = providerByteTransferPromptArtifactAudit(promptArtifact);
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
    approvedPromptArtifact,
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => providerCapability },
    readProviderReadiness: async () => ({
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: now(),
      cards: [providerReadiness],
      diagnostics: []
    }),
    readPromptArtifactAudit: async () => approvedPromptArtifact,
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

function providerByteTransferPromptArtifactAudit(
  promptArtifact: Awaited<ReturnType<typeof providerApprovedPromptArtifact>>
) {
  return promptArtifactAuditMetadata(promptArtifact);
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
