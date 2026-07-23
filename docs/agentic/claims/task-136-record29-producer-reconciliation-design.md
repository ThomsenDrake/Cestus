# Task136 Record-29 Producer Reconciliation Design Claim

Status: awaiting fresh independent dual review

Design:
`docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`

Task: documentation-only Level-2 design freeze

Branch: `codex/resident-agent-full-vision-program-watchdog-recovery`

Worker: Codex program coordinator

Exact amended-design dispatch base:
`1512cd7d76156842febf9fe1ca955bf2c05c22e2`

Preserved Task136 checkpoint:
`72e1ee6624c582218995e3e075e2303998811834`

Owned files:

- `docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`
- `docs/agentic/claims/task-136-record29-producer-reconciliation-design.md`

Authority:

- Program registry: `docs/agentic/resident-agent-full-vision-program-registry.md`
- Original Approach-1 authorization: `RV-1-E-931`
- Superseding seven-seam amendment: `RV-1-E-932`
- Superseding four-path interlock addendum: `RV-1-E-933`
- Superseding zero-path loader/ABI addendum: `RV-1-E-934`
- The program owner approved preserving all 29 cards and applying a finite,
  source-specific producer correction directly to Task136 as strict record 29.
- RV-1-E-933 and RV-1-E-934 require every later implementation authorization to state
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
- Four previously unowned task-orchestrator source/test paths are adopted
  directly from W1 candidate
  `bd3b8ed3e287a6a598dfb246524e36ca2a345438`, integration
  `75de81f110b4f405f9ec064104bc2c2b4f79e223`, and current baseline blobs
  `72b11352c8a3c79237404257d676c1ef27fef5db`,
  `12d68f0b407f8b6f867a232c496b63b064e489bb`,
  `e4656da434f0ba48d670be085ba503dd7c51588b`, and
  `6e9062b5c8e1a679612cf09dcb664dfe3bbeb9e7`; no historical W1 ownership,
  prerequisite, transfer, or compatibility entry is invented.
- Task136 gains direct CF1-HR and G136-SC prerequisites and becomes the final
  owner of exactly 30 paths: 13 sources, 16 tests, and one claim.
- Task136's exact command contains all 16 tests. Release compatibility v2 has
  exactly 11 source-ordered entries and adds G136-SC only for the historical
  dispatcher-test disposition `owned`.
- The prospective V4 JSON SHA-256 is
  `81a34419ae5d25853279be96c14a95c65dcc127d1bb5f5b09cecbbf03c55b53a`,
  its assurance fingerprint is
  `34628c6687644f224ef426254a6461c25f549d696c5de08bd9dccc14b7946af6`,
  and the synchronized mission immutable-envelope fingerprint is
  `sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5`.
- Terminal completed/failed results require their exact final observation and
  durable T120 result reread without a synthetic suspension. Resumable results
  require an exact suspension/checkpoint/anchor and same-stream segmented
  replay.
- C is typed, stateless, and untrusted. G accepts only a package-owned
  dispatcher capability and uses resident-specific requested, human-approved,
  claimed, outcome-observed, completed, denied, and failed events. Its exact
  workspace/resident/task/attempt/run/plan/step/tool locator has no
  ledger-assigned ID; it discovers exact durable IDs on reread.
- The dispatcher statically imports the exact canonical descriptors/functions
  but reads them only when its resident factory lazily assembles the closed
  catalog after ESM evaluation. No dynamic loader or policy exemption is
  added. Its frozen default resident API is excluded from the unchanged agent
  wildcard barrel and import-gated to exact direct consumers. Its hash is
  derived from the ABI plus ordered catalog, never caller identity or function
  text. The legacy caller-registered dispatcher cannot issue or satisfy a
  resident capability.
- The resident default API binds an opaque preview/invocation port only after
  every retained adapter ledger is present, both destructive contexts share
  it, and all retained ledgers are identity-equal to W's freshly authenticated
  mounted ledger with matching workspace/resident/task identity. Its private
  preview operation supplies G's exact pre-request facts; invocation requires
  a fresh G-issued one-shot permit, not a capability plus claim string.
- G's frozen package-private default permit consumer is excluded from the
  unchanged wildcard barrel and direct-imported only by the dispatcher. It
  atomically validates and consumes the permit against the exact opaque port,
  claim, locator, branch, ordinal, preview, and canonical invocation input
  before any adapter call; no caller-supplied callback or permit operation
  escapes.
- Automatic and human G states are structurally disjoint. Human approval binds
  the exact decision, approver, and approved-preview hash. Exactly one
  permanent claim may exist. Only a newly claimed in-memory one-shot permit
  can invoke an effect; a reread claimed stage never has a permit.
- T120's canonical gateway-readback union remains structurally disjoint:
  automatic requested/claimed/completed/failed branches forbid all decision,
  approver, and approved-preview fields, while human branches require exactly
  the fields valid at their durable stage. Only catalog ordinal 10 may use a
  private `approvalClass: "none"` compatibility DTO for the unchanged adapter
  ABI; its internal legacy fields never become durable approval evidence.
- Completion or post-claim failure requires a canonical durable outcome
  receipt over an exact claim-bound dispatcher invocation attestation. The
  unchanged adapter ABI never receives the resident claim. The package wrapper
  classifies exact catalog-specific outcomes as wholly new ledger events,
  wholly idempotent-existing ledger events, or, for workspace projection
  rebuild alone, exact nonledger projection artifacts; fail-closed provider
  execution and blocked canonical repair can never return success. A claim
  without a receipt is sealed `effect-outcome-unknown`, suspends with its exact
  automatic or human gateway binding, permanently burns the original tool
  request, and permits reconciliation/replanning but never reexecution.
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
- `effect-outcome-unknown` is present in the V2 suspension-category enum,
  general result-category enum, and resumable-category mapping only. Its
  `R-resumable` is anchored to the exact claimed automatic or human gateway
  readback and can never be classified as completed, failed, or
  approval-required.
- `suspendAndRelease` alone may create prefix state zero from trusted current
  bytes. `recoverSuspensionPrefix` accepts only an already durable checkpoint
  locator at states one through four and uses the checkpoint instruction as
  the sole source for the suffix; it cannot manufacture a missing checkpoint.
- The adopted task-orchestrator source treats the same-claim resident
  checkpoint as W-owned durable supersession in active, cancellation, and
  stale-recovery paths. Each tick interlock uses the already released
  `not-claimable` skip-summary reason; no orchestrator summary type changes.
  Its projection recognizes that checkpoint before expired-lease handling,
  retains it, and derives blocked/non-recoverable
  `resident-loop-suspension-owned-by-w` diagnostics without a generic release
  or reclaim.
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
  readback, caller-minted executor provenance, claimed-effect retry, generic
  resident-checkpoint recovery, or partial-prefix overwrite is permitted.
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
- `75da663651c90cf41eee208dba36e21028b75aa2` was rejected because dispatcher
  provenance remained caller-self-attested, claimed recovery could not
  construct an exact result, denied/failed prefixes and the approved-preview
  hash were incomplete, and the released task orchestrator could race W with
  a generic stale release/reclaim.
- `29826501dbad3650969cb3a45d1c4c933258489f` was rejected because the proposed
  W-specific tick-summary literal was outside the released skip-reason union
  and “claim-caused domain evidence” lacked an executable rule for the
  unchanged adapter ABI.
- `7ebf3097b3362e1c16ac6466004a608b6385098c` was rejected because its dynamic
  imports violate released repository policy, any named resident API leaks
  through the unchanged wildcard barrel, G lacks a package-owned pre-request
  preview operation, automatic execution/T120 and unknown-result mappings are
  incomplete, and resident ledger identity is not frozen.
- RV-1-E-934 and this history-preserving descendant address all findings with
  the lazy static closed catalog, default-only resident API, exact mounted
  ledger identity, private preview and fresh-permit invocation operations,
  strict automatic/human T120 unions, ordinal-10-only compatibility bridge,
  complete unknown-result mapping, claim-bound catalog-specific invocation
  attestation, durable outcome receipt, unchanged `not-claimable` tick
  summaries, the projection-only W diagnostic, four pinned interlock paths,
  and W-only resident checkpoint recovery. Completely fresh architecture and
  executability reviews are still required on the exact committed descendant.

Validation required before commit:

- `git diff --check`
- exact two-file scope from amended-design dispatch base
- no unresolved design markers
- `npm run factory:check`
- `node --test scripts/check-software-factory-mission-state.test.mjs`
- clean commit state

This design claim is not a product release, does not approve Task136, and does
not advance the strict frontier beyond 28 of 29.
