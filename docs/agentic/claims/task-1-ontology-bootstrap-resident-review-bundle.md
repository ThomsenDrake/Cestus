# Task 1: Pure Agent Bootstrap Review Bundle

Plan: `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
Task: Task 1: Pure Agent Bootstrap Review Bundle
Branch: `codex/ontology-bootstrap-resident-workflow-plan`
Status: ready-for-review
Claimed-at: 2026-07-08T13:35:43Z
Worker: Codex

## Owned Files

- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- `docs/agentic/claims/task-1-ontology-bootstrap-resident-review-bundle.md`

## Verification

- Red targeted test: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts` failed resolving the missing `../src/ontology-bootstrap-workflow.js` module before implementation.
- Green targeted test: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts` passed with 3 test files and 16 tests.
- Full verification: `npm run verify` passed with typecheck, 131 test files / 1261 tests, UI build, and factory readiness.

## Inline Review

- Spec compliance: approved. The bridge builds review-only candidate bundles, context-pack refs, and agent-safe tool previews without source-tree reads, imports, model calls, staging execution, approval decisions, or accepted graph paths.
- Safety review: approved. DTO parsing rejects invalid agent IDs, forbidden accepted graph event previews, and missing selected-candidate evidence refs; preview output contains hashes and review metadata without secret-shaped strings.
