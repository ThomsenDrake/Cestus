# Task 4 Claim: MVP Specialist Scheduler Readiness

- Plan/brief: `.superpowers/sdd/task-4-brief.md`
- Design spec: `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
- Task heading: Task 4: Scheduler And Context Readiness Bridge
- Worker identity: Codex GPT-5
- Branch: `codex/mvp-specialist-workflows-plan`
- Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
- Claimed at: 2026-07-10T00:20:23Z
- Status: completed

## Owned Files

- `docs/agentic/claims/task-4-mvp-specialist-scheduler-readiness.md`
- `packages/agent/src/specialist-readiness.ts`
- `packages/agent/test/specialist-readiness.test.ts`
- `packages/agent/src/index.ts`
- `.superpowers/sdd/task-4-report.md`

## Prerequisite Proof

- Current branch head supplied by coordinator: `c1dd460`
- Scheduler/resumer contracts read:
  - `packages/agent/src/scheduler-types.ts`
  - `packages/agent/src/scheduler.ts`
  - `packages/agent/test/scheduler-types.test.ts`
- Domain adapter contracts read:
  - `packages/agent/src/domain-execution-adapter-registry.ts`
  - `packages/agent/src/domain-execution-dispatcher.ts`
- Existing exported contract IDs used by workflow descriptors:
  - `agent.scheduler-resumer.v1`
  - `agent.domain-adapter.v1`

## TDD Evidence

- RED targeted command:
  - `npm test -- packages/agent/test/specialist-readiness.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/specialist-workflows.test.ts`
  - Result: failed as expected with `TypeError: projectSpecialistWorkflowReadiness is not a function` in all new readiness tests; adjacent scheduler/workflow tests passed.
- GREEN targeted command:
  - `npm test -- packages/agent/test/specialist-readiness.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/specialist-workflows.test.ts`
  - Result: passed, 3 files / 40 tests.
- Full verification:
  - `npm run verify`
  - Result: `typecheck passed`; repo-wide tests then failed on sandbox `listen EPERM` restrictions for `127.0.0.1`, `0.0.0.0`, and `/tmp/tsx-1000/*.pipe`.
- Factory readiness:
  - `npm run factory:check`
  - Result: failed in sandbox with `spawnSync git EPERM` while `scripts/check-agent-readiness.mjs` ran `git ls-files`.

## Review Findings And Fixes

- First follow-up review found two important issues:
  - Direct `{ cards }` provider readiness input could accept malformed provider cards and incorrectly satisfy provider readiness.
  - Public readiness DTO string fields could accept command-shaped action text inside allowed fields.
- Fixes applied:
  - Direct provider card inputs are parsed through `providerSetupCardSchema` before readiness evaluation.
  - Public readiness string validation now rejects executable command-shaped text.
  - Added regression coverage for malformed direct provider cards and command-shaped public action strings.
- Follow-up review result:
  - No findings.
  - Spec compliance: approved apart from known sandbox limits.
  - Code quality: approved apart from known sandbox limits.

## Final Local Verification

- Completed at: 2026-07-10T00:42:11Z
- Focused targeted command:
  - `npm test -- packages/agent/test/specialist-readiness.test.ts packages/agent/test/scheduler-types.test.ts packages/agent/test/specialist-workflows.test.ts`
  - Result: passed, 3 files / 55 tests.
- Typecheck:
  - `npm run typecheck`
  - Result: passed.
- Diff hygiene:
  - `git diff --check`
  - Result: passed.
- Full verification:
  - `npm run verify`
  - Result: typecheck passed, then repo-wide tests failed in the managed sandbox.
  - Final summary: 3 failed files, 158 passed files, 1 skipped; 19 failed tests, 1611 passed tests, 1 skipped.
  - Failure classes:
    - `packages/local-runtime/test/server.test.ts`: `listen EPERM: operation not permitted 127.0.0.1` and `0.0.0.0`.
    - `packages/local-runtime/test/workspace-readiness-smoke.test.ts`: parseable JSON smoke failed after sandbox-blocked executable output.
    - `packages/workspace-ops/test/cli.test.ts`: `listen EPERM: operation not permitted /tmp/tsx-1000/*.pipe`, plus expected JSON/error-code assertions receiving sandbox startup failures.
- Factory readiness:
  - `npm run factory:check`
  - Result: failed in the managed sandbox with `spawnSync git EPERM` while `scripts/check-agent-readiness.mjs` ran `git ls-files`.

## Coordinator Verification

- Completed at: 2026-07-09T20:47:30-04:00
- Unrestricted command: `npm run verify`
- Result: passed.
- Test summary: 161 passed files, 1 skipped; 1630 passed tests, 1 skipped.
- Build: passed.
- Factory readiness: passed.
