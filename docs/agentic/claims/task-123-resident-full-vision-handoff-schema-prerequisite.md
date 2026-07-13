# Task 123 Shared Handoff Schema Prerequisite Claim

Plan: `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
Frozen authority: `docs/agentic/resident-agent-full-vision-contract-freeze.md` CF1-H-HANDOFF / W1-123
Task: serialized Lane H prerequisite for W1-123 ontology-bootstrap handoff adoption
Worker: Codex Task123 shared-handoff-schema prerequisite author
Branch: `codex/task-123-resident-full-vision-handoff-schema-prereq`
Worktree: `/home/drake/.codex/worktrees/task-123-resident-full-vision-handoff-schema-prereq`
Base: `3aa4df963633c16d9fb95e79fa30f5fc59e833a7`
Claimed-at: `2026-07-13T00:00:00Z`
Status: `in-progress`

## Exclusive Files

- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`
- this append-only claim

## Authorization And Boundary

- Coordinator-authorized serialized Lane H prerequisite after Task123's blocked claim `12d90f83678ee510f5c0b7b4af7a6ddf4973eab6` identified that the authoritative final-output selector rejects `ontology-bootstrap` before lifecycle append.
- Add only canonical `ontology-bootstrap` final-output schema authority to the existing validated final-output -> prepared -> recorded -> terminal readback lifecycle. Do not create a second handoff path.
- Preserve exact run/task/type/source/context/authority/provenance/artifact-hash bindings and fail closed on unknown, mismatched, cross-run, or missing final-output schemas.
- No bootstrap workflow, projection, manifest, ontology, provider, tool, graph, PRR, external-effect, CF-1 documentation, or `neo` changes are authorized.
- `superpowers:subagent-driven-development`, TDD, verification-before-completion, fresh independent review, and no self-integration are explicitly authorized.

## Required Evidence

- RED/GREEN: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
- Before the implementation commit: `git diff --check`, `npm run factory:check`, and one coordinator-cleared retained `npm run verify`.
- Stop after a scoped commit for a fresh independent review.
