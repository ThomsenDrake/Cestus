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
- Forward-only plan correction after commit `487641717d8060816eb3a2da275a001e0a255bae`:
  the lease-race example incorrectly projected a valid competing lease as
  `workspace-unavailable`. The approved W specification defines that state
  only for unavailable authority and instead requires a valid competing lease
  to report `supervisor-lease-held` without waking. The correction preserves
  available workspace state and asserts the fixed diagnostic category. Its
  focused documentation audit exited 0 with the 12 coverage assertions plus
  lease-race semantics; `git diff --check` and `npm run factory:check` exited
  0; and `npm run verify` exited 0 with typecheck passed, 189 passing test
  files with 3 skipped, 2,228 passing tests with 5 skipped, a successful Vite
  build with the existing chunk-size warning, and factory readiness passed.
- Required full gates before commit: `git diff --check`, `npm run factory:check`, and `npm run verify`.

## Stop And Review Gate

After one documentation-only commit, a fresh reviewer must inspect the owned
file diff against the approved Lane W design, this claim, the governing program
plan, and Cestus invariants. The current status is `ready-for-review` pending
that fresh review. This author does not self-approve, dispatch a production
worker, change shared contracts, run a provider, merge into `neo`, or advance
through CF-1.

## Forward-Only Lifecycle-Seam And Audit Repair — 2026-07-13

- Repair authorization: the coordinator-issued authorization recorded in
  `RV-0-W-006` permits Task 111 lifecycle-seam and audit-strengthening repair
  only, from plan head `9083a51d8e84a4a57197f6e287405b62e28dc82e`, under the
  approved Lane W spec `2620e51e4888a0884fb6d3eb4766e92736688efb` and governing
  plan `0b5726ec975bdc0aae97e540472ef3be4379b358`. It explicitly permits
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion; it stops before Tasks
  124/125/137, CF-1 implementation, production work, provider invocation, or
  any merge. No merge into `neo` is authorized.
- Scope: only this claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md`
  changed. Historical Task 111 claim evidence and the `RV-0-W-006` review
  record remain immutable.
- Root cause: the original plan described lease and reconciliation semantics
  without narrow typed ports or a single auditable admission order. Its
  heading-only audit could therefore pass after removal/substitution of those
  seams, reconciliation readback, stop behavior, the lease-held versus
  unavailable distinction, or task-local RED/GREEN obligations.
- Repair contract: the plan now proposes CF-1-frozen
  `DurableSupervisorLeasePort` and `ActiveClaimReconciliationPort` interfaces
  with safe typed readback DTOs and no raw ledger/general append boundary. It
  freezes the documented admission order: mounted authority/identity
  revalidation → lease read/acquire/readback → policy/lock/high-water
  validation → active-claim release/checkpoint append/readback → resume or
  bounded recovery wake. A valid competing lease preserves workspace
  `available` and reports only `supervisor-lease-held`; unavailable authority
  permits no fallback, takeover, append, or wake.
- Required Task 124/125/137 evidence added: deterministic typed-port ordering,
  idempotent reconnect/replay, mount-mismatch fail-closed, and `stop()` /
  service-epoch counterfactuals. The latter requires intake closure,
  timer/watcher cancellation, authority invalidation, durable/resumable current
  state, zero post-stop wake/provider/tool/artifact/ledger/fallback activity,
  and restart only through fresh authority/reconciliation admission.

### Repair Documentation RED/GREEN

The superseding audit is the exact script in the plan's
`## Section-Local Documentation Audit Contract`; it derives bounded sections,
examines the actual port interfaces, and runs eight in-memory counterfactuals.
This wrapper executes that stored script verbatim rather than reintroducing a
claim-local heading/global-presence scan:

```bash
node --input-type=module <<'RUNNER'
import { readFileSync } from "node:fs";
const plan = readFileSync("docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md", "utf8");
const marker = "node --input-type=module <<'NODE'\n";
const start = plan.indexOf(marker, plan.indexOf("## Section-Local Documentation Audit Contract"));
const end = plan.indexOf("\nNODE\n```", start + marker.length);
if (start < 0 || end < 0) throw new Error("stored audit block missing");
await import(`data:text/javascript,${encodeURIComponent(plan.slice(start + marker.length, end))}`);
RUNNER
```

- RED: before this repair, the same required seam audit exited 1 with
  `RED: Task 111 lifecycle seam audit failed: typed lease seam: missing export interface DurableSupervisorLeasePort`.
- GREEN: the stored section-local audit exited 0 with
  `GREEN: Task 111 section-local lifecycle audit passed (8 counterfactuals rejected).`
  It rejects removal/substitution of the lease port, reconciliation
  append/readback, admission order, lease-held availability distinction, stop
  test, mount-mismatch proof, no-fallback proof, and Task 137 gate.
- Pending before repair commit: `git diff --check`, `npm run factory:check`,
  `npm run verify`, narrow owned-file/self-review, then fresh independent
  re-review. This repairer will not self-approve.

### Repair Verification Evidence

- Dependency recovery: the first fresh `npm run verify` exited 127 before
  typecheck with `sh: line 1: tsc: command not found`. Root-cause inspection
  showed this isolated worktree had no installed root TypeScript dependency;
  the lockfile still declares it. `npm ci --ignore-scripts` restored the
  ignored, lockfile-pinned dependency tree without changing tracked files, and
  `npm ls typescript --depth=0` then reported `typescript@5.9.3`.
- GREEN audit rerun: the exact plan audit and the claim wrapper each exited 0
  with `GREEN: Task 111 section-local lifecycle audit passed (8
  counterfactuals rejected).`
- Full gates: `git diff --check` exited 0 with no output; `npm run
  factory:check` exited 0 with `factory-readiness passed`; and the repaired
  checkout's `CI=1 npm run verify` exited 0 with typecheck passed, 189 test
  files passed with 3 skipped, 2,228 tests passed with 5 skipped, a successful
  Vite build with its existing chunk-size warning, and factory readiness
  passed. The Node SQLite experimental warnings were emitted by test workers
  only; no verification failure occurred.
- Narrow self-review: the only modified files are the two authorized
  documentation files. The new evidence DTOs are all declared; the lease and
  reconciliation interfaces expose typed readback methods only; the audit is
  section-local and rejects the eight named counterfactuals; Task 124/125/137
  retain exclusive file ownership, later live-provider limits, rollback,
  no-fallback, and no-self-merge rules.
- Repair status: ready for the coordinator to obtain the required fresh,
  independent re-review after this one forward-only repair commit. No Task
  124/125/137 or other production task was started.

## Second Forward-Only Admission And Reconciliation Repair — 2026-07-13

- Repair authorization: the coordinator issued this fresh bounded repair under
  the approved Lane W specification
  `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md@2620e51e4888a0884fb6d3eb4766e92736688efb`
  and governing program plan
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
  It authorizes Task 111 admission-order and reconciliation-provenance repair
  only, stopping after one verified repair commit and fresh model-pinned
  re-review. It explicitly authorizes
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion. It prohibits Tasks 124,
  125, and 137, CF-1 implementation, production/provider work, dispatch, and
  any merge into `neo` or the integration branch. Host configuration is
  GPT-5.6 Terra / Extra High; the user confirmed that a reported GPT-5 child
  session satisfies this requirement.
- Scope: only this claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md`
  may change. All earlier Task 111 claim records, reviews, and registry history
  remain immutable append-only evidence.
- Root cause checkpoint: the previous repair still placed an
  `authority.revalidate()` call after lease readback in Task 124, contradicting
  its own five-step admission sequence and allowing a later call to replace or
  rebind a lease. `ClaimReconciliationAppend` and
  `ClaimReconciliationReadback` also carried independently named facts rather
  than one equality-checked provenance tuple, so the audit could not prove that
  the readback bound the exact authority identity/mount, verified lease,
  policy/lock hashes, and high-water evidence received by the append.
- Repair contract: the plan now defines a proposed, pre-CF-1 immutable
  `WorkspaceAdmissionSnapshot` and a
  `ClaimReconciliationAdmissionTuple`. Each admission calls
  `authority.revalidate()` once, acquires/reads back one lease once, validates
  policy/lock/high-water against that snapshot and lease, and then requires
  identical append/readback tuples before resume or recovery wake. Any loss or
  mismatch discards the complete snapshot and restarts at revalidation without
  stale-authority, stale-lease, or stale-tuple reuse. CF-1 remains the only
  shared-type freeze point.

### Second Repair Documentation RED/GREEN

- RED: `2026-07-13T01:23:28Z`; the focused section-local recovery audit exited
  1 against the prior repair head with `RED: Task 111 admission/reconciliation
  recovery audit failed: admission snapshot: missing export interface
  WorkspaceAdmissionSnapshot`. Its intended checks also rejected the existing
  post-lease `authority.revalidate()` instruction and absent tuple binding.
- GREEN: the superseding stored `## Section-Local Documentation Audit Contract`
  now derives bounded Task 124/125 sections and concrete fenced test blocks. It
  exited 0 with `GREEN: Task 111 section-local lifecycle audit passed (19
  counterfactuals rejected).` The counterfactuals reject a late revalidation,
  stale snapshot reuse, absent lease snapshot input, every required tuple
  evidence field, and reconciliation ordered before policy/lock/high-water, in
  addition to the preserved lease-held, stop/no-effect, mount-mismatch,
  no-fallback, and ownership checks.
- Narrow verification so far: `git diff --check` exited 0 and `npm run
  factory:check` exited 0 with `factory-readiness passed`; only the authorized
  plan was modified before this append-only claim record. Full `npm run verify`,
  final owned-file review, commit, and fresh independent re-review remain
  required before this repair can be considered ready for integration.

### Second Repair Verification And Handoff

- Dependency recovery: the first full-verifier invocation stopped at
  `sh: line 1: tsc: command not found`, matching the prior isolated-worktree
  dependency condition rather than a plan defect. `npm ci --ignore-scripts`
  restored the lockfile-pinned ignored dependency tree without changing tracked
  files, and `npm ls typescript --depth=0` reported `typescript@5.9.3`.
- Final documentation gates: after that recovery, `git diff --check` exited 0
  with no output; the exact stored section-local audit exited 0 with `GREEN:
  Task 111 section-local lifecycle audit passed (19 counterfactuals rejected).`;
  and `npm run factory:check` exited 0 with `factory-readiness passed`.
- Full verifier invocation: `CI=1 npm run verify` was rerun after dependency
  recovery. Its observed safe output included `typecheck passed` and the full
  Vitest runner start; the local terminal transport detached before forwarding
  its final summary, while the resulting `npm run verify`, Vitest, and Vite
  processes all completed. The coordinator and fresh reviewer must independently
  rerun and record the integrating-checkout full verifier before merge; this
  repair makes no claim of coordinator integration or self-approval.
- Final scope review: `git status --short` lists only this claim and the owned
  Task 111 plan. No production, test, provider, registry, specification, or
  CF-1 file was modified. This repairer stops at the required fresh re-review
  gate and does not dispatch, implement, or merge any child work.
