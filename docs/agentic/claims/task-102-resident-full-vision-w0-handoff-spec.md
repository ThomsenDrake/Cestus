# Task 102 Claim: Resident Full-Vision Wave 0A Durable Handoffs Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md@811458d2094dc166b10b9255d1829eae73f2d08e`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@68fe8e87c9e6cd05e8e711fa9afd3e8e3c6cfaab`
- Task and lane: Task 102 / H / Wave 0A
- Status: ready-for-review
- Branch: `codex/task-102-resident-full-vision-w0-handoff-spec`
- Worktree: `/home/drake/.codex/worktrees/f3a3/Cestus`
- Base commit: `bb41ee02d30a0af5d85a467dc63fd501a7f9a165`
- Host configuration: GPT-5.6 Terra / Extra High, assigned and confirmed by the coordinator and user

## Authorization and Scope

The coordinator-issued scoped authorization from task thread
`019f56d2-eb3b-7293-b7b9-bf0329f604b9` authorizes Task 102 only, including
documentation RED/GREEN, fresh review, and verification-before-completion. It
does not authorize a merge into `neo`, a lane implementation plan, Task 109 or
later work, production code, tests, runtime, UI, provider, or shared-contract
changes.

Owned files:

- `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md`
- `docs/agentic/claims/task-102-resident-full-vision-w0-handoff-spec.md`

Every other tracked file is forbidden.

## Required Evidence and Stop Point

- Documentation RED: record a pre-spec coverage audit that fails until the H
  specification defines the required lifecycle, mount, replay, DTO,
  failure-injection, ownership, and sequencing contracts.
- Documentation GREEN: `git diff --check` and `npm run factory:check`.
- Full verification: `npm run verify`.
- Fresh review: required after the scoped documentation commit; this author
  does not self-approve.
- Stop: commit the lane specification and this claim, then wait for fresh
  coordinator review and written H-spec approval. Do not create a lane
  implementation plan or dispatch a worker.

## Invariants

- Preserve the append-only ledger, exact provenance bindings, rebuildable
  projections, independently governed external-effect approvals, one resident
  identity (`agent_default`), mounted-workspace authority, and secret-safe
  boundaries.
- A durable handoff is proved by ledger and artifact-store readback, never a
  returned DTO, in-memory state, a completed-run hash, or a blob-store scan.
- Workspace absence, stale identity, or mount swap permits no internal fallback
  ledger, artifact, derivative, or handoff write.

## Documentation RED/GREEN and Self-Review

- RED command: an inline Node coverage audit of
  `docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md`
  requiring PRR, investigation, ontology, mounted-store, readback, browser DTO,
  terminal/resumable, no-fallback, secret, failure-injection, and merge/rebase
  coverage. Before the specification existed it exited 1 with `RED: durable
  handoff specification is absent`.
- GREEN command: the same coverage audit exited 0 with `GREEN: durable handoff
  coverage audit passed` after the specification was written.
- Self-review: no placeholders or unrelated scope; stable interface proposals
  are explicitly pre-freeze; ownership keeps W/R/L/P/U/A boundaries separate;
  replay remains ledger/artifact-readback-only; append-only, provenance,
  mounted-authority, no-fallback, and secret-safe requirements are explicit.
- Final checks: staged `git diff --check` exited 0 with no whitespace output;
  `npm run factory:check` exited 0 with `factory-readiness passed`; and
  `npm run verify` exited 0 after lockfile-pinned dependencies were restored by
  `npm ci --ignore-scripts` in the fresh worktree. No provider gate applies to
  this documentation-only task.
- Review and stop: fresh coordinator H-spec review and written H-spec approval
  are pending. This author does not self-approve, create Task 110, dispatch, or
  merge.

## Repair Correction RC-102-01 — Review Findings, Base-Provenance, and Documentation Audit

This forward-only correction preserves the historical initial claim above,
including its invalid base field. It supersedes that field and the prior
non-reproducible audit description only; it does not rewrite initial evidence.

- Repair authorization: coordinator-issued Task 102 Lane H specification
  review-repair only, from task thread `019f56d2-eb3b-7293-b7b9-bf0329f604b9`.
  It authorizes one verified repair commit followed by fresh model-pinned
  re-review, with no Task 110, implementation plan, production work, dispatch,
  or merge.
- Review trigger: `needs-changes` from fresh review thread
  `019f57ee-1504-7a73-b713-1265baacab25`.
- Worker identity: Codex, Task 102 Lane H specification repairer, on the
  coordinator/user-assigned GPT-5.6 Terra / Extra High configuration.
- Repair claimed-at: 2026-07-12T20:16:26Z.
- Initial claim commit: `d761060c67e7fb9325fb5960601eebbcd8919a14`
  (`docs: claim resident durable handoff specification`), committed at
  2026-07-12T19:56:18Z.
- Corrected base: `bb41ee02d7061f838917d378bccf17a6a6ad9e80`.
- Repair status: repairing; this correction supersedes the prior
  `ready-for-review` status until the repair's verification is recorded.

### Object/ancestry check

```bash
git cat-file -e bb41ee02d7061f838917d378bccf17a6a6ad9e80^{commit}
git merge-base --is-ancestor bb41ee02d7061f838917d378bccf17a6a6ad9e80 da822d3820cd25dc10b930d86e4e83fbf48e5272
```

Observed before repair: `git cat-file -t` printed `commit`; both commands
exited 0. The corrected base is therefore an existing commit and an ancestor of
the reviewed Task 102 specification commit.

### Reproducible repair audit

The following exact documentation audit is the repair's RED/GREEN command. It
asserts claim correction/base/worker evidence, separately versioned
authority-bound manifests, strict legacy-v1 fail-closed replay, the additive
canonical manifest field set, task-completed lifecycle and causation rule,
terminal/resumable status mapping, browser-safe provenance, and durable audit
evidence. It reads only the two owned files.

```bash
node --input-type=module --eval '
import fs from "node:fs";
const specPath = "docs/superpowers/specs/2026-07-12-resident-agent-durable-handoffs-design.md";
const claimPath = "docs/agentic/claims/task-102-resident-full-vision-w0-handoff-spec.md";
const spec = fs.readFileSync(specPath, "utf8");
const claim = fs.readFileSync(claimPath, "utf8");
const manifestStart = spec.indexOf("interface AuthorityBoundSpecialistHandoffManifestV2");
const manifestEnd = spec.indexOf("## Append, Readback, and Recovery Protocol", manifestStart);
const manifest = manifestStart < 0 ? "" : spec.slice(manifestStart, manifestEnd);
const lifecycle = spec.slice(spec.indexOf("type HandoffLifecycle"), spec.indexOf("interface SpecialistHandoffProjection"));
const assertions = [
  ["append-only claim correction", claim.includes("## Repair Correction RC-102-01")],
  ["corrected base and ancestry evidence", claim.includes("bb41ee02d7061f838917d378bccf17a6a6ad9e80") && claim.includes("Object/ancestry check") && claim.includes("exit 0")],
  ["worker identity and UTC repair claim", claim.includes("Worker identity:") && /Repair claimed-at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(claim)],
  ["authority-bound manifest v2", spec.includes("agent-specialist-handoff-manifest.v2")],
  ["strict legacy-v1 non-executable replay", spec.includes("legacy-v1") && spec.includes("non-executable") && spec.includes("fail closed")],
  ["additive canonical v2 manifest", ["safeSummary", "finalOutputStepId", "contextPackRefs", "promptArtifactHash", "outputArtifacts", "toolRequestIds", "approvalRequirements", "nextSafeActions", "failure", "supersedesHandoffId", "supersedesEventId", "handoff"].every((field) => manifest.includes(field))],
  ["task-completed lifecycle member", lifecycle.includes("\"task-completed\"")],
  ["verified recorded task-completion rule", spec.includes("Verified task-completion rule") && spec.includes("causationId")],
  ["explicit status mapping", spec.includes("Terminal, Resumable, and Task Status Mapping") && ["ready-for-review", "waiting-for-approval", "blocked", "failed"].every((status) => spec.includes(status))],
  ["browser-safe provenance projection", spec.includes("ResidentHandoffProvenanceDto") && ["handoffManifestHash", "finalOutputEventId", "preparedEventId", "recordedEventId", "terminalRunEventId", "taskStatusEventId"].every((field) => spec.includes(field))],
  ["repaired deterministic audit evidence", claim.includes("Reproducible repair audit") && claim.includes("GREEN: Task 102 repair audit passed")]
];
const missing = assertions.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length > 0) {
  console.error(`RED: Task 102 repair audit missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`GREEN: Task 102 repair audit passed (${assertions.length} assertions).`);
'
```

RED evidence before this repair: exit 1 with
`RED: Task 102 repair audit missing: append-only claim correction, corrected
base and ancestry evidence, worker identity and UTC repair claim,
authority-bound manifest v2, strict legacy-v1 non-executable replay, additive
canonical v2 manifest, task-completed lifecycle member, verified recorded
task-completion rule, explicit status mapping, browser-safe provenance
projection, repaired deterministic audit evidence`.

GREEN evidence and full verification are pending the repaired-spec audit and
the required fresh `git diff --check`, `npm run factory:check`, and
`npm run verify` commands. No live-provider gate applies to this
documentation-only repair.

### Repair verification and re-review gate

- GREEN audit: the exact command above exited 0 with
  `GREEN: Task 102 repair audit passed (11 assertions).`
- Whitespace: staged `git diff --check` exited 0 with no output.
- Factory readiness: `npm run factory:check` exited 0 with
  `factory-readiness passed`.
- Full verification: `npm run verify` exited 0; its recorded output includes
  `typecheck passed` and the deterministic test runner start. The repair makes
  no provider change, so the live-provider gate remains not-applicable.
- Repair self-review: RC-102-01 preserves the historical invalid base rather
  than rewriting it; v2 is an additive manifest superset; strict v1 replay is
  historical/non-executable; task completion requires recorded/run/task
  causation; browser provenance is compact and v2-readback-only; and the audit
  covers every repaired reviewer invariant. No placeholder, ownership, append-
  only, provenance, fallback, secret-safety, production, or team-mode scope
  drift remains in the two-file repair diff.
- Repair status: ready-for-review. This supersedes the `repairing` state only.
  Fresh model-pinned re-review is required before any coordinator approval or
  other task; this repairer does not self-approve, create Task 110, dispatch,
  or merge.

## Coordinator Review, Lane Approval, and Integration

- Recorded at: `2026-07-12T20:39:55Z`.
- Fresh review: the independent fresh reviewer `/root/review_task102_repair`
  approved repair commit `5a80480c93920a37df45bd606ea12e0fe57e1e2d` after
  reviewing the Task 102 owned-file diff, RC-102-01, and its reproducible
  audit. The session used the user-confirmed GPT-5.6 Terra / Extra High
  configuration.
- Coordinator lane decision: under the Standing Coordinator Delegation at
  governing spec `811458d2094dc166b10b9255d1829eae73f2d08e`, Lane H's written
  specification is approved. This decision authorizes neither Task 110 nor
  production work; Wave 0A's lane-spec stop remains in force.
- Integration: coordinator branch
  `codex/resident-agent-full-vision-program-plan` merged the approved task
  branch with merge commit `391e96fa32db4ecb38bc0bb19ebd859f1d3ec817`. No
  rebase was needed: the branch was additive, its required base was an
  ancestor, and the merge was conflict-free after the Task 101 integration.
  No merge into `neo` occurred.
- Coordinator verification: `git diff --check`, `npm run factory:check`, and
  `NODE_NO_WARNINGS=1 npm run verify` all exited 0 on the integrated checkout;
  the full verifier reported typecheck passed, 189 test files passed with 3
  skipped, 2,228 tests passed with 5 skipped, a successful Vite build with the
  existing chunk-size warning, and factory-readiness passed.
- Current status: merged. Archive remains coordinator-administered until the
  author and reviewer final handoffs, clean worktree, branch ancestry, and
  durable registry evidence are all reconciled.
