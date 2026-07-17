import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import {
  createMountedWakeLifecycleStore,
  type MountedWakeLifecycleStore,
  type MountedWakeLifecycleStoreInput
} from "../src/mounted-wake-lifecycle-store.js";
import type { LocalRuntimeHandle } from "../src/runtime-factory.js";

function fixture(overrides: Partial<MountedWakeLifecycleStoreInput> = {}) {
  const ledger = new InMemoryEventLedger();
  const handle = {
    ledger,
    mountedWorkspace: {
      workspaceId: "ws_mounted_wake",
      rootDir: "/tmp/ws_mounted_wake",
      manifestPath: "/tmp/ws_mounted_wake/workspace.json",
      paths: {
        ledgerPath: "/tmp/ws_mounted_wake/ledger.sqlite",
        blobRoot: "/tmp/ws_mounted_wake/blobs",
        derivativeRoot: "/tmp/ws_mounted_wake/derivatives",
        jobRoot: "/tmp/ws_mounted_wake/jobs",
        projectionRoot: "/tmp/ws_mounted_wake/projections",
        cacheRoot: "/tmp/ws_mounted_wake/cache",
        configRoot: "/tmp/ws_mounted_wake/config"
      }
    }
  } as unknown as LocalRuntimeHandle;
  const input: MountedWakeLifecycleStoreInput = {
    runtimeHandle: handle,
    actor: { id: "agent_mounted_wake", kind: "agent", label: "Mounted wake store" },
    supervisorEpoch: "epoch_mounted_wake",
    policy: { policyVersion: "policy.v1", policyDigest: "sha256:policy", lockStateDigest: "sha256:lock" },
    now: () => "2026-07-16T00:00:00.000Z",
    createSafeId: (kind) => `${kind}_mounted_wake`,
    ...overrides
  };
  return { ledger, handle, input, store: createMountedWakeLifecycleStore(input) };
}

async function appendLease(store: MountedWakeLifecycleStore) {
  return store.appendAndReadBack({
    type: "agent.wake.supervisor.lease.claimed.v1",
    causation: { causationId: "evt_mounted_wake_cause", correlationId: "corr_mounted_wake" }
  });
}

describe("mounted wake lifecycle store", () => {
  it("derives mounted facts from the handle and ledger without caller facts", async () => {
    const { store } = fixture();
    await expect(store.readMountedFacts()).resolves.toMatchObject({ workspaceId: "ws_mounted_wake", highWaterOrdinal: 0 });
  });

  it("appends only a canonical wake event and returns exact durable readback", async () => {
    const { ledger, store } = fixture();
    const readback = await appendLease(store);
    expect(readback.event).toEqual((await ledger.readStream(readback.event.streamId))[0]);
  });

  it("rebuilds the same mounted facts after process restart from ledger state", async () => {
    const first = fixture();
    await appendLease(first.store);
    const restarted = createMountedWakeLifecycleStore({ ...first.input });
    await expect(restarted.readMountedFacts()).resolves.toMatchObject({ highWaterOrdinal: 1, highWaterMark: expect.any(String) });
  });

  it("keeps an active foreign lease distinct from workspace unavailability", async () => {
    const { store } = fixture();
    await store.appendAndReadBack({
      type: "agent.wake.supervisor.lease.claimed.v1",
      causation: { causationId: "evt_foreign_lease", correlationId: "corr_foreign_lease" },
      supervisorEpoch: "epoch_foreign"
    });
    await expect(store.readOrAcquireSupervisorLease()).resolves.toMatchObject({ outcome: "supervisor-lease-held" });
  });

  it("reuses one exact reconciliation readback for a duplicate key", async () => {
    const { store } = fixture();
    const first = await store.readOrAppendReconciliation("wake-reconcile:mounted");
    const second = await store.readOrAppendReconciliation("wake-reconcile:mounted");
    expect(second).toEqual(first);
  });

  it("blocks a swapped workspace identity fact before append", async () => {
    const { store } = fixture();
    await expect(store.appendAndReadBack({
      type: "agent.wake.supervisor.lease.claimed.v1",
      causation: { causationId: "evt_swapped_identity", correlationId: "corr_swapped_identity" },
      workspaceIdentityEventId: "evt_swapped_identity"
    })).rejects.toThrow(/mounted|current|identity/i);
  });

  it("blocks a regressed ledger readback before a later append", async () => {
    const { ledger, store } = fixture();
    await appendLease(store);
    const originalReadAll = ledger.readAll.bind(ledger);
    Object.defineProperty(ledger, "readAll", { value: async () => (await originalReadAll()).slice(0, 0) });
    await expect(appendLease(store)).rejects.toThrow(/ledger|high-water|current/i);
  });

  it("rejects an invalidated store after an awaited read before returning a fact", async () => {
    const { store } = fixture();
    const pending = store.readMountedFacts();
    store.invalidate();
    await expect(pending).rejects.toThrow(/invalid|current/i);
  });

  it("does not construct a fallback store for an unmounted handle", () => {
    const { input } = fixture();
    expect(() => createMountedWakeLifecycleStore({ ...input, runtimeHandle: { ...input.runtimeHandle, mountedWorkspace: undefined } as LocalRuntimeHandle }))
      .toThrow(/mounted|fallback/i);
  });

  it("rejects an unsafe lifecycle append input before ledger activity", async () => {
    const { ledger, store } = fixture();
    let reads = 0;
    Object.defineProperty(ledger, "readAll", { value: async () => { reads += 1; return []; } });
    const hostile = Object.defineProperty({}, "type", { enumerable: true, get() { throw new Error("must not read"); } });
    await expect(store.appendAndReadBack(hostile as never)).rejects.toThrow(/plain|unsafe|input/i);
    expect(reads).toBe(0);
  });

  it("returns a lease readback whose event and high-water bind the same durable append", async () => {
    const { store } = fixture();
    const lease = await store.readOrAcquireSupervisorLease();
    expect(lease).toMatchObject({ outcome: "acquired-and-read-back", readback: { leaseEventId: expect.any(String), highWaterMark: expect.any(String) } });
  });

  it("rejects a requested event outside the seven frozen lifecycle types", async () => {
    const { store } = fixture();
    await expect(store.appendAndReadBack({
      type: "agent.trigger.requested.v1" as never,
      causation: { causationId: "evt_wrong_type", correlationId: "corr_wrong_type" }
    })).rejects.toThrow(/wake lifecycle/i);
  });

});
