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
content-addressed resolved context about evidence, accepted graph truth, and
governance posture without editing local-runtime, cockpit, orchestrator,
operational packs, PRR packs, prompts, or handoff projections in this lane.

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
  projection high-water marks, source staleness inputs, and aggregate omission
  metadata.
- Produce provider-safe resolved context-pack envelopes where the ref carries
  audit identity and the payload carries the bounded rows available to prompt
  rendering after exact hash verification.
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
- The operational context lane owns the shared generic
  `ResolvedContextPack { ref, payload }`, callable `ContextPackPayloadResolver`,
  registry `buildResolved(id)`, and opaque `VerifiedResolvedContextPack`
  contract. This investigative lane must produce envelopes compatible with that
  contract rather than treating refs as the full provider context.
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
buildAcceptedGraphProjectionContextPack(input): ResolvedContextPack
buildEvidenceSummaryContextPack(input): ResolvedContextPack
buildGovernanceLocksContextPack(input): ResolvedContextPack
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
single dependency object. Production dependencies are scope-aware bounded
query/snapshot capabilities, not a required `events: readonly KnowledgeEvent[]`
or whole-workspace graph, ingestion, governance, or agent projections. Tests may
adapt in-memory projections behind these interfaces, but production builders
must not rely on scanning or materializing all rows in a workspace to build one
context pack.

Logical dependency shape:

```ts
interface InvestigativeContextPackDependencies {
  readonly now: () => string;
  readonly policyVersion: string;
  readonly ontologyCoreVersion: string;
  readonly packVersions: Readonly<Record<string, string>>;
  readonly registrationIdentity: InvestigativeRegistrationIdentity;
  readonly selection: InvestigativeSelectionCapability;
  readonly evidenceReader: InvestigativeEvidenceReader;
  readonly graphReader: AcceptedGraphProjectionReader;
  readonly governanceReader: GovernancePostureReader;
  readonly agentLockReader: ResidentAgentLockReader;
  readonly eventReader: KnowledgeEventReader;
  readonly evidenceSourcePosture: EvidenceSourcePostureCapability;
  readonly budgets?: Partial<Record<InvestigativeContextPackId, number>>;
}
```

`now` is the only time source. No builder may call `Date.now()`, `new Date()`, a
global clock, or a hidden timestamp provider. Ref-level `generatedAt` comes from
the injected `now`. Canonical payloads should not include wall-clock values
unless those values are source event timestamps or explicit injected source
data. Canonical payload hashes are stable for identical injected authoritative
inputs.

`registrationIdentity` is a stable deterministic helper identity, such as a
module ID plus descriptor-schema version and builder descriptor hash. It is not
the dependency object reference. Two calls with different object instances but
the same helper-owned descriptor identity and equivalent descriptor contracts are
idempotent; calls that would register the same ID/version with a different
descriptor identity, builder name, or descriptor hash are conflicts.

The selection capability is the only production path for choosing rows:

```ts
interface InvestigativeSelectionCapability {
  readonly capabilityVersion: "investigative-selection.v1";
  select(input: InvestigativeSelectionRequest):
    Promise<InvestigativeSelectionManifest> | InvestigativeSelectionManifest;
}

interface InvestigativeSelectionManifestBody {
  readonly manifestVersion: "investigative-selection-manifest.v1";
  readonly scope: InvestigativeContextPackScope;
  readonly sourceProjectionHighWaterMarks: InvestigativeProjectionHighWaterMarks;
  readonly ordering: InvestigativeSelectionOrdering;
  readonly window: InvestigativeSelectionWindow;
  readonly totalEligibleCount: number;
  readonly includedRefs: readonly InvestigativeSelectionIncludedRef[];
  readonly aggregateOmissions: readonly InvestigativeContextOmissionAggregate[];
}

interface InvestigativeSelectionManifest
  extends InvestigativeSelectionManifestBody {
  readonly manifestHash: `sha256:${string}`;
}
```

The manifest is authoritative for pack membership. It records the explicit
scope, source projection high-water marks, deterministic ordering, cursor or
window, total eligible count, included IDs and hashes, and bounded aggregate
omission counts. Workspace scope requires a deterministic page/window or an
explicit bounded manifest; a single pack is never an unbounded workspace dump.

`manifestHash` is the SHA-256 of the canonical
`InvestigativeSelectionManifestBody`. The canonical manifest body is the parsed
manifest with `manifestHash` omitted. The hash itself must never be part of the
bytes it hashes. Parsers and builders verify manifests by normalizing the body,
recomputing the body hash, and comparing it to `manifestHash`; any
self-including hash, placeholder hash, fixed-point attempt, or mismatched body
hash fails with `selection-manifest-hash-mismatch` or a more specific manifest
parse error when the implementation defines one.

Builders fetch exact source rows, events, and provenance by manifest-included
IDs or bounded batches:

- evidence rows by included evidence IDs and content hashes
- accepted graph rows by included assertion, entity, and relationship IDs
- governance restrictions by active restriction IDs or bounded active snapshots
- resident-agent locks by active lock IDs or bounded active snapshots
- ledger events by exact event IDs referenced by included rows

Reader capabilities must either read at the manifest's source projection
high-water marks or return row-level provenance that proves the data still
matches the manifest. If a reader returns a row outside the manifest, omits a
manifest-included mandatory row, changes a manifest hash, or serves data from an
incompatible high-water mark, the builder fails closed with a stable code.

The build's memory, output size, and query work are bounded by the selection
window, mandatory non-truncatable safety posture, and aggregate omission
buckets. Adding unrelated evidence, assertions, relationships, or governance
history outside the manifest must not make one pack build allocate, emit, or
query work proportional to workspace size.

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
investigative resolved pack builders:

- `accepted-graph-projection.v1`
- `evidence-summary.v1`
- `governance-locks.v1`

Registration exposes enough descriptor metadata for readiness to reason over
refs and enough parser metadata for `ContextPackRegistry.buildResolved(id)` to
return an opaque `VerifiedResolvedContextPack` after exact hash, size, and
pack-specific parser verification. If the shared registry distinguishes ref
builders from resolved builders at implementation time, this lane must use the
resolved builder path and project refs only for readiness, ledger, and audit
DTOs.

Registration is idempotent for the same registry and the same helper-owned
descriptor identity. Calling the helper twice with semantically equivalent
descriptor identities and builder descriptor hashes is a no-op after the first
successful registration, even when the dependency object instances differ.

Registration rejects conflicts:

- A target context pack ID is already registered outside the helper.
- A target context pack ID is registered with a different version, descriptor,
  budget, required provenance kinds, redaction policy, source projection, or
  stable builder descriptor identity.
- The helper is called again against the same registry with a different
  `registrationIdentity`, builder name, builder descriptor hash, or descriptor
  contract for the same IDs.

The helper may maintain registration bookkeeping for idempotency, but it must
not cache payloads, source posture, projections, high-water marks, or pack refs.
Every `build()` call rebuilds from the injected authoritative inputs.

## Common Pack Envelope

Each builder produces a provider-safe resolved envelope compatible with the
shared operational context contract:

```ts
interface ResolvedContextPack<Payload extends StrictJsonDto = StrictJsonDto> {
  readonly ref: ContextPackRef;
  readonly payload: Payload;
}
```

The operational context lane owns this generic contract. This spec names the
shape so investigative builders do not accidentally return refs alone. The
implementation should import or conform to the shared contract rather than
creating an incompatible local fork. `StrictJsonDto` here means the existing
normalized JSON DTO shape accepted by the context-pack hashing and safety
boundary: plain objects, arrays, strings, numbers, booleans, and null, with no
accessors, symbols, sparse arrays, unexpected prototypes, functions, or unsafe
keys/values.

The resolved `payload` is a strict JSON DTO with:

- `schemaVersion`
- `scope`
- `truthBoundary`
- `selectionManifest`
- `projectionHighWaterMarks`
- `packVersions`
- `items`
- `omissions`
- `stalenessInputs`
- pack-specific summaries

The resolved `ref` is created through `buildContextPackRef` from that exact
canonical payload. `ref.contentHash` is the SHA-256 of the canonical payload,
`ref.sizeBytes` is the canonical payload size, and `ref.provenanceRefs`,
`sourceEventIds`, `artifactHashes`, `projectionHighWaterMark`, `scope`,
`policyVersion`, `sizeBudgetBytes`, and `stalenessInputs` identify the payload
for readiness, audit, and replay.

The payload must be normalized through the same DTO safety rules as other agent
context packs. Accessors, symbols, sparse arrays, custom array properties,
unexpected prototypes, secret-shaped keys, secret-shaped values, raw provider
errors, raw paths, and raw content are rejected before hashing.

Prompt-facing fields use strict schemas instead of blanket text bans. Safe
narrative fields may discuss commands when the source evidence is journalistic
or investigative material about those commands, provided the field is
secret-safe, raw-content-free, authority-labeled, and within its summary budget.
Raw or executable action fields such as argv, shell snippets intended for
execution, runnable command payloads, tool-call payloads, and provider action
requests are not part of these schemas and are rejected if supplied.

`generatedAt` is ref metadata supplied to `buildContextPackRef`. It is not a
hidden clock and should not be added to payload unless a future design explicitly
needs it as source data. Domain event timestamps already present in source
events are source data and may appear when safe and useful.

`safeSummary` is safe metadata for cockpit, readiness, and audit DTOs. It is not
the pack payload and must not be treated as a replacement for `payload` during
production prompt rendering.

Only the ref, hash, and provenance fields enter ledger or audit DTOs. The
bounded rows live in the resolved payload and are made available to prompt
execution through the shared content-addressed resolver and registry assertion
path after exact hash and size verification.

## Provider Prompt Resolution

Production prompt execution must resolve each investigative context pack ref
through the shared content-addressed context-pack resolver before rendering
provider input. In the landed operational contract, `ContextPackPayloadResolver`
is a callable capability:

```ts
type ContextPackPayloadResolver = (
  ref: ContextPackRef
) =>
  | AgentContextPackJsonValue
  | ResolvedContextPack
  | Promise<AgentContextPackJsonValue | ResolvedContextPack>;
```

The registry owns exact hash, size, and registered pack-specific parser
verification: `ContextPackRegistry.buildResolved(id)` returns
`Promise<VerifiedResolvedContextPack>`. Execution readiness is checked with
`assertResolvedContextPacksForExecution(refs, resolvedPacks)`, using two
positional arguments. That assertion accepts only registry-verified/branded
packs; plain, tampered, or JSON-reloaded `ResolvedContextPack` values must fail
until reverified through the registry. This lane must not manufacture the
opaque brand or add a parallel verifier.

Prompt execution must fail closed if:

- a required payload cannot be resolved for a ref
- the canonical payload hash differs from `ref.contentHash`
- the canonical payload size differs from `ref.sizeBytes`
- the payload schema, pack version, projection high-water marks, scope, or
  selection manifest hash no longer matches the ref metadata
- the renderer would fall back to `safeSummary` as the only context body

`safeSummary` may appear in audit logs and prompt-artifact metadata, but it is
not sufficient context for production specialist reasoning. Facts that are too
detailed for `safeSummary` but allowed by the provider-safe payload schema must
remain available to the prompt-template lane after exact hash verification.

## Scope Semantics

The builder input includes one explicit scope:

- `workspace`: a deterministic bounded page/window over eligible workspace
  evidence and accepted graph state, or an explicit bounded workspace selection
  manifest.
- `investigation`: refs selected for an investigation.
- `task`: refs selected for a resident-agent task or run.
- `selection`: explicit evidence IDs, assertion IDs, entity IDs, relationship
  IDs, PRR IDs, or source collection IDs.

Scope is part of the payload and the `ContextPackRef.scope` field. A builder
must never widen scope implicitly. Scope membership comes from the authoritative
selection manifest, not from builder-side ledger scans. If a required source is
outside scope, the builder records an aggregate omission with reason code
`scope-excluded` unless the excluded source is mandatory for provenance;
mandatory provenance missing from scope fails with `missing-provenance`.

A workspace-scope request without a deterministic page/window or explicit
bounded selection manifest is invalid and fails with `selection-window-required`.
The builder must not convert that request into an all-workspace dump.

## Deterministic Ordering

All arrays are sorted before hashing:

- selection included refs by manifest sort key, then ref kind, then ref ID
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
- aggregate omissions by `reasonCode`, then `refKind`, then aggregate key
- omission sample refs by `refKind`, then `refId`, then `contentHash`
- staleness inputs by `kind`, then `ref`, then `value`

Formatting, object key insertion order, and caller array order must not affect
the canonical payload hash. Semantic changes must affect the hash.

Selection manifests carry their own deterministic ordering, cursor, and window
metadata. Builders preserve that ordering for included refs and must not
reselect or re-page rows. Stable cursors and bounded windows prevent omission
drift: unrelated rows added outside the manifest can change a later manifest's
`totalEligibleCount` or aggregate omission counts, but they do not change the
canonical payload for an already selected manifest.

## Mandatory Fields

These fields are mandatory and cannot be truncated away:

- active resident-agent locks
- governance-derived restrictions
- exact provenance refs
- scope
- projection high-water marks
- pack versions
- selection manifest identity, scope, ordering, window, and included refs
- source-byte and archive-child staleness inputs
- evidence IDs and content hashes for included evidence
- assertion proposal and acceptance event IDs for accepted graph entries
- aggregate omission metadata
- truth-boundary fields

If the mandatory envelope exceeds the pack's budget, the builder fails with
`context-budget-exceeded` rather than returning an incomplete context pack.

## Size Budgets And Omissions

Each pack has a descriptor `maxBytes` and may receive a stricter build
`sizeBudgetBytes`. The implementation plan should choose concrete defaults, but
the design requires per-pack budgets and deterministic truncation.

Budgeting proceeds in this order:

1. Build and validate the mandatory envelope.
2. Add manifest-included rows required for provenance.
3. Add optional detail rows in stable order.
4. Record omitted optional rows as aggregate omission buckets.
5. Recompute the payload and fail if mandatory envelope plus omissions cannot
   fit the budget.

Active resident-agent locks, active governance-derived restrictions, exact
included-row provenance, scope, high-water marks, source-byte/archive-child
staleness inputs, and aggregate omission metadata are mandatory. They cannot be
truncated away. If they do not fit, the builder fails with
`context-budget-exceeded`.

Omissions are machine-readable aggregate DTOs:

```ts
interface InvestigativeContextOmissionAggregate {
  readonly reasonCode: InvestigativeOmissionReasonCode;
  readonly refKind: string;
  readonly aggregateKey: string;
  readonly count: number;
  readonly sampleRefs?: readonly InvestigativeOmissionSampleRef[];
}

interface InvestigativeOmissionSampleRef {
  readonly refKind: string;
  readonly refId: string;
  readonly contentHash?: `sha256:${string}`;
}
```

Budget omissions aggregate by reason and ref kind, with deterministic aggregate
keys when a second dimension is needed, such as source collection, projection
name, or optional detail type. `sampleRefs` are optional and bounded by a
per-pack constant. Omission DTOs must not enumerate every excluded row.
Provenance for included rows remains exact; aggregate omissions explain what was
left out without pretending to carry exact row provenance for each omitted item.

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
- `selection-window-required`
- `selection-manifest-stale`
- `selection-manifest-hash-mismatch`
- `selection-row-mismatch`
- `selection-cursor-invalid`
- `context-payload-missing`
- `context-payload-hash-mismatch`
- `context-payload-size-mismatch`
- `duplicate-context-pack-registration`
- `conflicting-context-pack-registration`
- `invalid-context-pack-scope`

The builders must not replace these codes with prose-only messages. Error
messages can exist, but automation should be able to match the code.

## Stale Read Behavior

The selection manifest and all bounded readers must agree on source projection
high-water marks, included IDs, included hashes, and row-level provenance. A
builder must not silently refresh the manifest, widen the window, or compensate
for stale reader results by scanning other projections.

The builder fails with:

- `selection-manifest-stale` when a reader cannot serve the manifest's
  high-water marks or returns a newer incompatible snapshot.
- `selection-manifest-hash-mismatch` when the canonical manifest body hash does
  not match `manifestHash`, including any manifest whose hash was computed over
  a structure containing `manifestHash` itself.
- `selection-row-mismatch` when an included row's ID, content hash, projection
  row hash, or required provenance differs from the manifest.
- `selection-cursor-invalid` when the manifest cursor/window is malformed,
  expired by the selection capability, or cannot be replayed deterministically.
- `projection-lag` when a required projection is behind the manifest.

If the caller wants newer data, it must request a new selection manifest and
accept the resulting new canonical payload hash.

## `accepted-graph-projection.v1`

### Purpose

Expose reviewed accepted graph truth for specialist reasoning without allowing a
builder, model, workflow, or prompt artifact to mutate accepted state.

### Payload

The pack includes:

- accepted assertions selected by the authoritative manifest and returned by
  the accepted graph reader
- resolved entities selected by the authoritative manifest and returned by the
  accepted graph reader
- accepted relationships only when supplied by an authoritative reviewed
  relationship projection through the accepted graph reader
- the selection manifest identity, scope, ordering, window, total eligible
  count, included graph refs, and aggregate graph omission counts
- assertion provenance: `assertionId`, `evidenceId`, `proposedByEventId`,
  `acceptedByEventId`
- evidence content hash for every accepted assertion
- ontology core and pack versions
- projection high-water marks
- aggregate omission records
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

The accepted graph reader must return read-only projection truth for manifest
included IDs. The builder treats the reader as a source of reviewed projection
state, not as permission to create, resolve, infer, or mutate graph facts.

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

- evidence IDs selected by the authoritative manifest and returned by the
  evidence reader
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
- governance tag decisions from the governance posture reader, including source
  `ai` or `human`, active or removed status, confidence, safe rationale, and
  event ID
- quarantine and tombstone posture
- source staleness inputs from the injected posture capability
- the selection manifest identity, scope, ordering, window, total eligible
  count, included evidence refs and hashes, and aggregate evidence omission
  counts
- aggregate omission records

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
- secret-shaped keys or values
- raw executable action fields, argv arrays, runnable shell snippets intended
  for execution, tool-call payloads, or provider action requests

Raw and provider material use omission codes such as
`raw-content-suppressed`, `parse-output-text-suppressed`, and
`provider-payload-suppressed`. If the caller attempts to force such material
into a mandatory field, the builder fails with `raw-content-forbidden`,
`provider-payload-forbidden`, or `secret-detected`.

Journalistic evidence may legitimately discuss commands or scripts. Such
mentions can appear only in safe narrative fields with authority labels and
secret/raw-content checks; the builder still forbids raw or executable action
fields.

### Evidence Staleness

Evidence staleness must reuse the exact current-byte/archive-child hash posture.
A latest-scan signal is not sufficient.

For each included evidence row backed by a regular file, staleness inputs bind:

- source collection ID
- scan batch ID
- occurrence ID
- source path ref or safe occurrence ref
- approved content hash
- current content hash
- size when available
- adapter name/version

For each included evidence row backed by an archive child, staleness inputs
also bind:

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
- the selection manifest identity, scope, ordering, window, total eligible
  count, active safety refs, and aggregate non-active omission counts
- projection high-water marks
- staleness inputs
- aggregate omission records
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

Resident-agent locks come from the resident-agent lock reader where `state` is
`active`. Each active lock entry includes:

- `sourceLabel: "resident-agent-lock"`
- lock ID
- lock kind
- safe reason
- activated by
- activated at
- related event IDs
- event IDs from projection provenance

Cleared locks may be summarized only as non-active history when budget allows
and omitted through aggregate omission counts. Active locks are mandatory and
cannot be omitted or truncated.

### Governance-Derived Restrictions

Governance-derived restrictions come from the governance posture reader and
related events. They are not agent locks and must not be labeled as
lock-clearable by the resident agent.

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
Active governance-derived restrictions are mandatory safety posture and cannot
be omitted or truncated; optional non-active history may be aggregated.

## Context Pack Refs And Payloads

Every produced `ResolvedContextPack.ref` must include:

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
- selection manifest hash or equivalent manifest provenance ref

`provenanceRefs` must include at least one required ref kind for each descriptor
requirement. The implementation plan should set descriptor
`requiredProvenanceKinds` to require event IDs and content hashes for the
accepted graph and evidence packs, and event IDs for governance locks. When a
pack includes content hashes, those hashes must also appear in `artifactHashes`
where the existing `ContextPackRef` contract allows them.

Selection manifest hashes should appear in `provenanceRefs` or `artifactHashes`
using the existing `ContextPackRef` shape available at implementation time. The
payload remains the canonical place for the full manifest metadata.

Every produced `ResolvedContextPack.payload` must contain the bounded rows
defined by the pack-specific schema. The payload is provider-safe but may carry
structured investigative facts that are not repeated in `safeSummary`. Ledger,
projection, approval, handoff, and audit DTOs should store or project the ref
and provenance, not the payload body. Prompt construction resolves the payload
by content hash when the model actually needs context.

The existing `ContextPackRef` has one `projectionHighWaterMark` field. For
these packs, that field records the pack's primary freshness marker, while the
payload and `stalenessInputs` carry named high-water marks for every source
projection consumed by the pack. `projectSpecialistWorkflowReadiness` continues
to compare the ref-level mark against the current pack-level freshness value;
source-specific stale checks use the named payload and staleness inputs.

## Replay And Restart Behavior

The builders are pure over injected authoritative inputs. After restart, a
runtime can rebuild the same pack by re-reading the ledger, rebuilding or
opening projections to the manifest high-water marks, resolving the current
source posture capability, replaying the same authoritative selection manifest,
and calling the same builder.

If the runtime intentionally wants a new page, newer high-water marks, or a
different scope, it requests a new selection manifest and receives a different
canonical payload hash when the selected facts differ.

No payload truth is stored in hidden package state. Registration bookkeeping is
allowed only to make duplicate helper calls idempotent and conflict-aware.

Projection caches, job state files, local runtime state, and browser DTOs are
not sources of truth for these builders.

## Readiness Integration

This lane proves registration and readiness through tests with injected
dependencies:

- Create a fresh `ContextPackRegistry`.
- Call `registerInvestigativeContextPacks(registry, deps)` with a stable
  registration identity and bounded in-memory selection/readers.
- Build the three investigative `VerifiedResolvedContextPack` envelopes through
  `registry.buildResolved(id)`.
- Pass `resolved.map(({ ref }) => ref)` to `projectSpecialistWorkflowReadiness`.
- Verify specialist readiness no longer reports missing investigative context
  packs when other prerequisites are supplied.
- Verify a sentinel investigative fact exists in the verified resolved payload,
  not in `safeSummary` or serialized ref/audit surfaces, and leave production
  renderer consumption of that fixture to the prompt-template lane.

The design intentionally leaves local-runtime and orchestrator wiring to a
later integration task. That later task should have one narrow responsibility:
construct the dependency object from the mounted workspace/runtime and call the
package-owned registration helper or shared resolver hook. It should not change
pack schemas, readiness logic, resolved-envelope semantics, or the bounded
selection contract.

## Testing Expectations

The implementation plan should require failing tests first for:

- descriptor metadata for exactly the three investigative packs
- idempotent helper registration
- conflict rejection for duplicate IDs, versions, descriptors, budgets, stable
  builder descriptor identity, and registration identity
- stable canonical payload hashes for identical injected inputs
- no hidden clock usage
- production builder dependency shape using bounded selection/readers rather
  than required whole event lists or whole-workspace projections
- authoritative selection manifests with explicit scope, source projection
  high-water marks, deterministic ordering/cursor/window, total eligible count,
  included IDs/hashes, and bounded aggregate omission counts
- selection `manifestHash` computed from the canonical manifest body that omits
  `manifestHash`
- manifest parsing/verification rejecting self-including hashes, placeholder
  hashes, and fixed-point attempts with a no-fixed-point regression test
- workspace-scope requests requiring a deterministic page/window or explicit
  bounded selection manifest
- exact event/provenance fetches by included IDs or bounded batches, with tests
  proving builders do not scan the whole ledger for one pack
- build memory, output size, and reader/query work remaining bounded as
  unrelated evidence, graph rows, and governance history grow
- stable cursors/selections preventing omission drift when unrelated rows are
  added outside the manifest
- deterministic ordering independent of caller order
- accepted assertions requiring proposal event, acceptance event, evidence ID,
  and evidence content hash
- accepted relationships included only from an authoritative reviewed projection
- no inferred accepted relationships
- evidence summary rejecting raw document text, parse text, provider payloads,
  provider errors, credentials, hidden paths, and raw executable action fields
- evidence summary permitting safe journalistic narrative that discusses
  commands when field schemas, authority labels, secret checks, and raw-content
  checks pass
- exact regular-file byte hash staleness rejection
- exact archive container and child hash staleness rejection
- governance pack separation of resident-agent locks and governance-derived
  restrictions
- governance restrictions never granting approval, clearing locks, or mutating
  evidence or graph state
- active locks, exact provenance, scope, high-water marks, staleness inputs, and
  aggregate omission metadata never being truncated away
- deterministic budget omissions with stable omission reason codes, aggregate
  counts, and bounded sample refs rather than per-row omitted lists
- stale manifest/read rejection with stable `selection-manifest-stale`,
  `selection-manifest-hash-mismatch`, `selection-row-mismatch`,
  `selection-cursor-invalid`, and `selection-window-required` codes
- mandatory envelope budget failure with `context-budget-exceeded`
- builders returning provider-safe `ResolvedContextPack { ref, payload }`
  envelopes whose ref content hash and size verify against the canonical
  payload
- ledger, projection, approval, handoff, and audit DTOs carrying only refs,
  hashes, and provenance, not resolved payload bodies
- production prompt rendering resolving payloads by ref and failing on missing,
  hash-mismatched, or size-mismatched payloads instead of sending only
  `safeSummary`
- a sentinel investigative fact that exists only in `payload`, not
  `safeSummary`, and is available to the production renderer after exact hash
  verification
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
  staleness inputs, or aggregate omission metadata
- require whole-workspace projections, whole event lists, or ledger scans to
  build one bounded pack
- allow workspace scope to produce an unbounded dump instead of a deterministic
  page/window or explicit bounded selection manifest
- enumerate every omitted row in omission DTOs instead of bounded aggregate
  counts and optional bounded samples
- compute `manifestHash` over a structure that includes `manifestHash`, accept
  a fixed-point manifest hash, or skip canonical body-hash verification
- silently refresh stale manifests, change selection windows, or mask
  selection/read mismatches instead of failing closed
- return refs alone from investigative builders, discard resolved payloads, or
  let production prompt execution render `safeSummary` as the only context body
- write resolved payload bodies into ledger, projection, approval, handoff, or
  audit DTOs instead of content-addressed refs, hashes, and provenance
- send a prompt with unresolved, missing, hash-mismatched, or size-mismatched
  context-pack payloads
- let governance restrictions grant approval, clear locks, release quarantine,
  or mutate graph/evidence state
- import local-runtime, UI, SQLite, filesystem mount, or orchestrator modules
  into the agent package builders
- use hidden clocks or payload caches that change content hashes outside
  injected inputs
- use dependency object identity alone for registration idempotency
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
with injected bounded selection, reader, event, and source posture capabilities.
It should also prove compatibility with the shared `ResolvedContextPack`
contract, opaque `VerifiedResolvedContextPack` execution assertion, body-only
manifest hashing, and provider-safe payload availability after hash
verification. Runtime wiring remains a later narrow integration task.
