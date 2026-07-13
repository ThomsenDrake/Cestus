# Task 111 Claim: Resident Full-Vision Wave 0B Wake And Portable Lifecycle Plan

- Governing lane specification: `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md@2620e51e4888a0884fb6d3eb4766e92736688efb`
- Governing program plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`
- Task and lane: Task 111 / W / Wave 0B
- Status: in-progress
- Branch: `codex/task-111-resident-full-vision-w0-wake-plan`
- Worktree: `/home/drake/.codex/worktrees/task-111-resident-full-vision-w0-wake-plan`
- Base commit: `2d26a51f46c679c43ab519e21d0118e948289909`
- Claimed at: `2026-07-13T00:22:57Z` (UTC)
- Worker identity: Codex, Task 111 Lane W implementation-plan author
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task

## Coordinator Authorization And Scope

The coordinator issued the required scoped authorization under the Standing
Coordinator Delegation. It names the governing Lane W specification at
`2620e51e4888a0884fb6d3eb4766e92736688efb`, governing program plan at
`0b5726ec975bdc0aae97e540472ef3be4379b358`, Task 111 only, and a stop after
one verified implementation-plan commit, fresh plan review, and coordinator
lane-plan approval. It explicitly authorizes
`superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
fresh review, and verification-before-completion. It prohibits production work,
Task 120 or later work, CF-1, provider invocation, and a merge into `neo`.

Owned files:

- `docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md`
- `docs/agentic/claims/task-111-resident-full-vision-w0-wake-plan.md`

Every other tracked file is forbidden. This claim and its plan are pre-CF-1
work orders, not a frozen event, DTO, capability, route, or production change.

## Planning Invariants

- There is one resident identity, `agent_default`; a supervisor is an execution
  host, never a second resident or provider identity.
- Mounted workspace identity, ledger, artifact/derivative stores, policy, and
  active locks are authoritative. Disconnect, stale readback, or identity
  mismatch fails closed and creates no fallback ledger, cache, queue, journal,
  projection, artifact, or local resume state.
- Lifecycle completion, pause, claim release/checkpoint, and recovery require
  exact mounted append/readback evidence. A return value or in-memory state is
  not proof.
- Provider/tool/claim/effect gates remain owned by their existing services;
  Lane W only supervises bounded wakes through a narrow port.
- CF-1 alone resolves shared names, schemas, ownership, and compatibility.
  The future default runtime factory remains R-only and browser routes/panels
  remain U-only.

## Documentation RED/GREEN Contract

The focused audit below must fail while the Task 111 plan is absent or lacks a
measurable supervisor, recovery, same-identity reconciliation, no-fallback,
route, diagnostic, dependency, live-gate, rollback, and acceptance work order.
It reads only the Task 111-owned plan.

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const path = "docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md";
let plan;
try {
  plan = readFileSync(path, "utf8");
} catch {
  console.error("RED: Task 111 wake-lifecycle implementation plan is absent");
  process.exit(1);
}
const required = [
  ["supervisor", "## Task 124: Wake Supervisor"],
  ["portable authority", "## Task 125: Portable Workspace Availability And Claim Reconciliation"],
  ["runtime assembly", "## Task 137: Wake Supervisor Runtime Assembly"],
  ["same identity", "Same-Identity Revalidation And Active-Claim Reconciliation"],
  ["no fallback", "No-Fallback Counterfactual Proof"],
  ["diagnostics", "Secret-Safe Diagnostics And Command Boundary"],
  ["routes", "Task 141: U-Owned Supervision Routes And Panel"],
  ["red green", "## RED/GREEN Command Matrix"],
  ["review", "## Fresh Review, Rebase, And Merge Gates"],
  ["live", "## Coordinator-Only Live Acceptance Posture"],
  ["rollback", "## Rollback And Stop Conditions"],
  ["acceptance", "## Acceptance Mapping"]
];
const missing = required.filter(([, marker]) => !plan.includes(marker)).map(([name]) => name);
if (missing.length > 0) {
  console.error(`RED: Task 111 plan coverage missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 111 wake-lifecycle plan audit passed (${required.length} assertions).`);
NODE
```

- RED: `2026-07-13T00:22:57Z`; exit 1 with `RED: Task 111 wake-lifecycle implementation plan is absent`.
- First GREEN attempt: exit 1 after the plan was written. Root cause: the
  audit searched for `### Task` headings while the plan deliberately uses
  `## Task` headings, and it required a named no-fallback proof section that
  had been described but not headed. This was an audit-contract mismatch, not
  an absent lifecycle work order. The repair changed only those audit markers
  and added the explicit `### No-Fallback Counterfactual Proof` heading.
- GREEN: after the focused audit repair, exit 0 with
  `GREEN: Task 111 wake-lifecycle plan audit passed (12 assertions).`
- Whitespace: `git diff --check` exited 0 with no output after the GREEN audit.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed` after the GREEN audit.
- Placeholder/interface self-review: exit 0 with
  `SELF-REVIEW: no placeholders; file map and interface/gate markers are present.`
  The scan checked the eight planned production/test files and the authority,
  runtime-port, control-port, reconciliation, acceptance, and verification
  markers.
- Full verification first attempt: exit 127 before typechecking with
  `sh: line 1: tsc: command not found`; this fresh isolated worktree had no
  `node_modules` tree. `npm ci --ignore-scripts` restored only the
  lockfile-pinned ignored dependency tree, exited 0, and did not change a
  tracked file.
- Full verification rerun: `npm run verify` exited 0 with `typecheck passed`,
  189 test files passed with 3 skipped, 2,228 tests passed with 5 skipped, a
  successful Vite production build with the existing chunk-size warning, and
  `factory-readiness passed`.
- Required full gates before commit: `git diff --check`, `npm run factory:check`, and `npm run verify`.

## Stop And Review Gate

After one documentation-only commit, a fresh reviewer must inspect the owned
file diff against the approved Lane W design, this claim, the governing program
plan, and Cestus invariants. The current status is `ready-for-review` pending
that fresh review. This author does not self-approve, dispatch a production
worker, change shared contracts, run a provider, merge into `neo`, or advance
through CF-1.
