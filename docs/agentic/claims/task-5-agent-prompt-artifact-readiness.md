# Task 5 Claim: Verification And Readiness

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 5: Verification And Readiness`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: task-scoped Codex worktree, path withheld for prompt-artifact readiness safety

Claimed at: `2026-07-08T16:20:44Z`

Status: `claimed`

Owned files:

- `docs/agentic/claims/task-5-agent-prompt-artifact-readiness.md`
- `docs/agentic/software-factory.md`
- `scripts/check-agent-readiness.mjs`
- `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Targeted commands:

- Focused verification: `npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/provider.test.ts packages/agent/test/openai-compatible-provider.test.ts packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
- Live smoke: `npm run agent:nous:smoke`
- Full gate: `npm run verify`
- Whitespace: `git diff --check`
- Factory gate: `npm run factory:check`

Stop conditions:

- Focused tests, live smoke, full verify, whitespace, or factory check fail repeatedly after two focused repair attempts.
- Live Nous settings or credentials are unavailable.
- Readiness evidence cannot be recorded without exposing prompt text, model output text, provider credentials, raw provider errors, credential setting names or values, raw local paths, or sensitive raw content.
- Any need to weaken append-only ledger semantics, provenance requirements, projection rebuildability, provider-transfer approval gates, legal locks, or secret-safety boundaries.
