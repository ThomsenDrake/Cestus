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

## Repair RC-107-01 — Counterfactual-Sensitive Cockpit Audit

This forward-only repair addresses the fresh review finding that the original
heading-and-phrase audit could accept unsafe prose. It preserves the original
Task 107 claim, specification, RED/GREEN evidence, and product contract; it
supersedes only the audit-strength evidence and current review status.

- Repair authorization: coordinator-issued Task 107 cockpit-specification
  audit-strengthening repair only, under the governing specification and plan
  recorded above. It permits documentation RED/GREEN, fresh review, and
  verification-before-completion; it forbids Task 115, production work,
  provider invocation, shared-contract changes, and a merge.
- Repair status: repairing.
- Review trigger: a fresh reviewer proved that the prior audit passed when the
  strict parser or safe-command prose was replaced by unsafe text because it
  checked only headings and loose phrases.

### Audit-Strengthening RED

Before this repair, the following audit of the claim's own audit machinery
exited `1` with `RED: Task 107 audit strengthening is absent:` followed by the
missing section extractor, inspector, concrete clause, and counterfactual
markers. This is the expected failure: the prior audit does not inspect each
relevant section or prove that unsafe substitutions fail.

### Counterfactual Documentation Audit

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const specPath = "docs/superpowers/specs/2026-07-12-resident-agent-cockpit-design.md";
const spec = readFileSync(specPath, "utf8");
const normalize = (value) => value.replace(/\s+/g, " ").trim();

function section(document, heading) {
  const start = document.indexOf(`## ${heading}`);
  const end = start < 0 ? -1 : document.indexOf("\n## ", start + 1);
  return start < 0 ? "" : document.slice(start, end < 0 ? document.length : end);
}

function requireClauses(name, value, clauses, missing) {
  const normalized = normalize(value);
  for (const clause of clauses) {
    if (!normalized.includes(normalize(clause))) missing.push(`${name}: ${clause}`);
  }
}

function inspect(document) {
  const missing = [];
  const safety = section(document, "Product Principles And Safety Invariants");
  const truth = section(document, "Browser-Safe Runtime Truth");
  const commands = section(document, "Supported Commands And Truthful Controls");
  const provider = section(document, "Provider Setup And Secret-Safe Readiness");
  const handoff = section(document, "Durable Handoff View And Readback");
  const parser = section(document, "Strict Browser DTO And Parser Boundary");

  requireClauses("plain-own-data parser clause", parser, [
    "Accept only JSON parsed into plain own-data objects and ordinary dense arrays.",
    "Reject non-objects, non-plain prototypes, inherited values, accessors/getters/setters, symbols, sparse arrays, custom array properties, cycles, and unexpected boxed values before reading a field.",
    "unknown keys rejected at every public DTO and command boundary.",
    "Snapshot the normalized data once, freeze the snapshot, and never reread caller-provided objects after an `await`.",
    "Reject fields that resemble secret-bearing values, unredacted diagnostic blobs, prompt text, source bytes, command argv, credential locators, or opaque provider payloads.",
    "Do not fall back to a partial fixture, cached old state, or an implied ready view."
  ], missing);
  requireClauses("supported-command-only clause", commands, [
    "The command surface is deliberately small. It contains durable state requests and local setup navigation only.",
    "It contains no generic shell, arbitrary tool, free-form prompt, raw provider invocation, ad-hoc wake, force claim, force resume, approval, send, export, or graph-mutation command.",
    "The runtime snapshots and validates the plain own-data command once before any append or await; it then rechecks current mounted identity, locks, source/artifact state, budget, and approval posture at consumption.",
    "Render a command only when the parsed `supportedCommands` entry names it."
  ], missing);
  requireClauses("supported-command-only clause", parser, [
    "They accept only supported command discriminants, an exact supported-command binding from the current snapshot, and the narrow identifiers required by that command."
  ], missing);
  requireClauses("provider/tool-invocation prohibition", safety, [
    "no background UI mechanism starts, resumes, dispatches, approves, invokes a provider, runs a tool, or writes an artifact merely because a page rendered or a polling request completed.",
    "Provider byte transfer, PRR send, legal escalation, publication, export, destructive repair, sensitive disclosure, and accepted-graph mutation stay outside Lane U's command set"
  ], missing);
  requireClauses("secret-safe local-setup clause", provider, [
    "browser has no password/API-key text field, no secret paste target, no query parameter, no URL fragment, no client persistence, and no setup response that contains secret material.",
    "It is disabled for tailnet and mobile sessions."
  ], missing);
  requireClauses("handoff-readback provenance clause", truth, [
    "A command acknowledgement may identify a request, but the next status is rendered only from a fresh projection/readback.",
    "Handoff completion requires the exact recorded lifecycle event, the exact material receipt/hash, the manifest receipt/hash binding that material, and the mounted readback required by Lane H.",
    "A content hash alone, a manifest scan, or a client-held summary is insufficient."
  ], missing);
  requireClauses("handoff-readback provenance clause", handoff, [
    "The view never derives a durable handoff from an assistant message, output text, blob existence, or a status returned before ledger/artifact readback."
  ], missing);
  requireClauses("mounted-authority/no-fallback clause", safety, [
    "The mounted workspace identity, mounted ledger, mounted artifact store, policy version, high-water mark, and active locks remain authoritative.",
    "instead of offering a local substitute."
  ], missing);
  requireClauses("mounted-authority/no-fallback clause", truth, [
    "It must not read from a browser cache, an in-memory fallback ledger, or an unmounted derivative store."
  ], missing);
  return missing;
}

function replaceOnce(document, from, to, name) {
  const index = document.indexOf(from);
  if (index < 0 || document.indexOf(from, index + from.length) >= 0) {
    throw new Error(`counterfactual fixture is not unique: ${name}`);
  }
  return document.slice(0, index) + to + document.slice(index + from.length);
}

const counterfactuals = [
  ["parser accepts arbitrary values", replaceOnce(spec, "Accept only JSON parsed into plain own-data objects and ordinary dense\n   arrays.", "Accept arbitrary browser values.", "plain-own-data")],
  ["parser permits unknown keys", replaceOnce(spec, "unknown keys rejected", "unknown keys allowed", "unknown-keys")],
  ["parser permits fallback rendering", replaceOnce(spec, "Do not fall back to a partial fixture, cached old state, or an\n   implied ready view.", "A partial cached state may be rendered as ready.", "parser-fallback")],
  ["command surface permits provider or tool invocation", replaceOnce(spec, "It contains no generic shell, arbitrary tool,\nfree-form prompt, raw provider invocation, ad-hoc wake, force claim, force\nresume, approval, send, export, or graph-mutation command.", "It may invoke provider, tool, or generic commands.", "command-surface")],
  ["route accepts client-selected commands", replaceOnce(spec, "They accept only supported command discriminants,\nan exact supported-command binding from the current snapshot, and the narrow\nidentifiers required by that command.", "They accept a client-selected action without a current supported-command binding.", "supported-command-binding")],
  ["provider setup receives a browser secret", replaceOnce(spec, "browser has no password/API-key text field, no secret paste target, no query\nparameter, no URL fragment, no client persistence, and no setup response that\ncontains secret material.", "browser accepts a secret-bearing provider setup form.", "provider-secret")],
  ["handoff accepts hash-only completion", replaceOnce(spec, "A content hash alone, a manifest\n   scan, or a client-held summary is insufficient.", "A content hash alone is sufficient for completion.", "handoff-readback")],
  ["workspace authority permits a local substitute", replaceOnce(spec, "The\n  cockpit must show `unavailable`, `identity-mismatch`, or\n  `reverify-required` instead of offering a local substitute.", "The cockpit may use a local substitute.", "workspace-authority")]
];

const actual = inspect(spec);
const missed = counterfactuals
  .filter(([, candidate]) => inspect(candidate).length === 0)
  .map(([name]) => `counterfactual: ${name}`);
if (actual.length > 0 || missed.length > 0) {
  console.error(`RED: Task 107 counterfactual audit failed: ${[...actual, ...missed].join("; ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 107 counterfactual cockpit audit passed (${counterfactuals.length} unsafe substitutions rejected).`);
NODE
```

The audit extracts the exact safety, runtime/readback, command, provider,
handoff, and parser sections. It rejects weaker plain-own-data validation,
unknown-key acceptance, fallback rendering, arbitrary provider/tool command
execution, client-selected command binding, browser secret entry, hash-only
handoff completion, and local workspace substitution.

### Repair GREEN And Evidence

- RED: the pre-repair audit-strengthening check exited `1` and named each
  absent extractor, inspector, concrete clause family, and counterfactual
  marker. This proved the historical audit could not test the reviewer’s
  unsafe-rewrite scenario.
- Focused audit correction: the first execution of the new audit exited `1`
  because the exact supported-command route binding is intentionally in the
  strict parser section, not the command presentation section. The repair
  moved only that assertion to the parser-section check; the product
  specification was not changed.
- GREEN: the exact counterfactual audit above then exited `0` with `GREEN:
  Task 107 counterfactual cockpit audit passed (8 unsafe substitutions
  rejected).` It proves each named mutation is rejected by the same section-
  local inspection used for the actual document.
- Repair scope: only this forward-only claim changes. The existing cockpit
  specification remains the reviewed product contract; no production,
  runtime, UI, provider, test, registry, plan, or shared-contract file is
  changed.
- Next gate: run `git diff --check`, `npm run factory:check`, and
  `npm run verify`, then commit one repair and stop for a fresh model-pinned
  re-review. No Task 115 work is authorized.

### Repair Verification Completion And Stop

- `git diff --check` exited `0` with no output.
- `npm run factory:check` exited `0` with `factory-readiness passed`.
- `npm run verify` exited `0`: typecheck passed; 189 test files passed with 3
  skipped; 2,228 tests passed with 5 skipped; Vite built successfully with the
  existing chunk-size warning; and factory readiness passed. Node emitted only
  the repository's existing SQLite experimental warnings.
- Repair status: ready-for-review. This record supersedes the current status
  of RC-107-01 only; all initial Task 107 evidence remains immutable history.
- Review requirement: one fresh model-pinned re-review must inspect this
  repair’s claim-only diff and confirm that the exact audit rejects each
  counterfactual. This repairer does not self-approve or merge.
- Stop point: do not begin Task 115 or any production work. Wait for that
  re-review and written coordinator disposition.

## Coordinator Review, Lane Approval, and Integration

- Recorded at: `2026-07-12T22:20:07Z`.
- Fresh re-review: independent reviewer `/root/review_task107_repair` approved
  repair commit `005d7a02e318bffb79299291d33b55c0176f4ea6` after confirming the
  section-local audit asserts concrete cockpit safety clauses and rejects all
  eight unsafe substitutions. The session used the user-confirmed GPT-5.6
  Terra / Extra High configuration.
- Coordinator lane decision: under the Standing Coordinator Delegation at
  governing spec `811458d2094dc166b10b9255d1829eae73f2d08e`, Lane U's written
  specification is approved. This does not authorize Task 115, UI/runtime
  implementation, provider invocation, or production work; the Wave 0A
  lane-spec stop remains in force.
- Integration: coordinator branch
  `codex/resident-agent-full-vision-program-plan` merged the reviewed task
  branch with merge commit `fb4580d57da9fa6d7a5871ff7bc99bf583f2f0e4`. No
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
