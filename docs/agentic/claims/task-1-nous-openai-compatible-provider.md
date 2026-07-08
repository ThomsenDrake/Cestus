# Task 1: Nous OpenAI-Compatible Provider

- Plan: user-approved live provider slice from the resident agent provider/auth design.
- Active spec: `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- Branch: `codex/nous-openai-compatible-provider`
- Status: claimed
- Claimed at: 2026-07-08T08:55:00Z
- Worker: Codex coordinator

## Owned Files

- `.gitignore`
- `packages/agent/src/openai-compatible-provider.ts`
- `packages/agent/src/secret-store.ts`
- `packages/agent/src/provider.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/openai-compatible-provider.test.ts`
- `packages/agent/test/credential-reference.test.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-1-nous-openai-compatible-provider.md`

## Acceptance Criteria

- Cestus has a real OpenAI-compatible chat provider adapter for Nous Portal.
- The adapter uses a secret-store credential reference and never stores API keys in events, DTOs, diagnostics, tests, or docs.
- Local runtime exposes Nous as a provider only when the local env-backed secret is available.
- Standard verification uses mocked fetch and fake/test secrets only.
- Optional live use reads `CESTUS_AGENT_NOUS_API_KEY` from local env or `.env`.

## Verification

- Pending.
