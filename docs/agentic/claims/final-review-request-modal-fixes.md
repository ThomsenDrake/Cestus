# Final Review: Request Modal And Workspace Intelligence Fixes

Plan path: `docs/superpowers/plans/2026-07-04-requests-detail-modal-implementation.md`
Spec path: `docs/superpowers/specs/2026-07-04-requests-detail-modal-design.md`
Related plan: `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
Related spec: `docs/superpowers/specs/2026-07-03-ledger-backed-prr-workspace-design.md`
Task heading: final-review fixes for Requests detail modal and Workspace Intelligence
Worker identity: Codex
Branch: `codex/prr-ledger-backed-workspace-design`
Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
Claimed at: `2026-07-04T14:44:22Z`
Status: `ready-for-review`

## Final-Review Findings

- Workspace Intelligence is not active-saved-view aware. It must show the active saved view label and visible request count, and compute rail/model signals from the filtered visible request set.
- The Requests detail modal can remain mounted after Requests workspace data is cleared or fails to reload. It must not hide loading or error state behind an empty modal.

## Owned Files

- `docs/agentic/claims/final-review-request-modal-fixes.md`
- `packages/ui/src/App.tsx`
- `packages/ui/src/requests/RequestWorkspace.tsx`
- `packages/ui/src/requests/RequestWorkspaceIntelligenceRail.tsx`
- `packages/ui/src/requests/request-model.ts`
- `packages/ui/src/requests/request-types.ts`
- `packages/ui/test/request-model.test.ts`
- `packages/ui/test/request-intelligence-rail.test.tsx`
- `packages/ui/test/request-board.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`

## Evidence

- Red command: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-intelligence-rail.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx`
- Red result: failed as expected. `request-model.test.ts` received `undefined` for `activeViewLabel` instead of `Florida fees`; `request-intelligence-rail.test.tsx` and `app-smoke.test.tsx` could not find `1 visible request in Florida fees.` because the rail still showed global counts; `app-smoke.test.tsx` could not find the accessible `Requests load error` region after a reload failure because the still-open detail modal kept the app background `aria-hidden`.
- Green command: `npm test -- packages/ui/test/request-model.test.ts packages/ui/test/request-intelligence-rail.test.tsx packages/ui/test/request-board.test.tsx packages/ui/test/app-smoke.test.tsx`
- Green result: passed. Vitest reported `Test Files 4 passed (4)` and `Tests 23 passed (23)`.
- Full verification: `npm run verify` passed. Output included `typecheck passed`, `Test Files 42 passed (42)`, `Tests 334 passed (334)`, `tests passed`, Vite build success, and `factory-readiness passed`.
- Post-fix local preview reachability: `curl -I --max-time 5 http://127.0.0.1:5175/` returned `HTTP/1.1 200 OK` on 2026-07-04T14:52:18Z.
- Post-fix tailnet preview reachability: `curl -I --max-time 5 http://100.126.143.105:5175/` returned `HTTP/1.1 200 OK` on 2026-07-04T14:52:18Z.

## Review

- Review status: ready-for-review
- Concerns: none recorded
