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
  runType: "evidence-triage"
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
      "schemaVersion", "preparationBinder", "materialStore", "manifestStore"
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

  it("derives a non-structural V2 handoff witness from the mounted snapshot", async () => {
    const fixture = authorityFixture();
    const { result } = await issuedBinding(fixture);

    expect(result.binding.authorityWitness).toMatchObject({
      schemaVersion: "agent-mounted-specialist-handoff-authority.v1"
    });
    expect(Object.keys(result.binding.authorityWitness)).toEqual(["schemaVersion"]);
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

async function issuedBinding(fixture: ReturnType<typeof authorityFixture>): Promise<{
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
  const result = await createPortableMountedAgentArtifactStoreProducer(operation).bind(dispatch);
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
            policyDigest: "sha256:policy",
            lockStateDigest: "sha256:lock",
            policyAndLockReadbackEventId: "evt_policy_lock_readback",
            highWaterMark: "high-water:5",
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
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
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
    policyDigest: "sha256:policy",
    lockStateDigest: "sha256:lock",
    highWaterMark: "high-water:5",
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
      policyDigest: "sha256:policy",
      lockStateDigest: "sha256:lock",
      readbackEventId: "evt_policy_lock_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_authority",
      mountEvidenceId: "evidence_mount",
      leaseEventId: "evt_lease",
      leaseReadbackEventId: "evt_lease_readback",
      highWaterMark: "high-water:5",
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
    streamId: `agent_task_${dispatch.taskId}`,
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

function eventContext(patch: { readonly actorId?: string; readonly causationId?: string } = {}) {
  return {
    actor: { id: patch.actorId ?? "agent_default", kind: "agent" as const, label: "Cestus resident" },
    occurredAt: "2026-07-16T00:00:00.000Z",
    correlationId: "corr_portable_handoff",
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
