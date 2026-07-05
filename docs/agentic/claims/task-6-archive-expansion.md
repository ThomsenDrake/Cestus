# Task 6: Add Safe Zip Archive Expansion

Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`

Worker: Codex
Branch: `codex/public-ingestion-pipeline-design`
Worktree: `/home/drake/.codex/worktrees/aee0/Cestus`
Claimed at: `2026-07-05T15:29:58Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-6-archive-expansion.md`
- `package.json`
- `package-lock.json`
- `packages/ingestion/src/archive-adapter.ts`
- `packages/ingestion/test/archive-adapter.test.ts`
- `packages/ingestion/src/local-filesystem.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Failing archive test command:
  - Command: `npm test -- packages/ingestion/test/archive-adapter.test.ts`
  - Result: failed as expected before implementation because `fflate` could not be resolved from `packages/ingestion/test/archive-adapter.test.ts`.
- Targeted passing test command:
  - Command: `npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts`
  - Result: passed, 2 test files and 8 tests.
- Full verification:
  - Command: `npm run verify`
  - Result: passed after one focused TypeScript exact-optional repair; typecheck passed, 47 test files and 350 tests passed, UI build succeeded, and factory readiness passed.
- Spec review fix:
  - Finding: Windows drive-root archive paths such as `C:/escape.txt` were not rejected as absolute internal paths.
  - Regression failure command: `npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts`
  - Regression failure result: failed as expected; `bad-windows-path.zip` produced one child occurrence instead of zero.
  - Targeted retest command: `npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts`
  - Targeted retest result: passed, 2 test files and 9 tests.
  - Full verification retest command: `npm run verify`
  - Full verification retest result: passed; typecheck passed, 47 test files and 351 tests passed, UI build succeeded, and factory readiness passed.
- Code-quality review fix:
  - Findings: archive limits need pre-extraction checks; archive-child occurrence IDs need structured material; archive diagnostics need durable `diagnostic.recorded` events.
  - Regression failure command: `npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts`
  - Regression failure result: failed as expected; diagnostics were not durable, over-limit archive emitted one child occurrence, literal/child occurrence IDs collided, and archive adapter version was still a concrete patch string.
  - Targeted retest command: `npm test -- packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/local-filesystem.test.ts`
  - Targeted retest result: passed, 2 test files and 11 tests.
  - Full verification retest command: `npm run verify`
  - Full verification retest result: passed; typecheck passed, 47 test files and 353 tests passed, UI build succeeded, and factory readiness passed.
