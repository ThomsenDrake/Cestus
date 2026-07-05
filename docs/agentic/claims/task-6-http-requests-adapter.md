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
- Green result before review fixes: passed; 3 test files and 12 tests passed.
- Review red command: `npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts`
- Review red result: failed as expected; workspace fetch failures leaked raw thrown messages, successful 200 runtime failure diagnostics passed through unsanitized, and the default HTTP adapter captured `globalThis.fetch` at module load.
- Review green command: `npm test -- packages/ui/test/request-http-adapter.test.ts packages/ui/test/request-data-boundary.test.ts packages/ui/test/visual-contract.test.ts`
- Review green result: passed; 3 test files and 17 tests passed.
- Full verification: `npm run verify` passed; typecheck passed, 50 test files and 394 tests passed, Vite build succeeded, and factory readiness passed.

## Review

- Review status: ready-for-review
- Review fixes: workspace load fetch failures now throw a fixed safe error, malformed workspace/draft JSON is directly covered, HTTP draft failure-result diagnostics are sanitized before returning to UI, and the default HTTP adapter uses the current `globalThis.fetch` at call time.
- Concerns: none recorded
