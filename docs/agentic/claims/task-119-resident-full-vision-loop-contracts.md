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

## CF-1R2 Fresh-Review Bounded V2 Repair Evidence

- Fresh recovery author: `/root/task119_cf1r2_review_repair` on
  `codex/task-119-resident-full-vision-cf1r2-review-repair`, starting from
  preserved rejected candidate `544d95c92ed3c3ebc8672d30137ac5718801846a`.
  The authoritative child `turn_context` records `model=gpt-5.6-terra` and
  `reasoning_effort=xhigh`; generic base prose was not used as model evidence.
- Environment-only recovery: the isolated worktree lacked ignored Node
  dependencies, so `npm ci --ignore-scripts` restored lockfile-pinned ignored
  dependencies without tracked package or lockfile changes. The standalone
  `npm run typecheck` and the authorized exact fail-fast chain at the rejected
  clean candidate each exited `0`; that does not supersede its accepted review
  defects. Full verification remains **CLOSED**.
- RED: the focused ontology contract test first failed with 17 causal failures:
  a genuine complete H readback was rejected in favor of the local
  `attemptId`/`safeDiagnostics` proxy; all ten conserved-but-over-limit budget
  ceilings parsed; invalid failed/resumable category pairs parsed; and
  self/future/missing plan prerequisites parsed. After the full H readback
  surface was restored, the same focused RED exposed the two replay failures
  for an undeclared tool ordinal and a declared ordinal with a swapped tool
  binding. These tests retain the accepted v1 fixture as valid.
- GREEN: v2 now carries the complete H-owned completed readback surface from
  the approved handoff contract—verified outcome, run/task/handoff identity,
  manifest schema/hash, final-output step/event, prepared/recorded/terminal/
  task-status events, exact authority binding, and diagnostics with category,
  retry, safe message, event IDs, and artifact hashes. It does not invent an
  L-owned `attemptId` or `safeDiagnostics` substitute. Counterfactuals reject
  each narrowed diagnostic field and the forged proxy, each hard maximum,
  invalid terminal/resumable category pairing, undeclared/swapped tool plan
  binding, and self/future/missing prerequisites. The v2 replay remains the
  same exact five event names; v1 behavior and strict own-data normalization
  remain unchanged.
- Pre-claim focused GREEN command:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`
  exited `0` with **2 files / 117 tests** passing, then TypeScript, diff check,
  and factory readiness passing. The same exact one-line `&&` command must be
  rerun after this append before the single scoped forward commit.

Status: in-progress only for this bounded repair until the post-append exact
fail-fast gate exits `0` and a fresh independent Terra/xhigh reviewer receives
the committed range. `544d95c9` remains preserved, unreviewed for integration,
and unintegrated history; no self-review, self-integration, merge, full
verification, provider/network/credential/Nous, Task120/136, or `neo` action
is authorized.

## CF-1R2 Fresh Replay-State Recovery Checkpoint

- Fresh recovery author: `/root/task119_replay_state_recovery_retry` on
  `codex/task-119-resident-full-vision-cf1r2-replay-state-recovery`, starting
  from preserved unintegrated candidate
  `5bf4c2895e6bd0121d58fd8b8f1ab4b18abbde9a`.
- Runtime evidence is authoritative session metadata, not generic base prose:
  `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T21-24-08-019f635f-c36a-7943-ac85-1b171200f05a.jsonl:8`
  records `turn_context` with `model=gpt-5.6-terra` and `effort=xhigh`.
- Recovered governing-spec path: the assigned
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-design.md`
  filename is absent in this checkout; the canonical present full-vision
  program design is
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md`.
- Root-cause investigation of the current v2 pure replay parser found three
  coupled omissions: it admits only a fixed plan/observation/tool/suspension/
  result quintet and requires all complete `budget` snapshots to be equal, so
  it cannot prove per-record consumption or initial-plus-three-replan durable
  progression; it checks a resumable anchor only for presence rather than the
  immediately preceding suspension checkpoint, deadline, and next action; and
  its result vocabulary lacks separately inspectable authority-stale,
  context-stale, allowlist-mismatch, provenance-missing, and secret-detected
  outcome semantics. The changed tactic is a pure replay-state transition
  validator over per-record immutable budget deltas, exact prior-plan and
  suspension bindings, and explicit category/outcome maps. It adds no store,
  projection, provider, tool, H/W/P/gateway, or effect behavior.
- Before production changes, this recovery will add and run causal REDs for a
  valid fourth plan record plus an over-limit revision, omitted observation/
  tool/result consumption, each swapped resume-anchor component, and every
  required category's valid and invalid outcome pair. Full verification is
  closed; the only final gate is the coordinator-specified fail-fast chain.

## CF-1R2 Fresh Replay-State RED/GREEN Evidence

- Environment-only recovery: the first focused RED invocation exited `127`
  before loading tests because this isolated worktree had no ignored `vitest`
  binary. `npm ci --ignore-scripts` then exited `0`, restoring only
  lockfile-pinned ignored dependencies; it did not change a tracked package or
  lockfile.
- Causal RED: `npm test --
  packages/ontology/test/agent-resident-loop-contracts.test.ts
  packages/ontology/test/agent-contracts.test.ts` exited `1` with **13 failed
  and 116 passed tests**. The valid five-event control failed on the absent
  `budget.actionConsumption` boundary; the new fourth-plan control failed on
  the fixed-quintet replay parser; and each resumable-anchor and category/
  outcome control failed because the prior parser accepted only anchor
  presence and omitted the required safe categories. Historical v1 tests
  remained green.
- GREEN: the same exact focused command exited `0` with **2 files / 129
  tests passing**. Each v2 record now has a strict, immutable action budget
  delta and the pure replay validator proves cumulative consumed/remaining
  transitions, fixed ceilings, required record-class consumption, contiguous
  revisions `0..3`, exact previous-plan readbacks, and a hard maximum of four
  plan records (initial plus three replans). The original five-event fixture
  remains valid, while the fourth-plan stream is valid and revision four is
  rejected.
- The pure replay validator binds a resumable result's checkpoint ID,
  deadline, and next safe action to the immediately preceding durable
  suspension checkpoint. The result contract now separately exposes
  `authority-stale` and `context-stale` only as resumable outcomes, plus
  `allowlist-mismatch`, `provenance-missing`, and `secret-detected` only as
  failed outcomes; each has a valid and an invalid pair counterfactual.
  This remains a no-effect contract/parser repair: no store, projection,
  runner, H/W/P/gateway, provider, credential, network, or Nous behavior was
  added or changed.

Status: in-progress pending the one authorized post-claim fail-fast gate,
scoped forward commit, and a distinct fresh Terra/xhigh review. Full
verification remains closed; no self-review, self-integration, merge, Task120
restart, Task136 work, provider/network/credential/Nous action, or `neo`
action is authorized.

## CF-1R2 Replay-State Fail-Fast Gate

- The sole authorized non-full gate exited `0` as one fail-fast command:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It reported **2 files / 129 tests passing**; typecheck, diff check, and
  factory readiness completed without a failing stage. Full verification was
  not run and remains closed.

Status: gate-passing and pending one scoped forward commit plus a distinct
fresh Terra/xhigh review. No self-review, self-integration, merge, Task120
restart, Task136 work, provider/network/credential/Nous action, or `neo`
action is authorized.

## CF-1R2 Replay-State Typecheck Recovery Evidence

- Runtime metadata: authoritative session metadata at
  `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T21-45-31-019f6373-58ab-74d3-993f-ff6841209d38.jsonl:8`
  records `gpt-5.6-terra` with `xhigh` reasoning effort.
- Required initial reproduction is the coordinator's standalone `npm run
  typecheck` on this exact `f4ed276d` worktree: exit `2`, with TS4104 at
  `packages/ontology/src/contracts.ts:936` and `:939`. No setup, provider,
  network, credential, or Nous action was performed for this correction.
- Root-cause hypothesis, confirmed against Zod's local `addIssue` declaration:
  `addResidentLoopV2OrderedUniqueIssues` correctly exposes its incoming path
  as readonly, but `z.RefinementCtx.addIssue` requires mutable
  `PropertyKey[]`. Copying the path at the two issue construction sites gives
  Zod an independently mutable array without widening the helper input or
  changing any path values, parser behavior, event names, H proof, replay
  budget/anchor/category repair, or runtime effect.
- The compiler diagnostic is the type-only RED; no behavior-preserving test
  change is necessary because the correction changes neither accepted input
  nor emitted issue content. The focused suite then passed **2 files / 129
  tests**.
- The sole authorized non-full fail-fast command exited `0`:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It reported **2 files / 129 tests passing**; typecheck, diff check, and
  factory readiness reached their successful completion stages. Full
  verification was not run and remains closed.

Status: gate-passing pending one scoped forward commit and a distinct fresh
Terra/xhigh review. No self-review, self-integration, merge, Task120 restart,
Task136 work, provider/network/credential/Nous action, or `neo` action is
authorized.

## RV-1-E-198 Semantic Repair RED/GREEN

- Fresh semantic-repair author: `/root/task119_semantic_repair` on
  `codex/task-119-resident-full-vision-cf1r2-semantic-repair`, starting from
  preserved unintegrated `00ded92b75b6030b3c58581babf5ac93aa6d6111`.
  Authoritative runtime evidence is
  `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T22-08-23-019f6388-47fc-7d73-8745-4cbee294f702.jsonl:8`,
  whose `turn_context` records `model=gpt-5.6-terra` and `effort=xhigh`.
- Root cause: v2 charged the initial plan to `planRevisions`, thereby treating
  the four-slot value as four replans instead of three revisions after initial
  planning; its replay accepted the inherited plan ID and had no observation
  readback binding on a replan; and prerequisite ordinals were parsed as static
  metadata without recording causally prior executed tool steps.
- Causal RED: `npm test --
  packages/ontology/test/agent-resident-loop-contracts.test.ts
  packages/ontology/test/agent-contracts.test.ts` exited `1` with **4 failed
  and 129 passed tests**. The four expected failures proved acceptance of a
  fourth replan budget slot, a reused predecessor plan ID, a replan after the
  preceding observation was removed while counters remained replayable, and a
  declared step whose prerequisite had not executed.
- GREEN: the same focused command exited `0` with **2 files / 133 tests
  passing**. The initial plan now consumes zero replan slots while each replan
  consumes exactly one against the three-replan ceiling; replans require a
  fresh plan ID plus an exact prior-plan and prior-observation readback; and
  replay admits a declared prerequisite only after its matching prior tool step
  reached `executed`. The repair preserves v1, the exact five v2 event names,
  strict own-data, complete H proof, prior budget/anchor/category behavior,
  append-only provenance, and no-effect scope.

Status: in-progress pending the one authorized post-claim fail-fast gate, one
scoped forward commit, and a fresh complete-range independent Terra/xhigh
review. Full verification remains closed; no self-review, self-integration,
merge, Task120 restart, Task136 work, provider/network/credential/Nous action,
or `neo` action is authorized.

## RV-1-E-198 Semantic Repair Fail-Fast Gate

- The sole authorized post-repair command exited `0` as one fail-fast chain:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It reported **2 files / 133 tests passing**; typecheck, diff check, and
  factory readiness completed without a failing stage. Full verification was
  not run and remains closed.

Status: ready for one fresh independent complete-range Terra/xhigh review after
the scoped forward commit. No self-review, self-integration, merge, Task120
restart, Task136 work, provider/network/credential/Nous action, or `neo` action
is authorized.

## RV-1-E-202 Complete-Range Plan-ID Repair

- Fresh repair author: `/root/task119_plan_id_repair` on
  `codex/task-119-resident-full-vision-plan-id-repair`, starting from preserved
  unintegrated `2b1c6f193024d5a4aa7f02d829df88e896d35a12`. Authoritative
  session metadata at
  `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T22-39-09-019f63a4-72da-7621-b228-dc53312fdd1f.jsonl:8`
  records `model=gpt-5.6-terra` and `effort=xhigh`.
- Fresh complete-range review finding: the v2 replay validator retained prior
  plan records but compared a replan ID only with the immediately preceding
  plan. It therefore accepted `plan_001 -> plan_002 -> plan_001` when all
  revisions, plan/observation readbacks, and durable budget transitions were
  otherwise valid.
- Causal RED: `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts`
  exited `1` with 1 failed and 133 passed tests. The new complete replay
  counterfactual was individually valid yet `validateResidentLoopEventSequence`
  returned `true` for the reused earlier ID.
- GREEN: replay now rejects a replan when its plan ID appears in any prior plan
  record, while preserving the existing initial-plus-three accounting,
  predecessor observation causation, executed-prerequisite, H proof, v1,
  exact v2 names, strict own-data, budget/anchor/category, provenance, and
  no-effect contracts. The focused v2 suite passed 74 tests. The authorized
  non-full fail-fast chain is the only remaining pre-commit gate; full
  verification remains **CLOSED**.

Status: in-progress pending the one authorized exact non-full fail-fast chain,
one scoped forward commit, and a new fresh complete-range independent
Terra/xhigh review. No self-review, self-integration, merge, Task120 restart,
Task136 work, provider/network/credential/Nous action, or `neo` action is
authorized.

## RV-1-E-207 Causal Observation Repair

- Fresh repair author: `/root/task119_observation_causality_repair` on
  `codex/task-119-resident-full-vision-observation-causality-repair`, starting
  exactly at preserved unintegrated
  `e1afd3fc3c68ae543a4d08dbfb8d690e9b0fa9ce`. Authoritative runtime evidence
  is `/home/drake/.codex/sessions/2026/07/14/rollout-2026-07-14T23-07-45-019f63be-a200-7002-bc53-4869c235435c.jsonl:8`:
  its `turn_context` records `model=gpt-5.6-terra` and `effort=xhigh`.
- Causal RED: the focused command exited `1` with 1 failed and 134 passed
  tests. The new parser-valid three-plan counterfactual removes plan_002's
  observation, reuses plan_001's observation event ID in plan_003's replan
  readback, spoofs the required plan_002-shaped readback fields, and recounts
  every budget transition and sequence. Before the repair,
  `validateResidentLoopEventSequence` accepted that stale-observation replay.
- Root cause: the ordered replay parser retained `finalObservation` across a
  newly active plan. The replan, suspension, and result checks therefore had
  an old observation event ID available after a plan transition while testing
  only readback identity fields. The smallest repair validates a replan against
  the preceding plan's final observation, then clears that consumed state when
  the new plan becomes active; later records can only bind an observation
  observed under the active plan.
- GREEN: the same focused command exited `0` with 2 files / 135 tests passing.
  Existing valid revisions, exact readbacks, observation and prerequisite
  causality, H proof, and initial-plus-three plan accounting remain covered.

Status: in-progress pending the exact authorized non-full fail-fast chain, one
scoped forward commit, and a new fresh true-lineage Terra/xhigh review. Full
verification, `neo`, provider/network/credential/Nous action, reset-credit
use, self-review, self-integration, and merge remain closed.

## RV-1-E-207 Causal Observation Repair Gate

- The exact authorized one-line non-full fail-fast gate exited `0`:
  `npm test -- packages/ontology/test/agent-resident-loop-contracts.test.ts packages/ontology/test/agent-contracts.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It reported 2 focused files / 135 tests passing; typecheck, diff check, and
  factory readiness completed without a failing stage. Full verification was
  not run.

Status: ready for one scoped forward commit and a new fresh true-lineage
Terra/xhigh review. No self-review, self-integration, merge, Task120 restart,
Task136 work, provider/network/credential/Nous action, reset-credit use, or
`neo` action is authorized.
