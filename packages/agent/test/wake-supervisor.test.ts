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
  it("allows fresh resume and recovery admission after a completed pause", async () => {
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

  it("binds the canonical reconciliation record and key to the exact outage, prior claim, and revalidated authority", async () => {
    const first = createP1Harness({ activeClaim: true });
    const changedObservation = createP1Harness({ activeClaim: true, outageObservationId: "obs_outage_changed" });
    const changedPriorClaim = createP1Harness({ activeClaim: true, priorClaimEventId: "evt_claim_changed" });

    await expect(first.supervisor.resume(command("resume_canonical_first"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(changedObservation.supervisor.resume(command("resume_canonical_observation"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(changedPriorClaim.supervisor.resume(command("resume_canonical_prior"))).resolves.toMatchObject({ outcome: "accepted" });

    const firstRecord = first.reconciliationAppendInputs[0]?.record as unknown as Record<string, unknown>;
    const changedObservationRecord = changedObservation.reconciliationAppendInputs[0]?.record as unknown as Record<string, unknown>;
    const changedPriorClaimRecord = changedPriorClaim.reconciliationAppendInputs[0]?.record as unknown as Record<string, unknown>;
    expect(firstRecord).toMatchObject({
      workspaceId: "workspace_a",
      supervisorEpoch: "epoch_a",
      claimId: "claim_a",
      attemptId: "attempt_a",
      outageObservation: expect.objectContaining({ safeObservationId: "obs_outage", priorClaimEventId: "evt_claim" }),
      revalidatedAuthority: expect.objectContaining({ authorityEvidenceId: "evt_authority_a", supervisorLeaseEventId: "evt_lease_a" })
    });
    expect(firstRecord.reconciliationIdempotencyKey).not.toBe(changedObservationRecord.reconciliationIdempotencyKey);
    expect(firstRecord.reconciliationIdempotencyKey).not.toBe(changedPriorClaimRecord.reconciliationIdempotencyKey);
  });

  it.each(["authority", "lease", "reconciliation"] as const)("halts the %s admission await after pause or stop, without a later reconciliation or wake", async (pendingAt) => {
    for (const close of ["pause", "stop"] as const) {
      const harness = createP1Harness({ activeClaim: true, pendingAt });
      const admission = harness.supervisor.resume(command(`resume_${close}_${pendingAt}`));
      await harness.waitUntilPending();

      if (close === "pause") await expect(harness.supervisor.pause(command(`pause_${pendingAt}`))).resolves.toMatchObject({ outcome: "completed" });
      else await harness.supervisor.stop();
      harness.releasePending();
      await expect(admission).resolves.toMatchObject({ outcome: "blocked" });

      expect(harness.runtimeCalls, `${close}/${pendingAt} runtime`).toHaveLength(0);
      expect(harness.reconciliationAppendInputs, `${close}/${pendingAt} reconciliation append`).toHaveLength(0);
      if (pendingAt === "authority") expect(harness.leaseInputs, `${close}/${pendingAt} lease`).toHaveLength(0);
      if (close === "pause") {
        await expect(harness.supervisor.resume(command(`late_resume_${pendingAt}`))).resolves.toMatchObject({ outcome: "accepted" });
        await expect(harness.supervisor.recover(command(`late_recover_${pendingAt}`))).resolves.toMatchObject({ outcome: "accepted" });
        expect(harness.runtimeCalls, `${close}/${pendingAt} fresh runtime`).toHaveLength(2);
      }
    }
  });

  it.each(["empty-high-water", "stale-high-water", "getter", "proxy-getter"] as const)("rejects %s lease readback as workspace-readback-failed without later effects", async (readbackKind) => {
    const harness = createP1Harness({ readbackKind });

    await expect(harness.supervisor.resume(command(`resume_${readbackKind}`))).resolves.toMatchObject({
      outcome: "blocked",
      blocked: { category: "workspace-readback-failed" }
    });
    expect(harness.getterReads, `${readbackKind} getter reads`).toBe(0);
    expect(harness.reconciliationAppendInputs, `${readbackKind} reconciliation append`).toHaveLength(0);
    expect(harness.runtimeCalls, `${readbackKind} runtime`).toHaveLength(0);
  });

  it("rejects a completed lifecycle result whose transition or high-water does not exactly bind the requested resume", async () => {
    const harness = createP1Harness({ completedRuntimeEvidence: { transition: "paused", highWaterMark: "event:41" } });

    await expect(harness.supervisor.resume(command("resume_stale_terminal"))).resolves.toMatchObject({
      outcome: "blocked",
      blocked: { category: "workspace-readback-failed" }
    });
    const correct = createP1Harness({ completedRuntimeEvidence: { transition: "resumed", highWaterMark: "event:42" } });
    await expect(correct.supervisor.resume(command("resume_exact_terminal"))).resolves.toMatchObject({
      outcome: "completed",
      requestedTransition: "resumed",
      status: {
        workspaceId: "workspace_a",
        supervisorEpoch: "epoch_a",
        lockStateDigest: "sha256:lock_a",
        highWaterMark: "event:42"
      },
      evidence: [{ transition: "resumed", workspaceId: "workspace_a", supervisorEpoch: "epoch_a", lockStateDigest: "sha256:lock_a", highWaterMark: "event:42" }]
    });
  });

  it("does not publish paused or completed when stop wins a pending pause readback", async () => {
    const harness = createP1Harness({ pendingAt: "pause-readback" });
    const pausing = harness.supervisor.pause(command("pause_before_stop"));
    await harness.waitUntilPending();

    await harness.supervisor.stop();
    harness.releasePending();

    await expect(pausing).resolves.toMatchObject({
      outcome: "blocked",
      evidence: [],
      status: { lifecycleEvidence: [] },
      blocked: { category: "supervisor-stopped" }
    });
  });

  it("consumes the recovery budget for repeated invalid reconciliation readbacks", async () => {
    const harness = createP1Harness({ activeClaim: true, invalidReconciliationReadback: true, maximumRecoveryAttempts: 2 });

    await expect(harness.supervisor.recover(command("recover_invalid_one"))).resolves.toMatchObject({
      outcome: "blocked",
      status: { recoveryAttempts: 1 },
      blocked: { category: "workspace-readback-failed" }
    });
    await expect(harness.supervisor.recover(command("recover_invalid_two"))).resolves.toMatchObject({
      outcome: "blocked",
      status: { recoveryAttempts: 2, supervisorState: "unrecoverable" },
      blocked: { category: "recovery-exhausted" }
    });
    expect(harness.runtimeCalls).toHaveLength(0);
  });

  it("keeps the canonical reconciliation key stable across lease/high-water renewal and uses active-claim causation", async () => {
    const first = createP1Harness({ activeClaim: true, leaseEventId: "evt_lease_first", highWaterMark: "event:42" });
    const renewed = createP1Harness({ activeClaim: true, leaseEventId: "evt_lease_renewed", highWaterMark: "event:43" });

    await expect(first.supervisor.recover(command("recover_first_lease"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(renewed.supervisor.recover(command("recover_renewed_lease"))).resolves.toMatchObject({ outcome: "accepted" });

    const firstRecord = first.reconciliationAppendInputs[0]?.record;
    const renewedRecord = renewed.reconciliationAppendInputs[0]?.record;
    const canonicalKey = `wake-reconcile:${JSON.stringify(["workspace_a", "epoch_a", "claim_a", "attempt_a", "obs_outage", "evt_claim"])}`;
    expect(firstRecord?.reconciliationIdempotencyKey).toBe(canonicalKey);
    expect(renewedRecord?.reconciliationIdempotencyKey).toBe(canonicalKey);
    expect(firstRecord?.causation).toEqual({ causationId: "cause:prior", correlationId: "corr:prior" });
    expect(renewedRecord?.causation).toEqual({ causationId: "cause:prior", correlationId: "corr:prior" });
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
    residentId: "agent_default", supervisorEpoch: epoch, workspaceId: "workspace_a", policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", expectedHighWaterMark: "event:42",
    authority: {
      async revalidate(request) {
        operations.push(request.operation);
        const activeClaim = options.activeClaim ? { workspaceId: "workspace_a", residentId: "agent_default" as const, supervisorEpoch: epoch, claimId: "claim_a", attemptId: "attempt_a", priorClaimEventId: "evt_claim", priorClaimLeaseId: "lease_claim", readbackEventId: "evt_claim_readback", causation: { causationId: "cause:prior", correlationId: "corr:prior" } } : undefined;
        const outage = options.activeClaim ? { safeObservationId: "obs_outage", outageObservedAt: "2026-07-12T00:00:00.000Z", category: "workspace-unavailable" as const, priorClaimEventId: "evt_claim", priorClaimLeaseId: "lease_claim", priorAuthorityEvidenceId: "evt_authority_a", highWaterBeforeOutage: "event:42" } : undefined;
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

type P1PendingAt = "authority" | "lease" | "reconciliation" | "pause-readback";
type P1ReadbackKind = "empty-high-water" | "stale-high-water" | "getter" | "proxy-getter";

function createP1Harness(options: {
  readonly activeClaim?: boolean;
  readonly outageObservationId?: string;
  readonly priorClaimEventId?: string;
  readonly pendingAt?: P1PendingAt;
  readonly readbackKind?: P1ReadbackKind;
  readonly invalidReconciliationReadback?: boolean;
  readonly maximumRecoveryAttempts?: number;
  readonly leaseEventId?: string;
  readonly highWaterMark?: string;
  readonly completedRuntimeEvidence?: { readonly transition: WakeLifecycleEvidenceDto["transition"]; readonly highWaterMark: string };
} = {}) {
  const epoch = "epoch_a";
  const leaseInputs: SupervisorLeaseAdmissionInput[] = [];
  const runtimeCalls: string[] = [];
  const reconciliationAppendInputs: Array<Parameters<ActiveClaimReconciliationPort["appendAndReadBack"]>[0]> = [];
  let getterReads = 0;
  let pendingResolve: (() => void) | undefined;
  let pendingReached = false;
  const pending = new Promise<void>((resolve) => { pendingResolve = resolve; });
  const expectedHighWaterMark = options.highWaterMark ?? "event:42";
  const leaseEventId = options.leaseEventId ?? "evt_lease_a";
  const identity = { workspaceId: "workspace_a", residentId: "agent_default" as const, supervisorEpoch: epoch, workspaceIdentityEventId: "evt_identity_a", mountEvidenceId: "evt_mount_a", authorityEvidenceId: "evt_authority_a" };
  const activeClaim = {
    workspaceId: "workspace_a", residentId: "agent_default" as const, supervisorEpoch: epoch,
    claimId: "claim_a", attemptId: "attempt_a", priorClaimEventId: options.priorClaimEventId ?? "evt_claim",
    priorClaimLeaseId: "lease_claim", readbackEventId: "evt_claim_readback", causation: { causationId: "cause:prior", correlationId: "corr:prior" }
  };
  const outage = {
    safeObservationId: options.outageObservationId ?? "obs_outage", outageObservedAt: "2026-07-12T00:00:00.000Z",
    category: "workspace-unavailable" as const, priorClaimEventId: activeClaim.priorClaimEventId, priorClaimLeaseId: activeClaim.priorClaimLeaseId, priorAuthorityEvidenceId: "evt_authority_a", highWaterBeforeOutage: "event:42"
  };
  const input: CreateWakeSupervisorInput = {
    residentId: "agent_default", supervisorEpoch: epoch, workspaceId: "workspace_a", policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", expectedHighWaterMark,
    authority: {
      async revalidate() {
        if (options.pendingAt === "authority") { pendingReached = true; await pending; }
        if (options.activeClaim) return { ok: true as const, admission: { identityAndMount: identity }, observedActiveClaim: activeClaim, outage };
        return { ok: true as const, admission: { identityAndMount: identity } };
      },
      invalidate() {}
    },
    lease: {
      async readOrAcquire(admission) {
        leaseInputs.push(admission);
        if (options.pendingAt === "lease") { pendingReached = true; await pending; }
        const mark = options.readbackKind === "empty-high-water" ? "" : options.readbackKind === "stale-high-water" ? "event:41" : expectedHighWaterMark;
        const readback: SupervisorLeaseReadbackEvidence = {
          schemaVersion: "resident-supervisor-lease-readback.v1", ...identity, policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", highWaterMark: mark,
          leaseEventId, readbackEventId: `readback:${leaseEventId}`, expiresAt: "2026-07-12T01:00:00.000Z", causation: { causationId: admission.causationId, correlationId: admission.correlationId },
          policyAndLock: { authorityEvidenceId: "evt_authority_a", mountEvidenceId: "evt_mount_a", leaseEventId, leaseReadbackEventId: `readback:${leaseEventId}`, policyVersion: "policy.v1", policyDigest: "sha256:policy_a", lockStateDigest: "sha256:lock_a", readbackEventId: "evt_policy_lock_readback" },
          highWater: { authorityEvidenceId: "evt_authority_a", mountEvidenceId: "evt_mount_a", leaseEventId, leaseReadbackEventId: `readback:${leaseEventId}`, highWaterMark: mark, readbackEventId: "evt_high_water_readback" }
        };
        if (options.readbackKind === "getter") Object.defineProperty(readback, "workspaceId", { enumerable: true, get() { getterReads += 1; return "workspace_a"; } });
        if (options.readbackKind === "proxy-getter") return { outcome: "acquired-and-read-back" as const, readback: new Proxy(readback, { get(target, property, receiver) { getterReads += 1; return Reflect.get(target, property, receiver); }, getOwnPropertyDescriptor(target, property) { if (property === "workspaceId") return { enumerable: true, configurable: true, get() { getterReads += 1; return "workspace_a"; } }; return Reflect.getOwnPropertyDescriptor(target, property); } }) };
        return { outcome: "acquired-and-read-back" as const, readback };
      }
    },
    reconciliation: {
      async readByIdempotencyKey() {
        if (options.pendingAt === "reconciliation") { pendingReached = true; await pending; }
        return undefined;
      },
      async appendAndReadBack(reconciliationInput) {
        reconciliationAppendInputs.push(reconciliationInput);
        return { record: options.invalidReconciliationReadback ? { ...reconciliationInput.record, claimId: "claim_mismatch" } : reconciliationInput.record, reconciliationEventId: "evt_reconciliation", readbackEventId: "evt_reconciliation_readback", admission: reconciliationInput.admission };
      }
    },
    runtime: {
      async wakeOnce() {
        runtimeCalls.push("wakeOnce");
        if (options.completedRuntimeEvidence === undefined) return { outcome: "accepted" as const };
        return {
          outcome: "completed" as const,
          evidence: {
            schemaVersion: "resident-wake-evidence.v1" as const,
            transition: options.completedRuntimeEvidence.transition,
            workspaceId: "workspace_a",
            residentId: "agent_default" as const,
            supervisorEpoch: epoch,
            policyVersion: "policy.v1",
            policyDigest: "sha256:policy_a",
            lockStateDigest: "sha256:lock_a",
            highWaterMark: options.completedRuntimeEvidence.highWaterMark,
            causation: { causationId: "cause:resume_exact_terminal", correlationId: "corr:resume_exact_terminal" },
            lifecycleEventId: "evt_runtime", readbackEventId: "evt_runtime_readback"
          }
        };
      }
    },
    lifecycle: { async pauseAndReadBack({ command: pauseCommand }) { if (options.pendingAt === "pause-readback") { pendingReached = true; await pending; } return { ok: true as const, evidence: lifecycleEvidence({ command: pauseCommand, epoch }) }; } },
    ...(options.maximumRecoveryAttempts === undefined ? {} : { maximumRecoveryAttempts: options.maximumRecoveryAttempts }),
    now: () => "2026-07-12T00:00:00.000Z"
  };
  const supervisor = createWakeSupervisor(input);
  return {
    supervisor,
    leaseInputs,
    runtimeCalls,
    reconciliationAppendInputs,
    get getterReads() { return getterReads; },
    releasePending() { pendingResolve?.(); },
    async waitUntilPending() {
      await waitFor(() => pendingReached);
    }
  };
}
