# Task 4 Claim: Governance Projection

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 4: Add Governance Projection
Worker: Codex GPT-5
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: 2026-07-05T15:09:56Z
Status: ready-for-review

Owned files:
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/src/index.ts`
- `packages/ontology/test/governance-projection.test.ts`
- `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- `docs/agentic/claims/task-4-governance-projection.md`

Required commands:
- `npm test -- packages/ontology/test/governance-projection.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/ontology/test/governance-projection.test.ts` failed because `../src/governance-projection.js` did not exist.
- Green: `npm test -- packages/ontology/test/governance-projection.test.ts` passed with 1 test file and 8 tests passing.
- Verify repair: `npm run verify` initially failed at typecheck because the immutable-map proxy cast and intentional mutation tests needed explicit TypeScript casts.
- Final green: `npm test -- packages/ontology/test/governance-projection.test.ts` passed with 1 test file and 8 tests passing after the typecheck repair.
- Verify: `npm run verify` passed with typecheck passed, 45 test files and 392 tests passing, UI build succeeded, and factory-readiness passed.
- Self-review green: `npm test -- packages/ontology/test/governance-projection.test.ts` passed with 1 test file and 8 tests passing after the read-only map proxy receiver polish.
- Self-review verify: `npm run verify` passed with typecheck passed, 45 test files and 392 tests passing, UI build succeeded, and factory-readiness passed.
- Code-quality fix red: `npm test -- packages/ontology/test/governance-projection.test.ts` failed with 4 expected failures proving later AI classification could override human removal, active restricted tags could leak into default public-safe IDs, and installed policy thresholds were ignored.
- Code-quality fix green: `npm test -- packages/ontology/test/governance-projection.test.ts` passed with 1 test file and 12 tests passing.
- Code-quality fix verify: `npm run verify` passed with typecheck passed, 45 test files and 396 tests passing, UI build succeeded, and factory-readiness passed.

Ready-for-review-at: 2026-07-05T15:24:41Z
