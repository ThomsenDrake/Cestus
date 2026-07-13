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
