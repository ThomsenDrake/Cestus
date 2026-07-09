# Task Claim: Resident Agent Legacy Staging Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 3, Legacy Staging Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worker: Codex
- Claimed at: 2026-07-09T00:00:00Z
- Base commit: `b06f4c1 feat: add resident agent domain dispatcher`
- Status: completed

## Scope

Implement the resident-agent legacy staging adapter family as descriptor-backed adapters over the existing legacy runtime and staging services.

The adapter family must preserve evidence-first legacy artifact bootstrap, exact report/candidate/evidence/source/content-hash binding, explicit staging approval, idempotency, append-only events, and no old-ontology import.

## Files

- Create: `packages/agent/src/adapters/legacy-staging.ts`
- Create: `packages/agent/test/legacy-staging-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`

Supporting test hardening in already-owned agent adapter contract files is allowed only if required by the targeted tests.

## Verification

- Red/green targeted test: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts`
- Domain coverage: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts`
- Available local gates before handoff: `npm run typecheck`, `npm run ui:build`, and `npm run verify` if sandbox permits.

## Progress

- Red test 1: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts` failed on missing `../src/adapters/legacy-staging.js` before implementation.
- Red test 2: added idempotency retry coverage; focused adapter test failed before production retry handling with `Unknown Error: Legacy import runtime failed while handling the command.`
- Green focused test: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts` passed, 1 file / 8 tests.
- Green domain coverage: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts` passed, 4 files / 43 tests.
- Green typecheck: `npm run typecheck` passed.
- Green UI build: `npm run ui:build` passed, with the existing Vite large-chunk warning.
- Coordinator review repair: added fail-closed public-boundary validation for canonical legacy staging tool metadata, exact report/candidate hashes, nonempty unique present selected candidates, hostile extra fields, and required production ledgers.
- Green post-review focused test: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts` passed, 1 file / 13 tests.
- Green post-review domain coverage: `npm test -- packages/agent/test/legacy-staging-adapter.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts` passed, 4 files / 48 tests.
- Green post-review typecheck: `npm run typecheck` passed.
- Green post-review UI build: `npm run ui:build` passed, with the existing Vite large-chunk warning.
- Sandbox-blocked full verify: `npm run verify` passed typecheck, then failed in sandbox with 145 passed / 3 failed / 1 skipped files and 1457 passed / 19 failed / 1 skipped tests. Failures were `listen EPERM` for local-runtime server binds and workspace-ops/tsx executable IPC, plus the downstream JSON parse failure from blocked stdout.
- Sandbox-blocked factory readiness: `npm run factory:check` failed with `spawnSync git EPERM` while reading tracked files.
- Review gate: stale reviewer was closed after no verdict; coordinator review finding was repaired and inline Cestus review found no remaining Task 3 blockers.
- Coordinator verification from the writable integration environment passed: `npm run verify` reported `Test Files 148 passed | 1 skipped (149)`, `Tests 1476 passed | 1 skipped (1477)`, followed by a successful Vite build and `factory-readiness passed`.

## Stop Conditions

- Stop before Task 4 or accepted-graph review adapter changes.
- Stop before any legacy staging path appends accepted graph events directly.
- Stop before any old-ontology import or source-tree mutation.
- Stop if the adapter would bypass `LegacyOntologyStagingService`, `LegacyImportRuntime`, or explicit staging approval.
- Stop if diagnostics would leak secrets or if Git metadata write remains unavailable for commit.
