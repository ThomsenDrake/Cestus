# Task 3 Claim: Provider Input Text Boundary

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 3: Provider Input Text Boundary`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: `/home/drake/.codex/worktrees/9b6b/Cestus`

Claimed at: `2026-07-08T15:41:36Z`

Status: `ready-for-review`

Owned files:

- `docs/agentic/claims/task-3-provider-input-text-boundary.md`
- `packages/agent/src/provider.ts`
- `packages/agent/src/openai-compatible-provider.ts`
- `packages/agent/test/provider.test.ts`
- `packages/agent/test/openai-compatible-provider.test.ts`

Targeted commands:

- RED: `npm test -- packages/agent/test/openai-compatible-provider.test.ts`
- GREEN: `npm test -- packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/provider.test.ts packages/agent/test/runtime.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Deterministic provider tests require secret material or raw provider diagnostics.
- Provider abstraction cannot accept runtime-provided text without breaking local deterministic-provider contracts.
- Data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency, or repeated verifier failure.

Implementation evidence:

- Claim commit: `a9828b9 chore: claim task 3 provider input text boundary`
- RED: `npm test -- packages/agent/test/openai-compatible-provider.test.ts` failed with 1 file failed, 5 failed tests, and the expected old-boundary error `this.resolveInputText is not a function`.
- GREEN targeted: `npm test -- packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/provider.test.ts packages/agent/test/runtime.test.ts` passed with 3 files and 31 tests.
- Full gate: `npm run verify` passed with typecheck, 131 test files, 1280 tests, Vite build, and factory-readiness.
- Verifier-required supporting edit: `packages/local-runtime/src/agent-runtime-factory.ts` no longer passes the removed provider resolver or carries the old placeholder hash-to-text helper.
