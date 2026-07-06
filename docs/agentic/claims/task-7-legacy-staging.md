# Task 7: Legacy Ontology Staging

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 7: Add Ontology Staging And Assertion Proposal
Branch: `codex/legacy-cestus-import`
Worktree: `/home/drake/.codex/worktrees/9b5f/Cestus`
Status: ready-for-review
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

## Self-Review

- Human approval gate: `legacy.ontology.staging.approved` appends through the central event contract, so system actors are rejected by the human-gated ledger validation.
- Evidence-tied assertions: staging calls `AssertionService.propose()`, which requires an existing `evidence.ingested` event before appending `assertion.proposed`.
- Event surface: successful staging appends only `legacy.ontology.staging.approved` and `assertion.proposed` after fixture evidence ingestion.
- Missing evidence behavior: missing evidence rejects before any `assertion.proposed` event is appended.
- Candidate filtering: only IDs present in `approvedAssertionCandidateIds` are proposed; unapproved candidates are skipped.
- Truth boundary: no accepted assertion, entity, relationship, resolution, candidate-resolution, or report-generation events are emitted by the staging service.
