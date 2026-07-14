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

## Three-P1 Canonical-Authority Follow-up

- Fresh defects-first review rejected the prior candidate because the exported
  workflow still accepted omitted canonical identity and caller report bytes,
  run start provenance did not bind the exact generated-report event plus both
  report hashes, and production lifecycle readback did not enforce exact
  final-output -> prepared -> recorded -> terminal correlations.
- RED was observed in
  `packages/agent/test/ontology-bootstrap-workflow.test.ts`: omitted reader
  identity returned `ok: true`; a run with a different source event and only a
  candidate-set hash returned `ok: true`; and a faulting ledger that changed
  the terminal correlation returned `ok: true`.
- GREEN makes `stagedReport`, `reportEventId`, and the derivative store
  mandatory public workflow inputs. The workflow reads bytes only through the
  ingestion-owned canonical reader, validates the run's exact source event and
  both canonical report/candidate hashes before effects, persists every
  successful path through the durable handoff kernel, and rereads exact actor,
  correlation, event-type, causation, and order bindings. The route starts or
  reuses only a run with the same canonical provenance.
- Latest non-full verification: `npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  exited `0` (3 files, 50 tests); `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` exited `0`. No candidate full verifier, integration,
  self-integration, or `neo` change is authorized. The temporary untracked
  `node_modules` symlink must be removed before the sealed candidate commit.
