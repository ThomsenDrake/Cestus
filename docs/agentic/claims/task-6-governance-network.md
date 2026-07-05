# Task 6 Claim: Governance Network

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task: Task 6: Add Network Exposure And Device Approval Projection
Worker: Codex GPT-5
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: 2026-07-05T15:50:47Z
Status: ready-for-review

Owned files:
- `packages/ontology/src/governance-service.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/test/governance-network.test.ts`
- `packages/ontology/test/fixtures/golden-governance-ledger.ts`
- `docs/agentic/claims/task-6-governance-network.md`

Required commands:
- `npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts`
- `npm run verify`

Evidence:
- Red: `npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts` failed as expected before implementation. Failures showed missing `networkExposure`, missing `isSessionApproved`, and missing `enableNetworkExposure()` / `approveDeviceSession()` methods.
- Green: `npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts` passed after implementation: 2 files passed, 19 tests passed.
- Verify: `npm run verify` passed: typecheck passed, 47 test files passed, 416 tests passed, UI build succeeded, factory-readiness passed.
- Review fix red: `npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts` failed as expected before the fix: approval lacked exposure causation and still appended for missing or disabled exposure.
- Review fix green: `npm test -- packages/ontology/test/governance-network.test.ts packages/ontology/test/governance-projection.test.ts` passed after the fix: 2 files passed, 23 tests passed.
- Review fix verify: `npm run verify` passed: typecheck passed, 47 test files passed, 420 tests passed, UI build succeeded, factory-readiness passed.
