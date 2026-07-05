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
- Spec review fix red targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` failed with 2 regression failures proving non-scan ingestion stream diagnostics were omitted from source DTOs and unknown runtime events were not quarantined as projection diagnostics.
- Spec review fix green targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` passed with 2 test files and 4 tests.
- Spec review fix full verification: `npm run verify` passed with `typecheck passed`, 50 test files and 364 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.
- Code-quality repair started: `2026-07-05T16:50:26Z`.
- Code-quality repair red targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` failed as expected with 4 regression failures proving malformed known ingestion events were reported as no validation diagnostic, parse terminal fields remained stale across fail/succeed transitions, and DTO totals mutation leaked into projection state.
- Code-quality repair green targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` passed with 2 test files and 8 tests.
- Code-quality repair full verification: `npm run verify` passed with `typecheck passed`, 50 test files and 368 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.
- Spec re-review repair started: `2026-07-05T16:55:12Z`.
- Spec re-review repair red targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` failed as expected with 1 regression failure proving quarantined malformed/unknown events could invent `scan_missing` projection state through diagnostic association.
- Spec re-review repair green targeted test: `npm test -- packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts` passed with 2 test files and 9 tests.
- Spec re-review repair full verification: `npm run verify` passed with `typecheck passed`, 50 test files and 369 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.

## Self-Review

- Scope: changed only the Task 8 owned files.
- Invariants: projection and read API are side-effect-free rebuilds from append-only ledger events only.
- Spec review fixes: diagnostics now associate through source, scan, import, evidence-link, parse, and provider replay context where source can be inferred; invalid or unknown runtime events are quarantined as deterministic in-memory projection diagnostics without appending ledger events.
- Code-quality fixes: known event validation failures are distinct from unknown future events and preserve validation issue path/message; parse terminal replay clears stale success/failure fields; review DTO totals are fresh objects and cannot mutate projection state or later DTOs.
- Spec re-review fix: diagnostic association no longer creates scan summaries; diagnostics retain source/scan metadata for visibility, but only valid scan events create or update `projection.scans`.
- Findings: none.
