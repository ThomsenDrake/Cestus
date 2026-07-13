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

## Append-Only ABI-and-Audit Repair Checkpoint

- Coordinator authorization: Lane L design at
  `baa980e04f126ce06f41398fc45169f112321e39`; governing program plan at
  `0b5726ec975bdc0aae97e540472ef3be4379b358`; Task 112 ABI-and-audit repair
  only. The stop is one verified repair commit plus fresh review. It explicitly
  authorizes superpowers:subagent-driven-development, documentation RED/GREEN,
  fresh review, and verification-before-completion; it forbids Tasks 120/136,
  CF-1 implementation, provider work, dispatch, integration, and merging into
  `neo`.
- Worker/worktree for this forward-only repair: Codex Task 112 repairer /
  `/root/task112_loop_plan_repair` on
  `codex/task-112-resident-full-vision-w0-loop-plan-repair`, based at
  `5abd6852`. Model configuration remains GPT-5.6 Terra / Extra High,
  user-confirmed; reported GPT-5 satisfies that configuration.
- Root cause: the prior audit proved only broad phrase presence. It could pass
  while an equality binding, response-byte ceiling, recovery port, or post-await
  source/context guard was removed from the operative Lane L section.
- Documentation RED: the new section-local prospective audit exited 1 with:

  ~~~text
  RED: bounded audit lacks section-local proof for planId, supersedesPlanRecordEventId, provider response bytes, unknown checkpoint, foreign checkpoint, mount loss
  ~~~

- Repair target: define CF-1 candidate/planner/replanner, checkpoint, approval,
  gateway, and W mounted-authority ports; bind candidate plan IDs/revisions/
  supersedes, exact policy subset/equality and P posture; require ledger-only
  readback/consume, W suspension/release/reclaim/reverify, all ten counters,
  direct unknown/foreign checkpoint, stale approval, mount-loss, and post-await
  source/context tests; then make the audit reject their scoped removal.

## Append-Only ABI-and-Audit Repair GREEN and Verification Record

- Documentation GREEN: the revised audit exited 0 and printed
  `GREEN: Task 112 section-local bounded-loop plan audit passed (19
  counterfactual omissions rejected).` It rejects a removed equality-tuple item,
  provider-response ceiling, initial planner/replanner/checkpoint/approval/
  gateway/W recovery port, W no-write rule, and post-await source/context
  recheck, as well as the original contract omissions.
- Whitespace and factory: `git diff --check` exited 0 with no output and
  `npm run factory:check` exited 0 with `factory-readiness passed`.
- Verification environment recovery: the first `npm run verify` failed before
  typecheck with `tsc: command not found`. Root-cause checks found no executable
  `node_modules/.bin/tsc`, the tracked lockfile present, and
  `npm ci --dry-run --ignore-scripts` successful. `npm ci --ignore-scripts`
  restored only lockfile-pinned ignored dependencies; it made no tracked-file
  change.
- Full verification: the unchanged rerun of `npm run verify` completed with exit
  status 0 after dependency provisioning. No provider call occurred.
- Scope/self-review: the only changed tracked files are this append-only claim
  and the Lane L implementation plan. The plan now gives Task 136 typed
  initial-plan/planner/replanner ports, a fresh plan ID/revision/supersedes link,
  exact policy/equality/subset and P posture limits, complete ledger readback
  ports, W-owned suspend/release/reclaim/reverify, direct resume failure tests,
  all ten counter proofs, and section-local counterfactual enforcement. It does
  not alter the approved Lane L design or authorize CF-1, Task 120, Task 136,
  provider, dispatch, integration, or `neo` merge work.
- Repair status: ready-for-fresh-review. This forward record supersedes no
  historical claim bytes and is not self-approval.

## Append-Only Authoritative ABI Repair Record

- Coordinator authorization: Task 112 authoritative-ABI documentation audit
  repair only on
  `codex/task-112-resident-full-vision-w0-loop-plan-authoritative-abi-repair`,
  based at `7035a85c4f16df8e6189e360bc663297c426b025`. It preserves the
  approved Lane L design and program-plan SHAs already recorded above, changes
  only this claim and the Lane L implementation plan, and does not authorize
  Task 120, Task 136, CF-1, provider work, dispatch, integration, or a merge
  into `neo`.
- Root cause: the previous section-local audit checked broad phrase presence.
  Task 136's concrete tests still called stale `gateway.request` and
  `toolGateway.execute`; `ResidentLoopCheckpointReadback` omitted resident,
  descriptor, plan/step/tool/approval/preview/artifact/deadline bindings; and
  `readHandoff` narrowed the H-owned readback to three output fields.
- Documentation RED: the prospective authoritative-ABI audit exited 1 and
  reported the missing checkpoint bindings, missing
  `requestAndReadback`/`executeAndReadback` test proofs, missing direct
  `HandoffReadback`/verified lifecycle/authority proof, and both stale gateway
  methods. This was a baseline-only audit; no production or test file changed.
- Repair: Task 136 now names only
  `requestAndReadback`/`readRequest`/`readDecision` and
  `executeAndReadback`/`readResult`; `ResidentLoopCheckpointReadback` binds
  resident, descriptor, plan, step, tool, approval class, preview, input
  artifacts, deadline, policy, and existing provenance/authority fields; each
  named mismatch is a fail-closed test case. `readHandoff` now returns the
  authoritative `HandoffReadback` directly and completion requires its
  verified outcome, exact task/run, lifecycle event proof, and exact H
  authority binding without a narrowed L shape.
- Documentation GREEN: the plan's exact executable section-local audit exited
  0 and printed `GREEN: Task 112 section-local bounded-loop plan audit passed
  (32 counterfactual omissions rejected).` The added cases reject removed
  gateway execution readback, each checkpoint binding and mismatch proof, and
  the authoritative HandoffReadback/verified-outcome/authority proof, in
  addition to prior bounded-loop omissions.
- Verification environment: this fresh `/tmp` worktree initially lacked
  `node_modules/.bin/tsc`; `npm ci --dry-run --ignore-scripts` then
  `npm ci --ignore-scripts` restored only ignored lockfile-pinned dependencies
  and made no tracked-file change. `npm run typecheck` printed `typecheck
  passed`; `git diff --check` had no output. The plan audit remained green.
- Sandbox-limited gates: `npm run factory:check` reaches
  `scripts/check-agent-readiness.mjs` but fails at `spawnSync git EPERM` for
  `git ls-files`. The full `npm test` run reports 186 passed, 3 skipped, and
  19 failures caused by sandbox `listen EPERM` for loopback, wildcard, and
  `/tmp/tsx-1000/*.pipe` listeners; these are unrelated local-runtime and
  workspace-ops tests, not Task 112 files. `npm run verify` cannot become green
  here because it includes those tests and then the same factory gate. No
  infrastructure or source workaround was attempted.
- Handoff: ready for a fresh coordinator-arranged Task 112 re-review plus gate
  rerun in an environment that permits listener creation and Node child-process
  `git`. This forward record is not self-approval and does not mark any
  implementation task authorized or merged.

## Append-Only Fail-Closed Checkpoint and Handoff Repair Started

- Recorded at: 2026-07-13T12:47:33Z.
- Status: in-progress under a fresh bounded coordinator authorization. Earlier
  Task 112 records remain immutable historical evidence.
- Repair worker/branch/worktree:
  `codex/task-112-resident-full-vision-w0-loop-plan-fail-closed-repair` /
  `/tmp/cestus-task112-fail-closed`, based at
  `4e780c7e06a52dc89bbf64fd0fd4b2b312f860d7`.
- Scoped authority: Task 112 fail-closed checkpoint/handoff documentation
  repair only under Lane L
  `docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md@baa980e04f126ce06f41398fc45169f112321e39`,
  the durable-handoff design, and the governing program plan
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
  Stop after one verified repair commit and fresh review; do not begin Tasks
  120 or 136, CF-1, production/provider work, child dispatch, or a merge into
  `neo`.
- Allowed files: this append-only claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md`.
  No registry, specification, production, test, provider, or shared-contract
  file may change.
- Root cause and documentation RED are recorded after the prospective
  structural audit demonstrates the baseline can admit a stale gateway spelling,
  incomplete checkpoint no-effect proof, or narrowed H handoff result.
