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
