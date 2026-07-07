# Task 6: Factory Readiness And Documentation Evidence

Plan: `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
Task: Task 6: Factory Readiness And Documentation Evidence
Branch: `codex/ontology-bootstrap-specialist`
Status: ready-for-review
Claimed-at: 2026-07-07T15:28:44Z
Worker: Codex

## Owned Files

- `scripts/check-agent-readiness.mjs`
- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`

## Verification

- Focused bundle: `npm test -- packages/ontology-bootstrap/test/contracts.test.ts packages/ontology-bootstrap/test/dossier-builder.test.ts packages/ontology-bootstrap/test/read-model.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts` passed with 7 test files and 38 tests.
- Full verification before readiness tracking: `npm run verify` passed with typecheck, 109 test files / 977 tests, UI build, and factory readiness.
- Post-doc whitespace/factory check: `git diff --check && npm run factory:check` passed.
- First final `npm run verify` attempt hit a load-sensitive timeout in `packages/workspace-ops/test/cli.test.ts`, outside this slice.
- Diagnostic rerun: `npx vitest run packages/workspace-ops/test/cli.test.ts -t "runs the operator diagnose command set against one portable workspace" --testTimeout 20000` passed.
- Default targeted rerun: `npm test -- packages/workspace-ops/test/cli.test.ts` passed with 20 tests.
- Final full verification rerun: `npm run verify` passed with typecheck, 109 test files / 977 tests, UI build, and factory readiness.

## Inline Reviews

- Spec compliance: approved. Factory readiness now tracks the ontology-bootstrap design and plan, and readiness docs state the fake/deterministic scope and zero-trust legacy import boundaries.
- Code quality: approved. The slice is documentation/readiness only, additive to existing factory history, and does not alter runtime behavior or weaken any legacy import or ontology invariant.
