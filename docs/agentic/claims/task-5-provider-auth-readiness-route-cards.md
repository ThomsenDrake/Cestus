# Task 5 Claim: Provider/Auth Readiness Route And Cards

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

Task: Task 5: Local Runtime Route And Browser Setup Cards

Worker identity: Codex provider/auth implementation lane

Branch: `codex/resident-agent-provider-auth-design`

Worktree: `/home/drake/.codex/worktrees/8f27/Cestus`

Claimed at: `2026-07-07T23:15:36Z`

Status: `ready-for-review`

Review evidence:

- Spec compliance re-review approved at `8b1e48c`.
- Code-quality re-review approved at `8b1e48c`.
- Targeted verification: `npm test -- packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-adapter.test.ts` passed with 19 tests.
- Full verification: `npm run verify` passed with typecheck, 125 test files / 1163 tests, Vite build, and factory readiness.

Non-blocking follow-up note:

- A reviewer suggested future stricter handling for `action_*` values in diagnostic `relatedSafeIds`; no active returned action or credential-leak path was found in this slice.

Owned files:

- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`
- `packages/ui/src/agent/provider-setup-cards.ts`
- `packages/ui/test/agent-provider-setup-cards.test.ts`

Verification plan:

- `npm test -- packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-adapter.test.ts`
- `npm run verify`

Notes:

- This task exposes a read-only provider readiness DTO and browser-safe setup-card mapper.
- No credential mutation, live provider calls, external services, setup flows, or byte transfer are in scope.
