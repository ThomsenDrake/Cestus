# Task 113 Claim: Resident Full-Vision Wave 0B Proactive-Triggers Implementation Plan

- Approved Lane T specification:
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md@9a571f628bef9c53725e20263cb687ec44dd9cd8`.
- Governing implementation plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- Task and lane: Task 113 / T / Wave 0B implementation-plan work order.
- Status: claimed.
- Worker: Codex Task 113 proactive-triggers implementation-plan author.
- Branch: `codex/task-113-resident-full-vision-w0-trigger-plan`.
- Worktree:
  `/home/drake/.codex/worktrees/task-113-resident-full-vision-w0-trigger-plan`.
- Base commit: `f6c8337481ce79a073de8f592544e42230a61304`.
- Claimed at: `2026-07-13T00:38:00Z`.
- Model configuration: GPT-5.6 Terra / Extra High; the coordinator/user has
  confirmed that reported GPT-5 satisfies this required configuration.

## Scoped Authorization

The coordinator-issued authorization names the exact approved Lane T
specification and governing plan above, permits Task 113 only, and stops after
one verified plan-and-claim commit, fresh plan review, and coordinator
lane-plan approval. It explicitly authorizes
`superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
fresh review, and verification-before-completion.

This work order does not authorize Task 118 or Tasks 149--151, production
code, shared-contract freezing, CF-1, provider or Nous use, a task dispatch,
or a merge into an integration branch or `neo`. The author does not
self-approve or self-merge.

## Ownership

- Create:
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
- Create and update:
  `docs/agentic/claims/task-113-resident-full-vision-w0-trigger-plan.md`.

Every other tracked file is forbidden, including production, test, runtime,
UI, provider, specification, registry, acceptance-matrix, template, and
shared-contract files. The written plan may reserve future Lane T production
and test files only after CF-1 assigns their canonical contracts.

## Required Plan Evidence

- RED: a reproducible documentation audit must fail while the owned plan is
  absent, or while it lacks file ownership, frozen interfaces, deterministic
  fingerprint/dedupe/admission-scope/gate-key behavior, mounted atomic
  readback/replay, cooldown/budget/high-water rules, no-effect proof, trigger
  family adapters, secret-safe diagnostics, failure injection, rebase/review,
  rollback, and acceptance gates.
- GREEN: the same audit, `git diff --check`, and `npm run factory:check` must
  pass after the plan is written.
- Full verification: `npm run verify` must pass before the plan commit.
- Fresh review: a different reviewer must lead with defects, missing tests,
  ownership conflicts, interface drift, and unsafe merge order.

## Initial Handoff

This claim is committed before the implementation-plan document. The final
forward update records the actual RED/GREEN commands and outputs, full
verification, self-review, and review handoff. A repeated verifier failure,
schema/file-owner conflict, fallback-storage risk, credential need, or data
loss risk is returned to the coordinator; repair-count exhaustion is a
coordinator recovery checkpoint, not a user gate.

## RC-113-01 — Fresh documentation-audit recovery started

- Recorded at: 2026-07-13T02:50:06Z.
- Status: in-progress; this is a forward-only recovery record. The initial
  `claimed` record above and the untracked initial draft in
  `/home/drake/.codex/worktrees/task-113-resident-full-vision-w0-trigger-plan`
  remain preserved and unmodified.
- Recovery worker and branch:
  `codex/task-113-resident-full-vision-w0-trigger-plan-recovery` /
  `/home/drake/.codex/worktrees/task-113-resident-full-vision-w0-trigger-plan-recovery`,
  based at `3f7b03012c1d2cfa33330f7f7f09c7069ec4632d`.
- Scoped authority: the coordinator's fresh authorization names Lane T design
  `@9a571f628bef9c53725e20263cb687ec44dd9cd8`, program plan
  `@0b5726ec975bdc0aae97e540472ef3be4379b358`, Task 113 only, one verified
  recovery commit plus fresh review, and the stop before Tasks 149--151,
  CF-1 implementation, production/provider work, dispatch, or a merge. It
  explicitly authorizes `superpowers:subagent-driven-development`,
  documentation RED/GREEN, fresh review, and verification-before-completion;
  no merge into `neo` is permitted.
- Model configuration: GPT-5.6 Terra / Extra High, user-confirmed through the
  coordinator's GPT-5 reporting instruction.
- Owned files: this claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
  Every other tracked file remains forbidden.
- Root cause: the prior documentation proof depended on fragile shell/escaping
  behavior and did not provide a durable section-local, counterfactual plan
  audit. The recovery uses one direct `node --input-type=module --eval`
  command with no nested command substitution. It extracts named sections,
  verifies local requirements, removes every occurrence of selected coverage
  tokens within the selected section, and treats any accepted counterfactual as
  a failure.
- RED command and observed failure:
  `node --input-type=module --eval <documented Task 113 audit>` exited nonzero
  before plan creation with `ENOENT` for
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
- GREEN command and observed result: pending final documentation audit after
  plan self-review and forward claim evidence.
- Initial local checks: `git diff --check` exited 0 and
  `npm run factory:check` printed `factory-readiness passed`.
- Live-provider gate: not-applicable; Task 113 is documentation-only and the
  planned Lane T evaluator has no provider/model invocation boundary.
- Review and merge: pending a separately fresh reviewer. This worker does not
  self-approve, dispatch implementation, or merge into an integration branch.

## RC-113-02 — Recovery plan ready for fresh review

- Recorded at: 2026-07-13T02:53:06Z.
- Status: ready-for-review; this supersedes RC-113-01 only for recovery
  completion status. The initial claim, untracked preserved draft, and the
  recovery-start record remain immutable evidence.
- Files changed: only the Task 113 owned plan and this append-only claim.
  `git status --short` showed no production, test, runtime, UI, provider,
  specification, registry, template, or acceptance-matrix change.
- Documentation RED: the documented direct Node audit exited nonzero before
  plan creation with the expected `ENOENT`. It therefore proved the required
  plan had not been present.
- Documentation GREEN: the same direct Node audit printed
  `GREEN: Task 113 section-local plan audit passed (8 section checks; 10
  counterfactuals rejected).` It checks CF-1, exact Task 118 ownership and
  capability boundary, admission/readback/dedupe/cooldown/high-water/no-effect
  rules, Tasks 149--151, failure-injection/live posture, and rollback. Its ten
  scoped counterfactuals remove every matching token in the selected section;
  any variant that validates causes a nonzero result.
- Recovery detail: the first forward audit attempt exposed a case-sensitive
  live-posture token mismatch. The next attempt proved that a first-occurrence
  replacement was insufficient; the following attempt proved that a replacement
  marker retaining the token substring was insufficient. The final audit
  removes every occurrence entirely and then rejects all ten variants. These
  are bounded documentation-audit repairs, not product-contract changes.
- Plan self-review: no unfinished-placeholder or vague-error-handling marker
  was found. The plan's Task 118 and adapter file ownership, CF-1 gate,
  interface names, test commands, no-provider posture, rebase order, and
  append-only rollback agree with the approved Lane T design and program plan.
- Environment recovery: the first `npm run verify` was blocked only because
  this fresh isolated worktree lacked `tsc` (`exit 127`). The coordinator
  authorized `npm ci --ignore-scripts`; it restored only lockfile-defined
  dependencies and left tracked status limited to the two owned documents.
- Verification evidence: after that recovery, the documented Node GREEN audit,
  `git diff --check`, and `npm run factory:check` passed; `npm run verify`
  reported `typecheck passed`, 189 passing test files with 3 skipped, 2,228
  passing tests with 5 skipped, a successful Vite build with its existing
  chunk-size warning, and `factory-readiness passed`.
- Live-provider gate: not-applicable; no provider, model, prompt, or Nous call
  is planned or invoked by this documentation-only work order.
- Fresh-review handoff: review the diff from
  `3f7b03012c1d2cfa33330f7f7f09c7069ec4632d` to the forthcoming recovery
  commit against the approved design and program plan. Lead with ownership,
  CF-1 boundary, type/interface drift, audit fail polarity, TDD evidence,
  unsafe merge order, and any missing deterministic/no-effect counterfactual.
  No production work, Task 118, Task 149, Task 150, Task 151, provider use,
  dispatch, or merge into `neo` is authorized by this record.

## RC-113-03 — Section-local no-effect and adoption recovery

- Recorded at: 2026-07-13T03:12:31Z.
- Status: ready-for-fresh-review after verification; this is a forward-only
  repair record. RC-113-01 and RC-113-02, their source commits, and their
  review evidence remain historical and unmodified.
- Recovery worker/branch/worktree:
  `codex/task-113-resident-full-vision-w0-trigger-plan-repair` /
  `/home/drake/.codex/worktrees/task-113-resident-full-vision-w0-trigger-plan-repair`,
  based at `4ff79542cd5e23e3c277285e79997e4f9da3efd5`.
- Scoped coordinator authority: approved Lane T design
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md@9a571f628bef9c53725e20263cb687ec44dd9cd8`;
  governing plan
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`;
  Task 113 trigger-semantics/no-effect repair only; stop after one verified
  repair plus fresh review, before Tasks 149--151, CF-1, production, provider
  work, dispatch, or merge. It explicitly authorizes
  `superpowers:subagent-driven-development`, documentation RED/GREEN as TDD,
  fresh review, and verification-before-completion; no self-merge into `neo`.
- Allowed files: only
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`
  and this append-only claim. No production, test, spec, registry, provider,
  or acceptance-matrix file changed.
- Root cause and changed tactic: the prior plan asserted canonical source
  sorting, equal-scope serialization, and a no-effect posture, but it did not
  make the requested subclauses locally falsifiable. The repair adds focused
  Task 118 RED/GREEN examples for reversed `sourceRefs`, equal-policy-scope
  candidates, loser fresh read/evaluation, and every prohibited effect-shaped
  input. A second, delimiter-safe section-local audit validates these exact
  clauses and rejects 25 local counterfactuals, including the independently
  owned Task 136 adoption-and-approval-revalidation proof.
- Documentation RED: against the pre-repair `4ff79542` bytes, the recovery
  audit command exited nonzero with `RED: missing reversed sourceRefs`. This
  proves the former plan could not satisfy the new semantic-identity clause.
- Documentation GREEN: the original section-local audit printed
  `GREEN: Task 113 section-local plan audit passed (8 section checks; 10
  counterfactuals rejected).` The added recovery audit printed
  `GREEN: Task 113 recovery audit passed (2 section checks; 25
  counterfactuals rejected).` Both audits fail if their selected local tokens
  are removed and accept no counterfactual.
- Local verification: `git diff --check` exited 0 and
  `npm run factory:check` printed `factory-readiness passed`. `npm run verify`
  evidence is recorded with the completed repair commit.
- Dependency recovery: this isolated worktree initially lacked
  `node_modules/.bin/tsc`, so `npm run verify` exited 127 before typecheck.
  The coordinator authorized `npm ci --ignore-scripts` only in this worktree
  to restore lockfile-defined dependencies; it may not create tracked
  dependency changes and is followed by a fresh full verification run.
- Fresh-review handoff: review the diff from
  `4ff79542cd5e23e3c277285e79997e4f9da3efd5` to this repair commit. Lead with
  append-only claim history, exact ownership, Task 118 semantic identity,
  same-scope gate sharing and fresh-loser evaluation, no-effect field coverage,
  Task 136 ownership/independent approval revalidation, audit section bounds
  and counterfactual fail polarity, verification evidence, CF-1 stop boundary,
  and the prohibition on a merge into `neo`.

## RC-113-04 — Verification completion

- Recorded at: 2026-07-13T03:16:00Z.
- Status: verified and ready for a fresh review; this appends the final
  verification evidence to RC-113-03 without rewriting that recovery record.
- The coordinator-authorized `npm ci --ignore-scripts` restored only
  lockfile-defined dependencies in this isolated worktree. `git status --short`
  remained limited to the two Task 113 documents.
- `npm run verify` exited 0: `typecheck passed`; 189 test files passed with 3
  skipped; 2,228 tests passed with 5 skipped; the Vite build succeeded with its
  existing chunk-size warning; and `factory-readiness passed`.
- No provider or Nous call was made. This remains a documentation-only Task 113
  repair and stops before CF-1, Task 118, Tasks 149--151, production, dispatch,
  or any merge into `neo`.

## RC-113-05 — Same-call concurrency and exhaustive no-effect repair started

- Recorded at: 2026-07-13T12:20:13Z.
- Status: in-progress; this is a forward-only repair record. RC-113-01 through
  RC-113-04 and their commits remain unmodified historical evidence.
- Recovery worker/branch/worktree:
  `codex/task-113-resident-full-vision-w0-trigger-plan-same-call-repair` /
  `/tmp/cestus-task113-same-call`, based at
  `6da8aecc2731aa881fbf9443559e62f4a4192d59`.
- Scoped authority: Task 113 same-call concurrency/exhaustive no-effect
  documentation repair only under the approved Lane T design
  `@9a571f628bef9c53725e20263cb687ec44dd9cd8` and governing program plan
  `@0b5726ec975bdc0aae97e540472ef3be4379b358`. Stop after one verified
  forward repair commit and fresh review; do not begin Tasks 149--151, CF-1,
  production/provider work, child dispatch, or a merge into `neo`.
- Owned files remain only this append-only claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
- Documentation RED: the section-local same-call/no-effect Node audit against
  the `6da8aecc` baseline failed at `Task 118: Trigger Core, Request Event,
  And Rebuildable Projection: missing losingPromise`. The baseline test made a
  later independent evaluator call and omitted the required prompt,
  model/provider, subscription/API-key/credential, harness/specialist/domain-
  service, projection, and graph boundary shapes.

## RC-113-06 — Same-call repair verification and fresh-review handoff

- Recorded at: 2026-07-13T12:33:51Z.
- Status: ready for fresh re-review; this appends completion evidence without
  modifying RC-113-05 or any earlier record. The repair remains limited to the
  Task 113 plan and this claim; no production, test, provider, registry,
  specification, acceptance-matrix, or runtime file changed.
- Repair: Task 118 now holds both original evaluator calls in a synchronized
  race fixture, selects the original losing `losingPromise`, proves its second
  source-keyed authority read and `budget-exhausted` result within the same
  call, and proves all conditional append attempts used one gate key. It makes
  no later independent `evaluateResidentTrigger` call. The strict negative
  fixture and acceptance matrix now cover prompt artifacts/resolvers, model
  messages/invocations, provider requests, subscription/API-key/credential
  shapes, harnesses, specialists, domain services, scheduler/tool/parser/
  approval/task/handoff/artifact/projection/graph shapes, and raw bytes.
- Documentation RED: the final same-call/no-effect audit against the untouched
  `6da8aecc` baseline failed with the expected missing `losingPromise` local
  requirement.
- Documentation GREEN: the original audit printed `GREEN: Task 113
  section-local plan audit passed (8 section checks; 10 counterfactuals
  rejected).`; the prior recovery audit printed `GREEN: Task 113 recovery
  audit passed (2 section checks; 25 counterfactuals rejected).`; and the new
  focused audit printed `GREEN: Task 113 same-call/no-effect audit passed (39
  counterfactuals rejected).` Every selected requirement is removed from its
  own section before the audit confirms that variant fails.
- Independent checks: `git diff --check` exited 0 before this append and the
  plan was manually re-read against the Lane T append-only, source-provenance,
  no-fallback, and no-effect constraints.
- Required verifier attempts and exact sandbox blockers: after
  `npm ci --ignore-scripts` restored lockfile-defined dependencies,
  `npm run factory:check` failed because
  `scripts/check-agent-readiness.mjs` received `spawnSync git EPERM` at
  `git ls-files`. `npm run verify` reached `typecheck passed` but the full
  suite had 19 environment failures: the sandbox denied `listen` with
  `EPERM` for local-runtime HTTP tests and tsx IPC sockets. The direct full
  test result was `186 passed`, `3 skipped`, `3 failed` test files and
  `2,209 passed`, `5 skipped`, `19 failed` tests; its failures are outside
  the owned documents. No check script or sandbox configuration was changed
  to bypass either denial.
- Fresh-review handoff: review the final forward commit from
  `6da8aecc2731aa881fbf9443559e62f4a4192d59` against the approved Lane T
  design and program plan. Lead with the same-call promise identity and
  gate-key proof, complete forbidden-boundary coverage, audit fail polarity,
  ownership, append-only/provenance/no-fallback preservation, and the recorded
  sandbox-only verifier blockers. This worker does not self-approve, dispatch,
  start CF-1 or Tasks 149--151, use a provider, or merge into `neo`.

## RC-113-07 — Original-promise structural-audit repair started

- Recorded at: 2026-07-13T12:47:55Z.
- Status: in-progress. This is a forward-only Task 113 repair record; all
  prior claim entries and their verification evidence remain immutable.
- Recovery worker/branch/worktree:
  `codex/task-113-resident-full-vision-w0-trigger-plan-original-promise-repair` /
  `/tmp/cestus-task113-original-promise`, based at
  `2ebc4f4f29e9e1467794b4ade2372fc43a5907b4`.
- Scoped coordinator authority: the approved Lane T design at
  `docs/superpowers/specs/2026-07-12-resident-agent-proactive-triggers-design.md@9a571f628bef9c53725e20263cb687ec44dd9cd8`,
  governing program plan at
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`,
  and Task 113 original-promise documentation repair only. Stop after one
  verified repair commit and fresh review before CF-1, Tasks 149--151,
  production/provider work, child dispatch, or a merge into `neo`.
- Owned files remain only this append-only claim and
  `docs/superpowers/plans/2026-07-12-resident-agent-proactive-triggers-implementation.md`.
  No production, test, specification, registry, acceptance-matrix, or runtime
  file is authorized.
- Root cause: the prior same-call audit accepted a test that first awaited all
  in-flight calls, then only declared and re-awaited a resolved `losingPromise`.
  Its broad token checks did not prove that the original losing Promise itself
  was awaited for its result, that its re-read/evaluation used the same gate, or
  that a later evaluator call could not replace it.
- Documentation RED and GREEN evidence, host verifier outcomes, and fresh
  review handoff will be appended only after the structural repair is tested.

## RC-113-08 — Original-promise structural-audit repair verified

- Recorded at: 2026-07-13T12:52:19Z.
- Status: ready-for-fresh-review. This completes only the authorized Task 113
  documentation repair; it does not self-approve or authorize CF-1, Task 118,
  Tasks 149--151, production/provider work, child dispatch, or a merge.
- Documentation RED: the prospective structural audit, run against untouched
  `2ebc4f4f29e9e1467794b4ade2372fc43a5907b4` plan bytes, exited nonzero with
  `race test: missing original-promise test block`. The baseline used
  `Promise.all(inFlight)` before selecting the loser, so it could not meet the
  new original-Promise invariant.
- Repair: the isolated Task 118 race test now starts the two named original
  promises before any await, deterministically binds the source-5
  `losingPromise` to the direct evaluator call, assigns `loser` from
  `await losingPromise`, proves the exact requested/budget-exhausted outcomes,
  source-keyed second read, three fresh reads, and two equal gate-key append
  attempts. The plan's audit now strips comments, structurally validates only
  that test block, allows exactly two evaluator calls, and directly rejects
  await replacement, declaration-only promise, later evaluator call, and
  prose/count-only Promise-token variants while retaining the exhaustive
  forbidden-boundary matrix.
- Documentation GREEN: the original audit printed `GREEN: Task 113
  section-local plan audit passed (8 section checks; 10 counterfactuals
  rejected).`; the recovery audit printed `GREEN: Task 113 recovery audit
  passed (2 section checks; 25 counterfactuals rejected).`; and the new audit
  printed `GREEN: Task 113 original-promise structural audit passed (40
  counterfactuals rejected).` The new audit's 40 cases include all four direct
  original-Promise counterfactuals plus every selected Task 118 and matrix
  forbidden-boundary removal.
- Verification: `git diff --check` exited 0. The direct `npm run
  factory:check` reached `scripts/check-agent-readiness.mjs` but failed only at
  sandbox-denied `spawnSync git EPERM` for `git ls-files`. `npm run verify`
  then exited 127 before typecheck because this fresh worktree has no
  `node_modules/.bin/tsc`; no dependency, check-script, sandbox, or tracked
  workaround was changed. These are host/provisioning blockers, not evidence of
  a plan-test failure.
- Scope/self-review: `git status --short` is limited to this append-only claim
  and the authorized proactive-trigger implementation plan. The repair keeps
  the Lane T append-only ledger, authoritative mounted readback, provenance,
  no-effect, no-fallback, no-provider, and CF-1 ownership boundaries unchanged.
- Fresh-review handoff: review the one forward commit from
  `2ebc4f4f29e9e1467794b4ade2372fc43a5907b4` for executable original-Promise
  identity, same-gate and in-promise re-read proof, structural audit fail
  polarity, exhaustive forbidden-boundary preservation, ownership, and the
  recorded host verifier blockers. Do not begin dependent tasks or merge into
  `neo`.
