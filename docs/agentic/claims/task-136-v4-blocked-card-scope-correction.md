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
