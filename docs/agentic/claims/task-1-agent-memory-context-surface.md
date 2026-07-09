# Task 1 Claim: Memory DTOs And Context Pack Contract

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 1: Memory DTOs And Context Pack Contract`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T01:01:35Z`

Status: `in-progress`

Owned files:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/src/memory.ts`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/memory.test.ts`
- `packages/agent/test/projection.test.ts`
- `packages/agent/test/context-packs.test.ts`
- `docs/agentic/claims/task-1-agent-memory-context-surface.md`

Targeted commands:

- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
- `npm run verify`

Stop conditions:

- A memory contract path would allow memory to become accepted ontology truth.
- A context pack requires raw evidence bodies, credential names, secret-shaped values, or hidden state.
- A projection or DTO cannot be rebuilt from append-only ledger events.
- A schema change conflicts with existing resident-agent event contracts.
- Verification repeatedly fails after the same focused repair path.
