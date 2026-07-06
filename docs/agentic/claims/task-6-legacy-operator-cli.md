# Task 6 Legacy Operator CLI Claim

- Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
- Task: Task 6: Wire Legacy Commands Through CLI And Executable
- Worker: Codex
- Branch: `codex/legacy-import-operator-cli`
- Worktree: `/home/drake/.codex/worktrees/5738/Cestus`
- Claimed at: 2026-07-06T23:19:17Z
- Status: ready-for-review

## Owned Files

- `docs/agentic/claims/task-6-legacy-operator-cli.md`
- `packages/ingestion/test/legacy-cli-workflow.test.ts`
- `packages/ingestion/src/cli-runner.ts`
- `packages/ingestion/src/cli.ts`
- `packages/ingestion/bin/cestus-ingest.mjs`
- `package.json`

## Verification

- Red: `npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts` failed with missing `normalizeIngestionCliArgs`, legacy help, and legacy command routing.
- Green: `npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts` passed 10 tests.
- Targeted: `npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts` passed 3 files / 21 tests.
- Help: `npm run ingestion:help` printed the legacy workflow, including `cestus ingest legacy inspect --workspace <root> --source <old-root>`.
- Full: `npm run verify` passed typecheck, 97 test files / 863 tests, UI build, and factory readiness.
