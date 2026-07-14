# Task 129 Claim: Official Codex Subscription Harness

- Task and gate: W1-129 / Lane P / `CF1-P-POSTURE`.
- Worker: `/root/task129_official_harness`.
- Branch and worktree: `codex/task-129-resident-full-vision-codex-harness` /
  `/home/drake/.codex/worktrees/task-129-resident-full-vision-codex-harness`.
- Coordinator base: `82e03063224ea4f079c231fad109a268c6750b8c`.
- CF1-INTEGRATION-SHA: `48c9cbcdcf723bcc74868f782bc2375bae565ae6`.
- Governing program design and plan:
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`;
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Provider design and plan:
  `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md@285657a7879cdc47e321152c2bc5feb0ebe6088f`;
  `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md` Task 129.
- Claimed at: `2026-07-14T22:08:56Z`.
- Status: claimed.

## Exclusive Scope

- `docs/agentic/claims/task-129-resident-full-vision-codex-harness.md`
- `packages/agent/src/codex-subscription-harness.ts`
- `packages/agent/test/codex-subscription-harness.test.ts`

## Contract

This task models Codex only as an `openai-codex-harness` provider backend. It
implements an official-flow-only feasibility boundary: a capability may be
reported only from a supplied, officially documented non-extractive route.
Absent official support appends only secret-safe append-only
`official-flow-unavailable` feasibility evidence. The boundary has no token
extraction path, secret-resolution call, network/provider request, provider
substitution, generic API-key emulation, or resident-identity role.

Deterministic tests use credential-free in-process fakes and reject cookies,
browser/session storage, token caches, CLI-auth-store data, environment tokens,
intercepted headers, undocumented APIs, reverse-engineered grants, and any
subscription-token-as-API-key request. A fake official route demonstrates only
the interface and cannot establish actual Codex feasibility.

## Verification Contract

Before production code, add causal RED coverage and run exactly:

```bash
npm test -- packages/agent/test/codex-subscription-harness.test.ts
```

Then implement the smallest scoped boundary and rerun that command, followed
by `npm run typecheck`, `git diff --check`, and `npm run factory:check`. Do not
run `npm run verify`, use credentials, invoke a provider/network, self-review,
self-integrate, or touch `neo`. Stop for a fresh independent defects-first
review after the one clean owned-files commit.
