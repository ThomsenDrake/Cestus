# Task 107 Claim: Resident Full-Vision Wave 0A Cockpit Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 107 / U / Wave 0A
- Worker: Codex Task 107 cockpit specification author
- Branch: `codex/task-107-resident-full-vision-w0-cockpit-spec`
- Worktree: `/home/drake/.codex/worktrees/task-107-resident-full-vision-w0-cockpit-spec`
- Base commit: `e3fd8533fe4d49690a45a2ab2261f8ce62ca4396`
- Claimed at: `2026-07-12T22:00:00Z`
- Host configuration: GPT-5.6 Terra / Extra High, confirmed by the coordinator
- Status: claimed

## Authorization And Scope

The coordinator-issued Standing Coordinator Delegation authorizes Task 107
only: this Lane U Wave 0A specification, its documentation RED/GREEN evidence,
fresh review, and verification-before-completion. It authorizes
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 115 or later, a Lane U
implementation plan, production or test code, shared contracts, a registry
change, provider invocation, or a merge into `neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md`
- `docs/agentic/claims/task-107-resident-full-vision-w0-cockpit-spec.md`

Every other tracked repository file is forbidden.

## Governing Invariants

- Preserve the single resident identity `agent_default`; providers,
  subscriptions, credential references, and specialist modes are backends or
  task modes, never resident identities.
- Preserve append-only ledger semantics, exact provenance, rebuildable
  projections, independent-human approval consumption, and durable handoff
  readback from the authoritative mounted workspace.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. A disconnect or identity mismatch permits no
  internal fallback ledger, projection, artifact, derivative, or secret write.
- Browser values are strict, browser-safe, secret-safe DTOs parsed from
  authoritative runtime projections. React has no canonical execution state
  and no hidden execution controls.
- Controls may invoke only explicit, supported runtime commands whose labels
  state their durable effect. They cannot self-approve, bypass current locks,
  consume stale approvals, broaden a tool/provider/budget policy, or perform
  an external or irreversible effect.
- Newsroom/team scope, multi-user authorization, shared hosting, and
  autonomous send, escalation, export, publication, destructive repair,
  disclosure, or accepted-graph mutation are out of scope.

## Required Evidence And Stop Point

- Documentation RED: a reproducible focused coverage audit fails while the
  cockpit specification is absent or lacks runtime truth, safe commands,
  provider setup, durable handoffs, viewport and tailnet requirements,
  strict DTO/parser rules, ownership, failure, and acceptance coverage.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` pass after the specification is complete.
- Full verification: `npm run verify` passes before the Task 107
  documentation commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit this claim and one Lane U specification, then stop for fresh
  coordinator review and written U-spec approval. Do not create Task 115,
  dispatch an implementation worker, or merge.
