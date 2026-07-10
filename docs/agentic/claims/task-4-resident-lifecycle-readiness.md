# Task 4 Claim: Resident Lifecycle Bootstrap Readiness

- Plan: `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`
- Task: `Task 4: Factory Readiness And Final Integration Review`
- Worker: `Codex`
- Branch: `codex/resident-lifecycle-bootstrap-implementation`
- Worktree: `/home/drake/.codex/worktrees/14a7/Cestus`
- Claimed at: `2026-07-10T16:20:00Z`
- Status: `claimed`

## Owned Files

- `docs/agentic/claims/task-4-resident-lifecycle-readiness.md`
- `scripts/check-agent-readiness.mjs`
- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`

## Required Validation

- `npm run factory:check`
- `npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx`
- `npm run verify`
