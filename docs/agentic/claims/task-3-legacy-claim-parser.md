# Task 3: Legacy Claim Parser

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
Task: Task 3: Add Conservative Legacy Claim Parser
Branch: `codex/legacy-import-operator-cli`
Status: ready-for-review
Claimed-at: 2026-07-06T22:08:08Z
Worker: Codex implementation worker
Worktree: `/home/drake/.codex/worktrees/5738/Cestus`

## Owned Files

- `docs/agentic/claims/task-3-legacy-claim-parser.md`
- `packages/ingestion/src/legacy-claim-parser.ts`
- `packages/ingestion/test/legacy-claim-parser.test.ts`
- `packages/ingestion/src/index.ts`

## Evidence

- Claim commit: `ea6a38a chore: claim legacy claim parser`.
- Red targeted test: `npm test -- packages/ingestion/test/legacy-claim-parser.test.ts` failed resolving the missing `../src/legacy-claim-parser.js` module before implementation.
- Green parser test: `npm test -- packages/ingestion/test/legacy-claim-parser.test.ts` passed with 1 test file and 3 tests.
- Targeted verification: `npm test -- packages/ingestion/test/legacy-claim-parser.test.ts packages/ingestion/test/legacy-report.test.ts packages/ingestion/test/legacy-plugins.test.ts` passed with 3 test files and 19 tests.
- Full verification: `npm run verify` passed with typecheck, 95 test files and 833 tests, UI build, and factory readiness.
