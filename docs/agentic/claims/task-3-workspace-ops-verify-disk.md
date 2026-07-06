# Task 3 Claim: Verify Workspace And Disk Usage Operations

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 3: Verify Workspace And Disk Usage Operations
Worker: Codex implementing agent for this task
Branch: `codex/portable-workspace-ops-design` in an existing task-scoped worktree
Worktree: `/home/drake/.codex/worktrees/797e/Cestus`
Claimed-at: 2026-07-06T15:11:49Z
Status: ready-for-review

Owned files:
- `packages/workspace-ops/src/ops.ts`
- `packages/workspace-ops/src/index.ts`
- `packages/workspace-ops/test/ops.test.ts`
- `packages/workspace-ops/test/disk-usage.test.ts`
- `docs/agentic/claims/task-3-workspace-ops-verify-disk.md`

Scoped supporting edit:
- `packages/workspace-ops/src/layout.ts` exports the existing strict provisional manifest parser so `verifyWorkspace` and layout resolution share one validator.

Required commands:
- `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 1 because `../src/ops.js` was missing from both new test files.
- Green: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 0 with 2 test files and 6 tests passed.
- Verify repair: `npm run verify` first exited 2 during typecheck because support-root diagnostic categories and high-water mark narrowing needed stricter typing.
- Green after repair: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 0 with 2 test files and 6 tests passed.
- Verify: `npm run verify` exited 0 with typecheck passed, 73 test files and 624 tests passed, UI build succeeded, and factory-readiness passed.
- Code-quality repair red: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 1 with 4 failing regressions covering ledger-reader gating when the ledger path is unavailable, stale resolved-layout manifest loss, blob subtree unreadability, and disk-usage realpath cycle protection.
- Code-quality repair green: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 0 with 2 test files and 10 tests passed.
- Code-quality repair verify: `npm run verify` exited 0 with typecheck passed, 73 test files and 628 tests passed, UI build succeeded, and factory-readiness passed.
- Spec repair red: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 1 with 2 failing regressions proving stale resolved layouts still reported `ready` when the manifest became unreadable or its content no longer matched the provisional manifest contract.
- Spec repair green: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 0 with 2 test files and 12 tests passed.
- Spec repair verify: `npm run verify` exited 0 with typecheck passed, 73 test files and 630 tests passed, UI build succeeded, and factory-readiness passed.
- Strict manifest repair red: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 1 with 1 failing regression proving a stale resolved layout with required manifest fields plus an extra field still reported `ready`.
- Strict manifest repair green: `npm test -- packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts` exited 0 with 2 test files and 13 tests passed.
- Strict manifest repair verify: `npm run verify` exited 0 with typecheck passed, 73 test files and 631 tests passed, UI build succeeded, and factory-readiness passed.

Self-review:
- The repair stayed within the Task 3 owned files and did not start Task 4.
- `verifyWorkspace` no longer touches the injected canonical event reader when the ledger path is unavailable.
- Manifest loss, ledger unavailability, and blob unreadability now emit diagnostics and proposed actions rather than silently reporting ready.
- Canonical ledger/event/blob repairs remain proposed-only, human-approved, and framed as future append-only repair events.
- Projection rebuild remains proposed only for expendable projection artifacts.
- Disk usage now uses realpath-based cycle protection and still omits raw child names from DTO output.
- `verifyWorkspace` now re-reads and safely validates the provisional manifest before reporting manifest validity; unreadable or invalid manifest content emits safe diagnostics and a non-canonical rerun action.
- `verifyWorkspace` now reuses the strict provisional manifest parser exported from layout resolution, so extra fields and other non-strict manifest drift cannot be accepted as ready.
