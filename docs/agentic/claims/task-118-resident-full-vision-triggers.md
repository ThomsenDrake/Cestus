# Task 118 Claim: Resident Full-Vision Proactive Triggers

- Task and gate: W1-118 / Lane T / CF1-L-POLICY, CF1-T-REQUEST,
  CF1-T-EVALUATOR, CF1-T-HIGH-WATER, and CF1-W-AUTHORITY.
- Worker: `/root/task118_triggers`.
- Branch and worktree: `codex/task-118-resident-full-vision-triggers` /
  `/home/drake/.codex/worktrees/task-118-resident-full-vision-triggers`.
- Coordinator base and Relay B record:
  `43eb9642cc08f1646b1c1defe5a15e8aab5c2149`.
- Required reviewed predecessors:
  `804c04b4855083127f8ee27b1186442c9f684161` (W1-119) and
  `49c3490a262162bd1d7146994390a2a6b5052394` (Task120).
- Claimed at: `2026-07-13T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This task may change only:

- `packages/ontology/src/contracts.ts`
- `packages/agent/src/proactive-triggers.ts`
- `packages/agent/src/trigger-projection.ts`
- `packages/ontology/test/agent-trigger-contracts.test.ts`
- `packages/agent/test/proactive-triggers.test.ts`
- `packages/agent/test/trigger-projection.test.ts`
- this append-only claim

It implements the canonical `agent.trigger.requested.v1` schema and a strict,
mounted-authority evaluator. A request is demand only: the sole durable
mutation is one conditionally appended and exactly read-back ledger request.
Fingerprints, deterministic request IDs, dedupe keys, admission scopes, gate
keys, and high-water state must be reconstructed from authoritative policy and
source facts, never process memory.

No prompt or `inputText`, provider, model, credential, harness, specialist,
parser, scheduler, task claim, handoff, artifact, projection mutation, or
accepted graph mutation is authorized. This task cannot edit Relay B, dispatch
Tasks149--151, self-review, self-integrate, or merge into `neo`.

## Verification Contract

Before production edits, create and run a focused RED test. The focused
RED/GREEN command is:

```bash
npm test -- packages/ontology/test/agent-trigger-contracts.test.ts packages/agent/test/proactive-triggers.test.ts packages/agent/test/trigger-projection.test.ts
```

Before the single forward candidate commit, run the focused GREEN command,
`git diff --check`, `npm run factory:check`, and exactly one coordinator-cleared
`npm run verify`. Then stop for a distinct fresh review with the candidate SHA,
clean status, and append-only RED/GREEN/full-verification evidence.
