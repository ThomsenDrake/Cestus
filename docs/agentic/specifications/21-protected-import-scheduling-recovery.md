# Protected Import Scheduling, Quarantine, And Recovery

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: approved.

## Desired Behavior

Cestus schedules the exact Specification 20 selection and coordinates ordinary
observation, protected redaction, evidence finalization, cancellation,
quarantine, and crash recovery. It does not expand selection, parse admitted
documents, call OCR/resident providers, or alter ontology truth.

One append-only batch record binds the version-two import approval, exact
selection hash, manifest, destination, and policy identities. Every selected
entry receives deterministic job and attempt identities. State transitions use
compare-and-append fences and expiring ownership leases. Duplicate wakes and
concurrent runners converge on the same state. Canonical manifest order defines
queue order.

V1 permits two concurrent ordinary observations and one protected-redaction
job. The resident cannot change either limit.

Before observing an entry, the scheduler checks every condition knowable
without content access: current batch/approval, exact selected membership,
human cancellation, boundary/root/mount readiness, destination append/blob
readiness, protected commitment/model/sandbox/security posture, and existing
terminal/prepared/recovery state. Preflight failure creates no source open,
stage file, model input, evidence, provider call, or downstream job.

Nonterminal attempt states are `queued`, `preflighting`, `observing`,
`redacting`, `staged`, `prepared`, `finalizing`, and `recovery-required`.
Terminal attempt states are `committed`, `reused-identical-evidence`,
`changed`, `missing`, `quarantined`, `blocked-stale-approval`,
`blocked-readiness`, `cancelled-before-start`, `cancelled-before-commit`,
`interrupted-before-commit`, `not-run-safety-stop`,
`stopped-safety-failure-before-prepare`, and `failed-integrity`. An attempt
never leaves a terminal state.

The selected-entry projection is distinct from attempts. Its nonterminal states
are `pending`, `active`, `awaiting-resolution`, `prepared`, and
`recovery-required`. Its terminal outcomes are `committed`,
`reused-identical-evidence`, `changed`, `missing`, `blocked-stale-approval`,
`blocked-readiness-final`, `cancelled-before-start`, `cancelled-before-commit`,
`not-run-safety-stop`, `stopped-safety-failure`, `failed-integrity`, and
`excluded-by-human`. A
`quarantined`, transient `blocked-readiness`, or `interrupted-before-commit`
attempt leaves its entry `awaiting-resolution` while a permitted linked attempt
or disposition remains;
the immutable attempt itself is still terminal. A linked retry transitions the
entry from `awaiting-resolution` to `active` without changing the old attempt.
Only an exclusion, explicit permanent-readiness disposition, or another final
resolution makes that entry terminal.

Every transition records fixed secret-safe reason codes, timestamps,
predecessor identity, and relevant approval/policy versions. It contains no
source content, raw protected hash, credential value, model text, unsafe
exception, or reversible token.

Only an authenticated human may cancel a batch. The resident may request
cancellation but cannot decide it. Unstarted selected entries become
`cancelled-before-start`. Active entries before Specification 20's `prepared`
point stop at the next bounded processing boundary, discard only tracked
private staging, and become `cancelled-before-commit`. Entries at or after
`prepared` must finalize the exact committed bytes. Cancellation never deletes
evidence, rewrites provenance, or reopens selection.

Clean process shutdown is not cancellation. It stops acquiring work,
checkpoints/releases leases, and leaves the batch resumable. Abrupt interruption
before `prepared` appends an `interrupted-before-commit` attempt result during
recovery, removes only tracked private staging, revalidates all authority, and
may create one bounded replacement attempt. Interruption after `prepared`
resumes exact Specification 20 finalization without source reopen or new
approval.

One prepared obligation permits three automatic finalization invocations total:
the initial invocation plus two recovery invocations. The persisted count is
incremented and flushed when an owner acquires the exact finalization lease,
before touching canonical storage/ledger, and restart never resets it. A crash,
storage error, or ledger error after acquisition consumes the invocation; an
owner that fails before acquisition does not. After three unsuccessful
invocations, the entry and batch remain
nonterminal `recovery-required` and raise a genuine integrity/storage exception.
They may not falsely report completion, abandon the prepared commitment, or
substitute bytes. Repair resumes the same obligation.

After the operator repairs the named storage/ledger condition, one
authenticated resume action may grant one additional finalization invocation
for the unchanged prepared identity. It does not reset history or permit source
reopen/substitution. Failure returns to `recovery-required`; there is no
automatic loop.

Entry-local mutation, disappearance, classification, redaction, or content-
policy failure does not stop stable siblings. Root/mount/boundary replacement,
batch-wide approval invalidity, destination replacement, ledger failure,
canonical-storage integrity failure, or confinement loss stops new work.
Unstarted entries become `not-run-safety-stop`. For every active attempt that
has not reached `prepared`, the systemic-stop owner compare-and-appends exactly
one `stopped-safety-failure-before-prepare` attempt result and its selected
entry transitions from `active`, `pending`, or `awaiting-resolution` to the
terminal `stopped-safety-failure` outcome. That transition binds the systemic
safety-failure identity/class, batch, attempt, selected public manifest-entry
ID, current approval/policy/boundary/destination bindings, and one fixed
secret-safe reason code; it contains no source content, protected hash,
credential, model text, traceback, or reversible token. It discards only
tracked private pre-prepare staging and never performs another source open,
replacement attempt, or downstream job for that entry. Prepared/finalizing or
already `recovery-required` work is never converted to either stop outcome: it
remains the exact recovery obligation.

Recovery replays the same fenced stop transition and terminal selected-entry
outcome idempotently; a restarted owner may not allocate a new attempt or
resume a terminal stopped entry. After a repaired systemic condition, executing
such an entry again requires a new exact batch/approval, while the preserved
attempt/result remains provenance. Protected-runtime unavailability affects
protected entries without stopping independent ordinary entries.

Pre-evidence quarantine uses a new append-only
`ingestion.observation.quarantined` contract, not `evidence.quarantined`. It
binds batch, attempt, selected manifest entry, source observation/commitment,
approval, redaction policy, runtime/model bundle, security posture, safe reason
code, and permitted resolution classes. It contains no evidence ID because no
evidence exists, and no source bytes, values, plain protected hash, raw model
output, traceback, or reversible token.

The quarantine record is immutable and terminal for that attempt. A later
retry or sanitized replacement creates a new linked attempt and never edits or
removes the original record. Safe projections expose reason class and permitted
next actions without content.

One automatic new attempt is allowed only for a classified transient local
failure, such as a worker crash or restored readiness, when source, approval,
manifest, policy, model, posture, and destination bindings are identical.
Syntax ambiguity, residual-secret detection, mutation, missing input, stale
authority, and integrity failure never auto-retry. A second transient failure
creates another terminal quarantined attempt and leaves the entry
`awaiting-resolution` with no automatic retry. Restart cannot reset retry count.
There is no unbounded loop, blind path reopen, or alternate worker/storage path.

A human may append `excluded-by-human` for a quarantined selected entry, retry
after restoring identical approved runtime/configuration, approve one exact
manually sanitized replacement under Specification 18, or create a new
scan/manifest/approval if a binding must change. The resident may recommend one
resolution and request review but cannot approve it. Exclusion only reduces
execution; it cannot add/substitute entries. Manual replacement approval binds
one digest and creates a new linked attempt.

The batch projection derives only from selected-entry aggregates, never by
counting terminal attempts. Batch terminal states are:

- `completed` when every selected entry is terminal as committed or reused;
- `completed-with-exceptions` when every selected entry is terminal with at
  least one changed, missing, blocked, excluded, or integrity
  result and no cancellation/systemic stop;
- `cancelled` when human cancellation is fully accounted for; and
- `stopped-safety-failure` when a bound systemic safety failure occurred and
  every selected entry is terminal. Entries terminal before the stop preserve
  their own outcome; unstarted entries are `not-run-safety-stop` and
  pre-prepare active entries are `stopped-safety-failure`. Any `prepared`,
  `finalizing`, or `recovery-required` entry prevents this aggregation.

A batch containing any unresolved `prepared` or `recovery-required` entry is
never terminal. Terminal counts derive from immutable entry states and must
equal the approved selected count. No unstarted entry can disappear from
accounting.

As soon as one entry commits, its exact evidence/provenance is available to
later derivative specifications; siblings need not complete first. This slice
creates no OCR or resident call. Artifact-local failure does not block
successful siblings unless it reveals a systemic safety failure.

## Observable Acceptance Examples

- Two ordinary fixtures run concurrently while a third waits; exactly one
  protected fixture enters redaction. Duplicate wakeups cannot exceed limits or
  create a second attempt transition.
- A stale approval, cancelled batch, missing root, unavailable destination, or
  unavailable protected runtime is classified during preflight without a
  content open or durable data effect.
- Cancellation before start and during observation/redaction/staging gives
  every affected entry its exact terminal cancellation state. A prepared entry
  finalizes before the batch reports `cancelled`.
- Clean shutdown leaves resumable work. Abrupt pre-prepare crash closes the old
  attempt and performs at most the permitted replacement attempt after full
  revalidation. Post-prepare crash resumes exact finalization without source
  reopen.
- A quarantined attempt is terminal while its selected entry remains awaiting
  resolution. Retry creates one linked attempt; exclusion finalizes the entry.
  Batch totals count the entry once and never count both attempts.
- A malformed protected fixture creates metadata-only
  `ingestion.observation.quarantined` with no evidence ID, content, plain hash,
  model text, or credential-shaped field. Successful siblings still commit.
- One worker crash may produce one automatic linked attempt under unchanged
  bindings. Another transient failure quarantines. Syntax, residual-secret,
  stale, mutation, missing, and integrity fixtures never auto-retry.
- Human exclusion, identical-policy retry, and exact sanitized replacement
  create append-only resolution/attempt records. Resident-originated decisions
  fail, while a resident recommendation remains non-authoritative.
- Batch terminal counts exactly equal selected count for completion,
  exceptions, cancellation, and safety-stop fixtures. Unresolved prepared work
  keeps the batch `recovery-required` and nonterminal.
- A root, boundary, destination, ledger, canonical-storage, or confinement
  systemic-stop fixture terminalizes an active pre-prepare entry exactly once
  as `stopped-safety-failure` with its bound safe reason, while unstarted
  siblings are `not-run-safety-stop`. Replay preserves those results; a
  prepared sibling remains recovery-required and prevents the batch
  `stopped-safety-failure` aggregate.
- Prepared-finalization fault injection proves the initial-plus-two automatic
  bound persists across restart; a fourth automatic invocation is impossible,
  while one explicit unchanged-obligation resume grants exactly one attempt.
- Standard verification uses fake schedulers, clocks, workers, ledgers,
  storage, and observations. It does not read the attached SSD, process a real
  credential, execute the model, invoke a provider, bind a socket, send a PRR,
  publish, or create live evidence.

## Allowed Scope

- `packages/ontology/src/contracts.ts` and focused projections/tests only for
  import batch/attempt/quarantine/resolution events and rebuildable states.
- `packages/ingestion/src/**` only for exact-selection job creation, leases,
  fixed queue limits, state transitions, preflight, cancellation, failure
  classification, quarantine, bounded retry, recovery, and terminal totals.
- `packages/ingestion/test/**` for concurrency, lease, wake, preflight,
  cancellation, interruption, quarantine, retry, prepared recovery, systemic
  stop, and terminal-accounting fixtures.
- `packages/agent/src/scheduler.ts`, tool gateway/read models, and focused
  adjacent modules only for safe progress, recommendation/request behavior,
  and human-decision forwarding.
- `packages/agent/test/scheduler.test.ts` and focused resident import scheduler
  tests.
- `packages/local-runtime/src/**` only for authenticated run/cancel/resume/
  quarantine-resolution routes and dependency wiring.
- `packages/local-runtime/test/**` for actor authority, restart, cancellation,
  recovery-required, mounted readiness, and zero-live-effect tests.
- Do not modify source traversal/classification, evidence commit semantics,
  commitment/redaction algorithms/runtime installation, derivative parsing,
  provider/OCR invocation, resident semantic extraction, ontology truth, UI,
  PRR, legal, export, publication, or destructive operations beyond tracked
  private staging cleanup.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/18-protected-secret-redaction.md`
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md`
- `docs/agentic/specifications/20-exact-import-approval-evidence-admission.md`
- `packages/ontology/src/contracts.ts`
- `packages/ingestion/src/import-service.ts`
- `packages/ingestion/src/projection.ts`
- `packages/ingestion/src/runtime.ts`
- `packages/agent/src/scheduler.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice orchestrates live source reads, secret redaction, durable
evidence completion, cancellation, and recovery. Live run/cancel/quarantine-
resolution decisions remain authenticated human actions; verification uses
only synthetic/fake dependencies.

## Targeted Verification

- `npm test -- packages/ontology/test/contracts.test.ts packages/ingestion/test/import-scheduler.test.ts packages/ingestion/test/import-scheduler-terminality.test.ts packages/ingestion/test/import-quarantine.test.ts packages/ingestion/test/import-recovery.test.ts`
- `npm test -- packages/agent/test/scheduler.test.ts packages/agent/test/resident-import-scheduler.test.ts`
- `npm test -- packages/local-runtime/test/agent-resident-source-import-routes.test.ts packages/local-runtime/test/ingestion-import-recovery.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves fixed bounded scheduling,
effect-free preflight, complete cancellation/shutdown/safety-stop semantics,
immutable metadata-only quarantine, one bounded eligible retry, prepared
recovery obligations, exact terminal accounting, resident non-authority, and
zero live/external effects.

## Integration Verification

Build only after Specification 20 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live source
execution, cancellation, and quarantine resolution remain separately human-
gated actions.

## Escalation Conditions

Escalate for changed concurrency, agent cancellation/resolution authority,
selection expansion, automatic retry of a prohibited class, retry-count reset,
mutable/deleted quarantine history, abandoning/substituting prepared bytes,
terminal status with unresolved prepared work, fallback storage/worker paths,
live SSD/model/provider/evidence effects during build, unavailable required
scheduler/storage capability, or the same concrete failure surviving two
focused repair attempts.
