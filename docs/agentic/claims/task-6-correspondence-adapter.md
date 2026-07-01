# Task 6 Correspondence Adapter Claim

- Plan: `docs/superpowers/plans/2026-07-01-public-records-request-workflow-implementation.md`
- Task: Task 6: Add Correspondence Adapter Contracts And Fakes
- Worker: Codex
- Branch: `codex/prr-workflow-design`
- Worktree: `/home/drake/.codex/worktrees/836b/Cestus`
- Claimed at: 2026-07-01T17:35:59Z
- Status: ready-for-review

## Owned Files

- `packages/prr/src/correspondence-adapter.ts`
- `packages/prr/test/correspondence-adapter.test.ts`
- `packages/prr/src/index.ts`
- `docs/agentic/claims/task-6-correspondence-adapter.md`

## Evidence Log

- Claim created before editing task files.
- Red targeted test:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: failed as expected because `../src/correspondence-adapter.js` could not be found.
- Green targeted test:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: passed, 1 test file and 10 tests.
- Self-review red case:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: failed on missing `approvedBy` with a generic runtime `trim` error.
- Final targeted test:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: passed, 1 test file and 11 tests.
- Full verification:
  - Command: `npm run verify`
  - Result: `typecheck passed`; 18 test files passed with 139 tests; `factory-readiness passed`.
- Review-fix red targeted test:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: failed with 9 expected failures covering leaked sync-message mutation and missing exported `assertApprovedMessageInput`.
- Review-fix green targeted test:
  - Command: `npm test -- packages/prr/test/correspondence-adapter.test.ts`
  - Result: passed, 1 test file and 20 tests.
- Review-fix full verification:
  - Command: `npm run verify`
  - Result: `typecheck passed`; 18 test files passed with 148 tests; `factory-readiness passed`.

## Self-Review

- No provider implementations, correspondence service, ontology contracts, lifecycle service, or unrelated files were modified.
- The fake adapter has no live credential or network path and exposes only `sendApprovedMessage` for outbound send behavior.
- Validation now returns clear local errors for blank send inputs and missing or blank human approval.
- Review fix exported the approved-send validator for provider wrappers, made fake sync input snapshotting deterministic, and changed credential-mode mapping to an exhaustive provider switch.
