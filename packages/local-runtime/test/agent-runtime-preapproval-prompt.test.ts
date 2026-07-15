import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../../agent/src/context-packs.js";
import { consumeMountedProductionPromptReadbackWitness } from "../../agent/src/production-prompt-readback.js";
import { productionSpecialistPromptRegistrationFor, renderProductionSpecialistPrompt } from "../../agent/src/production-specialist-prompts.js";
import { createProviderRegistry } from "../../agent/src/provider-registry.js";
import { createAgentRuntime } from "../../agent/src/runtime.js";
import { createTaskOrchestratorHandoffCapability, createTaskOrchestrator } from "../../agent/src/task-orchestrator.js";
import { createTaskOrchestratorProviderApprovalAdapter } from "../../agent/src/task-orchestrator-approval.js";
import { specialistWorkflowDescriptorFor } from "../../agent/src/specialist-workflows.js";
import type { TaskOrchestratorContextRenderInput } from "../../agent/src/task-orchestrator-types.js";
import type { PromptArtifactEnvelope } from "../../agent/src/prompt-artifacts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import { createMountedPromptArtifactStore } from "../src/mounted-prompt-artifact-store.js";

const dirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const now = () => "2026-07-15T21:00:00.000Z";
const actor = { id: "actor_preapproval_test", kind: "human" as const, label: "Preapproval test" };

afterEach(() => {
  vi.doUnmock("../../agent/src/index.js");
  vi.doUnmock("../src/mounted-prompt-artifact-store.js");
  vi.resetModules();
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local runtime portable pre-approval prompt", () => {
  it("renders V1 once and checkpoints only after exact mounted readback", async () => {
    const handle = portableHandle("ws_preapproval_prompt");
    const prompt = await productionPrompt("ws_preapproval_prompt");
    const store = await createMountedPromptArtifactStore({ handle });
    await store.put(prompt);
    const readback = await store.read({ inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`, authoritativeResolvedContextPacks: prompt.resolvedContextPacks });
    if (readback.witness === undefined) throw new Error("Expected mounted V1 witness.");
    await expect(consumeMountedProductionPromptReadbackWitness(readback.witness, {
      ...expected(prompt, "ws_preapproval_prompt"),
      taskId: "task_swapped"
    })).rejects.toThrow(/task.*run.*scope|tuple/i);
    const replacementReadback = await store.read({
      inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`,
      authoritativeResolvedContextPacks: prompt.resolvedContextPacks
    });
    if (replacementReadback.witness === undefined) throw new Error("Expected replacement mounted V1 witness.");
    const consumed = await consumeMountedProductionPromptReadbackWitness(replacementReadback.witness, expected(prompt, "ws_preapproval_prompt"));
    expect(consumed.envelope.manifest.inputArtifactHash).toBe(prompt.manifest.inputArtifactHash);
  });

  it("mount drift after store read blocks context-ready append", async () => {
    const handle = portableHandle("ws_preapproval_drift");
    const prompt = await productionPrompt("ws_preapproval_drift");
    const store = await createMountedPromptArtifactStore({ handle });
    await store.put(prompt);
    const readback = await store.read({
      inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`,
      authoritativeResolvedContextPacks: prompt.resolvedContextPacks
    });
    const revalidateCurrent = readback.revalidateCurrent;
    if (revalidateCurrent === undefined) {
      throw new Error("Mounted readback did not issue a lexical currentness validator.");
    }
    if (handle.config.storage.strategy !== "portable-workspace") {
      throw new Error("Expected a portable workspace runtime.");
    }
    writeFileSync(join(handle.config.storage.workspaceRoot, "cestus-workspace.json"), JSON.stringify({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_preapproval_replacement",
      label: "Replaced workspace",
      createdAt: now(),
      createdBy: actor.id,
      coreVersion: "0.1.0"
    }));

    let contextReadyAppends = 0;
    await expect((async () => {
      await revalidateCurrent();
      contextReadyAppends += 1;
    })()).rejects.toThrow(/mount|workspace|portable/i);
    expect(contextReadyAppends).toBe(0);
  });

  it("revalidates mounted authority after the final context-ready ledger read and before append", async () => {
    const workspaceId = "ws_preapproval_factory_drift";
    const handle = portableHandle(workspaceId);
    const bootstrap = createAgentRuntime({ ledger: handle.ledger, actor, now, providers: [] });
    await bootstrap.initializeDefaultIdentity({ workspaceId });
    await bootstrap.createTask({
      taskId: "task_preapproval_factory_drift",
      title: "Reject a pre-append mount swap",
      requestedBy: actor.id,
      priority: "normal"
    });

    vi.resetModules();
    const context = await productionContextFromFreshModules();
    if (handle.config.storage.strategy !== "portable-workspace") {
      throw new Error("Expected a portable workspace runtime.");
    }
    const driftRoot = handle.config.storage.workspaceRoot;
    const contextReadyStream = "agent_task_orchestration_task_preapproval_factory_drift_evidence-triage";
    let releaseFinalContextReadyRead: (() => void) | undefined;
    let signalFinalContextReadyRead: (() => void) | undefined;
    const finalContextReadyRead = new Promise<void>((resolve) => {
      signalFinalContextReadyRead = resolve;
    });
    let deferFinalContextReadyRead = true;
    let mountedReadbackReturned = false;
    let deferredWitness: import("../../agent/src/production-prompt-readback.js").MountedProductionPromptReadbackWitness | undefined;
    let deferredEnvelope: PromptArtifactEnvelope | undefined;
    let contextReadyAppends = 0;
    const deferredLedger: EventLedger = {
      append: async (event, options) => {
        if (event.type === "agent.task.orchestration.checkpointed" && event.payload.checkpointKind === "context-ready") {
          contextReadyAppends += 1;
        }
        return await handle.ledger.append(event, options);
      },
      async readStream(streamId) {
        if (deferFinalContextReadyRead && mountedReadbackReturned && streamId === contextReadyStream) {
          deferFinalContextReadyRead = false;
          signalFinalContextReadyRead?.();
          await new Promise<void>((resolve) => {
            releaseFinalContextReadyRead = resolve;
          });
        }
        return await handle.ledger.readStream(streamId);
      },
      async readAll() {
        return await handle.ledger.readAll();
      }
    };
    const deferredHandle: LocalRuntimeHandle = {
      runtime: handle.runtime,
      ledger: deferredLedger,
      config: handle.config,
      residentIdentity: handle.residentIdentity,
      ...(handle.mountedWorkspace === undefined ? {} : { mountedWorkspace: handle.mountedWorkspace }),
      close: () => handle.close()
    };
    vi.doMock("../../agent/src/index.js", async () => {
      const actual = await vi.importActual<typeof import("../../agent/src/index.js")>("../../agent/src/index.js");
      const registrarEvidence = Object.freeze({
        descriptorHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parserIdentity: Object.freeze({}),
        producerIdentity: Object.freeze({}),
        registrationIdentity: Object.freeze({})
      });
      return {
        ...actual,
        createContextPackRegistry: () => context.registry,
        lookupPrrContextPackRegistrarEvidence: () => registrarEvidence,
        lookupOperationalContextPackRegistrarEvidence: () => undefined,
        lookupInvestigativeContextPackRegistrarEvidence: () => undefined
      };
    });
    vi.doMock("../src/mounted-prompt-artifact-store.js", async () => {
      const actual = await vi.importActual<typeof import("../src/mounted-prompt-artifact-store.js")>("../src/mounted-prompt-artifact-store.js");
      return {
        ...actual,
        createMountedPromptArtifactStore: async (input: Parameters<typeof actual.createMountedPromptArtifactStore>[0]) => {
          const store = await actual.createMountedPromptArtifactStore(input);
          return Object.freeze({
            put: store.put,
            async read(readInput: Parameters<typeof store.read>[0]) {
              const readback = await store.read(readInput);
              mountedReadbackReturned = true;
              deferredWitness = readback.witness;
              deferredEnvelope = readback.envelope;
              return readback;
            }
          });
        }
      };
    });
    const { defaultLocalAgentRuntimeFactory } = await import("../src/agent-runtime-factory.js");
    const runtime = defaultLocalAgentRuntimeFactory({ handle: deferredHandle, actor, now });
    const ticking = runtime.tickTaskOrchestrator();
    await finalContextReadyRead;
    writeFileSync(join(driftRoot, "cestus-workspace.json"), JSON.stringify({
      version: 1,
      layoutVersion: 1,
      workspaceId: "ws_preapproval_factory_replacement",
      label: "Replaced workspace",
      createdAt: now(),
      createdBy: actor.id,
      coreVersion: "0.1.0"
    }));
    releaseFinalContextReadyRead?.();
    const summary = await ticking;
    const checkpoints = (await handle.ledger.readStream(contextReadyStream))
      .filter((event) => event.type === "agent.task.orchestration.checkpointed");
    expect(contextReadyAppends).toBe(0);
    expect(checkpoints.filter((event) => event.payload.checkpointKind === "context-ready")).toHaveLength(0);
    expect(checkpoints.filter((event) => event.payload.checkpointKind === "approval-wait" || event.payload.checkpointKind === "runner-dispatching")).toHaveLength(0);
    expect(summary.approvalWaiting).toHaveLength(0);
    expect(summary.approvalVerified).toHaveLength(0);
    expect(summary.sideEffectsScheduled).toHaveLength(0);
    if (deferredWitness === undefined || deferredEnvelope === undefined) {
      throw new Error("Expected the final-read regression to retain its mounted V1 witness.");
    }
    const claim = (await handle.ledger.readStream(contextReadyStream))
      .find((event) => event.type === "agent.task.orchestration.claimed");
    const production = deferredEnvelope.manifest.production;
    if (claim === undefined || claim.type !== "agent.task.orchestration.claimed" || production?.schemaVersion !== "agent-production-prompt-binding.v1") {
      throw new Error("Expected final-read regression mounted prompt claim facts.");
    }
    const { consumeMountedProductionPromptReadbackWitness } = await import("../../agent/src/production-prompt-readback.js");
    await expect(consumeMountedProductionPromptReadbackWitness(deferredWitness, {
      workspaceId,
      taskId: claim.payload.taskId,
      runId: claim.payload.attemptId,
      runType: claim.payload.runType,
      scopeApplicabilityHash: production.scopeApplicabilityHash,
      contextPackRefs: deferredEnvelope.manifest.contextPackRefs
    })).rejects.toThrow(/mount|process|current/i);
  });

  it("fresh runtime rereads context-ready V1 and issues a new consumable witness", async () => {
    const workspaceId = "ws_preapproval_restart";
    const root = portableRoot(workspaceId);
    const first = portableHandle(workspaceId, root);
    const context = await productionContext();
    const firstStore = await createMountedPromptArtifactStore({ handle: first });
    const firstRuntime = createAgentRuntime({ ledger: first.ledger, actor, now, providers: [] });
    await firstRuntime.initializeDefaultIdentity({ workspaceId });
    await firstRuntime.createTask({
      taskId: "task_preapproval_recovery",
      title: "Persist pre-approval context-ready prompt",
      requestedBy: actor.id,
      priority: "normal"
    });
    let firstReadback: Awaited<ReturnType<typeof firstStore.read>> | undefined;
    const firstOrchestrator = createTaskOrchestrator({
      ledger: first.ledger,
      actor,
      now,
      policy: { defaultRunType: "evidence-triage", leaseDurationMs: 60_000, scope: { kind: "workspace", refs: [workspaceId] } },
      concurrency: { globalMaxActiveAttempts: 1, perRunTypeMaxActiveAttempts: { "evidence-triage": 1 } },
      budgets: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 65_536,
        promptByteBudget: 65_536,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 60_000
      },
      workflowRegistry: { require: specialistWorkflowDescriptorFor },
      contextRegistry: context.registry,
      promptRendererRegistry: {
        async render(input: TaskOrchestratorContextRenderInput) {
          if (input.runType === "ontology-bootstrap") {
            throw new Error("Recovery fixture does not render ontology-bootstrap.");
          }
          const artifact = renderProductionSpecialistPrompt({
            taskId: input.taskId,
            runId: input.attemptId,
            runType: input.runType,
            generatedAt: input.generatedAt,
            scope: input.scope,
            resolvedContextPacks: input.resolvedContextPacks
          });
          await firstStore.put(artifact);
          firstReadback = await firstStore.read({
            inputArtifactHash: artifact.manifest.inputArtifactHash as `sha256:${string}`,
            authoritativeResolvedContextPacks: input.resolvedContextPacks
          });
          return firstReadback.envelope;
        },
        readback(_input: TaskOrchestratorContextRenderInput, candidate: unknown) {
          if (firstReadback === undefined || candidate !== firstReadback.envelope) {
            throw new Error("Expected the exact mounted context-ready prompt readback.");
          }
          return firstReadback.envelope.manifest.inputArtifactHash;
        }
      },
      providerRegistry: createProviderRegistry.withDefaultsForTest(),
      approvalReader: createTaskOrchestratorProviderApprovalAdapter(),
      runnerRegistry: { async dispatch() { throw new Error("Recovery fixture does not dispatch a provider."); } },
      handoffCapability: createTaskOrchestratorHandoffCapability()
    });
    await firstOrchestrator.tick();
    const firstCheckpoint = (await first.ledger.readStream("agent_task_orchestration_task_preapproval_recovery_evidence-triage"))
      .find((event) => event.type === "agent.task.orchestration.checkpointed" && event.payload.checkpointKind === "context-ready");
    if (firstCheckpoint === undefined || firstCheckpoint.type !== "agent.task.orchestration.checkpointed") {
      throw new Error("Expected a durable context-ready checkpoint.");
    }
    if (firstReadback?.witness === undefined) throw new Error("Expected first mounted V1 witness.");
    const copiedOldWitness = { ...firstReadback.witness };
    first.close();
    handles.splice(handles.indexOf(first), 1);

    vi.resetModules();
    const { createSqlitePrrRuntime: createFreshRuntime } = await import("../src/runtime-factory.js");
    const { createMountedPromptArtifactStore: createFreshStore } = await import("../src/mounted-prompt-artifact-store.js");
    const freshCwd = mkdtempSync(join(tmpdir(), "cestus-preapproval-prompt-cwd-"));
    dirs.push(freshCwd);
    const fresh = createFreshRuntime({
      config: {
        ...resolveLocalRuntimeConfig({ cwd: freshCwd, env: {} }),
        storage: { strategy: "portable-workspace", workspaceRoot: root, expectedWorkspaceId: workspaceId, sqlitePath: join(root, "ledger", "ontology.sqlite") }
      },
      actor,
      now
    });
    handles.push(fresh);
    const durableCheckpoint = (await fresh.ledger.readStream("agent_task_orchestration_task_preapproval_recovery_evidence-triage"))
      .find((event) => event.type === "agent.task.orchestration.checkpointed" && event.payload.checkpointKind === "context-ready");
    if (durableCheckpoint === undefined || durableCheckpoint.type !== "agent.task.orchestration.checkpointed" || durableCheckpoint.payload.promptArtifactHash === undefined) {
      throw new Error("Fresh runtime did not recover a durable context-ready prompt hash.");
    }
    const freshContext = await productionContextFromFreshModules();
    const freshStore = await createFreshStore({ handle: fresh });
    const changedContext = await productionContextFromFreshModules({ changeEvidenceBytes: true });
    await expect(freshStore.read({
      inputArtifactHash: durableCheckpoint.payload.promptArtifactHash as `sha256:${string}`,
      authoritativeResolvedContextPacks: changedContext.resolvedContextPacks
    })).rejects.toThrow(/context|payload|hash/i);
    const recovered = await freshStore.read({
      inputArtifactHash: durableCheckpoint.payload.promptArtifactHash as `sha256:${string}`,
      authoritativeResolvedContextPacks: freshContext.resolvedContextPacks
    });
    if (recovered.witness === undefined) throw new Error("Expected fresh mounted witness.");
    expect(recovered.witness).not.toBe(firstReadback.witness);
    const { consumeMountedProductionPromptReadbackWitness: consumeFreshWitness } = await import("../../agent/src/production-prompt-readback.js");
    const recoveredProduction = recovered.envelope.manifest.production;
    if (recoveredProduction?.schemaVersion !== "agent-production-prompt-binding.v1") {
      throw new Error("Expected a recovered production V1 prompt.");
    }
    const expectedRecovered = {
      workspaceId,
      taskId: "task_preapproval_recovery",
      runId: durableCheckpoint.payload.attemptId,
      runType: "evidence-triage" as const,
      scopeApplicabilityHash: recoveredProduction.scopeApplicabilityHash,
      contextPackRefs: recovered.envelope.manifest.contextPackRefs
    };
    await expect(consumeFreshWitness(firstReadback.witness, expectedRecovered))
      .rejects.toThrow(/mount|process|mounted.*prompt.*readback|required/i);
    await expect(consumeFreshWitness(copiedOldWitness, expectedRecovered))
      .rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(consumeFreshWitness(recovered.witness, expectedRecovered))
      .resolves.toMatchObject({ envelope: { manifest: { inputArtifactHash: durableCheckpoint.payload.promptArtifactHash } } });
  });

  it("fresh production factory runner recovers the durable context-ready V1 before provider preparation", async () => {
    const workspaceId = "ws_preapproval_factory_recovery";
    const root = portableRoot(workspaceId);
    const first = portableHandle(workspaceId, root);
    const firstContext = await productionContextFromFreshModules();
    let firstWitness: import("../../agent/src/production-prompt-readback.js").MountedProductionPromptReadbackWitness | undefined;
    vi.doMock("../../agent/src/index.js", async () => {
      const actual = await vi.importActual<typeof import("../../agent/src/index.js")>("../../agent/src/index.js");
      const registrarEvidence = Object.freeze({
        descriptorHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parserIdentity: Object.freeze({}),
        producerIdentity: Object.freeze({}),
        registrationIdentity: Object.freeze({})
      });
      return {
        ...actual,
        createContextPackRegistry: () => firstContext.registry,
        lookupPrrContextPackRegistrarEvidence: () => registrarEvidence,
        lookupOperationalContextPackRegistrarEvidence: () => undefined,
        lookupInvestigativeContextPackRegistrarEvidence: () => undefined
      };
    });
    vi.doMock("../src/mounted-prompt-artifact-store.js", async () => {
      const actual = await vi.importActual<typeof import("../src/mounted-prompt-artifact-store.js")>("../src/mounted-prompt-artifact-store.js");
      return {
        ...actual,
        createMountedPromptArtifactStore: async (input: Parameters<typeof actual.createMountedPromptArtifactStore>[0]) => {
          const store = await actual.createMountedPromptArtifactStore(input);
          return Object.freeze({
            put: store.put,
            async read(readInput: Parameters<typeof store.read>[0]) {
              const result = await store.read(readInput);
              firstWitness = result.witness;
              return result;
            }
          });
        }
      };
    });
    const { defaultLocalAgentRuntimeFactory: createFirstRuntime } = await import("../src/agent-runtime-factory.js");
    const runtimeA = createFirstRuntime({ handle: first, actor, now });
    await runtimeA.initializeDefaultIdentity({ workspaceId });
    await runtimeA.createTask({
      taskId: "task_preapproval_factory_recovery",
      title: "Persist production factory context-ready prompt",
      requestedBy: actor.id,
      priority: "normal"
    });
    await runtimeA.tickTaskOrchestrator();
    const streamId = "agent_task_orchestration_task_preapproval_factory_recovery_evidence-triage";
    const checkpoint = (await first.ledger.readStream(streamId))
      .find((event) => event.type === "agent.task.orchestration.checkpointed" && event.payload.checkpointKind === "context-ready");
    if (checkpoint === undefined || checkpoint.type !== "agent.task.orchestration.checkpointed" || checkpoint.payload.promptArtifactHash === undefined) {
      throw new Error("Expected runtime A to persist a context-ready V1 checkpoint.");
    }
    if (firstWitness === undefined) throw new Error("Expected runtime A mounted V1 witness.");
    const copiedOldWitness = { ...firstWitness };
    first.close();
    handles.splice(handles.indexOf(first), 1);

    vi.doUnmock("../../agent/src/index.js");
    vi.doUnmock("../src/mounted-prompt-artifact-store.js");
    vi.resetModules();
    const freshContext = await productionContextFromFreshModules();
    let freshRunner: import("../../agent/src/task-orchestrator.js").TaskOrchestratorRunnerRegistry | undefined;
    let freshStoreReads = 0;
    let lastRecoveredArtifactHash: `sha256:${string}` | undefined;
    let freshReadback: Awaited<ReturnType<typeof createMountedPromptArtifactStore>> extends infer Store
      ? Store extends { read: (...args: never[]) => infer Result } ? Awaited<Result> : never
      : never;
    vi.doMock("../../agent/src/index.js", async () => {
      const actual = await vi.importActual<typeof import("../../agent/src/index.js")>("../../agent/src/index.js");
      const registrarEvidence = Object.freeze({
        descriptorHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parserIdentity: Object.freeze({}),
        producerIdentity: Object.freeze({}),
        registrationIdentity: Object.freeze({})
      });
      return {
        ...actual,
        createContextPackRegistry: () => freshContext.registry,
        lookupPrrContextPackRegistrarEvidence: () => registrarEvidence,
        lookupOperationalContextPackRegistrarEvidence: () => undefined,
        lookupInvestigativeContextPackRegistrarEvidence: () => undefined,
        createAgentRuntime(input: Parameters<typeof actual.createAgentRuntime>[0]) {
          freshRunner = input.taskOrchestratorCapabilities?.runnerRegistry;
          return actual.createAgentRuntime(input);
        }
      };
    });
    vi.doMock("../src/mounted-prompt-artifact-store.js", async () => {
      const actual = await vi.importActual<typeof import("../src/mounted-prompt-artifact-store.js")>("../src/mounted-prompt-artifact-store.js");
      return {
        ...actual,
        createMountedPromptArtifactStore: async (input: Parameters<typeof actual.createMountedPromptArtifactStore>[0]) => {
          const store = await actual.createMountedPromptArtifactStore(input);
          return Object.freeze({
            put: store.put,
            async read(readInput: Parameters<typeof store.read>[0]) {
              freshStoreReads += 1;
              lastRecoveredArtifactHash = readInput.inputArtifactHash;
              const result = await store.read(readInput);
              freshReadback = result as typeof freshReadback;
              return result;
            }
          });
        }
      };
    });
    const { createSqlitePrrRuntime: createFreshRuntime } = await import("../src/runtime-factory.js");
    const { defaultLocalAgentRuntimeFactory: createFreshRuntimeFactory } = await import("../src/agent-runtime-factory.js");
    const freshCwd = mkdtempSync(join(tmpdir(), "cestus-preapproval-factory-recovery-cwd-"));
    dirs.push(freshCwd);
    const fresh = createFreshRuntime({
      config: {
        ...resolveLocalRuntimeConfig({ cwd: freshCwd, env: {} }),
        storage: { strategy: "portable-workspace", workspaceRoot: root, expectedWorkspaceId: workspaceId, sqlitePath: join(root, "ledger", "ontology.sqlite") }
      },
      actor,
      now
    });
    handles.push(fresh);
    const runtimeB = createFreshRuntimeFactory({ handle: fresh, actor, now });
    await runtimeB.tickTaskOrchestrator();
    if (freshRunner === undefined) throw new Error("Expected fresh production factory runner registry.");
    const recoveryDispatch = Object.freeze({
      verifiedProviderApproval: true,
      verifiedContextBindings: true,
      taskId: checkpoint.payload.taskId,
      runType: checkpoint.payload.runType,
      attemptId: checkpoint.payload.attemptId,
      approvedRunId: "run_preapproval_factory_boundary"
    });
    await expect(freshRunner.dispatch(recoveryDispatch)).rejects.toThrow(/not configured for autonomous dispatch/i);
    if (freshReadback?.witness === undefined) throw new Error("Expected fresh factory recovery to issue a mounted V1 witness.");
    expect(freshReadback.witness).not.toBe(firstWitness);
    const production = freshReadback.envelope.manifest.production;
    if (production?.schemaVersion !== "agent-production-prompt-binding.v1") {
      throw new Error("Expected factory recovery V1 artifact.");
    }
    const expectedRecovered = {
      workspaceId,
      taskId: checkpoint.payload.taskId,
      runId: checkpoint.payload.attemptId,
      runType: checkpoint.payload.runType,
      scopeApplicabilityHash: production.scopeApplicabilityHash,
      contextPackRefs: freshReadback.envelope.manifest.contextPackRefs
    };
    const { consumeMountedProductionPromptReadbackWitness: consumeFreshWitness } = await import("../../agent/src/production-prompt-readback.js");
    await expect(consumeFreshWitness(firstWitness, expectedRecovered)).rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(consumeFreshWitness(copiedOldWitness, expectedRecovered)).rejects.toThrow(/mounted.*prompt.*readback|required/i);
    await expect(consumeFreshWitness(freshReadback.witness, expectedRecovered))
      .resolves.toMatchObject({ envelope: { manifest: { inputArtifactHash: checkpoint.payload.promptArtifactHash } } });
    await expect(consumeFreshWitness(freshReadback.witness, expectedRecovered)).rejects.toThrow(/consumed|required/i);

    vi.doUnmock("../../agent/src/index.js");
    vi.doUnmock("../src/mounted-prompt-artifact-store.js");
    vi.resetModules();
    const changedContext = await productionContextFromFreshModules({ changeEvidenceBytes: true });
    let changedContextRunner: import("../../agent/src/task-orchestrator.js").TaskOrchestratorRunnerRegistry | undefined;
    let changedContextStoreReads = 0;
    vi.doMock("../../agent/src/index.js", async () => {
      const actual = await vi.importActual<typeof import("../../agent/src/index.js")>("../../agent/src/index.js");
      const registrarEvidence = Object.freeze({
        descriptorHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parserIdentity: Object.freeze({}),
        producerIdentity: Object.freeze({}),
        registrationIdentity: Object.freeze({})
      });
      return {
        ...actual,
        createContextPackRegistry: () => changedContext.registry,
        lookupPrrContextPackRegistrarEvidence: () => registrarEvidence,
        lookupOperationalContextPackRegistrarEvidence: () => undefined,
        lookupInvestigativeContextPackRegistrarEvidence: () => undefined,
        createAgentRuntime(input: Parameters<typeof actual.createAgentRuntime>[0]) {
          changedContextRunner = input.taskOrchestratorCapabilities?.runnerRegistry;
          return actual.createAgentRuntime(input);
        }
      };
    });
    vi.doMock("../src/mounted-prompt-artifact-store.js", async () => {
      const actual = await vi.importActual<typeof import("../src/mounted-prompt-artifact-store.js")>("../src/mounted-prompt-artifact-store.js");
      return {
        ...actual,
        createMountedPromptArtifactStore: async (input: Parameters<typeof actual.createMountedPromptArtifactStore>[0]) => {
          const store = await actual.createMountedPromptArtifactStore(input);
          return Object.freeze({
            put: store.put,
            async read(readInput: Parameters<typeof store.read>[0]) {
              changedContextStoreReads += 1;
              return await store.read(readInput);
            }
          });
        }
      };
    });
    const { createSqlitePrrRuntime: createChangedContextRuntime } = await import("../src/runtime-factory.js");
    const { defaultLocalAgentRuntimeFactory: createChangedContextRuntimeFactory } = await import("../src/agent-runtime-factory.js");
    const changedContextCwd = mkdtempSync(join(tmpdir(), "cestus-preapproval-factory-changed-context-cwd-"));
    dirs.push(changedContextCwd);
    const changedContextHandle = createChangedContextRuntime({
      config: {
        ...resolveLocalRuntimeConfig({ cwd: changedContextCwd, env: {} }),
        storage: { strategy: "portable-workspace", workspaceRoot: root, expectedWorkspaceId: workspaceId, sqlitePath: join(root, "ledger", "ontology.sqlite") }
      },
      actor,
      now
    });
    handles.push(changedContextHandle);
    const changedContextRuntime = createChangedContextRuntimeFactory({ handle: changedContextHandle, actor, now });
    await changedContextRuntime.tickTaskOrchestrator();
    if (changedContextRunner === undefined) throw new Error("Expected changed-context factory runner registry.");
    await expect(changedContextRunner.dispatch(recoveryDispatch)).rejects.toThrow(/context-ready checkpoint.*canonical context pack readback/i);
    expect(changedContextStoreReads).toBe(0);

    if (fresh.mountedWorkspace === undefined) throw new Error("Expected fresh production runtime mounted workspace.");
    const promptHash = checkpoint.payload.promptArtifactHash as `sha256:${string}`;
    const digest = promptHash.slice("sha256:".length);
    writeFileSync(join(fresh.mountedWorkspace.paths.blobRoot, "agent-prompt-artifacts", "sha256", digest.slice(0, 2), `${digest}.json`), "{}");
    await expect(freshRunner.dispatch(recoveryDispatch)).rejects.toThrow(/manifest|text|prompt|artifact|production/i);
    expect(freshStoreReads).toBe(2);
    expect(lastRecoveredArtifactHash).toBe(promptHash);

    const originalBindings = checkpoint.payload.contextBindings;
    const changedBindingHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
    const streamAfterArtifactRejection = await fresh.ledger.readStream(streamId);
    await fresh.ledger.append({
      type: "agent.task.orchestration.checkpointed",
      version: 1,
      streamId,
      context: checkpoint.context,
      payload: {
        ...checkpoint.payload,
        checkpointedAt: now(),
        resumeIdempotencyKey: `${checkpoint.payload.resumeIdempotencyKey}-changed-binding`,
        contextBindings: originalBindings.map((binding, index) => index === 0 ? { ...binding, contentHash: changedBindingHash } : binding)
      }
    }, { expectedNextSequence: streamAfterArtifactRejection.length + 1 });
    await expect(freshRunner.dispatch(recoveryDispatch)).rejects.toThrow(/context-ready checkpoint.*canonical context pack readback/i);
    expect(freshStoreReads).toBe(2);

    const changedArtifactHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
    const streamAfterBindingRejection = await fresh.ledger.readStream(streamId);
    await fresh.ledger.append({
      type: "agent.task.orchestration.checkpointed",
      version: 1,
      streamId,
      context: checkpoint.context,
      payload: {
        ...checkpoint.payload,
        checkpointedAt: now(),
        resumeIdempotencyKey: `${checkpoint.payload.resumeIdempotencyKey}-changed-artifact-ref`,
        promptArtifactHash: changedArtifactHash
      }
    }, { expectedNextSequence: streamAfterBindingRejection.length + 1 });
    await expect(freshRunner.dispatch(recoveryDispatch)).rejects.toThrow(/ENOENT|no such file|artifact/i);
    expect(lastRecoveredArtifactHash).toBe(changedArtifactHash);
  });
});

function portableRoot(workspaceId: string): string {
  const root = mkdtempSync(join(tmpdir(), "cestus-preapproval-prompt-"));
  dirs.push(root);
  createPortableWorkspace({ rootDir: root, workspaceId, label: "Preapproval prompt", createdAt: now(), createdBy: actor.id });
  return root;
}

function portableHandle(workspaceId: string, root = portableRoot(workspaceId)): LocalRuntimeHandle {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-preapproval-prompt-cwd-"));
  dirs.push(cwd);
  const handle = createSqlitePrrRuntime({
    config: {
      ...resolveLocalRuntimeConfig({ cwd, env: {} }),
      storage: { strategy: "portable-workspace", workspaceRoot: root, expectedWorkspaceId: workspaceId, sqlitePath: join(root, "ledger", "ontology.sqlite") }
    },
    actor,
    now
  });
  handles.push(handle);
  return handle;
}

async function productionPrompt(workspaceId: string) {
  const { resolvedContextPacks } = await productionContext();
  return renderProductionSpecialistPrompt({
    taskId: "task_preapproval_prompt",
    runId: "run_preapproval_prompt",
    runType: "evidence-triage",
    generatedAt: now(),
    scope: { kind: "workspace", refs: [workspaceId] },
    resolvedContextPacks
  });
}

async function productionContext() {
  const registry = createContextPackRegistry();
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  for (const requirement of registration.contextRequirements) {
    if (requirement.requirementMode !== "always") continue;
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: requirement.contextPackId });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: { contextPackId: requirement.contextPackId, version: 1, label: requirement.contextPackId, maxBytes: 16_384, requiredProvenanceKinds: ["event-id"], redactionPolicy: "safe-summary", sourceProjection: "agent.test" },
      parsePayload: parser,
      build: () => buildResolvedContextPack({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: now(),
        payload: usefulPayload(requirement.contextPackId),
        safeSummary: `Preapproval ${requirement.contextPackId}.`,
        provenanceRefs: ["evt_preapproval_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return Object.freeze({ registry, resolvedContextPacks });
}

async function productionContextFromFreshModules(options: { readonly changeEvidenceBytes?: boolean } = {}) {
  const contextPacks = await import("../../agent/src/context-packs.js");
  const prompts = await import("../../agent/src/production-specialist-prompts.js");
  const registry = contextPacks.createContextPackRegistry();
  const registration = prompts.productionSpecialistPromptRegistrationFor("evidence-triage");
  for (const requirement of registration.contextRequirements) {
    if (requirement.requirementMode !== "always") continue;
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: requirement.contextPackId });
    contextPacks.registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId: requirement.contextPackId,
        version: 1,
        label: requirement.contextPackId,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.test"
      },
      parsePayload: parser,
      build: () => contextPacks.buildResolvedContextPack({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: now(),
        payload: options.changeEvidenceBytes
          ? changedUsefulPayload(requirement.contextPackId)
          : usefulPayload(requirement.contextPackId),
        safeSummary: `Preapproval ${requirement.contextPackId}.`,
        provenanceRefs: ["evt_preapproval_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return Object.freeze({ registry, resolvedContextPacks });
}

function expected(prompt: Awaited<ReturnType<typeof productionPrompt>>, workspaceId: string) {
  const production = prompt.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") throw new Error("Expected production V1 prompt.");
  return {
    workspaceId,
    taskId: "task_preapproval_prompt",
    runId: "run_preapproval_prompt",
    runType: "evidence-triage" as const,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    contextPackRefs: prompt.manifest.contextPackRefs
  };
}

function usefulPayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_001", safeStatement: "Evidence requires review." }], entities: [], relationships: [] } };
    case "evidence-summary.v1": return { items: [{ evidenceId: "ev_001", ingestionEventId: "evt_ingested_001", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", safeNarrative: "Evidence is available." }] };
    case "governance-locks.v1": return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Human review.", activatedBy: "agent_test", activatedAt: now(), relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: ["Preserve review caveats."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.test", tasks: [{ taskId: "task_preapproval_prompt", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "portable-workspace", bindPosture: "bound", authPosture: "none", projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default: throw new Error(`Unexpected fixture context ${contextPackId}`);
  }
}

function changedUsefulPayload(contextPackId: string): AgentContextPackJsonValue {
  if (contextPackId !== "evidence-summary.v1") return usefulPayload(contextPackId);
  return {
    items: [{
      evidenceId: "ev_001",
      ingestionEventId: "evt_ingested_001",
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      safeNarrative: "Evidence changed after durable recovery."
    }]
  };
}
