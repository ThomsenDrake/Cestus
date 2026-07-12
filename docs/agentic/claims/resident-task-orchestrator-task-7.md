# Resident Task Orchestrator Task 7 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 7, Runtime Composition Without Scheduler Ownership Drift
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-7.md`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/runtime.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- `packages/agent/test/runtime.test.ts`

Supporting invariant repair:

- `packages/agent/src/task-orchestrator.ts`

Post-review capability repair:

- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`

Tasks 1-6 are shared, uncommitted scoped diffs in this managed worktree and
remain untouched except for dependent type usage. Git metadata is read-only in
this linked worktree, so this task will not stage or commit.

## RED Evidence

```bash
npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
```

Expected RED observed: 7 failures. Runtime failures are missing
`tickTaskOrchestrator()` and `wakeResidentAgent()` methods. Local-runtime route
failures are 404s for the new task orchestrator/composed wake routes.

Follow-up RED/repair evidence:

```bash
npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
```

Observed one route failure after initial implementation: a released
`approval-wait` checkpoint was reclaimed by the new queued-task candidate path
when no provider policy was configured for the route tick. This violated the
stable attempt boundary and required the supporting invariant repair in
`packages/agent/src/task-orchestrator.ts`.

Review RED observed after first Task 7 review: runtime task orchestration was
constructed with placeholder `{}` capability objects, allowing claims without a
registered workflow, context resolver, prompt renderer, provider capability
registry, approval reader, runner registry, or durable handoff capability.

## GREEN Evidence

```bash
npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
```

Passed after review repair: 2 files, 33 tests.

```bash
npm run typecheck
```

Passed.

```bash
git diff --check
```

Passed.

## Verification

```bash
npm run verify
```

Passed typecheck, then hit only the known managed-sandbox verifier blockers:
local-runtime HTTP server `listen EPERM` on loopback/wildcard binds,
workspace-ops `tsx` IPC pipe `listen EPERM`, and the workspace-readiness smoke
empty stdout caused by sandbox-blocked child process execution. Summary:
3 failed files, 183 passed, 3 skipped; 19 failed tests, 2191 passed, 3 skipped.

```bash
npm run factory:check
```

Blocked by the known managed-sandbox `spawnSync git EPERM` in
`scripts/check-agent-readiness.mjs` while running `git ls-files`.

## Result

- Added `runtime.tickTaskOrchestrator()` as the queued-task orchestration wake.
- Added `runtime.wakeResidentAgent()` as an explicit composition of task
  orchestration tick followed by approved-tool scheduler wake, with separate
  summary envelopes.
- Kept approved-tool scheduler wake separate; scheduler wake does not claim
  queued tasks and task tick does not execute approved tools.
- Added local runtime routes for `/api/agent/task-orchestrator/tick` and
  `/api/agent/wake`.
- Exposed suspended approval and handoff-pending projection states without
  leaking resolved context payloads or prompt bytes.
- Blocked task orchestration ticks until mounted resident lifecycle readiness
  projects canonical `agent_default` ready.
- Preserved stable attempt identity across released suspended checkpoints by
  preventing the new-queued-task selector from starting a duplicate unfinished
  attempt.
- Added `AgentTaskOrchestratorRuntimeCapabilities` as the runtime injection
  boundary for registered workflow, context, prompt renderer, provider
  capability, approval reader, runner registry, and durable handoff contracts.
- Removed runtime placeholder capability objects. Runtime and local-runtime
  task ticks now fail closed before claim mutation when orchestration
  capabilities are not registered. Tests that exercise claim-only runtime
  composition use an explicit injected local test posture and assert the
  runner/handoff/prompt paths are not reached in Task 7.

## Commit Boundary

Git metadata is read-only in this linked worktree. Coordinator commit boundary:
`HEAD 1894fe6a` plus this uncommitted scoped diff.
