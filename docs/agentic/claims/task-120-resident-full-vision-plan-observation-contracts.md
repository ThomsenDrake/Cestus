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
