# Task 4 Claim: Ingestion Runtime Jobs, Provider Approval, And Diagnostics

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 4, Add Runtime Jobs, Retry, Provider Approval, And Diagnostics
- Worker: Codex
- Branch: `codex/ingestion-runtime-wiring-design`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Head: `54205e7d86854c5b9038d40de9c797fd67b7250b`
- Claimed at: 2026-07-06T16:11:50Z
- Status: approved

## Owned Files

- `docs/agentic/claims/task-4-ingestion-runtime-jobs-provider.md`
- `packages/ingestion/test/runtime-jobs-provider.test.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/runtime-types.ts`

## Verification Evidence

- Red command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts`
  - Result: failed as expected; Vitest reported 1 failed test file and 4 failed tests because `runtime.listJobs`, `runtime.approveProviderParsing`, `runtime.retryJob`, and `runtime.diagnostics` were not implemented.
- Green targeted command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 22 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 73 test files passed and 614 tests passed, Vite build succeeded, and factory readiness passed.

## Code-Quality Review Fix Evidence

- Review finding: provider approval could append an approval for an import batch that had not completed, weakening provider-approval provenance.
- Review finding: `listJobs` could report failed parse jobs as `retryable: true` while `retryJob` still returned `INGESTION_JOB_NOT_RETRYABLE`.
- Red command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts`
  - Result: failed as expected with 2 failing tests covering provider approval before import completion and advertised retryability without retry execution.
- Focused green command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts`
  - Result: passed; Vitest reported 1 test file passed and 6 tests passed.
- Targeted command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 24 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 73 test files passed and 616 tests passed, Vite build succeeded, and factory readiness passed.

## Task 4 Review Approval Evidence

- Current-head spec re-review: approved at `edb6584`.
  - Reviewer result: `Spec compliant`.
  - Reviewer verification command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts`
  - Reviewer verification result: passed; Vitest reported 1 test file passed and 6 tests passed.
  - Reviewer diff check: `git diff --check HEAD~1..HEAD` passed.
- Current-head code-quality re-review: approved at `edb6584`.
  - Reviewer result: `Code-quality approved`.
  - Reviewer verification command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts`
  - Reviewer verification result: passed; Vitest reported 4 test files passed and 24 tests passed.
  - Reviewer full verification command: `npm run verify`
  - Reviewer full verification result: passed; typecheck passed, Vitest reported 73 test files passed and 616 tests passed, Vite build succeeded, and factory readiness passed.
- Claim approval targeted command: `npm test -- packages/ingestion/test/runtime-jobs-provider.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 24 tests passed.
- Claim approval full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 73 test files passed and 616 tests passed, Vite build succeeded, and factory readiness passed.
