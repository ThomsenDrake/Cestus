# Task 6 Legacy Operator CLI Claim

- Plan: `docs/superpowers/plans/2026-07-06-legacy-cestus-operator-cli-implementation.md`
- Task: Task 6: Wire Legacy Commands Through CLI And Executable
- Worker: Codex
- Branch: `codex/legacy-import-operator-cli`
- Worktree: `/home/drake/.codex/worktrees/5738/Cestus`
- Claimed at: 2026-07-06T23:19:17Z
- Status: claimed

## Owned Files

- `docs/agentic/claims/task-6-legacy-operator-cli.md`
- `packages/ingestion/test/legacy-cli-workflow.test.ts`
- `packages/ingestion/src/cli-runner.ts`
- `packages/ingestion/src/cli.ts`
- `packages/ingestion/bin/cestus-ingest.mjs`
- `package.json`

## Verification

- Pending: `npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts`
- Pending: `npm test -- packages/ingestion/test/legacy-cli-workflow.test.ts packages/ingestion/test/legacy-cli.test.ts packages/ingestion/test/cli.test.ts`
- Pending: `npm run ingestion:help`
- Pending: `npm run verify`
