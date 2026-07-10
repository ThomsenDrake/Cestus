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
  - Result: `Test Files  12 passed (12)`, `Tests  98 passed (98)`.
- Final review fix: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/agent-cockpit-adapter.test.ts`
  - Result: `Test Files  4 passed (4)`, `Tests  31 passed (31)`.
- Post-`neo` correction targeted UI regression: `npm test -- packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-app-integration.test.tsx`
  - Result: `Test Files  2 passed (2)`, `Tests  18 passed (18)`.
- Full coordinator verification: `npm run verify`
  - Result from unrestricted writable shell: `typecheck passed`, `Test Files  170 passed | 3 skipped (173)`, `Tests  1708 passed | 3 skipped (1711)`, Vite build passed, and `factory-readiness passed`.
- Final independent-review focused regression: `npm test -- packages/ui/test/agent-adapter.test.ts packages/agent/test/cockpit.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-task-composer.test.tsx`
  - Result: `Test Files  4 passed (4)`, `Tests  33 passed (33)`.
- Whitespace: `git diff --check`
  - Result: no output.

Readiness notes:

- The Agent workspace can queue tasks through runtime task routes, refresh cockpit/status/memory state, record memory through memory routes, and approve or deny through existing decision routes.
- The Agent workspace exposes no generic run-start route, adapter method, app callback, or UI control. Specialist readiness is read-only and every MVP specialist remains `executionReady: false`.
- Context pack audit counts are now canonical DTO fields: `omissionCount` is projected from model invocation omissions, and `stalenessInputCount` is projected from context-pack staleness inputs. The cockpit no longer infers these counts from provenance/source/artifact arrays.
- Specialist readiness reports the landed scheduler/domain contracts and registered domain adapter families as available while still surfacing missing context packs, stale context, missing projection high-water marks, missing provenance context packs, provider/template/approval/lock blockers, and the missing `contradiction-claim-review` adapter family.
- Actual specialist handoffs are displayed only when supplied as matching `agent-specialist-handoff.v1` DTOs bound to the selected run's `runId`, `runType`, and `taskId`. A durable production handoff source remains an explicit blocker for future specialist workflow slices.
- No route or button directly sends PRRs, transfers provider bytes, exports, clears legal locks, executes repairs, accepts graph truth, imports legacy material, or stages legacy material.
- Scheduler wake follows the landed scheduler contract. Ontology bootstrap remains the only specialist-specific executable route preserved by this cockpit merge.
