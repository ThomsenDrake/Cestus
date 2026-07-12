# Resident Task Orchestrator Task 3 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 3, Claims, Ordering, Priority, Retry, Cancellation, And Stale Recovery
- Claimed at: 2026-07-12T04:21:54Z
- Worker: Codex Wave 5 resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Approved by review agent: `019f54a2-c84d-79b1-8d27-e1358773c2c6`
- Approved at: 2026-07-12T04:53:00Z

## Scope

Owned files for this task:

- `docs/agentic/claims/resident-task-orchestrator-task-3.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/task-orchestrator-events.ts`
- `packages/agent/test/task-orchestrator-claims.test.ts`

Do not edit the approved-tool scheduler state machine, provider dispatch, context assembly, approval adapters, runner dispatch, handoff adapters, or UI/cockpit files in this task.

## Dependency Boundary

Task 1 and Task 2 are approved and target-green but uncommitted because this sandbox cannot write linked-worktree Git metadata:

```text
git add docs/agentic/claims/resident-task-orchestrator-task-1.md
fatal: Unable to create '/home/drake/Projects/Cestus/.git/worktrees/Cestus6/index.lock': Read-only file system
```

Task 3 starts from:

- Repository HEAD: `1894fe6ad6aec2be0c9c19e54e75ae3dfd2ee7a3`
- Coordinator boundary: HEAD plus approved Task 1 scoped diff in `docs/agentic/claims/resident-task-orchestrator-task-1.md`
- Coordinator boundary: Task 1 boundary plus approved Task 2 scoped diff in `docs/agentic/claims/resident-task-orchestrator-task-2.md`

Task 2 focused verification:

```text
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
Test Files  2 passed (2)
Tests  25 passed (25)

npm run typecheck
typecheck passed

git diff --check
no output
```

Full `npm run verify` and `npm run factory:check` require the unrestricted coordinator environment because this managed sandbox blocks local listen sockets, tsx IPC pipes, Node-spawned Git, and linked-worktree index writes.

## Task 3 Requirements

Implement claim/retry/cancellation/budget orchestration only. Preserve:

- New task orchestrator owns queued-task claims above the approved-tool scheduler.
- Claim stream ID stays `agent_task_orchestration_${taskId}_${runType}`.
- Claim append uses `expectedNextSequence = latestSequence + 1`, then readback verifies this worker owns the latest active claim for the `{ taskId, runType, retryGeneration }` boundary.
- Stable attempt ID does not change across stale lease reclaims; `leaseClaimGeneration` increments only the worker lease.
- Explicit retry generation is durable policy input only; stale lease recovery never creates a new attempt.
- Deterministic task ordering is priority rank, queued/status sequence, then task ID.
- Cancellation races stop before dispatch and leave handoff-in-progress blocked until handoff recovery resolves.
- Budget ceilings block before provider dispatch. This task must not call providers, approval adapters, runners, handoff adapters, or approved-tool scheduler wake.

## Expected RED

The Task 3 tests should fail before implementation because `createTaskOrchestrator()` and claim state transitions do not exist.

## Task 3 RED Evidence

Command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result: expected RED.

Observed:

```text
Test Files  1 failed (1)
Tests  no tests
packages/agent/test/task-orchestrator-claims.test.ts: Cannot find module '../src/task-orchestrator.js'
```

## Task 3 GREEN Evidence

Implemented:

- Added `createTaskOrchestrator()` in `packages/agent/src/task-orchestrator.ts`.
- Added Task 3 tick summary contracts in `packages/agent/src/task-orchestrator-types.ts`.
- Preserved the Task 1 stream and attempt helpers from `packages/agent/src/task-orchestrator-events.ts`.
- Added claim behavior tests in `packages/agent/test/task-orchestrator-claims.test.ts`.
- Kept provider/context/prompt/approval/runner/handoff dependencies inert in Task 3; `tick()` does not call them.

Targeted command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests  15 passed (15)
```

Local integration review added three RED regressions after the worker handoff:

- Canceled tasks before claim must not stop the tick from claiming a later queued task.
- Failed terminal tasks must not be reclaimed without an explicit durable retry generation.
- Claim readback must reject a claim if any later same-stream event, such as a release, supersedes the committed claim before ownership is proven.

Integration repair RED command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result before repair: expected RED.

```text
Test Files  1 failed (1)
Tests  2 failed | 10 passed (12)
canceled task consumed the tick before the next queued task could be claimed
failed terminal task without explicit retry was claimed
```

Additional exact-readback RED command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result before repair: expected RED.

```text
Test Files  1 failed (1)
Tests  1 failed | 12 passed (13)
superseding release before claim readback was still treated as an owned claim
```

Integration repair GREEN command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result after repair:

```text
Test Files  1 passed (1)
Tests  13 passed (13)
```

Integration repair implemented:

- Cancellation skips are recorded but do not stop the tick unless there is an active claim to release.
- Failed and blocked terminal task statuses are non-claimable unless an explicit retry generation is present and backed by a retryable previous orchestration failure.
- Claim readback now requires the committed claim to be the exact last event in the orchestration stream, failing closed on any later release, checkpoint, terminal, or competing claim before ownership is proven.

Fresh Task 3 review found two durability defects:

- Stale lease recovery could reclaim an expired claim even after a later suspended or terminal state superseded the claim.
- Explicit retry generation was transient policy data only; retry claims did not require or bind a durable retry policy event ID.

Review repair RED command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result before repair: expected RED.

```text
Test Files  1 failed (1)
Tests  2 failed | 13 passed (15)
stale handoff-pending checkpoint was released as stale-recovered and reclaimed
explicit retry without a durable retry policy event ID was claimed
```

Review repair GREEN command:

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
```

Result after repair:

```text
Test Files  1 passed (1)
Tests  15 passed (15)
```

Review repair implemented:

- Stale recovery now skips claims superseded by later `approval-wait`, `handoff-pending`, or `runner-dispatching` checkpoints, and by later `waiting-for-approval`, `failed`, or `completed` task status.
- `TaskOrchestratorExplicitRetryGeneration` now requires `retryPolicyEventId`.
- Explicit retry candidates require that durable retry policy event ID to exist in the replayed ledger.
- Retry claims use `retryPolicyEventId` as both event causation and payload `causationEventId`, instead of falling back to task status/created causation.

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
Test Files  3 failed | 179 passed | 3 skipped (185)
Tests  19 failed | 2128 passed | 3 skipped (2150)
packages/local-runtime/test/server.test.ts: listen EPERM on 127.0.0.1 and 0.0.0.0
packages/workspace-ops/test/cli.test.ts: tsx IPC listen EPERM on /tmp/tsx-1000/*.pipe
packages/local-runtime/test/workspace-readiness-smoke.test.ts: JSON parse failure after executable stdout was empty
```

Concern: full `npm run verify` needs an unrestricted coordinator rerun because this linked-worktree sandbox blocks local listen sockets and tsx IPC pipes. The Task 3 targeted test, TypeScript typecheck, and whitespace verification pass in this sandbox.

## Stop Conditions

Stop on any pressure to merge queued-task orchestration with approved-tool execution claims, self-approve, call provider dispatch before Task 5, synthesize handoffs, retry without a durable retry generation input, or mutate old source/domain truth outside append-only domain services.
