# Task 5 Claim: Agent Runtime Core

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 5: Agent Runtime Core
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T17:07:55Z
Status: in-progress

Owned files:
- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/runtime.test.ts`
- `docs/agentic/claims/task-5-agent-runtime-core.md`

Targeted commands:
- `npm test -- packages/agent/test/runtime.test.ts`
- `npm test -- packages/agent/test/runtime.test.ts packages/agent/test/provider.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/projection.test.ts`
- `npm run verify`

Invariant notes:
- Preserve append-only ledger semantics: runtime methods must append `agent.*` lifecycle events only and must not mutate projections or maintain hidden durable state.
- Preserve projection rebuildability: status must rebuild from `EventLedger.readAll()` and provider descriptors, without writing status events.
- Preserve human gates: runtime and gateway surfaces must not approve provider byte transfer, PRR sends, legal escalation, export, repair, or accepted graph review.
- Preserve provider boundaries: fake/local providers execute behind resident-agent model invocation events; no live provider adapter, network call, or secret-store access belongs in this task.
- Preserve secret safety: diagnostics, result DTOs, credential references, provider failures, and claim evidence must not contain raw credentials, environment variable names, bearer material, or raw provider error text.
- Preserve ontology truth boundaries: runtime task, run, and model invocation events must not append accepted assertions, resolved entities, relationships, PRR send events, legal escalation events, export events, repair events, or legacy-derived accepted graph state.
- Preserve portable workspace compatibility: behavior must remain deterministic, local-only, replayable from ledger events, and browser-safe for later runtime and UI surfaces.
