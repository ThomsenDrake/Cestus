# Task 5A: Config File And Auth Onboarding

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 5A: Config File And Auth Onboarding`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T15:41:59Z`
Status: `ready-for-review`

## Owned Files

- `packages/local-runtime/src/config-file.ts`
- `packages/local-runtime/test/config-file.test.ts`
- `packages/local-runtime/src/config.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/config.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `package.json`
- `docs/agentic/claims/task-5a-local-runtime-onboarding-config.md`

## Evidence

- Red command: `npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts`
- Red result: failed as expected; Vitest could not resolve `../src/config-file.js`, and the new `configure` CLI tests failed because no config file was written and the command returned exit code `1`.
- Green command: `npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts`
- Green result before review fixes: passed; 3 test files and 23 tests passed.
- Review red command: `npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts`
- Review red result: failed as expected; broad-permission auth config remained `0644`, invalid loopback host onboarding returned success, and `explicit-path` onboarding without a SQLite path returned success.
- Review green command: `npm test -- packages/local-runtime/test/config-file.test.ts packages/local-runtime/test/config.test.ts packages/local-runtime/test/cli.test.ts`
- Review green result: passed; 3 test files and 29 tests passed.
- Onboarding smoke configure command: `npm run --silent local:runtime:configure -- --bind tailnet --host 100.126.143.105 --port 8790`
- Onboarding smoke configure result: passed; wrote `.cestus/local/runtime.config.json` and printed redacted JSON with `"authToken": "[redacted]"`.
- Onboarding smoke config command: `npm run local:runtime:config`
- Onboarding smoke config result: passed; printed redacted config with `authRequired: true`, `devSeedEnabled: false`, and no raw token.
- Onboarding ignored-state command: `git status --ignored --short .cestus`
- Onboarding ignored-state result: passed; printed `!! .cestus/`, then `.cestus/` was removed from this worktree.
- Full verification: `npm run verify` passed; typecheck passed, 49 test files and 386 tests passed, Vite build succeeded, and factory readiness passed.

## Review

- Review status: ready-for-review
- Review fixes: changing an exposed config back to loopback resets host to `127.0.0.1` and drops auth material; token-bearing config files with broad permissions are repaired to `0600` before auth tokens are trusted; onboarding writes reject loopback configs with non-loopback hosts and `explicit-path` storage without a SQLite path before printing `ok: true`.
- Concerns: none recorded
