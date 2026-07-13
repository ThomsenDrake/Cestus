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

## Fresh-Review Repair Evidence

- Fresh review of candidate `bdd2e0114863c1be1123c4a001b78f2c8e255dbb`
  returned `NEEDS-CHANGES` for mounted-policy partition binding, canonical
  multi-source causation, exact authority readback, and forged deterministic
  identities. The repair preserves that candidate and its parent history and
  is being prepared as a separate forward commit.
- Retained repair RED: the exact focused command exited `1` with 3 files, 23
  tests, 4 failures, and 19 passes. The four causal failures were `persists the
  verified mounted policy partition instead of a source kind`, `preserves
  canonical first-source causation through multi-source append and replay`,
  `rejects persisted mount, lock, identity, and high-water swaps during exact
  readback`, and `rejects forged deterministic request fingerprints, request
  IDs, and dedupe keys`. No production file had been edited for this repair
  before that RED run.
- Repair implementation derives the persisted high-water partition from the
  verified mounted policy, keeps the canonical first source as causation while
  retaining the canonical final source as high-water, compares persisted
  mount/lock/workspace/source facts to the verified request during readback,
  and independently recomputes fingerprint, request ID, and dedupe key in the
  event contract and replay projection before high-water is trusted.
- Refreshed exact focused GREEN: the same command exits `0` with 3 files and
  23/23 tests passing.
- Compiler-evidence correction: a clean temporary archive of
  `bdd2e0114863c1be1123c4a001b78f2c8e255dbb` reproduced `npm run typecheck`
  failure (`exit 2`) in the Task118 trigger files, so the earlier claim that
  the candidate typecheck passed is superseded as non-retained/inaccurate
  command evidence. The bounded repair tightened trigger-specific validated
  hash outputs and the affected local boundaries; the refreshed
  `npm run typecheck` now exits `0` with `typecheck passed`.
- Refreshed pre-verifier hygiene: `git diff --check` exits `0`, and
  `npm run factory:check` exits `0` with `factory-readiness passed`. The diff
  remains limited to the seven authorized Task118 paths, including this claim.
- A new serialized full-verifier slot is pending coordinator clearance. No
  repair `npm run verify` has started, and no integration or `neo` mutation is
  authorized.

## Retained Repair Full Verification

- Relay A granted the serialized verifier slot after the preceding pending
  checkpoint. The one retained repair `npm run verify` exited `0` in the
  isolated W1-118 worktree.
- Exact aggregates: typecheck emitted `typecheck passed`; Vitest reported 195
  passed and 3 skipped test files (198 total), with 2,286 passed and 5 skipped
  tests (2,291 total); Vite transformed 164 modules and completed the
  production build; the final factory gate emitted `factory-readiness passed`.
- The Vite build retained its existing non-fatal chunk-size warning. No second
  or overlapping W1-118 repair verifier was started. Final commit scope remains
  the seven authorized Task118 paths, and the candidate must stop for fresh
  re-review without self-integration or `neo` mutation.

## Replacement Full-Envelope Readback Repair

- Fresh replacement review identified that `readbackPayload` discarded the
  returned event envelope before readback, so it did not prove the requested
  event ID or bind the returned resident actor, causation, and correlation.
- RED: before the production edit, the exact focused command
  `npm test -- packages/ontology/test/agent-trigger-contracts.test.ts packages/agent/test/proactive-triggers.test.ts packages/agent/test/trigger-projection.test.ts`
  exited `1` with 3 files, 4 failures, and 23 passes. The four causal cases
  returned an otherwise matching payload under a different event ID, a
  non-resident actor, unrelated causation, and unrelated correlation; each
  incorrectly produced `requested`.
- Repair: `readbackTriggerDecision` now passes the complete returned value to
  `validateKnowledgeEvent`, requires the requested event ID and the
  `agent_default` agent context, then retains the existing canonical payload,
  causation, identity, and scope reconstruction checks. It does not duplicate
  or weaken ontology validation.
- GREEN: the same focused command exited `0` with 3 files and 27/27 tests
  passing. `npm run typecheck` emitted `typecheck passed`; `git diff --check`
  exited `0`; and `npm run factory:check` emitted `factory-readiness passed`.
- Coordinator granted the serialized full-verifier slot. The one replacement
  `npm run verify` exited `0`: typecheck passed; Vitest reported 195 passed and
  3 skipped test files (198 total), with 2,290 passed and 5 skipped tests
  (2,295 total); Vite transformed 164 modules and completed the production
  build; the final factory gate emitted `factory-readiness passed`. The command
  retained existing SQLite experimental warnings and Vite's non-fatal
  chunk-size warning. No additional full verifier was started.
