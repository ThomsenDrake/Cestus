# Task 2 Claim: Governance Policy Helpers

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 2: Add Governance Policy Helpers
Worker: Codex GPT-5
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: 2026-07-05T14:34:44Z
Status: ready-for-review

Owned files:
- `packages/ontology/src/governance-policy.ts`
- `packages/ontology/src/index.ts`
- `packages/ontology/test/governance-policy.test.ts`
- `docs/agentic/claims/task-2-governance-policy.md`

Required commands:
- `npm test -- packages/ontology/test/governance-policy.test.ts`
- `npm run verify`

Command evidence:
- Red: `npm test -- packages/ontology/test/governance-policy.test.ts` failed because `../src/governance-policy.js` did not exist.
- Green repair: `npm test -- packages/ontology/test/governance-policy.test.ts` initially found the new duplicate-tag validator reported export defaults before exact tag coverage.
- Green: `npm test -- packages/ontology/test/governance-policy.test.ts` passed with 1 test file and 6 tests passing.
- Final green: `npm test -- packages/ontology/test/governance-policy.test.ts` passed with 1 test file and 6 tests passing after validator polish.
- Verify: `npm run verify` passed with typecheck passed, 43 test files and 367 tests passing, UI build succeeded, and factory-readiness passed.
- Code-quality fix red: `npm test -- packages/ontology/test/governance-policy.test.ts` failed with 3 tests proving out-of-range confidence was high, `AWS_SECRET_ACCESS_KEY=abc123` was allowed, and descriptive password text was rejected.
- Code-quality fix green: `npm test -- packages/ontology/test/governance-policy.test.ts` passed with 1 test file and 10 tests passing.
- Code-quality fix verify: `npm run verify` passed with typecheck passed, 43 test files and 371 tests passing, UI build succeeded, and factory-readiness passed.
- Spec re-check red: `npm test -- packages/ontology/test/governance-policy.test.ts` failed because `access token abc123` was allowed.
- Spec re-check repair: `npm test -- packages/ontology/test/governance-policy.test.ts` then failed because the detector treated safe prose `password and requires review` as a secret value.
- Spec re-check green: `npm test -- packages/ontology/test/governance-policy.test.ts` passed with 1 test file and 10 tests passing.
- Spec re-check verify: `npm run verify` passed with typecheck passed, 43 test files and 371 tests passing, UI build succeeded, and factory-readiness passed.
