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
