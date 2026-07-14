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
- Status: ready-for-review (bounded RV-1-D-163 repair commit pending fresh independent review).

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

## RED/GREEN Evidence

- Dependency setup: this isolated worktree initially had no ignored
  `node_modules`, so the first named RED reported `vitest: command not found`.
  A temporary untracked symlink to the coordinator's lockfile-pinned
  `node_modules` enabled only the authorized focused checks; it was removed
  before this candidate commit.
- Initial RED: `npm test --
  packages/agent/test/codex-subscription-harness.test.ts` exited `1` with one
  failed suite and zero tests because
  `../src/codex-subscription-harness.js` was absent. The new causal tests cover
  a browser-cookie source and no-official-flow evidence before production code
  existed.
- Binding RED: the focused suite later exited `1` with 14 tests, 12 passing,
  and two expected failures: swapped approval binding and switched
  subscription/device credential kind both reached unavailable evidence instead
  of `posture-mismatch`. The repair adds both facts to the immutable snapshot
  before any feasibility append.
- Proxy-input RED: the focused suite exited `1` with 15 tests, 14 passing, and
  one expected failure because a revoked proxy used as credential scopes threw
  from `Array.isArray` instead of producing a bounded result. The repair moves
  all proxy-observable type checks inside the existing fail-closed boundary.
- GREEN: the exact focused command exited `0` with one test file and 15 tests
  passing. It rejects cookie, browser/session storage, token-cache,
  CLI-auth-store, environment-token, intercepted-header, undocumented API,
  reverse-engineered grant, and subscription-token-as-API-key shapes without
  an append or unsafe diagnostic. It appends only the fixed
  `official-flow-unavailable` evidence when no official route exists and can
  demonstrate a fake route only as non-feasible interface behavior.
- Follow-up gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; and `npm run factory:check` exited `0` with `factory-readiness passed`
  after the final proxy repair.
- Full verification: not run. This task authorization prohibits `npm run
  verify` until a later fresh review and usage-gated coordinator grant.

## RV-1-D-163 Repair Evidence

- Causal RED: a `browser-cookie` official-flow proxy exposed a safe own-data
  `kind` while its accessor-backed `material` counted descriptor inspection and
  threw if its value was read. The exact focused command exited `1`: the old
  `normalizeOfficialFlow` inspected the material descriptor once before it
  could classify the prohibited kind (and returned `unsafe-input`).
- Repair: `normalizeOfficialFlow` now classifies a safe own-data prohibited
  `kind` before full object normalization. It never reads or copies material
  for that terminal prohibited result; no append is possible on that path.
- GREEN: `npm test -- packages/agent/test/codex-subscription-harness.test.ts`
  exited `0` with one test file and 16 tests passing. The regression proved
  zero material-descriptor inspections, zero material getter reads, the
  `prohibited-credential-source` result, and no feasibility append.
- Follow-up gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; `npm run factory:check` exited `0` with `factory-readiness passed`.
- Dependency cleanup: the temporary untracked `node_modules` symlink used
  only for the focused test and local gates was removed. `npm run verify` was
  not run, as this repair authorization prohibits it.
