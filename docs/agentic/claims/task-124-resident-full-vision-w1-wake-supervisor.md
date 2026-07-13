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
