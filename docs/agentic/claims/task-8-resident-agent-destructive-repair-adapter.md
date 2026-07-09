# Task Claim: Resident Agent Destructive Repair Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 8, Destructive Repair Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Worker: Codex with bounded Superpowers subagents
- Claimed at: 2026-07-09T22:30:00Z
- Base commit: `f6dffe2 feat: add prr correspondence execution adapters`
- Status: completed

## Scope

Add descriptor-backed `workspace.projection-rebuild.execute` and fail-closed
`workspace.canonical-repair.record` adapters. Projection rebuild execution must
route only through workspace-ops verification, backup/readiness checks, and
`rebuildProjection()`. Canonical ledger or blob repair remains unavailable
until a human-approved append-only repair-event service exists.

## Files

- Create: `packages/agent/src/adapters/destructive-repair.ts`
- Create: `packages/agent/test/destructive-repair-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `docs/agentic/claims/task-8-resident-agent-destructive-repair-adapter.md`

## Invariants

- Workspace-ops remains authoritative for workspace identity, manifest and
  backup state, projection readiness, projection writes, and result envelopes.
- Projection execution may write only expendable projection artifacts through
  the workspace-ops temp-write and promotion path; prior artifacts must remain
  preserved when execution fails.
- Consume-time validation binds exact workspace identity, manifest hash,
  ledger high-water mark, backup refs, projection name, rebuild ID, proposed
  action, readiness diagnostics, output refs and hashes, approval, provenance,
  and active locks.
- Canonical ledger/blob deletion, rewrite, compaction, reset, migration, and
  repair always fail with `data-loss-risk`; this task adds no repair-event
  service and no canonical mutation callback.
- Public DTOs, diagnostics, paths, failures, and result evidence remain plain,
  hostile-shape resistant, portable, and secret-safe.

## Verification

- RED/GREEN: `npm test -- packages/agent/test/destructive-repair-adapter.test.ts`
- Domain target: `npm test -- packages/agent/test/destructive-repair-adapter.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/contracts.test.ts`
- Available gates: `npm run typecheck`, `npm run ui:build`, `npm run factory:check`, `npm run verify`, and whitespace checks.

## Stop Conditions

- Stop before Task 9 or registry/readiness work.
- Stop before adding an append-only canonical repair-event service.
- Stop before any direct filesystem mutation outside workspace-ops projection
  rebuild, or any delete/rewrite/compact/reset/migrate operation on canonical
  ledger or blob state.
- Stop on stale or forged workspace identity, manifest/backup refs, ledger
  high-water mark, readiness, target projection, rebuild ID, proposed action,
  output refs, approval, provenance, or locks.
- Leave the complete Task 8 diff uncommitted for coordinator verification
  because Git metadata is read-only here.

## Red/Green Evidence

- Adapter module RED: missing module, followed by descriptor GREEN at 1/1.
- Public preview RED: 2 expected missing-builder failures and 1 passing
  descriptor test; GREEN at 3/3.
- Workspace-ops integration RED: 5 expected missing adapter/rebuilder failures
  and 3 passing preview tests; GREEN at 8/8.
- Review repair RED: 2 failures proving canonical direct execution accepted
  stale approval bindings and mismatched repair action IDs; GREEN at 10/10.

## Verification Evidence

- Focused adapter: 1 file, 10/10 tests passed.
- Exact agent/workspace-ops domain set: 4 files, 59/59 tests passed.
- Typecheck passed.
- Vite build passed with the existing chunk-size warning.
- Full `npm run verify`: typecheck passed, then 150 passed / 3 failed / 1
  skipped files and 1542 passed / 19 failed / 1 skipped tests. All failures
  are sandbox-only local socket or `tsx` IPC `EPERM` failures.
- Factory readiness is sandbox-blocked at `spawnSync git EPERM` after
  `git ls-files` produces output.
- Coordinator verification: unrestricted `npm run verify` passed with 153
  passed / 1 skipped test files and 1561 passed / 1 skipped tests, followed by
  the Vite production build and factory readiness check.

## Review Verdict

- Initial review found one Important direct canonical approval-revalidation
  gap and one Minor canonical target/action binding gap.
- Repair-delta review: APPROVED with no remaining Critical or Important
  findings. Canonical direct execution now independently revalidates the
  blocked preview, artifacts, provenance, source IDs, and active locks before
  returning `data-loss-risk`.
