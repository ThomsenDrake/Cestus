# Task 1 Durable Handoff Event Contracts

## Task

Task 1: Event Contracts And Final-Output Step Semantics from
`.superpowers/sdd/task-1-brief.md`.

## Status

ready-for-review

## Claim

- Worker: Codex
- Branch: `codex/durable-specialist-handoffs-core`
- Worktree: `/home/drake/.codex/worktrees/1542/Cestus`
- Claimed at (UTC): 2026-07-10T00:00:00.000Z

## Files

- `docs/agentic/claims/task-1-durable-handoff-event-contracts.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`

## Acceptance

`npm test -- packages/ontology/test/agent-contracts.test.ts` passes after the
new strict event contracts are implemented, followed by `npm run verify`.

## Handoff

- RED: `npm test -- packages/ontology/test/agent-contracts.test.ts` failed as
  expected with 2 failures because final-output fields and specialist-handoff
  event types were not contracted.
- GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts` passed:
  1 file, 49 tests.
- Verify: `npm run verify` passed: typecheck; 170 test files, 1,715 tests
  passed, 3 skipped; Vite production build; factory readiness.
- Commit: `f7bcfdb feat: add durable specialist handoff event contracts`.
- Reviewer notes: first review found stale commit evidence; this claim records
  `f7bcfdb` before re-review.
