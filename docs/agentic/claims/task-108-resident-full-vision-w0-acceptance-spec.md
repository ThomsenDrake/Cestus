# Task 108 Claim: Resident Full-Vision Wave 0A Acceptance Architecture Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 108 / A / Wave 0A
- Worker: Codex Task 108 acceptance-architecture specification author
- Branch: `codex/task-108-resident-full-vision-w0-acceptance-spec`
- Worktree: `/home/drake/.codex/worktrees/task-108-resident-full-vision-w0-acceptance-spec`
- Base commit: `e165bb458c4bafd7b24baa8345a7871feeba8a9d`
- Claimed at: `2026-07-12T22:00:00Z`
- Host configuration: GPT-5.6 Terra / Extra High, user-confirmed for this task
- Status: claimed

## Authorization and Scope

The coordinator-issued authorization under the Standing Coordinator Delegation
authorizes Task 108 only: a Lane A Wave 0A acceptance-architecture
specification, its documentation RED/GREEN evidence, fresh review, and
verification-before-completion. It authorizes
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 116 or later, an
implementation plan, acceptance-test implementation, provider invocation,
credential use, production/runtime/UI/shared-contract changes, or a merge into
`neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md`
- `docs/agentic/claims/task-108-resident-full-vision-w0-acceptance-spec.md`

Every other tracked file is forbidden, including the program registry and
acceptance matrix. This pre-CF-1 specification proposes acceptance interfaces
only: it does not freeze event names, DTO versions, capability signatures,
fixtures, commands, or ownership already assigned to another lane.

## Governing Invariants

- `agent_default` remains the sole resident identity; provider, model,
  credential, and harness values remain backends only.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. Disconnect or identity mismatch permits no internal
  fallback ledger, projection, artifact, derivative, or handoff write.
- Ledger history remains append-only; projections remain rebuildable; every
  handoff and terminal-looking outcome requires exact durable readback and
  provenance binding.
- Deterministic acceptance is credential-free. A real approved Nous provider
  gate is coordinator-only and records only safe IDs, hashes, event IDs,
  counts, categories, and fixed markers.
- Approval consumption remains independent and current; secret safety applies
  to all artifacts, diagnostics, DTOs, logs, live evidence, and fixtures.
- Newsroom/team scope, shared hosting, autonomous external effects, and
  implementation ownership outside Lane A are out of scope.

## Required Evidence and Stop Point

- Documentation RED: record a reproducible audit that fails while the
  acceptance architecture is absent or does not cover mounted storage, fresh
  process restart, failure injection, real approved Nous, browser DTO parity,
  served-checkout tailnet verification, ownership, and pre-CF-1 limits.
- Documentation GREEN: run the same audit after the specification is written,
  then run `git diff --check` and `npm run factory:check`.
- Full verification: run `npm run verify` before the Task 108 specification
  commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: one committed Lane A specification and claim, then stop for fresh
  review and written coordinator A-spec approval. Do not create Task 116,
  dispatch an implementation worker, or begin implementation planning.

## Documentation RED/GREEN Evidence

Documentation RED, GREEN, full-verification, self-review, and fresh-review
evidence are appended forward-only after the focused audit and scoped
specification commit. No claim status may imply lane approval or merge
readiness before the independent review verdict.

## Task Execution Record

- Recorded at: `2026-07-12T22:05:00Z`
- Status: `in-progress`; this forward-only record supersedes the initial claim
  status for Task 108 execution only.
- Scope check: only the two owned documentation files have been changed. No
  production, test, runtime, UI, provider, matrix, registry, shared-contract,
  or implementation-plan file is owned or changed.

### Documentation RED

The following focused documentation audit was run before the owned
specification existed:

```bash
node --input-type=module - <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md";
const required = [
  "# Resident Agent Acceptance Architecture Design",
  "## Scope, Non-Goals, And Pre-CF-1 Boundary",
  "## Acceptance Evidence Model",
  "## Mounted Workspace And Fresh-Process Restart Acceptance",
  "## Failure-Injection Architecture",
  "## Coordinator-Only Real Nous Provider Gate",
  "## Durable Handoff And Provenance Readback",
  "## Browser DTO, Browser-Closed, And Tailnet Acceptance",
  "## Secret-Safe Evidence And Diagnostics",
  "## Acceptance Ownership, Defect Routing, And CF-1 Inputs",
  "## Sequencing, Review Gate, And Stop Point",
  "agent_default", "no internal fallback", "credential-free",
  "real approved Nous", "served checkout", "fresh child process",
  "independent human approval", "append-only", "rebuildable",
  "newsroom/team", "A-01", "A-10",
  "same workspace identity, ledger high-water mark, mounted artifact store, policy, and active locks",
  "instrumented internal fallback sentinel",
  "no raw prompt text, source bytes, provider bodies, credentials, or secrets",
  "defects return to the owning lane", "does not freeze shared contracts"
];
if (!existsSync(path)) {
  console.error(`RED acceptance-architecture audit: ${path} is absent; ${required.length} required assertions are untestable.`);
  process.exit(1);
}
const text = readFileSync(path, "utf8");
const missing = required.filter((needle) => !text.includes(needle));
if (missing.length > 0) {
  console.error(`RED acceptance-architecture audit: missing ${missing.length} assertion(s): ${missing.join(" | ")}`);
  process.exit(1);
}
console.log(`GREEN acceptance-architecture audit: ${required.length} required assertions present.`);
NODE
```

Observed result: exit `1` before the specification existed, with `RED
acceptance-architecture audit:
docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md is
absent; 28 required assertions are untestable.` This is the expected missing
architecture control, not a verifier failure.

### Documentation GREEN and Verification

The identical focused audit exited `0` after the Lane A specification was
written and printed `GREEN acceptance-architecture audit: 28 required
assertions present.` It verifies the required acceptance boundaries, one
resident identity, mounted-only restart/reconnect, no-fallback sentinel,
credential-free deterministic posture, coordinator-only real approved Nous
gate, independent approval consumption, handoff readback, browser/tailnet
coverage, secret-safe evidence, explicit defect routing, and CF-1 limits.

`git diff --check` exited `0` with no output. `npm run factory:check` exited
`0` and printed `factory-readiness passed`.

The first `npm run verify` attempt was blocked before typechecking because the
isolated worktree lacked lockfile-pinned dependencies: `tsc: command not
found`. `npm ci --ignore-scripts` restored the ignored dependency tree without
tracked-file changes. The fresh rerun of `npm run verify` exited `0`: typecheck
passed; 189 test files passed with 3 skipped; 2,228 tests passed with 5
skipped; the Vite build completed with its existing chunk-size warning; and
factory-readiness passed. No provider was invoked.

## Specification Self-Review and Handoff

- Recorded at: `2026-07-12T22:10:00Z`
- Status: `ready-for-review`; this record supersedes the prior execution status
  without claiming lane approval, merge readiness, or Task 116 authority.
- Coverage: the specification defines `A-01` through `A-10`, actual mounted
  storage, fresh-process reconstruction, disconnect/reconnect, bounded failure
  injection, real Nous posture, durable handoff/provenance readback,
  production-shaped browser DTOs, browser-closed supervision, and rebuilt
  served-checkout tailnet verification.
- Invariants: it keeps one resident identity, authoritative mounted storage,
  append-only/rebuildable state, independent approval consumption, no fallback
  writes, durable readback, strict secret safety, and advisory-only workflow
  output explicit.
- Ownership: it assigns producers to R, H, W, L, T, P, and U; reserves shared
  contract reconciliation for CF-1; and keeps A limited to acceptance and
  defect routing.
- Scope: newsroom/team work, multi-user authority, shared hosting, external
  effects, credential use, provider invocation, implementation planning, and
  production/test/runtime/UI changes remain out of scope.
- Review and stop: a fresh independent Task 108 review remains mandatory. This
  author does not self-approve, create an implementation plan, dispatch an
  implementation worker, invoke Nous, merge into `neo`, or begin Task 116.

## Repair RC-108-01 — Browser Acceptance Audit Strengthening

- Repair authorization: coordinator-issued Task 108 acceptance-specification
  audit-strengthening repair only. It permits documentation RED/GREEN, fresh
  review, and verification-before-completion, but prohibits Task 116,
  production work, provider invocation, and a merge into `neo`.
- Recorded at: `2026-07-12T22:20:00Z`.
- Status: `repairing`; this forward-only record supersedes the prior
  ready-for-review status only while the scoped repair is verified and
  independently re-reviewed.
- Repair scope: preserve the acceptance architecture and strengthen only this
  claim's audit evidence. No shared contract, fixture, browser, runtime, or
  production ownership changes are introduced.

### Browser Audit RED

The legacy audit checked document-global tokens. Its browser heading remained
present after this counterfactual removed the complete browser-section body, so
all old tokens still matched elsewhere in the document. The following
reproduction exited `1` before this repair because the old audit accepted that
loss of browser acceptance behavior:

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const specPath = "docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md";
const text = readFileSync(specPath, "utf8");
const legacyRequired = [
  "# Resident Agent Acceptance Architecture Design",
  "## Scope, Non-Goals, And Pre-CF-1 Boundary",
  "## Acceptance Evidence Model",
  "## Mounted Workspace And Fresh-Process Restart Acceptance",
  "## Failure-Injection Architecture",
  "## Coordinator-Only Real Nous Provider Gate",
  "## Durable Handoff And Provenance Readback",
  "## Browser DTO, Browser-Closed, And Tailnet Acceptance",
  "## Secret-Safe Evidence And Diagnostics",
  "## Acceptance Ownership, Defect Routing, And CF-1 Inputs",
  "## Sequencing, Review Gate, And Stop Point",
  "agent_default", "no internal fallback", "credential-free",
  "real approved Nous", "served checkout", "fresh child process",
  "independent human approval", "append-only", "rebuildable",
  "newsroom/team", "A-01", "A-10",
  "same workspace identity, ledger high-water mark, mounted artifact store, policy, and active locks",
  "instrumented internal fallback sentinel",
  "no raw prompt text, source bytes, provider bodies, credentials, or secrets",
  "defects return to the owning lane", "does not freeze shared contracts"
];
const heading = "## Browser DTO, Browser-Closed, And Tailnet Acceptance";
const start = text.indexOf(heading);
const bodyStart = text.indexOf("\n", start) + 1;
const next = text.indexOf("\n## ", bodyStart);
if (start < 0 || bodyStart <= start || next < 0) throw new Error("browser section is not extractable");
const browserBodyDeleted = text.slice(0, bodyStart) + "\n" + text.slice(next);
const missing = legacyRequired.filter((needle) => !browserBodyDeleted.includes(needle));
if (missing.length === 0) {
  console.error("RED: legacy document-global audit accepts a browser-section body deletion.");
  process.exit(1);
}
console.error(`RED setup invalid: legacy audit already rejects deletion: ${missing.join(" | ")}`);
process.exit(2);
NODE
```

Observed result: `RED: legacy document-global audit accepts a browser-section
body deletion.` The failure demonstrates the audit defect; it is not a
specification-architecture failure.

### Browser Section Boundary Audit

This exact audit extracts the browser section and requires its local contract.
It rejects a body deletion and five independent weakenings: production DTO
parity, supported-command truthfulness, no-effect control truthfulness,
browser-closed supervision, and served-checkout/tailnet verification.

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-acceptance-design.md";
const text = readFileSync(path, "utf8");
const heading = "## Browser DTO, Browser-Closed, And Tailnet Acceptance";
const sectionRange = (document) => {
  const start = document.indexOf(heading);
  if (start < 0) return undefined;
  const bodyStart = document.indexOf("\n", start) + 1;
  const next = document.indexOf("\n## ", bodyStart);
  if (bodyStart <= start || next < 0) return undefined;
  return { start, bodyStart, end: next };
};
const browserSection = (document) => {
  const range = sectionRange(document);
  return range ? document.slice(range.start, range.end) : "";
};
const replaceBrowser = (document, from, to) => {
  const range = sectionRange(document);
  if (!range) return document;
  const section = document.slice(range.start, range.end);
  return document.slice(0, range.start) + section.replace(from, to) + document.slice(range.end);
};
const required = [
  ["production-shaped DTO parity", /production-shaped runtime route payloads,\s+not reduced fixtures/],
  ["runtime-projection and adversarial DTO rejection", /derive from the runtime projection, preserve run\/task association, and reject\s+stale, forged, absent, secret-bearing, and cross-run values/],
  ["supported-command truthfulness", /Every\s+visible\s+control\s+invokes\s+only\s+a\s+route\s+command\s+actually\s+supported\s+by\s+the\s+merged\s+runtime/],
  ["exact effect labels", /labels must name the exact effect/],
  ["no-effect control truthfulness", /may not present an approval request or lifecycle append as an\s+executing operation/],
  ["browser-closed supervision", /closing the browser must not end the W-owned supervised resident/],
  ["browser-closed readback", /safe runtime projection\/readback proves whether it remains running, paused, or\s+resumable/],
  ["served-checkout source", /Tailnet inspection runs from the served checkout, not a source checkout or a\s+development server/],
  ["served commit rebuild", /rebuilds the exact commit that is served/],
  ["served commit evidence", /records that served commit in safe evidence/],
  ["desktop mobile tailnet inspection", /inspects desktop and mobile\s+views plus tailnet route behavior/],
  ["tailnet parity and safe availability", /route\/DTO parity, supported\s+control semantics, workspace-unavailable visibility, no secret\/mount leakage/],
  ["truthful deployment failure", /A stale build, a different served SHA, an unavailable route, or\s+a DTO parser fallback is a blocked\/failing deployment gate, not a visual pass/]
];
const inspect = (document) => {
  const section = browserSection(document);
  const missing = [];
  if (!section) return ["browser section missing or not extractable"];
  for (const [name, pattern] of required) if (!pattern.test(section)) missing.push(name);
  return missing;
};
const range = sectionRange(text);
if (!range) throw new Error("browser section is not extractable");
const bodyDeleted = text.slice(0, range.bodyStart) + "\n" + text.slice(range.end);
const counterfactuals = [
  ["browser-section body deletion", bodyDeleted],
  ["reduced DTO fixture", replaceBrowser(text, /production-shaped runtime route payloads,\s+not reduced fixtures/, "reduced fixture route payloads")],
  ["unsupported control command", replaceBrowser(text, /Every\s+visible\s+control\s+invokes\s+only\s+a\s+route\s+command\s+actually\s+supported\s+by\s+the\s+merged\s+runtime/, "Every visible control may invoke an unrelated route command")],
  ["truthless lifecycle control", replaceBrowser(text, /may not present an approval request or lifecycle append as an\s+executing operation/, "may present an approval request or lifecycle append as an executing operation")],
  ["browser-closes-supervisor", replaceBrowser(text, /closing the browser must not end the W-owned supervised resident/, "closing the browser may end the W-owned supervised resident")],
  ["source-checkout tailnet", replaceBrowser(text, /Tailnet inspection runs from the served checkout, not a source checkout or a\s+development server/, "Tailnet inspection may run from a source checkout or a development server")]
];
const actual = inspect(text);
const missed = counterfactuals.filter(([, candidate]) => inspect(candidate).length === 0).map(([name]) => name);
if (actual.length > 0 || missed.length > 0) {
  console.error(`RED: browser-section boundary audit missing: ${[...actual, ...missed.map((name) => `counterfactual:${name}`)].join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: browser-section boundary audit passed (${required.length} local boundaries; ${counterfactuals.length} counterfactuals rejected).`);
NODE
```

The exact audit must be run after this repair. Its GREEN result is valid only
when the actual browser section satisfies all local boundaries and every
in-memory counterfactual above fails inspection. It does not authorize browser
or acceptance-test implementation.

### Browser Audit GREEN

The exact section-boundary audit exited `0` and printed `GREEN:
browser-section boundary audit passed (13 local boundaries; 6 counterfactuals
rejected).` The actual extracted section satisfies production-shaped DTO parity
and adversarial rejection; runtime-projection/run binding; supported-command,
exact-label, and no-effect control semantics; browser-closed supervision and
readback; and rebuilt served-checkout desktop/mobile/tailnet requirements. The
audit rejects body deletion plus reduced DTO, unsupported-command, truthless
lifecycle-control, browser-closes-supervisor, and source-checkout-tailnet
counterfactuals in memory.

`git diff --check` exited `0` with no output. `npm run factory:check` exited
`0` and printed `factory-readiness passed`. Fresh full verification is required
before the repair commit; no provider was invoked by this documentation repair.

### Repair Verification and Re-Review Handoff

- Full verification: `npm run verify` exited `0` after typecheck passed; 189
  test files passed with 3 skipped; 2,228 tests passed with 5 skipped; Vite
  built with its existing chunk-size warning; and factory-readiness passed.
- Status: `ready-for-review`; this supersedes `repairing` only for the scoped
  repair. It is not lane approval, merge readiness, or authority for Task 116.
- Review stop: a fresh model-pinned Task 108 re-review must inspect the
  section-local extractor, all 13 local requirements, and the six
  counterfactuals. No implementation, provider invocation, or merge may begin
  before the coordinator records a fresh A-spec approval.

## Coordinator Review, Lane Approval, and Integration

- Recorded at: `2026-07-12T22:32:20Z`.
- Fresh re-review: independent reviewer `/root/review_task108_repair` approved
  repair commit `e44b8c1bcbec6594fca8f5c1f21c003f51e965c2` after confirming
  the section-local browser acceptance audit and all six rejected
  counterfactuals. The session used the user-confirmed GPT-5.6 Terra / Extra
  High configuration.
- Coordinator lane decision: under the Standing Coordinator Delegation at
  governing spec `811458d2094dc166b10b9255d1829eae73f2d08e`, Lane A's written
  specification is approved. This does not authorize Task 116, live provider
  invocation, deployment, or production work; the Wave 0A lane-spec stop
  remains in force.
- Integration: coordinator branch
  `codex/resident-agent-full-vision-program-plan` merged the reviewed task
  branch with merge commit `0c725139734c24ba2647d2c2cc20cfcf550d415e`. No
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
