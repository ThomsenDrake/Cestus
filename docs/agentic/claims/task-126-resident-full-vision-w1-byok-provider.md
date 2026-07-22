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

### Consolidated review-repair RED

- Coordinator adjudication accepted P1 only: the import inventory recognized
  complete string literals but could not resolve computed standard-loader
  targets or fail closed for unresolved standard-loader targets. The public
  reader factory remains the authoritative injected capability boundary; this
  repair does not alter it or BYOK behavior.
- Repair RED: the exact Task126-R command failed only the two new import-policy
  cases (`2` failed / `15` passed). Split, concatenated, templated, const-alias,
  indirect-require, `module.require`, `module["require"]`, and transparent
  wrapper paths were not recognized; unresolved standard-loader targets were
  admitted. The existing BYOK behavior suite passed.

### Consolidated review-repair GREEN

- GREEN: the same exact command passed `2` files / `17` tests. The import
  policy now recursively normalizes transparent parentheses, `as`, type
  assertion, `satisfies`, and non-null wrappers; it resolves static string
  concatenation, template expressions, and `const` aliases for standard
  `import()`, `require()`, `module.require()`, and `module["require"]()`
  calls.
- A resolved private target is rejected. An unresolved standard-loader target
  is rejected fail closed. Resolved unrelated roots, lookalikes, basenames, and
  unrelated custom loaders remain allowed. The only current production importer
  remains the existing safe public barrel export.
- This repair changed only this claim and
  `packages/agent/test/byok-provider-imports.test.ts`; no BYOK production
  semantics, mint export, or Task139 configuration boundary changed.

### Exceptional lexical-binding repair authorization

- Status: blocked → implementing-exception.
- The sole program owner authorized this one forward repair after the prior
  final-review ceiling. It is limited exactly to this claim and
  `packages/agent/test/byok-provider-imports.test.ts`.
- Owner model/reasoning: GPT-5.6 Terra / xhigh. The repair is binding-aware
  lexical analysis in the test-only import policy; it must not change BYOK
  production bytes, public exports, reader mint semantics, or Task139's later
  configuration ownership.
- This packet receives exactly one causal RED and one minimal GREEN commit.
  No further automatic repair is authorized. The coordinator alone may perform
  the record-14 forward merge and rerun before the final read-only review pair.

### Exceptional lexical-binding RED

- The exact focused command failed `1` test while `17` existing tests passed.
  The first positive fixture, destructuring ambient `module.require` into a
  `loader` const, was admitted because the inherited global identifier-name
  map cannot bind a `BindingElement` to its lexical initializer. The remaining
  fixture family preserves the required coverage for computed destructuring,
  official `node:module` `createRequire`, aliases, comma indirection, and
  shadowed/custom negative cases.

### Exceptional lexical-binding GREEN

- GREEN replaces the global identifier-name map with a checker-backed,
  binding-aware lexical evaluator. Its finite domain distinguishes standard
  ambient `require` and `module`, trusted `node:module` namespace and
  `createRequire` bindings, const aliases, const object destructuring, and
  unrelated or unknown bindings. It resolves transparent wrappers, comma
  indirection, static strings, concatenation, templates, and const aliases;
  standard loaders with unresolved targets remain fail closed.
- The exact focused command passed `2` files / `18` tests and the
  cross-boundary command passed `4` files / `46` tests. `npm run typecheck`
  and `npm run factory:check` passed. Only this claim and the test-only import
  policy changed; no BYOK production byte, public API, mint export, or Task139
  ownership changed.
- `npm run verify` is currently blocked outside this card: `12` files / `69`
  tests fail, led by missing mounted-prompt readback witnesses in specialist
  workflow tests and consequent local-runtime route `500` responses. The sole
  remaining action is the coordinator-directed record-14 forward merge and
  rerun before the final review pair. Status: `DONE_WITH_CONCERNS`; no further
  automatic repair is authorized.
