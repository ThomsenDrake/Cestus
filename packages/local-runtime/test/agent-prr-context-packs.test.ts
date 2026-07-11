import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResolvedContextPack,
  createAgentRuntime,
  createContextPackRegistry,
  prepareSpecialistRun,
  productionSpecialistPromptRegistrationFor,
  verifyResolvedContextPack,
  type AgentContextPackJsonValue,
  type ContextPackPayloadParser,
  type ContextPackRegistry,
  type ResolvedContextPack,
  type SpecialistRunnerModelInvoker
} from "../../agent/src/index.js";
import { registerContextPackPayloadParserAuthority } from "../../agent/src/context-packs.js";
import { prrReadModelPayloadParser } from "../../agent/src/prr-context-packs.js";
import { PrrLifecycleService } from "../../prr/src/lifecycle.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import { registerLocalRuntimeSelectedPrrContextPacks } from "../src/agent-prr-context-packs.js";

const tempDirs: string[] = [];
const now = () => "2026-07-10T12:00:00.000Z";
const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const safeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const selectedBodyHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
const selectedEvidenceHash = "sha256:3333333333333333333333333333333333333333333333333333333333333333" as const;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime selected PRR context pack registration", () => {
  it("registers only selected-request PRR packs without leaking unrelated request IDs", async () => {
    const handle = createTestHandle(["prr_req_selected", "prr_unrelated_sensitive"]);
    try {
      await createDraft(handle, "Selected Agency", "Safe selected request summary.");
      await createDraft(handle, "Agency Not Selected", "Unrelated sensitive request.");

      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_selected",
        now,
        policyVersion: "agent-policy-v1"
      });

      const prrResolved = await registry.buildResolved("prr-read-model.v1");
      const jurisdictionResolved = await registry.buildResolved("jurisdiction-pack-summary.v1");
      const prrRef = verifyResolvedContextPack(prrResolved).ref;
      const jurisdictionRef = verifyResolvedContextPack(jurisdictionResolved).ref;

      expect(prrRef.scope).toEqual({ kind: "prr-request", id: "prr_req_selected" });
      expect(jurisdictionRef.scope).toEqual({ kind: "prr-request", id: "prr_req_selected" });
      expect(JSON.stringify([prrResolved, jurisdictionResolved])).not.toMatch(
        /prr_unrelated_sensitive|Agency Not Selected|Unrelated sensitive/
      );
      expect((await handle.runtime.readEvents()).map((event) => event.type)).not.toEqual(expect.arrayContaining([
        "prr.request.sent",
        "prr.followup.sent",
        "prr.legal-escalation.confirmed",
        "agent.tool.requested"
      ]));
    } finally {
      handle.close();
    }
  });

  it("fails closed when the selected request is absent", async () => {
    const handle = createTestHandle();
    try {
      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_missing",
        now
      });

      await expect(registry.buildResolved("prr-read-model.v1")).rejects.toThrow(/prr-request-missing|missing/i);
      await expect(registry.buildResolved("jurisdiction-pack-summary.v1")).rejects.toThrow(/prr-request-missing|missing/i);
    } finally {
      handle.close();
    }
  });

  it("binds selected correspondence and evidence hashes without exposing provider metadata", async () => {
    const handle = createTestHandle(["prr_req_selected"]);
    try {
      await createDraft(handle, "Selected Agency", "Safe selected request summary.");
      await appendEvidence(handle, "ev_selected_attachment", selectedEvidenceHash);
      const lifecycle = new PrrLifecycleService({ ledger: handle.ledger, actor });
      await lifecycle.markRequestSent({
        prrRequestId: "prr_req_selected",
        correspondenceId: "corr_selected_sent",
        provider: "gmail",
        providerMessageId: "provider-msg-selected",
        providerThreadId: "provider-thread-selected",
        idempotencyKey: "send_prr_req_selected_corr_selected_sent",
        subject: "Selected PRR request",
        bodyHash: selectedBodyHash,
        attachmentEvidenceIds: ["ev_selected_attachment"],
        sentAt: now(),
        approvedBy: actor.id,
        rawMetadata: { accountEmail: "investigator@example.org", providerTrace: "provider-trace-selected" }
      });

      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_selected",
        now
      });

      const prrResolved = await registry.buildResolved("prr-read-model.v1");
      expect(prrResolved.ref.artifactHashes).toEqual(expect.arrayContaining([selectedBodyHash, selectedEvidenceHash]));
      expect(JSON.stringify(prrResolved.payload)).toContain("corr_selected_sent");
      expect(JSON.stringify(prrResolved.payload)).toContain(selectedBodyHash);
      expect(JSON.stringify(prrResolved.payload)).toContain(selectedEvidenceHash);
      expect(JSON.stringify(prrResolved.payload)).not.toMatch(
        /provider-msg-selected|provider-thread-selected|provider-trace-selected|investigator@example\.org|gmail/
      );
    } finally {
      handle.close();
    }
  });

  it("renders selected payload sentinels after hash verification and blocks missing or mismatched resolution before provider invocation", async () => {
    const handle = createTestHandle(["prr_req_selected"]);
    try {
      await createDraft(handle, "Selected Agency", "Safe selected request summary.");

      const registry = createContextPackRegistry();
      registerLocalRuntimeSelectedPrrContextPacks({
        registry,
        handle,
        prrRequestId: "prr_req_selected",
        now,
        policyVersion: "agent-policy-v1"
      });
      registerRemainingPrrNegotiationContextPacks(registry);

      const prrResolved = await registry.buildResolved("prr-read-model.v1");
      const jurisdictionResolved = await registry.buildResolved("jurisdiction-pack-summary.v1");
      expect(prrResolved.ref.safeSummary).not.toContain("2026-08-07");
      expect(jurisdictionResolved.ref.safeSummary).not.toContain("federal-determination-20-working-days");
      expect(JSON.stringify(jurisdictionResolved.payload)).toContain("federal-determination-20-working-days");

      const agentRuntime = createAgentRuntime({ ledger: handle.ledger, actor, now });
      await agentRuntime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
      await agentRuntime.createTask({
        taskId: "task_prr_negotiation",
        title: "Negotiate selected PRR",
        requestedBy: actor.id,
        priority: "normal"
      });
      await agentRuntime.startRun({
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        runType: "prr-negotiation",
        scope: { kind: "workspace", refs: ["ws_case_001"] }
      });

      const runtime = fakeInvoker();
      const prepared = await prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: registry,
        scope: selectedPrrRunScope("prr_req_selected"),
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake",
          providerId: "provider_fake_local",
          kind: "local-no-secret"
        },
        runtime,
        providerReadiness: { cards: [readyProviderCard()] }
      }, "prr-negotiation");

      expect(prepared.promptArtifact.text).toContain("2026-08-07");
      expect(prepared.promptArtifact.text).toContain("20 working days determination estimate");

      const forgedRegistry = forgedPrrRegistry(prrResolved);
      registerRemainingPrrNegotiationContextPacks(forgedRegistry, { jurisdictionPackSummary: jurisdictionResolved });
      await expect(prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: forgedRegistry,
        scope: selectedPrrRunScope("prr_req_selected"),
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake",
          providerId: "provider_fake_local",
          kind: "local-no-secret"
        },
        runtime,
        providerReadiness: { cards: [readyProviderCard()] }
      }, "prr-negotiation")).rejects.toThrow(/payload-hash-mismatch|payload-schema-mismatch|forged/i);
      expect(runtime.invokeModel).not.toHaveBeenCalled();

      const missingPrrRegistry = createContextPackRegistry();
      registerRemainingPrrNegotiationContextPacks(missingPrrRegistry, {
        jurisdictionPackSummary: jurisdictionResolved,
        omitContextPackIds: ["prr-read-model.v1"]
      });
      await expect(prepareSpecialistRun({
        ledger: handle.ledger,
        actor,
        now,
        contextPacks: missingPrrRegistry,
        scope: selectedPrrRunScope("prr_req_selected"),
        runId: "run_prr_negotiation",
        taskId: "task_prr_negotiation",
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake",
          providerId: "provider_fake_local",
          kind: "local-no-secret"
        },
        runtime,
        providerReadiness: { cards: [readyProviderCard()] }
      }, "prr-negotiation")).rejects.toThrow(/prr-read-model|not registered|missing/i);
      expect(runtime.invokeModel).not.toHaveBeenCalled();
    } finally {
      handle.close();
    }
  });
});

async function createDraft(handle: LocalRuntimeHandle, agencyName: string, requestText: string): Promise<void> {
  const created = await handle.runtime.createDraftRequest({
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    agency: { name: agencyName, email: "foia@example.gov" },
    requester: { name: "Investigator", email: "investigator@example.org" },
    requestText,
    receivedAt: now()
  });
  expect(created.ok).toBe(true);
}

async function appendEvidence(
  handle: LocalRuntimeHandle,
  evidenceId: string,
  contentHash: `sha256:${string}`
): Promise<void> {
  await handle.ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: evidenceId,
    context: {
      actor,
      occurredAt: now(),
      correlationId: `corr_${evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId,
      source: { kind: "message", label: `Evidence ${evidenceId}` },
      contentHash,
      mediaType: "message/rfc822",
      sizeBytes: 42
    }
  }, { expectedNextSequence: 1 });
}

function createTestHandle(requestIds: readonly string[] = []): LocalRuntimeHandle {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-local-prr-context-"));
  tempDirs.push(cwd);
  let requestIndex = 0;
  return createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor,
    now,
    requestIdFactory: () => requestIds[requestIndex++] ?? `prr_generated_${requestIndex}`
  });
}

function selectedPrrRunScope(prrRequestId: string) {
  return { kind: "prr-negotiation", refs: ["ws_case_001", prrRequestId], associatedPrrRequestId: prrRequestId } as const;
}

function registerRemainingPrrNegotiationContextPacks(
  registry: ContextPackRegistry,
  options: {
    readonly jurisdictionPackSummary?: ResolvedContextPack;
    readonly omitContextPackIds?: readonly string[];
  } = {}
): void {
  const omitted = new Set(options.omitContextPackIds ?? []);
  for (const requirement of productionSpecialistPromptRegistrationFor("prr-negotiation").contextRequirements) {
    const contextPackId = requirement.contextPackId;
    if (omitted.has(contextPackId) || registry.getDescriptor(contextPackId) !== undefined) {
      continue;
    }
    if (contextPackId === "jurisdiction-pack-summary.v1" && options.jurisdictionPackSummary !== undefined) {
      registerResolvedFixtureBuilder(registry, contextPackId, options.jurisdictionPackSummary);
      continue;
    }
    if (contextPackId === "prr-read-model.v1") {
      continue;
    }
    registerPayloadFixtureBuilder(registry, contextPackId, fixturePayload(contextPackId));
  }
}

function registerPayloadFixtureBuilder(
  registry: ContextPackRegistry,
  contextPackId: string,
  payload: AgentContextPackJsonValue
): void {
  registerResolvedFixtureBuilder(registry, contextPackId, buildResolvedContextPack({
    contextPackId,
    version: 1,
    generatedAt: now(),
    payload,
    safeSummary: `Verified ${contextPackId} fixture.`,
    provenanceRefs: ["evt_fixture_context_001"]
  }));
}

function registerResolvedFixtureBuilder(
  registry: ContextPackRegistry,
  contextPackId: string,
  resolved: ResolvedContextPack
): void {
  const parser = parserWithIdentity(contextPackId);
  registry.register({
    descriptor: {
      contextPackId,
      version: 1,
      label: `Fixture ${contextPackId}`,
      maxBytes: 65_536,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "agent.fixture"
    },
    parsePayload: parser,
    build: () => resolved
  });
}

function forgedPrrRegistry(prrResolved: ResolvedContextPack): ContextPackRegistry {
  const registry = createContextPackRegistry();
  registry.register({
    descriptor: {
      contextPackId: "prr-read-model.v1",
      version: 1,
      label: "Forged PRR read model",
      maxBytes: 65_536,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "agent.fixture"
    },
    parsePayload: prrReadModelPayloadParser,
    build: () => ({
      ref: prrResolved.ref,
      payload: {
        ...prrResolved.payload as Record<string, AgentContextPackJsonValue>,
        forgedDeadline: "2099-01-01"
      }
    })
  });
  return registry;
}

function parserWithIdentity(contextPackId: string): ContextPackPayloadParser {
  const parser: ContextPackPayloadParser = (payload) => payload;
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function fixturePayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "evidence-summary.v1":
      return { items: [{ evidenceId: "ev_imported_001", ingestionEventId: "evt_ingested_001", contentHash: safeHash, occurrenceIds: ["occurrence_001"], parseJobs: [], governanceTags: [], safeNarrative: "Verified evidence is available." }] };
    case "governance-locks.v1":
      return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Review required.", activatedBy: "agent_001", activatedAt: now(), relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1":
      return { memory: { activeMemory: ["Verified memory."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1":
      return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_001", status: "queued", statusReasonCode: "Verified task history." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [], window: { order: "created-at", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] } } };
    case "workspace-runtime-status.v1":
      return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default:
      throw new Error(`Unexpected PRR negotiation fixture pack ${contextPackId}`);
  }
}

function readyProviderCard() {
  return {
    providerId: "provider_fake_local",
    label: "Fake local",
    backendKind: "local-engine" as const,
    capabilitySummary: ["Deterministic local test provider"],
    credentialKindSummary: ["local-no-secret" as const],
    state: "ready" as const,
    requiredApprovalClass: "none" as const,
    credentialHealth: "local-binding-healthy" as const,
    dataHandlingPosture: "local-only" as const,
    safeActionIds: []
  };
}

function fakeInvoker(): SpecialistRunnerModelInvoker & { readonly invokeModel: ReturnType<typeof vi.fn> } {
  return {
    invokeModel: vi.fn(async () => ({
      ok: true,
      value: {
        invocationId: "inv_fake_local",
        outputArtifactHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        eventIds: [],
        outputText: "{\"summary\":\"ok\"}"
      }
    }))
  } as SpecialistRunnerModelInvoker & { readonly invokeModel: ReturnType<typeof vi.fn> };
}
