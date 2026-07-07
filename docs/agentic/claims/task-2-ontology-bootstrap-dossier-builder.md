# Task 2: Deterministic Bootstrap Dossier Builder

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 2: Deterministic Bootstrap Dossier Builder
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:16:07Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/dossier-builder.ts`
- `packages/ontology-bootstrap/test/fixtures/bootstrap-fixtures.ts`
- `packages/ontology-bootstrap/test/dossier-builder.test.ts`
- `packages/ontology-bootstrap/src/index.ts`

## Verification

- Red targeted test: `npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts` failed resolving the missing `../src/dossier-builder.js` module before implementation.
- Green targeted test: `npm test -- packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/contracts.test.ts` passed with 2 test files and 5 tests.
- Full verification: `npm run verify` passed with typecheck, 106 test files / 969 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. Dossier candidates become eligible only through same-source evidence links, foreign evidence IDs are excluded, candidate relationship material remains report-only, and the builder has no import or staging side effects.
- Code quality: approved. The builder is deterministic, pure, schema-validated, and uses the existing legacy report/review contracts rather than a parallel importer or graph path.
