# Task 120 Claim: Resident Plan/Observation Contracts

- Task and gate: Task 120 / Wave 1 Lane L plan-observation contracts and projection.
- Worker: `/root/wave1_task120`.
- Branch and worktree: `codex/task-120-resident-full-vision-plan-observation` / `/home/drake/.codex/worktrees/task-120-resident-full-vision-plan-observation`.
- Frozen base: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` (`docs: complete CF-1 integration gate`).
- Claimed at: `2026-07-13T18:21:44Z`.
- Status: `blocked`.

## Scope And Authority

This claim owns only this file plus:

- `packages/agent/src/plan-observation-contracts.ts`
- `packages/agent/src/plan-observation-projection.ts`
- `packages/agent/test/plan-observation-contracts.test.ts`
- `packages/agent/test/plan-observation-projection.test.ts`

It is authorized for SDD, test-first RED/GREEN, a fresh independent review,
and `npm run verify`. It cannot self-integrate or merge into `neo`.

## Blocking CF-1 Contract Evidence

Before creating a RED test or a production file, the worker verified the
frozen base's exact shared ledger contract:

```bash
rg -n 'resident-plan|resident-observation|resident-tool-step|resident-loop' packages/ontology/src packages/agent/src packages/agent/test
```

The command returned no matches. `packages/ontology/src/contracts.ts` lists
the complete agent event parser map; it has no
`agent.resident-plan.recorded.v1`, `agent.resident-observation.recorded.v1`,
`agent.resident-tool-step.recorded.v1`, or `agent.resident-loop.result.recorded.v1`
entry. Consequently, `EventLedger.append` cannot append the exact frozen Task
120 event names: its `AppendableKnowledgeEvent` type and runtime
`validateKnowledgeEvent` both accept only that shared parser map.

The Task 120 plan requires `createResidentPlanObservationStore` to append and
read back those exact ledger events, while the CF-1 ownership matrix reserves
`packages/ontology/src/contracts.ts` for the designated shared-schema writer
and Task 120 expressly forbids shared-schema edits. No fixture or canonical
event parser exists at the frozen SHA for the tests to consume.

Implementing a local event union, an in-memory side store, a generic existing
event substitution, or an unvalidated cast would create a shadow schema and
would violate the exact-event, append-only, provenance, and projection-rebuild
requirements. The worker therefore made no production or test-file edit and
did not run the Task 120 RED command: its stipulated missing-import failure
would not resolve the preceding unavailable canonical parser/schema conflict.

## Coordinator Recovery Required

The coordinator must first issue a CF-1 correction that supplies the exact
canonical event parser/fixture surface (or explicitly revises Task 120's
allowed shared-schema ownership), integrate it, record the new frozen SHA, and
authorize a fresh Task 120 rebase. This claim preserves the blocked evidence;
it does not release, repair, or redefine the shared contract.

## Coordinator Restart Authorization

- The blocked claim above is preserved only as claim evidence from
  `bb2c205975601e4aaffc0ea14466ef6ece28c48c`; no blocked-branch production is
  reused. This fresh restart branch
  `codex/task-120-resident-full-vision-plan-observation-restart` starts from
  clean Relay B post-record head `494de844ec7c0f37d173ca4e6ad10b2d5bfcf352`,
  which contains reviewed W1-119 at merge `804c04b4855083127f8ee27b1186442c9f684161`
  and its coordinator verification record.
- The W1-119 canonical schemas/parsers and replay fixture now satisfy the
  former shared-contract prerequisite. This worker alone owns only
  `packages/agent/src/plan-observation-contracts.ts`,
  `packages/agent/src/plan-observation-projection.ts`,
  `packages/agent/test/plan-observation-contracts.test.ts`,
  `packages/agent/test/plan-observation-projection.test.ts`, and this claim.
  It must consume—not modify or shadow—the five frozen ontology events and
  their validated append/readback surface.
- Authorization: `superpowers:subagent-driven-development`, TDD RED/GREEN,
  exact focused command
  `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts`,
  `git diff --check`, factory readiness, one captured full verification, and a
  fresh independent review before coordinator integration. Preserve exact
  task/attempt/run plus source/context/authority bindings, append-only
  readback/rebuildability, and no provider/tool/PRR/graph/external effect.
  No self-review, self-integration, W1-118/Task136 dispatch, or `neo` merge is
  authorized. The reviewed merged Task120 SHA remains the hard prerequisite
  for W1-118 and Task136.

Status: `in-progress` only in this fresh isolated restart; the earlier blocked
claim remains durable evidence and is not production authorization.
