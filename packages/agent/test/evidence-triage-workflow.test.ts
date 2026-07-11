import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderParseApprovalService } from "../../ingestion/src/provider-adapter.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type { AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  buildAgentProjection,
  buildProviderByteTransferApprovalPreview,
  createAgentRuntime,
  createContextPackRegistry,
  createSpecialistDerivativeArtifactStore,
  createProviderCapabilityDescriptor,
  FakeModelProvider,
  promptArtifactAuditMetadata,
  providerParseExecuteDescriptor,
  rebuildProviderByteTransferCurrentPreview,
  renderProductionSpecialistPrompt,
  runEvidenceTriageWorkflow,
  type ModelInvocationRequest,
  type ModelInvocationResult,
  type ModelProviderAdapter,
  type ProviderDescriptor,
  type ProviderReadinessDto,
  type ProviderSetupCard
} from "../src/index.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import type { AgentContextPackJsonValue } from "../src/index.js";

const now = () => "2026-07-10T02:30:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };
const evidenceHash = hashText("evidence triage source bytes");
const promptArtifactHash = hashText("triage prompt artifact");
const providerParseHuman = { id: "actor_provider_reviewer", kind: "human" as const, label: "Provider Reviewer" };

describe("evidence triage workflow", () => {
  it("permits bounded instructional narrative while writing source-bound local artifacts", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput());
    const providerPreview = await providerParseCurrentPreview(ledger);
    const builtContextPackIds: string[] = [];
    const input = {
      ...baseRunInput(ledger, runtime, createTriageContextPacks(builtContextPackIds)),
      providerParseApprovalPreview: providerPreview.current.preview
    };

    const result = await runEvidenceTriageWorkflow(input);

    expect(result.handoff).toMatchObject({
      runType: "evidence-triage",
      residentAgentId: "agent_default",
      status: "blocked",
      toolRequestIds: [],
      approvalRequirements: []
    });
    expect(result.handoff.safeSummary).toMatch(/provider parse was not queued/i);
    expect(result.handoff.nextSafeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_inspect_provider_parse", kind: "inspect", effect: "none" }),
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_governance", kind: "review", effect: "none" }),
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_quarantine", kind: "review", effect: "none" }),
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_assertions", kind: "review", effect: "none" })
    ]));
    expect(builtContextPackIds).toEqual(expect.arrayContaining([
      "evidence-summary.v1",
      "governance-locks.v1",
      "accepted-graph-projection.v1",
      "agent-memory-summary.v1",
      "task-run-history.v1",
      "workspace-runtime-status.v1"
    ]));
    expect(builtContextPackIds).not.toContain("prr-read-model.v1");
    expect(result.handoff.outputArtifacts.map((artifact) => artifact.artifactKind)).toEqual(expect.arrayContaining([
      "triage-dossier",
      "safe-evidence-summaries",
      "sensitive-quarantine-flags",
      "duplicate-groups",
      "evidence-gap-list",
      "assertion-candidate-bundle"
    ]));
    expect(JSON.stringify(result.handoff)).not.toContain("Sensitive model note");

    const dossier = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "triage-dossier");
    expect(dossier?.artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const dossierPayload = JSON.parse((await input.derivativeStore.get(dossier!.artifactHash)).toString("utf8"));
    expect(dossierPayload).toMatchObject({
      schemaVersion: "evidence-triage-handoff.v1",
      artifactKind: "triage-dossier",
      runId: "run_evidence_triage_001",
      evidenceIds: ["ev_triage_001"],
      sourceBindings: {
        providerParseToolId: "ingestion.provider-parse.execute",
        providerJobId: "provider_triage_parse_001",
        sourceCollectionId: "src_triage_production",
        importBatchId: "imp_triage_production_001",
        evidence: [{
          evidenceId: "ev_triage_001",
          contentHash: evidenceHash
        }],
        relatedEventIds: providerPreview.current.preview.relatedEventIds,
        artifactHashes: providerPreview.current.preview.artifactHashes,
        promptArtifactHash: providerPreview.current.preview.promptArtifactHash
      }
    });
    expect(dossierPayload.sourceBindings).not.toHaveProperty("productionIds");
    const [providerBinding] = providerPreview.current.preview.evidenceBindings as readonly {
      readonly evidenceEventId: string;
      readonly linkEventId: string;
    }[];
    expect(dossierPayload.sourceBindings.evidence[0].evidenceEventId).toBe(providerBinding!.evidenceEventId);
    expect(dossierPayload.sourceBindings.evidence[0].linkEventId).toBe(providerBinding!.linkEventId);

    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.specialist-run.step.recorded",
      "agent.specialist-run.completed"
    ]));
    const outputArtifactHashes = result.handoff.outputArtifacts.map((artifact) => artifact.artifactHash);
    const completed = (await ledger.readAll()).find((event): event is Extract<Awaited<ReturnType<InMemoryEventLedger["readAll"]>>[number], { type: "agent.specialist-run.completed" }> =>
      event.type === "agent.specialist-run.completed"
    );
    expect(completed?.payload.outputArtifactHashes).toEqual(outputArtifactHashes);
    const projectedRun = buildAgentProjection(await ledger.readAll()).runs.get("run_evidence_triage_001");
    expect(projectedRun?.state).toBe("completed");
    expect(projectedRun?.retryable).toBeUndefined();
    expect(eventTypes).not.toContain("agent.tool.requested");
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      "evidence.governance.classified",
      "evidence.quarantined",
      "assertion.proposed",
      "assertion.accepted",
      "entity.resolved",
      "relationship.accepted",
      "export.generated",
      "report.generated",
      "prr.request.sent",
      "prr.followup.sent",
      "agent.tool.completed",
      "agent.tool.execution.claimed"
    ]));
  });

  it("treats governance, quarantine, and assertion booleans as local review suggestions only", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput({ requestProviderParseApproval: false }));

    const result = await runEvidenceTriageWorkflow({
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      providerParseApprovalPreview: await providerParsePreviewInput()
    });

    expect(result.handoff.status).toBe("ready-for-review");
    expect(result.handoff.toolRequestIds).toEqual([]);
    expect(result.handoff.approvalRequirements).toEqual([]);
    expect(result.handoff.nextSafeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_governance", kind: "review", effect: "none" }),
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_quarantine", kind: "review", effect: "none" }),
      expect.objectContaining({ actionId: "action_run_evidence_triage_001_review_assertions", kind: "review", effect: "none" })
    ]));
    expect(JSON.stringify(result.handoff)).toMatch(/adapter not registered|local/i);
    expect((await ledger.readAll()).filter((event) => event.type === "agent.tool.requested")).toHaveLength(0);
  });

  it("preflights provider preview requirements before model invocation", async () => {
    const missing = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(missing.ledger, missing.runtime, createTriageContextPacks([]))
    })).rejects.toThrow(/provider parse approval preview/i);
    expectNoPreflightEffects(await missing.ledger.readAll());

    const mismatched = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(mismatched.ledger, mismatched.runtime, createTriageContextPacks([])),
      evidenceIds: ["ev_triage_001", "ev_triage_002"],
      providerParseApprovalPreview: await providerParsePreviewInput()
    })).rejects.toThrow(/exactly match/i);
    expectNoPreflightEffects(await mismatched.ledger.readAll());

    const malformed = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(malformed.ledger, malformed.runtime, createTriageContextPacks([])),
      evidenceIds: ["not_evidence"],
      providerParseApprovalPreview: await providerParsePreviewInput()
    })).rejects.toThrow(/well-formed/i);
    expectNoPreflightEffects(await malformed.ledger.readAll());
  });

  it("rejects model output that cites evidence outside the current run before artifacts or tools", async () => {
    for (const patch of [
      {
        governanceFlags: [{
          evidenceId: "ev_foreign_001",
          tag: "contains_pii",
          confidence: 0.91,
          rationale: "Foreign evidence reference should fail closed."
        }]
      },
      {
        duplicateGroups: [{
          groupId: "dup_group_001",
          evidenceIds: ["ev_triage_001", "ev_foreign_001"],
          rationale: "Foreign duplicate reference should fail closed."
        }]
      },
      {
        assertionCandidates: [{
          candidateId: "cand_triage_001",
          evidenceId: "ev_foreign_001",
          predicate: "contract.vendor",
          confidence: 0.64,
          rationale: "Foreign assertion reference should fail closed."
        }]
      }
    ]) {
      const { ledger, runtime } = await preparedRuntime(modelOutput(patch));

      const result = await runEvidenceTriageWorkflow({
        ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
        providerParseApprovalPreview: await providerParsePreviewInput()
      });

      expect(result.handoff).toMatchObject({
        status: "failed",
        failure: { category: "model-output-invalid", retryable: true },
        outputArtifacts: [],
        toolRequestIds: []
      });
      expect(JSON.stringify(result.handoff)).not.toContain("Foreign evidence reference");

      const eventTypes = (await ledger.readAll()).map((event) => event.type);
      expect(eventTypes).toContain("agent.model-invocation.completed");
      expect(eventTypes).toContain("agent.specialist-run.failed");
      expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
      expect(eventTypes).not.toContain("agent.tool.requested");
    }
  });

  it("fails closed before model invocation when derivative storage is unavailable", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput());

    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      derivativeStore: undefined,
      providerParseApprovalPreview: await providerParsePreviewInput()
    })).rejects.toThrow(/derivative artifact store/i);

    expectNoPreflightEffects(await ledger.readAll());
  });

  it("rejects hostile evidence IDs before model invocation without invoking getters", async () => {
    let getterCalls = 0;
    const hostileEvidenceIds: unknown[] = [];
    Object.defineProperty(hostileEvidenceIds, "0", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "ev_triage_001";
      }
    });
    hostileEvidenceIds.length = 1;
    const hostile = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(hostile.ledger, hostile.runtime, createTriageContextPacks([])),
      evidenceIds: hostileEvidenceIds as readonly string[],
      providerParseApprovalPreview: await providerParsePreviewInput()
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
    expectNoPreflightEffects(await hostile.ledger.readAll());
  });

  it("uses the preflight evidence ID snapshot even if provider invocation mutates caller input", async () => {
    const ledger = new InMemoryEventLedger();
    const evidenceIds = ["ev_triage_001"];
    const provider = new MutatingModelProvider(evidenceIds);
    const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_triage" });
    await runtime.createTask({
      taskId: "task_evidence_triage_001",
      title: "Triage production evidence",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_evidence_triage_001",
      taskId: "task_evidence_triage_001",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_triage"] }
    });
    const input = {
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      evidenceIds,
      providerParseApprovalPreview: await providerParsePreviewInput()
    };

    const result = await runEvidenceTriageWorkflow(input);

    expect(evidenceIds).toEqual(["ev_mutated_001"]);
    const dossier = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "triage-dossier");
    const dossierPayload = JSON.parse((await input.derivativeStore.get(dossier!.artifactHash)).toString("utf8"));
    expect(dossierPayload.evidenceIds).toEqual(["ev_triage_001"]);
    expect(dossierPayload.sourceBindings.evidence.map((binding: { evidenceId: string }) => binding.evidenceId)).toEqual(["ev_triage_001"]);
  });

  it("records a safe failed handoff when a later derivative write fails after model invocation", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput());
    const store = createDerivativeStore();
    let writeCount = 0;

    const result = await runEvidenceTriageWorkflow({
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      derivativeStore: {
        put: async (content) => {
          writeCount += 1;
          if (writeCount === 4) {
            throw new Error("simulated private storage failure");
          }
          return await store.put(content);
        }
      },
      providerParseApprovalPreview: await providerParsePreviewInput()
    });

    expect(writeCount).toBe(4);
    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: {
        category: "external-effect-failed",
        code: "evidence-triage-derivative-storage-failed",
        retryable: true
      },
      outputArtifacts: [],
      toolRequestIds: []
    });
    expect(JSON.stringify(result.handoff)).not.toContain("simulated private storage failure");
    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toContain("agent.tool.requested");
  });

  it("rejects hostile provider-preview data before invoking getters, models, or tools", async () => {
    let getterCalls = 0;
    const accessorPreview = { ...await providerParsePreviewInput() };
    Object.defineProperty(accessorPreview, "toolId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return providerParseExecuteDescriptor.toolId;
      }
    });
    const accessor = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(accessor.ledger, accessor.runtime, createTriageContextPacks([])),
      providerParseApprovalPreview: accessorPreview
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
    expectNoPreflightEffects(await accessor.ledger.readAll());

    const nested = await providerParsePreviewInput();
    const binding = { ...(nested.evidenceBindings as readonly Record<string, unknown>[])[0] };
    Object.defineProperty(binding, "evidenceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "ev_triage_001";
      }
    });
    const nestedAccessor = await preparedRuntime(modelOutput());
    await expect(runEvidenceTriageWorkflow({
      ...baseRunInput(nestedAccessor.ledger, nestedAccessor.runtime, createTriageContextPacks([])),
      providerParseApprovalPreview: { ...nested, evidenceBindings: [binding] }
    })).rejects.toThrow(/data properties/i);
    expect(getterCalls).toBe(0);
    expectNoPreflightEffects(await nestedAccessor.ledger.readAll());

    const cyclicValue: Record<string, unknown> = {};
    cyclicValue.self = cyclicValue;
    const hostileCases = [
      ["non-finite", { nestedMetadata: { confidence: Number.NaN } }, /non-finite/i],
      ["cycle", { nestedMetadata: cyclicValue }, /cycle/i],
      ["non-enumerable", { nestedMetadata: nonEnumerableObject() }, /non-enumerable/i],
      ["symbol", { nestedMetadata: symbolKeyedObject() }, /symbol-keyed/i],
      ["prototype", { nestedMetadata: Object.create({ hidden: true }) }, /plain JSON objects/i]
    ] as const;

    for (const [_label, patch, expected] of hostileCases) {
      const { ledger, runtime } = await preparedRuntime(modelOutput());
      await expect(runEvidenceTriageWorkflow({
        ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
        providerParseApprovalPreview: { ...await providerParsePreviewInput(), ...patch }
      })).rejects.toThrow(expected);
      expectNoPreflightEffects(await ledger.readAll());
    }
  });

  it("rejects model output that claims an assertion was proposed, accepted, or added to the accepted graph", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput({
      dossierSummary: "The assertion was proposed, accepted, and added to the accepted graph."
    }));

    const result = await runEvidenceTriageWorkflow({
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      providerParseApprovalPreview: await providerParsePreviewInput()
    });

    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: { category: "model-output-invalid", retryable: true }
    });
    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toContain("agent.tool.requested");
  });

  it("is replay-safe and refuses to duplicate the local derivative step", async () => {
    const { ledger, runtime } = await preparedRuntime(modelOutput({ requestProviderParseApproval: false }));
    const input = {
      ...baseRunInput(ledger, runtime, createTriageContextPacks([])),
      providerParseApprovalPreview: await providerParsePreviewInput()
    };

    await runEvidenceTriageWorkflow(input);
    const afterFirstRun = await ledger.readAll();
    await expect(runEvidenceTriageWorkflow(input)).rejects.toThrow(/already recorded/i);
    expect(await ledger.readAll()).toHaveLength(afterFirstRun.length);
  });
});

async function preparedRuntime(responseText: string) {
  const ledger = new InMemoryEventLedger();
  const provider = new FakeModelProvider({
    providerId: "provider_fake_local",
    modelFamilies: ["fake-local"],
    responseText
  });
  const runtime = createAgentRuntime({ ledger, actor, now, providers: [provider] });
  await runtime.initializeDefaultIdentity({ workspaceId: "ws_triage" });
  await runtime.createTask({
    taskId: "task_evidence_triage_001",
    title: "Triage production evidence",
    requestedBy: "actor_investigator",
    priority: "normal"
  });
  await runtime.startRun({
    runId: "run_evidence_triage_001",
    taskId: "task_evidence_triage_001",
    runType: "evidence-triage",
    scope: { kind: "workspace", refs: ["ws_triage"] }
  });
  return { ledger, runtime };
}

function baseRunInput(
  ledger: InMemoryEventLedger,
  runtime: ReturnType<typeof createAgentRuntime>,
  contextPacks: ReturnType<typeof createContextPackRegistry>
) {
  return {
    ledger,
    actor,
    now,
    contextPacks,
    runtime,
    providerReadiness: providerReadinessDto(),
    runId: "run_evidence_triage_001",
    taskId: "task_evidence_triage_001",
    providerId: "provider_fake_local",
    modelFamily: "fake-local",
    credentialRef: {
      credentialRefId: "agent_credref_fake_local",
      providerId: "provider_fake_local",
      kind: "local-no-secret" as const
    },
    evidenceIds: ["ev_triage_001"],
    derivativeStore: createDerivativeStore()
  };
}

function createDerivativeStore() {
  const blobStore = new FileBlobStore(mkdtempSync(join(tmpdir(), "cestus-agent-evidence-triage-")));
  const derivativeStore = createSpecialistDerivativeArtifactStore(blobStore);
  return Object.freeze({
    put: derivativeStore.put,
    get: blobStore.get.bind(blobStore)
  });
}

function createTriageContextPacks(
  builtIds: string[],
  binding: { readonly evidenceEventId?: string; readonly linkEventId?: string } = {}
) {
  const registry = createContextPackRegistry();
  for (const contextPackId of [
    "evidence-summary.v1",
    "governance-locks.v1",
    "prr-read-model.v1",
    "accepted-graph-projection.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ]) {
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
      parsePayload: triageContextPackParser(contextPackId),
      build: () => {
        builtIds.push(contextPackId);
        return {
          contextPackId,
          version: 1,
          generatedAt: now(),
          payload: triageContextPayload(contextPackId),
          safeSummary: `${contextPackId} contains safe triage references.`,
          provenanceRefs: [
            "event:evt_triage_context_001",
            "ev_triage_001",
            ...(binding.evidenceEventId === undefined ? [] : [binding.evidenceEventId]),
            evidenceHash
          ],
          sourceEventIds: [
            "evt_triage_context_001",
            ...(binding.evidenceEventId === undefined ? [] : [binding.evidenceEventId]),
            ...(binding.linkEventId === undefined ? [] : [binding.linkEventId])
          ],
          artifactHashes: [evidenceHash],
          sizeBudgetBytes: 16_384
        };
      }
    });
  }
  return registry;
}

function triageContextPackParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue, ref?: { readonly contextPackId: string }): AgentContextPackJsonValue => {
    if (ref?.contextPackId !== contextPackId || !isTriageContextPayloadForPack(contextPackId, payload)) {
      throw new Error("invalid triage context pack payload");
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

function isTriageContextPayloadForPack(contextPackId: string, payload: AgentContextPackJsonValue): boolean {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const value = payload as Readonly<Record<string, AgentContextPackJsonValue>>;
  switch (contextPackId) {
    case "evidence-summary.v1":
      return Array.isArray(value.items);
    case "governance-locks.v1": {
      const items = value.items as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return items !== undefined && Array.isArray(items.activeLocks) && Array.isArray(items.governanceRestrictions);
    }
    case "accepted-graph-projection.v1": {
      const items = value.items as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return items !== undefined && Array.isArray(items.assertions) && Array.isArray(items.entities) && Array.isArray(items.relationships);
    }
    case "agent-memory-summary.v1": {
      const memory = value.memory as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return memory !== undefined && Array.isArray(memory.activeMemory) && Array.isArray(memory.sourceEventIds) && Array.isArray(memory.artifactHashes);
    }
    case "task-run-history.v1": {
      const history = value.history as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return history !== undefined && Array.isArray(history.tasks) && Array.isArray(history.runs) && Array.isArray(history.modelInvocations) && Array.isArray(history.toolRequests);
    }
    case "workspace-runtime-status.v1": {
      const runtime = value.runtime as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return runtime !== undefined && Array.isArray(runtime.providerStates) && Array.isArray(runtime.diagnostics) && Array.isArray(runtime.omissionCodes);
    }
    case "prr-read-model.v1":
      return value.lifecycle !== undefined && value.requestStream !== undefined && Array.isArray(value.diagnostics) && Array.isArray(value.gates) && Array.isArray(value.omissions);
    default:
      return false;
  }
}

function triageContextPayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "evidence-summary.v1": return { items: [{ evidenceId: "ev_triage_001", ingestionEventId: "evt_triage_context_001", contentHash: evidenceHash, occurrenceIds: ["occurrence_triage_001"], safeNarrative: "Verified triage evidence." }] };
    case "governance-locks.v1": return { items: { activeLocks: [], governanceRestrictions: [{ restrictionId: "restriction_triage_001", restrictionKind: "review", affectedRef: "ev_triage_001", sourceEventIds: ["evt_triage_context_001"], projectionProvenanceRefs: ["evt_triage_context_001"], policyVersion: "v1", safeReasonCode: "review-required" }] } };
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_triage_001", evidenceId: "ev_triage_001", evidenceContentHash: evidenceHash, proposedByEventId: "evt_triage_context_001", acceptedByEventId: "evt_triage_context_001", sourceEventIds: ["evt_triage_context_001"], rowHash: evidenceHash, safeStatement: "Verified triage graph statement." }], entities: [], relationships: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: [{ memoryId: "memory_triage_001", scope: "task", memoryKind: "summary", summary: "Verified triage memory.", confidence: 1, sourceEventIds: ["evt_triage_context_001"], artifactHashes: [] }], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_triage_context_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_evidence_triage_001", status: "running", priority: "normal", statusReasonCode: "Triage context prepared." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_triage_context_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    case "prr-read-model.v1": return { lifecycle: {}, requestStream: {}, diagnostics: [], gates: [], omissions: [] };
    default: throw new Error(`Unknown triage context pack ${contextPackId}`);
  }
}

function modelOutput(patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    dossierSummary: "Public instructions say investigators should classify evidence before requesting review.",
    safeSummaries: ["Sensitive model note for local summary only."],
    governanceFlags: [{
      evidenceId: "ev_triage_001",
      tag: "contains_pii",
      confidence: 0.91,
      rationale: "Sensitive model note for governance review only."
    }],
    duplicateGroups: [{
      groupId: "dup_group_001",
      evidenceIds: ["ev_triage_001"],
      rationale: "Same production hash family."
    }],
    evidenceGaps: ["Provider parse is needed before extraction review."],
    assertionCandidates: [{
      candidateId: "cand_triage_001",
      evidenceId: "ev_triage_001",
      predicate: "contract.vendor",
      confidence: 0.64,
      rationale: "Candidate is ready for human/domain proposal review."
    }],
    requestProviderParseApproval: true,
    requestGovernanceReview: true,
    requestQuarantineReview: true,
    requestAssertionProposalReview: true,
    ...patch
  });
}

async function providerParsePreviewInput() {
  return buildProviderByteTransferApprovalPreview({
    toolRequestId: "toolreq_evidence_triage_provider_parse",
    toolId: providerParseExecuteDescriptor.toolId,
    toolVersion: providerParseExecuteDescriptor.toolVersion,
    runId: "run_evidence_triage_001",
    taskId: "task_evidence_triage_001",
    residentAgentId: "agent_default",
    providerJobId: "provider_triage_parse_001",
    sourceCollectionId: "src_triage_production",
    importBatchId: "imp_triage_production_001",
    providerId: "provider_document_ai",
    providerCapability: providerCapability(),
    providerReadiness: providerParseReadinessCard(),
    credentialRefId: "agent_credref_document_ai",
    providerApprovalEventId: "evt_provider_parse_approved_001",
    providerApproval: providerApproval("evt_provider_parse_approved_001"),
    evidenceBindings: [{
      evidenceId: "ev_triage_001",
      evidenceEventId: "evt_evidence_triage_001",
      linkEventId: "evt_evidence_link_triage_001",
      contentHash: evidenceHash,
      byteCount: 422,
      mediaType: "application/pdf"
    }],
    promptArtifact: await promptAudit("evt_evidence_triage_001", "evt_evidence_link_triage_001"),
    excerptPolicy: "send-full-technically-eligible" as const,
    governanceTags: ["public_record"],
    activeLocks: [],
    projectionHighWaterMark: 12,
    domainReviewerId: "actor_provider_reviewer"
  });
}

async function providerParseCurrentPreview(ledger: InMemoryEventLedger) {
  const evidence = await ledger.append(providerParseEvidenceEvent());
  if (evidence.type !== "evidence.ingested") {
    throw new Error("Expected evidence.ingested.");
  }
  const link = await ledger.append(providerParseLinkEvent(evidence));
  if (link.type !== "ingestion.evidence.linked") {
    throw new Error("Expected ingestion.evidence.linked.");
  }
  const capability = providerCapability();
  const approval = await new ProviderParseApprovalService({ ledger, actor: providerParseHuman }).approveProviderBatch({
    providerJobId: "provider_triage_parse_001",
    sourceCollectionId: "src_triage_production",
    importBatchId: "imp_triage_production_001",
    provider: { name: "provider_document_ai", version: capability.adapterVersion },
    approvedBy: providerParseHuman.id,
    approvedAt: now(),
    eligibleMediaTypes: ["application/pdf"],
    maxBytesPerFile: 10_000
  });
  const audit = await promptAudit(evidence.id, link.id);
  const currentPreviewInput = {
    ledger,
    reviewer: providerParseHuman,
    residentAgentId: "agent_default",
    taskId: "task_evidence_triage_001",
    providerJobId: "provider_triage_parse_001",
    sourceCollectionId: "src_triage_production",
    importBatchId: "imp_triage_production_001",
    providerId: "provider_document_ai",
    approvalEventId: approval.id,
    credentialRefId: "agent_credref_document_ai",
    evidenceBindings: [{
      evidenceId: "ev_triage_001",
      evidenceEventId: evidence.id,
      linkEventId: link.id,
      contentHash: evidenceHash,
      byteCount: 422,
      mediaType: "application/pdf"
    }],
    approvedProviderCapability: capability,
    approvedProviderReadiness: providerParseReadinessCard(),
    approvedPromptArtifact: audit,
    excerptPolicy: "send-full-technically-eligible" as const,
    providerRegistry: { require: () => capability },
    readProviderReadiness: async () => ({
      schemaVersion: "agent-provider-readiness.v1" as const,
      generatedAt: now(),
      cards: [providerParseReadinessCard()],
      diagnostics: []
    }),
    readPromptArtifactAudit: async () => audit,
    toolRequestId: "toolreq_evidence_triage_provider_parse",
    toolId: providerParseExecuteDescriptor.toolId,
    toolVersion: providerParseExecuteDescriptor.toolVersion,
    runId: "run_evidence_triage_001"
  };
  const current = await rebuildProviderByteTransferCurrentPreview(currentPreviewInput);
  return { currentPreviewInput, current };
}

function providerCapability() {
  return createProviderCapabilityDescriptor({
    providerId: "provider_document_ai",
    label: "Document AI",
    adapterVersion: "document-ai.v1",
    backendKind: "openai-compatible-api",
    modelFamilies: ["document-ai"],
    modalities: ["text"],
    toolSupport: "none",
    structuredOutputSupport: "unsupported",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
    dataHandlingNotes: "Remote parse occurs only after provider byte-transfer approval.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["requires-byte-transfer-approval"],
    fakeSupport: false
  });
}

function providerApproval(eventId: string) {
  return {
    eventId,
    providerJobId: "provider_triage_parse_001",
    sourceCollectionId: "src_triage_production",
    importBatchId: "imp_triage_production_001",
    provider: { name: "provider_document_ai", version: "document-ai.v1" },
    approvedBy: "actor_provider_reviewer",
    approvedAt: now(),
    eligibleMediaTypes: ["application/pdf"],
    maxBytesPerFile: 10_000,
    policy: "send-all-technically-eligible" as const
  };
}

async function promptAudit(evidenceEventId: string, linkEventId: string) {
  const registry = createTriageContextPacks([], { evidenceEventId, linkEventId });
  const resolvedContextPacks = await Promise.all([
    "evidence-summary.v1",
    "governance-locks.v1",
    "accepted-graph-projection.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ].map(async (contextPackId) => await registry.buildResolved(contextPackId)));
  return promptArtifactAuditMetadata(renderProductionSpecialistPrompt({
    runType: "evidence-triage",
    runId: "run_evidence_triage_001",
    taskId: "task_evidence_triage_001",
    generatedAt: now(),
    scope: { kind: "imported-evidence", refs: ["ev_triage_001"] },
    resolvedContextPacks
  }));
}

function providerParseEvidenceEvent(): AppendableKnowledgeEvent<"evidence.ingested"> {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_triage_001",
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: now(),
      correlationId: "corr_ev_triage_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_triage_001",
      source: { kind: "file", label: "approved-triage-document.pdf" },
      contentHash: evidenceHash,
      mediaType: "application/pdf",
      sizeBytes: 422
    }
  };
}

function providerParseLinkEvent(
  evidence: KnowledgeEventOf<"evidence.ingested">
): AppendableKnowledgeEvent<"ingestion.evidence.linked"> {
  return {
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: "ingestion_evidence_link_src_triage_production_imp_triage_production_001",
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: now(),
      causationId: evidence.id,
      correlationId: "corr_imp_triage_production_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_triage_001",
      sourceCollectionId: "src_triage_production",
      importBatchId: "imp_triage_production_001",
      contentHash: evidenceHash,
      occurrenceIds: ["occ_triage_production_001"]
    }
  };
}

function providerReadinessDto(): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: now(),
    cards: [{
      providerId: "provider_fake_local",
      label: "Fake Local Model Provider",
      backendKind: "local-engine",
      capabilitySummary: ["text"],
      credentialKindSummary: ["local-no-secret"],
      state: "works-locally",
      requiredApprovalClass: "none",
      credentialHealth: "not-required",
      dataHandlingPosture: "local-only",
      safeActionIds: ["action_use_local_provider"]
    }],
    diagnostics: []
  };
}

function providerParseReadinessCard(): ProviderSetupCard {
  return {
    providerId: "provider_document_ai",
    label: "Document AI",
    backendKind: "openai-compatible-api",
    capabilitySummary: ["text", "document-ai"],
    credentialKindSummary: ["api-key-bearer"],
    state: "requires-byte-transfer-approval",
    requiredApprovalClass: "provider-byte-transfer",
    credentialHealth: "local-binding-healthy",
    dataHandlingPosture: "remote-prompt-byte-transfer-gated",
    credentialRefId: "agent_credref_document_ai",
    safeActionIds: ["action_request_provider_byte_transfer_approval"]
  };
}

function nonEnumerableObject() {
  const value = { visible: true };
  Object.defineProperty(value, "hidden", { enumerable: false, value: true });
  return value;
}

function symbolKeyedObject() {
  const symbolKey = Symbol("hidden");
  const value = { visible: true } as Record<PropertyKey, unknown>;
  value[symbolKey] = true;
  return value;
}

function expectNoPreflightEffects(events: Awaited<ReturnType<InMemoryEventLedger["readAll"]>>): void {
  const eventTypes = events.map((event) => event.type);
  expect(eventTypes).not.toContain("agent.model-invocation.requested");
  expect(eventTypes).not.toContain("agent.model-invocation.completed");
  expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
  expect(eventTypes).not.toContain("agent.tool.requested");
}

class MutatingModelProvider implements ModelProviderAdapter {
  constructor(private readonly evidenceIds: string[]) {}

  describe(): ProviderDescriptor {
    return {
      providerId: "provider_fake_local",
      label: "Mutating Test Provider",
      adapterVersion: "mutating-test.v1",
      endpointKind: "local-engine",
      modelFamilies: ["fake-local"],
      credentialKinds: ["local-no-secret"],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Test provider mutates caller-owned evidence IDs before returning."
    };
  }

  async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    this.evidenceIds[0] = "ev_mutated_001";
    return {
      outputText: modelOutput({ requestProviderParseApproval: false }),
      outputArtifactHash: hashText("mutating provider output"),
      usage: { inputUnits: 1, outputUnits: 1 }
    };
  }
}

function hashText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
