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

## Repair RC-104-01 — Record Binding And Plan-Equality Review Repair

This forward-only repair preserves the initial Task 104 claim and documentation
evidence above. It supersedes only the prior insufficient record-binding
contract; it does not rewrite the prior specification or claim evidence.

- Repair authorization: coordinator-issued Task 104 append-only Lane L
  specification-review repair under the Standing Coordinator Delegation. The
  repair is limited to the two owned documentation files and forbids Task 112,
  production work, dispatch, and merge.
- Review trigger: P1 fresh-review finding that `ResidentObservationRecord`,
  `ResidentToolStepRecord`, and `ResidentLoopTerminalOrResumableResult` did not
  directly bind every invariant field or require exact immutable plan-record
  readback/equality through `planRecordEventId`.
- Repairer: Codex, Task 104 Lane L specification repairer, using the
  user-confirmed GPT-5.6 Terra / Extra High configuration.
- Repair claimed at: `2026-07-12T21:04:11Z`.
- Repair base: `b5113756` (`docs: define resident bounded loop policy`).

### Focused binding RED/GREEN audit

```bash
node --input-type=module --eval '
import fs from "node:fs";
const spec = fs.readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md", "utf8");
const block = (name) => {
  const start = spec.indexOf(`interface ${name}`);
  const end = spec.indexOf("\n}", start);
  return start < 0 || end < 0 ? "" : spec.slice(start, end + 2);
};
const required = [
  "taskId", "attemptId", "runId", "residentAgentId", "runMode",
  "policyVersion", "policyHash", "sourceEventIds", "contextPackRefs",
  "budget", "authority", "causationId", "correlationId", "planRecordEventId"
];
const records = [
  ["observation", block("ResidentObservationRecord")],
  ["tool step", block("ResidentToolStepRecord")],
  ["result", block("ResidentLoopTerminalOrResumableResult")]
];
const missing = records.flatMap(([name, value]) => required
  .filter((field) => !value.includes(`readonly ${field}`))
  .map((field) => `${name}.${field}`));
const hasReadback = spec.includes("## Plan-Binding Readback And Equality") &&
  spec.includes("must read the exact `planRecordEventId`") &&
  spec.includes("sourceEventIds, contextPackRefs, budget, authority") &&
  spec.includes("causationId, and correlationId");
if (!hasReadback) missing.push("mandatory exact plan-record readback/equality");
if (missing.length > 0) {
  console.error(`RED: Task 104 binding repair audit missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 104 binding repair audit passed (${records.length} records).`);
'
```

- RED: before this repair, the audit exited 1 and reported missing direct
  resident/run-mode/policy/context/correlation bindings in the observation,
  tool-step, and result records; missing tool-step source/budget bindings;
  missing result plan/source/context/budget/correlation bindings; and missing
  mandatory exact plan-record readback/equality.
- GREEN: after the repair, the same audit exited 0 with
  `GREEN: Task 104 binding repair audit passed (3 records).`
- Repair contract: every affected record now carries all invariant bindings
  directly, `planRecordEventId` is mandatory, and the new
  `Plan-Binding Readback And Equality` section requires mounted-ledger exact
  equality before append or projection. A mismatch fails closed and cannot
  synthesize a replan, fallback record, or completion.
- Whitespace: `git diff --check` exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 after its typecheck, test, UI
  build, and factory-readiness gates.
- Repair status: ready-for-review. Fresh model-pinned re-review is required
  before any coordinator approval. The repairer does not self-approve, create
  Task 112, dispatch, or merge.

### Repair correction RC-104-01-B — Exact workflow descriptor binding

The final scoped repair review found that a typed `runMode` alone is not an
exact workflow descriptor binding. This append-only correction strengthens
RC-104-01: `ResidentPlanPolicy`, `ResidentPlanRecord`,
`ResidentObservationRecord`, `ResidentToolStepRecord`, and
`ResidentLoopTerminalOrResumableResult` now bind a descriptor ID, version, and
hash; plan-readback equality rejects family, run-mode-only, or compatible-
version matching.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const spec = fs.readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md", "utf8");
const block = (name) => { const start = spec.indexOf(`interface ${name}`); const end = spec.indexOf("\n}", start); return start < 0 || end < 0 ? "" : spec.slice(start, end + 2); };
const required = ["taskId", "attemptId", "runId", "residentAgentId", "runMode", "workflowDescriptor", "policyVersion", "policyHash", "sourceEventIds", "contextPackRefs", "budget", "authority", "causationId", "correlationId", "planRecordEventId"];
const records = [["observation", block("ResidentObservationRecord")], ["tool step", block("ResidentToolStepRecord")], ["result", block("ResidentLoopTerminalOrResumableResult")]];
const missing = records.flatMap(([name, value]) => required.filter((field) => !value.includes(`readonly ${field}`)).map((field) => `${name}.${field}`));
const plan = block("ResidentPlanRecord");
if (!plan.includes("readonly workflowDescriptor")) missing.push("plan.workflowDescriptor");
const hasReadback = spec.includes("## Plan-Binding Readback And Equality") && spec.includes("must read the exact `planRecordEventId`") && spec.includes("workflowDescriptor") && spec.includes("causationId, and correlationId");
if (!hasReadback) missing.push("workflow descriptor exact plan-record readback/equality");
if (missing.length > 0) { console.error(`RED: Task 104 descriptor-binding audit missing: ${missing.join(", ")}`); process.exit(1); }
console.log(`GREEN: Task 104 descriptor-binding audit passed (${records.length + 1} records).`);
'
```

- RED: the strengthened audit exited 1 before RC-104-01-B, reporting missing
  `workflowDescriptor` bindings on plan, observation, tool-step, and result
  records plus missing descriptor-aware plan-readback equality.
- GREEN: after RC-104-01-B, the same audit exited 0 with
  `GREEN: Task 104 descriptor-binding audit passed (4 records).`
- Whitespace: `git diff --check` and staged `git diff --cached --check` both
  exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 after its typecheck, test, UI
  build, and factory-readiness gates.
- Repair status: ready-for-review. Fresh model-pinned re-review remains
  mandatory; no Task 112, production work, dispatch, or merge is authorized.

## Repair RC-104-02 — Binding-Audit Precision Repair

This final permitted focused repair strengthens only the Task 104
documentation audit. It preserves RC-104-01-B's accepted durable-record
contract and all previous evidence; it supersedes the earlier audit's
document-wide descriptor and optional-field checks.

- Repair authorization: coordinator-issued Task 104 documentation-audit
  strengthening only, limited to the two owned documentation files. It forbids
  Task 112, production work, dispatch, and merge.
- Review trigger: fresh re-review found that RC-104-01-B accepted a missing
  descriptor-ID/version/hash equality clause and optional fields such as
  `readonly contextPackRefs?:`.
- Repairer: Codex, Task 104 Lane L final focused review repairer, on the
  user-confirmed GPT-5.6 Terra / Extra High configuration.
- Repair claimed at: `2026-07-12T21:21:15Z`.

### Precise binding RED/GREEN audit

```bash
node --input-type=module --eval '
import fs from "node:fs";
const spec = fs.readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md", "utf8");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const block = (document, name) => {
  const start = document.indexOf(`interface ${name}`);
  const end = document.indexOf("\n}", start);
  return start < 0 || end < 0 ? "" : document.slice(start, end + 2);
};
const section = (document, name) => {
  const start = document.indexOf(`## ${name}`);
  const end = document.indexOf("\n## ", start + 1);
  return start < 0 ? "" : document.slice(start, end < 0 ? document.length : end);
};
const replaceInBlock = (document, name, from, to) => {
  const start = document.indexOf(`interface ${name}`);
  const end = document.indexOf("\n}", start);
  if (start < 0 || end < 0) return document;
  const value = document.slice(start, end + 2);
  return document.slice(0, start) + value.replace(from, to) + document.slice(end + 2);
};
const direct = (value, field, type) => new RegExp(`(^|\\n)\\s*readonly\\s+${escape(field)}\\s*:\\s*${escape(type)};`).test(value);
const recordFields = [
  ["taskId", "string"], ["attemptId", "string"], ["runId", "string"],
  ["residentAgentId", "\"agent_default\""], ["runMode", "ResidentRunMode"],
  ["workflowDescriptor", "ResidentWorkflowDescriptorBinding"],
  ["planRecordEventId", "string"], ["policyVersion", "string"],
  ["policyHash", "`sha256:${string}`"], ["sourceEventIds", "readonly string[]"],
  ["contextPackRefs", "readonly { readonly contextPackId: string; readonly contentHash: `sha256:${string}` }[]"],
  ["budget", "{ readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage }"],
  ["authority", "ResidentLoopAuthorityBinding"], ["causationId", "string"],
  ["correlationId", "string"]
];
const inspect = (document) => {
  const missing = [];
  for (const [label, name] of [["observation", "ResidentObservationRecord"], ["tool-step", "ResidentToolStepRecord"], ["result", "ResidentLoopTerminalOrResumableResult"]]) {
    const value = block(document, name);
    for (const [field, type] of recordFields) if (!direct(value, field, type)) missing.push(`${label}.${field}`);
  }
  if (!direct(block(document, "ResidentPlanRecord"), "workflowDescriptor", "ResidentWorkflowDescriptorBinding")) missing.push("plan.workflowDescriptor");
  const descriptor = block(document, "ResidentWorkflowDescriptorBinding");
  for (const [field, type] of [["workflowDescriptorId", "string"], ["workflowDescriptorVersion", "string"], ["workflowDescriptorHash", "`sha256:${string}`"]]) if (!direct(descriptor, field, type)) missing.push(`descriptor.${field}`);
  const readback = section(document, "Plan-Binding Readback And Equality");
  const clauses = [
    ["exact mounted-ledger plan readback", "must read the exact `planRecordEventId` from the authoritative mounted\nledger"],
    ["exact descriptor ID/version/hash equality", "`workflowDescriptor` equality includes its exact descriptor ID, version, and\nhash;"],
    ["descriptor family/version rejection", "matching only the run mode, a descriptor family, or a compatible version\nis invalid."],
    ["fail-closed equality", "causation/correlation fails closed before the append or effect"]
  ];
  for (const [name, clause] of clauses) if (!readback.includes(clause)) missing.push(`plan-readback.${name}`);
  return missing;
};
const actual = inspect(spec);
const descriptorClause = "`workflowDescriptor` equality includes its exact descriptor ID, version, and\nhash; matching only the run mode, a descriptor family, or a compatible version\nis invalid.\n\n";
const counterfactuals = [
  ["optional observation contextPackRefs", replaceInBlock(spec, "ResidentObservationRecord", "readonly contextPackRefs:", "readonly contextPackRefs?:")],
  ["optional result sourceEventIds", replaceInBlock(spec, "ResidentLoopTerminalOrResumableResult", "readonly sourceEventIds: readonly string[];", "readonly sourceEventIds?: readonly string[];")],
  ["missing descriptor equality clause", spec.replace(descriptorClause, "")]
];
const missed = counterfactuals.filter(([, candidate]) => inspect(candidate).length === 0).map(([name]) => name);
if (actual.length > 0 || missed.length > 0) {
  console.error(`RED: Task 104 precise binding audit missing: ${[...actual, ...missed.map((name) => `counterfactual:${name}`)].join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 104 precise binding audit passed (3 records; ${counterfactuals.length} counterfactual omissions rejected).`);
'
```

- RED: before RC-104-02, a reproduction of RC-104-01-B's legacy audit exited
  1 with `RED: RC-104-01-B legacy audit accepts missing descriptor equality and
  optional contextPackRefs.` The legacy audit therefore could not prove the
  intended contract.
- Counterfactual RED requirements: the precise audit must reject (1) optional
  observation `contextPackRefs`, (2) optional result `sourceEventIds`, and
  (3) removal of the exact descriptor ID/version/hash equality clause.
- GREEN: the exact audit exited 0 with `GREEN: Task 104 precise binding audit
  passed (3 records; 3 counterfactual omissions rejected).`
- Whitespace: `git diff --check` and staged `git diff --cached --check` both
  exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 after its typecheck, test, UI
  build, and factory-readiness gates.
- Repair status: ready-for-review. This is the final permitted focused Task 104
  repair attempt; fresh model-pinned re-review remains required and no Task
  112, production work, dispatch, or merge is authorized.

## Coordinator Final Review, Lane Approval, and Integration

- Recorded at: `2026-07-12T21:33:25Z`.
- Final fresh review: independent reviewer `/root/review_task104_final`
  approved final repair commit `baa980e04f126ce06f41398fc45169f112321e39`.
  It confirmed that the section-local audit requires non-optional invariant
  fields, exact workflow descriptor ID/version/hash equality, and fail-closed
  language, while each documented counterfactual omission fails. The session
  used the user-confirmed GPT-5.6 Terra / Extra High configuration.
- Coordinator lane decision: under the Standing Coordinator Delegation at
  governing spec `811458d2094dc166b10b9255d1829eae73f2d08e`, Lane L's written
  specification is approved. This does not authorize Task 112 or production
  work; the Wave 0A lane-spec stop remains in force.
- Integration: coordinator branch
  `codex/resident-agent-full-vision-program-plan` merged the reviewed task
  branch with merge commit `0db0522d0476c75d15d587374d32463b321d296d`. No
  rebase was required; the branch was additive and merged without conflict. No
  merge into `neo` occurred.
- Coordinator verification: `git diff --check`, `npm run factory:check`, and
  `NODE_NO_WARNINGS=1 npm run verify` all exited 0 on the integrated checkout;
  the full verifier reported typecheck passed, 189 test files passed with 3
  skipped, 2,228 tests passed with 5 skipped, a successful Vite build with the
  existing chunk-size warning, and factory-readiness passed.
- Current status: `merged`. Archive remains coordinator-administered until the
  author/reviewer handoffs, clean worktree, branch ancestry, and durable
  registry evidence are all reconciled.
