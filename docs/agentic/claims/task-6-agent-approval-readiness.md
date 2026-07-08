# Task 6 Claim: Agent Approval Cockpit Readiness

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-approval-cockpit-routes-ui-implementation.md`

Task heading: `Task 6: Verification And Readiness`

Worker identity: Codex resident agent

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T21:55:00Z`

Status: `blocked`

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

Implementation evidence:

- Claim commit: `f09c162` (`chore: claim task 6 agent approval readiness`)
- Start commit: `7fc06d0` (`chore: start task 6 agent approval readiness`)
- Focused bundle: `npm test -- packages/agent/test/approval-cockpit.test.ts packages/agent/test/approval-queue.test.ts packages/local-runtime/test/agent-approval-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-approval-adapter.test.ts packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts`
  - Passed with `Test Files  10 passed (10)` and `Tests  88 passed (88)`.
- Full gate: `npm run verify`
  - Passed with `typecheck passed`, `Test Files  134 passed (134)`, `Tests  1304 passed (1304)`, `tests passed`, Vite production build success, and `factory-readiness passed`.
- Whitespace: `git diff --check`
  - Passed with no output.
- Live smoke: Task 6 Step 5 exact command
  - Blocked because the real Nous invocation returned `ok: false`.
  - Safe discovery and failure evidence only: provider ID `provider_nous_portal`, model family `tencent/hy3:free`, event IDs `evt_6c33c10fceef4ee8837db61a0e0a8524`, `evt_55318288f650403e944a982b31d8f091`.

Blocker summary:

- Deterministic verification is green, but the authoritative live Nous Portal acceptance smoke did not complete successfully, so Task 6 cannot record readiness evidence or make the final readiness commit.
