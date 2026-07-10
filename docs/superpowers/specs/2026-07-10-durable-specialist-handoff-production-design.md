# Durable Specialist Handoff Production Design

Date: 2026-07-10

## Purpose

This design defines durable, restart-rebuildable specialist handoffs for the
resident Cestus Agent. It closes the current MVP gap where specialist runners
can return `agent-specialist-handoff.v1` DTOs to callers, while the Agent
cockpit has no production source that can rebuild those handoffs after process
restart from the append-only ledger and content-addressed artifacts.

The approved model is a compact ledger event contract plus a content-addressed
handoff manifest artifact. The ledger binds exact run, task, type, state,
artifact, tool, context, source, and summary facts. The manifest carries the
browser-safe canonical handoff DTO and the provenance material needed to verify
it. Neither the ledger nor the manifest may contain raw prompt text, raw
evidence bodies, provider output text, credentials, hidden local paths,
executable command lines, or domain-service inputs.

## Current Constraints

The current resident-agent run lifecycle has these event families:

- `agent.specialist-run.started`
- `agent.specialist-run.step.recorded`
- `agent.specialist-run.completed`
- `agent.specialist-run.failed`
- `agent.task.status.changed`

The current run projection exposes only `running`, `completed`, and `failed`.
Current projection replay accepts later completed or failed run events by
overwriting the projected state. There is no durable handoff-pending state and
no event that binds a handoff manifest hash before run terminal state.

This means a runner must not append `agent.specialist-run.completed` before a
verified handoff binding exists. A completed-then-failed repair path would be
ambiguous after restart and may violate terminal-state semantics. The new
contract therefore moves task success behind verified handoff readback.

## Goals

- Make every successful, blocked, waiting-for-approval, or failed specialist
  result reconstructible after restart from ledger events and content-addressed
  artifacts.
- Prevent cockpit handoffs from being synthesized from completed-run hashes,
  returned DTOs, caller memory, or unindexed blob-store scans.
- Preserve append-only ledger semantics. Corrections and supersessions are new
  events.
- Keep the browser boundary capability-injected. React parses production-shaped
  runtime DTOs and imports no server registries, adapters, artifact stores, or
  runner kernels.
- Keep local-runtime and UI integration sequenced after core event, artifact,
  projector, and lifecycle changes.

## Non-Goals

- Executing provider byte transfer, PRR send/follow-up, export/publication,
  legal escalation, destructive repair, accepted graph review, or legacy staging.
- Storing full handoff DTOs in ledger events.
- Treating handoff records as accepted ontology truth.
- Replacing domain package projections or domain service authority.
- Generalizing browser run-start controls.

## Contract Overview

Durable handoff production uses this sequence:

1. `agent.specialist-run.step.recorded` with final-output semantics.
2. `agent.specialist-handoff.prepared`.
3. `agent.specialist-handoff.recorded`.
4. Projection readback of the recorded handoff.
5. `agent.specialist-run.completed` or `agent.specialist-run.failed`.
6. `agent.task.status.changed` to a terminal task status when a task is linked.

The run is not terminally successful until the handoff projector verifies the
recorded handoff. Task success is not projected until the run terminal event and
verified handoff binding exist. A historical terminal run event that appears
before a valid recorded handoff is inconsistent state, not success.

## Final-Output Step

`agent.specialist-run.step.recorded` counts as `output-persisted` only when it
uses the exact final-output shape. Arbitrary audit, model, or local derivative
steps do not satisfy handoff readiness.

The implementation must extend the step payload narrowly and compatibly:

```ts
{
  stepKind?: "audit" | "model-review" | "tool-request" | "local-derivative" | "final-output";
  stepSchemaId?: string;
  idempotencyKey?: string;
}
```

Existing step events without these fields remain valid audit history. They do
not count as final output. A valid final-output step must have:

- `stepKind: "final-output"`.
- `stepSchemaId` equal to the specialist descriptor's final-output schema, such
  as `evidence-triage-final-output.v1`.
- deterministic `stepId` as `step_${runId}_final_output` unless the approved
  run descriptor names a stricter deterministic final step ID.
- `outputArtifactHashes` containing the complete durable output artifact hash
  set for the specialist result, in canonical order.
- `inputArtifactHashes` naming the prompt/model/context artifacts that produced
  the final result when they exist.
- an idempotency key derived from run ID, run type, task ID if present, status,
  and the canonical output hash list.

The final-output step is the only durable preterminal signal that output blobs
have been persisted and can drive deterministic recovery. If a process crashes
before this event, retry must rebuild and verify the output artifacts without
claiming any prior durable specialist result.

## Handoff Manifest Artifact

The handoff manifest artifact schema is
`agent-specialist-handoff-manifest.v1`. It is stored in the mounted workspace's
content-addressed artifact store.

The manifest contains:

- `schemaVersion: "agent-specialist-handoff-manifest.v1"`.
- `handoffId`.
- `handoffRevision`.
- `handoffDtoHash`.
- `runId`, `taskId` when present, `runType`, and `residentAgentId`.
- `status`: `ready-for-review`, `waiting-for-approval`, `blocked`, or `failed`.
- `safeSummary`.
- `stateKind`: `completed`, `failed`, or `resumable`.
- `finalOutputStepId` and final-output step event ID.
- `contextPackRefs`.
- `promptArtifactHash` when present.
- `outputArtifacts`.
- `toolRequestIds`.
- `approvalRequirements`.
- `nextSafeActions`.
- `failure` when `status` is `failed`.
- `sourceEventIds` and `relatedEventIds`.
- `supersedesHandoffId` and `supersedesEventId` when superseding.
- the canonical handoff DTO as `handoff`.

The manifest must be built only from ledger-bound references and verified
content-addressed artifacts. It must not be built from caller memory or a
returned DTO. The runner may return the DTO after readback, but that return
value is not durable evidence.

## Canonical Serialization And Hashing

Canonical manifest bytes use deterministic JSON:

- plain own-data objects only
- no accessors, prototypes, symbols, sparse arrays, boxed values, functions, or
  non-finite numbers
- sorted object keys
- declared array order for semantically ordered arrays
- UTF-8 encoding
- SHA-256 content hash formatted as `sha256:<64 lowercase hex chars>`

The manifest content hash is computed from those bytes. The handoff DTO inside
the manifest must independently parse through `specialistWorkflowHandoffSchema`.
`handoffDtoHash` is required and must be computed from the canonical handoff DTO
using the same JSON rules.

`safeSummary` must match exactly across:

- the canonical handoff DTO
- the handoff manifest
- `agent.specialist-handoff.prepared`
- `agent.specialist-handoff.recorded`

The same exact-match rule applies to status, `runId`, `taskId`, `runType`,
`residentAgentId`, prompt artifact hash, context pack hashes, output artifact
hashes, tool request IDs, source event IDs, and related event IDs.

## Handoff Events

### `agent.specialist-handoff.prepared`

This event records that the manifest artifact exists and binds a deterministic
handoff identity before run terminal state.

Payload fields:

- `handoffId`
- `handoffRevision`
- `idempotencyKey`
- `handoffManifestHash`
- `handoffDtoHash`
- `runId`
- `taskId` when present
- `runType`
- `residentAgentId`
- `status`
- `safeSummary`
- `finalOutputStepId`
- `finalOutputEventId`
- `contextPackHashes`
- `promptArtifactHash` when present
- `outputArtifactHashes`
- `toolRequestIds`
- `sourceEventIds`
- `relatedEventIds`
- `supersedesHandoffId` when superseding
- `supersedesEventId` when superseding

Causation points to the final-output step event for first handoffs. For
supersessions, causation points to the prior recorded handoff event, and the
payload still names the final-output step that anchors the run result.

### `agent.specialist-handoff.recorded`

This event records that the prepared manifest has been loaded, parsed, hashed,
and verified against ledger state.

Payload fields repeat the prepared compact binding and add:

- `preparedEventId`
- `verifiedAt`

Causation points to the prepared event. It may be appended only after the
projector verifies the manifest, DTO, final-output step, run identity, status,
summary, artifact hashes, tool request IDs, and event refs.

## Deterministic IDs And Idempotency

`handoffId` is deterministic for a run result:

```text
handoff_${runId}_${first16(sha256(canonical run/task/type/status/output-hashes/manifest-hash))}
```

Supersessions use a new manifest hash and therefore a new handoff ID. The
manifest records the superseded handoff ID.

`idempotencyKey` is:

```text
specialist-handoff:${runId}:${taskId-or-none}:${runType}:${status}:${handoffManifestHash}
```

All append helpers must use `streamId = agent_run_${runId}` for run-side
handoff lifecycle events and `expectedNextSequence = currentRunStreamLength + 1`.
Task terminal events use the task stream and `expectedNextSequence =
currentTaskStreamLength + 1`.

## Append Order And Recovery

### Happy Path

1. Persist and read back all output artifacts.
2. Append final-output step with the complete output hash set.
3. Build manifest from ledger-bound refs and verified artifacts.
4. Persist and read back manifest by hash.
5. Append `agent.specialist-handoff.prepared`.
6. Project/read back prepared handoff and verify manifest consistency.
7. Append `agent.specialist-handoff.recorded`.
8. Project/read back recorded handoff and compare exact DTO/hash/summary.
9. Append run terminal event:
   - `completed` for ready, blocked, or waiting-for-approval handoff statuses
     that represent successful local specialist work.
   - `failed` for a specialist result whose canonical handoff status is
     `failed`.
10. Append terminal task status when a task is linked.

### Restart Recovery

Recovery reads the run stream and agent projection, never caller memory.

- No final-output step: rerun or resume the specialist up to artifact
  persistence.
- Final-output step exists and no prepared event: rebuild the deterministic
  manifest from ledger-bound refs and verified artifacts, then append prepared.
- Prepared exists and no recorded event: load manifest by
  `handoffManifestHash`, verify it, then append recorded.
- Recorded exists and no terminal run event: read back the handoff projector and
  append the correct terminal run event.
- Terminal run exists and no task terminal event: append the task terminal only
  if the terminal run is caused by or follows a verified recorded handoff.
- Terminal run exists before a verified recorded handoff: mark the run
  inconsistent in the handoff projection. Do not show success.

No recovery path scans an unindexed blob store. The manifest hash and output
hashes come from ledger events.

## Expected-Sequence Race Behavior

Every append uses expected stream sequence semantics. On a sequence conflict,
the writer rereads the relevant stream and follows these rules:

- Final-output step conflict: if the exact final-output step with the same
  idempotency key and complete output hash set exists, continue. If another
  final-output step exists with different hashes or schema, project conflict and
  stop.
- Prepared conflict: if an exact prepared event for the same handoff ID,
  manifest hash, and idempotency key exists, continue. If the same handoff ID
  has different compact refs, project conflict and stop.
- Recorded conflict: if an exact recorded event for the same prepared event
  exists, continue. If another recorded event conflicts with the prepared event
  or manifest hash, project conflict and stop.
- Terminal run conflict: if an exact terminal run event exists after the
  recorded handoff and its output hashes agree, continue. If terminal state
  appears before handoff or disagrees with handoff output/status, project
  inconsistent state and stop.
- Task terminal conflict: if the task is already terminal from the same run and
  verified handoff path, continue. If it is terminal from a different run or
  without verified handoff causation, project task conflict and stop.

Conflicts must be secret-safe and inspectable. They must not produce a terminal
success handoff.

## Projection States

The handoff projector returns structured states:

- `no-output`: no exact final-output step exists.
- `output-persisted`: exact final-output step exists, but no prepared handoff.
- `handoff-pending`: prepared event exists and names a manifest hash.
- `handoff-recorded`: recorded event exists and manifest verification passes.
- `task-completed`: terminal run and terminal task state follow verified
  recorded handoff.
- `inconsistent`: any hash, state, sequence, supersession, terminal-order, or
  manifest conflict.

Only `handoff-recorded` can emit a canonical
`SpecialistWorkflowHandoffDto`. `task-completed` is a stronger state used for
task lifecycle display. `output-persisted` and `handoff-pending` are resumable,
not successful.

## Failure Semantics

There are two failure classes.

### Pre-Output Or Infrastructure Failure

If the runner fails before any exact final-output step exists, it may append
`agent.specialist-run.failed` without a handoff. Examples include missing
identity, provider unavailable before usable model output, context construction
failure, secret detection before output artifacts, and inability to persist any
durable output.

This failure is terminal run state, but it is not a specialist handoff. The
cockpit may show the run failure through normal run audit fields.

### Specialist Result With Status `failed`

If the specialist has produced a result whose handoff status is `failed`, that
failed result must follow the normal handoff protocol. It needs final-output
state when it has durable artifacts, or a final-output schema that explicitly
allows an empty output set for the failure category. It must then write a
manifest, append prepared, append recorded, verify readback, and only then
append `agent.specialist-run.failed`.

Examples include invalid structured model output after a provider invocation,
foreign evidence references in model output, or a domain-gate result that is
safe to present as a failed handoff. The failure handoff must include a
secret-safe `failure` DTO and allowed next actions.

Manifest persistence failure after final-output state is resumable. The run must
not append terminal success. If a task is linked and the process can append a
safe task state, it may set the task to `blocked` with a repair action to retry
handoff manifest recording. After restart, recovery uses the final-output step
to resume.

## Supersession

Post-terminal supersession is legal only as an append-only handoff correction.
It does not rewrite run terminal state or task terminal state.

A valid supersession must:

- append a new prepared/recorded pair
- use a new handoff ID and manifest hash
- set `supersedesHandoffId`
- set causation to the prior recorded handoff event
- stay within the same `runId`, `taskId`, `runType`, `residentAgentId`, terminal
  run event, status, output artifact hashes, tool request IDs, source event IDs,
  and related event IDs
- change only presentation-safe manifest/DTO fields such as labels,
  `safeSummary`, next safe actions, or approval explanations

If a correction needs different output artifacts, tool requests, source events,
or status, it must be a new run rather than a post-terminal supersession.

Projection keeps prior handoffs in history and selects the latest valid
non-superseded handoff. The supersession graph must be cycle-free by event
order. A supersession that points to a nonexistent, later, cross-run, or already
cyclic handoff is inconsistent and does not replace the prior handoff.

## Runtime And Runner Responsibilities

Runner helpers should make the protocol hard to misuse:

- normalize and freeze all handoff-bound inputs before blob writes or awaits
- require exact final-output step schema before preparation
- write/readback artifacts before ledger references them
- append prepared and recorded with expected sequence
- read back through the handoff projector before terminal run/task events
- return handoff DTOs only after projection readback

Runners must not treat returned service values, caller DTOs, or completed-run
hash lists as durable handoff facts.

## Local Runtime And Browser Boundary

Core event, artifact, and projector work lands before shared integration.

After the lifecycle/runtime owner changes land, local runtime can call the
handoff projector and pass verified handoffs into the existing
`buildAgentCockpit({ specialistHandoffs })` path. `GET /api/agent/cockpit`
should expose production-shaped `agent-cockpit.v1` DTOs that include handoffs
only when projected from `handoff-recorded`.

The browser adapter parses the real route DTO. Browser modules remain
capability-injected and cannot import:

- local runtime modules
- server registries
- domain execution adapters
- artifact stores
- runner kernels
- filesystem, SQLite, or workspace validation code

React remains read-only for specialist handoffs. It may display handoff status,
summary, context refs, output artifact refs, tool request IDs, approval
requirements, failure DTOs, and next safe actions. It must not add generic
run-start controls, provider execution, PRR send controls, graph acceptance,
hidden canonical state, or local synthesis from run hashes.

## Implementation Sequencing

1. Core contract and projector slice:
   - ontology event contracts for final-output step fields and handoff events
   - manifest schema and canonical serialization helpers
   - handoff projector and diagnostics
   - focused tests over golden ledger plus manifest fixtures

2. Runner lifecycle slice:
   - shared runner-kernel helpers for final-output, prepared, recorded, readback,
     terminal run, and terminal task order
   - adoption by PRR negotiation, evidence triage, investigation planner, and
     ontology bootstrap in small follow-up tasks

3. Local-runtime integration slice:
   - cockpit route calls the handoff projector
   - production-shaped route tests cover verified handoffs and inconsistent
     states

4. Browser integration slice:
   - adapter parses production-shaped cockpit DTOs
   - run cockpit displays only selected-run exact matches
   - no server imports or executable controls

Local-runtime and browser work should merge after the lifecycle/runtime slices
that own the new contract and projector. This avoids overlapping edits with
parallel resident-agent runtime lanes.

## Testing Expectations

Core tests should prove:

- `agent.specialist-handoff.prepared` and
  `agent.specialist-handoff.recorded` reject unknown fields and unsafe text.
- arbitrary `agent.specialist-run.step.recorded` events do not count as
  final-output state.
- final-output steps require exact step kind, schema, idempotency key, and
  complete output hash set.
- manifest canonical serialization produces stable hashes and rejects hostile
  structures.
- projector rebuilds a handoff after restart from ledger events plus manifest
  artifact bytes.
- projector refuses completed-run hash synthesis.
- missing manifest, manifest hash mismatch, DTO mismatch, safeSummary mismatch,
  ref mismatch, terminal-before-handoff, and supersession cycles fail closed.
- expected-sequence race readback is idempotent for exact matches and
  inconsistent for conflicting matches.
- pre-output infrastructure failure can terminally fail without a handoff.
- specialist result status `failed` requires a verified failed handoff before
  terminal run failure.

Integration tests should prove:

- local runtime returns cockpit handoffs only from verified projection.
- browser adapters parse production-shaped route DTOs.
- React displays handoff data only for exact selected run/task/type.
- no browser module imports server-only registries, adapters, or artifact
  stores.

## Stop Conditions

Stop and escalate on:

- schema conflict with existing agent event contracts
- inability to extend final-output step semantics without breaking old replay
- any requirement to scan a blob store to recover a handoff
- terminal-state rewrite pressure
- synthetic provenance from completed-run hashes or caller DTOs
- partial-effect ambiguity that cannot be projected as resumable or
  inconsistent
- browser/server boundary leakage
- data-loss risk or unverified artifact hash binding

## Approved Direction

The approved direction is a crash-safe two-phase durable handoff lifecycle:
final-output step, prepared handoff event, recorded handoff event, verified
projection readback, then terminal run and task state. Core event/artifact and
projector work must land before local-runtime and browser integration. Handoffs
are durable only when rebuilt from ledger-bound refs and verified
content-addressed artifacts, not from returned DTOs or completed-run summaries.
