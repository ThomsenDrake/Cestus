# Task 2: Jurisdiction Pack Summary Context Pack

Plan path: `docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md`
Task heading: `Task 2: Jurisdiction Pack Summary Context Pack`
Worker identity: Codex
Branch: `codex/prr-context-pack-design`
Worktree path: `/home/drake/.codex/worktrees/3076/Cestus`
Claimed at UTC: `2026-07-10T22:40:14Z`
Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-2-jurisdiction-pack-summary-context-pack.md`
- `packages/agent/src/prr-context-packs.ts`
- `packages/agent/test/prr-context-packs.test.ts`

## Evidence

- Red command: `npm test -- packages/agent/test/prr-context-packs.test.ts` failed as expected because `buildJurisdictionPackSummaryContextPack` was not a function and the strict parser did not yet reject forged generic JSON.
- Green command: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed with 1 test file and 16 tests.
- Full verification: `npm run verify` passed with typecheck, tests, UI build, and factory readiness.
- Needs-fixes RED: `npm test -- packages/agent/test/prr-context-packs.test.ts` failed with the new hash-valid jurisdiction ref attacker test because the parser accepted extra conflicting staleness inputs.
- Needs-fixes GREEN: `npm test -- packages/agent/test/prr-context-packs.test.ts` passed with 1 test file and 17 tests after requiring the jurisdiction staleness-input array to exactly match the canonical two entries.

## Review

- Review status: needs-fixes item addressed; ready for spec and code-quality review
- Concerns: none recorded
