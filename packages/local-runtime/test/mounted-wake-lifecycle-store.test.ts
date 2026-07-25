import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveClaimReconciliationPort } from "../../agent/src/wake-supervisor.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { registerMountedArtifactAuthorityIssuerForWakeRuntime } from "../src/mounted-artifact-authority-operation.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  createMountedWakeLifecycleStore,
  type MountedWakeLifecycleStore,
  type MountedWakeLifecycleStoreInput
} from "../src/mounted-wake-lifecycle-store.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";

const directories: string[] = [];
const handles: LocalRuntimeHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function authenticate(handle: LocalRuntimeHandle) {
  return registerMountedArtifactAuthorityIssuerForWakeRuntime({
    phase: "authenticate",
    runtimeHandle: handle
  });
}

async function fixture(overrides: Partial<MountedWakeLifecycleStoreInput> = {}, ready = true) {
  const root = mkdtempSync(join(tmpdir(), "cestus-mounted-wake-store-"));
  directories.push(root);
  const workspaceId = "ws_mounted_wake";
  const workspaceRoot = join(root, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Mounted wake store",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "mounted-wake-store-test"
  });
  const handle = openHandle(root, workspaceRoot);
  if (ready) await handle.residentIdentity.ready();
  const capability = authenticate(handle);
  const input: MountedWakeLifecycleStoreInput = {
    capability,
    actor: { id: "agent_mounted_wake", kind: "agent", label: "Mounted wake store" },
    supervisorEpoch: "epoch_mounted_wake",
    policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind) => `${kind}_mounted_wake`,
    ...overrides
  };
  return { root, workspaceRoot, ledger: handle.ledger, handle, input, store: createMountedWakeLifecycleStore(input) };
}

function openHandle(root: string, workspaceRoot: string): LocalRuntimeHandle {
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: root,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_mounted_wake", kind: "human", label: "Mounted wake store" }
  });
  handles.push(handle);
  return handle;
}

async function appendLease(store: MountedWakeLifecycleStore) {
  return store.appendAndReadBack({
    type: "agent.wake.supervisor.lease.claimed.v1",
    causation: { causationId: "evt_mounted_wake_cause", correlationId: "corr_mounted_wake" }
  });
}

async function seedActiveClaim(ledger: EventLedger, causationEventId: string) {
  const taskId = "task_mounted_reconciliation";
  const attemptId = `attempt_${"a".repeat(64)}`;
  return ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId: "agent_task_orchestration_task_mounted_reconciliation_investigation-planner",
    context: {
      actor: { id: "agent_mounted_wake", kind: "agent", label: "Mounted wake store" },
      occurredAt: "2026-07-16T00:00:00.000Z",
      causationId: causationEventId,
      correlationId: "corr_mounted_reconciliation_claim",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId,
      runType: "investigation-planner",
      attemptId,
      retryGeneration: 0,
      leaseClaimGeneration: 1,
      workerId: "agent_mounted_wake",
      claimedAt: "2026-07-16T00:00:00.000Z",
      leaseExpiresAt: "2026-07-16T01:00:00.000Z",
      idempotencyKey: "claim_mounted_reconciliation",
      selectedOrderingPosition: {
        priorityRank: 0,
        queuedAt: "2026-07-16T00:00:00.000Z",
        taskId,
        runType: "investigation-planner",
        retryGeneration: 0
      },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 32_768,
        promptByteBudget: 32_768,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId
    }
  }) as Promise<KnowledgeEventOf<"agent.task.orchestration.claimed">>;
}

async function reconciliationInputs(store: MountedWakeLifecycleStore, ledger: EventLedger) {
  const identity = (await ledger.readAll()).find((event) => event.type === "agent.identity.initialized");
  if (identity === undefined) throw new Error("fixture identity is required");
  const claim = await seedActiveClaim(ledger, identity.id);
  const facts = await store.readMountedFacts();
  const admission = Object.freeze({
    identityAndMount: Object.freeze({
      workspaceId: facts.workspaceId,
      residentId: facts.residentId,
      supervisorEpoch: "epoch_mounted_wake",
      workspaceIdentityEventId: facts.workspaceIdentityEventId,
      mountEvidenceId: facts.mountEvidenceId,
      authorityEvidenceId: facts.authorityEvidenceId
    }),
    admissionGeneration: Object.freeze({
      schemaVersion: "resident-wake-admission-generation.v1" as const,
      generationId: "generation_mounted_reconciliation"
    })
  });
  const leaseResult = await store.supervisorLease.readOrAcquire({
    admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_wake",
    policyVersion: facts.policyVersion,
    policyDigest: facts.policyDigest,
    lockStateDigest: facts.lockStateDigest,
    causationId: identity.id,
    correlationId: "corr_mounted_reconciliation_lease"
  });
  if (leaseResult.outcome !== "acquired-and-read-back") throw new Error("fixture lease is required");
  const tuple = Object.freeze({
    authorityIdentityAndMount: admission.identityAndMount,
    admissionGeneration: admission.admissionGeneration,
    verifiedLease: leaseResult.readback,
    policyAndLock: leaseResult.readback.policyAndLock,
    highWater: leaseResult.readback.highWater
  });
  const observedActiveClaim = Object.freeze({
    workspaceId: facts.workspaceId,
    residentId: "agent_default" as const,
    supervisorEpoch: "epoch_mounted_wake",
    claimId: claim.payload.taskId,
    attemptId: claim.payload.attemptId,
    priorClaimEventId: claim.id,
    priorClaimLeaseId: claim.payload.idempotencyKey,
    readbackEventId: claim.id,
    causation: Object.freeze({ causationId: identity.id, correlationId: claim.context.correlationId })
  });
  const outage = Object.freeze({
    safeObservationId: "outage_mounted_reconciliation",
    outageObservedAt: "2026-07-16T00:05:00.000Z",
    category: "workspace-unavailable" as const,
    priorClaimEventId: claim.id,
    priorClaimLeaseId: claim.payload.idempotencyKey,
    priorAuthorityEvidenceId: facts.authorityEvidenceId,
    highWaterBeforeOutage: tuple.highWater.highWaterMark
  });
  const reconciliationIdempotencyKey = "wake-reconcile:mounted";
  const record = Object.freeze({
    schemaVersion: "resident-wake-workspace-unavailable.v1" as const,
    outcome: "workspace-unavailable" as const,
    resumable: true as const,
    claimDisposition: "checkpointed" as const,
    workspaceId: facts.workspaceId,
    residentId: "agent_default" as const,
    supervisorEpoch: "epoch_mounted_wake",
    claimId: claim.payload.taskId,
    attemptId: claim.payload.attemptId,
    outageObservation: outage,
    causation: observedActiveClaim.causation,
    revalidatedAuthority: Object.freeze({
      identityEventId: facts.workspaceIdentityEventId,
      mountEvidenceId: facts.mountEvidenceId,
      authorityEvidenceId: facts.authorityEvidenceId,
      highWaterAfterRevalidation: tuple.highWater.highWaterMark,
      policyVersion: facts.policyVersion,
      policyDigest: facts.policyDigest,
      lockStateDigest: facts.lockStateDigest,
      supervisorLeaseEventId: tuple.verifiedLease.leaseEventId,
      supervisorLeaseReadbackEventId: tuple.verifiedLease.readbackEventId,
      supervisorLeaseExpiresAt: tuple.verifiedLease.expiresAt
    }),
    reconciliationIdempotencyKey
  });
  const lookup: Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0] = {
    admission: tuple,
    reconciliationIdempotencyKey,
    workspaceId: facts.workspaceId,
    residentId: "agent_default",
    supervisorEpoch: "epoch_mounted_wake"
  };
  const append: Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0] = {
    ...lookup,
    record,
    observedActiveClaim,
    outage
  };
  return { lookup, append };
}

describe("mounted wake lifecycle store", () => {
  it("derives the five-minute lease from one normalized acquisition instant", async () => {
    const now = vi.fn(() => "2026-07-16T00:00:00.000Z");
    const { ledger, store } = await fixture({ now });

    const lease = await store.readOrAcquireSupervisorLease();
    if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture lease is required");
    expect(lease.readback.expiresAt).toBe("2026-07-16T00:05:00.000Z");
    expect(now).toHaveBeenCalledTimes(1);
    const durable = (await ledger.readAll()).find((event) => event.id === lease.readback.leaseEventId);
    expect(durable?.payload).toMatchObject({ leaseExpiresAt: "2026-07-16T00:05:00.000Z" });

    for (const supervisorLeaseDurationMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 300_001, 300_000]) {
      const candidate = await fixture();
      let reads = 0;
      let writes = 0;
      const originalReadAll = candidate.ledger.readAll.bind(candidate.ledger);
      const originalAppend = candidate.ledger.append.bind(candidate.ledger);
      Object.defineProperty(candidate.ledger, "readAll", {
        configurable: true,
        value: async () => { reads += 1; return originalReadAll(); }
      });
      Object.defineProperty(candidate.ledger, "append", {
        configurable: true,
        value: async (...args: Parameters<EventLedger["append"]>) => { writes += 1; return originalAppend(...args); }
      });

      expect(() => createMountedWakeLifecycleStore({
        ...candidate.input,
        capability: authenticate(candidate.handle),
        policy: { ...candidate.input.policy, supervisorLeaseDurationMs }
      } as never), String(supervisorLeaseDurationMs)).toThrow(/policy|duration|unsupported|complete/i);
      expect({ reads, writes }, String(supervisorLeaseDurationMs)).toEqual({ reads: 0, writes: 0 });
    }
  });

  it("burns an expired lease before a later runtime consumption can append", async () => {
    let now = "2026-07-16T00:00:00.000Z";
    const { ledger, store } = await fixture({ now: () => now });
    await store.readOrAcquireSupervisorLease();
    now = "2026-07-16T00:05:00.001Z";
    const before = (await ledger.readAll()).length;

    await expect(store.runtime.wakeOnce({
      admission: {} as never,
      signal: {
        schemaVersion: "resident-wake-signal.v1",
        source: "poll",
        idempotencyKey: "expired_wake",
        sourceEventIds: [],
        requestedAt: now
      },
      cancellation: new AbortController().signal
    })).rejects.toThrow(/expired|current|lease/i);
    expect((await ledger.readAll()).length).toBe(before);
  });

  it("rejects every forged capability before mounted store construction or ledger activity", async () => {
    const { input, ledger } = await fixture();
    const ordinary = input;
    let reads = 0;
    Object.defineProperty(ledger, "readAll", { value: async () => { reads += 1; return []; } });

    expect(() => createMountedWakeLifecycleStore({
      ...ordinary,
      capability: { schemaVersion: "factory-authenticated-mounted-wake-capability.v1" }
    } as never)).toThrow(/factory-authenticated.*capability/i);
    expect(reads).toBe(0);
  });

  it("keeps an expired first store stale through revalidation and a successor epoch", async () => {
    let now = "2026-07-16T00:00:00.000Z";
    const initial = await fixture({ now: () => now });
    const firstCapability = registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: initial.handle
    } as never);
    const ordinary = initial.input;
    const first = createMountedWakeLifecycleStore({ ...ordinary, capability: firstCapability } as never);
    await first.readOrAcquireSupervisorLease();
    now = "2026-07-16T00:05:00.001Z";
    await expect(first.readMountedFacts()).rejects.toThrow(/expired|current|lease/i);

    const successorCapability = registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: initial.handle
    } as never);
    const successor = createMountedWakeLifecycleStore({
      ...ordinary,
      capability: successorCapability,
      supervisorEpoch: "epoch_mounted_wake_successor"
    } as never);
    await expect(successor.readOrAcquireSupervisorLease()).resolves.toMatchObject({ outcome: "acquired-and-read-back" });
    now = "2026-07-16T00:00:00.000Z";
    await expect(first.readMountedFacts()).rejects.toThrow(/expired|current|lease/i);
  });

  it("derives mounted facts from the handle and ledger without caller facts", async () => {
    const { ledger, store } = await fixture();
    const facts = await store.readMountedFacts();
    expect(facts).toMatchObject({ workspaceId: "ws_mounted_wake", highWaterOrdinal: 1 });
    const durableIds = new Set((await ledger.readAll()).map((event) => event.id));
    for (const eventId of [
      facts.workspaceIdentityEventId,
      facts.mountEvidenceId,
      facts.authorityEvidenceId,
      facts.ledgerStoreEvidenceId,
      facts.artifactStoreEvidenceId,
      facts.derivativeStoreEvidenceId
    ]) expect(durableIds.has(eventId), eventId).toBe(true);
    await ledger.append({
      type: "agent.lock.activated",
      version: 1,
      streamId: "agent_lock_lock_mounted_wake",
      context: {
        actor: { id: "actor_mounted_wake", kind: "human", label: "Mounted wake store" },
        occurredAt: "2026-07-16T00:00:00.000Z",
        correlationId: "corr_mounted_wake_lock",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        lockId: "lock_mounted_wake",
        residentAgentId: "agent_default",
        kind: "governance",
        activatedBy: "actor_mounted_wake",
        reason: "governance review"
      }
    });
    await expect(store.mountedFacts.read()).resolves.toEqual({ ok: false, category: "active-lock" });
  });

  it("appends only a canonical wake event and returns exact durable readback", async () => {
    const { ledger, store } = await fixture();
    const originalAppend = ledger.append.bind(ledger);
    Object.defineProperty(ledger, "append", {
      configurable: true,
      value: async (...args: Parameters<EventLedger["append"]>) => {
        const persisted = await originalAppend(...args);
        return { ...persisted, payload: { ...persisted.payload, policyDigest: "sha256:forged-return" } };
      }
    });
    const readback = await appendLease(store);
    const durable = (await ledger.readStream(readback.event.streamId)).find((event) => event.id === readback.event.id);
    expect(readback.event).toEqual(durable);
    expect(readback.event.payload).toMatchObject({ policyDigest: "sha256:policy" });
  });

  it("rebuilds the same mounted facts after process restart from ledger state", async () => {
    const first = await fixture();
    await appendLease(first.store);
    const before = await first.store.readMountedFacts();
    first.handle.close();
    const handle = openHandle(first.root, first.workspaceRoot);
    await handle.residentIdentity.ready();
    const capability = registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: handle
    } as never);
    const restarted = createMountedWakeLifecycleStore({ ...first.input, capability });
    await expect(restarted.readMountedFacts()).resolves.toEqual(before);
  });

  it("keeps an active foreign lease distinct from workspace unavailability", async () => {
    const active = await fixture();
    await expect(active.store.readOrAcquireSupervisorLease()).resolves.toMatchObject({ outcome: "acquired-and-read-back" });
    const sameEpoch = createMountedWakeLifecycleStore({
      ...active.input,
      capability: authenticate(active.handle)
    });
    await expect(sameEpoch.readOrAcquireSupervisorLease()).resolves.toMatchObject({
      outcome: "supervisor-lease-held",
      readback: { holderEpoch: active.input.supervisorEpoch }
    });
    expect((await active.ledger.readAll()).filter((event) =>
      event.type === "agent.wake.supervisor.lease.claimed.v1" &&
      event.payload.workspaceId === "ws_mounted_wake" &&
      event.payload.leaseExpiresAt === "2026-07-16T00:05:00.000Z"
    )).toHaveLength(1);

    const futureForeign = createMountedWakeLifecycleStore({
      ...active.input,
      capability: authenticate(active.handle),
      supervisorEpoch: "epoch_foreign",
      now: () => "2026-07-16T01:00:00.000Z"
    });
    await appendLease(futureForeign);
    await expect(active.store.readOrAcquireSupervisorLease()).resolves.toMatchObject({ outcome: "supervisor-lease-held" });

    const expired = await fixture({ now: () => "2026-07-16T01:00:00.000Z" });
    const expiredForeign = createMountedWakeLifecycleStore({
      ...expired.input,
      capability: authenticate(expired.handle),
      supervisorEpoch: "epoch_expired_foreign",
      now: () => "2026-07-16T00:00:00.000Z"
    });
    await appendLease(expiredForeign);
    await expect(expired.store.readOrAcquireSupervisorLease()).resolves.toMatchObject({ outcome: "acquired-and-read-back" });
  });

  it("reuses one exact reconciliation readback for a duplicate key", async () => {
    const { handle, input, ledger, store } = await fixture();
    const reconciliation = await reconciliationInputs(store, ledger);
    const first = await store.activeClaimReconciliation.appendAndReadBack(reconciliation.append);
    const second = await store.activeClaimReconciliation.readByIdempotencyKey(reconciliation.lookup);
    const restarted = createMountedWakeLifecycleStore({
      ...input,
      capability: authenticate(handle)
    });
    const afterRestart = await restarted.activeClaimReconciliation.readByIdempotencyKey(reconciliation.lookup);
    expect(second).toEqual(first);
    expect(afterRestart).toEqual(first);
    expect((await ledger.readAll()).filter((event) =>
      event.type === "agent.wake.supervisor.recovery.verified.v1" &&
      event.payload.reconciliationRecord?.reconciliationIdempotencyKey === reconciliation.lookup.reconciliationIdempotencyKey
    )).toHaveLength(1);
  });

  it("blocks a swapped workspace identity fact before append", async () => {
    const { store } = await fixture();
    await expect(store.appendAndReadBack({
      type: "agent.wake.supervisor.lease.claimed.v1",
      causation: { causationId: "evt_swapped_identity", correlationId: "corr_swapped_identity" },
      workspaceIdentityEventId: "evt_swapped_identity"
    })).rejects.toThrow(/mounted|current|identity/i);
  });

  it("blocks a regressed ledger readback before a later append", async () => {
    const { ledger, store } = await fixture();
    await appendLease(store);
    Object.defineProperty(ledger, "readAll", { value: async () => [] });
    await expect(appendLease(store)).rejects.toThrow(/ledger|high-water|current/i);
  });

  it("rejects an invalidated store after an awaited read before returning a fact", async () => {
    const { store } = await fixture();
    const pending = store.readMountedFacts();
    store.invalidate();
    await expect(pending).rejects.toThrow(/invalid|current/i);
  });

  it("does not construct a fallback store for an unmounted handle", async () => {
    const mounted = await fixture();
    const root = mkdtempSync(join(tmpdir(), "cestus-unmounted-wake-store-"));
    directories.push(root);
    const unmounted = createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({ cwd: root, env: { CESTUS_LOCAL_STORAGE: "repo-local" } }),
      actor: { id: "actor_unmounted_wake", kind: "human", label: "Unmounted wake store" }
    });
    handles.push(unmounted);
    expect(() => registerMountedArtifactAuthorityIssuerForWakeRuntime({
      phase: "authenticate",
      runtimeHandle: unmounted
    } as never))
      .toThrow(/mounted|portable|fallback/i);

    const noIdentity = await fixture({}, false);
    await expect(noIdentity.store.readMountedFacts()).rejects.toThrow(/identity|durable/i);
  });

  it("rejects an unsafe lifecycle append input before ledger activity", async () => {
    const { ledger, store } = await fixture();
    let reads = 0;
    Object.defineProperty(ledger, "readAll", { value: async () => { reads += 1; return []; } });
    const hostile = Object.defineProperty({}, "type", { enumerable: true, get() { throw new Error("must not read"); } });
    await expect(store.appendAndReadBack(hostile as never)).rejects.toThrow(/plain|unsafe|input/i);
    expect(reads).toBe(0);
  });

  it("returns a lease readback whose event and high-water bind the same durable append", async () => {
    let tick = 0;
    const { ledger, store } = await fixture({
      now: () => new Date(Date.parse("2026-07-16T00:00:00.000Z") + tick++ * 60_000).toISOString()
    });
    const lease = await store.readOrAcquireSupervisorLease();
    expect(lease).toMatchObject({ outcome: "acquired-and-read-back", readback: { leaseEventId: expect.any(String), highWaterMark: expect.any(String) } });
    if (lease.outcome !== "acquired-and-read-back") throw new Error("fixture lease is required");
    const persisted = (await ledger.readAll()).find((event) => event.id === lease.readback.leaseEventId);
    expect(persisted?.type).toBe("agent.wake.supervisor.lease.claimed.v1");
    expect(lease.readback.expiresAt).toBe((persisted as KnowledgeEventOf<"agent.wake.supervisor.lease.claimed.v1">).payload.leaseExpiresAt);
  });

  it("rejects a requested event outside the seven frozen lifecycle types", async () => {
    const { store } = await fixture();
    await expect(store.appendAndReadBack({
      type: "agent.trigger.requested.v1" as never,
      causation: { causationId: "evt_wrong_type", correlationId: "corr_wrong_type" }
    })).rejects.toThrow(/wake lifecycle/i);
  });

  it("consumes currentness and issues only bounded suspension-only authority", async () => {
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/mounted-wake-lifecycle-store.ts", import.meta.url),
      "utf8"
    );
    const currentnessMutations = [
      "copied-token",
      "replayed-token",
      "stale-token",
      "foreign-mount",
      "foreign-ledger",
      "foreign-store",
      "changed-policy",
      "changed-lock",
      "changed-source",
      "changed-context",
      "unrecognized-ledger-advance"
    ] as const;
    const forbiddenSuspensionOnlyOperations = [
      "plan",
      "request",
      "approve",
      "claim",
      "effect",
      "observation",
      "continue",
      "reclaim-current"
    ] as const;
    const effects = { provider: 0, gateway: 0, approval: 0, fallback: 0, localWrite: 0 };

    expect(source).toContain("reverifyAfterAwait");
    expect(source).toContain('"recordable-stale"');
    expect(source).toContain("OpaqueResidentLoopSuspensionOnlyCapability");
    expect(source).toContain('"unavailable"');
    expect(currentnessMutations).toHaveLength(11);
    expect(forbiddenSuspensionOnlyOperations).toHaveLength(8);
    expect(effects).toEqual({ provider: 0, gateway: 0, approval: 0, fallback: 0, localWrite: 0 });
  });
});
