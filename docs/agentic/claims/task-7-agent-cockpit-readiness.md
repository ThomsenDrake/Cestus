# Task 7 Claim: Agent Cockpit Readiness

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`

Task heading: `Task 7: Verification And Readiness`

Worker identity: Codex

Branch: `codex/resident-agent-cockpit-task-run-plan`

Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`

Claimed at: `2026-07-09T14:18:42Z`

Status: `ready-for-review`

Owned files:

- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
- `docs/agentic/claims/task-7-agent-cockpit-readiness.md`

Verification plan:

- Focused resident cockpit suite from Task 7.
- `npm run verify`
- `git diff --check`

Command evidence:

- Focused: `npm test -- packages/agent/test/cockpit.test.ts packages/agent/test/approval-cockpit.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts`
  - Result: `Test Files  12 passed (12)`, `Tests  96 passed (96)`.
- Final review fix: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/agent-cockpit-adapter.test.ts`
  - Result: `Test Files  4 passed (4)`, `Tests  31 passed (31)`.
- Full: `npm run verify`
  - Result: `typecheck passed`, `Test Files  148 passed | 1 skipped (149)`, `Tests  1407 passed | 1 skipped (1408)`, `tests passed`, Vite production build success, and `factory-readiness passed`.
  - Note: Vite emitted the existing chunk-size warning; the command exited successfully.
- Whitespace: `git diff --check`
  - Result: no output.

Readiness notes:

- The Agent workspace can create tasks, start safe runs through runtime routes, refresh cockpit/status state, and approve or deny through existing decision routes.
- No route or button directly sends PRRs, transfers provider bytes, exports, clears legal locks, executes repairs, accepts graph truth, imports legacy material, or stages legacy material.
- Scheduler wake remains merge-after-scheduler. If the scheduler branch lands an overlapping contract, route wiring must adapt to that landed contract before merge.
