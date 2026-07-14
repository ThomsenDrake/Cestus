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

## RED Evidence — 2026-07-14

- After the coordinator-authorized isolated `npm ci --ignore-scripts` recovery,
  `npm test -- packages/ingestion/test/legacy-report.test.ts` exited `1` with
  4 existing tests passing and 9 new causal counterfactuals failing because
  `readCanonicalStagedLegacyReport` did not exist. The failing cases cover
  forged event/hash/source/scan/report identity, forged stored bytes,
  accessor-bearing ledger readback, and an extra malformed artifact field.
- The initial missing-`vitest` result was an unavailable local dependency,
  recovered without tracked dependency or lockfile changes under the
  coordinator's scoped authorization.

## GREEN Evidence — 2026-07-14

- The focused command now exits `0`: 1 file and 13 tests pass. The reader
  accepts only a ledger-bound canonical derivative artifact, returns no raw
  permissive decode, rejects every RED counterfactual, and proves no append or
  derivative write occurs on the successful read.
- `npm run typecheck`, `git diff --check`, and `npm run factory:check` each
  exit `0` in this worktree.
- The serialized full verifier was intentionally not started; it remains a
  coordinator-controlled later gate. Candidate is ready for fresh independent
  review and must not self-integrate or merge `neo`.

Status: `ready-for-review`

## Fresh-Review Repair — 2026-07-14

- The first fresh review returned NEEDS-CHANGES because the reader did not bind
  `generatedAt`, `generator`, and every total from the
  `legacy.import.report.generated` event to reconstructed canonical report
  bytes, and because an own `Buffer.toString` accessor could execute before
  rejection.
- Repair RED: the focused command exited `1` with 13 passing and 4 failing
  tests. Three forged valid ledger events changed one of generated-at,
  generator, or totals while retaining the canonical artifact; a hostile real
  Buffer owned a throwing `toString` accessor. The prior reader accepted the
  forged events and invoked the hostile accessor.
- Repair GREEN: reconstruct-and-compare now binds every event-declared report
  field, including all totals, and the byte path rejects an own `toString`
  descriptor before copying into an independent Buffer for decoding. The
  focused command exits `0` with 17 passing tests and proves the hostile
  accessor is never read.
- A distinct fresh review remains required after the repair commit. No full
  verifier is authorized or started.

## Second Fresh-Review Repair — 2026-07-14

- The second fresh review found that `Buffer.from` can consult hostile own
  `valueOf` or `length` accessors despite the existing `toString` descriptor
  guard. The byte-extraction boundary therefore needed an internal-slot copy,
  not another dynamic Buffer helper.
- Repair RED: the focused command exited `1` with 17 passing and 2 failing
  tests. Real Buffers with own throwing `valueOf` and `length` accessors both
  produced a fail-closed result only after invoking the accessor.
- Repair GREEN: the reader now rejects own `toString`, `valueOf`, and `length`
  descriptors before a `Uint8Array.prototype.slice.call` internal-slot copy.
  The focused command exits `0` with 19 passing tests and proves no hostile
  accessor executes. A third distinct fresh review is required; no full gate
  is authorized or started.
