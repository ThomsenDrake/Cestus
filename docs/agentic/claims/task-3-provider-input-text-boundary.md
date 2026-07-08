# Task 3 Claim: Provider Input Text Boundary

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 3: Provider Input Text Boundary`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: `/home/drake/.codex/worktrees/9b6b/Cestus`

Claimed at: `2026-07-08T15:41:36Z`

Status: `claimed`

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
