# Task Claim: Resident Agent Export And Report Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 5, Export And Report Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Worker: Codex
- Claimed at: 2026-07-09T20:20:49Z
- Base commit: `ca27757 feat: add accepted graph review execution adapter`
- Status: completed

## Scope

Implement resident-agent adapters for `governance.export.generate` and `governance.report.generate` over the existing governance projection and service. The adapters may record an approved generation event through `GovernanceService`; they must never publish, transfer, or write artifact bytes.

The adapters must preserve consume-time export/publication approval, exact governed plan/evidence/content-hash/policy/opt-in/artifact binding, public-safe defaults, quarantine and tombstone rejection, active-lock checks, append-only evidence, idempotency, and secret-safe diagnostics.

## Files

- Create: `packages/agent/src/adapters/export-report.ts`
- Create: `packages/agent/test/export-report-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/ontology/src/governance-service.ts` only if a failing domain test proves a missing domain-owned idempotency guard.
- Modify: `packages/ontology/test/governance-export.test.ts` only for that domain guard.

## Verification

- Red/green focused: `npm test -- packages/agent/test/export-report-adapter.test.ts`
- Domain coverage: `npm test -- packages/agent/test/export-report-adapter.test.ts packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-projection.test.ts packages/ontology/test/governance-service.test.ts`
- Available local gates: `npm run typecheck`, `npm run ui:build`, `npm run factory:check`, `npm run verify`, and `git diff --check` where the sandbox permits.

## Progress

- RED 1: `npm test -- packages/agent/test/export-report-adapter.test.ts` failed because `packages/agent/src/adapters/export-report.ts` did not exist.
- RED 2: the first implementation run exposed that a fully blocked current plan could not be rendered stale and that the agent secret filter alone did not reject governance `access_token` rationale.
- RED 3: inline review tests proved the adapter fabricated a missing governance policy event ID and mapped shaped service output without ledger attestation.
- GREEN focused: `npm test -- packages/agent/test/export-report-adapter.test.ts` passed, 1 file / 17 tests.
- GREEN domain: `npm test -- packages/agent/test/export-report-adapter.test.ts packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-projection.test.ts packages/ontology/test/governance-service.test.ts` passed, 4 files / 67 tests.
- GREEN typecheck: `npm run typecheck` passed.
- GREEN build: `npm run ui:build` passed with the existing large-chunk warning.
- GREEN whitespace: `git diff --check` produced no output.
- Sandbox full verify: `npm run verify` passed typecheck, then stopped at the known sandbox test boundary. A fresh concise full-suite run reported `3 failed | 147 passed | 1 skipped` files and `19 failed | 1492 passed | 1 skipped` tests. All failures were existing local-runtime socket or workspace-ops/`tsx` IPC `listen EPERM` failures plus the downstream workspace-readiness JSON parse failure.
- Sandbox factory check: `npm run factory:check` failed at `spawnSync git EPERM` while reading tracked files.
- Review: the fresh read-only reviewer was closed after three bounded checks without a verdict. Inline Cestus review found and repaired two Important gaps: fabricated missing-policy provenance and unattested/extra domain event result mapping. No Critical or Important findings remain.
- Git boundary: Git metadata is read-only in this worker environment, so the complete Task 5 diff is intentionally uncommitted for coordinator verification and commit.
- Coordinator verification: unrestricted `npm run verify` passed with 150 passed / 1 skipped test files and 1511 passed / 1 skipped tests, followed by the Vite production build and factory readiness check.

## Stop Conditions

- Stop before Task 6 or provider byte-transfer changes.
- Stop before any adapter publishes, transfers, or writes artifact bytes.
- Stop before bypassing the governance projection plan, sensitive opt-in actor checks, policy binding, evidence provenance, quarantine/tombstone state, or active locks.
- Stop on stale, swapped, forged, hostile, or secret-bearing public input that cannot fail closed.
- Stop if Git metadata write is required; leave the complete Task 5 diff for the coordinator.
