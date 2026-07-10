import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  buildAgentProjection,
  createAgentRuntime,
  createContextPackRegistry,
  createSpecialistDerivativeArtifactStore,
  FakeModelProvider,
  runInvestigationPlannerWorkflow
} from "../src/index.js";
import type { ProviderReadinessDto } from "../src/index.js";

const now = () => "2026-07-10T01:00:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };

describe("investigation planner workflow", () => {
  it("produces only local task and PRR draft candidates from investigation context", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const contextPacks = createPlannerContextPacks();
    const derivativeStore = createDerivativeStore();

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks,
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      derivativeStore,
      investigationId: "inv_scope_001"
    });

    expect(result.handoff.runType).toBe("investigation-planner");
    expect(result.handoff.status).toBe("ready-for-review");
    expect(result.handoff.outputArtifacts.map((artifact) => artifact.artifactKind)).toEqual(expect.arrayContaining([
      "investigation-plan-artifact", "task-suggestion-bundle", "draft-prr-candidate-bundle"
    ]));
    for (const artifact of result.handoff.outputArtifacts) {
      await expect(derivativeStore.get(artifact.artifactHash)).resolves.toBeInstanceOf(Buffer);
    }
    expect(JSON.stringify(result.handoff)).not.toContain("Private witness timeline note");
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed"
    ]));
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "agent.tool.requested", "prr.request.sent", "prr.followup.sent"
    ]));
  });

  it.each([
    [undefined, false, "investigation scope"],
    ["inv_scope_001", true, "governance lock"]
  ])("blocks on %s or active governance lock", async (investigationId, governanceLocked, message) => {
    const { ledger, runtime } = await preparedRuntime();
    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(governanceLocked),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      derivativeStore: createDerivativeStore(),
      ...(investigationId === undefined ? {} : { investigationId })
    });

    expect(result.handoff.status).toBe("blocked");
    expect(result.handoff.safeSummary).toMatch(new RegExp(message, "i"));
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  });

  it("blocks before model invocation when derivative storage is unavailable", async () => {
    const { ledger, runtime } = await preparedRuntime();

    await expect(runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      investigationId: "inv_scope_001"
    })).rejects.toThrow(/derivative artifact store/i);

    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  });

  it("records a safe failed handoff when a later derivative write fails after model invocation", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const backingStore = createDerivativeStore();
    let writeCount = 0;

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      derivativeStore: {
        put: async (content) => {
          writeCount += 1;
          if (writeCount === 2) {
            throw new Error("private investigation storage failure");
          }
          return await backingStore.put(content);
        }
      },
      investigationId: "inv_scope_001"
    });

    expect(writeCount).toBe(2);
    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: {
        category: "external-effect-failed",
        code: "investigation-planner-derivative-storage-failed",
        retryable: true
      },
      outputArtifacts: [],
      toolRequestIds: []
    });
    expect(JSON.stringify(result.handoff)).not.toContain("private investigation storage failure");
    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toContain("agent.specialist-run.completed");
    expect(eventTypes).not.toContain("agent.tool.requested");
    expect(buildAgentProjection(events).runs.get("run_investigation_001")?.state).toBe("failed");
  });

  it("records invalid model output as a safe failed handoff without local artifacts", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "not-json"
    });
    const runtime = createAgentRuntime({
      ledger,
      actor,
      now,
      providers: [provider]
    });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_investigation" });
    await runtime.createTask({
      taskId: "task_investigation_001",
      title: "Plan investigation",
      requestedBy: "actor_investigator",
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      runType: "investigation-planner",
      scope: { kind: "investigation", refs: ["inv_scope_001"] }
    });

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret"
      },
      derivativeStore: createDerivativeStore(),
      investigationId: "inv_scope_001"
    });

    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: { category: "model-output-invalid", retryable: true }
    });
    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toContain("agent.specialist-run.completed");
    expect(eventTypes).not.toContain("agent.tool.requested");
  });
});

async function preparedRuntime() {
  const ledger = new InMemoryEventLedger();
  const provider = new FakeModelProvider({
    providerId: "provider_fake_local",
    modelFamilies: ["fake-local"],
    responseText: JSON.stringify({
      planSummary: "Private witness timeline note for investigator review.",
      taskSuggestions: ["Review procurement timeline."],
      prrDraftCandidates: ["Draft a request for contract amendments."]
    })
  });
  const runtime = createAgentRuntime({
    ledger,
    actor,
    now,
    providers: [provider]
  });
  await runtime.initializeDefaultIdentity({ workspaceId: "ws_investigation" });
  await runtime.createTask({
    taskId: "task_investigation_001",
    title: "Plan investigation",
    requestedBy: "actor_investigator",
    priority: "normal"
  });
  await runtime.startRun({
    runId: "run_investigation_001",
    taskId: "task_investigation_001",
    runType: "investigation-planner",
    scope: { kind: "investigation", refs: ["inv_scope_001"] }
  });
  return { ledger, runtime, provider };
}

function createPlannerContextPacks(governanceLocked = false) {
  const registry = createContextPackRegistry();
  for (const contextPackId of [
    "accepted-graph-projection.v1", "evidence-summary.v1", "prr-read-model.v1",
    "timeline-draft-summary.v1", "contradiction-candidate-summary.v1", "governance-locks.v1",
    "agent-memory-summary.v1", "task-run-history.v1", "workspace-runtime-status.v1"
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
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: now(),
        payload: { governanceLocked: contextPackId === "governance-locks.v1" && governanceLocked },
        safeSummary: contextPackId === "governance-locks.v1" && governanceLocked
          ? "Quarantine hold present."
          : `${contextPackId} is safe for planning.`,
        provenanceRefs: ["event:evt_context_001"],
        sourceEventIds: ["evt_context_001"],
        ...(contextPackId === "governance-locks.v1" && governanceLocked
          ? { stalenessInputs: [{ kind: "quarantine-lock-active", ref: "lock_quarantine_001", value: "quarantine" }] }
          : {}),
        sizeBudgetBytes: 16_384
      })
    });
  }
  return registry;
}

function createDerivativeStore() {
  const blobStore = new FileBlobStore(mkdtempSync(join(tmpdir(), "cestus-agent-investigation-planner-")));
  const derivativeStore = createSpecialistDerivativeArtifactStore(blobStore);
  return Object.freeze({
    put: derivativeStore.put,
    get: blobStore.get.bind(blobStore)
  });
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
