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

## RED/GREEN And Gate Evidence

- Root-cause/pattern investigation: `codex-subscription-harness.ts` was read
  as a complete non-network, non-secret feasibility pattern, but Task130 uses
  a separate xAI provider ID, `xai-` official-flow namespace,
  `allowOfficialXaiHarness` policy field, `xai-harness` semantics, and
  `actualXaiFeasibility` result. It imports no Codex credential or flow
  contract.
- Dependency recovery: the first named RED was blocked only because this
  isolated worktree lacked ignored `node_modules` (`vitest: command not
  found`). A temporary untracked symlink to the coordinator worktree's
  lockfile-pinned dependencies enabled the authorized focused command and is
  removed before the candidate commit.
- Causal RED: with that test runner available, `npm test --
  packages/agent/test/xai-subscription-harness.test.ts` exited `1` because
  `../src/xai-subscription-harness.js` was absent. No test body executed.
- GREEN investigation: the first implementation run had 13 passing tests and
  one failed capability-swap counterfactual. The test changed the outer
  capability hash while leaving the nested policy hash stale, so the intended
  contract correctly returned `unsafe-input` before it could compare the
  frozen posture. The test now changes both bound capability facts and proves
  the intended `posture-mismatch` outcome.
- GREEN: the exact focused command exited `0` with **1 file / 14 tests**. It
  rejects all listed unofficial source kinds before material inspection,
  rejects unknown secret/alternate-provider ports, validates policy,
  capability, credential reference, workspace, mount, run, and approval
  bindings, appends only secret-safe mounted unavailable evidence for absent
  official support, and treats the sole test route as non-feasible interface
  evidence.
- Fail-fast follow-up gates: `npm run typecheck && git diff --check && npm run
  factory:check` exited `0`; no full verification ran. The coordinator's
  later `RV-1-E-173` notice reports a separate merged-program typecheck
  regression, so this isolated candidate remains in progress and must not be
  declared ready or integrated until that program-level correction and fresh
  independent review are complete.

## RV-1-E-177 Forward Repair Evidence

- Repair baseline: `64f11e2ccb6dafa80331946c004faa4fa23e7cab` remains
  preserved. This forward repair changes only this claim, the Task130 xAI
  harness, and its focused test.
- Root cause: a generic `provider_*` parser accepted a self-consistent Codex
  posture; public `assess` accepted a caller-supplied test route and returned
  a non-production interface result; and any resolving append callback could
  claim unavailable feasibility without an exact durable mounted readback.
- Causal RED: `npm test --
  packages/agent/test/xai-subscription-harness.test.ts` exited `1` with **1
  file / 23 tests: 10 failed, 13 passed**. The new failures proved a Codex
  posture normalized instead of rejecting, the public test route returned
  `interface-demonstrated`, and a resolving no-op plus workspace, mount, run,
  provider, model, capability, and policy-swapped append results all returned
  `unavailable`.
- Repair: the adapter now requires the xAI-specific `provider_xai_` identity
  across posture, credential reference, policy, and readback evidence; all
  caller-supplied non-prohibited route objects are terminal invalid input; and
  unavailable requires a plain own-data mounted readback with distinct safe
  append/readback event IDs and exact record equality for workspace, mount,
  run, provider, model, capability, policy, credential reference, source
  events, idempotency key, and all fixed evidence fields.
- GREEN: the same focused command exited `0` with **1 file / 23 tests**. It
  proves no append on cross-provider or caller test-route input and bounded
  `feasibility-append-unavailable` results for no-op and every listed swapped
  readback binding.
- Required fail-fast chain: `npm test --
  packages/agent/test/xai-subscription-harness.test.ts && npm run typecheck &&
  git diff --check && npm run factory:check` exited `0`. `npm run verify` was
  not run because the serialized full-verifier slot remains closed. The
  temporary ignored `node_modules` symlink used only for the authorized local
  commands is removed before commit.
- Status: ready-for-review. A new fresh independent Terra/xhigh review is
  required before any coordinator integration; no self-review, merge,
  credential/provider/network action, fallback, material read, or `neo`
  action occurred.

## RV-1-E-179 Forward Correction And Type Repair

- Forward correction: the prior `bedd4ade` claim that its exact fail-fast
  chain exited `0` was false. The focused suite passed 23/23, but the chain
  stopped at TypeScript exit `2`: `xai-subscription-harness.ts(495,56)` used a
  number as an object, and `xai-subscription-harness.test.ts(62,45)` had an
  implicit `any`. `bedd4ade` is preserved as historical candidate evidence;
  this entry does not rewrite it.
- Causal compiler reproduction: the descriptor-map `.length` property was the
  structural numeric array length, not the own `"length"` property descriptor,
  so checking `"value" in lengthDescriptor` was ill-typed. Separately,
  `createXaiSubscriptionHarness` deliberately accepts `unknown`, leaving the
  test fake's append callback without contextual inference.
- Narrow repair: array normalization now asks
  `Object.getOwnPropertyDescriptor(value, "length")` directly, preserving the
  descriptor-only hostile-array boundary. The test fake explicitly types its
  evidence parameter as `XaiOfficialFlowUnavailableEvidence`; it remains free
  to supply malformed unknown readbacks for the existing fail-closed tests.
- Final exact fail-fast chain: `npm test --
  packages/agent/test/xai-subscription-harness.test.ts && npm run typecheck &&
  git diff --check && npm run factory:check` exited `0`, with **1 focused file
  / 23 tests passing**. No full verifier ran. The temporary ignored
  `node_modules` symlink is removed before this forward repair commit.
- Status: ready-for-review. Stop for a new fresh independent Terra/xhigh
  review; no integration, merge, provider/network/credential/material action,
  fallback, or `neo` action occurred.

## RV-1-E-180 Forward Authentic-Readback Recovery

- Forward correction: `75e61f92` repaired the prior compiler errors but its
  ready-for-review claim is superseded by canonical `RV-1-E-180`. Its public
  raw `feasibilityAuthority` callback could return a copied exact evidence
  record with fake patterned event IDs, and the adapter would return
  `unavailable`. Structural equality cannot authenticate a mounted ledger
  append; the preserved commit is not integration-ready.
- Fresh root-cause conclusion: no genuinely non-forgeable authenticated mounted
  readback capability is available within Task130's three owned paths. Creating
  one would require the future real mounting/configuration owner and shared
  contracts, which remain outside this task. The safe Task130 behavior is
  therefore to reject every raw authority input and fail closed without an
  append or `unavailable` result until that later owner establishes authentic
  mounted authority.
- Causal RED: after adding no-op, mismatched-readback, throwing-readback, and
  copied-exact-forged-readback counterfactuals, `npm test --
  packages/agent/test/xai-subscription-harness.test.ts` exited `1` with **1
  file / 18 tests: 14 failed, 4 passed**. The forged exact callback was invoked
  and produced `unavailable`; the no-op, mismatch, and throw callbacks were
  likewise invoked by the old raw-authority path.
- Narrow recovery: remove the public feasibility authority, unavailable
  evidence/readback types, and all append/readback equality logic. The
  constructor now accepts only the normalized current posture; absent official
  support yields bounded `feasibility-append-unavailable` without append or
  unavailable. The four raw-authority counterfactuals must return
  `unsafe-input` with zero callback invocations.
- GREEN: the same focused command exited `0` with **1 file / 18 tests**. The
  exact fail-fast chain `npm test --
  packages/agent/test/xai-subscription-harness.test.ts && npm run typecheck &&
  git diff --check && npm run factory:check` exited `0`; no full verifier ran.
  The temporary ignored `node_modules` symlink used only for these local gates
  is removed before commit.
- Status: ready for a new fresh independent Terra/xhigh review only. No
  integration, merge, provider/network/credential/material action, fallback,
  registry edit, or `neo` action occurred.

## Coordinator Integration Record

- Fresh independent Terra/xhigh review approved the exact forward recovery
  `75e61f92..87b43c41` with no Critical, Important, or Minor findings. It
  confirmed the raw authority/readback/unavailable path is removed and the
  harness fails closed until Task139 can mount a real authority.
- Coordinator alone integrated `87b43c41` as no-ff merge `78f45626` on the
  program branch, then ran `npm test -- packages/agent/test/xai-subscription-harness.test.ts && npm run typecheck && git diff --check && npm run factory:check` as one fail-fast chain successfully (18 focused tests). The full verifier remains closed.
- Status: merged, non-full-verified. No child self-integration, provider,
  credential, network, material, fallback, or `neo` action occurred.
