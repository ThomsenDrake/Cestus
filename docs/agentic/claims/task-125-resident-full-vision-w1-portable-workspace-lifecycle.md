# Task 125 — Portable Workspace Lifecycle Authority

- Status: ready-for-review
- Coordinator ledger: `RV-1-C-137`
- Worker: `/root/task125_facade_rootcause_recovery`
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
