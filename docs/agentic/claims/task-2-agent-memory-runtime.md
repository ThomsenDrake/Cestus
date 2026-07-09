# Task 2 Claim: Append-Only Memory Runtime Methods

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 2: Append-Only Memory Runtime Methods`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T01:30:16Z`

Status: `ready-for-review`

Owned files:

- `packages/agent/src/runtime.ts`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/test/memory-runtime.test.ts`
- `packages/agent/test/runtime.test.ts`
- `docs/agentic/claims/task-2-agent-memory-runtime.md`

Targeted commands:

- `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
- `npm run verify`

Stop conditions:

- Runtime memory methods would append accepted graph, entity resolution, relationship acceptance, PRR send, export, lock-clearing, repair, provider byte transfer, or legacy-source mutation events.
- Runtime memory reads would append ledger events instead of deriving DTOs from rebuilt projection state.
- Recording can proceed without source event IDs or artifact hashes.
- Supersession or retraction would mutate an old event instead of appending new events.
- Append ordering cannot be made optimistic-concurrency safe without weakening ledger semantics.

Command evidence:

- RED:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Observed failure: `TypeError: runtime.recordMemory is not a function`
- GREEN:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Result: `Test Files  3 passed (3)` and `Tests  26 passed (26)`
- VERIFY:
  - First `npm run verify` hit a flaky unrelated failure in `packages/ui/test/agent-app-integration.test.tsx` (`denies provider byte-transfer previews through the Agent adapter only`); direct rerun of that test passed.
  - Second `npm run verify` passed with `Test Files  145 passed | 1 skipped (146)`, `Tests  1385 passed | 1 skipped (1386)`, `tests passed`, and `factory-readiness passed`.

Fix-pass evidence after review:

- RED:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Observed failures:
    - `rejects operator preference memory from agent actors without appending a memory event`
    - `retracts the replacement memory if supersession fails after the replacement append`
- GREEN:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Result: `Test Files  3 passed (3)` and `Tests  28 passed (28)`
- VERIFY:
  - `npm run verify`
  - Result: `Test Files  145 passed | 1 skipped (146)`, `Tests  1387 passed | 1 skipped (1388)`, `tests passed`, and `factory-readiness passed`

Invariant notes:

- Runtime memory is a resident-agent aid only, not an ontology authority.
- Memory may guide later work, but factual graph effects still require evidence-backed proposed assertions or reviewed reasoning through normal gates.
- `listMemory` and `memoryDetail` rebuild from ledger events and return DTOs without appending runtime writes.
- Runtime mutations append only `agent.memory.recorded`, `agent.memory.superseded`, and `agent.memory.retracted`; no ontology-truth, PRR send, export, lock-clearing, repair, provider byte transfer, or legacy-source mutation events were added.
- Recording relies on ontology event validation for provenance and secret-safe summaries, and runtime failures return generic safe diagnostics.
- `operator-preference` memory is restricted to `human` runtime actors; agent attempts fail with a generic safe diagnostic before any memory event is appended.
- Supersession now compensates with `agent.memory.retracted` on the replacement stream if the original-memory `agent.memory.superseded` append fails after the replacement commit, preventing both memories from remaining active.

Second fix-pass evidence after re-review:

- RED:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Observed failures:
    - `rejects agent supersession of a human-created operator preference without appending mutation events`
    - `rejects agent retraction of a human-created operator preference without appending mutation events`
- GREEN:
  - `npm test -- packages/agent/test/memory-runtime.test.ts packages/agent/test/runtime.test.ts packages/agent/test/memory.test.ts`
  - Result: `Test Files  3 passed (3)` and `Tests  30 passed (30)`
- VERIFY:
  - `npm run verify`
  - Result: `Test Files  145 passed | 1 skipped (146)`, `Tests  1389 passed | 1 skipped (1390)`, `tests passed`, and `factory-readiness passed`

Second fix-pass notes:

- `supersedeMemory()` now rejects non-human actors when the projected existing memory is `operator-preference`, even if the replacement command uses another memory kind.
- `retractMemory()` now rejects non-human actors when the projected existing memory is `operator-preference`, before any `agent.memory.retracted` append can occur.
- Denied agent supersede and retract attempts leave the ledger unchanged beyond the original human-created preference memory events.
