# Task 104 Claim: Resident Full-Vision Wave 0A Bounded Loop Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 104 / L / Wave 0A
- Status: ready-for-review
- Branch: `codex/task-104-resident-full-vision-w0-loop-spec`
- Worktree: `/home/drake/.codex/worktrees/task-104-resident-full-vision-w0-loop-spec`
- Base commit: `52bc6b6dc81373d6026e7465becde75bd1c6448e`
- Claimed at: `2026-07-12T20:46:55Z` (UTC)
- Worker identity: Codex, Task 104 Lane L specification author
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task

## Authorization and Scope

The coordinator-issued scoped authorization under the Standing Coordinator
Delegation authorizes Task 104 only. It authorizes documentation RED/GREEN,
fresh review, and verification-before-completion. It does not authorize a
merge into `neo`, a Lane L implementation plan, Task 112 or later work,
production code, tests, runtime, UI, provider, shared-contract, registry, or
program-plan changes.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md`
- `docs/agentic/claims/task-104-resident-full-vision-w0-loop-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: a focused, reproducible coverage audit must fail until
  the Lane L specification exists and defines planning, observation, tool,
  budget, approval-suspension, terminal/resumable, provenance, mounted-
  authority, no-fallback, and ownership boundaries.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` must pass after the specification is written.
- Full verification: `npm run verify` must pass before the task commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit this claim and one Lane L specification, then stop for fresh
  coordinator review and written L-spec approval. Do not create Task 112,
  dispatch a worker, or merge.

## Invariants

- Preserve the one resident identity `agent_default`; providers, credentials,
  and harnesses are backends, never identities.
- Preserve append-only ledger semantics, exact provenance, rebuildable
  projections, independent-human approval consumption, durable handoff
  readback, mounted-workspace authority, no fallback storage, and secret-safe
  public diagnostics.
- Plans, observations, tool results, and memory remain advisory. They cannot
  establish accepted ontology truth, broaden authority, or self-approve an
  external or irreversible effect.

## Documentation RED/GREEN And Self-Review

The following focused audit reads only the Task 104 specification. It is the
documentation RED/GREEN contract for this task.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md";
let spec = "";
try { spec = fs.readFileSync(path, "utf8"); } catch {
  console.error("RED: bounded-loop specification is absent");
  process.exit(1);
}
const assertions = [
  ["policy", spec.includes("ResidentPlanPolicy")],
  ["plan", spec.includes("ResidentPlanRecord")],
  ["observation", spec.includes("ResidentObservationRecord")],
  ["tool step", spec.includes("ResidentToolStepRecord")],
  ["hard budgets", spec.includes("Hard Maximums")],
  ["allowlist", spec.includes("Tool Allowlist")],
  ["approval suspension", spec.includes("Approval Suspension")],
  ["terminal/resumable", spec.includes("Terminal And Resumable")],
  ["mounted no fallback", spec.includes("no fallback")],
  ["handoff readback", spec.includes("handoff readback")],
  ["ownership", spec.includes("Ownership")],
  ["pre-CF-1", spec.includes("pre-CF-1")]
];
const missing = assertions.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length > 0) {
  console.error(`RED: Task 104 coverage missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 104 bounded-loop coverage audit passed (${assertions.length} assertions).`);
'
```

- RED: before the specification existed, the audit exited 1 with
  `RED: bounded-loop specification is absent`.
- GREEN: after the specification was written, the same audit exited 0 with
  `GREEN: Task 104 bounded-loop coverage audit passed (12 assertions).`
- Whitespace: `git diff --check` exited 0 with no output before staging; the
  staged check is rerun immediately before the task commit.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: the first `npm run verify` was blocked because the fresh
  isolated worktree lacked the lockfile-pinned `tsc`; `npm ci --ignore-scripts`
  restored declared dependencies without changing tracked files, then a fresh
  `npm run verify` exited 0.
- Self-review: all budgets have finite hard ceilings and lower profile limits;
  matching is exact tool ID/version; a replan cannot broaden authority;
  suspension rechecks independent approval consumption, current policy, mount,
  lock, provenance, and budget; completion requires durable handoff readback;
  failures are terminal or anchored resumable states; no fallback storage,
  newsroom/team scope, raw secrets, or production ownership drift appears.

## Review And Stop

Fresh Lane L specification review and written coordinator L-spec approval are
pending. This author does not self-approve, create Task 112, dispatch a worker,
merge, or modify any non-owned file.
