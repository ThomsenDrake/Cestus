# Task 3: Add Portable Workspace Contract

Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`

Worker identity: Codex worker subagent

Branch: `codex/public-ingestion-pipeline-design`

Worktree path: `/home/drake/.codex/worktrees/aee0/Cestus`

Claimed at: `2026-07-05T15:00:00Z`

Owned files:

- `docs/agentic/claims/task-3-ingestion-workspace.md`
- `packages/ingestion/src/workspace.ts`
- `packages/ingestion/test/workspace.test.ts`
- `packages/ingestion/src/index.ts`

Verification evidence:

- `npm test -- packages/ingestion/test/workspace.test.ts` failed as expected before `packages/ingestion/src/workspace.ts` existed: Vitest could not resolve `../src/workspace.js`.
- `npm test -- packages/ingestion/test/workspace.test.ts` passed after adding the workspace helpers: 1 test file, 1 test.
- `npm run verify` passed: typecheck passed, 44 test files / 340 tests passed, UI build succeeded, and factory readiness passed.

Status: ready-for-review
