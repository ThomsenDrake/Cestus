# Task 1: Provider Readiness Health UX

- Plan: `docs/superpowers/plans/2026-07-08-provider-readiness-health-ux-implementation.md`
- Active spec: `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- Branch: `codex/provider-readiness-health-ux`
- Status: ready-for-review
- Claimed at: 2026-07-08T13:37:15Z
- Worker: Codex provider readiness implementation lane

## Owned Files

- `packages/agent/src/provider-readiness.ts`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/test/provider-readiness.test.ts`
- `packages/local-runtime/src/agent-provider-readiness.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/agent-provider-readiness.test.ts`
- `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`
- `packages/local-runtime/test/agent-provider-smoke.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/provider-setup-cards.ts`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-provider-setup-cards.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `package.json`
- `docs/agentic/software-factory.md`
- `docs/agentic/claims/task-1-provider-readiness-health-ux.md`

## Acceptance Criteria

- Local runtime readiness reflects configured Nous Portal state from local runtime bindings.
- Live Nous smoke is the authoritative provider/model acceptance proof.
- Browser and HTTP DTOs expose only safe provider metadata, credential-reference health, approval class, data posture, and opaque repair actions.
- Remote Nous readiness remains provider-byte-transfer gated.
- No API key, auth header, raw provider body, raw provider error, local credential binding path, or provider response body appears in DTOs, diagnostics, logs, snapshots, user-facing cards, claims, or readiness evidence.

## Verification Plan

- `npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx`
- `npm run local:agent:provider-smoke -- --json`
- `npm run verify`
- `git diff --check`
- `npm run factory:check`

## Verification Evidence

Focused verification:

```text
npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
Test Files  8 passed
Tests  62 passed
```

Live Nous smoke:

```text
schemaVersion agent-provider-smoke.v1
providerId provider_nous_portal
modelId tencent/hy3:free
ok true
category ok
marker cestus-live-provider-ok
outputHash sha256:40f46f72360d42f803171329431c6ad304ea18ddd4f575cda51135a1de1704f3
```

Full verification:

```text
npm run verify
typecheck passed
Test Files  132 passed
Tests  1268 passed
tests passed
vite build succeeded
factory-readiness passed
```

Whitespace verification:

```text
git diff --check
no output
```

Safe evidence note: the live smoke record includes only provider ID, model ID, success category, constrained marker, and output hash. It does not include the prompt, provider response body, raw provider error, request body, auth header, local credential binding path, or credential value.

## Stop Conditions

- Missing live Nous credential binding.
- Raw provider error or response body would be serialized.
- Secret-shaped text appears in a DTO, diagnostic, log, user-facing card, claim, snapshot, or readiness evidence.
- Provider byte-transfer approval is weakened or implied by readiness.
- A verifier fails after two focused repair attempts.
