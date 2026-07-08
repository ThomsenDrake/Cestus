# Task 2 Claim: Agent Approval Routes

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Task heading: `Task 2: Local Runtime Approval Routes`

Worker identity: Codex resident agent

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T15:31:48Z`

Status: `in-progress`

Owned files:

- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-approval-routes.test.ts`
- `docs/agentic/claims/task-2-agent-approval-routes.md`
- `.superpowers/sdd/task-2-report.md`

Verification:

- Targeted failing command: `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts`
- Targeted passing command: `npm test -- packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/approval-cockpit.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Approval or denial route needs to execute provider transfer, PRR send, export, repair, legal escalation, ontology acceptance, or scheduler resume work.
- Route implementation would weaken append-only ledger semantics, provenance, projection rebuildability, or human-only approval enforcement.
- Targeted verifier fails after two focused repair attempts.
