# Task Claim: Production Readiness Fallback Closure

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: `Task 4: Atomic Workflow Applicability, Readiness, And Fallback Closure`
- Worker: `Codex`
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Base commit: `01e68142`
- Claimed at: `2026-07-11T08:19:07Z`
- Status: `in-progress`

## Owned Files

- `docs/agentic/claims/task-4-production-readiness-fallback-closure.md`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/src/specialists.ts`
- `packages/agent/src/specialist-readiness.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/test/specialist-workflows.test.ts`
- `packages/agent/test/specialist-readiness.test.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`

## Scope

Close the production specialist provider prompt fallback atomically with
conditional PRR-context applicability, registry-owned resolved-payload
verification, and production prompt-readiness enforcement for all six
production run types.

## Planned Evidence

1. Add descriptor, readiness, and runner RED tests before production changes.
2. Run the Task 4 targeted RED command and record only safe failure summaries.
3. Implement the scoped atomic migration using the landed authoritative
   context-pack registry and production prompt renderer interfaces.
4. Run the targeted GREEN command, fallback search, and `npm run verify`.

## Stop Conditions

Stop and report blocked for an operational API mismatch, schema conflict,
prompt/payload/provider-response leakage, provider credential need, unsafe
external-effect semantics, or repeated verifier failure after two focused
repair attempts.
