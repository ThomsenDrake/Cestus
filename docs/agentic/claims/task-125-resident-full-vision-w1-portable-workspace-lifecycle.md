# Task 125 — Portable Workspace Lifecycle Authority

- Status: in-progress
- Coordinator ledger: `RV-1-E-173`
- Worker: `/root/task125_merged_typecheck_repair`
- Branch: `codex/task-125-merged-typecheck-repair`
- Worktree: `/home/drake/.codex/worktrees/task-125-merged-typecheck-repair`
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

- RV-1-E-173 forward repair: claimed in progress at 2026-07-14T23:24:09Z
  from canonical program head `fce05da4e5e18c78b4b7609426e86910c41ce8ca`
  after the forward-only correction that provisional Task125 merge `84d162ee`
  is not integrated-ready. This worker owns only this claim,
  `packages/local-runtime/src/portable-workspace-lifecycle.ts`, and
  `packages/local-runtime/test/portable-workspace-lifecycle.test.ts`. It will
  reproduce and repair only Task125's merged TypeScript diagnostics with
  fail-fast gates, without full verification, integration, registry edits,
  provider/network or credential action, or any `neo` change.

- RV-1-E-170 root-cause recovery: in progress from rejected clean
  `82db6628a842a03cdd36e6bb05ebe36715260494`. This fresh worker is tracing the
  missing canonical relationship between the pending outage and the currently
  observed mounted active claim before adding the required mounted-claim-swap
  causal RED. Scope remains this claim, the portable lifecycle source, and its
  focused test only; the full verifier, provider/network actions, integration,
  registry edits, and `neo` remain out of scope.

- RV-1-E-170 root-cause/TDD evidence: the pending outage retained only the
  prior claim's event and lease fields, while `requireCurrentAppendInput`
  independently compared the caller claim with the later mounted claim. A
  compatible later mounted claim could therefore pair with an outage recorded
  for a different earlier claim. The causal RED mutates only the fixture's
  mounted `observedActiveClaim` after an authority-loss invalidation records
  the outage. With the exact focused command and a temporary local
  `node_modules` symlink, it exited `1`: 1 failed / 17 passed, because the
  mounted reconciliation call count was `1` instead of the required `0`.
  The first no-symlink invocation stopped at `vitest: command not found` and
  was treated only as dependency setup, not as RED evidence.
- RV-1-E-170 GREEN: the façade now keeps the canonical frozen active-claim
  fact that formed the pending outage and requires the current mounted claim
  to be exactly the same fact before any reconciliation append. It clears that
  bound fact only with the pending outage after an exact canonical
  append/readback. The same exact focused command exited `0` with 2 files and
  18 tests passing. `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; and `npm run factory:check` exited `0` with `factory-readiness passed`.
  The temporary dependency symlink was removed. Self-review found the change
  remains an internal fail-closed cross-bind, preserves canonical own-data and
  frozen readback behavior, does not expand ports or persistence, and leaves
  pending state intact on rejection. No `npm run verify`, provider/network or
  credential action, registry edit, integration, merge, or `neo` action
  occurred. Fresh independent review is now required.

- RV-1-D-164 second bounded repair: in progress from clean
  `251834159ffd72c5e7293a7cfaf0a0ed210201cb`. Root-cause investigation
  confirmed that `appendAndReadBack` accepts caller-consistent
  `observedActiveClaim` and outage data without requiring the façade's pending
  mounted outage or binding the claim to `current.facts.observedActiveClaim`.
  It also returns the mounted reconciliation result without canonical
  own-data parsing, freezing, or exact request/record/event-ID readback
  binding. Causal RED, minimal fail-closed repair, focused GREEN, typecheck,
  diff, and factory evidence will be appended below before the three-file
  handoff commit. No full verifier, provider/network action, integration, or
  `neo` action is authorized in this repair.

- RV-1-D-164 causal RED (exact focused command, with a temporary ignored
  symlink only to the coordinator checkout's `node_modules`, removed after the
  run): `npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts
  packages/local-runtime/test/resident-identity-bootstrap.test.ts` exited `1`.
  The focused lifecycle file had 3 failing new tests and the identity file
  passed: invented/no-outage and swapped-active-claim/outage reconciliations
  each reached the mounted port once (expected zero), and a hostile mounted
  readback getter executed instead of rejecting at the boundary.
- RV-1-D-164 GREEN (same exact command, same temporary dependency symlink
  removed immediately after): exited `0` with 2 files and 17 tests passing.
  The façade now requires the currently mounted active claim and the pending
  mounted outage before append, validates canonical reconciliation readbacks
  against the exact tuple, record, identity, idempotency key, and required
  event IDs, returns only frozen own-data evidence, invalidates a failed
  readback admission, and clears the bounded pending outage only after an
  exact successful append/readback.
- Post-GREEN allowed gates: `npm run typecheck` exited `0` with no output;
  `git diff --check` exited `0` with no output; and `npm run factory:check`
  exited `0` with no output. No `npm run verify`, credentials, provider or
  network action, registry edit, integration, merge, or `neo` action occurred.
- Stop point: the next action is a fresh independent defects-first review of
  this bounded three-file candidate. The temporary `node_modules` symlink was
  removed after each command and is absent from this worktree.


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
