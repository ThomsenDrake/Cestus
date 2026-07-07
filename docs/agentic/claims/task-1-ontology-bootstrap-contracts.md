# Task 1: Ontology Bootstrap DTO Contracts

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 1: Ontology Bootstrap DTO Contracts
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:12:35Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/ontology-bootstrap/src/index.ts`
- `packages/ontology-bootstrap/test/contracts.test.ts`

## Verification

- Red targeted test: `npm test -- packages/ontology-bootstrap/test/contracts.test.ts` failed resolving the missing `../src/contracts.js` module before implementation.
- Green targeted test: `npm test -- packages/ontology-bootstrap/test/contracts.test.ts` passed with 1 test file and 3 tests.
- Full verification: `npm run verify` passed with typecheck, 105 test files / 967 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. The slice adds strict dossier, phase, failure, and tool-preview DTO contracts only, rejects secret-shaped text, and forbids accepted graph event types in bootstrap tool previews.
- Code quality: approved. The implementation is pure schema/type code with no filesystem access, runtime execution, provider calls, source-tree import path, staging execution, or UI wiring.
