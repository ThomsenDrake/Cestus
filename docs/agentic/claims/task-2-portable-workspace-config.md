# Task 2: Add Portable Workspace Config Contract

Plan path: `docs/superpowers/plans/2026-07-06-portable-workspace-mount-implementation.md`
Task heading: `Task 2: Add Portable Workspace Config Contract`
Worker identity: Codex
Branch: `codex/portable-workspace-mount-design`
Worktree path: `/home/drake/.codex/worktrees/4ea6/Cestus`
Claimed at UTC: `2026-07-06T13:08:55Z`
Status: `complete`

## Owned Files

- `packages/local-runtime/src/config.ts`
- `packages/local-runtime/src/config-file.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/config.test.ts`
- `packages/local-runtime/test/config-file.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `docs/agentic/claims/task-2-portable-workspace-config.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts`
  - Result: failed as expected before implementation.
  - Evidence: `portable-workspace` was rejected by storage parsing/config-file parsing, and CLI configure returned exit code `1`; `Test Files 3 failed (3)`, `Tests 4 failed | 30 passed (34)`.
- Green command: `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts`
  - Result: passed.
  - Evidence: `Test Files 3 passed (3)`, `Tests 34 passed (34)`.
- Full verification: `npm run verify`
  - Result: passed.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 606 passed (606)`, `tests passed`, `vite build` succeeded, `factory-readiness passed`.

## Review

- Review status: approved
- Spec compliance review: approved after inspection of `14aec89..fef7856`
- Code-quality review: approved after inspection of `14aec89..fef7856`
- Review focus: root-required portable behavior, compatibility-mode preservation, config-file secret safety, and CLI parsing.
- Code-quality review result: ready with minor issue.
- Minor finding: `mergeStorageConfig` preserved stale storage keys when reconfiguring away from `portable-workspace`, leaving an inactive `workspaceRoot` in persisted config.
- Fix red command: `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts`
  - Result: failed as expected before the follow-up source fix.
  - Evidence: regression `prunes stale portable workspace fields when changing storage strategies` received `{ strategy: "repo-local", workspaceRoot: "external/case-a" }`; `Test Files 1 failed | 2 passed (3)`, `Tests 1 failed | 34 passed (35)`.
- Fix green command: `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts`
  - Result: passed after normalizing storage merge by selected strategy.
  - Evidence: `Test Files 3 passed (3)`, `Tests 35 passed (35)`.
- Fix full verification: `npm run verify`
  - Result: passed after a TypeScript narrowing repair found by the first verify attempt.
  - Evidence: `typecheck passed`, `Test Files 70 passed (70)`, `Tests 607 passed (607)`, `tests passed`, `vite build` succeeded, `factory-readiness passed`.
- Reviewer verification: `npm test -- packages/local-runtime/test/config.test.ts packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/cli.test.ts`, `npm run typecheck`, `npm run factory:check`, and `npm run verify` passed during review.
- Concerns: none recorded
