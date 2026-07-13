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
