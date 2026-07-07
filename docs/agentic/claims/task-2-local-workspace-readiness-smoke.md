# Task 2: Local Workspace Readiness Smoke

Plan path: `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`
Task heading: `Task 2: Add Local Workspace Readiness Smoke Orchestrator`
Worker identity: Codex
Branch: `codex/local-workspace-readiness-smoke`
Worktree path: `/home/drake/.codex/worktrees/2800/Cestus`
Claimed at UTC: `2026-07-06T21:51:17Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-2-local-workspace-readiness-smoke.md`
- `packages/local-runtime/src/workspace-readiness-smoke.ts`
- `packages/local-runtime/test/workspace-readiness-smoke.test.ts`

## Supporting Verifier Edits

- `packages/ingestion/src/runtime.ts`: review-gate fix for Task 2 P1; `importApproved` now wires existing `LocalParseService` to enqueue local parse jobs for imported evidence.
- `packages/ingestion/test/runtime-jobs-provider.test.ts`: review-gate regression test proving `importApproved` creates local-parse jobs without manual ledger appends.

## Evidence

- Red command: `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts` failed as expected because `packages/local-runtime/src/workspace-readiness-smoke.ts` did not exist.
- Green command: `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts packages/workspace-ops/test/layout.test.ts packages/ingestion/test/runtime.test.ts` passed: 3 test files, 19 tests.
- Full verification: `npm run verify` passed: typecheck passed, 93 test files passed, 826 tests passed, UI build succeeded, factory-readiness passed.
- Review-fix red command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/local-runtime/test/workspace-readiness-smoke.test.ts` failed as expected because `importApproved` did not create local parse jobs, the smoke report had jobCount 2/no jobKinds, and an initialized workspace root threw from `createPortableWorkspace`.
- Review-fix green command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/local-runtime/test/workspace-readiness-smoke.test.ts` passed: 2 test files, 8 tests.
- Review-fix broader target: `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts packages/workspace-ops/test/layout.test.ts packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-jobs-provider.test.ts` passed: 4 test files, 26 tests.
- Review-fix full verification: `npm run verify` passed: typecheck passed, 93 test files passed, 827 tests passed, UI build succeeded, factory-readiness passed.

## Review

- Self-review:
- Reviewer records decision after review.
