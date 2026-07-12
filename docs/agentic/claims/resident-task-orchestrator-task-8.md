# Resident Task Orchestrator Task 8 Claim

## Status

complete

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 8, Deterministic Evidence-Triage Vertical
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Prerequisite Checkpoint

Tasks 1-7 are review-approved in this managed linked worktree as scoped
uncommitted diffs because Git metadata is read-only. Task 7 targeted checks
passed after review repair:

```bash
npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
npm run typecheck
git diff --check
```

`npm run verify` and `npm run factory:check` remain blocked only by the known
managed-sandbox EPERM restrictions for local socket/IPC/git child process
operations.

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-8.md`
- `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- `packages/agent/test/task-orchestrator-recovery.test.ts`
- `packages/agent/test/task-orchestrator-approval.test.ts`
- `packages/agent/test/task-orchestrator-dispatch.test.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`

Tasks 1-7 are shared, uncommitted scoped diffs in this managed worktree and
remain untouched except for dependent type usage. Git metadata is read-only in
this linked worktree, so this task will not stage or commit.

## RED Evidence

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Expected RED observed after adding Task 8 assertions: 7 failing tests. The
failures proved the missing deterministic vertical behavior:

- context-ready checkpoints were not assembled from authoritative resolved
  pack payload bytes before provider transfer;
- ref-only advisory readiness did not block before transfer with
  `context-not-ready`;
- approved active attempts did not dispatch through the runner path after
  exact provider-byte-transfer approval;
- restart recovery after provider final output did not complete durable
  handoff before terminal run/task projection.

## Review Repair Evidence

Fresh Task 8 review found two P1 issues:

- a process crash after a `runner-dispatching` checkpoint but before the
  runner/provider call could strand the attempt forever;
- provider dispatch could consume approval context hashes without requiring a
  resolver-produced `context-ready` checkpoint.

Repair RED:

```bash
npm test -- packages/agent/test/task-orchestrator-recovery.test.ts
```

Failed as intended: 2 failures proving the stranded dispatch checkpoint and
missing context-ready dispatch bypass.

Repair GREEN:

```bash
npm test -- packages/agent/test/task-orchestrator-recovery.test.ts
```

Passed after repair: 1 file, 9 tests.

The repair changed dispatch to require a durable `context-ready` checkpoint
whose prompt artifact hash and ordered context hash set exactly match the
provider-byte-transfer proof. Missing or mismatched context proof now appends a
`context-not-ready` blocked checkpoint and releases the worker lease before any
runner/provider side effect. `runner-dispatching` is now a recoverable
idempotency checkpoint rather than a permanent no-op marker.

## GREEN Evidence

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
```

Passed: 2 files, 14 tests.

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
```

Passed adjacent suites after review repair: 6 files, 99 tests.

```bash
npm run typecheck
```

Passed.

```bash
git diff --check
```

Passed.

## Verification

```bash
npm run verify
```

Passed typecheck, then hit only the known managed-sandbox verifier blockers:
local-runtime HTTP server `listen EPERM` on loopback/wildcard binds,
workspace-ops `tsx` IPC pipe `listen EPERM`, and the workspace-readiness smoke
empty stdout caused by sandbox-blocked child process execution. Summary:
3 failed files, 185 passed, 3 skipped; 19 failed tests, 2205 passed, 3 skipped.

```bash
npm run factory:check
```

Blocked by the known managed-sandbox `spawnSync git EPERM` in
`scripts/check-agent-readiness.mjs` while running `git ls-files`.

## Result

- Added a deterministic evidence-triage vertical test that proves queue,
  claim, context/prompt checkpoint, exact provider-byte-transfer approval,
  provider dispatch, content-addressed handoff readback, run terminal, task
  terminal, and projection rebuild.
- Added restart tests for pre-claim, post-claim, post-context, approval
  suspension, post-approval/pre-provider dispatch, post-provider final output,
  and post-handoff readback boundaries.
- Added review-repair restart tests for crash after `runner-dispatching` before
  provider call and exact-approval dispatch without durable context-ready proof.
- Connected task-orchestrator active-claim recovery to production workflow,
  context registry, prompt renderer, approval, runner, and durable handoff
  capabilities without introducing placeholder provider or handoff behavior.
- Production dispatch now requires authoritative local context resolution and
  binds context refs/content hashes plus prompt artifact hash in checkpoints;
  raw payload bytes stay out of ledger/checkpoints/log-like state.
- Ref-only advisory readiness blocks before provider transfer with
  `context-not-ready`.
- Approved active attempts append an idempotent, recoverable
  `runner-dispatching` checkpoint before runner dispatch; stale leases can
  reclaim/re-dispatch the same attempt/run boundary rather than silently
  strand a pre-dispatch crash.
- Handoff recovery follows the landed order: provider final output, durable
  handoff prepared/recorded/readback, run terminal, task terminal.

## Commit Boundary

Git metadata is read-only in this linked worktree. Coordinator commit boundary:
`HEAD 1894fe6a` plus this uncommitted scoped diff.

## Coordinator Closure

- Final status: complete.
- Coordinator commit: `fd83d7be020d180ce8ceeb48c2c8a1735a19184c` (`fd83d7be feat: add resident task orchestrator`).
- Commit packaging: coordinator preserved the exact reviewed Tasks 1-9 packet in one commit because the child sandbox could not safely reconstruct per-task Git history.
- Unrestricted coordinator `npm run factory:check`: PASS.
- Unrestricted coordinator `npm run verify`: PASS.
- Full verify counts: 189 passed / 3 skipped files; 2,227 passed / 5 skipped tests.
- Typecheck, production UI build, and factory readiness passed.
- Final vertical acceptance: Task 9 real Nous gate remains 3/3 consecutive GREEN.
