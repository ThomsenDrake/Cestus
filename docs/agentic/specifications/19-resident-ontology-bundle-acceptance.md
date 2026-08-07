# Resident Ontology Bundle Acceptance

Status: approved.

## Desired Behavior

The mounted resident turns Specification 18's immutable, evidence-linked
OpenPlanter candidates into exact human-review bundles, recommends resolutions
for duplicates and conflicts, and executes only the ontology truth and graph
changes an authenticated human explicitly selects. The resident may request an
ontology-boundary revision or a bundle decision; it cannot change the boundary,
select candidates for the human, approve truth, forge the human actor, or append
outside approved scope.

Assertion candidates are consolidated only when subject, predicate, scalar
object, temporal scope, qualifiers, and meaning agree. Consolidation preserves
every evidence artifact and exact source/derivative anchor. Similar but
materially different candidates remain separate. Conflicting candidates form
one explicit cluster containing all alternatives, supporting and opposing
evidence, confidence, uncertainty, and the resident's non-binding recommended
resolution with rationale.

The resident's recommendation never preselects a checkbox. Each item begins
unchecked and has one human disposition: accept, reject, or defer. Rejected and
deferred material remains immutable review evidence and cannot become graph
truth through that approval. Review-only candidates may be displayed and
dispositioned but cannot be accepted until the underlying uncertainty is
resolved and a new eligible candidate/hash is generated.

An assertion review bundle contains at most 25 items. Every item includes a
stable candidate ID/hash, proposed assertion, confidence, complete evidence
links and anchors, source/model/derivative identities, rationale, alternatives,
uncertainty, conflict cluster and recommendation, eligibility status, and any
required ontology-boundary expansion. The bundle binds the destination
workspace, current ontology-boundary revision, source/import/derivation
identities, candidate set, provider/model invocations used to recommend,
preview, and bundle hash.

When a candidate needs a new entity type, predicate, qualifier, or ontology
scope, it is boundary-blocked. Boundary revision and truth acceptance are two
separate human decisions. An approved boundary change accepts only the exact
new boundary; it invalidates affected candidate and preview hashes. The
resident must regenerate and the human must separately review the new bundle.

One authenticated human `accept as ontology truth` approval binds the exact
checked eligible assertion IDs and their hashes, conflict dispositions,
boundary revision, preview/bundle hashes, destination workspace, approval
actor, and rationale. It authorizes the executor to append the existing
ledger-required sequence for each selected item:

1. `assertion.proposed`, linked to an ingested evidence item; then
2. `assertion.accepted`, causally linked to that proposal and attributed to the
   same authenticated human who approved the bundle.

The resident executes the approved write but is never the acceptance actor.
Unchecked, rejected, deferred, blocked, review-only, stale, or out-of-bundle
candidates receive no accepted event. A single approval cannot expand the
ontology boundary or select a candidate that was not in its exact preview.

Conflicts do not have to block unrelated truth. The human may accept one
supported alternative and reject or defer the others. The accepted assertion
and every alternative's evidence and disposition remain auditable. Existing
accepted assertions are never overwritten or mutated; corrections and changed
interpretations create new evidence, proposals, acceptance/review history, and
explicit relationships under existing append-only contracts.

After an assertion bundle becomes terminal, the resident may generate a second
bundle of entity-resolution and relationship candidates supported exclusively
by accepted assertions. It recommends merges, distinctions, and relationships,
preserves ambiguous alternatives, and preselects nothing. A separate exact
authenticated human graph-bundle approval is required before any
`entity.resolved` or `relationship.accepted` event. Each graph event references
the exact accepted assertions supporting it. A missing, unaccepted, stale, or
mismatched assertion blocks the graph candidate.

Bundle construction and execution use immutable mounted derivative storage and
existing human-review/tool authority. If another resident reasoning invocation
is needed to consolidate or recommend, it uses the same active resident model
and the existing local/remote provider-transfer rules; this specification
creates no provider exception. Raw SSD bytes are never read.

Execution preflights the complete selected bundle before the first append and
revalidates approval, human actor, boundary, evidence, candidate hashes,
destination, and prior ledger state immediately before each event. Stable IDs
make proposal, acceptance, entity, and relationship writes idempotent. If a
proposal succeeds and its acceptance fails, the proposal remains append-only
history and the item becomes `proposal-only-recovery-needed`; resume may append
only the matching acceptance after revalidating the same exact approval.

Selected assertions terminate as `accepted`,
`proposal-only-recovery-needed`, or `stopped-safety-failure`. Bundles terminate
as `completed`, `completed-with-recovery-needed`, `denied`, `cancelled-before-
append`, or `stopped-safety-failure`. Ledger integrity failure, approval or
actor mismatch, stale evidence/boundary, or destination replacement stops new
writes immediately. Completed append-only writes are never rolled back.
Entity/relationship generation cannot begin while its source assertion bundle
is non-terminal or recovery-needed.

Every dossier, resident recommendation, preview, human decision, disposition,
append result, recovery state, and boundary supersession is immutable and
projection-rebuildable. The accepted graph must rebuild solely from canonical
ledger events and referenced evidence.

## Observable Acceptance Examples

- Three artifacts make the same assertion with identical meaning. The resident
  produces one candidate with all three evidence links. A fourth artifact with
  a different date or qualifier remains a distinct conflicting alternative.
- A conflict bundle shows each alternative, evidence for/against it, uncertainty,
  and a resident recommendation. All items remain unchecked. The human accepts
  one, rejects one, and defers one; only the accepted item receives proposed
  and accepted events, while all dispositions remain in the review record.
- A candidate using an unapproved predicate is boundary-blocked and cannot be
  checked. Approving the exact boundary revision appends no assertion. The old
  candidate becomes stale, and only a regenerated candidate under the new
  boundary can enter a later truth bundle.
- An approval for another workspace, boundary, candidate hash, evidence hash,
  preview, bundle, actor, or conflict disposition appends nothing. An agent
  approval or caller-supplied human actor is rejected.
- One exact human truth approval causes one `assertion.proposed` followed by one
  `assertion.accepted` per selected candidate. `acceptedBy` and event actor
  match the authenticated approving human; the proposal remains evidence-tied.
- Replaying or concurrently executing the approval produces no duplicate
  events. A simulated ledger failure after proposal leaves a recoverable
  proposal; resume with the same current approval appends only its acceptance.
- A changed/revoked authority, replaced destination, or stale evidence detected
  before acceptance stops the bundle and leaves the proposal unaccepted.
- Entity candidates reference only accepted assertions. An identity merge with
  conflicting support remains unselected and ambiguous. A separate graph
  approval appends only checked `entity.resolved` and
  `relationship.accepted` events.
- Rebuilding projections from a shuffled process restart and the canonical
  ledger reproduces the exact accepted assertions, resolved entities,
  relationships, approval attribution, and evidence provenance.
- Standard verification uses synthetic evidence, fake resident outputs, and
  fake human actors through authenticated fixtures. It never reads the SSD,
  calls a real provider, uses a credential, starts a live runtime, binds a
  socket, sends a PRR, publishes, or performs another external effect.

## Allowed Scope

- `packages/ontology-bootstrap/src/**` for evidence-linked candidate dossiers,
  strict equivalence/conflict/boundary status, immutable assertion and graph
  bundles, exact previews/hashes, and review dispositions.
- `packages/ontology-bootstrap/test/**` for consolidation, conflict,
  recommendation, selection, boundary invalidation, bundle hashing, and graph
  support tests.
- `packages/ontology/src/**` only for minimum idempotent bundle execution using
  existing `assertion.proposed`, `assertion.accepted`, `entity.resolved`, and
  `relationship.accepted` contracts, plus focused consume-time validation and
  projection tests. Do not weaken human-only assertion acceptance.
- `packages/agent/src/**` only for mounted resident dossier/recommendation flow,
  exact human tool requests, actor-bound assertion/graph execution, terminal
  recovery, and safe projection/read APIs.
- `packages/agent/test/**` for non-binding recommendation, no preselection,
  human authority, stale/mismatch rejection, partial recovery, idempotency, and
  resident/provider-boundary tests.
- `packages/local-runtime/src/**` only for authenticated mounted dossier
  readback, assertion/graph preview and decision routes, existing approval
  consumption, run/resume, and dependency wiring.
- `packages/local-runtime/test/**` for authenticated review, exact selection,
  actor, boundary, replay, partial recovery, graph gating, and no-external-
  effect tests.
- `packages/ingestion/src/read-api.ts` only if a minimal read-only evidence/
  derivative reference is required; no scan/import behavior may change.
- Do not modify source boundary/scan/import/redaction/OCR behavior, provider
  credentials or transfer policy, UI, PRR, legal, export, publication,
  destructive operations, or historical product-design material. Do not add a
  generic approval service or replace the append-only ledger.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/18-text-image-derivation-openplanter-extraction.md`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/ontology-bootstrap/src/dossier-builder.ts`
- `packages/ontology-bootstrap/src/tool-previews.ts`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/src/assertion-service.ts`
- `packages/ontology/src/graph-projection.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/projection.ts`
- `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice can append accepted ontology truth and durable graph structure.
Exact boundary revisions, assertion truth bundles, and entity/relationship
bundles remain separate authenticated human decisions. The resident may
recommend and execute only after approval; it never holds acceptance authority.

## Targeted Verification

- `npm test -- packages/ontology-bootstrap/test/candidate-consolidation.test.ts packages/ontology-bootstrap/test/assertion-review-bundles.test.ts packages/ontology-bootstrap/test/graph-review-bundles.test.ts`
- `npm test -- packages/ontology/test/assertion-service.test.ts packages/ontology/test/ontology-bundle-execution.test.ts packages/ontology/test/graph-projection.test.ts`
- `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/resident-ontology-bundle-acceptance.test.ts packages/agent/test/projection.test.ts`
- `npm test -- packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/resident-ontology-bundle-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves evidence-preserving
consolidation, explicit conflicts/recommendations, no preselection, separate
boundary/assertion/graph authority, exact human actor attribution, proposal-
then-accept execution, partial idempotent recovery, accepted-assertion-only
graph commits, and projection rebuildability with zero live/external effects.

## Integration Verification

Build only after Specification 18 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Live ontology
acceptance remains a separate human-gated action.

## Escalation Conditions

Escalate for automatic/preselected truth, resident or policy acceptance actor,
one approval changing both boundary and truth, acceptance without an evidence-
tied proposal, mutation/deletion of existing truth, graph events without
accepted assertions, changed event types or human-only acceptance invariant,
provider transfer outside existing authority, live ontology writes during
build, destructive/data-loss behavior, an unavailable required dependency, or
the same concrete failure surviving two focused repair attempts.
