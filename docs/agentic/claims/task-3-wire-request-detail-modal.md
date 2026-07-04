# Task 3: Wire Request Detail Modal

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`
Task heading: `Task 3: Wire Requests Modal And Intelligence Rail Through App`
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: 2026-07-04T13:57:43Z
Status: `ready-for-review`

## Owned Files

- `packages/ui/src/App.tsx`
- `packages/ui/src/requests/RequestWorkspace.tsx`
- `packages/ui/src/requests/RequestBoard.tsx`
- `packages/ui/src/requests/RequestLane.tsx`
- `packages/ui/src/requests/RequestCard.tsx`
- `packages/ui/test/request-board.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`

## Evidence

- Red command: `npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx` failed as expected with 2 test files failed and 4 assertions failing because App still rendered `Request detail rail` and no `Requests workspace intelligence` rail or request detail modal was present.
- Green command: `npm test -- packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx` passed with 2 test files and 12 tests.
- Full verification: `npm run verify` passed after the supporting edit: typecheck passed, 42 test files and 328 tests passed, Vite build succeeded, and factory-readiness passed. First attempt stopped at typecheck because `packages/ui/test/request-signal-map.test.tsx` directly rendered `RequestWorkspace` without the new `onOpenRequestDetail` prop.
- Supporting edit: `packages/ui/test/request-signal-map.test.tsx` was updated with no-op `onOpenRequestDetail` callbacks after full verification exposed the typecheck-only prop requirement.

## Review

- Review status: ready for review
- Concerns: none recorded
