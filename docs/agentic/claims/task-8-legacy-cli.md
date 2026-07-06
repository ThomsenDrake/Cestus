# Task 8: Legacy CLI DTO Handlers

Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
Task: Task 8: Add Legacy CLI DTO Handlers
Branch: `codex/legacy-cestus-import`
Worktree: `/home/drake/.codex/worktrees/9b5f/Cestus`
Status: approved
Claimed-at: 2026-07-06T16:05:42Z
Worker: Codex implementation worker

## Owned Files

- `docs/agentic/claims/task-8-legacy-cli.md`
- `packages/ingestion/src/cli.ts`
- `packages/ingestion/test/legacy-cli.test.ts`

## Evidence

- Claim commit: `6e3feb4 chore: claim legacy cli`.
- Red targeted test: `npm test -- packages/ingestion/test/legacy-cli.test.ts` failed because both legacy commands returned `INGESTION_COMMAND_UNSUPPORTED`.
- Green targeted test: `npm test -- packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts` passed with 2 test files and 4 tests.
- Full verification: `npm run verify` passed with typecheck, 77 test files and 628 tests, UI build, and factory readiness.
- Spec review fix: added a regression for malformed `legacy-report-json` calls and tightened command typing/runtime validation so missing DTOs throw instead of printing `undefined`.
- Review-fix red targeted test: `npm test -- packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts` failed because malformed `legacy-report-json` did not throw.
- Review-fix green targeted test: `npm test -- packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts` passed with 2 test files and 5 tests.
- Review-fix full verification: `npm run verify` passed with typecheck, 77 test files and 629 tests, UI build, and factory readiness.

## Review Gate

- Spec review: approved at 2026-07-06T16:22:38Z; no blocking issues after DTO validation.
- Code-quality review: approved at 2026-07-06T16:22:38Z; no Critical, Important, or Minor issues remaining.

## Self-Review

- Scope: changed only the Task 8 owned files.
- Pure DTO behavior: legacy CLI handlers return stable pretty JSON and do not access filesystems, services, prompts, runtimes, imports, or external dependencies.
- Artifact ask: `legacy-artifact-ask-json` uses `firstLegacyArtifactAsk` exactly from `legacy-types.ts`.
- Report DTO: `legacy-report-json` prints the supplied `LegacyMigrationReviewDto` without mutation or hidden enrichment, and malformed runtime calls without a DTO throw before serialization.
- Truth boundary: no ledger, evidence, assertion, entity, relationship, staging, or accepted graph events are emitted by these handlers.
- Findings: none.
