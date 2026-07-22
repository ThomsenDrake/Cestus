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
- C is typed but untrusted; G is prebound and single-use; W is opaque and
  reverified; H is an internal full-readback port; R alone composes production.
- Approval class `none` uses a durable automatic claim, never a fabricated
  human approval. Complete mount loss returns a safe non-durable unavailable
  envelope until a canonical result can actually be persisted and reread.
- Task138-H product, tests, claim, DTO, and browser projection remain unchanged.

Prohibitions:

- No product source/test, V4, checker, mission-state, raw-record, registry,
  Task136 RED, integration, push, provider, credential, network, external
  system, pull request, or Wave-3 mutation is authorized by this claim.
- No V5, new card, generic transfer language, local Task136 adapter, public
  authority issuer, compatibility fallback, synthetic suspension, or narrowed
  H readback is permitted.
- The written design requires explicit program-owner review before the
  implementation plan or any correction packet begins.

Validation required before commit:

- `git diff --check`
- exact two-file scope from dispatch base
- no unresolved design markers
- `npm run factory:check`
- `node --test scripts/check-software-factory-mission-state.test.mjs`
- clean commit state

This design claim is not a product release, does not approve Task136, and does
not advance the strict frontier beyond 28 of 29.
