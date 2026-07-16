# Task 136 Release Closure Verifier Claim

Status: in-progress

Plan: `docs/superpowers/plans/2026-07-16-task136-release-closure-implementation.md`
Task: Task 1, Implement Strict Release Closure
Branch: `codex/task136-release-closure-verifier`
Worker: Codex
Claimed at: `2026-07-16T16:11:03Z`
Worktree: `/home/drake/.codex/worktrees/2bc5/Cestus`

Owned files:
- `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- `docs/agentic/claims/task-136-release-closure-verifier.md`

Exact base and approval:
- Program base: `af8560d7e7cf92a2f3555064150156cbc7e5e6c7`
- Delegation source task: `019f1977-134e-7222-8fbe-4435144ba673`
- Registry authority: `RV-1-E-570` through `RV-1-E-573`
- Implementation approval: `RV-1-E-573` authorizes the three-file verifier implementation, task-scoped subagent-driven development when relevant, test-driven development, verification before completion, fresh exact-candidate reviews, and coordinator-only integration.

Approved documents:
- Design: `docs/superpowers/specs/2026-07-16-task136-release-closure-design.md`
- Design blob at base: `cc649ad388d7f723ab4433fc0d70651a66e18d84`
- Plan: `docs/superpowers/plans/2026-07-16-task136-release-closure-implementation.md`
- Plan blob at base: `6d34594cc3d81191a2778d897a85dfa1fcb4964b`

Frozen contract:
- Contract file: `docs/agentic/contracts/task136-bounded-assurance-v1.json`
- Contract blob at base: `558822735645741d755214c5a1644ca7e4a0add0`
- Release graph version: `task136-release-graph.v1`
- Release graph card count: `28`
- Release graph hash: `07e5f070a3657694a63d80bcdf3d69be087418a235d77e6875e604d9636ce83f`
- Existing contract markers to preserve:
  - `TASK136_RELEASE_GRAPH_OK records=28`
  - `TASK136_COMPOSITION_CORPUS_OK green=1 red=20`
  - `TASK136_COMMAND_CARDS_OK cards=28`
  - `TASK136_ABI_CORPUS_OK green=1 red=15`

Scope limits:
- Do not edit the program registry or append release records.
- Do not dispatch or resume Task139.
- Do not integrate, push, use external services, touch `neo`, or self-release any card.
- Repository mode is expected to fail until coordinator-owned release records exist.
