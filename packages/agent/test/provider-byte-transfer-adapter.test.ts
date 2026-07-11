import { describe, expect, it } from "vitest";
import type {
  ActorRef,
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import {
  buildProviderByteTransferApprovalPreview,
  createProviderByteTransferAdapter,
  createProviderParseExecutionAdapter,
  providerByteTransferDescriptor,
  providerByteTransferDescriptors,
  providerParseExecuteDescriptor,
  rebuildProviderByteTransferCurrentPreview,
  type ProviderByteTransferAdapterContext
} from "../src/adapters/provider-byte-transfer.js";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutionInput
} from "../src/index.js";
import { buildPromptArtifact, promptArtifactAuditMetadata, type PromptArtifactAuditMetadata } from "../src/prompt-artifacts.js";
import { createProviderCapabilityDescriptor, type ProviderCapabilityDescriptor } from "../src/provider-registry.js";
import type { ProviderReadinessDto, ProviderSetupCard } from "../src/provider-readiness.js";

const reviewer = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const agentActor = { id: "actor_provider_agent", kind: "agent" as const, label: "Provider agent" };
const schedulerActor = { id: "actor_scheduler", kind: "system" as const, label: "Scheduler" };
const evidenceId = "ev_provider_document_001";
const sourceCollectionId = "src_provider_documents";
const importBatchId = "imp_provider_documents_001";
const providerJobId = "provider_document_parse_001";
const providerId = "provider_document_ai";
const credentialRefId = "agent_credref_document_ai";
const evidenceHash = hash("1");
const changedHash = hash("2");
const contextPackHash = hash("3");

const providerCapability = createProviderCapabilityDescriptor({
  providerId,
  label: "Document AI",
  adapterVersion: "document-ai-adapter.v1",
  backendKind: "custom-adapter",
  modelFamilies: ["document-ai"],
  modalities: ["file"],
  toolSupport: "none",
  structuredOutputSupport: "schema-strict",
  contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
  credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
  dataHandlingNotes: "Selected document bytes are processed remotely under the approved transfer policy.",
  costPolicy: "metered-api",
  workspaceScopes: ["workspace"],
  approvalProfile: "remote-byte-transfer-gated",
  diagnosticContract: ["requires-byte-transfer-approval"],
  fakeSupport: false
});

const readinessCard: ProviderSetupCard = {
  providerId,
  label: "Document AI",
  backendKind: "custom-adapter",
  capabilitySummary: ["file", "no tools", "schema output"],
  credentialKindSummary: ["api-key-bearer"],
  state: "requires-byte-transfer-approval",
  requiredApprovalClass: "provider-byte-transfer",
  credentialHealth: "local-binding-healthy",
  dataHandlingPosture: "remote-prompt-byte-transfer-gated",
  credentialRefId,
  safeActionIds: ["action_request_provider_byte_transfer_approval"]
};

describe("provider byte-transfer execution adapters", () => {
  it("publishes only canonical fail-closed transfer and provider-parse descriptors", () => {
    expect(providerByteTransferDescriptors).toEqual([
      providerByteTransferDescriptor,
      providerParseExecuteDescriptor
    ]);
    for (const descriptor of providerByteTransferDescriptors) {
      expect(descriptor).toMatchObject({
        toolVersion: "0.1.0",
        family: "provider-byte-transfer",
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "provider-byte-transfer",
        targetDomainService: "IngestionRuntime.providerExecutionService"
      });
      expect(descriptor.forbiddenEffects).toEqual(expect.arrayContaining([
        "direct-document-provider-parse",
        "model-provider-substitution",
        "raw-byte-lifecycle-evidence",
        "raw-prompt-lifecycle-evidence"
      ]));
    }
    expect(providerByteTransferDescriptor.toolId).toBe("provider.bytes.transfer");
    expect(providerParseExecuteDescriptor.toolId).toBe("ingestion.provider-parse.execute");
  });

  it("builds a plain-language preview with exact approval, evidence, policy, readiness, and prompt-audit bindings", async () => {
    const prepared = await prepareTransfer();
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    const preview = current.preview as Record<string, unknown>;

    expect(preview).toMatchObject({
      toolId: "provider.bytes.transfer",
      providerJobId,
      sourceCollectionId,
      importBatchId,
      providerId,
      providerLabel: "Document AI",
      adapterVersion: "document-ai-adapter.v1",
      providerBindingRefId: credentialRefId,
      providerApprovalEventId: prepared.approval.id,
      promptArtifactHash: prepared.promptAudit.inputArtifactHash,
      renderedPromptHash: hash("a"),
      scopeApplicabilityHash: hash("d"),
      providerOutputSchemaId: "evidence-triage.classify-output.v1",
      handoffSchemaId: "evidence-triage-handoff.v1",
      resolvedPayloadVerificationStatus: "verified",
      excerptPolicy: "send-full-technically-eligible",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 5000,
      providerRetentionDataHandlingNote: providerCapability.dataHandlingNotes,
      governanceTags: ["public_record"],
      consequence: expect.stringMatching(/422 bytes.*leave this machine.*does not transfer/i)
    });
    expect(preview.evidenceBindings).toEqual([{
      evidenceId,
      evidenceEventId: prepared.evidence.id,
      linkEventId: prepared.link.id,
      contentHash: evidenceHash,
      byteCount: 422,
      mediaType: "application/pdf"
    }]);
    expect(preview.promptArtifact).toMatchObject({
      production: {
        rendererId: "evidence-triage.classify.renderer",
        renderedPromptHash: hash("a"),
        scopeApplicabilityHash: hash("d"),
        providerOutputSchemaId: "evidence-triage.classify-output.v1",
        handoffSchemaId: "evidence-triage-handoff.v1",
        resolvedPayloadAudits: [{
          contextPackId: "provider-transfer.v1",
          contentHash: prepared.promptAudit.contextPackRefs[0]!.contentHash
        }]
      }
    });
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evidence", id: evidenceId, hash: evidenceHash, byteCount: 422 }),
      expect.objectContaining({ kind: "provider-approval", id: prepared.approval.id }),
      expect.objectContaining({ kind: "provider-readiness", id: providerId, providerBindingRefId: credentialRefId }),
      expect.objectContaining({
        kind: "prompt-artifact-audit",
        renderedPromptHash: hash("a"),
        scopeApplicabilityHash: hash("d"),
        providerOutputSchemaId: "evidence-triage.classify-output.v1",
        handoffSchemaId: "evidence-triage-handoff.v1"
      })
    ]));
    expect(current.sourceEventIds).toEqual([
      prepared.approval.id,
      prepared.evidence.id,
      prepared.link.id
    ].sort());
    expect(current.inputArtifactHashes).toEqual(expect.arrayContaining([
      evidenceHash,
      prepared.promptAudit.inputArtifactHash,
      hash("9"),
      hash("a"),
      hash("d")
    ]));
    expect(current.provenanceRefs).toEqual(expect.arrayContaining([
      providerJobId,
      prepared.approval.id,
      evidenceId,
      prepared.evidence.id,
      prepared.link.id,
      evidenceHash,
      prepared.promptAudit.inputArtifactHash,
      providerId,
      credentialRefId
    ]));
    expect(preview.idempotencyKey).toMatch(/^sha256:[a-f0-9]{64}$/);
    const changedByteCount = buildProviderByteTransferApprovalPreview({
      ...previewInputFromCurrent(prepared.context, preview),
      evidenceBindings: [{
        ...(preview.evidenceBindings as Parameters<typeof buildProviderByteTransferApprovalPreview>[0]["evidenceBindings"])[0]!,
        byteCount: 421
      }]
    });
    expect(changedByteCount.idempotencyKey).not.toBe(preview.idempotencyKey);
    for (const promptArtifact of [
      { ...prepared.promptAudit, production: { ...prepared.promptAudit.production!, renderedPromptHash: hash("b") } },
      { ...prepared.promptAudit, production: { ...prepared.promptAudit.production!, scopeApplicabilityHash: hash("e") } },
      {
        ...prepared.promptAudit,
        contextPackRefs: [
          ...prepared.promptAudit.contextPackRefs,
          {
            ...prepared.promptAudit.contextPackRefs[0]!,
            contextPackId: "prr-read-model.v1",
            contentHash: hash("f")
          }
        ],
        production: {
          ...prepared.promptAudit.production!,
          evaluatedContextRequirements: [
            prepared.promptAudit.production!.evaluatedContextRequirements[0]!,
            {
              contextPackId: "prr-read-model.v1",
              requirementMode: "when-scope-associated-prr" as const,
              status: "applicable" as const,
              contentHash: hash("f")
            }
          ],
          resolvedPayloadAudits: [
            ...prepared.promptAudit.production!.resolvedPayloadAudits,
            {
              contextPackId: "prr-read-model.v1",
              contentHash: hash("f"),
              sizeBytes: 100,
              schemaId: "prr-read-model.v1"
            }
          ]
        }
      },
      {
        ...prepared.promptAudit,
        production: {
          ...prepared.promptAudit.production!,
          resolvedPayloadAudits: [{
            contextPackId: "provider-transfer.v1",
            contentHash: prepared.promptAudit.contextPackRefs[0]!.contentHash,
            sizeBytes: 421,
            schemaId: "provider-transfer.v1"
          }]
        }
      }
    ]) {
      expect(buildProviderByteTransferApprovalPreview({
        ...previewInputFromCurrent(prepared.context, preview),
        promptArtifact
      }).idempotencyKey).not.toBe(preview.idempotencyKey);
    }
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain(prepared.promptText);
    expect(serialized).not.toMatch(/documentBody|inputText|providerResponse|authorization|hiddenPath/i);
    expect(serialized).not.toContain("resolved-payload-sentinel");
  });

  it("rejects unknown metadata and swapped or forged public preview bindings", async () => {
    const prepared = await prepareTransfer();
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    const input = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>);

    expect(() => buildProviderByteTransferApprovalPreview({ ...input, toolId: "provider.bytes.publish" } as never))
      .toThrow(/canonical provider byte-transfer descriptor/i);
    expect(() => buildProviderByteTransferApprovalPreview({ ...input, toolVersion: "9.9.9" } as never))
      .toThrow(/canonical provider byte-transfer descriptor/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      providerApproval: { ...input.providerApproval, eventId: "evt_swapped_provider_approval" }
    } as never)).toThrow(/approval event/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      evidenceBindings: [{ ...input.evidenceBindings[0]!, contentHash: changedHash }]
    } as never)).toThrow(/evidence content hash/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      credentialRefId: "agent_credref_swapped"
    } as never)).toThrow(/credential reference/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      promptArtifact: { ...input.promptArtifact, transferApprovalClass: "none" }
    } as never)).toThrow(/provider-byte-transfer/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      promptArtifact: { ...input.promptArtifact, runType: "forged-provider-run" }
    } as never)).toThrow(/runType/i);
    expect(() => buildProviderByteTransferApprovalPreview({
      ...input,
      evidenceBindings: [{ ...input.evidenceBindings[0]!, byteCount: 5001 }]
    } as never)).toThrow(/maximum byte count/i);
  });

  it("rejects hostile preview DTOs without invoking getters or accepting raw transfer fields", async () => {
    const prepared = await prepareTransfer();
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    const input = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>) as unknown as Record<PropertyKey, unknown>;
    let getterCalls = 0;
    Object.defineProperty(input, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe provider getter");
      }
    });
    Object.defineProperty(input, Symbol("provider-shadow"), {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe provider symbol getter");
      }
    });
    expect(() => buildProviderByteTransferApprovalPreview(input as never))
      .toThrow(/symbol-keyed|unsupported|data properties/i);
    expect(getterCalls).toBe(0);

    const valid = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>);
    for (const field of ["providerParse", "executor", "documentBytes", "promptEnvelope", "inputText"]) {
      expect(() => buildProviderByteTransferApprovalPreview({ ...valid, [field]: "forbidden" } as never))
        .toThrow(/unsupported/i);
    }
    const customArray = [...valid.evidenceBindings] as unknown[] & { shadow?: string };
    Object.defineProperty(customArray, "shadow", { enumerable: true, value: "forged" });
    expect(() => buildProviderByteTransferApprovalPreview({
      ...valid,
      evidenceBindings: customArray
    } as never)).toThrow(/custom array fields/i);
  });

  it("rebuilds stale when evidence, prompt audit, provider descriptor, readiness, or credential binding changes", async () => {
    const evidenceChanged = await prepareTransfer();
    await evidenceChanged.ledger.append(evidenceEvent(changedHash, "evt_source_changed"));
    const evidenceCurrent = await rebuildProviderByteTransferCurrentPreview(rebuildInput(evidenceChanged.context));
    expect(evidenceCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "evidence-bindings",
      ok: false
    }));

    const promptChanged = await prepareTransfer();
    promptChanged.current.promptAudit = {
      ...promptChanged.promptAudit,
      production: {
        ...promptChanged.promptAudit.production!,
        scopeApplicabilityHash: changedHash
      }
    };
    const promptCurrent = await rebuildProviderByteTransferCurrentPreview(rebuildInput(promptChanged.context));
    expect(promptCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "prompt-artifact-audit",
      ok: false
    }));

    const descriptorChanged = await prepareTransfer();
    descriptorChanged.current.capability = createProviderCapabilityDescriptor({
      ...providerCapability,
      adapterVersion: "document-ai-adapter.v2"
    });
    const descriptorCurrent = await rebuildProviderByteTransferCurrentPreview(rebuildInput(descriptorChanged.context));
    expect(descriptorCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "provider-capability",
      ok: false
    }));

    const readinessChanged = await prepareTransfer();
    readinessChanged.current.readiness = readinessDto({ ...readinessCard, state: "provider-unavailable" });
    const readinessCurrent = await rebuildProviderByteTransferCurrentPreview(rebuildInput(readinessChanged.context));
    expect(readinessCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "provider-readiness",
      ok: false
    }));

    const credentialChanged = await prepareTransfer();
    credentialChanged.current.readiness = readinessDto({
      ...readinessCard,
      credentialRefId: "agent_credref_document_ai_changed"
    });
    const credentialCurrent = await rebuildProviderByteTransferCurrentPreview(rebuildInput(credentialChanged.context));
    expect(credentialCurrent.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "provider-readiness",
      ok: false
    }));
  });

  it("fails stale when the exact approval event or evidence-link provenance is absent or mismatched", async () => {
    const prepared = await prepareTransfer();
    const missingApproval = createReadOnlyLedger(
      await prepared.ledger.readAll(),
      (event) => event.id !== prepared.approval.id
    );
    await expect(rebuildProviderByteTransferCurrentPreview(rebuildInput({
      ...prepared.context,
      ledger: missingApproval
    }))).rejects.toMatchObject({ category: "approval-stale" });

    await expect(rebuildProviderByteTransferCurrentPreview(rebuildInput({
      ...prepared.context,
      approvalEventId: "evt_provider_approval_forged"
    }))).rejects.toMatchObject({ category: "approval-stale" });

    await expect(rebuildProviderByteTransferCurrentPreview(rebuildInput({
      ...prepared.context,
      evidenceBindings: [{
        ...prepared.context.evidenceBindings[0]!,
        linkEventId: "evt_evidence_link_forged"
      }]
    }))).rejects.toMatchObject({ category: "approval-stale" });
  });

  it("rejects a non-human provider approval actor and a link whose payload is swapped", async () => {
    const prepared = await prepareTransfer();
    const events = await prepared.ledger.readAll();
    const nonHumanApproval = events.map((event) => event.id === prepared.approval.id
      ? {
          ...event,
          context: { ...event.context, actor: schedulerActor }
        } as KnowledgeEvent
      : event);
    await expect(rebuildProviderByteTransferCurrentPreview(rebuildInput({
      ...prepared.context,
      ledger: createStaticLedger(nonHumanApproval)
    }))).rejects.toMatchObject({ category: "approval-stale" });

    const swappedLink = events.map((event) => event.id === prepared.link.id && event.type === "ingestion.evidence.linked"
      ? {
          ...event,
          payload: { ...event.payload, sourceCollectionId: "src_swapped_provider_documents" }
        } as KnowledgeEvent
      : event);
    await expect(rebuildProviderByteTransferCurrentPreview(rebuildInput({
      ...prepared.context,
      ledger: createStaticLedger(swappedLink)
    }))).rejects.toMatchObject({ category: "approval-stale" });
  });

  it("reports and enforces active locks before the missing-executor failure", async () => {
    const prepared = await prepareTransfer();
    const approved = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    await prepared.ledger.append(lockEvent());
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    expect(current.activeLocks).toEqual([{
      lockId: "lock_provider_transfer",
      category: "provider-byte-transfer",
      message: "Provider transfer review is active."
    }]);
    await expect(createProviderByteTransferAdapter(prepared.context).executeApproved(
      executionInput(prepared.context, approved, providerByteTransferDescriptor)
    )).rejects.toMatchObject({ category: "lock-active" });
  });

  it("fails both approved descriptors closed after exact consume-time validation and appends no domain event", async () => {
    for (const descriptor of providerByteTransferDescriptors) {
      const prepared = await prepareTransfer();
      const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context, descriptor));
      const before = await prepared.ledger.readAll();
      const adapter = descriptor.toolId === providerByteTransferDescriptor.toolId
        ? createProviderByteTransferAdapter(prepared.context)
        : createProviderParseExecutionAdapter(prepared.context);
      const input = executionInput(prepared.context, current, descriptor);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(adapter.executeApproved(input)).rejects.toMatchObject({
          category: "domain-gate-failed",
          message: "Ingestion provider execution service is not available.",
          retryable: false,
          allowedActions: ["wait for ingestion provider execution service"]
        });
      }
      expect(await prepared.ledger.readAll()).toEqual(before);
    }
  });

  it("rejects forged approved execution arrays and hostile fields with safe typed failures", async () => {
    const prepared = await prepareTransfer();
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    const adapter = createProviderByteTransferAdapter(prepared.context);
    const valid = executionInput(prepared.context, current, providerByteTransferDescriptor);

    await expect(adapter.executeApproved({ ...valid, approvedPreviewHash: changedHash }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, sourceEventIds: [prepared.approval.id] }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, inputArtifactHashes: [prepared.promptAudit.inputArtifactHash] }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, provenanceRefs: [providerJobId] }))
      .rejects.toMatchObject({ category: "provenance-missing" });

    let getterCalls = 0;
    const hostile = { ...valid } as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "unsafeField", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe provider execution getter");
      }
    });
    await expect(adapter.executeApproved(hostile as never)).rejects.toMatchObject({
      category: "permission-denied"
    });
    expect(getterCalls).toBe(0);
  });

  it("records only a generic secret-safe agent.tool.failed event through the scheduler and gateway", async () => {
    const prepared = await prepareTransfer();
    const current = await rebuildProviderByteTransferCurrentPreview(rebuildInput(prepared.context));
    const gateway = createAgentToolGateway({ ledger: prepared.ledger, actor: agentActor, now: fixedNow });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_provider_bytes_001",
      residentAgentId: "agent_resident_001",
      taskId: "task_provider_bytes_001",
      runId: "run_provider_bytes_001",
      toolId: providerByteTransferDescriptor.toolId,
      toolVersion: providerByteTransferDescriptor.toolVersion,
      sideEffectClass: providerByteTransferDescriptor.sideEffectClass,
      requiredApprovalClass: "provider-byte-transfer",
      preview: current.preview,
      inputArtifactHashes: current.inputArtifactHashes
    });
    await gateway.approveTool({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      actor: reviewer,
      rationale: "Approve the exact provider byte-transfer preview for domain execution when available."
    });
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger: prepared.ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [createProviderByteTransferAdapter(prepared.context)]
    });

    const result = await dispatcher.wake();
    const events = await prepared.ledger.readAll();
    const failed = eventOfType(events, "agent.tool.failed");
    expect(result).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(failed.payload).toMatchObject({
      category: "domain-gate-failed",
      message: "Ingestion provider execution service is not available.",
      allowedActions: ["wait for ingestion provider execution service"]
    });
    expect(events.filter((event) => event.type === "ingestion.provider.approved")).toHaveLength(1);
    expect(events.some((event) => event.type === "ingestion.parse.completed")).toBe(false);
    const serialized = JSON.stringify(events.filter((event) => event.type.startsWith("agent.tool.")));
    expect(serialized).not.toContain(prepared.promptText);
    expect(serialized).not.toMatch(/document body|provider response|authorization|bearer|PROVIDER_AUTH_SETTING/i);
  });

  it("fails production construction closed without authoritative readers and rejects execution callbacks", async () => {
    const prepared = await prepareTransfer();
    expect(() => createProviderByteTransferAdapter({ ...prepared.context, ledger: undefined } as never)).toThrow(/ledger/i);
    expect(() => createProviderByteTransferAdapter({ ...prepared.context, providerRegistry: undefined } as never))
      .toThrow(/provider registry/i);
    expect(() => createProviderByteTransferAdapter({ ...prepared.context, readProviderReadiness: undefined } as never))
      .toThrow(/provider readiness/i);
    expect(() => createProviderByteTransferAdapter({ ...prepared.context, readPromptArtifactAudit: undefined } as never))
      .toThrow(/prompt artifact audit/i);
    expect(() => createProviderByteTransferAdapter({ ...prepared.context, reviewer: agentActor } as never))
      .toThrow(/human reviewer/i);
    expect(() => createProviderByteTransferAdapter({
      ...prepared.context,
      approvedProviderReadiness: { ...readinessCard, credentialHealth: "local-binding-missing" }
    })).toThrow(/healthy local binding/i);
    expect(() => createProviderByteTransferAdapter({
      ...prepared.context,
      approvedPromptArtifact: {
        ...prepared.promptAudit,
        contextPackRefs: prepared.promptAudit.contextPackRefs.map((ref) => ({
          ...ref,
          provenanceRefs: ref.provenanceRefs.filter((item) => item !== evidenceHash),
          artifactHashes: (ref.artifactHashes ?? []).filter((item) => item !== evidenceHash)
        }))
      }
    })).toThrow(/prompt artifact.*bind/i);
    for (const field of ["providerParse", "executor", "invoke", "documentBytes", "promptEnvelope"]) {
      expect(() => createProviderByteTransferAdapter({ ...prepared.context, [field]: () => undefined } as never))
        .toThrow(/unsupported/i);
    }
  });
});

interface MutableCurrentState {
  capability: ProviderCapabilityDescriptor;
  readiness: ProviderReadinessDto;
  promptAudit: PromptArtifactAuditMetadata;
}

interface PreparedTransfer {
  readonly ledger: InMemoryEventLedger;
  readonly evidence: KnowledgeEventOf<"evidence.ingested">;
  readonly link: KnowledgeEventOf<"ingestion.evidence.linked">;
  readonly approval: KnowledgeEventOf<"ingestion.provider.approved">;
  readonly promptAudit: PromptArtifactAuditMetadata;
  readonly promptText: string;
  readonly current: MutableCurrentState;
  readonly context: ProviderByteTransferAdapterContext;
}

async function prepareTransfer(): Promise<PreparedTransfer> {
  const ledger = new InMemoryEventLedger();
  const evidence = await ledger.append(evidenceEvent(evidenceHash, "evt_source_initial"));
  if (evidence.type !== "evidence.ingested") {
    throw new Error("Expected evidence.ingested.");
  }
  await ledger.append(classificationEvent(evidence));
  const link = await ledger.append(linkEvent(evidence));
  if (link.type !== "ingestion.evidence.linked") {
    throw new Error("Expected ingestion.evidence.linked.");
  }
  const approval = await new ProviderParseApprovalService({ ledger, actor: reviewer }).approveProviderBatch({
    providerJobId,
    sourceCollectionId,
    importBatchId,
    provider: { name: providerId, version: providerCapability.adapterVersion },
    approvedBy: reviewer.id,
    approvedAt: "2026-07-09T20:00:00.000Z",
    eligibleMediaTypes: ["application/pdf"],
    maxBytesPerFile: 5000
  });
  const promptText = "Parse the approved evidence under the reviewed transfer policy.";
  const promptAudit = withProductionAudit(promptArtifactAuditMetadata(buildPromptArtifact({
    promptTemplateId: "provider-document-parse",
    promptTemplateVersion: 1,
    generatedAt: "2026-07-09T20:00:00.000Z",
    runType: "evidence-triage",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: [buildContextPackRef({
      contextPackId: "provider-transfer.v1",
      version: 1,
      generatedAt: "2026-07-09T20:00:00.000Z",
      payload: { evidenceId, contentHash: evidenceHash },
      safeSummary: "Provider transfer evidence binding.",
      provenanceRefs: [evidenceId, evidence.id, evidenceHash],
      sourceEventIds: [evidence.id, link.id],
      artifactHashes: [evidenceHash]
    })],
    text: promptText,
    safeSummary: "Provider document parsing instructions."
  })));
  const current: MutableCurrentState = {
    capability: providerCapability,
    readiness: readinessDto(readinessCard),
    promptAudit
  };
  const context: ProviderByteTransferAdapterContext = {
    ledger,
    reviewer,
    residentAgentId: "agent_resident_001",
    taskId: "task_provider_bytes_001",
    providerJobId,
    sourceCollectionId,
    importBatchId,
    providerId,
    approvalEventId: approval.id,
    credentialRefId,
    evidenceBindings: [{
      evidenceId,
      evidenceEventId: evidence.id,
      linkEventId: link.id,
      contentHash: evidenceHash,
      byteCount: 422,
      mediaType: "application/pdf"
    }],
    approvedProviderCapability: providerCapability,
    approvedProviderReadiness: readinessCard,
    approvedPromptArtifact: promptAudit,
    excerptPolicy: "send-full-technically-eligible",
    providerRegistry: { require: () => current.capability },
    readProviderReadiness: async () => current.readiness,
    readPromptArtifactAudit: async () => current.promptAudit
  };
  return { ledger, evidence, link, approval, promptAudit, promptText, current, context };
}

function withProductionAudit(audit: PromptArtifactAuditMetadata): PromptArtifactAuditMetadata {
  const contextPackRef = audit.contextPackRefs[0];
  if (contextPackRef === undefined) {
    throw new Error("Expected provider transfer context pack reference.");
  }
  return {
    ...audit,
    production: {
      rendererId: "evidence-triage.classify.renderer",
      rendererVersion: 1,
      rendererHash: hash("9"),
      renderedPromptHash: hash("a"),
      providerOutputSchemaId: "evidence-triage.classify-output.v1",
      providerOutputSchemaVersion: 1,
      handoffSchemaId: "evidence-triage-handoff.v1",
      handoffSchemaVersion: 1,
      scopeApplicabilityHash: hash("d"),
      evaluatedContextRequirements: [{
        contextPackId: "provider-transfer.v1",
        requirementMode: "always",
        status: "applicable",
        contentHash: contextPackRef.contentHash
      }, {
        contextPackId: "prr-read-model.v1",
        requirementMode: "when-scope-associated-prr",
        status: "not-applicable",
        omissionReason: "no-associated-prr"
      }],
      resolvedPayloadAudits: [{
        contextPackId: "provider-transfer.v1",
        contentHash: contextPackRef.contentHash,
        sizeBytes: 422,
        schemaId: "provider-transfer.v1"
      }]
    }
  };
}

function rebuildInput(
  context: ProviderByteTransferAdapterContext,
  descriptor = providerByteTransferDescriptor
) {
  return {
    ...context,
    toolRequestId: "toolreq_provider_bytes_001",
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    runId: "run_provider_bytes_001"
  };
}

function previewInputFromCurrent(
  context: ProviderByteTransferAdapterContext,
  preview: Record<string, unknown>
): Parameters<typeof buildProviderByteTransferApprovalPreview>[0] {
  return {
    toolRequestId: preview.toolRequestId as string,
    toolId: preview.toolId as string,
    toolVersion: preview.toolVersion as string,
    runId: preview.runId as string,
    taskId: preview.taskId as string,
    residentAgentId: preview.residentAgentId as string,
    providerJobId: context.providerJobId,
    sourceCollectionId: context.sourceCollectionId,
    importBatchId: context.importBatchId,
    providerId: context.providerId,
    providerCapability,
    providerReadiness: readinessCard,
    credentialRefId: context.credentialRefId,
    providerApprovalEventId: context.approvalEventId,
    providerApproval: preview.providerApproval as Parameters<typeof buildProviderByteTransferApprovalPreview>[0]["providerApproval"],
    evidenceBindings: preview.evidenceBindings as Parameters<typeof buildProviderByteTransferApprovalPreview>[0]["evidenceBindings"],
    promptArtifact: preview.promptArtifact as PromptArtifactAuditMetadata,
    excerptPolicy: context.excerptPolicy,
    governanceTags: preview.governanceTags as readonly string[],
    activeLocks: preview.lockSnapshot as Parameters<typeof buildProviderByteTransferApprovalPreview>[0]["activeLocks"],
    projectionHighWaterMark: (preview.projectionHighWaterMarks as Array<{ highWaterMark: number }>)[0]!.highWaterMark,
    domainReviewerId: reviewer.id
  };
}

function executionInput(
  context: ProviderByteTransferAdapterContext,
  current: Awaited<ReturnType<typeof rebuildProviderByteTransferCurrentPreview>>,
  descriptor: typeof providerByteTransferDescriptor
): AgentApprovedToolExecutionInput {
  const previewHash = hashAgentToolPreview(current.preview);
  return {
    toolRequestId: "toolreq_provider_bytes_001",
    runId: "run_provider_bytes_001",
    taskId: context.taskId,
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: reviewer.id,
    sourceEventIds: current.sourceEventIds,
    inputArtifactHashes: current.inputArtifactHashes,
    provenanceRefs: current.provenanceRefs
  };
}

function evidenceEvent(contentHash: `sha256:${string}`, causationId: string): AppendableKnowledgeEvent<"evidence.ingested"> {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: fixedNow(),
      causationId,
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId,
      source: { kind: "file", label: "approved-document.pdf" },
      contentHash,
      mediaType: "application/pdf",
      sizeBytes: 422
    }
  };
}

function classificationEvent(
  evidence: KnowledgeEventOf<"evidence.ingested">
): AppendableKnowledgeEvent<"evidence.governance.classified"> {
  return {
    type: "evidence.governance.classified",
    version: 1,
    streamId: evidence.streamId,
    context: {
      actor: { id: "actor_classifier", kind: "extractor", label: "Governance classifier" },
      occurredAt: fixedNow(),
      causationId: evidence.id,
      correlationId: evidence.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
      evidenceEventId: evidence.id,
      contentHash: evidenceHash,
      policy: { policyId: "gov_policy_default", version: "0.1.0" },
      classifier: { actorId: "actor_classifier", kind: "ai", label: "Governance classifier" },
      tags: [{ tag: "public_record", confidence: 0.98, rationale: "Imported public record." }]
    }
  };
}

function linkEvent(
  evidence: KnowledgeEventOf<"evidence.ingested">
): AppendableKnowledgeEvent<"ingestion.evidence.linked"> {
  return {
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: `ingestion_evidence_link_${sourceCollectionId}_${importBatchId}`,
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: fixedNow(),
      causationId: evidence.id,
      correlationId: `corr_${importBatchId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId,
      importBatchId,
      sourceCollectionId,
      contentHash: evidenceHash,
      occurrenceIds: ["occ_provider_document_001"]
    }
  };
}

function lockEvent(): AppendableKnowledgeEvent<"agent.lock.activated"> {
  return {
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_provider_transfer",
    context: {
      actor: reviewer,
      occurredAt: fixedNow(),
      correlationId: "corr_lock_provider_transfer",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      lockId: "lock_provider_transfer",
      residentAgentId: "agent_resident_001",
      kind: "provider-byte-transfer",
      activatedBy: reviewer.id,
      reason: "Provider transfer review is active."
    }
  };
}

function readinessDto(card: ProviderSetupCard): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: fixedNow(),
    cards: [{ ...card }],
    diagnostics: []
  };
}

function createReadOnlyLedger(
  events: readonly KnowledgeEvent[],
  include: (event: KnowledgeEvent) => boolean
): EventLedger {
  return createStaticLedger(events.filter(include));
}

function createStaticLedger(events: readonly KnowledgeEvent[]): EventLedger {
  const visible = [...events];
  return {
    async append() {
      throw new Error("Read-only test ledger.");
    },
    async readStream(streamId) {
      return structuredClone(visible.filter((event) => event.streamId === streamId));
    },
    async readAll() {
      return structuredClone(visible);
    }
  };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { readonly type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { readonly type: Type }> =>
    candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event.`);
  }
  return event;
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function fixedNow(): string {
  return "2026-07-09T21:00:00.000Z";
}

void (reviewer satisfies ActorRef);
