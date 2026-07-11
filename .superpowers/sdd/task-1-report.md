# Task 1 Report: Production Registrations And Output Contracts

Status: DONE

## Commits

- `32291de6 chore: claim production specialist registrations`
- `4c94c1c4 feat: register production specialist prompt contracts`

## Scope Delivered

- Registered the six approved production prompt templates with exact template, provider-output-schema, and handoff-schema IDs.
- Bound PRR negotiation to always-required PRR and jurisdiction contexts; bound the other five run types to conditional PRR context with the exact `no-associated-prr` omission reason.
- Added deterministic renderer hashes computed from canonical registered material only.
- Added strict, per-field provider-output validation that rejects authority/external-effect/accepted-ontology claims while allowing command-like narrative evidence text in allowed narrative fields.

## Verification

- RED: focused test failed because the production prompt module was absent.
- GREEN: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` passed with 4 tests.
- `npm run verify` passed: typecheck, 178 passed / 3 skipped test files, 1,950 passed / 3 skipped tests, Vite build, and factory readiness.

## Concerns

- None. This task intentionally does not add renderer execution, artifact binding, readiness/fallback closure, provider transfer binding, or workflow integration.

## Review Finding Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed as expected because `citedRuleRefs` accepted the completed-effect narrative `The agency sent the response`.
- GREEN: the same focused command passed with 7 tests after reference fields were restricted to canonical delimiter-bearing identifiers or `sha256:` hashes and gained authority-claim rejection.
- Coverage: report-builder `outlineRefs`, PRR `citedRuleRefs`, timeline `evidenceRefs`, contradiction `comparedSourceRefs`, and investigation-planner `objectiveRefs` reject narrative completed-effect claims; canonical report references remain valid; narrative `safeSummaries` still permits command-like evidence wording but rejects authority claims.
- Verify: `npm run verify` passed (typecheck, test suite, Vite build, and factory readiness).

## Re-review Finding Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: passive/copular completed-effect and authority wording was accepted, and identifier fields bypassed secret-safety validation.
- GREEN: the same focused command passed with 9 tests after completed PRR send, legal escalation, export/publication, repair execution, ontology acceptance, entity/relationship acceptance or resolution, lock clearing, and provider byte-transfer approval claims were rejected across text and identifier fields.
- ID coverage: secret-shaped `ev_sk-live-...` and authority-shaped `packet_report_was_published` identifiers are rejected.
- Verify: `npm run verify` passed.

## Re-review P1 Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: equivalent authority claims including `The PRR response was emailed.`, `A human approved the provider byte transfer.`, and `The request was filed.` were accepted, and `dateRange.start: "sk-live-secret"` was accepted.
- GREEN: the same focused command passed with 1 file and 10 tests after shared authority matching covered the new completed PRR send, provider-transfer approval, and request-filing variants; `dateRange.start` and `.end` now require the same normalized date syntax as `date`.
- Verify: `npm run verify` passed.

## Re-review P1 Authority-Matching Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression and 11 passing tests because `The PRR was filed.` and `The provider byte transfer was human-approved.` were accepted in narrative fields.
- GREEN: the same focused command passed with 1 file and 12 tests after normalized structural subject/action matching rejected `packet_prr_was_emailed`, `The PRR was filed.`, `Legal escalation was performed.`, and `The provider byte transfer was human-approved.` across representative identifier, narrative, and reference fields.
- Coverage: the matcher normalizes underscores, hyphens, and whitespace; it rejects completed PRR/request/response effects, legal-escalation effects, and provider byte-transfer approval in either word order while continuing to reject export/publication, repair execution, ontology/entity/relationship acceptance or resolution, and lock clearing. A command-like evidence statement about filing steps without a completed-effect claim remains accepted.
- Verify: `npm run verify` passed: typecheck, tests, Vite build, and factory readiness. Node emitted only its existing experimental SQLite warning.

## Review Finding Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions: `The PRR delivery was completed.`, `The PRR submission was completed.`, `The publication was completed.`, `The entity resolution was completed.`, and `The lock clearing was completed.` bypassed authority matching, and `Provider error 429 from /home/user/provider-response.json` was accepted in a narrative field.
- GREEN: the same focused command passed with 1 file and 14 tests after punctuation-aware normalization and structural subject/completed-effect matching rejected the nominalizations. The shared `safeText` path now rejects raw provider errors and common hidden local paths (`/home/...`, `/Users/...`) for narrative fields, IDs, and refs without blocking ordinary public URLs.
- Verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warning.

## Remaining Review P1 Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 1 expected regression because `OpenAI API returned HTTP 429 rate limit exceeded` was accepted in an ordinary narrative field.
- GREEN: the same focused command passed with 1 file and 15 tests after the shared `safeText` path rejected combined provider/model/API/OpenAI/Nous diagnostic signals and local `file:///...`, POSIX, and Windows user paths. The exact `file:///home/user/provider-response.json` and `C:\\Users\\user\\provider-response.json` cases are covered; ordinary `https://example.org/report.pdf` evidence remains valid.
- Verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.

## Production Output Contract Review P1 Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 3 expected regressions: `prr-negotiation` advertised `no-associated-prr`, `The PRR was faxed.` was accepted as a completed send effect, and `Cookie: sessionid=provider-session-secret` was accepted in a narrative field.
- GREEN: the same focused command passed with 1 file and 16 tests after `prr-negotiation` received the standard omission list while the five conditional-PRR registrations retained `no-associated-prr`; shared authority matching added faxed PRR sends; and shared `safeText` rejected `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, and `X-API-Key` header forms across narratives, IDs, and refs.
- Verify: `npm run verify` passed; Node emitted only its existing experimental SQLite warnings.

## Remaining Production Output Contract P1 Fix

- RED: `npm test -- packages/agent/test/production-specialist-prompts.test.ts` failed with 2 expected regressions because `Provider byte-transfer approval was completed.`, `Approval for the provider byte transfer was granted.`, session header forms, `C:/Users/name/provider-response.json`, and `Provider failure: timeout` were accepted.
- GREEN: the same focused command passed with 1 file and 18 tests after the shared `safeText` path rejected provider-byte-transfer approval/grant/completed/authorized wording in either order across narrative, identifier, and reference fields; common auth/session/token/cookie/API-key `:` or `=` headers; combined provider diagnostics including failure and timeout; and Windows forward-slash user paths. Public `https://` evidence remains valid under the existing coverage.
- Verify: `npm run verify` passed: typecheck, test suite, Vite build, and factory readiness. Node emitted only its existing experimental SQLite warnings.
