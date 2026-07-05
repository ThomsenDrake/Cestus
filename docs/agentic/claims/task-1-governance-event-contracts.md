# Task 1 Claim: Governance Event Contracts

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 1: Add Governance Event Contracts
Worker: Codex GPT-5
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: 2026-07-05T14:11:28Z
Status: ready-for-review

Owned files:
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/contracts.test.ts`
- `docs/agentic/claims/task-1-governance-event-contracts.md`

Required commands:
- `npm test -- packages/ontology/test/contracts.test.ts`
- `npm run verify`

Command evidence:
- Environment setup: `npm test -- packages/ontology/test/contracts.test.ts` initially could not start because local `node_modules` was absent and `vitest` was not installed in the worktree. Ran `npm ci` against the existing lockfile; no tracked files changed.
- Red: `npm test -- packages/ontology/test/contracts.test.ts` failed after test addition with 4 governance contract tests failing because the new governance event types were not yet accepted.
- Additional red: `npm test -- packages/ontology/test/contracts.test.ts` failed with the non-human governance review test proving extractor actors were still accepted for human review events.
- Green: `npm test -- packages/ontology/test/contracts.test.ts` passed with 1 test file and 41 tests passing.
- Verify: `npm run verify` passed with typecheck passed, 42 test files and 339 tests passing, UI build succeeded, and factory-readiness passed.
