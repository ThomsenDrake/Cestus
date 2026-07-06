# Task 6 Claim: Ingestion HTTP Routes

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 6, Add Transport-Only HTTP Ingestion Routes
- Worker: Codex
- Branch: `codex/task-6-ingestion-http-routes`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Head: `32930b49d714a29298ebaa68092434e137348c18`
- Claimed at: 2026-07-06T16:55:54Z
- Status: approved

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

## Spec Review Route Table Fix Evidence

- Review finding: the HTTP route table used non-approved paths for source registration and import execution, and did not expose the approved workspace and source-list routes.
- Red command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts`
  - Result: failed as expected with 3 failing tests because `GET /api/ingestion/workspace`, `GET /api/ingestion/sources`, `POST /api/ingestion/sources`, and `POST /api/ingestion/imports/run` returned 404.
- Focused green command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts`
  - Result: passed; Vitest reported 1 test file passed and 13 tests passed.
- Targeted command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed; Vitest reported 3 test files passed and 29 tests passed.
- First full verification attempt after route-table fix: `npm run verify`
  - Result: failed in `npm run typecheck` because the route union narrowed `queryFields` only on runtime routes; repaired by allowing query route metadata on workspace/source route variants.
- Full verification command: `npm run verify`
  - Result: passed; typecheck passed, Vitest reported 74 test files passed and 635 tests passed, Vite build succeeded, and factory readiness passed.

## Spec Re-review Alias Route Fix Evidence

- Re-review finding at `e01134f`: the HTTP route table still exposed non-approved compatibility aliases `POST /api/ingestion/sources/register` and `POST /api/ingestion/imports/import`.
- Red command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts`
  - Result: failed as expected; Vitest reported 1 failed test because the alias route still attempted runtime dispatch instead of returning 404.
- Focused green command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts`
  - Result: passed; Vitest reported 1 test file passed and 14 tests passed.
- Targeted command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed; Vitest reported 3 test files passed and 30 tests passed.
- Full verification command: `npm run verify`
  - Result: passed at 2026-07-06T17:14:44Z; typecheck passed, Vitest reported 74 test files passed and 636 tests passed, Vite build succeeded, and factory readiness passed.

## Spec Re-review Transport-Only Sources Fix Evidence

- Re-review finding at `b91a10e`: `GET /api/ingestion/sources` rebuilt projection state in the HTTP layer instead of dispatching through `IngestionRuntime`, violating the transport-only HTTP boundary.
- Supporting scope note: the route had no existing runtime source-list method, so the focused repair added a safe `IngestionRuntime.listSources` DTO/method in `packages/ingestion` and routed HTTP through it.
- Red command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/ingestion/test/runtime.test.ts`
  - Result: failed as expected; Vitest reported 2 failed tests because `runtime.listSources` did not exist and HTTP still returned its own projection result instead of the runtime source-list DTO.
- Focused green command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/ingestion/test/runtime.test.ts`
  - Result: passed; Vitest reported 2 test files passed and 23 tests passed.
- Targeted command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts packages/ingestion/test/runtime.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 39 tests passed.
- Full verification command: `npm run verify`
  - Result: passed at 2026-07-06T17:24:15Z; typecheck passed, Vitest reported 74 test files passed and 637 tests passed, Vite build succeeded, and factory readiness passed.

## Review Approval Evidence

- Spec compliance review at `4bbe20e`: approved. Reviewer verified the approved canonical route set only, transport-only HTTP dispatch, delegated mount resolution, source listing through `IngestionRuntime.listSources`, provider approval-only dispatch, import execution through `importApproved`, structured missing-workspace diagnostics, and latest targeted/full verification evidence.
- Code-quality review at `4bbe20e`: approved. Reviewer found no critical, important, or minor issues; noted clean transport responsibilities, preserved auth policy, canonical route handling, safe source-list DTOs, and adequate tests.
- Approval recorded at: 2026-07-06T17:32:51Z.
- Approval targeted verification command: `npm test -- packages/local-runtime/test/ingestion-http-routes.test.ts packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts packages/ingestion/test/runtime.test.ts`
  - Result: passed; Vitest reported 4 test files passed and 39 tests passed.
- Approval full verification command: `npm run verify`
  - Result: passed at 2026-07-06T17:33:38Z; typecheck passed, Vitest reported 74 test files passed and 637 tests passed, Vite build succeeded, and factory readiness passed.
