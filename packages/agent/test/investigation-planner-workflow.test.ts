import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  buildAgentProjection,
  buildSpecialistHandoffProjection,
  createAgentRuntime,
  createContextPackRegistry,
  createSpecialistDerivativeArtifactStore,
  FakeModelProvider,
  runInvestigationPlannerWorkflow
} from "../src/index.js";
import type { ProviderReadinessDto } from "../src/index.js";
import { registerContextPackPayloadParserAuthority } from "../src/context-packs.js";
import type { AgentContextPackJsonValue } from "../src/index.js";

const now = () => "2026-07-10T01:00:00.000Z";
const actor = { id: "actor_agent", kind: "agent" as const, label: "Cestus Agent" };

describe("investigation planner workflow", () => {
  it("rejects stale evidence before recording the advisory plan handoff", async () => {
    const { ledger, runtime } = await preparedRuntime();

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, true),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret" as const
      },
      derivativeStore: createDerivativeStore(),
      investigationId: "inv_scope_001"
    });

    expect((result.handoff as { readonly lifecycle?: string }).lifecycle).not.toBe("handoff-recorded");
    expect((result as { readonly diagnostics?: readonly { readonly category: string }[] }).diagnostics)
      .toContainEqual(expect.objectContaining({ category: "source-stale" }));
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.specialist-handoff.recorded");
  });

  it("records the advisory plan through exact durable handoff readback", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const handoffStore = createDerivativeStore();
    const sourceEventIds = (await ledger.readAll()).map((event) => event.id);
    const input = {
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, false, sourceEventIds),
      runtime,
      providerReadiness: providerReadinessDto(),
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      credentialRef: {
        credentialRefId: "agent_credref_fake_local",
        providerId: "provider_fake_local",
        kind: "local-no-secret" as const
      },
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    };

    const result = await runInvestigationPlannerWorkflow(input);

    expect((result.handoff as { readonly lifecycle?: string }).lifecycle).toBe("handoff-recorded");
    expect("handoffId" in result.handoff).toBe(true);
    expect(result.handoff.status).toBe("ready-for-review");
    expect(result.diagnostics).toEqual([]);
    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]));
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "agent.tool.requested", "prr.request.sent", "prr.followup.sent"
    ]));
    const finalOutputIndex = events.findIndex((event) =>
      event.type === "agent.specialist-run.step.recorded" && event.payload.stepKind === "final-output"
    );
    const preparedIndex = events.findIndex((event) => event.type === "agent.specialist-handoff.prepared");
    const recordedIndex = events.findIndex((event) => event.type === "agent.specialist-handoff.recorded");
    const terminalIndex = events.findIndex((event) => event.type === "agent.specialist-run.completed");
    expect(finalOutputIndex).toBeGreaterThanOrEqual(0);
    expect(finalOutputIndex).toBeLessThan(preparedIndex);
    expect(preparedIndex).toBeLessThan(recordedIndex);
    expect(recordedIndex).toBeLessThan(terminalIndex);
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "assertion.accepted",
      "entity.resolved",
      "relationship.accepted",
      "agent.tool.completed",
      "agent.tool.execution.claimed",
      "prr.request.sent",
      "prr.followup.sent"
    ]));
  });

  it("permits bounded instructional narrative while producing only local task and PRR draft candidates", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const handoffStore = createDerivativeStore();
    const sourceEventIds = (await ledger.readAll()).map((event) => event.id);
    const contextPacks = createPlannerContextPacks(false, false, sourceEventIds);

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
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    });

    expect(result.handoff.runType).toBe("investigation-planner");
    expect(result.handoff.status).toBe("ready-for-review");
    expect((result.handoff as { readonly lifecycle?: string }).lifecycle).toBe("handoff-recorded");
    expect(result.handoff.outputArtifacts.map((artifact) => artifact.artifactKind)).toEqual(expect.arrayContaining([
      "investigation-plan-artifact", "task-suggestion-bundle", "draft-prr-candidate-bundle"
    ]));
    for (const artifact of result.handoff.outputArtifacts) {
      await expect(handoffStore.get(artifact.artifactHash)).resolves.toBeInstanceOf(Buffer);
    }
    const planArtifact = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "investigation-plan-artifact");
    const taskArtifact = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "task-suggestion-bundle");
    expect(planArtifact).toBeDefined();
    expect(taskArtifact).toBeDefined();
    const expectedArtifactPayload = {
      schemaVersion: "investigation-planner-handoff.v1",
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      investigationId: "inv_scope_001",
      objectiveRefs: ["objective_procurement_001"],
      gapIds: ["gap_contract_amendments_001"],
      taskCandidates: [{
        taskId: "task_investigation_candidate_001",
        summary: "Review procurement timeline.",
        priorityRationale: "Review the available evidence.",
        linkedRefs: ["ev_planner_001", "gap_contract_amendments_001"],
        approvalRequirements: ["human-review"]
      }],
      prrDraftCandidates: ["Draft a request for contract amendments."],
      sourceEventIds: [...sourceEventIds].sort(),
      contextPackRefs: result.handoff.contextPackRefs,
      promptArtifactHash: result.handoff.promptArtifactHash,
      planSummary: "Public instructions say investigators should review the timeline before creating local drafts."
    };
    expect(JSON.parse((await handoffStore.get(planArtifact!.artifactHash)).toString("utf8"))).toEqual({
      ...expectedArtifactPayload,
      artifactKind: "investigation-plan-artifact"
    });
    expect(JSON.parse((await handoffStore.get(taskArtifact!.artifactHash)).toString("utf8"))).toEqual({
      ...expectedArtifactPayload,
      artifactKind: "task-suggestion-bundle"
    });
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
    })).rejects.toThrow(/handoff store/i);

    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("agent.model-invocation.requested");
  });

  it("records a safe failed handoff when a later derivative write fails after model invocation", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const backingStore = createDerivativeStore();
    const sourceEventIds = (await ledger.readAll()).map((event) => event.id);
    let writeCount = 0;
    const handoffStore = {
      put: async (content: Buffer) => {
        writeCount += 1;
        if (writeCount === 12) {
          throw new Error("private investigation storage failure");
        }
        return await backingStore.put(content);
      },
      get: backingStore.get
    };

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, false, sourceEventIds),
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
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    });

    expect(writeCount).toBeGreaterThanOrEqual(12);
    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: {
        category: "external-effect-failed",
        code: "investigation-planner-derivative-storage-failed",
        retryable: true
      },
      outputArtifacts: [
        expect.objectContaining({ artifactKind: "investigation-plan-artifact" }),
        expect.objectContaining({ artifactKind: "task-suggestion-bundle" })
      ],
      toolRequestIds: []
    });
    expect((result.handoff as { readonly lifecycle?: string }).lifecycle).toBe("handoff-recorded");
    expect(JSON.stringify(result.handoff)).not.toContain("private investigation storage failure");
    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).toContain("agent.specialist-handoff.prepared");
    expect(eventTypes).toContain("agent.specialist-handoff.recorded");
    expect(eventTypes).not.toContain("agent.specialist-run.completed");
    expect(eventTypes).not.toContain("agent.tool.requested");
    expect(buildAgentProjection(events).runs.get("run_investigation_001")?.state).toBe("failed");
    const failurePlanArtifact = result.handoff.outputArtifacts.find((artifact) => artifact.artifactKind === "investigation-plan-artifact");
    expect(failurePlanArtifact).toBeDefined();
    expect(JSON.parse((await backingStore.get(failurePlanArtifact!.artifactHash)).toString("utf8"))).toEqual({
      schemaVersion: "investigation-planner-handoff.v1",
      artifactKind: "investigation-plan-artifact",
      runId: "run_investigation_001",
      taskId: "task_investigation_001",
      investigationId: "inv_scope_001",
      objectiveRefs: ["objective_procurement_001"],
      gapIds: ["gap_contract_amendments_001"],
      taskCandidates: [{
        taskId: "task_investigation_candidate_001",
        summary: "Review procurement timeline.",
        priorityRationale: "Review the available evidence.",
        linkedRefs: ["ev_planner_001", "gap_contract_amendments_001"],
        approvalRequirements: ["human-review"]
      }],
      prrDraftCandidates: ["Draft a request for contract amendments."],
      sourceEventIds: [...sourceEventIds].sort(),
      contextPackRefs: result.handoff.contextPackRefs,
      promptArtifactHash: result.handoff.promptArtifactHash,
      planSummary: "Public instructions say investigators should review the timeline before creating local drafts."
    });
  });

  it("keeps a persistent post-provider manifest-store failure durably resumable without fallback effects", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const backingStore = createDerivativeStore();
    let writeCount = 0;
    const handoffStore = {
      put: async (content: Buffer) => {
        writeCount += 1;
        if (writeCount >= 14) throw new Error("private persistent manifest store failure");
        return await backingStore.put(content);
      },
      get: backingStore.get
    };

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, false, (await ledger.readAll()).map((event) => event.id)),
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
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    });

    expect(writeCount).toBe(14);
    expect(result.handoff).toMatchObject({
      status: "blocked",
      lifecycle: "output-persisted",
      outputArtifacts: [
        expect.objectContaining({ artifactKind: "investigation-plan-artifact" }),
        expect.objectContaining({ artifactKind: "task-suggestion-bundle" }),
        expect.objectContaining({ artifactKind: "draft-prr-candidate-bundle" })
      ]
    });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ category: "artifact-missing" }));
    expect(JSON.stringify(result)).not.toContain("private persistent manifest store failure");

    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.specialist-run.failed",
      "agent.tool.requested",
      "prr.request.sent",
      "prr.followup.sent"
    ]));
    await expect(buildSpecialistHandoffProjection({
      events,
      manifestReader: backingStore,
      runId: "run_investigation_001",
      taskId: "task_investigation_001"
    })).resolves.toMatchObject({ state: "output-persisted" });
  });

  it("records a secret-safe terminal failure when final handoff material cannot persist", async () => {
    const { ledger, runtime } = await preparedRuntime();
    const backingStore = createDerivativeStore();
    let writeCount = 0;
    const handoffStore = {
      put: async (content: Buffer) => {
        writeCount += 1;
        if (writeCount >= 13) throw new Error("private persistent final material store failure");
        return await backingStore.put(content);
      },
      get: backingStore.get
    };

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, false, (await ledger.readAll()).map((event) => event.id)),
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
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    });

    expect(writeCount).toBe(13);
    expect(result.handoff).toMatchObject({
      status: "failed",
      lifecycle: "no-output",
      failure: {
        category: "external-effect-failed",
        code: "investigation-planner-final-output-storage-failed",
        retryable: true
      },
      outputArtifacts: [
        expect.objectContaining({ artifactKind: "investigation-plan-artifact" }),
        expect.objectContaining({ artifactKind: "task-suggestion-bundle" }),
        expect.objectContaining({ artifactKind: "draft-prr-candidate-bundle" })
      ],
      toolRequestIds: []
    });
    expect(JSON.stringify(result)).not.toContain("private persistent final material store failure");

    const events = await ledger.readAll();
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed",
      "agent.tool.requested",
      "prr.request.sent",
      "prr.followup.sent"
    ]));
    expect(buildAgentProjection(events).runs.get("run_investigation_001")?.state).toBe("failed");
  });

  it("rejects model output that claims tasks were created, portals were crawled, or provider bytes were transferred", async () => {
    const ledger = new InMemoryEventLedger();
    const provider = new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: JSON.stringify({
        planSummary: "Tasks were created, the portal was crawled, and provider bytes were transferred.",
        objectiveRefs: [],
        gapIds: [],
        taskCandidates: [{
          taskId: "task_investigation_candidate_001",
          summary: "Review the investigation timeline.",
          priorityRationale: "Review the available evidence.",
          linkedRefs: [],
          approvalRequirements: []
        }],
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
    const handoffStore = createDerivativeStore();

    const result = await runInvestigationPlannerWorkflow({
      ledger,
      actor,
      now,
      contextPacks: createPlannerContextPacks(false, false, (await ledger.readAll()).map((event) => event.id)),
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
      derivativeStore: handoffStore,
      handoffStore,
      investigationId: "inv_scope_001"
    });

    expect(result.handoff).toMatchObject({
      status: "failed",
      failure: { category: "model-output-invalid", retryable: true }
    });
    expect((result.handoff as { readonly lifecycle?: string }).lifecycle).toBe("handoff-recorded");
    const eventTypes = (await ledger.readAll()).map((event) => event.type);
    expect(eventTypes).toContain("agent.model-invocation.completed");
    expect(eventTypes).toContain("agent.specialist-run.failed");
    expect(eventTypes).toContain("agent.specialist-run.step.recorded");
    expect(eventTypes).toContain("agent.specialist-handoff.prepared");
    expect(eventTypes).toContain("agent.specialist-handoff.recorded");
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
      planSummary: "Public instructions say investigators should review the timeline before creating local drafts.",
      objectiveRefs: ["objective_procurement_001"],
      gapIds: ["gap_contract_amendments_001"],
      taskCandidates: [{
        taskId: "task_investigation_candidate_001",
        summary: "Review procurement timeline.",
        priorityRationale: "Review the available evidence.",
        linkedRefs: ["ev_planner_001", "gap_contract_amendments_001"],
        approvalRequirements: ["human-review"]
      }],
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

function createPlannerContextPacks(
  governanceLocked = false,
  staleEvidence = false,
  sourceEventIds: readonly string[] = ["evt_context_001"]
) {
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
      parsePayload: plannerContextPackParser(contextPackId),
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: now(),
        payload: plannerContextPayload(contextPackId),
        safeSummary: contextPackId === "governance-locks.v1" && governanceLocked
          ? "Quarantine hold present."
          : `${contextPackId} is safe for planning.`,
        provenanceRefs: ["event:evt_context_001"],
        sourceEventIds,
        ...(contextPackId === "governance-locks.v1" && governanceLocked
          ? { stalenessInputs: [{ kind: "quarantine-lock-active", ref: "lock_quarantine_001", value: "quarantine" }] }
          : contextPackId === "evidence-summary.v1" && staleEvidence
            ? { stalenessInputs: [{ kind: "source-stale", ref: "evidence-summary.v1", value: "stale" }] }
            : {}),
        sizeBudgetBytes: 16_384
      })
    });
  }
  return registry;
}

function plannerContextPackParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue, ref?: { readonly contextPackId: string }): AgentContextPackJsonValue => {
    if (ref?.contextPackId !== contextPackId || !isPlannerContextPayloadForPack(contextPackId, payload)) {
      throw new Error("invalid investigation planner context pack payload");
    }
    return payload;
  };
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId === "timeline-draft-summary.v1"
      ? "timeline-draft-summary.v1"
      : contextPackId === "contradiction-candidate-summary.v1"
        ? "contradiction-candidate-summary.v1"
        : contextPackId,
    enumerable: false,
    configurable: false,
    writable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function isPlannerContextPayloadForPack(contextPackId: string, payload: AgentContextPackJsonValue): boolean {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const value = payload as Readonly<Record<string, AgentContextPackJsonValue>>;
  switch (contextPackId) {
    case "accepted-graph-projection.v1": {
      const items = value.items as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return items !== undefined && Array.isArray(items.assertions) && Array.isArray(items.entities) && Array.isArray(items.relationships);
    }
    case "evidence-summary.v1":
    case "timeline-draft-summary.v1":
    case "contradiction-candidate-summary.v1":
      return Array.isArray(value.items);
    case "governance-locks.v1": {
      const items = value.items as Readonly<Record<string, AgentContextPackJsonValue>> | undefined;
      return items !== undefined && Array.isArray(items.activeLocks) && Array.isArray(items.governanceRestrictions);
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

function plannerContextPayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_planner_001", evidenceId: "ev_planner_001", evidenceContentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", proposedByEventId: "evt_planner_context_001", acceptedByEventId: "evt_planner_context_001", sourceEventIds: ["evt_planner_context_001"], rowHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", safeStatement: "Verified planning graph statement." }], entities: [], relationships: [] } };
    case "evidence-summary.v1": return { items: [{ evidenceId: "ev_planner_001", ingestionEventId: "evt_planner_context_001", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", occurrenceIds: ["occurrence_planner_001"], safeNarrative: "Verified planning evidence." }] };
    case "timeline-draft-summary.v1": return { items: [{ itemId: "timeline_planner_001", summary: "Verified timeline item." }], omissions: [] };
    case "contradiction-candidate-summary.v1": return { items: [{ candidateId: "contradiction_planner_001", rationale: "Verified contradiction candidate." }], omissions: [] };
    case "governance-locks.v1": return { items: { activeLocks: [], governanceRestrictions: [{ restrictionId: "restriction_planner_001", restrictionKind: "review", affectedRef: "inv_scope_001", sourceEventIds: ["evt_planner_context_001"], projectionProvenanceRefs: ["evt_planner_context_001"], policyVersion: "v1", safeReasonCode: "review-required" }] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: [{ memoryId: "memory_planner_001", scope: "investigation", memoryKind: "summary", summary: "Verified planning memory.", confidence: 1, sourceEventIds: ["evt_planner_context_001"], artifactHashes: [] }], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_planner_context_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection.task-run-history", tasks: [{ taskId: "task_investigation_001", status: "running", priority: "normal", statusReasonCode: "Planning context prepared." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_planner_context_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    case "prr-read-model.v1": return { lifecycle: {}, requestStream: {}, diagnostics: [], gates: [], omissions: [] };
    default: throw new Error(`Unknown planner context pack ${contextPackId}`);
  }
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
