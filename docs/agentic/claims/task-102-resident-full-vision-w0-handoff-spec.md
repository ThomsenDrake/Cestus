# Task 102 Claim: Resident Full-Vision Wave 0A Durable Handoffs Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 102 / H / Wave 0A
- Status: ready-for-review
- Branch: `codex/task-102-resident-full-vision-w0-handoff-spec`
- Worktree: `/home/drake/.codex/worktrees/f3a3/Cestus`
- Base commit: `bb41ee02d30a0af5d85a467dc63fd501a7f9a165`
- Host configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user

## Authorization and Scope

The coordinator-issued scoped authorization from task thread
`019f56d2-eb3b-7293-b7b9-bf0329f604b9` authorizes Task 102 only, including
documentation RED/GREEN, fresh review, and verification-before-completion. It
does not authorize a merge into `neo`, a lane implementation plan, Task 109 or
later work, production code, tests, runtime, UI, provider, or shared-contract
changes.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md`
- `docs/agentic/claims/task-102-resident-full-vision-w0-handoff-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: record a pre-spec coverage audit that fails until the H
  specification defines the required lifecycle, mount, replay, DTO,
  failure-injection, ownership, and sequencing contracts.
- Documentation GREEN: `git diff --check` and `npm run factory:check`.
- Full verification: `npm run verify`.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit the lane specification and this claim, then wait for fresh
  coordinator review and written H-spec approval. Do not create a lane
  implementation plan or dispatch a worker.

## Invariants

- Preserve the append-only ledger, exact provenance bindings, rebuildable
  projections, independently governed external-effect approvals, one resident
  identity (`agent_default`), mounted-workspace authority, and secret-safe
  boundaries.
- A durable handoff is proved by ledger and artifact-store readback, never a
  returned DTO, in-memory state, a completed-run hash, or a blob-store scan.
- Workspace absence, stale identity, or mount swap permits no internal fallback
  ledger, artifact, derivative, or handoff write.

## Documentation RED/GREEN and Self-Review

- RED command: an inline Node coverage audit of
  `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md`
  requiring PRR, investigation, ontology, mounted-store, readback, browser DTO,
  terminal/resumable, no-fallback, secret, failure-injection, and merge/rebase
  coverage. Before the specification existed it exited 1 with `RED: durable
  handoff specification is absent`.
- GREEN command: the same coverage audit exited 0 with `GREEN: durable handoff
  coverage audit passed` after the specification was written.
- Self-review: no placeholders or unrelated scope; stable interface proposals
  are explicitly pre-freeze; ownership keeps W/R/L/P/U/A boundaries separate;
  replay remains ledger/artifact-readback-only; append-only, provenance,
  mounted-authority, no-fallback, and secret-safe requirements are explicit.
- Final checks: staged `git diff --check` exited 0 with no whitespace output;
  `npm run factory:check` exited 0 with `factory-readiness passed`; and
  `npm run verify` exited 0 after lockfile-pinned dependencies were restored by
  `npm ci --ignore-scripts` in the fresh worktree. No provider gate applies to
  this documentation-only task.
- Review and stop: fresh coordinator H-spec review and written H-spec approval
  are pending. This author does not self-approve, create Task 110, dispatch, or
  merge.
