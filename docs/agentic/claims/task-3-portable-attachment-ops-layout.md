# Task 3: Portable Attachment Ops Layout Claim

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-attachment-ops-implementation.md`
Task heading: `Task 3: Bind Workspace Ops To Canonical Layout`
Worker identity: Codex
Branch: `codex/portable-workspace-attachment-ops`
Worktree: `/home/drake/.codex/worktrees/db41/Cestus`
Claimed at: 2026-07-06T22:13:03.000Z
Status: ready-for-review

## Owned Files

- `packages/workspace-ops/src/contracts.ts`
- `packages/workspace-ops/src/layout.ts`
- `packages/workspace-ops/src/ops.ts`
- `packages/workspace-ops/test/layout.test.ts`
- `packages/workspace-ops/test/ops.test.ts`
- `docs/agentic/claims/task-3-portable-attachment-ops-layout.md`

## Verifier-Forced Supporting Files

- `packages/workspace-ops/src/backup.ts` updated manifest export category handling for canonical `cache` and `config`.
- `packages/workspace-ops/test/disk-usage.test.ts` updated required green-command expectations for canonical `ledger/`, `cache`, and `config` roots.
- `packages/workspace-ops/test/backup.test.ts` updated required green-command fixtures for the canonical layout contract and root categories.

## Evidence

- Targeted red command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts`
  - Result: failed as expected before implementation; 2 test files failed, 15 tests failed and 6 passed. Canonical manifests resolved as unreadable under the provisional parser, and a fresh unopened workspace verified as blocked instead of ready.
- Targeted green command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/disk-usage.test.ts packages/workspace-ops/test/backup.test.ts`
  - Result: passed after implementation; 4 test files passed, 42 tests passed.
- Full verification: `npm run verify`
  - Result: passed after one focused typecheck repair; typecheck passed, 92 test files passed, 838 tests passed, UI build succeeded, factory-readiness passed.

## Review

- Ready for review.
