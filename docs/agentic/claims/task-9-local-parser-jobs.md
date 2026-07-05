# Task 9 Claim: Add Local Parser Jobs And Derivative Outputs

- Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
- Task heading: `Task 9: Add Local Parser Jobs And Derivative Outputs`
- Worker identity: Codex
- Branch: `codex/public-ingestion-pipeline-design`
- Worktree path: `/home/drake/.codex/worktrees/aee0/Cestus`
- Claimed at: `2026-07-05T17:02:52Z`
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-9-local-parser-jobs.md`
- `packages/ingestion/src/parser.ts`
- `packages/ingestion/test/parser.test.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `b1631ee chore: claim task 9`.
- Red targeted test: `npm test -- packages/ingestion/test/parser.test.ts` failed as expected because `../src/parser.js` could not be resolved.
- Green targeted test: `npm test -- packages/ingestion/test/parser.test.ts` passed with 1 test file and 2 tests.
- Full verification: `npm run verify` passed with `typecheck passed`, 51 test files and 371 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.

## Self-Review

- Scope stayed within the allowed Task 9 files.
- Local parser jobs append only schema-valid `ingestion.parse.job.created`, `ingestion.parse.completed`, and `ingestion.parse.failed` events.
- Derivative text output is stored as UTF-8 bytes in the derivative blob store and referenced by content hash; it is not raw evidence or an accepted ontology fact.
- Completion and failure events require a matching created local parse job and carry causation back to that creation event.
- Failure events use a generic secret-safe message instead of writing raw parser/provider errors into the ledger.
