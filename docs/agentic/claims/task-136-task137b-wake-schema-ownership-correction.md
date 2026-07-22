# Task 136 V3 Wake Schema Ownership Correction Claim

Status: ready-for-review

Plan: `docs/superpowers/plans/2026-07-16-task137b-wake-schema-ownership-correction-implementation.md`
Task: Task 1, Migrate The Finite Assurance Contract To V3
Branch: `codex/task136-v3-task137b-wake-schema-transfer`
Worker: Codex
Claimed at: `2026-07-16T00:00:00Z`
Worktree: `/home/drake/.codex/worktrees/task136-v3-task137b-wake-schema-transfer/Cestus`

Owned files:
- `docs/agentic/contracts/task136-bounded-assurance-v3.json`
- `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- `docs/agentic/claims/task-136-task137b-wake-schema-ownership-correction.md`

Exact dispatch and approvals:
- Dispatch base: `c7397e7153079f65f17153fd8d2dc55b6ad8c7b6`
- Design revision: `781ae56525692a23a15f5979d926e29c0b35d40c`
- Design blob: `923ce77a474de3356d31c05e40f56a5ff88d1a25`
- Plan revision: `41350ae9e061aab662c85d8d500a69447952ac84`
- Plan blob: `c3154b878441f1dbc5a9313715421f330ef46348`
- Registry authority: `RV-1-E-662` through `RV-1-E-669`; `RV-1-E-669` authorizes only this task-scoped V3 migration after exact-revision dual approval.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this implementation.

Immutable inputs:
- `docs/agentic/contracts/task136-bounded-assurance-v1.json` SHA-256: `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed`
- `docs/agentic/contracts/task136-bounded-assurance-v2.json` SHA-256: `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4`
- V1 and V2 are byte-for-byte immutable.

Bounded scope and prohibitions:
- Preserve the 29-card order, every non-Task137B-W command, the composition grammar and corpus, ABI corpus, and mutable `task136-dispatch-release.v4` record schema.
- Do not edit the program registry, append or rewrite release records, implement Task 2 or Task 3, implement Task139, or integrate this branch.
- Do not run full `npm run verify`.
- Do not use providers, network, credentials, live APIs, or external services.
- Do not merge, push, reset, rebase, or touch `neo`.
- Coordinator-only integration occurs only after committed-byte admission and two fresh exact-candidate reviews with literal unqualified **APPROVED** verdicts.
- Repository mode is expected to exit nonzero only after the ordered ten-record/ten-command prefix marker and incomplete-closure result.

Implementation evidence:
- RED: `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` exited `1` with `14` tests, `11` passing, and the three intended v3/default-contract and missing-prefix-admission failures.
- GREEN: the same command passed `14/14` tests.
- Contract markers: `TASK136_RELEASE_GRAPH_OK records=29`, `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`, `TASK136_COMMAND_CARDS_OK cards=29`, and `TASK136_ABI_CORPUS_OK green=1 red=15` each emitted once.
- Self-review: v3 retains a single explicit historical tuple, pins its compact JSON SHA-256 before disposition relaxation, and emits the prefix marker only after prefix Git evidence, commands, and checkout recheck succeed.
