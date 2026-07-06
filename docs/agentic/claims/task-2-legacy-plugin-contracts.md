# Task 2: Legacy Types And Plugin Contracts

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 2: Add Legacy Types And Plugin Contracts
Branch: `codex/legacy-cestus-import`
Status: ready-for-review
Claimed-at: 2026-07-06T13:01:37Z
Worker: Codex implementation worker

## Owned Files

- `docs/agentic/claims/task-2-legacy-plugin-contracts.md`
- `packages/ingestion/src/legacy-types.ts`
- `packages/ingestion/src/legacy-plugins.ts`
- `packages/ingestion/test/legacy-plugins.test.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `b94a67d chore: claim legacy plugin contracts`.
- Red targeted test: `npm test -- packages/ingestion/test/legacy-plugins.test.ts` failed resolving the missing `../src/legacy-plugins.js` legacy module before implementation.
- Green targeted test: `npm test -- packages/ingestion/test/legacy-plugins.test.ts` passed with 1 test file and 3 tests.
- Full verification: `npm run verify` passed with typecheck, 70 test files and 593 tests, UI build, and factory readiness.
- `git diff --check` passed.
