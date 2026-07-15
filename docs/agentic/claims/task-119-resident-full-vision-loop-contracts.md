# Task 119 Claim: Resident Loop Event Contracts

- Task and gate: Task 119 / Wave 1 / CF-1 W1-119 prerequisite.
- Worker: `/root/wave1_task122`.
- Branch and worktree: `codex/task-119-resident-full-vision-loop-contracts` /
  `/home/drake/.codex/worktrees/task-119-resident-full-vision-loop-contracts`.
- Frozen coordinator base: `03bdfe26b7338b676d175926249d4d9f4a1954b1`.
- Claimed at: `2026-07-13T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This claim authorizes only:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-resident-loop-contracts.test.ts`
- this append-only claim

The slice is L's sole serialized registrar for exactly these canonical event
contracts: `agent.resident-plan.recorded.v1`,
`agent.resident-observation.recorded.v1`,
`agent.resident-tool-step.recorded.v1`, `agent.resident-loop.suspended.v1`,
and `agent.resident-loop.result.recorded.v1`. It must enforce strict canonical
plain-own-data payload parsing and a replayable fixture for all five events,
with negatives for unknown fields; missing identity, policy, authority, source,
context, budget, causation, or correlation; forged plan-readback linkage;
cross-run identity; unsafe own-data shapes; and terminal-looking results without
required readback.

No store, projection, runtime, provider, tool, domain, UI, graph, scheduler,
or external effect is authorized. This worker must make no self-review,
self-integration, Task120 restart, W1-118/Task136 work, or `neo` merge.

## Required Verification

Write and run a focused RED before production changes, then run:

```bash
npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts
```

Before the one scoped forward candidate commit, run `git diff --check`,
`npm run factory:check`, and `npm run verify`. Stop for a distinct fresh review
after the commit.

## Recovery Record

- Recovery authorized at the preserved claim checkpoint
  `464dd184bdac498618b37ec851ae9920b4620e19`.
- The prior W1-119 author was interrupted after two bounded intervals with only
  this scope-correct claim committed. No production or test edits, RED/GREEN
  checkpoint, or verifier was run.
- Replacement author `/root/wave1_task121_recovery` starts from this clean
  checkpoint and retains the original frozen scope and verification contract.

## Direct Coordinator Recovery Execution

- After the replacement also missed the required focused RED checkpoint, the
  coordinator interrupted it without discarding this append-only claim and
  completed the already-frozen narrow contract lane only in this dedicated
  Task119 worktree. Fresh independent review remains mandatory; this recovery
  does not self-review, self-integrate, restart Task120, or authorize `neo`.
- Environment recovery: this isolated worktree initially lacked ignored Node
  dependencies (`vitest: command not found`). `npm ci --ignore-scripts` restored
  lockfile-pinned ignored dependencies without tracked package or lockfile
  changes.
- RED: the exact focused command initially failed because the five W1-119
  resident-loop event registrations were absent. The subsequent GREEN loop
  exposed and closed a forged plan-readback gap by requiring the canonical
  task-attempt-run plan event ID. Final focused GREEN: 2 test files and 71
  tests passed, including the replayable five-event fixture, unknown/missing
  bindings, forged readback, cross-run, unsafe own-data, and terminal-readback
  counterfactuals.

## Forward Repair And Review Status

- Forward correction to the prior recovery note: a ledger assigns event IDs at
  append time, so a plan/result payload cannot truthfully self-reference its
  future assigned ID. The replay contract now binds prior plan/final-observation
  readbacks through a pure ordered-sequence parser after ledger readback rather
  than requiring an impossible deterministic self-ID.
- RED/GREEN repair: the fresh reviewer proved that five same-stream
  `sequence: 1` fixtures were not replayable. A new actual `InMemoryEventLedger`
  fixture appends exactly plan, observation, step, suspension, and result at
  sequences 1 through 5; the pure parser rejects a forged plan readback. The
  focused GREEN command now reports 2 files and 72 tests passing, with
  `git diff --check` and `npm run factory:check` also passing.
- Status: ready-for-review pending the single retained full verifier below.
  This is a forward-only status supersession of the initial in-progress claim;
  no coordinator or author self-review, self-integration, Task120 restart,
  W1-118/Task136 work, or `neo` action is authorized.

## Retained Full Verification And Candidate Repair

- The single retained replacement `npm run verify` completed with exit 0 after
  the ordered-ledger repair: typecheck passed; 190 test files passed (3
  skipped); 2,240 tests passed (5 skipped); Vite production build passed; and
  factory-readiness passed. No overlapping full verifier ran.
- This forward repair replaces the non-replayable same-sequence fixture with a
  real five-append ledger replay at sequences 1 through 5, moves prior-event
  linkage into the pure replay-sequence parser, and keeps the lane limited to
  the two authorized ontology files plus this claim. It is now ready for a
  distinct fresh review; the prior rejecting reviewer may not review this
  repair, and no integration is authorized from this task worktree.

## Second Fresh-Review Repair

- The first fresh review rejected `9f40e31b0b23cc4f1efcfbf8e7181bcf8246ba74`:
  arrays with a hidden non-enumerable own property passed the plain-own-data
  guard, and the plan contract guidance still requested an impossible
  self-assigned plan event ID. This forward repair preserves that rejected
  candidate and closes both findings.
- RED: a valid plan payload with `sourceEventIds` carrying an own hidden field
  initially parsed successfully. GREEN rejects that field and additionally
  proves rejection of symbol-bearing arrays, enumerable accessor extra keys,
  and custom array prototypes. Array validation now examines all own names
  (while allowing only the standard `length` and enumerable value indices),
  without evaluating an accessor. Plan guidance now directs later records to
  read back the ID assigned after the plan append rather than inventing a
  self-ID.
- The focused command passed (2 files / 72 tests), as did `git diff --check`
  and `npm run factory:check`. The single retained full `npm run verify` then
  exited 0: typecheck passed; 190 test files passed (3 skipped); 2,240 tests
  passed (5 skipped); Vite production build passed; and factory-readiness
  passed. A reviewer distinct from both prior Task119 reviewers and this
  coordinator repair author is required before any integration.

## Coordinator Root-Cause Recovery Authorization

- Two focused Task119 repairs are preserved and rejected: `9f40e31b` fixed
  replayability and `0f2dcda7` tightened array own-data checks and plan
  guidance. A second fresh review then found a P1 boundary defect: the base
  Zod record reads an enumerable throwing top-level payload accessor before
  the own-data guard runs, so validation throws instead of returning a
  structured invalid result.
- The exact uncommitted 13-line accessor experiment is preserved forward-only
  as checkpoint `7ae16b81278ee5f9cf3052f622df8ae7333bcce9`; it is evidence, not
  an accepted third repair. This fresh recovery branch
  `codex/task-119-resident-full-vision-contracts-recovery` starts from that
  checkpoint, whose ancestry retains `0f2dcda7`; no prior Task119 branch was
  reset, rewritten, or discarded.
- A fresh author owns a changed boundary-normalization strategy in this
  recovery worktree only. Before any property read or Zod parsing, normalize
  or reject the untrusted event and payload into one plain own-data snapshot,
  then parse only that snapshot without rereading caller objects. RED/GREEN
  must prove a throwing top-level payload accessor does not run and produces a
  structured invalid result; reject accessors, symbols, sparse arrays, hidden
  own keys, custom prototypes, boxed values, and nested variants without
  invoking getters. Preserve the five frozen schemas, ordered 1..5 ledger
  replay, and pure prior-event linkage parser; introduce no runtime, provider,
  store, projection, tool, domain, or external effect.
- The author has standing `superpowers:subagent-driven-development`, TDD, and
  verification-before-completion authority. It may edit only
  `packages/ontology/src/contracts.ts`,
  `packages/ontology/test/agent-resident-loop-contracts.test.ts`, and this
  append-only claim; it must run the focused RED/GREEN command, diff/factory,
  one captured full verification, commit, and stop. A fresh reviewer who has
  held no Task119 author or reviewer role must review before integration. No
  self-review, self-integration, Task120 restart, W1-118/Task136 work, or
  `neo` merge is authorized.

Status: in-progress only in this isolated root-cause recovery lane; prior
Task119 candidates remain preserved, rejected, and unintegrated.

## Root-Cause RED/GREEN Evidence

- Isolated environment setup: `npm ci --ignore-scripts` restored only
  lockfile-pinned ignored dependencies after the initial focused command found
  `vitest: command not found`; it did not modify tracked dependency files.
- RED: `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts` exited 1 with 1 failed and
  71 passed tests. A reflective `ownKeys` trap on an otherwise valid payload
  escaped `validateKnowledgeEvent` as `payload reflection must not escape
  validation`, proving that the old boolean ownership guard was not a safe
  boundary normalization.
- GREEN: `validateKnowledgeEvent` now descriptor-copies and deeply freezes one
  plain-own-data snapshot before Zod parsing. It rejects reflection failures,
  accessors (including the top-level `payload` accessor with zero getter
  invocations), symbols, sparse arrays, hidden keys, custom prototypes, boxed
  values, and nested unsafe variants without rereading caller-owned objects.
  The focused command then passed 2 files / 73 tests; `git diff --check` and
  `npm run factory:check` passed. The one full verification gate is pending
  the coordinator's global verifier-slot confirmation.

## Root-Cause Full Gate And Review Handoff

- Retained full verification: the coordinator-cleared single `npm run verify`
  exited 0 with typecheck passed; 190 test files passed (3 skipped); 2,241
  tests passed (5 skipped); Vite production build passed; and
  factory-readiness passed. No overlapping full verifier ran.
- Status: ready-for-review. This root-cause candidate is limited to the three
  authorized files and requires a reviewer with no prior Task119 author or
  reviewer role before any coordinator integration.

## Coordinator Bounded Public-Boundary Repair

- Independent review rejected `28b09362eaa219dedd9abcefd6a001ad973534fc`:
  the `validateKnowledgeEvent` wrapper normalizes safely, but exported public
  `knowledgeEventSchema.safeParse` still exposes the raw Zod object and reads
  a throwing `payload` getter. That violates the same strict public-boundary
  contract and must not be treated as an acceptable wrapper-only fix.
- This is the first bounded repair within the changed-tactic root lane. The
  root-lane author may repair only the existing three paths. Make the exported
  schema itself normalize/reject before any raw event/payload property read or
  internal Zod traversal (for example by keeping an internal raw parser
  private and exporting only the normalized boundary). Parsing must consume
  the one normalized snapshot and never reread caller-owned objects.
- Add direct `knowledgeEventSchema.safeParse` RED/GREEN counterfactuals for a
  top-level payload getter, a nested getter, and a reflective `ownKeys` trap;
  each must return structured invalid without a getter/trap escape. Preserve
  all existing snapshot, five-schema, ordered ledger replay, prior-event
  linkage, and no-effect guarantees. Run focused/diff/factory and one retained
  full verification, commit scoped work, then stop for a fresh reviewer who
  has held no prior Task119 author or reviewer role. Standing SDD, TDD, and
  verification-before-completion authority applies; self-integration and
  `neo` remain forbidden.

Status: in-progress in this bounded public-boundary repair; `28b09362` remains
rejected and unintegrated.

## Public-Boundary RED/GREEN Evidence

- RED: the exact focused command exited 1 with 1 failed and 73 passed tests.
  Direct `knowledgeEventSchema.safeParse` invoked the enumerable top-level
  `payload` getter and threw `exported schema payload accessor must not run`.
  This proved that the wrapper-only normalization did not secure the exported
  public parser.
- GREEN: the raw Zod event parser is now private. Exported
  `knowledgeEventSchema` normalizes through its preprocess boundary, and
  `validateKnowledgeEvent` delegates to that same public boundary. Direct
  schema tests prove zero calls for top-level and nested getters plus a
  structured-invalid result for a reflective `ownKeys` trap. The focused
  command passed 2 files / 74 tests; `git diff --check` and
  `npm run factory:check` passed. Full verification remains pending the
  coordinator-controlled verifier slot.

## Public-Boundary Full Gate And Review Handoff

- Retained full verification: the coordinator-cleared single `npm run verify`
  exited 0 with typecheck passed; 190 test files passed (3 skipped); 2,242
  tests passed (5 skipped); Vite production build passed; and
  factory-readiness passed. No overlapping full verifier ran.
- Status: ready-for-review. This bounded public-boundary repair remains
  limited to the authorized claim, contract, and focused test. A reviewer
  distinct from this author and the reviewer that rejected `28b09362` must
  review before any integration.

## CF-1R2 Versioned Contract-Reconciliation Authorization

- Forward correction: the current strict v1 family and its preserved accepted
  history are not the complete Task120/136 contract surface. Their historical
  parser behavior remains immutable; no worker may silently widen a v1 payload
  or relabel a v1 event. CF-1R2 authorizes exactly one fresh Terra/xhigh
  author, distinct from all prior Task119 authors and reviewers, to add the
  separate strict v2 five-event family recorded in the CF-1R2 coordinator
  correction.
- This is a changed-tactic recovery, not a third retry of the prior
  public-boundary repair. The author owns only `packages/ontology/src/contracts.ts`,
  `packages/ontology/test/agent-resident-loop-contracts.test.ts`, and this
  append-only claim. It must first add a RED that proves v1 remains accepted
  unchanged while each v2 parser rejects a missing or changed required
  binding, then implement the smallest versioned strict parser/fixture change.
  It must not add Task120's store/projection or any H/W/P/gateway/factory/UI/
  provider/credential contract.
- Required v2 coverage is the complete CF-1R2 identity, descriptor, policy,
  ten-budget, source/context, mounted-authority, causation/correlation,
  plan-readback, allowlist/effect/approval/artifact, suspension/resume-anchor,
  and H lifecycle/provenance surface. The replay fixture must exercise exactly
  one valid five-event v2 stream and negative mutations without relaxing v1.
- Before one forward candidate commit, run exactly `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`. This is one fail-fast `&&` chain and must exit `0`. Stop for fresh independent Terra/xhigh review. Full verification remains **CLOSED**; no self-review, self-integration, merge, provider/network/credential/Nous, Task120 restart, Task136 work, or `neo` action is authorized.

Status: in-progress only for this CF-1R2 recovery authorization. Earlier
Task119 candidate/review records remain preserved historical evidence; they do
not authorize a v1 rewrite or an integration without the new review and
coordinator-only merge.

## CF-1R2 Author RED/GREEN Evidence

- Fresh author: `/root/task119_cf1r2_contracts` on
  `codex/task-119-resident-full-vision-cf1r2`, starting from clean coordinator
  authorization `fae25d1da52a1d6daa337a41d16cc712c77cf462`. Authoritative
  session `turn_context` records `model=gpt-5.6-terra` and `effort=xhigh`.
- Environment-only checkpoint: the isolated worktree initially had no ignored
  `vitest` binary. A temporary symlink to the canonical worktree's existing
  ignored `node_modules` directory enabled local verification; it changes no
  tracked dependency or lockfile and will be removed before handoff.
- RED: `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts`
  then ran with the v2 test fixture in place. The historical v1 coverage passed
  (30 tests), while the required v2 registration assertion failed because all
  five `agent.resident-*.v2` event contracts were absent. This causally proves
  v1 remained accepted while the missing versioned parser family caused the
  failure.
- GREEN: the same focused suite passed **31 tests** after adding only the strict
  v2 parser/contract/replay family. The v2 fixture covers one ordered five-event
  stream; negative mutations reject missing or changed workspace/descriptor/
  policy/authority/ten-budget/plan-readback/allowlist/preview/gateway/
  checkpoint/H-proof/resume-anchor bindings, plus unknown and accessor-backed
  own-data. No Task120 store/projection or H/W/P/gateway/factory/UI/provider/
  credential source changed.
- Companion focused evidence: `npm test --
  packages/ontology/test/agent-resident-loop-contracts.test.ts
  packages/ontology/test/agent-contracts.test.ts && npm run typecheck` exited
  `0` with **2 files / 91 tests** passing. The required single pre-commit
  fail-fast chain then exited `0` exactly as authorized:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It passed the same **2 files / 91 tests**, TypeScript, diff check, and factory
  readiness. Full verification remains **CLOSED**.

Status: ready-for-review only after the recorded exact CF-1R2 fail-fast gate
exits `0` and the scoped forward candidate commits. No self-review,
self-integration, merge, Task120 restart, Task136 work, provider/network/
credential/Nous action, or `neo` action is authorized.
