# Task 3: Deterministic Production Renderers

- Plan: `.superpowers/sdd/task-3-brief.md`
- Task: Task 3: Deterministic Production Renderers
- Worker: Codex
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at: 2026-07-11T00:00:00Z
- Status: ready-for-review

## Owned Files

- `packages/agent/src/production-specialist-prompts.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `docs/agentic/claims/task-3-production-specialist-renderers.md`

## Evidence

- Claim created before Task 3 test or renderer changes.
- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed as expected because renderer exports are absent.
- Audit RED: the targeted suite reported 2 expected failures for task-bound scope applicability and registered output/authority instructions.
- GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 test file and 48 tests.
- Verify: `npm run verify` passed typecheck, 178 test files with 3 skipped, 2004 tests with 3 skipped, the UI production build, and factory readiness.
- Boundary review: deterministic tests are credential-free; durable evidence records no production prompt text or resolved payload content.
