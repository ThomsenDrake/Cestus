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
- Remaining review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression because `OpenAI API returned HTTP 429 rate limit exceeded` was accepted in an ordinary narrative field.
- Remaining review P1 GREEN: the same focused command passed with 1 file and 15 tests after shared `safeText` rejected combined provider/model/API/OpenAI/Nous diagnostic signals and `file:///...`, POSIX, or Windows user local paths while retaining public `https://` URLs.
- Remaining review P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Production output contract review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 3 expected regressions: `prr-negotiation` allowed `no-associated-prr`, `The PRR was faxed.` was accepted, and a `Cookie:` session header was accepted in a narrative field.
- Production output contract review P1 GREEN: the same focused command passed with 1 file and 16 tests after registrations received run-type-specific omission lists, shared authority matching recognized faxed PRR sends, and shared `safeText` rejected authentication and cookie headers.
- Production output contract review P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Remaining production output contract P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions because provider-byte-transfer approval claims in nominalized or approval-first wording, session headers, Windows forward-slash user paths, and provider failure/timeout diagnostics were accepted.
- Remaining production output contract P1 GREEN: the same focused command passed with 1 file and 18 tests after shared `safeText` authority matching recognized provider-byte-transfer approval, grant, completion, and authorization wording in either order; header detection covered common auth/session/token/cookie/API-key names with `:` or `=`; provider diagnostic matching covered failure and timeout; and Windows forward-slash user paths were rejected.
- Remaining production output contract P1 verify: `npm run verify` passed: typecheck, test suite, Vite build, and factory readiness. Node emitted only its existing experimental SQLite warnings.
- Review findings fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 3 expected regressions: `Anthropic error: timeout` was accepted, PRR filing instructions using `should be mailed` were treated as completed effects, and date-range bounds bypassed the shared `safeText` raw-provider-diagnostic check.
- Review findings fix GREEN: the same focused command passed with 1 file and 20 tests after generic diagnostic-shaped provider errors were rejected, PRR send/file/fax/mail actions required completed-effect wording rather than instruction language, and normalized dates composed shared `safeText` with the existing date syntax regex.
- Review findings fix verify: `npm run verify` passed: typecheck, test suite, Vite build, and factory readiness. Node emitted only its existing experimental SQLite warnings.
- Remaining review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with the completed effect `The PRR was filed; filing instructions are attached.` accepted because instruction wording elsewhere in the field suppressed the effect match.
- Remaining review P1 GREEN: the same focused command passed with 1 file and 21 tests after PRR completed-effect matching evaluated punctuation-delimited clauses, preserving the filing-instructions case with `should be mailed`; shared `safeText` now also rejects generic error, failure, and timeout diagnostics including `Error: upstream request timed out` and `HTTP 429: request timed out`.
- Remaining review P1 verify: `npm run verify` passed: typecheck, test suite, Vite build, and factory readiness. Node emitted only its existing experimental SQLite warnings.
- Provider transfer completion P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 21 passing tests because `Provider byte transfer completion was recorded.` was accepted in a narrative field.
- Provider transfer completion P1 GREEN: the same focused command passed with 1 file and 22 tests after provider byte-transfer authority matching rejected `completion` alongside the existing approval, grant, completed, and authorization terms across narrative and reference fields.
- Provider transfer completion P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Remaining Task 1 review fix RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 21 passing tests because `The PRR was filed, and it should be visible in the portal tomorrow.` was accepted.
- Remaining Task 1 review fix GREEN: the same focused command passed with 1 file and 22 tests after authority normalization preserved clause punctuation and PRR completed-effect matching evaluated comma-delimited subclauses; `Public filing instructions say the request should be mailed to the records office.` remains accepted.
- Remaining Task 1 review fix verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Final Task 1 review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 21 passing tests because `The PRR was filed and should be logged.` was accepted when the later modal appeared in the same conjunction clause.
- Final Task 1 review P1 GREEN: the same focused command passed with 1 file and 22 tests after PRR authority matching only treats a modal as instructional when it precedes the completed action; `Public filing instructions say the request should be mailed to the records office.` remains accepted.
- Final Task 1 review P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Production specialist output contract review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions because provider-transfer, legal-escalation, and repair policy/instruction language was treated as completed authority claims across the shared safe-text boundary.
- Production specialist output contract review P1 GREEN: the same focused command passed with 1 file and 24 tests after non-PRR authority matching adopted the PRR clause-aware modal-before-action check. Provider byte-transfer `approval` now remains policy context unless paired with a completed effect; completed provider transfer, legal escalation, and repair claims remain rejected through narrative, identifier, and reference fields.
- Production specialist output contract review P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Complete specialist output modal-aware matching RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions because export/publication, ontology acceptance, and lock-clearing policy language was rejected while completion variants using `completion`, `recorded`, and `complete` were accepted.
- Complete specialist output modal-aware matching GREEN: the same focused command passed with 1 file and 24 tests after all authority categories used the shared clause-aware modal-before-action matcher. `The report should be published after review.`, `The graph must be accepted by a human reviewer.`, and `The lock should be cleared only after approval.` are accepted; legal escalation, entity resolution, lock clearing, and provider byte-transfer completion claims are rejected.
- Complete specialist output modal-aware matching verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Remaining Task 1 review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 23 passing tests because `The PRR must be filed and was filed.` was accepted when an earlier modal instruction suppressed the later completed filing action.
- Remaining Task 1 review P1 GREEN: the same focused command passed with 1 file and 24 tests after PRR authority matching independently recognized completed passive action phrases across a PRR subject and a later pronoun subclause; `The PRR must be filed, and it was filed.` is also rejected, while `Public filing instructions say the request should be mailed to the records office.` remains accepted.
- Remaining Task 1 review P1 verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.
- Remaining Task 1 non-PRR mixed modal/completed review P1 RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 24 passing tests because `The report must be published and was published.` was accepted; equivalent legal-escalation approval, repair execution, and lock-clearing claims were covered by the same regression test.
- Remaining Task 1 non-PRR mixed modal/completed review P1 GREEN: the same focused command passed with 1 file and 25 tests after shared authority matching independently recognized later completed passive actions across all non-PRR categories while existing modal-only policy/instruction coverage remained accepted.
- Remaining Task 1 non-PRR mixed modal/completed review P1 verify: `npm run verify` passed: typecheck, tests, Vite build, and factory readiness; Node emitted only its existing experimental SQLite warnings.
- Next Task 1 review findings RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: punctuation-delimited pronoun completions bypassed authority matching, and ordinary source-evidence wording about an error and a published public record was rejected.
- Next Task 1 review findings GREEN: the same focused command passed with 1 file and 27 tests after delimiter-aware pronoun completion matching covered every authority category, raw provider diagnostics required provider/diagnostic structure, and export/publication matching required a direct completed action.
- Next Task 1 review findings verify: `npm run verify` passed: typecheck, test suite, Vite build, and factory readiness; Node emitted only its existing experimental SQLite warnings.
