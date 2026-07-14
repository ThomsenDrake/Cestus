# Task 124 — Bounded Wake Supervisor

## Claim

- **Status:** in-progress
- **Branch / base:** `codex/task-124-resident-full-vision-wake-supervisor` from
  `3aa4df963633c16d9fb95e79fa30f5fc59e833a7`.
- **Frozen contract:**
  `docs/agentic/resident-agent-full-vision-contract-freeze.md@573de0ee390f43987f46cff46f044a4fd21c16e8`;
  W1-119 is already represented in the coordinator base.
- **Governing documents:**
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`,
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`,
  `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md`, and
  `docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md`.
- **Owned files only:** `packages/agent/src/wake-supervisor.ts`,
  `packages/agent/test/wake-supervisor.test.ts`, and this append-only claim.
- **Forbidden:** Relay B or another worktree; `neo`; local runtime, portable
  workspace, browser, provider, tool, artifact, raw ledger, raw claim-storage,
  route, factory, scheduler, runtime, runtime-types, and shared-contract files.
- **Authorization:** the coordinator explicitly authorizes
  `superpowers:subagent-driven-development`, test-driven development, fresh
  independent review, and verification-before-completion. This worker does not
  self-review, integrate, or merge.
- **Host record:** the standing program delegation accepts host-reported GPT-5
  for the requested GPT-5.6 Terra / Extra High configuration.

## Frozen implementation boundary

Implement only a browser-independent, bounded `WakeSupervisor` with strict,
safe DTO parsing and typed fakeable ports. It normalizes and freezes finite
signals, coalesces by source/idempotency key, admits a wake only after exactly
one revalidation and typed lease/readback against an immutable admission
snapshot, and exposes typed durable-claim/reconciliation readback seams. It
implements bounded recovery plus pause and stop state transitions. It never
gets a storage path or raw write API and never invokes a provider, tool,
artifact, ledger, graph, browser, local runtime, filesystem, or external
effect.

## Verification and stop point

1. Write and run the RED test with
   `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts`.
2. Implement the smallest production change, then rerun that exact command,
   `git diff --check`, and `npm run factory:check`.
3. Do **not** start `npm run verify` while another program verifier is active;
   wait for coordinator clearance, capture the one full gate, commit only the
   three owned files, and stop for a fresh independent review.

Any schema conflict, untyped/raw-storage pressure, external behavior,
credential requirement, or repeated focused verifier failure is returned to
the coordinator as a recovery checkpoint.

## Initial TDD checkpoint — 2026-07-13

- The first exact focused command initially exited `127` because this isolated
  worktree did not have ignored dependencies (`vitest: command not found`).
  `npm ci --ignore-scripts` restored the lockfile-pinned tree without tracked
  changes. The rerun then exited `1` for the intended RED cause:
  `Cannot find module '../src/wake-supervisor.js'`; the unchanged scheduler
  suite passed 15 tests.
- The first bounded GREEN implementation defines only the owned typed supervisor
  boundary: finite plain-data signal normalization, frozen mailbox snapshots,
  source/idempotency coalescing, one authority revalidation, one typed lease
  readback, immutable admission matching, a narrow runtime `wakeOnce` port,
  and closed diagnostic/status DTO parsing. It neither imports nor accepts any
  local-runtime, storage-path, provider, tool, artifact, browser, raw ledger,
  raw claim, graph, or external-effect capability.
- GREEN evidence: `npm test -- packages/agent/test/wake-supervisor.test.ts
  packages/agent/test/scheduler.test.ts` exited `0` with 2 files and 16 tests
  passing. `git diff --check` was empty and `npm run factory:check` printed
  `factory-readiness passed`.
- Remaining work in this same authorized slice is the planned pause/stop,
  resume/recovery, reconciliation-readback, recovery-limit, and adversarial
  boundary coverage. No full verifier, commit, review, integration, or merge
  has been attempted; full verification remains serialized under coordinator
  control.

## Pause-transition TDD checkpoint — 2026-07-13

- RED: after adding the typed pause/readback expectation, the exact focused
  command exited `1` with `TypeError: supervisor.pause is not a function`.
- GREEN: the supervisor now closes intake before the typed pause seam, reports
  `pause-pending` while the seam is unresolved, and exposes `paused` only when
  `pauseAndReadBack` succeeds. Later signals are blocked and cannot invoke the
  runtime port. The narrow seam receives only a parsed command ID plus the
  frozen resident/epoch identifiers; it has no storage or effect capability.
- GREEN evidence: the exact focused command exited `0` with 2 files and 17
  tests passing; `git diff --check` was empty and `npm run factory:check`
  printed `factory-readiness passed`. Full verification remains unstarted.

## Retained full verification — 2026-07-13

- Coordinator-cleared single full gate: `npm run verify` exited `0` in this
  Task124 worktree. It reported `typecheck passed`; 191 test files passed with
  3 skipped; 2,255 tests passed with 5 skipped; the Vite production build
  passed; and `factory-readiness passed`. The Vite chunk-size advisory is
  pre-existing build output and does not alter this task's scope.
- Final local scope check is limited to this claim plus
  `packages/agent/src/wake-supervisor.ts` and
  `packages/agent/test/wake-supervisor.test.ts`. This worker now stops for a
  fresh independent review and does not self-integrate or merge.

## Coordinator Full-Contract Repair Authorization

- Independent review rejected `06ceea5b3281baf8f26beab5b74f529f0b2c9e13` as
  a partial supervisor. It lacks `start`, `resume`, `recover`, and `stop`; an
  active-claim reconciliation/readback port; complete immutable authority,
  high-water, policy/lock, causation, and correlation snapshot bindings;
  strict lease/readback tuple provenance; versioned public lifecycle DTOs;
  one-active-cycle/abort/stop/fresh-epoch behavior; and the corresponding
  adversarial coverage. The candidate is preserved, rejected, and unintegrated.
- A fresh repair author owns only this same Task124 source, test, and claim
  worktree/branch. Implement the complete frozen W lifecycle rather than a
  compatibility shim: exact one-revalidation admission, typed lease and active
  claim reconciliation ports, full tuple/readback validation, immutable
  snapshot discard/restart, finite backoff/recovery, pause/resume/stop with
  in-flight/timer cancellation and no later signal/effect, fresh-epoch restart,
  strict hostile-DTO rejection, and safe versioned status/result evidence. No
  raw storage, local-runtime, provider, tool, artifact, graph, browser, or
  external dependency/effect is allowed.
- RED/GREEN must cover held/stale/substituted lease/readback, complete
  provenance tuple, reconciliation, recovery limit, concurrent distinct
  signal, disconnect/unavailable authority, pause/stop no-effect, fresh epoch,
  and safe diagnostics. Standing SDD/TDD/verification authority applies;
  focused/diff/factory, one serialized full gate, scoped commit, and a fresh
  reviewer distinct from author and this reviewer are mandatory. No
  self-integration or `neo` merge is authorized.

Status: in-progress only in this complete-contract repair; the prior partial
candidate remains preserved and unintegrated.

## Complete-Contract Repair RED/GREEN Evidence — 2026-07-13

- Fresh replacement author worked only in this isolated repair worktree at
  authorization `8dae042eebe5cb913f342a9c9fc04c42fa9b9f81`; no Relay B,
  prerequisite, or `neo` file was touched.
- Initial focused invocation was dependency-blocked before discovery with
  `sh: 1: vitest: command not found`. The standard isolated recovery
  `npm ci --ignore-scripts` restored only ignored dependencies and left tracked
  files unchanged. The actual RED command
  `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts`
  then failed with `TypeError: supervisor.start is not a function` (one failed,
  seventeen passing tests), proving the missing public lifecycle boundary.
- The expanded deterministic RED/GREEN matrix drives versioned `start`,
  `pause`, `resume`, `recover`, and terminal `stop`; one immutable authority
  admission plus full lease/policy-lock/high-water tuple; typed active-claim
  reconciliation lookup/append/readback; swapped provenance rejection with zero
  runtime/reconciliation effect; competing-lease no-effect; exact recovery
  exhaustion; abort/no-later-effect stop behavior; and hostile/omitted/unknown/
  sparse public DTO rejection without getter execution.
- GREEN: the exact focused command exited `0`: 2 files and 28 tests passed.
  `npm run typecheck` printed `typecheck passed`; `git diff --check` was empty;
  and `npm run factory:check` printed `factory-readiness passed`. No full
  verifier was started until the coordinator released the serialized slot.
- The replacement still owns only this claim, `packages/agent/src/wake-supervisor.ts`,
  and `packages/agent/test/wake-supervisor.test.ts`. A single retained full
  verification run and fresh independent review remain required before any
  coordinator integration.

## Complete-Contract Repair Full Verification — 2026-07-13

- Coordinator released the serialized verifier slot after Relay B Task120's
  clean checkpoint `43eb9642cc08f1646b1c1defe5a15e8aab5c2149`; this repair
  then ran exactly one retained `npm run verify` in its isolated worktree.
- Exit `0`: typecheck passed; 191 test files passed with 3 skipped; 2,266
  tests passed with 5 skipped; Vite production build passed; and
  `factory-readiness passed`. The Vite chunk-size advisory was non-failing
  build output and does not alter this task's owned boundary.
- The candidate is ready only for a fresh independent read-only review. This
  author will not self-review, self-integrate, or merge `neo`.

## Coordinator Second Repair Authorization — Reconciliation and Admission Boundary

- Fresh review rejected clean candidate `9d5632b93943df44b3af14110f1bdf42cb2d23c2`.
  It remains preserved and unintegrated. This bounded second repair starts on
  branch `codex/task-124-resident-full-vision-wake-supervisor-repair-2` from
  that exact candidate and may change only this claim,
  `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts`.
- Before source edits, write focused RED coverage for every finding: (1) the
  canonical reconciliation record and idempotency key must bind workspace,
  epoch, safe outage-observation ID, prior-claim event, claim, attempt, lease,
  and revalidated authority rather than a reduced outage shape; (2) pause or
  stop during every pre-wake await must prevent later lease, reconciliation,
  wake, or intake reopening; (3) public/port readbacks must be descriptor-safe
  plain own-data snapshots with nonempty, non-regressed exact
  lease/readback/high-water and full policy/lock/causation/correlation checks;
  and (4) versioned public lifecycle status/result/evidence must bind the
  requested transition and exact workspace/epoch/lock/high-water facts.
- Required counterfactuals include changed outage observation or prior claim
  under the same claim/attempt/lease; pause while authority, lease, or
  reconciliation is pending; stopped/paused resume or recovery attempting a
  later wake; empty/stale/getter-backed lease/readback; and a completed result
  with a mismatched transition or stale high-water. Every rejection must be
  fail-closed with zero later runtime/reconciliation/provider/tool/artifact/
  graph/external effect and a safe diagnostic.
- Authority is explicit Cestus factory workflow, `superpowers:subagent-driven-development`
  where relevant, TDD, verification-before-completion, fresh independent
  review, no self-integration, and no `neo` merge. Run the exact focused
  command, diff/factory, one serialized retained full verification, commit the
  three-file scope, and stop for a reviewer distinct from every Task124 author
  and reviewer. A further material review finding is a root-cause recovery
  checkpoint, not another routine repair loop.

## Second Repair RED/GREEN Evidence — 2026-07-13

- Fresh repair author worked only in
  `codex/task-124-resident-full-vision-wake-supervisor-repair-2` at clean
  authorization `c3bcbbcc2515ad33e2306c702afb93d13d999367`; the rejected
  `9d5632b93943df44b3af14110f1bdf42cb2d23c2` candidate remains preserved.
- The first exact focused invocation was dependency-blocked because this
  isolated worktree lacked `vitest`. `npm ci --ignore-scripts` restored only
  lockfile-pinned ignored dependencies. The actual RED then failed with nine
  intended regressions: reduced reconciliation record/key provenance,
  pause/stop continuation through authority/lease/reconciliation awaits,
  empty/stale/getter/proxy lease readbacks, and terminal lifecycle transition
  plus high-water/status binding.
- GREEN snapshots every port return as descriptor-safe own data before any
  property read; validates exact nonempty lease, policy, lock, causation,
  correlation, and expected high-water fields; makes closure terminal for the
  epoch across all admission awaits; and publishes strict transition-bound
  workspace/epoch/lock/high-water lifecycle status and command result facts.
  Canonical reconciliation records and their keys now bind workspace, epoch,
  safe outage observation, prior claim/lease, claim, attempt, verified lease,
  and revalidated authority evidence.
- GREEN evidence: `npm test -- packages/agent/test/wake-supervisor.test.ts
  packages/agent/test/scheduler.test.ts` exited `0` with 2 files and 37 tests
  passing. `git diff --check` was empty and `npm run factory:check` printed
  `factory-readiness passed`. The serialized `npm run verify` slot was
  requested from the coordinator and has not been started.

## Second Repair Retained Full Verification — 2026-07-13

- The coordinator granted the Task124-only serialized verifier slot. Exactly
  one retained `npm run verify` then completed in this isolated worktree with
  exit `0`: typecheck passed; 191 test files passed with 3 skipped; 2,275
  tests passed with 5 skipped; the Vite production build passed; and
  `factory-readiness passed`.
- Final handoff remains restricted to this claim,
  `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts`. The author does not
  self-integrate or merge `neo`; a reviewer distinct from every prior Task124
  author and reviewer is required next.

## Fresh Review Rejection And Bounded Forward Repair — 2026-07-13

- Fresh review returned `NEEDS-CHANGES` for candidate
  `22784e301f98b866d27171b518830538f67cecf3`. The candidate remains preserved
  in forward history. The coordinator authorized one bounded repair in the
  same three-file scope; no reset, rebase, self-integration, or `neo` change is
  authorized.
- Correction to the preceding second-repair evidence: “makes closure terminal
  for the epoch” applies to `stop()` and to the already-cancelled admission
  revision, not to a successfully completed pause. A paused supervisor must
  admit a later fresh `resume` or `recover` cycle through new authority, lease,
  and reconciliation validation. Conversely, `stop()` while
  `pauseAndReadBack()` is pending must prevent paused evidence or a completed
  result from being published.
- RED: the exact focused command failed four intended tests. It proved the
  candidate blocked valid post-pause resume, published completed paused
  evidence after stop won a pending readback, left repeated invalid recovery
  reconciliation at zero attempts, and rejected or re-keyed the same outage
  after lease/high-water renewal while recording new-command causation.
- GREEN: admission cancellation now uses a monotonic closure revision so a
  completed pause can start a fresh revalidated resume/recovery cycle without
  reviving the cancelled cycle. Recovery readback/reconciliation rejection
  consumes the exact durable attempt budget and becomes
  `recovery-exhausted`. Reconciliation identity uses only the frozen
  workspace/epoch/claim/attempt/safe-observation/prior-claim tuple, and the
  durable record uses revalidated active-claim causation.
- GREEN evidence: `npm test -- packages/agent/test/wake-supervisor.test.ts
  packages/agent/test/scheduler.test.ts` exited `0` with 2 files and 40 tests
  passing. `git diff --check` was empty and `npm run factory:check` printed
  `factory-readiness passed`. The serialized full-verifier slot has been
  requested and `npm run verify` has not started for this repair.

## Bounded Forward Repair Retained Full Verification — 2026-07-13

- The coordinator granted the Task124-repair-only serialized verifier slot.
  Exactly one retained `npm run verify` then exited `0` in this isolated
  worktree: typecheck passed; 191 test files passed with 3 skipped; 2,278 tests
  passed with 5 skipped; the Vite production build passed; and
  `factory-readiness passed`.
- The repair remains limited to this append-only claim,
  `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts`. It requires a fresh reviewer
  and is not authorized for author integration or any `neo` merge.

## Shared-Retry And Explicit-Recovery Review Repair — 2026-07-13

- Fresh re-review returned `NEEDS-CHANGES` for
  `9389892a4a862dfeaec403825b9f06d79abe7d44`. That commit remains preserved in
  forward history. The coordinator authorized this bounded repair in the same
  claim/source/test scope with no reset, rebase, self-integration, or `neo`
  change.
- Correction to the preceding recovery evidence: exhaustion bounds repeated
  failed recovery attempts, but it does not permanently disable the explicit
  recovery command. A later explicit recover must revalidate authority, lease,
  outage, and reconciliation after the external condition is repaired, and a
  successful verified wake resets the bounded attempt count.
- RED: the exact focused command failed three intended counterfactuals. A
  shared mounted reconciliation store returned the canonical prior record
  after lease/high-water renewal but the supervisor compared it to the renewed
  full tuple and blocked; an explicit repaired recovery remained permanently
  blocked after exhaustion; and an unrelated nonempty
  `highWaterBeforeOutage` reached reconciliation and runtime instead of
  failing before append.
- GREEN: a canonical-key hit now validates the stored record against its own
  exact historical admission tuple plus the unchanged outage/claim causal
  facts, then reuses it without a second append. First-time reconciliation
  still requires exact equality between the frozen outage pre-high-water and
  the revalidated admission high-water. Explicit recovery always performs a
  fresh validation attempt after exhaustion and resets the counter only after
  the repaired path reaches a verified wake.
- GREEN evidence: `npm test -- packages/agent/test/wake-supervisor.test.ts
  packages/agent/test/scheduler.test.ts` exited `0` with 2 files and 42 tests
  passing. `git diff --check` was empty and `npm run factory:check` printed
  `factory-readiness passed`. The serialized verifier slot is requested and no
  `npm run verify` has started for this repair.

## Shared-Retry Repair Retained Full Verification — 2026-07-13

- The coordinator granted the Task124-repair-only serialized verifier slot.
  Exactly one retained `npm run verify` exited `0`: typecheck passed; 191 test
  files passed with 3 skipped; 2,280 tests passed with 5 skipped; the Vite
  production build passed; and `factory-readiness passed`.
- Final scope remains exactly this append-only claim,
  `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts`. A fresh distinct re-review is
  required; author integration and any `neo` change remain forbidden.

## Root-Cause Reconciliation Checkpoint — 2026-07-13

- Fresh root-cause tracing at `6d81423b3a120e194ecf71132d6bd49149dc4225`
  found that the existing-record path rebuilt an expected record from
  `safeExisting.admission`. That untrusted historical tuple therefore supplied
  both sides of the identity, mount, policy, lock, lease, and high-water
  comparison. It also checked `highWaterBeforeOutage` only for a new append.
  A self-consistent foreign stored tuple, or a changed stored outage observation
  paired with its record, could reach `WakeRuntimePort.wakeOnce()`.
- The canonical stable facts independently derived for every retry or recovery
  admission are: workspace ID, resident ID, supervisor epoch, workspace
  identity-event ID, mount-evidence ID, authority-evidence ID, policy version,
  policy digest, and lock-state digest. The active-claim/outage causal facts
  are also stable for a canonical key: claim ID, attempt ID, prior claim event
  and lease IDs, active-claim causation/correlation, safe observation ID,
  observation time/category, and prior authority evidence ID. The stored V1
  record must bind those facts to the fresh admission and must internally bind
  its revalidated-authority fields to its own historical tuple.
- The intentionally renewable facts are only the verified supervisor lease
  event/readback/expiry references and the high-water/readback values. A
  renewed current lease or high-water may reuse a record only after fresh
  admission validation; its historical lease and high-water must remain
  internally consistent. In particular, the record's exact outage observation
  must equal the fresh outage observation and its
  `highWaterBeforeOutage` must equal the stored historical tuple high-water.
  This preserves stable-key idempotent retry while rejecting forged historical
  high-water paired with a colluding current outage observation. Explicit
  recovery after external repair still creates a fresh admission and resets its
  bounded attempt count only after a verified wake.

## Root-Cause Reconciliation RED/GREEN — 2026-07-13

- Baseline: the exact focused suite
  `npm test -- packages/agent/test/wake-supervisor.test.ts packages/agent/test/scheduler.test.ts`
  exited `0` with 2 files and 42 tests passing.
- RED: five new causal counterfactuals failed under the previous stored-tuple
  self-comparison. Self-consistent foreign workspace-identity, mount-marker,
  policy, and lock tuples, plus a stored/current colluding outage high-water
  pair, each reached `outcome: "accepted"` instead of failing closed. The
  focused command exited `1` with 5 failed and 42 passed tests. Each rejection
  test asserts zero retry runtime calls and no second reconciliation append.
- GREEN: reuse now passes through one explicit canonical stored-reconciliation
  predicate. It normalizes the stored readback once, proves the historical
  tuple internally, binds its stable identity/mount/policy/lock facts and
  record facts to a fresh admission, and binds the stored tuple's high-water
  to the exact outage observation. It never builds an expected record from the
  stored tuple. The existing shared-store lease/high-water renewal control
  still reuses the record with one append and a wake per fresh admission.
- GREEN focused evidence: the exact focused command exited `0` with 2 files
  and 47 tests passing. `npm run verify` has not been started; coordinator
  clearance remains required before the single serialized full gate.

## Root-Cause Reconciliation Pre-Full Checkpoint — 2026-07-13

- The final exact focused command exited `0` with 2 files and 47 tests
  passing. `npm run typecheck` exited `0` and printed `typecheck passed`.
  During this checkpoint, the compiler exposed a pre-existing command-result
  helper type mismatch at the current head: its mutable status transition could
  be `"none"` while the public command result requires a concrete lifecycle
  transition. The owned source now passes the already-known operation transition
  explicitly at each accepted/completed result call site; the focused suite and
  typecheck were rerun successfully after that supporting correction.
- `git diff --check` exited `0`; `npm run factory:check` exited `0` and printed
  `factory-readiness passed`; and the asserted three-file audit exited `0` with
  only this claim, `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts` changed from HEAD.
- This is pre-full GREEN only. The worker has not invoked `npm run verify`, has
  not committed, and is waiting for the coordinator's serialized full-verifier
  clearance before creating the one forward repair commit and handing off to a
  distinct fresh reviewer.

## Root-Cause Reconciliation Retained Full Verification — 2026-07-13

- The coordinator granted this Task124 worktree the serialized full-verifier
  slot after Task123 released its passing slot and confirmed no competing
  `npm run verify`, Vitest, TypeScript, or Vite process was active. The worker
  ran exactly one `npm run verify` in this isolated worktree.
- Exit `0`: `typecheck passed`; Vitest reported 191 passed test files with 3
  skipped and 2,285 passed tests with 5 skipped; the Vite production build
  completed; and `factory-readiness passed`. SQLite experimental warnings and
  Vite's non-failing chunk-size advisory appeared in the command output but do
  not alter this Task124 scope or verdict.
- The recorded root cause is the former self-derived stored reconciliation
  comparison; RED was the five forged stable-tuple/high-water counterfactuals
  failing against the 42-test baseline; GREEN is the 47-test focused suite,
  canonical stored-readback predicate, stable fresh-fact binding, renewable
  lease/high-water reuse, and explicit command-result transition binding.
- Post-full work remains only final diff/factory/scope validation and one
  forward candidate commit in this three-file scope. This author does not
  self-review, integrate, or merge `neo`; a distinct fresh review is required.
