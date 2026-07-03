# Task 2 Claim: Workspace DTO Read API

## Claim

- Plan path: `docs/superpowers/plans/2026-07-03-ledger-backed-prr-workspace-implementation.md`
- Task heading: `Task 2: Workspace DTO Read API`
- Worker identity: Codex worker subagent
- Branch: `codex/prr-ledger-backed-workspace-design`
- Worktree path: `/home/drake/.codex/worktrees/3ea1/Cestus`
- Claimed at UTC: `2026-07-03T21:14:40Z`
- Status: `claimed`

## Owned Files

- `docs/agentic/claims/task-2-prr-workspace-dto.md`
- `packages/prr/test/read-api.test.ts`
- `packages/prr/src/read-api.ts`
- `packages/prr/src/index.ts`

## Plan

1. Update this claim to `in-progress`.
2. Add failing DTO tests before production changes.
3. Run targeted red command: `npm test -- packages/prr/test/read-api.test.ts`.
4. Implement `PrrWorkspaceDto` and `buildPrrWorkspaceDto` in `packages/prr/src/read-api.ts`.
5. Preserve `buildRequestQueueRows` as a compatibility helper backed by richer read models.
6. Export new read API types from `packages/prr/src/index.ts`.
7. Run targeted green command: `npm test -- packages/prr/test/read-api.test.ts`.
8. Run full verification: `npm run verify`.
9. Update this claim to `ready-for-review` and commit the implementation.

## Command Evidence

- Red command/result: Not run yet.
- Green command/result: Not run yet.
- Full verification result: Not run yet.

## Review

- Review status: Not requested.
- Concerns: None recorded yet.
