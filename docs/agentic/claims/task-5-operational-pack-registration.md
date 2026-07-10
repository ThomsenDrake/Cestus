# Task 5 Claim: Operational Pack Registration And Readiness Handoff

- Plan: `docs/superpowers/plans/2026-07-10-operational-context-packs-implementation.md`
- Task: Task 5: Registration And Readiness Handoff
- Worker: Codex
- Branch: `codex/operational-context-packs-spec`
- Worktree: `/home/drake/.codex/worktrees/a559/Cestus`
- Claimed at: `2026-07-10T16:54:10Z`
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-5-operational-pack-registration.md`
- `packages/agent/src/operational-context-packs.ts`
- `packages/agent/test/operational-context-packs.test.ts`

## Constraints

- Keep registration deterministic, idempotent for equivalent provider metadata,
  and fail closed with `blocked.conflicting-registration` on conflicts.
- Use only bounded async provider methods; do not require an `AgentProjection`.
- Do not edit local-runtime, cockpit, prompt, UI, PRR, evidence, graph, or
  orchestrator integration files.
- Record RED, GREEN, and full verification evidence before ready-for-review.

## Resolved Blocker

Task 1's current `ContextPackRegistry` requires every listed
`requiredProvenanceKinds` entry. Task 2's operational history and memory
descriptors list both `event-id` and `empty-projection`, although their
builders correctly produce event provenance for non-empty snapshots and
empty-projection provenance for proven-empty snapshots. Consequently,
`registry.build()` rejects every non-empty operational history or memory pack
before Task 5 can satisfy its registered-builder contract. Resolving this
is resolved by the approved Task 5 operational descriptor-local
`operational-source-proof` marker. The Task 1 registry remains unchanged.

## Evidence

- RED targeted test: `npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts` failed as expected because the Task 5 helper exports were missing.
- Scope-restored targeted test: the same command fails with `Context pack task-run-history.v1 is missing required provenance kind empty-projection` after restoring the unowned Task 1 registry file.
- Resolution RED: the targeted command failed with the expected absent `operational-source-proof` markers before the Task 5 descriptor revision.
- GREEN targeted test: `npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts` passed with 2 test files and 44 tests.
- Full verification: `npm run verify` completed successfully after `typecheck passed`.
- Scope check: `git diff --check` passed; the implementation changes only `packages/agent/src/operational-context-packs.ts` and `packages/agent/test/operational-context-packs.test.ts`.
- Review repair RED: the targeted command failed because the canonical operational memory wrapper was absent and fresh registration accepted a provider that omitted a declared capability.
- Review repair GREEN: `npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts` passed with 2 test files and 44 tests.
- Review repair full verification: `npm run verify` completed successfully after `typecheck passed`.
- Re-review targeted test: added `expect(registeredMemory).toEqual(directMemory)` and the required targeted command passed with 2 test files and 44 tests.
- Re-review full verification: `npm run verify` completed successfully after `typecheck passed`.
