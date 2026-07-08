# Task 3: Live Nous Review Notes For Model-Facing Behavior

Plan: `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
Task: Task 3: Live Nous Review Notes For Model-Facing Behavior
Branch: `codex/ontology-bootstrap-resident-workflow-plan`
Status: ready-for-review
Claimed-at: 2026-07-08T13:48:21Z
Worker: Codex

## Owned Files

- `packages/agent/src/ontology-bootstrap-nous.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/ontology-bootstrap-nous.test.ts`
- `packages/agent/test/ontology-bootstrap-nous-live.test.ts`
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- `docs/agentic/claims/task-3-ontology-bootstrap-resident-nous.md`

## Verification

- Red deterministic test: `npm test -- packages/agent/test/ontology-bootstrap-nous.test.ts` failed resolving the missing `../src/ontology-bootstrap-nous.js` module before implementation.
- Green deterministic targeted test: `npm test -- packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/openai-compatible-provider.test.ts` passed with 3 test files and 18 tests.
- Live Nous acceptance: `CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts` passed with 1 test file and 1 test; output did not include API key material, bearer headers, or raw provider bodies.
- Full verification: `npm run verify` passed with typecheck, 132 test files passed / 1 skipped, 1269 tests passed / 1 skipped, UI build, and factory readiness.

## Inline Review

- Spec compliance: approved. The helper builds raw-content-free prompts from dossier and candidate metadata, validates Nous output as review-note-only material, and records optional model memo artifacts without authorizing staging or accepted graph state.
- Safety review: approved. Live provider usage goes through the existing Nous provider and secret store; deterministic tests cover prompt/output safety while the explicit live smoke proves the model-facing path.
