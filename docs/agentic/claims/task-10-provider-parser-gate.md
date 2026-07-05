# Task 10 Claim: Add Provider Parser Approval Gate

- Plan: `docs/superpowers/plans/2026-07-05-public-ingestion-pipeline-implementation.md`
- Task heading: `Task 10: Add Provider Parser Approval Gate`
- Worker identity: Codex
- Branch: `codex/public-ingestion-pipeline-design`
- Worktree path: `/home/drake/.codex/worktrees/aee0/Cestus`
- Claimed at: `2026-07-05T17:24:33Z`
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-10-provider-parser-gate.md`
- `packages/ingestion/src/provider-adapter.ts`
- `packages/ingestion/test/provider-adapter.test.ts`
- `packages/ingestion/src/index.ts`

## Verifier-Required Supporting Files

- `packages/ingestion/src/projection.ts`
- `packages/ingestion/test/projection.test.ts`

## Evidence

- Claim created: `2026-07-05T17:24:33Z`.
- Claim commit: `6ab6bd6 chore: claim task 10`.
- Implementation started: `2026-07-05T17:24:33Z`.
- Red targeted test: `npm test -- packages/ingestion/test/provider-adapter.test.ts` failed as expected because `../src/provider-adapter.js` could not be resolved.
- Green targeted test: `npm test -- packages/ingestion/test/provider-adapter.test.ts` passed with 1 test file and 3 tests.
- Full verification: `npm run verify` passed with `typecheck passed`, 52 test files and 381 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.
- Code-quality repair red targeted test: `npm test -- packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts` failed with 5 regression failures proving omitted `approvedAt` retries conflicted, provider approvals were projected by non-composite `providerJobId`, actor credential-shaped labels were allowed, and media-type canonicalization/retry was missing.
- Code-quality repair green targeted test: `npm test -- packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/projection.test.ts` passed with 2 test files and 14 tests.
- Code-quality repair full verification: `npm run verify` passed with `typecheck passed`, 52 test files and 386 tests, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.

## Self-Review

- Scope stayed within the allowed Task 10 files.
- Provider batch approval appends only schema-valid `ingestion.provider.approved` events with policy `send-all-technically-eligible`.
- Approval is batch/job-level, tied to provider job, source collection, and import batch; it does not create per-file approvals.
- Provider approval events persist provider name/version, eligible media types, max file size, approver, and approval timestamp without credential-shaped data.
- `FakeDocumentAiProvider` is deterministic and local-only; it enforces supported media types and max bytes per file before returning fake parsed text.
- Provider parsing remains optional and does not change local parser behavior.
- Code-quality repair: omitted `approvedAt` retries now reuse the existing approval timestamp, eligible media types are stored as sorted unique values, provider approvals project under the same source/import/provider composite identity as service streams, and credential-shaped approval or actor fields are rejected before append without echoing secret values.
