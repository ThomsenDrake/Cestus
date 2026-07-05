# Task 8: Readiness, Factory Evidence, And Local Runtime Preview

Plan path: `docs/superpowers/plans/2026-07-05-durable-local-prr-runtime-implementation.md`
Task heading: `Task 8: Readiness, Factory Evidence, And Local Runtime Preview`
Worker identity: Codex
Branch: `codex/durable-local-runtime-design`
Worktree path: `/home/drake/.codex/worktrees/ea09/Cestus`
Claimed at UTC: `2026-07-05T16:29:45Z`
Status: `ready-for-review`

## Owned Files

- `scripts/check-agent-readiness.mjs`
- `docs/agentic/software-factory.md`
- `packages/ui/test/request-data-boundary.test.ts`
- `packages/ui/test/app-smoke.test.tsx`

## Evidence

- Red command: `npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx` failed as expected. `request-data-boundary.test.ts` reported 1 failed readiness assertion because `requiredFiles` did not include the 2026-07-05 durable local PRR runtime spec and plan; Vitest reported `Test Files  1 failed | 1 passed (2)` and `Tests  1 failed | 15 passed (16)`.
- Green command: `npm test -- packages/ui/test/request-data-boundary.test.ts packages/ui/test/app-smoke.test.tsx` passed. Vitest reported `Test Files  2 passed (2)` and `Tests  16 passed (16)`.
- Factory readiness: `npm run factory:check` passed with `factory-readiness passed`.
- Full verification: `npm run verify` passed with `typecheck passed`, `Test Files  50 passed (50)`, `Tests  397 passed (397)`, `tests passed`, Vite build success, and `factory-readiness passed`.
- UI build: `npm run ui:build` passed; Vite built `dist/index.html` and assets successfully.
- Local runtime preview: `CESTUS_LOCAL_PORT=8788 npm run local:runtime` printed `Cestus local runtime listening on http://127.0.0.1:8788`; `curl -I http://127.0.0.1:8788/` returned `HTTP/1.1 200 OK`; `curl -s http://127.0.0.1:8788/api/health` returned `{"ok":true,"storageStrategy":"repo-local","bindMode":"loopback","authRequired":false,"devSeedEnabled":false}`; `curl -s http://127.0.0.1:8788/api/requests/workspace` returned an empty workspace with `"cards":[]` and no automatic seed data. The local runtime was stopped before task completion; follow-up curl returned `000`.

## Review

- Review status: ready-for-review
- Concerns: none recorded
