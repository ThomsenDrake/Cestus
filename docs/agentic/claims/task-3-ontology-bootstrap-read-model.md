# Task 3: Bootstrap Read Model

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 3: Bootstrap Read Model
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:19:38Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/read-model.ts`
- `packages/ontology-bootstrap/test/read-model.test.ts`
- `packages/ontology-bootstrap/src/index.ts`

## Verification

- Red targeted test: `npm test -- packages/ontology-bootstrap/test/read-model.test.ts` failed resolving the missing `../src/read-model.js` module before implementation.
- First full verification: `npm run verify` failed typecheck because `phaseFor` required a narrowed report object it did not actually use.
- Green targeted test after repair: `npm test -- packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts` passed with 2 test files and 4 tests.
- Full verification after repair: `npm run verify` passed with typecheck, 107 test files / 971 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. Missing reports block with safe repair actions, readiness uses review/report/evidence-link state only, and no old source path guessing or ontology truth promotion is introduced.
- Code quality: approved. The helper is deterministic, browser-safe, validates failure DTOs through the shared schema, and has no filesystem, provider, importer, staging, or accepted graph side effects.
