# Task136 Record-29 Producer Reconciliation Design Claim

Status: awaiting exact written-design owner review

Design:
`docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`

Task: documentation-only Level-2 design freeze

Branch: `codex/resident-agent-full-vision-program-watchdog-recovery`

Worker: Codex program coordinator

Exact dispatch base: `752a021ee7299b028ec6b05750471cf0962732ce`

Preserved Task136 checkpoint:
`72e1ee6624c582218995e3e075e2303998811834`

Owned files:

- `docs/superpowers/specs/2026-07-22-task136-record29-producer-reconciliation-design.md`
- `docs/agentic/claims/task-136-record29-producer-reconciliation-design.md`

Authority:

- Program registry: `docs/agentic/resident-agent-full-vision-program-registry.md`
- Authorization event: `RV-1-E-931`
- Program owner approved Approach 1: preserve all 29 cards and transfer a
  finite, source-specific producer correction directly to Task136 as strict
  record 29.
- Task-scoped subagent-driven development and test-driven development are explicitly approved for this task.

Bounded design result:

- The V4 graph retains the exact 29 IDs/order and raw strict records 1-28.
- Exactly 21 released source/test paths transfer from T120-R, C136-P, G136-R,
  Task137B-W, CF1-HR, and Task136-FC-Ports to Task136.
- Task136 gains direct CF1-HR prerequisite authority and becomes the final
  owner of exactly 24 paths at record 29.
- Terminal completed/failed results require their exact final observation and
  durable T120 result reread without a synthetic suspension. Resumable results
  require an exact suspension/checkpoint/anchor and same-stream segmented
  replay.
- C is typed, stateless, and untrusted; G is prebound, single-use, and can
  reissue a branded readback only from an exact durable locator; W is opaque
  and reverified; H is an internal full-readback port; R alone exposes the
  concrete real-mounted library composition entrypoint.
- R's exact trusted-bootstrap input and capability provenance are frozen. Loop
  callers receive only `advance`/`resume`; no handle, ledger, witness, reader,
  executor, or structural port bag escapes. Record 29 intentionally does not
  install a default runtime or route call site because those owners are outside
  the authorized correction.
- Approval class `none` uses a discriminated automatic-policy readback: exact
  request, direct durable single-use claim caused by that request, and exact
  claim-caused completion, with no decision ID or fabricated human approval.
  It uses a G/R-owned automatic executor input with no `approvedBy` and a
  private G-owned append/reread completion route; the inaccessible generic
  completion API and human-only scheduler evidence path remain unchanged.
  Human approval retains its exact decision ID and human executor branch.
- W's one-shot private registrar constructs T120 and prebound G after unchanged
  Core binding, then issues H an exact-hash, cursor-free mounted artifact
  reader. Its suspension transaction durably rereads orchestration checkpoint,
  resident suspension, resident resumable result, and orchestration release in
  that order; the resident suspension's ledger-assigned ID is the resume
  checkpoint and is never self-referenced in its input payload. Approval-wait
  checkpoints bind the existing request but no future decision; non-approval
  categories carry no gateway IDs. The portable H binding/controller remains
  authority provenance but its cursor-bound store is not reused after V2
  events. Complete mount loss returns a safe non-durable unavailable envelope
  until a canonical result can actually be persisted and reread.
- Task138-H product, tests, claim, DTO, and browser projection remain unchanged.

Prohibitions:

- No product source/test, V4, checker, mission-state, raw-record, registry,
  Task136 RED, integration, push, provider, credential, network, external
  system, pull request, or Wave-3 mutation is authorized by this claim.
- No V5, new card, generic transfer language, local Task136 adapter, public
  authority issuer, compatibility fallback, synthetic suspension, or narrowed
  H readback is permitted.
- No claim that the record-29 library entrypoint is activated by the current
  default runtime, HTTP routes, or operator-status paths is permitted.
- The written design requires explicit program-owner review before the
  implementation plan or any correction packet begins.

Independent design review:

- Revision `7bafcef52aefa096112d6b2d6928ce4ae4c89b4b` received `NEEDS_CHANGES`
  for missing constructor capability provenance and an incomplete
  `approvalClass: "none"` decision representation.
- Follow-up review confirmed that no current production source imports
  FC-Ports and that the existing scheduler-completion adapter is human-only.
  Revision `e41a1504b7a0a2438770f567e5b08672ba0ed4f2` therefore deferred
  default runtime activation, but fresh architecture and executability reviews
  rejected its inaccessible `completeTool` call, human-only executor input,
  cursor-bound post-loop H reader, and unspecified W/T120 construction order.
- This revision replaces those four claims with a G-owned automatic executor
  and completion route plus W's post-Core one-shot private registrar and
  exact-hash mounted H reader. No seventh producer seam, generic gateway,
  scheduler-adapter, portable-store, FC-Core, or runtime-factory edit is
  implied.
- Revision `819d3b066ea6757d6a25163906b8803517b6480b` then received
  `NEEDS_CHANGES` because R rather than W constructed G, W exposed no append
  authority to that G, release preceded any durable resumable result, the
  suspension checkpoint required an impossible future self ID and irrelevant
  decision IDs, and restart depended on process-local G/C state. This
  descendant makes construction package-valid, defines the exact four-event
  suspension/release order and category union, treats the reread suspension
  event ID as the resident checkpoint, and adds exact-ID G plus stateless C
  rehydration. The transfer/card counts and prospective hashes remain fixed.

Validation required before commit:

- `git diff --check`
- exact two-file scope from dispatch base
- no unresolved design markers
- `npm run factory:check`
- `node --test scripts/check-software-factory-mission-state.test.mjs`
- clean commit state

This design claim is not a product release, does not approve Task136, and does
not advance the strict frontier beyond 28 of 29.
