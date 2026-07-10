# Task 5: Governance Locks Builder

- Plan: `docs/superpowers/plans/2026-07-10-investigative-context-packs-implementation.md`
- Brief: `.superpowers/sdd/task-5-brief.md`
- Task: `Task 5: Governance Locks Builder`
- Worker: Codex
- Branch: `codex/task-4-accepted-graph-context-pack`
- Worktree: `/home/drake/.codex/worktrees/18b9/Cestus`
- Claimed at: `2026-07-10T23:40:48Z`
- Status: `in-progress`

## Owned Files

- `docs/agentic/claims/task-5-governance-locks-context-pack.md`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/test/investigative-context-packs.test.ts`
- `.superpowers/sdd/task-5-report.md`

## Scope

Implement only `buildGovernanceLocksContextPack`, resident-agent lock and governance posture reader row interfaces, and the strict `governanceLocksPayloadParser`. Do not implement registration/readiness, package index export, prompt rendering, runtime/orchestrator/cockpit/local-runtime wiring, operational/PRR packs, specialist prompts, or handoff projections.
