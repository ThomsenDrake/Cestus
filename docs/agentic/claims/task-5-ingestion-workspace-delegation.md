# Task 5: Delegate Ingestion Workspace To Canonical Package

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
Task heading: `Task 5: Delegate Ingestion Workspace To Canonical Package`
Worker identity: Codex
Branch: `codex/portable-workspace-mount-design`
Worktree path: `/home/drake/.codex/worktrees/4ea6/Cestus`
Claimed at UTC: `2026-07-06T14:36:00Z`
Status: `ready-for-review`

## Owned Files

- `packages/ingestion/src/workspace.ts`
- `packages/ingestion/test/workspace.test.ts`
- `docs/agentic/claims/task-5-ingestion-workspace-delegation.md`

## Evidence

- Red command: `npm test -- packages/ingestion/test/workspace.test.ts`
  - Result: failed as expected before implementation.
  - Evidence: ingestion workspace object was missing canonical `projectionRoot`, `cacheRoot`, and `configRoot`; `Test Files 1 failed (1)`, `Tests 1 failed (1)`.
- Green command: `npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts`
  - Result: passed.
  - Evidence: `Test Files 2 passed (2)`, `Tests 17 passed (17)`.
- Full verification: `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 614 passed (614)`, `tests passed`, Vite build succeeded, `factory-readiness passed`.

## Review

- Review status: fix ready for review
- Review focus: canonical package ownership, ingestion compatibility, and secret-free manifests.
- Code-quality review finding: Important issue in `packages/ingestion/src/workspace.ts`; `rootDir` returned `input.rootDir` while canonical paths came from `createPortableWorkspace`, allowing relative or non-normalized roots to mix raw and resolved path values.
- Fix red command: `npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts`
  - Result: failed as expected before the follow-up source fix.
  - Evidence: non-normalized root regression expected `/tmp/.../canonical-ingestion` but received `/tmp/.../nested/../canonical-ingestion`; `Test Files 1 failed | 1 passed (2)`, `Tests 1 failed | 17 passed (18)`.
- Fix green command: `npm test -- packages/ingestion/test/workspace.test.ts packages/workspace/test/workspace.test.ts`
  - Result: passed after returning `workspace.rootDir`.
  - Evidence: `Test Files 2 passed (2)`, `Tests 18 passed (18)`.
- Fix full verification: `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 615 passed (615)`, `tests passed`, Vite build succeeded, `factory-readiness passed`.
- Concerns: none recorded
