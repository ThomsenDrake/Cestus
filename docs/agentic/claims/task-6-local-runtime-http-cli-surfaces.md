# Task 6 Claim: Local Runtime HTTP And CLI Surfaces

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 6: Local Runtime HTTP And CLI Surfaces
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T20:00:00Z
Status: in-progress

Owned files:
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/http-handler.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `docs/agentic/claims/task-6-local-runtime-http-cli-surfaces.md`

Targeted commands:
- `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/cli.test.ts`
- `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/http-handler.test.ts packages/local-runtime/test/cli.test.ts`
- `npm run verify`

Invariant notes:
- Preserve append-only ledger semantics: HTTP and CLI task creation must use the resident-agent runtime and append agent task events only.
- Preserve projection rebuildability: status and tool-request views must come from runtime projections, not hidden local state.
- Preserve existing local-runtime auth: agent routes must pass through the shared HTTP auth boundary without route-local bypasses.
- Preserve provider and credential boundaries: the default local factory may use only the deterministic fake local provider and must not require live credentials or outbound services.
- Preserve human gates: routes and CLI commands must not approve provider byte transfer, PRR sends, legal escalation, export, destructive repair, or accepted graph truth.
- Preserve secret safety: task-body validation, route diagnostics, CLI JSON, provider descriptors, and dependency failures must not emit raw secrets, environment variable names, bearer material, or raw provider errors.
