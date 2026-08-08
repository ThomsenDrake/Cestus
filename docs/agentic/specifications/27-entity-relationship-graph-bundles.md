# Entity And Relationship Graph Bundle Acceptance

Status: approved.

## Desired Behavior

Cestus resolves provisional subjects into new or existing entities, creates
evidence-backed entity-reference assertion pairs, accepts relationships between
resolved endpoints, records identity/relationship conflicts, and atomically
commits one exact human graph decision. It does not merge two existing
entities, change scalar truth, change the boundary, or invoke a model/provider.

The common version-two assertion object supports tagged scalar objects emitted
by Specification 26 and tagged entity references emitted only here. Every
relationship-supporting entity-reference assertion has the same multi-evidence,
boundary, human approval, proposal, and acceptance provenance as scalar truth.
Version-one history remains readable.

A provisional subject may resolve only when its candidate bundle is immutable;
required identity-key/canonical-label scalar assertions are accepted/current;
entity type exists in current boundary; accepted values satisfy a complete
identity-key alternative and merge constraints; support refers to that subject
or an exact consolidated equivalent; and no hard identity/cardinality conflict
exists.

Eligibility is deterministic: zero existing entities matching the complete
canonical identity key permits exactly the derived new entity; one compatible
existing match permits exactly that existing entity; more than one match,
conflicting/incomplete keys, incompatibility, a key mapping to different
existing entities, or any request to merge resolved IDs is a hard identity
conflict and permits only `preserve unresolved`. No review offers both new and
existing as simultaneously eligible alternatives. The resident recommends the
eligible disposition but nothing is preselected.

New entity ID derives from workspace, stable entity-type definition, and
canonical identity-key values; revision is provenance rather than identity.
Provisional candidates with identical complete keys may consolidate while
preserving all candidates/assertions. Resolving into an existing entity appends
support/provisional mapping and never rewrites the original event. Label
similarity, confidence, aliases, or incomplete keys never auto-merge. Hard
conflicts are review-only and cannot be resolved to an entity in this slice.
V1 forbids merging two resolved entity IDs and preserves that as a later-work
identity conflict.

Version-two `entity.resolved` binds entity ID/type/label, complete identity key
and boundary definitions, provisional/candidate identities, accepted scalar
assertion events, boundary revision/hash, graph approval/commit, optional prior
entity event for support addition, and canonical hash.

A relationship is selectable only when current boundary defines its type;
direction, domain/range, symmetry/inverse, and cardinalities pass; endpoints
exist or are selected in the same bundle; candidate/evidence/anchors validate;
at least one supporting entity-reference assertion pair is selected; current
truth has no conflict; and review-only requirements receive individual action.

Symmetric relationships use canonical endpoint ordering. Inverse declarations
validate consistency but create no inferred edge. For every selected edge, the
atomic graph batch creates version-two entity-reference
`assertion.proposed`, paired `assertion.accepted`, then version-two
`relationship.accepted` referencing accepted support. The edge cannot project
without resolved endpoints and accepted support.

Version-two `relationship.accepted` binds deterministic relationship ID,
endpoints, type/used boundary definitions, supporting accepted assertion
events, candidates/evidence/anchors, graph approval/commit, boundary, and
canonical hash. If an identical edge exists, new evidence uses append-only
`relationship.support.added` after exact validation rather than duplicate edge
or rewritten support.

The preview binds current boundary/definitions/approval; current assertion and
graph projections; candidate bundles; provisional-to-entity mappings; new/
existing entity choices; identity evidence; relationship assertion pairs;
edges; dependency DAG; conflicts/alternatives/recommendations; selected entity/
relationship/support changes; unresolved dispositions; human actor; and
canonical bundle/selection hashes.

Ordinary unambiguous items may be bulk-selected only by explicit human action.
Review-only items, existing-entity resolutions, and identity/relationship
conflicts require individual action. Recommendations remain unselected.
Deselecting a new entity makes dependent relationships ineligible and changes
selection hash; approval never adjusts dependencies silently.

An ordinary zero-match or unique-match resolution approves its sole eligible
new/existing entity. A hard identity conflict can only remain unresolved.
Relationship domain/range/cardinality conflict selects one boundary-permitted
alternative when one exists or preserves none accepted. Existing graph truth cannot
be overwritten. Preserved conflicts retain all alternatives/evidence/anchors/
recommendation. No resolution merges existing entities.

An authenticated human rejects or approves one exact nonempty graph decision.
A decision is nonempty when it contains at least one selected entity/
relationship/support effect or at least one explicit unresolved-conflict
disposition; a preserved-conflict-only graph decision is valid. Human-authored
`ontology.graph.bundle.approved`
is a one-use ledger capability binding boundary, assertion/graph projections,
candidates, dependencies, selected effects, and hashes. The resident may
request/execute but cannot approve/add/substitute/reorder. Edits create a new
bundle/preview. Identical replay is idempotent; conflicting decision fails.

Immediately before commit, Cestus revalidates human approval/unconsumed
selection, current boundary/definitions, current accepted scalar assertions/
evidence, current graph, identity/merge/endpoint/cardinality/conflict rules,
candidates/anchors, and deterministic IDs/event sequences. Staleness produces
no graph-related event.

One conditional atomic `appendBatch` contains in order: version-two
`entity.resolved`; entity-reference proposal/acceptance pairs;
`relationship.accepted` or `relationship.support.added`; preserved conflict
events; and `ontology.graph.bundle.committed`. The batch checks expected
boundary/assertion/graph heads and flushes before visibility. Approving human is
product actor; executor is non-authoritative metadata.

Projection exposes none until complete commit summary, then applies entity
mappings before relationship support/edges. Approval without commit resumes
only after full preflight. Crash during batch exposes all/none. Concurrent
boundary/assertion/entity/relationship change fails. Duplicate execution
converges. Stale approval needs new review. Partial entities/edges/support
cannot project.

Limits are 100 entity resolutions, 250 relationships/support additions, 500
relationship assertion pairs, 100 conflicts, 16 alternatives per conflict, 16
MiB canonical graph bundle, and 2,000 atomic events. Oversized work uses
separately approved bundles; approval cannot be silently split.

Version-one entities/relationships remain readable. Version-two projection
preserves provisional mappings, multi-evidence support, boundary/approval
lineage, and append-only support additions. Current conforming graph follows
Specification 25; legacy-out-of-boundary items remain historical and cannot
satisfy new dependencies. Ledger-only rebuild reproduces graph/conflicts.

## Observable Acceptance Examples

- A complete new identity key produces a stable new entity ID. Repeating it
  consolidates support. One exact existing match resolves to that entity; two
  matches, conflicting keys, or requested existing-entity merge remain
  unresolved.
- A relationship whose endpoints are current/selected and whose boundary rules
  pass produces an entity-reference proposal/acceptance pair before its edge.
  Missing endpoint/support or domain/range/cardinality conflict blocks it.
- Symmetric endpoint reversal yields the same canonical edge. Repeated edge
  with new valid evidence appends support rather than duplicating/rewriting.
- Explicit bulk selection excludes existing-entity resolution and conflicts.
  Deselecting a new endpoint invalidates dependent relationship selection and
  its old preview.
- Preserved identity/relationship conflicts accept no alternative and retain
  evidence/recommendation without preselection or existing-entity merge.
- A bundle containing only hard identity/relationship conflicts may commit
  preserved-conflict records and its summary with zero entity/relationship/
  assertion effects; replay reproduces the conflict-only decision.
- Human edit, agent approval, stale boundary/assertion/graph/candidate, or
  selection expansion creates no events.
- Crash/concurrency during the atomic batch exposes the entire ordered graph
  decision or none. Duplicate execution is idempotent; no partial edge/entity/
  support projects.
- Version-one history and version-two bundle events rebuild the same current/
  historical graph from ledger only.
- Standard verification uses synthetic assertions/candidates/ledgers. It makes
  no provider/model call, credential use, SSD read, socket, PRR, publication,
  boundary mutation, or unapproved graph truth.

## Allowed Scope

- `packages/ontology/src/contracts.ts`, entity/relationship services, atomic
  event ledger, graph projections/read models, and focused tests for version-
  two assertion objects, entity mappings/support, relationships/support,
  conflicts, graph commits, compatibility, and rebuild.
- `packages/ontology-bootstrap/src/**` for graph eligibility, deterministic
  identity, dependency/selection/conflict bundles, preview/decision, and exact
  approved execution.
- `packages/ontology-bootstrap/test/**` for identity/merge, relationship,
  dependency, conflict, authority, atomicity, and projection fixtures.
- `packages/agent/src/**` only for resident recommendations/requests, exact
  graph preview/decision forwarding, and approved executor metadata.
- `packages/agent/test/**` for non-preselection, dependency changes, actor
  authority, and forbidden merge/tool effects.
- `packages/local-runtime/src/**` only for authenticated graph review/decision/
  execute routes and current/historical projections.
- `packages/local-runtime/test/**` for human actor, stale/concurrent/crash,
  idempotency, and zero-external-effect tests.
- `docs/agentic/specifications/26-assertion-bundle-review-acceptance.md` only
  for the approved common version-two tagged-object clarification.
- Do not modify ontology boundary content, scalar assertion acceptance,
  evidence/source/import/redaction/OCR/provider behavior, credentials, existing-
  entity merge semantics, UI, PRR, legal, export, publication, or destructive
  operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/25-ontology-boundary-revision-authority.md`
- `docs/agentic/specifications/26-assertion-bundle-review-acceptance.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/src/event-ledger.ts`
- `packages/ontology/src/assertion-service.ts`
- `packages/ontology/src/graph-projection.ts`
- `packages/ontology/src/ontology-workspace-read.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`

## Risk Lane

Red. This slice creates accepted entities, entity-reference truth, and accepted
relationships. Exact graph selection/conflict disposition remains an
authenticated human decision; verification uses only synthetic events.

## Targeted Verification

- `npm test -- packages/ontology/test/contracts.test.ts packages/ontology/test/entity-resolution.test.ts packages/ontology/test/relationship-acceptance.test.ts packages/ontology/test/graph-bundle-commit.test.ts packages/ontology/test/graph-projection.test.ts`
- `npm test -- packages/ontology-bootstrap/test/graph-bundle-review.test.ts packages/ontology-bootstrap/test/graph-bundle-conflicts.test.ts`
- `npm test -- packages/agent/test/ontology-graph-bundle-review.test.ts`
- `npm test -- packages/local-runtime/test/ontology-graph-bundle-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves deterministic boundary-based
entity resolution without existing-entity merge, evidence-backed entity-
reference truth, valid relationship dependencies/support, human-only exact
graph authority, all-or-none ordered commit, historical compatibility/rebuild,
and zero unapproved/live/external effects.

## Integration Verification

Build only after Specification 26 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real graph
approval/execution remains a separately human-gated action.

## Escalation Conditions

Escalate for merging existing entities, label/model-based auto-merge, a
relationship without accepted assertion support, inferred edges, overwriting
graph truth, agent approval, partial/out-of-order graph commit, changed caps,
loss of version-one history, live truth/provider effect during build,
unavailable atomic ledger capability, or the same concrete failure surviving
two focused repair attempts.
