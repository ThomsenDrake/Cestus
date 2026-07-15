# Task135D recovery: R-owned factory-issued mounted handle capture

- Status: ready-for-review
- Owner: `/root`
- Branch: `codex/task-135d-runtime-handle-capture-recovery`
- Worktree: `/home/drake/.codex/worktrees/8ca0/Cestus`
- Claimed at: `2026-07-15T16:00:07Z`
- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, terminal Task135D through CF-1R26.
- Coordinator recovery boundary: `RV-1-E-336`.

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
