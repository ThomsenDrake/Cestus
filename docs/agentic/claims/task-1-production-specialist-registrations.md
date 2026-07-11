# Task 1: Production Specialist Registrations And Output Contracts

- Plan: `.superpowers/sdd/task-1-brief.md`
- Task heading: `Task 1: Production Registrations And Output Contracts`
- Worker: Codex (GPT-5)
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Claimed at (UTC): `2026-07-11T02:05:32Z`
- Status: `ready-for-review`

## Owned Files

- `packages/agent/src/production-specialist-output-contracts.ts`
- `packages/agent/src/production-specialist-prompts.ts`
- `packages/agent/test/production-specialist-prompts.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-production-specialist-registrations.md`

## Evidence

- Claim created before task implementation or test edits.
- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed as expected because `../src/production-specialist-prompts.js` did not exist.
- GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 file and 4 tests.
- Verify: `npm run verify` passed: typecheck, 178 passed / 3 skipped test files, 1,950 passed / 3 skipped tests, Vite build, and factory readiness.
- Re-review fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: equivalent completed-effect/authority claims were accepted and an `ev_sk-live-...` identifier bypassed secret safety.
- Re-review fix GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 file and 9 tests after authority matching covered passive/copular wording and identifiers used the shared secret-safety and authority checks.
- Re-review fix verify: `npm run verify` passed.
- Re-review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with the new equivalent authority claims accepted and `dateRange.start: "sk-live-secret"` accepted.
- Re-review P1 GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 1 file and 10 tests after PRR email, request filing, and human provider-transfer approval variants were rejected and range bounds required normalized dates.
- Re-review P1 verify: `npm run verify` passed.
- Re-review P1 authority-matching RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with the new narrative authority variants accepted; the focused suite reported 1 failure and 11 passing tests.
- Re-review P1 authority-matching GREEN: the same focused command passed with 1 file and 12 tests after normalized subject/action matching rejected PRR/request/response sends and filings, legal escalation completion, and provider byte-transfer approval across narrative, identifier, and reference paths while retaining non-effect command-like evidence text.
- Re-review P1 authority-matching verify: `npm run verify` passed: typecheck, tests, Vite build, and factory readiness; Node emitted only its existing experimental SQLite warning.
- Review finding fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: completed-effect nominalizations and a narrative raw provider error with a hidden local path were accepted.
- Review finding fix GREEN: the same focused command passed with 1 file and 14 tests after structural normalized subject/action matching recognized completed-effect markers and shared `safeText` rejected raw provider errors and `/home/...` or `/Users/...` paths across narrative, identifier, and reference fields.
- Review finding fix verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warning.
