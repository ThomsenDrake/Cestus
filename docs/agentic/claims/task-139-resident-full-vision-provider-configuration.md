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

## GREEN Evidence

- The preserved causal RED commit `92423e6d85f3e70ec1ba961afa34b7af1be28e8f`
  failed solely because this production module was absent.
- Coordinator-adjudicated GREEN-only fixture corrections replace the one
  credential-marker safe label and three credential-marker source-event IDs
  with secret-safe equivalents. The intentionally secret-bearing
  `Bearer secret value` rejection remains unchanged.
- `npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts`
  passed: 1 file / 4 tests. The configuration result is immutable data only and
  validates exact capability, credential-reference, endpoint-policy, current
  feasibility, model-scope, lane, provenance, and hostile-shape constraints.

## Authorized Repair RED

- Coordinator authorization: one causal repair RED followed by one minimal
  repair GREEN, preserving candidate `8aed2a4c32d4d38de8e3ad6ab1a7ca1374905884`
  and all earlier history.
- Production source remained byte-identical in RED:
  `167ccc7fdcaa1c52202c3a606bdc15dd4e95bd0b` both at `HEAD` and in the
  worktree.
- The focused command `npm test --
  packages/local-runtime/test/agent-provider-configuration.test.ts` failed
  causally with 1 failed file / 6 failed and 3 passed tests. The six failures
  prove the candidate admitted an extra unassessed model, unrelated feasibility
  provenance, `wss://10.0.0.1/socket` data-handling material, a missing BYOK
  transfer-approval diagnostic, an extra local API-key requirement, and lax
  official-harness classifications.
- Typed fixture helpers remove all focused-test TypeScript diagnostics. The RED
  `npm run typecheck` output contains only the two known production narrowing
  diagnostics in `agent-provider-configuration.ts`.
