# Task 123 Ingestion Staged-Report Reader Claim

Plan: `docs/superpowers/plans/2026-07-12-resident-agent-durable-handoffs-implementation.md`
Frozen authority: `docs/agentic/resident-agent-full-vision-contract-freeze.md` W1-123 recovery prerequisite
Task: ingestion-owned canonical staged-report artifact reader required before the rejected ontology-bootstrap handoff repair can resume
Worker: `/root/task123_ingestion_reader`
Branch: `codex/task-123-ingestion-staged-report-reader`
Worktree: `/home/drake/.codex/worktrees/task-123-ingestion-staged-report-reader`
Base: `91604fcccdb2eadcb9d13f69c9fd1eff4caf0180`
Claimed-at: `2026-07-14T14:02:25Z`
Status: `in-progress`

## Exclusive Files

- `packages/ingestion/src/legacy-report.ts`
- `packages/ingestion/test/legacy-report.test.ts`
- this append-only claim

## Authorization And Boundary

- Coordinator-authorized prerequisite for Task 123 after fresh review found that ontology bootstrap accepted caller-supplied report material without an ingestion-owned canonical report-event and derivative-store readback.
- Export one canonical, side-effect-free reader from `legacy-report.ts`. It must read report bytes only from the supplied derivative store, prove the exact `legacy.import.report.generated` ledger event, source/scan/report identity, report hash, candidate-set hash, and strict canonical own-data artifact shape before returning a report.
- It may read the ledger and derivative store only. It must not append, write any store, invoke a runtime/provider/tool/graph path, accept caller-supplied report bytes, or change Task 123 workflow files.
- Initial causal RED coverage includes forged bytes, hash, report-event, identity, accessor-bearing readback, and malformed/extra artifact shapes, with no append or store-write effects.
- `superpowers:subagent-driven-development` is approved where relevant. TDD, verification-before-completion, fresh independent review, no self-integration, and no `neo` merge are mandatory.
- The coordinator alone may grant the serialized `npm run verify` gate. This worker must not start it.

## Required Evidence

- RED/GREEN: `npm test -- packages/ingestion/test/legacy-report.test.ts`.
- Before candidate commit: `git diff --check`, `npm run typecheck`, and `npm run factory:check`.
- Stop after a scoped candidate commit for fresh independent review; do not self-integrate.
