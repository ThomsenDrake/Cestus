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

## RV-0-A-012 Scoped Repair Record — In Progress

- Recorded at: `2026-07-13T15:29:47Z`.
- Worker and branch: fresh Task 116 repair author on
  `codex/task-116-resident-full-vision-w0-acceptance-plan-repair` in
  `/home/drake/.codex/worktrees/task-116-resident-full-vision-w0-acceptance-plan-repair`,
  from exact base `eecc5298608f8a1014f56d8002f4a104a4ee77fd`.
- Status: `in-progress`; this forward-only repair record supersedes the prior
  ready-for-review status only while the RV-0-A-012 repair is evaluated. It is
  not implementation, CF-1, provider, browser/tailnet, production, review, or
  integration authority.
- Scope: modify only this append-only claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md`.
  No registry, matrix, specification, production, runtime, UI, provider,
  shared-contract, credential, browser, tailnet, or `neo` action is allowed.
- Reviewer findings to repair: add safe `commandIdentity`, retry posture, and
  fixed next-action evidence fields; pair A-01 through A-09 candidate tests
  with executable producer commands; make A-04/A-06 Nous gates conditional;
  require approved A-07 local compatibility and separate official A-08
  Codex/xAI-or-safe-unavailable gates; replace the whole-DTO token check with
  boundary-specific unsafe-material checks; assign A-FIXTURE/A-01 through A-10
  durable claim paths, statuses, and commit scopes; and counterfactually audit
  every repair control.
- Documentation RED: the exact repair audit exited `1` before editing and
  printed `RED: Task 116 repair controls missing (11): readonly commandIdentity:,
  readonly retryPosture:, readonly nextActionMarker:, ## Producer Precondition
  Commands, A116-A04-CONDITIONAL-NOUS, A116-A06-CONDITIONAL-NOUS,
  A116-A07-APPROVED-LOCAL-COMPATIBILITY,
  A116-A08-OFFICIAL-CODEX-XAI-GATES, ## Durable Acceptance Work Orders,
  A116-EVIDENCE-BOUNDARY-MATERIAL, boundary-specific evidence check`.
- Next evidence: run the strengthened plan-local audit, `git diff --check`,
  `npm run factory:check`, and `npm run verify`; append only their actual
  results, commit the two-file repair once, and stop for a different fresh
  re-review.

## RV-0-A-012 Scoped Repair Record — Ready For Fresh Review

- Recorded at: `2026-07-13T15:33:14Z`.
- Status: `ready-for-review`; this is repair completion evidence only. It does
  not approve the plan, authorize CF-1/A-FIXTURE/A-01 through A-10, invoke a
  provider, or permit integration, rebase, child dispatch, or a merge into
  `neo`.
- Repair GREEN: the exact strengthened section-local audit exited `0` and
  printed `GREEN: Task 116 section-local acceptance-plan audit passed (146
  direct local counterfactual mutations rejected).` It validates the original
  contract rows plus the exact evidence fields, A-01 through A-09 producer
  commands, A-04/A-06 conditional Nous gates, A-07 local compatibility,
  A-08 official Codex/xAI gates, boundary-specific material checks, and every
  A-FIXTURE/A-01 through A-10 work-order row in their owning plan sections.
- Whitespace: `git diff --check` exited `0` with no output before this record.
- Factory: `npm run factory:check` exited `0` and printed
  `factory-readiness passed`.
- Dependency recovery: the first required `npm run verify` attempt exited
  before typecheck with `sh: line 1: tsc: command not found`; this isolated
  repair worktree lacked `node_modules/.bin/tsc`. `npm ci --ignore-scripts`
  restored lockfile-pinned ignored dependencies and left tracked-file scope
  unchanged.
- Full verification: the clean non-overlapping rerun of `npm run verify` exited
  `0`: `typecheck passed`; 189 test files passed with 3 skipped; 2,228 tests
  passed with 5 skipped; Vite built with the existing chunk-size warning; and
  `factory-readiness passed`. SQLite experimental warnings were emitted by test
  workers only. No provider, credential, browser, tailnet, or live command was
  invoked.
- Scope and handoff: only this append-only claim and the Task 116 acceptance
  plan are changed. A different fresh reviewer must now lead with defects,
  missing tests, spec drift, unsafe evidence, claim/ownership conflicts, and
  verification gaps. This repair author does not self-review, integrate,
  rebase, dispatch, or merge.

## RV-0-A-012 Final Verification Addendum

- Recorded at: `2026-07-13T15:35:22Z`.
- Final checkout verification: the final non-overlapping `npm run verify`
  process exited `0` after the ready-for-review record. It printed `typecheck
  passed`; 189 test files passed with 3 skipped; 2,228 tests passed with 5
  skipped; `tests passed`; a successful Vite build with its existing
  chunk-size warning; and `factory-readiness passed`. SQLite experimental
  warnings were emitted by test workers only.
- Final documentation checks: the exact plan-local audit still printed
  `GREEN: Task 116 section-local acceptance-plan audit passed (146 direct local
  counterfactual mutations rejected).`; `git diff --check` exited `0`; and
  `npm run factory:check` printed `factory-readiness passed`.
- Commit/stop: make one commit containing exactly the two owned documentation
  files, preserve the task-scoped branch and harness-owned worktree for a
  different fresh reviewer, and stop. No merge, push, rebase, cleanup, or
  `neo` action is authorized.

## RV-0-A-013 Audit-Only Repair Record — In Progress

- Recorded at: `2026-07-13T15:48:36Z`.
- Worker and branch: fresh Task 116 audit-only repair author on
  `codex/task-116-resident-full-vision-w0-acceptance-audit-repair` in
  `/home/drake/.codex/worktrees/task-116-resident-full-vision-w0-acceptance-audit-repair`,
  from exact base `ae8ecd0dfb2633a5ddce446c48e05084225d90e4`.
- Status: `in-progress`; this forward-only audit record supersedes the prior
  ready-for-review status only while the RV-0-A-013 repair is evaluated. It is
  not implementation, CF-1, provider, browser/tailnet, production, review, or
  integration authority.
- Scope: modify only this append-only claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-acceptance-implementation.md`.
  No registry, matrix, specification, production, runtime, UI, provider,
  shared-contract, credential, browser, tailnet, dispatch, rebase, or `neo`
  action is allowed.
- Required audit repair: preserve accepted substantive content while making the
  plan-local audit reject a widened `AcceptanceCommandIdentity = string`, a
  changed work-order `ready-for-review` status, removal of both positive
  `assertNoUnsafeProviderReadinessMaterial` calls, weakened A-04/A-06
  unselected/no-substitute clauses, and any A-07 fallback permission.

## RV-0-A-013 Audit-Only Repair Record — Ready For Fresh Review

- Recorded at: `2026-07-13T15:59:27Z`.
- Status: `ready-for-review`; this is audit-only repair completion evidence. It
  does not approve the plan, authorize CF-1/A-FIXTURE/A-01 through A-10,
  invoke a provider, or permit integration, rebase, child dispatch, or a merge
  into `neo`.
- Documentation RED: before the repair, the exact mutation harness ran the
  embedded plan audit against six in-memory counterfactuals and exited `1` with
  `RED: Task 116 audit let 6 required counterfactuals escape:` followed by
  widened command identity, changed A-01 review status, both positive provider
  boundary calls removed, weakened A-04, weakened A-06, and A-07 fallback
  permission.
- Documentation GREEN: the repaired embedded audit exited `0` and printed
  `GREEN: Task 116 section-local acceptance-plan audit passed (168 direct local
  counterfactual mutations rejected).` The same external mutation harness then
  exited `0` and printed `GREEN: Task 116 audit rejects every RV-0-A-013
  counterfactual.` The audit now extracts the real A-07/A-08 task section,
  locks the exact command-identity union and every work-order review status,
  preserves both positive readiness-boundary calls, and rejects each required
  A-04/A-06/A-07 weakening directly.
- Whitespace: `git diff --check` exited `0` with no output before this record.
- Factory: `npm run factory:check` exited `0` and printed
  `factory-readiness passed`.
- Dependency recovery: the first fresh `npm run verify` stopped before
  typecheck with `sh: line 1: tsc: command not found` because this isolated
  worktree lacked ignored dependencies. `npm ci --ignore-scripts` restored the
  lockfile-pinned dependencies with no tracked-file changes.
- Full verification: the post-recovery `npm run verify` exited `0`:
  `typecheck passed`; 189 test files passed with 3 skipped; 2,228 tests passed
  with 5 skipped; Vite built with the existing chunk-size warning; and
  `factory-readiness passed`. No provider, credential, browser, tailnet, or
  live command was invoked.
- Scope and handoff: only this append-only claim and the Task 116 acceptance
  plan are changed. A different fresh reviewer must now lead with defects,
  missing tests, spec drift, unsafe audit gaps, claim/ownership conflicts, and
  verification gaps. This audit author does not self-review, integrate, rebase,
  dispatch, or merge.
