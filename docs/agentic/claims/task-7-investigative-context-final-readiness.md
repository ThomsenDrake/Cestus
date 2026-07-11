# Task 7: Investigative Context Final Readiness

- Plan: `docs/superpowers/plans/2026-07-10-investigative-context-packs-implementation.md`
- Spec: `docs/superpowers/specs/2026-07-10-investigative-context-packs-design.md`
- Brief: `.superpowers/sdd/task-7-brief.md`
- Task: `Task 7: Final Factory Verification And Readiness Handoff`
- Worker: Codex
- Branch: `codex/task-4-accepted-graph-context-pack`
- Worktree: `/home/drake/.codex/worktrees/18b9/Cestus`
- Claimed at: `2026-07-11T00:15:24Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-7-investigative-context-final-readiness.md`
- `docs/agentic/software-factory.md`

## Scope

Run final investigative context-pack verification, append durable readiness evidence, and hand off the branch for final review. Do not edit runtime/orchestrator/cockpit/local-runtime wiring, prompt rendering, operational/PRR packs, specialist prompts, handoff projections, production code, or tests unless a verifier exposes a tiny task-relevant documentation/import issue.

## Verification Evidence

- Claim commit: `dc15af40 chore: claim investigative context final readiness`
- In-progress commit before readiness note: `db044f0f chore: mark investigative context final readiness in progress`
- Targeted package command: `npm test -- packages/agent/test/investigative-context-packs.test.ts` passed with 1 test file and 47 tests.
- Cross-package readiness command: `npm test -- packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts` passed with 4 test files and 127 tests.
- Full verification: `npm run verify` passed with typecheck, 176 test files passed and 3 skipped, 1912 tests passed and 3 skipped, Vite build, and factory readiness.
- Review status for Tasks 1-6: task claims are all marked `ready-for-review`; no final investigative-lane approval artifact is recorded before this Task 7 final review handoff.
- Runtime/orchestrator integration remains deferred to a narrow later task.

## Final Review Repair Evidence

- RED regression command: `npm test -- packages/agent/test/investigative-context-packs.test.ts` failed as expected with 10 failing tests and 47 passing tests. The failures covered over-limit selection manifests reaching readers, missing evidence ref high-water/budget metadata, missing optional evidence detail provenance, nested-only dependency metadata, non-ready readiness proof, and registry parser/ref scope or high-water divergence acceptance.
- Implemented repairs in `packages/agent/src/investigative-context-packs.ts` and `packages/agent/test/investigative-context-packs.test.ts` only. Runtime/orchestrator/cockpit/local-runtime wiring, prompt rendering, operational/PRR packs, specialist prompts, handoff projections, SQLite/filesystem/local-runtime imports, and portable workspace imports remain untouched.
- Targeted package command: `npm test -- packages/agent/test/investigative-context-packs.test.ts` passed with 1 test file and 57 tests.
- Cross-package readiness command: `npm test -- packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts` passed with 4 test files and 137 tests.
- Typecheck: `npm run typecheck` passed.
- Full verification: `npm run verify` passed with typecheck, 176 test files passed and 3 skipped, 1922 tests passed and 3 skipped, Vite build, and factory readiness.
- Whitespace: `git diff --check` passed with no output.
- Readiness proof now asserts `contextReady: true`, no missing investigative context pack IDs, no stale investigative context pack IDs, and no missing investigative projection high-water IDs.
