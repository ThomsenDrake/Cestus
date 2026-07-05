# Task 5 Claim: Governance Export

Plan: `docs/superpowers/plans/2026-07-05-security-threat-model-data-governance-implementation.md`
Task heading: `Task 5: Add Export And Report Governance Helpers`
Worker: `Codex GPT-5`
Branch: `codex/security-governance-design`
Worktree: `/home/drake/.codex/worktrees/c3c1/Cestus`
Claimed-at: `2026-07-05T15:30:41Z`
Status: `ready-for-review`

Owned files:
- `packages/ontology/src/governance-service.ts`
- `packages/ontology/src/governance-projection.ts`
- `packages/ontology/test/governance-export.test.ts`
- `docs/agentic/claims/task-5-governance-export.md`

Required commands:
- `npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts`
- `npm run verify`

## Evidence

Red:
- `npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts`
- Result: failed as expected; new projection methods `buildDefaultExportEvidenceIds`/`planExport` and service methods `recordExportGenerated`/`recordReportGenerated` were missing.

Green:
- `npm test -- packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-service.test.ts packages/ontology/test/governance-projection.test.ts`
- Result: passed; 3 test files passed, 34 tests passed.

Verify:
- `npm run verify`
- Result: passed; typecheck passed, 46 test files passed, 405 tests passed, UI build succeeded, factory-readiness passed.

Ready-for-review-at: `2026-07-05T15:33:37Z`

## Self-Review

- The service rejects explicitly blocked evidence before append through `blockedEvidenceIds`, preserving quarantine/tombstone enforcement without introducing projection or storage dependencies into the service.
- The Task 5 supplied projection test expects `ev_source_private` to be includable when all restricted tags are opted in, even though the golden fixture marks it quarantined. Projection export planning follows that required test; callers that treat projected quarantine as a hard block can pass the evidence ID through the service's explicit blocked list.
