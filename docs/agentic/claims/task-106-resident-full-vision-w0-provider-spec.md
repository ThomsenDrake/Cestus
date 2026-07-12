# Task 106 Claim: Resident Full-Vision Wave 0A Provider and Credentials Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 106 / P / Wave 0A
- Status: claimed
- Branch: `codex/task-106-resident-full-vision-w0-provider-spec`
- Worktree: `/home/drake/.codex/worktrees/task-106-resident-full-vision-w0-provider-spec`
- Base commit: `52bc6b6dc81373d6026e7465becde75bd1c6448e`
- Claimed at: `2026-07-12T20:47:29Z`
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task

## Authorization and Scope

The coordinator-issued scoped authorization under the Standing Coordinator
Delegation authorizes Task 106 only: a Lane P Wave 0A specification, its
documentation RED/GREEN evidence, fresh review, and verification-before-
completion. It authorizes use of
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 114 or later, a Lane P
implementation plan, production code, tests, runtime, UI, registry, shared
contract, provider configuration, or a merge into `neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md`
- `docs/agentic/claims/task-106-resident-full-vision-w0-provider-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: record a reproducible coverage audit that fails while
  the required provider and credential architecture is absent.
- Documentation GREEN: run the same audit after writing the specification,
  then run `git diff --check` and `npm run factory:check`.
- Full verification: run `npm run verify` before the task documentation
  commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: one committed Lane P specification and claim, then wait for fresh
  review and written coordinator P-spec approval. Do not create Task 114,
  dispatch a worker, or start implementation planning.

## Governing Invariants

- Cestus retains the one resident identity `agent_default`; providers,
  harnesses, subscriptions, credentials, and local models are backends only.
- Preserve append-only ledger semantics, exact provenance, rebuildable
  projections, independently governed approval consumption, mounted-workspace
  authority, and durable handoff readback.
- Keep secrets outside the portable workspace; durable portable state contains
  typed secret-free references only. No internal fallback ledger, projection,
  artifact, derivative, or secret store may be used when the mounted workspace
  is unavailable or fails identity verification.
- Remote prompt or evidence-byte transfer is approved against the exact
  audited boundary and revalidated independently at consumption. Provider
  adapters cannot self-approve or broaden provider, credential, budget,
  approval, or data-transfer policy.
- Diagnostics, readiness DTOs, prompts, claims, live evidence, and provider
  feasibility records remain secret-safe. Unofficial token, cookie, browser
  storage, CLI-auth-store, or session extraction is forbidden.
- Deterministic tests remain credential-free. Real approved Nous is the
  required live-provider reference gate where provider behavior is accepted.
- Newsroom/team scope, multi-user authorization, shared hosting, and
  autonomous external effects remain out of scope.
