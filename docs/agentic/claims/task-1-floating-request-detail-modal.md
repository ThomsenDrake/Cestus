# Task 1: Floating Request Detail Modal

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-floating-modal-implementation.md`
Task heading: `Task 1: Float Request Detail Modal Over The Workspace`
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: 2026-07-04T21:01:14Z
Status: `ready-for-review`

## Owned Files

- `packages/ui/src/requests/RequestDetailModal.tsx`
- `packages/ui/test/request-detail-modal.test.tsx`
- `packages/ui/test/visual-contract.test.ts`
- `scripts/check-agent-readiness.mjs`

## Evidence

- Red command: `npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts` failed as expected with 2 failed tests because `RequestDetailModal.tsx` still used `bg-[var(--command-black)]/92`, outer `overflow-y-auto`, `min-h-[calc(100dvh-2rem)]`, and lacked `data-request-detail-modal-body="true"`.
- Green command: `npm test -- packages/ui/test/request-detail-modal.test.tsx packages/ui/test/visual-contract.test.ts` passed with 2 test files and 10 tests passing.
- Full verification: `npm run verify` passed with `typecheck passed`, 42 Vitest files and 334 tests passing, `tests passed`, Vite build success, and `factory-readiness passed`.

## Review

- Review status: ready for review
- Concerns: none recorded
