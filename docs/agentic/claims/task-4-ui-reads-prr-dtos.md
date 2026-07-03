# Task 4 Claim: Requests UI Reads Backend DTOs

## Claim

- Plan path: `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- Task heading: `Task 4: Requests UI Reads Backend DTOs`
- Worker identity: Codex worker subagent
- Branch: `codex/prr-ledger-backed-workspace-design`
- Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
- Claimed at UTC: `2026-07-03T21:55:56Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-4-ui-reads-prr-dtos.md`
- `packages/ui/src/requests/request-types.ts`
- `packages/ui/src/requests/request-model.ts`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/src/requests/RequestWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/request-model.test.ts`
- `packages/ui/test/request-board.test.tsx`
- `packages/ui/test/request-detail-rail.test.tsx`
- `packages/ui/test/request-signal-map.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/visual-contract.test.ts`
- `packages/ui/test/ui-picker.test.tsx`

## Plan

1. Update this claim to `in-progress`.
2. Add failing UI/model/data-boundary tests before production changes.
3. Run targeted red command: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts`.
4. Implement the browser-safe Requests adapter backed by PRR projection/read DTOs and seed events.
5. Update Requests UI product code to consume `PrrWorkspaceDto` data instead of local request card fixtures.
6. Update visual and picker contracts for the adapter boundary.
7. Run targeted green command: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts`.
8. Run full verification: `npm run verify`.
9. Update this claim to `ready-for-review` with command evidence and commit the implementation.

## Command Evidence

- Red command/result: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts` failed as expected. Vitest reported 6 failed files and 17 failed tests. Representative failures were `request-data-boundary.test.ts` finding `request-fixtures` in `packages/ui/src/App.tsx`, component tests passing `workspace` into a `RequestWorkspace` that still expected `fixture`, and `request-model.ts` reading fixture-style saved-view filters from backend DTO saved views.
- Green command/result: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-board.test.tsx packages/ui/test/request-detail-rail.test.tsx packages/ui/test/request-signal-map.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/request-data-boundary.test.ts` passed. Vitest reported 6 test files passed and 19 tests passed.
- Full verification result: `npm run verify` passed. Output included `typecheck passed`, Vitest `40 passed (40)` test files and `302 passed (302)` tests, `tests passed`, Vite production build success, and `factory-readiness passed`.

## Supporting Verifier Edits

- `packages/ui/test/request-shell.test.tsx`: `npm run verify` exposed stale synchronous route assertions after Requests moved to async adapter loading. Updated only the affected assertions to await the Requests heading.
- `packages/ui/test/request-builder.test.tsx`: `npm run verify` exposed stale synchronous builder-open assertions through `App`. Updated only the two App-driven builder tests to await the loaded Requests route/dialog. Focus-trap component tests remain unchanged.
- Supporting command/result: `npm test -- packages/ui/test/request-shell.test.tsx packages/ui/test/request-builder.test.tsx` passed with 2 test files and 9 tests.

## Review

- Review status: Ready for review.
- Concerns: Plan text names `localPrrWorkspaceSeedEvents`, but current code exports `prrWorkspaceSeedEvents`; this task used the actual exported name. No Node-only PRR runtime imports were added to UI product code.
