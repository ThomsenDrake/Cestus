# Task 130 Claim: Official xAI Subscription Harness

- Task and gate: W1-130 / Lane P / `T114-130-OFFICIAL`.
- Worker: `/root/task130_xai_harness`.
- Branch and worktree: `codex/task-130-resident-full-vision-xai-harness` /
  `/home/drake/.codex/worktrees/task-130-resident-full-vision-xai-harness`.
- Coordinator base: `9c03ba089e8c68c328bc53accb82653c38c09cd5`.
- Governing program design and plan:
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`;
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Provider design and plan:
  `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md@285657a7879cdc47e321152c2bc5feb0ebe6088f`;
  `docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md` Task 130.
- Registry authority: `RV-1-E-172`.
- Claimed at: `2026-07-14T23:20:02Z`.
- Status: in-progress.

## Exclusive Scope

- `docs/agentic/claims/task-130-resident-full-vision-xai-harness.md`
- `packages/agent/src/xai-subscription-harness.ts`
- `packages/agent/test/xai-subscription-harness.test.ts`

## Authorized Contract

Task 130 creates only an xAI-specific, official non-extractive subscription
feasibility boundary. It treats xAI as an `xai-harness` provider backend, never
as a resident identity or a Codex alias. Missing or unsupported official xAI
support may append only mounted-authority-bound, secret-safe, append-only
`official-flow-unavailable` feasibility evidence.

The adapter has no secret-resolution, token-extraction, provider/network,
alternate-provider, generic API-key-emulation, material-read, or
subscription-to-API-key conversion path. It must fail closed for mismatched
policy/capability/reference/workspace/mount/run/approval posture and reject
cookies, browser/session storage, token caches, CLI-auth stores, intercepted
headers, undocumented endpoints, reverse-engineered grants, and environment
tokens without inspecting their material.

## Verification Contract

Before production code, write the causal RED suite and run exactly:

```bash
npm test -- packages/agent/test/xai-subscription-harness.test.ts
```

Then make the smallest scoped implementation and rerun that command, followed
by `npm run typecheck`, `git diff --check`, and `npm run factory:check`.
`npm run verify` is closed and prohibited. No credential, provider/network
action, merge, integration, canonical registry edit, or `neo` action is
authorized. Stop after the owned-files candidate commit for a fresh
independent review.
