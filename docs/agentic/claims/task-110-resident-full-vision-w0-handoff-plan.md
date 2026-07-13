# Task 110 Resident Full-Vision Wave 0 Handoff Plan Claim

Status: in-progress

Branch: `codex/task-110-resident-full-vision-w0-handoff-plan`

Base: `2d26a51f46c679c43ab519e21d0118e948289909`

Approved Lane Spec: `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md@5a80480c93920a37df45bd606ea12e0fe57e1e2d`

Governing Program Plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`

Coordinator Authorization: Task 110 only. Documentation RED/GREEN,
`superpowers:subagent-driven-development`, fresh review, and
verification-before-completion are authorized. Stop after a verified plan
commit and fresh plan review; Task 119, all production/test/runtime/UI changes,
provider calls, CF-1 dispatch, and merging into `neo` are not authorized.

## Scope

- `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
- This claim

All other files are forbidden, including shared contracts, source, tests,
runtime, UI, provider configuration, specifications, program plan, registry,
and templates.

## Documentation RED

Command:

```bash
node --input-type=module - <<'NODE'
import fs from "node:fs";
const path = "docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md";
if (!fs.existsSync(path)) {
  console.error("RED: Task 110 plan is absent");
  process.exit(1);
}
const text = fs.readFileSync(path, "utf8").toLowerCase();
const required = [
  "prr negotiation",
  "investigation planner",
  "ontology bootstrap",
  "mountedhandoffstore",
  "handoffreadback",
  "residenthandoffdto",
  "failure injection",
  "npm run agent:nous:smoke",
  "rollback",
  "cf-1"
];
const missing = required.filter((needle) => !text.includes(needle));
if (missing.length > 0) {
  console.error(`RED: missing Task 110 coverage: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("GREEN: Task 110 coverage audit passed");
NODE
```

Observed result: pending; the plan did not exist when this claim was created.

## Documentation GREEN And Verification

- Run the same focused coverage audit after plan completion.
- Run `git diff --check`.
- Run `npm run factory:check`.
- Run `npm run verify`.
- Record exact exit outcomes before committing.

## Review And Handoff

- Fresh plan review: pending coordinator dispatch after the verified commit.
- Coordinator lane-plan approval: pending.
- Merge: forbidden for this worker; never merge into `neo`.

## Append-Only Execution Evidence

- Initial documentation RED at 2026-07-13T00:25Z: the focused audit exited 1
  with `RED: Task 110 plan is absent`, as required before the plan existed.
- First post-draft audit at 2026-07-13T00:26Z exposed case-sensitive audit
  coverage wording (`Investigation planner`, `Ontology bootstrap`); the audit
  was corrected to compare normalized text without changing the plan's
  requirements. This is documentation-audit repair evidence, not a product
  contract change.
- Documentation GREEN at 2026-07-13T00:26Z: focused audit exited 0 with
  `GREEN: Task 110 coverage audit passed`; `git diff --check` exited 0; and
  `npm run factory:check` exited 0 with `factory-readiness passed`.
- Environment recovery at 2026-07-13T00:26Z: the first `npm run verify` could
  not start because this isolated worktree lacked `node_modules` and reported
  `sh: line 1: tsc: command not found`. The coordinator authorized
  `npm ci --ignore-scripts`; it exited 0 and made no tracked dependency change.
- First runnable full verify at 2026-07-13T00:27Z: typecheck passed, but one
  unrelated UI integration assertion failed at
  `packages/ui/test/agent-app-integration.test.tsx:343` while 188 test files
  and 2,227 tests passed. The isolated file immediately passed 13/13; this
  documentation-only branch has no UI diff, so the evidence indicates a
  timing/concurrency flake rather than a Task 110 regression. No forbidden UI
  repair was attempted.
- Fresh full verification at 2026-07-13T00:28Z: `npm run verify` exited 0;
  typecheck passed; 189 test files passed with 3 skipped; 2,228 tests passed
  with 5 skipped; Vite built with the existing chunk-size warning; and
  factory-readiness passed.
- Final post-recording verification at 2026-07-13T00:29Z: `git diff --check`,
  `npm run factory:check`, and `npm run verify` all exited 0. Full verification
  again reported typecheck passed, 189 test files passed with 3 skipped, 2,228
  tests passed with 5 skipped, the existing Vite chunk-size warning, and
  factory-readiness passed.

## Status Transition

Status: ready-for-fresh-review

The worker has not self-approved, integrated, or merged into `neo`. A fresh,
model-pinned plan reviewer and coordinator lane-plan approval remain required.

## Append-Only Repair RC-110-01 — Contract Alignment And Section-Local Audit

Repair branch: `codex/task-110-resident-full-vision-w0-handoff-plan-repair`

Repair base: `e6349810405640a8379a02e63f51ebf79541dd31`

Coordinator authorization: exact approved Lane H specification
`docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md@5a80480c93920a37df45bd606ea12e0fe57e1e2d`
and governing program plan
`docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`;
allowed range is Task 110 contract-alignment and audit-strengthening repair
only. The wave stop is this verified repair commit plus fresh re-review. The
coordinator explicitly authorized `superpowers:subagent-driven-development`,
documentation RED/GREEN as TDD, fresh review, and verification-before-
completion. Task 119, Tasks 121–123/138, CF-1 implementation, production work,
provider invocation, and every merge are outside this repair; this worker must
not merge into `neo` or an integration branch. GPT-5.6 Terra / Extra High is
user-confirmed for this child; a reported GPT-5 identity is accepted under the
user's standing direction.

Root cause verified against RV-0-H-004 and the approved sources: the original
plan invented a Task 119 producer although the governing Wave 1 table starts at
Task 120 and makes Tasks 121–123 direct CF-1 consumers. It also omitted the
approved browser-safe DTO's status, state kind, safe summary, source/related
event identities, approval requirements, and safe next actions; the example
claimed an unapproved projection member. Its document-global audit could not
prove that removing a local migration gate, safe interface field, failure
matrix, provider gate, rollback rule, or ownership boundary was rejected.

### Documentation RED

The section-local audit below was first run against
`PLAN_REF=e6349810405640a8379a02e63f51ebf79541dd31`. It exited 1 and printed
19 defects, including the invented Task 119,
non-CF-1 dependencies for Tasks 121–123, the missing safe DTO fields, the
unapproved projection member, absent migration/runtime failure ownership, and
absent forward-only rollback proof. This demonstrated the review finding before
the plan was changed.

### Documentation GREEN

Command (leave `PLAN_REF` unset for the repaired worktree; set it to the repair
base above to reproduce RED):

```bash
node --input-type=module - <<'NODE'
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const path = "docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md";
const source = process.env.PLAN_REF
  ? execFileSync("git", ["show", `${process.env.PLAN_REF}:${path}`], { encoding: "utf8" })
  : fs.readFileSync(path, "utf8");
const section = (text, title) => {
  const start = text.indexOf(`## ${title}`);
  const end = start < 0 ? -1 : text.indexOf("\n## ", start + title.length + 3);
  return start < 0 ? "" : text.slice(start, end < 0 ? text.length : end);
};
const interfaceBlock = (text, name) =>
  new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`, "m").exec(text)?.[0] ?? "";
const audit = (text) => {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  const ownership = section(text, "File Ownership And Interfaces");
  const migrations = [
    ["121", section(text, "Task 121: PRR Negotiation Draft Handoff Migration")],
    ["122", section(text, "Task 122: Investigation Planner Handoff Migration")],
    ["123", section(text, "Task 123: Ontology Bootstrap Proposal Handoff Migration")]
  ];
  const runtime = section(text, "Task 138: Mounted Runtime Projection And Strict Browser Boundary");
  const failureMatrix = section(text, "Deterministic Failure Injection Matrix");
  const merge = section(text, "Merge, Rebase, Review, And Live Gates");
  const rollback = section(text, "Rollback And Stop Conditions");
  const readback = interfaceBlock(ownership, "HandoffReadback");
  const dto = interfaceBlock(ownership, "ResidentHandoffDto");
  const projection = interfaceBlock(ownership, "SpecialistHandoffProjection");

  need(!/\bTask 119\b/.test(text), "invented Task 119 is present");
  need(!/selectedHandoffDto/.test(text), "unapproved projection member is present");
  need(/\| 121 \| CF-1 \|/.test(ownership) && /\| 122 \| CF-1 \|/.test(ownership) && /\| 123 \| CF-1 \|/.test(ownership), "121–123 are not CF-1-only consumers");
  need(/\| 138 \| 121–123 \+ R Task 135 \|/.test(ownership), "138 does not depend on 121–123 plus R 135");
  need(/CF-1 is the sole shared-contract freeze/.test(ownership), "shared ownership escaped CF-1");
  for (const [task, block] of migrations) {
    need(/\*\*Dependencies:\*\* CF-1 is merged/.test(block), `Task ${task} lacks its CF-1 dependency`);
    need(/\*\*Step 1: RED/.test(block) && /\*\*Step 2: GREEN/.test(block), `Task ${task} lacks local RED/GREEN`);
    need(/new CF-1 revision/.test(block), `Task ${task} does not return shared changes to CF-1`);
  }
  need(/\*\*Dependencies:\*\* approved\/reviewed Tasks 121–123; R Task 135/.test(runtime), "138 lacks its approved order");
  for (const field of [
    'readonly outcome: "verified" | "resumable" | "legacy-unbound" | "unavailable" | "inconsistent";',
    "readonly runId: string;", "readonly taskId?: string;", "readonly handoffId?: string;",
    'readonly manifestSchemaVersion?: "agent-specialist-handoff-manifest.v1" | "agent-specialist-handoff-manifest.v2";',
    "readonly manifestHash?: `sha256:${string}`;", "readonly finalOutputStepId?: string;",
    "readonly finalOutputEventId?: string;", "readonly preparedEventId?: string;",
    "readonly recordedEventId?: string;", "readonly terminalRunEventId?: string;",
    "readonly taskStatusEventId?: string;", "readonly authorityBinding?: HandoffAuthorityBinding;",
    "readonly diagnostics: readonly HandoffDiagnosticDto[];"
  ]) need(readback.includes(field), `HandoffReadback lacks ${field}`);
  for (const field of [
    'readonly status?: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";',
    'readonly stateKind?: "completed" | "failed" | "resumable";', "readonly safeSummary?: string;",
    "readonly artifactRefs: readonly SafeHandoffArtifactRef[];", "readonly sourceEventIds: readonly string[];",
    "readonly relatedEventIds: readonly string[];", "readonly approvalRequirements: readonly SafeApprovalRequirement[];",
    "readonly nextSafeActions: readonly SafeNextAction[];", "readonly diagnostics: readonly HandoffDiagnosticDto[];"
  ]) need(dto.includes(field), `ResidentHandoffDto lacks ${field}`);
  need(/readonly selectedReadback: HandoffReadback;/.test(projection) && /readonly history: readonly HandoffReadback\[\];/.test(projection), "projection lacks approved readback/history");
  need(/121–123/.test(failureMatrix) && /138 adapter/.test(failureMatrix), "failure matrix omits migrations or runtime projection");
  need(/coordinator alone may run `npm run agent:nous:smoke`/.test(merge), "live Nous gate is missing or not coordinator-only");
  need(/Rollback is forward-only/.test(rollback) && /append a causally linked v2 supersession or repair\s+event/.test(rollback), "forward-only rollback is missing");
  return failures;
};
const counterfactual = (label, mutate) => {
  if (audit(mutate(source)).length === 0) throw new Error(`counterfactual escaped audit: ${label}`);
  console.log(`counterfactual rejected: ${label}`);
};
const failures = audit(source);
if (process.env.PLAN_REF) {
  if (failures.length === 0) throw new Error("RED expected the reviewed defects");
  console.error(`RED: ${failures.length} reviewed defects rejected.`);
  process.exit(1);
} else {
  if (failures.length > 0) throw new Error(`GREEN failed: ${failures.join("; ")}`);
  counterfactual("invented Task 119", (value) => value.replace("## Task 121", "## Task 119"));
  counterfactual("removed CF-1 dependency", (value) => value.replace("**Dependencies:** CF-1 is merged", "**Dependencies:** prerequisite is merged"));
  counterfactual("removed safe DTO status", (value) => value.replace('  readonly status?: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";\n', ""));
  counterfactual("removed Task 122 RED", (value) => value.replace(/(## Task 122:[\s\S]*?)- \[ \] \*\*Step 1: RED\.\*\*/, "$1- [ ] **Step 1: omitted**"));
  counterfactual("removed failure injection", (value) => value.replace("## Deterministic Failure Injection Matrix", "## Omitted Failure Injection Matrix"));
  counterfactual("removed live Nous gate", (value) => value.replace("coordinator alone may run `npm run agent:nous:smoke`", "worker may run a provider"));
  counterfactual("removed rollback", (value) => value.replace("Rollback is forward-only", "Rollback is unspecified"));
  counterfactual("shared ownership escape", (value) => value.replace("CF-1 is the sole shared-contract freeze: it reserves", "a workflow owns a shared contract and reserves"));
  console.log("GREEN: Task 110 section-local audit passed (8 counterfactual omissions rejected).");
}
NODE
```

Observed GREEN at 2026-07-13T00:52Z: the audit exited 0 and rejected all eight
counterfactuals: invented Task 119, removed CF-1 dependency, missing safe DTO
status, missing Task 122 RED, missing failure injection, missing coordinator-
only live Nous gate, missing forward-only rollback, and a shared-ownership
escape. This checks named sections and extracted interface blocks rather than
counting document-global substrings.

### Verification And Handoff

- `git diff --check`, `npm run factory:check`, and `npm run verify`: pending
  after this append-only repair evidence is added; record fresh command output
  below before committing.
- Fresh review: required from a new reviewer after the repair commit; this
  repairer has not self-approved.
- Status transition: `ready-for-fresh-review` only after the fresh verification
  evidence and repair commit are present. Coordinator lane-plan approval and
  integration remain pending.

### Fresh Repair Verification Evidence

- Worktree dependency recovery: the first repair-owned `npm run verify` exited
  127 with `tsc: command not found`. Inspection confirmed that only this
  worktree lacked `node_modules/.bin/tsc`; `package-lock.json` existed and only
  the two authorized documentation files were modified. `npm ci --ignore-scripts`
  then exited 0 without a tracked dependency or lockfile change.
- Documentation RED: the claim command with
  `PLAN_REF=e6349810405640a8379a02e63f51ebf79541dd31` exited 1 and printed
  `RED: 19 reviewed defects rejected.` before the repair was accepted.
- Documentation GREEN: the same claim command against the repaired worktree
  exited 0 and printed `GREEN: Task 110 section-local audit passed (8
  counterfactual omissions rejected).`
- `git diff --check` exited 0; `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Fresh `npm run verify` exited 0: typecheck passed; 189 test files passed with
  3 skipped; 2,228 tests passed with 5 skipped; Vite production build passed
  with its existing chunk-size warning; factory readiness passed. Node emitted
  the existing experimental SQLite warnings during tests; no Task 110 source or
  test file changed.
- Repair status: `ready-for-fresh-review`. The repairer has not self-approved,
  merged, dispatched a production task, invoked a provider, or merged into
  `neo`. A fresh independent reviewer remains mandatory.
