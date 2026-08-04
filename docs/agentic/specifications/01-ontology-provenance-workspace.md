# Ontology Provenance Workspace

Status: implemented product-behavior reference.

## Desired Behavior

Cestus provides an investigator-facing Ontology module that exposes accepted
entities and relationships as a rebuildable view of the append-only ledger.
An investigator can select a graph item and answer why it exists: which
assertions support or contradict it, which evidence and events those
assertions reference, and which ontology-pack versions governed them. Proposed
or contested material is visibly distinct from accepted graph state.

## Observable Acceptance Examples

- Opening `Ontology` from the module rail renders runtime-derived ontology
  state rather than an unavailable module or hard-coded product fixture.
- Selecting a relationship displays its stable ID, type, review state,
  supporting and contradicting assertion IDs, evidence IDs, event references,
  and active pack versions.
- Replaying the same golden ledger yields the same ontology read DTO and UI.
- A proposed assertion never appears as an accepted graph edge before its
  explicit human review event.
- Projection lag, unknown events, and missing provenance render a safe
  diagnostic with a repair action; the UI does not invent graph state.
- The module is keyboard-operable and remains usable on a narrow viewport.

## Allowed Scope

- `packages/ontology/src/**` and `packages/ontology/test/**` for a missing or
  incomplete read boundary only; do not replace the ledger or graph projection.
- `packages/local-runtime/src/*ontology*`, the narrow ontology route wiring in
  `packages/local-runtime/src/http-handler.ts`, and their focused tests.
- `packages/ui/src/ontology/**`, `packages/ui/src/workspace/workspace-nav.ts`,
  the minimum `packages/ui/src/App.tsx` integration, and focused UI tests.
- No ingestion, PRR, agent-execution, provider, credential, or factory changes.

## Relevant Context Entry Points

- `AGENTS.md`
- `packages/ontology/src/graph-projection.ts`
- `packages/ontology/src/assertion-service.ts`
- `packages/ontology/src/evidence-service.ts`
- `packages/ontology/src/domain-packs.ts`
- `packages/ui/src/workspace/OpsShell.tsx`
- `packages/local-runtime/src/http-handler.ts`

## Risk Lane

Yellow. This adds an ordinary read-only product surface across bounded domain,
runtime, and UI boundaries without changing accepted-truth authority.

## Targeted Verification

- `npm test -- packages/ontology/test/graph-projection.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/domain-packs.test.ts`
- `npm test -- packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/ui/test/ontology-workspace.test.tsx`
- `npm run typecheck`

Success means all named tests and typechecking pass with no proposed assertion
rendered as accepted truth.

## Integration Verification

Run `npm run verify` against the latest `neo`. Compare only with
`docs/agentic/baselines/2026-08-01-integration-verification.md`; introduce no
new failure.

## Escalation Conditions

Escalate only if completion requires changing ontology truth semantics,
weakening provenance or replayability, defining a new ontology product model,
performing data loss or migration, adding an unavailable dependency, or the
same concrete failure survives two focused repair attempts.
