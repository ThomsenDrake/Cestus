# Task 4: Auth Enforcement And Explicit Seed Contract

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 4: Auth Enforcement And Explicit Seed Contract`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T13:59:51Z`
Status: `ready-for-review`

## Owned Files

- `packages/local-runtime/test/auth-and-seed.test.ts`
- `packages/local-runtime/src/http-handler.ts`
- `docs/agentic/claims/task-4-local-auth-seed.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/auth-and-seed.test.ts`
  - Result: passed immediately, `1` test file passed, `5` tests passed.
  - Note: Task 3 already satisfied the Task 4 handler behavior, so no production change was made and no red failure was fabricated.
- Green command: `npm test -- packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed, `2` test files passed, `13` tests passed.
- Full verification: `npm run verify`
  - Result: passed after claim evidence update.

## Review

- Review status: ready-for-review
- Concerns: DONE_WITH_CONCERNS because the initial targeted Task 4 test command passed immediately, indicating Task 3 pre-satisfied the behavior under test.

## Code Quality Review Fix

- Finding: code quality review found Task 4's test-only lock-in did not explicitly pin auth for `/api/dev/*` routes under non-loopback exposure, seed skipping over a non-empty ledger, or representative compact/send/legal-escalation route classes.
- Fix: `packages/local-runtime/test/auth-and-seed.test.ts` now covers non-loopback dev-route auth with missing, wrong, and correct bearer tokens; explicit seed skipping after a draft has already made the ledger non-empty; and additional destructive-looking routes (`/api/dev/truncate`, `/api/ledger/compact`, `/api/requests/send`, `/api/requests/legal-escalation`). Test teardown cleanup now uses `try/finally` so temp directories are still removed if handler close fails.
- Green command: `npm test -- packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed, `2` test files passed, `15` tests passed.
- Full verification: `npm run verify`
  - Result: passed after fix: `typecheck passed`; `Test Files  45 passed (45)`, `Tests  361 passed (361)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.

## Second Code Quality Review Fix

- Finding: second code quality review found Task 4 still did not prove disabled seed leaves the ledger untouched or that the write-capable draft creation route enforces bearer auth under non-loopback exposure.
- Fix: `packages/local-runtime/test/auth-and-seed.test.ts` now reads the workspace after a disabled seed attempt and asserts it remains empty, and adds a tailnet auth test for `POST /api/requests/drafts` with missing, wrong, and correct bearer tokens.
- Green command: `npm test -- packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed, `2` test files passed, `16` tests passed.
- Full verification: `npm run verify`
  - Result: passed after second fix: `typecheck passed`; `Test Files  45 passed (45)`, `Tests  362 passed (362)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.

## Third Code Quality Review Fix

- Finding: final security review found disabled seed and destructive-route checks still proved only projected workspace state, not raw ledger immutability, and the read route did not explicitly cover wrong-token rejection.
- Fix: `packages/local-runtime/test/auth-and-seed.test.ts` now checks raw event counts with a fresh SQLite runtime for disabled seed and destructive-looking routes, and asserts wrong-token rejection for `GET /api/requests/workspace`.
- Green command: `npm test -- packages/local-runtime/test/auth-and-seed.test.ts packages/local-runtime/test/http-handler.test.ts`
  - Result: passed, `2` test files passed, `16` tests passed.
- Full verification: `npm run verify`
  - Result: passed after third fix: `typecheck passed`; `Test Files  45 passed (45)`, `Tests  362 passed (362)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.
