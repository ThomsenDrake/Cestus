# Task 136 V3 Wake Schema Ownership Correction Claim

Status: in-progress

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
