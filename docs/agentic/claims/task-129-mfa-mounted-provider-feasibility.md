# Task129-MFA: Mounted Provider Feasibility Authority

Status: ready-for-review

Branch: `codex/task129-mounted-provider-feasibility-authority-recovery`

Base: `2b81a542c6ea391bfb901443acfc04366bd4f3f5`

Task contract: Task 4 of
`docs/superpowers/plans/2026-07-16-mounted-provider-feasibility-authority-recovery-implementation.md`.

## Immutable Inputs

- Task137A released source: `cfb82c6dd940ae6ba0339b8b2b8637bcc472aea2`
  (`fix: distinguish Function evaluator bindings`), recorded by
  `docs/agentic/claims/task-137a-mounted-artifact-authority-operation.md`.
- Task136 v2 contract:
  `docs/agentic/contracts/task136-bounded-assurance-v2.json`, SHA-256
  `c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4`.
- Task137 authority policy begins at grammar/corpus v1 and this task owns the
  narrow v2 owner-map amendment only.

## Claimed Paths

1. `packages/agent/src/official-flow-feasibility.ts` (create)
2. `packages/agent/test/official-flow-feasibility.test.ts` (create)
3. `packages/ontology/src/contracts.ts` (modify)
4. `packages/ontology/test/agent-contracts.test.ts` (modify)
5. `packages/local-runtime/src/mounted-artifact-authority-operation.ts` (modify)
6. `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts` (modify)
7. `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts` (modify)
8. `packages/local-runtime/test/support/task137-authority-boundary-policy.ts` (modify)
9. `packages/local-runtime/src/mounted-official-flow-feasibility.ts` (create)
10. `packages/local-runtime/test/mounted-official-flow-feasibility.test.ts` (create)
11. `docs/agentic/claims/task-129-mfa-mounted-provider-feasibility.md` (create)

## Execution Authority

Task-scoped use of `superpowers:subagent-driven-development` and
`superpowers:test-driven-development` is explicitly approved for Task129-MFA.
This is the sole production writer. The work is limited to the claimed paths;
it performs no provider, network, credential, OAuth, external-service, live
Nous, Task139, registry, `neo`, push, reset, merge, or full-verify activity.

## Causal RED/GREEN Command

```bash
npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts
```

GREEN acceptance is exactly five files, 129 tests, and one
`TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The Task136 contract
mode markers are `29/1/20/29/1/15`.

## Recovery Handoff And Evidence

### Coordinator Type-Narrowing Reauthorization

- The coordinator reauthorized a bounded Task129-MFA type-only recovery on
  2026-07-16. The only additional writable paths are
  `packages/agent/test/official-flow-feasibility.test.ts`,
  `packages/local-runtime/src/mounted-official-flow-feasibility.ts`, and this
  claim; all remain among the original eleven owned paths.
- RED: `npm run typecheck` failed exactly with `TS2698` at classifier-test
  lines 50 and 73 because `codexInput()` exposed its posture properties as
  `unknown`, and `TS2322` at recorder line 104 because
  `normalizeLedgerRecords()` can return `undefined`.
- The repair gives only the local test fixture a precise posture shape and
  declares the existing recorder local as possibly undefined. The existing
  fail-closed `records === undefined` branch remains unchanged; runtime
  behavior and production unknown-boundary typing are unchanged.
- GREEN: `npm run typecheck` passed. The exact five-file Task129-MFA command
  passed 5 files and 129 tests with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.

- Predecessor `019f6c46-9917-7080-ab84-5dfa75b8d00c` stopped after the causal
  RED below: the implementation was correct, but the test compared its live
  result to a stale precomputed literal.
- Fresh recovery worker: `Codex Task129-MFA bounded recovery`, on
  `codex/task129-mounted-provider-feasibility-authority-recovery` in
  `/home/drake/.codex/worktrees/task129-mounted-provider-feasibility-authority-recovery`.
- RED (2026-07-16): the exact five-file command produced 128 passing tests and
  one failure in `reproduces the frozen mounted idempotency vector`; it emitted
  exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The
  stale literal was
  `sha256:2b43d55fc0cf8c9ca0e5d17776429aea14969f6d349d07671fc007a801ec23e9`;
  the issued fixture result was
  `sha256:78f70feee182a90eb7a99089fc6918f946959ae4bbd93b96d6d1dfc8814447ef`.
- The frozen classification hash remains
  `sha256:bdae51eff3aedbc86bdec0de666fde4019fc6f920ae23ba09ac06211fa9eb8b6`.
  The frozen mounted idempotency vector remains
  `sha256:91c31db4ab3a77ef41b43b0f9237c53cf0614ca861349ca98669af6dc5abaaca`.
- The recovery test imports and inspects the exact issued witness plus the
  current factory-issued mounted operation, constructs the live idempotency
  preimage in the design's fixed property order, SHA-256 hashes it, and
  requires `result.idempotencyKey` to equal that derived hash. This keeps the
  immutable abstract vector while proving runtime event-ID and admission
  bindings are live.
- GREEN (2026-07-16): the identical command passed 5 files and 129 tests with
  exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Bounded admission: `npm run typecheck`, `git diff --check`, and
  `npm run factory:check` passed; Task136 contract mode emitted exact markers
  `29/1/20/29/1/15`.
- All eleven owned paths are the only changed paths, `node_modules` is not a
  symlink, and no public package index or package export names the private
  inspection seams. Full `npm run verify` was intentionally not run.

## Review Repair Evidence

- Status: ready-for-review.
- Architecture/invariant reviewer `019f6c61-3f65-7980-a415-887f359a5282` and
  executability/adversarial reviewer `019f6c61-4341-7263-8bdb-043bf52c0394`
  returned `NEEDS-CHANGES` for candidate
  `62ea0bb703b296f1735ae5b754a5e4052ffcbf16`; coordinator dispatch
  `RV-1-E-613` verified all four findings against the frozen contract.
- Finding 1, noncanonical selected-field source lookalikes, is covered by
  `blocks mismatched or noncanonical checkpoint source evidence without
  appending`; it requires `persistence-unconfirmed` and zero appended
  feasibility records.
- Finding 2, feasibility causation provenance, is covered by `requires
  nonempty feasibility provenance with causation inside the source set`; an
  otherwise valid event whose causation is absent from `sourceEventIds` must
  fail the canonical ontology parser.
- Finding 3, concurrent duplicate disagreement, is covered by `fails closed
  when concurrent reread includes exact and conflicting same-key records`; it
  requires `record-conflict` with retry `none` and no reappend.
- Finding 4, secret-safe posture and correlation boundaries, is covered by
  `rejects unknown, credential, and raw cookie-header posture values`,
  `rejects secret-shaped provider feasibility material`, and `normalizes
  external invocation input and rejects raw cookie-header correlation
  material`.
- Causal RED used the exact five-file command from this claim. It reported
  `3 failed | 2 passed` files and `6 failed | 123 passed (129)` tests, with
  exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Final identical GREEN reported `5 passed (5)` files and `129 passed (129)`
  tests, with exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker.
- This forward repair remains within the original eleven-path cumulative
  scope; it changes seven owned paths and does not run `npm run verify`.

## Coordinator Admission Repair Evidence

- Starting point: clean exact reviewed-repair head
  `8936a6ee587b744ed2f1291a4080f793329a27a8`.
- Admission finding 1: global `eventContextSchema.correlationId` validation
  rejected harmless non-feasibility labels. The existing
  `agent.task.orchestration.claimed` test now proves
  `credential-migration` remains valid; only
  `agent.provider.feasibility.observed.v1` applies
  `secretSafeStringSchema` to correlation IDs. The existing feasibility
  cookie-header rejection remains covered.
- Admission finding 2: the fixed-count mounted concurrency test now proves
  both a single exact concurrent durable append recovers as `unavailable`
  with one feasibility event, and an exact-plus-differing same-key reread
  returns `record-conflict` with retry `none` and two events. Each phase
  asserts one append attempt and exactly one bounded reread after the initial
  source read.
- Causal RED used the exact five-file command and reported `1 failed | 4
  passed` files with `1 failed | 128 passed (129)` tests, plus exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Final identical GREEN reported `5 passed (5)` files, `129 passed (129)`
  tests, and exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker.
- Status: ready-for-review. This admission repair changes only four owned
  paths, retains the original eleven-path cumulative scope, and does not run
  `npm run verify`.

## Final Normalization Repair Evidence

- Starting point: clean exact reviewed-repair head
  `bdc157ada7ff51fd9fcb7b8094fda6579b9b712b`. Reviewer provenance retained in
  this claim: architecture/invariant reviewer
  `019f6c61-3f65-7980-a415-887f359a5282` and executability/adversarial reviewer
  `019f6c61-4341-7263-8bdb-043bf52c0394`. This follow-on repair addresses the
  fresh pre-await normalization defects reported to the worker.
- The existing invocation-normalization test now instruments `readAll` and
  `append` after fixture setup. It requires each hostile input to return the
  exact `unsafe-input`/`none` blocked tuple with zero reads and appends:
  accessor-backed input, `Cookie: session=abc`, `X-Credential: raw`,
  `oauth=raw`, and timezone-less `2026-07-16T00:00:00`.
- Causal RED (2026-07-16): the exact five-file command reported one failing
  test and 128 passing tests (129 total), with nine soft assertion failures:
  the missing `credential`/`oauth` terms and noncanonical timestamp each
  reached ledger read/append work and returned `persistence-unconfirmed`.
  It emitted exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker.
- Repair: recorder correlation filtering now includes the ontology feasibility
  event's `oauth` and `credential` terms while retaining its existing
  cookie/header and secret checks. `occurredAt` now uses
  `eventContextSchema.shape.occurredAt.safeParse`, so recorder normalization
  shares the canonical ontology datetime parser.
- GREEN (2026-07-16): the identical five-file command passed 5 files and 129
  tests with exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker.
- Bounded admission passed: `npm run typecheck`, `git diff --check`, and
  `npm run factory:check`. Task136 contract mode emitted exact markers
  `29/1/20/29/1/15`; cumulative scope remains the original eleven paths; and
  no public index or package export exposes the recorder or private inspection
  seam. Full `npm run verify` was intentionally not run.
- Status: ready-for-review.

## Type-Only Recovery Evidence

- Predecessor stop: worker `019f6c8b-5a80-7710-951c-ae5d4cb96f1c` left the
  intended hostile-boundary repair uncommitted at exact base
  `c4b656f56fdc56bec0528d860ed2b1874bb28437`. This recovery preserves those
  six modified source/test paths; no reset, revert, amend, merge, or external
  activity was performed.
- Recovery identity: `Codex Task129-MFA fresh type-only recovery worker` on
  `codex/task129-mounted-provider-feasibility-authority-recovery` in
  `/home/drake/.codex/worktrees/task129-mounted-provider-feasibility-authority-recovery`.
- Causal RED (2026-07-16): `npm run typecheck` failed only with `TS2322` at
  `packages/local-runtime/test/mounted-official-flow-feasibility.test.ts:371`.
  The generic `AppendableKnowledgeEvent` callback constructed a conflicting
  payload containing feasibility-only `classificationHash` before narrowing
  `event.type`.
- Repair: the conflicting concurrency callback now guards
  `event.type === "agent.provider.feasibility.observed.v1"` before constructing
  the conflicting feasibility payload. No production code or runtime behavior
  changed, and no broad type assertion was introduced.
- GREEN (2026-07-16): `npm run typecheck` passed. The exact five-file command
  passed `5` files and `129` tests, with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker.
- Final bounded gates (2026-07-16): `git diff --check` passed;
  `npm run factory:check` reported `factory-readiness passed`; and Task136
  contract mode emitted the exact `29/1/20/29/1/15` markers. The cumulative
  change set is within the original eleven Task129-MFA paths, private package
  indexes and exports do not expose the recorder or inspection seam, and
  `node_modules` is not a symlink.
- Status: ready-for-review. Full `npm run verify` was intentionally not run
  under the bounded recovery authorization.

## Final Fail-Closed Repair Evidence

- Starting point: clean reviewed candidate
  `525f5602dc2aeb755c2a5fb3e368b4cb56012db2` with parent
  `c4b656f56fdc56bec0528d860ed2b1874bb28437`.
- Causal RED (2026-07-16) used the exact five-file command in this claim and
  reported `3 failed | 2 passed (5)` files and `4 failed | 125 passed (129)`
  tests, with exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker. The failures were the unguarded `isConcurrencyConflict` call on a
  throwing-prototype append rejection, acceptance of raw-key-like classifier
  metadata, and feasibility-only rejection of harmless bounded identifiers.
- Repair: the append catch now checks mounted currentness first, catches a
  hostile concurrency classification locally, and returns
  `persistence-unconfirmed` without a reread, reappend, loop, or raw error.
  The classifier, feasibility event payload, and recorder retain the prior
  coarse rejection of API-key, authorization, bearer, token, secret, password,
  private-key, cookie/header, and session material while adding bounded OAuth
  or credential assignments and raw-key-like ID fragments. The feasibility
  schema uses that same bounded predicate for its payload and correlation ID;
  `subscription-oauth`, `oauth-capability-review`,
  `codex-credential-migration`,
  `agent_credref_subscription_oauth_reference`, and the non-feasibility
  `credential-migration` control remain valid.
- Causal GREEN (2026-07-16) reran the identical command and reported
  `5 passed (5)` files and `129 passed (129)` tests, with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The runner emitted
  its pre-existing missing TypeScript source-map warning, but exited `0`.
- `npm run typecheck` passed. Full `npm run verify` remains intentionally
  unrun under this bounded authorization.

## Finite Cross-Layer Boundary Repair Evidence

- Starting point: clean exact reviewed-repair head
  `ab33c40f408e4234cbfedfa7e37d90bdfbf92a86`, with every prior forward
  repair preserved.
- Causal RED (2026-07-16) used the exact five-file command in this claim and
  reported `3 failed | 2 passed (5)` files and `3 failed | 126 passed (129)`
  tests, with exactly one
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The existing
  classifier, ontology, and mounted-recorder test blocks proved that prefixed
  raw cookie/session values and `auth=raw` reached boundaries that should
  reject them; the ontology feasibility scope also accepted `sk_live_abc`.
- Repair: the three provider-feasibility predicates add bounded prefixed
  cookie/session and auth-assignment rejection while preserving all earlier
  coarse secret rejection and safe OAuth/credential controls. Ontology
  feasibility `capabilityScopes` now uses the same provider-feasibility
  secret-safe schema as issued classification and mounted recording.
- Ordering correction: the initial repair prompt repeated the reviewer's
  reversed U+E000/U+10000 expectation. The coordinator clarified that the
  approved design governs: numeric Unicode code-point order places U+E000
  (`57344`) before U+10000 (`65536`). The explicit locale-independent
  comparator compares numeric `codePointAt(0)` sequences directly; the causal
  vector now requires `harness-execution`, U+E000, U+10000 and the deterministic
  hash
  `sha256:45f50b8363698ece659914d4ea6f4fa7d6f7abaa6ecde090ff4707bd64d57f18`.
- Final identical GREEN (2026-07-16) reported `5 passed (5)` files and
  `129 passed (129)` tests with the fixed `16/70/17/4/22` allocation and
  exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20` marker. The
  runner emitted its pre-existing missing TypeScript source-map warning but
  exited `0`.
- Bounded gates passed: `npm run typecheck`, `git diff --check`, and
  `npm run factory:check`; Task136 contract mode emitted exact markers
  `29/1/20/29/1/15`. Cumulative scope remains the original eleven Task129-MFA
  paths, private seams remain unindexed, and `node_modules` is not a symlink.
  Full `npm run verify` was intentionally not run.
