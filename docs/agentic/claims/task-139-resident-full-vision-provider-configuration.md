# Task139-P1 — Resident Full-Vision Provider Configuration

## Claim

- Status: in-progress.
- Card: `Task139-P1`.
- Exact base: `0ba731d3845706dcb0fc0cf0f47726c9d7229e55`.
- Branch: `codex/task139-p1-provider-configuration`.
- Worktree: `/home/drake/.codex/worktrees/e06e/Cestus`.
- Authority: `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md`, `docs/agentic/contracts/task136-bounded-assurance-v4.json`, and `docs/agentic/resident-agent-full-vision-contract-freeze.md`.
- Owned paths:
  - `packages/local-runtime/src/agent-provider-configuration.ts`
  - `packages/local-runtime/test/agent-provider-configuration.test.ts`
  - `docs/agentic/claims/task-139-resident-full-vision-provider-configuration.md`

Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

## Frozen Scope

P1 is credential-free, data-only configuration normalization. It must not mint,
export, or structurally emulate the Task126 current-posture reader or any
mounted authority; Task139-PM solely owns that later mounted-authority adapter.
It performs no provider/network call, secret resolution, ledger or portable
write, factory mutation, process-global registration, readiness authority mint,
or fallback.
