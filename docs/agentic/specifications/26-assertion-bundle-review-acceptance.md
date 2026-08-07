# Assertion Bundle Review And Acceptance

Status: approved.

## Desired Behavior

Cestus consolidates provisional scalar assertion candidates into exact human-
review bundles, records one exact truth decision, and atomically appends paired
version-two `assertion.proposed`/`assertion.accepted` events for selected
assertions. It preserves unresolved conflict decisions. It does not resolve
entities, accept relationships, change the ontology boundary, or invoke a
model/provider.

A candidate is selectable only when its Specification 24 bundle is immutable;
all evidence/derivative/anchor and source/import provenance validates; current
Specification 25 boundary defines its subject type, predicate, scalar type,
cardinality, and evidence requirements; its canonical value conforms; safe
fields contain no credential-shaped material; no failed/quarantined/partial
derivative is used; it does not conflict with accepted current truth; and its
review-only requirements receive individual handling.

An assertion may bind a deterministic provisional subject identity and
approved entity type before Specification 27 resolves it. It appears in the
accepted assertion projection but not as a resolved graph node until entity
resolution.

The common version-two assertion object is a tagged union of typed scalar and
typed entity-reference objects. This specification emits scalar objects only;
Specification 27 is the sole v1 path for entity-reference assertion pairs.

Version-two `assertion.proposed` replaces one `evidenceId` with a self-
contained `evidenceReferences` array. Each reference binds evidence ID/hash,
ingestion/occurrence events, optional derivative ID/hash, exact source/block/
page/region/table/cell anchors, extraction invocation/pass, and modality path.
At least one and at most 32 references are allowed. The proposal also binds
boundary revision/hash, bundle/candidate identities, provisional subject,
predicate, canonical tagged scalar object, confidence, and canonical assertion
hash. Version-one history remains readable/rebuildable; the new path emits
only version two.

Candidates consolidate only when boundary canonicalization yields identical
provisional subject, predicate, typed object, and compatible semantics.
Consolidation preserves every candidate, invocation, evidence reference, and
anchor. It performs no semantic inference, synonym expansion, entity merge, or
model equivalence. Distinct values remain alternatives.

The review bundle binds candidate bundles/hashes, current boundary approval/
definitions/hash, current accepted-assertion projection, consolidated
assertions/evidence, existing truth/cardinality checks, conflict alternatives,
resident recommendations, review-only reasons, selected assertions, preserved
conflicts, human actor, and canonical bundle/selection hashes.

Recommendations are never preselected. Ordinary compatible assertions may be
bulk-selected only through an explicit human action. Review-only assertions
and every conflict alternative require individual action. Editing subject,
predicate, object, evidence, rationale, or conflict disposition creates a new
candidate/bundle/preview; old approval cannot apply.

For a single-valued predicate or explicit mutually exclusive group, at most
one alternative may be accepted. The human may `preserve unresolved`, which
accepts none and records the complete conflict. Multiple values are allowed
only when current cardinality permits and alternatives are compatible.
Existing accepted truth cannot be overwritten/superseded here; such conflicts
remain unresolved. Preserved records retain every alternative/evidence path
and non-authoritative recommendation without preselection.

An authenticated human may reject or approve one exact nonempty selection and
exact unresolved-conflict dispositions. Human-authored
`ontology.assertion.bundle.approved` binds bundle/selection, boundary, graph
projection, evidence high-watermark, actor, and rationale. It is a one-use
ledger-backed capability, not a bearer token. The resident may request and
execute an approved append but cannot create/alter/expand approval. Identical
decision replay is idempotent; conflicting decision fails.

Immediately before commit, Cestus verifies approval membership/human actor,
unconsumed exact hashes, current boundary and identical used definitions,
current accepted-assertion projection/high-watermark, every evidence/
derivative/anchor/import event, current candidate bundle, types/cardinalities/
conflicts against current and selected truth, and deterministic event IDs.
Stale/missing state creates no proposal or acceptance.

EventLedger adds atomic conditional `appendBatch`, validating every event and
expected stream/global head before any write. One batch appends each selected
version-two proposal and paired acceptance, preserved-conflict records, and
`ontology.assertion.bundle.committed`. The approving human is product actor;
resident/service executor is non-authoritative metadata. Each acceptance
causally references proposal and approval. Summary counts/hash cover the
complete decision. All events commit and flush before visibility, or none do.

Crash after approval but before commit leaves a resumable unconsumed approval
subject to full preflight. Crash during batch exposes all or none. Concurrent
boundary/truth/evidence changes fail the batch. Identical execution converges.
Stale approval needs a new preview/decision and cannot auto-refresh. Projection
exposes no accepted assertion until complete commit summary exists.

Limits are 100 selected assertions, 500 reviewed candidates, 100 conflict
groups, 16 alternatives per conflict, 32 evidence references per assertion,
and 8 MiB canonical bundle. Oversized review uses separately approved bundles;
approval cannot be silently split.

Confidence, generation, consolidation, ranking, recommendation, and import
approval never accept truth. Legacy staging remains proposal-only. Only the new
truth-bundle tool may emit accepted assertions under consumed human authority.

## Observable Acceptance Examples

- Two identical candidates with different evidence consolidate into one
  version-two proposal containing both exact reference/anchor sets. A
  semantically similar but nonidentical value remains separate.
- Version-one history rebuilds unchanged, while new proposal/acceptance pairs
  contain boundary/bundle/multi-evidence identity.
- Missing/stale evidence, derivative, anchor, import lineage, boundary,
  predicate/type/cardinality, or candidate bundle makes an assertion
  unselectable before truth events.
- Explicit bulk selection includes only ordinary compatible assertions.
  Review-only/conflict entries remain off until individual action.
- A single-valued conflict accepts at most one or preserves all unresolved with
  no accepted alternative. Compatible multivalue assertions follow boundary
  cardinality. Existing-truth conflict cannot overwrite it.
- Human edit changes bundle/selection hash and invalidates prior approval. A
  resident approval attempt or selection expansion appends nothing.
- Crash before atomic truth commit leaves only reusable approval; crash during
  commit exposes all proposal/acceptance/conflict/summary events or none.
- Concurrent boundary, truth, or evidence change fails consume-time append.
  Duplicate identical execution produces no duplicate events.
- Ledger-only replay exposes accepted assertions only for complete committed
  bundles and reproduces preserved conflicts.
- Standard verification uses synthetic candidates/evidence/ledgers. It creates
  no entity/relationship event, provider/model call, credential use, SSD read,
  socket, PRR, publication, or unapproved truth.

## Allowed Scope

- `packages/ontology/src/contracts.ts`, assertion service, event ledger,
  assertion/graph projections, and focused tests for version-two multi-evidence
  events, atomic conditional append, approval capability, conflict records,
  bundle commit, and version-one compatibility.
- `packages/ontology-bootstrap/src/**` for consolidation, eligibility, review
  bundles, selection/conflict previews, exact decisions, and approved execution.
- `packages/ontology-bootstrap/test/**` for evidence/anchor/boundary,
  consolidation, conflict, actor, edit, stale, atomicity, and rebuild tests.
- `packages/agent/src/**` only for resident recommendations/requests, exact
  human truth preview/decision forwarding, and approved execution metadata.
- `packages/agent/test/**` for non-preselection, review-only handling,
  non-authority, and tool output restrictions.
- `packages/local-runtime/src/**` only for authenticated assertion bundle
  review/decision/execute routes and read projections.
- `packages/local-runtime/test/**` for actor, concurrency, crash/recovery,
  idempotency, and zero-external-effect tests.
- Do not modify entity/relationship acceptance, ontology boundary revision,
  evidence/source/import/redaction/OCR/provider behavior, credentials, UI,
  PRR, legal, export, publication, or destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/24-resident-multimodal-candidate-extraction.md`
- `docs/agentic/specifications/25-ontology-boundary-revision-authority.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/src/event-ledger.ts`
- `packages/ontology/src/assertion-service.ts`
- `packages/ontology/src/evidence-service.ts`
- `packages/ontology/src/graph-projection.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`

## Risk Lane

Red. This slice accepts factual ontology truth. Exact selection, conflict
disposition, and acceptance remain an authenticated human decision; build
verification uses synthetic ledgers and creates no live truth.

## Targeted Verification

- `npm test -- packages/ontology/test/contracts.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/assertion-bundle-commit.test.ts packages/ontology/test/event-ledger-atomic-batch.test.ts packages/ontology/test/graph-projection.test.ts`
- `npm test -- packages/ontology-bootstrap/test/assertion-bundle-review.test.ts packages/ontology-bootstrap/test/assertion-bundle-conflicts.test.ts`
- `npm test -- packages/agent/test/ontology-assertion-bundle-review.test.ts`
- `npm test -- packages/local-runtime/test/ontology-assertion-bundle-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves multi-evidence version-two
truth with historical compatibility, exact consolidation/conflict rules,
human-only one-use approval, consume-time authority, all-or-none paired events,
complete projection rebuild, and zero unapproved/live/external effects.

## Integration Verification

Build only after Specification 25 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real assertion
truth decisions/execution remain separately human-gated actions.

## Escalation Conditions

Escalate for automatic/model truth, semantic consolidation, accepting multiple
exclusive alternatives, overwriting existing truth, agent-created approval,
partial bundle commit, loss of version-one history, changed caps, proposal/
acceptance without exact current boundary/evidence, live truth/provider effect
during build, unavailable atomic ledger capability, or the same concrete
failure surviving two focused repair attempts.
