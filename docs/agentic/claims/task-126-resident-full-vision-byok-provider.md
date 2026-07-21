# Task 126 — Credential-free BYOK authority-reader boundary

## Claim

- Status: ready-for-review
- Branch: `codex/task-126-resident-full-vision-byok-provider-reader-failclosed-recovery`
- Base: `27a99b137dcb2508132441879764b6c46f59fa14`
- Owned files:
  - `docs/agentic/claims/task-126-resident-full-vision-byok-provider.md`
  - `packages/agent/src/byok-provider.ts`
  - `packages/agent/test/byok-provider.test.ts`

## Restart contract

This restart creates `ByokProviderAuthorityReader.v1` as a capability-created,
injected reader port. The public BYOK boundary accepts only a strict requested
use snapshot; it does not accept selection, capability, credential reference,
endpoint policy, current posture, or invocation preparation authority from
`unknown` input. The reader derives those facts, and the boundary cross-binds
their exact capability source/hash/revision, credential source events,
endpoint-policy ID, workspace/mount/task/attempt/run/prompt/preview/policy
facts before returning the existing human-transfer-approval-only result.

An absent, malformed, or throwing reader must return a secret-safe unavailable
result before any secret resolution, provider call, network activity, ledger
append, or portable write. Task 139 remains the sole later production reader
mount/configuration owner. The rejected diagnostic checkpoint `36c26ba5` is
read-only evidence only and is not a candidate for integration.

## Verification evidence

- RED: `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts`
  failed with the causal reader-authority regression: a swapped capability
  returned `blocked/provider-capability-mismatch` instead of
  `unavailable/authority-reader-unavailable`; the companion OpenAI-compatible
  suite passed.
- GREEN: the same exact focused command passed **2 files / 18 tests** after
  reclassifying all reader-derived inconsistency paths as safe authority-reader
  unavailability and adding hostile accessor, symbol, and prototype output
  coverage with no forbidden-effect invocation.
- `npm run typecheck` passed.
- `git diff --check` passed.
- `npm run factory:check` passed.

No full verifier is authorized in this task. A fresh independent review is
required after the scoped candidate is sealed.

## Fail-closed recovery record

- This fresh recovery starts from `27a99b137dcb2508132441879764b6c46f59fa14`.
  The prior candidate remains preserved and unintegrated.
- Cause: a factory-created reader was normalized and parsed safely, but its
  post-reader capability, evidence, endpoint-policy, preparation, and
  credential-binding consistency checks returned public `blocked` categories.
  Those facts are reader-derived authority, not public requested-use input.
- Repair: all malformed, stale, swapped, forged, or internally inconsistent
  reader authority now returns the existing safe
  `unavailable/authority-reader-unavailable` result before any effect. Public
  strict requested-use normalization still returns `blocked/unsafe-input`
  before reader invocation; healthy, missing, revoked, expired, and otherwise
  unavailable credential-reference outcomes remain unchanged.
- Scope remains exactly this claim, `packages/agent/src/byok-provider.ts`, and
  `packages/agent/test/byok-provider.test.ts`. The next step is a fresh
  defects-first review; no self-review, integration, `neo` action, provider,
  network, credential, or external-reader work is authorized.
