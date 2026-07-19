# Task136 V4 Blocked-Card Scope Correction Claim

## Status

- `claimed` at `2026-07-17T20:25:02Z` UTC.
- `implementing` at `2026-07-17T20:25:02Z` UTC.

## Assignment

- Task: Task 1, “Amend and pin the executable V4 scope,” from
  `docs/superpowers/plans/2026-07-17-task136-v4-blocked-card-scope-correction-implementation.md`.
- Governing design:
  `docs/superpowers/specs/2026-07-17-task136-v4-blocked-card-scope-correction-design.md`.
- Related V4 authority-transfer design and plan:
  `docs/superpowers/specs/2026-07-17-task136-v4-task137b-authority-transfer-design.md`
  and
  `docs/superpowers/plans/2026-07-17-task136-v4-task137b-authority-transfer-implementation.md`.
- Worktree: `/home/drake/.codex/worktrees/377f/Cestus`.
- Branch: `codex/task136-v4-blocked-card-scope-correction`.
- Task-plan reference base: `a5c192842bbedb4dc7801bedf8908c025dc33dfb`.
- Audited execution base: `dbe9fea17bc2eb0a9a3c8c5661dcc5f6e00f5dfb`.
- Worker model and reasoning: GPT-5.6 Terra with xhigh reasoning.

## Exclusive owned files

1. `docs/agentic/contracts/task136-bounded-assurance-v4.json`
2. `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
3. `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
4. `docs/agentic/claims/task-136-v4-blocked-card-scope-correction.md`

## Immutable inputs

- `task136-bounded-assurance-v1.json`:
  `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed`
- `task136-bounded-assurance-v2.json`:
  `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4`
- `task136-bounded-assurance-v3.json`:
  `8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb`
- The first 13 raw V4 release records, graph IDs/order, prerequisites,
  schema/graph versions, composition grammar/corpus, ABI corpus, and release
  compatibility are immutable for this amendment.

## Authorization and constraints

Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

This task uses a causal RED before the minimal GREEN. It changes only the two
unreleased card scope/command projections, their assurance fingerprint, and
the exact tests and checker guards needed to prove that correction. No program
registry edit, integration, strict release record, push, `neo` action,
network/provider/credential/external-service access, reset, rebase, amend,
squash, discard, or history rewrite is authorized. The ledger remains
append-only; provenance and projection rebuildability are unchanged.

## Pre-edit audit

- `HEAD`: `dbe9fea17bc2eb0a9a3c8c5661dcc5f6e00f5dfb`.
- Starting status: clean.
- `node_modules`: real non-symlinked directory.
- `node_modules/.bin/vitest`: executable (`vitest/4.1.9 linux-x64 node-v26.1.0`).

## Pending evidence

The following commits will be retained independently: this claim; a test-only
causal RED; then the minimal contract/checker GREEN. Final evidence will pin
the corrected fingerprint, pretty-JSON SHA-256, exact commands, targeted and
repository-mode results, factory/verify gates, and clean state.

## Causal RED prepared

The RED test defines the design's exact ordered CF1-HR and G136-SC path and
command projections, proves the immutable V1-V3 hashes and raw records 1-13,
and introduces one-fact missing, extra, reordered, wrong-disposition, and
command-omission mutants. The inherited test's stale ten-record expectation is
updated to the already-authoritative 13-record prefix so the observed RED is
only the pre-correction CF1-HR/G136-SC scope mismatch.

Baseline root-cause evidence: before the RED, the focused suite failed because
the registry already has records 11-13 while an inherited assertion still
required ten. The first RED run exposed one additional inherited assertion
that incorrectly expected the released Task137A source to remain the current
head owner after record 11; its correct failure boundary is Task137B-W. Both
test-only corrections align the existing test with immutable released evidence
without changing a contract or checker byte.

## Causal RED observed

Command:

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Result: exit `1`; `16` tests ran, `15` passed, and exactly one failed. The
failure is `requires the corrected CF1-HR and G136-SC ownership and command
projections`: the old contract supplies only the prior five CF1-HR paths
instead of the approved ordered fourteen-path list. This proves the test
detects the authorized scope defect before any contract or checker GREEN.

## Forward RED extension for RV-1-E-697

Coordinator adjudication `RV-1-E-697` (registry commit `cf5487a0`) is carried
by design/plan correction `0c516cded13099952bf133382ed7782316dbb390`. The
test-only forward extension now requires the sole Task137B-W-to-CF1 transfer:
`packages/ontology/src/contracts.ts` is transferred by Task137B-W to its exact
`[CF1-HR]` target, and the third ordered historical compatibility entry pins
Task137B-W record 11's canonical SHA-256
`833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29`
with that historical path still `owned`. It adds wrong-disposition,
wrong-target, and wrong-compatibility-hash one-fact mutants. This is a forward
RED extension only; no repair is consumed and no contract/checker byte changes
until its failure is observed.

Command:

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Result: exit `1`; `16` tests, `14` passed, and exactly `2` failed. The
original CF1-HR exact-path failure remains, and the new frozen compatibility
test fails only because current V4 has two entries instead of the required
ordered third Task137B-W entry. No unrelated test failed.

## Forward RED extension for RV-1-E-700

Coordinator correction `f771f80476eb6b8e780734cbb3d967c72d3a831a` under
registry event `RV-1-E-700` / `c2358c5a50cd65c7b2817c7288826a68524f2ae6`
authorizes only the remaining exact direct-source mapping: Task135B's two
portable-mounted-store paths, Task129-MFA's `agent-contracts.test.ts`, and the
previously authorized Task137B-W `contracts.ts` path transfer only to CF1-HR.
The test extension requires CF1-HR's exact five prerequisites, preserves
Task129-MFA's existing Task137B-W transfers, pins the ordered four-entry
historical compatibility sequence, and proves source-current-HEAD behavior
before record 14 versus CF1-HR-current behavior at record 14. It adds only
source-and-target-specific mutants and does not generalize transfer semantics.

Command:

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Result: exit `1`; `17` tests, `14` passed, and exactly `3` failed. The failures
are the missing CF1-HR `Task135B`/`Task129-MFA` prerequisites, the absent
ordered Task129-MFA-path expansion plus Task135B/Task137B-W compatibility
entries, and source current-HEAD enforcement after a simulated CF1-HR record
14. These are the newly authorized correction facts; no unrelated test failed.

## Minimal GREEN evidence

The minimal GREEN implements only the three source-and-target-specific mappings
authorized by `f771f80476eb6b8e780734cbb3d967c72d3a831a`:

- `Task135B -> CF1-HR`: the two portable mounted-store paths;
- `Task129-MFA -> CF1-HR`: `packages/ontology/test/agent-contracts.test.ts`,
  while retaining its five existing `Task137B-W` transfers;
- `Task137B-W -> CF1-HR`: `packages/ontology/src/contracts.ts`.

It pins the ordered four-entry historical compatibility set, preserves raw
records 1-13 and the V1/V2/V3 pins, and activates only the original Task137A
and Task129-MFA groups at record 11 plus these three direct CF1-HR groups at
record 14. The checker uses this finite mapping; it has no transitive or
all-target transfer fallback.

- V4 pretty-JSON SHA-256:
  `063f11d0897eab07b4a99e977781a4a843434795df730b61e88dacbcd83e1e93`.
- V4 canonical assurance fingerprint:
  `413eee42f5311deca2a0681752d011ccf7bccb8f99a59cf1dbdbd19189201631`.
- Focused assurance command exited `0`: `17` tests passed, `0` failed.
- Contract mode exited `0` with `records=29`, composition `green=1 red=20`,
  command cards `29`, and ABI corpus `green=1 red=15`.
- `npm run typecheck` exited `0` (`typecheck passed`) and
  `npm run factory:check` exited `0` (`factory-readiness passed`).
- `git diff --check` exited `0`; the dependency audit confirms real,
  non-symlinked `node_modules` and executable local Vitest `4.1.9`.

## Consolidated RV-1-E-701 / RV-1-E-702 evidence repair

Candidate status: ready-for-review.

This is the one consolidated evidence repair authorized by `RV-1-E-701`
(`ee8e1c354b449826781b0a301103d705b40a6b8e`) and its append-only forward
position `RV-1-E-702` (`3ce1e632a38eb2455101442589bc0f68b15b2b9d`). It
does not change the V4 contract or checker. Every prerequisite except CF1-HR remains unchanged.
The three exact direct-source transfer groups remain
`Task135B -> CF1-HR`, `Task129-MFA -> CF1-HR`, and
`Task137B-W -> CF1-HR`; the historical compatibility amendment remains the
ordered Task137A, expanded Task129-MFA, Task135B, and Task137B-W sequence.

Ordered committed evidence before this claim-only candidate addition:

1. `9801dbc01a660d581c4c2270efd2e844e24ee5cf` claim.
2. `760569643fd533262de0051884fbc1bc8a4bb515` causal RED.
3. `24669b1b58917e461ae54e21435b17f6c3c9fb60` first forward RED extension.
4. `fda9e55a9a1a32ef81752fd4da0c0a463b2bbceb` final forward RED extension.
5. `a9c7172ccd2b56bc4a9d5fcffedc68823f56987d` contract/checker GREEN.
6. `aacbe5e13c88dd6b3a9808a0a14091fe5ad731b2` assurance-pin evidence fix.
7. `aa19cad901d1c88c1f46b14ed1fc18dc4ae59eec` causal claim-evidence RED.

The causal claim-evidence RED command was:

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

It exited `1`: `17` existing tests passed and the sole eighteenth test failed
only because this durable claim lacked the required final evidence. No contract
or checker byte changed before this claim-only GREEN.

Final committed-byte gate commands and results are exact:

```bash
node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs
```

Exit `0`: `18` passed, `0` failed.

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
```

Exit `0`:

```text
TASK136_RELEASE_GRAPH_OK records=29
TASK136_COMPOSITION_CORPUS_OK green=1 red=20
TASK136_COMMAND_CARDS_OK cards=29
TASK136_ABI_CORPUS_OK green=1 red=15
```

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
```

The required nonzero closure result follows the literal prefix marker, and no
earlier failure occurs:

```text
TASK136_REPOSITORY_PREFIX_OK records=13 commands=13
repository release closure incomplete: expected 29 records, found 13
```

```bash
npm run typecheck
npm run verify
```

`npm run typecheck` exits `0`: `typecheck passed`. `npm run verify` is
inherited non-green differential evidence, not a green result. The clean
inherited record-13 baseline and repeat candidate have exactly
`12 failed | 211 passed | 3 skipped (226)` files and
`69 failed | 2695 passed | 5 skipped (2769)` tests, with no added failure.
The named failing files are
`packages/agent/test/evidence-triage-workflow.test.ts`,
`packages/agent/test/investigation-planner-workflow.test.ts`,
`packages/agent/test/prr-negotiation-workflow.test.ts`,
`packages/local-runtime/test/agent-approval-routes.test.ts`,
`packages/local-runtime/test/agent-cockpit-routes.test.ts`,
`packages/local-runtime/test/agent-http-routes.test.ts`,
`packages/local-runtime/test/agent-memory-routes.test.ts`,
`packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`,
`packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`,
`packages/local-runtime/test/check-resident-task-prerequisites.test.ts`,
`packages/local-runtime/test/cli.test.ts`, and
`packages/local-runtime/test/server.test.ts`.

The first timing-variable candidate pass accurately reported the same 12 files
and `68 failed | 2696 passed | 5 skipped (2769)` tests because one inherited
prerequisite timeout did not trigger. That first timing-variable candidate pass
is not green and is not the acceptance result; the repeat exact 69-test
signature is the differential evidence.

```bash
git diff --check dbe9fea17bc2eb0a9a3c8c5661dcc5f6e00f5dfb..HEAD
npm run factory:check
test -d node_modules && test ! -L node_modules && test -x node_modules/.bin/vitest
git status --porcelain=v1 --untracked-files=all
```

`git diff --check` exits `0`; `npm run factory:check` reports
`factory-readiness passed`; the dependency command confirms real,
non-symlinked `node_modules` and executable local Vitest `4.1.9`; and the
final status command has empty output: clean tracked and untracked state.
The cumulative implementation source scope is exactly the four owned files:
the V4 contract, its checker, its focused assurance test, and this claim.

## RV-1-E-754 direct Task137B-W to Task139-PM correction

- Status: `claimed -> implementing` at the exact clean base
  `e6b3a0060d0929b436f630bad74ac8668f72d6a5` on
  `codex/task136-v4-task139-pm-direct-source-ownership`.
- Authority: registry event `RV-1-E-754`; strict release prefix is 17 and
  Task139-PM is absent. This is a finite direct-source correction only: the
  existing Task137B-W `contracts.ts -> CF1-HR` mapping remains, while exactly
  the released mounted-operation source, its import-policy test, and the
  Task137 authority-boundary policy test move directly to Task139-PM.
- The causal RED retains contract and checker bytes unchanged. It updates the
  stale test fixture from the released 13-record boundary to the actual pinned
  raw 17-record prefix, then requires Task139-PM's appended Task137B-W
  prerequisite, exact two targets, source/target dispositions, command,
  historical record-11 compatibility, and source-before/target-at-record-18
  current-head behavior. Its mutations reject missing, extra, reordered,
  wrong-target, transitive, generic, command, and historical-path changes.
- Planned exact command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Stop rules: no contract/checker GREEN until the causal test failure is
  observed; stop for an immutable raw-record, V1-V3, scope, dependency, or
  repeated-verifier conflict. No registry, PM, provider, credential, network,
  `neo`, integration, merge, push, or review action is authorized.

## RV-1-E-755 changed-counterfactual RED correction

- `RV-1-E-755` preserves first RED `f1524c3a780576e851d537d13f95fb7f9e1a5c28`
  and authorizes this forward claim/test-only counterfactual after registry-only
  merge `7bee7ea13768fcbf3da55588f7b889faf933444a`.
- The correction replaces only the two obsolete single-target Task137B-W
  transfer/disposition assertions with the finite ordered
  `["CF1-HR", "Task139-PM"]` mapping: `contracts.ts` remains the CF1-HR
  path, and exactly the mounted-operation source, import-policy test, and
  authority-boundary policy test are transferred to Task139-PM. The record-11
  historical compatibility assertion expands to those same four historically
  owned paths. The first RED's exact mutations, current-head simulation, and
  raw-17 compatibility coverage remain intact.
- Contract and checker bytes remain unchanged for this forward RED. The
  required command is `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`; only
  the absent finite contract/checker mapping may cause its observed failure.

Observed RED result: exit `1`; `19` tests ran, `18` passed, and exactly one
failed: `requires the finite Task137B-W to Task139-PM transfer only at record
18`. The direct cause is the missing appended `Task137B-W` prerequisite from
the current Task139-PM contract card. No contract or checker bytes changed.

## RV-1-E-756 complete future-pin audit RED

- `RV-1-E-756` preserves both prior REDs and requires one complete test-pin
  audit before the intended GREEN stash is applied. The audited future pins are
  V4 SHA-256 `2a5cf62b1fb02d47aa01329b485c76f399585802f26669cce977b66e5bd7f86b`
  and assurance fingerprint
  `47cfd213bae941aef69673c7afd633a4fea84d176fbbbdaf5dcefdf716fc19a0`.
- The only V3 command-parity exception added is `Task139-PM`; its command is
  the finite two-test projection required by RV-1-E-754. All existing
  Task137B-W target/disposition, PM prerequisite/scope/command, historical
  record-11 compatibility, raw-record-1-through-17, and record-count-17/18
  assertions were audited and retained without weakening.
- This forward RED changes only this claim and the assurance test. The named
  intended-GREEN stash is read-only until this causal failure is recorded;
  contract and checker remain byte-identical at RED HEAD.

Observed RED result: exit `1`; `19` tests ran, `16` passed, and exactly three
failed assertions. They are all future-pin deltas against unchanged production
bytes: V4 file SHA (`063f11d…` versus `2a5cf62b…`), assurance fingerprint
(`413eee…` versus `47cfd2…`), and the missing Task139-PM `Task137B-W`
prerequisite. No syntax, fixture, dependency, raw-record, or contradictory
expectation failure occurred.

## RV-1-E-754 / RV-1-E-756 minimal GREEN

- Applied (without dropping) the named intended-GREEN stash after the complete
  pin-audit RED. Its sole correction was the audited checker fingerprint
  `47cfd213bae941aef69673c7afd633a4fea84d176fbbbdaf5dcefdf716fc19a0`;
  the V4 pretty-JSON SHA-256 is
  `2a5cf62b1fb02d47aa01329b485c76f399585802f26669cce977b66e5bd7f86b`.
- GREEN makes only the finite direct Task137B-W mappings: `contracts.ts` stays
  transferred to CF1-HR; the mounted-operation source, import-policy test, and
  authority-boundary policy test transfer to Task139-PM. Task139-PM appends
  Task137B-W after T120-R, owns exactly those three transferred paths, and has
  the exact two-test command. No generic or transitive transfer rule exists.
- The checker pins raw records 1-17, preserves V1-V3 and the 29-card order,
  keeps Task137B-W source HEAD authoritative before record 18, and changes
  current ownership only for those three paths when Task139-PM record 18
  exists. Record 11 compatibility retains canonical SHA-256
  `833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29`
  with all four historical paths disposition `owned`.
- From intended GREEN bytes, `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited
  `0`: `19` passed, `0` failed. The forward RED test blob is byte-identical;
  the named stash remains preserved as required.

## RV-1-E-849 record-25 fixture causal RED

- Status: `claimed -> implementing` after normal forward merge
  `c4c67c00872b66dad07507e605dc3801f278f983` of coordinator authority
  `8357a9fe68217319dfdbceeba6b7a85b9e617d1e` into
  `codex/task136-v4-task139-pm-direct-source-ownership`.
- The merged assurance-test blob is
  `261bfb8fcf81937ddf7ed4c23db9464d7df70852`; this causal checkpoint changes
  no assurance-test, contract, checker, V1-V3, raw-record, or runtime byte.
- Command: `node --test
  scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`.
  Observed result: exit `1`; `19` tests ran, `17` passed, `2` failed, and
  no test was skipped. The only failures are current-prefix assertions at
  lines `1112` and `1428`, each observing strict record prefix `25` against
  the stale expected value `24` (`25 !== 24`).
- RV-1-E-849 establishes the direct cause: strict record-25 repository mode
  emits `TASK136_REPOSITORY_PREFIX_OK records=25 commands=25`, followed only
  by `repository release closure incomplete: expected 29 records, found 25`.
  The finite GREEN may therefore update only the two current strict-prefix
  fixture groups and their coupled repository expectations from `24` to `25`.
  Historical/pre-activation fixtures and all immutable assurance inputs remain
  unchanged. Stop for any scope, raw-record, V1-V4, dependency, or verifier
  conflict; no registry, review, integration, push, external, or `neo` action
  is authorized here.
