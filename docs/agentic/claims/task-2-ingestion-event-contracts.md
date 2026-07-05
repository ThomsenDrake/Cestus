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

Status: ready-for-review
