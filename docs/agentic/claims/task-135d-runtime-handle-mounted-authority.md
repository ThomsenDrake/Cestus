# Task135D recovery: R-owned factory-issued mounted handle capture

- Status: ready-for-review
- Owner: `/root`
- Branch: `codex/task-135d-runtime-handle-capture-import-review-repair`
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
