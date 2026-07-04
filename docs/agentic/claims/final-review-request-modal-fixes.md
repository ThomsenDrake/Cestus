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
Status: `in-progress`

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

- Red command: not run yet
- Red result: not recorded yet
- Green command: not run yet
- Green result: not recorded yet
- Full verification: not run yet

## Review

- Review status: pending
- Concerns: none recorded
