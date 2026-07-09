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

Verifier-driven support files kept for schema/fixture alignment only:

- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`

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

Review-fix evidence:

- Root cause: `buildAgentMemorySummaryContextPack` fabricated fallback provenance with `agent-memory:none` when `projection.activeMemory` was empty, violating the requirement that summary packs rely on real `sourceEventIds` or `artifactHashes`.
- UI support inspection: `packages/ui/src/agent/agent-adapter.ts`, `packages/ui/test/agent-adapter.test.ts`, and `packages/ui/test/agent-workspace.test.tsx` only align browser DTO parsing/fixtures with stricter memory projection fields such as `memoryKind`; they do not add Task 4 memory routes, mutation controls, or new UI behavior.
- Added focused red/green coverage in `packages/agent/test/memory.test.ts` proving that `agent-memory-summary.v1` now fails closed when no active memory carries real provenance.
- Review-fix targeted command: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
  - RED after test addition: `packages/agent/test/memory.test.ts` failed because the builder returned a summary pack instead of throwing for zero active memory.
  - GREEN after the production fix: `Test Files  4 passed (4)` and `Tests  71 passed (71)`.
- Final verify: `npm run verify`
  - Passed: `typecheck passed`, `Test Files  144 passed | 1 skipped (145)`, `Tests  1380 passed | 1 skipped (1381)`, `tests passed`, Vite production build succeeded, and `factory-readiness passed`.

Second re-review fix evidence:

- Root cause 1: `buildAgentMemorySummaryContextPack` was appending `memory.eventIds` into `sourceEventIds`, causing memory lifecycle event IDs to masquerade as upstream source refs. The fix keeps `sourceEventIds` limited to replayed upstream `memory.sourceEventIds`, while `provenanceRefs` now carries the combined real source refs, memory lifecycle event IDs, and artifact hashes as separate provenance-only material.
- Root cause 2: `buildAgentMemoryDetail` inferred history row `eventType` values from terminal projected state. A memory that was first superseded and later retracted could therefore label the retraction row as another supersession. The fix adds typed `memoryHistoryEntries` during projection replay and has the detail DTO render from those recorded entries instead of reverse-inference.
- RED: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
  - Failed as expected with:
    - `packages/agent/test/memory.test.ts`: summary-pack `sourceEventIds` still included `evt_agent_memory_recorded_workspace_policy`
    - `packages/agent/test/memory.test.ts`: superseded-then-retracted detail history labeled the retraction row as `agent.memory.superseded`
    - `packages/agent/test/projection.test.ts`: projected memory had no typed history entries
- GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
  - Passed: `Test Files  4 passed (4)` and `Tests  72 passed (72)`.
- VERIFY: `npm run verify`
  - Passed: `typecheck passed`, `Test Files  144 passed | 1 skipped (145)`, `Tests  1381 passed | 1 skipped (1382)`, `tests passed`, Vite production build succeeded, and `factory-readiness passed`.
- Verifier-driven support-file scope remained narrow:
  - `packages/ui/src/agent/agent-adapter.ts`
  - `packages/ui/test/agent-adapter.test.ts`
  - `packages/ui/test/agent-workspace.test.tsx`
  - These edits only teach the browser adapter schema and fixtures about the new typed `memoryHistoryEntries` field required by the stricter projection contract. No routes, controls, or authority boundaries changed.
