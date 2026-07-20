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
