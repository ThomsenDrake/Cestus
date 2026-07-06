# Task 7: Legacy Ontology Staging

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 7: Add Ontology Staging And Assertion Proposal
Branch: `codex/legacy-cestus-import`
Worktree: `/home/drake/.codex/worktrees/9b5f/Cestus`
Status: approved
Claimed-at: 2026-07-06T15:22:40Z
Worker: Codex implementation worker

## Owned Files

- `docs/agentic/claims/task-7-legacy-staging.md`
- `packages/ingestion/src/legacy-staging.ts`
- `packages/ingestion/test/legacy-staging.test.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `5e1b819 chore: claim legacy staging`.
- Red targeted test: `npm test -- packages/ingestion/test/legacy-staging.test.ts` failed because `../src/legacy-staging.js` could not be resolved.
- Green targeted test: `npm test -- packages/ingestion/test/legacy-staging.test.ts packages/ontology/test/assertion-service.test.ts` passed with 2 test files and 9 tests.
- Full verification: `npm run verify` passed with typecheck, 76 test files and 622 tests, UI build, and factory readiness.
- Review fix: `b3c1e22 fix: preflight legacy staging evidence` made staging all-or-nothing for approved candidates before proposal append.
- Review fix: `d182629 fix: bind legacy staging candidates to reviewed hash` bound staged candidate payloads to the reviewed candidate set hash and widened assertion ID identity.
- Review fix: `3c39e31 fix: bind staged evidence to candidate hash` required the supplied evidence ID to point at evidence with the reviewed candidate content hash.
- Post-fix targeted test: `npm test -- packages/ingestion/test/legacy-staging.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/contracts.test.ts` passed with 3 test files and 88 tests.
- Post-fix full verification: `npm run verify` passed with typecheck, 76 test files and 626 tests, UI build, and factory readiness.

## Review Gate

- Spec review: approved at 2026-07-06T16:02:36Z; no blocking issues after evidence-content binding.
- Code-quality review: approved at 2026-07-06T16:02:36Z; no Critical, Important, or Minor issues remaining.

## Self-Review

- Human approval gate: `legacy.ontology.staging.approved` appends through the central event contract, so system actors are rejected by the human-gated ledger validation.
- Evidence-tied assertions: staging validates candidate-set hash, requires the supplied evidence ID to point at evidence with the reviewed candidate content hash, and then calls `AssertionService.propose()`.
- Event surface: successful staging appends only `legacy.ontology.staging.approved` and `assertion.proposed` after fixture evidence ingestion.
- Missing evidence behavior: missing or mismatched evidence rejects before any `assertion.proposed` event is appended.
- Candidate filtering: only IDs present in `approvedAssertionCandidateIds` are proposed; unapproved candidates are skipped.
- Truth boundary: no accepted assertion, entity, relationship, resolution, candidate-resolution, or report-generation events are emitted by the staging service.
