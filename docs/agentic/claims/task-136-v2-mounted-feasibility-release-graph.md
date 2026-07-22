# Task136 Bounded Assurance V2 Claim

Status: ready-for-review

Plan: `docs/superpowers/plans/2026-07-16-mounted-provider-feasibility-authority-recovery-implementation.md`
Task: Task 1, Migrate Task136 To Immutable V2
Program branch: `codex/resident-agent-full-vision-program-watchdog-recovery`
Worker: Codex Task136 v2 implementation worker
Claimed at: `2026-07-16T18:22:43Z`
Worktree: `/home/drake/.codex/worktrees/task136-bounded-assurance-v2` (detached at the exact approved base because the coordinator worktree owns the program branch)

Owned files:
- `docs/agentic/contracts/task136-bounded-assurance-v2.json`
- `scripts/resident-agent/assurance/task136-bounded-assurance.mjs`
- `scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs`
- `docs/agentic/claims/task-136-v2-mounted-feasibility-release-graph.md`

Exact authority:
- Program base: `2dbb697c43e1d638ec4050c5da25eb4fa5e74199`
- Approved design and plan: `020cb0ac9b30013ac7d5417735b4e6dc15efca67`
- Registry authority: `RV-1-E-602`
- The approved standing delegation explicitly authorizes task-scoped SDD and TDD for this task only.

Frozen v1 evidence:
- v1 contract blob: `558822735645741d755214c5a1644ca7e4a0add0`
- v1 contract SHA-256: `d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed`
- Task126 v4 record SHA-256: `1b1fc2171278866b38f6aa96889b822f22ab2abd34f460b304fe7fc2c3a0b58d`
- Task127 v4 record SHA-256: `18199ad9bfdcf3582ad13f6637bfbcc72949f1407271fa6c325612abcd226951`
- Task128 v4 record SHA-256: `fe29c10c5dbe3d8c1596f20db7b95b62df8dd98d379ade09d2ed85822ce51d92`

Scope limits:
- Preserve `task136-bounded-assurance-v1.json` byte-for-byte.
- Preserve the v4 mutable release-record schema and the three existing Task126/Task127/Task128 records byte-for-byte.
- Change only the frozen Task136 v2 contract, verifier, focused Node test, and this claim.
- Do not run full verification, integrations, release records, providers, network, credentials, external services, Task129-MFA implementation, Task129/Task130/Task135D/Task137A/Task137B-W/Task139 work, push, reset, or any `neo` action.

Verification evidence:
- RED: `node --test scripts/resident-agent/assurance/task136-bounded-assurance.test.mjs` failed `5/12`: the checker still loaded v1 with 28 cards, and the v2 contract was absent.
- GREEN: the identical command passed `12/12`.
- Contract markers: `29/1/20/29/1/15`.
- Graph fingerprint: `9e88c5f9fa12bac40a5df6cc3fc0cc6a2b1f14e0c1fc8ad30da1da61e76864ab`.
- `git diff --check` and `npm run factory:check` passed before candidate commit.
- Full verification was intentionally not run.
