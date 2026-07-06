# Task 7 Claim: Ingestion UI Runtime Adapter

- Plan: `docs/superpowers/plans/2026-07-06-ingestion-runtime-wiring-implementation.md`
- Task: Task 7, Add Browser-Safe UI Adapter And Live Ingestion App Wiring
- Worker: Codex
- Branch: `codex/task-7-ingestion-ui-runtime-adapter`
- Worktree: `/home/drake/.codex/worktrees/15cc/Cestus`
- Head: `83e6445`
- Claimed at: 2026-07-06T17:34:44Z
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-7-ingestion-ui-runtime-adapter.md`
- `packages/ui/src/ingestion/ingestion-adapter.ts`
- `packages/ui/test/ingestion-http-adapter.test.ts`
- `packages/ui/src/ingestion/ingestion-types.ts`
- `packages/ui/src/ingestion/IngestionWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/ingestion-workspace.test.tsx`
- `packages/ui/test/ingestion-app-integration.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`

## Verification Evidence

- Updated to in-progress before task file edits: 2026-07-06T17:39:45Z.
- Red command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts`
  - Result: failed as expected.
  - Evidence: missing `packages/ui/src/ingestion/ingestion-adapter.ts` import and old `IngestionWorkspace` single-review prop shape caused the new UI adapter/workspace tests to fail.
- Targeted green command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx`
  - Result: passed, 5 test files and 26 tests.
- Full verification:
  `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`; Vitest reported 75 test files and 642 tests passed; `tests passed`; Vite build succeeded; `factory-readiness passed`.
- Completed at: 2026-07-06T17:47:35Z.

## Self-Review Notes

- Browser ingestion code imports UI DTO/types only and does not import ingestion runtime/services, local-runtime modules, SQLite, filesystem, blob store, mount/storage, or `node:*` modules.
- HTTP adapter uses `/api/ingestion/*`, accepts both direct workspace DTO and `{ ok, workspace }` workspace envelopes, maps workspace-not-mounted to a safe UI DTO, and strips workspace/storage path fields from action bodies.
- App defaults to `httpIngestionWorkspaceAdapter`, supports injected ingestion adapters for tests, and removes the placeholder ingestion review state.
- UI keeps raw import approval, import execution, provider approval, retry, jobs, and diagnostics as separate controls/states.

## Spec Review Fix Evidence

- Spec review findings at `8a1de91`: non-2xx stable JSON failures were thrown before diagnostics could be mapped, `retryJob` parsed a valid runtime job result as an invalid action because it required `review`, and UI `RegisterSourceInput` did not include the live runtime `rootUri`/`sourceRoot` fields.
- Red command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts`
  - Result: failed as expected; Vitest reported 3 failing ingestion HTTP adapter tests covering 503 workspace error mapping, 400 action error mapping, and retry job success without a review DTO.
- Targeted green command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx`
  - Result: passed; Vitest reported 5 test files passed and 29 tests passed.
- Full verification command:
  `npm run verify`
  - Result: passed at 2026-07-06T17:58:06Z; typecheck passed, Vitest reported 75 test files passed and 645 tests passed, Vite build succeeded, and factory readiness passed.

## Code-Quality Review Fix Evidence

- Code-quality review findings at `aacb138`: provider approval could be enabled after raw import approval but before import execution completed, job-list stable failures were hidden as empty jobs, and successful workspace/review diagnostics were not sanitized before rendering.
- Red command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts`
  - Result: failed as expected; Vitest reported 3 failing tests covering job-list failure diagnostics, successful workspace/review diagnostic redaction, and approval/import/provider gate state.
- Targeted green command:
  `npm test -- packages/ui/test/ingestion-http-adapter.test.ts packages/ui/test/ingestion-workspace.test.tsx packages/ui/test/ingestion-app-integration.test.tsx packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx`
  - Result: passed; Vitest reported 5 test files passed and 32 tests passed.
- Full verification command:
  `npm run verify`
  - Result: passed at 2026-07-06T18:14:32Z; typecheck passed, Vitest reported 75 test files passed and 648 tests passed, Vite build succeeded, and factory readiness passed.
