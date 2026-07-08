# Task 2 Claim: Provider/Auth Registry

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

Task: Task 2: Provider Registry And Capability Descriptors

Worker identity: Codex provider/auth implementation lane

Branch: `codex/resident-agent-provider-auth-design`

Worktree: `/home/drake/.codex/worktrees/8f27/Cestus`

Claimed at: `2026-07-07T22:05:11Z`

Status: `ready-for-review`

Review evidence:

- Spec compliance re-review approved at `67dc702`.
- Code-quality re-review approved at `67dc702`.
- Targeted verification: `npm test -- packages/agent/test/provider-registry.test.ts packages/agent/test/provider.test.ts` passed with 15 tests.
- Full verification: `npm run verify` passed with typecheck, 121 test files / 1131 tests, Vite build, and factory readiness.

Owned files:

- `packages/agent/src/provider-registry.ts`
- `packages/agent/src/provider.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/provider-registry.test.ts`

Verification plan:

- `npm test -- packages/agent/test/provider-registry.test.ts packages/agent/test/provider.test.ts`
- `npm run verify`

Notes:

- This task adds deterministic fake provider descriptors only.
- No live provider calls, credentials, external services, setup flows, or byte transfer are in scope.
