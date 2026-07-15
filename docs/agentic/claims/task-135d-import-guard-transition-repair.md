# Task135D import-guard transition repair

- Status: ready-for-review
- Owner: `/root`
- Branch: `codex/task-135d-import-guard-transition-repair`
- Worktree: `/home/drake/.codex/worktrees/88b6/Cestus`
- Claimed at: `2026-07-15T20:28:47Z`
- Base commit: `52381a20c50fa074c0aa1f0f6672c72b8c3fa7ea`
- Contract: CF-1R18 Task135D import policy; zero factory-capture importers
  before Task137A creates the mounted authority operation, then exactly
  `packages/local-runtime/src/mounted-artifact-authority-operation.ts`.

## Exclusive paths

- `packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts`
- `docs/agentic/claims/task-135d-import-guard-transition-repair.md`

## Scope and verification plan

The workspace-root assertion in the import-policy test must use the same
existence-dependent importer expectation as
`assertCaptureSeamImportersAreAllowed`. This repair changes no production code,
active plan, registry, or unrelated test.

Before tracked test edits, this lane will create the exact future authority
module temporarily with a capture-seam import and run only
`npm test -- packages/local-runtime/test/runtime-handle-mounted-authority-imports.test.ts`.
That causal RED must show the hard-coded workspace-root `[]` expectation
rejecting the one permitted importer. The temporary module will be removed
before tracked edits and after each counterfactual run.

After the minimal test repair, the same focused command will be rerun with the
temporary module present for GREEN, then without it to prove the zero-importer
precondition. Final non-full checks are `npm run typecheck`, `git diff --check`,
and `npm run factory:check`. Full verification, production edits, network,
provider, credential, Nous, reset-credit, `neo`, merge, rebase, push, and
program-registry activity are out of scope.

## Causal transition evidence

- This fresh isolated worktree initially lacked `vitest`; after confirming the
  identical lockfile in a local worktree cache, `npm ci --offline
  --ignore-scripts` installed only ignored local dependencies without network
  activity or tracked dependency changes.
- RED: with a temporary exact
  `packages/local-runtime/src/mounted-artifact-authority-operation.ts` that
  imports `captureFactoryIssuedMountedRuntime` from `./runtime-factory.js`, the
  focused import test exited `1`: one test failed and two passed. The scanner
  returned the permitted mounted-operation path, while the workspace-root
  assertion at line 741 still expected `[]`; the dynamic allowlist assertion
  passed.
- GREEN: after changing only that workspace-root expectation to the same
  existence-based one-path-or-zero transition, recreating the identical
  temporary module made the focused import test exit `0` with all three tests
  passing.
- Zero-importer proof: after removing the temporary module, the identical
  focused import test again exited `0` with all three tests passing. No
  `mounted-artifact-authority-operation.ts` remains in the checkout.
- Final non-full gates each exited `0`: `npm run typecheck`, `git diff --check`,
  and `npm run factory:check` (`factory-readiness passed`).
