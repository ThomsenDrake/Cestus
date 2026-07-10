# Task 6 Claim: Operational Context Pack Readiness

Plan: `docs/superpowers/plans/2026-07-10-operational-context-packs-implementation.md`

Task heading: `Task 6: Final Verification And Runtime Integration Handoff`

Worker identity: Codex

Branch: `codex/operational-context-packs-spec`

Worktree: `/home/drake/.codex/worktrees/a559/Cestus`

Claimed at: `2026-07-10T00:00:00Z`

Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-6-operational-context-pack-readiness.md`
- `.superpowers/sdd/task-6-report.md` (scratch execution report, intentionally untracked)

## Scope And Constraints

This is final evidence and runtime-integration handoff only. It does not edit
package source or tests unless a final gate exposes a real issue requiring a
scoped repair.

Files intentionally not edited by this lane:

- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-prompt-artifacts.ts`
- `packages/agent/src/cockpit.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- UI adapters and components

## Required Gates

- Final targeted: `npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/specialist-readiness.test.ts`
- Full verification: `npm run verify`
- Whitespace: `git diff --check`

## Acceptance Fixture And Runtime Handoff

Acceptance fixture verified by the final targeted suite:

- The sentinel fact is exactly `payload_sentinel_case_budget_review_window_42`.
- The sentinel appears in `ResolvedContextPack.payload` and does not appear in
  `ContextPackRef.safeSummary`, descriptor labels, omission summaries,
  readiness summaries, diagnostics, or public logs.
- The sentinel payload fixture passes only through the parser for its exact
  context-pack ID/version. A ref-only fixture is rejected by
  `assertResolvedContextPacksForExecution()`, while the matching resolved
  envelope is accepted.
- A forged serialized `parserVerification: "ok"` marker does not create
  execution authority; the registry-owned exact parser path remains required.
- The prompt-template/prompt-runner lane must consume this fixture in its
  production or live-provider acceptance test and prove that provider-visible
  prompt text can observe the sentinel payload fact.

## Runtime Integration Handoff

The later local-runtime/cockpit integration must adapt authoritative
local-runtime state into an `OperationalContextPackProvider`. It may use
`buildAgentProjection(await ledger.readAll())` today, but must immediately
produce bounded `OperationalTaskRunHistorySnapshot` and
`OperationalAgentMemorySnapshot` windows with source high-water marks, total
counts, deterministic ordering/cursor/window metadata, and aggregate
omissions.

That adapter supplies caller-owned `generatedAt`, `scope`, `policyVersion`, and
`sizeBudgets`. The integration task registers a restart-safe
`ContextPackPayloadResolver` or content-addressed payload store and calls
`registry.buildResolved(id)` for provider execution. It registers exact
pack-specific parsers for every operational, PRR, evidence, graph, governance,
jurisdiction, timeline, and contradiction pack ID/version it resolves.

The integration task calls `buildOperationalContextPackReadinessInputs(provider)`
and passes its `contextPackRefs` and `currentProjectionHighWaterMarks` to the
existing specialist readiness/cockpit integration points. It passes its
`resolvedContextPacks`, or equivalent resolver capability, to the prompt lane,
and composes these operational refs/envelopes with the PRR, evidence, graph,
governance, jurisdiction, timeline, and contradiction refs/envelopes from their
package-owned lanes.

Specialist execution remains disabled until the prompt-template, handoff, and
workflow-runner lanes consume resolved envelopes and are separately approved.

## Final Verification Evidence

- Final targeted command passed: `npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/specialist-readiness.test.ts` with 4 files and 102 tests.
- Full verification passed: `npm run verify` exited 0 after `typecheck passed` and the repository test suite.
- Whitespace check passed: `git diff --check`.
- No package source, test, local-runtime, cockpit, prompt-runner, UI, PRR,
  evidence, graph, or orchestrator files were edited by this lane.
