# Task 1: Add Canonical Workspace Package

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
Task heading: `Task 1: Add Canonical Workspace Package`
Worker identity: Codex
Branch: `codex/portable-workspace-mount-design`
Worktree path: `/home/drake/.codex/worktrees/4ea6/Cestus`
Claimed at UTC: `2026-07-06T12:33:12Z`
Status: `ready-for-review`

## Owned Files

- `packages/workspace/src/index.ts`
- `packages/workspace/test/workspace.test.ts`
- `docs/agentic/claims/task-1-portable-workspace-package.md`

## Evidence

- Red command: `npm test -- packages/workspace/test/workspace.test.ts`
  - Result: failed as expected before implementation.
  - Evidence: `Cannot find module '../src/index.js' imported from packages/workspace/test/workspace.test.ts`.
- Green command: `npm test -- packages/workspace/test/workspace.test.ts`
  - Result: passed.
  - Evidence: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.
- Full verification: `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 590 passed (590)`, `tests passed`, `vite build` succeeded, `factory-readiness passed`.

## Review

- Review status: fixes applied; pending re-review
- Code-quality review result: with fixes
- Fix red command: `npm test -- packages/workspace/test/workspace.test.ts`
  - Result: failed as expected before the follow-up source fix.
  - Evidence: 3 failing tests: create-time ledger path conflict, symlinked layout directory escape, and non-regular ledger path.
- Fix green command: `npm test -- packages/workspace/test/workspace.test.ts`
  - Result: passed.
  - Evidence: `Test Files 1 passed (1)`, `Tests 16 passed (16)`.
- Fix full verification: `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 601 passed (601)`, `tests passed`, `vite build` succeeded, `factory-readiness passed`.
- Concerns: none recorded
