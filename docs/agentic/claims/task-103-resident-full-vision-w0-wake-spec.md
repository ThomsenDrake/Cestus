# Task 103 Claim: Resident Full-Vision Wave 0 Wake Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md` at `811458d2`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `68fe8e87`
- Task: Task 103 / Lane W — Wake and Portable Lifecycle specification
- Worker: Codex Task 103 W specification author
- Task thread: `019f56d2-eb3b-7293-b7b9-bf0329f604b9`
- Branch: `codex/task-103-resident-full-vision-w0-wake-spec`
- Worktree: `/home/drake/.codex/worktrees/4a49/Cestus`
- Base commit: `bb41ee02d7061f838917d378bccf17a6a6ad9e80`
- Claimed at: `2026-07-12T19:55:14Z`
- Model configuration: GPT-5.6 Terra / Extra High
- Status: ready-for-review

## Ownership

- Create: `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md`
- Create: `docs/agentic/claims/task-103-resident-full-vision-w0-wake-spec.md`

Every other tracked file is forbidden. This task creates neither an
implementation plan nor production, test, runtime, UI, provider, or shared
contract changes.

## Authorization And Stop Condition

The coordinator-issued authorization permits Task 103 only, using the approved
Wave 0 umbrella documents, documentation RED/GREEN audit, fresh coordinator
review, and verification-before-completion. The work stops after the scoped
specification and this claim are committed, for a written W-spec approval. The
task does not dispatch work, self-merge, merge into `neo`, or start Task 109,
Task 110, Task 111, or any implementation work.

## Required Specification Coverage

- One-resident supervision, browser-independent wake scheduling, pause/resume,
  bounded recovery, process ownership, and scheduler ownership.
- Mounted portable-workspace availability, identity, locks, high-water,
  revalidation, disconnect, restart, degraded, and unrecoverable states.
- No internal fallback ledger, projection, artifact, derivative, or store
  writes when portable authority is unavailable or mismatched.
- Versioned, provenance-complete, secret-safe diagnostics, lifecycle command
  boundaries, recovery/readback evidence, deterministic failure injection,
  later live acceptance, and coordinator-only merge/rebase constraints.

## Documentation Evidence Required

- RED: a documented coverage audit before the lane specification exists;
  `git diff --check` and `npm run factory:check` run before specification
  completion.
- GREEN: `git diff --check`, `npm run factory:check`, and `npm run verify`
  after the specification and claim are complete.
- Review: a fresh coordinator spec review and written W-spec approval after
  the committed lane specification.

## Original Documentation Evidence (Preserved)

The original Task 103 factual outcomes remain preserved below. Its abbreviated
inline audit notation is superseded by the complete executable review-repair
audit recorded at the end of this claim.

- RED observed result: before the specification was created, the absence audit
  exited 1 with `RED: Task 103 wake and portable lifecycle specification is
  absent.`
- Baseline documentation checks: `git diff --check` exited 0 with no output
  and `npm run factory:check` reported `factory-readiness passed`.
- GREEN observed result: after the original specification was complete, the
  required-heading and coverage audit reported `GREEN: Task 103 wake
  specification coverage audit passed.`
- Follow-up checks: `git diff --check` exited 0 with no output and `npm run
  factory:check` reported `factory-readiness passed`.
- Self-review: confirmed scope is restricted to this specification and claim;
  no unfinished markers or existing implementation interface collisions were
  found; proposed ownership preserves W/R/U/T/L/P/A boundaries; and the design
  requires append-only evidence, provenance, durable readback, and no fallback
  storage.

## Final Verification Evidence

- `git diff --check` exited 0 with no output.
- `npm run factory:check` reported `factory-readiness passed`.
- `npm run verify` exited 0 after the isolated worktree's lockfile-pinned
  dependencies were restored; the verification chain includes typecheck,
  deterministic tests, UI build, and factory readiness.

## Handoff

The specification is ready for a fresh coordinator spec review and written
W-spec approval. Task 103 is complete at this gate only; Task 109, Task 110,
Task 111, all production work, dispatch, and merge into `neo` remain outside
this task.

## Stop And Escalation Conditions

Stop for data-loss or fallback-storage risk; an event, DTO, interface, or file
ownership conflict; unavailable dependency; verifier failure after two focused
repairs; portable-workspace identity mismatch needing a policy decision; or a
required expansion beyond Task 103.

## Review Repair Record — Durable Wake Claim Reconciliation

Recorded at: 2026-07-12T21:57:27Z

This append-only repair responds to fresh review of the committed Task 103
specification. It preserves the original Task 103 outcomes above, replaces the
abbreviated audit notation with the executable audit below, and changes only
the two Task 103-owned documentation files. It does not create Task 111,
production contracts, implementation code, a fallback store, or a merge into
`neo`.

### Documentation RED/GREEN Audit Command

The same command is the focused documentation contract test. Before this
repair, it exited 1 because the W supervision and portable-authority families
were present but the durable active-claim reconciliation contract and complete
audit evidence were absent. After this repair, it must exit 0.

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const spec = readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md", "utf8");
const claim = readFileSync("docs/agentic/claims/task-103-resident-full-vision-w0-wake-spec.md", "utf8");
const families = {
  supervision: [
    "## Process And Scheduler Ownership",
    "## Wake, Pause, Resume, And Recovery",
    "## Lifecycle Command And Route Boundaries"
  ],
  portable: [
    "## Portable Workspace Authority",
    "### Revalidation Contract",
    "### No Fallback Storage"
  ],
  reconciliation: [
    "## Review Repair: Durable Active-Claim Reconciliation After Reconnect",
    "No fallback append occurs while the mount is unavailable.",
    "workspace-unavailable checkpoint",
    "claimId",
    "attemptId",
    "outageObservedAt",
    "causation ID",
    "authority evidence",
    "high-water",
    "policy version/digest",
    "lock-state digest",
    "normal claim recovery",
    "readback"
  ]
};
const missing = Object.entries(families).flatMap(([family, markers]) =>
  markers.filter((marker) => !spec.includes(marker)).map((marker) => `${family}:${marker}`)
);
const legacyCommandPrefix = "node --input" + "-type=module -e '";
const legacyAuditSuffix = "a" + "udit>";
if (claim.includes(legacyCommandPrefix) && claim.includes("<") && claim.includes(legacyAuditSuffix)) {
  missing.push("claim:abbreviated documentation audit command");
}

if (missing.length > 0) {
  console.error(`RED: Task 103 W documentation repair audit failed as expected: ${missing.join(" | ")}`);
  process.exit(1);
}

console.log("GREEN: Task 103 W documentation repair audit passed: supervision, portable authority, durable reconciliation, and executable evidence are present.");
NODE
```

### Observed Documentation Evidence

- RED command: the audit above exited 1 before the repair with
  `RED: Task 103 W documentation repair audit failed as expected:` followed by
  missing reconciliation requirements and `claim:abbreviated documentation
  audit command`.
- GREEN command: the same audit was rerun after the repair and reported
  `GREEN: Task 103 W documentation repair audit passed: supervision, portable
  authority, durable reconciliation, and executable evidence are present.`
- Repair acceptance added to the W design requires no fallback append during
  outage; same-identity revalidation followed by exact active-claim
  release/checkpoint append and readback; idempotent duplicate recovery; and
  normal claim recovery without reusing pre-outage execution state.

### Repair Verification Evidence

- `git diff --check` exited 0 with no output.
- `npm run factory:check` reported `factory-readiness passed`.
- The isolated worktree initially lacked its lockfile-installed dependencies,
  so `npm run verify` stopped before typecheck with `tsc: command not found`.
  `npm ci` restored the lockfile-defined local environment without tracked-file
  changes. The subsequent `npm run verify` exited 0 with `typecheck passed`,
  189 passed and 3 skipped test files, 2228 passed and 5 skipped tests, a
  successful Vite build, and `factory-readiness passed`.

## Review Repair Record — Counterfactual-Sensitive Lifecycle Audit

Recorded at: 2026-07-12T22:12:21Z

This final permitted Task 103 repair responds to fresh re-review. The earlier
repair already made the lifecycle contract sound; this record strengthens only
its executable documentation audit. The audit now extracts the exact
same-identity reconciliation section, requires the normative ordering before
`recovering` or `running`, requires the post-reconnect active-claim
checkpoint/readback wording, and proves that removing or reversing those facts
fails in memory. No lifecycle contract, Task 111 plan, production file, or
runtime behavior changes in this repair.

### Documentation RED/GREEN Audit Command

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const spec = readFileSync("docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md", "utf8");
const claim = readFileSync("docs/agentic/claims/task-103-resident-full-vision-w0-wake-spec.md", "utf8");
const repairRecordHeading = "## Review Repair Record — Counterfactual-Sensitive Lifecycle Audit";
const lifecycleStart = "### Same-Identity Revalidation And Durable Reconciliation";
const lifecycleEnd = "### Normal Claim Recovery";
const revalidation = "`WorkspaceAvailabilityAuthority.revalidate()` must grant a new authority for the same workspace ID.";
const orderedReconciliation = "After successful same-identity revalidation, and before the supervisor may enter `recovering` or `running`, the authoritative claim service must append and read back exactly one durable active-claim reconciliation record for the observed active claim/attempt.";
const checkpointReadback = "The completion result is valid only after the appended release or workspace-unavailable checkpoint and its exact mounted ledger readback agree";

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractLifecycleSection(document) {
  const start = document.indexOf(lifecycleStart);
  const end = start < 0 ? -1 : document.indexOf(lifecycleEnd, start);
  return start >= 0 && end > start ? document.slice(start, end) : "";
}

function auditLifecycleSection(section) {
  const normalized = normalize(section);
  const missing = [];
  for (const requirement of [revalidation, orderedReconciliation, checkpointReadback]) {
    if (!normalized.includes(requirement)) missing.push(requirement);
  }
  const indexes = [revalidation, orderedReconciliation, checkpointReadback].map((requirement) => normalized.indexOf(requirement));
  if (indexes.every((index) => index >= 0) && !(indexes[0] < indexes[1] && indexes[1] < indexes[2])) {
    missing.push("ordered: revalidation -> reconciliation -> checkpoint/readback");
  }
  return missing;
}

const lifecycle = extractLifecycleSection(spec);
const failures = [];
if (!claim.includes(repairRecordHeading)) failures.push("claim:counterfactual lifecycle repair record");
if (!lifecycle) failures.push("spec:exact lifecycle section");
for (const missing of auditLifecycleSection(lifecycle)) failures.push(`lifecycle:${missing}`);

const normalizedLifecycle = normalize(lifecycle);
const counterfactuals = [
  ["removed same-identity revalidation", normalizedLifecycle.replace(revalidation, "A remembered authority may be reused after reconnect.")],
  ["reversed recovery ordering", normalizedLifecycle.replace(orderedReconciliation, "Before successful same-identity revalidation, the authoritative claim service may append a reconciliation record and enter `recovering` or `running`.")],
  ["removed checkpoint readback", normalizedLifecycle.replace(checkpointReadback, "A generic reconnect diagnostic is sufficient")]
];
for (const [name, counterfactual] of counterfactuals) {
  if (auditLifecycleSection(counterfactual).length === 0) failures.push(`counterfactual:${name}:audit unexpectedly passed`);
}

if (failures.length > 0) {
  console.error(`RED: Task 103 counterfactual lifecycle audit failed as expected: ${failures.join(" | ")}`);
  process.exit(1);
}

console.log("GREEN: Task 103 counterfactual lifecycle audit passed: exact same-identity revalidation precedes recovery and durable checkpoint/readback, and all counterfactuals fail.");
NODE
```

### Observed Documentation Evidence

- RED command: before this record was appended, the command exited 1 with
  `RED: Task 103 counterfactual lifecycle audit failed as expected:
  claim:counterfactual lifecycle repair record`.
- GREEN command: the exact command was rerun after appending this record and
  reported `GREEN: Task 103 counterfactual lifecycle audit passed: exact
  same-identity revalidation precedes recovery and durable
  checkpoint/readback, and all counterfactuals fail.`

### Final Repair Gate Evidence

- `git diff --check` exited 0 with no output.
- `npm run factory:check` reported `factory-readiness passed`.
- `npm run verify` exited 0 with `typecheck passed`, 189 passed and 3 skipped
  test files, 2228 passed and 5 skipped tests, a successful Vite build, and
  `factory-readiness passed`.
