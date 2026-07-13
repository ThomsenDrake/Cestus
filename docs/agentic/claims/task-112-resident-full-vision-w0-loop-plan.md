# Task 112 Claim: Resident Full-Vision Wave 0 Bounded-Loop Implementation Plan

- Approved Lane L specification: docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md at baa980e04f126ce06f41398fc45169f112321e39
- Governing plan: docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md at 0b5726ec975bdc0aae97e540472ef3be4379b358
- Task: Task 112 / Lane L bounded-loop implementation plan
- Worker and task: Codex Task 112 plan author / /root/task112_loop_plan
- Branch and worktree: codex/task-112-resident-full-vision-w0-loop-plan / /home/drake/.codex/worktrees/task-112-resident-full-vision-w0-loop-plan
- Base commit: f6c8337481ce79a073de8f592544e42230a61304
- Claimed at: 2026-07-13T02:25:00Z
- Model configuration: GPT-5.6 Terra / Extra High, user-confirmed; reported GPT-5 is treated as satisfying this configuration under the standing coordinator direction
- Status: in-progress

## Ownership

- Create: docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md
- Create: docs/agentic/claims/task-112-resident-full-vision-w0-loop-plan.md

Every other tracked repository file is forbidden, including production, test,
runtime, UI, provider, shared-contract, specification, template,
acceptance-matrix, and registry files. The plan may reserve Task 120's four and
Task 136's two named files, but Task 112 authorizes no production edit.

## Authorization and Stop Conditions

The coordinator-issued scoped authorization names the two approved documents
above and permits Task 112 only. It explicitly authorizes
superpowers:subagent-driven-development, documentation RED/GREEN as TDD, fresh
review, and verification-before-completion. The wave stop is one verified
plan-and-claim commit, then fresh plan review and coordinator lane-plan approval.

This task does not authorize Task 120, Task 136, CF-1 implementation, provider
invocation, child dispatch, a shared-contract change, integration merge, or
merge into neo. Return structured evidence to the coordinator for data-loss or
fallback risk, schema/file-owner conflict, unavailable dependency, or repeated
verifier failure. Repair exhaustion is the coordinator recovery checkpoint, not
a user gate.

## Documentation RED Evidence

Before the plan existed, this focused command exited 1:

~~~bash
node --input-type=module <<'NODE'
import fs from "node:fs";
const file = "docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md";
if (!fs.existsSync(file)) {
  console.error("RED: Lane L plan is absent; plan/observation contracts, bounded loop, recovery, and acceptance proofs are unproven.");
  process.exit(1);
}
process.exit(1);
NODE
~~~

Observed output:

~~~text
RED: Lane L plan is absent; plan/observation contracts, bounded loop, recovery, and acceptance proofs are unproven.
~~~

The post-write GREEN audit, whitespace, factory, and full verification evidence
will be appended forward in this claim before commit.

## Planned Self-Review Scope

- Task 120 must cover strict versioned policy/plan/observation/tool/result
  records, every budget, exact allowlists, append/readback, replay, and no graph
  mutation.
- Task 136 must consume Task 120 plus W/P/H boundaries for a finite loop,
  suspension/revalidation, terminal/resumable recovery, and no fallback.
- CF-1 retains shared schema/event ownership; no Task 112 plan task selects it.
- Task 120 and 136 have disjoint production/test files and named rebase gates.
- The plan must map L-01 through L-08 to A-01/A-02/A-03/A-05/A-06/A-10.

## Completion Handoff

After fresh documentation GREEN, git diff --check, npm run factory:check, and
npm run verify evidence, update Status to ready-for-review, commit only this
claim and the plan, and stop for a fresh Task 112 review. The author cannot
self-approve or merge.

## Documentation Audit Recovery and GREEN Evidence

- Root cause checkpoint: the first post-write section-local audit exited 1 on
  its Task 120 handoff assertion. The plan had the required completed/handoff
  gate, but Markdown line wrapping separated the audit's shorter literal
  `H exact handoff readback`. The failure was deterministic and isolated to the
  audit label, not a missing Lane L constraint. The audit now asserts the
  complete unwrapped Task 120 clause, `completed / handoff-recorded requires H
  exact handoff`, inside the Task 120 section.
- GREEN: the same section-local audit exited 0 and printed `GREEN: Task 112
  section-local bounded-loop plan audit passed (9 counterfactual omissions
  rejected).` It rejected removal of exact tool/version matching, plan readback,
  projection, loop factory, W release, durable resume anchor, matrix L-08,
  coordinator-only Nous, and forward-only rollback.
- Status remains in-progress until fresh whitespace, factory, full verification,
  self-review, and commit evidence below are complete.

## Verification, Self-Review, and Ready-for-Review Record

- Whitespace: `git diff --check` exited 0 with no output.
- Factory: `npm run factory:check` exited 0 and printed
  `factory-readiness passed`.
- Full-verification recovery: the first `NODE_NO_WARNINGS=1 npm run verify`
  exited 127 before typecheck with `tsc: command not found`. Root-cause checks
  found no `node_modules` or `node_modules/.bin/tsc`, while the tracked
  lockfile was present and `npm ci --dry-run --ignore-scripts` exited 0. This
  isolated worktree was unprovisioned, not a plan defect. `npm ci` restored
  lockfile-pinned dependencies without tracked-file changes.
- Full verification: the unchanged rerun `NODE_NO_WARNINGS=1 npm run verify`
  exited 0: typecheck passed; 189 test files passed with 3 skipped; 2,228 tests
  passed with 5 skipped; Vite built with its existing chunk-size warning; and
  factory-readiness passed.
- Scope/self-review: the two changed tracked files are exactly the authorized
  plan and claim. The plan has no placeholder markers; it maps all Lane L
  spec requirements to Task 120, Task 136, L-01 through L-08, review/rebase,
  later coordinator-only Nous, forward rollback, and A-01/A-02/A-03/A-05/A-06/
  A-10. Its CF-1 consumed interfaces and ownership table leave shared schemas,
  mount/claim, provider, handoff, factory, trigger, browser, and acceptance
  ownership outside Lane L.
- Current status: ready-for-review. Fresh independent review and coordinator
  lane-plan approval remain required; this record does not self-approve or
  authorize Task 120, Task 136, provider work, or a merge.
