# Task135D recovery: R-owned factory-issued mounted handle capture

- Status: ready-for-review
- Owner: `/root`
- Branch: `codex/task-135d-runtime-handle-capture-ast-import-review-repair`
- Worktree: `/home/drake/.codex/worktrees/8ca0/Cestus`
- Claimed at: `2026-07-15T16:00:07Z`
- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, terminal Task135D through CF-1R26.
- Coordinator recovery boundary: `RV-1-E-336`.
- Coordinator import-ownership review repair: `RV-1-E-343`; prior candidate
  `4e6542a462b428ce5c0d0c278410fba81ecff6a7` is preserved but rejected only
  for incomplete import ownership coverage. This bounded forward repair owns
  the import-authority test and claim evidence only; production authority and
  lifecycle behavior remain review-approved and must not change.

<!-- task-135d-recovery-dispatch-base-sha: e532c35fd1b3a829dfbbd4f87d752f42304419f9 -->

## Recovery scope

Across `e532c35fd1b3a829dfbbd4f87d752f42304419f9..candidate`, this recovery
lane may change exactly these four paths and may contain no merge commits:

- `packages/local-runtime/src/runtime-factory.ts`
- `packages/local-runtime/test/runtime-handle-mounted-authority.test.ts`
- `packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts`
- `docs/agentic/claims/task-135d-runtime-handle-mounted-authority.md`

The coordinator replayed the preserved test-only RED artifact before this
claim. Task135D owns only `FactoryIssuedMountedRuntimeCapture.v1`: exact
factory handle identity, mounted workspace, ledger identity, closed state,
portable root/storage/workspace snapshot, and source-high-water binding.
Capture and inspection remain source-path-only. No lifecycle, wake, stores, H,
agent-runtime-factory, indexes, routes, DTOs, or fifth path is authorized.

## Recovery lineage and authorization

- New exact source base: `e532c35fd1b3a829dfbbd4f87d752f42304419f9`.
- Coordinator preserved-RED replay commit: `3643a5cb968542ddd9fb866f673de393badd866e`.
- Task135E reviewed/coordinator integration: `9480ca97dbc017cfe6dd2db68b1fbbc21eb0727d`.
- Historical Task135D source base: `197c3ca528e9b666c02b9b87695bf900efa195b1`.
- CF1 integration: `a321955d84eb700722e08eaa835ddb076fda62b2`.
- Reviewed/coordinator-integrated Task117A: `2ad417356afc00b26ff00fa763977e2469463d72`.
- Task117A external sibling attestation C: `1cde7adb1a3b9fb1621b75410c203eec631a45ba`.
- Task125 corrected integration: `2e5c35ab7bca33df9f1a0c482c496fbb93350086`.
- Task135A integration: `ac3f91901da0c9b23722a046be73d95746f691da`.
- The coordinator explicitly authorized
  `superpowers:subagent-driven-development` for the original exact Task135D
  lane with test-driven development, systematic debugging, and
  verification-before-completion. This recovery records that authorization
  history; the coordinator explicitly directs this worker to continue directly
  and not spawn another implementer.

The unchanged focused command must show only the missing-capture causal RED
while all resident-identity tests pass. Full verification, provider/network/
credential/Nous actions, reset credits, `neo`, merges, rebases, pushes,
self-integration, and program-registry edits remain closed.

## Recovery verification evidence

- Causal RED: the unchanged focused command exited `1` with only the 8
  Task135D capture tests failing because
  `captureFactoryIssuedMountedRuntime is not a function`; both companion test
  files passed (11 tests).
- First GREEN attempt isolated one close-path defect: it burned captures by
  deleting their private entries, causing inspection to report `required`
  instead of `closed`. The corrective change retains only an unusable private
  closed marker and clears the handle's derived-capture set before ledger close.
- Focused GREEN: the unchanged focused command exited `0` with 3 test files
  and 19 tests passed.
- Pre-commit authorized non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, or self-integration was performed.

## RV-1-E-343 import ownership repair evidence

- The claim was reopened from the coordinator's preserved, review-rejected
  `4e6542a462b428ce5c0d0c278410fba81ecff6a7` on fresh forward branch
  `codex/task-135d-runtime-handle-capture-import-review-repair`; production
  code remains untouched.
- The import verifier now recursively enumerates every `packages/*/src` tree
  and every supported production extension (`.ts`, `.tsx`, `.mts`, `.cts`,
  `.js`, `.mjs`, `.cjs`). It rejects named, namespace, dynamic/CommonJS, and
  star re-exports of the private capture/inspection seam outside the exact
  future `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
  path. The current absent seam therefore admits zero importers.
- Causal fixture proof: a temporary deep
  `packages/agent-runtime/src/deep` fixture exercises all seven extensions,
  including a cross-package factory deep import and a star re-export. The
  scanner reports every fixture file and the allowlist assertion rejects it.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed (the original 19 plus the expanded import case).
- Authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## RV-1-E-347 typecheck repair

- The coordinator independently rejected
  `b8a0c19ba500fb1e0c4780c9a3e16a535500916f` before review because the
  no-unchecked-indexed-access typecheck reports only this import test's three
  `match[1]` reads (lines 78, 84, and 90). The regexes structurally require
  their first capture; this forward repair is limited to non-null assertions
  at those exact reads and must not change scanner semantics, fixture coverage,
  or production code.

- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed after the assertion-only repair.
- Authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## RV-1-E-355 type-namespace grammar repair

- The coordinator independently preserved but rejected
  `dc0d01f76d8a0c4073033b86e27157a205ef5209`: the namespace/re-export
  grammar omitted the legal TypeScript-family `type` modifier between
  `import`/`export` and `*`. This forward repair owns only causal deep
  cross-package fixtures and the minimal grammar extension; roots, extensions,
  existing runtime forms, allowlist behavior, and production code remain
  unchanged.
- Causal RED: the prescribed focused command exited `1` only in the expanded
  import test (1 failed, 19 passed). Its exact scanner result retained the
  existing eight paths and omitted only `import type * as`, `export type *`,
  and `export type * as` deep cross-package fixtures.

- Focused GREEN: after the optional whitespace-delimited `type` modifier in
  the existing namespace/re-export grammar, the prescribed command exited `0`
  with 3 test files and 20 tests passed.
- Authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## RV-1-E-362 AST import-inspection repair

- The coordinator independently preserved but rejected
  `f121af369d2281b515fda07bb15ae4948404062b`: lexical regexes miss valid
  TypeScript trivia and escaped-token spellings even though the compiler decodes
  them to the protected runtime-factory module and capture names. The installed
  local TypeScript compiler API is available; this forward repair owns only the
  test scanner and causal fixtures, without a new dependency or production
  change.

- Causal RED: the prescribed focused command exited `1` only in the expanded
  import test (1 failed, 19 passed). All eight new deep cross-package fixtures
  had zero parse diagnostics and compiler-decoded to the protected module; the
  two named forms also decoded to `captureFactoryIssuedMountedRuntime`. The
  lexical scanner returned only the prior 11 paths and omitted all eight.
- Focused GREEN: one compiler-AST traversal now inspects import/export
  declarations, named and namespace bindings, import-equals/require, and
  dynamic `import()` calls. It compares decoded string-literal module
  specifiers and identifiers without a regex normalization layer; the command
  exited `0` with 3 test files and 20 tests passed.
- Authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## RV-1-E-363 public compiler API typing repair

- The coordinator independently rejected
  `bdb0ab744ef32d99e2cccc2ca4bbe33034a6d379` only because its test scanner
  referenced a non-public script-kind helper and `SourceFile.parseDiagnostics`,
  and used the runtime `ts` const as a type namespace. The bounded forward
  repair preserves `createRequire` for the runtime sourcemap behavior; type
  positions now use `TypeScript.*`, script kind is derived from source
  extension with public enum values, and fixture diagnostics use public
  `transpileModule(...).diagnostics`.
- Causal type RED: `npm run typecheck` exited `2` only at lines 86, 246, 253,
  and 264 for those private/namespace API uses.
- The first public-diagnostics implementation constructed a full `Program` for
  every fixture and timed out only the import test (1 failed, 19 passed). The
  public `transpileModule` replacement preserves the diagnostic assertion
  without resolution overhead.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed. Typecheck and the authorized pre-commit non-full gate exited
  `0`: `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## Final AST authority review repair

- Coordinator verdicts on
  `e98ab9e8102714bad2f3d1b2ecc27d7c88bc1d19`: private lifecycle authority is
  **APPROVED**; AST import authority needs this bounded repair. No production
  runtime code changes are authorized or present.
- Causal RED: the prescribed focused command exited `1` only in the expanded
  import test (1 failed, 19 passed). The compiler AST decoded all query and
  fragment module literals, while the basename predicate omitted exactly the
  eight protected named, namespace, re-export, import-equals/require, and
  dynamic-import paths.
- The scanner now removes only `?`/`#` suffixes from decoded literals, requires
  a relative specifier, resolves it from `dirname(sourcePath)`, normalizes
  source extensions (including NodeNext `.js`/`.mjs`/`.cjs`), and compares the
  extensionless result to the exact
  `packages/local-runtime/src/runtime-factory` root target. Bare-package and
  unrelated relative lookalikes remain excluded; the mounted-operation
  allowlist is unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed. The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## Final default-binding and CommonJS review repair

- Coordinator verdicts on
  `b1a74ab7e96fef9a1c7dd5496261d90fcc3e9eb0`: both private-lifecycle and AST
  import-authority lenses need this test-only scanner repair. No production
  runtime code changes are authorized or present.
- Causal RED: the prescribed focused command exited `1` only in the expanded
  import test (1 failed, 19 passed). The existing scanner found the prior 27
  paths and omitted exactly normal/type-only default imports plus direct
  `module.require` and `module["require"]` calls to the exact protected target.
- Import declarations now reject an exact protected module when
  `ImportClause.name` is present. CommonJS recognition includes only direct
  `module.require` and string-literal `module["require"]`; unrelated object
  property/element calls remain non-authoritative. Decoded AST, suffix stripping,
  importer-relative/root-bound resolution, NodeNext equivalence, and the sole
  mounted-operation allowlist are unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed. The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## Final named-default import-authority review repair

- Coordinator review verdicts on
  `a865c5493f7467c11839a2b4b41154eeb44b3ae4`: private lifecycle is
  **APPROVED**; AST import authority **NEEDS-CHANGES** only for exact-target
  named-default declarations. This remains a test-only scanner repair; no
  production runtime file or behavior changed.
- Claim lifecycle: reopened as `in-progress` for this bounded repair and
  returned to `ready-for-review` after the documented focused and non-full
  gates.
- Causal RED: after adding decoded-AST fixtures for normal/type-only
  named-default imports and normal/type-only named-default re-exports, the
  prescribed focused command exited `1` only in the expanded import test (1
  failed, 19 passed). It expected 35 protected importers and received 31,
  omitting exactly the four named-default files.
- The AST repair reads only the source-side name
  `(propertyName ?? name).text`: decoded `default` is authoritative regardless
  of its local alias, while a local alias named `default` for any other source
  export remains non-authoritative. Existing capture exports and every other
  static, namespace, type, import-equals, re-export, dynamic, and CommonJS
  form are unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed.
- The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- No full verification, live/provider/network/credential/Nous action, reset,
  `neo`, merge, rebase, push, self-integration, or program-registry edit was
  performed.

## Final executable-root, import-type, and transparent-wrapper review repair

- Durable authority: `RV-1-E-393` at registry commit `85b634ea`. Coordinator
  review verdicts on `b80b28abc2ca19eedef6f7a8f9e13def7019303d`: private
  lifecycle is **APPROVED**; AST import authority **NEEDS-CHANGES** only for
  the bounded scanner gaps below. No production runtime file or behavior
  changed.
- Causal RED stage 1: an exact deep import in
  `packages/agent-runtime/bin/deep-import.mjs` was parsed with its decoded
  literal but was absent from the scanner result (1 failed, 19 passed), proving
  that the former `packages/*/src` inventory missed executable package roots.
- Causal RED stage 2: after the root-only repair, the scanner found the bin
  file while the expected 54 importers yielded 36. The exact missing set was
  three import-type namespace/qualifier/default forms plus 15 parenthesized,
  `as`, type-assertion, `satisfies`, and non-null wrapper forms around
  `require`, `module.require`, and `module["require"]` (1 failed, 19 passed).
  Exact-target import-type handling reduced that missing set to only the 15
  wrapper forms (1 failed, 19 passed).
- The scanner now inventories only each package's `src` and executable `bin`
  roots, retaining the existing extension filter and excluding test, fixture,
  and unrelated roots. Exact `ImportTypeNode` string literals use the existing
  decoded importer-relative/root-bound target comparison. Transparent
  unwrapping is limited to parentheses, `as`, type assertions, `satisfies`,
  and non-null expressions before `require` recognition; direct `import()`,
  unrelated loaders, non-exact targets, and all existing resolver/allowlist
  semantics remain unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed.
- The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- Claim lifecycle: reopened as `in-progress` for this bounded repair and
  returned to `ready-for-review` after the documented focused and non-full
  gates. No full verification, live/provider/network/credential/Nous action,
  reset, `neo`, merge, rebase, push, self-integration, or program-registry edit
  was performed.

## Final wrapped and computed loader review repair

- Durable coordinator authority: `RV-1-E-399`, inspected at registry commit
  `723f8d869c03aa1bef45fc7cebcdb46c1150d0a7`. Candidate
  `1a132365a075fd7893f5b026e0609729f97961f8` is preserved and rejected; both
  fresh reviewers found complementary P1 AST-scanner bypasses. This repair
  changes only the scanner test and this claim; production runtime bytes remain
  unchanged.
- Causal RED: fixtures added before scanner changes cover recursively wrapped
  module arguments, wrapped `module` receivers, wrapped `"require"` element
  keys, and computed dynamic-import, `require`, `module.require`, and
  `module["require"]` targets. The prescribed focused command exited `1` only
  in the expanded import test (1 failed, 19 passed): expected 64 protected
  importers and received 54, omitting exactly these 10 new fixtures.
- Static module literal recognition now recursively unwraps only parentheses,
  `as`, type assertions, `satisfies`, and non-null expressions. The same
  bounded normalization applies to `module` receivers and element keys.
  Recognized standard dynamic-import/CommonJS loader families fail closed when
  their first target argument is not statically resolvable; unrelated loader
  functions/receivers and static non-exact/package/lookalike targets remain
  excluded. Root-bound identity, suffix stripping, NodeNext equivalence, the
  extension filter, and sole mounted-operation allowlist are unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 20
  tests passed.
- The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- Claim lifecycle: reopened as `in-progress` for this final bounded repair and
  returned to `ready-for-review` after the documented gates. No full
  verification, live/provider/network/credential/Nous action, reset, `neo`,
  merge, rebase, push, self-integration, or program-registry edit was
  performed.

## Final one-shot capture and lexical loader review repair

- Durable coordinator authority: `RV-1-E-404`, inspected at append-only
  registry commit `68f68c47cc1ef49188c4210e7035ccb9b9c66c35`. Candidate
  `9c783c495cff27bb6d17c80fc314eb25db8b7b19` is preserved and held after the
  private-lifecycle and exhaustive-AST reviewers found complementary P1 gaps.
- Causal RED: the focused command exited `1` with only two intended failures
  (2 failed, 19 passed). A successful inspection permitted reuse, and the
  import scanner counted all four local/parameter-shadowed `require` and
  `module.require` calls with computed targets. After capture consumption was
  implemented, only the four shadowing cases remained (1 failed, 20 passed).
- A capture is now consumed before currentness inspection and removed from its
  handle's pending-capture set. Reuse throws `consumed` before ledger I/O; the
  test retains nested snapshot, hostile mutation, identity/currentness, close,
  and non-leakage coverage. Close still burns every unconsumed derived capture.
- The AST scanner now collects runtime bindings per source, block, function,
  catch, and loop scope. It recognizes bare `require` or `module.require`
  (including the existing element form) only when their lexical identifiers
  are unshadowed; computed targets of genuine standard loaders remain
  fail-closed, while unrelated/local/parameter-shadowed loaders are excluded.
  Root-bound identity, transparent normalization, NodeNext equivalence,
  lookalike rejection, and the sole allowlist are unchanged.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 21
  tests passed.

### RV-1-E-404 pre-GREEN var-hoist correction

- Coordinator audit identified that the first lexical collector assigned every
  declaration to its immediate block, although JavaScript `var` is hoisted to
  the nearest function/source scope. It also required named function-expression
  self-bindings to be treated as function-local runtime identities.
- Causal RED: nested-block `var require`/`var module` declarations before their
  lexical blocks, plus named function-expression `require`/`module` bindings,
  were each counted as genuine computed standard loaders (1 failed, 20 passed;
  expected 64 importers and received 68).
- Block scanning now records only block-scoped declarations. A separate public
  AST walk assigns `var` declarations to the nearest source, function, or
  module scope while excluding nested function/module scopes; named function
  expressions add only their own local binding. Runtime import bindings remain
  included, while type-only imports remain outside runtime shadowing.
- Corrected focused GREEN: the prescribed command exited `0` with 3 test files
  and 21 tests passed.
- The authorized pre-commit non-full gate exited `0`:
  `npm run typecheck && test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- Claim status is `ready-for-review`. No full verification,
  live/provider/network/credential/Nous action, reset, `neo`, merge, rebase,
  push, self-integration, or program-registry edit was performed.

## Coordinator typecheck narrowing repair

- Coordinator-independent verification of
  `0a45dcff129e24783f4619dc66067efe1d39e40a` reported a blocking test-only
  type error at import-scanner line 414: the combined class/enum declaration
  branch forwarded an optional anonymous-class `name` to a `BindingName`
  parameter. The candidate is preserved; this is a bounded forward scanner
  typing repair only.
- The repair splits class and enum handling. Class declarations now add a
  binding only after an explicit `name !== undefined` guard; enum declarations
  retain their named branch. No non-null assertion, cast, scope-policy, loader,
  or production capture change was introduced.
- Focused GREEN: the prescribed command exited `0` with 3 test files and 21
  tests passed; `npm run typecheck` exited `0` after the explicit narrowing.
- The authorized pre-commit non-full gate exited `0`:
  `test ! -e packages/local-runtime/src/index.ts && git diff --check && npm run factory:check`.
- Claim status remains `ready-for-review`. No full verification,
  live/provider/network/credential/Nous action, reset, `neo`, merge, rebase,
  push, self-integration, or program-registry edit was performed.

## RV-1-E-409 class-expression and ambient-binding review repair

- Durable coordinator authority: `RV-1-E-409`. Candidate
  `cba50ab1de0477ff9e2e85f321567f544884a889` is preserved and rejected after
  both final reviewers found valid AST scanner gaps. This bounded forward
  repair changes only the import-policy test and this claim; production
  `runtime-factory.ts` bytes remain unchanged.
- Causal RED: fixtures added before scanner changes cover named class
  expressions named `require` and `module`, plus erased ambient `declare`
  `const`, `var`, `function`, `class`, and `enum` declarations across both
  loader names. The exact focused suite exited `1` only in the import-policy
  test (1 failed, 20 passed): it expected 69 protected importers and received
  66, omitting all five ambient fixtures while incorrectly counting the two
  class-expression fixtures.
- The repair gives a named class expression's `require`/`module` self-binding
  only to its class body; type parameters and heritage clauses retain the
  surrounding scope. Runtime-shadow collection now excludes statements and
  hoisted `var` lists with a `declare` modifier, while preserving runtime
  lexical declarations, type-only import exclusion, hoisted `var`, and named
  function-expression behavior.
- Focused GREEN: the prescribed three-file command exited `0` with 21 tests
  passed. The permitted pre-commit gates also exited `0`: `npm run typecheck`,
  the no-index assertion, `git diff --check`, and `npm run factory:check`.
- The first immutable forward candidate
  `4379238e490d4ba2940d083c1ebbad8fd17cf592` then passed the same focused,
  typecheck, no-index, original-base diff-check, and factory gates. Its
  original-base path union was exactly the four authorized paths with no merge
  commits and a clean worktree. This claim-closeout commit returns the lane to
  `ready-for-review`; the final candidate receives the same required gates.

### RV-1-E-409 coordinator pre-admission heritage correction

- Coordinator pre-admission inspection of final-doc candidate
  `f87bdb5b4564b31325cd0863259fe08a0a6838f6` found that the named
  class-expression self-binding was passed to class members but not to heritage
  clauses. JavaScript evaluates heritage while the class-name binding is in
  scope (and in its TDZ), so these are not standard CommonJS loader calls.
- Causal RED: two syntax-valid negative fixtures were added before the
  traversal repair: `class require extends require(target) {}` and
  `class module extends module.require(target) {}`. The exact focused suite
  exited `1` only in the import-policy test (1 failed, 20 passed), receiving
  71 importers instead of the expected 69 because it incorrectly counted only
  those two heritage calls.
- The named class-expression binding now flows to both heritage clauses and
  members. Type parameters continue to use the inherited scope, so their
  traversal does not broaden runtime loader recognition. Existing method/body,
  ambient-declaration, `var` hoisting, and unshadowed computed-loader behavior
  remain unchanged.
- Focused GREEN: the prescribed three-file command exited `0` with 21 tests
  passed. The remaining permitted candidate gates are pending at this claim
  checkpoint.

### RV-1-E-409 consolidated audit candidate evidence

- Immutable scanner checkpoint `85503f83f3d1e4b366290c5e8393de3dd450e012`
  passed the prescribed focused suite (3 files, 21 tests), `npm run typecheck`,
  no-index assertion, original-base `git diff --check`, and
  `npm run factory:check`.
- Its original-base union remained the four authorized paths exactly, with no
  merge commits and a clean worktree. This claim-closeout commit returns the
  lane to `ready-for-review`; the final immutable candidate receives the same
  complete permitted gate set.

### RV-1-E-409 consolidated pre-admission scope audit

- Coordinator audit added three adjacent scanner cases to this same bounded
  repair: class-expression decorator/modifier traversal, `switch` case-block
  lexical declarations, and real-versus-erased TypeScript namespace bindings.
  No production capture bytes or scanner roots/extensions changed.
- Causal RED: syntax-valid decorated class expressions with unshadowed
  `require(target)` and `module.require(target)` were omitted, while direct
  case-block `const require`/`const module` and non-ambient `namespace
  require`/`namespace module` fixtures were falsely counted. The exact focused
  suite exited `1` only in the import-policy test (1 failed, 20 passed): the
  received set had 75 importers instead of the expected 73, with the two
  decorator fixtures missing and the four shadowed cases extra. Ambient
  namespace fixtures remained protected importer positives.
- The public-AST walker now visits every class-expression modifier with the
  class self-binding, applies that same binding to heritage and members,
  collects lexical statements across each `CaseBlock`, and treats only
  non-ambient identifier-named `ModuleDeclaration`s as runtime shadows.
  Genuine unshadowed computed loaders remain fail-closed; type-only imports,
  erased `declare namespace`, existing var hoisting, and all root-bound target
  rules are unchanged. No TypeChecker or program-wide analysis was introduced.
- Focused GREEN: the prescribed three-file command exited `0` with 21 tests
  passed. The remaining permitted candidate gates are pending at this claim
  checkpoint.

### RV-1-E-409 TypeChecker-backed decorator binding correction

- Before final commit, the coordinator verified with the public TypeChecker
  that a named class expression's `require`/`module` self-binding resolves the
  same identifier in its decorators, heritage, and members. The prior audit
  wording that sent modifiers through the inherited scope was therefore
  corrected before handoff.
- Causal RED: syntax-valid decorated named class-expression fixtures for both
  `class require` and `class module` were added while retaining the positive
  decorated `class Loader` fixtures. The exact focused suite exited `1` only
  in the import-policy test (1 failed, 20 passed), with exactly those two
  named-decorator fixtures falsely counted as importers.
- The class self-binding now flows uniformly to modifiers/decorators, heritage
  clauses, and members; type parameters retain the inherited non-runtime
  traversal. Positive outer-loader decorators, case-block lexical shadows,
  runtime/ambient namespace distinctions, and all existing root-bound loader
  policy remain covered.
- Focused GREEN: the prescribed three-file command exited `0` with 21 tests
  passed. The remaining permitted candidate gates are pending at this claim
  checkpoint.
