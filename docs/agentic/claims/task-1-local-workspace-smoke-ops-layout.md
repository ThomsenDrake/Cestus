# Task 1: Local Workspace Smoke Ops Layout

Plan path: `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`
Task heading: `Task 1: Bind Workspace Ops To Canonical Portable Manifest`
Worker identity: Codex
Branch: `codex/local-workspace-readiness-smoke`
Worktree path: `/home/drake/.codex/worktrees/2800/Cestus`
Claimed at UTC: `2026-07-06T21:30:55Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-1-local-workspace-smoke-ops-layout.md`
- `packages/workspace-ops/src/layout.ts`
- `packages/workspace-ops/test/layout.test.ts`

## Evidence

- Red command: `npm test -- packages/workspace-ops/test/layout.test.ts` failed as expected; the canonical portable workspace binding test received `blocked` instead of `ready`.
- Green command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts` passed: 2 test files, 21 tests.
- Full verification: `npm run verify` passed: typecheck passed, 92 test files passed, 823 tests passed, UI build succeeded, factory-readiness passed.

## Review

- Reviewer records decision after review.
