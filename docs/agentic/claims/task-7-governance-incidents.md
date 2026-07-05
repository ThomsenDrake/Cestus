# Task 7 Claim: Governance Incidents

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 7: Add Incident And Repair Governance
Worker: Codex GPT-5
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: 2026-07-05T16:07:26Z
Status: ready-for-review

Owned files:
- `packages/ontology/src/governance-service.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/test/governance-incident.test.ts`
- `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- `docs/agentic/claims/task-7-governance-incidents.md`

Required commands:
- `npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts`
- `npm run verify`

Evidence:
- Red: `npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts` failed with missing incident projection/service surface: `projection.openIncidentIds is not a function`, `projection.incidents` undefined, and `service.recordIncident is not a function`.
- Green: `npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts` passed: 2 test files, 22 tests.
- Verify: `npm run verify` passed: typecheck passed, 48 test files and 430 tests passed, UI build succeeded, factory-readiness passed.
- Review fix red: duplicate incident regression tests failed as expected: duplicate replay reopened `incident_repaired_secret` and cleared repair history, and duplicate `recordIncident()` resolved instead of rejecting.
- Review fix green: `npm test -- packages/ontology/test/governance-incident.test.ts packages/ontology/test/governance-projection.test.ts` passed: 2 test files, 24 tests.
- Review fix verify: `npm run verify` passed: typecheck passed, 48 test files and 432 tests passed, UI build succeeded, factory-readiness passed.
