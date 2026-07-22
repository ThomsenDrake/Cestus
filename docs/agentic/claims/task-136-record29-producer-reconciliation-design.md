# Task136 Record-29 Producer Reconciliation Design Claim

Status: awaiting exact written-design owner review

Design:
`docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`

Task: documentation-only Level-2 design freeze

Branch: `codex/resident-agent-full-vision-program-watchdog-recovery`

Worker: Codex program coordinator

Exact amended-design dispatch base:
`6b2812683479c90f93e370b30baa9a76315b0d65`

Preserved Task136 checkpoint:
`72e1ee6624c582218995e3e075e2303998811834`

Owned files:

- `docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`
- `docs/agentic/claims/task-136-record29-producer-reconciliation-design.md`

Authority:

- Program registry: `docs/agentic/resident-agent-full-vision-program-registry.md`
- Original Approach-1 authorization: `RV-1-E-931`
- Superseding seven-seam amendment: `RV-1-E-932`
- The program owner approved preserving all 29 cards and applying a finite,
  source-specific producer correction directly to Task136 as strict record 29.
- RV-1-E-932 requires every later implementation authorization to state
  exactly: “Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.”
- This documentation claim does not itself authorize implementation.

Bounded design result:

- The V4 graph retains the exact 29 IDs/order and raw strict records 1-28.
- Exactly 22 released source/test paths transfer from T120-R, C136-P, G136-SC,
  G136-R, Task137B-W, CF1-HR, and Task136-FC-Ports to Task136.
- The previously unowned
  `packages/agent/src/domain-execution-dispatcher.ts` is adopted directly by
  Task136 from exact G136-SC candidate/integration/current baseline blob
  `96b0ade273696b9ffcf497119f1943f128821a58`; no historical G136-SC source
  ownership is invented.
- Task136 gains direct CF1-HR and G136-SC prerequisites and becomes the final
  owner of exactly 26 paths: 11 sources, 14 tests, and one claim.
- Task136's exact command contains all 14 tests. Release compatibility v2 has
  exactly 11 source-ordered entries and adds G136-SC only for the historical
  dispatcher-test disposition `owned`.
- The prospective V4 JSON SHA-256 is
  `6085471123099150a4c0ead9a1315f0db2353432ea639cc274c31c60bd6d4c4f`,
  its assurance fingerprint is
  `14f5e3118d478fdb8b76ae1627350942706a4a87b428b048c2e13249981904e4`,
  and the synchronized mission immutable-envelope fingerprint is
  `sha256:f919da5f8543811786b94bb6821a4102fdf4d81713fda68c2972a208c389df20`.
- Terminal completed/failed results require their exact final observation and
  durable T120 result reread without a synthetic suspension. Resumable results
  require an exact suspension/checkpoint/anchor and same-stream segmented
  replay.
- C is typed, stateless, and untrusted. G accepts only an opaque
  dispatcher-issued execution capability and uses a closed requested,
  human-approved, claimed, completed state machine. Its logical locator has no
  ledger-assigned ID; it discovers exact durable IDs on reread. Only completed
  stages become ontology gateway readbacks, and claimed recovery never
  reexecutes an effect.
- The dispatcher owns adapter functions and implementation identities in a
  private WeakMap and binds a stable `executionCapabilityHash` into plans,
  gateway events, effects, completion, and restart reissuance. Callers cannot
  supply raw executor functions or mint provenance from identity strings.
- W's `reverifyAfterAwait` distinguishes current, recordable-stale, and
  unavailable authority. Recordable stale permits only durable suspension
  bookkeeping on the same freshly authenticated mount/ledger/store; complete
  authority loss remains safely non-durable.
- W uses the new `resident-loop-suspension` checkpoint kind and
  `resident-loop-suspended` release reason. Its checkpoint, resident
  suspension, resident resumable result, and release form an exact monotone
  recoverable prefix. A fresh process completes only the missing bookkeeping
  suffix, never duplicates a prefix or effect, and releases only after the
  resident pair is durable.
- H is an internal full-readback port. R alone exposes the concrete
  real-mounted library composition entrypoint and passes only the exact opaque
  dispatcher capability into W. Loop callers receive only `advance`/`resume`;
  no handle, ledger, witness, reader, adapter, executor, capability issuer, or
  structural port bag escapes.
- Record 29 intentionally does not install a default runtime or route call
  site. Executability is proved by the real-mounted fixture without claiming
  runtime activation.
- Task138-H product, tests, claim, DTO, and browser projection remain
  byte-for-byte unchanged.

Prohibitions:

- No product source/test, V4, checker, mission-state, raw-record, registry,
  Task136 RED, integration, push, provider, credential, network, external
  system, pull request, or Wave-3 mutation is authorized by this claim.
- No V5, new card, generic transfer language, local Task136 adapter, public
  authority issuer, compatibility fallback, synthetic suspension, narrowed H
  readback, caller-minted executor provenance, or partial-prefix overwrite is
  permitted.
- No claim that the record-29 library entrypoint is activated by the current
  default runtime, HTTP routes, or operator-status paths is permitted.
- The written design requires explicit program-owner approval at its exact
  reviewed commit before an implementation plan or correction packet begins.

Independent design review history:

- `7bafcef52aefa096112d6b2d6928ce4ae4c89b4b` was rejected for missing
  construction provenance and incomplete approval-class-none representation.
- `e41a1504b7a0a2438770f567e5b08672ba0ed4f2` was rejected for an inaccessible
  completion call, human-only executor ABI, cursor-bound post-loop H reader,
  and unspecified W/T120 construction order.
- `819d3b066ea6757d6a25163906b8803517b6480b` was rejected for cross-package G
  construction, release before durable resumability, impossible checkpoint
  self-reference, irrelevant decision IDs, and process-local restart state.
- `40d507d549ea5127e9f2597fa8d150c8a4c3d904` was rejected because W could not
  recover partial durable prefixes and reused an auto-released checkpoint
  kind, executor functions remained caller-minted, G's staged readback and
  logical locator producer were incomplete, and authority-stale had no
  recordable transition.
- RV-1-E-932 and this history-preserving descendant address those findings
  with the exact seventh provenance seam, baseline adoption, staged gateway
  ABI, recoverable W prefix, and recordable-stale suspension-only capability.
  Completely fresh architecture and executability reviews are still required
  on the exact committed descendant.

Validation required before commit:

- `git diff --check`
- exact two-file scope from amended-design dispatch base
- no unresolved design markers
- `npm run factory:check`
- `node --test scripts/check-software-factory-mission-state.test.mjs`
- clean commit state

This design claim is not a product release, does not approve Task136, and does
not advance the strict frontier beyond 28 of 29.
