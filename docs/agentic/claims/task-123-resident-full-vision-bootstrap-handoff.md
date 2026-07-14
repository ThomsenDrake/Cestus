# Task 123 Ontology Bootstrap Canonical Handoff Recovery Claim

Plan: `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
Frozen authority: W1-123 canonical staged-report reader recovery
Task: resume the rejected ontology-bootstrap handoff slice only on the public ingestion reader
Worker: Relay A coordinator-owned bounded recovery
Base: `e7a1d5b6`
Status: `ready-for-review`

## Exclusive Files

- `packages/agent/src/ontology-bootstrap-workflow.ts`
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`
- `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
- this claim

## Boundary

- The workflow reads the report only through public
  `readCanonicalStagedLegacyReport`; caller-provided report bytes are not used
  as bootstrap material.
- The route derives the exact generated-report event from the mounted ledger
  and supplies the mounted derivative capability.
- A successful run persists and rereads the exact final-output -> prepared ->
  recorded -> terminal lifecycle via the shared handoff kernel. Forged staged
  report identity fails before bootstrap effects.
- Rejected `404ac711` was inspected only as read-only conceptual evidence; it
  was not cherry-picked, merged, or copied wholesale. No full verifier,
  self-integration, reviewer dispatch, or `neo` change is authorized here.

## RED/GREEN Evidence

- Initial focused RED:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts -t 'fails closed before bootstrap effects for a forged canonical report-event binding|binds the exact final-output to prepared, recorded, and terminal lifecycle chain'`
  exited `1`: forged report-event input returned `ok: true`, and the lifecycle
  contained only the dossier step.
- Focused GREEN:
  `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `0` with 2 files and 13 tests passing. The retained counterfactuals
  prove fail-closed forged event binding, exact actor/correlation/event-type/
  causation chain, and ordered terminal readback.
- `npm run typecheck`, `git diff --check`, and `npm run factory:check` exited
  `0`. The temporary untracked dependency symlink used to execute focused
  gates was removed before this claim/candidate is committed.
