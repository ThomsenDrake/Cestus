# Task 7 Provider Adapters Claim

Plan: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`
Task: Task 7, Add Provider Adapter Implementations
Worker: Codex
Branch: `codex/prr-workflow-design`
Worktree: `/home/drake/.codex/worktrees/836b/Cestus`
Claimed-at: 2026-07-01T00:00:00.000Z
Status: ready-for-review

## Owned Files

- `packages/prr/src/provider-adapters.ts`
- `packages/prr/test/provider-adapters.test.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-7-provider-adapters.md`

## Evidence

- Red targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` failed as expected because `../src/provider-adapters.js` could not be resolved.
- Green targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` passed with 1 test file and 11 tests.
- Full verification: `npm run verify` passed with `typecheck passed`, 19 test files and 160 tests, `tests passed`, and `factory-readiness passed`.
- Commit: task implementation commit follows this evidence update.
- Review-fix red targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` failed with 9 failing tests covering sync pass-through, shared references, secret raw metadata, brittle Himalaya CC ordering, and silent Himalaya sync shape handling.
- Review-fix green targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` passed with 1 test file and 18 tests.
- Review-fix full verification: `npm run verify` passed with `typecheck passed`, 19 test files and 167 tests, `tests passed`, and `factory-readiness passed`.
- Himalaya sync re-review red targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` failed with 4 failing tests covering dropped `rawMetadata`, malformed `cc`, malformed `rawMetadata`, and malformed `attachmentRefs`.
- Himalaya sync re-review green targeted test: `npm test -- packages/prr/test/provider-adapters.test.ts` passed with 1 test file and 22 tests.
- Himalaya sync re-review full verification: `npm run verify` passed with `typecheck passed`, 19 test files and 171 tests, `tests passed`, and `factory-readiness passed`.

## Self-Review

- Findings: none.
- Concern: Himalaya CLI argument shape is an offline adapter contract for injected runners; live CLI compatibility remains outside Task 7 and should be validated in a future integration slice before using real profiles.
- Review fix: added shared sync normalization for all provider adapters, hardened Himalaya sync shape errors, and replaced brittle send-argument insertion with explicit ordered pushes.
- Re-review fix: preserved Himalaya provider-supplied optional sync fields into shared normalization so unsafe or malformed metadata, cc, and attachment refs are rejected instead of dropped.
