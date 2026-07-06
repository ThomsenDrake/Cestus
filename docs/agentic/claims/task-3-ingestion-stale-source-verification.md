# Task 3 Claim: Ingestion Stale-Source Verification

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 3, Add Stale-Source Verification Before Import Writes
- Worker: Codex
- Branch: `codex/ingestion-runtime-wiring-design`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Claimed at: 2026-07-06T14:04:16Z
- Status: ready-for-review

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
