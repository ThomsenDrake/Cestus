# Task 6: Investigative Registration Readiness

- Plan: `docs/superpowers/plans/2026-07-10-investigative-context-packs-implementation.md`
- Spec: `docs/superpowers/specs/2026-07-10-investigative-context-packs-design.md`
- Brief: `.superpowers/sdd/task-6-brief.md`
- Task: `Task 6: Registration, Readiness, And Resolved Payload Verification`
- Worker: Codex
- Branch: `codex/task-4-accepted-graph-context-pack`
- Worktree: `/home/drake/.codex/worktrees/18b9/Cestus`
- Claimed at: `2026-07-11T00:01:49Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-6-investigative-registration-readiness.md`
- `packages/agent/src/investigative-context-packs.ts`
- `packages/agent/test/investigative-context-packs.test.ts`
- `packages/agent/src/index.ts`

## Scope

Implement only investigative context-pack registration, readiness proof through injected refs, resolved payload verification coverage, and package index export. Do not edit runtime/orchestrator/cockpit/local-runtime wiring, prompt rendering, operational/PRR packs, specialist prompts, or handoff projections.

## Verification Evidence

- RED: `npm test -- packages/agent/test/investigative-context-packs.test.ts -t "registers investigative|conflicting duplicate|specialist readiness|payload-only|payload hash|invalid shape"` failed with `registerInvestigativeContextPacks is not a function`.
- GREEN targeted: same command passed with 6 selected tests.
- Full investigative: `npm test -- packages/agent/test/investigative-context-packs.test.ts` passed with 47 tests.
- Relevant context-pack: `npm test -- packages/agent/test/context-packs.test.ts` passed with 48 tests.
- Typecheck: `npm run typecheck` passed.
- Full gate: `npm run verify` passed with 176 test files passed, 3 skipped; 1912 tests passed, 3 skipped; Vite build and factory readiness passed.
- Whitespace: `git diff --check` passed.
