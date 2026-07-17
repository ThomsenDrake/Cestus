# Task 126 — BYOK public-input precedence recovery

## Claim

- Status: ready-for-review
- Branch: `codex/task-126-resident-full-vision-byok-provider-reader-failclosed-recovery`
- Base: `512a169af3caad7e0c2d270040f24c36443913ec`
- Authorized repair: normalize and validate the public requested-use snapshot
  before inspecting the injected authority-reader capability.
- Owned files:
  - `docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md`
  - `packages/agent/src/byok-provider.ts`
  - `packages/agent/test/byok-provider.test.ts`
- Forbidden: integration, `neo` changes, provider/network/credential effects,
  Task139 ownership, and full verification.

## Causal Evidence

- RED: `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts`
  ran with the temporary local dependency link and failed exactly the two added
  malformed-public-requested-use cases. Both an absent reader and a forged
  reader returned `unavailable/authority-reader-unavailable` instead of
  `blocked/unsafe-input` (2 failed; 18 passed). The forged reader invocation
  counter remained zero.
- Root cause: `evaluateByokProviderBoundary` inspected reader trust before it
  normalized and parsed the public requested-use input.
- GREEN: the same focused command passed with 2 files and 20 tests after the
  smallest reorder: normalize and parse requested use before reader trust
  inspection. Valid requested use with an absent or forged reader remains
  `unavailable/authority-reader-unavailable`; hostile reader-output tests
  remain unchanged and fail closed before effects.
- `npm run typecheck` passed.
- Compiler recovery: the post-review compiler report identified that the two
  key checks accepted normalized primitives, the array length descriptor was
  read through a typed descriptor map, and the missing-credential fixture
  assigned `undefined` to an inferred required field. This repair adds object
  guards before both key checks, reads the length descriptor directly, and
  constructs the missing-credential authority with that field omitted at the
  unknown reader boundary. The focused command again passed 2 files and 20
  tests, and `npm run typecheck` again passed.

## Handoff

This repair is ready for a fresh independent defects-first review. The
temporary `node_modules` link used only for the focused command must be
removed before committing. No full verifier is authorized for this repair.

## Task126-R — authority-reader import boundary recovery

- Status: claimed → implementing
- Owner model: GPT-5.6 Terra / xhigh
- Branch: `codex/task126-r-reader-boundary`
- Worktree: `/home/drake/.codex/worktrees/ee6e/Cestus`
- Exact source base: `863c93a09a0817365c6b41996cc751efa16efd78`
- V4 prerequisites: `Task126` and `Task135D`, both released before this card.
- Exclusive paths:
  - `packages/agent/src/byok-provider.ts`
  - `packages/agent/src/index.ts`
  - `packages/agent/test/byok-provider.test.ts`
  - `packages/agent/test/byok-provider-imports.test.ts`
  - `docs/agentic/claims/task-126-resident-full-vision-w1-byok-provider.md`
- Causal RED/GREEN command:
  `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/byok-provider-imports.test.ts`
- Cross-boundary command:
  `npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/byok-provider-imports.test.ts packages/agent/test/openai-compatible-provider.test.ts packages/agent/test/provider-readiness.test.ts`
- Required final gates: `npm run typecheck`, `git diff --check`,
  `npm run factory:check`, and `npm run verify` from final committed bytes.
- Stop rules: stop and return exact evidence for data-loss risk, schema or
  file-owner conflict, unavailable offline dependency, safety-invariant
  conflict, credential or external-behavior decision, or repeated verifier
  failure. Do not integrate, merge, push, contact providers, use credentials,
  touch `neo`, change registry/spec/plan/contract bytes, or broaden this card.

### Causal RED/GREEN evidence

- RED on inherited bytes: the exact Task126-R command failed only the new
  public-boundary assertion: `createByokProviderBoundary` was `undefined`
  through `packages/agent/src/index.ts`. Existing BYOK behavior passed.
- GREEN: the same command passed `2` files / `15` tests after the barrel
  exported only `createByokProviderBoundary`,
  `evaluateByokProviderBoundary`, and their safe consumer types. It does not
  export `createByokProviderAuthorityReader` or
  `ByokProviderAuthorityReader`.
- The import policy proves that the sole production reference to the private
  module is that exact safe barrel export and rejects named, alias, default,
  namespace, dynamic, CommonJS, re-export, and type-only routes to the reader
  seam. The existing direct mint remains test-only.
- Status: ready-for-review pending the required cross-boundary and final
  committed-byte gates.
