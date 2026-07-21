# Task 127 Claim: Resident Full-Vision OS Secret Store

- Task and gate: W1-127 / Lane P / `CF1-P-OS-SECRET`.
- Worker: `/root/task127_os_secret_store`.
- Branch and worktree: `codex/task-127-resident-full-vision-os-secret-store` /
  `/home/drake/.codex/worktrees/task-127-resident-full-vision-os-secret-store`.
- Coordinator base and required CF-1 descendant:
  `ceae7ca74d161196fd109d04c946976021bb8412`.
- Required freeze: `48c9cbcdcf723bcc74868f782bc2375bae565ae6` /
  `CF1-P-OS-SECRET`.
- Claimed at: `2026-07-14T00:00:00Z`.
- Status: ready-for-review.

## Scope And Authority

This task may change only:

- `packages/agent/src/os-secret-store.ts`
- `packages/agent/test/os-secret-store.test.ts`
- this append-only claim.

It creates the CF-1-selected exact-use `OsSecretStore` boundary. It validates a
current typed credential reference, capability hash, workspace, mount, run, and
declared purpose before an injected OS facility can resolve an opaque,
process-local handle. Unavailable or blocked outcomes expose only safe health
and diagnostic categories. The adapter neither authorizes invocation nor makes
any durable mutation.

No provider/configuration/registry/runtime/contract/secret-store compatibility
file, portable state, `.env`, plaintext configuration, database, artifact,
browser state, CLI auth store, cache, temporary file, command, locator, or
fallback is authorized. Tests use only credential-free in-process fakes; this
task must not use a real credential, call a provider, or start a live gate.
There is no child dispatch, self-review, self-integration, or `neo` merge.

## Verification Contract

Before production code, add and run a causal exact-use RED with:

```bash
npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts
```

The initial RED is expected because both focused test/module paths are absent.
After the minimal implementation, rerun that focused command, `npm run
typecheck`, `git diff --check`, and `npm run factory:check`. A serialized `npm
run verify` is prohibited unless the coordinator separately grants a fresh
usage-gated slot. Stop clean for a distinct fresh review after the one candidate
commit.

## RED/GREEN Evidence

- Dependency recovery: this isolated worktree initially lacked ignored
  lockfile-pinned dependencies (`vitest: command not found`). A temporary,
  untracked `node_modules` symlink to the coordinator worktree restored the
  pinned test runner without changing a tracked dependency or lockfile; it is
  removed before the candidate commit.
- RED: after the in-scope counterfactual suite was added and before
  `os-secret-store.ts` existed, the exact focused command exited `1` with one
  failed suite and zero tests because
  `../src/os-secret-store.js` could not be imported. The causal suite names a
  swapped workspace, a current successful exact use, current-reference health
  states, a purpose swap, hostile accessor/prototype/symbol/sparse-array input,
  and a locked/throwing facility. The named legacy `secret-store.test.ts` path
  is absent in this predecessor but Vitest accepted the explicit nonexistent
  filter; no forbidden compatibility test file was created.
- GREEN: the same exact focused command exited `0` with one test file and
  ten tests. The new boundary snapshots plain own-data input before an await,
  compares the whole typed credential reference and capability/workspace/mount/
  run/purpose tuple to the frozen current use, returns only bounded health and
  diagnostic codes, and exposes any resolved credential-free fake as a
  non-enumerable opaque handle. It performs no portable write, fallback, or
  facility discovery.
- Follow-up gates: `npm run typecheck` completed successfully; `git diff
  --check` exited `0` with no output; and `npm run factory:check` exited `0`
  with `factory-readiness passed`.
- Full verification: not run. The coordinator has not granted a serialized
  `npm run verify` slot for this candidate.
- Fresh-review repair RED: the exact focused command exited `1` with **17
  tests**, of which three failed while fourteen prior cases passed. A runtime
  `Reflect.construct` of `OpaqueSecretMaterial` minted a handle instead of
  failing, a released handle returned by the injected backend was accepted as
  healthy, and a direct proxy request reached a successful resolution. The
  added counterfactuals also cover mount, run, provider-capability-hash, and
  credential-reference swaps with zero backend calls.
- Fresh-review repair GREEN: issuance now requires a module-private runtime
  token, released material is removed from the issuance set before a result can
  normalize as resolved, and direct proxy input is rejected before any request
  property or backend access. The exact focused command is green at **17/17**;
  `npm run typecheck`, `git diff --check`, and `npm run factory:check` all pass.
  This repair is scoped to the claimed source and test documents. The temporary
  untracked dependency link is removed before this handoff commit. Full
  verification remains prohibited pending a fresh independent review and a
  separate usage gate.

## Fresh Root-Cause Repair Evidence (2026-07-14)

- Repairer: `/root/task127_root_repair`, starting from rejected repair
  `15ed426be42cd57bec692a3c37b1c71fdab2fd1d`. This repair changes only the
  claimed source, test, and this append-only claim; no provider, credential,
  runtime, fallback, or `neo` action occurred.
- Dependency recovery: the initial named RED could not start because this
  isolated worktree had no ignored `node_modules` (`vitest: command not
  found`). A temporary untracked symlink to an existing lockfile-pinned
  worktree runner enabled the focused suite. It is removed before the repair
  commit.
- Causal RED: `npm test -- packages/agent/test/os-secret-store.test.ts
  packages/agent/test/secret-store.test.ts` exited `1` with **20 tests**, four
  failures, and no credential/provider use. The public module namespace still
  exported the credential-free material issuer; the backend had no scoped
  issuer for deterministic material; replacing the exported material
  prototype's release method left the material valid; and
  `createOsSecretStore` invoked a hostile factory getter before normalization.
  The factory/backend counterfactual asserted safe `blocked` output with zero
  proxy or getter traps.
- Root-cause refinement: after the first minimal GREEN attempt, the same
  command left exactly the cross-use test failing. Material was bound only to a
  credential-reference identity, not the complete capability/workspace/mount/
  run/purpose tuple. The repair therefore derives one immutable full exact-use
  identity and binds every issued handle to it.
- GREEN: the named focused command exited `0` with **20/20** tests. The public
  test issuer is absent; only an in-flight backend callback can issue a handle,
  and it closes after that resolution returns. A private `WeakMap` records the
  immutable full exact-use identity; release is a frozen own closure rather
  than a mutable prototype method; factory, request, backend, and backend
  result shapes normalize before field access or await. Invalid shapes produce
  bounded secret-safe outcomes, with no fallback or persistence path.
- Follow-up gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0` with no output; `npm run factory:check` exited `0` with
  `factory-readiness passed`.
- Full verification: not run, as explicitly prohibited by the repair
  authorization. Latest status: `ready-for-review`; stop for a fresh
  independent review before any integration.

## Issuer-Expiration Regression Repair (2026-07-14)

- Repairer: `/root/task127_issuer_repair`, starting at
  `4c3a0a6528a181432b667c123bce8f75aeae699e`.
- Status: `in-progress`. This bounded C102 repair owns only this append-only
  claim and the existing OS-secret-store source/test pair. It will add the
  missing causal proof that a backend-retained issuer expires after its valid
  `resolveForExactUse` call settles; no provider, credential, full verifier,
  integration, child dispatch, or `neo` action is authorized.
- Dependency recovery: the first focused invocation was blocked only because
  this isolated worktree lacked ignored `node_modules` (`vitest: command not
  found`). An untracked symlink to the coordinator worktree's lockfile-pinned
  runner enabled the authorized focused suite and is removed before commit.
- Baseline: after adding the retained-issuer counterfactual, the exact focused
  command exited `0` with **21/21** tests, confirming that the existing
  `finally` close already supplies the requested behavior.
- Causal RED: temporarily neutralizing only `issuer.close()` in that `finally`
  made the same command exit `1` with **one failure and twenty passes**. The
  new test received an `OpaqueSecretMaterial` where it required `undefined`
  after `resolveForExactUse` settled. The close was immediately restored;
  production design is otherwise unchanged.
- GREEN: with the close restored, `npm test --
  packages/agent/test/os-secret-store.test.ts
  packages/agent/test/secret-store.test.ts` exited `0` with **21/21** tests.
  The counterfactual also feeds any post-settlement mint attempt into a valid
  exact-use resolution and proves it cannot become accepted material.
- Follow-up gates: `npm run typecheck`, `git diff --check`, and `npm run
  factory:check` each exited `0`; no full verification was run, as prohibited.
- Status: `ready-for-review`. Stop for a fresh independent re-review before
  any integration.
