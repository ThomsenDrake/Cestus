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

## Third Fresh-Review Root-Cause Repair — 2026-07-14

- Worker: `/root/task123_ingestion_reader_species_root_cause`
- Branch: `codex/task-123-ingestion-staged-report-byte-copy-root-cause`
- Worktree: `/home/drake/.codex/worktrees/task-123-ingestion-staged-report-byte-copy-root-cause`
- Base: `f5f53dd65deb7e2f5396f4494b82600610a171ab`
- Status: `in-progress`
- Fresh review found that `Uint8Array.prototype.slice.call(artifact)` performs
  TypedArray species construction and can invoke an own `constructor` getter
  or a prototype-provided `constructor[Symbol.species]` hook while
  `Buffer.isBuffer(artifact)` remains true. This repair replaces the byte-copy
  primitive after focused causal RED evidence; it does not widen the dynamic
  property blacklist.

## Third Fresh-Review Dependency Blocker — 2026-07-14

- The required RED command, `npm test -- packages/ingestion/test/legacy-report.test.ts`, exited `127` before Vitest test discovery because this isolated clean worktree has no `vitest` executable (`sh: 1: vitest: command not found`).
- The two new causal tests remain uncommitted and have not produced valid RED
  evidence yet. No production change has been made.
- Status: `blocked` pending coordinator-authorized dependency recovery.

## Third Fresh-Review RED Evidence — 2026-07-14

- The coordinator authorized `npm ci --ignore-scripts` only in this isolated
  worktree. It completed with no tracked manifest or lockfile delta.
- After recovery, `npm test -- packages/ingestion/test/legacy-report.test.ts`
  exited `1`: 19 tests passed and 2 new causal tests failed. An own throwing
  `constructor` getter and a prototype `constructor[Symbol.species]` getter
  each ran before the reader returned its existing artifact-mismatch result.
- The direct counterfactual confirmed the root cause: the old
  `Uint8Array.prototype.slice.call(artifact)` dispatches TypedArray species.
  `Uint8Array.prototype.values.call(artifact)` followed by copying its native
  iterator values does not invoke either hook.
- Status: `in-progress`.

## Third Fresh-Review GREEN Evidence — 2026-07-14

- The reader now requires the genuine Buffer's direct native prototype and a
  complete own-data byte-index shape before extraction. It copies only values
  yielded by `Uint8Array.prototype.values.call(artifact)` into a fresh Buffer,
  so it uses typed-array internal slots without TypedArray species dispatch or
  dynamic artifact property reads.
- `npm test -- packages/ingestion/test/legacy-report.test.ts` exited `0` with
  1 file and 21 tests passing. The exact existing report-event/artifact/hash/
  identity bindings and no-append/no-write tests remain intact; both new own-
  constructor and prototype-species counterfactuals fail closed with zero
  hostile invocation.
- Pre-commit gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; `npm run factory:check` exited `0` (`factory-readiness passed`). The
  coordinator-controlled full verifier was not run.
- Status: `ready-for-review` pending a distinct fresh reviewer.

## Fourth Fresh-Review Ordering Repair — 2026-07-14

- Base candidate: `2e08dffd42168ae860773a7b1ace28506f73402b`.
- Fresh review P1 found that the pre-brand `Buffer.isBuffer(artifact)` check
  may traverse hostile Proxy shape before the intrinsic TypedArray validator
  gets a chance to reject it. This bounded repair makes the native values
  iterator the first protected operation, then validates only a successfully
  branded real Buffer's direct prototype and canonical own-data byte indices.
- Status: `in-progress`.

## Fourth Fresh-Review RED Evidence — 2026-07-14

- `npm test -- packages/ingestion/test/legacy-report.test.ts` exited `1` with
  21 tests passing and 3 new causal tests failing. The pre-brand
  `Buffer.isBuffer` check invoked `getPrototypeOf` on both a Proxy-wrapped
  Buffer and a Buffer with a proxied direct prototype; after that check, the
  current own-key inspection invoked `ownKeys` on a Proxy-wrapped Buffer.
- The required result remains the standard
  `LEGACY_STAGED_REPORT_ARTIFACT_MISMATCH` with zero traps. The root-cause
  evidence establishes that the native TypedArray values iterator is the only
  safe first brand check for this boundary.

## Fourth Fresh-Review GREEN Evidence — 2026-07-14

- `copyCanonicalArtifactBytes` no longer calls `Buffer.isBuffer` or any
  `instanceof`-style pre-brand check. Its first protected operation is
  `Uint8Array.prototype.values.call(artifact)`; the retained native iterator
  supplies the eventual copy only after direct-prototype and own-byte-shape
  validation succeeds.
- `npm test -- packages/ingestion/test/legacy-report.test.ts` exited `0` with
  1 file and 24 tests passing. The three new Proxy counterfactuals return the
  standard artifact mismatch and record zero `getPrototypeOf` or `ownKeys`
  trap calls; all prior event/artifact/hash/identity and no-side-effect tests
  remain green.
- Pre-commit gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; `npm run factory:check` exited `0` (`factory-readiness passed`). No
  coordinator-controlled full verifier was run.
- Status: `ready-for-review` pending a fresh reviewer distinct from the prior
  reviewer.

## Target-Checkout Typecheck Recovery — 2026-07-14

- Worker: `/root/task123_ingestion_reader_typecheck_recovery`
- Branch: `codex/task-123-ingestion-reader-typecheck-recovery`
- Worktree: `/home/drake/.codex/worktrees/task-123-ingestion-reader-typecheck-recovery`
- Base: `f7ad54f207826e19eb554a13401b380c3715195d`, a forward descendant of
  the preserved failed merge `c3a4c76106ce932c0a63c1cc663ab24960d3d689`.
- Scope remains exactly this claim, `packages/ingestion/src/legacy-report.ts`,
  and `packages/ingestion/test/legacy-report.test.ts`. The prior candidate's
  reported typecheck/full-verifier result remains non-authoritative discrepancy
  evidence; it is not overwritten or treated as merged-checkout verification.

### Dependency Recovery And Target RED

- Before coordinator-authorized dependency recovery, `npm run typecheck` could
  not start because `tsc` was absent. The coordinator authorized only
  `npm ci --ignore-scripts` in this isolated worktree; it completed without a
  tracked manifest or lockfile delta.
- The resulting target-checkout `npm run typecheck` exited `1` with the C-059
  diagnostics: Zod's regex-valid staged-report `reportHash` remained typed as
  `string` for the typed `Object.freeze` reference; the untyped capability
  callback selected the `Function` overload and left `contentHash` implicit
  `any`; `Reflect.ownKeys(artifact)` received post-intrinsic `unknown`; and
  reader fixtures supplied excess `readStream`, `append`, and `put` members to
  the intentionally narrowed `readAll`/`get` capabilities (including the
  former implicit `readStream` callback parameter).

### Scoped Green

- Test-first fixture repair passes only the declared read-only `readAll` and
  `get` capabilities. The 24 existing causal runtime tests remain present,
  including forged event/artifact bindings, hostile accessors, direct
  prototype/species rejection, and zero-invocation Proxy traps.
- The source change preserves the exact runtime regex and artifact validation
  sequence while carrying the validated content-hash type through the frozen
  reference, retaining distinct typed capability callbacks, and narrowing the
  artifact to a non-null object only after the native typed-array intrinsic has
  succeeded and before reflection.
- Focused GREEN: `npm test -- packages/ingestion/test/legacy-report.test.ts`
  exited `0` with 1 file and 24 tests passing.
- Target typecheck GREEN: `npm run typecheck` exited `0` with `typecheck
  passed`.
- No `npm run verify`, merge, `neo` change, or self-review/integration was
  started. Status: `ready-for-review` pending a fresh independent review.
