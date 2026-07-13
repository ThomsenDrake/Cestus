# Task 109 Claim: Resident Full-Vision Wave 0 Runtime-Composition Implementation Plan

- Approved Lane R specification: `docs/superpowers/specs/2026-07-12-resident-agent-runtime-composition-design.md` at `05e85392367964a3869a55832703f504dd0fe3da`
- Governing implementation plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `0b5726ec975bdc0aae97e540472ef3be4379b358`
- Task: Task 109 / Lane R — runtime-composition implementation plan
- Worker: Codex Task 109 runtime-composition implementation-plan author
- Task thread: `/root/task109_runtime_plan`
- Branch: `codex/task-109-resident-full-vision-w0-runtime-plan`
- Worktree: `/home/drake/.codex/worktrees/task-109-resident-full-vision-w0-runtime-plan`
- Base commit: `2d26a51f46c679c43ab519e21d0118e948289909`
- Claimed at: `2026-07-13T00:16:43Z`
- Model configuration: GPT-5.6 Terra / Extra High, user-confirmed; reported GPT-5 satisfies this configuration under the coordinator's standing direction
- Status: ready-for-review

## Ownership

- Create: `docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md`
- Create: `docs/agentic/claims/task-109-resident-full-vision-w0-runtime-plan.md`

Every other tracked repository file is forbidden, including production, test,
runtime, UI, provider, shared-contract, specification, template,
acceptance-matrix, and registry files. The plan must reserve
`packages/local-runtime/src/agent-runtime-factory.ts` and its default
production composition boundary exclusively for Lane R without authorizing any
production edit in this task.

## Authorization And Stop Conditions

The coordinator-issued scoped authorization names the approved Lane R
specification and governing implementation plan above and permits Task 109
only. It explicitly authorizes `superpowers:subagent-driven-development`,
documentation RED/GREEN as TDD, fresh review, and
verification-before-completion. The wave stop is one verified plan-and-claim
commit followed by fresh plan review and coordinator lane-plan approval.

This task does not authorize Task 118 or later production work, CF-1,
provider invocation, child dispatch, a shared-contract change, a merge into
any integration branch, or a merge into `neo`.

Stop and return structured evidence to the coordinator for a data-loss or
fallback-storage risk, a shared schema or file-owner conflict, unavailable
dependency, or repeated verifier failure. A repair-count limit is a
coordinator recovery checkpoint, not permission for a user gate.

## Required Evidence

- Documentation RED: the focused plan audit must fail while the Lane R plan is
  absent or lacks the file map, factory ownership, mounted context, exact
  prompt/provider posture, runner, distinct mounted stores, readiness,
  TDD snippets, rebase/review gates, live-Nous posture, rollback, and
  acceptance mapping.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` must pass after the plan is complete.
- Full verification: `npm run verify` must pass before the documentation
  commit.
- Completion: commit only this claim and the owned plan, then stop for a fresh
  Task 109 plan review and coordinator lane-plan approval. The author must not
  self-approve or merge.

## Documentation RED/GREEN Evidence

- RED: the focused `node --input-type=module` plan audit exited 1 while the
  plan was absent, printing `RED:
  docs/superpowers/plans/2026-07-12-resident-agent-runtime-composition-implementation.md
  is absent; all 15 Lane R plan obligations are unproven.`
- Root-cause checkpoint: the first post-write audit correctly reported missing
  `runtime readiness`. Its required pattern was the exact implementation-plan
  heading, while the document said `Derived Runtime Readiness`. The plan's
  coverage was present under Task 140 but the proof label was not exact; the
  one-line heading correction was verified by the same fail-fast audit.
- GREEN: the focused audit then exited 0 and printed `GREEN: Lane R plan audit
  passed (15 obligations; no placeholder markers).` It confirms exact R-owned
  files, sole factory ownership, mounted context, prompt/provider posture,
  runner, distinct stores, readiness, TDD sequence, review/rebase, Nous,
  rollback, and acceptance coverage.
- `git diff --check` exited 0 with no output and `npm run factory:check` exited
  0 with `factory-readiness passed` after the GREEN audit.
- Full verification: the first run stopped before typecheck with `tsc: command
  not found`. Root-cause evidence showed `node_modules` and
  `node_modules/.bin/tsc` absent while the tracked `package-lock.json` was
  present and `npm ci --dry-run --ignore-scripts` exited 0. `npm ci` restored
  the lockfile-pinned local dependencies without tracked-file changes. The
  rerun `NODE_NO_WARNINGS=1 npm run verify` exited 0: typecheck passed; 189
  test files passed with 3 skipped; 2,228 tests passed with 5 skipped; Vite
  built with its existing chunk-size warning; and factory-readiness passed.

## Plan Self-Review

- Coverage: Tasks 132–135 and 140 map every Lane R design obligation to exact
  production/test files, deterministic RED/GREEN proof, review gates, and a
  later acceptance result.
- Interfaces: the only shared type names are identified as CF-1 consumed
  contracts; the plan does not select their shared modules or redefine their
  ownership. Component function signatures are consistent from producer task
  through factory composition.
- Ownership and merge safety: four independent adapter tasks use disjoint
  files after named dependencies; Task 140 is the only factory editor and
  cannot start before 132–139 are reviewed and integrated.
- Scope: no production code, CF-1 change, provider call, dispatch, self-review
  approval, integration-branch merge, or merge into `neo` is authorized by
  this planning task.
