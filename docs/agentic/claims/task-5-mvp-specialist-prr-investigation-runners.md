# Task 5 Claim: MVP Specialist PRR And Investigation Runners

- Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
- Design spec: `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
- Task heading: Task 5: PRR Negotiation And Investigation Planner Runners
- Worker identity: Codex GPT-5
- Branch: `codex/mvp-specialist-workflows-plan`
- Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
- Base commit: `f19200e feat: add specialist workflow readiness bridge`
- Claimed at: 2026-07-10T00:49:02Z
- Status: completed
- Ready at: 2026-07-10T02:01:22Z

## Owned Files

- `docs/agentic/claims/task-5-mvp-specialist-prr-investigation-runners.md`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/prr-negotiation-workflow.ts`
- `packages/agent/src/investigation-planner-workflow.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts`
- `packages/agent/test/prr-negotiation-nous-live.test.ts`
- `packages/agent/test/investigation-planner-workflow.test.ts`
- `packages/agent/test/runtime.test.ts`
- `.superpowers/sdd/task-5-brief.md`
- `.superpowers/sdd/task-5-report.md`

## Inline Review

- Subagent review limitation: reviewer `Ptolemy` and replacement reviewer `Avicenna` both exceeded bounded waits and were closed stale per coordinator guidance.
- Inline spec/code review completed by Codex against Task 5, global resident-agent constraints, PRR/domain gate invariants, and replay-safety requirements.
- Important finding fixed: missing PRR follow-up approval preview could previously be discovered after model/draft events, leaving an unsafe partial retry state. Added a pre-model guard and regression coverage.
- Important finding fixed: invalid structured model output previously threw after model completion. Both PRR negotiation and investigation planner now append `agent.specialist-run.failed` and return secret-safe failed handoffs without local draft/tool artifacts.
- No remaining Critical/Important inline findings. Live Nous follow-up added an opt-in acceptance test using the configured Nous Portal provider, provider-approved prompt artifact, and current provider-byte-transfer approval proof. The managed sandbox live attempt reached the provider invocation boundary and failed safely with only the generic message `Configured provider invocation failed safely`; no raw prompt, model output text, provider body/error, endpoint, API key, bearer material, or secret value was persisted in this claim. Coordinator unrestricted live acceptance then passed the same opt-in command, satisfying the real-provider proof for Task 5 without recording sensitive provider material.

## Verification Evidence

- RED: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts` failed before the missing-preview guard because `agent.model-invocation.requested` was already appended.
- RED: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts` failed before invalid-output handling with raw `SyntaxError: Unexpected token 'o', "not-json" is not valid JSON`.
- GREEN: `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts` passed with 2 files / 9 tests.
- RED live follow-up: `npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts` failed before the file existed with `No test files found`.
- Default live-test gate: `npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts` passed as opt-in skipped with 1 skipped file / 1 skipped test.
- Live attempt 1 of max 2: `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts` failed safely at the provider invocation boundary with generic `Configured provider invocation failed safely`. The test does not print or persist raw prompt, output text, provider body/error, endpoint, API key, bearer material, or secret values. No second live attempt was used because there was no focused schema/prompt failure to fix in the code path.
- Coordinator unrestricted live acceptance: `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts` passed with 1 passed file / 1 passed test in 3.43s. Sanitized acceptance asserts only safe workflow status, hashes, event categories/IDs/counts, and absence of send/legal/tool-execution side effects.
- Final focused gate after live follow-up: `npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/runtime.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts` passed with 7 passed files / 1 skipped file and 77 passed tests / 1 skipped test.
- Final `npm run typecheck`: passed.
- Final `git diff --check`: passed.
- Earlier final `npm run verify` was attempted in the managed sandbox. Typecheck passed, then verify failed outside Task 5 scope with 3 failed files / 160 passed / 1 skipped and 19 failed tests / 1622 passed / 1 skipped. Failures were `listen EPERM` on `127.0.0.1`, `0.0.0.0`, and `/tmp/tsx-1000/*.pipe` in `packages/local-runtime/test/server.test.ts`, `packages/local-runtime/test/workspace-readiness-smoke.test.ts`, and `packages/workspace-ops/test/cli.test.ts`. No unrelated local-runtime or workspace-ops behavior was patched.
- Final coordinator `npm run verify` after the live-test follow-up passed with 163 passed files / 2 skipped and 1641 passed tests / 2 skipped, plus build and factory readiness. The two skipped tests are explicit opt-in live-provider tests.

## Targeted Commands

- `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/specialist-readiness.test.ts`
- `npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts`
- `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts`
- `npm test -- packages/agent/test/prr-negotiation-nous-live.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/runtime.test.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts`
- `npm run typecheck`
- `git diff --check`
- `npm run verify`

## Scope Notes

- Preserve one resident identity: `agent_default`.
- Use real configured Nous Portal provider for the actual runner path; deterministic unit and contract tests may use local test doubles for interfaces.
- Do not send PRRs, confirm legal escalation, approve provider byte transfer, export/publish, accept graph truth, or execute destructive repair.
- Treat model output as untrusted structured input: schema-validated, secret-safe, provenance-linked, append-only, and replay-safe.
- Stop before Task 6.
