# Task 3 Claim: Safe Local Runtime Memory Routes

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 3: Safe Local Runtime Memory Routes`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T02:12:20Z`

Status: `claimed`

Owned files:

- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-memory-routes.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-3-agent-memory-routes.md`

Targeted commands:

- `npm test -- packages/local-runtime/test/agent-memory-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
- `npm run verify`

Stop conditions:

- Route support would bypass existing local-runtime auth.
- Memory correction routes would allow a non-human actor.
- Route support would append accepted graph, entity resolution, relationship acceptance, PRR send, export, lock-clearing, repair, provider byte transfer, or legacy-source mutation events.
- Invalid or unsafe request bodies would echo source text or secret-shaped values.
- Scheduler-specific route contracts are required to compile.

Command evidence:

- Pending.

Invariant notes:

- Memory routes expose resident-agent working memory only.
- List/detail are read-only.
- Record/supersede/retract append memory events through the runtime and preserve the same non-authoritative boundary.
