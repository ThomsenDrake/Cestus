# Task 1: Local Runtime Config Contract

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 1: Local Runtime Config Contract`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: 2026-07-05T12:48:22Z
Status: `fixes-ready-for-review`

## Owned Files

- `packages/local-runtime/src/config.ts`
- `packages/local-runtime/test/config.test.ts`
- `.gitignore`
- `docs/agentic/claims/task-1-local-runtime-config.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/config.test.ts` failed as expected after dependency hydration: `Cannot find module '../src/config.js' imported from packages/local-runtime/test/config.test.ts`
- Green command: `npm test -- packages/local-runtime/test/config.test.ts` passed: 1 test file passed, 6 tests passed
- Full verification: `npm run verify` passed: typecheck passed, 43 test files passed, 340 tests passed, UI build succeeded, factory-readiness passed

## Review

- Code quality review found security and path-normalization issues:
  unauthenticated non-loopback host overrides were possible while bind mode remained
  loopback, empty optional path env vars resolved to the cwd, and relative
  app-data dirs produced relative SQLite paths.
- Fix red command: `npm test -- packages/local-runtime/test/config.test.ts`
  failed with 5 expected failures: relative app-data path remained relative,
  `0.0.0.0` and `::` host overrides did not require auth, authenticated
  non-loopback host override left `authRequired` false, and empty UI/log path env
  values resolved to cwd.
- Fix green command: `npm test -- packages/local-runtime/test/config.test.ts`
  passed: 1 test file passed, 11 tests passed.
- Fix full verification: `npm run verify` passed: typecheck passed, 43 test
  files passed, 345 tests passed, UI build succeeded, factory-readiness passed.
- Review status: fixes-ready-for-review
- Concerns: none recorded
