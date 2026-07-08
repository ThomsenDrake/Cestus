# Task 1 Claim: Context Pack And Prompt Artifact Contracts

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 1: Context Pack And Prompt Artifact Contracts`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: `/home/drake/.codex/worktrees/9b6b/Cestus`

Claimed at: `2026-07-08T13:38:45Z`

Status: `claimed`

Owned files:

- `docs/agentic/claims/task-1-agent-prompt-artifacts.md`
- `packages/agent/src/prompt-artifacts.ts`
- `packages/agent/test/prompt-artifacts.test.ts`
- `packages/agent/src/context-packs.ts`
- `packages/agent/test/context-packs.test.ts`
- `packages/agent/src/index.ts`

Targeted commands:

- RED: `npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts`
- GREEN: `npm test -- packages/agent/test/prompt-artifacts.test.ts packages/agent/test/context-packs.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Prompt artifact DTO safety conflicts with existing context-pack normalization.
- A prompt artifact needs raw evidence text without explicit `provider-byte-transfer` approval.
- Any need to weaken append-only ledger semantics, provenance requirements, projection rebuildability, provider-transfer approval gates, legal locks, or secret-safety boundaries.
