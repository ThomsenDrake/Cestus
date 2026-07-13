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

## Repair Addendum: Durable Post-Provider Storage Failure

- Repair base: `26871a1dc72889353675574d79ba55299a65c35c`.
- RED: the exact targeted command exited `1` with four expected failures
  (2 files / 39 passed tests): planner artifacts lost objective, gap, candidate,
  source, context, and prompt bindings; a later derivative failure omitted the
  persisted artifacts; a persistent manifest write threw after final-output;
  and a persistent final-material write threw before a durable terminal state.
- GREEN: the same exact targeted command exited `0` (2 files / 43 tests). It
  proves exact readback equality for success and partial-failure artifacts,
  retains every structured candidate field and source/context/prompt bindings,
  records a secret-safe `external-effect-failed` terminal when final material
  cannot persist, and returns an `output-persisted` resumable ledger state
  without fallback writes when manifest recording fails after final-output.
  The successful path also asserts final-output → prepared → recorded → terminal
  ordering and excludes graph, tool, and PRR effects.
- Verification: `git diff --check`, `npm run typecheck`, and
  `npm run factory:check` exited `0`; `npm run verify` exited `0` with 189 test
  files passed, 3 skipped, 2,232 tests passed, 5 skipped, plus the UI build and
  factory readiness check.
- Scope: only the two Task122 workflow/test files and this append-only claim
  are changed. No integration, merge, or `neo` mutation occurred.

Status: ready for the scoped repair commit and fresh independent review. Do not
self-review, self-integrate, or merge into `neo`.

## Second Repair Recovery

- Fresh second-repair author `/root/wave1_task121_recovery` started from the
  coordinator-preserved clean checkpoint
  `2c8d41c3c5f48b74cd24ef817b37efb1c2715417`.
- RED: `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `1` with
  the new restored-store regression failing as expected: the prior workflow
  re-entered `prepareSpecialistRun` and then safely rejected duplicate provider
  invocation (`Configured provider invocation failed safely`). The projection
  suite remained green (1 failed / 43 passed tests overall).
- GREEN: the same focused command exited `0` (2 files / 44 tests). The repair
  reads the unique ledger-bound final-output before preparation, strictly binds
  recovery through `recordSpecialistHandoff`, and finalizes only that readback.
  The restored-store case proves one manifest write only, no second provider
  invocation or final-output, exact prior artifact reuse, and the append order
  final-output -> prepared -> recorded -> terminal without tool or PRR effects.
- Diff hygiene and factory readiness: `git diff --check` and
  `npm run factory:check` exited `0`. Full verification remains pending the
  coordinator's global-verifier confirmation.
- Coordinated full verification: after confirmation that no global verifier
  was active, the retained replacement `npm run verify` exited `0`:
  typecheck passed; 189 test files passed, 3 skipped; 2,233 tests passed, 5
  skipped; Vite built; and factory readiness passed.

## Coordinator Root-Cause Recovery Authorization

- The second repair candidate `e9aa4a1b87d5ae8c4dd5a67e06554259d9a0b6dc`
  is preserved but rejected after two focused repair attempts. Its independent
  reviewer found two P1 defects: recovery accepted another specialist type
  because it bypassed the normal `investigation-planner` binding before
  `recordSpecialistHandoff`; and an unavailable manifest store still threw on
  a retry rather than returning the existing explicit `output-persisted`
  resumable result.
- No routine third repair is authorized on either prior author branch. A fresh
  author owns a changed-counterfactual recovery only on
  `codex/task-122-resident-full-vision-investigation-handoff-recovery` in
  `/home/drake/.codex/worktrees/task-122-resident-full-vision-investigation-handoff-recovery`,
  rooted at the preserved rejected head above. The only mutable paths remain
  this claim, `packages/agent/src/investigation-planner-workflow.ts`, and
  `packages/agent/test/investigation-planner-workflow.test.ts`.
- Before every recovery manifest or ledger write, bind the existing started
  run to `investigation-planner` and the exact resident, task, run, and attempt
  identity. A cross-specialist input must return the safe rejection with zero
  writes, model/provider invocation, draft work, or other effect. A still
  unavailable manifest store must return the same `output-persisted` resumable
  DTO, throw nothing, avoid preparation/model invocation and duplicate
  artifact/final events, and retain the prior durable material.
- The fresh RED/GREEN suite must prove cross-specialist substitution plus at
  least two persistent-unavailable retries with zero additional
  model/draft/artifact/manifest/ledger effects, followed by restored-storage
  preservation of the exact final-output -> prepared -> recorded -> terminal
  order. The author has standing `superpowers:subagent-driven-development` and
  TDD authority, must run the focused command, diff/factory, then a single
  full verification, commit, and stop for a distinct fresh independent review.
  No self-review, self-integration, `neo` merge, PRR send, graph effect, or
  scope expansion is authorized.

Status: in-progress only in the isolated root-cause recovery lane; the prior
two candidates remain rejected and unintegrated.
