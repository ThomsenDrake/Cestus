# Task 1 Report: Memory DTOs And Context Pack Contract

Status: `DONE_WITH_CONCERNS`

Branch: `codex/resident-agent-memory-context-plan`

Task scope:

- Added `memoryKind` support to `agent.memory.recorded` while preserving existing stream routing and provenance requirements.
- Extended resident-agent memory projection output with `memoryKind`, `recordedBy`, and `recordedByKind`.
- Added pure DTO builders for memory list/detail and `agent-memory-summary.v1` context packs.
- Exported the new DTO surface through `packages/agent`.

RED evidence:

- Command: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
- Observed failures:
  - `Cannot find module '../src/memory.js'`
  - `buildAgentMemorySummaryContextPack is not a function`
  - `memoryKind` missing from projected memory
  - `agent.memory.recorded` rejected `memoryKind`

GREEN evidence:

- Command: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/projection.test.ts packages/agent/test/memory.test.ts packages/agent/test/context-packs.test.ts`
- Result:
  - `Test Files  4 passed (4)`
  - `Tests  70 passed (70)`

Verify evidence:

- Command: `npm run verify`
- Result:
  - `typecheck passed`
  - Aggregate test run hit the known unrelated timeout in `packages/workspace-ops/test/cli.test.ts`:
    - `runs real executable detect and verify commands against a canonical workspace`
    - `blocks existing zero-byte ledgers without mutating the file or leaking raw SQLite errors`
  - Failure mode matched the brief’s allowed concern: `Error: Test timed out in 5000ms.`

Workspace-ops repro evidence:

- Command: `npm test -- packages/workspace-ops/test/cli.test.ts`
- Result:
  - `Test Files  1 passed (1)`
  - `Tests  20 passed (20)`

Invariant notes:

- Memory remains resident-agent working memory, not accepted ontology truth.
- Memory list/detail DTOs and the memory summary context pack expose a machine-readable truth boundary that requires evidence-backed proposed assertions or reviewed reasoning for any graph effect.
- Memory summaries remain source-linked, stable-hashed, budgeted, and raw-content-free.
- Supersession and retraction remain append-only projection updates over durable event history.
- Support edits outside the listed task files were limited to verifier-driven UI memory schema/fixture alignment with the stricter projected memory contract.
