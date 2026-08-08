# Exact Import Approval And Evidence Admission

Status: approved.

## Desired Behavior

Cestus presents one immutable Specification 19 manifest for exact human
selection, records one terminal manifest decision, and admits approved ordinary
artifacts or Specification 18 protected derivatives into canonical evidence
storage. It does not schedule a batch, parse documents, call Mistral, invoke
the resident, or propose ontology truth.

The selection preview binds destination workspace identity/storage generation,
source collection, current Specification 15 boundary revision, Specification
19 opaque public manifest ID/keyed commitment, and every selectable entry's
opaque public ID/keyed commitment, type, size, ordinary content digest or
protected observation commitment, and review state. It never contains the
protected canonical manifest/entry SHA-256 identities or an unkeyed path-derived
hash. Exact normalized relative paths appear only in the protected
human manifest readback from Specification 19, never in ordinary preview DTOs
or ledger events. It reports
selected counts/bytes by type and binds protected-redaction policy, active
model bundle, commitment posture, and readiness.

The resident may recommend entries and explain exclusions, but recommendations
remain unselected until the human actively selects them individually or invokes
an explicit `select recommended` action. `review-required` JSON is never
included by bulk selection and must be selected individually. Excluded,
incomplete, changed, quarantined, or over-limit entries cannot be selected.
Safe preview surfaces contain no source values, raw protected hashes,
credentials, or artifact content.

When the selection contains a standalone image, PDF, or DOCX/XLSX with any
embedded raster child, the preview and approval also bind every exact OCR input
identity, parent/child membership, hash, type, and bytes; Mistral
endpoint policy; `mistral-ocr-latest` alias; adapter/request schema revision;
opaque credential-reference identity; region/retention policy; budget
configuration revision and displayed estimate; and concurrency configuration
revision. Credential bytes are never present.

For each selected PDF, the preview binds its locally validated page count, the
canonical sequence of zero-based OCR windows of at most 50 pages, planned call
count, and repeated inline-transfer byte total. The budget estimate uses exact
planned pages rather than an unbound approximation.

Selecting a DOCX/XLSX parent also selects its complete Specification 19
embedded-raster inventory for mandatory OCR. The preview separately discloses
child count/bytes and binds every child part identity, media type, digest, and
byte count. A child cannot be silently omitted or independently deselected; an
unselectable child makes the parent unselectable. Embedded children remain
derivatives of their parent evidence rather than independent top-level
evidence records.

Embedded children participate in the same OCR endpoint/alias/schema,
credential-reference, region/retention, budget-estimate, concurrency, and
transfer bindings as standalone images. The displayed OCR page/cost estimate
adds one page per child. A parent-only selection with children therefore cannot
be approved while any OCR policy binding is absent or stale.

Any bound OCR configuration change makes the preview stale and requires a new
decision. The provider-resolved model may vary behind the explicitly approved
latest alias and is recorded by Specification 23. This approval authorizes only
automatic Mistral OCR of the exact selected image/PDF/embedded-child bytes. It does not
authorize resident, Nous, ChatGPT, or another provider transfer.

Each manifest accepts exactly one terminal authenticated-human decision:
rejection or approval of one nonempty exact subset. Approval uses a selection
hash over the complete canonical selection and every bound policy identity.
The resident may request or recommend but cannot decide. Rejection, approval,
stale preview, and concurrent decisions use one compare-and-append fence.
Identical replay is idempotent; conflicting replay fails closed. An approved
selection cannot be amended. Additional files require a new manifest/preview.

The version-two `ingestion.import.approved` event carries these exact bindings
using opaque path-free manifest/entry IDs and keyed commitments. The protected human
review artifact retains the exact relative-path mapping; no ordinary event,
projection, diagnostic, log, or resident surface carries it.
Existing version-one history remains readable and projection-rebuildable but
cannot authorize this descriptor-confined import path.

Before any durable evidence effect, Cestus revalidates the human approval and
selection hash; workspace identity/generation and append/blob capabilities;
source boundary, pinned root, and manifest; exact selected entry and current
classification; protected posture/model/policy readiness; bound OCR policy for
  selected image/PDF/embedded child; and absence of cancellation or a terminal entry state.

Ordinary content streams through Specification 19's single-descriptor consume
port. Protected content verifies its manifest commitment and passes from that
same observation to Specification 18; only a successful redacted derivative
may proceed. Cestus never creates a raw protected blob, public raw digest, or
fallback write.

Verified content streams into a private non-addressable same-filesystem staging
file opened with exclusive creation, mode `0600`, and no-follow/regular-file
checks while digest and byte count are checked. Protected source bytes are never
staged; only the completed derivative may enter staging. Staging identity is
deterministic from import/entry identity, mode-restricted, non-symlinked, and
excluded from all product reads. Before commitment it is tracked recoverable
temporary state, never evidence.

Before `prepared`, Cestus reaches EOF, verifies hash/size, flushes the staging
file, closes it, and flushes its private staging directory. Only that durable
stage identity/hash/size may be referenced by `prepared`. A failed file or
directory flush appends no prepared record. Staging and canonical blob
directories are on the same mounted filesystem.

After all consume-time checks succeed, Cestus conditionally appends one
immutable `ingestion.evidence.prepared` record. It binds approval/selection,
manifest entry/source observation, admitted content hash/size/media type,
ordinary or redacted transformation provenance, destination, and deterministic
evidence/occurrence identities. This append is the irreversible consume point
for those exact bytes.

After `prepared`, Cestus atomically installs the verified staging file with
`renameat2(RENAME_NOREPLACE)` into canonical content-addressed blob storage,
then flushes the installed file and canonical parent directory before evidence
events become visible. There is no replace/copy/cross-filesystem fallback. An
existing blob is reused only after
complete digest/size verification. It appends or reuses the existing
`evidence.ingested` event and appends one occurrence-lineage link for every
selected manifest entry. Identical content selected from multiple paths or
imports shares one evidence blob while retaining separate occurrence lineage.
Source labels identify the approved local source collection and never claim the
content is public.

After the finalized evidence/occurrence batch is flushed, Cestus unlinks its
tracked stage and flushes the staging directory. A crash before cleanup may
leave only the private tracked duplicate; recovery verifies and removes it.

The committed provenance binds evidence, occurrence, approval, manifest,
boundary, source observation, transformation, and OCR-authority identity.
Canonical blob storage and the append-only product ledger have no fallback
path.

A crash before `prepared` exposes no evidence; tracked staging may be discarded
or reconstructed only after complete revalidation. A crash after `prepared`
must finish installing and linking those exact committed bytes without another
approval, even if the source later disappears. Recovery cannot substitute
bytes, policy, destination, or provenance. Recovery accepts exactly one of two
durable byte locations bound by `prepared`: the verified staging object, or the
verified canonical blob produced by the no-replace rename. Because rename moves
the staging name, absence of staging is expected after installation when the
canonical blob has the prepared digest and size. If staging exists it must
match; if the canonical blob exists it must match; if both exist during a
deduplicated/recovery state both must match. Neither exists, any mismatch,
ledger conflict, destination replacement, or impossible provenance is a hard
integrity failure and cannot reopen the source.

Duplicate/concurrent wakeups converge on the same prepared record, blob,
evidence event, and occurrence links. Product projections expose evidence only
when the required blob and append-only provenance are complete.

One entry returns `committed`, `reused-identical-evidence`, `changed`,
`missing`, `quarantined`, `blocked-stale-approval`, `blocked-readiness`, or
`failed-integrity`. Specification 21 owns batch scheduling/aggregation. One
entry failure never expands authority or mutates the approved subset.

## Observable Acceptance Examples

- Resident recommendations render unselected. `select recommended` selects only
  ordinary recommended entries; a `review-required` JSON object remains off
  until the human selects it individually.
- Approval records the canonical nonempty subset and every bound identity. An
  agent decision, stale preview, second decision, changed selection, added
  entry, or changed destination/policy fails before content consumption.
- Selecting an image binds its exact automatic-Mistral policy. Changing
  endpoint, adapter, credential reference, region/retention, budget, or
  concurrency requires a new preview. No provider call occurs in this slice.
- Selecting a PDF binds its exact page count/window plan and discloses that the
  same inline PDF bytes are transferred once per window. A changed page count,
  window policy, call count, or repeated-transfer total makes approval stale.
- Selecting a DOCX/XLSX fixture binds and discloses every inventoried embedded
  raster. A changed, omitted, added, or excessive child makes the selection
  stale or the parent unselectable.
- A stable ordinary file streams into a private staged object and becomes
  visible only with matching prepared, blob, evidence, and lineage records.
- A protected `.env` creates no raw stage/blob/hash; only its successful
  Specification 18 derivative can become evidence.
- Two selected paths with identical bytes reuse one evidence/blob and retain
  two manifest-entry occurrence links.
- Mutation, disappearance, boundary/root replacement, stale approval,
  unavailable protected runtime, or changed OCR policy produces the exact
  per-entry non-commit result and no evidence effect.
- Crash before `prepared` leaves no evidence. Crash after `prepared` resumes
  the exact committed bytes without source reopen or new approval. Missing
  staging plus an exact verified canonical blob is the normal post-rename
  recovery case; neither location or a mismatch fails integrity checks. Fault
  injection before/after staging-file flush, staging-directory flush, prepared
  flush, no-replace install, blob flush, canonical-directory flush, evidence
  append, and staging cleanup exposes either recoverable private staging or one
  complete blob/provenance result, never partial evidence.
- Version-one import approvals remain readable but cannot pass the version-two
  consume-time gate.
- Standard verification uses synthetic virtual observations, fake storage,
  and fake ledgers. It does not read the attached SSD, store a real artifact,
  use a credential, invoke a provider, bind a socket, send a PRR, or publish.

## Allowed Scope

- `packages/ontology/src/contracts.ts`, projections, `evidence-service.ts`, and
  focused tests only for version-two exact import approval,
  `ingestion.evidence.prepared`, provenance completeness, and version-one
  historical readability.
- `packages/ontology/src/blob-store.ts` and focused tests only for bounded
  streaming staging, atomic content-addressed installation, complete existing-
  blob verification, and no-fallback behavior.
- `packages/ingestion/src/import-service.ts`, projections/read APIs, and focused
  adjacent modules for exact preview/selection/decision, consume-time fences,
  protected derivative routing, prepared/finalized admission, deduplication,
  occurrence lineage, and crash recovery.
- `packages/ingestion/test/**` for actor, selection, policy binding, streaming,
  mutation, staging, prepared/finalization, recovery, deduplication,
  compatibility, provenance, and no-leak fixtures.
- `packages/agent/src/**` only for resident recommendations, exact tool preview,
  human-only decision forwarding, and safe result projection.
- `packages/agent/test/**` for unselected recommendations, bulk/individual
  selection, actor authority, stale binding, and content-free surfaces.
- `packages/local-runtime/src/**` only for authenticated import
  preview/decision, exact policy snapshot wiring, entry execution, and
  canonical storage dependencies.
- `packages/local-runtime/test/**` for mounted route/authentication,
  destination replacement, OCR-policy staleness, recovery, and zero-external-
  effect tests.
- Do not modify batch scheduler terminality, source traversal/classification,
  secret commitment/redaction policy/runtime, local derivative parsing,
  provider invocation, resident semantic extraction, ontology truth, UI, PRR,
  legal, export, publication, destructive operations, or historical product-
  design material.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/15-resident-source-boundary.md`
- `docs/agentic/specifications/18-protected-secret-redaction.md`
- `docs/agentic/specifications/19-descriptor-confined-source-scan.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/src/evidence-service.ts`
- `packages/ontology/src/blob-store.ts`
- `packages/ingestion/src/import-service.ts`
- `packages/ingestion/src/projection.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/local-runtime/src/ingestion-http-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice records exact import authority and creates durable evidence.
Selection/rejection and live import execution remain authenticated human-gated
actions; verification uses only synthetic/fake content and storage.

## Targeted Verification

- `npm test -- packages/ontology/test/contracts.test.ts packages/ontology/test/evidence-service.test.ts packages/ontology/test/blob-store.test.ts`
- `npm test -- packages/ingestion/test/exact-import-approval.test.ts packages/ingestion/test/streaming-evidence-admission.test.ts packages/ingestion/test/protected-derivative-admission.test.ts packages/ingestion/test/evidence-admission-recovery.test.ts packages/ingestion/test/evidence-occurrence-deduplication.test.ts`
- `npm test -- packages/agent/test/resident-source-import-selection.test.ts`
- `npm test -- packages/local-runtime/test/agent-resident-source-import-routes.test.ts packages/local-runtime/test/ingestion-http-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves exact human selection,
immutable decision authority, bound OCR policy without a call, current consume-
time validation, streaming ordinary and derivative-only protected admission,
prepared/finalized crash recovery, deduplicated evidence with complete
occurrence lineage, historical readability, and zero live/external effects.

## Integration Verification

Build only after Specifications 18 and 19 are integrated. Update the candidate
normally against latest `neo`, obtain a fresh Sol `ship` verdict on the final
diff, then run `npm run verify` once on the final merged candidate. Compare with
the current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live import and
any automatic OCR provider calls remain separate gated actions.

## Escalation Conditions

Escalate for agent-created approval, preselected recommendations, bulk-selected
review-required JSON, selection amendment, approval without exact OCR policy,
raw protected storage/hash, a different commit point, source reopen after
prepared, incomplete occurrence lineage, fallback storage/ledger, live
SSD/evidence/provider effects during build, unavailable required atomic storage
capability, or the same concrete failure surviving two focused repair attempts.
