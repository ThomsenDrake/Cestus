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
