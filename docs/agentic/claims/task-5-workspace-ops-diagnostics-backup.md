# Task 5 Claim: Diagnostics Inspect And Backup Manifest Checks

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 5: Diagnostics Inspect And Backup Manifest Checks
Worker: Codex implementing agent for this task
Branch: `codex/portable-workspace-ops-design` in an existing task-scoped worktree
Worktree: `/home/drake/.codex/worktrees/797e/Cestus`
Claimed-at: 2026-07-06T17:17:10Z
Status: ready-for-review

Owned files:
- `packages/workspace-ops/src/diagnostics.ts`
- `packages/workspace-ops/src/backup.ts`
- `packages/workspace-ops/src/index.ts`
- `packages/workspace-ops/test/diagnostics.test.ts`
- `packages/workspace-ops/test/backup.test.ts`
- `docs/agentic/claims/task-5-workspace-ops-diagnostics-backup.md`

Required commands:
- `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 1 because `../src/backup.js` and `../src/diagnostics.js` were missing.
- Green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 5 tests passed.
- Verify repair: `npm run verify` first exited 2 during typecheck because diagnostics inspection returned input-side diagnostic arrays instead of normalized `WorkspaceDiagnosticDto` payload arrays, then because `allowedNextCommands` helper output was readonly.
- Final targeted green: `npm test -- packages/workspace-ops/test/diagnostics.test.ts packages/workspace-ops/test/backup.test.ts` exited 0 with 2 test files and 5 tests passed.
- Verify: `npm run verify` exited 0 with typecheck passed, 76 test files and 646 tests passed, UI build succeeded, and factory-readiness passed.

Self-review:
- Diagnostics inspection validates durable `diagnostic.recorded` events through ontology contracts, marks durable versus derived diagnostics explicitly, and turns invalid or secret-shaped diagnostic content into safe derived diagnostics.
- Backup manifest export returns only DTO-safe summaries and stable hashes; it does not include raw evidence bodies, ledger event payloads, blob paths, or canonical state copies.
- Backup checks report missing, mismatched, stale, incomplete, and secret-shaped backup manifests through `backup` diagnostics and a non-canonical `export-manifest` proposed action only.
- Canonical ledger/blob repairs remain proposed-only elsewhere; this task does not add repair execution, copying, restore flow, CLI, HTTP/UI, mount contract, or Task 6 behavior.
