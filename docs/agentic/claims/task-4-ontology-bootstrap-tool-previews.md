# Task 4: Tool Preview Builders

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 4: Tool Preview Builders
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:22:37Z
Worker: Codex

## Owned Files

- `packages/ontology-bootstrap/src/tool-previews.ts`
- `packages/ontology-bootstrap/test/tool-previews.test.ts`
- `packages/ontology-bootstrap/src/index.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/ontology-bootstrap/test/contracts.test.ts`

## Verification

- Red targeted test: `npm test -- packages/ontology-bootstrap/test/tool-previews.test.ts` failed resolving the missing `../src/tool-previews.js` module before implementation.
- Supporting contract red test: `npm test -- packages/ontology-bootstrap/test/contracts.test.ts` failed on unrecognized strict preview keys `scanBatchId`, `stagingBatchId`, and `evidenceRefs`, proving the schema needed the evidence-bound preview extension.
- Green targeted test: `npm test -- packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/contracts.test.ts` passed with 2 test files and 7 tests.
- Full verification: `npm run verify` passed with typecheck, 108 test files / 975 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. Preview hashes bind report, scan/import/staging, candidate-set, selected candidate, and evidence identity where required; staging execution previews allow only `assertion.proposed`.
- Code quality: approved. Builders are pure deterministic DTO helpers, schema-validated, and do not call import, staging, provider, filesystem, accepted graph, export, or legal paths.
