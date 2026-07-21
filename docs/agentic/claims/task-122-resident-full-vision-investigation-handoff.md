# Task 122 Claim: Investigation Planner Durable Handoff Migration

- Task and gate: Task 122 / Wave 1 / CF-1 consumer.
- Worker: `/root/wave1_task122`.
- Branch and worktree: `codex/task-122-resident-full-vision-investigation-handoff` / `/home/drake/.codex/worktrees/task-122-resident-full-vision-investigation-handoff`.
- Frozen coordinator base: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` (`CF1-INTEGRATION-SHA`).
- Claimed at: `2026-07-13T00:00:00Z`.
- Status: in-progress.

## Scope And Authority

This claim authorizes only the Task122 exclusive files:

- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- this append-only claim

The worker consumes `CF1-H-HANDOFF` and its existing durable helper. It must
record only an advisory investigation plan/evidence-gap handoff that binds the
investigation, exact context/evidence source events, prompt artifact, and plan,
task-suggestion, and PRR-draft artifact hashes. It must add no accepted graph
mutation, PRR send, hidden tool execution, provider behavior, fallback store,
shared event/schema/projection change, or external effect.

Authorization includes SDD, test-first RED/GREEN, fresh independent review,
and verification-before-completion. The exact targeted command is:

```bash
npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Before the single scoped commit, run that command for RED and GREEN, then
`git diff --check`, `npm run factory:check`, and `npm run verify`. Stop for a
fresh reviewer after committing; do not self-review, self-integrate, or merge
into `neo`.

## Required Reading And Preconditions

Read `AGENTS.md`, the Cestus factory skill, ontology design and implementation
plan, factory instructions, approved Lane H design and plan, Task117 CF-1
freeze and claim, program plan, existing handoff claims, and both Task122 files
before editing production code. The dedicated worktree starts exactly at the
frozen CF-1 coordinator SHA above.

## RED / GREEN Evidence

This claim was recorded before the Task122 test or production-file edit.

- Dependency recovery: the initial RED command could not start because this
  isolated worktree had no ignored `node_modules/.bin/vitest` and printed
  `sh: line 1: vitest: command not found`. The coordinator approved `npm ci
  --ignore-scripts` in this worktree only; it created no tracked-file churn.
- RED: the required command then exited `1` with one expected regression in
  `rejects stale evidence before recording the advisory plan handoff`. The old
  workflow returned no diagnostics, so the new `source-stale` assertion failed;
  the projection suite remained green (1 failed / 39 passed tests overall).
- GREEN: after the stale-source guard and durable readback migration, the exact
  required command exited `0`: 2 test files and 41 tests passed. It proves a
  stale evidence marker prevents provider invocation and handoff recording; a
  successful advisory plan binds exact context, prompt, source-event, and
  artifact bytes through final-output, prepared, recorded, and terminal
  readback; failure material records before terminal failure; and no tool/PRR
  send path is introduced.
- Diff hygiene before this evidence append: `git diff --check` exited `0`.

## Pre-Commit Verification

- The exact targeted command was rerun after the final TypeScript narrowing:
  `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `0` (2 test
  files / 41 tests passed).
- `git diff --check` and `npm run factory:check` exited `0`.
- `npm run verify` exited `0`, including typecheck, the full test suite, UI
  build, and the factory readiness check.
- The only intended tracked changes are the two exclusive Task122 source/test
  paths, plus this task claim. No integration or merge action has occurred.

Status: ready for the final scoped commit and fresh independent review. The
worker must not self-review, self-integrate, or merge into `neo`.

## Repair Addendum: Durable Post-Provider Storage Failure

- Repair base: `26871a1dc72889353675574d79ba55299a65c35c`.
- RED: the exact targeted command exited `1` with four expected failures
  (2 files / 39 passed tests): planner artifacts lost objective, gap, candidate,
  source, context, and prompt bindings; a later derivative failure omitted the
  persisted artifacts; a persistent manifest write threw after final-output;
  and a persistent final-material write threw before a durable terminal state.
- GREEN: the same exact targeted command exited `0` (2 files / 43 tests). It
  proves exact readback equality for success and partial-failure artifacts,
  retains every structured candidate field and source/context/prompt bindings,
  records a secret-safe `external-effect-failed` terminal when final material
  cannot persist, and returns an `output-persisted` resumable ledger state
  without fallback writes when manifest recording fails after final-output.
  The successful path also asserts final-output → prepared → recorded → terminal
  ordering and excludes graph, tool, and PRR effects.
- Verification: `git diff --check`, `npm run typecheck`, and
  `npm run factory:check` exited `0`; `npm run verify` exited `0` with 189 test
  files passed, 3 skipped, 2,232 tests passed, 5 skipped, plus the UI build and
  factory readiness check.
- Scope: only the two Task122 workflow/test files and this append-only claim
  are changed. No integration, merge, or `neo` mutation occurred.

Status: ready for the scoped repair commit and fresh independent review. Do not
self-review, self-integrate, or merge into `neo`.

## Second Repair Recovery

- Fresh second-repair author `/root/wave1_task121_recovery` started from the
  coordinator-preserved clean checkpoint
  `2c8d41c3c5f48b74cd24ef817b37efb1c2715417`.
- RED: `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `1` with
  the new restored-store regression failing as expected: the prior workflow
  re-entered `prepareSpecialistRun` and then safely rejected duplicate provider
  invocation (`Configured provider invocation failed safely`). The projection
  suite remained green (1 failed / 43 passed tests overall).
- GREEN: the same focused command exited `0` (2 files / 44 tests). The repair
  reads the unique ledger-bound final-output before preparation, strictly binds
  recovery through `recordSpecialistHandoff`, and finalizes only that readback.
  The restored-store case proves one manifest write only, no second provider
  invocation or final-output, exact prior artifact reuse, and the append order
  final-output -> prepared -> recorded -> terminal without tool or PRR effects.
- Diff hygiene and factory readiness: `git diff --check` and
  `npm run factory:check` exited `0`. Full verification remains pending the
  coordinator's global-verifier confirmation.
- Coordinated full verification: after confirmation that no global verifier
  was active, the retained replacement `npm run verify` exited `0`:
  typecheck passed; 189 test files passed, 3 skipped; 2,233 tests passed, 5
  skipped; Vite built; and factory readiness passed.

## Coordinator Root-Cause Recovery Authorization

- The second repair candidate `e9aa4a1b87d5ae8c4dd5a67e06554259d9a0b6dc`
  is preserved but rejected after two focused repair attempts. Its independent
  reviewer found two P1 defects: recovery accepted another specialist type
  because it bypassed the normal `investigation-planner` binding before
  `recordSpecialistHandoff`; and an unavailable manifest store still threw on
  a retry rather than returning the existing explicit `output-persisted`
  resumable result.
- No routine third repair is authorized on either prior author branch. A fresh
  author owns a changed-counterfactual recovery only on
  `codex/task-122-resident-full-vision-investigation-handoff-recovery` in
  `/home/drake/.codex/worktrees/task-122-resident-full-vision-investigation-handoff-recovery`,
  rooted at the preserved rejected head above. The only mutable paths remain
  this claim, `packages/agent/src/investigation-planner-workflow.ts`, and
  `packages/agent/test/investigation-planner-workflow.test.ts`.
- Before every recovery manifest or ledger write, bind the existing started
  run to `investigation-planner` and the exact resident, task, run, and attempt
  identity. A cross-specialist input must return the safe rejection with zero
  writes, model/provider invocation, draft work, or other effect. A still
  unavailable manifest store must return the same `output-persisted` resumable
  DTO, throw nothing, avoid preparation/model invocation and duplicate
  artifact/final events, and retain the prior durable material.
- The fresh RED/GREEN suite must prove cross-specialist substitution plus at
  least two persistent-unavailable retries with zero additional
  model/draft/artifact/manifest/ledger effects, followed by restored-storage
  preservation of the exact final-output -> prepared -> recorded -> terminal
  order. The author has standing `superpowers:subagent-driven-development` and
  TDD authority, must run the focused command, diff/factory, then a single
  full verification, commit, and stop for a distinct fresh independent review.
  No self-review, self-integration, `neo` merge, PRR send, graph effect, or
  scope expansion is authorized.

Status: in-progress only in the isolated root-cause recovery lane; the prior
two candidates remain rejected and unintegrated.

## Root-Cause Recovery RED / GREEN Evidence (Fresh Author)

- Root cause established before code changes: the prior recovery path entered
  `resumeDurableFinalOutput` before the normal
  `prepareSpecialistRun(..., "investigation-planner")` admission check. It
  therefore passed a recovered final-output event to the generic handoff
  recorder without first binding that event to the exact
  `agent_default`/task/run specialist start. Its manifest-store exception also
  escaped directly from recovery, causing a persistent unavailable retry to
  throw rather than return the existing resumable DTO.
- RED (after isolated `npm ci --ignore-scripts` restored ignored dependencies
  without tracked lockfile changes):
  `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `1` with
  the two intended failures. A ledger-bound `evidence-triage` final output was
  incorrectly recorded as an investigation-planner handoff, and the first
  persistent manifest-store retry threw from `recordSpecialistHandoff`.
- GREEN: the same exact command exited `0` (2 files / 45 tests). The new
  counterfactuals prove that a cross-specialist final output is safely blocked
  before any recovery put, ledger append, model/provider invocation, draft, or
  artifact effect; and that two persistent unavailable-store retries return
  the identical `output-persisted` DTO without a new durable manifest write,
  ledger event, model invocation, draft, or artifact. Restored storage retains
  the existing exact final-output -> prepared -> recorded -> terminal order.
- The implementation is limited to recovery admission: it reads the existing
  final-output material, checks the unique `agent_default` started run has the
  exact investigation-planner type plus matching task/run identity and final
  binding, and only then invokes the generic recorder. A pre-record manifest
  storage failure returns the already durable `output-persisted` material
  rather than re-entering preparation or model work. No PRR, graph, external,
  tool, or provider effect is introduced.
- Pending pre-commit gates: `git diff --check`, `npm run factory:check`, and
  the single coordinator-cleared `npm run verify`; then this fresh author will
  commit only the three authorized Task122 paths and stop for a distinct fresh
  reviewer.

## Verification Recovery

- The first coordinator-cleared full gate reached typecheck and exited `2`
  before tests because the recovery final-output filter lacked an explicit
  TypeScript event predicate and the new reused persistent-retry input widened
  its credential kind. Both corrections are limited to the authorized
  workflow/test paths; no behavior changed beyond the RED contract.
- Post-correction `npm run typecheck` exited `0`, then the exact focused command
  exited `0` (2 files / 45 tests). A replacement full verification is pending
  the same single-slot/no-overlap rule.

## Recovery Candidate Verification And Handoff

- Final scoped hygiene: `git diff --check` and `npm run factory:check` exited
  `0` on the three authorized paths only.
- Retained replacement full verification: `npm run verify` exited `0` after
  typecheck. It recorded 189 test files passed with 3 skipped, 2,234 tests
  passed with 5 skipped, the Vite production build passed (existing chunk-size
  warning only), and factory readiness passed.
- Status: ready-for-review. This fresh recovery author will commit only this
  append-only claim plus the authorized workflow and focused test, then stop
  for a new independent review. No self-review, self-integration, `neo` merge,
  PRR send, graph effect, provider effect, or scope expansion occurred.

## Coordinator Bounded Attempt-Binding Repair

- Independent review rejected `ea26c00e2ac67759602bd03afcfdf75cef8a0e82`:
  recovery checks resident/task/run/type but never binds an orchestration
  `attemptId` before its first recovery manifest write. The existing
  specialist-run.started event has no attempt field, so this repair must fail
  closed on verified authoritative task-orchestration attempt-to-run evidence;
  it must not invent an attempt, accept a missing/stale relation, or widen the
  contract/write set.
- This is the first bounded repair of the changed-tactic root lane, not a
  return to either rejected pre-root-cause attempt. The current root-lane
  author may alter only the same workflow, focused test, and this claim. Before
  any recovery read that can lead to a manifest/ledger write, preparation, or
  model call, it must bind exact resident, task, run, specialist type, and
  attempt using existing authoritative evidence. A swapped attempt with the
  same resident/task/run/type must reject with zero manifest, ledger, model,
  draft, artifact, PRR, graph, provider, or external effect.
- Preserve the two repeated-unavailable retry result (`output-persisted` with
  no extra effects), cross-specialist rejection, exact reconstruction, and
  restored final-output -> prepared -> recorded -> terminal order. Add focused
  RED then GREEN counterfactuals, run diff/factory and one retained full gate,
  commit scoped work, and stop for a new fresh reviewer who is neither the
  author nor any prior Task122 reviewer. Standing
  `superpowers:subagent-driven-development`, TDD, and
  verification-before-completion authority applies; self-integration and
  `neo` remain forbidden.

Status: in-progress in this bounded root-lane repair; `ea26c00e` remains
rejected and unintegrated.

## Coordinator Release-Line Root-Lane Recovery

- Independent final review rejected
  `1cc46fb5905a5db5dd35e4039e7f8fe52659fb77`: its authoritative-attempt
  guard only treats a release as stale when the release sequence follows the
  runner-dispatching checkpoint. A released exact claim/attempt/lease followed
  by a forged later checkpoint can therefore re-enter recovery and reach
  effects. The candidate is preserved, rejected, and unintegrated.
- A fresh author works only on
  `codex/task-122-resident-full-vision-release-recovery` in
  `/home/drake/.codex/worktrees/task-122-resident-full-vision-release-recovery`,
  rooted at that preserved candidate. The same three-file scope applies. With
  the one-matching-claim invariant, any authoritative release of the matched
  exact claim/attempt/retry/lease must fail closed before every recovery store
  read/write, ledger append, preparation, model, draft, artifact, PRR, graph,
  provider, or external effect—regardless of whether a later forged checkpoint
  exists. Do not broaden contracts or invent a new active lease.
- RED/GREEN must append a valid release then a forged matching
  runner-dispatching checkpoint and prove safe rejection plus zero effects.
  Retain all attempt-chain, swapped/duplicate/missing/stale, cross-specialist,
  repeated-unavailable, reconstruction, and restored ordering tests. Standing
  SDD/TDD/verification-before-completion authority applies; run focused,
  diff/factory, one retained full gate, scoped commit, and a fresh reviewer
  with no prior Task122 author/reviewer role. No self-integration or `neo`
  merge is authorized.

Status: in-progress only in this fresh release-line recovery; all earlier
Task122 candidates remain preserved, rejected, and unintegrated.

## Attempt-Binding Repair RED / GREEN Evidence

- Root cause: the preserved recovery candidate trusted the specialist-started
  event but had no authoritative orchestration attempt-to-run join. A second
  claim/checkpoint could name the same resident/task/run/type with a swapped
  attempt identity and recovery would still write its handoff manifest.
- RED: the exact focused command exited `1` after a valid planner claim and
  `runner-dispatching` checkpoint had produced durable output, then a second
  causally valid claim/checkpoint with a swapped `attemptId` for that same run
  was appended. The prior candidate returned `output-persisted` instead of
  fail-closing before recovery work.
- GREEN: the same command exits `0` (2 files / 47 tests). Recovery and normal
  preparation now require exactly one matching `agent_default` planner start,
  exactly one explicit `runner-dispatching` checkpoint naming the run, and
  exactly one prior causally linked claimed attempt with equal task/run type,
  attempt, retry, and lease generations. Missing, duplicate, swapped, or
  released causal evidence returns a safe blocked handoff before store reads or
  writes, ledger appends, preparation, model/provider calls, drafts, artifacts,
  PRR, graph, or external effects.
- The counterfactuals retain cross-specialist rejection, two unavailable-store
  `output-persisted` retries with no added durable effect, reconstruction, and
  exact restored final-output -> prepared -> recorded -> terminal ordering.
  They also prove a released attempt cannot enter preparation or invoke the
  provider.
- Pending pre-commit gates: `git diff --check`, `npm run factory:check`, then
  one retained no-overlap `npm run verify` only after the coordinator confirms
  the global full-verifier slot is clear. This repair remains limited to the
  three authorized Task122 paths and requires a new reviewer distinct from this
  author and both earlier Task122 reviewers.

## Attempt-Binding Verification Recovery

- The first retained full gate exited `2` at typecheck before tests because the
  test-only helper returned the generic ledger event union for its claimed and
  checkpointed append results. The repair narrows those existing append results
  to their already authoritative event types; no contract or production
  behavior changed.
- Post-correction `npm run typecheck` exits `0` and the exact focused command
  exits `0` (2 files / 47 tests). A single replacement retained full gate is
  pending with no overlapping verifier.

## Attempt-Binding Candidate Verification And Handoff

- Final scoped hygiene: `git diff --check` and `npm run factory:check` exit
  `0`; the only intended tracked files remain this claim, the Task122 workflow,
  and its focused test.
- Retained replacement full verification: `npm run verify` exits `0` after
  typecheck, with 189 test files passed and 3 skipped, 2,236 tests passed and
  5 skipped, the Vite production build passed (existing chunk-size warning
  only), and factory readiness passed.
- Status: ready-for-review. The fresh attempt-binding repair author will commit
  only the three authorized paths and stop for a reviewer who is neither this
  author nor either prior Task122 reviewer. No self-review, self-integration,
  `neo` merge, PRR/graph/provider/external effect, or scope expansion occurred.

## Release-Line Recovery RED / GREEN Evidence

- Root cause: the preserved `1cc46fb5` guard ignored a matching authoritative
  release unless its sequence followed the selected `runner-dispatching`
  checkpoint. A forged checkpoint appended after a release of the exact claim,
  attempt, retry, and lease could therefore make the released line appear
  admissible and reach recovery storage.
- Isolated dependency setup: this dedicated worktree initially lacked ignored
  `node_modules/.bin/vitest`; `npm ci --ignore-scripts` restored lockfile-pinned
  dependencies without tracked-file churn.
- RED: the exact focused command exited `1` (2 files / 47 passing tests / 1
  expected failure). The new counterfactual appended one authoritative claim,
  persisted a final output, released that exact claim, then appended a forged
  later matching `runner-dispatching` checkpoint. The preserved candidate
  reached a manifest read, producing the wrong durable-output summary instead
  of the required attempt rejection.
- GREEN: `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/agent/test/specialist-handoff-projection.test.ts` exited `0` with 2
  files and 48 tests passed. The guard now invalidates the exact causal line on
  any matching release, regardless of checkpoint ordering. The counterfactual
  proves rejection before manifest get/put, ledger append, preparation/model,
  draft/artifact, PRR, graph, provider, or external effects; existing valid,
  swapped, missing/duplicate/stale, cross-specialist, repeated-unavailable,
  reconstruction, and restored-ordering coverage remains green.
- Pre-full gates: `git diff --check` and `npm run factory:check` exited `0`.
  One retained no-overlap `npm run verify` is the remaining gate. The scoped
  commit will include only this append-only claim, the Task122 workflow, and
  its focused test, then stop for a fresh reviewer with no prior Task122 role.

## Release-Line Verification Recovery

- The first retained full gate exited `2` at typecheck before tests because a
  pre-existing released-attempt test passed the now-optional test setup binding
  without an explicit narrow. The correction adds only the test assertion and
  non-null narrow for that default setup path; recovery semantics are
  unchanged.
- Post-correction focused verification, `git diff --check`, and factory
  readiness all exit `0` (2 files / 48 tests). A single retained replacement
  full verification is next; no overlapping verifier is running.

## Release-Line Candidate Verification And Handoff

- The single retained replacement `npm run verify` exited `0`: typecheck
  passed; 189 test files passed with 3 skipped; 2,237 tests passed with 5
  skipped; the Vite production build passed (existing chunk-size warning only);
  and factory readiness passed.
- Final scope is exactly the Task122 workflow, focused workflow test, and this
  append-only claim. This second and final bounded release-line repair is ready
  for a fresh independent reviewer with no prior Task122 author or reviewer
  role. It remains unintegrated; no self-review, self-integration, `neo` merge,
  PRR, graph, provider, tool, external, or fallback-store effect occurred.

## V4 CF1-HR Authority-Bound Adoption Claim

- Status transition: `released historical Task122 candidates` -> `in-progress`
  for strict V4 position 26 only.
- Worker: `/root` on `codex/task122-cf1-handoff-adoption` in
  `/home/drake/.codex/worktrees/da35/Cestus`.
- Immutable program base verified before this transition:
  `986c2a43b018e72acf1104e84853826b06b1abdd`.
- Governing authority: released CF1-HR strict record 14 (`RV-1-E-714`), the
  Task136 V4 contract, and Task122's three owned paths only.

This finite packet migrates investigation planning from the legacy handoff
recorder/finalizer path to CF1-HR's strict V2 authority-bound lifecycle. The
workflow must consume only an injected opaque current mounted handoff-authority
witness and mounted prompt/artifact stores. It must not mint caller-structural
authority, use V1 compatibility to complete V2, invoke a raw V2 completion
helper, create a shadow contract, or use a fallback write.

The successful lifecycle is exact durable final output -> V2 prepared -> V2
recorded -> specialist-run terminal -> agent.task.orchestration.completed ->
task status, followed by complete authority-bound projection/readback. Exact
task, run, workspace/currentness, provenance, source/context/prompt, and
investigation bindings remain required. Stale, cross-run, conflicting, missing,
or consumed authority fails closed; advisory outputs remain limited to the
investigation plan, task suggestions, and PRR draft candidates.

The required causal RED and GREEN command is:

```bash
npm test -- packages/agent/test/investigation-planner-workflow.test.ts
```

Before the GREEN commit, run the Task122 cross-boundary command, standalone
typecheck, differential `npm test` and `npm run verify`, `git diff --check`,
and `npm run factory:check`. No registry, contract, spec, plan, provider,
credential, network, live-service, integration, or `neo` action is authorized.

## RV-1-E-854 Consolidated Causal RED

- Authority merge: `84861d1a975d9ec9688a1fa6e74165ddd017e947` forward-merges
  exact program authority `3b43a00294bed9e6e4e0532a1389dc3d0b27d0e2` into the
  preserved reviewed candidate history. No history was rewritten.
- RED scope is this append-only claim and
  `packages/agent/test/investigation-planner-workflow.test.ts`; production
  `packages/agent/src/investigation-planner-workflow.ts` remains byte-identical
  to the authority merge.
- Causal coverage adds exact normal and restored/recovery swapped-
  `investigationId` cases, each requiring fail-closed rejection before model,
  recovery store, or completing effect. The unchanged workflow instead records
  the normal swap as `ready-for-review`/`handoff-recorded`; the recovery swap
  continues only as `output-persisted` rather than rejecting the mismatched
  durable start binding.
- The mounted cursor case uses a real portable workspace, SQLite ledger,
  portable producer, opaque controller/witness, separate bound material and
  manifest stores, mounted production prompt readback, and the actual planner
  model invocation. It expects the bound material store to remain current for
  final-output material. The released producer instead rejects with
  `portable-mounted-handoff-authority-invalid` from its post-invocation cursor
  check, before final output can be appended; no no-op witness or ordinary
  store satisfies this positive path.
- RED command on the exact authority-merge bytes plus these test/claim changes:
  `npm test -- packages/agent/test/investigation-planner-workflow.test.ts`
  exited `1` with 3 expected failures and 16 retained passes (19 total): the
  normal swap, recovery swap, and real mounted post-model cursor assertion.

## RV-1-E-861 Direct Portable Cursor GREEN

- Authority merge retained: `dba925a1e056c9db0804bfefbd89450e6576a054`
  forward-merges the exact clean program authority
  `de2a5518d5db6180a216a3c889ee39af641ed2c4` into the preserved causal RED
  `358a683aaacf3e4ffb18de5ef1f4efefdbb71fce`; no history was rewritten.
- The planner now requires the durable `agent.specialist-run.started`
  investigation ID to equal the supplied ID both before normal preparation and
  before recovery readback or completion. A same task/run/type with a swapped
  investigation therefore returns the safe blocked result before model,
  storage, terminal, projection, provider, or external work.
- The transferred portable cursor records exactly one same-run provider
  transcript while its handoff phase remains `started` or `started-running`:
  a schema-valid `agent.model-invocation.requested` with the exact resident
  actor, invocation stream, run, provider, model family, input hash, run type,
  correlation, and durable-start causation; then exactly one matching
  `completed` or `failed` terminal at stream sequence two and request
  causation. A completed terminal additionally binds its output hash and model
  family. The released failed-event schema has no output artifact, so that
  terminal binds its exact no-output payload instead. Pending, duplicate,
  reordered, malformed, cross-run, or unknown transcript material burns the
  opaque authority without advancing the handoff lifecycle.
- The real positive coverage uses a portable workspace and SQLite ledger, a
  current portable producer, its separate bound material/manifest capability
  pair, opaque witness/controller, mounted production-prompt readback, and the
  released runtime model invocation. It proves normal verified V2 readback and
  fresh-admission recovery after a manifest interruption without a second model
  invocation. No no-op witness, ordinary store, raw V2 completion, fallback
  write, task creation, crawl, provider transfer, graph mutation, tool, or PRR
  send satisfies the positive path.
- GREEN focused command:

  ```bash
  npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts
  ```

  exited `0` with 2 files and 49 tests passed. The governing cross-boundary
  command

  ```bash
  npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts
  ```

  exited `0` with 4 files and 139 tests passed. The V4 bounded assurance gate
  exited `0` with exactly 20/20 tests, and V4 contract mode emitted all four
  required markers. `npm run factory:check` exited `0`. Remaining committed-byte
  differential and repository gates are recorded by the final bounded packet; no integration,
  registry, `neo`, provider, credential, network, external, or fallback action
  is authorized.

## RV-1-E-864 Provider Transcript and Prelude Causal RED

- Recovery starts from the clean registry-only authority merge
  `99c16639d6e38551ec7a022787db37f02c699325`, which preserves reviewed
  candidate `911747851a25c56510b00cba8787af9cb309c0b3` and exact program
  authority `2f69e097`. This RED changes only this append-only claim and the
  portable mounted-store test; both production files remain byte-identical to
  the merge.
- The causal test uses the actual portable workspace, SQLite ledger, mounted
  issuer, opaque controller, and bound stores. An investigation-planner
  durable history containing only its exact started event still permits
  `final-output`: provider request/completed-or-failed provenance is absent.
- It also reproduces three usable malformed histories: a duplicate claim, a
  checkpoint before its claim, and a matching checkpoint appended after the
  started/provider transcript. The current cursor skips each apparently
  matching prelude unconditionally and permits final output, rather than
  burning its opaque authority before material I/O.
- The focused RED command is the required two-file command. It must fail only
  at the new absent-provider and duplicate/reordered/post-start prelude cases;
  no production, registry, contract, checker, or ownership expansion occurs.

## RV-1-E-865 Provider Transcript and Prelude GREEN

- The portable cursor now treats a final output as authority-bound only when
  an investigation-planner durable start has exactly one already-validated
  same-run `agent.model-invocation.requested` and exactly one matching
  completed-or-failed terminal. The transcript remains optional for released
  legacy run types. Missing and pending investigation transcripts burn the
  opaque authority before final-output material can be written.
- Dispatch history is now an optional but finite pre-start state machine. If
  present, it accepts one schema-valid resident claim and one immediately
  subsequent runner-dispatching checkpoint, each on the exact orchestration
  stream and task/run/type/attempt/retry/lease tuple. The claim binds its
  released task causation and worker; the checkpoint binds the claim causation,
  resident actor, and approved run. Duplicate, reordered, post-start,
  mutated, unknown-bound, and cross-run material fail closed. Final-output and
  all later V2 transitions retain their existing durable order.
- The real portable planner fixture now emits that released pre-start
  claim/checkpoint order with the resident actor and `corr_<taskId>`
  correlation; it continues to prove mounted prompt/readback, opaque witness,
  verified V2 readback, and recovery without a second model invocation.
- GREEN focused command:

  ```bash
  npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts
  ```

  exits `0` with 2 files and 53 tests passed: the prior 49 plus the four
  named causal cases. No registry, contract, checker, spec, plan, raw record,
  provider, network, credential, external, fallback, or `neo` behavior is
  changed.

## RV-1-E-866 Pre-Effect Final-Material Causal RED

- Recovery begins from clean registry-only authority merge
  `0a24f610f1ba109b9fb7e2a3856f5328b8bf3bd0`, preserving candidate
  `799de1e9f0fc65383f60c55d344f93be126a7efa` and program authority
  `eefd8ef5`. This RED changes only the append-only Task122 claim and planner
  test; production remains byte-identical to the merge.
- The causal case uses `appendSpecialistFinalOutputStep` with the real mounted
  portable investigation planner fixture, opaque controller, and bound
  material store. Its exact queued/claim/checkpoint/started history contains
  no provider transcript. Current bytes still persist canonical final handoff
  material, append `agent.specialist-run.step.recorded`, and leave that hash
  readable before the later controller path rejects.
- RED requires rejection before the final-material write and ledger append,
  asserting zero final-output events, no readable material hash, and unchanged
  ledger. No registry, contract, checker, spec, plan, raw record, network,
  provider, credential, external, fallback, or ownership change occurs.

## RV-1-E-867 Pre-Effect Final-Material GREEN

- The mounted material-store capability now receives the final-output
  prerequisite check immediately after its current cursor inspection and before
  its real `FileBlobStore.put`. For a durable planner in `started` or
  `started-running`, a missing or incomplete required provider transcript, or
  an incomplete dispatch prelude, burns opaque authority before final handoff
  material persistence or `agent.specialist-run.step.recorded` append.
- The guard is local to the mounted final-material store. It retains the
  released legacy-run transcript behavior, preserves the approved exact
  request-to-terminal and pre-start bindings, and leaves final-output and all
  later V2 transitions unchanged after a valid material write.
- The causal RED now passes through the released
  `appendSpecialistFinalOutputStep` boundary with zero final-output events,
  zero material persistence, and an unchanged ledger. Verification evidence
  for the committed GREEN follows in the bounded packet; no registry,
  contract, checker, provider, credential, network, external, fallback, or
  `neo` action is part of this change.
