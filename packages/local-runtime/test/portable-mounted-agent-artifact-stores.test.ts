import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { hashCanonicalSpecialistHandoffJson } from "../../agent/src/specialist-handoff-manifest.js";
import { consumeMountedSpecialistHandoffAuthorityWitness } from "../../agent/src/specialist-handoff-authority.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime,
  type MountedArtifactAuthorityOperation
} from "../src/mounted-artifact-authority-operation.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  afterMountedHandoffAuthorityAppend,
  beforeMountedHandoffAuthorityEffect,
  consumeMountedHandoffAuthorityController,
  createPortableMountedAgentArtifactStoreProducer,
  type BindPortableMountedAgentHandoffInput,
  type FactoryPortableMountedAgentHandoffProducerResultV1,
  type MountedHandoffAuthorityController
} from "../src/portable-mounted-agent-artifact-stores.js";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecyclePorts
} from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const tempDirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const dispatch = Object.freeze({
  taskId: "task_portable_handoff",
  attemptId: "attempt_portable_handoff",
  approvedRunId: "run_portable_handoff",
  runType: "evidence-triage",
  retryGeneration: 0
});
const investigationDispatch = Object.freeze({
  ...dispatch,
  runType: "investigation-planner" as const,
  investigationId: "inv_portable_handoff_exact"
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("portable mounted agent artifact stores", () => {
  it("accepts only a task137a opaque authority operation", async () => {
    const fixture = authorityFixture();
    const issued = await issuedBinding(fixture);

    expect(() => createPortableMountedAgentArtifactStoreProducer({
      schemaVersion: "mounted-artifact-authority-operation.v1"
    } as MountedArtifactAuthorityOperation)).toThrow(/authority/i);
    expect(issued.result.schemaVersion).toBe("factory-portable-mounted-agent-handoff-result.v1");
  });

  it("binds one exact run tuple to frozen path-hiding stores and an opaque controller", async () => {
    const fixture = authorityFixture();
    const { result } = await issuedBinding(fixture);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result)).toEqual(["schemaVersion", "binding", "controller"]);
    expect(Object.isFrozen(result.binding)).toBe(true);
    expect(Object.keys(result.binding)).toEqual([
      "schemaVersion", "preparationBinder", "materialStore", "manifestStore", "authorityWitness"
    ]);
    expect(result.binding.materialStore).not.toBe(result.binding.manifestStore);
    expect(Reflect.ownKeys(result.controller)).toEqual([]);
    expect(Object.isFrozen(result.controller)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fixture.workspaceRoot);
    expect(JSON.stringify(result.controller)).toBe("{}");
    expect((result.binding as unknown as Record<string, unknown>).controller).toBeUndefined();
    expect((result.binding as unknown as Record<string, unknown>).authority).toBeUndefined();

    const material = Buffer.from("portable handoff material", "utf8");
    const stored = await result.binding.materialStore.put(material);
    expect(await result.binding.materialStore.get(stored.contentHash)).toEqual(material);

    const missingBlobError = await result.binding.manifestStore.get(hash("f")).then(
      () => new Error("expected missing blob lookup to fail"),
      (error: unknown) => error
    );
    expect(missingBlobError).toBeInstanceOf(Error);
    const safeError = missingBlobError as Error & Record<string, unknown>;
    expect(safeError.name).toBe("Error");
    expect(safeError.message).toBe("Mounted handoff artifact store operation failed.");
    expect(Object.keys(safeError)).toEqual([]);
    for (const field of ["cause", "path", "code", "syscall", "filename"] as const) {
      expect(field in safeError).toBe(false);
    }
    expect(safeError.message).not.toContain(fixture.workspaceRoot);
    expect(safeError.message).not.toContain(join(fixture.workspaceRoot, "derivatives"));
    expect(String(safeError)).not.toContain(fixture.workspaceRoot);
    expect(String(safeError)).not.toContain(join(fixture.workspaceRoot, "derivatives"));
  });

  it("rejects an unsupported runType before portable witness issuance", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const producer = createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    );

    await expect(Reflect.apply(producer.bind, producer, [{
      ...dispatch,
      runType: "unsupported-specialist-workflow"
    }])).rejects.toThrow(/authority/i);
  });

  it("derives a non-structural V2 handoff witness from the mounted snapshot", async () => {
    const fixture = authorityFixture();
    const { result } = await issuedBinding(fixture);

    expect(result.binding.authorityWitness).toMatchObject({
      schemaVersion: "agent-mounted-specialist-handoff-authority.v1"
    });
    expect(Object.keys(result.binding.authorityWitness)).toEqual(["schemaVersion"]);
    const consumed = await consumeMountedSpecialistHandoffAuthorityWitness(result.binding.authorityWitness);
    expect(consumed.binding).toEqual({
      workspaceIdentityHash: hashCanonicalSpecialistHandoffJson({
        schemaVersion: "mounted-handoff-workspace-identity.v1",
        workspaceId: fixture.workspaceId,
        workspaceIdentityEventId: "evt_workspace_identity"
      }),
      mountGeneration: expect.any(String),
      ledgerStoreIdentity: "evidence_ledger",
      artifactStoreIdentity: "evidence_artifact",
      ledgerHighWaterEventId: "evt_high_water_005",
      policyHash: `sha256:${"d".repeat(64)}`,
      activeLocksHash: `sha256:${"e".repeat(64)}`
    });
    fixture.ports.authority.invalidate!("authority-loss");
    await expect(consumed.revalidateCurrent()).rejects.toThrow(/authority/i);
  });

  it("binds exactly once and rejects copied controller identities before authority activity", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const producer = createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    );
    const result = await producer.bind(dispatch);
    const copied = { ...result.controller } as MountedHandoffAuthorityController;

    await expect(producer.bind(dispatch)).rejects.toThrow(/bound|consumed|authority/i);
    await expect(beforeMountedHandoffAuthorityEffect(copied, "final-output")).rejects.toThrow(/authority/i);
    await expect(afterMountedHandoffAuthorityAppend(copied, "final-output", "evt_forged")).rejects.toThrow(/authority/i);
  });

  it("accepts only exact created, queued, and running task history before the portable V2 run", async () => {
    const fixture = authorityFixture();
    const normalHistory = [taskCreatedEvent(), queuedTaskStatusEvent(), runningTaskStatusEvent(), startedEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => normalHistory.map((event) => structuredClone(event))
    });

    await expect(issuedBinding(fixture)).resolves.toMatchObject({
      result: { binding: { authorityWitness: { schemaVersion: "agent-mounted-specialist-handoff-authority.v1" } } }
    });

    const conflicting = authorityFixture();
    const crossRunHistory = [
      taskCreatedEvent(),
      queuedTaskStatusEvent(),
      runningTaskStatusEvent({ payload: { ...runningTaskStatusEvent().payload, runId: "run_portable_handoff_foreign" } }),
      startedEvent()
    ];
    Object.defineProperty(conflicting.handle.ledger, "readAll", {
      configurable: true,
      value: async () => crossRunHistory.map((event) => structuredClone(event))
    });

    await expect(issuedBinding(conflicting)).rejects.toThrow(/authority/i);
  });

  it.each([
    ["completed", investigationModelInvocationCompletedEvent()],
    ["failed", investigationModelInvocationFailedEvent()]
  ] as const)("keeps the cursor at started across one exact provider %s transcript", async (_terminal, terminal) => {
    const fixture = authorityFixture();
    const events = [investigationStartedEvent(), investigationModelInvocationRequestedEvent(), terminal];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    const { result } = await issuedBinding(fixture, investigationDispatch);

    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "final-output")).resolves.toBeUndefined();
  });

  it("burns the cursor for malformed, duplicated, reordered, or cross-run provider transcript material", async () => {
    const mutations: readonly (readonly KnowledgeEvent[])[] = [
      [modelInvocationCompletedEvent()],
      [modelInvocationRequestedEvent()],
      [modelInvocationRequestedEvent(), modelInvocationRequestedEvent({ id: "evt_requested_portable_handoff_duplicate" })],
      [modelInvocationRequestedEvent(), modelInvocationCompletedEvent(), modelInvocationCompletedEvent({ id: "evt_completed_portable_handoff_duplicate" })],
      [modelInvocationRequestedEvent(), modelInvocationCompletedEvent({
        payload: { ...modelInvocationCompletedEvent().payload, providerId: "provider_portable_handoff_foreign" }
      })],
      [modelInvocationRequestedEvent({
        payload: { ...modelInvocationRequestedEvent().payload, runId: "run_portable_handoff_foreign" }
      })],
      [{
        ...modelInvocationRequestedEvent(),
        id: "evt_unknown_model_portable_handoff",
        type: "agent.model-invocation.unknown"
      } as unknown as KnowledgeEvent]
    ];
    for (const suffix of mutations) {
      const fixture = authorityFixture();
      const events: KnowledgeEvent[] = [startedEvent()];
      Object.defineProperty(fixture.handle.ledger, "readAll", {
        configurable: true,
        value: async () => events.map((event) => structuredClone(event))
      });
      const { result } = await issuedBinding(fixture);
      events.push(...suffix);

      await expect(beforeMountedHandoffAuthorityEffect(result.controller, "final-output")).rejects.toThrow(/authority/i);
      await expect(result.binding.materialStore.put(Buffer.from("must-not-write", "utf8"))).rejects.toThrow(/authority/i);
    }
  });

  it("rejects investigation final output when the bound start has no provider transcript", async () => {
    const fixture = authorityFixture();
    const events = [investigationStartedEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    await expect(issuedBinding(fixture, investigationDispatch).then(async ({ result }) => {
      await beforeMountedHandoffAuthorityEffect(result.controller, "final-output");
    })).rejects.toThrow(/authority/i);
  });

  it.each([
    ["duplicate", () => investigationPreludeHistory("duplicate")],
    ["reordered", () => investigationPreludeHistory("reordered")],
    ["post-start", () => investigationPreludeHistory("post-start")]
  ] as const)("rejects %s orchestration prelude material before final output", async (_kind, buildHistory) => {
    const fixture = authorityFixture();
    const events = buildHistory();
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    await expect(issuedBinding(fixture, investigationDispatch).then(async ({ result }) => {
      await beforeMountedHandoffAuthorityEffect(result.controller, "final-output");
    })).rejects.toThrow(/authority/i);
  });

  it.each([undefined, "inv_portable_handoff_swapped"])("rejects %s investigation binding before witness issuance", async (investigationId) => {
    const fixture = authorityFixture();
    const investigationStart = startedEvent({
      payload: {
        ...startedEvent().payload,
        runType: "investigation-planner",
        investigationId: "inv_portable_handoff_exact"
      }
    });
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => [structuredClone(investigationStart)]
    });
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const producer = createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    );

    await expect(Reflect.apply(producer.bind, producer, [{
      ...dispatch,
      runType: "investigation-planner",
      ...(investigationId === undefined ? {} : { investigationId })
    }])).rejects.toThrow(/authority/i);
  });

  it("advances an exact controller only across the canonical final-output suffix", async () => {
    const fixture = authorityFixture();
    const events = [startedEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    const { result } = await issuedBinding(fixture);

    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "final-output")).resolves.toBeUndefined();
    events.push(finalOutputEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "final-output", "evt_final_portable_handoff"))
      .resolves.toBeUndefined();
  });

  it("canonical material final output manifest projection and terminal advances one authority cursor", async () => {
    const fixture = authorityFixture();
    const events = [startedEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    const { result } = await issuedBinding(fixture);

    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "final-output")).resolves.toBeUndefined();
    events.push(finalOutputEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "final-output", "evt_final_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "handoff-prepared")).resolves.toBeUndefined();
    events.push(preparedHandoffEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "handoff-prepared", "evt_prepared_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "handoff-recorded")).resolves.toBeUndefined();
    events.push(recordedHandoffEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "handoff-recorded", "evt_recorded_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "run-terminal")).resolves.toBeUndefined();
    events.push(completedRunEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "run-terminal", "evt_completed_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "orchestration-completed")).resolves.toBeUndefined();
    events.push(orchestrationCompletedEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "orchestration-completed", "evt_orchestration_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "task-status")).resolves.toBeUndefined();
    events.push(taskStatusEvent());
    await expect(afterMountedHandoffAuthorityAppend(result.controller, "task-status", "evt_status_portable_handoff"))
      .resolves.toBeUndefined();
    await expect(consumeMountedHandoffAuthorityController(result.controller, [
      "evt_final_portable_handoff",
      "evt_prepared_portable_handoff",
      "evt_recorded_portable_handoff",
      "evt_completed_portable_handoff",
      "evt_orchestration_portable_handoff",
      "evt_status_portable_handoff"
    ])).resolves.toMatchObject({ schemaVersion: "mounted-handoff-authority-consumed-receipt.v1" });
  });

  it("exact resumed handoff derives its phase and remains one shot", async () => {
    const fixture = authorityFixture();
    const events = [startedEvent(), finalOutputEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const producer = createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    );
    const result = await producer.bind(dispatch);

    await expect(beforeMountedHandoffAuthorityEffect(result.controller, "handoff-prepared")).resolves.toBeUndefined();
    await expect(producer.bind(dispatch)).rejects.toThrow(/authority/i);
  });

  it("forged structural authority operation fails before remount and store io", async () => {
    const fixture = authorityFixture();
    const forged = { schemaVersion: "mounted-artifact-authority-operation.v1" } as MountedArtifactAuthorityOperation;

    expect(() => createPortableMountedAgentArtifactStoreProducer(forged)).toThrow(/authority/i);
    expect(fixture.calls).toEqual({ mounted: 0, lease: 0, reconciliation: 0 });
  });

  it("admission change burns old controller and fresh operation resumes canonical prefix", async () => {
    const fixture = authorityFixture();
    const events = [startedEvent(), finalOutputEvent()];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const old = await createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    ).bind(dispatch);
    fixture.ports.authority.invalidate!("authority-loss");
    await admit(fixture, "recovery");

    await expect(beforeMountedHandoffAuthorityEffect(old.controller, "handoff-prepared"))
      .rejects.toThrow(/authority/i);
    const freshOperation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
    const fresh = await createPortableMountedAgentArtifactStoreProducer(freshOperation).bind(dispatch);
    await expect(beforeMountedHandoffAuthorityEffect(fresh.controller, "handoff-prepared"))
      .resolves.toBeUndefined();
    await expect(beforeMountedHandoffAuthorityEffect(old.controller, "handoff-prepared"))
      .rejects.toThrow(/authority/i);
  });

  it("identical visible tuple under new admission cannot rotate or revive authority cursor", async () => {
    const fixture = authorityFixture();
    const wakeRuntime = {};
    registerMountedArtifactAuthorityIssuerForWakeRuntime({
      wakeRuntime,
      lifecyclePorts: fixture.ports,
      runtimeHandle: fixture.handle
    });
    await admit(fixture, "wake");
    const old = await createPortableMountedAgentArtifactStoreProducer(
      issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
    ).bind(dispatch);
    fixture.ports.authority.invalidate!("authority-loss");
    await admit(fixture, "recovery");

    await expect(beforeMountedHandoffAuthorityEffect(old.controller, "final-output")).rejects.toThrow(/authority/i);
    await expect(beforeMountedHandoffAuthorityEffect(old.controller, "final-output")).rejects.toThrow(/authority/i);
  });

  it.each([
    ["material", "put"],
    ["material", "get"],
    ["manifest", "put"],
    ["manifest", "get"]
  ] as const)("authority loss during %s %s returns no authoritative store receipt", async (role, operation) => {
    const fixture = authorityFixture();
    const { result } = await issuedBinding(fixture);
    const store = role === "material" ? result.binding.materialStore : result.binding.manifestStore;
    const content = Buffer.from(`${role}-${operation}`, "utf8");
    const prior = operation === "get" ? await store.put(content) : undefined;

    await invalidateDuringFileBlobOperation(fixture, operation, async () => {
      if (operation === "put") {
        await expect(store.put(content)).rejects.toThrow(/authority|current|cursor/i);
      } else {
        await expect(store.get(prior!.contentHash)).rejects.toThrow(/authority|current|cursor/i);
      }
    });
  });

  it("rejects unrelated suffixes rollbacks replacements and reorder before store io without fallback", async () => {
    for (const mutate of [
      (events: KnowledgeEvent[]) => events.push(unrelatedEvent()),
      (events: KnowledgeEvent[]) => events.splice(0, events.length),
      (events: KnowledgeEvent[]) => events.splice(0, 1, { ...events[0]!, id: "evt_replaced" }),
      (events: KnowledgeEvent[]) => events.reverse()
    ]) {
      const fixture = authorityFixture();
      const events = [historicalEvent(), startedEvent()];
      Object.defineProperty(fixture.handle.ledger, "readAll", {
        configurable: true,
        value: async () => events.map((event) => structuredClone(event))
      });
      const { result } = await issuedBinding(fixture);
      mutate(events);

      await expect(result.binding.materialStore.put(Buffer.from("must-not-write", "utf8")))
        .rejects.toThrow(/cursor|ledger|authority/i);
    }
  });

  it("rejects controller structural copies and binding-attached controller channels", async () => {
    const fixture = authorityFixture();
    const { result } = await issuedBinding(fixture);
    const structural = Object.freeze({}) as MountedHandoffAuthorityController;
    const copiedResult = { ...result, controller: { ...result.controller } } as FactoryPortableMountedAgentHandoffProducerResultV1;

    await expect(beforeMountedHandoffAuthorityEffect(structural, "final-output")).rejects.toThrow(/authority/i);
    await expect(beforeMountedHandoffAuthorityEffect(copiedResult.controller, "final-output")).rejects.toThrow(/authority/i);
    expect(Object.getOwnPropertyDescriptor(result.binding, "controller")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(result.controller, "beforeEffect")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(result.controller, "afterAppend")).toBeUndefined();
  });

  it("foreign resident actor cannot advance canonical handoff authority", async () => {
    const fixture = authorityFixture();
    const events = [startedEvent({ context: eventContext({ actorId: "agent_foreign" }) })];
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });

    await expect(issuedBinding(fixture)).rejects.toThrow(/authority/i);
  });

  it("attempt swapped orchestration cannot advance task status authority", async () => {
    const fixture = authorityFixture();
    const events = canonicalHandoffEvents();
    events.push(orchestrationCompletedEvent({
      payload: { ...orchestrationCompletedEvent().payload, attemptId: "attempt_swapped_portable_handoff" }
    }), taskStatusEvent());
    Object.defineProperty(fixture.handle.ledger, "readAll", {
      configurable: true,
      value: async () => events.map((event) => structuredClone(event))
    });

    await expect(issuedBinding(fixture)).rejects.toThrow(/authority/i);
  });

  it("mismatched final prepared recorded and terminal artifacts burn authority", async () => {
    const mismatches: readonly ((events: KnowledgeEvent[]) => void)[] = [
      (events) => {
        events[1] = finalOutputEvent({ payload: { ...finalOutputEvent().payload, outputArtifactHashes: [hash("1")] } });
      },
      (events) => {
        events[3] = recordedHandoffEvent({ payload: { ...recordedHandoffEvent().payload, outputArtifactHashes: [hash("2")] } });
      },
      (events) => {
        events[4] = completedRunEvent({ payload: { ...completedRunEvent().payload, outputArtifactHashes: [hash("3")] } });
      }
    ];
    for (const mismatch of mismatches) {
      const fixture = authorityFixture();
      const events = canonicalHandoffEvents();
      mismatch(events);
      Object.defineProperty(fixture.handle.ledger, "readAll", {
        configurable: true,
        value: async () => events.map((event) => structuredClone(event))
      });

      await expect(issuedBinding(fixture)).rejects.toThrow(/authority/i);
    }
  });

  it("policy lock foreign run and arbitrary wake suffixes return no receipt or terminal authority", async () => {
    const suffixes = [
      { ...startedEvent(), id: "evt_policy_portable_handoff", type: "agent.policy.installed", payload: { taskId: dispatch.taskId } },
      { ...startedEvent(), id: "evt_lock_portable_handoff", type: "agent.lock.activated", payload: { taskId: dispatch.taskId } },
      { ...finalOutputEvent(), id: "evt_foreign_run_portable_handoff", payload: { ...finalOutputEvent().payload, runId: "run_foreign_portable_handoff" } },
      { ...unrelatedEvent(), payload: { ...unrelatedEvent().payload, taskId: dispatch.taskId } }
    ] as const;
    for (const suffix of suffixes) {
      const fixture = authorityFixture();
      const events = [startedEvent()];
      Object.defineProperty(fixture.handle.ledger, "readAll", {
        configurable: true,
        value: async () => events.map((event) => structuredClone(event))
      });
      const { result } = await issuedBinding(fixture);
      events.push(suffix as KnowledgeEvent);

      await expect(beforeMountedHandoffAuthorityEffect(result.controller, "run-terminal")).rejects.toThrow(/authority/i);
      await expect(consumeMountedHandoffAuthorityController(result.controller, [])).rejects.toThrow(/authority/i);
    }
  });

  it("hostile ledger values fail before serialization observation or store io", async () => {
    const hostileEvents = [
      (observed: { value: number }) => accessorHostileFinalOutputEvent(observed),
      (observed: { value: number }) => symbolHostileFinalOutputEvent(observed),
      (observed: { value: number }) => sparseArrayHostileFinalOutputEvent(observed),
      (observed: { value: number }) => customPrototypeHostileFinalOutputEvent(observed),
      (observed: { value: number }) => toJsonHostileFinalOutputEvent(observed)
    ] as const;
    for (const createHostile of hostileEvents) {
      const fixture = authorityFixture();
      const events: KnowledgeEvent[] = [startedEvent()];
      Object.defineProperty(fixture.handle.ledger, "readAll", {
        configurable: true,
        value: async () => events
      });
      const { result } = await issuedBinding(fixture);
      const observed = { value: 0 };
      const hostile = createHostile(observed);
      let storeIo = 0;
      const originalPut = FileBlobStore.prototype.put;
      Object.defineProperty(FileBlobStore.prototype, "put", {
        configurable: true,
        value: async function(this: FileBlobStore, content: Buffer) {
          storeIo += 1;
          return await originalPut.call(this, content);
        }
      });
      try {
        events.push(hostile);
        await expect(result.binding.materialStore.put(Buffer.from("must-not-observe", "utf8")))
          .rejects.toThrow(/authority/i);
      } finally {
        Object.defineProperty(FileBlobStore.prototype, "put", { configurable: true, value: originalPut });
      }
      expect(observed.value).toBe(0);
      expect(storeIo).toBe(0);
    }
  });
});

async function issuedBinding(
  fixture: ReturnType<typeof authorityFixture>,
  binding: BindPortableMountedAgentHandoffInput = dispatch
): Promise<{
  readonly operation: MountedArtifactAuthorityOperation;
  readonly result: FactoryPortableMountedAgentHandoffProducerResultV1;
}> {
  const wakeRuntime = {};
  registerMountedArtifactAuthorityIssuerForWakeRuntime({
    wakeRuntime,
    lifecyclePorts: fixture.ports,
    runtimeHandle: fixture.handle
  });
  await admit(fixture, "wake");
  const operation = issueMountedArtifactAuthorityOperationForFactory(wakeRuntime);
  const result = await createPortableMountedAgentArtifactStoreProducer(operation).bind(binding);
  return { operation, result };
}

function authorityFixture(): {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly handle: LocalRuntimeHandle;
  readonly ports: PortableWorkspaceLifecyclePorts;
  readonly calls: { mounted: number; lease: number; reconciliation: number };
} {
  const workspaceId = `ws_portable_handoff_${tempDirs.length + 1}`;
  const workspaceRoot = join(tempDir(), workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Portable handoff ${workspaceId}`,
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "portable-mounted-agent-artifact-stores-test"
  });
  const handle = track(createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_portable_handoff", kind: "human", label: "Portable handoff test" }
  }));
  const calls = { mounted: 0, lease: 0, reconciliation: 0 };
  const supervisorEpoch = "epoch_portable_handoff";
  const ports = createPortableWorkspaceLifecyclePorts({
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        calls.mounted += 1;
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            workspaceId,
            residentId: "agent_default" as const,
            workspaceIdentityEventId: "evt_workspace_identity",
            mountInstanceId: "mount-instance:1",
            mountEvidenceId: "evidence_mount",
            authorityEvidenceId: "evidence_authority",
            ledgerStoreEvidenceId: "evidence_ledger",
            artifactStoreEvidenceId: "evidence_artifact",
            derivativeStoreEvidenceId: "evidence_derivative",
            policyVersion: "policy.v1",
            policyDigest: `sha256:${"d".repeat(64)}`,
            lockStateDigest: `sha256:${"e".repeat(64)}`,
            policyAndLockReadbackEventId: "evt_policy_lock_readback",
            highWaterMark: "evt_high_water_005",
            highWaterReadbackEventId: "evt_high_water_readback",
            highWaterOrdinal: 5
          }
        };
      }
    },
    supervisorLease: leasePort(workspaceId, supervisorEpoch, calls),
    activeClaimReconciliation: reconciliationPort(calls),
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeOutageObservationId: () => "outage:portable-handoff"
  });
  return { workspaceId, workspaceRoot, handle, ports, calls };
}

async function admit(
  fixture: ReturnType<typeof authorityFixture>,
  operation: "wake" | "recovery"
): Promise<WorkspaceAdmissionSnapshot> {
  const grant = await fixture.ports.authority.revalidate({
    operation,
    expectedWorkspaceId: fixture.workspaceId,
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("fixture must issue an admission");
  const result = await fixture.ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_portable_handoff",
    policyVersion: "policy.v1",
    policyDigest: `sha256:${"d".repeat(64)}`,
    lockStateDigest: `sha256:${"e".repeat(64)}`,
    causationId: "cause_portable_handoff",
    correlationId: "correlation_portable_handoff"
  });
  if (result.outcome !== "acquired-and-read-back") throw new Error("fixture must read back its lease");
  return grant.admission;
}

function leasePort(
  workspaceId: string,
  supervisorEpoch: string,
  calls: { mounted: number; lease: number; reconciliation: number }
): DurableSupervisorLeasePort {
  return {
    async readOrAcquire() {
      calls.lease += 1;
      return { outcome: "acquired-and-read-back" as const, readback: leaseReadback(workspaceId, supervisorEpoch) };
    }
  };
}

function leaseReadback(workspaceId: string, supervisorEpoch: string): SupervisorLeaseReadbackEvidence {
  return {
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    workspaceIdentityEventId: "evt_workspace_identity",
    mountEvidenceId: "evidence_mount",
    authorityEvidenceId: "evidence_authority",
    policyVersion: "policy.v1",
    policyDigest: `sha256:${"d".repeat(64)}`,
    lockStateDigest: `sha256:${"e".repeat(64)}`,
    highWaterMark: "evt_high_water_005",
    leaseEventId: "evt_lease",
    readbackEventId: "evt_lease_readback",
    expiresAt: "2026-07-16T01:00:00.000Z",
    causation: { causationId: "cause_portable_handoff", correlationId: "correlation_portable_handoff" },
    policyAndLock: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      policyVersion: "policy.v1",
      policyDigest: `sha256:${"d".repeat(64)}`,
      lockStateDigest: `sha256:${"e".repeat(64)}`,
      readbackEventId: "evt_policy_lock_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      highWaterMark: "evt_high_water_005",
      readbackEventId: "evt_high_water_readback"
    }
  };
}

function reconciliationPort(
  calls: { mounted: number; lease: number; reconciliation: number }
): ActiveClaimReconciliationPort {
  return {
    async readByIdempotencyKey() {
      calls.reconciliation += 1;
      return undefined;
    },
    async appendAndReadBack() {
      calls.reconciliation += 1;
      throw new Error("reconciliation is not expected");
    }
  };
}

async function invalidateDuringFileBlobOperation(
  fixture: ReturnType<typeof authorityFixture>,
  operation: "put" | "get",
  action: () => Promise<void>
): Promise<void> {
  let invoked = false;
  if (operation === "put") {
    const original = FileBlobStore.prototype.put;
    Object.defineProperty(FileBlobStore.prototype, "put", {
      configurable: true,
      value: async function(this: FileBlobStore, content: Buffer) {
        const result = await original.call(this, content);
        invoked = true;
        fixture.ports.authority.invalidate!("authority-loss");
        return result;
      }
    });
    try {
      await action();
    } finally {
      Object.defineProperty(FileBlobStore.prototype, "put", { configurable: true, value: original });
    }
  } else {
    const original = FileBlobStore.prototype.get;
    Object.defineProperty(FileBlobStore.prototype, "get", {
      configurable: true,
      value: async function(this: FileBlobStore, contentHash: `sha256:${string}`) {
        const result = await original.call(this, contentHash);
        invoked = true;
        fixture.ports.authority.invalidate!("authority-loss");
        return result;
      }
    });
    try {
      await action();
    } finally {
      Object.defineProperty(FileBlobStore.prototype, "get", { configurable: true, value: original });
    }
  }
  expect(invoked).toBe(true);
}

function canonicalHandoffEvents(): KnowledgeEvent[] {
  return [startedEvent(), finalOutputEvent(), preparedHandoffEvent(), recordedHandoffEvent(), completedRunEvent()];
}

function taskCreatedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_task_created_portable_handoff",
    type: "agent.task.created",
    streamId: `agent_task_${dispatch.taskId}`,
    sequence: 1,
    context: eventContext(),
    payload: {
      taskId: dispatch.taskId,
      residentAgentId: "agent_default",
      title: "Portable handoff task.",
      requestedBy: "agent_default",
      priority: "normal"
    },
    ...patch
  } as KnowledgeEvent;
}

function queuedTaskStatusEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_task_queued_portable_handoff",
    type: "agent.task.status.changed",
    streamId: `agent_task_${dispatch.taskId}`,
    sequence: 2,
    context: eventContext({ causationId: "evt_task_created_portable_handoff" }),
    payload: {
      taskId: dispatch.taskId,
      status: "queued",
      changedBy: "agent_default"
    },
    ...patch
  } as KnowledgeEvent;
}

function runningTaskStatusEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_task_running_portable_handoff",
    type: "agent.task.status.changed",
    streamId: `agent_task_${dispatch.taskId}`,
    sequence: 3,
    context: eventContext({ causationId: "evt_task_queued_portable_handoff" }),
    payload: {
      taskId: dispatch.taskId,
      status: "running",
      changedBy: "agent_default",
      runId: dispatch.approvedRunId
    },
    ...patch
  } as KnowledgeEvent;
}

function startedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    id: "evt_started_portable_handoff",
    type: "agent.specialist-run.started",
    version: 1,
    streamId: `agent_run_${dispatch.approvedRunId}`,
    sequence: 1,
    context: eventContext(),
    payload: {
      runId: dispatch.approvedRunId,
      residentAgentId: "agent_default",
      runType: dispatch.runType,
      startedBy: "agent_default",
      taskId: dispatch.taskId,
      sourceEventIds: ["evt_source_portable_handoff"],
      inputArtifactHashes: [`sha256:${"a".repeat(64)}`]
    },
    ...patch
  } as KnowledgeEvent;
}

function modelInvocationRequestedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_requested_portable_handoff",
    type: "agent.model-invocation.requested",
    streamId: "agent_model_invocation_inv_portable_handoff",
    sequence: 1,
    context: eventContext({ causationId: "evt_started_portable_handoff", correlationId: "corr_inv_portable_handoff" }),
    payload: {
      invocationId: "inv_portable_handoff",
      runId: dispatch.approvedRunId,
      providerId: "provider_portable_handoff",
      modelFamily: "portable-local",
      inputArtifactHash: hash("1"),
      safetyClass: "workspace-safe",
      credentialRefId: "agent_credref_portable_handoff",
      credentialKind: "local-no-secret",
      runType: dispatch.runType
    },
    ...patch
  } as KnowledgeEvent;
}

function modelInvocationCompletedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...modelInvocationRequestedEvent(),
    id: "evt_completed_portable_handoff",
    type: "agent.model-invocation.completed",
    sequence: 2,
    context: eventContext({ causationId: "evt_requested_portable_handoff", correlationId: "corr_inv_portable_handoff" }),
    payload: {
      invocationId: "inv_portable_handoff",
      runId: dispatch.approvedRunId,
      providerId: "provider_portable_handoff",
      outputArtifactHash: hash("2"),
      completedAt: "2026-07-16T00:00:00.000Z",
      modelFamily: "portable-local"
    },
    ...patch
  } as KnowledgeEvent;
}

function modelInvocationFailedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...modelInvocationRequestedEvent(),
    id: "evt_failed_portable_handoff",
    type: "agent.model-invocation.failed",
    sequence: 2,
    context: eventContext({ causationId: "evt_requested_portable_handoff", correlationId: "corr_inv_portable_handoff" }),
    payload: {
      invocationId: "inv_portable_handoff",
      runId: dispatch.approvedRunId,
      providerId: "provider_portable_handoff",
      category: "provider-unavailable",
      message: "Portable provider is unavailable.",
      retryable: false,
      allowedActions: ["choose a configured provider"]
    },
    ...patch
  } as KnowledgeEvent;
}

function investigationStartedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  const started = startedEvent();
  return {
    ...started,
    streamId: `agent_run_${investigationDispatch.approvedRunId}`,
    payload: {
      ...started.payload,
      taskId: investigationDispatch.taskId,
      runId: investigationDispatch.approvedRunId,
      runType: investigationDispatch.runType,
      investigationId: investigationDispatch.investigationId
    },
    ...patch
  } as KnowledgeEvent;
}

function investigationModelInvocationRequestedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  const requested = modelInvocationRequestedEvent();
  return {
    ...requested,
    context: eventContext({
      causationId: "evt_started_portable_handoff",
      correlationId: "corr_inv_portable_handoff"
    }),
    payload: {
      ...requested.payload,
      runId: investigationDispatch.approvedRunId,
      runType: investigationDispatch.runType
    },
    ...patch
  } as KnowledgeEvent;
}

function investigationModelInvocationCompletedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  const completed = modelInvocationCompletedEvent();
  return {
    ...completed,
    context: eventContext({
      causationId: "evt_requested_portable_handoff",
      correlationId: "corr_inv_portable_handoff"
    }),
    payload: {
      ...completed.payload,
      runId: investigationDispatch.approvedRunId
    },
    ...patch
  } as KnowledgeEvent;
}

function investigationModelInvocationFailedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  const failed = modelInvocationFailedEvent();
  return {
    ...failed,
    context: eventContext({
      causationId: "evt_requested_portable_handoff",
      correlationId: "corr_inv_portable_handoff"
    }),
    payload: {
      ...failed.payload,
      runId: investigationDispatch.approvedRunId
    },
    ...patch
  } as KnowledgeEvent;
}

function exactDispatchClaimEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_claimed_portable_handoff",
    type: "agent.task.orchestration.claimed",
    streamId: `agent_task_orchestration_${investigationDispatch.taskId}_${investigationDispatch.runType}`,
    sequence: 1,
    context: eventContext({
      causationId: "evt_task_queued_portable_handoff",
      correlationId: `corr_${investigationDispatch.taskId}`
    }),
    payload: {
      taskId: investigationDispatch.taskId,
      runType: investigationDispatch.runType,
      attemptId: investigationDispatch.attemptId,
      retryGeneration: investigationDispatch.retryGeneration,
      leaseClaimGeneration: 1,
      workerId: "agent_default",
      claimedAt: "2026-07-16T00:00:00.000Z",
      leaseExpiresAt: "2026-07-16T01:00:00.000Z",
      idempotencyKey: "task-orchestrator:portable-handoff:claim",
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: "2026-07-16T00:00:00.000Z",
        taskId: investigationDispatch.taskId,
        runType: investigationDispatch.runType,
        retryGeneration: investigationDispatch.retryGeneration
      },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 65_536,
        promptByteBudget: 65_536,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId: "evt_task_queued_portable_handoff"
    },
    ...patch
  } as KnowledgeEvent;
}

function exactDispatchCheckpointEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_checkpointed_portable_handoff",
    type: "agent.task.orchestration.checkpointed",
    streamId: `agent_task_orchestration_${investigationDispatch.taskId}_${investigationDispatch.runType}`,
    sequence: 2,
    context: eventContext({
      causationId: "evt_claimed_portable_handoff",
      correlationId: `corr_${investigationDispatch.taskId}`
    }),
    payload: {
      taskId: investigationDispatch.taskId,
      runType: investigationDispatch.runType,
      attemptId: investigationDispatch.attemptId,
      retryGeneration: investigationDispatch.retryGeneration,
      leaseClaimGeneration: 1,
      checkpointKind: "runner-dispatching",
      checkpointedAt: "2026-07-16T00:00:00.000Z",
      runId: investigationDispatch.approvedRunId,
      resumeIdempotencyKey: "task-orchestrator:portable-handoff:runner-dispatching",
      contextBindings: [],
      safeNextActions: ["wait for durable specialist handoff readback"]
    },
    ...patch
  } as KnowledgeEvent;
}

function investigationPreludeHistory(kind: "duplicate" | "reordered" | "post-start"): KnowledgeEvent[] {
  const prefix = [taskCreatedEvent(), queuedTaskStatusEvent()];
  const claim = exactDispatchClaimEvent();
  const checkpoint = exactDispatchCheckpointEvent();
  const transcript = [
    investigationStartedEvent(),
    investigationModelInvocationRequestedEvent(),
    investigationModelInvocationCompletedEvent()
  ];
  if (kind === "duplicate") {
    return [
      ...prefix,
      claim,
      exactDispatchClaimEvent({ id: "evt_claimed_portable_handoff_duplicate", sequence: 2 }),
      exactDispatchCheckpointEvent({ sequence: 3 }),
      ...transcript
    ];
  }
  if (kind === "reordered") return [...prefix, checkpoint, claim, ...transcript];
  return [
    ...prefix,
    claim,
    checkpoint,
    ...transcript,
    exactDispatchCheckpointEvent({ id: "evt_checkpointed_portable_handoff_post_start", sequence: 3 })
  ];
}

function finalOutputEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_final_portable_handoff",
    type: "agent.specialist-run.step.recorded",
    sequence: 2,
    payload: {
      runId: dispatch.approvedRunId,
      stepId: "step_final_portable_handoff",
      summary: "Final portable output is persisted.",
      stepKind: "final-output",
      stepSchemaId: "evidence-triage-handoff.v1",
      idempotencyKey: "specialist-final-output:portable-handoff",
      handoffMaterialArtifactHash: `sha256:${"b".repeat(64)}`,
      inputArtifactHashes: [`sha256:${"a".repeat(64)}`],
      outputArtifactHashes: [`sha256:${"c".repeat(64)}`]
    },
    ...patch
  } as KnowledgeEvent;
}

function preparedHandoffEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_prepared_portable_handoff",
    type: "agent.specialist-handoff.prepared",
    sequence: 3,
    context: eventContext({ causationId: "evt_final_portable_handoff" }),
    payload: handoffBindingPayload(),
    ...patch
  } as unknown as KnowledgeEvent;
}

function recordedHandoffEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...preparedHandoffEvent(),
    id: "evt_recorded_portable_handoff",
    type: "agent.specialist-handoff.recorded",
    sequence: 4,
    context: eventContext({ causationId: "evt_prepared_portable_handoff" }),
    payload: {
      ...handoffBindingPayload(),
      preparedEventId: "evt_prepared_portable_handoff",
      verifiedAt: "2026-07-16T00:00:00.000Z"
    },
    ...patch
  } as unknown as KnowledgeEvent;
}

function completedRunEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_completed_portable_handoff",
    type: "agent.specialist-run.completed",
    sequence: 5,
    context: eventContext({ causationId: "evt_recorded_portable_handoff" }),
    payload: {
      runId: dispatch.approvedRunId,
      completedAt: "2026-07-16T00:00:00.000Z",
      outputArtifactHashes: [hash("c")],
      relatedEventIds: ["evt_recorded_portable_handoff"]
    },
    ...patch
  } as KnowledgeEvent;
}

function orchestrationCompletedEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_orchestration_portable_handoff",
    type: "agent.task.orchestration.completed",
    streamId: `agent_task_orchestration_${dispatch.taskId}_${dispatch.runType}`,
    sequence: 6,
    context: eventContext({ causationId: "evt_completed_portable_handoff" }),
    payload: {
      taskId: dispatch.taskId,
      runType: dispatch.runType,
      attemptId: dispatch.attemptId,
      retryGeneration: 0,
      runId: dispatch.approvedRunId,
      completedAt: "2026-07-16T00:00:00.000Z",
      specialistRunCompletedEventId: "evt_completed_portable_handoff",
      finalOutputStepEventId: "evt_final_portable_handoff",
      handoffPreparedEventId: "evt_prepared_portable_handoff",
      handoffRecordedEventId: "evt_recorded_portable_handoff",
      handoffReadback: {
        handoffId: "handoff_portable_handoff_0123456789abcdef",
        handoffManifestHash: hash("d"),
        handoffRecordedEventId: "evt_recorded_portable_handoff",
        verifiedAt: "2026-07-16T00:00:00.000Z"
      }
    },
    ...patch
  } as KnowledgeEvent;
}

function taskStatusEvent(patch: Record<string, unknown> = {}): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_status_portable_handoff",
    type: "agent.task.status.changed",
    streamId: `agent_task_${dispatch.taskId}`,
    sequence: 7,
    context: eventContext({ causationId: "evt_orchestration_portable_handoff" }),
    payload: {
      taskId: dispatch.taskId,
      runId: dispatch.approvedRunId,
      status: "completed",
      changedBy: "agent_default"
    },
    ...patch
  } as KnowledgeEvent;
}

function handoffBindingPayload(): Record<string, unknown> {
  return {
    handoffId: "handoff_portable_handoff_0123456789abcdef",
    handoffRevision: 1,
    idempotencyKey: `specialist-handoff:${dispatch.approvedRunId}:${dispatch.taskId}:${dispatch.runType}:ready-for-review:${hash("d")}`,
    handoffManifestHash: hash("d"),
    handoffDtoHash: hash("e"),
    handoffMaterialArtifactHash: hash("b"),
    runId: dispatch.approvedRunId,
    taskId: dispatch.taskId,
    runType: dispatch.runType,
    residentAgentId: "agent_default",
    status: "ready-for-review",
    safeSummary: "Portable handoff is ready for review.",
    finalOutputStepId: "step_final_portable_handoff",
    finalOutputEventId: "evt_final_portable_handoff",
    contextPackHashes: [hash("f")],
    outputArtifactHashes: [hash("c")],
    toolRequestIds: ["toolreq_portable_handoff"],
    sourceEventIds: ["evt_source_portable_handoff"],
    relatedEventIds: ["evt_final_portable_handoff"]
  };
}

function accessorHostileFinalOutputEvent(observed: { value: number }): KnowledgeEvent {
  const event = finalOutputEvent() as unknown as Record<string, unknown>;
  const payload = event.payload as Record<string, unknown>;
  Object.defineProperty(payload, "outputArtifactHashes", {
    enumerable: true,
    configurable: true,
    get() {
      observed.value += 1;
      return [hash("c")];
    }
  });
  return event as unknown as KnowledgeEvent;
}

function symbolHostileFinalOutputEvent(_observed: { value: number }): KnowledgeEvent {
  const event = finalOutputEvent() as unknown as Record<string | symbol, unknown>;
  event[Symbol("hostile")] = true;
  return event as unknown as KnowledgeEvent;
}

function sparseArrayHostileFinalOutputEvent(_observed: { value: number }): KnowledgeEvent {
  const event = finalOutputEvent() as unknown as Record<string, unknown>;
  const payload = event.payload as Record<string, unknown>;
  const sparse: string[] = [];
  sparse[1] = hash("c");
  payload.outputArtifactHashes = sparse;
  return event as unknown as KnowledgeEvent;
}

function customPrototypeHostileFinalOutputEvent(_observed: { value: number }): KnowledgeEvent {
  const event = finalOutputEvent() as unknown as Record<string, unknown>;
  const payload = event.payload as Record<string, unknown>;
  payload.handoffMaterialArtifactHash = Object.create({ inherited: hash("b") });
  return event as unknown as KnowledgeEvent;
}

function toJsonHostileFinalOutputEvent(observed: { value: number }): KnowledgeEvent {
  const event = finalOutputEvent() as unknown as Record<string, unknown>;
  const payload = event.payload as Record<string, unknown>;
  payload.toJSON = () => {
    observed.value += 1;
    return {};
  };
  return event as unknown as KnowledgeEvent;
}

function hash(fill: string): `sha256:${string}` {
  return `sha256:${fill.repeat(64)}`;
}

function historicalEvent(): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_historical_other_task",
    type: "agent.task.created",
    streamId: "agent_task_task_historical_other",
    payload: {
      taskId: "task_historical_other",
      residentAgentId: "agent_default",
      requestedBy: "actor_historical",
      priority: "normal",
      title: "Historical other task.",
      sourceEventIds: ["evt_source_historical"],
      inputArtifactHashes: [`sha256:${"d".repeat(64)}`]
    }
  } as unknown as KnowledgeEvent;
}

function unrelatedEvent(): KnowledgeEvent {
  return {
    ...startedEvent(),
    id: "evt_unrelated_portable_handoff",
    type: "agent.trigger.requested.v1",
    streamId: "agent_trigger_unrelated",
    payload: { triggerId: "trigger_unrelated", requestedAt: "2026-07-16T00:00:00.000Z", requestedBy: "agent_default", reason: "Unrelated wake event." }
  } as unknown as KnowledgeEvent;
}

function eventContext(patch: { readonly actorId?: string; readonly causationId?: string; readonly correlationId?: string } = {}) {
  return {
    actor: { id: patch.actorId ?? "agent_default", kind: "agent" as const, label: "Cestus resident" },
    occurredAt: "2026-07-16T00:00:00.000Z",
    correlationId: patch.correlationId ?? "corr_portable_handoff",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" },
    ...(patch.causationId === undefined ? {} : { causationId: patch.causationId })
  };
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-portable-handoff-"));
  tempDirs.push(dir);
  return dir;
}

function track(handle: LocalRuntimeHandle): LocalRuntimeHandle {
  handles.push(handle);
  return handle;
}
