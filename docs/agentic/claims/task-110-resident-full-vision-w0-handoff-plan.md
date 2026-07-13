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
