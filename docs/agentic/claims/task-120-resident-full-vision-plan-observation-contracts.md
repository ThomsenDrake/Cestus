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

## Coordinator Bounded Readback/Revision Repair

- Independent review rejected `d03729d1e5d3bd145f2c80fa258d570484464d81`:
  its readback helpers checked only event ID/type/shared identity, so a
  transforming ledger could alter plan revision/descriptor hash or observation
  ordinal/category/hash and still return success; and it accepted observations
  bound to a superseded plan revision.
- This repair branch is cleanly rooted at that preserved rejected candidate.
  The prior author is authorized only for these two fixes in the same five-file
  Task120 scope: compare complete durable payloads using `samePlan` and
  `sameObservation`, with a transforming-ledger negative; fail closed in store
  and replay projection when an observation references any plan superseded by a
  newer same-identity revision. Preserve valid current-plan readback,
  append-only order, exact provenance, rebuildability, no accepted graph
  mutation, and no provider/tool/PRR/external effect.
- Standing `superpowers:subagent-driven-development`, TDD and
  verification-before-completion authority applies. The author must run
  focused RED/GREEN, diff/factory, wait for the serialized full slot, record
  exact evidence and commit only scope. A distinct fresh reviewer must
  re-review; no self-review, self-integration, W1-118/Task136 dispatch, or
  `neo` merge is authorized.

Status: `in-progress` in this bounded repair; `d03729d1` remains rejected and
unintegrated.

## Restart RED Evidence

- The restart author re-read the W1-119 canonical resident-loop registrations,
  parser/readback fixture, CF-1 `CF1-L-PLAN`, `CF1-L-OBS`, `CF1-L-STEP`, and
  `CF1-L-POLICY` rows, the governing program spec/plan, and this preserved
  blocked claim before writing a new test.
- The first focused RED adds Task120-only contract and projection tests that
  require a canonical plan append/readback, an observation that is bound to
  that exact plan event, idempotent plan records, rejection of forged or
  cross-run plan provenance before append, and a ledger-rebuilt projection.
  The exact focused command follows immediately; no production source exists
  yet and no shared ontology contract, shadow store, provider, tool, PRR,
  graph, or external effect is authorized.
- Environment recovery: this isolated worktree initially had no ignored
  `node_modules/.bin/vitest`; `npm ci --ignore-scripts` restored only
  lockfile-pinned ignored dependencies and left every tracked dependency file
  unchanged.
- Focused RED (after environment recovery):
  `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts`
  exited `1` because both suites could not import the absent
  `../src/plan-observation-contracts.js`. This is the expected missing-Task120
  implementation failure, before any production source was written.

## Restart GREEN And Verification Evidence

- GREEN implementation adds only the two Task120 source files. The store
  derives the canonical W1-119 resident-loop stream; it appends only
  `agent.resident-plan.recorded.v1` and
  `agent.resident-observation.recorded.v1`, asks the ledger to validate those
  frozen contracts, and returns only exact durable stream readbacks. It rejects
  forged/cross-run/authority/source-mismatched plan provenance before an
  observation append and returns an exact plan idempotency readback without a
  duplicate event.
- The projection is pure and rebuilds only plan/observation facts from supplied
  ledger events. Its direct stale-order RED initially returned `ready` for an
  observation preceding its plan. The minimal repair processes the replay in
  durable order and admits an observation only after its exact already-read
  plan event; forged, stale-order, duplicate, or mismatched provenance blocks
  the whole projection. It never appends an event or mutates accepted graph
  state.
- Final focused GREEN:
  `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts`
  exited `0`: 2 test files and 6 tests passed. `git diff --check` exited `0`,
  `npm run typecheck` printed `typecheck passed`, and `npm run factory:check`
  printed `factory-readiness passed`.
- One retained non-overlapping `npm run verify` completed with exit `0`:
  typecheck passed; 192 test files passed and 3 skipped; 2,250 tests passed and
  5 skipped; Vite production build passed; and factory readiness passed. The
  observed SQLite experimental and existing Vite chunk-size warnings were
  non-failing. No other Task120 full verifier was running.

Status: `ready-for-fresh-independent-review`; this is author evidence only.
No self-review, self-integration, W1-118/Task136 dispatch, or `neo` merge is
authorized.

## Bounded Readback/Revision Repair Evidence

- Focused RED extended the Task120 suites with a transforming ledger and a
  two-revision replay. It exited `1` with the expected three failures: a
  transformed plan/observation readback resolved, an observation bound to
  revision 1 after durable revision 2 resolved, and the replay projection
  incorrectly returned `ready` for that superseded binding.
- GREEN makes `readBackPlan` compare the complete `samePlan` input and
  `readBackObservation` compare the complete `sameObservation` input, not only
  event ID/type/shared identity. The focused transform cases independently
  alter plan revision, descriptor hash, observation ordinal, category, and
  observation hash; each is rejected without a successful readback result.
- Before append, the store now rejects an exact referenced plan when a higher
  same-identity revision is already durable. The pure replay projection checks
  every accepted observation against the full plan replay and blocks with
  `observation-plan-superseded` when a later same-identity revision supersedes
  its bound plan. Valid current-revision readback, append ordering, provenance,
  rebuildability, no graph mutation, and no provider/tool/PRR/external effect
  remain unchanged.
- Final focused GREEN:
  `npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts`
  exited `0`: 2 files and 9 tests passed. `npm run typecheck` printed
  `typecheck passed`; `git diff --check` exited `0`; and `npm run factory:check`
  printed `factory-readiness passed`.
- One retained non-overlapping full `npm run verify` exited `0`: typecheck
  passed; 195 test files passed and 3 skipped; 2,253 tests passed and 5
  skipped; Vite production build passed; and factory readiness passed. SQLite
  experimental and Vite chunk-size warnings were non-failing.

Status: `ready-for-distinct-fresh-rereview`; this bounded repair does not
self-review, self-integrate, dispatch W1-118/Task136, or merge `neo`.
