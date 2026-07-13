# Task 122 Claim: Investigation Planner Durable Handoff Migration

- Task and gate: Task 122 / Wave 1 / CF-1 consumer.
- Worker: `/root/wave1_task122`.
- Branch and worktree: `codex/task-122-resident-full-vision-investigation-handoff` / `/home/drake/.codex/worktrees/task-122-resident-full-vision-investigation-handoff`.
- Frozen coordinator base: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` (`CF1-INTEGRATION-SHA`).
- Claimed at: `2026-07-13T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This claim authorizes only the Task122 exclusive files:

- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- this append-only claim

The worker consumes `CF1-H-HANDOFF` and its existing durable helper. It must
record only an advisory investigation plan/evidence-gap handoff that binds the
investigation, exact context/evidence source events, prompt artifact, and plan,
task-suggestion, and PRR-draft artifact hashes. It must add no accepted graph
mutation, PRR send, hidden tool execution, provider behavior, fallback store,
shared event/schema/projection change, or external effect.

Authorization includes SDD, test-first RED/GREEN, fresh independent review,
and verification-before-completion. The exact targeted command is:

```bash
npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Before the single scoped commit, run that command for RED and GREEN, then
`git diff --check`, `npm run factory:check`, and `npm run verify`. Stop for a
fresh reviewer after committing; do not self-review, self-integrate, or merge
into `neo`.

## Required Reading And Preconditions

Read `AGENTS.md`, the Cestus factory skill, ontology design and implementation
plan, factory instructions, approved Lane H design and plan, Task117 CF-1
freeze and claim, program plan, existing handoff claims, and both Task122 files
before editing production code. The dedicated worktree starts exactly at the
frozen CF-1 coordinator SHA above.

## RED / GREEN Evidence

This claim was recorded before the Task122 test or production-file edit.

- Dependency recovery: the initial RED command could not start because this
  isolated worktree had no ignored `node_modules/.bin/vitest` and printed
  `sh: line 1: vitest: command not found`. The coordinator approved `npm ci
  --ignore-scripts` in this worktree only; it created no tracked-file churn.
- RED: the required command then exited `1` with one expected regression in
  `rejects stale evidence before recording the advisory plan handoff`. The old
  workflow returned no diagnostics, so the new `source-stale` assertion failed;
  the projection suite remained green (1 failed / 39 passed tests overall).
- GREEN: after the stale-source guard and durable readback migration, the exact
  required command exited `0`: 2 test files and 41 tests passed. It proves a
  stale evidence marker prevents provider invocation and handoff recording; a
  successful advisory plan binds exact context, prompt, source-event, and
  artifact bytes through final-output, prepared, recorded, and terminal
  readback; failure material records before terminal failure; and no tool/PRR
  send path is introduced.
- Diff hygiene before this evidence append: `git diff --check` exited `0`.

## Pre-Commit Verification

- The exact targeted command was rerun after the final TypeScript narrowing:
  `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `0` (2 test
  files / 41 tests passed).
- `git diff --check` and `npm run factory:check` exited `0`.
- `npm run verify` exited `0`, including typecheck, the full test suite, UI
  build, and the factory readiness check.
- The only intended tracked changes are the two exclusive Task122 source/test
  paths, plus this task claim. No integration or merge action has occurred.

Status: ready for the final scoped commit and fresh independent review. The
worker must not self-review, self-integrate, or merge into `neo`.
