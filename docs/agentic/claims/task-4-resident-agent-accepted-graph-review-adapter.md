# Task Claim: Resident Agent Accepted Graph Review Adapter

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task: Task 4, Accepted Graph Review Adapter Family
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worker: Codex
- Claimed at: 2026-07-09T19:33:34Z
- Base commit: `68f6c01 feat: add legacy staging execution adapters`
- Status: completed

## Scope

Implement the resident-agent `ontology.assertion.accept` adapter over the existing ontology assertion review service. Relationship acceptance and entity resolution remain unregistered until their authoritative domain services exist.

The adapter must preserve consume-time independent human `ledger-review` approval, exact proposal/evidence/content-hash/pack-version binding, stale review rejection, idempotency, append-only result evidence, and domain-owned accepted graph writes.

## Files

- Create: `packages/agent/src/adapters/accepted-graph-review.ts`
- Create: `packages/agent/test/accepted-graph-review-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify ontology review services only if the adapter requires a missing domain-owned review guard.

## Verification

- Red/green targeted test: `npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts`
- Domain coverage: `npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/graph-projection.test.ts packages/ontology/test/jsonld-export.test.ts`
- Available local gates before handoff: `npm run typecheck`, `npm run ui:build`, `npm run factory:check`, and `npm run verify` where the sandbox permits.

## Progress

- RED 1: the focused adapter test failed because `accepted-graph-review.ts` did not exist.
- RED 2: adversarial execution tests exposed raw tool-metadata failure and forged preview acceptance during idempotent result reuse.
- RED 3: the scheduler-through-gateway test proved missing scheduler `taskId` propagation made the rebuilt preview stale before domain execution.
- RED 4: concurrent retry and human-review identity tests exposed non-idempotent `AssertionService.accept()` behavior and late generic human-gate validation.
- RED 5: the active-lock test proved the adapter ignored append-only resident-agent locks.
- RED 6: the secret-shaped predicate test proved derived graph-impact preview text was not validated at the public builder boundary.
- GREEN focused: `npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts` passed, 1 file / 16 tests.
- GREEN domain: `npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/graph-projection.test.ts packages/ontology/test/jsonld-export.test.ts` passed, 4 files / 26 tests.
- GREEN typecheck: `npm run typecheck` passed.
- GREEN build: `npm run ui:build` passed with the existing large-chunk warning.
- GREEN whitespace: `git diff --check` produced no output.
- Sandbox full verify: `npm run verify` passed typecheck, then reported 146 passed / 3 failed / 1 skipped test files and 1475 passed / 19 failed / 1 skipped tests. All failures were existing sandbox `listen EPERM` boundaries in local-runtime sockets and workspace-ops/`tsx` IPC, plus the downstream workspace-readiness JSON parse failure.
- Sandbox factory check: `npm run factory:check` failed at `spawnSync git EPERM` while reading tracked files.
- Review: two fresh read-only reviewer agents were closed after bounded no-verdict checks. The inline Cestus review found and repaired scheduler task-identity, concurrent domain idempotency/human actor, active-lock, and derived preview secret-safety gaps. No Critical or Important findings remain.
- Coordinator verification from the writable integration environment passed: `npm run verify` reported `Test Files 149 passed | 1 skipped (150)`, `Tests 1494 passed | 1 skipped (1495)`, followed by a successful Vite build and `factory-readiness passed`.
- Residual: the ontology catalog has no canonical `assertion.superseded` event; Task 4 recognizes a future structural event in read-only state and tests it with a synthetic ledger record without appending or registering that event type.

## Stop Conditions

- Stop before Task 5 or export/report adapter changes.
- Stop before any adapter path appends `assertion.accepted`, `entity.resolved`, or `relationship.accepted` directly.
- Stop if the adapter would execute without independent human approval or use an agent as the domain review actor.
- Stop on missing, stale, swapped, or forged assertion, proposal event, evidence, content hash, preview hash, or ontology pack identity.
- Stop if accepted graph provenance cannot be rebuilt from ledger evidence and domain review events.
- Stop if diagnostics would leak secrets or if Git metadata write remains unavailable for commit.
