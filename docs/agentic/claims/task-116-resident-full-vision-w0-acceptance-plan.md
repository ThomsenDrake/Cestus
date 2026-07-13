# Task 116 Claim: Resident Full-Vision Wave 0 Acceptance Implementation Plan

- Approved Lane A design: `docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md@eda08b6ca64ea48e405cc5ed83213630f8769d94`
- Governing umbrella design: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9dd351fc76df083df8f2222252ba73d89`
- Governing program plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`
- Task and lane: Task 116 / A / Wave 0B acceptance implementation plan
- Worker: fresh Codex Task 116 acceptance-plan author
- Branch: `codex/task-116-resident-full-vision-w0-acceptance-plan`
- Worktree: `/home/drake/.codex/worktrees/task-116-resident-full-vision-w0-acceptance-plan`
- Base commit: `beff02c05d3472cc79e7ccf411f77c33b7b64342`
- Claimed at: `2026-07-13T14:48:49Z`
- Model configuration: GPT-5.6 Terra / Extra High, satisfied for this task by
  the user-confirmed host-reported GPT-5 posture
- Status: in-progress

## Scoped Authorization and Ownership

The visible coordinator's RV-0-A-011 authorization permits Task 116 only:
create this claim and
`docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md`,
run documentation RED/GREEN as TDD, request a fresh review, and use
verification-before-completion. It explicitly permits
`superpowers:subagent-driven-development` where relevant and prohibits
self-review, self-integration, rebase, Task A-FIXTURE/A-01 through A-10
implementation, CF-1, production/runtime/test/UI/provider/shared-contract
work, provider invocation, credential access, browser/tailnet work, child
dispatch, and any merge into `neo`.

Only these two tracked files are owned. Every other tracked file is forbidden,
including the registry, acceptance matrix, specifications, templates,
production, tests, runtime, UI, provider, and shared-contract files.

## Documentation RED Evidence

Before the Task 116 plan existed, the following exact focused audit exited 1:

```bash
node --input-type=module <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const path = "docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md";
const requiredRows = new Map([
  ["A116-A01-MOUNTED-RESTART", "A-01 mounted authority, fresh process, zero fallback writes"],
  ["A116-A02-DISCONNECT-REVERIFY", "A-02 disconnect/reconnect every durable boundary"],
  ["A116-A03-COORDINATOR-NOUS", "A-03 coordinator-only live Nous safety posture"],
  ["A116-A04-LEGACY-PROPOSAL", "A-04 evidence-first proposal-only handoff"],
  ["A116-A05-TRIGGER-DRAFT", "A-05 idempotent trigger to draft-only PRR"],
  ["A116-A06-PLANNING-CONTRADICTION", "A-06 bounded advisory planning/contradiction handoff"],
  ["A116-A07-PROVIDER-PARITY", "A-07 BYOK/local model credential-free parity"],
  ["A116-A08-OFFICIAL-FEASIBILITY", "A-08 official subscription feasibility only"],
  ["A116-A09-BROWSER-TAILNET", "A-09 production DTO/browser-closed/served tailnet"],
  ["A116-A10-ADVERSARIAL", "A-10 cross-lane fail-closed adversarial matrix"],
  ["A116-MOUNTED-NO-FALLBACK", "mounted/no-fallback counterfactual"],
  ["A116-HANDOFF-PROVENANCE", "handoff/provenance counterfactual"],
  ["A116-PROVIDER-SECRET", "provider/secret counterfactual"],
  ["A116-BROWSER-SERVED", "browser/served-checkout counterfactual"],
  ["A116-LIVE-COORDINATOR", "coordinator-only live gate counterfactual"]
]);
if (!existsSync(path)) {
  console.error(`RED: Task 116 acceptance plan is absent; ${requiredRows.size} local acceptance controls are unproven.`);
  process.exit(1);
}
const text = readFileSync(path, "utf8");
const start = text.indexOf("## Section-Local Documentation Audit");
const end = text.indexOf("\n## ", start + 1);
const section = start < 0 ? "" : text.slice(start, end < 0 ? text.length : end);
const missing = [...requiredRows.keys()].filter((key) => !section.includes(key));
if (missing.length > 0) {
  console.error(`RED: Task 116 local acceptance controls missing (${missing.length}): ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 116 local acceptance controls present (${requiredRows.size}).`);
NODE
```

Observed result: exit `1` with `RED: Task 116 acceptance plan is absent; 15
local acceptance controls are unproven.` This is expected documentation RED
evidence, not a production verifier failure.

## Required Completion Evidence

Before one scoped documentation commit, this author must run the plan's
section-local audit, `git diff --check`, `npm run factory:check`, and
`npm run verify`; record only actual outcomes in a forward-only claim entry;
confirm the two-file scope; then stop for a different fresh reviewer. No
provider, credential, browser, tailnet, production, test, runtime, UI, shared
contract, acceptance-matrix, registry, CF-1, A-01 through A-10 implementation,
dispatch, integration, or `neo` merge authority follows from this claim.

## Documentation GREEN, Verification, and Ready-for-Review Record

- Recorded at: `2026-07-13T15:10:00Z`.
- Status: `ready-for-review`; this forward-only record supersedes the initial
  in-progress status for Task 116 execution only. It is not plan approval,
  CF-1 authority, implementation authority, or merge readiness.
- Documentation GREEN: the plan's exact section-local audit exited `0` and
  printed `GREEN: Task 116 section-local acceptance-plan audit passed (58
  direct local counterfactual mutations rejected).` It directly removed both
  the marker and semantic clause for each mounted/restart/no-fallback,
  provider/secret, handoff/provenance, browser/tailnet, coordinator-only live,
  ownership, and rollback/review control.
- Whitespace: `git diff --check` exited `0` with no output before this record.
- Factory: `npm run factory:check` exited `0` and printed
  `factory-readiness passed`.
- Dependency recovery: the first `npm run factory:check && npm run verify`
  attempt reached the factory gate but stopped before typecheck with
  `tsc: command not found`. `node_modules/.bin/tsc` was absent in this isolated
  worktree. `npm ci --ignore-scripts` restored lockfile-pinned ignored
  dependencies without tracked-file changes.
- Full verification: the fresh interactive `npm run verify` exited `0` after
  dependency recovery: `typecheck passed`; 189 test files passed with 3
  skipped; 2,228 tests passed with 5 skipped; the Vite build completed with its
  existing chunk-size warning; and `factory-readiness passed`. No provider,
  credential, browser, tailnet, or live command was invoked.
- Scope/self-review: the only changed tracked files are this append-only claim
  and the Task 116 acceptance implementation plan. The plan maps A-01 through
  A-10 to deterministic fixture/test ownership, direct failure injection,
  fresh-process mounted readback, no-fallback observation, approval/provenance,
  provider/secret safety, browser-closed production DTO parsing,
  served-checkout/tailnet procedure, coordinator-only Nous posture, CF-1
  dependency/rebase gates, review, rollback, and owner-directed defects.
- Stop point: a different fresh reviewer must lead with defects, missing
  coverage, spec drift, unsafe evidence, ownership conflict, and verification
  gaps before any coordinator plan approval or Task A-FIXTURE/A-01 through
  A-10 authorization. This author does not self-approve, integrate, rebase,
  dispatch, or merge into `neo`.
