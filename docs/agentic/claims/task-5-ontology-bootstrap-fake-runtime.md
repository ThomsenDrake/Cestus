# Task 5: Fake Specialist Runtime Facade

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 5: Fake Specialist Runtime Facade
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:25:53Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/fake-runtime.ts`
- `packages/ontology-bootstrap/test/fake-runtime.test.ts`
- `packages/ontology-bootstrap/src/index.ts`

## Verification

- Red targeted test: `npm test -- packages/ontology-bootstrap/test/fake-runtime.test.ts` failed resolving the missing `../src/fake-runtime.js` module before implementation.
- Green targeted test: `npm test -- packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts` passed with 3 test files and 7 tests.
- First full verification: `npm run verify` failed typecheck on exact optional `report` passing and Zod-parsed hash typing at the preview boundary.
- Full verification after repair: `npm run verify` passed with typecheck, 109 test files / 977 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. The fake runtime returns deterministic dossiers and preview DTOs, safe failures for missing reports, and an explicit empty side-effect list.
- Code quality: approved. The facade composes existing package helpers only and has no model calls, source-tree reads, import execution, staging execution, ledger writes, UI mutation, or accepted graph path.
