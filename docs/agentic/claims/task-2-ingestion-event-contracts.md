# Task 2: Add Ingestion Event Contracts

Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`

Worker: Codex worker subagent

Branch: `codex/public-ingestion-pipeline-design`

Worktree: `/home/drake/.codex/worktrees/aee0/Cestus`

Claimed at: `2026-07-05T14:32:08.846Z`

Owned files:

- `docs/agentic/claims/task-2-ingestion-event-contracts.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
- `packages/ingestion/src/types.ts`
- `packages/ingestion/src/index.ts`

Verification evidence:

- `npm test -- packages/ontology/test/contracts.test.ts` failed as expected after adding the red ingestion contract tests: `ingestion.source.registered` validation returned false because ingestion event contracts did not exist.
- `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/smoke.test.ts` passed: 2 files, 39 tests.
- First `npm run verify` found TypeScript-only issues in the intentionally invalid ingestion payload test helper; fixed with an `unknown` cast while preserving runtime strict unknown-key validation.
- Final `npm run verify` passed: typecheck, 43 test files / 337 tests, UI build, factory readiness.
- Spec review fix: added valid `ingestion.parse.failed` coverage and required `sourceCollectionId` plus `importBatchId` on parse terminal events.
- `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/smoke.test.ts` passed after spec-review fixes: 2 files, 39 tests.
- `npm run verify` passed after spec-review fixes: typecheck, 43 test files / 337 tests, UI build, factory readiness.
- `git diff --check` passed after spec-review fixes.
- Code-quality fix: restricted `ingestion.parse.job.created` to initial states, enforced all-or-none archive occurrence provenance, and reconciled Task 9 parser examples with source/import identity requirements.
- Red test evidence: `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/smoke.test.ts` failed before schema fixes because terminal parse job state and partial archive provenance were still accepted.
- `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/smoke.test.ts` passed after code-quality fixes: 2 files, 41 tests.
- `npm run verify` passed after code-quality fixes: typecheck, 43 test files / 339 tests, UI build, factory readiness.
- `git diff --check` passed after code-quality fixes.
- `npm run factory:check` passed after code-quality fixes.

Status: ready-for-review
