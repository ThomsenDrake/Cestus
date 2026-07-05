# Task 5: Server, Static UI Serving, And CLI Scripts

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 5: Server, Static UI Serving, And CLI Scripts`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T14:27:29Z`
Status: `ready-for-review`

## Owned Files

- `packages/local-runtime/src/static-files.ts`
- `packages/local-runtime/src/server.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/static-files.test.ts`
- `packages/local-runtime/test/server.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `package.json`
- `package-lock.json`
- `docs/agentic/claims/task-5-local-runtime-cli.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/cli.test.ts`
- Red result: failed as expected; Vitest could not find `../src/cli.js` from `packages/local-runtime/test/cli.test.ts` and could not find `../src/static-files.js` from `packages/local-runtime/test/static-files.test.ts`.
- Green command: `npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/cli.test.ts`
- Green result before review fixes: passed; 2 test files and 6 tests passed.
- Review red command: `npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/server.test.ts`
- Review red result: failed as expected; symlinked static file escaped the static root, unauthenticated protected POST waited for the unfinished body, oversized request body returned `400` instead of `413`, and double close attempted to close SQLite twice.
- Review green command: `npm test -- packages/local-runtime/test/static-files.test.ts packages/local-runtime/test/server.test.ts packages/local-runtime/test/cli.test.ts`
- Review green result: passed; 3 test files and 11 tests passed.
- Smoke config command: `npm run local:runtime:config`
- Smoke config result: passed; printed resolved repo-local config with no auth token value.
- Smoke seed command: `CESTUS_LOCAL_BIND=tailnet CESTUS_LOCAL_AUTH_TOKEN=secret-token npm run --silent prr:seed-local`
- Smoke seed result: passed; parsed output had `ok: true`, `seed.appendedCount: 28`, `workspace.cards.length: 9`, and did not print the auth token.
- Full verification: `npm run verify` passed; typecheck passed, 48 test files and 373 tests passed, Vite build succeeded, and factory readiness passed.

## Review

- Review status: ready-for-review
- Review fixes: seed CLI authenticates its own tailnet/LAN seed call, static serving uses realpath containment, the Node HTTP wrapper rejects unauthenticated protected routes before reading bodies, request bodies are capped at 1 MiB with a `413` diagnostic, and server close drains before closing SQLite and is idempotent.
- Concerns: generated config-file/auth-secret onboarding is not owned by the original Task 5 plan; parent thread will add a factory-plan amendment before Task 6.
