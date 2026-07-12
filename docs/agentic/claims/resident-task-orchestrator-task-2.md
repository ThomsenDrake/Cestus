# Resident Task Orchestrator Task 2 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 2, Projection, Terminal Truth, And Restart Reconstruction
- Claimed at: 2026-07-12T03:36:47Z
- Worker: Codex Wave 5 resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Approved by review agent: `019f547d-7e52-78b1-bff2-fad97e3335db`
- Approved at: 2026-07-12T04:21:00Z

## Scope

Owned files for this task:

- `docs/agentic/claims/resident-task-orchestrator-task-2.md`
- `packages/agent/src/task-orchestrator-projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/test/task-orchestrator-projection.test.ts`
- `packages/agent/test/projection.test.ts`
- `packages/agent/src/index.ts`

Do not edit Task 1 files except if a Task 2 verifier proves a tiny supporting export/type correction is required.

## Dependency Boundary

Task 1 is reviewed and target-green but uncommitted because this sandbox cannot write linked-worktree Git metadata:

```text
git add docs/agentic/claims/resident-task-orchestrator-task-1.md
fatal: Unable to create '/home/drake/Projects/Cestus/.git/worktrees/Cestus6/index.lock': Read-only file system
```

Task 2 starts from:

- Repository HEAD: `1894fe6ad6aec2be0c9c19e54e75ae3dfd2ee7a3`
- Coordinator boundary: HEAD plus the reviewed Task 1 scoped diff recorded in `docs/agentic/claims/resident-task-orchestrator-task-1.md`

Task 1 focused verification:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
Test Files  2 passed (2)
Tests  66 passed (66)

npm run typecheck
typecheck passed

git diff --check
no output
```

Full `npm run verify` and `npm run factory:check` require the unrestricted coordinator environment because this managed sandbox blocks local listen sockets, tsx IPC pipes, and Node-spawned Git.

## Task 2 Requirements

Implement projection/restart reconstruction only. Preserve:

- `agent.task.status.changed` as the only task-status projection source.
- Orchestration terminal events before causally linked task terminal status.
- Handoff-pending for final-output/prepared/partial handoff states without verified recorded/readback.
- Fail-closed behavior for duplicate active attempts and inconsistent terminal sequences.
- Rebuildability from append-only ledger events sorted by canonical ledger order.

## Expected RED

The Task 2 tests should fail before implementation because the task-orchestrator projection module and terminal sequencing logic do not exist.

## Task 2 RED Evidence

Command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result: expected RED.

Observed:

```text
Test Files  2 failed (2)
Tests  1 failed | 8 passed (9)
packages/agent/test/task-orchestrator-projection.test.ts: Cannot find module '../src/task-orchestrator-projection.js'
packages/agent/test/projection.test.ts: TypeError: Cannot read properties of undefined (reading 'tasks')
```

## Task 2 GREEN Evidence

Targeted command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests  25 passed (25)
```

Implemented:

- Added `TaskOrchestratorProjection` and `TaskOrchestratorAttemptProjection` read-model contracts.
- Added `buildTaskOrchestratorProjection()` over append-only ledger events sorted by canonical global/stream order.
- Kept task status truth sourced from `agent.task.status.changed`.
- Projected queued, claimed, approval-suspended, stale-claim-recoverable, handoff-pending, completed, failed, canceled, and blocked/fail-closed states.
- Required specialist run completion, verified handoff recorded/readback proof, orchestration completion, and a later causally linked task status completion before projecting completed.
- Failed closed for duplicate active attempts for the same task/run type/retry generation.
- Added explicit regression coverage for prepared-only handoff without recorded readback, preserving ledger `readAll()` input order when no global sequence is present, and fail-closed terminal task status when its `runId` diverges from the completed orchestration attempt.

Reviewer-driven RED/GREEN repair:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result before repair: expected RED.

```text
Test Files  1 failed | 1 passed (2)
Tests  3 failed | 17 passed (20)
prepared-only handoff projected claimed instead of handoff-pending
no-global-sequence readAll order projected blocked instead of completed
terminal task status with different runId projected completed instead of blocked
```

Result after repair:

```text
Test Files  2 passed (2)
Tests  20 passed (20)
```

## Task 2 Review Gate Repair

Fresh reviewer `019f547d-7e52-78b1-bff2-fad97e3335db` reported four projection defects:

- Completion validation did not enforce `final-output -> handoff prepared -> handoff recorded/readback -> run completed -> orchestration completed` ordering.
- Failure projection allowed duplicate terminal truth by accepting task failed status without a preceding causally linked orchestration failure, and by surfacing orchestration failure as task failure before task terminal status.
- Release projection allowed unrelated later releases to drop the latest active lease, and accepted approval suspension without verifying the release checkpoint matched the durable approval checkpoint.
- Embedded `buildAgentProjection()` orchestrator replay used wall-clock `Date.now()` instead of caller-supplied deterministic reconstruction time.

Review repair RED command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result before repair: expected RED.

```text
Test Files  2 failed (2)
Tests  4 failed | 20 passed (24)
run terminal before handoff readback projected completed
task failed status without orchestration failed projected failed
unrelated release dropped the latest active lease
buildAgentProjection ignored deterministic now and projected stale-claim-recoverable
```

Review repair GREEN command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result after repair:

```text
Test Files  2 passed (2)
Tests  24 passed (24)
```

Review repair implemented:

- Completion validity now requires strict event ordering and matching handoff readback id/hash values.
- Task failure now requires preceding `agent.task.orchestration.failed` and later causally linked `agent.task.status.changed` failed status.
- Orchestration failure without task terminal status now projects blocked with `terminal-task-status-missing`.
- Claim release only affects the claim it names, and approval suspension requires the release checkpoint to match the durable approval-wait checkpoint.
- `buildAgentProjection()` accepts `now` and passes it into the task orchestrator projection.

Focused re-review found one remaining exact-reference issue: completion validation used the latest same-run handoff proof instead of the exact handoff event ID named by `agent.task.orchestration.completed`, so a later same-run handoff revision could retroactively block a completed task during replay.

Exact-reference repair RED command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result before repair: expected RED.

```text
Test Files  1 failed | 1 passed (2)
Tests  1 failed | 24 passed (25)
later same-run handoff revision changed completed task projection to blocked
```

Exact-reference repair GREEN command:

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
```

Result after repair:

```text
Test Files  2 passed (2)
Tests  25 passed (25)
```

Exact-reference repair implemented:

- Completion validity resolves `finalOutputStepEventId`, `handoffPreparedEventId`, `handoffRecordedEventId`, and `specialistRunCompletedEventId` directly from the ledger event ID map and order map.
- Completed attempts expose the exact proof IDs and handoff readback from the orchestration completion event, not a later same-run revision.
- Latest same-run proof maps remain available only for non-terminal partial progress and handoff-pending reconstruction.

Additional verification:

```bash
npm run typecheck
```

Result:

```text
typecheck passed
```

```bash
git diff --check
```

Result: no output.

Full verification command:

```bash
npm run verify
```

Result: blocked by managed-sandbox verifier failures after `typecheck passed`.

Observed failure summary:

```text
Test Files  3 failed | 178 passed | 3 skipped (184)
Tests  19 failed | 2113 passed | 3 skipped (2135)
packages/local-runtime/test/server.test.ts: listen EPERM on 127.0.0.1 and 0.0.0.0
packages/workspace-ops/test/cli.test.ts: tsx IPC listen EPERM on /tmp/tsx-1000/*.pipe
packages/local-runtime/test/workspace-readiness-smoke.test.ts: JSON parse failure after the executable wrapper produced no stdout
```

Factory readiness command:

```bash
npm run factory:check
```

Result: blocked by managed-sandbox Git spawning restrictions.

Observed failure summary:

```text
Error: spawnSync git EPERM
scripts/check-agent-readiness.mjs trackedTextFiles -> git ls-files
```

Concern: full `npm run verify` needs an unrestricted coordinator rerun because this linked-worktree sandbox blocks local listen sockets and tsx IPC pipes. Targeted Task 2 tests, TypeScript typecheck, and whitespace verification pass in this sandbox.

## Stop Conditions

Stop on any design pressure to treat output hashes as handoff proof, project task completion without verified handoff readback and terminal task status, merge queued-task orchestration with approved-tool scheduling, or rely on hidden mutable runtime state.
