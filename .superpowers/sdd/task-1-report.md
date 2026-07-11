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
