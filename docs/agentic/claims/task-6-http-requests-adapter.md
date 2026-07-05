# Task 6: Browser-Safe HTTP Requests Adapter

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 6: Browser-Safe HTTP Requests Adapter`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T16:03:12Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-6-http-requests-adapter.md`
- `packages/ui/test/request-http-adapter.test.ts`
- `packages/ui/src/requests/request-adapter.ts`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/visual-contract.test.ts`

## Evidence

- Red command: `npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts`
- Red result: failed as expected; `packages/ui/test/request-http-adapter.test.ts` reported `TypeError: createHttpRequestsAdapter is not a function` for all three new adapter tests, while the two existing contract test files passed.
- Green command: `npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts`
- Green result: passed; 3 test files and 12 tests passed.
- Full verification: `npm run verify` passed; typecheck passed, 50 test files and 389 tests passed, Vite build succeeded, and factory readiness passed.

## Review

- Review status: ready-for-review
- Concerns: none recorded
