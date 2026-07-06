# Task 3 Claim: Ingestion Stale-Source Verification

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 3, Add Stale-Source Verification Before Import Writes
- Worker: Codex
- Branch: `codex/ingestion-runtime-wiring-design`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Claimed at: 2026-07-06T14:04:16Z
- Status: in-progress

## Owned Files

- `docs/agentic/claims/task-3-ingestion-stale-source-verification.md`
- `packages/ingestion/src/source-materializer.ts`
- `packages/ingestion/test/runtime-import-stale-source.test.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/ingestion/src/index.ts`

## Supporting Type-Only Edit

- `packages/ingestion/src/import-service.ts`: accepted the same structural `WorkspaceBlobStore` used by `MountedWorkspace` and cast it back to the existing ontology `EvidenceService` constructor type. Runtime behavior is unchanged.

## Verification Evidence

- Red command: `npm test -- packages/ingestion/test/runtime-import-stale-source.test.ts`
  - Result: failed as expected with 5 failing tests because `runtime.approveRawImport` was not implemented.
- Green targeted command: `npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 26 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 72 test files passed and 602 tests passed, Vite build succeeded, and factory readiness passed.

## Forward Lifecycle Correction

- Review found this claim should remain `in-progress` after the initial Task 3 implementation commit. Status was corrected forward without amending or rewriting history while stale-source diagnostic fixes are in progress.
- Review-fix red command: `npm test -- packages/ingestion/test/runtime-import-stale-source.test.ts`
  - Result: failed as expected with 3 failing tests because stale-source mismatch paths appended no durable `diagnostic.recorded` events.
- Review-fix targeted command: `npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 26 tests passed.
- Review-fix full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 72 test files passed and 602 tests passed, Vite build succeeded, and factory readiness passed.

## Code-Quality Review Fix Evidence

- Red command: `npm test -- packages/ingestion/test/runtime-import-stale-source.test.ts`
  - Result: failed as expected with 6 failing tests covering diagnostic stream isolation and added-file stale-source detection.
- Targeted command: `npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 28 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 72 test files passed and 604 tests passed, Vite build succeeded, and factory readiness passed.

## Spec Re-review Projection Fix Evidence

- Red command: `npm test -- packages/ingestion/test/runtime-import-stale-source.test.ts`
  - Result: failed as expected with 6 failing tests because separate stale-source diagnostic streams were durable but not source/scan-associated after projection rebuild.
- Targeted command: `npm test -- packages/ingestion/test/runtime.test.ts packages/ingestion/test/runtime-import-stale-source.test.ts packages/ingestion/test/import-service.test.ts packages/ingestion/test/archive-adapter.test.ts packages/ingestion/test/projection.test.ts packages/ingestion/test/read-api.test.ts`
  - Result: passed; Vitest reported 6 test files passed and 38 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 72 test files passed and 604 tests passed, Vite build succeeded, and factory readiness passed.
