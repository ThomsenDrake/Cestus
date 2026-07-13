import { describe, expect, it } from "vitest";
import {
  createWakeSupervisor,
  parseWakeHealthDiagnostic,
  parseWakeSignal,
  type ActiveClaimReconciliationPort,
  type CreateWakeSupervisorInput,
  type SupervisorLeaseReadbackEvidence,
  type SupervisorLeaseAdmissionInput,
  type WakeCommandInput,
  type WakeLifecycleEvidenceDto,
  type WakeSignal
} from "../src/wake-supervisor.js";

describe("bounded wake supervisor", () => {
  it("runs start, pause, resume, recover, and stop through typed immutable lifecycle boundaries", async () => {
    const harness = createHarness();
    const supervisor = createWakeSupervisor(harness.input);

    await expect(supervisor.start()).resolves.toMatchObject({ schemaVersion: "resident-wake-command-result.v1", outcome: "accepted" });
    await expect(supervisor.pause(command("pause_1"))).resolves.toMatchObject({ outcome: "completed", evidence: [{ schemaVersion: "resident-wake-evidence.v1", transition: "paused" }] });
    await expect(supervisor.resume(command("resume_1"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(supervisor.recover(command("recover_1"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(supervisor.stop()).resolves.toBeUndefined();

    expect(harness.operations).toEqual(["wake", "resume", "recovery"]);
    expect(harness.traces).toContain("authority.invalidate:shutdown");
    await expect(supervisor.signal(signal("late"))).resolves.toMatchObject({ outcome: "blocked", blocked: { category: "workspace-unavailable" } });
  });

  it("uses exactly one admission and matching full reconciliation readback before recovery wake", async () => {
    const harness = createHarness({ activeClaim: true });
    const supervisor = createWakeSupervisor(harness.input);

    await expect(supervisor.resume(command("resume_reconcile"))).resolves.toMatchObject({ outcome: "accepted" });

    expect(harness.operations).toEqual(["resume"]);
    expect(harness.leaseInputs).toHaveLength(1);
    expect(harness.reconciliationLookupInputs).toHaveLength(1);
    expect(harness.reconciliationAppendInputs).toHaveLength(1);
    expect(harness.reconciliationAppendInputs[0]?.admission).toEqual(harness.reconciliationLookupInputs[0]?.admission);
    expect(harness.runtimeCalls).toHaveLength(1);
  });

  it.each(["workspaceIdentityEventId", "mountEvidenceId", "authorityEvidenceId", "policyDigest", "lockStateDigest", "highWaterMark"])("fails closed without a runtime call when %s is substituted in the lease readback", async (field) => {
    const harness = createHarness({ mutateLease: field });
    const supervisor = createWakeSupervisor(harness.input);

    await expect(supervisor.resume(command("resume_mismatch"))).resolves.toMatchObject({ outcome: "blocked", blocked: { category: "workspace-readback-failed" } });
    expect(harness.runtimeCalls).toHaveLength(0);
    expect(harness.reconciliationAppendInputs).toHaveLength(0);
  });

  it("treats an active competing lease as available but performs no wake or reconciliation", async () => {
    const harness = createHarness({ heldLease: true });
    const supervisor = createWakeSupervisor(harness.input);

    await expect(supervisor.signal(signal("held"))).resolves.toMatchObject({ outcome: "blocked", status: { workspaceState: "available", diagnostics: [{ category: "supervisor-lease-held" }] } });
    expect(harness.runtimeCalls).toHaveLength(0);
    expect(harness.reconciliationAppendInputs).toHaveLength(0);
  });

  it("reaches the exact recovery limit and requires a later explicit revalidation", async () => {
    const harness = createHarness({ runtimeFailure: true, maximumRecoveryAttempts: 2 });
    const supervisor = createWakeSupervisor(harness.input);

    await expect(supervisor.recover(command("recover_one"))).resolves.toMatchObject({ outcome: "blocked", status: { supervisorState: "degraded" } });
    await expect(supervisor.recover(command("recover_two"))).resolves.toMatchObject({ outcome: "blocked", status: { supervisorState: "unrecoverable", workspaceState: "unrecoverable" }, blocked: { category: "recovery-exhausted" } });
    expect(harness.operations).toEqual(["recovery", "recovery"]);
    expect(harness.runtimeCalls).toHaveLength(2);
  });

  it("closes intake, aborts the in-flight wake, cancels local sources, and never starts a later effect", async () => {
    const harness = createHarness({ hangingRuntime: true });
    const supervisor = createWakeSupervisor(harness.input);
    const running = supervisor.signal(signal("before_stop"));
    await waitFor(() => harness.runtimeCalls.length === 1);

    await supervisor.stop();
    await expect(running).resolves.toMatchObject({ outcome: "blocked" });
    await expect(supervisor.signal(signal("after_stop"))).resolves.toMatchObject({ outcome: "blocked" });
    expect(harness.traces).toEqual(expect.arrayContaining(["timer.cancel", "signal.cancel", "authority.invalidate:shutdown", "runtime.abort"]));
    expect(harness.runtimeCalls).toHaveLength(1);
  });

  it("rejects hostile signal and diagnostic DTOs before getters execute", () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, "source", { enumerable: true, get() { getterCalls += 1; throw new Error("must not run"); } });
    expect(() => parseWakeSignal(hostile)).toThrow();
    expect(() => parseWakeHealthDiagnostic(Object.defineProperty({}, "category", { enumerable: true, get() { getterCalls += 1; throw new Error("must not run"); } }))).toThrow();
    expect(getterCalls).toBe(0);
  });

  it("rejects public DTO omissions, unknown keys, sparse arrays, and non-versioned inputs", () => {
    expect(() => parseWakeSignal({ source: "event", idempotencyKey: "missing", sourceEventIds: [], requestedAt: "2026-07-12T00:00:00.000Z" })).toThrow();
    expect(() => parseWakeSignal({ ...signal("unknown"), extra: "not-allowed" })).toThrow();
    const sparse: string[] = [];
    sparse[1] = "evt";
    expect(() => parseWakeSignal({ ...signal("sparse"), sourceEventIds: sparse })).toThrow();
  });
});

function signal(idempotencyKey: string): WakeSignal {
  return { schemaVersion: "resident-wake-signal.v1", source: "event", idempotencyKey, sourceEventIds: ["evt_source_a"], requestedAt: "2026-07-12T00:00:00.000Z" };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("deterministic harness did not reach its expected boundary.");
}

function command(commandId: string): WakeCommandInput {
  return { schemaVersion: "resident-wake-command.v1", commandId, sourceEventIds: ["evt_command_a"], requestedAt: "2026-07-12T00:00:00.000Z", causation: { causationId: `cause:${commandId}`, correlationId: `corr:${commandId}` } };
}

function lifecycleEvidence(input: { readonly command: WakeCommandInput; readonly epoch: string }): WakeLifecycleEvidenceDto {
  return { schemaVersion: "resident-wake-evidence.v1", transition: "paused", workspaceId: "workspace_a", residentId: "agent_default", supervisorEpoch: input.epoch, policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", highWaterMark: "event:42", causation: input.command.causation, lifecycleEventId: "evt_pause", readbackEventId: "evt_pause_readback" };
}

function createHarness(options: { activeClaim?: boolean; heldLease?: boolean; mutateLease?: string; runtimeFailure?: boolean; hangingRuntime?: boolean; maximumRecoveryAttempts?: number } = {}) {
  const epoch = "epoch_a";
  const traces: string[] = [];
  const operations: string[] = [];
  const leaseInputs: SupervisorLeaseAdmissionInput[] = [];
  const runtimeCalls: string[] = [];
  const reconciliationLookupInputs: Array<Parameters<ActiveClaimReconciliationPort["readByIdempotencyKey"]>[0]> = [];
  const reconciliationAppendInputs: Array<Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]> = [];
  const identity = { workspaceId: "workspace_a", residentId: "agent_default" as const, supervisorEpoch: epoch, workspaceIdentityEventId: "evt_identity_a", mountEvidenceId: "evt_mount_a", authorityEvidenceId: "evt_authority_a" };

  const reconciliation: ActiveClaimReconciliationPort = {
    async readByIdempotencyKey(input) { reconciliationLookupInputs.push(input); return undefined; },
    async appendAndReadBack(input) { reconciliationAppendInputs.push(input); return { record: input.record, reconciliationEventId: "evt_reconciliation", readbackEventId: "evt_reconciliation_readback", admission: input.admission }; }
  };

  const input: CreateWakeSupervisorInput = {
    residentId: "agent_default", supervisorEpoch: epoch, workspaceId: "workspace_a", policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a",
    authority: {
      async revalidate(request) {
        operations.push(request.operation);
        const activeClaim = options.activeClaim ? { workspaceId: "workspace_a", residentId: "agent_default" as const, supervisorEpoch: epoch, claimId: "claim_a", attemptId: "attempt_a", priorClaimEventId: "evt_claim", priorClaimLeaseId: "lease_claim", readbackEventId: "evt_claim_readback", causation: { causationId: "cause:prior", correlationId: "corr:prior" } } : undefined;
        const outage = options.activeClaim ? { safeObservationId: "obs_outage", outageObservedAt: "2026-07-12T00:00:00.000Z", category: "workspace-unavailable" as const, priorAuthorityEvidenceId: "evt_authority_a", highWaterBeforeOutage: "event:42" } : undefined;
        if (activeClaim === undefined || outage === undefined) return { ok: true as const, admission: { identityAndMount: identity } };
        return { ok: true as const, admission: { identityAndMount: identity }, observedActiveClaim: activeClaim, outage };
      },
      invalidate(reason) { traces.push(`authority.invalidate:${reason}`); }
    },
    lease: {
      async readOrAcquire(admission) {
        leaseInputs.push(admission);
        if (options.heldLease) return { outcome: "supervisor-lease-held", readback: { schemaVersion: "resident-supervisor-lease-held.v1", workspaceId: "workspace_a", residentId: "agent_default", holderEpoch: "epoch_other", leaseEventId: "evt_held", readbackEventId: "evt_held_readback", expiresAt: "2026-07-12T01:00:00.000Z" } };
        const readback: SupervisorLeaseReadbackEvidence = { schemaVersion: "resident-supervisor-lease-readback.v1", ...identity, policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", highWaterMark: "event:42", leaseEventId: "evt_lease_a", readbackEventId: "evt_lease_readback_a", expiresAt: "2026-07-12T01:00:00.000Z", causation: { causationId: admission.causationId, correlationId: admission.correlationId }, policyAndLock: { authorityEvidenceId: "evt_authority_a", mountEvidenceId: "evt_mount_a", leaseEventId: "evt_lease_a", leaseReadbackEventId: "evt_lease_readback_a", policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", readbackEventId: "evt_policy_lock_readback" }, highWater: { authorityEvidenceId: "evt_authority_a", mountEvidenceId: "evt_mount_a", leaseEventId: "evt_lease_a", leaseReadbackEventId: "evt_lease_readback_a", highWaterMark: "event:42", readbackEventId: "evt_high_water_readback" } };
        if (options.mutateLease !== undefined) (readback as unknown as Record<string, unknown>)[options.mutateLease] = "substituted";
        return { outcome: "acquired-and-read-back", readback };
      }
    },
    reconciliation,
    runtime: {
      async wakeOnce({ cancellation }) {
        runtimeCalls.push("runtime.wakeOnce");
        if (options.runtimeFailure) throw new Error("scheduler unavailable");
        if (options.hangingRuntime) await new Promise<void>((resolve) => cancellation.addEventListener("abort", () => { traces.push("runtime.abort"); resolve(); }, { once: true }));
        return { outcome: "accepted" };
      }
    },
    lifecycle: { async pauseAndReadBack({ command }) { return { ok: true, evidence: lifecycleEvidence({ command, epoch }) }; } },
    ...(options.maximumRecoveryAttempts === undefined ? {} : { maximumRecoveryAttempts: options.maximumRecoveryAttempts }),
    now: () => "2026-07-12T00:00:00.000Z",
    cancelTimer: () => traces.push("timer.cancel"),
    cancelSignalSource: () => traces.push("signal.cancel")
  };
  return { input, traces, operations, leaseInputs, runtimeCalls, reconciliationLookupInputs, reconciliationAppendInputs };
}
