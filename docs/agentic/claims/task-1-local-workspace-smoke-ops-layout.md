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

## Supporting Verifier Edits

- `packages/workspace-ops/src/ops.ts`: verifier-required supporting edit because spec review found `validateResolvedManifest` still called the strict provisional parser instead of the canonical-or-provisional identity parser.
- `packages/workspace-ops/test/ops.test.ts`: verifier-required supporting edit to protect `verifyWorkspace` against regression when validating a resolved canonical portable workspace manifest.

## Evidence

- Red command: `npm test -- packages/workspace-ops/test/layout.test.ts` failed as expected; the canonical portable workspace binding test received `blocked` instead of `ready`.
- Green command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts` passed: 2 test files, 21 tests.
- Full verification: `npm run verify` passed: typecheck passed, 92 test files passed, 823 tests passed, UI build succeeded, factory-readiness passed.

## Review

- Spec review requested strict provisional parsing plus `validateResolvedManifest` use of canonical-or-provisional identity parsing.
- Follow-up red command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts` failed as expected; `parseProvisionalWorkspaceManifest` returned a canonical manifest identity instead of `undefined`.
- Follow-up green command: `npm test -- packages/workspace-ops/test/layout.test.ts packages/workspace-ops/test/ops.test.ts` passed: 2 test files, 23 tests.
- Follow-up full verification: `npm run verify` passed: typecheck passed, 92 test files passed, 825 tests passed, UI build succeeded, factory-readiness passed.
