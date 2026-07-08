# Final Review Claim: Agent Approval Cockpit Fixes

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
Task: Final whole-branch review fixes for resident-agent approval cockpit routes/UI
Worker: Codex GPT-5
Branch: `codex/resident-agent-approval-cockpit-plan`
Worktree: `/home/drake/.codex/worktrees/b782/Cestus`
Claimed-at: 2026-07-08T22:15:00Z
Status: ready-for-review

Owned files:
- `packages/agent/src/approval-cockpit.ts`
- `packages/agent/test/approval-cockpit.test.ts`
- `packages/local-runtime/test/agent-approval-routes.test.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-approval-adapter.test.ts`
- `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
- `docs/agentic/claims/final-review-agent-approval-cockpit-fixes.md`
- `.superpowers/sdd/final-review-fix-report.md`

Targeted commands:
- `npm test -- packages/agent/test/approval-cockpit.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-approval-adapter.test.ts`
- `npm run verify`
- `npm run factory:check`
- `git diff --check`

Invariant notes:
- Preserve append-only ledger semantics, provenance, projection rebuildability, human-only approval decisions, legal escalation locks, and provider-transfer approval gates.
- Filter no-approval/read-only tool requests out of approval cockpit DTOs without weakening canonical sentinel rejection at public approval boundaries.
- Keep browser DTO parsing fail-closed and secret-safe without invoking accessors or surfacing raw getter errors.
- Do not add any route, adapter, button, helper, or report path that directly executes provider transfer, PRR send/follow-up, export, repair, scheduler wake, lock clearing, or accepted graph review.

Red/green evidence:
- Red: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
  - `packages/agent/test/approval-cockpit.test.ts` failed with `Unsupported approval class for cockpit queue: none`.
  - `packages/local-runtime/test/agent-approval-routes.test.ts` failed because `GET /api/agent/approvals` returned `500` for mixed read-only and approval requests.
  - `packages/ui/test/agent-approval-adapter.test.ts` failed because accessor-backed cockpit payloads surfaced raw getter messages and prototype-backed payloads fell through to invalid DTO parsing.
- Green: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
  - Passed with `Test Files  4 passed (4)` and `Tests  41 passed (41)`.
- Full verification: `npm run verify`
  - Passed with `typecheck passed`, `Test Files  134 passed (134)`, `Tests  1308 passed (1308)`, `tests passed`, Vite production build success, and `factory-readiness passed`.
- Factory readiness: `npm run factory:check`
  - Passed with `factory-readiness passed`.
- Whitespace: `git diff --check`
  - Passed with no output.

Changes recorded:
- Filtered legitimate `requiredApprovalClass: "none"` tool requests out of the approval cockpit queue while preserving canonical sentinel rejection for emitted DTO parsing.
- Added route-level regression coverage proving mixed read-only plus provider-transfer data no longer bricks `GET /api/agent/approvals`.
- Replaced recursive `Object.entries()` DTO sanitization with descriptor-based, plain-prototype-only traversal that rejects accessor-backed fields and array items without invoking getters or echoing secret-bearing messages.
- Updated the implementation plan checklist so completed Tasks 1 through 5 are durably marked done.
