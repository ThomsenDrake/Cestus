# Task 6: Agent Cockpit App Integration

Plan path: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
Task heading: `Task 6: App Integration And Command Regression`
Worker identity: Codex
Branch: `codex/resident-agent-cockpit-task-run-plan`
Worktree path: `/home/drake/.codex/worktrees/50b6/Cestus`
Claimed at UTC: `2026-07-09T13:57:41Z`
Status: `ready-for-review`

## Progress

- 2026-07-09T13:58:33Z: Claimed task and began RED test setup for app-level cockpit integration.
- 2026-07-09T14:08:18Z: Wired app-level cockpit load, refresh, task creation, run start, and decision reload flow. Targeted tests and `npm run verify` passed.
- 2026-07-09T14:16:30Z: Closed review finding by moving ontology-bootstrap route reads behind the injected `AgentAdapter`, then reran the expanded targeted suite and full `npm run verify`.

## Evidence

- Claim commit: `27e2409` (`chore: claim task 6 agent cockpit app integration`)
- Start commit: `e0540ff` (`chore: start task 6 agent cockpit app integration`)
- Red command: `npm test -- packages/ui/test/agent-app-integration.test.tsx`
  - Failed as expected before `App.tsx` loaded cockpit state, with the Agent workspace missing the task composer/run cockpit and `loadCockpit()` still unused at app level.
- Green targeted command: `npm test -- packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/agent-workspace.test.tsx`
  - Passed: 4 test files, 34 tests.
- Review-fix RED command: `npm test -- packages/ui/test/agent-app-integration.test.tsx packages/ui/test/agent-cockpit-adapter.test.ts`
  - Failed as expected before the fix because `AgentAdapter` did not expose `loadOntologyBootstrapRoute()` and `App.tsx` still bypassed the injected adapter.
- Review-fix targeted command: `npm test -- packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
  - Passed: 6 test files, 51 tests.
- Full verification: `npm run verify`
  - Passed: `typecheck passed`, 148 test files passed with 1 skipped, 1407 tests passed with 1 skipped, `tests passed`, Vite production build succeeded, `factory-readiness passed`.

## Notes

- `packages/ui/test/command-model.test.ts` and `packages/ui/test/agent-workspace.test.tsx` remained correct without edits; the existing assertions still cover the command brief boundary and workspace component contract for this slice.

## Owned Files

- `packages/ui/src/App.tsx`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-app-integration.test.tsx`
- `packages/ui/test/agent-cockpit-adapter.test.ts`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/command-model.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `docs/agentic/claims/task-6-agent-cockpit-app-integration.md`
- `.superpowers/sdd/task-6-report.md`
