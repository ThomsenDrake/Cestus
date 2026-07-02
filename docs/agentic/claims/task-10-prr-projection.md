# Task 10 Claim: PRR Projection

- Plan: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`
- Task: Task 10: Add Rebuildable PRR Projection
- Worker: Codex
- Branch: `codex/prr-workflow-design`
- Worktree: `/home/drake/.codex/worktrees/836b/Cestus`
- Claimed at: 2026-07-01T00:00:00.000Z
- Status: ready-for-review
- Owned files:
  - `packages/prr/src/projection.ts`
  - `packages/prr/test/projection.test.ts`
  - `packages/prr/test/fixtures/golden-prr-ledger.ts`
  - `packages/prr/src/index.ts`
  - `docs/agentic/claims/task-10-prr-projection.md`

## Evidence

- Red targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: failed as expected before implementation.
  - Key output: `Error: Cannot find module '../src/projection.js' imported from packages/prr/test/projection.test.ts`
- Review-fix red targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: failed as expected before review fix.
  - Key output: `5 failed | 10 passed`; failures covered request model mutation leakage, timeline entry mutation leakage, and missing `denied`, `appealed`, and `closed` status transitions.
- Runtime-map review-fix red targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: failed as expected before runtime read-only map fix.
  - Key output: `3 failed | 16 passed`; failures showed `set`, `delete`, and `clear` changed `projection.requests.size`.
- Green targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after implementation.
  - Key output: `Test Files  1 passed (1)`, `Tests  10 passed (10)`
- Review-fix green targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after review fix.
  - Key output: `Test Files  1 passed (1)`, `Tests  15 passed (15)`
- Runtime-map review-fix green targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after runtime read-only map wrapper.
  - Key output: `Test Files  1 passed (1)`, `Tests  19 passed (19)`
- Status-prefix coverage review-fix targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after adding prefix replay coverage for `sent` and `acknowledged`.
  - Key output: `Test Files  1 passed (1)`, `Tests  21 passed (21)`
- Full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  202 passed (202)`, `tests passed`, `factory-readiness passed`
- Review-fix full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  207 passed (207)`, `tests passed`, `factory-readiness passed`
- Runtime-map review-fix full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  211 passed (211)`, `tests passed`, `factory-readiness passed`
- Status-prefix coverage review-fix full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  213 passed (213)`, `tests passed`, `factory-readiness passed`

## Notes

- The plan snippet uses `2026-07-29` for the federal FOIA estimate, but the corrected expected deadline for a July 1, 2026 receipt is `2026-07-30`.
- The plan keeps status `awaitingProduction` after `prr.production.received`. This is semantically odd after production arrives, but Task 10 requires compatibility with the plan unless tests or review justify changing the status vocabulary.

## Self-Review

- Checked the diff against the allowed file list; changes are limited to Task 10 files.
- No defects found in the projection replay logic during self-review.
- Concern retained: `awaitingProduction` after `prr.production.received` reads oddly, but the implementation intentionally follows the plan-compatible status transition.
- Review-fix self-review: defensive boundaries now freeze cloned request models, nested active deadlines, production evidence arrays, and returned timeline entries; status-bearing denial, appeal, and close events update the read model.
- Runtime-map review-fix self-review: `projection.requests` now uses a runtime read-only wrapper that preserves read and iteration methods while explicitly rejecting `set`, `delete`, and `clear`.
- Status-prefix coverage review-fix self-review: added direct golden-ledger prefix tests for `prr.request.sent -> sent` and `prr.correspondence.received -> acknowledged`; no production change was needed.
