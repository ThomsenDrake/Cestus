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
