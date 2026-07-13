# Resident Agent Wake And Portable Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` only after a coordinator sends the complete scoped implementation-authorization message for the named task. Each task uses checkbox (`- [ ]`) steps, documentation or test RED/GREEN evidence, a fresh review, and verification-before-completion. Planning approval alone authorizes no production work.

**Goal:** Build a browser-independent, one-resident wake supervisor that can
only wake through a newly verified portable workspace, fails closed through
disconnect/restart/identity changes, and reports lifecycle truth only after
mounted durable readback.

**Architecture:** Task 117 (CF-1) first freezes the W/R lifecycle events,
strict schemas, opaque authority capability, ownership, and compatibility
rules proposed by the approved Lane W design. After the freeze, W implements a
deterministic `WakeSupervisor` in `packages/agent`, a mounted authority and
active-claim reconciliation adapter in `packages/local-runtime`, then binds
them to the already-authoritative runtime only after the required R foundations
have merged. U separately owns HTTP routes and the panel; those consumers can
only observe a strict status DTO or submit one bounded lifecycle command to a
supervision control port.

**Tech Stack:** TypeScript with strict compiler settings, Zod strict schemas,
Vitest, the append-only SQLite-backed ontology ledger, `workspace-ops` layout
resolution, and local-runtime HTTP/CLI composition.

## Global Constraints

- Governing Lane W specification:
  `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md@2620e51e4888a0884fb6d3eb4766e92736688efb`.
- Governing resident-agent program plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- CF-1 is the only authority that makes event names, Zod schemas, public DTO
  fields, capability-file location, production owner, parser compatibility,
  and route path canonical. This plan supplies exact work orders for the
  CF-1-selected W contracts; it does not make a competing contract canonical.
- Cestus has exactly one resident identity, `agent_default`. A process,
  supervisor epoch, provider, credential, subscription, or harness is never a
  second resident identity or authority source.
- `createAgentRuntime(...).wakeResidentAgent()` remains the composed bounded
  task-orchestrator plus approved-tool-scheduler wake. W must call it only
  through a narrow `WakeRuntimePort`; W never calls a provider, tool gateway,
  scheduler, ledger append, or workspace writer directly from a browser route.
- A workspace is authoritative only after fresh mounted manifest, resident
  identity, ledger high-water, artifact/derivative store, policy, lock, and
  supervisor-lease revalidation. Path existence, a local mutex, a cached
  layout, an old token, or an in-memory flag is not authority.
- No authority means no canonical or fallback write. This includes a ledger,
  projection, blob, derivative, handoff, queue, recovery journal, cache,
  temporary file, or alternate workspace. Bounded secret-safe process memory
  may describe current unavailability but cannot become replayable work.
- Every durable lifecycle/lease/reconciliation claim binds the same workspace,
  resident, supervisor epoch, policy version and digest, active lock digest,
  causation ID, correlation ID, and mounted readback evidence. Completion is
  never inferred from a return value.
- Deterministic tests remain credential-free. No W task runs a provider,
  accesses a secret, selects a substitute backend, or emits raw mount paths,
  prompt text, source bytes, provider data, stack traces, command arguments,
  credential material, or raw errors.
- Only R may modify `packages/local-runtime/src/agent-runtime-factory.ts`.
  Only U may modify `packages/local-runtime/src/agent-supervision-routes.ts`,
  `packages/ui/src/agent/ResidentSupervisionPanel.tsx`, and their UI/route
  tests. W must not alter those files.
- Every production child needs its own coordinator-issued message naming the
  exact approved spec and CF-1 plan/revision, allowed task range, wave stop,
  `superpowers:subagent-driven-development`, TDD, fresh review,
  verification-before-completion, GPT-5.6 Terra / Extra High, and the rule
  against merging into `neo`.

## Existing Boundaries To Preserve

| Existing boundary | Current owner and behavior | W preservation rule |
| --- | --- | --- |
| `packages/agent/src/runtime.ts` | `createAgentRuntime()` exposes `wakeResidentAgent()`, which first ticks task orchestration and then calls `scheduler.wake()`. | Task 124 receives a one-operation `WakeRuntimePort`; it cannot receive scheduler, provider, tool, ledger, path, or task-creation primitives. |
| `packages/agent/src/scheduler.ts` | `createAgentScheduler(...).wake()` is a bounded inspection of durable approved-tool work and retains consume-time approval/provenance/freshness/lock checks. | A wake signal never broadens scheduler behavior or converts a signal into effect completion. |
| `packages/agent/src/identity-bootstrap.ts` | `readDefaultResidentIdentityLifecycle()` and `ensureDefaultResidentIdentity()` bind `agent_default` to a workspace using ledger readback. | Task 125 reads the identity as one revalidation fact; it does not bootstrap, replace, or mutate identity during reconnect. |
| `packages/workspace-ops/src/layout.ts` | `resolveWorkspaceLayout()` resolves an expected mounted layout and rejects unsafe or mismatched manifests. | Task 125 consumes a fresh result at every recovery boundary; it never writes a layout, redirects to application data, or treats an earlier result as permanent authority. |
| `packages/local-runtime/src/agent-http-routes.ts` | Existing scheduler wake route has its current narrow meaning. | Task 141 keeps that meaning. The frozen supervision route uses only a control port and never labels signal admission as completed work. |

## Post-Freeze File And Interface Map

The following paths and signatures are implementation targets after CF-1. CF-1
must record the selected schema/event version and an additive compatibility
adapter before an implementer creates a public export. The listed W task owns
only the files in its row plus its task claim.

| Task | Owner files | Consumes | Produces |
| --- | --- | --- | --- |
| 124 / W1 | `packages/agent/src/wake-supervisor.ts`; `packages/agent/test/wake-supervisor.test.ts`; `docs/agentic/claims/task-124-resident-full-vision-w1-wake-supervisor.md` | CF-1 W contracts; `WakeRuntimePort`; an authority port; injected clock/timer/signal source. | `createWakeSupervisor(input): WakeSupervisor`, strict safe status/command DTO parsers, one in-flight coalesced wake state machine. |
| 125 / W1 | `packages/local-runtime/src/portable-workspace-lifecycle.ts`; `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`; `docs/agentic/claims/task-125-resident-full-vision-w1-portable-workspace-lifecycle.md` | CF-1 W contracts; `resolveWorkspaceLayout`; resident identity readback; mounted ledger/artifact/lock/policy readers. | `createPortableWorkspaceAvailabilityAuthority(input): WorkspaceAvailabilityAuthority`, monotonic authority invalidation, same-identity claim reconciliation. |
| 137 / W2 | `packages/local-runtime/src/wake-supervisor-runtime.ts`; `packages/local-runtime/test/wake-supervisor-runtime.test.ts`; `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md` | 124, 125, and R tasks 132–135 at their reviewed merged SHAs. | `createWakeSupervisorRuntime(input): WakeSupervisorRuntime`, service start/stop wiring and safe supervision control port. |
| 141 / U2, consumer only | `packages/local-runtime/src/agent-supervision-routes.ts`; `packages/local-runtime/test/agent-supervision-routes.test.ts`; `packages/ui/src/agent/ResidentSupervisionPanel.tsx`; `packages/ui/test/resident-supervision-panel.test.tsx` | U task 131, W 137, R 140, CF-1 route/DTO record. | Strict read-only status and five bounded lifecycle command routes. W supplies review criteria only and must not modify these files. |

### Planned Post-Freeze W Contract Surface

CF-1 must either freeze the following literal forms or record an append-only,
versioned compatibility decision that preserves each behavior. It may not
silently weaken a parser, alias a prior schema, make a token serializable, or
move ownership to R/U/P/L/T/H/A without a recorded owner/consumer decision.

```ts
export type WakeSupervisorState =
  | "initializing"
  | "running"
  | "pause-pending"
  | "paused"
  | "recovering"
  | "workspace-unavailable"
  | "degraded"
  | "unrecoverable";

export type WorkspaceAvailabilityState =
  | "verifying"
  | "available"
  | "unavailable"
  | "identity-mismatch"
  | "stale"
  | "lock-blocked"
  | "unrecoverable";

export type WakeSource = "startup" | "poll" | "event" | "command" | "recovery";
export type WorkspaceWriteCapability =
  | "wake" | "claim" | "provider" | "tool" | "artifact" | "lifecycle";

export interface WakeSignal {
  readonly source: WakeSource;
  readonly idempotencyKey: string;
  readonly sourceEventIds: readonly string[];
  readonly requestedAt: string;
}

export interface WakeRuntimePort {
  wakeOnce(input: {
    readonly authority: VerifiedWorkspaceAuthority;
    readonly signal: WakeSignal;
    readonly cancellation: AbortSignal;
  }): Promise<AgentRuntimeWakeResultDto>;
}

/**
 * CF-1 freezes this as the only supervisor-to-mounted-ledger lease seam.
 * It deliberately exposes evidence DTOs, never a ledger, append function,
 * workspace path, or mutable lease record.
 */
export interface DurableSupervisorLeasePort {
  readOrAcquire(input: SupervisorLeaseAdmissionInput): Promise<SupervisorLeaseAdmission>;
}

export interface SupervisorLeaseAdmissionInput {
  readonly authority: VerifiedWorkspaceAuthority;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly causationId: string;
  readonly correlationId: string;
}

export type SupervisorLeaseAdmission =
  | {
      readonly outcome: "acquired-and-read-back";
      readonly readback: SupervisorLeaseReadbackEvidence;
    }
  | {
      readonly outcome: "supervisor-lease-held";
      readonly readback: SupervisorLeaseHeldEvidence;
    };

/**
 * CF-1 freezes this as the only reconciliation seam. It cannot expose raw
 * events or a general-purpose ledger append API; it accepts only a verified
 * outage fact and returns only exact reconciliation readback evidence.
 */
export interface ActiveClaimReconciliationPort {
  readByIdempotencyKey(input: ClaimReconciliationLookup): Promise<ClaimReconciliationReadback | undefined>;
  appendAndReadBack(input: ClaimReconciliationAppend): Promise<ClaimReconciliationReadback>;
}

export interface ClaimReconciliationLookup {
  readonly authority: VerifiedWorkspaceAuthority;
  readonly reconciliationIdempotencyKey: string;
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
}

export interface ClaimReconciliationAppend extends ClaimReconciliationLookup {
  readonly observedActiveClaim: RevalidatedActiveClaimEvidence;
  readonly outage: WorkspaceOutageObservation;
  readonly policyAndLock: PolicyAndLockReadbackEvidence;
  readonly highWater: HighWaterReadbackEvidence;
}

export interface CausationCorrelationEvidence {
  readonly causationId: string;
  readonly correlationId: string;
}

export interface SupervisorLeaseReadbackEvidence {
  readonly schemaVersion: "resident-supervisor-lease-readback.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly leaseEventId: string;
  readonly readbackEventId: string;
  readonly expiresAt: string;
  readonly causation: CausationCorrelationEvidence;
}

export interface SupervisorLeaseHeldEvidence {
  readonly schemaVersion: "resident-supervisor-lease-held.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly holderEpoch: string;
  readonly leaseEventId: string;
  readonly readbackEventId: string;
  readonly expiresAt: string;
}

export interface PolicyAndLockReadbackEvidence {
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly readbackEventId: string;
}

export interface HighWaterReadbackEvidence {
  readonly highWaterMark: string;
  readonly readbackEventId: string;
}

export interface RevalidatedActiveClaimEvidence {
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly claimId: string;
  readonly attemptId: string;
  readonly priorClaimEventId: string;
  readonly priorClaimLeaseId: string;
  readonly readbackEventId: string;
  readonly causation: CausationCorrelationEvidence;
}

export interface WorkspaceOutageObservation {
  readonly safeObservationId: string;
  readonly observedAt: string;
  readonly category:
    | "workspace-unavailable"
    | "workspace-identity-mismatch"
    | "workspace-readback-failed";
  readonly priorAuthorityEvidenceId: string;
}

export interface ClaimReconciliationReadback {
  readonly schemaVersion: "resident-wake-workspace-unavailable.v1";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly claimId: string;
  readonly attemptId: string;
  readonly claimDisposition: "released" | "checkpointed";
  readonly resumable: true;
  readonly reconciliationIdempotencyKey: string;
  readonly reconciliationEventId: string;
  readonly readbackEventId: string;
  readonly causation: CausationCorrelationEvidence;
}

export interface WorkspaceAvailabilityAuthority {
  readonly contractVersion: "workspace-availability-authority.v1";
  inspect(): Promise<WorkspaceAvailabilityDto>;
  revalidate(input: WorkspaceRevalidationInput): Promise<WorkspaceAuthorityResult>;
  invalidate(reason: WorkspaceInvalidationReason): void;
}

export interface WorkspaceRevalidationInput {
  readonly operation: "wake" | "pause" | "resume" | "recovery" | "scheduler" | "provider" | "tool" | "artifact";
  readonly expectedWorkspaceId: string;
  readonly requiredCapabilities: readonly WorkspaceWriteCapability[];
  readonly priorEvidence?: WorkspaceAuthorityEvidenceRef;
}

export type WorkspaceAuthorityResult =
  | { readonly ok: true; readonly authority: VerifiedWorkspaceAuthority }
  | { readonly ok: false; readonly unavailable: WorkspaceUnavailableResult };

export interface WakeSupervisor {
  start(): Promise<WakeSupervisorCommandResultDto>;
  signal(input: WakeSignal): Promise<WakeSupervisorCommandResultDto>;
  pause(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  resume(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  recover(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  status(): Promise<WakeStatusDto>;
  stop(): Promise<void>;
}
```

The evidence types above are CF-1-owned strict, safe, opaque-reference DTOs.
They bind the workspace, resident, epoch, policy version/digest, lock digest,
causation, correlation, and mounted ledger high-water; they contain no raw
ledger, event payload, workspace path, mutable claim object, provider/tool
object, or serializable authority. CF-1 may give these names versioned aliases
only by an append-only compatibility record that preserves their exact input,
readback, and non-general-purpose boundaries.

### CF-1-Frozen Lifecycle Admission And Stop Sequence

For `start`, `resume`, and `recover`, Tasks 124 and 125 must record and test
this exact order; no return value, cached authority, or prior process object
may skip a step:

1. revalidate mounted authority and manifest/workspace/resident identity;
2. call `DurableSupervisorLeasePort.readOrAcquire()` and require its mounted
   lease readback;
3. validate the named operation's policy version/digest, active-lock digest,
   and non-regressed mounted high-water from the same authority epoch;
4. if an outage observation names an active claim, use only
   `ActiveClaimReconciliationPort.readByIdempotencyKey()` or
   `appendAndReadBack()` to release/checkpoint and read back that exact claim;
5. only then may a resume or one bounded recovery wake enter `WakeRuntimePort`.

`supervisor-lease-held` is a valid competing lease result, not unavailable
authority: it preserves `WorkspaceAvailabilityState` as `available`, exposes
only that fixed safe diagnostic, performs no wake or reconciliation append,
and creates no fallback state. `workspace-unavailable` is reserved for failed
authority/readback; it invalidates the authority and performs neither a lease
takeover nor a reconciliation append until a later same-identity revalidation.

`stop()` is terminal for the current in-memory service epoch: it closes intake,
cancels timer and watcher registrations, aborts an in-flight wake before its
next effect boundary, invalidates authority, and leaves only already-mounted
durable/resumable state. It emits no wake, provider, tool, artifact, ledger,
or fallback write after the stop boundary. A later service starts with a new
epoch and fresh authority, lease, policy/lock/high-water, and reconciliation
readbacks; it never revives a stopped authority, timer, watcher, prompt,
runtime result, claim object, or callback.

`VerifiedWorkspaceAuthority` is opaque, short-lived, monotonic, and
non-serializable. `WakeStatusDto`, `WorkspaceAvailabilityDto`,
`WakeSupervisorCommandResultDto`, `WorkspaceUnavailableResult`,
`WakeLifecycleEvidenceDto`, and `WakeHealthDiagnosticDto` use strict literal
schema versions; they reject unknown keys, accessors, symbols, custom arrays,
custom serializers, and non-plain objects. `accepted` means only admitted;
`completed` requires named mounted readback; `blocked` contains one fixed
safe category and allowed command IDs. No DTO contains a path, process ID,
token, raw error, credential, prompt, source/artifact body, provider response,
or arbitrary command text.

## Dependency, Rebase, And Dispatch Order

```text
CF-1 W/R contract freeze merged
  ├─ Task 124: supervisor (W) ──────────────┐
  ├─ Task 125: portable authority (W) ──────┼─ Task 137: W service/runtime binding
  └─ R 132–135: mounted contexts/runners/stores ┘
                                         │
                              R 140 default-factory composition
                                         │
                              U 131 strict DTO parser
                                         │
                              Task 141: U routes and panel
                                         │
                       A-01/A-02 mounted/restart/disconnect acceptance
```

1. The coordinator records the merged CF-1 SHA in each Task 124 and 125
   claim, rebases both worktrees to that SHA, and runs their focused command
   before dispatch. Task 124 and Task 125 may execute in parallel because
   their production/test files are exclusive and CF-1 has frozen their shared
   boundary.
2. Task 137 starts only after reviewed Task 124 and 125 commits and reviewed
   R 132–135 commits are merged. The coordinator rebases its worktree to the
   exact integration SHA and runs the Task 137 cross-lane command before
   review.
3. Task 141 is a U-owned consumer. It starts only after U 131, W 137, and R
   140 merge and rebase cleanly. Its author receives an independent scoped
   authorization; Task 111/W authors neither dispatch it nor edit its files.
4. Any CF-1 contract change after an implementation merge creates a new
   append-only CF-1 revision. The coordinator rebases every affected child,
   repeats the named cross-lane suite, and obtains a fresh review before
   integration.

## Task 124: Wake Supervisor

**Files:**

- Create: `packages/agent/src/wake-supervisor.ts`
- Create: `packages/agent/test/wake-supervisor.test.ts`
- Create: `docs/agentic/claims/task-124-resident-full-vision-w1-wake-supervisor.md`

**Dependencies:** Reviewed, merged CF-1 W contract; no direct local-runtime,
filesystem, provider, tool-gateway, browser, raw ledger, or raw claim
dependency. Task 125 supplies structurally conforming authority, durable-lease,
and active-claim-reconciliation ports later; Task 124 tests use plain
deterministic fakes that expose only typed inputs, safe readback DTOs, and call
traces, never a storage path or write API.

**Interfaces:**

- Consumes: `WakeRuntimePort`, `WorkspaceAvailabilityAuthority`,
  `DurableSupervisorLeasePort`, `ActiveClaimReconciliationPort`, opaque
  `VerifiedWorkspaceAuthority`, injected `Clock`, `WakeTimer`, and bounded
  `WakeSignalSource` ports frozen by CF-1.
- Produces: `createWakeSupervisor(input): WakeSupervisor`, strict DTO parse
  functions, one typed lease/readback admission per epoch, exact
  reconciliation readback before a resumed/recovery wake, one active wake
  cycle, and no more than one active recovery cycle.
- Does not produce: a daemon task queue, a provider/tool/ledger API, a route,
  a task/approval/handoff synthesizer, a filesystem fallback, or changes to
  `scheduler.ts`, `runtime.ts`, `runtime-types.ts`, or the default factory.

- [ ] **Step 1: Claim and write the RED supervisor contract tests**

  Create the task claim with status `in-progress`, CF-1 SHA, precise owned and
  forbidden files, fresh authorization, model record, and stop point. Add the
  focused test file with deterministic fakes for clock, timer, authority,
  `DurableSupervisorLeasePort`, `ActiveClaimReconciliationPort`, and
  `WakeRuntimePort`. The fakes must expose typed call traces and counts rather
  than an implicit execution side effect.

  ```ts
  it("coalesces burst signals and lets exactly one lease holder wake", async () => {
    const harness = createWakeSupervisorHarness({ now: "2026-07-12T00:00:00.000Z" });
    const [first, second] = [harness.createSupervisor("epoch_a"), harness.createSupervisor("epoch_b")];

    await Promise.all([
      first.signal(harness.signal("event", "signal_a")),
      first.signal(harness.signal("event", "signal_b")),
      second.signal(harness.signal("poll", "signal_c"))
    ]);
    await harness.flush();

    expect(harness.lease.readBackClaimedEpochs).toHaveLength(1);
    expect(harness.runtime.wakeCalls).toHaveLength(1);
    expect(harness.runtime.wakeCalls[0]?.signal.source).toBe("event");
    const losingStatus = await harness.status(second);
    expect(losingStatus.workspaceState).toBe("available");
    expect(losingStatus.diagnostics).toContainEqual(
      expect.objectContaining({ category: "supervisor-lease-held" })
    );
  });

  it("does not call the wake port after pause closes intake until mounted pause readback", async () => {
    const harness = createWakeSupervisorHarness({ activeWake: "blocked-until-cancel" });
    const supervisor = harness.createSupervisor("epoch_pause");

    await supervisor.signal(harness.signal("startup", "startup_1"));
    await expect(supervisor.pause(harness.command("pause_1"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(supervisor.status()).resolves.toMatchObject({ supervisorState: "pause-pending" });
    await supervisor.signal(harness.signal("event", "late_signal"));
    await harness.completeActiveWakeWithMountedReadback();

    expect(harness.runtime.wakeCalls).toHaveLength(1);
    await expect(supervisor.status()).resolves.toMatchObject({ supervisorState: "paused" });
  });

  it("admits resume only in the revalidate, lease-readback, validate, reconcile-readback, wake order", async () => {
    const harness = createWakeSupervisorHarness({ outageObservedActiveClaim: true });
    const supervisor = harness.createSupervisor("epoch_resume");

    await supervisor.resume(harness.command("resume_1"));

    expect(harness.trace).toEqual([
      "authority.revalidate:resume",
      "lease.readOrAcquire:acquired-and-read-back",
      "authority.validate:policy-lock-high-water",
      "reconciliation.readByIdempotencyKey",
      "reconciliation.appendAndReadBack",
      "runtime.wakeOnce:recovery"
    ]);
    expect(harness.runtime.wakeCalls).toHaveLength(1);
  });
  ```

- [ ] **Step 2: Run the focused RED command**

  Run:

  ```bash
  npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts
  ```

  Expected before `wake-supervisor.ts` exists: the suite fails because the
  module/import and its `createWakeSupervisor` contract do not exist. Record
  the complete safe failure category in the claim; do not alter
  `scheduler.test.ts` to hide the failure.

- [ ] **Step 3: Implement the bounded state machine and strict safe DTO boundary**

  Create `wake-supervisor.ts` with the CF-1 frozen interface surface. The
  implementation must:

  1. normalize and freeze a plain-data signal before storing it in the bounded
     mailbox; coalesce equal source/idempotency keys and reject a mailbox above
     the CF-1 finite maximum;
  2. call only `DurableSupervisorLeasePort.readOrAcquire()` with a verified
     authority and require exact mounted lease readback before `running`; an
     unexpired valid competing lease yields only `supervisor-lease-held`, keeps
     workspace state `available`, performs no reconciliation append, and never
     calls `WakeRuntimePort`;
  3. after lease readback, validate the exact policy version/digest, active-lock
     digest, and non-regressed mounted high-water for the named operation;
     then call `authority.revalidate({ operation: "wake", ... })` immediately
     before a wake and again at the post-wake readback boundary. A failed grant
     transitions to `workspace-unavailable`, clears the pending token, and
     never treats a lease-held result as unavailable;
  4. when an outage observation names an active claim, call only the typed
     `ActiveClaimReconciliationPort` and require exact mounted release/checkpoint
     readback before resume/recovery. It may first read a matching idempotency
     key; it may append only after same-identity revalidation, and it must not
     receive or retain a raw ledger, event, claim object, or general append API;
  5. call only `runtimePort.wakeOnce({ authority, signal, cancellation })`;
     do not expose a scheduler, provider, tool, path, or mutable ledger object
     in the port input;
  6. represent pause as `accepted` then `pause-pending`; close intake before a
     new claim/effect boundary; publish `paused` only after a mounted paused
     event/readback; and preserve a blocked ephemeral diagnostic when the
     mount fails during quiescence;
  7. make resume/recover follow the frozen five-step admission sequence,
     reconstruct only from mounted state, and issue at most one recovery wake;
  8. bound recovery attempts by the frozen epoch/policy count and time window;
     transition to `unrecoverable` when exhausted and require an explicit
     supported recover command plus successful revalidation before leaving it;
  9. convert every error path to one closed `WakeHealthDiagnosticDto` category
     before an `await`, log, DTO projection, or append. No raw `Error` or
     unbounded error object reaches a public return value.

  The task records only the CF-1-approved lifecycle event types. Each event
  carries resident/workspace/epoch/policy/causation/correlation/identity/
  high-water/lock evidence and is treated as incomplete until its exact mounted
  ledger readback succeeds. An unavailable mount produces no invented event
  ID.

- [ ] **Step 4: Add negative supervisor cases and run the focused GREEN command**

  Add each test below to `wake-supervisor.test.ts`; use an injected fixed clock
  and `flush()` instead of timers or sleeps.

  ```ts
  it("recovers only after revalidation and reaches unrecoverable at the exact policy limit", async () => {
    const harness = createWakeSupervisorHarness({ maximumRecoveryAttempts: 2, wakeFailures: ["scheduler-unavailable", "scheduler-unavailable"] });
    const supervisor = harness.createSupervisor("epoch_recovery");

    await supervisor.recover(harness.command("recover_1"));
    await supervisor.recover(harness.command("recover_2"));

    expect(harness.authority.revalidationOperations).toEqual(["recovery", "recovery"]);
    await expect(supervisor.status()).resolves.toMatchObject({ supervisorState: "unrecoverable" });
    expect(harness.runtime.wakeCalls).toHaveLength(2);
  });

  it("rejects accessor-backed diagnostics without invoking the getter", async () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, "message", {
      enumerable: true,
      get() { getterCalls += 1; throw new Error("must not execute"); }
    });

    expect(() => parseWakeHealthDiagnostic(hostile)).toThrow();
    expect(getterCalls).toBe(0);
  });

  it("stops intake and all local activity until a fresh authority and reconciliation admit a new epoch", async () => {
    const harness = createWakeSupervisorHarness({ activeWake: "blocked-until-cancel" });
    const first = harness.createSupervisor("epoch_stop_1");
    await first.signal(harness.signal("event", "before_stop"));

    await first.stop();
    await first.signal(harness.signal("event", "after_stop"));
    await harness.flush();

    const stopStart = harness.trace.indexOf("intake.close");
    expect(harness.trace.slice(stopStart)).toEqual([
      "intake.close", "timer.cancel", "watcher.cancel", "authority.invalidate:shutdown", "wake.abort"
    ]);
    expect(harness.runtime.callsAfter("authority.invalidate:shutdown")).toEqual([]);
    expect(harness.provider.callsAfterStop).toEqual([]);
    expect(harness.tool.callsAfterStop).toEqual([]);
    expect(harness.artifact.callsAfterStop).toEqual([]);
    expect(harness.ledger.callsAfterStop).toEqual([]);
    expect(harness.fallback.allWriteCalls()).toEqual([]);
    expect(harness.currentState()).toMatchObject({ resumable: true, durable: true });

    const second = harness.createFreshSupervisor("epoch_stop_2");
    await second.resume(harness.command("resume_after_stop"));
    expect(harness.secondEpoch.trace).toEqual([
      "authority.revalidate:resume",
      "lease.readOrAcquire:acquired-and-read-back",
      "authority.validate:policy-lock-high-water",
      "reconciliation.readByIdempotencyKey",
      "runtime.wakeOnce:recovery"
    ]);
  });
  ```

  Run:

  ```bash
  npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts
  ```

  Expected: both focused files pass. The scheduler suite proves the supervisor
  did not change its bounded approval-consuming behavior; the deterministic
  order and stop cases prove no resume/recovery skips typed readback and no
  stopped epoch emits later wake/provider/tool/artifact/ledger activity.

- [ ] **Step 5: Run full gates, commit, and request a fresh review**

  Run, in this order:

  ```bash
  git diff --check
  npm run factory:check
  npm run verify
  ```

  Commit only the three Task 124 files:

  ```bash
  git add packages/agent/src/wake-supervisor.ts packages/agent/test/wake-supervisor.test.ts docs/agentic/claims/task-124-resident-full-vision-w1-wake-supervisor.md
  git commit -m "feat: add bounded wake supervisor"
  ```

  A fresh reviewer must inspect authority-before-wake/readback-after-wake, the
  typed lease/reconciliation-only seams and five-step order, lease exclusivity
  and available-versus-unavailable distinction, all state transitions, stop
  cancellation/invalidation, signal boundedness, pause labels, recovery limits,
  diagnostics, and absence of provider/tool/fallback access.

## Task 125: Portable Workspace Availability And Claim Reconciliation

**Files:**

- Create: `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- Create: `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`
- Create: `docs/agentic/claims/task-125-resident-full-vision-w1-portable-workspace-lifecycle.md`

**Dependencies:** Reviewed, merged CF-1 W contracts. Read only the existing
`resolveWorkspaceLayout`, mounted ledger, mounted artifact/derivative roots,
`readDefaultResidentIdentityLifecycle`, policy/lock projector, and CF-1 claim
service ports. This task neither creates a workspace nor modifies the default
runtime factory, a provider, a route, a scheduler, a projection, or a shared
event-contract file outside CF-1's W assignment.

**Interfaces:**

- Consumes: `WorkspaceAvailabilityAuthority` and the CF-1-frozen
  `DurableSupervisorLeasePort` / `ActiveClaimReconciliationPort` contracts,
  `WorkspaceRevalidationInput`, layout and mounted-store readers, identity
  reader, authoritative policy/lock/high-water readers, and only narrow typed
  mounted lease/reconciliation evidence adapters. It consumes no raw ledger,
  generic append function, raw event, mutable claim, or workspace path port.
- Produces: `createPortableWorkspaceAvailabilityAuthority(input)` together
  with `PortableWorkspaceLifecyclePorts` containing the authority, durable
  supervisor-lease port, and active-claim-reconciliation port; a
  `WorkspaceUnavailableResult` with closed safe categories; opaque authority
  issuance/invalidation; bounded ephemeral outage observations; and exact
  active-claim reconciliation readback.
- Does not produce: internal storage, a cached authority resurrection,
  identity bootstrap/mutation, task creation, provider/tool invocation, claim
  reacquisition, synthetic completion, or a local recovery journal.

```ts
export interface PortableWorkspaceLifecyclePorts {
  readonly authority: WorkspaceAvailabilityAuthority;
  readonly supervisorLease: DurableSupervisorLeasePort;
  readonly activeClaimReconciliation: ActiveClaimReconciliationPort;
}

export function createPortableWorkspaceLifecyclePorts(
  input: PortableWorkspaceLifecycleInput
): PortableWorkspaceLifecyclePorts;
```

`createPortableWorkspaceAvailabilityAuthority` may be the factory that builds
this facade or CF-1 may select a compatibility-named facade, but Task 125 must
not expose a raw mounted ledger or a general append capability to Task 124,
Task 137, a route, or a browser consumer. Only these narrow ports cross the
W-local lifecycle boundary.

### Same-Identity Revalidation And Active-Claim Reconciliation

The implementation must carry the full repair contract from the approved Lane
W specification. Mount loss during an active wake captures one normalized,
bounded, secret-safe *ephemeral* observation only when the exact pre-outage
claim, attempt, prior claim event/lease, prior authority evidence, high-water,
policy, lock, causation, and correlation facts came from mounted readback.
It makes zero append/write calls while unavailable.

After reconnect, the supervised admission path must perform this exact ordered
sequence: (1) `revalidate()` proves the same mounted workspace and resident
identity; (2) `DurableSupervisorLeasePort.readOrAcquire()` reads/acquires and
reads back the lease; (3) typed readers validate non-regressed high-water,
policy version/digest, and lock digest for that lease/authority epoch; (4)
`ActiveClaimReconciliationPort` reads an exact idempotency key or appends and
reads back one release/checkpoint; and (5) only then can Task 124 resume or
issue one recovery wake. A changed identity, unreadable mount, missing
claim/attempt, changed policy/locks, swapped artifact root, regressed
high-water, failed lease readback, or failed reconciliation readback returns a
specific safe blocked/unavailable result and makes no append.

Only successful same-identity revalidation and typed lease/policy/lock/high-
water readback may append and read back exactly one idempotent claim
reconciliation. CF-1 freezes the final event name, but its payload must
preserve this shape and semantics:

```ts
export interface WorkspaceUnavailableClaimReconciliationV1 {
  readonly schemaVersion: "resident-wake-workspace-unavailable.v1";
  readonly outcome: "workspace-unavailable";
  readonly resumable: true;
  readonly claimDisposition: "released" | "checkpointed";
  readonly workspaceId: string;
  readonly residentId: "agent_default";
  readonly supervisorEpoch: string;
  readonly claimId: string;
  readonly attemptId: string;
  readonly outageObservation: {
    readonly safeObservationId: string;
    readonly outageObservedAt: string;
    readonly category: "workspace-unavailable" | "workspace-identity-mismatch" | "workspace-readback-failed";
    readonly priorClaimEventId: string;
    readonly priorClaimLeaseId: string;
    readonly priorAuthorityEvidenceId: string;
    readonly highWaterBeforeOutage: string;
  };
  readonly causation: { readonly causationId: string; readonly correlationId: string; };
  readonly revalidatedAuthority: {
    readonly identityEventId: string;
    readonly authorityEvidenceId: string;
    readonly highWaterAfterRevalidation: string;
    readonly policyVersion: string;
    readonly policyDigest: string;
    readonly lockStateDigest: string;
    readonly supervisorLeaseEventId: string;
  };
  readonly reconciliationIdempotencyKey: string;
}
```

The idempotency key derives from workspace ID, supervisor epoch, claim ID,
attempt ID, safe observation ID, and prior claim event. A duplicate reconnect
first reads the mounted ledger for that exact key and may reuse only an exact
matching readback. A release/checkpoint return value is not a result until
readback binds claim/attempt, causation, authority evidence, both high-water
facts, policy, and locks. Only then may ordinary claim recovery later acquire a
released claim or follow the claim service's checkpointed path; it must not
reuse an old authority, callback, prompt, provider result, claim object, or
execution lease.

- [ ] **Step 1: Claim and write RED authority/reconciliation tests**

  Create the task claim with exact CF-1 SHA, ownership, zero-fallback rule,
  authorization, model record, and stop point. Create an on-disk mounted
  fixture using the production layout resolver plus injected readable/unreadable
  mount watcher, ledger/artifact identity readers, policy/lock reader, and a
  fallback-write sentinel. The sentinel exposes `ledgerWrites`,
  `artifactWrites`, `projectionWrites`, `cacheWrites`, and `journalWrites` and
  throws if any method is called.

  ```ts
  it("records no fallback write on outage and reconciles one exact active claim after same-identity readback", async () => {
    const fixture = await createMountedLifecycleFixture({ activeClaim: true });
    const authority = createPortableWorkspaceAvailabilityAuthority(fixture.input);
    const grant = await authority.revalidate(fixture.revalidate("wake"));
    if (!grant.ok) throw new Error("fixture must start available");

    fixture.mount.disconnect();
    authority.invalidate("mount-lost");
    await expect(authority.revalidate(fixture.revalidate("recovery"))).resolves.toMatchObject({ ok: false });
    expect(fixture.fallback.allWriteCalls()).toEqual([]);
    expect(fixture.ledger.appendCalls).toHaveLength(0);

    fixture.mount.reconnectSameIdentity();
    const reconciliation = await fixture.reconcileObservedClaim(authority);
    expect(reconciliation).toMatchObject({ claimId: fixture.claimId, attemptId: fixture.attemptId, outcome: "workspace-unavailable", resumable: true });
    expect(fixture.ledger.readBackByIdempotencyKey(reconciliation.reconciliationIdempotencyKey)).toEqual(reconciliation);
  });

  it("fails closed on a mount mismatch and replays only a matching typed reconciliation readback", async () => {
    const fixture = await createMountedLifecycleFixture({ activeClaim: true, outageObserved: true });
    const ports = createPortableWorkspaceLifecyclePorts(fixture.input);
    fixture.mount.reconnectWrongIdentity();

    await expect(ports.authority.revalidate(fixture.revalidate("resume"))).resolves.toMatchObject({ ok: false });
    expect(fixture.trace).toEqual(["authority.revalidate:resume", "mount.identity-mismatch"]);
    expect(fixture.lease.calls).toEqual([]);
    expect(fixture.reconciliation.calls).toEqual([]);
    expect(fixture.fallback.allWriteCalls()).toEqual([]);

    fixture.mount.reconnectSameIdentity();
    await fixture.completeAdmissionThroughPolicyLockAndHighWater(ports);
    const first = await ports.activeClaimReconciliation.appendAndReadBack(fixture.reconciliationAppend());
    const replay = await ports.activeClaimReconciliation.readByIdempotencyKey(fixture.reconciliationLookup());
    expect(replay).toEqual(first);
    expect(fixture.reconciliation.appendCalls).toHaveLength(1);
  });
  ```

- [ ] **Step 2: Run the focused RED command**

  Run:

  ```bash
  npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts
  ```

  Expected before the adapter exists: the lifecycle module/import and
  `createPortableWorkspaceAvailabilityAuthority` fail to resolve. Record the
  missing-contract failure in the claim without manufacturing a temporary
  fallback implementation.

- [ ] **Step 3: Implement authority issuance, invalidation, and no-fallback behavior**

  Create `portable-workspace-lifecycle.ts` with the CF-1 W interface. On every
  `revalidate(input)`, take one normalized, frozen own-data snapshot and prove:

  1. `resolveWorkspaceLayout` returns a readable canonical layout at the
     configured root and expected workspace ID;
  2. manifest identity and `agent_default` identity-stream readback match that
     exact workspace;
  3. the mounted ledger opens and returns the expected non-regressed current
     high-water/readback identity;
  4. required artifact/derivative stores are under that verified layout and
     have the expected identity; no alternative root is eligible;
  5. policy version/digest and rebuilt active lock digest satisfy the named
     operation; and
  6. `DurableSupervisorLeasePort.readOrAcquire()` returns an exact mounted
     lease readback. An active competing lease yields only
     `supervisor-lease-held`, preserves workspace availability, causes no
     reconciliation append or wake, and neither clears nor replaces that lease.

  Grant only an opaque short-lived authority after the mount/identity facts
  succeed. The supervision path then obtains lease readback and validates
  high-water, policy, and locks before it uses either typed reconciliation
  operation or a wake. An unavailable authority is distinct from
  `supervisor-lease-held`: the former invalidates authority and permits no
  lease takeover, append, wake, or fallback write.
  Invalidate it monotonically on mount watcher loss, layout/manifest change,
  read/write error, failed post-operation readback, lease loss, high-water
  contradiction, policy/lock change, or shutdown. An invalidated token can
  never become valid; a later grant is a new full revalidation. When no grant
  exists, construct a fixed `WorkspaceUnavailableResult` and retain at most the
  one bounded ephemeral outage observation required for later same-identity
  reconciliation. Never create a directory, log file, cache, journal, queue,
  projection, ledger, or artifact while unavailable.

### No-Fallback Counterfactual Proof

The Task 125 test fixture must observe every non-mounted ledger, projection,
artifact, derivative, handoff, cache, temporary-file, and journal writer. A
disconnect or failed revalidation passes only when every observed write count
is zero; the sentinel is an observer and cannot synthesize or mask state.

- [ ] **Step 4: Implement reconciliation and its counterfactual tests**

  Add deterministic tests for all failure variants below. Each test asserts a
  zero fallback-sentinel count and zero reconciliation append calls unless the
  success row explicitly permits one mounted append.

  ```ts
  it.each([
    ["wrong manifest identity", (fixture: LifecycleFixture) => fixture.mount.reconnectWrongIdentity()],
    ["unreadable manifest", (fixture: LifecycleFixture) => fixture.mount.makeManifestUnreadable()],
    ["regressed high-water", (fixture: LifecycleFixture) => fixture.ledger.regressHighWater()],
    ["swapped artifact root", (fixture: LifecycleFixture) => fixture.artifacts.swapRoot()],
    ["changed policy", (fixture: LifecycleFixture) => fixture.policy.changeDigest()],
    ["active lock", (fixture: LifecycleFixture) => fixture.locks.activate()],
    ["missing active claim", (fixture: LifecycleFixture) => fixture.ledger.removeReconstructedClaim()]
  ])("fails closed for %s", async (_name, mutate) => {
    const fixture = await createMountedLifecycleFixture({ activeClaim: true, outageObserved: true });
    mutate(fixture);

    await expect(fixture.reconcileAfterReconnect()).resolves.toMatchObject({ ok: false });
    expect(fixture.ledger.reconciliationAppendCalls).toEqual([]);
    expect(fixture.fallback.allWriteCalls()).toEqual([]);
    expect(fixture.effects.allCalls()).toEqual([]);
  });

  it("reads a matching prior reconciliation on duplicate reconnect instead of appending twice", async () => {
    const fixture = await createMountedLifecycleFixture({ activeClaim: true, outageObserved: true });
    const first = await fixture.reconcileAfterReconnect();
    const second = await fixture.reconcileAfterReconnect();

    expect(second).toEqual(first);
    expect(fixture.ledger.reconciliationAppendCalls).toHaveLength(1);
  });

  it("does not attempt lease, reconciliation, or recovery when mounted identity mismatches", async () => {
    const fixture = await createMountedLifecycleFixture({ activeClaim: true, outageObserved: true });
    fixture.mount.reconnectWrongIdentity();

    await expect(fixture.resumeAfterReconnect()).resolves.toMatchObject({ ok: false, unavailable: { category: "workspace-identity-mismatch" } });
    expect(fixture.lease.readOrAcquireCalls).toEqual([]);
    expect(fixture.reconciliation.allCalls()).toEqual([]);
    expect(fixture.runtime.wakeCalls).toEqual([]);
    expect(fixture.fallback.allWriteCalls()).toEqual([]);
  });
  ```

  Also test disconnect before a wake, during a simulated provider/tool boundary,
  and during artifact/readback. In each case, new work is blocked, the old
  capability is invalid, no internal write occurs, and an indeterminate result
  is only resumable through later mounted reconciliation. Add a hostile
  accessor/symbol/custom-array diagnostic input and assert no getter runs.

- [ ] **Step 5: Run the focused GREEN command and full gates**

  Run:

  ```bash
  npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  ```

  Expected: focused lifecycle and identity suites pass, diff check has no
  output, and the full verifier passes. The test output must contain only test
  names and safe IDs/categories, not fixture paths or unsafe payload data.

- [ ] **Step 6: Commit and request fresh review**

  ```bash
  git add packages/local-runtime/src/portable-workspace-lifecycle.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts docs/agentic/claims/task-125-resident-full-vision-w1-portable-workspace-lifecycle.md
  git commit -m "feat: verify portable workspace lifecycle authority"
  ```

  A fresh reviewer must lead with any path-based authority shortcut, cached
  capability reuse, raw-ledger/raw-claim seam, lease without exact mounted
  readback, an unavailable-versus-lease-held collapse, append without exact
  mounted reconciliation readback, incomplete reconciliation binding, duplicate
  idempotency append, fallback write, altered identity behavior, diagnostic
  leakage, or source ownership drift.

## Task 137: Wake Supervisor Runtime Assembly

**Files:**

- Create: `packages/local-runtime/src/wake-supervisor-runtime.ts`
- Create: `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
- Create: `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

**Dependencies:** Reviewed and merged W 124/125; reviewed and merged R
132–135; exact rebase to the integration SHA containing those commits. This
task must not edit R's `agent-runtime-factory.ts`, U's routes/panel, H's
handoff contracts, P's configuration, L's policy, or the scheduler.

**Interfaces:**

- Consumes: the Task 124 supervisor, Task 125 authority/typed lease/typed
  reconciliation ports, and R's actual mounted context/prompt/runner/artifact
  capabilities.
- Produces: `createWakeSupervisorRuntime(input): WakeSupervisorRuntime` and a
  narrow `SupervisionControlPort` that implements status, signal, pause,
  resume, recover, and service shutdown without accepting raw scheduler input,
  ledger/claim object, workspace paths, tools, providers, policies, approvals,
  or force flags.
- Does not produce: default runtime composition, browser transport, a provider
  call, a fresh workspace, or an in-memory recovery source.

```ts
export interface WakeSupervisorRuntime {
  readonly control: SupervisionControlPort;
  start(): Promise<WakeSupervisorCommandResultDto>;
  stop(): Promise<void>;
}

export interface SupervisionControlPort {
  status(): Promise<WakeStatusDto>;
  signal(input: WakeSignalCommand): Promise<WakeSupervisorCommandResultDto>;
  pause(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  resume(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
  recover(input: WakeCommandInput): Promise<WakeSupervisorCommandResultDto>;
}
```

- [ ] **Step 1: Claim and write RED runtime-assembly tests**

  Create the Task 137 claim and test a fresh-process runtime harness. Its first
  service instance must be discarded before construction of the second; the
  second receives only mounted ledger/artifact facts and new authority objects.

  ```ts
  it("restarts from mounted readback without reusing a pre-outage port, prompt, result, or authority", async () => {
    const fixture = await createMountedWakeRuntimeFixture();
    const first = createWakeSupervisorRuntime(fixture.firstProcessInput());
    await first.start();
    await fixture.runOneWakeAndPersistOnlyMountedEvidence();
    await first.stop();

    const second = createWakeSupervisorRuntime(fixture.freshProcessInput());
    await second.start();

    expect(fixture.secondProcess.usedFirstProcessObjects()).toBe(false);
    await expect(second.control.status()).resolves.toMatchObject({ residentAgentId: "agent_default" });
    expect(fixture.fallback.allWriteCalls()).toEqual([]);
  });
  ```

- [ ] **Step 2: Run the focused RED command**

  ```bash
  npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts
  ```

  Expected before the runtime module exists: the module/import and
  `createWakeSupervisorRuntime` contract fail to resolve.

- [ ] **Step 3: Bind the real mounted runtime through the narrow port**

  Implement the runtime assembly so it creates one supervisor for the verified
  mounted workspace epoch, supplies a `WakeRuntimePort` that invokes the
  existing composed wake only after the frozen authority → typed lease
  readback → policy/lock/high-water validation → typed reconciliation readback
  admission sequence, starts bounded polling and watcher wiring, and forwards
  service lifecycle into the control port. Each process restart constructs new
  supervisor/authority/runtime objects and rebuilds claims/handoffs only from
  mounted durable state. A browser close is not an input to `stop()`.

  A disconnect invalidates authority, stops intake, cancels work before an
  uncommitted effect boundary, preserves only the bounded ephemeral outage
  observation, and reports a blocked safe status. The runtime may resume only
  after Task 125 same-identity reconciliation readback and the ordinary claim
  service's normal re-acquisition path. It must never call a provider, tool,
  artifact writer, or scheduler directly during unavailable/recovery handling.

- [ ] **Step 4: Add restart/disconnect/cross-lane tests and run GREEN**

  ```ts
  it("does not label a pause or recovery completed before mounted lifecycle evidence reads back", async () => {
    const fixture = await createMountedWakeRuntimeFixture({ delayLifecycleReadback: true });
    const runtime = createWakeSupervisorRuntime(fixture.firstProcessInput());
    await runtime.start();

    await expect(runtime.control.pause(fixture.command("pause_1"))).resolves.toMatchObject({ outcome: "accepted" });
    await expect(runtime.control.status()).resolves.toMatchObject({ supervisorState: "pause-pending" });
    fixture.completeLifecycleReadback();

    await expect(runtime.control.status()).resolves.toMatchObject({ supervisorState: "paused" });
  });

  it("stops the service epoch with no later local activity and permits restart only through fresh admission", async () => {
    const fixture = await createMountedWakeRuntimeFixture({ activeWake: "blocked-until-cancel" });
    const first = createWakeSupervisorRuntime(fixture.firstProcessInput());
    await first.start();
    await first.control.signal(fixture.signal("event", "before_stop"));

    await first.stop();
    await fixture.flush();

    expect(fixture.firstProcess.stopTrace()).toEqual([
      "intake.close", "timer.cancel", "watcher.cancel", "authority.invalidate:shutdown", "wake.abort"
    ]);
    expect(fixture.firstProcess.afterStopCalls()).toEqual({ wake: [], provider: [], tool: [], artifact: [], ledger: [] });
    expect(fixture.fallback.allWriteCalls()).toEqual([]);

    const second = createWakeSupervisorRuntime(fixture.freshProcessInput());
    await second.start();
    expect(fixture.secondProcess.admissionTrace()).toEqual([
      "authority.revalidate", "lease.readOrAcquire:acquired-and-read-back",
      "validate:policy-lock-high-water", "reconciliation.readByIdempotencyKey"
    ]);
  });
  ```

  Run:

  ```bash
  npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts
  npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/wake-supervisor.test.ts
  ```

  Expected: focused and cross-lane suites pass, proving fresh-process recovery,
  browser independence, mounted-only state, lease/policy/reconciliation-before-
  recovery, status/readback truth, stop cancellation/invalidation, and no
  duplicated wake/claim path.

- [ ] **Step 5: Run full gates, commit, and request fresh review**

  ```bash
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/local-runtime/src/wake-supervisor-runtime.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md
  git commit -m "feat: compose mounted wake supervisor runtime"
  ```

  The fresh reviewer verifies that construction uses actual R-provided mounted
  capabilities, no factory file changed, stop ownership remains service-side
  and emits no later local activity, all recovery comes from fresh readback,
  and the control port cannot smuggle an execution primitive.

## Task 141: U-Owned Supervision Routes And Panel

This is a required consumer contract and review gate, not an implementation
task W may perform. U receives its own exact coordinator authorization after
W 137, U 131, and R 140 are merged/rebased. Its exact files are:

- `packages/local-runtime/src/agent-supervision-routes.ts`
- `packages/local-runtime/test/agent-supervision-routes.test.ts`
- `packages/ui/src/agent/ResidentSupervisionPanel.tsx`
- `packages/ui/test/resident-supervision-panel.test.tsx`
- `docs/agentic/claims/task-141-resident-full-vision-w2-supervision-routes.md`

### Secret-Safe Diagnostics And Command Boundary

CF-1 freezes strict schemas and route paths. The U implementation must use the
following semantics, independently of whether CF-1 chooses a versioned path
prefix:

| Route intent | Allowed control-port call | Success meaning | Mandatory rejection |
| --- | --- | --- | --- |
| `GET` status | `control.status()` | Reads one strict `WakeStatusDto`; does not start or wake a service. | Any parsed path/provider/tool/policy/approval field; a malformed DTO becomes unavailable rather than a partial status. |
| `POST` wake signal | `control.signal()` | `accepted` means a normalized bounded signal entered the supervisor mailbox. | It cannot report provider/tool/task completion, call a scheduler directly, or accept source payloads beyond a strict request ID/source form frozen by CF-1. |
| `POST` pause | `control.pause()` | `accepted` is quiescence requested; only readback may yield `completed`. | Force flags, workspace paths, policy changes, approval material, or arbitrary command text. |
| `POST` resume | `control.resume()` | Requests full revalidation and at most one recovery wake. | Identity override, lock clearing, provider/tool selector, or cached-authority reuse. |
| `POST` recover | `control.recover()` | Supported explicit attempt from `unrecoverable`, still gated by revalidation/readback. | Forced success, state clearing, direct effect dispatch, or raw scheduler input. |

The panel consumes only strict browser-safe DTO parsers from U task 131. It
labels `accepted`, `completed`, and `blocked` literally; it never derives
completion from polling, a request response, local state, browser reconnect,
or focus. Its tests must submit unknown keys, tool/provider/path/policy/
approval/force fields, hostile objects, stale/cross-run DTOs, and secret-shaped
diagnostics and assert rejection/unavailable state with no control-port call.

```ts
it("rejects a force/tool/path payload before calling supervision control", async () => {
  const control = createControlSpy();
  const route = createAgentSupervisionRoutes({ control, authorizeLocalHuman: allowLocalHuman });

  const response = await route.handle(requestJson("POST", "/api/agent/supervision/resume", {
    requestId: "cmd_resume_1", force: true, toolId: "tool_x", workspacePath: "/unsafe"
  }));

  expect(response.status).toBe(400);
  expect(control.calls).toEqual([]);
});
```

U runs:

```bash
npm test -- packages/ui/test/resident-supervision-panel.test.tsx packages/local-runtime/test/agent-supervision-routes.test.ts
```

W's reviewer must reject a U route that imports `scheduler`, `ledger`, a
provider, a workspace writer, or a raw runtime rather than the narrow control
port, or that exposes an unsafe diagnostic property.

## RED/GREEN Command Matrix

| Task | RED assertion and command | GREEN command | Required full evidence before commit |
| --- | --- | --- | --- |
| 124 | Import/contract tests for `createWakeSupervisor`, `DurableSupervisorLeasePort`, and `ActiveClaimReconciliationPort` fail before the module exists: `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts` | Same command passes typed-port admission order, lease-held/available distinction, state/lease/coalescing/pause/recovery/stop/diagnostic cases. | `git diff --check`; `npm run factory:check`; `npm run verify`; fresh review. |
| 125 | Import/contract tests for `createPortableWorkspaceAvailabilityAuthority` and `PortableWorkspaceLifecyclePorts` fail before the module exists: `npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts` | Same command passes mount/identity/high-water/store/policy/lock/typed-reconciliation/idempotent-replay/no-fallback cases, including mount mismatch with no lease/reconcile/recovery call. | `git diff --check`; `npm run factory:check`; `npm run verify`; fresh review. |
| 137 | Import/contract tests for `createWakeSupervisorRuntime` fail before the module exists: `npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts` | `npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/agent/test/wake-supervisor.test.ts` passes typed admission, restart, and stop cancellation/invalidation cases. | `git diff --check`; `npm run factory:check`; `npm run verify`; fresh review. |
| 141 / U | Strict route/control parser fails on missing module or unsafe envelopes: `npm test -- packages/ui/test/resident-supervision-panel.test.tsx packages/local-runtime/test/agent-supervision-routes.test.ts` | Same command passes status/command labels and rejection cases. | `git diff --check`; `npm run factory:check`; `npm run verify`; fresh U review and W semantic review. |

Each claim records the actual exit code, safe concise result, committed SHA,
rebase SHA, fresh reviewer task ID/verdict, and clean-worktree state. A task
cannot replace RED with a non-failing smoke check, omit the named cross-lane
suite, or commit before full evidence.

## Section-Local Documentation Audit Contract

Before the Task 111 documentation-only commit, run this exact audit from the
repository root. It examines bounded sections rather than allowing a global
heading match to satisfy an unrelated obligation. Its counterfactuals must all
be rejected; changing the audit to a global `includes()`-only scan is a failed
Task 111 contract.

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const path = "docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md";
const source = readFileSync(path, "utf8");

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`missing heading: ${heading}`);
  const level = heading.match(/^(#+)/)?.[1].length ?? 0;
  const rest = text.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return text.slice(start, next < 0 ? undefined : start + heading.length + next);
}

function interfaceBlock(text, name) {
  const marker = `export interface ${name} {`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`missing interface: ${name}`);
  const end = text.indexOf("\n}", start);
  if (end < 0) throw new Error(`unterminated interface: ${name}`);
  return text.slice(start, end + 2);
}

function requireText(text, label, needle) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function rejectText(text, label, pattern) {
  if (pattern.test(text)) throw new Error(`${label}: forbidden ${pattern}`);
}

function ordered(text, label, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1);
    if (next < 0) throw new Error(`${label}: missing ${needle}`);
    if (next < cursor) throw new Error(`${label}: wrong order at ${needle}`);
    cursor = next;
  }
}

function validate(plan) {
  const frozen = section(plan, "### Planned Post-Freeze W Contract Surface");
  const lifecycle = section(plan, "### CF-1-Frozen Lifecycle Admission And Stop Sequence");
  const task124 = section(plan, "## Task 124: Wake Supervisor");
  const task125 = section(plan, "## Task 125: Portable Workspace Availability And Claim Reconciliation");
  const task137 = section(plan, "## Task 137: Wake Supervisor Runtime Assembly");
  const matrix = section(plan, "## RED/GREEN Command Matrix");
  const live = section(plan, "## Coordinator-Only Live Acceptance Posture");
  const rollback = section(plan, "## Rollback And Stop Conditions");

  const lease = interfaceBlock(frozen, "DurableSupervisorLeasePort");
  const reconciliation = interfaceBlock(frozen, "ActiveClaimReconciliationPort");
  requireText(lease, "lease port", "readOrAcquire(input: SupervisorLeaseAdmissionInput)");
  requireText(reconciliation, "reconciliation port", "readByIdempotencyKey");
  requireText(reconciliation, "reconciliation port", "appendAndReadBack");
  rejectText(lease, "lease port", /readonly\\s+(raw)?ledger\\s*:/i);
  rejectText(reconciliation, "reconciliation port", /readonly\\s+(raw)?(ledger|claim)\\s*:/i);
  ordered(lifecycle, "frozen admission order", [
    "1. revalidate mounted authority and manifest/workspace/resident identity;",
    "2. call `DurableSupervisorLeasePort.readOrAcquire()`",
    "3. validate the named operation's policy version/digest, active-lock digest,",
    "4. if an outage observation names an active claim",
    "5. only then may a resume or one bounded recovery wake enter `WakeRuntimePort`."
  ]);
  requireText(lifecycle, "lease-held distinction", "preserves `WorkspaceAvailabilityState` as `available`");
  requireText(lifecycle, "lease-held distinction", "performs no wake or reconciliation append");
  ordered(lifecycle, "unavailable distinction", ["`workspace-unavailable` is reserved for failed", "authority/readback; it invalidates the authority"]);
  ordered(lifecycle, "stop boundary", ["it closes intake,", "cancels timer and watcher registrations"]);
  requireText(lifecycle, "stop boundary", "no wake, provider, tool, artifact, ledger,");

  for (const [label, text, needles] of [
    ["Task 124", task124, ["DurableSupervisorLeasePort", "ActiveClaimReconciliationPort", "it(\"admits resume only", "it(\"stops intake", "npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts"]],
    ["Task 125", task125, ["PortableWorkspaceLifecyclePorts", "mount mismatch", "appendAndReadBack", "reads a matching prior reconciliation", "npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts"]],
    ["Task 137", task137, ["typed lease/typed", "reconciliation readback", "it(\"stops the service epoch", "npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts"]]
  ]) for (const needle of needles) requireText(text, label, needle);

  for (const needle of ["| 124 |", "typed-port admission order", "| 125 |", "idempotent-replay", "| 137 |", "stop cancellation/invalidation"]) requireText(matrix, "RED/GREEN matrix", needle);
  requireText(task125, "no-fallback proof", "### No-Fallback Counterfactual Proof");
  requireText(live, "live gate", "No Task 124, 125, 137, or 141 invocation calls a provider");
  requireText(rollback, "rollback", "no fallback storage");
}

function mustRejectCounterfactual(label, mutate) {
  try {
    validate(mutate(source));
  } catch {
    return;
  }
  throw new Error(`counterfactual passed unexpectedly: ${label}`);
}

validate(source);
for (const [label, mutate] of [
  ["remove lease port", text => text.replace("export interface DurableSupervisorLeasePort {", "export interface RemovedLeasePort {")],
  ["remove reconciliation append/readback", text => text.replace("appendAndReadBack", "appendWithoutReadback")],
  ["reverse admission order", text => text.replace("1. revalidate mounted authority and manifest/workspace/resident identity;", "1. issue a recovery wake before mounted revalidation;")],
  ["erase lease-held availability distinction", text => text.replace("preserves `WorkspaceAvailabilityState` as `available`", "sets workspace state unavailable")],
  ["erase stop counterfactual", text => text.replace("it(\"stops intake", "it(\"stops later")],
  ["erase mount mismatch proof", text => text.replace("mount mismatch", "mount changed")],
  ["erase no-fallback proof", text => text.replace("### No-Fallback Counterfactual Proof", "### Removed Proof")],
  ["erase Task 137 ownership/gate", text => text.replace("## Task 137: Wake Supervisor Runtime Assembly", "## Removed Task 137")]
]) mustRejectCounterfactual(label, mutate);

console.log("GREEN: Task 111 section-local lifecycle audit passed (8 counterfactuals rejected).");
NODE
```

## Fresh Review, Rebase, And Merge Gates

1. Before dispatch, the coordinator checks the exact CF-1 revision is an
   ancestor of the child worktree, records the worktree/branch/claim/model
   configuration/authorization in the append-only registry, and confirms each
   claimed production/test file has one owner.
2. After an implementer commits, a *fresh* reviewer reads the approved W spec,
   this plan, CF-1, the claim, and the diff against its stated base. The
   reviewer leads with defects, missing negative tests, provenance or
   readback gaps, ownership drift, diagnostic leakage, fallback-write paths,
   and command semantic drift. It does not edit production files.
3. A reviewer verdict of `needs-changes` creates a separately scoped repair
   authorization. After two focused repairs without recovery, the coordinator
   appends a root-cause checkpoint, changes worker/reviewer or counterfactual
   tactic, issues a new bounded authorization, and continues without treating
   that internal checkpoint as a user gate.
4. The coordinator confirms the exact reviewer-approved head, runs the named
   targeted and full commands again on the integrating checkout, and merges
   only into the resident-program integration branch. No worker or reviewer
   merges into `neo`.
5. Any merge that changes a frozen W/R interface forces downstream Task 137
   and Task 141 worktrees to rebase. The coordinator records old/new SHAs and
   repeats the cross-lane command before allowing review or merge.

## Coordinator-Only Live Acceptance Posture

No Task 124, 125, 137, or 141 invocation calls a provider or accesses a
credential. Their deterministic suites inject a safe blocked provider/tool
boundary only to prove authority invalidation and zero fallback writes.

After all owners merge, A-01 and A-02 are coordinator-controlled mounted
workspace acceptance gates. A-02 starts a browser-independent service, closes
the browser, restarts the process, disconnects/reconnects the mount, and
proves same identity, high-water, artifact-store, policy, lock, supervisor
lease, claim reconciliation, and mounted readback before a normal wake can
resume. Its record contains only schema versions, opaque IDs, safe categories,
hashes, event IDs, bounded counts, timestamps, and fixed markers.

The separate A-03 real Nous gate is the only provider-bearing acceptance. It
runs only under coordinator control with approved OS-secret-backed credentials
and current independent provider-byte-transfer approval. A failed or
unavailable provider gate is an honest safe blocked result; W never substitutes
a provider, model, credential, or claim of live success.

## Rollback And Stop Conditions

- On a production regression, disable supervisor service start through the
  R-owned composition/configuration gate after the coordinator records the
  safe blocked/degraded state. Do not remove, overwrite, or fabricate any
  lifecycle, lease, claim, or reconciliation event.
- A mounted authority or readback failure rolls forward into
  `workspace-unavailable`, `degraded`, or `unrecoverable` with a closed safe
  diagnostic; it does not retry unboundedly, switch storage, clear a lock, or
  use process memory as durable state.
- A workspace identity mismatch, stale/regressed high-water, swapped artifact
  root, changed policy/locks, missing active claim/attempt, or secret-shaped
  boundary input fails closed. Normal recovery waits for a later valid
  same-identity revalidation; no destructive repair is implied.
- Stop the child and report to the coordinator on a proposed shared
  schema/event/owner conflict, any fallback storage path, synthetic
  readback/lifecycle proof, data-loss risk, unavailable mandatory dependency,
  provider/credential-boundary expansion, or verifier failure after two
  focused repairs. The coordinator performs the documented recovery checkpoint
  and escalates to the user only if a new product/scope/safety/data-loss/
  credential/external-behavior decision is actually required.

## Acceptance Mapping

| Acceptance ID | Design requirement | Owning task and proof |
| --- | --- | --- |
| W-01 | Two supervisors race; one durable lease/readback holder wakes. | 124 deterministic lease race; losing supervisor has zero `WakeRuntimePort` calls. |
| W-02 | Browser closure does not stop supervision; bounded poll/event wake remains one attempt. | 124 and 137 browser-independent service tests with fixed clock. |
| W-03 | Bursts coalesce and recovery/poll limits are deterministic. | 124 mailbox/clock tests; no unbounded queue or waits. |
| W-04 | Pause closes intake, reports pending, and becomes paused only after readback; resume revalidates once. | 124 state/readback tests and 137 mounted binding test. |
| W-05 | Restart uses fresh objects and mounted replay only. | 137 fresh-process test; no old prompt/result/capability/callback object reachable. |
| W-06 | Disconnect at wake/provider/tool/artifact/readback blocks work and writes no fallback state. | 125 injected-boundary tests plus fallback sentinel. |
| W-07 | Wrong identity, unreadable mount, stale high-water, swapped store, changed policy/lock, or live lease fails closed. | 125 counterfactual matrix with no append/effect/fallback call. |
| W-08 | Bounded failure exhaustion is unrecoverable; explicit recovery still revalidates. | 124 recovery-limit test and 137 control-port test. |
| W-09 | Hostile diagnostic objects remain secret-safe and no getter runs. | 124/125 hostile-object parser tests and U 141 DTO/route parser tests. |
| W-10 | Routes reject execution selectors/force fields and label actual effects. | U 141 tests against only `SupervisionControlPort`. |
| W-11 | Every paused/recovered/reconciled completion has exact mounted event/readback evidence. | 124 lease/lifecycle tests, 125 idempotent reconciliation tests, and 137 service test. |
| W-12 | Stop closes intake, cancels timer/watcher work, invalidates authority, preserves only mounted resumable state, and causes no later wake/provider/tool/artifact/ledger activity. | 124 deterministic stop counterfactual and 137 service-epoch restart test; second epoch requires fresh typed admission. |
| A-01 | Mounted workspace survives fresh-process restart with zero fallback writes. | A acceptance fixture consumes reviewed 125/137 behavior. |
| A-02 | Browser closure, restart, disconnect/reconnect, same-identity revalidation, and resumable claim recovery all hold in the served composition. | Coordinator-run A-02 after all dependency merges; safe evidence only. |

## Plan Self-Review

- **Spec coverage:** Tasks 124, 125, and 137 cover one-resident process
  supervision, coalescing, pause/resume, restart, authority revalidation,
  active-claim release/checkpoint readback, no fallback, safe diagnostics, and
  command control. The U-only route/panel boundary, A-01/A-02 lifecycle
  acceptance, and A-03 provider posture are explicitly mapped without taking
  another lane's files.
- **Ownership and dependencies:** The plan gives W exclusive production/test
  paths, preserves R's factory and U's transport ownership, makes 137 wait for
  124/125/R132–135, and makes U 141 wait for U131/W137/R140. It requires
  documented rebases after contract changes.
- **Interface consistency:** `WakeRuntimePort` is the sole supervisor-to-
  runtime execution seam; `WorkspaceAvailabilityAuthority` is the sole
  authority seam; `DurableSupervisorLeasePort` and
  `ActiveClaimReconciliationPort` are the only lifecycle ledger-adjacent seams
  and expose only typed readback DTOs; `SupervisionControlPort` is the sole
  route seam. The frozen admission order and available-versus-lease-held versus
  unavailable distinction are named in Tasks 124, 125, 137, the matrix, and
  the audit.
- **Verification completeness:** Every executable task specifies an actual
  failing import/contract test, focused GREEN command, cross-lane command where
  needed, `git diff --check`, factory check, full verifier, commit scope, and
  fresh review. The section-local audit rejects eight port/order/readback/stop/
  lease-state/no-fallback/ownership counterfactuals instead of accepting global
  heading presence.
- **Scope and safety:** The plan contains no production change, no shared
  contract freeze, no live provider call, no newsroom/team expansion, and no
  fallback storage or self-merge path.
