# Task 1: Legacy Operator Runtime Contracts

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
Task: Task 1: Add Legacy Operator Runtime Contracts
Branch: `codex/legacy-import-operator-cli`
Status: ready-for-review
Claimed-at: 2026-07-06T21:31:04Z
Worker: Codex implementation worker

## Owned Files

- `packages/ingestion/src/legacy-runtime-types.ts`
- `packages/ingestion/test/legacy-runtime-types.test.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `50aa8b1 chore: claim legacy operator runtime contracts`.
- Red targeted test: `npm test -- packages/ingestion/test/legacy-runtime-types.test.ts` failed resolving the missing `../src/legacy-runtime-types.js` module before implementation.
- Green targeted test: `npm test -- packages/ingestion/test/legacy-runtime-types.test.ts` passed with 1 test file and 3 tests.
- Full verification: `npm run verify` passed with typecheck, 93 test files and 825 tests, UI build, and factory readiness.
