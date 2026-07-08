# Task 6 Claim: Agent Approval Cockpit Readiness

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Task heading: `Task 6: Verification And Readiness`

Worker identity: Codex resident agent

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T21:55:00Z`

Status: `claimed`

Owned files:

- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`
- `docs/agentic/claims/task-6-agent-approval-readiness.md`
- `.superpowers/sdd/task-6-report.md`

Verification:

- Focused bundle: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts`
- Full gate: `npm run verify`
- Whitespace: `git diff --check`
- Live smoke: repo-root live Nous Portal acceptance smoke from Task 6 Step 5

Stop conditions:

- Live Nous provider is unavailable or cannot be discovered from the ignored local `.env`.
- Local `.env` credentials are unavailable.
- Live endpoint fails or returns unsafe diagnostics.
- Any output path would print secrets, prompts, raw provider output, or raw provider errors.
- Any schema conflict or data-loss risk appears.
- Any verifier fails repeatedly after two focused repair attempts.
