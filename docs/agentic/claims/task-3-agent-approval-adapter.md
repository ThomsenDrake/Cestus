# Task 3 Claim: Browser Adapter For Approval Cockpit

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Task heading: `Task 3: Browser Adapter For Approval Cockpit`

Worker identity: Codex resident agent

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T16:04:57Z`

Status: `claimed`

Owned files:

- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-approval-adapter.test.ts`
- `docs/agentic/claims/task-3-agent-approval-adapter.md`
- `.superpowers/sdd/task-3-report.md`

Verification:

- Targeted failing command: `npm test -- packages/ui/test/agent-approval-adapter.test.ts`
- Targeted passing command: `npm test -- packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- UI parsing or adapter wiring would require importing Node runtime, SQLite, filesystem, blob store, workspace validation, provider adapter, or domain service modules into the browser bundle.
- Adapter methods would need to call execution, provider, PRR, export, repair, legal, acceptance, or scheduler-resume routes instead of approval cockpit and decision routes.
- Targeted verifier fails after two focused repair attempts.
