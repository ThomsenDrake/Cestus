# Resident Task Orchestrator Task 6 Claim

## Status

complete

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 6, Runner Dispatch And Durable Handoff Sequencing
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-6.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/evidence-triage-workflow.ts`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/test/task-orchestrator-dispatch.test.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/task-orchestrator-approval.test.ts`

Tasks 1-5 are shared, uncommitted scoped diffs in this managed worktree and
remain untouched. Git metadata is read-only in this linked worktree, so this
task will not stage or commit.

## Prerequisites

The landed runner-kernel helpers provide a durable final-output artifact,
prepared/recorded handoff persistence, and projection readback. Task 6 connects
that protocol to runner dispatch and the orchestrator's terminal ordering.

## RED Evidence

```bash
npm test -- packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
```

Expected RED observed after correcting the claim fixture to the landed schema:
10 Task 6 dispatch/recovery tests failed because
`sequenceTaskOrchestratorHandoff` was absent. The first fixture run also caught
and corrected stale `orderingPosition` claim payload spelling to the canonical
`selectedOrderingPosition` plus `causationEventId`.

## GREEN Evidence

The focused Task 6 dispatch/evidence command now passes with 24 tests:

```bash
npm test -- packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
```

Result: 2 files passed, 24 tests passed.

The expanded Task 6 runner/evidence boundary also passes:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
```

Result: 3 files passed, 65 tests passed.

The Task 5 approval/Task 6 dispatch boundary passes:

```bash
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
```

Result: 4 files passed, 87 tests passed.

The dispatch guard requires both verified provider approval and verified
context bindings. The orchestrator now consumes a runner-returned durable
handoff payload and sequences final-output persistence, canonical handoff
prepared, recorded/readback, specialist run terminal, orchestration completion,
and task terminal status in order. Crash recovery reuses exact final-output,
handoff, run terminal, orchestration completion, and task status anchors without
synthesizing handoff proof from output hashes. The runner kernel no longer
appends task status; task terminal truth is owned by the orchestrator after
verified handoff readback.

Post-review repair binds runner dispatch to the exact approved run ID. The
dispatch input carries `approvedRunId`, returned durable handoffs must match it
before any handoff event is appended, and completion readback can validate the
same approved run boundary. Evidence-triage failure paths now publish failed
handoffs through the same final-output, prepared, recorded/readback, and
terminal failure sequence instead of appending `agent.specialist-run.failed`
directly.

Second review repair preserves cancellation as task-terminal truth across
handoff recovery. Completion now checks for cancellation before specialist run
terminal finalization and again before orchestration/task completion. The task
status conflict guard treats `canceled` as a terminal task-level conflict even
when the cancellation event is not run-scoped.

## Verification

```bash
npm run typecheck
```

Result: `typecheck passed`.

```bash
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
```

Result: 4 files passed, 87 tests passed.

```bash
npm run verify
```

Result: typecheck passed, then the managed sandbox blocked known local-runtime
socket/child-process tests. Latest count: 3 failed files, 182 passed, 3 skipped;
19 failed tests, 2181 passed, 3 skipped. Remaining failures are
`listen EPERM` for local-runtime server binds, `listen EPERM` for `tsx` IPC
pipes under `/tmp/tsx-1000/*.pipe`, and empty stdout from the blocked
workspace-readiness child process.

```bash
git diff --check
```

Result: no output.

## Self-review

The work does not weaken provider approval, self-approval rejection, or the
handoff kernel's exact artifact readback checks. Task completion is not
projected until canonical handoff readback is verified, specialist run terminal
is appended, orchestration completion is appended, and the task terminal status
causally references orchestration completion.

## Coordinator Closure

- Final status: complete.
- Coordinator commit: `fd83d7be020d180ce8ceeb48c2c8a1735a19184c` (`fd83d7be feat: add resident task orchestrator`).
- Commit packaging: coordinator preserved the exact reviewed Tasks 1-9 packet in one commit because the child sandbox could not safely reconstruct per-task Git history.
- Unrestricted coordinator `npm run factory:check`: PASS.
- Unrestricted coordinator `npm run verify`: PASS.
- Full verify counts: 189 passed / 3 skipped files; 2,227 passed / 5 skipped tests.
- Typecheck, production UI build, and factory readiness passed.
- Final vertical acceptance: Task 9 real Nous gate remains 3/3 consecutive GREEN.
