# Task 2 Claim: Agent Cockpit Routes

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Requirements: `.superpowers/sdd/task-2-brief.md`
Task: Task 2: Local Runtime Cockpit And Safe Run Routes
Worker: Codex GPT-5
Branch: `codex/resident-agent-cockpit-task-run-plan`
Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`
Claimed-at: 2026-07-09T01:26:26Z
Status: in-progress

Owned files:
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-cockpit-routes.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-2-agent-cockpit-routes.md`

Targeted commands:
- `npm test -- packages/local-runtime/test/agent-cockpit-routes.test.ts`
- `npm test -- packages/local-runtime/test/agent-cockpit-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/cockpit.test.ts`
- `npm run verify`

Invariant notes:
- `GET /api/agent/cockpit` may only compose current runtime status, provider readiness, and approval cockpit into `agent-cockpit.v1` via `buildAgentCockpit`.
- `POST /api/agent/runs` may only validate the body and call `runtime.startRun` as a safe event-appending route.
- Do not call scheduler wake, execution loops, ontology-bootstrap workflow execution, provider adapters, PRR send, provider byte transfer, export, legal escalation, repair, accepted graph review, legacy import or staging, workspace truth mutation, or domain execution services.
- Reject unsafe IDs and body keys with safe diagnostics, and keep browser/runtime JSON secret-safe.
