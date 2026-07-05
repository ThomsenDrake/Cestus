# Task 3: Local HTTP Handler And SQLite Runtime Factory

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 3: Local HTTP Handler And SQLite Runtime Factory`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: 2026-07-05T13:16:10Z
Status: `fixes-ready-for-review`

## Owned Files

- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/test/http-handler.test.ts`
- `docs/agentic/claims/task-3-local-http-handler.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Failed as expected: `Error: Cannot find module '../src/http-handler.js' imported from /home/drake/.codex/worktrees/ea09/Cestus/packages/local-runtime/test/http-handler.test.ts` at `packages/local-runtime/test/http-handler.test.ts:6:1`; `Test Files  1 failed (1)`, `Tests  no tests`.
- Green command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Passed: `Test Files  1 passed (1)`, `Tests  3 passed (3)`.
- Full verification: `npm run verify`
  - Passed: `typecheck passed`; `Test Files  44 passed (44)`, `Tests  349 passed (349)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.

## Code Quality Review Fix

- Finding: code quality review found that syntactically valid but malformed JSON could escape the local HTTP handler as a runtime exception. Reproduction body used `agency: null` for `POST /api/requests/drafts`, which parsed successfully and was cast to `CreateDraftRequestInput` before PRR internals tried to read `contact.name`.
- Fix: `packages/local-runtime/src/http-handler.ts` now keeps a private HTTP-boundary body guard for draft creation. It validates the parsed JSON shape for jurisdiction pack, agency, requester, request text, received timestamp, and optional string `deadlineEstimateKind` before calling the PRR runtime. Invalid JSON keeps the existing diagnostic; malformed valid JSON returns the draft body diagnostic.
- Regression test: `packages/local-runtime/test/http-handler.test.ts` now covers valid JSON with invalid shape and ensures `handler.close()` runs via `try/finally`.
- Red command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Failed as expected: `TypeError: Cannot read properties of null (reading 'name')` at `packages/prr/src/draft-events.ts:182:19`; `Test Files  1 failed (1)`, `Tests  1 failed | 3 passed (4)`.
- Green command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Passed after fix: `Test Files  1 passed (1)`, `Tests  4 passed (4)`.
- Full verification: `npm run verify`
  - Passed after fix: `typecheck passed`; `Test Files  44 passed (44)`, `Tests  350 passed (350)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.

## Review

- Review status: fixes-ready-for-review
- Concerns: none recorded

## Second Code Quality Review Fix

- Finding: second code quality review found that syntactically valid JSON with semantically invalid draft fields could still cross the HTTP boundary and create durable partial request state. Example: `receivedAt: "not-a-date"` reached `createDraftRequest`, appended `prr.request.created`, then failed deadline estimation, leaving the bad draft visible in the workspace.
- Fix: `packages/local-runtime/src/http-handler.ts` now validates draft semantics before calling the PRR runtime. Required jurisdiction pack fields, contact names, request text, and received timestamp must be non-empty strings; `receivedAt` must match the PRR UTC datetime shape and round-trip UTC date/time components; optional `deadlineEstimateKind` must be `acknowledgement` or `productionReview`; optional contact email/phone fields must be strings, with email passing a minimal safe email check.
- Regression tests: `packages/local-runtime/test/http-handler.test.ts` now covers invalid `receivedAt` and invalid `deadlineEstimateKind` values, asserts the generic 400 draft-body diagnostic, and confirms the generated test request IDs are absent from the workspace after rejection. The test file also uses an `afterEach` handler registry so open handlers are closed even when assertions fail.
- Red command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Failed as expected after adding the regression tests: `AssertionError: expected 200 to be 400` for `rejects invalid receivedAt values without persisting a draft` at `packages/local-runtime/test/http-handler.test.ts:167:29`, and `AssertionError: expected 200 to be 400` for `rejects invalid deadline estimate kinds without persisting a draft` at `packages/local-runtime/test/http-handler.test.ts:199:29`; `Test Files  1 failed (1)`, `Tests  2 failed | 4 passed (6)`.
- Green command: `npm test -- packages/local-runtime/test/http-handler.test.ts`
  - Passed after fix: `Test Files  1 passed (1)`, `Tests  6 passed (6)`.
- Full verification: `npm run verify`
  - Passed after fix: `typecheck passed`; `Test Files  44 passed (44)`, `Tests  352 passed (352)`; `tests passed`; `vite build` succeeded; `factory-readiness passed`.
