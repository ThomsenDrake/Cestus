# Task 2: Durable Resident Workflow Runner

Plan: `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
Task: Task 2: Durable Resident Workflow Runner
Branch: `codex/ontology-bootstrap-resident-workflow-plan`
Status: ready-for-review
Claimed-at: 2026-07-08T13:41:53Z
Worker: Codex

## Owned Files

- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- `docs/agentic/claims/task-2-ontology-bootstrap-resident-runner.md`

## Verification

- Red targeted test: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts` failed with `runOntologyBootstrapResidentWorkflow is not a function` before implementation.
- Green targeted test: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialists.test.ts packages/agent/test/projection.test.ts packages/agent/test/tool-gateway.test.ts` passed with 4 test files and 46 tests.
- Full verification: `npm run verify` passed with typecheck, 131 test files / 1265 tests, UI build, and factory readiness.

## Inline Review

- Spec compliance: approved. The runner appends agent run-step, pending ledger-review tool request, task waiting-for-approval, completion, and failure events without importing, staging, proposing, accepting, sending, exporting, or repairing domain state.
- Safety review: approved. Resume skips identical existing tool requests, fails closed with `approval-stale` when the preview hash changes, and maps missing report/evidence provenance failures into existing secret-safe agent failure categories.
