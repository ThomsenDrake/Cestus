# Task 124 — Wake Supervisor Admission Contract Recovery

## Claim

- **Status:** ready-for-review (fresh independent defects-first review required).
- **Worker:** `/root/task124_admission_contract_repair`.
- **Branch / base:**
  `codex/task-124-resident-full-vision-wake-supervisor-admission-recovery`
  from `1a69f73f06c70d510e0137441937f3d4d6667018`.
- **Governing documents:**
  `docs/superpowers/specs/2026-07-12-resident-agent-full-vision-program-design.md`,
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md`,
  `docs/superpowers/specs/2026-07-12-resident-agent-wake-portable-lifecycle-design.md`,
  `docs/superpowers/plans/2026-07-12-resident-agent-wake-portable-lifecycle-implementation.md`,
  and `docs/agentic/resident-agent-full-vision-program-registry.md` C-117.
- **Owned files only:** this claim, `packages/agent/src/wake-supervisor.ts`, and
  `packages/agent/test/wake-supervisor.test.ts`.
- **Authorization:** root-cause contract repair only; systematic debugging,
  TDD, verification-before-completion, and a fresh independent review are
  authorized. No Task125 edit, self-review, integration, child dispatch,
  `neo` action, provider/credential work, or full `npm run verify` is allowed.

## Root Cause And Initial RED

- C-117 establishes that strict admission freezing retains only public
  identity/mount facts, so a later same-identity revalidation cannot reject an
  old admission; additionally, the supervisor owns the active abort controller
  but has no authority-invalidation notification path.
- Initial exact focused command was dependency-blocked before discovery:
  `sh: 1: vitest: command not found`. A temporary ignored `node_modules` link
  was created solely to run the required focused RED and will be removed after
  the required non-full gates.
- Invalidation RED: the focused command then exited `1` with the new
  in-flight authority-invalidation regression failing because the expected
  subscription callback was `undefined`. The prior suites passed (47 tests),
  proving the supervisor currently cannot receive authority invalidation or
  abort its active runtime.
- Generation RED: after adding the same-identity counterfactual, the exact
  focused command exited `1` with 2 failed and 47 passed tests. The generation
  case could not reach its held lease boundary because `freezeAdmission` rejects
  the authority-issued generation as an unsupported key, proving the existing
  strict snapshot drops the per-revalidation capability before lease or
  reconciliation can distinguish an old admission.

## Required Green And Stop Point

- Carry one exact, non-secret, immutable, authority-issued per-revalidation
  admission generation through frozen admission, lease, and reconciliation
  boundaries; reject stale same-identity inputs before reconciliation or wake.
- Subscribe fail-closed to authority invalidation while a cycle is active;
  invalidate the active revision and abort the existing controller so the run
  returns blocked/cancelled without later lifecycle or effect completion.
- Run only the focused suite, `npm run typecheck`, `git diff --check`, and
  `npm run factory:check`; remove the temporary dependency link; commit the
  three owned files; verify a clean worktree; then stop for fresh independent
  review.

## Green Evidence And Handoff

- Minimal repair: `WorkspaceAdmissionSnapshot` now requires one frozen,
  authority-issued, non-secret `admissionGeneration`, and the exact generation
  is retained in the typed lease input and reconciliation admission tuple.
  Fresh revalidation snapshots therefore carry a value that the Task125
  guarded mounted ports can compare before lease or reconciliation effects;
  normal historical reconciliation readback still validates its own immutable
  recorded generation without treating renewable lease/high-water evidence as
  a current capability.
- The supervisor optionally subscribes to the authority invalidation channel.
  A notification increments the active cancellation revision and aborts the
  existing controller. The active run returns the fail-closed
  `workspace-unavailable` blocked result with no lifecycle evidence; a later
  independently revalidated resume/recover remains allowed. A malformed
  subscription fails closed before admission, while an absent optional channel
  preserves normal pause, stop, recovery, and resumption behavior.
- GREEN: `npm test -- packages/agent/test/wake-supervisor.test.ts
  packages/agent/test/scheduler.test.ts` exited `0` with 2 passing files and
  49 passing tests. The two causal tests prove old same-identity generation
  rejection before reconciliation/effect and active runtime abort on authority
  invalidation without completion evidence.
- Non-full gates: `npm run typecheck` exited `0`; `git diff --check` exited
  `0`; and `npm run factory:check` exited `0` with
  `factory-readiness passed`. The temporary ignored `node_modules` link was
  removed before the final scope check. Full `npm run verify` was not run, as
  expressly forbidden.
- Stop point: commit only this claim, `packages/agent/src/wake-supervisor.ts`,
  and `packages/agent/test/wake-supervisor.test.ts`; verify the branch is
  clean; then hand off for fresh independent review without self-review,
  integration, or Task125 edits.
