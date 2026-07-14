# Task 128 Claim: Resident Full-Vision Local-Model Provider

- Task and gate: W1-128 / Lane P / `CF1-P-LOCAL-MODEL`.
- Worker: `/root/task128_local_model_provider`.
- Branch and worktree: `codex/task-128-resident-full-vision-local-model-provider` /
  `/home/drake/.codex/worktrees/task-128-resident-full-vision-local-model-provider`.
- Coordinator base and required CF-1 descendant:
  `c71fde1e2d64bb953f36ed92a631c11eec79914a`.
- Required freeze: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` /
  `CF1-P-LOCAL-MODEL`.
- Claimed at: `2026-07-14T20:45:00Z`.
- Status: in-progress.

## Scope And Authority

This task may change only:

- `packages/agent/src/local-model-provider.ts`
- `packages/agent/test/local-model-provider.test.ts`
- this append-only claim.

It creates the CF-1-selected credential-free local-engine boundary. The
boundary must require current explicit local provider/model/capability,
local-no-secret credential posture, reachability/features, policy/approval/
context identity, and local-compute budget before invoking an injected local
engine. It fails closed with bounded secret-safe diagnostics and never probes
credentials, discovers providers, accesses a URL, creates remote approval, or
substitutes Nous, BYOK, Codex, xAI, another model, or any remote provider.

No registry/configuration/runtime/contract/secret-store compatibility file,
portable state, provider/network call, credential discovery, fallback state,
or `neo` integration is authorized. Tests use credential-free in-process
fakes only. There is no child dispatch, self-review, self-integration, full
verifier, or live/local-provider compatibility smoke in this task.

## Verification Contract

Before production code, add causal counterfactual tests and run:

```bash
npm test -- packages/agent/test/local-model-provider.test.ts packages/agent/test/provider-readiness.test.ts
```

The initial RED is expected because `local-model-provider.ts` is absent. After
the smallest scoped repair, rerun that exact command, `npm run typecheck`,
`git diff --check`, and `npm run factory:check`. Remove any temporary ignored
`node_modules` link before the candidate commit. `npm run verify` is
prohibited unless the coordinator grants a separate fresh gate. Stop for a
fresh independent review with the exact RED/GREEN/gate evidence and candidate
SHA.
