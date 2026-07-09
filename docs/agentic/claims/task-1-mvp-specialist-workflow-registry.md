# Task 1 Claim: MVP Specialist Workflow Registry

Plan: `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
Task: Task 1: Pure Specialist Workflow Registry
Worker: Codex GPT-5
Branch: `codex/mvp-specialist-workflows-plan`
Worktree: `/home/drake/.codex/worktrees/d901/Cestus`
Claimed-at: 2026-07-09T01:04:58Z
Status: claimed

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
