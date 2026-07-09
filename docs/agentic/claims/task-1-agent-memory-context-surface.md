# Task 1 Claim: Memory DTOs And Context Pack Contract

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 1: Memory DTOs And Context Pack Contract`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T01:01:35Z`

Status: `ready-for-review`

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

Command evidence:

- RED: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
  - Observed expected failures before implementation: `Cannot find module '../src/memory.js'`, `buildAgentMemorySummaryContextPack is not a function`, `memoryKind` missing from projection output, and `agent.memory.recorded` rejected `memoryKind`.
- GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
  - Passed: `Test Files  4 passed (4)` and `Tests  70 passed (70)`.
- VERIFY: `npm run verify`
  - `typecheck passed`
  - Known unrelated failure only: `packages/workspace-ops/test/cli.test.ts` timed out in the aggregate run after ~58s.
- REPRO: `npm test -- packages/workspace-ops/test/cli.test.ts`
  - Passed targeted repro: `Test Files  1 passed (1)` and `Tests  20 passed (20)`.

Invariant notes:

- Resident-agent memory remains visible working memory only and is explicitly marked non-authoritative for ontology truth in DTOs and context packs.
- Memory recording still requires `sourceEventIds` or `artifactHashes`; append-only supersession and retraction continue to add new events rather than mutate prior memory.
- Memory summary context packs stay source-linked, budgeted, stable-hashed, and raw-content-free.
- Projection output now captures `memoryKind`, `recordedBy`, and `recordedByKind` so browser-safe consumers can explain provenance without granting memory any graph authority.
- Verifier-required support edits updated UI memory DTO parsing/fixtures only; no route or UI surface gained authority to accept assertions, resolve entities, send PRRs, export material, clear locks, transfer provider bytes, execute repair, or mutate source trees.
