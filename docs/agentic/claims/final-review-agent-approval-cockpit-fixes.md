# Final Review Claim: Agent Approval Cockpit Fixes

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
Task: Final whole-branch review fixes for resident-agent approval cockpit routes/UI
Worker: Codex GPT-5
Branch: `codex/resident-agent-approval-cockpit-plan`
Worktree: `/home/drake/.codex/worktrees/b782/Cestus`
Claimed-at: 2026-07-08T22:15:00Z
Status: ready-for-review

Owned files:
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-approval-routes.test.ts`
- `packages/agent/src/approval-cockpit.ts`
- `packages/agent/test/approval-cockpit.test.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-approval-adapter.test.ts`
- `docs/agentic/claims/final-review-agent-approval-cockpit-fixes.md`
- `.superpowers/sdd/final-review-fix-2-report.md`

Targeted commands:
- `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
- `npm run verify`
- `npm run factory:check`
- `git diff --check`

Invariant notes:
- Preserve append-only ledger semantics, provenance, projection rebuildability, human-only approval decisions, legal escalation locks, and provider-transfer approval gates.
- Filter no-approval/read-only tool requests out of approval cockpit DTOs without weakening canonical sentinel rejection at public approval boundaries.
- Keep browser DTO parsing fail-closed and secret-safe without invoking accessors or surfacing raw getter errors.
- Keep approval provenance class-aware so provider byte-transfer stays strict while non-provider approval classes can rely on other safe refs.
- Do not add any route, adapter, button, helper, or report path that directly executes provider transfer, PRR send/follow-up, export, repair, scheduler wake, lock clearing, or accepted graph review.

Red/green evidence:
- Red: `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/agent/test/approval-cockpit.test.ts packages/ui/test/agent-approval-adapter.test.ts`
  - `packages/local-runtime/test/agent-approval-routes.test.ts` failed because `POST /api/agent/approvals/toolreq_read_only/deny` returned `200` instead of `404`.
  - `packages/agent/test/approval-cockpit.test.ts` failed because provider missing-provenance copy stayed provider-agnostic and non-provider approvals without artifact refs remained blocked.
  - `packages/ui/test/agent-approval-adapter.test.ts` failed because non-enumerable accessor-backed DTO fields fell through to later schema errors instead of being rejected during descriptor traversal.
- Green: `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
  - Passed with `Test Files  5 passed (5)` and `Tests  55 passed (55)`.
- Full verification: `npm run verify`
  - Passed with `typecheck passed`, `Test Files  134 passed (134)`, `Tests  1313 passed (1313)`, `tests passed`, Vite production build success, and `factory-readiness passed`.
- Factory readiness: `npm run factory:check`
  - Passed with `factory-readiness passed`.
- Whitespace: `git diff --check`
  - Passed with no output.

Changes recorded:
- Deny routes now preflight against the current approval cockpit snapshot so filtered read-only/no-approval tool requests cannot append human denial events through a direct route call.
- Approval provenance blocking is now approval-class-aware: provider byte-transfer still requires both source-event/source and artifact refs, while non-provider approvals require at least one safe affected ref or context-pack ref.
- Descriptor traversal now rejects accessor-backed DTO fields and array items before skipping non-enumerable properties, keeping browser parsing fail-closed without surfacing getter secrets.
