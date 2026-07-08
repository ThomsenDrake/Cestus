# Task 6: Readiness Tracking And Review Gates

Plan: `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
Task: Task 6: Readiness Tracking And Review Gates
Branch: `codex/ontology-bootstrap-resident-workflow-plan`
Status: ready-for-review
Claimed-at: 2026-07-08T15:30:12Z
Completed-at: 2026-07-08T15:33:14Z
Worker: Codex

## Owned Files

- `scripts/check-agent-readiness.mjs`
- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
- `docs/agentic/claims/task-6-ontology-bootstrap-resident-readiness.md`

## Verification

- Focused readiness bundle passed: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/specialists.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts` (10 files, 96 tests).
- Live Nous acceptance passed with secret-safe visible output: `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts` (1 file, 1 test).
- Full verification passed before readiness tracking: `npm run verify` with typecheck, 134 test files passed / 1 skipped, 1272 tests passed / 1 skipped, UI build, and factory readiness.
- Documentation gates passed: `git diff --check` and `npm run factory:check`.
- Final full verification passed after readiness tracking: `npm run verify` with typecheck, 134 test files passed / 1 skipped, 1272 tests passed / 1 skipped, UI build, and factory readiness.
