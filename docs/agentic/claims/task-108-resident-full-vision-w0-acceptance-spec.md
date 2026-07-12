# Task 108 Claim: Resident Full-Vision Wave 0A Acceptance Architecture Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 108 / A / Wave 0A
- Worker: Codex Task 108 acceptance-architecture specification author
- Branch: `codex/task-108-resident-full-vision-w0-acceptance-spec`
- Worktree: `/home/drake/.codex/worktrees/task-108-resident-full-vision-w0-acceptance-spec`
- Base commit: `e165bb458c4bafd7b24baa8345a7871feeba8a9d`
- Claimed at: `2026-07-12T22:00:00Z`
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task
- Status: claimed

## Authorization and Scope

The coordinator-issued authorization under the Standing Coordinator Delegation
authorizes Task 108 only: a Lane A Wave 0A acceptance-architecture
specification, its documentation RED/GREEN evidence, fresh review, and
verification-before-completion. It authorizes
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 116 or later, an
implementation plan, acceptance-test implementation, provider invocation,
credential use, production/runtime/UI/shared-contract changes, or a merge into
`neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md`
- `docs/agentic/claims/task-108-resident-full-vision-w0-acceptance-spec.md`

Every other tracked file is forbidden, including the program registry and
acceptance matrix. This pre-CF-1 specification proposes acceptance interfaces
only: it does not freeze event names, DTO versions, capability signatures,
fixtures, commands, or ownership already assigned to another lane.

## Governing Invariants

- `agent_default` remains the sole resident identity; provider, model,
  credential, and harness values remain backends only.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. Disconnect or identity mismatch permits no internal
  fallback ledger, projection, artifact, derivative, or handoff write.
- Ledger history remains append-only; projections remain rebuildable; every
  handoff and terminal-looking outcome requires exact durable readback and
  provenance binding.
- Deterministic acceptance is credential-free. A real approved Nous provider
  gate is coordinator-only and records only safe IDs, hashes, event IDs,
  counts, categories, and fixed markers.
- Approval consumption remains independent and current; secret safety applies
  to all artifacts, diagnostics, DTOs, logs, live evidence, and fixtures.
- Newsroom/team scope, shared hosting, autonomous external effects, and
  implementation ownership outside Lane A are out of scope.

## Required Evidence and Stop Point

- Documentation RED: record a reproducible audit that fails while the
  acceptance architecture is absent or does not cover mounted storage, fresh
  process restart, failure injection, real approved Nous, browser DTO parity,
  served-checkout tailnet verification, ownership, and pre-CF-1 limits.
- Documentation GREEN: run the same audit after the specification is written,
  then run `git diff --check` and `npm run factory:check`.
- Full verification: run `npm run verify` before the Task 108 specification
  commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: one committed Lane A specification and claim, then stop for fresh
  review and written coordinator A-spec approval. Do not create Task 116,
  dispatch an implementation worker, or begin implementation planning.

## Documentation RED/GREEN Evidence

Documentation RED, GREEN, full-verification, self-review, and fresh-review
evidence are appended forward-only after the focused audit and scoped
specification commit. No claim status may imply lane approval or merge
readiness before the independent review verdict.
