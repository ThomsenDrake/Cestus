# Task136 V4 Task137B Authority Transfer Claim

Status: ready-for-review

Plan: `docs/superpowers/plans/2026-07-17-task136-v4-task137b-authority-transfer-implementation.md`
Design: `docs/superpowers/specs/2026-07-17-task136-v4-task137b-authority-transfer-design.md`
Task: Task 1, Freeze And Test The V4 Assurance Contract
Branch: `codex/task136-v4-authority-transfer-implementation`
Worker: Codex, single production writer
Claimed at: `2026-07-17T13:33:02Z`
Worktree: `/home/drake/.codex/worktrees/task136-v4-authority-transfer-implementation/Cestus`

Exact dispatch base: `8e447f93ec85ac8899a83a3859d76d3908915a0d`

Owned files:
- `docs/agentic/contracts/task136-bounded-assurance-v4.json`
- `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- `docs/agentic/claims/task-136-v4-task137b-authority-transfer.md`

Authorization:
- The approved Task136 V4 design and implementation plan explicitly authorize
  this task-scoped subagent-driven development and test-driven development
  sequence.
- This worker is the single production writer. Any reviewer is read-only.
- The user authorization requires the claim commit, causal RED commit, and
  GREEN commit to remain separate; no squash, amend, rebase, or reset is
  permitted.

Immutable inputs:
- `docs/agentic/contracts/task136-bounded-assurance-v1.json` SHA-256:
  `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed`
- `docs/agentic/contracts/task136-bounded-assurance-v2.json` SHA-256:
  `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4`
- `docs/agentic/contracts/task136-bounded-assurance-v3.json` SHA-256:
  `8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb`
- The first ten raw `task136-dispatch-release.v4` fenced JSON records remain
  byte-for-byte immutable under the approved per-card SHA-256 pins.

Bounded scope:
- V4 changes only the hard-coded Task137A and Task129-MFA compatibility
  branches, transfers exactly four approved paths to Task137B-W, and leaves
  the registry unchanged.
- Repository admission must retain the ordered ten-record prefix and fail
  closed with `repository release closure incomplete: expected 29 records,
  found 10` until record 11 exists.
- No network, providers, credentials, external services, `neo`, push,
  registry edit, or full `npm run verify` is permitted.

Implementation evidence:
- Causal RED: `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
  ran 15 tests; 13 failed solely while opening the absent
  `docs/agentic/contracts/task136-bounded-assurance-v4.json` contract and the
  two V3-only corpus guards passed.
- GREEN: the identical command passed 15/15 tests. It covers the V4 schema,
  graph, compatibility branches, 14-path Task137B-W ceiling, four direct
  prerequisites, seven-suite command, V1/V2/V3 and raw prefix pins, finite
  graph and compatibility mutations, source-head migration before record 11,
  and candidate/integration/current-head blob failures.
- V4 pretty JSON SHA-256:
  `bb02ba569157f9c57205e423040e3eb6e8cc7b2c95ed0ef968fd4c9afefc6e9e`.
- Contract mode emitted exactly once each:
  `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`.
- Pre-commit bounded checks: `git diff --check` and `npm run factory:check`
  passed. Full verification was not run by approval.

## RV-1-E-764 record-18 fixture checkpoint

- Resumed on `codex/task136-v4-task139-pm-direct-source-ownership` at the
  clean forward-merged record-18 authority
  `41ae93ab764cedd72bf22c8f8291e9860c197b5a`.
- This claim-only causal RED preserves every inherited assurance RED/GREEN,
  contract/checker byte, V1-V3 pin, raw release record, card order, and
  release-evidence byte. The only authorized GREEN will update two stale test
  fixture cardinality assertions from `17` to `18`.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `19` tests, `17` passed, and exactly two failed. Both are
  direct parsed-prefix assertions: line `1112` and line `1428` report
  `18 !== 17` now that strict Task139-PM record 18 is valid. No contract,
  checker, blob, command, dependency, or unrelated fixture failure occurred.
- Exact next GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`; it
  may not alter the historical raw-prefix checks, source-currentness,
  Task139-PM finite-transfer, Git/blob/review/release, or repository-closure
  coverage. No registry, integration, push, network, credential, provider,
  `neo`, review, or task creation is authorized.

## RV-1-E-764 minimal GREEN evidence

- The fixture now recognizes the actual strict record-18 prefix in both
  parsed-prefix projections (`length` and exact ordered IDs) and in the
  repository-admission marker/closure count (`records=18 commands=18`, then
  `expected 29 records, found 18`).
- The record-18 source-currentness proof is preserved by making its existing
  before-activation fixture explicit: it uses only records 1-17, still rejects
  stale Task137B-W source HEAD paths, then appends the synthetic Task139-PM
  record 18 and rejects stale Task139-PM target HEAD paths. This is the same
  historical/current ownership boundary, not a weakened assertion.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited
  `0`: `19` passed, `0` failed. Contract and checker SHA-256 values remain
  `2a5cf62b1fb02d47aa01329b485c76f399585802f26669cce977b66e5bd7f86b`
  and `7199f315245cb986975ec3a8801526075e39cb27eed01f3cc816e9311b63715e`
  respectively; V1-V3 and raw release evidence are unchanged.

## RV-1-E-770 record-19 fixture checkpoint

- Resumed on `codex/task136-v4-task139-pm-direct-source-ownership` at the
  clean forward-merged record-19 authority
  `eb2889773d24a9c9e865ff65f43a4ba24f4ab155`. This claim-only checkpoint
  preserves the inherited claim/RED/GREEN history and leaves the assurance
  test, contract, checker, V1-V3, raw strict records 1-19, all 29 card IDs and
  order, FC-Core bytes, and release evidence byte-identical.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `19` tests, `17` passed, and exactly two failed. The only
  failures are the direct current-prefix assertions at lines `1112` and
  `1428`, each reporting `19 !== 18` after valid strict Task136-FC-Core
  record 19. Contract mode remains exact; no contract, checker, blob, command,
  dependency, FC-Core, or unrelated fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will audit only record-18-derived current count/order/repository/current
  prefix pins in those two test blocks, advance current assertions to record
  19, and preserve intentional historical/pre-activation/raw 18-record
  fixtures. Required committed-byte admission includes assurance 19/19, V4
  contract and record-19 repository markers, typecheck, full `npm test` and
  `npm run verify` inherited-baseline differential, factory/diff/scope/clean,
  and real local Vitest 4.1.9 dependencies. No registry, integration, review,
  push, network, credential, provider, `neo`, or task creation is authorized.

## RV-1-E-770 minimal GREEN evidence

- The two affected current-prefix blocks now assert the parsed strict prefix
  has `19` records and exactly `expectedIds.slice(0, 19)`. In the repository
  admission block, the closure expectation and success marker advance to
  `found 19` and `records=19 commands=19`, and the command-call count advances
  to `19`.
- The audit retained all non-current record-18 facts: the Task139-PM test title,
  its record-17 pre-activation source-currentness fixture, its synthetic
  Task139-PM record-18 activation and target-currentness assertion, and raw
  historical record fixtures. No contract, checker, FC-Core, release record,
  or release authority behavior changed.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission will
  rerun the full required assurance, repository, typecheck, differential,
  factory, diff, scope, and clean/dependency gates.

## RV-1-E-783 record-20 fixture checkpoint

- Resumed on `codex/task136-v4-task139-pm-direct-source-ownership` at the
  clean forward-merged record-20 authority
  `d5c1ddcdcf4daf517de710fbc68d1ea9af09dff9`. This claim-only checkpoint
  preserves all inherited assurance history and leaves the assurance test,
  contract, checker, V1-V3, raw strict records 1-20, all 29 card IDs and
  order, Task139-P2 bytes, and all candidate/integration/review/release
  evidence byte-identical.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `19` tests, `17` passed, and exactly two failed. The only
  failures are direct current-prefix assertions at lines `1112` and `1428`,
  each reporting `20 !== 19` after valid strict Task139-P2 record 20. No
  contract, checker, blob, command, dependency, Task139-P2, or unrelated
  fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will audit only record-19-derived current count/order/repository/current
  prefix pins in the two affected blocks and advance them to record 20 while
  preserving intentional historical/pre-activation/raw 19-record fixtures.
  Required committed-byte admission includes assurance 19/19, record-20 V4
  contract and repository markers, typecheck, full `npm test` and `npm run
  verify` differential retaining the inherited 12 failing files / 69 failing
  tests / 2,764 passing tests / 5 skips, factory/diff/scope/clean, and real
  local Vitest 4.1.9 dependencies. No registry, integration, review, push,
  network, credential, provider, `neo`, or task creation is authorized.

## RV-1-E-783 minimal GREEN evidence

- The two affected current-prefix blocks now assert the parsed strict prefix
  has `20` records and exactly `expectedIds.slice(0, 20)`. In the repository
  admission block, the closure expectation and success marker advance to
  `found 20` and `records=20 commands=20`, and the command-call count advances
  to `20`.
- The audit retained all non-current historical fixtures, including the
  Task139-PM test title, record-17 pre-activation source-currentness fixture,
  synthetic Task139-PM record-18 activation and target-currentness assertion,
  and raw/historical record fixtures. No contract, checker, Task139-P2, release
  record, or release-authority behavior changed.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission will
  rerun the full required assurance, repository, typecheck, differential,
  factory, diff, scope, and clean/dependency gates.

## Record-21 fixture checkpoint

- The preserved record-20 candidate `1426a95cff179e6a010eec725328f95f8fc079ab`
  was cleanly forward-merged with coordinator program authority
  `34b75a53bf7715bf8e0ef89a42d677c2a72ddd2e` as merge
  `cbd3a4e5d2568822f23a5094bb1b72e88b0ed346`. The merge preserves both
  histories; this claim-only causal RED leaves the assurance test, contract,
  checker, V1-V3, raw strict records 1-21, all 29 card IDs/order, runtime
  bytes, and release evidence byte-identical.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `19` tests, `17` passed, and exactly two failed. The only
  failures are current-prefix assertions at lines `1112` and `1428`, each
  reporting `21 !== 20` after valid strict Task136-FC-Ports record 21. No
  contract, checker, blob, command, dependency, or unrelated fixture failure
  occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will advance only the two affected current prefix groups—parsed count/order
  and repository count/marker/command count—from record 20 to record 21 while
  preserving all historical prefix fixtures. Required committed-byte admission
  includes assurance 19/19, V4 contract and record-21 repository markers,
  typecheck, full `npm test` and `npm run verify` differential, factory/diff,
  exact recovery scope, clean state, and real local Vitest 4.1.9 dependencies.
  No registry, integration, review, push, network, credential, provider,
  `neo`, or task creation is authorized.

## Record-21 minimal GREEN evidence

- The two affected current-prefix groups now assert a strict parsed prefix of
  `21` records and `expectedIds.slice(0, 21)`. The repository-admission
  closure, prefix marker, and command-call count advance together to `found
  21` and `records=21 commands=21`.
- Historical prefix coverage remains unchanged, including the Task139-PM
  record-17 pre-activation source-currentness fixture and synthetic record-18
  activation/target-currentness fixture; no generic current-count facility,
  contract, checker, raw record, or runtime behavior was added or altered.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission will
  rerun the required assurance, contract, repository, typecheck, full-suite
  differential, factory, diff, scope, and clean/dependency gates.

## RV-1-E-811 record-22 fixture checkpoint

- Resumed at preserved clean record-21 candidate
  `17954a2d0d9442059ce39c0a09c349ced689b026` and forward-merged exact program
  authority `0c0b56f08bf066223b348568059eaf438dadaf93` as normal merge
  `7c3dfd18ac7fb8eaddc2b0b75d6faa5cd0a81c69`. This claim-only causal RED
  preserves every inherited assurance RED/GREEN, V1-V3, raw strict records
  1-22, V4 contract/checker, all 29 card IDs/order, compatibility and transfer
  fixtures, runtime bytes, and candidate/integration/review/release evidence.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited
  `1`: `19` tests, `17` passed, and exactly `2` failed. Only the direct
  current-prefix assertions at lines `1112` and `1428` report `22 !== 21`
  after valid strict G136-SC record 22. No contract, checker, blob, command,
  dependency, or unrelated fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will advance only the two current-registry-length expectations from `21` to
  `22`, preserving historical fixtures and all immutable evidence. Required
  committed-byte admission reruns assurance, V4 contract/repository markers,
  typecheck, full differential, factory, diff, scope, clean-state, and
  dependency gates. No registry, integration, review, push, network,
  credential, provider, `neo`, or task creation is authorized.

## RV-1-E-811 minimal GREEN evidence

- The two authorized current-prefix groups now require `22` records and
  `expectedIds.slice(0, 22)`. The first group's repository closure, success
  marker, and released-command count advance together to `found 22` and
  `records=22 commands=22`.
- Historical raw-prefix, pre-activation, compatibility, Task137B-W transfer,
  source-currentness, V1-V3, V4 contract/checker, runtime, candidate,
  integration, review, and release evidence remain unchanged. No generic
  current-count facility or authority behavior is introduced.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission reruns
  the required assurance, V4 contract/repository, typecheck, full
  differential, factory, diff, scope, and clean/dependency gates.

## RV-1-E-823 record-23 fixture checkpoint

- Resumed at preserved record-22 candidate
  `61a257639786f49424da3f8309f73b570a487c5b` and forward-merged exact program
  authority `b86be8d2f72d5f09ac61771df5162257a5637191` as normal merge
  `cf18c8e62789118792d74426a029d57484046cf3`. This claim-only causal RED
  preserves every inherited assurance RED/GREEN, V1-V3, raw strict records
  1-23, V4 contract/checker, all 29 card IDs/order, historical/pre-activation
  fixtures, finite direct-source mappings, runtime bytes, and all evidence.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited
  `1`: `19` tests, `17` passed, and exactly `2` failed. Only lines `1112` and
  `1428` report `23 !== 22` after valid strict record 23. No contract,
  checker, blob, command, dependency, or unrelated fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will advance only the two current-prefix groups from `22` to `23`, preserving
  all historical facts and immutable assurance evidence. Required
  committed-byte admission reruns focused assurance, contract/repository,
  typecheck, factory, diff, scope, clean-state, and dependency gates. No
  registry, integration, review, push, network, credential, provider, `neo`,
  or task creation is authorized.

## RV-1-E-823 minimal GREEN evidence

- The two authorized current-prefix groups now require `23` records and
  `expectedIds.slice(0, 23)`. The first group's repository closure, success
  marker, and released-command count advance together to `found 23` and
  `records=23 commands=23`.
- Every historical and pre-activation fixture, V1-V3, V4 contract/checker,
  raw strict release record, direct-source mapping, runtime byte, and existing
  evidence remains unchanged; this adds no generic current-count behavior.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission reruns
  the required focused assurance, contract/repository, typecheck, factory,
  diff, scope, clean-state, and dependency gates.

## RV-1-E-839 record-24 fixture checkpoint

- Resumed at preserved record-23 candidate
  `9290bb01c2b00b24b41c8e7c5caf590e95d5f14f` and forward-merged exact program
  authority `0f6d228b31d14eb1680b5726e7d9f9ab38a6310e` as normal merge
  `f69b4b94fbc56385c2d1350d6e04587f5725c03f`. This claim-only causal RED
  preserves the inherited assurance test blob
  `b6680c68dac558732c72e3a91999fa9d7b7f1473`, V1-V4, raw strict records
  1-24, all 29 card IDs/order, historical/pre-activation fixtures, finite
  direct-source mappings, runtime bytes, and existing evidence.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited
  `1`: `19` tests, `17` passed, and exactly `2` failed. Only lines `1112` and
  `1428` report `24 !== 23` after valid strict record 24. No contract,
  checker, blob, command, dependency, or unrelated fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will advance only the two current-prefix groups from `23` to `24`, preserving
  all historical facts and immutable evidence. Required committed-byte
  admission reruns focused assurance, contract/repository, typecheck, factory,
  diff, exact scope/blob evidence, clean-state, and dependency gates. No
  registry, integration, review, push, network, credential, provider, `neo`,
  or task creation is authorized.

## RV-1-E-839 minimal GREEN evidence

- The two authorized current-prefix groups now require `24` records and
  `expectedIds.slice(0, 24)`. The first group's repository closure, success
  marker, and released-command count advance together to `found 24` and
  `records=24 commands=24`.
- Historical/pre-activation counts, V1-V4, raw strict records, finite
  direct-source mappings, all card IDs/order and commands, runtime bytes, and
  existing evidence remain unchanged; no generic count behavior is added.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `19` passed and `0` failed. Final committed-byte admission reruns
  the required assurance, contract/repository, typecheck, factory, diff,
  scope/blob, clean-state, and dependency gates.

## RV-1-E-857 Task122 finite-transfer causal RED and scope checkpoint

- Resumed at clean preserved candidate
  `8434ce0ad819e14d914aaf7b013ea2be10280d82` and normal-forward-merged exact
  coordinator authority `3588f437eca3162742b6e1329fff42d9bc7e4bd4` as
  `d55dabcf570e37eac85bb064cf0bdb5ffc12b9f2`. Only the registry changed in
  that authority merge; no task implementation byte changed before this RED.
- RV-1-E-857 authorizes precisely the two portable mounted-artifact-store
  paths from CF1-HR to Task122, with Task122 prerequisite `["CF1-HR"]`, exact
  command `npm test -- packages/agent/test/investigation-planner-workflow.test.ts
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`,
  and the record-14 CF1-HR compatibility entry/hash
  `d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12`.
  Its historical owned source/test blobs are respectively
  `c835bc2cfc9ce3b4751a3f298c2e5d453b2b2091` and
  `a1f1b04fa75d573bd3c8851a5fb4f15610109d40`.
- Causal test blob: `95eecc067e08ec6ca5f28144b6036e6cef6d1c56`. Command:
  `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Observed result: exit `1`; `20` tests, `19` pass, `1` fail. The sole failure
  is the new record-26 test at line `1634`: inherited
  `CF1-HR.transferToIds` is `[]`, not exact `["Task122"]`. Existing nineteen
  assurance tests remain green.
- The RED test also pins the exact source and target dispositions, command,
  raw CF1-HR record hash/blob evidence, 29-card order, V1-V3 hashes and
  25-record prefix, missing/extra/generic/wrong-disposition/target-scope/
  command/historical mutation rejection, CF1-HR currentness before record 26,
  Task122 currentness at record 26, and CF1-HR candidate/integration evidence
  after transfer activation.
- Read-only in-memory future-contract diagnosis proves no compliant GREEN is
  possible in the three authorized paths. With exactly the authorized mapping,
  the computed assurance fingerprint is
  `d7bc75dc684e4d2be850aa2b5f6af9268754ed525f472375784d63f3b45f8071`,
  while the frozen checker pins
  `47cfd213bae941aef69673c7afd633a4fea84d176fbbbdaf5dcefdf716fc19a0`.
  `verifyStaticGraph` first rejects that future contract with `release
  compatibility records`. The unmodified checker fixes the four-entry
  compatibility list, requires every CF1-HR path to stay `owned`, has no
  CF1-HR -> Task122 historical target group, has no CF1-HR -> Task122
  current-head migration target, and then enforces the obsolete fingerprint.
- Minimal excluded production path required for any GREEN is
  `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`. It would
  need only the explicit finite CF1-HR -> Task122 constants/compatibility,
  exact CF1-HR and Task122 scope checks, record-26 migration branch, and the
  derived fingerprint pin; no generic or transitive transfer facility is
  justified. This packet must stop at the committed RED unless a coordinator
  expands that exact production-path authority.

## RV-1-E-859 coupled legacy-pin correction and minimal GREEN evidence

- RV-1-E-859 preserves causal RED `e05eaddea5aa39da0cc4baac406fa4c6a9a5902c`
  and authorizes one checker-inclusive GREEN after normal authority merge
  `cbe9a89bf98bba4cad6bc4d64f7e2c297f52cff7`. The RED test blob remains in
  ancestry; the GREEN test changes only three independently reproduced stale
  assertions coupled to the now-authorized finite mapping.
- The reproduced prospective GREEN ran `20` assurance tests: `17` passed and
  only `3` failed. CF1-HR's exact two portable-store paths are now
  `transferred` rather than legacy `owned`; Task122's exact command is the
  authorized two-test command rather than its V3 one-test command; and the
  computed fingerprint is exact
  `d7bc75dc684e4d2be850aa2b5f6af9268754ed525f472375784d63f3b45f8071`
  rather than legacy `47cfd213bae941aef69673c7afd633a4fea84d176fbbbdaf5dcefdf716fc19a0`.
- The finite GREEN updates only those coupled assertions: the CF1-HR legacy
  projection expects `transferred` only for the two Task122 paths and `owned`
  for every other CF1-HR path; Task122 alone joins the explicit V3-command
  parity exemptions while its record-26 test pins the authorized command; and
  the fingerprint assertion advances to the derived exact value. No other
  test assertion changes.
- The contract/checker GREEN adds no generic facility: it fixes the sole
  CF1-HR -> Task122 source/target paths, historical record-14 compatibility,
  exact source and target scopes, historical target group, record-26 current
  migration, and derived fingerprint. V1-V3, raw records 1-25, 29-card order,
  every other transfer, and repository prefix remain immutable.

## RV-1-E-859 V4 contract-hash causal correction

- After the three coupled legacy-pin corrections, the focused corpus was
  `19/20`: its only remaining failure was the V4 file-hash assertion. The
  exact authorized finite contract bytes SHA-256 to
  `1d98c77a6255b3e68d0ad62f71e0023240ad8913659d70d715fb6bc0974b06f5`,
  while the legacy assertion pinned
  `2a5cf62b1fb02d47aa01329b485c76f399585802f26669cce977b66e5bd7f86b`.
  Keeping the old SHA while changing the contract would require a hash
  collision, so RV-1-E-859 authorizes exactly this fourth, causal assertion
  pin update and no other test change.
- The resulting GREEN retains the preserved RED test in ancestry and changes
  only the four authorized packet paths: V4 contract, finite checker, focused
  assurance test, and this claim. The admission proof is 20/20 assurance,
  exact V4 contract/repository markers at prefix 25, typecheck, factory,
  diff/scope/immutability/clean/dependency checks, plus full test and verify
  differential evidence without claiming inherited failures are green.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `20` passed and `0` failed; contract mode emits exactly
  `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`.

## RV-1-E-869 record-26 current-prefix causal RED checkpoint

- Preserved candidate `06e84742637ee715e03cf84e9b79dc6673bd0569` was
  normal-forward-merged with exact clean program authority
  `d99fafa7b798aa2beb6b0f90d863a4907d6976d5` as
  `add6c0b50994c67d3074370e3f751356391c2d28`. The merge preserves both
  histories and introduces strict release record 26; this checkpoint changes
  only this claim, leaving the assurance test, V1-V4 contracts, checker,
  raw records 1-26, finite mappings, product bytes, and prior evidence
  unchanged.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `20` tests, `17` passed, and exactly `3` failed. The only
  failures are current-prefix cardinality assertions at lines `1125`, `1441`,
  and `1621`, each reporting `26 !== 25`. They respectively cover the
  historical-source/current-migration, Task137B-W-to-Task139-PM, and
  CF1-HR-to-Task122 current-prefix blocks. No contract, checker, command,
  blob, dependency, or unrelated fixture failure occurred.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  will advance only these exact current-record count/order/repository closure
  expectations from record 25 to record 26, preserving all historical and
  pre-activation fixtures. Required committed-byte admission reruns focused
  assurance, V4 contract/repository markers, typecheck, full differential,
  factory, diff, two-path scope, immutable-input, clean-state, and dependency
  gates. No registry, integration, review, push, network, credential,
  provider, `neo`, or task creation is authorized.

## RV-1-E-870 record-26 minimal GREEN evidence

- The three current-prefix groups now assert `26` records and exact
  `expectedIds.slice(0, 26)`. The repository-admission closure, prefix marker,
  and command-call count advance together to `found 26` and
  `records=26 commands=26`.
- The CF1-HR-to-Task122 test now constructs its intentionally pre-activation
  fixture from `releasedPrefix.slice(0, 25)`. This preserves the historical
  record-25 source-currentness check after the real current prefix includes
  Task122 at record 26, and prevents the synthetic record-26 activation from
  duplicating the released Task122 record. It does not alter any historical
  record count, contract, checker, mapping, or release evidence.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with `20` passed and `0` failed. Final committed-byte admission will run
  the required contract/repository, typecheck, full differential, factory,
  diff, immutable-input, scope, clean-state, and dependency gates.

## RV-1-E-875 W1-123 preflight ownership causal RED checkpoint

- Preserved candidate `789d7ca8abbd7a0fafed323d157490e24ffc7242` was
  normal-forward-merged with exact clean program authority
  `3661bf07d103d6602395e1440d75e29e663fa03b` as
  `c88b47b457c5f34652fd2187d50d7695d9c3a2e6`. The authority merge changes
  only the registry; this RED changes only this claim and the assurance test.
  V1-V4 contracts, the checker, raw strict records 1-26, the 29-card order,
  product bytes, and historical evidence remain byte-identical.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `21` tests, `20` passed, and exactly `1` failed. The new
  finite direct-source test reports that CF1-HR has only `["Task122"]` rather
  than exact `["Task122", "W1-123-BOOTSTRAP-HANDOFF"]`. No unrelated
  contract, checker, command, blob, dependency, or fixture failure occurred.
- The committed test pins the exact CF1-HR and Task122 source/target
  dispositions, W1-123's three prerequisites, nine-path scope and four-test
  command, record-14/record-26 historical owned dispositions and blobs,
  exact target ordering, mutation rejection, source currentness before strict
  record 27, W1-123 currentness at record 27, and source candidate/integration
  evidence. The sole authorized GREEN is the exact four-path packet: V4
  contract, finite checker, retained RED test, and this claim. It may not add
  generic, transitive, inferred, fallback, V5, raw-record, registry, or
  product behavior authority.

## RV-1-E-875 W1-123 preflight ownership minimal GREEN evidence

- The finite V4 correction keeps W1-123 prerequisiteIds exactly
  `["CF1-HR", "Task121", "Task122"]` and all 29 release-card IDs/order.
  CF1-HR transfers only the specialist-handoff authority source/test to
  W1-123 in addition to its two retained Task122 portable transfers; Task122
  transfers only those two portable paths to W1-123. W1-123 owns exactly the
  existing five paths plus these exact four, and its command is exactly
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`.
- The checker retains exact targeted-command equality and uses only finite
  source-specific CF1-HR/Task122 -> W1-123 validation, historical target
  groups, and record-27 current-HEAD migration branches. It adds no generic,
  inferred, transitive, fallback, or alternate compatibility authority. The
  contract’s exact owned-path order keeps its existing five relative order
  while placing the incoming authority pair before the existing runtime pair,
  thereby matching the mandatory command order.
- Historical compatibility retains raw CF1-HR record 14 hash
  `d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12`
  and its portable blobs, adds the owned authority blobs
  `81d2df45b2c74f118bea22fdce23a5fd698ddbd0` /
  `309d26e487e200f7a430b261910e4f6ef11b19a1`, and binds raw Task122 record
  26 to `729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c`
  with owned portable blobs `aa5859e0d2c8146812673777436e9e284f1c3373` /
  `148c7a4c5af83371f579b808a2970f6a8609394e`.
- The V4 contract SHA-256 is
  `ec2ff7d4b3aee00e507de0e6c9a468bde4a65c34c115dd17447b7857c49d7354` and
  the derived assurance fingerprint is
  `3af58aba85ea68137462d2054072e4e3ce3a2a8146ad3be8ee400b103375feb7`.
  Command: `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result from intended GREEN bytes: exit `0`; exactly `20` tests, `20` pass,
  and `0` fail. The test retains the committed RED in ancestry and combines
  the record-26 and record-27 direct-source assertions in one 20-test
  focused corpus while preserving its positive, mutation, historical, and
  current-head coverage.

## RV-1-E-888 record-27 current-prefix causal RED checkpoint

- Exact clean program authority `7dc72c1f3d83b2eccda7671801b4827eaff69638`
  was normal-forward-merged into the preserved V4 lineage as
  `0941c28e223847839d853cc58348b4ac977dc915`. Repository mode executed all
  27 released commands, emitted `TASK136_REPOSITORY_PREFIX_OK records=27
  commands=27`, then exited nonzero only with `repository release closure
  incomplete: expected 29 records, found 27`.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; `20` tests, `17` passed, and exactly `3` failed. The only
  failures are current-registry cardinality assertions at lines `1159`,
  `1475`, and `1655`, each reporting `27 !== 26`; every contract, checker,
  command, blob, migration, dependency, product, and unrelated fixture check
  remains green.
- The sole GREEN change is to advance those three current registry-length
  expectations from `26` to `27`. Synthetic record-26 repository fixtures,
  preactivation/history fixtures, V1-V4, raw records 1-27, all 29 IDs/order,
  finite mappings, product bytes, and prior evidence remain immutable.

## RV-1-E-888 changed-tactic root-cause checkpoint

- The first minimal GREEN attempt advanced the three current-prefix groups
  from 26 to 27 and reproduced `20` tests with `18` passed and `2` failed.
  `node:test` had short-circuited before the coupled repository-admission
  expectations around lines `1323`-`1326`, which still expected found/marker/
  command count 26 after their containing current-prefix fixture became 27.
- The other masked failure was the nested W1 record-27 activation corpus
  around line `1828`. Its intentionally preactivation assertions must remain
  at record 26, but its local setup parsed the now-current 27-record registry.
  The finite correction mirrors RV-1-E-870: slice only that nested local
  prefix to 26 before synthesizing record-27 activation, while retaining its
  later `afterActivation.records === 27` assertion unchanged.
- GREEN is therefore limited to the original three current-prefix length and
  ordered-ID updates, the first fixture's coupled repository closure/marker/
  command count at 27, and the nested W1 fixture's local `.slice(0, 26)` setup.
  No other test, registry, record, contract, checker, source/product byte, or
  prior evidence is authorized to change.

## RV-1-E-888 changed-tactic minimal GREEN evidence

- The three semantic current-prefix groups now require length 27 and exact
  `expectedIds.slice(0, 27)`. The first group's coupled repository admission
  requires only incomplete found 27, the exact 27/27 prefix marker, and 27
  command calls.
- The nested W1 activation corpus retains its record-26 length and ordered-ID
  expectations by slicing only its local parsed prefix to 26, then still
  proves synthetic W1 activation produces `afterActivation.records === 27`.
- Exact command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `0`; `20` tests, `20` passed, and `0` failed. No other test byte
  or any registry, contract, checker, source/product, or package byte changed.

## RV-1-E-926 record-28 current-prefix causal RED checkpoint

- Exact clean record-28 program authority was normal-forward-merged into the
  preserved V4 lineage as `5cb84ff8f8de879af6eed47a96d1fd584019ee8a`.
  This claim-only checkpoint preserves every prior assurance RED/GREEN commit
  and leaves the focused assurance test, V1-V4 contracts, checker, raw strict
  records 1-28, all 29 card IDs/order, historical W1 activation fixture,
  product/package bytes, and integration/review/release evidence unchanged.
- Causal command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; exactly `20` tests ran, `17` passed, and `3` failed. The
  only failures are current-registry cardinality assertions at lines `1159`,
  `1475`, and `1655`, each reporting `28 !== 27`. No contract, checker,
  release-record, command, blob, ownership, compatibility, migration,
  dependency, Task138-H product, or unrelated fixture failure occurred.
- The authorized GREEN changes only this claim and the focused assurance
  test. It will advance exactly the three current-prefix length/order groups
  and the first group's coupled repository incomplete-found, exact prefix
  marker, and command-call expectations from `27` to `28`. The historical W1
  activation corpus's local `.slice(0, 26)`, its length/order assertions at
  `26`, and its synthetic record-27 behavior remain byte-identical. No
  registry, contract, checker, raw record, product/package byte, release
  authority, network, provider, credential, external system, push, `neo`, or
  Task136 implementation is authorized.

## RV-1-E-926 record-28 minimal GREEN evidence

- The three live registry-prefix groups now require exactly `28` records and
  `expectedIds.slice(0, 28)`. The first group's coupled repository admission
  expects only incomplete closure `found 28`, the exact
  `TASK136_REPOSITORY_PREFIX_OK records=28 commands=28` marker, and `28`
  command calls.
- The historical W1 activation corpus remains byte-identical: its local
  `.slice(0, 26)`, length/order expectations at `26`, and synthetic record-27
  activation are unchanged. No registry, V1-V4 contract, checker, raw strict
  release record, product/package byte, integration/review evidence, release
  semantics, command card, or other test behavior changed.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with exactly `20` tests, `20` passed, and `0` failed. Final
  committed-byte admission will rerun assurance, all four contract markers,
  repository strict 28/28 plus only incomplete-29 closure, standalone
  typecheck, factory, diff/scope/ancestry/dependency/clean, and no-product-byte
  gates.

## RV-1-E-941 Task136 V4 correction authority checkpoint

- Exact implementation authority
  `0955f28f9115885fc8859b7b223f3d91cf77bf03` was history-preservingly
  forward-merged into the clean V4 GREEN lineage as
  `327f9421ae604e4764d29033b6bda22fda3382df`. The merge has exactly two
  parents: preserved V4 first parent
  `96142632606668519b2198590bdb3ae87b367691` and implementation-authority
  second parent `0955f28f9115885fc8859b7b223f3d91cf77bf03`.
- Before the merge, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
  exited `0` with exactly `20` tests, `20` passed, and `0` failed. The
  prospective six-file V4 correction ceiling is exactly:
  `docs/agentic/contracts/task136-bounded-assurance-v4.json`,
  `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`,
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`,
  `docs/agentic/claims/task-136-v4-task137b-authority-transfer.md`,
  `docs/agentic/contracts/software-factory-mission-state.v1.json`, and
  `scripts/check-software-factory-mission-state.mjs`.
- The prospective V4 JSON SHA-256 remains exactly
  `81a34419ae5d25853279be96c14a95c65dcc127d1bb5f5b09cecbbf03c55b53a`,
  the prospective V4 assurance fingerprint remains exactly
  `34628c6687644f224ef426254a6461c25f549d696c5de08bd9dccc14b7946af6`,
  and the synchronized mission immutable-envelope fingerprint remains
  exactly
  `sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5`.
- The fresh full baseline is bound to exact tree
  `327f9421ae604e4764d29033b6bda22fda3382df`. `npm test -- --reporter=json
  --outputFile=/tmp/task136-v4-full-327f9421ae604e4764d29033b6bda22fda3382df.vitest.json`
  exited `1`; its JSON reports `success=false`, file counts
  `total=504`, `passed=484`, `failed=20`, `skipped=0`, and test counts
  `total=3231`, `passed=3178`, `failed=48`, `skipped=5`, `deferred=0`.
  `npm run verify` also exited `1` after standalone typecheck passed and the
  inherited test cohort failed. These nonzero results are the exact
  candidate-differential baseline and are not passing gates.
- Baseline SHA-256 values are
  `c8fd4c43c6eb7a29755b83edf65004254ceb52ff49f840c972885f885426e566`
  for the Vitest JSON,
  `cbf1cb3317cc9581f976a2cd27a2f4c1745aecf2b00650a59e93f46bc9dc40a4`
  for the npm-test log, and
  `15125944a80d1f605487560f1dd13e28603a7b72335baf53a2d1c081177008f3`
  for the verify log. Each log carries exact
  `TREE_SHA=327f9421ae604e4764d29033b6bda22fda3382df`.
- This is an authority/checkpoint transition, not a product release. No
  Task136 product/package byte may change before the exact six-file V4
  candidate is complete, independently approved, and integrated. This
  checkpoint authorizes no registry, release-record, `neo`, push, provider,
  credential, network, external-system, fallback-write, or product change.

## Task 3 permanent Task136 producer-reconciliation causal RED

- Starting authority checkpoint:
  `f37afbf06ab7adc1d0ea3613c2e1c77032e44379`. The focused command was
  `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  It exited `1` after exactly `20` top-level tests: `16` passed, `4` failed,
  `0` skipped, `0` cancelled, and `0` todo. <!-- agent-readiness-allow: exact Node test counter -->
- The four failing titles and their first mismatches are exact:
  1. `verifies the 29-card topological graph, exact Task136 transfers, and
     prerequisites` — all seven approved source `transferToIds` projections
     first differ because the record-28 contract omits `Task136`.
  2. `requires corrected producer ownership and exact Task136 scope and
     command` — the first CF1-HR mismatch reports the four Task136 handoff and
     ontology paths as `owned` rather than `transferred`.
  3. `requires frozen v4 compatibility branches and all 28 raw prefix pins` —
     the first compatibility mismatch reports the current six records rather
     than the approved eleven-record sequence.
  4. `rejects finite Task136 graph, compatibility, baseline, raw-pin, and
     record-29 migration mutations` — the first mismatch is current
     fingerprint
     `3af58aba85ea68137462d2054072e4e3ce3a2a8146ad3be8ee400b103375feb7`
     rather than approved
     `34628c6687644f224ef426254a6461c25f549d696c5de08bd9dccc14b7946af6`.
- The other `16` top-level tests are green, including immutable V1-V3 and all
  28 raw release pins, composition and ABI corpora, command cards, strict
  release-record parsing, repository evidence, historical record-11/14/18/
  26/27 migrations, the preserved W1 `.slice(0, 26)` fixture, and the
  RV-1-E-941 durable authority checkpoint.
- The RED test now contains the approved literal 30-path Task136 scope,
  16-test command, seven finite source-transfer groups, eleven historical
  compatibility entries and dispositions, all 28 raw pins, five exact
  candidate/integration/HEAD baseline adoptions, all 27 record-29
  transferred/adopted current-HEAD migrations, and candidate/integration
  mismatch proof for every Task136 path. Baseline and record-29 mutants require
  zero release-command calls.
- No product byte changed. The exact Task 3 working diff from
  `f37afbf06ab7adc1d0ea3613c2e1c77032e44379` is limited to this append-only
  claim and
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Contracts, checker, mission state, registry, packages, runtime, providers,
  credentials, network behavior, release records, and `neo` remain unchanged.

## Task 4 finite Task136 producer-authority GREEN

- The exact permanent RED parent is
  `fa5cf3ead0d3886d8173bc67414202be1e29629e`. The approved V4 contract now
  expresses only the seven named Task136 source-transfer groups, their exact
  22 transferred paths, the exact 30-path Task136 scope, the 16-test command,
  nine prerequisites, eleven finite historical compatibility entries, all 28
  raw registry pins, and five exact candidate/integration/HEAD baseline
  adoptions. It provides no generic or transitive transfer/adoption facility.
- The checker uses explicit finite branches for the eleven compatibility
  sources and the seven Task136 producers. Six legacy raw records retain
  strict canonical-hash validation. The other five newly described historical
  records remain bound by their exact compatibility constants and the 28
  immutable raw registry pins. Canonical historical bytes use their recorded
  `owned` dispositions; synthetic and current producer records use the
  corrected static `transferred` dispositions. This distinction is selected
  only by exact card ID plus exact canonical JSON SHA-256.
- Before record 29, each transferred source path must still match its exact
  candidate, integration, and current-HEAD blob. Once a valid Task136 record
  exists, every transferred source path migrates to Task136 and Task136 must
  own the exact 30-path scope with candidate/integration/current-HEAD equality.
  Baseline adoption checks are the exact five approved paths and tuples, not a
  reusable adoption mechanism.
- From these intended GREEN bytes, `node --check
  scripts/resident-agent/assurance/task136-bounded-assurance.mjs && node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exits
  `0` with exactly `20` tests, `20` passed, and `0` failed. Contract mode emits
  `TASK136_RELEASE_GRAPH_OK records=29`,
  `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`,
  `TASK136_COMMAND_CARDS_OK cards=29`, and
  `TASK136_ABI_CORPUS_OK green=1 red=15`.
- The V4 contract SHA-256 is exactly
  `81a34419ae5d25853279be96c14a95c65dcc127d1bb5f5b09cecbbf03c55b53a`.
  The release-graph plus compatibility assurance fingerprint is exactly
  `34628c6687644f224ef426254a6461c25f549d696c5de08bd9dccc14b7946af6`.
  The Task 3 focused-test blob, mission pins, registry, release records,
  product/package bytes, provider behavior, credentials, network behavior,
  external systems, `neo`, and remote refs remain unchanged. This is an
  assurance authority transition, not a product release.

## Task 5 Task136 mission-authority pin synchronization

- The exact Task 4 parent is
  `3b0770218538270b088ca7baaf59e15aeb42a867`. The executable/config delta is
  exactly two fields: `mission.frozenAuthority.sha256` advances from
  `ec2ff7d4b3aee00e507de0e6c9a468bde4a65c34c115dd17447b7857c49d7354`
  to `81a34419ae5d25853279be96c14a95c65dcc127d1bb5f5b09cecbbf03c55b53a`,
  and `expectedImmutableEnvelopeFingerprint` advances from
  `sha256:0d6e437990b0320436e349d595ceb3445e71bc9c04c7f208b558d0c8f5bf91b3`
  to
  `sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5`.
  Mission topology and mission-test bytes are unchanged.
- Before the pin synchronization,
  `node scripts/check-software-factory-mission-state.mjs --json` failed only
  with `frozen authority digest changed`. From the synchronized bytes it exits
  `0` with source fingerprint
  `sha256:097cf3e8490fe33caab5c663bc1a2e0e1049283b499eb98d4828e9a405210ff0`
  and immutable-envelope fingerprint
  `sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5`.
- `node --test scripts/check-software-factory-mission-state.test.mjs` exits
  `0` with exactly `20` tests, `20` passed, and `0` failed.
  `npm run factory:check` emits `factory-readiness passed`.
- Factory readiness initially identified the exact historical Node test
  counter label `0 todo` as its case-insensitive unfinished marker. <!-- agent-readiness-allow: exact Node test counter --> The
  coordinator-authorized same-line `agent-readiness-allow` annotation states
  that it is an exact Node test counter. The original counter remains
  byte-visible and its RED count and meaning are unchanged.
- The V4 contract, assurance test and checker, registry, release records,
  packages/product bytes, provider behavior, credentials, network behavior,
  external systems, `neo`, and remote refs remain unchanged. This mechanical
  pin synchronization is an assurance checkpoint, not a product release.

## RV-1-E-1017 forward assurance-scope amendment

The historical V4 candidate, approval, integration, JSON hash, assurance
fingerprint, mission fingerprint, and every prior review above remain
immutable evidence for their exact commits. They are not rewritten. Human
scope authority is recorded at program commit
`9aa73c2cb9063d97ed438fa074911ba527995cc9` and Task136 two-parent merge
`d0136f6960f0355fe7ea29320498c80dd276c963`.

The forward amendment preserves all 29 card IDs/order, all 28 raw release
pins, eleven historical compatibility records, nine Task136 prerequisites,
and every existing transfer. It expands only Task136's finite owned scope by
adopting these two previously unowned release-graph paths:

```text
packages/agent/src/adapters/legacy-staging.ts
packages/agent/test/legacy-staging-adapter.test.ts
```

The exact current Task136 scope is 32 ordered paths: 14 sources, 17 tests,
and one claim. The adopted pair occupies positions 9 and 10 immediately
before the gateway pair; the newline-delimited ordered-path SHA-256 is
`8fc076b8b7f3c23f513381fd771bf26ee81ad967c28b741bdb1c766d52554a41`.
The Task136 command contains all 17 tests in owned-path order.

The two paths are finite baseline adoptions with source blob
`99fbafda3844435109bc249b015b111b9258c210` and test blob
`de7cef3123a15fb82891943dc51005165c8c9fcd`, exact candidate
`3be15212776ab3c96e66bf0bade4630960c362eb`, and published integration
`dc05c43c4b9a592d0396acd034bfc32e177fd09a`. Before record 29, candidate,
integration, and current HEAD must match. After record 29 they migrate to
Task136 candidate/integration/current equality with the other 30 paths.

The amended contract/checker keeps the finite mutation corpus and adds both
paths to baseline and record-29 blob mismatch proof. The forward exact pins
are:

```text
V4 JSON SHA-256:
3adbf85ccc071667df73809f44b0e1451b66fdd81dfc6021afafcc4feec20930
V4 assurance fingerprint:
da850dfd3068efda96b96e9a274777e3b97e2922017c16be8ea703b09e7cd1ec
Mission immutable-envelope fingerprint:
sha256:1fcbb344a125ae874ea174022f051486267f0f7afa75e743bdb8fab24632d5ab
Mission source fingerprint:
sha256:5b5b6b71dc5d0f4b96954ac00d3e7b8a4ccb7c31465eabac149b7f312f39028b
```

The amendment also freezes the secret-safe ordinal-10 design: the released
adapter derives ordered `selectedCandidateBindingHashes` from authoritative
current candidates using the exact versioned canonical preimage in the
Task136 design, binds them into `normalizedInputHash` and the complete
preview hash, and exposes no raw predicate/object values. Fresh dispatcher
execution and gateway recovery independently recompute from exact proposal
and evidence durable facts; neither trusts a receipt as its own oracle and no
report-store port is added.

This is a pre-product authority amendment candidate, not Task12 product
editing, approval, integration, strict record 29, assurance-only transition,
publication, Wave 3 start, or product release. Task12 remains implementing
and the strict frontier remains **28 of 29** pending completely fresh design
and executability reviews of one exact candidate.

## RV-1-E-1109 forward exact-identity 33-path amendment

This true-EOF claim records the current forward assurance authority. Every
earlier V1-V4 contract hash, strict release record, candidate, review,
fixture, RED, GREEN, integration, and release remains immutable evidence for
its exact commit.

The permanent E-1109 causal RED is commit
`2f5834947b350c96171ed665b8280902661cbf7a`. The unchanged 20-test assurance
corpus produced exactly 19 passes and one causal failure: the old contract
carried `Task136-FC-Core.transferToIds: []` instead of exact `["Task136"]`.
No package/product byte changed.

The finite GREEN transfers only
`packages/local-runtime/src/resident-loop-factory-composition.ts` from
Task136-FC-Core to Task136. The FC-Core tests and claim remain owned, and the
FC-Core command remains unchanged. Historical record 19 retains `owned`
disposition for all four paths, exact raw SHA-256
`5e78c42b3753cd3ce086ab45862479f2e5569fdaae1fc683528a67101630b920`,
and exact compact canonical SHA-256
`ff24eb56771db9a1a7ea015783a9b83c17f246d5e0215364b7fecb547c92c0c1`.

The exact graph remains 29 cards. Task136 now has ten prerequisites and 33
ordered paths = 15 sources, 17 tests, and one claim. The composition source is
one-based position 23, and the exact newline-delimited path SHA-256 is
`4cca816c5004bf922d47a44bc8e9216a7f4d1e00a030f20b34d59fb0cd1e442e`.
The card command remains the exact existing 17-test command. Compatibility
grows from eleven to twelve entries with FC-Core immediately before FC-Ports.
Only the source migrates to Task136 at record 29.

The released FC-Core composition tests remain FC-Core-owned and are added
unchanged to the mandatory cross-boundary control, taking it from 35 to 37
tests. The product design requires a private non-barrel one-shot issuer seam
at actual composition allocation: privately register or brand the exact
completed frozen readback against the exact wake runtime before returning,
then reject copied outer/provider/handoff/authority-binding allocations before
store I/O. Structural, first-seen, timing, allocation-order, call-stack,
source-text, global, and process-local heuristics remain forbidden.

The final canonical synchronized pins are:

```text
V4 JSON SHA-256:
96b6104617103b85916df22b46168781c58b4465b729369f3e7179cf0a89b8e5
V4 assurance fingerprint:
f73e9d7090dfdd388b18c2b13ca207f3cfa11697fe4473026e0b09492d083df4
Mission frozen-authority SHA-256:
96b6104617103b85916df22b46168781c58b4465b729369f3e7179cf0a89b8e5
Mission immutable-envelope fingerprint:
sha256:82e666a86d2b3ccd0ceafd634975d0a7459d3fe7600d27cc8345dd0f531fbc1e
Mission source fingerprint:
sha256:799af83764d6c098f3b1a97d6d30fc3b9b13f32f7c57204d92383fab371179ac
```

The amendment candidate contains exactly nine authority paths and no
package/product byte. It is review-ready only after final committed-byte
validation. It is not approved, integrated, Task14 GREEN authority, a Task136
product candidate, strict record 29, repository closure, publication, Wave 3
start, or product release.

## RV-1-E-1324 record-29 current-prefix causal RED checkpoint

- Exact clean strict-record release
  `79e7177829afef0ee5e786b5b27ed05a8dd53c69` and calibration authority
  `bb40818d2e9885c00b15785eb16e6bd34b73be68` were history-preservingly
  forward-merged into preserved V4 candidate
  `91ad47489ce5506f91821dcf57b8fc0a2a1352a0` as
  `45826f443af9ee159556231b572d2e0bea2b76cb`. The merge has exact parents
  `91ad47489ce5506f91821dcf57b8fc0a2a1352a0` first and
  `bb40818d2e9885c00b15785eb16e6bd34b73be68` second. Both the V4 candidate
  and strict record-29 release remain ancestors without rewrite.
- Causal command:
  `TMPDIR=/dev/shm node --test --test-reporter=tap
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Result: exit `1`; exactly `20` tests ran, `17` passed, and `3` failed. The
  only failing titles are `binds four historical source records and exact
  record-11 and record-14 current-head migrations`, `requires the finite
  Task137B-W to Task139-PM transfer only at record 18`, and `requires the
  finite CF1-HR and Task122 direct-source transfers at records 26 and 27
  only`. Each reports only `29 !== 28`, with expected `28`, actual `29`, and
  strict equality. No product, contract, checker, command, repository,
  dependency, or unrelated assurance failure occurred.
- This claim-only checkpoint leaves assurance-test blob
  `def2bacec8546622f99c6a3265d456b6528a176e`, checker blob
  `2251dedcc0c4e10ae636f60be34d6b30e3bc9b4a`, V4 contract blob
  `5defc88bc6cd4bfe854b0b6107ed221a675953ff`, mission-state blob
  `4e76de29d29adb7c594a3eecc0b4dcf3fb198ada`, and package tree
  `24b924dd47d8c34f85a6f4c6961c34c57b784ecd` unchanged from the authority
  merge.
- The sole authorized GREEN scope is this claim plus
  `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`. It
  may advance only the three live current-prefix lengths and ordered-ID slices
  from `28` to `29`, plus the coupled incomplete-found/complete-closure
  expectation, exact `records=29 commands=29` marker, and 29-command call
  count. The historical W1 local `.slice(0, 26)`, its 26 assertions,
  synthetic record-27 activation, all 20 titles, raw pins and commands,
  contracts, checker, mission, registry, products, packages, and Task136
  33-path ceiling remain frozen.
- The candidate ceiling is exactly these two paths. This calibration does not
  create a second product release, publish to `neo`, start Wave 3, change
  provider or route behavior, or claim production readiness or Wave 5
  release.
