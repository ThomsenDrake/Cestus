# Task 4 Claim: Projection Rebuild Readiness And Artifact Writes

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 4: Projection Rebuild Readiness And Artifact Writes
Worker: Codex implementing agent for this task
Branch: `codex/portable-workspace-ops-design` in an existing task-scoped worktree
Worktree: `/home/drake/.codex/worktrees/797e/Cestus`
Claimed-at: 2026-07-06T16:48:06Z
Status: ready-for-review

Owned files:
- `packages/workspace-ops/src/projection-rebuild.ts`
- `packages/workspace-ops/src/index.ts`
- `packages/workspace-ops/test/projection-rebuild.test.ts`
- `docs/agentic/claims/task-4-workspace-ops-projection-rebuild.md`

Required commands:
- `npm test -- packages/workspace-ops/test/projection-rebuild.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/workspace-ops/test/projection-rebuild.test.ts` exited 1 because `../src/projection-rebuild.js` was missing.
- Green: `npm test -- packages/workspace-ops/test/projection-rebuild.test.ts` exited 0 with 1 test file and 5 tests passed.
- Verify: `npm run verify` exited 0 with typecheck passed, 74 test files and 640 tests passed, UI build succeeded, and factory-readiness passed.
- Spec review repair red: `npm test -- packages/workspace-ops/test/projection-rebuild.test.ts` exited 1 with 2 failing regressions proving ledger read and ledger event validation failures did not require human approval in repair hints and did not expose canonical repair proposed actions.
- Spec review repair green: `npm test -- packages/workspace-ops/test/projection-rebuild.test.ts` exited 0 with 1 test file and 6 tests passed.
- Spec review repair verify: `npm run verify` exited 0 with typecheck passed, 74 test files and 641 tests passed, UI build succeeded, and factory-readiness passed.

Self-review:
- The implementation stayed inside the Task 4 owned files and did not start Task 5.
- `rebuildProjectionReadiness` returns the Task 1 `ProjectionRebuildDto` with `mode: "readiness"` and performs no artifact writes, removes, or promotions.
- `rebuildProjection` returns the Task 1 `ProjectionRebuildDto` with `mode: "result"`.
- Projection names, rebuild IDs, and artifact names are validated before write or promotion paths are constructed.
- Artifact writes are limited to a temp directory under the projection root, and promotion is called only after all artifact writes succeed.
- Failed builder or write paths return degraded/blocking diagnostics without promoting the temp directory over prior artifacts or mutating canonical ledger, event, blob, or evidence paths.
- The projection artifact filesystem surface is limited to projection-root existence, text writes, temp removal, directory promotion, and available-byte checks.
- Spec review repair keeps ledger read and event-validation failures proposed-only: diagnostics now require human approval and proposed actions require a future append-only canonical repair event.
