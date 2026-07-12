# Task 107 Claim: Resident Full-Vision Wave 0A Cockpit Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 107 / U / Wave 0A
- Worker: Codex Task 107 cockpit specification author
- Branch: `codex/task-107-resident-full-vision-w0-cockpit-spec`
- Worktree: `/home/drake/.codex/worktrees/task-107-resident-full-vision-w0-cockpit-spec`
- Base commit: `e3fd8533fe4d49690a45a2ab2261f8ce62ca4396`
- Claimed at: `2026-07-12T22:00:00Z`
- Host configuration: GPT-5.6 Terra / Extra High, confirmed by the coordinator
- Status: ready-for-review

## Authorization And Scope

The coordinator-issued Standing Coordinator Delegation authorizes Task 107
only: this Lane U Wave 0A specification, its documentation RED/GREEN evidence,
fresh review, and verification-before-completion. It authorizes
`superpowers:subagent-driven-development` where relevant and documentation
test-driven development. It does not authorize Task 115 or later, a Lane U
implementation plan, production or test code, shared contracts, a registry
change, provider invocation, or a merge into `neo`.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md`
- `docs/agentic/claims/task-107-resident-full-vision-w0-cockpit-spec.md`

Every other tracked repository file is forbidden.

## Governing Invariants

- Preserve the single resident identity `agent_default`; providers,
  subscriptions, credential references, and specialist modes are backends or
  task modes, never resident identities.
- Preserve append-only ledger semantics, exact provenance, rebuildable
  projections, independent-human approval consumption, and durable handoff
  readback from the authoritative mounted workspace.
- The mounted workspace identity, ledger, artifact store, policy, and active
  locks are authoritative. A disconnect or identity mismatch permits no
  internal fallback ledger, projection, artifact, derivative, or secret write.
- Browser values are strict, browser-safe, secret-safe DTOs parsed from
  authoritative runtime projections. React has no canonical execution state
  and no hidden execution controls.
- Controls may invoke only explicit, supported runtime commands whose labels
  state their durable effect. They cannot self-approve, bypass current locks,
  consume stale approvals, broaden a tool/provider/budget policy, or perform
  an external or irreversible effect.
- Newsroom/team scope, multi-user authorization, shared hosting, and
  autonomous send, escalation, export, publication, destructive repair,
  disclosure, or accepted-graph mutation are out of scope.

## Required Evidence And Stop Point

- Documentation RED: a reproducible focused coverage audit fails while the
  cockpit specification is absent or lacks runtime truth, safe commands,
  provider setup, durable handoffs, viewport and tailnet requirements,
  strict DTO/parser rules, ownership, failure, and acceptance coverage.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` pass after the specification is complete.
- Full verification: `npm run verify` passes before the Task 107
  documentation commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit this claim and one Lane U specification, then stop for fresh
  coordinator review and written U-spec approval. Do not create Task 115,
  dispatch an implementation worker, or merge.

## Documentation RED/GREEN Evidence

The following focused audit is the documentation RED/GREEN contract for this
task. It intentionally fails while the Lane U specification is absent or
incomplete, then accepts only the completed secret-safe, browser-safe design.

```bash
node --input-type=module <<'NODE'
import { existsSync, readFileSync } from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md";
const required = [
  ["scope", "## Scope, Ownership, And Pre-CF-1 Boundary"],
  ["identity", "agent_default"],
  ["runtime", "## Browser-Safe Runtime Truth"],
  ["commands", "## Supported Commands And Truthful Controls"],
  ["provider", "## Provider Setup And Secret-Safe Readiness"],
  ["handoff", "## Durable Handoff View And Readback"],
  ["strict parser", "## Strict Browser DTO And Parser Boundary"],
  ["workspace", "mounted workspace"],
  ["approval", "independent human approval"],
  ["desktop", "## Desktop, Mobile, And Tailnet Requirements"],
  ["tailnet", "tailnet"],
  ["failure", "## Failure States, Safety Boundaries, And Recovery"],
  ["acceptance", "## Acceptance And Review Gates"],
  ["ownership", "## Lane Ownership, Dependencies, And Deferred Decisions"]
];
if (!existsSync(path)) {
  console.error(`RED cockpit-spec coverage audit: ${path} is absent; ${required.length} required assertions are untestable.`);
  process.exit(1);
}
const text = readFileSync(path, "utf8");
const missing = required.filter(([, needle]) => !text.includes(needle)).map(([name]) => name);
const forbidden = ["T" + "ODO", "T" + "BD", "implement " + "later", "fallback " + "storage", "hidden execution " + "control"].filter((value) => text.includes(value));
if (missing.length > 0 || forbidden.length > 0) {
  console.error(`RED cockpit-spec coverage audit: missing ${missing.join(", ") || "none"}; forbidden ${forbidden.join(", ") || "none"}.`);
  process.exit(1);
}
console.log(`GREEN cockpit-spec coverage audit: ${required.length} required assertions present.`);
NODE
```

- RED: before the specification existed, the audit exited `1` with `RED
  cockpit-spec coverage audit:
  docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md is
  absent; 14 required assertions are untestable.` This is the expected
  absence-of-design failure.
- GREEN: after the specification was written, the same audit exited `0` with
  `GREEN cockpit-spec coverage audit: 14 required assertions present.`
- Documentation gates: `git diff --check` exited `0` with no output and
  `npm run factory:check` exited `0` with `factory-readiness passed` after the
  GREEN audit.

## Specification Self-Review

- Runtime truth is expressly projection/readback based, exact-run bound, and
  unavailable on parser, authority, or provenance failure; React retains no
  canonical execution state.
- The proposed command matrix contains only recheck, wake pause/resume,
  retry/cancel requests, and local-only setup navigation. It forbids generic
  execution, approval, provider invocation, external effects, and concealed
  side effects; labels distinguish requests from completed facts.
- Provider setup is a P-owned local flow with browser/portable secret
  exclusion and tailnet/mobile disablement. Handoff truth requires H-owned
  material/manifest/ledger readback rather than a returned object.
- DTO/parser requirements reject unsafe shape, stale/cross-run, extra-key,
  accessor, prototype, sparse-array, and secret-bearing input before a
  consumer can render it. All named interfaces remain non-canonical until
  CF-1.
- Desktop, mobile, and tailnet requirements preserve one resident and mounted
  authority, browser-independent supervision, no fallback storage, command
  truthfulness, and no newsroom/team scope.

## Verification Preparation

- The first `npm run verify` attempt stopped before typechecking because this
  fresh isolated worktree had no lockfile dependency tree: `sh: line 1: tsc:
  command not found`.
- Under the governing Standing Coordinator Delegation, `npm ci
  --ignore-scripts` restored only lockfile-pinned ignored dependencies. It did
  not change a tracked file. The same verification command was then rerun;
  its final command result is recorded below.
- Final documentation gates: `git diff --check` exited `0` with no output and
  `npm run factory:check` exited `0` with `factory-readiness passed`.
- Full verification: `npm run verify` exited `0`: typecheck passed; 189 test
  files passed with 3 skipped; 2,228 tests passed with 5 skipped; Vite built
  successfully with the existing chunk-size warning; and factory readiness
  passed. The test run emitted the repository's existing Node SQLite
  experimental warnings only.

## Ready-For-Review Handoff

- Scoped documentation commit contents: only this claim and
  `docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md`.
- Live-provider gate: not applicable to this documentation-only task; the
  specification defines later provider acceptance but did not invoke a
  provider or handle credentials.
- Review verdict: pending a fresh independent Task 107 specification review.
- Merge readiness: not ready. This branch has no authority to merge into
  `neo`, start Task 115, or turn proposed pre-CF-1 contracts into production
  interfaces.
