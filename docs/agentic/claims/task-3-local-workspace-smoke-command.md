# Task 3: Local Workspace Smoke Command

Plan path: `docs/superpowers/plans/2026-07-06-local-workspace-readiness-smoke-implementation.md`
Task heading: `Task 3: Add Operator Command`
Worker identity: Codex
Branch: `codex/local-workspace-readiness-smoke`
Worktree path: `/home/drake/.codex/worktrees/2800/Cestus`
Claimed at UTC: `2026-07-06T22:09:14Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-3-local-workspace-smoke-command.md`
- `packages/local-runtime/src/workspace-readiness-smoke.ts`
- `packages/local-runtime/test/workspace-readiness-smoke.test.ts`
- `package.json`

## Supporting Verifier Edits

- `.npmrc`: review-gate fix for Task 3 command parseability; plain `npm run local:workspace:smoke -- --json` must not prefix stdout with npm's lifecycle banner.

## Evidence

- Red command: `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts` failed as expected because `runLocalWorkspaceReadinessSmokeCli` was not exported.
- Green command: `npm test -- packages/local-runtime/test/workspace-readiness-smoke.test.ts` passed: 1 test file, 4 tests.
- Operator command: `npm run local:workspace:smoke -- --json` exited 0 and printed `schemaVersion: "local-workspace-readiness-smoke.v1"`, `ok: true`, and `status: "ready"`.
- Full verification: `npm run verify` passed: typecheck passed, 93 test files passed, 829 tests passed, UI build succeeded, factory-readiness passed.
- Review-fix red checks: exact npm operator stdout was not directly JSON-parseable and CLI secret-shaped argument errors had no regression coverage.
- Review-fix boundary: npm emits lifecycle banners before scripts run; project `.npmrc` sets the repository default `loglevel=silent` so the exact documented operator command is parseable under project defaults. External environment overrides of npm config can still make npm itself noisy before script execution.

## Review

- Self-review: Task 3 added JSON-first CLI coverage plus the operator npm script; review-gate fix made the exact npm command stdout parseable and covered safe argument errors/help.
- Reviewer records decision after review.
