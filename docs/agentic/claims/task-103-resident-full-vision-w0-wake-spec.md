# Task 103 Claim: Resident Full-Vision Wave 0 Wake Specification

- Governing specification: `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md` at `811458d2`
- Governing plan: `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md` at `68fe8e87`
- Task: Task 103 / Lane W — Wake and Portable Lifecycle specification
- Worker: Codex Task 103 W specification author
- Task thread: `019f56d2-eb3b-7293-b7b9-bf0329f604b9`
- Branch: `codex/task-103-resident-full-vision-w0-wake-spec`
- Worktree: `/home/drake/.codex/worktrees/4a49/Cestus`
- Base commit: `bb41ee02d7061f838917d378bccf17a6a6ad9e80`
- Claimed at: `2026-07-12T19:55:14Z`
- Model configuration: GPT-5.6 Terra / Extra High
- Status: ready-for-review

## Ownership

- Create: `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md`
- Create: `docs/agentic/claims/task-103-resident-full-vision-w0-wake-spec.md`

Every other tracked file is forbidden. This task creates neither an
implementation plan nor production, test, runtime, UI, provider, or shared
contract changes.

## Authorization And Stop Condition

The coordinator-issued authorization permits Task 103 only, using the approved
Wave 0 umbrella documents, documentation RED/GREEN audit, fresh coordinator
review, and verification-before-completion. The work stops after the scoped
specification and this claim are committed, for a written W-spec approval. The
task does not dispatch work, self-merge, merge into `neo`, or start Task 109,
Task 110, Task 111, or any implementation work.

## Required Specification Coverage

- One-resident supervision, browser-independent wake scheduling, pause/resume,
  bounded recovery, process ownership, and scheduler ownership.
- Mounted portable-workspace availability, identity, locks, high-water,
  revalidation, disconnect, restart, degraded, and unrecoverable states.
- No internal fallback ledger, projection, artifact, derivative, or store
  writes when portable authority is unavailable or mismatched.
- Versioned, provenance-complete, secret-safe diagnostics, lifecycle command
  boundaries, recovery/readback evidence, deterministic failure injection,
  later live acceptance, and coordinator-only merge/rebase constraints.

## Documentation Evidence Required

- RED: a documented coverage audit before the lane specification exists;
  `git diff --check` and `npm run factory:check` run before specification
  completion.
- GREEN: `git diff --check`, `npm run factory:check`, and `npm run verify`
  after the specification and claim are complete.
- Review: a fresh coordinator spec review and written W-spec approval after
  the committed lane specification.

## Documentation RED Evidence

- Command: `node --input-type=module -e '<specification-presence audit>'`
- Observed result: exited 1 with `RED: Task 103 wake and portable lifecycle
  specification is absent.` before the specification file was created.
- Baseline documentation checks: `git diff --check` exited 0 with no output
  and `npm run factory:check` reported `factory-readiness passed`.

## Documentation GREEN Evidence

- Command: `node --input-type=module -e '<Task 103 required-heading and
  coverage audit>'`
- Observed result: `GREEN: Task 103 wake specification coverage audit passed.`
- Follow-up checks: `git diff --check` exited 0 with no output and `npm run
  factory:check` reported `factory-readiness passed`.
- Self-review: confirmed scope is restricted to this specification and claim;
  no unfinished markers or existing implementation interface collisions were
  found; proposed ownership preserves W/R/U/T/L/P/A boundaries; and the design
  requires append-only evidence, provenance, durable readback, and no fallback
  storage.

## Final Verification Evidence

- `git diff --check` exited 0 with no output.
- `npm run factory:check` reported `factory-readiness passed`.
- `npm run verify` exited 0 after the isolated worktree's lockfile-pinned
  dependencies were restored; the verification chain includes typecheck,
  deterministic tests, UI build, and factory readiness.

## Handoff

The specification is ready for a fresh coordinator spec review and written
W-spec approval. Task 103 is complete at this gate only; Task 109, Task 110,
Task 111, all production work, dispatch, and merge into `neo` remain outside
this task.

## Stop And Escalation Conditions

Stop for data-loss or fallback-storage risk; an event, DTO, interface, or file
ownership conflict; unavailable dependency; verifier failure after two focused
repairs; portable-workspace identity mismatch needing a policy decision; or a
required expansion beyond Task 103.
