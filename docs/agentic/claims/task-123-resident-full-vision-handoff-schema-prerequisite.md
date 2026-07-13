# Task 123 Shared Handoff Schema Prerequisite Claim

Plan: `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
Frozen authority: `docs/agentic/resident-agent-full-vision-contract-freeze.md` CF1-H-HANDOFF / W1-123
Task: serialized Lane H prerequisite for W1-123 ontology-bootstrap handoff adoption
Worker: Codex Task123 shared-handoff-schema prerequisite author
Branch: `codex/task-123-resident-full-vision-handoff-schema-prereq`
Worktree: `/home/drake/.codex/worktrees/task-123-resident-full-vision-handoff-schema-prereq`
Base: `3aa4df963633c16d9fb95e79fa30f5fc59e833a7`
Claimed-at: `2026-07-13T00:00:00Z`
Status: `ready-for-review`

## Exclusive Files

- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/test/specialist-runner-kernel.test.ts`
- `packages/agent/src/specialist-handoff-projection.ts`
- `packages/agent/test/specialist-handoff-projection.test.ts`
- this append-only claim

## Authorization And Boundary

- Coordinator-authorized serialized Lane H prerequisite after Task123's blocked claim `12d90f83678ee510f5c0b7b4af7a6ddf4973eab6` identified that the authoritative final-output selector rejects `ontology-bootstrap` before lifecycle append.
- Add only canonical `ontology-bootstrap` final-output schema authority to the existing validated final-output -> prepared -> recorded -> terminal readback lifecycle. Do not create a second handoff path.
- Preserve exact run/task/type/source/context/authority/provenance/artifact-hash bindings and fail closed on unknown, mismatched, cross-run, or missing final-output schemas.
- No bootstrap workflow, manifest, ontology, provider, tool, graph, PRR, external-effect, CF-1 documentation, or `neo` changes are authorized.
- `superpowers:subagent-driven-development`, TDD, verification-before-completion, fresh independent review, and no self-integration are explicitly authorized.

## Required Evidence

- RED/GREEN: `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`.
- Before the implementation commit: `git diff --check`, `npm run factory:check`, and one coordinator-cleared retained `npm run verify`.
- Stop after a scoped commit for a fresh independent review.

## Coordinator Scope Recovery — 2026-07-13

- Initial RED evidence: the focused kernel-plus-projection command exited `1`
  with 1 failing and 70 passing tests because the kernel's authoritative
  final-output selector rejects `ontology-bootstrap` before append.
- A direct boundary audit found the projection independently returns no schema
  authority for the same run type. Since `recordSpecialistHandoff` validates
  its prepared -> recorded readback through that projection, a kernel-only
  mapping would leave the canonical lifecycle inconsistent.
- Coordinator scope recovery explicitly adds only
  `packages/agent/src/specialist-handoff-projection.ts` and
  `packages/agent/test/specialist-handoff-projection.test.ts` to this serialized
  Lane H prerequisite. The atomic Green requirement is a matching canonical
  ontology-bootstrap schema authority in both kernel and projection, full
  final-output -> prepared -> recorded -> terminal readback, and fail-closed
  mismatch, cross-run, missing-artifact, and missing-provenance counterfactuals.

## GREEN And Verification Evidence — 2026-07-13

- The expanded RED first produced 2 failing and 70 passing tests: the kernel
  rejected ontology-bootstrap before append and the projection classified its
  canonical fixture as inconsistent. The minimal Green makes the projection
  selector the one canonical source of final-output schema authority and the
  kernel consumes it for append and later readback validation.
- Focused Green command:
  `npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts`
  exited `0` with 2 files and 72 tests passing. It covers a complete
  ontology-bootstrap final-output -> prepared -> recorded -> terminal -> task
  completion chain and fails closed on schema mismatch, cross-run output,
  missing material, and missing provenance.
- `git diff --check` and `npm run factory:check` exited `0`.
- Coordinator-cleared retained `npm run verify` exited `0`: typecheck passed;
  190 test files passed and 3 skipped; 2,254 tests passed and 5 skipped;
  Vite production build passed; factory readiness passed.
- Candidate is ready for a fresh independent read-only review. No
  self-integration or `neo` merge occurred.
