# Task 4 Claim: Local Runtime Prompt Artifact Resolver

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 4: Local Runtime Prompt Artifact Resolver`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: task-scoped Codex worktree, path withheld for prompt-artifact secret-safety

Claimed at: `2026-07-08T15:52:38Z`

Status: `ready-for-review`

Owned files:

- `docs/agentic/claims/task-4-local-runtime-prompt-artifacts.md`
- `packages/local-runtime/src/agent-prompt-artifacts.ts`
- `packages/local-runtime/src/agent-nous-smoke.ts`
- `packages/local-runtime/test/agent-prompt-artifacts.test.ts`
- `packages/local-runtime/test/agent-nous-smoke.test.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `package.json`

Targeted commands:

- RED: `npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts`
- GREEN: `npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/openai-compatible-provider.test.ts`
- Live smoke: `npm run agent:nous:smoke`
- Full gate: `npm run verify`

Stop conditions:

- Data-loss risk, schema conflict, unavailable dependency, credential need, external-service dependency failure, or repeated verifier failure.
- Local prompt artifacts would require raw workspace paths, raw evidence bodies, provider credentials, credential-setting names, raw provider errors, raw prompt text in ledger/DTOs/diagnostics/docs/tests/logs, model output text, or sensitive raw content.
- Provider readiness would require reintroducing a hash-to-text placeholder resolver.

Implementation evidence:

- Claim commit: `3f3a0f8 chore: claim task 4 local runtime prompt artifacts`
- RED: `npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts` failed before implementation because `agent-prompt-artifacts` and `agent-nous-smoke` modules were missing; the existing route suite passed.
- GREEN targeted: `npm test -- packages/local-runtime/test/agent-prompt-artifacts.test.ts packages/local-runtime/test/agent-nous-smoke.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/openai-compatible-provider.test.ts` passed with 4 files and 22 tests.
- Live smoke: `npm run agent:nous:smoke` passed and printed a single safe JSON object with `ok: true`, input/output artifact hashes, two invocation event IDs, `workspace-runtime-status.v1`, and omission count 4.
- Full gate: `npm run verify` passed with typecheck, 133 test files, 1286 tests, UI build, and factory-readiness.
- Whitespace: `git diff --check` passed with no output.
- Self-review: no defects found; local prompt artifacts are context-pack-backed, hash-addressed, provider-approved for byte transfer, persisted outside ledger text, and unknown hashes fail closed through the agent resolver.
