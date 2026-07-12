# Task 105 Claim: Resident Full-Vision Wave 0A Proactive Trigger Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 105 / T / Wave 0A
- Status: claimed
- Branch: `codex/task-105-resident-full-vision-w0-trigger-spec`
- Worktree: `/home/drake/.codex/worktrees/task-105-resident-full-vision-w0-trigger-spec`
- Base commit: `52bc6b6dc81373d6026e7465becde75bd1c6448e`
- Claimed at: `2026-07-12T21:00:00Z`
- Worker: Codex Task 105 Lane T specification author
- Host configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user

## Authorization and Scope

The coordinator-issued scoped authorization under the Standing Coordinator
Delegation authorizes Task 105 only, including documentation RED/GREEN, fresh
review, and verification-before-completion. It does not authorize a lane
implementation plan, Task 113 or later work, production code, tests, runtime,
UI, provider, shared-contract, registry, or program-plan changes. Do not merge
into `neo` or an integration branch.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md`
- `docs/agentic/claims/task-105-resident-full-vision-w0-trigger-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: a reproducible coverage audit must fail until the T
  specification defines durable, deduplicated task requests; dedupe, cooldown,
  high-water, budget, and source-provenance rules; no-prompt/no-effect
  boundaries; safe single-resident adoption; mounted-workspace/no-fallback,
  approval, handoff, diagnostics, ownership, and failure-injection boundaries.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` must pass after the specification is written.
- Full verification: `npm run verify` must pass before the scoped task commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit the T specification and this claim, then wait for fresh
  coordinator review and written T-spec approval. Do not create a lane
  implementation plan or start Task 113.

## Invariants

- Preserve one resident identity (`agent_default`), append-only ledger,
  exact provenance, rebuildable projections, independently governed approval
  consumption, durable handoff readback, mounted-workspace authority, and
  secret-safe diagnostics.
- Trigger evaluation contains no prompt text or model invocation and performs
  no domain, tool, provider, approval, artifact, ontology, projection, or
  external effect; it may append only a validated trigger request to the
  authoritative mounted ledger after its dedupe/cooldown/budget checks.
- Workspace absence, stale identity, mount swap, stale source, or unreadable
  authoritative state permits no internal fallback ledger, projection,
  derivative, artifact, or trigger-state write.
- Shared event names, DTO versions, capability signatures, and production file
  ownership remain pre-CF-1 proposals; Task 117 alone freezes them. Newsroom,
  team, multi-user, shared-hosting, and organization authorization scope is
  excluded.

## Claim Commit

This claim is intentionally committed before any Task 105 specification edit.
The next claim update records the reproducible RED/GREEN evidence, self-review,
verification, and review handoff.
