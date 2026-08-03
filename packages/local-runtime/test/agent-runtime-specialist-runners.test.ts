import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createContextPackRegistry,
  serializeContextPackPayload
} from "../../agent/src/context-packs.js";
import { buildAgentCockpit } from "../../agent/src/cockpit.js";
import {
  buildSelectionManifestHash,
  investigativeRegistrationIdentity,
  registerInvestigativeContextPacks,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../../agent/src/investigative-context-packs.js";
import {
  registerOperationalContextPackBuilders,
  type OperationalContextPackProvider
} from "../../agent/src/operational-context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../../agent/src/production-specialist-prompts.js";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import { buildSpecialistHandoffProjection } from "../../agent/src/specialist-handoff-projection.js";
import { createAgentRuntime } from "../../agent/src/runtime.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  consumeMountedSourcedInvestigationDispatch,
  createSourcedInvestigationSpecialistRunner,
  createUntrustedSpecialistRunner,
  type UntrustedSpecialistRunner
} from "../src/agent-runtime-specialist-runners.js";
import * as specialistRunnerSurface from "../src/agent-runtime-specialist-runners.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime
} from "../src/mounted-artifact-authority-operation.js";
import {
  createPortableMountedAgentArtifactStoreProducer,
  preflightPortableMountedAgentHandoffBinding,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "../src/portable-mounted-agent-artifact-stores.js";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecyclePorts
} from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const dispatch = Object.freeze({
  taskId: "task_runtime",
  runType: "evidence-triage" as const,
  attemptId: "attempt_runtime",
  approvedRunId: "run_runtime"
});
const mountedTempDirs: string[] = [];
const mountedHandles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of mountedHandles.splice(0)) handle.close();
  for (const dir of mountedTempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("untrusted specialist runner", () => {
  it("dispatches through mounted authority and replays the handoff into the selected-run cockpit", async () => {
    expect(Reflect.get(specialistRunnerSurface, "consumeMountedSourcedInvestigationDispatch"))
      .toBeTypeOf("function");
    const fixture = await mountedSourcedInvestigationFixture();
    const sourceBytes = Buffer.from("mounted sourced timeline evidence bytes", "utf8");
    const sourceHash = hashBytes(sourceBytes);
    const authority = await sourcedRunnerAuthority(fixture.dispatch, {
      sourceEventId: fixture.sourceEventId,
      evidenceContentHash: sourceHash,
      investigationId: fixture.investigationId,
      workspaceId: fixture.workspaceId
    });
    const storedSource = await fixture.handoff.binding.materialStore.put(sourceBytes);
    expect(storedSource.contentHash).toBe(sourceHash);
    const evidencePack = await authority.contextRegistry.buildResolved("evidence-summary.v1");
    const selectionManifest = (evidencePack.payload as unknown as {
      readonly selectionManifest: Readonly<Record<string, unknown>>;
    }).selectionManifest;
    const { manifestHash, ...selectionManifestBody } = selectionManifest;
    const selectionBytes = Buffer.from(serializeContextPackPayload(selectionManifestBody));
    const storedSelection = await fixture.handoff.binding.materialStore.put(selectionBytes);
    expect(storedSelection.contentHash).toBe(manifestHash);
    await appendMountedModelTranscript({
      ledger: fixture.handle.ledger,
      actor: fixture.actor,
      dispatch: fixture.dispatch,
      startedEventId: fixture.startedEventId,
      inputArtifactHash: authority.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`
    });
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: () => ({
        ...authority,
        artifactStore: fixture.handoff.binding.materialStore,
        execution: { mode: "fake" as const, invoke: async () => sourcedTimelineOutput(sourceHash) }
      })
    });

    const consumed = await consumeMountedSourcedInvestigationDispatch({
      runner,
      dispatch: fixture.dispatch,
      retryGeneration: 0,
      handoff: fixture.handoff,
      ledger: fixture.handle.ledger,
      actor: fixture.actor,
      now: () => sourcedNow
    });

    expect(consumed.recorded.manifest.schemaVersion).toBe("agent-specialist-handoff-manifest.v2");
    expect(consumed.authorityConsumption.eventIds).toHaveLength(6);
    const mounted = fixture.handle.mountedWorkspace;
    if (mounted === undefined) throw new Error("portable fixture is not mounted");
    const replayed = await buildSpecialistHandoffProjection({
      events: await fixture.handle.ledger.readAll(),
      manifestReader: new FileBlobStore(join(mounted.paths.derivativeRoot, "specialist-handoff-manifest")),
      runId: fixture.dispatch.approvedRunId,
      taskId: fixture.dispatch.taskId
    });
    expect(replayed).toMatchObject({
      state: "task-completed",
      diagnostics: [],
      selectedHandoff: {
        runType: "timeline-builder",
        runId: fixture.dispatch.approvedRunId,
        taskId: fixture.dispatch.taskId,
        outputArtifacts: [{ artifactKind: "timeline-artifact" }]
      }
    });
    const cockpit = buildAgentCockpit({
      status: await fixture.runtime.status(),
      selectedRunId: fixture.dispatch.approvedRunId,
      specialistHandoffs: replayed.selectedHandoff === undefined ? [] : [replayed.selectedHandoff]
    });
    expect(cockpit.selectedRun).toMatchObject({
      runId: fixture.dispatch.approvedRunId,
      runType: "timeline-builder",
      state: "completed",
      handoff: {
        runType: "timeline-builder",
        status: "ready-for-review",
        outputArtifacts: [{
          artifactKind: "timeline-artifact",
          schemaId: "timeline-builder-handoff.v1"
        }]
      }
    });
    expect(JSON.stringify(cockpit.selectedRun)).not.toMatch(/mounted sourced timeline evidence bytes|authorization:|provider body/i);
  });

  it("rejects caller authority, store, registration, provenance, readiness, and H tuples before delegation", async () => {
    let delegateCalls = 0;
    let handoffCalls = 0;
    let providerCalls = 0;
    const hostileConstructor = {
      delegate: async () => {
        delegateCalls += 1;
        return preparationFor(dispatch);
      },
      authority: Object.freeze({ workspaceId: "ws_forged" }),
      artifactStores: Object.freeze({}),
      registration: Object.freeze({}),
      registrationProvenance: Object.freeze({}),
      readiness: Object.freeze({}),
      handoffCapability: Object.freeze({
        async readback() {
          handoffCalls += 1;
        }
      }),
      provider: Object.freeze({
        async invoke() {
          providerCalls += 1;
        }
      })
    };

    expect(() => createUntrustedSpecialistRunner(hostileConstructor as never))
      .toThrow(expect.objectContaining({ code: "runner-preparation-invalid" }));
    expect(delegateCalls).toBe(0);
    expect(handoffCalls).toBe(0);
    expect(providerCalls).toBe(0);

    const runner = runnerFor(async () => {
      delegateCalls += 1;
      return preparationFor(dispatch);
    });
    await expect(runner.dispatch({
      ...dispatch,
      authority: hostileConstructor.authority,
      artifactStores: hostileConstructor.artifactStores,
      registration: hostileConstructor.registration,
      registrationProvenance: hostileConstructor.registrationProvenance,
      readiness: hostileConstructor.readiness,
      handoffCapability: hostileConstructor.handoffCapability,
      provider: hostileConstructor.provider
    } as never)).rejects.toMatchObject({ code: "runner-preparation-invalid" });
    expect(delegateCalls).toBe(0);
    expect(handoffCalls).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it("normalizes the public dispatch before the delegate await", async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received: unknown;
    const runner = runnerFor(async (input) => {
      received = input;
      entered();
      await blocked;
      return preparationFor(input);
    });
    const mutableDispatch: {
      taskId: string;
      runType: "evidence-triage";
      attemptId: string;
      approvedRunId: string;
    } = { ...dispatch };

    const pending = runner.dispatch(mutableDispatch);
    await started;
    mutableDispatch.taskId = "task_swapped_after_await";
    release();

    await expect(pending).resolves.toMatchObject({
      preparation: {
        preparation: { taskId: "task_runtime" }
      }
    });
    expect(received).toEqual(dispatch);
    expect(Object.isFrozen(received)).toBe(true);
  });

  it("composes deterministic local timeline execution into a canonical nonterminal preparation", async () => {
    const store = sourcedStore();
    let invocations = 0;
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: async (dispatch) => ({
        ...await sourcedRunnerAuthority(dispatch),
        artifactStore: store,
        execution: {
          mode: "fake" as const,
          invoke: async () => {
            invocations += 1;
            return sourcedTimelineOutput();
          }
        }
      })
    });

    const result = await runner.dispatch({
      taskId: "task_timeline_runtime",
      runType: "timeline-builder",
      attemptId: "attempt_timeline_runtime",
      approvedRunId: "run_timeline_runtime"
    });

    expect(invocations).toBe(1);
    expect(store.putCount()).toBe(8);
    expect(result.preparation?.preparation).toMatchObject({
      taskId: "task_timeline_runtime",
      attemptId: "attempt_timeline_runtime",
      approvedRunId: "run_timeline_runtime",
      runType: "timeline-builder",
      handoffMaterial: {
        status: "ready-for-review",
        outputArtifacts: [{
          artifactKind: "timeline-artifact",
          schemaId: "timeline-builder-handoff.v1"
        }]
      }
    });
  });

  it("keeps the sourced runner fail-closed for remote provider transfer", async () => {
    const store = sourcedStore();
    let invocations = 0;
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: async (dispatch) => ({
        ...await sourcedRunnerAuthority(dispatch),
        artifactStore: store,
        execution: {
          mode: "remote" as const,
          invoke: async () => {
            invocations += 1;
            return sourcedTimelineOutput();
          }
        }
      })
    });

    await expect(runner.dispatch({
      taskId: "task_timeline_remote",
      runType: "timeline-builder",
      attemptId: "attempt_timeline_remote",
      approvedRunId: "run_timeline_remote"
    })).rejects.toThrow(/provider byte-transfer approval|remote.*blocked/i);
    expect(invocations).toBe(0);
    expect(store.putCount()).toBe(0);
  });
});

function runnerFor(delegate: (input: {
  readonly taskId: string;
  readonly runType: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
}) => Promise<unknown>): UntrustedSpecialistRunner {
  return createUntrustedSpecialistRunner({ delegate });
}

function preparationFor(input: {
  readonly taskId: string;
  readonly runType: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
}): UntrustedSpecialistHandoffPreparationV1 {
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "A bounded nonterminal preparation.",
    contextPackRefs: [Object.freeze({
      contextPackId: "workspace-overview.v1",
      version: 1,
      contentHash: hash("a"),
      sizeBytes: 1,
      generatedAt: "2026-07-15T00:00:00.000Z",
      safeSummary: "Workspace overview.",
      provenanceRefs: Object.freeze(["evt_source_runtime"])
    })],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [],
    sourceEventIds: ["evt_source_runtime"],
    relatedEventIds: ["evt_related_runtime"]
  });
  const unsigned = {
    schemaVersion: "agent-specialist-handoff-preparation.v1" as const,
    taskId: input.taskId,
    attemptId: input.attemptId,
    approvedRunId: input.approvedRunId,
    runType: input.runType,
    handoffMaterial,
    handoffMaterialHash: hashSpecialistHandoffMaterial(handoffMaterial)
  };
  return Object.freeze({
    ...unsigned,
    preparationHash: hashUntrustedSpecialistHandoffPreparation(unsigned)
  });
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function mountedSourcedInvestigationFixture(): Promise<{
  readonly workspaceId: string;
  readonly investigationId: string;
  readonly handle: LocalRuntimeHandle;
  readonly runtime: ReturnType<typeof createAgentRuntime>;
  readonly actor: { readonly id: "agent_default"; readonly kind: "agent"; readonly label: "Cestus Agent" };
  readonly dispatch: {
    readonly taskId: string;
    readonly runType: "timeline-builder";
    readonly attemptId: `attempt_${string}`;
    readonly approvedRunId: string;
  };
  readonly sourceEventId: string;
  readonly startedEventId: string;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
}> {
  const workspaceId = `ws_sourced_mounted_${mountedTempDirs.length + 1}`;
  const investigationId = "investigation_mounted_timeline_001";
  const taskId = "task_mounted_timeline_001";
  const runId = "run_mounted_timeline_001";
  const workspaceRoot = mkdtempSync(join(tmpdir(), "cestus-sourced-mounted-"));
  mountedTempDirs.push(workspaceRoot);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Mounted sourced timeline fixture",
    createdAt: sourcedNow,
    createdBy: "actor_sourced_mounted_test"
  });
  const actor = Object.freeze({ id: "agent_default" as const, kind: "agent" as const, label: "Cestus Agent" as const });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_sourced_mounted_test", kind: "system", label: "Sourced Mounted Test" },
    now: () => sourcedNow
  });
  mountedHandles.push(handle);
  const attemptId = buildTaskAttemptId({ taskId, runType: "timeline-builder", retryGeneration: 0 });
  const sourcedDispatch = Object.freeze({
    taskId,
    runType: "timeline-builder" as const,
    attemptId,
    approvedRunId: runId
  });
  const ports = mountedSourcedLifecyclePorts({
    workspaceId,
    workspaceIdentityEventId: "evt_sourced_workspace_identity",
    highWaterMark: "evt_sourced_high_water_005",
    highWaterOrdinal: 5
  });
  const wakeRuntime = {};
  registerMountedArtifactAuthorityIssuerForWakeRuntime({
    wakeRuntime,
    lifecyclePorts: ports,
    runtimeHandle: handle
  });
  await admitMountedSourcedAuthority(ports, workspaceId);
  const handoff = await createPortableMountedAgentArtifactStoreProducer(
    issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
  ).bind({
    taskId,
    attemptId,
    approvedRunId: runId,
    runType: "timeline-builder",
    retryGeneration: 0
  });
  await preflightPortableMountedAgentHandoffBinding({
    binding: handoff.binding,
    controller: handoff.controller,
    taskId,
    attemptId,
    runId,
    runType: "timeline-builder",
    retryGeneration: 0
  });

  const runtime = createAgentRuntime({ ledger: handle.ledger, actor, now: () => sourcedNow, providers: [] });
  await runtime.initializeDefaultIdentity({ workspaceId });
  await runtime.createTask({
    taskId,
    title: "Build an authority-bound sourced timeline",
    requestedBy: "actor_investigator",
    priority: "normal"
  });
  const sourceEvent = (await handle.ledger.readAll()).find((event) => event.type === "agent.task.created");
  if (sourceEvent === undefined) throw new Error("mounted source provenance event is unavailable");
  await appendMountedAttemptBinding(handle.ledger, { taskId, runId, attemptId, actor });
  const started = await runtime.startRun({
    runId,
    taskId,
    runType: "timeline-builder",
    scope: { kind: "workspace", refs: [workspaceId] }
  });
  if (!started.ok) throw new Error("mounted sourced run did not start");
  const startedEvent = (await handle.ledger.readStream(`agent_run_${runId}`)).find((event) =>
    event.type === "agent.specialist-run.started"
  );
  if (startedEvent === undefined) throw new Error("mounted sourced started event is unavailable");

  return Object.freeze({
    workspaceId,
    investigationId,
    handle,
    runtime,
    actor,
    dispatch: sourcedDispatch,
    sourceEventId: sourceEvent.id,
    startedEventId: startedEvent.id,
    handoff
  });
}

async function appendMountedAttemptBinding(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly runId: string;
    readonly attemptId: `attempt_${string}`;
    readonly actor: { readonly id: string; readonly kind: "agent"; readonly label: string };
  }
): Promise<void> {
  const runType = "timeline-builder" as const;
  const retryGeneration = 0;
  const leaseClaimGeneration = 1;
  const streamId = taskOrchestrationStreamId(input.taskId, runType);
  const taskStream = await ledger.readStream(`agent_task_${input.taskId}`);
  const causationEventId = taskStream.at(-1)?.id;
  if (causationEventId === undefined) throw new Error("mounted task stream is empty");
  const claimStream = await ledger.readStream(streamId);
  const claim = await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${input.taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" },
      causationId: causationEventId
    },
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration,
      leaseClaimGeneration,
      workerId: input.actor.id,
      claimedAt: sourcedNow,
      leaseExpiresAt: "2026-08-03T13:00:00.000Z",
      idempotencyKey: `task-orchestrator:${input.taskId}:${runType}:0:${input.attemptId}:claim`,
      selectedOrderingPosition: { priorityRank: 0, queuedAt: sourcedNow, taskId: input.taskId, runType, retryGeneration },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 65_536,
        promptByteBudget: 65_536,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId
    }
  }, { expectedNextSequence: claimStream.length + 1 });
  const checkpointStream = await ledger.readStream(streamId);
  await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${input.taskId}`,
      causationId: claim.id,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration,
      leaseClaimGeneration,
      checkpointKind: "runner-dispatching",
      checkpointedAt: sourcedNow,
      runId: input.runId,
      resumeIdempotencyKey: `task-orchestrator:${input.taskId}:${runType}:0:${input.attemptId}:runner-dispatching`,
      contextBindings: [],
      safeNextActions: ["wait for durable specialist handoff readback"]
    }
  }, { expectedNextSequence: checkpointStream.length + 1 });
}

async function appendMountedModelTranscript(input: {
  readonly ledger: EventLedger;
  readonly actor: { readonly id: string; readonly kind: "agent"; readonly label: string };
  readonly dispatch: {
    readonly approvedRunId: string;
    readonly runType: "timeline-builder";
  };
  readonly startedEventId: string;
  readonly inputArtifactHash: `sha256:${string}`;
}): Promise<void> {
  const invocationId = "inv_mounted_timeline_001";
  const streamId = `agent_model_invocation_${invocationId}`;
  const requested = await input.ledger.append({
    type: "agent.model-invocation.requested",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${invocationId}`,
      causationId: input.startedEventId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      invocationId,
      runId: input.dispatch.approvedRunId,
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash: input.inputArtifactHash,
      safetyClass: "workspace-safe",
      credentialRefId: "agent_credref_fake_local",
      credentialKind: "local-no-secret",
      runType: input.dispatch.runType
    }
  }, { expectedNextSequence: 1 });
  await input.ledger.append({
    type: "agent.model-invocation.completed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${invocationId}`,
      causationId: requested.id,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      invocationId,
      runId: input.dispatch.approvedRunId,
      providerId: "provider_fake_local",
      outputArtifactHash: hashBytes(Buffer.from(JSON.stringify(sourcedTimelineOutput()), "utf8")),
      completedAt: sourcedNow,
      modelFamily: "fake-local"
    }
  }, { expectedNextSequence: 2 });
}

function mountedSourcedLifecyclePorts(input: {
  readonly workspaceId: string;
  readonly workspaceIdentityEventId: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
}): PortableWorkspaceLifecyclePorts {
  const supervisorEpoch = "epoch_sourced_mounted";
  const calls = { reconciliation: 0 };
  return createPortableWorkspaceLifecyclePorts({
    workspaceId: input.workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            workspaceId: input.workspaceId,
            residentId: "agent_default" as const,
            workspaceIdentityEventId: input.workspaceIdentityEventId,
            mountInstanceId: "mount-instance:sourced-timeline",
            mountEvidenceId: "evidence_sourced_mount",
            authorityEvidenceId: "evidence_sourced_authority",
            ledgerStoreEvidenceId: "evidence_sourced_ledger",
            artifactStoreEvidenceId: "evidence_sourced_artifact",
            derivativeStoreEvidenceId: "evidence_sourced_derivative",
            policyVersion: sourcedPolicyVersion,
            policyDigest: hash("d"),
            lockStateDigest: hash("e"),
            policyAndLockReadbackEventId: "evt_sourced_policy_readback",
            highWaterMark: input.highWaterMark,
            highWaterReadbackEventId: "evt_sourced_high_water_readback",
            highWaterOrdinal: input.highWaterOrdinal
          }
        };
      }
    },
    supervisorLease: mountedSourcedLeasePort(input.workspaceId, supervisorEpoch, input),
    activeClaimReconciliation: mountedSourcedReconciliationPort(calls),
    now: () => sourcedNow,
    createSafeOutageObservationId: () => "outage:sourced-mounted"
  });
}

function mountedSourcedLeasePort(
  workspaceId: string,
  supervisorEpoch: string,
  authority: { readonly workspaceIdentityEventId: string; readonly highWaterMark: string }
): DurableSupervisorLeasePort {
  return {
    async readOrAcquire() {
      return {
        outcome: "acquired-and-read-back" as const,
        readback: mountedSourcedLeaseReadback(workspaceId, supervisorEpoch, authority)
      };
    }
  };
}

function mountedSourcedLeaseReadback(
  workspaceId: string,
  supervisorEpoch: string,
  authority: { readonly workspaceIdentityEventId: string; readonly highWaterMark: string }
): SupervisorLeaseReadbackEvidence {
  return {
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    workspaceIdentityEventId: authority.workspaceIdentityEventId,
    mountEvidenceId: "evidence_sourced_mount",
    authorityEvidenceId: "evidence_sourced_authority",
    policyVersion: sourcedPolicyVersion,
    policyDigest: hash("d"),
    lockStateDigest: hash("e"),
    highWaterMark: authority.highWaterMark,
    leaseEventId: "evt_sourced_lease",
    readbackEventId: "evt_sourced_lease_readback",
    expiresAt: "2026-08-03T13:00:00.000Z",
    causation: { causationId: "cause_sourced_mounted", correlationId: "correlation_sourced_mounted" },
    policyAndLock: {
      authorityEvidenceId: "evidence_sourced_authority",
      mountEvidenceId: "evidence_sourced_mount",
      leaseEventId: "evt_sourced_lease",
      leaseReadbackEventId: "evt_sourced_lease_readback",
      policyVersion: sourcedPolicyVersion,
      policyDigest: hash("d"),
      lockStateDigest: hash("e"),
      readbackEventId: "evt_sourced_policy_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_sourced_authority",
      mountEvidenceId: "evidence_sourced_mount",
      leaseEventId: "evt_sourced_lease",
      leaseReadbackEventId: "evt_sourced_lease_readback",
      highWaterMark: authority.highWaterMark,
      readbackEventId: "evt_sourced_high_water_readback"
    }
  };
}

function mountedSourcedReconciliationPort(
  calls: { reconciliation: number }
): ActiveClaimReconciliationPort {
  return {
    async readByIdempotencyKey() {
      calls.reconciliation += 1;
      return undefined;
    },
    async appendAndReadBack() {
      calls.reconciliation += 1;
      throw new Error("mounted sourced reconciliation is not expected");
    }
  };
}

async function admitMountedSourcedAuthority(
  ports: PortableWorkspaceLifecyclePorts,
  workspaceId: string
): Promise<WorkspaceAdmissionSnapshot> {
  const grant = await ports.authority.revalidate({
    operation: "wake",
    expectedWorkspaceId: workspaceId,
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("mounted sourced fixture requires admission");
  const lease = await ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_sourced_mounted",
    policyVersion: sourcedPolicyVersion,
    policyDigest: hash("d"),
    lockStateDigest: hash("e"),
    causationId: "cause_sourced_mounted",
    correlationId: "correlation_sourced_mounted"
  });
  if (lease.outcome !== "acquired-and-read-back") throw new Error("mounted sourced fixture requires lease readback");
  return grant.admission;
}

async function sourcedRunnerAuthority(dispatch: {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: string;
}, options: {
  readonly sourceEventId?: string;
  readonly evidenceContentHash?: `sha256:${string}`;
  readonly investigationId?: string;
  readonly workspaceId?: string;
} = {}) {
  if (dispatch.runType !== "timeline-builder") throw new Error("timeline runner fixture only");
  const sourceEventId = options.sourceEventId ?? "evt_timeline_source_001";
  const evidenceContentHash = options.evidenceContentHash ?? hash("a");
  const investigationId = options.investigationId ?? "investigation_runtime_001";
  const registry = createContextPackRegistry();
  registerInvestigativeContextPacks(registry, sourcedInvestigativeRegistration({
    sourceEventId,
    evidenceContentHash,
    investigationId
  }));
  registerOperationalContextPackBuilders(registry, sourcedOperationalProvider(options.workspaceId));
  const scope = { kind: "investigation" as const, refs: [investigationId] };
  const resolvedContextPacks = await Promise.all(
    productionSpecialistPromptRegistrationFor("timeline-builder").contextRequirements
      .filter((requirement) => requirement.requirementMode === "always")
      .map((requirement) => registry.buildResolved(requirement.contextPackId))
  );
  return Object.freeze({
    contextRegistry: registry,
    scope,
    promptArtifact: renderProductionSpecialistPrompt({
      runType: "timeline-builder",
      runId: dispatch.attemptId,
      taskId: dispatch.taskId,
      generatedAt: sourcedNow,
      scope,
      resolvedContextPacks,
      omissions: []
    })
  });
}

function sourcedInvestigativeRegistration(input: {
  readonly sourceEventId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly investigationId: string;
}) {
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "investigation", id: input.investigationId },
    sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41, governance: 40, agent: 39 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: { cursor: "cursor_runtime_001", offset: 0, limit: 10, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: 1,
    includedRefs: [{
      refKind: "evidence",
      refId: "ev_timeline_source_001",
      sortKey: `evidence/ev_timeline_source_001/${input.evidenceContentHash}`,
      contentHash: input.evidenceContentHash,
      sourceEventIds: [input.sourceEventId],
      mandatory: true
    }],
    aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const evidence: InvestigativeEvidenceRow = {
    evidenceId: "ev_timeline_source_001",
    ingestionEventId: input.sourceEventId,
    contentHash: input.evidenceContentHash,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: [],
    safeNarrative: "One date-bearing local source."
  };
  const deps: InvestigativeContextPackDependencies = {
    selection: { capabilityVersion: "investigative-selection.v1", select: async () => manifest },
    evidenceReader: { readEvidenceByIds: async () => [evidence] },
    graphReader: {
      readAcceptedGraphByIds: async () => ({
        assertions: [], entities: [], relationships: [], relationshipProjectionAvailable: true
      })
    },
    governanceReader: { readActiveRestrictionsByIds: async () => [] },
    agentLockReader: { readActiveLocksByIds: async () => [] },
    eventReader: { readEventsByIds: async () => [] },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async () => ({
        ok: true as const,
        stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidence.evidenceId, value: evidence.contentHash }]
      })
    },
    now: () => sourcedNow,
    policyVersion: sourcedPolicyVersion,
    ontologyCoreVersion: "ontology.v1",
    packVersions: { ingestion: "ingestion.v1" },
    registrationIdentity: investigativeRegistrationIdentity
  };
  return { deps, scope: body.scope, window: body.window };
}

function sourcedOperationalProvider(workspaceId = "ws_runtime_sourced"): OperationalContextPackProvider {
  const scope = { kind: "workspace", id: workspaceId } as const;
  return {
    providerId: "sourced-runner-test-provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion: sourcedPolicyVersion,
    generatedAt: sourcedNow,
    scope,
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    async workspaceRuntimeStatus() {
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId: scope.id,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 42 }, omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return emptyOperationalSnapshot("agent.projection.task-run-history", "updatedAt:desc", scope);
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [], aggregateCounts: { active: 0, totalCount: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory", scope, projectionHighWaterMark: 42,
          sourceEventCount: 0, generatedAt: sourcedNow, emptyReasonCode: "empty"
        }
      };
    }
  };
}

function emptyOperationalSnapshot(
  projectionName: string,
  order: "updatedAt:desc",
  scope: { readonly kind: string; readonly id: string }
) {
  return {
    projectionHighWaterMark: 42,
    projectionSourceRef: projectionName,
    tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 },
    sourceEventIds: [], artifactHashes: [],
    window: { order, limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
    emptyProof: {
      projectionName, scope, projectionHighWaterMark: 42,
      sourceEventCount: 0, generatedAt: sourcedNow, emptyReasonCode: "empty"
    }
  };
}

function sourcedTimelineOutput(contentHash: `sha256:${string}` = hash("a")) {
  return {
    timelineItems: [{
      itemId: "timeline_runtime_001",
      date: "2026-03-01",
      precision: "day" as const,
      evidenceRefs: ["ev_timeline_source_001"],
      assertionRefs: [],
      prrEventRefs: [],
      contentHashRefs: [contentHash],
      summary: "One exact local source anchors this advisory date.",
      uncertaintyCategories: [],
      uncertaintyNotes: [],
      uncertaintySourceRefs: []
    }],
    omissionReasons: [],
    omittedSources: [],
    unresolvedPrompts: []
  };
}

function sourcedStore() {
  const values = new Map<string, Buffer>();
  let puts = 0;
  return Object.freeze({
    async put(content: Buffer) {
      puts += 1;
      const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}` as `sha256:${string}`;
      values.set(contentHash, Buffer.from(content));
      return Object.freeze({ contentHash, sizeBytes: content.byteLength });
    },
    async get(contentHash: `sha256:${string}`) {
      const value = values.get(contentHash);
      if (value === undefined) throw new Error("artifact missing");
      return Buffer.from(value);
    },
    putCount: () => puts
  });
}

const sourcedNow = "2026-08-03T12:00:00.000Z";
const sourcedPolicyVersion = "policy.sourced-runner.v1";
