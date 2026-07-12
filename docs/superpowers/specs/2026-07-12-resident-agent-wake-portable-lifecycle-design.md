# Resident Agent Wake And Portable Lifecycle Design

Date: 2026-07-12

## Purpose And Scope

This Wave 0 Lane W design specifies the background wake supervisor and the
portable-workspace lifecycle for Cestus's one resident agent,
`agent_default`. It turns the existing bounded, manually signalled scheduler
into a browser-independent service boundary without changing any production
contract in this task.

The design covers one-resident process supervision, wake coalescing, pause and
resume, bounded recovery, mounted-workspace authority, disconnect and restart
behavior, workspace identity and lock revalidation, secret-safe health
diagnostics, lifecycle command boundaries, and proof through readback. Task
103 produces this design and its claim only. It does not create an
implementation plan or alter runtime, UI, provider, test, route, or shared
contract files.

The program design at `811458d2` and implementation plan at `68fe8e87` govern
this document. The proposed names below are inputs to the Task 117 contract
freeze; they do not authorize an implementation or a schema change before that
freeze.

## Decisions

1. Cestus has exactly one durable resident identity, `agent_default`. A
   supervised process is an execution host for that identity, not another
   agent, provider, or source of truth.
2. The `WakeSupervisor` owns process lifetime, timer/event wake coalescing,
   pause quiescence, recovery attempts, and the exclusive supervision lease.
   The task orchestrator and approved-tool scheduler retain their existing
   domain decisions and effect gates.
3. The browser is a consumer and a signal source. Closing it cannot stop a
   healthy supervisor, and a browser command cannot directly invoke a
   scheduler, provider, tool, ledger append, or workspace write.
4. A mounted workspace is authoritative only while a fresh
   `WorkspaceAvailabilityAuthority` grants the requested capability. A
   process-local flag, path existence check, remembered identity, or local
   lock never grants that authority.
5. A disconnect, identity mismatch, unreadable mount, stale readback, or
   unavailable authority fails closed. Cestus writes no internal ledger,
   projection, artifact, derivative, cache, queue, journal, or alternate
   store in place of the portable workspace.
6. Lifecycle success is never inferred from a method return. A durable
   transition, handoff, claim action, or recovery is reported complete only
   after the mounted ledger/artifact readback named by its evidence record.

## Existing Boundaries Preserved

The landed scheduler's `wake()` is a bounded, one-pass inspection of the
append-only agent ledger. It acquires durable tool-execution claims, rebuilds
current previews, rechecks approval, provenance, freshness, and locks, and
returns `agent-scheduler-wake-result.v1`. It is not a daemon and must not grow
timer, browser, mount, or process-manager responsibilities.

`AgentRuntimeWakeResultDto` currently combines the task-orchestrator tick with
that scheduler wake. `WakeSupervisor` may request this composed wake through a
narrow runtime port only after workspace authority validation. It does not
replace the scheduler's consume-time approval checks, tool gateway, or
readback obligations.

The portable layout already resolves a manifest identity and the mounted ledger,
blob, derivative, job, projection, cache, and config roots. Lane W treats the
resolved layout as a candidate, not permanent authority. The future lifecycle
adapter must re-read the manifest and durable workspace facts at every recovery
boundary. It must not create a new layout or redirect writes to an app-data or
repository path when a mount is absent.

## Architecture

```text
browser / trigger / bounded poll / service restart
                   |
                   v
          WakeSupervisor signal mailbox
                   |
          one in-flight wake cycle
                   |
                   v
   WorkspaceAvailabilityAuthority.revalidate()
          |                         |
       unavailable               available
          |                         |
  safe blocked status       WakeRuntimePort.wakeOnce()
  ephemeral diagnostics              |
                              task orchestrator + scheduler
                              retain their normal gates
```

The signal mailbox is a bounded in-memory coalescer, not a durable task queue.
A lost signal is recoverable because bounded polling re-inspects durable
eligible work. Task and trigger creation remain ledger-backed responsibilities
of their owning lanes. The supervisor must never synthesize a task, approval,
handoff, or effect from an in-memory signal.

### Process And Scheduler Ownership

The future service host owns one `WakeSupervisor` per mounted workspace epoch.
It owns the timer, mount watcher, start/stop wiring, and cancellation signals.
It has at most one active wake cycle and at most one in-flight recovery cycle.
An OS/process-local mutex may reduce duplicate work in one process, but it is
not authority and cannot elect a resident after restart.

The elected supervisor records a short, renewable lease in the mounted,
append-only ledger and reads it back before treating itself as leader. The
lease is bound to the resident identity, opaque supervisor epoch, workspace
identity, policy version, and expiry. A competing process that sees an
unexpired valid lease reports `supervisor-lease-held` and performs no wake.
Takeover occurs only through the normal expired-lease/recovery protocol and
ledger readback; it never deletes, overwrites, or locally shadows another
process's state.

The supervisor invokes a `WakeRuntimePort`, which is the only path from
supervision into `wakeResidentAgent` or an equivalent frozen runtime adapter.
The port must expose a single bounded `wakeOnce` operation and cancellation
observation. It does not expose provider invocation, raw tool execution,
unrestricted task creation, workspace paths, or ledger append primitives.

## State Model

### Supervisor State

`WakeSupervisorState` has these mutually exclusive public values:

| State | Meaning | Permitted next states |
| --- | --- | --- |
| `initializing` | Service started; no leadership or workspace authority yet. | `running`, `workspace-unavailable`, `degraded`, `unrecoverable` |
| `running` | One valid lease and authority may service bounded wakes. | `pause-pending`, `recovering`, `workspace-unavailable`, `degraded`, `unrecoverable` |
| `pause-pending` | Intake is closed while the bounded active cycle reaches a durable or safely resumable boundary. | `paused`, `workspace-unavailable`, `degraded`, `unrecoverable` |
| `paused` | No new cycle begins; durable work remains for normal recovery after resume. | `recovering`, `workspace-unavailable`, `unrecoverable` |
| `recovering` | A bounded revalidation/replay attempt is active. | `running`, `paused`, `workspace-unavailable`, `degraded`, `unrecoverable` |
| `workspace-unavailable` | The mount cannot currently grant authority. No canonical write or effect may begin. | `recovering`, `unrecoverable` |
| `degraded` | A retryable failure exists, with a policy-bounded recovery schedule. | `recovering`, `workspace-unavailable`, `unrecoverable` |
| `unrecoverable` | Automatic recovery is exhausted or an invariant failure needs human repair. | `recovering` only after an explicit supported human command |

`paused` means the pause transition itself has completed its required durable
readback while the workspace is available. A request that merely begins
quiescence remains `pause-pending`; a route must not label it paused early.
`degraded` is retryable only within the current policy's bounded attempt count.
`unrecoverable` schedules no automatic retry and cannot be cleared by a
browser-side state update.

### Workspace Availability State

`WorkspaceAvailabilityState` is independent of supervisor state:

`verifying`, `available`, `unavailable`, `identity-mismatch`, `stale`,
`lock-blocked`, and `unrecoverable`.

`lock-blocked` means the authoritative lock readback prevents the requested
operation; it does not imply that the supervisor may clear, ignore, or replace
the lock. `stale` covers a changed ledger high-water, policy revision,
projection/readback proof, or artifact-store identity after a previously valid
authority. `unavailable` includes absent, unreadable, or disconnected mounts.

The external status projects both state machines, so a consumer can distinguish
an intentionally paused healthy mount from a running process blocked by an
unavailable mount. It must not collapse `identity-mismatch` into an ordinary
retryable disconnect.

### Required Transitions

```text
startup -> verifying -> available -> lease/readback -> running
running -> pause-pending -> quiesce/readback -> paused
paused -> resume request -> revalidate/replay -> running
running|paused|recovering -> mount loss -> workspace-unavailable
workspace-unavailable -> same-identity revalidation -> recovering -> running|paused
recoverable fault -> degraded -> bounded recovery -> running|unrecoverable
process restart -> verifying -> replay/readback -> recovering -> running|paused
```

On mount loss, the supervisor immediately closes intake, cancels work not yet
committed to an effect boundary, and invalidates all authority tokens. An
in-flight operation whose durable outcome cannot be read back becomes
indeterminate and is recovered through normal claim/handoff replay; it is not
reported as completed or failed by guesswork.

If the mount is already unavailable, the supervisor cannot append a release or
failure event without violating the no-fallback rule. It retains only bounded,
secret-safe ephemeral diagnostics and records later durable recovery evidence
only after the same workspace is revalidated. That later event must identify
itself as post-reconnect evidence rather than asserting that a ledger event was
written at disconnect time.

## Portable Workspace Authority

### `WorkspaceAvailabilityAuthority`

Task 117 should freeze a capability with this conceptual shape under the W/R
contract family:

```ts
interface WorkspaceAvailabilityAuthority {
  readonly contractVersion: "workspace-availability-authority.v1";
  inspect(): Promise<WorkspaceAvailabilityDto>;
  revalidate(input: WorkspaceRevalidationInput): Promise<WorkspaceAuthorityResult>;
  invalidate(reason: WorkspaceInvalidationReason): void;
}

interface WorkspaceRevalidationInput {
  readonly operation: "wake" | "pause" | "resume" | "recovery" | "scheduler" | "provider" | "tool" | "artifact";
  readonly expectedWorkspaceId: string;
  readonly requiredCapabilities: readonly WorkspaceWriteCapability[];
  readonly priorEvidence?: WorkspaceAuthorityEvidenceRef;
}

type WorkspaceAuthorityResult =
  | { readonly ok: true; readonly authority: VerifiedWorkspaceAuthority }
  | { readonly ok: false; readonly unavailable: WorkspaceUnavailableResult };
```

`VerifiedWorkspaceAuthority` is an opaque, short-lived process capability. It
is not serializable and cannot be reconstructed from a DTO. Every operation
that could claim, call a provider, invoke a tool, append, write an artifact, or
advance a lifecycle transition receives this capability immediately before the
operation and validates it again at its post-operation readback boundary.

`WorkspaceAvailabilityDto` is browser-safe and serializable. It exposes only
safe IDs, states, policy/lock/high-water digests, counts, timestamps, evidence
references, and supported next command identifiers. It never exposes an
absolute path, raw mount error, volume serial, process environment, credential
reference value, source bytes, prompt text, artifact content, or OS command.

### Revalidation Contract

For a successful authority grant, the adapter must take one normalized,
plain-data snapshot and prove all of the following before an effect begins:

1. The mount and canonical workspace layout are readable and refer to the
   configured root without unsafe path resolution.
2. The current manifest identity equals the expected workspace identity, and
   the mounted ledger's resident identity stream binds `agent_default` to that
   workspace.
3. The ledger opens on the mounted layout and provides the expected current
   high-water/readback identity; a lower, swapped, corrupted, or incompatible
   replay is rejected.
4. Required mounted artifact and derivative stores resolve under the same
   verified layout; no internal alternate path is eligible.
5. The applicable policy version and policy digest match the operation's
   declared posture.
6. Active operational locks are rebuilt from authoritative ledger state and
   block any operation they govern. A supervisor lease is additionally checked
   as a distinct mutual-exclusion fact.
7. The returned evidence is normalized, frozen, and secret-safe before the
   adapter awaits a provider, scheduler, filesystem, or process boundary.

The authority invalidates on mount watcher loss, read/write error, manifest
change, failed post-operation readback, lease loss, high-water contradiction,
policy/lock change, or explicit shutdown. Invalidation is monotonic for that
authority instance: a stale token cannot become valid again. A new authority
requires a complete revalidation, never a boolean reset.

### No Fallback Storage

When authority is absent, every write-capable dependency must be absent or
wrapped with a fail-closed `WorkspaceUnavailableResult`. This includes the
ledger, projections, blobs, derivatives, job/checkpoint state, wake queue,
recovery journal, local cache, and logs that could become a replay source.
Process memory may contain a bounded health snapshot solely to render current
safe diagnostics; it cannot be replayed as durable work, written to disk, or
used to resume an operation without fresh mounted readback.

The supervisor may poll mount availability while unavailable, but polling only
inspects the candidate mount. It cannot create directories, seed a ledger,
copy a previous workspace, change expected identity, clear locks, or invoke a
provider/tool scheduler.

## Wake, Pause, Resume, And Recovery

### Wake Policy

`WakePolicyV1` is versioned and supplied by the frozen policy owner. It must
include a policy version/digest, minimum and maximum poll intervals, maximum
coalesced signals, maximum recovery attempts per lifecycle epoch, pause
quiescence deadline, supervisor lease duration, and maximum concurrent wake
cycles fixed at one. All durations and limits are finite positive values, and
the minimum interval cannot exceed the maximum interval.

Wake sources are `startup`, `poll`, `event`, `command`, and `recovery`. A
source records an opaque idempotency key plus durable source-event references
when they exist. The supervisor coalesces equivalent pending signals and runs
one bounded cycle. It must not use unbounded retry, uncontrolled recursion,
or a signal backlog as a substitute task store. Deterministic tests inject the
clock, timer, source stream, and recovery policy; production jitter, if any,
must be represented by a deterministic injected policy value.

### Pause And Resume

Pause is a local supervised-lifecycle control, not a permission bypass. A
valid pause request:

1. Closes new wake intake and records only a request acknowledgement until
   quiescence completes.
2. Prevents a new claim, provider call, tool execution, or artifact write from
   starting after the gate closes.
3. Gives an active cycle only the policy-bounded time to reach a durable
   readback, cancellation, or explicitly resumable claim boundary.
4. Appends and reads back the durable paused transition only if mounted
   authority remains valid. Otherwise it reports `workspace-unavailable` with
   an ephemeral diagnostic.

Resume first performs the full workspace revalidation and durable replay. It
then renews/acquires the exclusive supervisor lease, rebuilds claims and
handoffs from the mounted ledger, and performs at most one recovery wake. It
does not replay an in-memory callback, issue a synthetic continuation, or
silently clear a lock, approval, budget, or prior failure.

### Bounded Recovery

Recovery is scoped to one supervisor epoch and policy version. Each attempt
has a safe start/finish status, a reason category, and an evidence result. A
retryable failure can schedule another attempt only while the policy count and
time window permit it. Exceeding either limit enters `unrecoverable` with no
automatic retry.

Recovery after a process crash starts from a fresh service object. It reads the
mounted ledger, reconstructs projections, observes lease expiry or ownership,
and lets existing claim/scheduler rules determine whether work is resumable.
It must not reuse an old runtime object, old capability, cached provider
result, remembered prompt, or uncommitted output.

## Stable DTO, Evidence, And Error Vocabulary

### Public DTOs

The contract freeze should define strict Zod schemas and matching TypeScript
types for these browser/runtime transport values:

- `WakeStatusDto` with schema version `resident-wake-status.v1`.
- `WorkspaceAvailabilityDto` with schema version
  `workspace-availability.v1`.
- `WakeSupervisorCommandResultDto` with schema version
  `resident-wake-command-result.v1`.
- `WorkspaceUnavailableResult` with schema version
  `workspace-unavailable-result.v1`.
- `WakeLifecycleEvidenceDto` with schema version
  `resident-wake-evidence.v1`.

`WakeStatusDto` contains the resident ID, generated timestamp, supervisor
state, workspace state, policy version/digest, next eligible wake timestamp
when known, bounded recovery counters, active-cycle indicator, safe health
diagnostics, allowed command identifiers, and durable/ephemeral evidence
markers. It does not contain a capability token, raw process identifier,
absolute path, unredacted mount label, unbounded error data, or arbitrary
command text.

`WakeSupervisorCommandResultDto` distinguishes `accepted`, `completed`, and
`blocked`. `accepted` means only that a normalized request was admitted to the
supervisor; `completed` requires the named lifecycle evidence readback;
`blocked` contains a `WorkspaceUnavailableResult` or other safe failure. UI
labels must use those exact meanings.

`WorkspaceUnavailableResult` contains a closed category, retryability,
operation, safe diagnostic ID, permitted next commands, and whether the
diagnostic is ephemeral or ledger-backed. It has no generic error string field.
`WakeLifecycleEvidenceDto` binds a transition to the workspace ID, opaque
supervisor epoch, policy version/digest, identity-event reference, ledger
high-water evidence, lock-state digest, causation/correlation references, and
the exact lifecycle event/readback IDs when persistence was possible.

### Event And Provenance Requirements

After freeze, durable lifecycle records use an `agent.wake.*` event family at
version 1 with explicit transition type, resident ID, workspace ID, supervisor
epoch, policy version, causation, correlation, identity evidence, high-water
proof, lock-state proof, and outcome category. Candidate event names are
`agent.wake.supervisor.lease.claimed`,
`agent.wake.supervisor.pause.requested`,
`agent.wake.supervisor.paused`,
`agent.wake.supervisor.resume.requested`,
`agent.wake.supervisor.recovery.verified`,
`agent.wake.supervisor.degraded`, and
`agent.wake.supervisor.unrecoverable`.

The freeze must validate the names against existing ontology event contracts
and assign their sole production owner. It may rename a candidate only through
an append-only freeze decision that updates every declared consumer together.
No event may be rewritten to alter an earlier lifecycle conclusion.

Every durable transition has an actor, causation ID, correlation ID, exact
source event/artifact references where applicable, and a readback proof. An
ephemeral disconnect observation has no fabricated event ID and is explicitly
labelled `ephemeral`; once the mount returns, the recovery record distinguishes
its new ledger observation time from the earlier observed outage time.

### Versioning And Compatibility

All public values validate a literal schema version and reject unknown fields,
unsafe keys, accessors, custom arrays, symbols, custom serializers, and
non-plain objects. Additive transport changes require a new schema version and
an explicit adapter; consumers must not loosen an older parser or alias it to a
newer shape. Event version changes use a new event version and append-only
projector support. A status projection remains rebuildable from durable events
plus an explicitly non-durable current availability observation.

### Secret-Safe Diagnostics

`WakeHealthDiagnosticDto` uses a closed severity and category enum. Required
categories include `workspace-unavailable`, `workspace-identity-mismatch`,
`workspace-readback-failed`, `active-lock`, `supervisor-lease-held`,
`scheduler-unavailable`, `recovery-exhausted`, `pause-quiescence-timeout`,
`data-loss-risk`, `secret-detected`, and `unrecoverable`.

Diagnostics may carry a generated safe ID, count, safe fixed message, allowed
command identifiers, safe event IDs, content hashes, policy digest, and
durability marker. They reject raw `Error` objects, stack traces, OS error
text, path or URI values, mount labels, provider responses, prompt/output text,
credential/reference material, source bytes, raw command arguments, and
unknown diagnostic properties. Sanitization happens once on plain own-data
input before any log, DTO projection, append, or await. A sanitation failure
returns the fixed `secret-detected` diagnostic and cannot trigger a fallback
write.

## Lifecycle Command And Route Boundaries

The U lane owns browser route and component implementation after the frozen W
DTOs exist. W owns the contract semantics; U owns transport/parser adoption;
R later composes the supervisor capability into the default runtime factory.
The anticipated supervision route module must expose only:

| Boundary | Effect |
| --- | --- |
| `GET` supervision status | Reads one safe `WakeStatusDto`; it cannot start a service. |
| `POST` wake signal | Admits one validated signal; it never reports task/tool/provider completion. |
| `POST` pause | Requests bounded quiescence; the response distinguishes accepted from readback-complete. |
| `POST` resume | Requests revalidation and bounded recovery; it cannot override identity, locks, or policy. |
| `POST` recover | Performs a supported explicit revalidation attempt from `unrecoverable`; it cannot force success. |

Every mutation route requires the existing local human/auth policy and accepts
only a strict empty or schema-defined command envelope with a safe request ID.
It rejects arbitrary tool IDs, provider IDs, workspace paths, policy values,
approval material, artifact references, raw scheduler input, and force flags.
The route calls a supervision control port rather than a scheduler or ledger
directly. Existing scheduler wake routes retain their current limited meaning
until a frozen migration explicitly changes them; no UI control may relabel a
signal as successful execution.

Commands do not send PRRs, transfer provider bytes, export/publish, clear legal
locks, accept graph truth, perform destructive repair, or mutate a workspace
identity. Resume and recovery still pass through every existing approval,
freshness, provenance, lock, budget, and provider gate when later normal work
is selected.

## Ownership And Consumer Boundaries

| Area | Future owner | Consumers and restriction |
| --- | --- | --- |
| Wake state, lease, wake coalescing, pause/recovery semantics | W, beginning with `packages/agent/src/wake-supervisor.ts` | R consumes a frozen capability; scheduler remains independent. |
| Mount detection, authority issuance, invalidation, revalidation | W, beginning with `packages/local-runtime/src/portable-workspace-lifecycle.ts` | R and W runtime integration receive only its narrow authority/result types. |
| Wake/runtime assembly | W for `packages/local-runtime/src/wake-supervisor-runtime.ts` after prerequisites | It consumes R's actual mounted capabilities; it does not edit the default factory. |
| Default runtime factory | R only | R composes merged W/H/P/L capabilities after their required predecessor commits. |
| Supervision routes and cockpit | U only | U parses frozen W DTOs and invokes safe commands; it owns no execution truth. |
| Trigger task creation | T only | W receives wake signals; it cannot create trigger tasks or prompts. |
| Plan/tool budgets and tool selection | L only | W limits cycles and recovery, never broadens specialist permissions. |
| Provider registration and secrets | P only | W observes safe readiness; it never resolves or stores secrets. |
| Cross-lane failure acceptance | A only | A returns defects to owners and does not repair their production code without authorization. |

No lane may make W's proposed contracts canonical before Task 117. A conflict in
event names, DTO field ownership, lifecycle state meaning, or route ownership
is a stop condition for implementation and returns to the coordinator's
append-only freeze decision.

## Deterministic Verification Design

The later W implementation plan must use injected clock, timer, mount watcher,
filesystem, ledger, scheduler/runtime port, and service-host seams. Standard
tests remain credential-free and must include these cases:

1. Two supervisors race on one mounted ledger; exactly one gets the durable
   lease/readback and the other cannot call the wake port.
2. Closing the browser does not stop a running supervisor; a bounded poll or
   durable event signal still produces one wake attempt.
3. Burst signals coalesce into one wake cycle, and a fixed clock proves the
   poll and recovery limits without nondeterministic waits.
4. Pause closes intake before a new claim/effect, reports `pause-pending`
   while quiescing, and becomes `paused` only after durable readback. Resume
   revalidates and runs at most one bounded recovery wake.
5. A process restart constructs fresh supervisor/runtime objects, replays only
   mounted durable state, and neither duplicates claims nor reuses in-memory
   prompts, results, capabilities, or callbacks.
6. Disconnect before a wake, during a provider/tool boundary, and during an
   artifact/readback boundary blocks new work, invalidates authority, produces
   no internal fallback write, and leaves an indeterminate outcome resumable
   only through ledger replay.
7. Reconnect with a wrong manifest identity, unreadable manifest, stale or
   regressed high-water, swapped artifact root, changed policy, active lock, or
   another valid supervisor lease fails closed with a distinct safe category.
8. Recoverable scheduler, mount, and post-write readback failures exhaust the
   exact policy budget into `unrecoverable`; an explicit human recover command
   cannot clear the state until revalidation/readback succeeds.
9. Adversarial diagnostics containing secret-shaped keys/values, getters,
   symbols, custom arrays, raw errors, paths, and provider-shaped objects are
   rejected or converted to the fixed safe diagnostic without invoking a
   surprising getter.
10. Route tests reject body fields that could choose a tool, provider, path,
    policy, approval, or force action; response labels match actual command
    effects.
11. Every durable claimed recovery/paused/running outcome includes its expected
    event and mounted readback evidence; missing readback cannot project a
    terminal-looking success.

Expected focused suites after implementation are:

```bash
npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts
npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts
npm test -- packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/agent/test/wake-supervisor.test.ts
npm test -- packages/local-runtime/test/agent-supervision-routes.test.ts packages/ui/test/resident-supervision-panel.test.tsx
```

The implementation plan must add exact RED assertions for each owner task,
then run the relevant focused GREEN command, cross-lane command, `git diff
--check`, `npm run factory:check`, and `npm run verify` before its task commit.

## Later Live Acceptance

Lane A's A-02 acceptance is the authoritative integrated disconnect/reconnect
gate. It must use an actual mounted workspace fixture with no portable secret
material, start a browser-independent supervised service, close the browser,
restart the service process, disconnect/reconnect the mount, and prove the
same identity, high-water, policy, lock, ledger, and artifact-store facts are
revalidated before normal wake resumes.

The live record may contain only schema versions, supervisor/workspace opaque
IDs, safe state categories, policy/high-water hashes, event IDs, artifact
hashes, counts, timestamps, and fixed markers. It may not contain source
content, prompt text, provider output, credential material, raw mount paths,
or command output. Provider-specific live invocation remains governed by the
separate real Nous acceptance gate; a wake lifecycle pass cannot fabricate that
provider evidence.

## Merge, Rebase, And Stop Rules

Task 103 stops after this specification and its claim receive the required
documentation checks and one commit. A fresh coordinator review and written
W-spec approval gate all Task 111 planning work. This task does not create a
Task 111 plan, implementation work order, worker, or merge.

After all Wave 0 specifications and plans have their approvals, Task 117 is
the sole contract-freeze owner. It resolves candidate names, schemas, event
versions, file ownership, consumer adapters, targeted suites, and merge order.
The W foundation tasks must start from the freeze SHA, rebase after every
contract-changing predecessor merge, and rerun the named cross-lane suite
before review. W does not merge itself into `neo`; the coordinator records
review, rebase, integration, and no-self-merge decisions.

Implementation stops and escalates for data-loss risk, any fallback-storage
path, workspace identity mismatch requiring a new policy choice, unresolved
schema/event/DTO/owner conflict, synthetic lifecycle/readback evidence,
unavailable mandatory dependency, a provider/secret boundary expansion, or
two focused repair attempts without verifier recovery.

## Spec Self-Review

- One resident identity, supervisor/process ownership, and scheduler separation
  are explicit.
- Pause, resume, reconnect, crash recovery, degraded, and unrecoverable
  semantics distinguish acknowledgement from durable completion.
- Portable authority requires identity, mounted store, high-water, policy, and
  lock revalidation and forbids every internal fallback store.
- DTOs, events, errors, provenance, compatibility, and diagnostics have
  versioned secret-safe contracts with no fabricated durable evidence.
- Route, owner, consumer, test, live acceptance, rebase, merge, and stop
  boundaries align with the governing program plan.
