# Task 1: Legacy Event Contracts

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 1: Add Legacy Event Contracts
Branch: `codex/legacy-cestus-import`
Status: ready-for-review
Claimed-at: 2026-07-06T12:40:39Z
Worker: Codex implementation worker

## Owned Files

- `docs/agentic/claims/task-1-legacy-event-contracts.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`

## Evidence

- Claim commit: `1c7b646 chore: claim legacy event contracts`.
- Red targeted test: `npm test -- packages/ontology/test/contracts.test.ts` failed because the new legacy event types were not yet contracted.
- Green targeted test: `npm test -- packages/ontology/test/contracts.test.ts` passed with 1 test file and 73 tests.
- Full verification: `npm run verify` passed with typecheck, 69 test files and 588 tests, UI build, and factory readiness.
- `git diff --check` passed.
