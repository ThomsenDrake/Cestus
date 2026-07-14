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

## RED/GREEN Evidence

- Dependency recovery: the first named RED could not start because this
  isolated worktree lacked ignored `node_modules` (`vitest: command not
  found`). A temporary untracked symlink to the coordinator worktree's
  lockfile-pinned runner was used only for the authorized focused commands and
  removed before the candidate commit.
- RED: `npm test -- packages/agent/test/local-model-provider.test.ts
  packages/agent/test/provider-readiness.test.ts` exited `1` with the new
  local suite failing at import because `../src/local-model-provider.js` was
  absent. The unchanged readiness parity suite passed 19 tests. No provider,
  network, credential, or fallback path was available or called.
- Focused repair: the first implementation run exposed one classification
  failure: a valid unavailable local-engine inspection was parsed as an
  unsupported capability. The root cause was the inspection normalizer
  collapsing its `unavailable` shape into `undefined`; the narrow repair
  preserves that shape and maps it to the fixed safe
  `local-engine-unavailable` category without copying an engine diagnostic.
- GREEN: the exact named focused command exited `0` with two test files and
  35 tests passing. The new counterfactuals cover absent/unavailable explicit
  local capability; unsupported model, modality, tool, and structured-output
  requirements; stale/swapped capability, policy, approval, and context
  bindings; local budget, timeout/abort, and concurrency exhaustion; hostile
  proxy input; and URL/secret-shaped engine errors. They prove no execution on
  rejected inputs and no remote substitute, credential lookup, or fallback
  state.
- Follow-up gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0` with no output; `npm run factory:check` exited `0` with
  `factory-readiness passed`.
- Full verification: not run; the coordinator explicitly prohibited `npm run
  verify` for this task.
- Status: ready-for-review. Stop for a fresh independent review before any
  integration, rebase, merge, push, or `neo` action.

## Fresh P1 Repair Evidence

- Repair baseline: rejected candidate `06ceeba0`; this fresh author changes
  only this claim, `packages/agent/src/local-model-provider.ts`, and
  `packages/agent/test/local-model-provider.test.ts`.
- Causal RED: the exact focused command exited `1` with three new failures.
  An abort-ignoring execution timed out and incorrectly admitted a second
  execution before its original promise settled. Configured and inspected
  arrays with an own `map` accessor each incremented the accessor counter,
  proving that array normalization read an attacker-controlled instance method.
- Scoped GREEN: the provider retains its concurrency reservation until a timed
  out inspection or execution promise settles, and array normalization checks
  own descriptors and indexed values without reading `map` or another instance
  method. The exact focused command exited `0` with 38 tests passing across
  the local-provider and readiness suites. The new tests prove no second engine
  execution while the timed-out one remains pending, and zero hostile getter
  reads with zero engine calls for malformed configured modalities and zero
  execution calls for malformed inspection arrays.
- Follow-up gate: `npm run typecheck` exited `0`. Full verification remains
  prohibited. Pending `git diff --check` and `npm run factory:check`, then a
  fresh independent review; no integration, rebase, merge, push, or `neo`
  action is authorized.
- Completed follow-up gates: `git diff --check` exited `0` with no output and
  `npm run factory:check` exited `0` with `factory-readiness passed`.
- Status: ready-for-review. The candidate must stop for a fresh independent
  review before any integration, rebase, merge, push, or `neo` action.

## Fresh Proxy And Prototype P1 Repair Evidence

- Repair baseline: rejected `e1fa208245ba3032747be9375b7e552196a20ecf`. This
  repair changes only this claim, `packages/agent/src/local-model-provider.ts`,
  and `packages/agent/test/local-model-provider.test.ts`.
- Causal RED: after restoring only the ignored, lockfile-pinned temporary
  `node_modules` symlink, the exact focused command exited `1` with four new
  failures over the previous 38 passing tests. A revoked configured modalities
  proxy escaped synchronously from `Array.isArray`; a revoked inspection
  modalities proxy rejected `invoke()` instead of returning its bounded safe
  unavailable result. Own enumerable data `__proto__` fields on both a
  configured capability and an engine inspection were copied into `{}` and
  silently changed the temporary snapshot's prototype, allowing both hostile
  records to reach execution.
- Root-cause repair: `plainDataArray` now performs its brand check inside the
  existing fail-closed boundary. `plainOwnDataRecord` rejects an own
  `__proto__` descriptor before copying and snapshots only into a
  null-prototype record. The repair preserves descriptor-first normalization,
  direct-prototype checks, timeout reservation behavior, safe diagnostics, and
  the credential-free in-process-only boundary.
- Scoped GREEN: the exact focused command exited `0` with **2 files / 42
  tests**. New configured and inspected revoked-proxy tests resolve to bounded
  safe results with zero execution; new own-data `__proto__` capability and
  inspection tests fail closed with no engine execution while preserving the
  input records' direct prototypes.
- Follow-up gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0` with no output; `npm run factory:check` exited `0` with
  `factory-readiness passed`. No full verifier ran or is authorized.
- The temporary untracked `node_modules` symlink was removed before the sealed
  candidate commit. The candidate must then stop for a fresh independent
  defects-first review; no self-review, integration, merge, push, or `neo`
  action is authorized.
