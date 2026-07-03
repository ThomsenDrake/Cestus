# Task 3 Claim: Local PRR Runtime And Draft Event Builder

## Claim

- Plan path: `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- Task heading: `Task 3: Local PRR Runtime And Draft Event Builder`
- Worker identity: Codex worker subagent
- Branch: `codex/prr-ledger-backed-workspace-design`
- Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
- Claimed at UTC: `2026-07-03T21:34:42Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-3-prr-runtime.md`
- `packages/prr/test/runtime.test.ts`
- `packages/prr/src/draft-events.ts`
- `packages/prr/src/runtime.ts`
- `packages/prr/src/index.ts`

## Plan

1. Update this claim to `in-progress`.
2. Add failing runtime and draft-event tests before production changes.
3. Run targeted red command: `npm test -- packages/prr/test/runtime.test.ts`.
4. Implement browser-safe draft event builders in `packages/prr/src/draft-events.ts`.
5. Implement the injected-ledger PRR runtime in `packages/prr/src/runtime.ts`.
6. Export runtime and draft-event contracts from `packages/prr/src/index.ts`.
7. Run targeted green command: `npm test -- packages/prr/test/runtime.test.ts`.
8. Run full verification: `npm run verify`.
9. Update this claim to `ready-for-review` and commit the implementation.

## Command Evidence

- Red command/result: `npm test -- packages/prr/test/runtime.test.ts` failed as expected. Vitest reported 1 failed suite and 0 tests run because `../src/runtime.js` could not be found from `packages/prr/test/runtime.test.ts`.
- Green command/result: `npm test -- packages/prr/test/runtime.test.ts` passed. Vitest reported 1 test file passed and 7 tests passed.
- Full verification result: `npm run verify` passed. Output included `typecheck passed`, Vitest `39 passed (39)` test files and `297 passed (297)` tests, `tests passed`, Vite production build success, and `factory-readiness passed`.

## Review

- Review status: Ready for review.
- Concerns: None recorded.

## Review Fix

- Review-fix status: `ready-for-review`
- Review-fix red command/result: `npm test -- packages/prr/test/runtime.test.ts` failed as expected. Vitest reported 1 test file failed, with 4 failed tests covering unsupported-pack preflight, secret diagnostic redaction, stable-clock default request ID uniqueness, and seed causation rejection.
- Review-fix green command/result: `npm test -- packages/prr/test/runtime.test.ts` passed. Vitest reported 1 test file passed and 11 tests passed.
- Review-fix full verification result: `npm run verify` passed. Output included `typecheck passed`, Vitest `39 passed (39)` test files and `301 passed (301)` tests, `tests passed`, Vite production build success, and `factory-readiness passed`.
- Review-fix concerns: None recorded.
