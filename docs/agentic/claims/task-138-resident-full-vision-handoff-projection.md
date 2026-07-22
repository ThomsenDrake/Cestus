# Task138-H Claim: Mounted Resident Handoff Projection

- **Status:** non-HTTP authority and relative-path GREEN checkpoint
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

`RV-1-E-889` and the coordinator authorize this bounded implementation.
Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.
Required
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

## Exact Parser Clean Admission

- Atomic GREEN commit
  `7c49d0d7af1f87c7451444d76826418c6d13dc4f` descends without rewrite from
  causal RED commit `ba406d57102c110599a401faa0b5479b72745bdc`
  and exact forward-merged repair base
  `c70ec3fa1046ac2585d88efc82833b007b29c6ea`.
- From the clean GREEN checkout, repository mode executed every one of the
  **27 released commands**, emitted exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exited `1`
  only with `repository release closure incomplete: expected 29 records,
  found 27`. This is the required strict-prefix success at the unfinished
  frontier; Task138-H remains unreleased record 28.
- Exact repair-base scope contains only the three frozen Task138-H paths;
  ancestry and diff hygiene pass. Dependencies are real and local: Node
  `v26.1.0`, Vitest `4.1.9`, and neither `node_modules` nor
  `node_modules/vitest` is a symlink. The checkout was clean before repository
  mode and before this claim-only admission update.
- This admission adds no provider, credential, network, external system,
  fallback write, destructive history action, registry mutation, integration,
  approval, strict record 28, or release. The frontier remains **27 of 29**.

## Provenance Event-ID Causal RED

- `RV-1-E-899` returns Task138-H to `implementing` from exact clean
  forward-merged base `7283b79952790f1d0507c1490150d5b122a29dbe` and
  authorizes a fourth bounded repair without changing production source first.
- One table now covers all five browser provenance event-ID fields:
  `finalOutputEventId`, `preparedEventId`, `recordedEventId`,
  `terminalRunEventId`, and `taskStatusEventId`. Every row builds a complete
  seven-event V2 ready-for-review chain, propagates its syntax-valid but
  `isAgentSecretSafeText`-unsafe event ID through every manifest, payload, and
  causation binding, and proves all seven events pass `validateKnowledgeEvent`.
  The required result closes the whole DTO with no provenance, artifacts,
  source/related IDs, approvals, unsafe ID retention, writes, or executable
  actions; mounted reads remain permitted.
- Exact causal command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 5 failed / 35 passed**. All five rows return
  `task-completed` instead of `inconsistent`, proving each unsafe event ID is
  copied into otherwise valid browser provenance. Every prior focused test
  remains green, production source is unchanged, and no registry,
  ontology/schema/parser, provider, credential, external system, fallback
  write, or unrelated verifier participates.

## Provenance Event-ID Minimal GREEN

- `provenanceFromReadback` now returns no provenance unless all five exact
  event-ID bindings satisfy `isAgentSecretSafeText`. The existing caller closes
  the entire DTO when a selected readback cannot emit provenance and now
  distinguishes a same-authority unsafe binding as `secret-safety-rejection`
  from a genuine authority mismatch as `mount-authority-stale`. No provenance
  field is silently omitted or truncated.
- The change leaves `finalOutputStepId`, hashes, released parsers and schemas,
  source/related and diagnostic filters, lifecycle classification, replay
  authority, mounted reads, and all existing assertions unchanged. Every
  rejected result retains only safe run/task identity, empty replay data, and
  an `effect: "none"` repair action; both stores remain read-only.
- Exact focused validation passes **1 file / 40 tests** and exact cross-boundary
  validation passes **2 files / 76 tests**. Standalone `npm run typecheck`
  emits `typecheck passed`; `npm run factory:check` emits
  `factory-readiness passed`; V4 assurance passes **20/20**; and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers. Diff hygiene passes.
- Full `npm run verify` completes typecheck and reports only the inherited
  aggregate cohort: **10 failing files / 47 failing tests / 2,901 passes / 5
  skips**. Neither Task138-H source nor test fails. Relative to the prior
  48-failure run, the five provenance rows account for five additional passes
  and one unrelated prerequisite timeout did not reproduce.
- Repository mode remains pending until this atomic GREEN commit provides its
  required clean checkout. This repair adds no registry, ontology/schema,
  parser, broad sanitizer, writer, provider, credential, external system,
  fallback, executable effect, integration, strict record 28, or release.

## Provenance Event-ID Clean Admission

- Atomic GREEN commit
  `dc7bd9a124a9d07895f963dbb783ed0229acd6bd` descends without rewrite from
  causal RED commit `a2bbf0ff82a5a98eefa2f920e9a65a13da53dd3c`
  and exact forward-merged repair base
  `7283b79952790f1d0507c1490150d5b122a29dbe`.
- From the clean GREEN checkout, repository mode executed every one of the
  **27 released commands**, emitted exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exited `1`
  only with `repository release closure incomplete: expected 29 records,
  found 27`. This is the required strict-prefix success at the unfinished
  frontier; Task138-H remains unreleased record 28.
- Exact repair-base scope contains only the three frozen Task138-H paths;
  ancestry and diff hygiene pass. Dependencies are real and local: Node
  `v26.1.0`, Vitest `4.1.9`, and neither `node_modules` nor
  `node_modules/vitest` is a symlink. The checkout was clean before repository
  mode and before this claim-only admission update.
- This admission adds no registry, ontology/schema/parser, provider,
  credential, network, external system, fallback write, destructive history,
  integration, approval, strict record 28, or release. The frontier remains
  **27 of 29**.

## Final Browser-String Firewall Causal RED

- `RV-1-E-901` returns Task138-H to `implementing` from exact clean
  forward-merged base `e87cb4810ccc6866af336ac0902b7c7d0975f00a` and
  authorizes this final bounded repair without changing production source
  first. The pre-change focused baseline passes **1 file / 40 tests**.
- One canonical seven-event task-completed chain now carries a parser-valid
  `finalOutputStepId` that fails the stronger `isAgentSecretSafeText`
  predicate. Six further canonical mounted chains carry path-bearing values in
  the emitted handoff `safeSummary`, artifact `artifactId`, `artifactKind`,
  `schemaId`, artifact `safeSummary`, and next-safe-action label. The path rows
  span accepted absolute Unix, Windows-drive, and UNC forms. The existing
  material owner rejects `file://` before projection, so no false
  otherwise-accepted file-URI chain is claimed; the authorized output
  predicate must nevertheless reject that form.
- Every row requires whole-DTO `secret-safety-rejection`, no provenance,
  artifacts, source/related IDs, approvals, unsafe-value retention, writes, or
  executable action. Mounted reads remain permitted and prove the defect lies
  after canonical readback rather than at input normalization or storage.
- Exact causal command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 7 failed / 40 passed**. Every new row reaches
  `task-completed` and fails only at the required closed lifecycle assertion,
  proving the browser DTO retains the stronger-secret or path-bearing leaf
  after a canonical readback. Production source remains unchanged.

## Final Browser-String Firewall Minimal GREEN

- `buildResidentHandoffDto` now applies one final recursive string-leaf
  firewall to every DTO returned by the normalized internal projection. Each
  emitted string must satisfy the existing `isAgentSecretSafeText` predicate
  and must not contain an absolute Unix, Windows-drive, UNC, or `file://`
  path. Any violation replaces the entire result with the fixed-safe
  `closedDto(normalized.identity, "inconsistent",
  "secret-safety-rejection")`; no value is sanitized, truncated, partially
  emitted, or fed recursively through projection.
- Exact focused validation passes **1 file / 47 tests** and exact
  cross-boundary validation passes **2 files / 83 tests**. Standalone
  `npm run typecheck` emits `typecheck passed`; `npm run factory:check` emits
  `factory-readiness passed`; V4 assurance passes **20/20**; and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers. Diff hygiene passes.
- Full `npm run verify` completes typecheck and reports only the inherited
  aggregate cohort: **10 failing files / 47 failing tests / 2,908 passes / 5
  skips**. Neither Task138-H source nor test fails. The seven-pass increase
  from the prior 2,901-pass run is exactly the new browser-firewall coverage.
- Existing per-field predicates, released parsers and schemas, hashes,
  lifecycle classification, replay authority, evidence filters, assertions,
  mounted reads, and fixed closed DTOs remain unchanged. Both mounted stores
  remain read-only; no registry, ontology/schema/parser, provider, credential,
  external-system, fallback-write, or executable-effect authority is added.

## Final Browser-String Firewall Clean Admission

- Atomic GREEN commit
  `33be6a197efd0a74ac63286934d215780f019caa` descends without rewrite from
  causal RED commit `ebaa23567a7e804816eae9ecce72edd5c4e4f670`
  and exact forward-merged repair base
  `e87cb4810ccc6866af336ac0902b7c7d0975f00a`.
- From the clean GREEN checkout, repository mode executed every one of the
  **27 released commands**, emitted exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exited `1`
  only with `repository release closure incomplete: expected 29 records,
  found 27`. This is the required strict-prefix success at the unfinished
  frontier; Task138-H remains unreleased record 28.
- Exact repair-base scope contains only the three frozen Task138-H paths;
  ancestry and diff hygiene pass. Dependencies are real and local: Node
  `v26.1.0`, Vitest `4.1.9`, and neither `node_modules` nor
  `node_modules/vitest` is a symlink. The checkout was clean before repository
  mode and before this claim-only admission update.
- This admission adds no registry, ontology/schema/parser, provider,
  credential, network, external system, fallback write, destructive history,
  integration, approval, strict record 28, or release. The frontier remains
  **27 of 29**.

## Punctuation-Boundary Causal RED

- `RV-1-E-902` authorizes this bounded repair from exact authority merge
  `9c1a20eb81bfe7e9d0cd68cc055f0985c6611111`, whose first parent is rejected
  candidate `3824f9d071ae6ff4e948f7f045883e971df27435`. The complete prior lineage
  remains intact and the initial worktree was clean.
- One table crosses all **3** required native absolute-path families with all
  **4** required punctuation boundaries, producing **12** causal cases. A
  second table adds **3** passing controls for valid HTTP, valid HTTPS, and
  mixed ordinary punctuation with non-absolute slash, colon, and backslash
  text.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 12 failed / 50 passed / 62 total**. Exactly
  the 12 path rows return `task-completed` instead of the required whole-DTO
  `inconsistent` closure. All **47** prior tests and all **3** new safe controls
  pass, so the failure is confined to the omitted punctuation boundary in the
  final absolute-path predicate.
- Production source is unchanged for RED. Mounted reads remain read-only, all
  existing no-write and `effect: "none"` assertions remain intact, and no
  registry, assurance, contract, parser, provider, credential, external
  system, fallback write, integration, strict record 28, or release action
  participates.

## Punctuation-Boundary Minimal GREEN

- Permanent causal RED commit `601b8e13` retains the **12** failing
  path-family/punctuation rows and **3** passing controls without changing
  production source. The GREEN child changes only `containsAbsolutePath` in
  the final recursive browser-string firewall.
- The three existing native-path patterns now recognize `=`, `:`, `[`, and
  `,` as path-start boundaries in addition to their prior boundaries. The Unix
  pattern excludes a doubled slash at that boundary so valid HTTP and HTTPS
  scheme separators remain accepted; the existing explicit `file://`
  rejection remains unchanged. No sanitizer, parser, schema, DTO field,
  lifecycle, provenance, mounted-read, diagnostic, no-effect, or whole-DTO
  closure logic changes.
- The exact focused command passes **1 file / 62 tests**. The exact
  cross-boundary command passes **2 files / 98 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- Rejected candidate `3824f9d0` and causal RED `601b8e13` remain ancestors.
  The cumulative repair uses exactly the frozen Task138-H source, test, and
  claim paths. Both mounted stores remain read-only, all next actions retain
  `effect: "none"`, and no registry, assurance, contract, provider,
  credential, external system, fallback write, integration, strict record 28,
  or release action occurs. Coordinator-owned comprehensive V4, repository
  prefix, full differential, admission, and fresh review gates remain pending.

## Punctuation-Safe Clean Admission

- Atomic GREEN commit
  `96f1ac6cbfc1b78e0601d59fa5f2c9c561beb616` descends without rewrite from
  causal RED commit `601b8e134cf453e6bdbeda3e8793204fb2aa0c6a`
  and authority merge `9c1a20eb81bfe7e9d0cd68cc055f0985c6611111`.
  Rejected candidate `3824f9d071ae6ff4e948f7f045883e971df27435`
  remains an ancestor rather than being amended or reconstructed.
- Fresh coordinator validation passes the exact focused suite **62/62**, exact
  cross-boundary suite **98/98**, standalone typecheck, factory readiness, and
  diff hygiene. V4 standalone assurance passes **20/20** and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers.
- From the clean GREEN checkout, repository mode executes every one of the
  **27 released commands**, emits exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and then exits `1`
  only with `repository release closure incomplete: expected 29 records,
  found 27`. This is strict-prefix success at the unfinished frontier rather
  than a candidate failure.
- Serial full-verification differential runs reproduce the exact same inherited
  cohort on candidate and clean `neo`: **10 failing files / 48 failing tests /
  5 skips**. The candidate has **2,922 passes** versus `neo`'s **2,877**;
  the exact **45-pass** increase is the expanded Task138-H focused suite, while
  every failing file and test name is identical and excludes all three owned
  paths.
- Exact cumulative scope is the frozen three Task138-H paths. Dependencies are
  real and local: Node `v26.1.0`, Vitest `4.1.9`, neither `node_modules` nor
  `node_modules/vitest` is a symlink, and the V4 contract hash matches its
  mission-pinned SHA-256. Scope, ancestry, dependency, and clean-state checks
  pass before this claim-only admission transition.
- This admission is not approval, integration, strict record 28, or release.
  The frontier remains **27 of 29**, and only a completely fresh independent
  architecture/executability review pair may approve the exact admitted
  candidate.

## Doubled-Slash Path Causal RED

- `RV-1-E-904` authorizes this bounded repair from exact clean authority merge
  `0ca7e5844b06e3dcbc7de5b1e1a2ef500a10172e`, whose parents are rejected
  candidate `b67863610af72d9b9d6e9b2212ccd8454c1fa893` and program authority
  `72dc9525d530c7bf1c0f46049728fd7d9a1bebb7`. The complete prior lineage
  remains intact.
- One table crosses doubled-slash POSIX and forward-slash UNC absolute forms
  with all **4** required punctuation boundaries, producing **8** causal
  cases. Each row first passes the corresponding Node `posix` or `win32`
  absolute-path owner, then reaches the canonical mounted browser projection.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 8 failed / 62 passed / 70 total**. Exactly
  the 8 new rows return `task-completed` instead of the required whole-DTO
  `inconsistent` closure. All prior **62** tests pass, including the prior
  12-row native punctuation matrix and safe HTTP, HTTPS, and ordinary
  punctuation controls.
- Production source is unchanged for RED. Explicit `file://` rejection,
  mounted read-only behavior, no-write assertions, and `effect: "none"` remain
  intact. No registry, assurance, contract, parser, provider, credential,
  external system, fallback write, integration, strict record 28, or release
  action participates.

## Doubled-Slash Path Minimal GREEN

- Permanent causal RED commit
  `e4abe453761c298df098d8011e257b27fd4a8f7d` retains all **8** failing
  doubled-slash rows and all **62** prior passing cases without changing
  production source.
- GREEN changes one line only in `containsAbsolutePath`: it removes the blanket
  doubled-slash exemption and exempts a slash only when its consumed boundary
  is preceded by an actual case-insensitive `http:` or `https:` scheme. The
  existing punctuation boundaries, Windows-drive and backslash-UNC patterns,
  and explicit `file://` rejection remain unchanged.
- The exact focused command passes **1 file / 70 tests**. The exact
  cross-boundary command passes **2 files / 106 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- Rejected candidate `b6786361`, authority merge `0ca7e584`, program authority
  `72dc9525`, and causal RED `e4abe453` remain ancestors. The cumulative repair
  uses exactly the frozen Task138-H source, test, and claim paths. Both mounted
  stores remain read-only, all next actions retain `effect: "none"`, and no
  registry, assurance, contract, provider, credential, external system,
  fallback write, integration, strict record 28, or release action occurs.
  Coordinator-owned V4, repository, full-differential, admission, and fresh
  review gates remain pending.

## Actual HTTP-Scheme Boundary Causal RED

- `RV-1-E-905` authorizes this bounded repair from exact clean authority merge
  `61daa81b82145971192154a5837e5c8c0fa8765e`, whose parents are GREEN
  checkpoint `681a7ac5a1bfca1513d40e41234981c29bdb6722` and program authority
  `70b5b888b51eaaced8cc52d37123f4bfe47dfdf2`. The complete prior lineage
  remains intact.
- Two causal rows cover an embedded HTTP-like doubled-slash POSIX path and a
  false HTTPS-like forward-slash UNC path. Each row proves the retained
  `//...` substring absolute through the corresponding Node `posix` or
  `win32` owner before reaching the canonical mounted browser projection.
  Four passing controls cover mixed-case HTTP and HTTPS schemes at both string
  and punctuation boundaries and prove their exact URL substrings with the
  released Node URL parser.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 2 failed / 74 passed / 76 total**. Exactly
  the two false/embedded-prefix rows return `task-completed` instead of the
  required whole-DTO `inconsistent` closure. All prior **70** tests and all
  four new actual-scheme controls pass.
- Production source is unchanged for RED. Explicit `file://` rejection,
  mounted read-only behavior, no-write assertions, and `effect: "none"` remain
  intact. No registry, assurance, contract, parser, provider, credential,
  external system, fallback write, integration, strict record 28, or release
  action participates.

## Actual HTTP-Scheme Boundary Minimal GREEN

- Permanent causal RED commit
  `f6148f58350d43cffd0b70516c03e9afffa9cd12` retains both false/embedded
  prefix failures and all **74** passing prior/control cases without changing
  production source.
- GREEN changes one line only in `containsAbsolutePath`, adding a word-token
  boundary to each existing case-insensitive `http:` and `https:` lookbehind.
  Genuine schemes at string or punctuation boundaries remain exempt, while
  `xHTTP:` and `_https:` suffixes no longer exempt their absolute `//...`
  substring. Every other path branch and the explicit `file://` rejection are
  unchanged.
- The exact focused command passes **1 file / 76 tests**. The exact
  cross-boundary command passes **2 files / 112 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- GREEN checkpoint `681a7ac5`, program authority `70b5b888`, authority merge
  `61daa81b`, and causal RED `f6148f58` remain ancestors. The cumulative repair
  uses exactly the frozen Task138-H source, test, and claim paths. Both mounted
  stores remain read-only, all next actions retain `effect: "none"`, and no
  registry, assurance, contract, provider, credential, external system,
  fallback write, integration, strict record 28, or release action occurs.
  Coordinator-owned V4, repository, full-differential, admission, and fresh
  review gates remain pending.

## Actual-Scheme-Safe Clean Admission

- Atomic GREEN checkpoint
  `843ea52afb9f7c73b64209753229ddee559abfc5` descends without rewrite from
  causal RED `f6148f58350d43cffd0b70516c03e9afffa9cd12`, exact authority merge
  `61daa81b82145971192154a5837e5c8c0fa8765e`, and prior rejected candidate
  `b67863610af72d9b9d6e9b2212ccd8454c1fa893`. Every earlier authority,
  rejected candidate, RED/GREEN, and review verdict remains in ancestry.
- Fresh coordinator validation passes the exact focused suite **76/76**, exact
  cross-boundary suite **112/112**, standalone typecheck, factory readiness,
  and diff hygiene. V4 standalone assurance passes **20/20** and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers.
- From the clean GREEN checkout, repository mode executes every one of the
  **27 released commands**, emits exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and exits `1` only
  with `repository release closure incomplete: expected 29 records, found
  27`. This is the required strict-prefix success at the unfinished frontier.
- Serial full-verification differential runs report candidate **10 failing
  files / 47 failing tests / 2,937 passes / 5 skips** and clean `neo` **10
  failing files / 48 failing tests / 2,877 passes / 5 skips**. The candidate
  failure set is an exact strict subset of the baseline set and excludes all
  Task138-H paths. The sole baseline-only prerequisite test passes **1/1** in
  isolated runs on both trees, classifying its full-suite absence as inherited
  timeout variance; the remaining **59** additional candidate tests are the
  expanded Task138-H focused suite.
- Cumulative repair scope is exactly the frozen three Task138-H paths.
  Dependencies are real and local: Node `v26.1.0`, Vitest `4.1.9`, neither
  `node_modules` nor `node_modules/vitest` is a symlink, and the V4 contract
  hash equals its mission-pinned SHA-256. Scope, ancestry, dependency, and
  clean-state checks pass before this claim-only admission transition.
- This admission is not approval, integration, strict record 28, or release.
  The frontier remains **27 of 29**. Only a completely fresh independent
  architecture/executability review pair may approve the exact admitted
  candidate; both reviewers of `b6786361` are excluded from changed-byte
  approval.

## Explicit URI-Scheme Token Causal RED

- `RV-1-E-907` and corrective ratification `RV-1-E-908` authorize this bounded
  repair from exact clean authority merge
  `549cf45e95a713fee3dcd3b271d4a21a46ad7f72`, whose parents are rejected
  candidate `9adc07c1ce695bd144755b27ae26384e46bc513f` and current program
  authority `d513298d4d69803c31a934c1c52342e07efc6e95`. Every earlier authority,
  candidate, review verdict, RED/GREEN commit, and admission remains intact.
- Six causal rows cross valid non-HTTP schemes ending in `-http`, `.http`, and
  `+https` with doubled-slash POSIX and forward-slash UNC representatives. A
  seventh row covers a non-ASCII adjacent HTTP-like prefix. Every row proves
  the retained `//...` suffix absolute through Node's matching `posix` or
  `win32` owner. The six URL-valid rows also prove their parsed protocols are
  exactly `x-http:`, `x.http:`, or `x+https:` and never HTTP(S); the non-ASCII
  prefix is proven not to parse as a URL.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 7 failed / 76 passed / 83 total**. Exactly
  the seven new rows return `task-completed` instead of the required whole-DTO
  `inconsistent` closure. All prior **76** tests remain green, including the
  genuine case-insensitive HTTP/HTTPS controls at string start and the already
  authorized punctuation boundaries.
- Production source is unchanged for RED. Every new row uses parser-valid
  mounted material and manifest fixtures, permits only exact role-bound reads,
  forbids writes, requires no unsafe output retention, and preserves
  `effect: "none"`. Explicit `file://`, ordinary punctuation, lifecycle,
  provenance, replay, diagnostics, and whole-DTO closure assertions remain
  intact. No registry, V4, contract, shared source, provider, credential,
  network, external system, fallback write, admission, review, integration,
  strict record 28, or release action participates.

## Explicit URI-Scheme Token Minimal GREEN

- Permanent causal RED commit
  `4a47ca4b1d5dcdf3d83fc5510a29a3ee34454bd0` retains all **7** failures and
  all **76** prior passing cases without changing production source.
- GREEN changes one line only in `containsAbsolutePath`: the existing
  case-insensitive HTTP and HTTPS negative lookbehinds now require their scheme
  token to begin at string start or after the same explicit safe delimiter
  class already owned by the native-path predicate. The generic JavaScript
  word boundary is removed, so `-`, `.`, `+`, and non-ASCII adjacency cannot
  manufacture an HTTP(S) exemption. Every other native-path branch and the
  explicit `file://` rejection remain byte-for-byte unchanged.
- The exact focused command passes **1 file / 83 tests**. The exact
  cross-boundary command passes **2 files / 119 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- Rejected candidate `9adc07c1`, program authority `d513298d`, authority merge
  `549cf45e`, and causal RED `4a47ca4b` remain ancestors. The cumulative repair
  uses exactly the frozen Task138-H source, test, and claim paths. Both mounted
  stores remain read-only, all next actions retain `effect: "none"`, and no
  registry, V4, contract, shared source, package metadata, provider,
  credential, network, external system, fallback write, admission, review,
  integration, strict record 28, or release action occurs. Coordinator-owned
  V4, repository, full-differential, admission, and fresh review gates remain
  pending.

## Explicit-Token Clean Admission

- Atomic GREEN checkpoint
  `d2b73dc7314ed4ca73e827e86c867e2057e38ed0` descends without rewrite from
  causal RED `4a47ca4b1d5dcdf3d83fc5510a29a3ee34454bd0`, exact authority merge
  `549cf45e95a713fee3dcd3b271d4a21a46ad7f72`, and rejected candidate
  `9adc07c1ce695bd144755b27ae26384e46bc513f`. Every prior authority,
  candidate, RED/GREEN commit, and review verdict remains in ancestry.
- Fresh coordinator validation passes the exact focused suite **83/83**, exact
  cross-boundary suite **119/119**, standalone typecheck, factory readiness,
  and diff hygiene. V4 standalone assurance passes **20/20** and contract mode
  emits all four exact release-graph, composition-corpus, command-card, and
  ABI-corpus markers.
- From the clean GREEN checkout, repository mode executes every one of the
  **27 released commands**, emits exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and exits `1` only
  with `repository release closure incomplete: expected 29 records, found
  27`. This is strict-prefix success at the unfinished frontier.
- Fresh serial full-verification differential runs reproduce the exact same
  inherited cohort on candidate and clean `neo`: **10 failing files / 48
  failing tests / 5 skips**. The candidate has **2,943 passes** versus
  `neo`'s **2,877**; the exact **66-pass** increase is the expanded Task138-H
  focused suite, and neither owned source nor test appears in the failure set.
- Exact cumulative scope is the frozen three Task138-H paths. Dependencies are
  real and local: Node `v26.1.0`, Vitest `4.1.9`, neither `node_modules` nor
  `node_modules/vitest` is a symlink, and the V4 contract SHA-256 equals its
  mission pin. Scope, ancestry, dependency, and clean-state checks pass before
  this claim-only admission transition.
- This admission is not approval, integration, strict record 28, or release.
  Strict frontier remains **27 of 29**. Only a completely fresh independent
  architecture/executability review pair may approve the exact admitted
  candidate; every reviewer of `b6786361` and `9adc07c1` is excluded from
  changed-byte approval.

## Generalized Boundary And Outer-Scheme Causal RED

- `RV-1-E-910` authorizes this bounded repair from exact clean authority merge
  `b62074e924006d3d5705f797f15b4db6704e8b7a`, whose parents are rejected
  candidate `fbaec143263920f965322cbb973950a38a0f3713` and current program
  authority `2eb5502868d55e1093d25296d3f5f733b61fd581`. Every prior authority,
  candidate, review verdict, RED/GREEN commit, and registry correction remains
  intact.
- The causal matrix crosses all **12** omitted punctuation delimiters `)`, `{`,
  `}`, `<`, `>`, `;`, `]`, `!`, `?`, `|`, backtick, and `~` with all **5**
  required absolute-path representatives: single-slash Unix, Windows-drive,
  backslash UNC, doubled-slash POSIX, and forward-slash UNC. All **60** rows
  prove absoluteness through Node's matching `posix` or `win32` path owner and
  require whole-DTO closure.
- A second matrix adds mixed-case HTTP and HTTPS controls after every new
  punctuation delimiter for **24** cases. Each proves the URL substring's
  exact HTTP(S) protocol through Node's URL owner and requires the canonical
  DTO to remain open. Six further canonical cases cross `urn:`, `mailto:`, and
  arbitrary `x:` outer schemes with doubled-slash POSIX and forward-slash UNC
  suffixes, proving a non-HTTP(S) parsed outer protocol, an absolute retained
  suffix, and required whole-DTO closure.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 90 failed / 83 passed / 173 total**. Exactly
  the **60** generalized native-path and **6** nested outer-scheme rows return
  `task-completed` instead of `inconsistent`; exactly the **24** genuine
  HTTP(S) controls return `inconsistent` instead of `task-completed`. All prior
  **83** tests remain green.
- Production source is unchanged for RED. Every new row uses parser-valid
  mounted material and manifest fixtures, exact role-bound reads, zero writes,
  no unsafe partial output, and only `effect: "none"` actions. Existing
  explicit `file://`, ordinary punctuation/ratio/relative-slash, lifecycle,
  provenance, replay, diagnostic, no-effect, and whole-DTO assertions remain
  intact. No registry, V4, contract, shared source, provider, credential,
  network, external system, fallback write, admission, review, integration,
  strict record 28, or release action participates.

## Generalized Boundary And Outer-Scheme Minimal GREEN

- Permanent causal RED commit
  `ab9084a6409da2788d53fd9aeb2434a37acd307d` retains all **90** failures and
  all **83** prior passing cases without changing production source.
- GREEN changes only the three native-path regex branches in
  `containsAbsolutePath`. Native path starts now use a Unicode identifier-aware
  boundary while excluding `/` and `\\` themselves from acting as the
  preceding delimiter. The case-insensitive HTTP/HTTPS exemption starts only
  at string start or after a non-identifier delimiter that is not `_`, `+`,
  `.`, `-`, or `:`, so URI-scheme continuation and termination cannot
  authorize nested HTTP-like text. The explicit `file://` branch is unchanged.
- The first focused GREEN probe closed all **66** unsafe new rows but also
  closed the **24** new and **6** prior genuine HTTP(S) controls, reporting
  **30 failed / 143 passed / 173 total**. The cause was treating the first `/`
  of a genuine URL as a fresh generalized delimiter for its second `/`.
  Excluding both path separators from the preceding-delimiter class corrected
  that same final-predicate boundary without altering tests or any other
  production behavior.
- The exact focused command then passes **1 file / 173 tests**. The exact
  cross-boundary command passes **2 files / 209 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- Rejected candidate `fbaec143`, program authority `2eb55028`, authority merge
  `b62074e9`, and causal RED `ab9084a6` remain ancestors. The cumulative repair
  uses exactly the frozen Task138-H source, test, and claim paths. Both mounted
  stores remain read-only, all next actions retain `effect: "none"`, and no
  sanitizer, parser/schema, per-field predicate, lifecycle, provenance,
  replay, diagnostic, registry, V4, contract, shared source, provider,
  credential, network, external system, fallback write, admission, review,
  integration, strict record 28, or release action changes. Coordinator-owned
  V4, repository, full-differential, admission, and fresh-review gates remain
  pending.

## Nested URI Payload And Separator Causal RED

- `RV-1-E-911` authorizes this bounded repair from exact clean authority merge
  `ca26cc89b34fa200cb339c2a23326d23372d814a`, whose parents are generalized
  GREEN checkpoint `cc21728078df0d8abe76df7913b0bbdc48175acd` and current
  program authority `cf2ac7729c43082890368f3ce02ff4e22c707ab6`. Every prior
  authority, candidate, review verdict, RED/GREEN commit, and registry
  correction remains intact.
- Four causal rows cross slash-prefixed HTTP-like and backslash-prefixed
  HTTPS-like text with doubled-slash POSIX and forward-slash UNC suffixes.
  Each proves the prefix is not a parseable authorized URL token, proves the
  suffix absolute through Node's matching path owner, and requires whole-DTO
  closure.
- Twenty-four further rows cross `urn:`, `mailto:`, and arbitrary `x:` outer
  schemes with inner mixed-case HTTP(S) text after query `?`, fragment `#`,
  assignment `=`, and path payload across both absolute suffix families. Each
  proves its parsed outer protocol is not HTTP(S), proves suffix absoluteness,
  and requires whole-DTO closure. Two matching controls prove genuine outer
  mixed-case HTTP and HTTPS URLs remain open while their query safely carries
  another HTTP(S) URL.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 28 failed / 175 passed / 203 total**.
  Exactly the **4** separator-prefix and **24** non-HTTP outer-scheme rows
  return `task-completed` instead of `inconsistent`. All prior **173** cases
  and both new genuine outer-HTTP(S) controls remain green.
- Production source is unchanged for RED. Every new row uses parser-valid
  canonical material and manifest fixtures, exact mounted reads, zero writes,
  no unsafe partial output, and only `effect: "none"` actions. Existing
  generalized punctuation, ordinary ratio/relative-slash, explicit `file://`,
  lifecycle, provenance, replay, diagnostic, no-effect, and whole-DTO
  assertions remain intact. No registry, V4, contract, shared source,
  provider, credential, network, external system, fallback write, admission,
  review, integration, strict record 28, or release action participates.

## Nested URI Payload And Separator Minimal GREEN

- Permanent causal RED commit
  `136b7d23c079b0d1deae133cde96e95310093508` retains exactly the **28**
  causal failures and all **175** passing cases without changing production
  source.
- GREEN changes only the final `containsAbsolutePath` predicate. Slash and
  backslash no longer act as delimiters that can introduce an exempt HTTP(S)
  token. A same-whitespace-token scan identifies the first URI scheme after
  string start or a safe non-scheme delimiter and closes the DTO when that
  outer scheme is not HTTP(S) but later text contains an inner HTTP(S)-like
  doubled-slash payload. Genuine outer mixed-case HTTP(S) URLs remain open,
  including the two new query-carried inner-URL controls.
- The first standalone typecheck identified only an incomplete TypeScript
  null narrowing for the regular-expression match after its optional capture
  was inspected. An explicit null return preserves the same runtime predicate;
  the focused suite remained **203/203**, and the repeated standalone
  typecheck then emitted `typecheck passed`.
- The exact focused command passes **1 file / 203 tests**. The exact
  cross-boundary command passes **2 files / 239 tests**. `npm run
  factory:check` emits `factory-readiness passed`, and `git diff --check`
  emits no diagnostic.
- Generalized GREEN checkpoint `cc21728078df0d8abe76df7913b0bbdc48175acd`,
  program authority `cf2ac7729c43082890368f3ce02ff4e22c707ab6`, authority
  merge `ca26cc89b34fa200cb339c2a23326d23372d814a`, and permanent causal RED
  `136b7d23c079b0d1deae133cde96e95310093508` remain ancestors. The cumulative
  repair uses exactly the frozen Task138-H source, test, and claim paths. Both
  mounted stores remain read-only, all next actions retain `effect: "none"`,
  and no sanitizer, parser/schema, per-field predicate, lifecycle, provenance,
  replay, diagnostic, registry, V4, contract, shared source, provider,
  credential, network, external system, fallback write, admission, review,
  integration, strict record 28, or release action changes. Coordinator-owned
  V4, repository, full-differential, admission, and fresh-review gates remain
  pending.

## Nested-URI-Safe Clean Admission

- Atomic GREEN checkpoint
  `1f4a6e64bbe1b49adbe2d51582415ebf476f0718` descends without rewrite from
  causal RED `136b7d23c079b0d1deae133cde96e95310093508`, exact authority merge
  `ca26cc89b34fa200cb339c2a23326d23372d814a`, and generalized GREEN checkpoint
  `cc21728078df0d8abe76df7913b0bbdc48175acd`. Every earlier authority,
  rejected candidate, RED/GREEN commit, review verdict, and registry correction
  remains in ancestry.
- Fresh coordinator validation passes the exact focused suite **203/203**,
  exact cross-boundary suite **239/239**, standalone typecheck, factory
  readiness, and diff hygiene. V4 standalone assurance passes **20/20** and
  contract mode emits all four exact release-graph, composition-corpus,
  command-card, and ABI-corpus markers.
- From the clean GREEN checkout, repository mode executes every one of the
  **27 released commands**, emits exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and exits `1` only
  with `repository release closure incomplete: expected 29 records, found
  27`. This is strict-prefix success at the unfinished frontier.
- Fresh serial full-verification differential reports candidate **10 failing
  files / 47 failing tests / 3,064 passes / 5 skips** and clean `neo` **10
  failing files / 48 failing tests / 2,877 passes / 5 skips**. Candidate
  failures are an exact strict subset and exclude all Task138-H paths. The sole
  baseline-only prerequisite timeout passes **1/1** in isolated runs on both
  trees, classifying the difference as inherited load variance; the remaining
  **186** additional candidate tests are the expanded Task138-H focused suite.
- Exact cumulative scope is the frozen three Task138-H paths. Dependencies are
  real and local: Node `v26.1.0`, Vitest `4.1.9`, neither `node_modules` nor
  `node_modules/vitest` is a symlink, and the V4 contract SHA-256 equals its
  mission pin. Scope, ancestry, dependency, and clean-state checks pass before
  this claim-only admission transition.
- This admission is not approval, integration, strict record 28, or release.
  Strict frontier remains **27 of 29**. Only a completely fresh independent
  architecture/executability pair may approve the exact admitted candidate;
  all reviewers of earlier candidates are excluded from changed-byte approval.

## Compositional URL And Windows-Root Causal RED

- `RV-1-E-913` authorizes this bounded repair from exact clean authority merge
  `f03e446426d5f68f0e65cac344170a603da398f8`, whose parents are rejected
  candidate `df461e730557bbdbd92d4079ed6f4f0628282c8b` and current program
  authority `6e4b2089c6b3818282c658745b1d24c2221ae1ea`. Both fresh rejecting
  verdicts, every prior authority, candidate, RED/GREEN commit, and registry
  correction remain intact.
- Two causal rows use the reviewers' exact pipe and query literals where a
  leading genuine HTTP(S) URL and a later non-HTTP `urn:` outer URI occur in
  one non-whitespace token. Each proves the leading protocol is HTTP(S), the
  nested protocol is `urn:`, the retained doubled-slash POSIX suffix is
  absolute, and the whole DTO must close.
- Five Windows rows cover rooted single-backslash paths
  `\Windows\System32\config` and `\root\private.json`, plus host-only UNC
  roots `\\cestus-host`, `\\host`, and `\\host\`. Every literal is proven
  absolute through Node's `win32` path owner and requires whole-DTO closure.
- Four complete outer-HTTP(S) URL controls cover an inner HTTP(S) URL in path,
  query, and fragment positions plus the reviewer's exact safe-punctuation
  path. A whitespace-separated scheme-mask control remains closed, while an
  ordinary punctuation, ratio, relative-slash, and relative-backslash control
  remains open.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 9 failed / 207 passed / 216 total**.
  Exactly the **2** same-token masks and **5** Windows-root rows remain open,
  while exactly the **2** valid outer-HTTPS path controls close incorrectly.
  All prior **203** cases and the four other new controls remain green.
- Production source is unchanged for RED. Every new row uses parser-valid
  canonical material and manifest fixtures, exact mounted reads, zero writes,
  no unsafe partial output, and only `effect: "none"` actions. Existing
  generalized punctuation, explicit `file://`, lifecycle, provenance, replay,
  diagnostic, no-effect, and whole-DTO assertions remain intact. No registry,
  V4, contract, shared source, package metadata, provider, credential, network,
  external system, fallback write, admission, review, integration, strict
  record 28, or release action participates.

## Compositional URL And Windows-Root Minimal GREEN

- Permanent causal RED commit
  `80d004eb116cde2c72c751ef86aaf4afe344d6a7` retains exactly the **9**
  causal failures and all **207** passing cases without changing production
  source or weakening any test.
- GREEN changes only `containsAbsolutePath`. The same-token scheme scan now
  inspects every relevant scheme occurrence, so a leading HTTP(S) scheme can no
  longer mask a later non-HTTP outer scheme carrying an HTTP-like absolute
  doubled-slash payload. Native-path checks exclude only the suffix of a
  safely delimited HTTP(S) occurrence that parses as a complete HTTP(S) URL;
  this preserves safe path punctuation and inner HTTP(S) URLs in outer URL
  path, query, and fragment positions without exempting slash/backslash
  pseudo-prefixes.
- A bounded single-backslash-root branch closes rooted Windows paths without
  treating relative `a\b` text as absolute. The UNC branch now accepts a
  host-only root, an optional trailing separator, or the already covered
  host/share form. Drive, POSIX, doubled-slash, explicit `file://`, and
  generalized boundary behavior remain in the same final predicate.
- The first focused GREEN attempt passes **1 file / 216 tests** without any
  post-RED test change. The exact cross-boundary command passes **2 files / 252
  tests**. Standalone `npm run typecheck` emits `typecheck passed`, `npm run
  factory:check` emits `factory-readiness passed`, and `git diff --check`
  emits no diagnostic.
- Rejected candidate `df461e730557bbdbd92d4079ed6f4f0628282c8b`, program
  authority `6e4b2089c6b3818282c658745b1d24c2221ae1ea`, authority merge
  `f03e446426d5f68f0e65cac344170a603da398f8`, and permanent causal RED
  `80d004eb116cde2c72c751ef86aaf4afe344d6a7` remain ancestors. Dependencies
  are real and local at Node `v26.1.0` and Vitest `4.1.9`, with neither
  `node_modules` nor `node_modules/vitest` a symlink. The cumulative repair
  uses exactly the frozen Task138-H source, test, and claim paths.
- Both mounted stores remain read-only, all next actions retain
  `effect: "none"`, and no sanitizer, parser/schema, per-field predicate,
  lifecycle,
  provenance, replay, mounted-read, diagnostic, registry, V4, contract,
  shared source, package metadata, provider, credential, network, external
  system, fallback write, admission, review, integration, strict record 28,
  or release action changes. Coordinator-owned admission and fresh-review
  gates remain pending.

## Compositional Path Clean Admission

- Atomic GREEN checkpoint
  `14c8722bd91eac78bd6341fa0bb403c9c743f93d` descends without rewrite from
  permanent causal RED `80d004eb116cde2c72c751ef86aaf4afe344d6a7`, exact
  authority merge `f03e446426d5f68f0e65cac344170a603da398f8`, rejected
  candidate `df461e730557bbdbd92d4079ed6f4f0628282c8b`, and all prior
  Task138-H history.
- Fresh coordinator validation passes the exact focused suite **216/216**,
  exact cross-boundary suite **252/252**, standalone typecheck, factory
  readiness, and diff hygiene. V4 standalone assurance passes **20/20** and
  contract mode emits all four exact release-graph, composition-corpus,
  command-card, and ABI-corpus markers.
- From the clean GREEN checkout, repository mode executes every one of the
  **27 released commands**, emits exact marker
  `TASK136_REPOSITORY_PREFIX_OK records=27 commands=27`, and exits `1` only
  with `repository release closure incomplete: expected 29 records, found
  27`. This is strict-prefix success at the unfinished frontier.
- Fresh serial full-verification differential reports candidate **10 failing
  files / 48 failing tests / 3,076 passes / 5 skips** and clean `neo` **10
  failing files / 48 failing tests / 2,877 passes / 5 skips**. The failure
  files and test names are identical and exclude Task138-H; the exact
  **199-pass** increase is the cumulative Task138-H focused-suite delta.
- Exact implementation scope from authority merge to GREEN is the frozen
  three Task138-H paths. Rejected candidate `df461e73`, authority
  `6e4b2089`, authority merge `f03e4464`, RED `80d004eb`, and every earlier
  authority, rejected candidate, review, RED/GREEN, and registry correction
  remain ancestors. Dependencies are real and local at Node `v26.1.0` and
  Vitest `4.1.9`; neither dependency directory is a symlink, the V4 contract
  SHA-256 remains
  `ec2ff7d4b3aee00e507de0e6c9a468bde4a65c34c115dd17447b7857c49d7354`,
  and both candidate and `neo` remain clean.
- This claim-only transition admits one exact candidate for a completely
  fresh independent architecture/executability pair. It is not approval,
  integration, strict record 28, or release. Strict frontier remains **27 of
  29**; every reviewer of earlier candidate bytes is excluded from approval.

## Non-HTTP Authority And Relative-Path Causal RED

- `RV-1-E-915` authorizes this bounded repair from exact clean authority merge
  `4a32c6991cb480588f6605ce66fc119612f01fe5`, whose parents are rejected
  candidate `0b5eb36e4b5db9e5e36e1d8f6e1a8af59e16ca91` and current program
  authority `1931a9afdb1ab07bb140580f0e56b47d90f8abd8`. Both fresh rejecting
  verdicts, every prior authority, candidate, RED/GREEN commit, and registry
  correction remain intact.
- Six causal composition rows cross path, query, and fragment separators with
  doubled-slash POSIX and forward-slash UNC representatives. They include all
  three exact reviewer literals, prove the complete leading outer URL protocol
  is HTTP(S), prove the later nested protocol is `urn:` or `x:`, prove the
  retained suffix absolute through Node's matching path owner, and require
  whole-DTO closure.
- Six safe controls cover exact `./child/path`, `../child/path`,
  `~/child/path`, `.\child\draft`, `..\child\draft`, and `~\child\draft`
  forms. Each is proven non-absolute through Node's matching `posix` or
  `win32` owner and requires the canonical task-completed DTO to remain open.
- The exact focused command
  `npm test -- packages/local-runtime/test/agent-handoff-projection.test.ts`
  exits `1` with **1 failed file / 12 failed / 216 passed / 228 total**.
  Exactly the **6** later non-HTTP authority compositions remain open and
  exactly the **6** dot/home-relative controls close incorrectly. Every prior
  **216** focused case remains green.
- Production source is unchanged for RED. Every new row uses parser-valid
  canonical material and manifest fixtures, exact mounted reads, zero writes,
  no unsafe partial output, and only `effect: "none"` actions. Existing
  absolute Unix, drive, rooted-Windows, host-only/full UNC, explicit
  `file://`, nested URI, generalized punctuation, lifecycle, provenance,
  replay, diagnostic, no-effect, and whole-DTO assertions remain intact. No
  registry, V4, contract, shared source, package metadata, provider,
  credential, network, external system, fallback write, admission, review,
  integration, strict record 28, or release action participates.

## Non-HTTP Authority And Relative-Path Minimal GREEN

- Permanent causal RED commit
  `f2a821c85bca60d3ac834c82494763a9cdeb1944` retains exactly the **12**
  causal failures and all **216** prior passing cases without changing
  production source or weakening any test.
- GREEN changes only `containsAbsolutePath`. Before complete outer HTTP(S) URL
  context is excluded from native-path checks, the existing all-scheme scan
  now recognizes a non-HTTP scheme whose immediate payload is a
  `//authority` form as unsafe, while retaining the earlier nested-HTTP(S)
  payload detection. This closes later `urn://` and `x://` compositions under
  path, query, and fragment separators across both absolute suffix owners.
- Dot, dot-dot, and home-relative prefixes are removed from native-root
  consideration only when the prefix itself starts at string start or after a
  safe non-path boundary. The first focused GREEN attempt used an unconditional
  tilde/dot lookbehind and therefore reopened exactly **4** prior absolute-path
  rows after `~` punctuation, producing **4 failed / 224 passed / 228 total**.
  Replacing it with the boundary-qualified prefix treatment preserved those
  generalized punctuation rows while leaving all tests unchanged.
- The exact focused command then passes **1 file / 228 tests**. The exact
  cross-boundary command passes **2 files / 264 tests**. Standalone `npm run
  typecheck` emits `typecheck passed`, `npm run factory:check` emits
  `factory-readiness passed`, and `git diff --check` emits no diagnostic.
- Rejected candidate `0b5eb36e4b5db9e5e36e1d8f6e1a8af59e16ca91`, program
  authority `1931a9afdb1ab07bb140580f0e56b47d90f8abd8`, authority merge
  `4a32c6991cb480588f6605ce66fc119612f01fe5`, and permanent causal RED
  `f2a821c85bca60d3ac834c82494763a9cdeb1944` remain ancestors. Dependencies
  are real and local at Node `v26.1.0` and Vitest `4.1.9`, with neither
  dependency directory a symlink. The cumulative repair uses exactly the
  frozen Task138-H source, test, and claim paths.
- Both mounted stores remain read-only, all next actions retain
  `effect: "none"`, and no sanitizer, parser/schema, per-field predicate,
  lifecycle, provenance, replay, mounted-read, diagnostic, registry, V4,
  contract, shared source, package metadata, provider, credential, network,
  external system, fallback write, admission, review, integration, strict
  record 28, or release action changes. Coordinator-owned admission and
  fresh-review gates remain pending.
