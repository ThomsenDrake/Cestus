# Resident Task Orchestrator Task 9 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 9, Live Nous Sentinel Acceptance
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Prerequisite Checkpoint

Tasks 1-8 are review-approved as scoped uncommitted diffs in this managed
linked worktree because Git metadata is read-only. Task 8 completed after P1
review repair for durable `context-ready` proof before dispatch and recoverable
`runner-dispatching` checkpoints.

Latest Task 8 gates:

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
npm test -- packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
npm run typecheck
git diff --check
```

`npm run verify` and `npm run factory:check` remain blocked only by the known
managed-sandbox EPERM restrictions for local socket/IPC/git child process
operations.

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-9.md`
- `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`

Wave 3 `packages/agent/test/evidence-triage-nous-live.test.ts` is read-only for
this task.

## RED Evidence

Initial live RED in this managed child sandbox stopped at provider availability:

```bash
set -a
. /home/drake/Projects/Cestus/.env
set +a
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

The child sandbox cannot reach the real Nous provider. Coordinator-owned
unrestricted evidence later proved the Wave 3 Nous provider gate is healthy and
the new Task 9 live test reaches real Nous, then fails in the Task 9 fixture's
durable handoff path with:

```text
Referenced handoff artifact is missing from the content-addressed store.
```

Local TDD regression for that exact fixture root cause:

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

Observed RED:

```text
Test Files  1 failed (1)
Tests  1 failed | 2 skipped (3)
AssertionError: promise rejected "Error: Task 9 live manifest artifact is u..." instead of resolving
Caused by: Error: Task 9 live manifest artifact is unavailable: sha256:f59c8c4fd7454775bce48ca63fe420c7330888e78b46022220052995c9b3a005
```

## Repair Evidence

The Task 9 live fixture now defines the exact evidence source bytes used to
derive `evidenceHash` and seeds those same bytes into the
`MemoryManifestStore` before dispatch/handoff. It does not remove
`artifactHashes`, weaken the durable handoff kernel, or special-case live tests.

Deterministic gates run in this child sandbox:

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
npm run typecheck
git diff --check
```

Observed GREEN:

```text
packages/agent/test/task-orchestrator-evidence-triage-live.test.ts:
Test Files  1 passed (1)
Tests  1 passed | 2 skipped (3)

packages/agent/test/task-orchestrator-approval.test.ts:
Test Files  1 passed (1)
Tests  21 passed (21)

Combined deterministic covering suites:
Test Files  5 passed (5)
Tests  74 passed | 2 skipped (76)

npm run typecheck:
typecheck passed

git diff --check:
passed with no output
```

The existing `packages/agent/test/specialist-runner-kernel.test.ts` negative
case `rejects missing or hash-mismatched referenced artifacts before
final-output append` remains part of the combined deterministic suite and proves
missing/swapped referenced artifacts block before prepared, recorded, run
terminal, or task terminal events.

## Coordinator-Owned Live Gate

```bash
set -a
. /home/drake/Projects/Cestus/.env
set +a
for attempt in 1 2 3; do
  CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts || exit 1
done
```

Initial live gate execution is coordinator-owned because the managed child
sandbox cannot reach the real Nous provider. The managed child sandbox must not
mark Task 9 complete based on offline or fake providers.

## Coordinator Gate Attempt 1 Repair

Coordinator live attempt 1 reached the real Nous invocation and durable handoff
path, then failed only in the final test helper with:

```text
Live acceptance leaked provider credential material.
```

Root cause was a test-only false positive: `assertNoLiveLeakage()` rejected the
public credential-kind vocabulary `api-key-bearer` in DTOs such as provider
readiness and invocation metadata. The helper still rejects the exact configured
API key value and concrete authorization/Bearer value material, but no longer
bans schema/enum terms needed for safe provider metadata.

Local TDD RED:

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

Observed RED:

```text
Test Files  1 failed (1)
Tests  1 failed | 1 passed | 2 skipped (4)
AssertionError: expected [Function] to not throw an error but 'Error: Live acceptance leaked provide...' was thrown
```

Local GREEN after predicate repair:

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
npm run typecheck
git diff --check
```

Observed GREEN:

```text
packages/agent/test/task-orchestrator-evidence-triage-live.test.ts:
Test Files  1 passed (1)
Tests  2 passed | 2 skipped (4)

Combined deterministic covering suites:
Test Files  5 passed (5)
Tests  75 passed | 2 skipped (77)

npm run typecheck:
typecheck passed

git diff --check:
passed with no output
```

Coordinator live attempt accounting restarts: prior attempt 1/3 failed at this
test-only false positive and does not count; attempts 2-3 were not run. The next
unrestricted live gate must run three consecutive GREEN attempts from 1/3.

## Final Live Acceptance Evidence

Coordinator-owned Task 9 live acceptance passed three consecutive times from
this exact worktree with `/home/drake/Projects/Cestus/.env` sourced by path:

```bash
set -a
. /home/drake/Projects/Cestus/.env
set +a
for attempt in 1 2 3; do
  CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts || exit 1
done
```

Safe coordinator results:

```text
Attempt 1/3: PASS, 1 file / 4 tests, duration 6.76s.
Attempt 2/3: PASS, 1 file / 4 tests, duration 6.41s.
Attempt 3/3: PASS, 1 file / 4 tests, duration 7.02s.
Loop exit code: 0.
No credential, prompt, context payload, or provider output values were printed.
```

Task 9 live acceptance counter is now 3/3 GREEN.

## Final Tasks 1-9 Finish Gate

All resident task orchestrator Tasks 1-9 claim statuses were updated to:

```text
complete-coordinator-commit-pending
```

Final cross-boundary targeted suite run in the managed child sandbox:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
```

Observed result:

```text
Test Files  18 passed (18)
Tests  303 passed | 2 skipped (305)
```

Full `npm run verify` in this managed child sandbox:

```text
typecheck passed
Test Files  3 failed | 186 passed | 3 skipped (192)
Tests  19 failed | 2208 passed | 5 skipped (2232)
```

Failures are managed-sandbox environment restrictions previously observed on
this lane:

- local runtime HTTP tests fail with `listen EPERM`;
- workspace-ops executable tests fail through `tsx` IPC pipe `listen EPERM`;
- workspace-readiness smoke stdout is empty after the blocked child runtime,
  causing JSON parse failure.

`npm run factory:check` in this managed child sandbox failed at:

```text
spawnSync git EPERM
```

Final review attempt:

- Fresh subagent reviewers `019f5680-7d10-7d93-ba9b-5f2ce4a587f8` and
  `019f5686-01d3-7152-ab8f-356cffa9e499` were started for whole-branch review,
  but both became stale and were closed according to the Cestus factory stale
  reviewer rule.
- Inline blocker review then checked the Tasks 1-9 diff against the approved
  design/plan invariants: resident identity separation, orchestrator/scheduler
  ownership separation, append-only terminal truth, deterministic claim stream,
  verified context readiness before dispatch, exact provider-byte-transfer
  approval, durable handoff ordering, forbidden autonomous effects, and
  non-fakeable live Nous acceptance.

Inline review verdict:

```text
No blocking findings. Ready for coordinator commit subject to unrestricted verify/factory rerun.
```
