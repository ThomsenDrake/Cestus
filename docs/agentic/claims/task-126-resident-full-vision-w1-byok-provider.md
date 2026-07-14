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
