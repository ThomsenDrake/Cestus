# Task 1: Nous OpenAI-Compatible Provider

- Plan: user-approved live provider slice from the resident agent provider/auth design.
- Active spec: `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- Branch: `codex/nous-openai-compatible-provider`
- Status: complete
- Claimed at: 2026-07-08T08:55:00Z
- Worker: Codex coordinator

## Owned Files

- `.gitignore`
- `packages/agent/src/openai-compatible-provider.ts`
- `packages/agent/src/secret-store.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/openai-compatible-provider.test.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-env.ts`
- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `docs/agentic/claims/task-1-nous-openai-compatible-provider.md`

## Acceptance Criteria

- Cestus has a real OpenAI-compatible chat provider adapter for Nous Portal.
- The adapter uses a secret-store credential reference and never stores API keys in events, DTOs, diagnostics, tests, or docs.
- Local runtime exposes Nous as a provider only when the local env-backed secret is available.
- Standard verification uses mocked fetch and fake/test secrets only.
- Optional live use reads `CESTUS_AGENT_NOUS_API_KEY` from local env or `.env`.

## Verification

- Red test observed: `npm test -- packages/agent/test/openai-compatible-provider.test.ts` initially failed because `openai-compatible-provider.js` did not exist.
- Targeted tests passing: `npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/openai-compatible-provider.test.ts`.
- Broader package tests passing: `npm test -- packages/local-runtime/test packages/agent/test`.
- Typecheck passing: `npm run typecheck`.
- Full verification passing: `npm run verify`.
- Live smoke reached Nous Portal with local `.env` credentials, but the gateway rejected the provided model/config payload with HTTP 400 and a sanitized `missing tags` diagnostic. The adapter failed closed without exposing the secret or raw body.
