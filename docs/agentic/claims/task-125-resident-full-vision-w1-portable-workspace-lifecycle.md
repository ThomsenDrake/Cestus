# Task 125 — Portable Workspace Lifecycle Authority

- Status: ready-for-review
- Coordinator ledger: `RV-1-C-137`
- Worker: `/root/task125_authority_repair`
- Branch: `codex/task-125-resident-full-vision-portable-workspace-lifecycle-admission-restart`
- Worktree: `/home/drake/.codex/worktrees/task-125-resident-full-vision-portable-workspace-lifecycle`
- Claimed at: 2026-07-14T00:00:00Z
- Base / CF-1 and Task 124 integration SHA: `73003f60441b531d95bcb80755a6fc90148e09fe`
- Scope: `packages/local-runtime/src/portable-workspace-lifecycle.ts`, `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`, and this claim only.

## Contract

The façade issues only canonical frozen own-data admissions. An invalidation is
monotonic: a same-identity later revalidation may issue a fresh generation, but
cannot revive the earlier generation. Lease and reconciliation ports check the
canonical generation both before and after their awaited mounted calls. Mount,
policy, lock, high-water, identity, and readback facts are fail-closed; no
runtime, provider, tool, artifact, fallback, ledger, projection, cache, or
journal write is permitted while unavailable or for a revoked admission.

## Evidence

- Authority-repair RED (exact focused command): with only a temporary
  `node_modules` symlink to the coordinator checkout, the command exited `1`
  with 2 files, 4 failed tests, and 10 passed tests. A freshly constructed
  matching admission made one mounted lease and one mounted reconciliation
  call; policy/lock swaps reached the mounted lease; lease/readback swaps
  reached mounted reconciliation; and all 40 accessor/custom-prototype/
  sparse-array/extra-key variants across the forwarded tuple and record
  evidence paths reached mounted reconciliation. The temporary symlink was
  removed after every command.
- Authority-repair GREEN (same exact focused command): exited `0` with 2 test
  files and 14 tests passing. The façade now issues a closure-bound opaque
  identity/generation capability, canonicalizes and freezes lease, tuple,
  policy/lock, high-water, record, and embedded evidence values, binds them to
  the current mounted facts and mounted lease readback, and revalidates both
  before and after every awaited mounted call.
- `npm run typecheck` exited `0` with no output. `git diff --check` exited
  `0` with no output. `npm run factory:check` exited `0` with
  `factory-readiness passed`. No `npm run verify` was run because this repair
  authorization explicitly forbids it. Stop at a fresh independent
  defects-first review; no merge or `neo` change occurred.
- Read-only root-cause evidence: rejected `7b8430c9` compared admissions by
  identity/mount only, so a later same-identity admission could authorize an
  earlier revoked admission.
- The first exact focused command stopped before discovery with exit `127` and
  `vitest: command not found`; this environment failure was not accepted as
  RED. With a temporary symlink only to the approved base-worktree dependency
  tree, the same command then exited `1` because
  `../src/portable-workspace-lifecycle.js` did not exist. The identity suite
  passed its 9 existing tests in that RED run.
- GREEN: the exact focused command exited `0` with 2 test files and 10 tests
  passing. `npm run typecheck` exited `0`. `git diff --check` exited `0` with
  no output, and `npm run factory:check` exited `0` with
  `factory-readiness passed`.
- The temporary `node_modules` symlink was removed after those credential-free
  local checks; no cache or dependency tree remains in this worktree.
- Stop point: after focused Green, typecheck, `git diff --check`, and
  `npm run factory:check`, commit only these three files and request a fresh
  independent defects-first review. No full verifier in this worker scope.
