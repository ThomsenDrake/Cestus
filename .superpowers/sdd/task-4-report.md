# Task 4 Report: Agent Approval Cockpit Component

Status: ready-for-review

## Commits

- Claim commit: `2e42b74 chore: claim task 4 agent approval cockpit component`
- Start commit: `f62f4ac chore: start task 4 agent approval cockpit component`
- Fix commit: `6759ea6 fix: fail closed approval cockpit controls`

## Fix Notes

- Added cockpit component coverage for malformed blocked/locked DTOs that incorrectly claim `staleness.approvable: true` with no `blockingReasons`, and proved the UI still disables approval while allowing denial after rationale.
- Added true stale queue coverage using a `queue.stale` item with `stale: true` and `staleness.state: "stale"`, proving approval stays disabled while denial remains available with rationale.
- Added selection-switch coverage proving denial rationale is cleared when the investigator changes the selected request, so text entered for one request cannot be submitted against another.
- Tightened `AgentApprovalCockpit` approval disablement to fail closed on blocked bucket, stale bucket, active locks, stale state, existing terminal state, explicit non-approvable state, and blocking reasons.
- Reset the component rationale whenever the selected request changes.

## Verification Evidence

- RED: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx`
  - Result: failed before implementation because `../src/agent/AgentApprovalCockpit.js` could not be resolved.
- GREEN targeted: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx`
  - Result: passed with `Test Files  2 passed (2)` and `Tests  11 passed (11)`.
- Full: `npm run verify`
  - Result: passed with `typecheck passed`, `Test Files  134 passed (134)`, `Tests  1300 passed (1300)`, `tests passed`, Vite production build success, and `factory-readiness passed`.

## Files Changed

- `packages/ui/src/agent/AgentApprovalCockpit.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-approval-cockpit.test.tsx`
- `packages/ui/test/agent-workspace.test.tsx`
- `docs/agentic/claims/task-4-agent-approval-cockpit-component.md`
- `.superpowers/sdd/task-4-report.md`

## Concerns

- `npm run verify` emitted existing Node experimental SQLite warnings during the wider repo test sweep, but the command completed successfully and required no changes in this task slice.

## Follow-Up Fix: Resumable Approval Disablement

### Fix Notes

- Added a failing cockpit component test for a `queue.resumable` item that already carries an approval record while remaining otherwise current, unlocked, and unblocked; the test proves `Approve exact preview` must stay disabled after rationale while `Deny request` remains available.
- Tightened `AgentApprovalCockpit` approval gating so the UI only enables approval when the selected queue bucket is exactly `pending`, which fails closed for resumable items without changing denial behavior for non-terminal requests.
- Updated the Task 4 claim file to point at the current `2026-07-08` resident-agent approval cockpit routes/UI implementation plan.

### Verification Evidence

- RED: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx`
  - Result: failed as expected with `expect(element).toBeDisabled()` because the resumable request still left `Approve exact preview` enabled.
- GREEN targeted: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx`
  - Result: passed with `Test Files  2 passed (2)` and `Tests  12 passed (12)`.
- Full: `npm run verify`
  - Result: passed with `typecheck passed`, `Test Files  134 passed (134)`, `Tests  1301 passed (1301)`, `tests passed`, Vite production build success, and `factory-readiness passed`.
