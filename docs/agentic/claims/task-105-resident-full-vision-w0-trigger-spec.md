# Task 105 Claim: Resident Full-Vision Wave 0A Proactive Trigger Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 105 / T / Wave 0A
- Status: ready-for-review
- Branch: `codex/task-105-resident-full-vision-w0-trigger-spec`
- Worktree: `/home/drake/.codex/worktrees/task-105-resident-full-vision-w0-trigger-spec`
- Base commit: `52bc6b6dc81373d6026e7465becde75bd1c6448e`
- Claimed at: `2026-07-12T21:00:00Z`
- Worker: Codex Task 105 Lane T specification author
- Host configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user

## Authorization and Scope

The coordinator-issued scoped authorization under the Standing Coordinator
Delegation authorizes Task 105 only, including documentation RED/GREEN, fresh
review, and verification-before-completion. It does not authorize a lane
implementation plan, Task 113 or later work, production code, tests, runtime,
UI, provider, shared-contract, registry, or program-plan changes. Do not merge
into `neo` or an integration branch.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md`
- `docs/agentic/claims/task-105-resident-full-vision-w0-trigger-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: a reproducible coverage audit must fail until the T
  specification defines durable, deduplicated task requests; dedupe, cooldown,
  high-water, budget, and source-provenance rules; no-prompt/no-effect
  boundaries; safe single-resident adoption; mounted-workspace/no-fallback,
  approval, handoff, diagnostics, ownership, and failure-injection boundaries.
- Documentation GREEN: the same audit, `git diff --check`, and
  `npm run factory:check` must pass after the specification is written.
- Full verification: `npm run verify` must pass before the scoped task commit.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit the T specification and this claim, then wait for fresh
  coordinator review and written T-spec approval. Do not create a lane
  implementation plan or start Task 113.

## Invariants

- Preserve one resident identity (`agent_default`), append-only ledger,
  exact provenance, rebuildable projections, independently governed approval
  consumption, durable handoff readback, mounted-workspace authority, and
  secret-safe diagnostics.
- Trigger evaluation contains no prompt text or model invocation and performs
  no domain, tool, provider, approval, artifact, ontology, projection, or
  external effect; it may append only a validated trigger request to the
  authoritative mounted ledger after its dedupe/cooldown/budget checks.
- Workspace absence, stale identity, mount swap, stale source, or unreadable
  authoritative state permits no internal fallback ledger, projection,
  derivative, artifact, or trigger-state write.
- Shared event names, DTO versions, capability signatures, and production file
  ownership remain pre-CF-1 proposals; Task 117 alone freezes them. Newsroom,
  team, multi-user, shared-hosting, and organization authorization scope is
  excluded.

## Claim Commit

This claim is intentionally committed before any Task 105 specification edit.
The next claim update records the reproducible RED/GREEN evidence, self-review,
verification, and review handoff.

## Documentation RED Evidence

- RED command: an inline Node coverage audit of
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md`
  and this claim requiring the Task 105 scope, durable dedupe/readback,
  cooldown/budget, high-water/no-advance rule, source provenance,
  no-prompt/no-effect boundary, single-resident adoption, mounted authority/no
  fallback, handoff/diagnostic, pre-CF-1 ownership, initial-family/failure, and
  out-of-scope team coverage.
- Observed RED result: exit 1 before the specification existed with
  `RED: Task 105 proactive-trigger specification missing: durable deduplicated
  request contract, cooldown and budget accounting, high-water correctness,
  source provenance, no prompt and no effect boundary, single resident
  adoption, mounted authority and no fallback, handoff and diagnostics,
  pre-CF-1 ownership, initial trigger families and failures, out-of-scope team
  posture`.

## Documentation GREEN, Verification, and Self-Review

The following reproducible audit is the Task 105 documentation RED/GREEN
command. It reads only the owned specification and claim.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const specPath = "docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md";
const claimPath = "docs/agentic/claims/task-105-resident-full-vision-w0-trigger-spec.md";
const spec = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";
const claim = fs.readFileSync(claimPath, "utf8");
const required = [
  ["Task 105 claim and scope", claim.includes("Task 105 / T / Wave 0A") && claim.includes("Every other tracked file is forbidden")],
  ["durable deduplicated request contract", spec.includes("## Durable, Deduplicated Trigger Requests") && spec.includes("dedupeKey") && spec.includes("readback")],
  ["cooldown and budget accounting", spec.includes("## Cooldown and Budget Policy") && spec.includes("cooldown") && spec.includes("budget")],
  ["high-water correctness", spec.includes("## Source Provenance and High-Water Marks") && spec.includes("high-water") && spec.includes("does not advance")],
  ["source provenance", spec.includes("sourceEventId") && spec.includes("contentHash") && spec.includes("policyVersion")],
  ["no prompt and no effect boundary", spec.includes("## No-Prompt, No-Effect Boundary") && spec.includes("model invocation") && spec.includes("domain effect")],
  ["single resident adoption", spec.includes("## Safe Adoption by the One Resident") && spec.includes("agent_default") && spec.includes("independently governed")],
  ["mounted authority and no fallback", spec.includes("## Workspace Authority, Durability, and Recovery") && spec.includes("no fallback") && spec.includes("workspace identity")],
  ["handoff and diagnostics", spec.includes("durable handoff") && spec.includes("secret-safe")],
  ["pre-CF-1 ownership", spec.includes("## Pre-CF-1 Interface and Ownership Boundary") && spec.includes("Task 117") && spec.includes("non-canonical")],
  ["initial trigger families and failures", spec.includes("## Initial Trigger Families") && spec.includes("## Failure Injection and Later Verification") && spec.includes("duplicate") && spec.includes("stale")],
  ["out-of-scope team posture", spec.includes("Newsroom") && spec.includes("team") && spec.includes("out of scope")]
];
const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error(`RED: Task 105 proactive-trigger specification missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 105 proactive-trigger coverage audit passed (${required.length} assertions).`);
'
```

- GREEN result: the audit exited 0 with
  `GREEN: Task 105 proactive-trigger coverage audit passed (12 assertions).`
- Dependency restoration: this isolated worktree initially lacked its
  lockfile-pinned tools (`tsc: command not found`); `npm ci --ignore-scripts`
  restored them without changing tracked files.
- Whitespace: `git diff --check` exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 with typecheck passed, 189 test
  files passed with 3 skipped, 2,228 tests passed with 5 skipped, a successful
  Vite production build (with the existing chunk-size warning), and
  `factory-readiness passed`.
- Live-provider gate: not applicable. This specification forbids model and
  provider invocation; later implementation must remain deterministic and
  credential-free at the trigger boundary.
- Self-review: the specification proposes only pre-CF-1 interfaces; makes
  `agent_default`, mounted-workspace authority, append-only/read-back-only
  durability, exact source provenance, replayable high-water state,
  no-fallback storage, secret-safe diagnostics, independently governed
  approval consumption, and later durable handoff readback explicit; assigns
  every cross-lane boundary without taking other-lane ownership; and excludes
  newsroom/team scope. No placeholder, implementation-plan, Task 113, or
  production-code authorization is present.

## Review Handoff and Stop

Fresh model-pinned review is required. This author does not self-approve,
create an implementation plan, begin Task 113, dispatch implementation work,
or merge into `neo` or an integration branch. Stop at the written Lane T
specification approval gate.

## Repair Correction RC-105-01 — Stable Fingerprints and Scope-Atomic Admission

This append-only repair record preserves the original claim and evidence. It
supersedes only the prior `ready-for-review` status while the two fresh-review
findings are repaired.

- Repair authorization: coordinator-issued Task 105 Lane T specification-review
  repair only under the Standing Coordinator Delegation. The authorized range
  is one verified documentation repair commit and a fresh model-pinned
  re-review; it excludes Task 113, implementation planning, production work,
  dispatch, and any merge.
- Repair worker: Codex Task 105 Lane T specification repairer, using the
  coordinator/user-confirmed GPT-5.6 Terra / Extra High configuration.
- Repair claimed at: `2026-07-12T21:10:04Z`.
- Repair base: `19a2cef6c5de94a277e6d35742f8a2b549014f7`.
- Review findings: the prior fingerprint description allowed append-assigned or
  evaluator-variable `requestId` and `requestedAt` values to perturb duplicate
  matching; and per-dedupe-key uniqueness did not serialize distinct
  high-water candidates sharing a cooldown/budget scope.
- Root cause: the design required a hash of a “complete normalized request
  snapshot” but did not distinguish stable semantic identity from append
  envelope fields; separately, its read-then-append protocol guarded only a
  candidate dedupe key, leaving the shared policy admission decision outside
  the append atomicity boundary.
- Repair RED: the focused inline Node audit exited 1 with
  `RED: Task 105 repair audit missing: stable fingerprint input,
  append-assigned fields excluded, deterministic request ID, repeated
  evaluation contract, scope gate key, atomic scope admission, conflict
  reevaluation, distinct candidate concurrency assertion`.
- Repair status: repairing. The following sections record GREEN evidence,
  verification, and the fresh re-review handoff after the narrowed repair is
  complete.

### Reproducible Repair Audit

The focused documentation audit below reads only the owned specification. Its
RED baseline was run before the repair. The first GREEN invocation corrected
only three audit-text extraction literals (Markdown backticks, the derived-key
location, and the transaction sentence's article); it did not change the
specification or replace a missing product assertion.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md";
const spec = fs.readFileSync(path, "utf8");
const fingerprintStart = spec.indexOf("interface ProposedTriggerRequestFingerprintInputV1");
const fingerprintEnd = spec.indexOf("interface ProposedTriggerAdmissionScopeV1", fingerprintStart);
const fingerprint = fingerprintStart < 0 || fingerprintEnd < 0 ? "" : spec.slice(fingerprintStart, fingerprintEnd);
const scopeStart = fingerprintEnd;
const scopeEnd = spec.indexOf("```", scopeStart);
const scope = scopeStart < 0 || scopeEnd < 0 ? "" : spec.slice(scopeStart, scopeEnd);
const required = [
  ["stable fingerprint input", ["fingerprintVersion", "descriptorRevision", "policyArtifactHash", "sourceRefs", "sourceHighWaterMark", "workspaceIdentityEventId", "causationId"].every((field) => fingerprint.includes(field))],
  ["append-assigned fields excluded", fingerprint && !["requestId", "requestedAt", "notBefore", "correlationId"].some((field) => fingerprint.includes(field))],
  ["deterministic request ID and readback binding", spec.includes("`requestId` is deterministically derived") && spec.includes("context.occurredAt") && spec.includes("not fingerprint input")],
  ["repeated evaluation contract", spec.includes("repeated identical evaluation") && spec.includes("same `requestFingerprint`") && spec.includes("`dedupe-conflict`")],
  ["scope gate key", spec.includes("`triggerGateKey`") && ["subjectScope", "budgetScope"].every((field) => scope.includes(field)) && !scope.includes("sourceHighWaterMark")],
  ["atomic scope admission", spec.includes("an atomic conditional append in one\n   mounted-ledger transaction") && spec.includes("Per-dedupe-\n   key uniqueness is necessary but insufficient")],
  ["conflict reevaluation", spec.includes("re-read and re-evaluate") && spec.includes("never retries an old\n   snapshot")],
  ["repeated-evaluation assertion", spec.includes("repeated identical evaluation attempts") && spec.includes("different\n  append times")],
  ["distinct-candidate concurrency assertion", spec.includes("concurrent distinct candidates") && spec.includes("same `triggerGateKey`") && spec.includes("losing candidate must re-read and re-evaluate")]
];
const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error(`RED: Task 105 repair audit missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 105 repair audit passed (${required.length} assertions).`);
'
```

- GREEN result: the audit exited 0 with
  `GREEN: Task 105 repair audit passed (9 assertions).`
- Evidence reproducibility correction: the first committed-text rendering of
  three newline probes double-escaped their JavaScript literals. This repair
  changes only those claim-code escapes; rerunning the exact extracted claim
  command now produces the GREEN result above. It makes no specification or
  product-contract change.
- Whitespace: `git diff --check` exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 with typecheck passed, 189 test
  files passed with 3 skipped, 2,228 tests passed with 5 skipped, a successful
  Vite production build (with the existing chunk-size warning), and
  `factory-readiness passed`.
- Repair self-review: `requestFingerprint` now has one exact stable input;
  append event ID, sequence, time, decision `notBefore`, and correlation fields
  cannot perturb it; the deterministic request ID and separate readback bind
  retain durable identity. `triggerGateKey` is deliberately source-independent
  within its cooldown/budget scope, and the one atomic conditional append
  rechecks that scope before the only permitted durable write. Failed scope
  admission discards stale snapshots and re-evaluates instead of broadening
  work, advancing high-water, writing fallback state, or fabricating success.
  No prompt/effect, mounted-authority, append-only/replay, provenance,
  approval, handoff, secret-safe, pre-CF-1, ownership, or team-scope invariant
  was weakened.
- Live-provider gate: not applicable. The repaired specification still forbids
  model and provider invocation in the trigger evaluator.
- Repair status: ready-for-review. A fresh model-pinned re-review is required;
  this repairer does not self-approve, create Task 113, begin production work,
  or merge into `neo` or an integration branch.

## Repair Correction RC-105-02 — Deterministic Trigger Admission Scope

This forward-only final focused repair preserves all preceding Task 105 claim,
review, and repair evidence. It supersedes the prior `ready-for-review` status
only while it repairs the fresh re-review finding about candidate-controllable
trigger admission scope derivation.

- Repair authorization: coordinator-issued Task 105 trigger-admission-scope
  derivation repair only under the Standing Coordinator Delegation. This is the
  final permitted focused repair attempt and authorizes one verified commit and
  fresh model-pinned re-review; it excludes Task 113, implementation planning,
  production work, dispatch, and any merge.
- Repair worker: Codex Task 105 Lane T final focused repairer, using the
  coordinator/user-confirmed GPT-5.6 Terra / Extra High configuration.
- Repair claimed at: `2026-07-12T21:26:42Z`.
- Repair base: `b6361ea6de4334f46d136872f2d225d8a0eacc0f`.
- Review finding: `ProposedTriggerAdmissionScopeV1.budgetScope` was an
  unconstrained string while policy declared only `subjectScope` and
  `sourcePartition`; it was neither bound to an exact immutable derivation nor
  persisted/reconstructed for readback, so a forged or candidate-specific
  scope could derive another gate key and bypass shared-scope serialization.
- Root cause: the previous repair supplied atomicity after an imprecise scope
  boundary. A dedupe candidate could choose a different scope label without
  changing the verified policy or source high-water facts, so the transaction
  guard did not necessarily represent the policy's actual cooldown/budget
  admission domain.
- Repair RED: the focused inline Node audit exited 1 with
  `RED: Task 105 final scope-derivation audit missing: persisted admission
  scope, finite policy selectors, exact derivation, policy cooldown and budget
  inputs, scope selector consistency, candidate scope rejected, readback
  reconstruction, equal scope high-water rule, altered scope counterfactual`.
- Repair status: repairing. The next record supplies reproducible GREEN,
  verification, and fresh-re-review evidence.

### Reproducible Final Scope-Derivation Audit

The following focused documentation audit reads only the owned specification.
Its RED baseline was run before RC-105-02 changed the scope contract.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const spec = fs.readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md", "utf8");
const scopeStart = spec.indexOf("interface ProposedTriggerAdmissionScopeV1");
const scopeEnd = spec.indexOf(String.fromCharCode(96).repeat(3), scopeStart);
const scope = scopeStart < 0 || scopeEnd < 0 ? "" : spec.slice(scopeStart, scopeEnd);
const required = [
  ["persisted admission scope", spec.includes("admissionScope: ProposedTriggerAdmissionScopeV1")],
  ["finite policy selectors", spec.includes("type ProposedTriggerAdmissionScopeSelectorV1") && spec.includes("workspace-trigger-subject")],
  ["exact derivation", spec.includes("deriveAdmissionScope") && spec.includes("authoritative policy") && spec.includes("verified request")],
  ["policy cooldown and budget inputs", spec.includes("cooldownScopeSelector") && spec.includes("budgetScopeSelector")],
  ["scope selector consistency", spec.includes("must be equal") && spec.includes("policy is invalid")],
  ["candidate scope rejected", spec.includes("candidate-selected") && spec.includes("unknown field")],
  ["readback reconstruction", /reconstruct the admission\s+scope/.test(spec) && spec.includes("exactly equal")],
  ["equal scope high-water rule", spec.includes("equal-policy-scope/different-high-water") && /same\s+.{0,12}triggerGateKey/.test(spec)],
  ["altered scope counterfactual", spec.includes("altered scope") && spec.includes("no append")]
];
const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error("RED: Task 105 final scope-derivation audit missing: " + missing.join(", "));
  process.exit(1);
}
console.log("GREEN: Task 105 final scope-derivation audit passed (" + required.length + " assertions).");
'
```

- GREEN result: the audit exited 0 with
  GREEN: Task 105 final scope-derivation audit passed (9 assertions).
- Whitespace: git diff --check exited 0 with no output.
- Factory readiness: npm run factory:check exited 0 with
  factory-readiness passed.
- Full verification: npm run verify exited 0 with typecheck passed, 189 test
  files passed with 3 skipped, 2,228 tests passed with 5 skipped, a successful
  Vite production build (with the existing chunk-size warning), and
  factory-readiness passed.
- Final repair self-review: admission scope is persisted and deterministically
  reconstructed from only verified request identity/subject fields and immutable
  policy scope selectors. Candidate-selected scope, selector, and key fields
  are unknown/rejected; policy selector mismatch fails closed; reconstructed
  scope and canonical gate key must exactly match readback. Equal-policy-scope/
  different-high-water candidates therefore share the one admission gate before
  append. No prompt/effect, append-only, provenance/high-water, mounted
  authority, fallback, approval, handoff, secret-safe, pre-CF-1, ownership, or
  team-scope invariant was weakened.
- Live-provider gate: not applicable. Trigger evaluation still forbids model
  and provider invocation.
- Final repair status: ready-for-review. Fresh model-pinned re-review is
  required. This repairer does not self-approve, begin Task 113 or production
  work, create an implementation plan, dispatch work, or merge into `neo` or
  an integration branch.

## Coordinator Recovery RC-105-03 — Section-Local Admission-Scope Audit

This forward-only recovery preserves every original Task 105 claim, review,
and repair record. The earlier phrase that RC-105-02 was the final focused
repair remains historical evidence. Under the later standing coordinator
delegation, repair-count exhaustion is an internal recovery checkpoint rather
than a user gate; this record supersedes only the prior `ready-for-review`
status while the evidence defect is repaired.

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@c7dc10b9`.
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec`.
- Recovery authorization: coordinator-issued Task 105 append-only
  documentation-only registry-history recovery. The allowed range is this one
  verified recovery commit and a separately fresh model-pinned re-review. The
  wave stop is before Task 113, Wave 0B, provider use, production work, and any
  merge.
- Process authorization: this recovery is explicitly authorized to use
  `superpowers:subagent-driven-development`, documentation RED/GREEN, fresh
  review, and verification-before-completion. The worker does not self-approve
  or merge into `neo` or an integration branch.
- Recovery worker: fresh Codex Lane T documentation recovery implementer,
  using the coordinator/user-confirmed GPT-5.6 Terra / Extra High
  configuration.
- Recovery base: `ffb3a52abfbae1595a321c43b948961fa603d961`.
- Owned files: this claim and
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md`.
  Every other tracked file remains forbidden.
- Root cause: RC-105-02 extracted `ProposedTriggerAdmissionScopeV1` but did
  not use that extraction. Its selector and subject-binding assertions searched
  the complete document, so prose outside the interface let its audit accept a
  counterfactual that removed persisted selector fields from the interface.
- Contract assessment: the existing specification already has the required
  persisted non-optional `cooldownScopeSelector`, `budgetScopeSelector`, and
  `policySubjectScope`, the conditional `scopedSubjectRef`, and the finite
  external selector type. This recovery changes no product contract; it repairs
  only the evidence gate that proves those facts section-locally.

### Documentation RED

Before this record's section-local audit existed, the following in-memory
counterfactual deleted the three persisted selector/binding fields from only
the fenced `ProposedTriggerAdmissionScopeV1` interface. The reproduced
RC-105-02 style checks still accepted the weakened document because those words
remained elsewhere in the specification.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const path = "docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md";
const spec = fs.readFileSync(path, "utf8");
const interfaceStart = spec.indexOf("interface ProposedTriggerAdmissionScopeV1");
const interfaceEnd = spec.indexOf("\n}", interfaceStart) + 2;
const weakened = spec.slice(0, interfaceStart) + spec.slice(interfaceStart, interfaceEnd)
  .replace("  cooldownScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;\n", "")
  .replace("  budgetScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;\n", "")
  .replace("  policySubjectScope: \"none\" | \"subject-ref\";\n", "")
  + spec.slice(interfaceEnd);
const priorAuditStillPasses = [
  weakened.includes("admissionScope: ProposedTriggerAdmissionScopeV1"),
  weakened.includes("type ProposedTriggerAdmissionScopeSelectorV1"),
  weakened.includes("deriveAdmissionScope") && weakened.includes("authoritative policy") && weakened.includes("verified request"),
  weakened.includes("cooldownScopeSelector") && weakened.includes("budgetScopeSelector"),
  weakened.includes("must be equal") && weakened.includes("policy is invalid"),
  /reconstruct the admission\s+scope/.test(weakened) && weakened.includes("exactly equal")
].every(Boolean);
if (priorAuditStillPasses) {
  console.error("RED: RC-105-02 global-text audit accepts a ProposedTriggerAdmissionScopeV1 counterfactual with persisted cooldown, budget, and policy-subject selectors removed.");
  process.exit(1);
}
console.log("Unexpected pass: historical audit rejected the weakened interface.");
'
```

- Observed RED result: exit 1 with
  `RED: RC-105-02 global-text audit accepts a ProposedTriggerAdmissionScopeV1 counterfactual with persisted cooldown, budget, and policy-subject selectors removed.`

### Reproducible Section-Local GREEN Audit

The replacement audit extracts the TypeScript fence that contains
`ProposedTriggerAdmissionScopeV1`, then asserts exact field signatures inside
that interface. It tests the finite selector type only in the surrounding
fenced contract and requires the interface to reference that exact type rather
than declare or widen it. The two global probes are limited to the separate
derivation and readback-reconstruction clauses. Each in-memory counterfactual
must fail the precise local assertion it violates.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const spec = fs.readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md", "utf8");
function extractScopeContract(candidate) {
  const blocks = [...candidate.matchAll(/```ts\n([\s\S]*?)```/g)].map(([, block]) => block);
  const contract = blocks.find((block) => /\binterface ProposedTriggerAdmissionScopeV1\s*\{/.test(block)) ?? "";
  const scope = contract.match(/interface ProposedTriggerAdmissionScopeV1\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  return { contract, scope };
}
function audit(candidate) {
  const { contract, scope } = extractScopeContract(candidate);
  const has = (name, signature) => new RegExp(`^\\s*${name}${signature}$`, "m").test(scope);
  const subjectRelation = /`workspace-trigger` requires policy\s+`subjectScope: "none"` and stores no `scopedSubjectRef`\.\s+`workspace-trigger-subject` requires `subjectScope: "subject-ref"` and stores\s+the exact normalized request subject reference/.test(candidate);
  return [
    ["fenced admission-scope interface", Boolean(scope)],
    ["finite external selector type", /(?:^|\n)type ProposedTriggerAdmissionScopeSelectorV1\s*=\s*\n\s*\| "workspace-trigger"\s*\n\s*\| "workspace-trigger-subject";/.test(contract) && !scope.includes("type ProposedTriggerAdmissionScopeSelectorV1")],
    ["non-optional cooldown selector in scope", has("cooldownScopeSelector", ": ProposedTriggerAdmissionScopeSelectorV1;")],
    ["non-optional budget selector in scope", has("budgetScopeSelector", ": ProposedTriggerAdmissionScopeSelectorV1;")],
    ["non-optional policy subject binding in scope", has("policySubjectScope", String.raw`: "none" \| "subject-ref";`)],
    ["conditional scoped subject reference", has("scopedSubjectRef", String.raw`\?: TriggerSubjectRef;`) && subjectRelation],
    ["derivation clause", candidate.includes("`deriveAdmissionScope` uses only the verified request") && candidate.includes("mounted authoritative policy") && candidate.includes("candidate-selected or unknown field")],
    ["reconstruction clause", candidate.includes("persisted in the request and also deterministically\nreconstructed at append and readback") && candidate.includes("persisted scope must be\nexactly equal")]
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
const required = audit(spec);
const exactSelector = `type ProposedTriggerAdmissionScopeSelectorV1 =
  | "workspace-trigger"
  | "workspace-trigger-subject";`;
const variants = [
  ["delete cooldown selector", (candidate) => candidate.replace("  cooldownScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;\n", ""), "non-optional cooldown selector in scope"],
  ["optional cooldown selector", (candidate) => candidate.replace("  cooldownScopeSelector:", "  cooldownScopeSelector?:"), "non-optional cooldown selector in scope"],
  ["delete budget selector", (candidate) => candidate.replace("  budgetScopeSelector: ProposedTriggerAdmissionScopeSelectorV1;\n", ""), "non-optional budget selector in scope"],
  ["optional budget selector", (candidate) => candidate.replace("  budgetScopeSelector:", "  budgetScopeSelector?:"), "non-optional budget selector in scope"],
  ["delete policy subject binding", (candidate) => candidate.replace("  policySubjectScope: \"none\" | \"subject-ref\";\n", ""), "non-optional policy subject binding in scope"],
  ["optional policy subject binding", (candidate) => candidate.replace("  policySubjectScope:", "  policySubjectScope?:"), "non-optional policy subject binding in scope"],
  ["delete conditional subject reference", (candidate) => candidate.replace("  scopedSubjectRef?: TriggerSubjectRef;\n", ""), "conditional scoped subject reference"],
  ["make subject reference unconditional", (candidate) => candidate.replace("  scopedSubjectRef?:", "  scopedSubjectRef:"), "conditional scoped subject reference"],
  ["widen selector type", (candidate) => candidate.replace(exactSelector, "type ProposedTriggerAdmissionScopeSelectorV1 = string;"), "finite external selector type"]
];
const counterfactualFailures = variants.filter(([, mutate, expected]) => !audit(mutate(spec)).includes(expected)).map(([name]) => name);
if (required.length || counterfactualFailures.length) {
  console.error(`RED: section-local admission-scope audit missing: ${[...required, ...counterfactualFailures.map((name) => `counterfactual rejected: ${name}`)].join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: section-local admission-scope audit passed (8 direct assertions; ${variants.length} counterfactuals rejected).`);
'
```

- GREEN result: exit 0 with
  `GREEN: section-local admission-scope audit passed (8 direct assertions; 9 counterfactuals rejected).`
- Dependency restoration: this isolated worktree initially lacked its
  lockfile-pinned `tsc` binary. `npm ci --ignore-scripts` restored dependencies
  without changing tracked files; it is not a product or contract change.
- Whitespace: `git diff --check` exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0 with typecheck passed, 189 test
  files passed with 3 skipped, 2,228 tests passed with 5 skipped, a successful
  Vite production build (with the existing chunk-size warning), and
  `factory-readiness passed`.
- Live-provider gate: not applicable. The trigger specification forbids model
  and provider invocation; this recovery makes no provider call.
- Recovery self-review: the audit now proves all persisted selectors from the
  extracted interface rather than document-global prose. It rejects deletion
  and optionalization of each non-optional selector/binding, deletion or
  unconditionalization of the conditional subject reference, and a widened
  selector type. It does not modify the existing contract or weaken the
  append-only, provenance, reconstruction, no-effect, no-fallback, approval,
  handoff, secret-safe, ownership, or out-of-scope team invariants.
- Recovery status: ready-for-review. A separately fresh model-pinned reviewer
  must review this commit. This recovery does not self-approve, start Task 113
  or Wave 0B, implement production work, invoke a provider, or merge into
  `neo` or an integration branch.
