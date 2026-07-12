# Task 101 Claim: Resident Full-Vision Wave 0 Runtime Composition Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md` at `811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task: Task 101 / Lane R — Runtime Composition specification
- Worker: Codex Task 101 runtime-composition specification author
- Task thread: `019f56d2-eb3b-7293-b7b9-bf0329f604b9`
- Branch: `codex/task-101-resident-full-vision-w0-runtime-spec`
- Worktree: `/home/drake/.codex/worktrees/6bb5/Cestus`
- Base commit: `bb41ee02d7061f838917d378bccf17a6a6ad9e80`
- Claimed at: `2026-07-12T19:54:56Z`
- Model configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user
- Status: claimed

## Ownership

- Create: `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md`
- Create: `docs/agentic/claims/task-101-resident-full-vision-w0-runtime-spec.md`

Every other tracked repository file is forbidden, including production, test,
runtime, UI, provider, shared-contract, implementation-plan, program-control,
registry, and acceptance-matrix files. Only Lane R may later own
`packages/local-runtime/src/agent-runtime-factory.ts` and its
`createProductionAgentRuntimeCapabilities(...)` composition boundary.

## Authorization And Stop Conditions

The coordinator-issued scoped authorization permits only Task 101 using
`superpowers:subagent-driven-development` where relevant, documentation
RED/GREEN, fresh task review, and verification-before-completion. It requires
the governing documents above, prohibits any merge into `neo`, and stops after
one committed Lane R specification for a fresh coordinator review and written
R-spec approval. It does not authorize Task 109, an implementation plan,
production or test code, a worker dispatch, a contract-freeze change, or a
merge.

Stop and escalate for data-loss or fallback-storage risk, schema, vocabulary,
or ownership conflict, unavailable required dependency, unavailable assigned
model configuration, or repeated verifier failure.

## Required Evidence

- Documentation RED: a focused audit fails while the required R specification
  is absent or lacks the required mounted-context, prompt, provider-policy,
  runner, store, readiness, failure, provenance, ownership, dependency, and
  acceptance coverage.
- Documentation GREEN: the focused audit, `git diff --check`, and
  `npm run factory:check` pass after the specification is complete.
- Full verification: `npm run verify` passes before the specification commit.
- Completion: commit only this claim and the owned specification, then stop for
  a fresh coordinator review and written R-spec approval.
