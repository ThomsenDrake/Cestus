# Task 119 Claim: Resident Loop Event Contracts

- Task and gate: Task 119 / Wave 1 / CF-1 W1-119 prerequisite.
- Worker: `/root/wave1_task122`.
- Branch and worktree: `codex/task-119-resident-full-vision-loop-contracts` /
  `/home/drake/.codex/worktrees/task-119-resident-full-vision-loop-contracts`.
- Frozen coordinator base: `03bdfe26b7338b676d175926249d4d9f4a1954b1`.
- Claimed at: `2026-07-13T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This claim authorizes only:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-resident-loop-contracts.test.ts`
- this append-only claim

The slice is L's sole serialized registrar for exactly these canonical event
contracts: `agent.resident-plan.recorded.v1`,
`agent.resident-observation.recorded.v1`,
`agent.resident-tool-step.recorded.v1`, `agent.resident-loop.suspended.v1`,
and `agent.resident-loop.result.recorded.v1`. It must enforce strict canonical
plain-own-data payload parsing and a replayable fixture for all five events,
with negatives for unknown fields; missing identity, policy, authority, source,
context, budget, causation, or correlation; forged plan-readback linkage;
cross-run identity; unsafe own-data shapes; and terminal-looking results without
required readback.

No store, projection, runtime, provider, tool, domain, UI, graph, scheduler,
or external effect is authorized. This worker must make no self-review,
self-integration, Task120 restart, W1-118/Task136 work, or `neo` merge.

## Required Verification

Write and run a focused RED before production changes, then run:

```bash
npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts
```

Before the one scoped forward candidate commit, run `git diff --check`,
`npm run factory:check`, and `npm run verify`. Stop for a distinct fresh review
after the commit.

## Recovery Record

- Recovery authorized at the preserved claim checkpoint
  `464dd184bdac498618b37ec851ae9920b4620e19`.
- The prior W1-119 author was interrupted after two bounded intervals with only
  this scope-correct claim committed. No production or test edits, RED/GREEN
  checkpoint, or verifier was run.
- Replacement author `/root/wave1_task121_recovery` starts from this clean
  checkpoint and retains the original frozen scope and verification contract.

## Direct Coordinator Recovery Execution

- After the replacement also missed the required focused RED checkpoint, the
  coordinator interrupted it without discarding this append-only claim and
  completed the already-frozen narrow contract lane only in this dedicated
  Task119 worktree. Fresh independent review remains mandatory; this recovery
  does not self-review, self-integrate, restart Task120, or authorize `neo`.
- Environment recovery: this isolated worktree initially lacked ignored Node
  dependencies (`vitest: command not found`). `npm ci --ignore-scripts` restored
  lockfile-pinned ignored dependencies without tracked package or lockfile
  changes.
- RED: the exact focused command initially failed because the five W1-119
  resident-loop event registrations were absent. The subsequent GREEN loop
  exposed and closed a forged plan-readback gap by requiring the canonical
  task-attempt-run plan event ID. Final focused GREEN: 2 test files and 71
  tests passed, including the replayable five-event fixture, unknown/missing
  bindings, forged readback, cross-run, unsafe own-data, and terminal-readback
  counterfactuals.
