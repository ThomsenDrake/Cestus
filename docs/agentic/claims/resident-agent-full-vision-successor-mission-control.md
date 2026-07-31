# Resident Agent Full-Vision Successor Mission Control

Status: implementing under `RV-1-E-1331`.

## Authority and scope

The clean dispatch base is
`639ff359f67d7cd156bc1b6be5ac56a842dbb030`, whose sole new program fact is
the append-only E1329 lifecycle authorization. The isolated candidate owns
exactly these nine paths:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/agentic/contracts/software-factory-active-mission.v1.json`
5. `docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json`
6. `scripts/check-software-factory-active-mission.mjs`
7. `scripts/check-software-factory-active-mission.test.mjs`
8. `scripts/check-agent-readiness.mjs`
9. `docs/agentic/claims/resident-agent-full-vision-successor-mission-control.md`

No package source, package test, product route, provider, credential, live
operation, acceptance verdict, release record, or `neo` state is in scope.

## Preserved predecessor

The selector authenticates, without changing, the integrated
`software-factory-calibration` predecessor at accepted integration
`9bb902a5e201a4ab6a0e71339d1ff28a3dfaf95c`. Its byte freezes are:

- mission source SHA-256
  `4f86f78fbedfc27993513888bb349610e6e5a7bfcf2c6a82775e6d97ea2d05c3`;
- checker SHA-256
  `c5a83e917f2f9040fb522d3a078fb35dd0de752b84c1dc77c83ca6a2304f2792`;
- checker-test SHA-256
  `889329082267bc4d6efe76e1398eaf2139224804e99d17057d46699b9aab4e91`;
- canonical fingerprint
  `sha256:799af83764d6c098f3b1a97d6d30fc3b9b13f32f7c57204d92383fab371179ac`;
- immutable-envelope fingerprint
  `sha256:82e666a86d2b3ccd0ceafd634975d0a7459d3fe7600d27cc8345dd0f531fbc1e`.

## Successor contract

The active mission has 29 nodes and five Level 3 milestones. Its exact graph is
Task140P -> Task140R0 -> Task140H -> Task140R1 -> Task131 -> Task141;
Tasks142–152 are mutually independent after the Wave 2 readiness milestone;
the reviewed A-FIXTURE work order follows the Wave 3 milestone; A-01 through
A-10 then run in committed order with every shared fixture, evidence, test, and
claim path owned only across strict prerequisite ancestry; and Task153 is the
sole release gate after all ten acceptance nodes. Milestone evidence is
distinct from reviewed feature-integration evidence, so integration alone
cannot open Task131, Wave 3, Wave 4, Task153, or final release.

The candidate mission canonical fingerprint is
`sha256:6dc38e4338f9e120fe958c9015efaed77df6e8e809f6bb1a4c19ea1bd5070086`;
its immutable-envelope fingerprint is
`sha256:4c909946e9c86f2c07100e0245aa662d9493f376391052b3b54c7f93a2901b36`.
It contains 29 feature entries, five milestones, and 124 explicitly ordered
owned-path entries.

The candidate's prospective derived eligibility is exactly `Task140P`, while
its authoritative `eligibleFeatureIds` stays empty until the control-plane
approval and integration projection is registry-authenticated. At that point
the same checker reports exactly `Task140P` eligible. Its path ceiling is the
terminal CF-1R28.2 eleven-path set and its command is copied exactly from that
authority. Eligibility is a dependency-readiness result only. Task140P remains
unclaimed until a later registry event records its separate bounded lifecycle
authorization and dispatch bundle.

The successor pins the committed full-vision design, umbrella plan, CF-1
freeze, terminal CF-1 amendments, acceptance design, plan and matrix, Task140
prerequisite checker, the historical E1328 registry snapshot, and the exact
one-parent registry-only E1329 authorization commit. The failure inventory
remains 37 semantic failures owned by Task140R0, one by Task140R1, seven by
Task142, and eleven timeout-only occurrences owned by runner calibration.

Factory readiness is the non-circular trust root: it pins the selector digest,
the authenticated selector pins the active checker digest, and the checker
pins the immutable mission-envelope fingerprint. Feature progress requires
separate exact review and integration markers in uniquely named append-only
registry event sections. Milestone progress requires its exact registry marker
and member-integration ancestry plus independently resolved black-box and full-
gate evidence commits. All lifecycle event IDs are pairwise unique. The
control-plane status itself cannot become
`integrated` without the same approval-first, candidate-second, registry-bound
history proof. Syntactically plausible event IDs, reachable commits, duplicated
markers, or a downstream integrated state without its unlocking milestone fail
closed.

The final selector SHA-256 is
`3a65d4f16c668d1d740a12c219b5905f15f70b8329074f7f79e2bc1b677ce9e8`;
its authenticated active-checker SHA-256 is
`ba70a5a53978d8e369b445dde87b9d10ffee3356b8d3b237a57abf4d5323a023`.

## Test-first evidence

The first test-only execution was causally RED at **1 test / 0 passed / 1
failed** because `scripts/check-software-factory-active-mission.mjs` did not
exist. After the selector and checker became executable, the separate readiness
oracle was causally RED at **6 tests / 5 passed / 1 failed** because
`scripts/check-agent-readiness.mjs` still invoked the historical checker
directly. No product byte changed during either RED.

The first audit-correction execution was causally RED at **8 tests / 1 passed /
7 failed**. It exposed unauthenticated registry projection, milestone bypass,
the omitted acceptance-fixture work order, incorrect shared acceptance
ownership, and the self-asserted selector/checker chain. The corrected oracle
passes all eight cases, including isolated local-clone checker substitution and
selector mutation. No product byte changed during this correction.

Subsequent independent counterexample audits rejected candidate-state product
progress, reused or pre-existing event IDs, self-referential milestone proof,
and an orphan marker captured by a later heading. The same eight-test oracle
now proves the fixture-visible cases, while canonical topology additionally
requires the exact one-parent registry-only commit to introduce both its new
heading and marker as added lines absent from the parent. The stabilized suite
is **8 passed / 0 failed**.

The completed candidate must pass the eight black-box selector/readiness tests,
the unchanged historical mission suite, factory readiness, skill validation,
JSON parsing, exact graph/scope/fingerprint checks, whitespace checking, and
clean committed review. Fresh architecture and executability reviewers must
both approve the exact candidate bytes before coordinator integration.

## Factory V2 transition pause

This is a non-candidate preservation checkpoint requested on 2026-07-31. The
exact checkpoint base is merge
`75b69ecabedab18f81d477e62abd97aab3b03703`, tree
`88b55bf6e46048a671c1375fe8b715d91e5179b3`, with rejected-candidate first
parent `47c3e1a9f957a251ff2a4af2abc3e634b03fb36a` and E1331-authority second
parent `e1197ea2812ec819f9c3b4001453e0f9e3fd0a40`. Before this pause section,
the exact unstaged and uncommitted working-tree path list was only
`scripts/check-software-factory-active-mission.test.mjs`; the index was empty.
Its preserved working Git blob is
`008ad66c27c0df4aaf22e0593443309a60c01755` and its SHA-256 is
`3cc11c472462ecc86985ebff08d0baa868337eb22d1425884a0ed394caac6762`.

The base commit binds the remaining authorized draft paths at these exact Git
blobs:

- `AGENTS.md`: `ac6a9682f93a172a27deddda48e9921578dfb08b`;
- `.agents/skills/cestus-software-factory/SKILL.md`:
  `ca5fc5284bc12292278f2d45e18f72faa43a616a`;
- `docs/agentic/software-factory.md`:
  `0b4d71dc0dadda2f7eb9492948906d9751cbb8fb`;
- `docs/agentic/contracts/software-factory-active-mission.v1.json`:
  `46cc7d8bdf24c4a9adbc5c568d2d568b936aab50`;
- `docs/agentic/contracts/resident-agent-full-vision-mission-state.v1.json`:
  `c375489ef4da49f795c44cfee775d242551f37cf`;
- `scripts/check-software-factory-active-mission.mjs`:
  `bfb843ec808e1f0d9eafb1b592aedf85a18d68dd`;
- the pre-RED test blob:
  `f50c9193d5fce5ce054ea3f712756022a78d288f`;
- `scripts/check-agent-readiness.mjs`:
  `77b964027d2181b41eff37005b3311dfc5eb60ff`; and
- this claim before the pause:
  `c648dac695f070f31151b549793dd57845131e67`.

The active black-box command is intentionally RED at
**9 = eight passed + one causal failure**. Its complete local-Git topology
case observes `accepted / accepted / accepted` where exact-first-parent,
deterministic-merge-tree, and Task140P-scope rejection are required. This is
the E1331 defect oracle, not a passing candidate gate. On the same preserved
bytes, the canonical active checker exits zero with control-plane schema state
`candidate`, authoritative eligibility empty, and prospective Task140P only;
that schema output does not supersede E1331's rejected lifecycle state.
Historical calibration passes **20/20**, factory readiness passes, offline
skill validation passes, mission JSON parsing and `git diff --check` pass.
Typecheck and frozen V4 **20/20** passed on the immutable rejected candidate
recorded by E1330 but were not rerun after the E1331 authority merge and RED
overlay. Default `npm run verify` was not run during this checkpoint; E1328's
37 Task140R0, one Task140R1, seven Task142, and eleven runner-timeout
occurrences remain the only committed inventory.

Lifecycle remains `implementing`. These bytes are not a candidate, approved,
integrated, released, or authoritative successor mission. Task140P remains
unopened, and no Wave 3, provider, deployment, publication, repository-
closure, production-readiness, or release claim exists. A future Factory V2
session must begin from the preservation commit that contains this section
and decide explicitly whether to supersede, migrate, or resume this draft and
its E1331 topology RED; this checkpoint grants no implementation authority for
that decision.
