# Task 137A: Mounted Artifact Authority Operation

<!-- task-137a-dispatch-base-sha: e0ac8eba4c1e9df6a3f0e0d860b67ad272a027ff -->

Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, Task137A under CF-1R17 through CF-1R26.

Worker branch: `codex/task-137a-mounted-artifact-authority-operation-recovery-17`

Worktree: `/home/drake/.codex/worktrees/b48b/Cestus`

Owned paths:

- `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`
- `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`

Status: ready-for-gate-repair-integration (Recovery-17 code candidate)

## Bounded v1 Task137 Authority Policy

Status: in-progress

Plan: `docs/superpowers/plans/2026-07-16-task136-task137-bounded-assurance-implementation.md`, Task 3.
Branch: `codex/task137-authority-boundary-v1`.
Authority: `RV-1-E-545` in `docs/agentic/resident-agent-full-vision-program-registry.md`.
Immutable source evidence: `TASK137_SOURCE_SHA=cfb82c6dd940ae6ba0339b8b2b8637bcc472aea2`.

Owned files:

- `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
- `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`
- `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- `packages/local-runtime/src/portable-workspace-lifecycle.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`

Baseline reconstruction: the six preserved Task137 paths were restored from the
source evidence above onto the current program revision. This is evidence
reconstruction only; prior review and approval do not carry forward.

Verification evidence:

- Focused RED: the Task137A operation module and lifecycle inspector were absent; the focused command failed with those missing exports.
- Focused GREEN: 6 test files passed, 66 tests passed.
- Terminal CF-1R25 Task137A clean-shell authority gate passed before this readiness update; it exercised the six-path, claim-parent, hidden-state, physical-checkout, focused-test, typecheck, static-boundary, diff, and factory checks.

Forward-repair evidence after rejection of `e0ab720e05791defd6de646a39c0090231972e93`:

- Causal RED: 68 focused tests ran with two expected failures: the registrar accepted an accessor-driven identity swap, and the private portable-store capture handoff was absent. A later forged runtime-handle RED failed before source repair, proving registration had not validated it before WeakMap mutation.
- Causal GREEN: 6 focused files pass with 70 tests after one-descriptor-snapshot registration normalization, factory validation before registration, a per-operation memoized private Task135B handoff, and semantic role-specific import-policy coverage for public authority, lifecycle, role-swap, alternate-relative, alias, re-export, type-import, dynamic-import, and require negatives.
- Named gates: focused command, `npm run typecheck`, no-index/static boundary checks, `git diff --check`, and `npm run factory:check` passed. The final clean-shell CF-1R25 Task137A gate also passed after this claim update and before the replacement candidate commit.

Coordinator rejection of `24f48a377bed52383dcacc45f057be95ca0053ae`:

- Fresh admission retained the 6 focused files and 70 behavioral tests, but a standalone `npm run typecheck` exited 2.
- The rejected candidate assigned `undefined` to an exact-optional factory capture, used an un-narrowed registration key with the exact key union, passed a general `TypeNode` to an expression-or-literal AST helper, and named an invalid lifecycle invalidation reason (`handoff-recovery`).
- This recovery keeps the capture opaque and one-shot, preserves the private Task135B handoff and strict source-import roles, and repairs only those compiler-contract defects before new focused and clean-shell verification.

Replacement recovery evidence:

- Focused RED: the added type-level `import()` policy fixture failed because its `ImportTypeNode` was not unwrapped to its literal module specifier.
- Focused GREEN: the import-policy file passes 4 tests; the exact six-file Task137A command passes 6 files and 71 tests, preserving the prior 70 behavioral tests plus the new type-level import regression.
- Fresh standalone `npm run typecheck` exits 0; the no-index/static boundary checks, `git diff --check`, and `npm run factory:check` pass. The complete clean-shell CF-1R25 Task137A command passed after this claim transition before the replacement commit.

Coordinator rejection of `eea13305c957dc73d88fd616fa4fc1bb4d5f78b1` and bounded forward-repair scope:

- Both fresh reviewers required changes despite a passing 71-test clean-shell gate and standalone typechecks: transparent parenthesized dynamic loaders escaped the semantic scanner; authorized source roles could re-export protected authority; the issuer allowlist named `runtime-handle-mounted-authority.ts` instead of the plan-mandated `agent-runtime-factory.ts`; and a cached Task135B inspection could return after the runtime handle closed.
- This recovery must add causal counterfactuals for a parenthesized literal dynamic import, protected export-from/export-star/alias and import-then-export leakage with an indirect consumer, the exact future factory issuer, and inspect-then-close rejection. It remains limited to the existing six owned paths and preserves opaque, one-shot authority semantics.

Forward-repair evidence after rejection of `eea13305c957dc73d88fd616fa4fc1bb4d5f78b1`:

- Focused RED: the two affected suites ran 15 tests with four causal failures—the plan-mandated issuer path was rejected, parenthesized and computed loaders escaped, authorized re-exports leaked, and a memoized Task135B inspection returned after `close()`.
- Focused GREEN: the exact six-file Task137A suite passes 6 files and 74 tests, preserving the earlier 71 tests and adding parenthesized/computed-loader, authorized re-export/indirect-consumer, and inspect-then-close counterfactuals.
- A fresh standalone `npm run typecheck` exits 0. The no-index/static boundary checks, `git diff --check`, and `npm run factory:check` pass before the final clean-shell Task137A authority gate.
- The exact clean-shell CF-1R25 Task137A command then passes with the same 6 focused files and 74 tests, a fresh typecheck, the static boundary assertions, factory readiness, and its final physical-checkout authority assertion.

Recovery-3 rejection and repair evidence for `be38fada212e3f9905f028dca071d8122da342b2`:

- Two fresh defects-first reviews reproduced the literal terminal clean-shell gate at 6 focused files and 74 tests plus standalone typecheck, then rejected the candidate because its AST policy left `createRequire` loader aliases outside the protected-module check, authorized role files could export protected imported values and wrappers, and a registration-owned operation `Set` plus lifecycle listener retained every operation, registration, runtime, and ledger.
- Causal RED: the unchanged exact focused Task137A command ran 6 files and 77 tests with 3 expected failures. Four `createRequire(import.meta.url)` counterfactuals (direct protected load, loader alias, parenthesized call, and transitive alias) produced no violation; eight authorized-role value/wrapper export forms produced no violation; and repeated issue -> inspect -> invalidate -> revalidate -> issue observed the strong operation collection and eager listener in source.
- Repair: the policy now conservatively rejects AST-level `createRequire` use in every production TypeScript source and treats any other call whose first argument resolves to a protected module as a protected loader. It tracks value imports from protected modules through variable and assignment aliases, callback/object wrappers, functions, and classes before rejecting exported variables, functions/classes, default/export-assignment values, and named exports. Type-only imports remain outside value taint while their existing role policy remains enforced. The protected operation module retains only its four declared source-path callable exports as the lifecycle-to-operation bridge; no role file can re-export its imported authority.
- Repair: `WakeRuntimeRegistration` no longer owns an operation collection or subscribes to lifecycle invalidation. `currentOperationState` remains the sole invalidation authority: each inspection rereads the exact current Task125 admission and permanently burns a stale identity. The repeated counterfactual proves stale operations reject after each of authority loss, admission mismatch, and shutdown while each later fully revalidated admission issues and inspects a fresh operation. A supplemental source assertion proves the registration has neither the strong operation `Set` nor `subscribeInvalidation` retention chain.
- Focused GREEN: the exact six-file Task137A command passes 6 files and 77 tests. A standalone `npm run typecheck` exits 0; the no-index/static boundary assertions, `git diff --check`, and `npm run factory:check` pass. The literal clean-shell CF-1R25 Task137A authority gate passes on this candidate with the same focused count, standalone typecheck, static boundaries, factory readiness, and final physical-checkout assertion before the one replacement commit.

Coordinator-admission compiler repair after `b79fa2eac0bde066850e58e933a92dc7ea1d1686`:

- The coordinator rejected the candidate before external review because `bindingNames` read `.name` from every `ArrayBindingPattern` element even though TypeScript defines each as `BindingElement | OmittedExpression`. That union requires a `BindingElement` narrowing before the recursive name read.
- Fresh local compiler observation: the exact standalone `npm run typecheck` command exits 0 in this checkout because its configured program excludes tests; an explicit TypeScript compile of this test file also accepts the unchecked union under the installed compiler. The coordinator-supplied compiler rejection remains the causal RED for the broader compiler environment, while this repair does not claim a non-reproduced local failure.
- Fresh counterfactual: an authorized-role fixture imports the protected registrar, destructures `const [, helper] = [undefined, captured]`, then named-exports `helper`. It proves an omitted array element is safely skipped and the later protected alias remains tainted and is rejected before an indirect consumer can import it.
- Repair: `bindingNames` now calls `ts.isBindingElement(element)` before accessing `element.name`, preserving recursive value-taint propagation for every real binding and excluding only `OmittedExpression` nodes.
- Fresh GREEN: the exact focused Task137A command passes 6 files and 78 tests; standalone `npm run typecheck` exits 0. The literal clean-shell CF-1R25 Task137A gate, static checks, diff check, factory check, and final physical-checkout assertion are rerun from this final claim update before the one descendant candidate commit.

## Recovery-4 semantic policy and factory-close repair

- Rejected forensic base: `b767abb1335428934abfbc7aeb4a2e6c8b02bf25`. The prior 78-test gate and typecheck did not cover executable CommonJS/createRequire identity flow, protected value flow through patterns/properties/defaults, or public snapshotting after a real factory handle close.
- Causal RED: the operation/import focused run had 22 tests with four expected failures. Public `inspectMountedArtifactAuthorityOperation` returned a snapshot after `LocalRuntimeHandle.close()`. The import policy missed variable-specifier aliases of `module.require.bind(module)`, computed property aliases, namespace/default `node:module` `createRequire`, destructuring assignment/default patterns, property-to-closure flow, and function default-parameter exports; its prior identifier spelling check also falsely rejected metadata and an ordinary `record()` call.
- Repair: the import test now uses scope-resolved, monotonic AST analysis. It tracks protected value taint through declaration and assignment patterns (including object/array/rest/default forms), property writes/reads and receiver aliases, object/array/function/arrow/class wrappers, fields, closures, and export sinks. It separately resolves constant strings and executable loader identities for unshadowed `require`/`module.require`, aliases, `.bind`, imported/default/namespace `createRequire`, and computed constant property names. It rejects the exact protected role re-export before indirect consumers, while preserving the operation module's exact four callable exports and non-loader metadata/shadowed local calls. Public operation inspection now validates the captured factory runtime as well, permanently burning the operation when the closed capture cannot be inspected.
- Mutation-oriented GREEN: the exact six-file Task137A command passes 6 files and 81 tests. The new fixtures fail if loader detection, pattern/default propagation, property flow, function/class sink analysis, or close-time capture currentness is removed; they include `({ captured: leaked } = { captured })`, `({ leakedAssignmentDefault = captured } = {})`, `const { leakedDefault = captured } = {}`, aliased `module.require.bind(module)` with a variable protected specifier, `nodeModule["create" + "Require"]`, property aliases, default/namespace `node:module`, immediate/bound loaders, rest/field/closure wrappers, and inert metadata/local-loader lookalikes.
- Local verification before final clean-shell rerun: the three owned suites passed 33 tests; the exact six-file focused suite passed 81 tests; standalone `npm run typecheck` exited 0. Final static, factory, literal clean-shell, and clean-status evidence is recorded only after the claim update and final reruns.
- Final pre-candidate rerun: the literal CF-1R25 clean-shell Task137A command passed with 6 files and 81 tests, standalone typecheck, no-index/no-agent-index static boundaries, `git diff --check`, `npm run factory:check`, and its final physical-checkout assertion. A separate fresh `npm run typecheck`, static/diff gate, and factory check also passed afterward. The temporary ignored `node_modules` symlink is removed before the candidate status/commit handoff.

## Recovery-4 committed-byte compiler repair

- Rejected forensic candidate: `18a7990de750c35cc51e4994d5ff14f9ac676a25`. Its literal 81-test command did not establish that the committed analyzer typechecked under strict optional-property semantics. The committed bytes produced the reported `ModuleExportName`, optional function-body, optional loader assignment, explicit-`undefined` `ValueState`, and element-access narrowing diagnostics.
- Causal compiler RED: standalone `npm run typecheck` against the rejected bytes exercised the exact strict compiler boundary; no behavioral fixture was added because the defect is static representation rather than a new runtime policy case. The existing 81-test matrix remains the causal behavior guard.
- Repair: export-sink lookup now derives a lexical binding from either `ModuleExportName` form; function body traversal is guarded; `LoaderIdentity` excludes `undefined` at mutation; `ValueState` construction conditionally omits absent optional fields; and property/element access is narrowed before reading its argument. No `any`, unsafe cast, non-null assertion, or policy weakening was introduced.
- Fresh local GREEN before final candidate gates: the import-policy suite passes 12 tests and standalone `npm run typecheck` exits 0. Final clean-shell, static/diff/factory, lineage, and clean-status evidence follows the updated claim.
- Final pre-candidate gate: the literal CF-1R25 Task137A clean-shell command passes its 6 focused files and 81 tests, typecheck, source-index boundary checks, factory readiness, diff check, and final physical-checkout assertion after this compiler-repair claim entry.

## Recovery-5 exact-optional helper repair

- Coordinator admission rejected forensic candidate `d89532efd8dae50dd23813d16d8c32e637d42771`: strict standalone TypeScript compilation reported TS2379 at `mounted-artifact-authority-operation-imports.test.ts(913,29)` and `(968,52)`. Each call supplied explicit `string | undefined` and `LoaderIdentity | undefined` values to `valueState`, whose exact-optional input correctly requires those fields to be omitted when absent; the first call also supplied `Binding | undefined` for `objectRoot`.
- Causal compiler RED: with only the approved ignored `/home/drake/Projects/Cestus/node_modules` symlink present, the rejected bytes reproduce exactly those two TS2379 diagnostics. The existing 81-test semantic matrix is retained because this is a static helper-representation failure, not a changed loader, taint, currentness, or retention policy.
- Repair: both call sites now resolve candidate optional values first and conditionally construct `constant`, `loader`, and `objectRoot` properties only when defined. `ValueState` remains exact-optional; no `any`, cast, non-null assertion, optional-property widening, counterexample removal, or semantic-policy change was introduced.
- Focused GREEN before final candidate gates: the import-policy suite passes 12 tests and the standalone `npm run typecheck` command exits 0. Final literal clean-shell, static, diff, factory, committed-byte, lineage, and clean-status evidence follows this append.
- Final pre-commit gate: the literal CF-1R25 Task137A clean-shell command passes 6 focused files and 81 tests, its strict typecheck, source-index boundaries, factory readiness, six-path lineage check, diff check, and terminal physical-checkout assertion. The only dependency setup was the approved ignored `node_modules` symlink, removed with `unlink` immediately after the gate.

## Recovery-6 destructured CommonJS loader identity repair

- Coordinator rejected forensic candidate `9206637ebd9725132978039c5ae2870e7edfba51` after the semantic-policy review found that `const { require: load } = module` gives `load` neither an initializer nor loader identity, so a protected `load(...)` bypasses the source-path policy.
- Causal RED: the import-policy suite ran 13 tests with one expected failure. The new direct unshadowed `module.require` fixture emitted no violation, confirming the escape rather than relying on a reviewer description.
- Root cause: only identifier declarations retained initializers, and the pattern walker copied one undifferentiated state rather than resolving object-binding element keys. The lexically unbound CommonJS `module` object therefore had no represented `require` property for destructured aliases.
- Repair: analysis now gives only the lexically unbound `module` a private synthetic root with an exact `require` loader state. Object binding elements resolve their actual property names, including folded computed names, while rest elements retain their source root; synthetic object literals retain their own property states for nested destructuring. Direct, aliased, defaulted, rest, computed, and nested `module.require` paths now reach the existing executable-loader violation. A locally declared `module` with an ordinary `require` property remains permitted, so spelling alone cannot create authority.
- Exact-optional preservation: `ValueState` still omits absent `constant`, `loader`, and `objectRoot` fields. The repair adds no cast, `any`, non-null assertion, optional-property widening, production policy change, or removed counterexample.
- Focused GREEN before final gates: the import-policy suite passes all 13 tests and standalone `npm run typecheck` exits 0. Final literal clean-shell, factory, static, range, scope, diff, committed-byte, lineage, and clean-status evidence follows this append.
- Final pre-commit gate: the literal CF-1R25 Task137A clean-shell command passes 6 focused files and 82 tests, strict typecheck, source-index boundaries, factory readiness, exact six-path lineage, diff check, and terminal physical-checkout assertion. The approved ignored `node_modules` symlink was removed with `unlink` immediately after the gate.

## Recovery-7 semantic CommonJS value-flow repair

- Rejected forensic candidate: `e01e8b77546ba139bad96e280ce3a689f271885`. Independent semantic review reproduced three escapes in the test-owned lexical/value analyzer: loader defaults were reduced to taint-only propagation, object/array assignment patterns copied an undifferentiated state, and property lookup accepted only identifier receivers.
- Causal RED: the import-policy suite ran 14 tests with one expected failure. The six new fixtures produced no violation, including `const { require: load = require } = {}; load(protected)`, `function loadProtected(load = require) { load(protected) }`, `({ require: load } = module); load(protected)`, `[load] = [module.require]; load(protected)`, an array-rest alias, and `holderAlias["nest" + "ed"].require(protected)`.
- Repair: `ValueState` now represents absence separately from present values, so binding and assignment defaults consume their initializer only for a missing property; unshadowed `require` projects a CommonJS loader value rather than only a callee spelling. The monotonic fixpoint resolves object keys, array positions and rest slices, and nested property receivers through their value roots. Assignment patterns use those same selections, including default targets, without replacing a discovered binding root.
- Controls: function-parameter, catch, and lexical `module` shadowing plus a lexical `require` default remain untainted; the fixtures cover missing-property defaults, object/array assignments, nonzero array/rest flow, chained nested receiver aliases, and folded computed receiver keys. Existing direct/alias/default/rest/computed/nested CommonJS, protected-value, and source-role counterexamples remain present.
- Focused GREEN before final candidate gates: the import-policy suite passes 14 tests; the exact six-file Task137A suite passes 6 files and 83 tests; standalone `npm run typecheck`, static source-index checks, `git diff --check`, and `npm run factory:check` exit 0. The literal clean-shell, committed-byte/range/lineage, and clean-status evidence follows this append before the candidate commit.

## Recovery-8 committed-byte narrowing repair

- Coordinator committed-byte admission rejected `3a2fe83141500c31c9e13b7929d5e308fb16a5ec`: strict TypeScript reported TS18048 at `applyBindingValue` lines 1028 and 1033. The optional-chain predicates `binding?.constant === undefined` and `binding?.objectRoot === undefined` did not narrow the `Binding | undefined` parameter for the following mutable writes.
- Causal compiler RED: the local project `npm run typecheck` exits 0 because its configured program omits this test file, but an explicit strict TypeScript compile of this file reproduces exactly both TS18048 diagnostics. This is a static representation failure; the existing 83-test semantic matrix is retained unchanged.
- Repair: each mutation condition now explicitly requires `binding !== undefined` before reading or writing that binding. The existing exact-optional state shape, monotonic first-write rule, loader/default/pattern behavior, and all counterexamples are unchanged. No cast, `any`, non-null assertion, widening, or policy change was added.
- Focused GREEN before final committed-byte gate: the import-policy suite passes 14 tests; standalone `npm run typecheck`, the explicit strict compiler regression command, `git diff --check`, and `npm run factory:check` exit 0. The literal clean-shell Task137A gate will run from the final committed bytes before handoff.

## Recovery-9 semantic evaluator and stale-capture repair

- Forensic baseline: `80b14e9204375244fe273f5ff8265ed46c4f4ff6`, rejected by the semantic-policy and mounted-lifecycle reviews recorded in program event `RV-1-E-490` at coordinator commit `47dae2f2`.
- Causal RED: the focused operation/import run executed 27 tests with three expected failures. An initially clean `holder` retained its first empty root after reassignment, so direct and chained `holder.secret` exports escaped. Static `eval` and `Function` bodies containing protected dynamic imports had no AST loader violation. Repeated issue -> invalidate -> revalidate stale operations burned before consuming their private factory capture.
- Repair: the test-owned analyzer now caches literal roots per AST node and distinguishes first binding initialization from later replacement writes, preserving prior aliases while making direct and later chained reads resolve the replacement root. It parses only statically folded, lexically unshadowed `eval` and `Function` bodies and rejects only their protected dynamic/CommonJS consumption; inert string bodies and lexical evaluator bindings remain permitted. The mounted operation boundary marks its original capture inspection before every attempt and drains an uninspected capture during a stale burn while discarding the result, so stale authority remains fail-closed and capture retention cannot accumulate.
- Focused GREEN: the two affected suites pass all 27 tests, including direct/chained/control root flow, `eval`/`Function`/`new Function` protected imports, harmless and shadowed evaluator controls, and three stale invalidation cycles with zero stale mounted append/effect. A fresh standalone `npm run typecheck` exits 0.
- Final pre-commit gate: the literal CF-1R25 Task137A clean-shell command passes 6 files and 86 tests, its embedded standalone typecheck, source-index static boundary checks, factory readiness, exact six-path lineage, diff check, and terminal physical-checkout assertion. The only dependency setup was the approved ignored `node_modules` symlink, removed with `unlink` immediately after the gate.

## Recovery-10 terminating root-version repair

- Rejected forensic candidate: `8180a8687e195252b82409e3dc256e79a03caa50`, rejected by coordinator event `RV-1-E-496` at program commit `53f9b53662f98741b1cc56aa33fa039fae937662`. Its Recovery-9 replacement rule updated one mutable root for every source-order assignment. The sequence `let holder = {}; holder = { secret: captured }; holder = {}; export holder.secret` therefore alternated between two cached literal identities on every whole-file pass and never converged.
- Causal RED: a timeout-bounded focused fixture containing that exact sequential-reassignment sequence exited `124` under `timeout 15s`. A separate timeout-bounded array-rest fixture, `const [ignored, ...rest] = [undefined, module.require]; const [load] = rest`, also exited `124`: `arrayRestValue` created a fresh synthetic root on every pass and rewrote the same positional binding fact forever.
- Repair: each binding now retains source-positioned object-root write facts. A read selects the latest write before that expression, so the current binding observes its latest assignment while a prior alias retains the root visible at its declaration. Literal roots remain cached by AST node. Array-rest roots are additionally cached by rest AST site, input-root identity, and array index, eliminating per-pass synthetic identities while retaining distinct derived views when an input root or rest position differs. The model terminates without iteration caps or suppressed changes.
- Regression coverage: direct replacement followed by a clean current read, a prior alias that must still leak, and an earlier alias that must remain clean cover current/prior/control semantics. The new dedicated array-rest regression preserves CommonJS loader recognition and completes under the same 15-second bound. The Recovery-9 evaluator-created protected-import policy and stale-capture draining remain unchanged.
- Focused GREEN before final candidate gate: the import-policy suite passes 18 tests, including both new convergence regressions; the affected import/operation suites pass 29 tests. The literal complete Task137A gate, standalone typecheck, static/range/scope/diff/factory checks, and clean/no-symlink inspection are rerun after this claim update from the final candidate bytes.

## Recovery-11 reachable object export repair

- Rejected forensic candidate: `3e8738c984a4a78d3d8f82eb3661f5b53a352869`, rejected by coordinator event `RV-1-E-503` at program commit `448cd8ee3750ebd765018a292762c8fd8aa94bd3`. Its terminating root-version model preserved the correct historical root for aliases, but export sinks consulted only scalar `Binding.tainted`.
- Causal RED: under `timeout 15s`, the import-policy suite ran 19 tests with one expected failure. An authorized registrar imported protected authority, wrote it to `holder.authority`, retained a direct alias, an object-rest alias, and a stale alias, replaced `holder`, and exported all three aliases. The analyzer returned no violation. An otherwise identical harmless object-property control remained clean.
- Repair: every export/re-export sink now tests the exported value's reachable object graph as well as direct taint. The traversal follows the existing source-positioned root selection, recurses through property states, and uses a visited-root set to terminate cyclic graphs without an iteration cap or suppressed state change. Existing current-root, prior-alias, replacement, loader, evaluator, destructuring, and closure paths are unchanged.
- Focused GREEN: the same timeout-bounded import-policy suite passes all 19 tests; the complete Task137A focused suite passes 6 files and 89 tests under the same bound. A standalone `npm run typecheck` exits 0 before candidate freeze. The final literal clean-shell Task137A command, static boundary, range, diff, factory, exact-HEAD, clean-checkout, and no-symlink inspections run from the immutable candidate bytes.

## Recovery-12 declaration-binding compiler repair

- Coordinator admission rejected forensic candidate `ef16077d8f4d0bce4da5d72180b5c20dcf92fac4` at registry event `RV-1-E-507`, program commit `3e82d99a1cf8335d33b6063a4ac6488cc1fe2e46`. Its literal committed-byte gate reached the embedded strict compiler, which reported TS2345 at the second independent `declarationBinding(statement, analysis)` call: the prior undefined check cannot narrow a later function call.
- Causal RED: the coordinator's exact committed-byte compiler result exercises the strict static boundary. The local standalone compiler exits 0, so no behavioral fixture is added for this representation-only defect; the existing 89-test authority matrix remains its semantic guard.
- Repair: `declarationReferencesTainted` resolves the function/class declaration binding once, narrows that local value, and only then asks the existing reachable-root sink analysis. No cast, non-null assertion, optional-type widening, iteration policy, taint rule, or test expectation changed.
- Focused GREEN: the timeout-bounded import-policy suite passes all 19 tests and the complete Task137A focused suite passes 6 files and 89 tests. A standalone `npm run typecheck` exits 0 before candidate freeze. The final literal clean-shell Task137A gate, static boundary, range, diff, factory, exact-HEAD, clean-checkout, and no-symlink inspections run from the immutable candidate bytes.

## Recovery-13 indirect evaluator alias and comma-callee repair

- Coordinator event `RV-1-E-510` at `a95016bbaa1fa1f4f461245e6f0c218afdea7711` rejected Recovery-12 `cbf3035ea44d843f2f8a21f51a6a24f50c1b6cb4`: a bound alias of the global `eval` evaluator was classified as an ordinary local function. Independent lifecycle review `019f6af3-aabb-7670-b82a-7ec38990c64c` additionally found that `(0, module.require)(protectedSpecifier)` bypassed executable-loader recognition.
- Causal RED: the focused import-policy suite ran 20 tests with one expected failure. `const indirectEval = eval; indirectEval('import(...)')` produced no evaluator-created authority-loader violation; the independent guarded lifecycle fixture separately established that the comma-callee CommonJS form produced no executable-loader violation.
- Repair: authority analysis now preserves global evaluator identity through local value bindings and their aliases while retaining harmless and shadowed local evaluator controls. Callable identity resolution now normalizes transparent comma expressions to their final callee before evaluator or loader classification, so the executable `module.require` callee reaches the existing protected-specifier policy without treating a locally declared `module.require` lookalike as authority.
- Focused GREEN: the import-policy suite passes all 20 tests, including indirect evaluator, comma-callee CommonJS, inert indirect-evaluator text, and local-module controls. The immutable candidate's literal Task137A clean-shell command and all required standalone admission checks run only from its committed bytes.

## Recovery-14 bound evaluator and transparent comma identity repair

- Rejected forensic base: `609e6b6f68d8f60e1aae2d1030692ad7a3b33962`, rejected by both independent reviews in coordinator event `RV-1-E-516`. A bound global evaluator alias and a global evaluator alias initialized through a transparent comma expression both escaped the static authority-loader policy.
- Causal RED: the focused import-policy suite ran 22 tests with two expected failures. `const boundEval = eval.bind(globalThis)` and `const commaEval = (0, eval)` each evaluated a protected dynamic import without an evaluator-created authority-loader violation. Bound and comma-wrapped local arrow evaluator controls remained harmless.
- Root cause: `valueForExpression` modeled neither the return value of an evaluator's own `bind(...)` call nor the right-hand value of a comma expression, so both aliases lost their existing evaluator identity before invocation.
- Repair: the evaluator identity now propagates only through a direct `.bind(...)` call on an already-recognized evaluator and through the right side of a comma expression. The repair neither changes lexical shadowing rules nor the fixed-point traversal, preserving local controls and termination.
- Focused GREEN: the import-policy suite passes all 22 tests; the exact six-file Task137A suite passes all 6 files and 92 tests. The literal clean-shell Task137A gate, fresh standalone typecheck, exact revision/scope/diff/factory/clean/no-link checks run from these finalized candidate bytes before the one immutable candidate commit.

## Recovery-15 source-bound evaluator repair

- Rejected forensic base: `0d78305a343f6ae2e49ee8c68147895d9947fdcb`, rejected by both independent reviewers in registry event `RV-1-E-524`. A global `eval` or `Function` bound with protected source text and later invoked with no outer arguments retained evaluator identity but lost the source selected during `bind`.
- Causal RED: the focused import-policy suite ran 23 tests with the new source-bound `eval` fixture failing because it produced no evaluator-created authority-loader violation. The fixture also covers source-bound `Function`; harmless controls prove that inert global-evaluator text and source-bound local evaluator lookalikes remain permitted.
- Repair: evaluator value state now retains an optional folded source supplied to an already-recognized evaluator's direct `.bind(...)` call. A later zero-argument invocation inspects that retained source; calls with outer arguments preserve the prior argument-based evaluation path. Lexically shadowed evaluator names still do not acquire global evaluator authority, and evaluator identity, loader behavior, fixed-point convergence, and all preexisting fixtures remain unchanged.
- Focused GREEN: the import-policy suite passes all 23 tests; the exact six-file Task137A suite passes 6 files and 93 tests. A fresh standalone typecheck exits 0 before the literal terminal gate, static boundaries, factory check, final clean/no-link inspection, and immutable candidate commit.

## Recovery-16 evaluator state replacement and repeated-bind repair

- Rejected forensic base: `f47084d5772d460e47d073a915aa013722952ed8`, with both exact-SHA reviews returning NEEDS-CHANGES at coordinator event `RV-1-E-532`. The lifecycle review's isolated fixture proved that `eval.bind(globalThis, protectedSource).bind(globalThis)()` lost its source. The independent analysis review proved that a source-less bound evaluator reassigned to a protected source-bound evaluator retained incomplete first-write state.
- Causal RED: the timeout-bounded import-policy suite ran 24 tests with one expected failure. A single focused fixture covers direct repeated binding for global `eval` and `Function`, replacement writes from source-less bindings to protected source-bound evaluators, and inert/local evaluator controls. Before repair, it emitted no evaluator-created authority-loader violation for the direct rebind path.
- Repair: evaluator identity and its optional source are now recorded as source-positioned binding-write state rather than first-write-only binding fields. Reads select the latest write at their source position, so later replacement writes supersede incomplete evaluator state without changing earlier reads. Repeated `bind` composition preserves an already-bound source; initial `eval` and `Function` binds still select their respective source argument. The fixed-point state remains finite and change detection records only distinct write states.
- Focused GREEN: the import-policy suite passes all 24 tests and the exact six-file Task137A suite passes 6 files and 94 tests. A fresh standalone `npm run typecheck`, source-index boundary checks, `git diff --check`, and `npm run factory:check` pass with no dependency link remaining. The literal clean-shell Task137A gate and final exact revision/scope/diff/factory/clean/no-link checks are reserved for the immutable candidate bytes.

## Recovery-17 evaluator binding-semantics repair

- Exact forensic base: `dae77fc5a2a8e254dfce9234333aa27a9178361f`. Both fresh
  Recovery-16 reviews rejected it: the terminal gate stops after focused tests
  when standard input is consumed, and its evaluator analyzer treated chained
  `Function.bind` like `eval.bind`, preserving an earlier body after a later
  binding supplies the effective body.
- Causal RED: the import-policy suite ran 24 tests with one expected failure.
  `Function.bind(globalThis, protectedBody).bind(globalThis, "return 0")`
  was incorrectly reported as an evaluator-created authority loader even
  though the later bound argument is the effective Function body and the
  earlier protected string is only a parameter (and makes the real constructor
  throw before loading authority).
- Repair: evaluator binding now models `eval` and `Function` separately.
  `eval` retains its first bound source once established; `Function` retains a
  prior body only when a later bind supplies no constructor argument and
  otherwise uses the newest bound argument as its body. Existing protected
  repeated-bind and replacement-write coverage remains unchanged.
- Complete code-lane GREEN: the import-policy suite passes all 24 tests and
  the exact six-file Task137A suite passes all 6 files and 94 tests. Standalone
  `npm run typecheck`, source-index boundaries, `git diff --check`, and
  `npm run factory:check` pass. The temporary ignored dependency symlink is
  removed immediately after each command. The literal terminal gate remains
  replaced by its independently owned repair lane and is intentionally not run
  here; this code candidate stops pending that repair's integration.
