# Task 4 Claim: Provider/Auth Selection

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

Task: Task 4: Provider Selection Policy

Worker identity: Codex provider/auth implementation lane

Branch: `codex/resident-agent-provider-auth-design`

Worktree: `/home/drake/.codex/worktrees/8f27/Cestus`

Claimed at: `2026-07-07T22:54:52Z`

Status: `claimed`

Owned files:

- `packages/agent/src/provider-selection.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/provider-selection.test.ts`

Verification plan:

- `npm test -- packages/agent/test/provider-selection.test.ts packages/agent/test/provider-readiness.test.ts`
- `npm run verify`

Notes:

- This task adds deterministic policy selection over fake provider descriptors and readiness states.
- No live provider calls, credentials, external services, setup flows, runtime routes, UI, or byte transfer are in scope.
