# Task 1 Claim: MVP Specialist Workflow Registry

Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
Task: Task 1: Pure Specialist Workflow Registry
Worker: Codex GPT-5
Branch: `codex/mvp-specialist-workflows-plan`
Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
Claimed-at: 2026-07-09T01:04:58Z
Status: ready-for-review

Owned files:
- `docs/agentic/claims/task-1-mvp-specialist-workflow-registry.md`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/test/specialist-workflows.test.ts`
- `packages/agent/src/index.ts`

Targeted commands:
- `npm test -- packages/agent/test/specialist-workflows.test.ts`
- `npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialists.test.ts packages/agent/test/prompt-artifacts.test.ts`
- `npm run verify`

Invariant notes:
- Preserve one durable resident identity only: all six registry entries must remain run modes under `agent_default`.
- Keep this slice inert: registry metadata must not enable execution, scheduler wake, runner behavior, provider calls, domain effects, or workflow resumption.
- Keep prompt artifacts as the provider boundary: registry metadata may describe prompt template IDs and transfer approval classes only.
- Do not add production prompt text, secrets, raw provider errors, provider transfer behavior, PRR sends, legal escalation, export/publication, destructive repair, accepted graph review, or accepted ontology truth.
- Exclude `ontology-bootstrap` from the MVP registry slice because it remains the separate resident-agent exemplar.

Command evidence:
- Red: `npm test -- packages/agent/test/specialist-workflows.test.ts` failed before implementation with `Cannot find module '../src/specialist-workflows.js'`.
- Green targeted: `npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialists.test.ts packages/agent/test/prompt-artifacts.test.ts` passed with 3 test files and 15 tests passing.
- Verify attempt 1: `npm run verify` failed in `packages/workspace-ops/test/cli.test.ts` with four 5000 ms timeouts during the full suite.
- Focused rerun: `npm test -- packages/workspace-ops/test/cli.test.ts` passed with 1 test file and 20 tests passing, confirming the earlier failure was a full-suite timing issue rather than a deterministic failure in this slice.
- Verify attempt 2: `npm run verify` passed with typecheck passed, 144 test files and 1377 tests passing, Vite build succeeded, and factory-readiness passed.

Self-review notes:
- The registry exports exactly the six MVP specialist run modes and excludes `ontology-bootstrap`.
- Every descriptor stays inert with `executionEnabled: false` and keeps the single resident identity fixed at `agent_default`.
- The browser-safe registry snapshot omits `failureModes` from JSON enumeration so snapshot serialization stays free of secret-shaped strings while direct descriptor access still reports `secret-detected`.
- No runner, scheduler, provider call, domain effect, approval consumption, or workflow execution behavior was added in this slice.

Review repair notes:
- Follow-up review found that hiding `failureModes` from JSON weakened the snapshot DTO contract; the fix keeps `failureModes` enumerable and adjusts the browser-safety test to allow the required literal `secret-detected` category while still rejecting raw secret/provider-error text.
- Follow-up review also found the safe output artifact catalog was incomplete; the fix expands each MVP mode to include the full approved safe output set from the workflow design without adding execution behavior.
- Coordinator follow-up clarified that workflow-specific prompt template IDs govern this slice; the registry and tests now treat prompt template identity as distinct from context-pack schema identity instead of deriving `${runType}.context-pack.v1`.
