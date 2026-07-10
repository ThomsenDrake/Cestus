# Investigative Context Packs Design

Date: 2026-07-10

## Purpose

This design covers the investigative context-pack builder lane for the resident
Cestus Agent. It defines production builders and package-owned registration for:

- `evidence-summary.v1`
- `accepted-graph-projection.v1`
- `governance-locks.v1`

These packs are required by the approved resident-agent execution and MVP
specialist workflow designs. They give specialist runs safe, deterministic,
content-addressed context about evidence, accepted graph truth, and governance
posture without editing local-runtime, cockpit, orchestrator, operational packs,
PRR packs, prompts, or handoff projections in this lane.

The core product truth is unchanged: the append-only ledger is canonical,
projections are rebuildable, accepted graph state comes only from reviewed
ontology events, governance posture can block or warn but cannot grant approval,
and evidence summaries cannot expose raw document text or provider payloads.

## Goals

- Add an AI-legible package-owned design for investigative context-pack builders.
- Keep registration narrow through an exported helper such as
  `registerInvestigativeContextPacks(registry, deps)`.
- Prove pack registration and specialist readiness through injected
  dependencies, not local-runtime or cockpit wiring.
- Bind exact evidence events, content hashes, source refs, pack versions,
  projection high-water marks, source staleness inputs, and omission metadata.
- Keep accepted graph context read-only and traceable to reviewed assertion
  events and evidence hashes.
- Distinguish resident-agent locks from governance-derived restrictions with
  exact source labels, event provenance, and projection provenance.
- Reuse ingestion's exact current-byte and archive-child hash posture for
  evidence staleness instead of weaker latest-scan signals.
- Make identical injected authoritative inputs produce identical canonical
  payloads and content hashes.
- Define deterministic scope, ordering, budgets, omissions, restart/replay
  behavior, stable failure codes, and stable omission reason codes.

## Non-Goals

- Wiring local-runtime, orchestrator, scheduler, cockpit, or browser UI code.
- Editing operational packs, PRR packs, specialist prompts, handoff projection,
  or existing workflow runners.
- Adding new accepted graph events, changing assertion review semantics, or
  inferring accepted relationships.
- Granting approvals, clearing locks, releasing quarantine, changing governance
  classifications, sending PRRs, exporting material, or transferring provider
  bytes.
- Reading unrestricted raw evidence bodies, parse-output text, provider
  payloads, raw provider errors, secrets, hidden local paths, or credentials into
  prompt-facing context.
- Introducing SQLite, filesystem, portable-workspace, or local-runtime
  dependencies into `packages/agent`.

## Existing Contracts

The design composes existing contracts:

- `packages/agent/src/context-packs.ts` owns `ContextPackDescriptor`,
  `ContextPackRef`, `buildContextPackRef`, stable JSON hashing, strict DTO
  normalization, budget checks, and registry behavior.
- `packages/agent/src/specialist-readiness.ts` checks required context pack
  refs, projection high-water marks, active locks, provider posture, prompt
  template registration, and adapter families.
- `packages/agent/src/specialist-workflows.ts` declares the MVP specialist
  context requirements for PRR negotiation, evidence triage, timeline building,
  contradiction finding, investigation planning, and report building.
- `packages/ontology/src/graph-projection.ts` builds accepted assertions and
  resolved entities from reviewed assertion events.
- `packages/ontology/src/governance-projection.ts` derives evidence governance
  state, quarantine/tombstone posture, export planning, network exposure,
  session state, and incidents from governance events.
- `packages/agent/src/projection.ts` derives resident-agent locks from
  `agent.lock.activated` and `agent.lock.cleared`.
- `packages/ingestion/src/projection.ts` derives evidence source links, source
  occurrences, scan/import state, parse jobs, provider approvals, diagnostics,
  and duplicate groups from ingestion events.
- Ingestion runtime stale-source checks already require exact current source
  bytes, container hashes, archive adapter identity, archive child internal
  paths, and archive-child content hashes before blob writes.
- Portable blob identity is content-addressed by `sha256:<digest>`; blob reads
  and writes verify the hash rather than trusting paths.

## Approved Direction

Create a separate investigative context-pack module in `packages/agent`, for
example:

```ts
packages/agent/src/investigative-context-packs.ts
packages/agent/test/investigative-context-packs.test.ts
```

The module exports:

```ts
registerInvestigativeContextPacks(registry, deps)
buildAcceptedGraphProjectionContextPack(input)
buildEvidenceSummaryContextPack(input)
buildGovernanceLocksContextPack(input)
```

The implementation plan should keep these public names unless a compile-time
conflict with existing exports requires a narrow rename. The ownership boundary
is fixed: `packages/agent` owns the builder contracts and registration helper,
while runtime construction will call that helper in a later narrow integration
task.

The module does not import local-runtime, UI, SQLite event stores, filesystem
mount code, browser adapters, orchestrators, or runtime server factories. All
source truth enters through injected dependencies.

## Dependency Boundary

The registration helper and builders receive authoritative inputs through a
single dependency object. The object may include already-built projections,
projection-builder functions, and source posture capabilities. It must not hide
stateful caches that affect payload content.

Logical dependency shape:

```ts
interface InvestigativeContextPackDependencies {
  readonly now: () => string;
  readonly scope: InvestigativeContextPackScope;
  readonly policyVersion: string;
  readonly ontologyCoreVersion: string;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly events: readonly KnowledgeEvent[];
  readonly graphProjection: GraphProjection;
  readonly ingestionProjection: IngestionProjection;
  readonly governanceProjection: GovernanceProjection;
  readonly agentProjection: AgentProjection;
  readonly evidenceSourcePosture: EvidenceSourcePostureCapability;
  readonly highWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
  readonly acceptedRelationshipProjection?: AcceptedRelationshipProjection;
}
```

`now` is the only time source. No builder may call `Date.now()`, `new Date()`, a
global clock, or a hidden timestamp provider. Ref-level `generatedAt` comes from
the injected `now`. Canonical payloads should not include wall-clock values
unless those values are source event timestamps or explicit injected source
data. Canonical payload hashes are stable for identical injected authoritative
inputs.

The current-byte/hash posture remains behind an injected capability:

```ts
interface EvidenceSourcePostureCapability {
  readonly postureVersion: "ingestion-current-source-posture.v1";
  checkEvidence(input: EvidenceSourcePostureCheckInput):
    Promise<EvidenceSourcePostureResult> | EvidenceSourcePostureResult;
}
```

This keeps `packages/agent` portable and independent from SQLite,
local-runtime, filesystem adapters, and mounted workspace storage. The
capability must report exact regular-file byte hashes and archive-child posture,
not only latest scan IDs.

## Registration Contract

`registerInvestigativeContextPacks(registry, deps)` registers exactly the three
investigative pack builders:

- `accepted-graph-projection.v1`
- `evidence-summary.v1`
- `governance-locks.v1`

Registration is idempotent for the same registry and the same helper-owned
dependency identity. Calling the helper twice with the same registry/deps is a
no-op after the first successful registration.

Registration rejects conflicts:

- A target context pack ID is already registered outside the helper.
- A target context pack ID is registered with a different version, descriptor,
  budget, required provenance kinds, redaction policy, source projection, or
  builder identity.
- The helper is called again against the same registry with different deps that
  would create different builder behavior for the same IDs.

The helper may maintain registration bookkeeping for idempotency, but it must
not cache payloads, source posture, projections, high-water marks, or pack refs.
Every `build()` call rebuilds from the injected authoritative inputs.

## Common Pack Envelope

Each builder returns a `ContextPackRef` created through `buildContextPackRef`.
The canonical payload passed to `buildContextPackRef` is a strict JSON DTO with:

- `schemaVersion`
- `scope`
- `truthBoundary`
- `projectionHighWaterMarks`
- `packVersions`
- `items`
- `omissions`
- `stalenessInputs`
- pack-specific summaries

The payload must be normalized through the same DTO safety rules as other agent
context packs. Accessors, symbols, sparse arrays, custom array properties,
unexpected prototypes, secret-shaped keys, secret-shaped values, executable
commands, raw provider errors, raw paths, and raw content are rejected before
hashing.

`generatedAt` is ref metadata supplied to `buildContextPackRef`. It is not a
hidden clock and should not be added to payload unless a future design explicitly
needs it as source data. Domain event timestamps already present in source
events are source data and may appear when safe and useful.

## Scope Semantics

The builder input includes one explicit scope:

- `workspace`: all eligible evidence and accepted graph state in the workspace.
- `investigation`: refs selected for an investigation.
- `task`: refs selected for a resident-agent task or run.
- `selection`: explicit evidence IDs, assertion IDs, entity IDs, relationship
  IDs, PRR IDs, or source collection IDs.

Scope is part of the payload and the `ContextPackRef.scope` field. A builder
must never widen scope implicitly. If a required source is outside scope, the
builder records an omission with reason code `scope-excluded` unless the
excluded source is mandatory for provenance; mandatory provenance missing from
scope fails with `missing-provenance`.

## Deterministic Ordering

All arrays are sorted before hashing:

- assertions by `assertionId`
- entities by `entityId`
- relationships by `relationshipId`
- evidence by `evidenceId`, then `contentHash`
- occurrence refs by `sourceCollectionId`, `scanBatchId`, `occurrenceId`
- parse jobs by `parseJobId`
- governance tags by `tag`
- restrictions by `sourceLabel`, `restrictionKind`, `restrictionId`
- resident-agent locks by `lockId`
- event IDs lexicographically
- content hashes lexicographically
- omissions by `reasonCode`, then `refKind`, then `refId`
- staleness inputs by `kind`, then `ref`, then `value`

Formatting, object key insertion order, and caller array order must not affect
the canonical payload hash. Semantic changes must affect the hash.

## Mandatory Fields

These fields are mandatory and cannot be truncated away:

- active resident-agent locks
- governance-derived restrictions
- exact provenance refs
- scope
- projection high-water marks
- pack versions
- source-byte and archive-child staleness inputs
- evidence IDs and content hashes for included evidence
- assertion proposal and acceptance event IDs for accepted graph entries
- omission metadata
- truth-boundary fields

If the mandatory envelope exceeds the pack's budget, the builder fails with
`context-budget-exceeded` rather than returning an incomplete context pack.

## Size Budgets And Omissions

Each pack has a descriptor `maxBytes` and may receive a stricter build
`sizeBudgetBytes`. The implementation plan should choose concrete defaults, but
the design requires per-pack budgets and deterministic truncation.

Budgeting proceeds in this order:

1. Build and validate the mandatory envelope.
2. Add high-priority scoped rows required for provenance.
3. Add optional detail rows in stable order.
4. Record omitted optional rows in the `omissions` array.
5. Recompute the payload and fail if mandatory envelope plus omissions cannot
   fit the budget.

Omissions are machine-readable DTOs:

```ts
interface InvestigativeContextOmission {
  readonly reasonCode: InvestigativeOmissionReasonCode;
  readonly refKind: string;
  readonly refId: string;
  readonly count: number;
  readonly contentHash?: `sha256:${string}`;
  readonly sourceEventIds: readonly string[];
}
```

Stable omission reason codes:

- `scope-excluded`
- `budget-row-omitted`
- `unsafe-source-ref-suppressed`
- `raw-content-suppressed`
- `provider-payload-suppressed`
- `parse-output-text-suppressed`
- `relationship-projection-unavailable`
- `non-authoritative-relationship-suppressed`
- `non-active-governance-state-suppressed`
- `duplicate-detail-collapsed`

Omission reason codes are contract values, not UI prose. UI copy belongs to a
later surface lane.

## Failure Codes

Builders fail closed with stable machine-readable codes. The implementation may
wrap them in typed errors, result DTOs, or rejected promises, but tests must
prove the code is stable.

Common failure codes:

- `missing-provenance`
- `projection-lag`
- `stale-source`
- `source-byte-hash-mismatch`
- `archive-container-hash-mismatch`
- `archive-child-hash-mismatch`
- `source-posture-unavailable`
- `context-budget-exceeded`
- `secret-detected`
- `raw-content-forbidden`
- `provider-payload-forbidden`
- `accepted-truth-mutation-forbidden`
- `accepted-relationship-not-authoritative`
- `duplicate-context-pack-registration`
- `conflicting-context-pack-registration`
- `invalid-context-pack-scope`

The builders must not replace these codes with prose-only messages. Error
messages can exist, but automation should be able to match the code.

## `accepted-graph-projection.v1`

### Purpose

Expose reviewed accepted graph truth for specialist reasoning without allowing a
builder, model, workflow, or prompt artifact to mutate accepted state.

### Payload

The pack includes:

- accepted assertions from `GraphProjection.assertions`
- resolved entities from `GraphProjection.entities`
- accepted relationships only when supplied by an authoritative reviewed
  relationship projection
- assertion provenance: `assertionId`, `evidenceId`, `proposedByEventId`,
  `acceptedByEventId`
- evidence content hash for every accepted assertion
- ontology core and pack versions
- projection high-water marks
- omission records
- staleness inputs for projection high-water marks and evidence content hashes
- truth boundary:

```ts
{
  "authoritativeForAcceptedGraph": true,
  "readOnlyProjectionTruth": true,
  "canInferNewAcceptedEdges": false,
  "graphMutationRequiresReviewedOntologyEvent": true
}
```

### Accepted Relationships

"Accepted relationships when derivable" means only relationships already present
in an authoritative reviewed/accepted projection with explicit acceptance and
evidence provenance.

The builder must never infer a new accepted edge from accepted assertions,
entity membership, shared evidence, labels, names, model output, memory,
timeline items, or governance tags.

If no authoritative relationship projection is injected, the pack records
`relationship-projection-unavailable` and includes no relationships. If a
relationship entry is present but lacks accepted event provenance or evidence
hash provenance, the builder fails with `accepted-relationship-not-authoritative`
or `missing-provenance`.

### Provenance Requirements

Every included assertion must have:

- assertion ID
- proposed event ID
- accepted event ID
- evidence ID
- evidence content hash
- source event IDs for proposal and acceptance
- pack versions in force from the underlying events where available

If an accepted assertion lacks any required event or evidence hash binding, the
builder fails with `missing-provenance`. It must not silently downgrade the row
or include a bare fact.

## `evidence-summary.v1`

### Purpose

Expose evidence metadata, provenance, parse posture, governance tags, duplicate
groups, and safe summaries without unrestricted raw document text or provider
payloads.

### Payload

The pack includes:

- evidence ID
- evidence ingestion event ID
- content hash
- media type and size when available from `evidence.ingested`
- ingestion evidence link event IDs
- source collection ID
- scan batch ID
- import batch ID
- occurrence IDs
- duplicate content group summary
- parse job IDs, lane, parser name/version, state, output hash, output media
  type, completion/failure event ID, retryability
- provider approval event IDs when relevant, without provider payloads or
  credentials
- governance tag decisions from governance projection, including source
  `ai` or `human`, active or removed status, confidence, safe rationale, and
  event ID
- quarantine and tombstone posture
- source staleness inputs from the injected posture capability
- omission records

The pack may include safe summary fields only when they are already available as
secret-safe, raw-content-free summary material. The builder must not open raw
evidence blobs or parse-output blobs to synthesize text summaries in this lane.

### Forbidden Content

The pack rejects or omits:

- raw document bodies
- unrestricted excerpts
- raw parse output text
- provider request payloads
- provider response payloads
- raw provider errors
- credential refs beyond safe credential-free IDs already allowed by upstream
  DTOs
- absolute source paths or hidden local storage paths
- executable command text
- secret-shaped keys or values

Raw and provider material use omission codes such as
`raw-content-suppressed`, `parse-output-text-suppressed`, and
`provider-payload-suppressed`. If the caller attempts to force such material
into a mandatory field, the builder fails with `raw-content-forbidden`,
`provider-payload-forbidden`, or `secret-detected`.

### Evidence Staleness

Evidence staleness must reuse the exact current-byte/archive-child hash posture.
A latest-scan signal is not sufficient.

For regular files, staleness inputs bind:

- source collection ID
- scan batch ID
- occurrence ID
- source path ref or safe occurrence ref
- approved content hash
- current content hash
- size when available
- adapter name/version

For archive children, staleness inputs also bind:

- container path ref or safe container ref
- approved container hash
- current container hash
- archive adapter name/version
- internal path ref
- approved child content hash
- current child content hash
- child size when available

If current posture is unavailable for in-scope evidence, the builder fails with
`source-posture-unavailable`. If current posture differs from approved posture,
the builder fails with `stale-source`, `source-byte-hash-mismatch`,
`archive-container-hash-mismatch`, or `archive-child-hash-mismatch`.

## `governance-locks.v1`

### Purpose

Expose active resident-agent locks and governance-derived restrictions as safety
posture. This pack can block or warn. It cannot grant approval, clear a lock,
release quarantine, change evidence tags, alter graph state, send messages,
export reports, or transfer bytes.

### Payload

The pack includes:

- policy version
- governance pack versions
- resident-agent active locks
- governance-derived restrictions
- export default posture
- quarantine and tombstone summaries
- open governance incidents
- network exposure and session posture when active
- projection high-water marks
- staleness inputs
- omission records
- truth boundary:

```ts
{
  "authoritativeForApproval": false,
  "grantsApproval": false,
  "clearsApprovalOrLocks": false,
  "mutatesEvidenceOrGraph": false,
  "postureKind": "non-authoritative-safety-posture"
}
```

### Resident-Agent Locks

Resident-agent locks come from `AgentProjection.locks` where `state` is
`active`. Each lock entry includes:

- `sourceLabel: "resident-agent-lock"`
- lock ID
- lock kind
- safe reason
- activated by
- activated at
- related event IDs
- event IDs from projection provenance

Cleared locks may be summarized only as non-active history when budget allows.
Active locks are mandatory and cannot be omitted.

### Governance-Derived Restrictions

Governance-derived restrictions come from `GovernanceProjection` and related
events. They are not agent locks and must not be labeled as lock-clearable by
the resident agent.

Restriction sources include:

- quarantined evidence
- tombstoned evidence
- active restricted export tags
- missing public-safe status for export/report context
- open incidents
- active network exposure posture
- session approval mismatch for active exposure
- policy defaults that require sensitive opt-in

Each restriction entry includes:

- `sourceLabel: "governance-derived-restriction"`
- restriction ID
- restriction kind
- affected evidence ID, incident ID, exposure ID, or session ID
- source event IDs
- projection provenance refs
- policy version
- safe reason code

The pack must preserve the distinction between an active resident-agent lock and
a governance-derived restriction. A governance restriction can block readiness or
make an approval stale, but it never proves approval and never clears itself.

## Context Pack Refs

Every produced `ContextPackRef` must include:

- `contextPackId`
- version `1`
- content hash from canonical payload
- size bytes
- generatedAt from injected `now`
- safe summary
- provenance refs
- projection high-water mark
- source event IDs
- artifact hashes when evidence, parse, or report content hashes are included
- policy version
- scope
- size budget bytes
- staleness inputs

`provenanceRefs` must include at least one required ref kind for each descriptor
requirement. The implementation plan should set descriptor
`requiredProvenanceKinds` to require event IDs and content hashes for the
accepted graph and evidence packs, and event IDs for governance locks. When a
pack includes content hashes, those hashes must also appear in `artifactHashes`
where the existing `ContextPackRef` contract allows them.

The existing `ContextPackRef` has one `projectionHighWaterMark` field. For
these packs, that field records the pack's primary freshness marker, while the
payload and `stalenessInputs` carry named high-water marks for every source
projection consumed by the pack. `projectSpecialistWorkflowReadiness` continues
to compare the ref-level mark against the current pack-level freshness value;
source-specific stale checks use the named payload and staleness inputs.

## Replay And Restart Behavior

The builders are pure over injected authoritative inputs. After restart, a
runtime can rebuild the same pack by re-reading the ledger, rebuilding
projections, resolving the current source posture capability, and calling the
same builder.

No payload truth is stored in hidden package state. Registration bookkeeping is
allowed only to make duplicate helper calls idempotent and conflict-aware.

Projection caches, job state files, local runtime state, and browser DTOs are
not sources of truth for these builders.

## Readiness Integration

This lane proves registration and readiness through tests with injected
dependencies:

- Create a fresh `ContextPackRegistry`.
- Call `registerInvestigativeContextPacks(registry, deps)`.
- Build the three investigative pack refs.
- Pass those refs to `projectSpecialistWorkflowReadiness`.
- Verify specialist readiness no longer reports missing investigative context
  packs when other prerequisites are supplied.

The design intentionally leaves local-runtime and orchestrator wiring to a
later integration task. That later task should have one narrow responsibility:
construct the dependency object from the mounted workspace/runtime and call the
package-owned registration helper.

## Testing Expectations

The implementation plan should require failing tests first for:

- descriptor metadata for exactly the three investigative packs
- idempotent helper registration
- conflict rejection for duplicate IDs, versions, descriptors, budgets, and
  builder/dependency identity
- stable canonical payload hashes for identical injected inputs
- no hidden clock usage
- deterministic ordering independent of caller order
- accepted assertions requiring proposal event, acceptance event, evidence ID,
  and evidence content hash
- accepted relationships included only from an authoritative reviewed projection
- no inferred accepted relationships
- evidence summary rejecting raw document text, parse text, provider payloads,
  provider errors, credentials, hidden paths, and executable command text
- exact regular-file byte hash staleness rejection
- exact archive container and child hash staleness rejection
- governance pack separation of resident-agent locks and governance-derived
  restrictions
- governance restrictions never granting approval, clearing locks, or mutating
  evidence or graph state
- active locks, exact provenance, scope, high-water marks, staleness inputs, and
  omission metadata never being truncated away
- deterministic budget omissions with stable omission reason codes
- mandatory envelope budget failure with `context-budget-exceeded`
- specialist readiness with injected pack refs and no runtime/cockpit edits

Suggested documentation validation for the design slice:

```bash
git diff --check
npm run factory:check
```

Implementation validation should add targeted package tests and full
`npm run verify` before commit.

## Review Checks

Reviewers should fail future implementation changes that:

- infer accepted graph edges from assertions, labels, entities, memory, model
  output, or governance tags
- include accepted graph rows without reviewed event and evidence hash
  provenance
- summarize evidence by reading unrestricted raw evidence or provider payloads
  in this lane
- replace exact current-byte/archive-child staleness checks with latest-scan
  checks
- truncate active locks, mandatory provenance, scope, high-water marks,
  staleness inputs, or omission metadata
- let governance restrictions grant approval, clear locks, release quarantine,
  or mutate graph/evidence state
- import local-runtime, UI, SQLite, filesystem mount, or orchestrator modules
  into the agent package builders
- use hidden clocks or payload caches that change content hashes outside
  injected inputs
- emit prose-only failure or omission reasons where machine-readable codes are
  required

## First Implementation Slice

The safe first implementation slice should be pure package work:

- add `packages/agent/src/investigative-context-packs.ts`
- add focused tests in `packages/agent/test/investigative-context-packs.test.ts`
- export the module from `packages/agent/src/index.ts`
- do not edit local-runtime, cockpit, orchestrator, operational packs, PRR
  packs, specialist prompts, or handoff projection files

The package should prove the three production builders and registration helper
with injected projections, events, and source posture capabilities. Runtime
wiring remains a later narrow integration task.
