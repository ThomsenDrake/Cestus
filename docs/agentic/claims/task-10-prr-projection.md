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
- Green targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after implementation.
  - Key output: `Test Files  1 passed (1)`, `Tests  10 passed (10)`
- Review-fix green targeted test: `npm test -- packages/prr/test/projection.test.ts`
  - Result: passed after review fix.
  - Key output: `Test Files  1 passed (1)`, `Tests  15 passed (15)`
- Full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  202 passed (202)`, `tests passed`, `factory-readiness passed`
- Review-fix full verification: `npm run verify`
  - Result: passed.
  - Key output: `typecheck passed`, `Test Files  23 passed (23)`, `Tests  207 passed (207)`, `tests passed`, `factory-readiness passed`

## Notes

- The plan snippet uses `2026-07-29` for the federal FOIA estimate, but the corrected expected deadline for a July 1, 2026 receipt is `2026-07-30`.
- The plan keeps status `awaitingProduction` after `prr.production.received`. This is semantically odd after production arrives, but Task 10 requires compatibility with the plan unless tests or review justify changing the status vocabulary.

## Self-Review

- Checked the diff against the allowed file list; changes are limited to Task 10 files.
- No defects found in the projection replay logic during self-review.
- Concern retained: `awaitingProduction` after `prr.production.received` reads oddly, but the implementation intentionally follows the plan-compatible status transition.
- Review-fix self-review: defensive boundaries now freeze cloned request models, nested active deadlines, production evidence arrays, and returned timeline entries; status-bearing denial, appeal, and close events update the read model.
