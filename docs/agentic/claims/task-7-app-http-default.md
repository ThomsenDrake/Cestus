# Task 7: App Defaults To Durable HTTP Runtime

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 7: App Defaults To Durable HTTP Runtime`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T16:16:25Z`
Status: `ready-for-review`

## Owned Files

- `packages/ui/src/App.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/request-builder.test.tsx`
- `packages/ui/test/request-board.test.tsx`
- `packages/ui/test/request-shell.test.tsx`
- `packages/ui/test/right-rail.test.tsx`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/request-test-utils.ts`

## Evidence

- Red command: `npm test -- packages/ui/test/app-smoke.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/request-data-boundary.test.ts`
  - Result: failed as expected. `packages/ui/test/app-smoke.test.tsx` reported `expected [] to deeply equal ["/api/requests/workspace"]`, and `packages/ui/test/request-data-boundary.test.ts` reported `expected ... to contain 'httpRequestsAdapter'`.
- Green command: `npm test -- packages/ui/test/app-smoke.test.tsx packages/ui/test/request-builder.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/request-shell.test.tsx packages/ui/test/right-rail.test.tsx packages/ui/test/request-data-boundary.test.ts`
  - Result: passed. Test Files 6 passed (6), Tests 35 passed (35).
- Full verification: `npm run verify`
  - Result: passed. `typecheck passed`; Test Files 50 passed (50), Tests 396 passed (396); `tests passed`; Vite build succeeded; `factory-readiness passed`.

## Review

- Review status: ready for review
- Concerns: none recorded
