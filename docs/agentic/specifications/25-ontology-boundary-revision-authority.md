# Ontology-Boundary Revision Authority

> **Development authority:** This is a non-authoritative product-requirement
> source. Historical status, execution, role, risk, repair, review, integration,
> and verification text below does not govern current work. Follow \`AGENTS.md\`,
> Compound Engineering, and \`SECURITY.md\`.

Status: approved.

## Desired Behavior

Cestus defines the versioned schema boundary governing later assertion,
entity, and relationship acceptance. The resident may request a change, but
only an authenticated human may approve, reject, or supersede a revision. This
slice creates no factual ontology truth, evidence, entity, or relationship.

V1 acceptance is closed-world. Only definitions in the current approved
boundary may be accepted. New entity types, predicates, scalar ranges,
identity rules, or relationship types require a new boundary first.
Specification 24 may create provisional out-of-boundary candidates, but they
remain review-only. There is no implicit default, model extension, or combined
`accept and add schema` shortcut.

Each canonical snapshot contains boundary schema/workspace/revision/parent;
namespace mappings; entity types and acyclic inheritance; scalar predicates,
subject types, data type or enum, cardinality, and requirement state;
relationship types, direction/symmetry/inverse, source/target types, and
cardinalities; deterministic entity identity-key sets; merge/incompatibility
constraints; evidence/provenance minimums; review/conflict restrictions; and a
canonical hash.

Rules are declarative only. They contain no executable code, query, script,
network reference, dynamic validator, provider call, or model prompt. V1
performs no inferred transitive/inverse fact creation; declarations constrain
validation only.

Every namespace/type/predicate/relationship/enum member has one stable
namespaced ID and secret-safe label. An ID cannot be reused with different
meaning. Namespace mappings become immutable once referenced; changing a URI
requires a new prefix. Limits are 1 MiB canonical snapshot, 64 namespaces, 512
entity types, 2,048 scalar predicates, 2,048 relationship types, 1,024 enum
members per predicate, 16 identity-key alternatives per type, and inheritance
depth 16. Cycles, dangling references, contradictory cardinalities, impossible
identity rules, and ambiguous inverses fail.

The resident may construct and request append of
`ontology.boundary.change.requested`, but append requires an authenticated
human's explicit one-use approval of that exact request. The append approval
binds current parent revision/hash, complete request/proposal/diff/impact hashes,
supporting references, resident invocation, and human actor. It cannot approve
the proposed boundary revision or any truth. Consume time revalidates the
unchanged current parent and exact request; stale or edited requests append
nothing. The approval and requested event commit atomically, with the human as
approval actor and resident/service as non-authoritative executor metadata.

The requested event grants no authority and changes no projection. It binds current parent revision/hash,
complete proposed snapshot/hash, canonical diff, supporting candidate/evidence
references, rationale/alternatives, compatibility/impact analysis, and
requester model/invocation and consumed human append approval. Identical requests are idempotent; conflicting ID
reuse fails. Secret-bearing, ungrounded, invalid, or stale-parent requests do
not append. The resident may recommend but cannot decide.

The human preview shows complete definition additions/changes/removals,
identity/merge changes, parent/proposal hashes, every affected accepted
assertion/entity/relationship, impact counts, items becoming
`legacy-out-of-boundary`, provisional candidates enabled/disabled, and exact
request/impact-set hashes. Human edits create a new snapshot, request, diff,
and preview; prior approval cannot apply.

An authenticated human may reject, approve, create a different request, or
approve a later rollback revision. Decision is one compare-and-append against
current boundary head, complete graph projection identity, proposal hash, and
impact-set hash. Concurrent truth or boundary change makes it stale before an
approval event.

The first approved revision has no parent. Each later approval names exactly
the current head. Human-authored `ontology.boundary.revision.approved` includes
the complete canonical snapshot, not only a blob reference. Rejection is
terminal for its request. Identical approval replay is idempotent; conflicts
fail. Branches are not auto-merged. Current boundary derives from replay of the
approved chain; no separate mutable pointer exists. Old revisions cannot be
edited or deleted.

Rollback is a new human-approved child reproducing desired earlier rules. It
never moves a pointer backward or deletes history. A breaking revision
enumerates every impacted accepted graph item. Historical graph events remain
immutable/queryable. Nonconforming items become deterministic
`legacy-out-of-boundary`, excluded from the current conforming graph but kept
in historical/audit projections. They are not grandfathered, deleted, or
rewritten. A later compatible boundary can restore conformance by projection.

Specifications 26 and 27 bind current boundary revision/hash, approval event,
used definition IDs, graph projection identity, and candidate/bundle. Their
final append conditionally confirms the boundary is current and definitions
are identical. Staleness creates no proposal, acceptance, entity, or
relationship event.

Boundary changes cannot alter evidence, approvals, governance tags, PRR,
legal, export, publication, secret policy, or source boundaries. Schema
approval is not factual truth approval. Model confidence cannot satisfy it.
Human actor identity is preserved, and projections rebuild from append-only
events alone.

## Observable Acceptance Examples

- A resident request for a valid exact child revision remains a preview until a
  human explicitly approves appending that exact request. The atomic append
  creates one non-authoritative request and leaves current boundary/graph
  unchanged. Resident approval, stale approval, edit, or replay expansion
  appends nothing.
- A human approves the first complete snapshot; only its closed-world IDs
  become eligible for later acceptance.
- Editing one label/rule after preview changes proposal/hash and invalidates the
  prior decision. Concurrent boundary or truth append similarly makes the
  impact preview stale.
- Duplicate IDs with different meaning, namespace remap, cycles, dangling
  references, impossible cardinalities/identity rules, excessive depth/count/
  bytes, or executable/dynamic rules fail before request/approval.
- Removing a used predicate lists every impacted item and, after exact human
  approval, marks them `legacy-out-of-boundary` in current projection while
  preserving historical events.
- Rollback appends a new child revision and never rewrites the head/history.
  Re-enabled compatible rules restore projection conformance deterministically.
- Rebuilding only from ledger events reproduces current boundary, complete
  chain, impact status, and historical graph.
- Fake later commits with stale revision/hash/definitions/projection fail
  atomically without proposal/truth/graph events.
- Standard verification uses synthetic schemas, candidates, and ledgers. It
  performs no provider/model call, credential access, evidence mutation, live
  socket, PRR, publication, or truth creation.

## Allowed Scope

- `packages/ontology/src/contracts.ts`, boundary service/projection/read models,
  and focused tests for canonical declarative schemas, request/decision events,
  revision chains, impact/conformance, and consume-time capabilities.
- `packages/ontology-bootstrap/src/**` only for boundary request/preview
  artifacts sourced from provisional candidate bundles; no truth acceptance.
- `packages/ontology-bootstrap/test/**` for request grounding, edit invalidation,
  recommendation non-authority, and safe previews.
- `packages/agent/src/**` only for resident boundary request construction,
  recommendation, exact human preview/decision forwarding, and safe status.
- `packages/agent/test/**` for actor authority, request deduplication, stale
  preview, and forbidden combined schema/truth actions.
- `packages/local-runtime/src/**` only for authenticated boundary review/
  decision routes and current/historical read projections.
- `packages/local-runtime/test/**` for human actor, concurrency, rollback,
  rebuild, and zero-external-effect tests.
- Do not modify assertion/entity/relationship acceptance, evidence/source/
  import/redaction/OCR behavior, provider credentials, governance/export/PRR/
  legal/publication behavior, UI, or destructive operations.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/24-resident-multimodal-candidate-extraction.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/src/event-ledger.ts`
- `packages/ontology/src/graph-projection.ts`
- `packages/ontology/src/ontology-workspace-read.ts`
- `packages/ontology-bootstrap/src/contracts.ts`
- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/local-runtime/src/runtime-factory.ts`

## Risk Lane

Red. This slice governs which schema can authorize later ontology truth.
Boundary approval/rejection/rollback remains an authenticated human action;
build verification uses only synthetic events and creates no truth.

## Targeted Verification

- `npm test -- packages/ontology/test/ontology-boundary-contracts.test.ts packages/ontology/test/ontology-boundary-service.test.ts packages/ontology/test/ontology-boundary-projection.test.ts packages/ontology/test/ontology-boundary-impact.test.ts`
- `npm test -- packages/ontology-bootstrap/test/boundary-change-request.test.ts`
- `npm test -- packages/agent/test/ontology-boundary-review.test.ts`
- `npm test -- packages/local-runtime/test/ontology-boundary-routes.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Success means every command exits zero and proves closed-world declarative
schema, resident request/human-only approval, immutable canonical revision
chain, complete stale/impact fences, rollback-as-new-revision,
legacy-out-of-boundary projection, ledger-only rebuildability, and zero truth/
external effects.

## Integration Verification

Build only after Specification 24 is integrated. Update the candidate normally
against latest `neo`, obtain a fresh Sol `ship` verdict on the final diff, then
run `npm run verify` once on the final merged candidate. Compare with the
current recorded baseline and latest `neo` CI; reject any new or worsened
failure. Integrate with normal Git history, push only configured `origin`,
observe CI, do not open a pull request, and do not force-push. Real boundary
approval/rejection/rollback remains a separately human-gated action.

## Escalation Conditions

Escalate for open-world acceptance, executable/inferred rules, agent boundary
approval, combined schema/truth approval, changed caps, mutable/deleted
history, pointer rollback, silent grandfather/delete of impacted truth,
non-ledger boundary authority, live provider/credential/truth effect during
build, unavailable required conditional-append capability, or the same
concrete failure surviving two focused repair attempts.
