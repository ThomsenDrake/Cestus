# Task 113 Claim: Resident Full-Vision Wave 0B Proactive-Triggers Implementation Plan

- Approved Lane T specification:
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md@9a571f628bef9c53725e20263cb687ec44dd9cd8`.
- Governing implementation plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Task and lane: Task 113 / T / Wave 0B implementation-plan work order.
- Status: claimed.
- Worker: Codex Task 113 proactive-triggers implementation-plan author.
- Branch: `codex/task-113-resident-full-vision-w0-trigger-plan`.
- Worktree:
  `/home/drake/.codex/worktrees/task-113-resident-full-vision-w0-trigger-plan`.
- Base commit: `f6c8337481ce79a073de8f592544e42230a61304`.
- Claimed at: `2026-07-13T00:38:00Z`.
- Model configuration: GPT-5.6 Terra / Extra High; the coordinator/user has
  confirmed that reported GPT-5 satisfies this required configuration.

## Scoped Authorization

The coordinator-issued authorization names the exact approved Lane T
specification and governing plan above, permits Task 113 only, and stops after
one verified plan-and-claim commit, fresh plan review, and coordinator
lane-plan approval. It explicitly authorizes
`superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
fresh review, and verification-before-completion.

This work order does not authorize Task 118 or Tasks 149--151, production
code, shared-contract freezing, CF-1, provider or Nous use, a task dispatch,
or a merge into an integration branch or `neo`. The author does not
self-approve or self-merge.

## Ownership

- Create:
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
- Create and update:
  `docs/agentic/claims/task-113-resident-full-vision-w0-trigger-plan.md`.

Every other tracked file is forbidden, including production, test, runtime,
UI, provider, specification, registry, acceptance-matrix, template, and
shared-contract files. The written plan may reserve future Lane T production
and test files only after CF-1 assigns their canonical contracts.

## Required Plan Evidence

- RED: a reproducible documentation audit must fail while the owned plan is
  absent, or while it lacks file ownership, frozen interfaces, deterministic
  fingerprint/dedupe/admission-scope/gate-key behavior, mounted atomic
  readback/replay, cooldown/budget/high-water rules, no-effect proof, trigger
  family adapters, secret-safe diagnostics, failure injection, rebase/review,
  rollback, and acceptance gates.
- GREEN: the same audit, `git diff --check`, and `npm run factory:check` must
  pass after the plan is written.
- Full verification: `npm run verify` must pass before the plan commit.
- Fresh review: a different reviewer must lead with defects, missing tests,
  ownership conflicts, interface drift, and unsafe merge order.

## Initial Handoff

This claim is committed before the implementation-plan document. The final
forward update records the actual RED/GREEN commands and outputs, full
verification, self-review, and review handoff. A repeated verifier failure,
schema/file-owner conflict, fallback-storage risk, credential need, or data
loss risk is returned to the coordinator; repair-count exhaustion is a
coordinator recovery checkpoint, not a user gate.
