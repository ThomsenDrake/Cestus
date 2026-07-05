# Task 8 Claim: Add Rebuildable Ingestion Projection And Read API

- Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
- Task heading: `Task 8: Add Rebuildable Ingestion Projection And Read API`
- Worker identity: Codex
- Branch: `codex/public-ingestion-pipeline-design`
- Worktree path: `/home/drake/.codex/worktrees/aee0/Cestus`
- Claimed at: `2026-07-05T16:20:11Z`
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-8-ingestion-projection.md`
- `packages/ingestion/src/projection.ts`
- `packages/ingestion/src/read-api.ts`
- `packages/ingestion/test/projection.test.ts`
- `packages/ingestion/test/read-api.test.ts`
- `packages/ingestion/test/fixtures/golden-ingestion-ledger.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `96fa9b7 chore: claim task 8`.
- Red targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` failed as expected because `../src/projection.js` could not be resolved.
- Green targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` passed with 2 test files and 2 tests.
- Full verification: `npm run verify` passed with `typecheck passed`, 50 test files and 362 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.
- Focused typecheck repair evidence: first `npm run verify` stopped on exact optional-property/narrowing errors in the new projection/read API types; after targeted repairs, the targeted tests and full verification passed.

## Self-Review

- Scope: changed only the Task 8 owned files.
- Invariants: projection and read API are side-effect-free rebuilds from append-only ledger events only.
- Findings: none.
