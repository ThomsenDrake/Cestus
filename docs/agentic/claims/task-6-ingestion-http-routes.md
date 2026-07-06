# Task 6 Claim: Ingestion HTTP Routes

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 6, Add Transport-Only HTTP Ingestion Routes
- Worker: Codex
- Branch: `codex/task-6-ingestion-http-routes`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Head: `32930b49d714a29298ebaa68092434e137348c18`
- Claimed at: 2026-07-06T16:55:54Z
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-6-ingestion-http-routes.md`
- `packages/local-runtime/src/ingestion-runtime-factory.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/test/ingestion-http-routes.test.ts`
- `packages/local-runtime/test/auth-and-seed.test.ts`

## Verification Evidence

- Red command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts`
  - Result: failed as expected; Vitest reported 1 failed test file and 11 failed ingestion route tests because `/api/ingestion/*` returned 404 while `auth-and-seed.test.ts` passed.
- First full verification attempt: `npm run verify`
  - Result: failed in `npm run typecheck` because new ingestion HTTP test doubles widened `ok: true` to `boolean`; repaired by literal-typing the test fixtures without changing production behavior.
- Green targeted command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed; Vitest reported 3 test files passed and 27 tests passed.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 74 test files passed and 633 tests passed, Vite build succeeded, and factory readiness passed.

## Self-Review Notes

- Scope stayed within Task 6 owned files after the claim commit.
- HTTP ingestion routes remain transport-only: they parse JSON/query input, reject forbidden storage-path keys recursively, resolve the mounted workspace, construct the runtime with `{ mountedWorkspace, actor }`, and directly dispatch DTOs to runtime methods.
- Workspace path resolution stays delegated to `ingestionMountResolver`; request bodies cannot provide `workspace`, `workspaceRoot`, `workspacePath`, `storagePath`, `sqlitePath`, or `blobRoot`.
- Provider approval calls only `approveProviderParsing`; the route layer does not parse provider bytes or call provider execution helpers.
- `/api/health` remains public, `/api/ingestion/*` follows the existing auth gate, and handler close behavior still closes the PRR runtime handle.
