# Task 6 Claim: CLI JSON Facade

Plan: `docs/superpowers/plans/2026-07-06-portable-workspace-ops-implementation.md`
Task: Task 6: CLI JSON Facade
Worker: Codex implementing agent for this task
Branch: `codex/portable-workspace-ops-design` in an existing task-scoped worktree
Worktree: `/home/drake/.codex/worktrees/797e/Cestus`
Claimed-at: 2026-07-06T19:23:54Z
Status: ready-for-review

Owned files:
- `packages/workspace-ops/src/cli.ts`
- `packages/workspace-ops/bin/cestus-workspace.mjs`
- `packages/workspace-ops/src/index.ts`
- `package.json`
- `packages/workspace-ops/test/cli.test.ts`
- `docs/agentic/claims/task-6-workspace-ops-cli.md`

Required commands:
- `npm test -- packages/workspace-ops/test/cli.test.ts`
- `npm run workspace:help`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/workspace-ops/test/cli.test.ts` exited 1 because `../src/cli.js` was missing.
- Implementation repair: the first targeted run after implementation exited 1 because the executable error path emitted an extra newline through `console.error`; the bin now writes JSON directly to stderr.
- Green: `npm test -- packages/workspace-ops/test/cli.test.ts` exited 0 with 1 test file and 8 tests passed.
- Help: `npm run workspace:help` exited 0 and printed usage text beginning with `Usage: cestus-workspace <command> [options]`.
- Verify: `npm run verify` exited 0 with typecheck passed, 77 test files and 675 tests passed, UI build succeeded, and factory-readiness passed.

Self-review:
- The CLI dispatcher is pure and calls only injected operations; it does not import local-runtime, UI, filesystem, or mount-contract wiring.
- Supported command envelopes print stable workspace-ops JSON and map `ready` to 0, `degraded` to 2, and `blocked` to 3.
- Unsupported commands, missing injected operations, and thrown operations return stable JSON errors with exit code 1.
- The standalone executable exposes help and returns stable JSON errors for operational commands instead of attempting hidden runtime or filesystem work.
- This task did not modify Task 7 readiness docs/scripts, HTTP/UI runtime code, or portable mount contracts.
