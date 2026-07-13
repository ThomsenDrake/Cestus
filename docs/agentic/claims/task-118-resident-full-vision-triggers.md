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

## RED/GREEN Evidence

- Dependency recovery: the first exact focused command found this isolated
  worktree missing ignored lockfile-pinned dependencies (`vitest: command not
  found`). `npm ci --ignore-scripts` restored those dependencies without
  tracked dependency or lockfile changes.
- RED: `npm test -- packages/ontology/test/agent-trigger-contracts.test.ts
  packages/agent/test/proactive-triggers.test.ts
  packages/agent/test/trigger-projection.test.ts` failed before production
  modules existed: the trigger event contract was unregistered and both trigger
  modules could not be imported. This followed the committed in-progress
  claim and preceded any production edit.
- GREEN: the same exact focused command passed with 3 files and 18 tests. It
  covers canonical `agent.trigger.requested.v1` validation, verified mounted
  authority, deterministic source-order-independent identities, conditional
  append and exact readback, duplicate/cooldown/budget behavior, a concurrent
  losing-promise re-read, stale/swap authority facts, no-effect rejected input
  shapes, secret-safe decisions, and pure replayed high-water projection.
- Follow-up gates: `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` passed. The one retained `npm run verify` is pending
  the coordinator's serialized verifier-slot clearance.

## Green Supersession

- A final narrow TDD cycle added the Lane T plan's two descriptor constructors
  for pre-verified `evidence-gap-contradiction` and `workspace-recovery`
  metadata. Its focused RED failed because the constructors were absent.
- The refreshed exact focused GREEN passed with 3 files and 19 tests; the
  refreshed `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` also passed. Full verification remains unstarted and
  reserved for the coordinator-cleared serialized slot.

## Retained Full Verification

- Coordinator-cleared serialized W1-118 verifier: the single retained
  `npm run verify` exited `0`. Its exact script is
  `npm run typecheck && npm test && echo 'tests passed' && npm run ui:build &&
  npm run factory:check`; therefore typecheck, the complete deterministic test
  suite, UI build, and factory readiness all completed successfully in this
  isolated worktree. The command emitted no aggregate count lines to retain.
- No overlapping or repeated full verifier was started. Final scope and diff
  hygiene remain limited to the seven authorized Task118 paths before the
  forward candidate commit and distinct fresh review.
