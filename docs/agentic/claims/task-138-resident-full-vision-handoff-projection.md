# Task138-H Claim: Mounted Resident Handoff Projection

- **Status:** repairing after fresh dual-review defects
- **Task:** strict release record 28 `Task138-H`
- **Claimed at (UTC):** 2026-07-21
- **Worker:** Codex Task138-H bounded implementation owner
- **Branch:** `codex/task138-h-record28`
- **Worktree:** `/home/drake/.codex/worktrees/task138-h-record28/Cestus`
- **Exact dispatch base:** `1253e3e7be1bfe299d3345f0f9652fb9b29fc029`
- **Frozen authority:** V4 unfinished card `Task138-H` in
  `docs/agentic/contracts/task136-bounded-assurance-v4.json`

## Exact Scope

1. `packages/local-runtime/src/agent-handoff-projection.ts`
2. `packages/local-runtime/test/agent-handoff-projection.test.ts`
3. `docs/agentic/claims/task-138-resident-full-vision-handoff-projection.md`

The older plan's `task-138-resident-full-vision-handoff-runtime-projection.md`
claim name is superseded and must not be created. No registry, contract, shared
agent source, package index, assurance, `neo`, integration, or release-record
edit is authorized.

## Released-Interface And API Decision

The design-only `MountedHandoffStore` proposal is absent from released
TypeScript. This card therefore owns only a local-runtime, capability-injected,
read-only adapter over the released mounted material and manifest store `get`
readers plus the released `HandoffAuthorityBinding`. The adapter accepts an
exact target `runId`, ledger events, distinct role-bound material/manifest
readers, and the current authority binding. It dispatches only ledger-declared
material hashes to the material reader and ledger-declared manifest hashes to
the manifest reader, then delegates canonical bytes, exact hashes, manifest and
material agreement, ledger replay, run/task causation, and lifecycle selection
to `buildSpecialistHandoffProjection`.

The adapter never accepts `put`, append, provider, registry, path, fallback,
or executable-effect capabilities, and never receives, preflights, or consumes
the one-shot mounted recording witness. It compares verified V2 replay authority
with the injected current binding before emitting provenance. Because the
released projector exposes `SpecialistHandoffReadback` only for the complete
terminal/task chain, non-complete lifecycle DTOs omit provenance rather than
synthesizing it; the frozen acceptance permits this fail-closed omission.

## Invariant Mapping

- **Append-only and rebuildable:** the result is derived only from the supplied
  immutable ledger snapshot and exact mounted reads; the adapter performs no
  append, repair, copy, scan, or fallback write.
- **Exact authority and provenance:** material/manifest role and hash routing is
  exact, V2 provenance requires shared replay verification plus exact current
  `HandoffAuthorityBinding` agreement, and legacy/unavailable/inconsistent
  results omit provenance.
- **Browser and secret safety:** output contains only the frozen
  `ResidentHandoffDto.v1` safe fields. It excludes bytes, prompts, model/provider
  data, credentials, paths, store/registry objects, stacks, and raw errors.
- **No executable authority:** every exposed next action has `effect: "none"`;
  mount, corruption, stale, cross-run, and hostile-input failures fail closed.
- **No input mutation:** public values are normalized to frozen plain own-data
  snapshots before any mounted read or `await`.

## Execution Authority And Gates

`RV-1-E-889` and the coordinator explicitly authorize task-scoped
subagent-driven development and test-driven development for this card. Required
lineage is claim-only, permanent causal RED, then minimal GREEN. The exact
focused command is:

```text
npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts
```

The cross-boundary command is:

```text
npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Final gates are the focused command, cross-boundary command, `git diff
--check`, `npm run typecheck`, `npm run factory:check`, `npm run verify`, and
the discoverable proportionate V4 standalone/contract/repository frontier,
scope, ancestry, clean-dependency, and no-drift checks. Provider, credential,
network, external-system, push, merge, rebase, integration, destructive action,
and fallback writes are prohibited.

## RED/GREEN Evidence

- RED: the exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exited `1` with **1 failed file / 0 tests collected**. The sole diagnostic
  was `Cannot find module '../src/agent-handoff-projection.js'` at the new test
  file's production import (line 18), proving the Task138 adapter is absent;
  no test syntax, fixture, dependency, provider, credential, or unrelated
  failure was reported.
- GREEN: admitted on the exact published `neo` tree after the bounded candidate
  again passed the exact focused suite **17/17** and exact cross-boundary suite
  **53/53**. Fresh uninterrupted typecheck and factory readiness passed. The
  standalone V4 assurance corpus passed **20/20**, contract mode emitted all
  four exact markers, and repository mode executed the strict **27 commands / 27
  records** prefix before the expected `expected 29 records, found 27` closure.
  The candidate now awaits fresh architecture and executable review; it is not
  approved, integrated as record 28, or released.

## Usage-Pause Checkpoint

- Paused at the user's explicit Codex-plan usage boundary on 2026-07-21.
- Permanent history before this checkpoint is claim-only commit `5e1de3e2`,
  causal missing-module RED `d1694f0a`, and expanded lifecycle RED
  `d855533e`.
- The candidate implements only the authorized source and corrects two test
  fixture literals to released enum values. No assertion was removed or
  relaxed. It passed **17/17** focused and **53/53** cross-boundary tests.
- A typecheck retry was terminated solely to honor the pause request. Its
  outcome is unknown and must not be inferred. Resume by rerunning the exact
  focused and cross-boundary suites, then `npm run typecheck`; classify and
  repair any diagnostic before claiming GREEN.
- This checkpoint is not reviewed, approved, integrated, released, or a
  strict record-28 release record. The program frontier remains **27 of 29**.

## Publication Verification Supersession

- After the pause, the user explicitly requested publication of all committed
  work to `origin/neo`.
- From exact checkpoint `05672a69bffccd0d75b9aacecdd0912f9f841ac3`, the
  exact cross-boundary command passed **2 files / 53 tests**, including the
  focused Task138-H suite's **17/17** tests.
- A fresh uninterrupted `npm run typecheck` then exited 0 with
  `typecheck passed`, superseding only the pause-time unknown verifier result.
- Program pause authority `152e797c` was forward-merged without rewrite at
  `4eed212447bc457481b8b923159cd1eca3874e6a`. Publication does not convert this
  checkpoint into a reviewed, approved, integrated product card or strict
  record-28 release; those remaining gates stay pending.
- Fresh factory readiness passed. Fresh `npm run verify` completed typecheck,
  then reproduced the documented inherited aggregate cohort: **10 failing
  files / 47 failing tests / 2,878 passes / 5 skips**. Neither Task138-H test
  nor its source is in the failure cohort. V4 standalone assurance passed
  **20/20** and contract mode emitted all four exact markers.

## Resume Candidate Admission

- The user explicitly resumed the program after the graceful usage pause. The
  program and Task138-H worktrees were clean and fast-forwarded without rewrite
  to published authority `adda53377f8e363979fc68dbc3d268759a67e404`.
- The three Task138-H owned blobs at historical implementation checkpoint
  `16eb076a62bdf8c1e361d19b61ddc5339fce2afe` exactly match the published
  authority tree. The task branch and clean `neo` therefore have the same
  candidate product bytes before this claim-only admission update.
- Fresh admission evidence on those bytes is **17/17** focused, **53/53**
  cross-boundary, `typecheck passed`, `factory-readiness passed`, V4 assurance
  **20/20**, all four contract markers, and repository prefix marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27` followed only by the
  expected 29-record closure.
- Fresh `npm run verify` completed typecheck and reproduced the inherited
  aggregate cohort as **10 failing files / 48 failing tests / 2,877 passes / 5
  skips**. Task138-H is absent from every failing file. Because the task branch
  and `neo` shared exact tree `adda5337` for this run, the aggregate result is
  an inherited clean-tree result rather than a Task138-H differential.
- Scope is exactly the frozen three owned paths; dependencies are real and
  local (`node` 26.1.0, Vitest 4.1.9), the worktree had no tracked or untracked
  residue before this claim-only transition, and no provider, credential,
  external system, fallback write, destructive history action, or product
  release record was used.

## Fresh Review Repair

- `RV-1-E-893` returns Task138-H to `implementing` after both fresh reviewers
  rejected candidate `c6e508b10fad9f949e616687e7159b2fbd8a9c64` on three
  bounded defects: hostile pre-normalization identity/trap handling,
  terminal-only lifecycle classification, and discarded safe diagnostic
  evidence.
- This repair starts from exact clean base
  `aea32bf7bc957bd15c5f50981700ea8b4199362e`, retains the frozen three-path
  scope, and first adds causal coverage without changing production source.
  The tests require a fixed fallback identity for invalid top-level input,
  containment of descriptor/prototype Proxy traps, exact ready/failed
  terminal-only `terminal-consistent` mapping, and safe event-ID/SHA-256
  diagnostic evidence filtering without raw messages or unsafe values.
- Causal RED command:
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`.
  It exited `1` with **1 failed file / 7 failed / 17 passed**. The two exact
  ready/failed terminal-only cases returned `handoff-recorded`; invalid input
  retained hostile top-level `runId`; descriptor and prototype Proxy traps
  escaped from `inferTargetIdentityWithoutObservation`; and both safe
  diagnostic-evidence cases received empty event/hash arrays. No pre-existing
  test failed, no production source changed, and no provider, credential,
  external system, fallback write, or unrelated verifier participated.
- Minimal GREEN replaces pre-normalization fallback observation with one fixed
  safe identity, classifies exactly one compatible ready/failed terminal link
  only after the released projector has accepted ordering, status, causation,
  and output hashes, and filters released diagnostic evidence to exact
  `evt_...` IDs and lowercase SHA-256 hashes without copying its message.
  Existing next actions remain `effect: "none"`; no parser, writer, provider,
  registry, path, fallback, witness, or approval-consumption capability was
  added.
- Intended GREEN bytes pass the focused command with **1 file / 24 tests** and
  the cross-boundary command with **2 files / 60 tests**. Standalone
  `npm run typecheck` exits `0` with `typecheck passed`; `npm run
  factory:check` exits `0` with `factory-readiness passed`; and `git diff
  --check` emits no error. V4 standalone assurance passes **20/20**, while
  contract mode emits all four exact release-graph, composition-corpus,
  command-card, and ABI-corpus markers.
- Repository mode was invoked before GREEN commit and refused only with
  `repository checkout is dirty`, as its clean-checkout gate requires. Per the
  coordinator's explicit verifier-order direction, the atomic GREEN commit is
  followed by clean-checkout repository mode and one claim-only admission
  commit recording its exact result. This repair is not approval, product
  integration, strict record 28, or release; the frontier remains **27 of
  29**.

## Clean Repair Candidate Admission

- Atomic GREEN commit
  `3bcefb8d5ef8c04b93536cc63c03ad8bb000ba58` contains only the minimal
  production repair and this claim update over causal RED commit
  `1a4bb7f6222f3fffd66ed6dfb78f9fd95b3832bc`; the causal test changes remain
  in the RED parent rather than being weakened or rewritten.
- From the clean GREEN checkout, exact repository command
  `node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode
  repository` executes all **27 released commands**, emits
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exits `1`
  only with `repository release closure incomplete: expected 29 records,
  found 27`. This is the required strict-prefix success and expected unfinished
  frontier closure; Task138-H remains unreleased record 28.
- Candidate dependencies are real and local: Node `v26.1.0`, Vitest `4.1.9`,
  and neither `node_modules` nor `node_modules/vitest` is a symlink. The exact
  repair-base diff contains only the three frozen Task138-H paths, diff hygiene
  passes, and the worktree was clean before this claim-only admission update.
  Full `npm run verify` was not run for this repair, so no aggregate cohort is
  newly claimed or inferred.

## Second Fresh Review Causal RED

- `RV-1-E-895` returns Task138-H to `implementing` and authorizes a second
  causal RED before any production repair. Production source remains unchanged.
- The owned focused test now covers all four review defects: matching started
  `runId`/optional `taskId` values that fail `isAgentSecretSafeText`; normalized
  plain-own events whose payload, context, or type fails the released
  `validateKnowledgeEvent`; syntax-valid but secret-unsafe diagnostic event IDs;
  and exact recorded retries whose terminal remains causally bound to the
  released projector's authoritative first recorded event.
- Exact command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  reports **1 failed file / 8 failed / 24 passed**. The identity cases return
  `no-output`; malformed payload escapes as a raw `TypeError` while malformed
  context/type return `no-output`; the unsafe diagnostic ID is retained; and
  both ready/failed exact-retry terminal cases return `handoff-recorded`.
  Every pre-existing focused test remains green, so the RED is confined to the
  four missing `RV-1-E-895` behaviors. No store write/read fallback, provider,
  credential, network, external system, or production-source edit participates.

## Second Review Minimal GREEN

- The repair addresses four bounded root causes: matching run/task identities
  were emitted without the released secret-safety predicate; malformed event
  envelopes could reach deeper interpretation or escape the public boundary;
  syntax-valid diagnostic IDs were not secret-filtered; and exact recorded
  retries could displace the authoritative recorded event used for terminal
  causation.
- The minimal implementation checks normalized event envelopes before any
  mounted I/O using exact own-type membership in the released `eventContracts`
  plus non-array object `payload` and `context` fields. It contains all deeper
  asynchronous interpretation at the public fail-closed boundary, applies
  `isAgentSecretSafeText` to matching run/task identities and diagnostic event
  IDs, and derives the selected recorded event ID from the released projection
  history before exact-event lookup and terminal classification.
- The adapter does not add a full payload parser, duplicate released payload
  schema validation, authority, executable effect, writer, fallback, provider,
  credential, registry, path, witness, or approval-consumption capability.
- Exact focused validation passes **1 file / 32 tests** and exact cross-boundary
  validation passes **2 files / 68 tests**. Standalone `npm run typecheck`
  passes, `npm run factory:check` passes, V4 standalone assurance passes
  **20/20**, and contract mode emits the exact four release-graph,
  composition-corpus, command-card, and ABI-corpus markers.
- Full `npm run verify` exits `1` only with the inherited aggregate cohort:
  **10 failing files / 48 failing tests / 2,892 passes / 5 skips**. Neither
  Task138 owned source nor test is involved. Dependencies are local and real:
  Node `v26.1.0`, Vitest `4.1.9`, and neither `node_modules` nor
  `node_modules/vitest` is a symlink.
- Repository mode remains pending until this atomic GREEN commit provides the
  required clean checkout. This is not approval, strict record 28, integration,
  or release; the unfinished program frontier remains **27 of 29**.

## Second Repair Clean Admission

- Atomic GREEN commit
  `e46c1a808ebe600dd974840cf8075656b156fe7e` descends from causal RED commit
  `d373a4d0cca3e8cfeb2862b4d32b5558d9c565b3` without rewrite. The exact
  repair-base-to-candidate scope is the three frozen Task138 owned paths, and
  the checkout was clean before the clean-only repository verifier ran.
- Clean repository mode executed all **27 released commands**, emitted exact
  marker `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exited
  `1` only with `repository release closure incomplete: expected 29 records,
  found 27`. This is the expected strict-prefix success at the unfinished
  frontier rather than a candidate failure.
- Ancestry and exact scope checks pass. Dependencies remain real and local:
  Node `v26.1.0`, Vitest `4.1.9`, and neither `node_modules` nor
  `node_modules/vitest` is a symlink. The admitted candidate does not add a
  provider, credential, network, external-system, fallback-write, destructive
  history, or release action.
- This clean admission is not approval, integration, strict record 28, or
  release. The program frontier remains **27 of 29**.

## Exact Parser Causal RED

- `RV-1-E-897` returns Task138-H to `implementing` from exact clean
  forward-merged base `c70ec3fa1046ac2585d88efc82833b007b29c6ea` and
  authorizes a third bounded repair without changing production source first.
- The focused test now proves that a matching started event with path-bearing
  `runId` and `taskId` values can pass the existing secret-safe predicate while
  failing released `validateKnowledgeEvent`, and that an incomplete completed
  terminal without required `completedAt` can fail the released parser while
  retaining every field the permissive lifecycle logic consumes. Both cases
  require fixed safe `dto-invalid` output before either mounted store read and
  forbid path or raw-value retention.
- Exact causal command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 2 failed / 32 passed**. The invalid started
  event returns `no-output` with its rejected identity, while the incomplete
  terminal returns `terminal-consistent`; every prior focused assertion remains
  green. No production source, ontology/schema, registry, provider, credential,
  external system, fallback write, or unrelated verifier participates.

## Exact Parser Minimal GREEN

- The repair replaces the permissive local event-envelope assertion with the
  released `validateKnowledgeEvent` parser over each descriptor-copied event
  before identity selection, mounted-reader capture, or store I/O. It consumes
  only successful canonical parser data and maps any parse failure to the fixed
  safe `dto-invalid` result without filtering parser issues or adding a local,
  fallback, or permissive schema.
- Task-owned intended-valid fixtures now use the released 64-hex orchestration
  `attemptId`; a permanent parser guard covers every ready, waiting, blocked,
  failed, and legacy lifecycle event. Existing secret-boundary tests use
  parser-valid IDs that remain unsafe to the stronger DTO secret predicate.
  Hostile diagnostic coverage separately proves schema-invalid material is
  rejected before store I/O and that a schema-valid terminal conflict retains
  only safe related event and content-hash evidence.
- Exact focused validation passes **1 file / 35 tests** and exact cross-boundary
  validation passes **2 files / 71 tests**. Standalone `npm run typecheck`
  emits `typecheck passed`; `npm run factory:check` emits
  `factory-readiness passed`; V4 assurance passes **20/20**; and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers. Diff hygiene passes.
- Full `npm run verify` completes typecheck and reproduces only the inherited
  aggregate cohort: **10 failing files / 48 failing tests / 2,895 passes / 5
  skips**. Neither Task138-H source nor test is in the failing cohort; the three
  additional passes over the prior candidate are exactly the new canonical
  fixture guard and two parser-rejection tests.
- Repository mode remains pending until this atomic GREEN commit provides its
  required clean checkout. This repair adds no ontology/schema, event filter,
  writer, provider, credential, registry, path, fallback, witness, executable
  effect, approval consumption, integration, strict record 28, or release.
