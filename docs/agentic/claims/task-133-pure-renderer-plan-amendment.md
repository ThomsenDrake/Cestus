# Task133 discriminated-binding and Task140R0 plan-repair claim

- Status: forward-repaired candidate pending the documentation gate and a fresh
  independent defects-first plan review. The fresh review of full lineage
  `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..8169fc7f344ce40b0bbd91e60a66dab697d4446d`
  returned `NEEDS-CHANGES` on two P1 plan defects; this child repair addresses
  both without authorizing implementation.
- Coordinator-owned forward repair on
  `codex/task-133-pure-renderer-plan-amendment`, resumed from clean candidate
  `8169fc7f344ce40b0bbd91e60a66dab697d4446d`; the full amendment lineage begins
  at `0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8`. Only this claim and the active
  recovery plan are changed by this documentation task.

## Current Executable Contract

The current contract is the appended `CF-1R5 Task133 Raw-V2 And Task140R0
Data-Bridge Correction`, read with the preserved `CF-1R5 Task133 Discriminated
Binding Migration And Exact Renderer Amendment`, in
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.
The latest correction solely replaces the raw-v2 build contract/Task133.1
steps and the Task140R0 file/interface/step/command overlay. Together these are
the current executable contract. Earlier local-only, five-file, incomplete R0,
and contradictory omitted-hash prose remains rejected Git history and must not
be used as implementation instructions.

- `packages/agent/src/prompt-artifacts.ts` is the canonical data owner. It
  must expose an explicit legacy production-binding v1 and strict exact v2;
  v2 requires all exact-run/posture fields and canonical computed hashes. Its
  build input supplies canonical raw renderer material, raw scope, exact-run
  material, verified packs, and canonical rendered text rather than output
  hashes. The artifact owner derives all five output hashes and table-rejects
  `rendererHash`, `renderedPromptHash`, `scopeApplicabilityHash`,
  `providerPostureHash`, `exactRunBindingHash`, and the `postureHash`
  lookalike before builder acceptance. Unversioned bindings and
  caller-supplied derived hashes are invalid; no value is corrected or
  overwritten.
- `packages/agent/src/production-specialist-prompts.ts` retains
  `renderProductionSpecialistPrompt` as the deliberate v1 route for current
  callers and adds `renderExactlyBoundProductionSpecialistPrompt` as the v2
  route. Both use the same canonical text renderer once and the existing
  artifact builder once.
- `packages/agent/src/adapters/provider-byte-transfer.ts`, runtime event
  mapping, agent projection, ontology contract parsing, and workspace rebuild
  tests must strictly preserve both variants and the v2 hashes. No compatibility
  default, local artifact upgrade, duplicated hash algorithm, or public
  authority is permitted.
- The local runtime factory's verifier, mounted-context types, registrations,
  and capabilities remain private and out of Task133 scope. Task140R0 is the
  sole future v2 consumer after its existing private prerequisites; it rejects
  legacy and direct artifacts before any effect.
- Task140R0 creates the previously absent composition test and extends the
  agent-owned context-render path with required non-authoritative `attemptId`
  and `generatedAt` data. Only the factory-private wrapper combines those with
  captured workspace/mount/policy/provider authority to construct v2. Its
  expanded file list, exact focused command, RED/GREEN steps, legacy/direct-v2
  and swap matrix, and zero renderer/provider/ledger/runner/H/store/terminal
  rejection boundary are frozen in the latest correction.

## Frozen Prerequisites And Scope

Before implementation, the coordinator records a clean base descending from
Task120 `49c3490a262162bd1d7146994390a2a6b5052394`, Task126
`2e7a8a011ada9828f2978129ddc9f47719c33655`, Task127
`93a93844a18343a3d49933a4bf9fb92190224aa5`, Task128
`ba43f007c371229ca5ad96844f4b3bc08584702b`, Task129
`d362d1a73f45b947bcd6e1c7915c9e7fd9f96d3a`, Task130
`78f456263a9af1d010df494684ea2d0906134eb4`, and Task132A
`7ec1eb6885716ac7324839c578677366fe1bb244`. The implementation claim must
also record the integrated amendment SHA, exact program base, all frozen files,
the causal RED evidence, and the required explicit coordinator approval and
invocation of `superpowers:subagent-driven-development`.

The exhaustive migration file list, every current renderer call site, exact
RED/GREEN/final non-full commands, and coordinator-only integration gate are
frozen in that appended amendment. Full verification, provider/network/
credential/Nous activity, reset-credit redemption, `neo`, source
implementation in this worktree, self-review, self-integration, and merge are
closed.

## Documentation Validation And Handoff

Run only:

```bash
git diff --check && npm run factory:check
```

The fresh plan-review and final-gate review range is exactly
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. The reviewer must inspect
every commit in that full lineage: `38c2456f1f935aca291d24447c31b6a1d0728fd1`,
`ffc2dc81c189af3163ec7b573b4f6f4767660de7`,
`d91f28a3f6434490246daaa97e399a905c902761` (the final pre-correction repair),
`6f399c4d52d97bd2cc74a4800d065ce4bcb878bf`,
`8169fc7f344ce40b0bbd91e60a66dab697d4446d`, and this forward correction at
`HEAD`. Stop after a fresh independent Terra/xhigh review; only the
coordinator may integrate an approved amendment or explicitly approve and
invoke `superpowers:subagent-driven-development` for later implementation.

## Forward Correction — Full-Lineage Review And Owner-Derived V2 Hashes

This forward correction supersedes the prior generic full-lineage wording in
this claim and the active amendment. It preserves the preceding Task133 and
Task140R0 repairs as reviewable history, requires the exact range above for the
next fresh review, and does not authorize source/tests, provider work,
capabilities, shadow rendering, local artifacts, self-integration, or merge.

The earlier two-witness wording is superseded by the latest six-row exact-key
table over all five persisted output hashes plus `postureHash`. Every row must
reject before builder acceptance, correction, or envelope formation; v1
remains the explicit compatibility branch and v2 remains strict with no
defaults. Task140R0's latest bridge is data-only until its factory-private
wrapper combines reviewed captures; it creates no public authority or
implementation permission.

## Forward Correction — Post-Approval V2 Binding Lifecycle

- Status remains **plan-repair candidate only**. The already integrated
  `8169fc7f` plan and unintegrated `ceb255dd` bridge are explicitly
  non-authorizing after later full-lineage review proved that provider approval
  does not exist during context rendering. No Task133 source implementation is
  approved from either contract.
- The sole current lifecycle contract is the appended `CF-1R5 Task133
  Post-Approval V2 Binding Lifecycle Correction`. Context assembly renders one
  canonical v1 prompt exactly once; the current approval proof binds that exact
  v1 artifact and bytes; only after consume-time approval may the private
  Task140P/R0 port bind those same bytes into strict v2. V2 records
  `sourceApprovedPromptArtifactHash` and rerenders nothing.
- The canonical Task133 operation is now
  `bindApprovedProductionSpecialistPromptV2`, not
  `renderExactlyBoundProductionSpecialistPrompt`. Raw v2 accepts the parsed v1
  source artifact, raw scope, and raw exact-run/provider/workflow material. The
  artifact owner derives every persisted hash.
- Strict nested prohibited-key REDs cover
  `sourceApprovedPromptArtifactHash`, `rendererHash`, `renderedPromptHash`,
  `scopeApplicabilityHash`, `providerPostureHash`, `exactRunBindingHash`,
  `workflowDescriptorHash`, `postureHash`, and the four named lookalikes. No
  value is accepted, corrected, or silently overwritten.
- Task133 owns the canonical binder, v1-to-v2 approval/transfer validation, and
  strict durable event/projection/ontology/rebuild migration. Task140P alone
  owns the post-approval orchestrator/port call. Task140R0 alone owns the
  factory-private resolver and six live checks. Task140H may consume only the
  exact private-port-admitted v2. Their shared files are serialized in that
  order.
- Consume-time validation must bind the v2 source hash and byte-identical text
  to the current proof's v1 artifact, plus exact task/attempt/run/provider/
  context/workflow/workspace/mount/policy facts. Direct or caller-built v2,
  rerendered or swapped v1, stale approval, and every one-field swap reject
  before provider, ledger, runner, H, store, or terminal effects.
- The eventual implementation plan explicitly requires coordinator approval
  and invocation of `superpowers:subagent-driven-development` for each Task133,
  Task140P, Task140R0, and Task140H task. Full verification, provider/network/
  credential/Nous activity, reset credits, `neo`, source implementation in this
  worktree, self-integration, and merge remain closed.

Documentation validation is only:

```bash
git diff --check && npm run factory:check
```

The next fresh review must inspect exact full lineage
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`, including every rejected
intermediate amendment and this forward correction. Only an unqualified fresh
Terra/xhigh approval permits coordinator-only integration. Rejection requires
another forward correction; it never authorizes source dispatch.

## Forward Correction — Durable V1 Store And Opaque V2 Admission

- Status remains **plan-repair candidate only**. Full-lineage review of
  `220cf866` found no executable owner for v1 context rendering, no durable
  byte-identical v1 readback after restart, and no private channel from admitted
  v2 to the runner/provider consumer. Those omissions make `220cf866` and all
  earlier Task133 plan merges non-authorizing for source work.
- Task133.5 now owns the executable v1 path. It carries exact attempt/time as
  non-authoritative context data, renders v1 once with the attempt as the
  approval-draft run identity, persists canonical envelope bytes in the
  mounted prompt-artifact store, requires exact readback, and only then permits
  the context-ready hash checkpoint. No provider fact enters this path.
- The mounted prompt store is create-only, hash-addressed, parser-verified, and
  restart-readable from the portable workspace. Resident orchestration has no
  internal fallback after portable-drive configuration or disconnect. Prompt
  envelopes are not H material/manifest artifacts.
- Task140P returns an opaque identity-bound admission token and passes that
  exact token in the private runner dispatch. Token fields are diagnostic;
  private `WeakMap` membership is authority. Tokens are never serialized,
  projected, returned in route DTOs, or reconstructed structurally.
- Task140R0 persists and reads back strict v2 before token mint. Restart creates
  no trusted token: it rereads durable v1/approval/checkpoint facts, reruns all
  live checks, rebinds or byte-verifies v2, then mints a fresh token. Stale
  drive, lock, high-water, approval, provider, context, or bytes block remint.
- Task140H consumes the single-use token through the factory runner closure,
  rereads the mapped v2, and may mint a production invocation proof only when
  admission identity, v2/source-v1 hashes, task/attempt/run/provider/context,
  and mounted readback all match. A separate legacy identity proof or arbitrary
  hash is insufficient.
- The complete serialized path is now durable v1 -> consume-time approval ->
  durable v2 -> ephemeral admission token -> private runner consumption ->
  v2-bound invocation proof -> existing provider/H sequence. Every failed
  boundary has causal zero-effect tests; full/live gates remain closed.

The sole executable contract is the latest plan section read with the preceding
post-approval binder section. The next review range remains exact
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD`. Only an unqualified fresh
Terra/xhigh approval can authorize coordinator-only integration and later
explicit `superpowers:subagent-driven-development` dispatch.

## Forward Correction — Durable Receipt, Crash Recovery, And Sole Proof Mint

- Status remains **plan-repair candidate only**. Independent persistence review
  `019f64ac-d0f6-7a61-b4df-dfa6e76d2b0c` and authority review
  `019f64ac-d47c-7c73-82a5-a5cac255f5f4` both returned `NEEDS-CHANGES` on the
  full lineage through `b93190f2`. The earlier lifecycle can strand a reminted
  token behind `runner-dispatching`, has no durable v2 locator/timestamp receipt,
  does not revalidate mounted availability around every prompt store I/O, and
  leaves the live proof minter in `specialist-runner-kernel.ts` outside H.
- `CF-1R6 Durable Binding Receipt, Recovery State, And Invocation Ownership
  Correction` is now the sole executable overlay for Task133.3, Task133.5,
  Task140P, Task140R0, and Task140H. It introduces a strict hash-only
  `prompt-bound` checkpoint receipt, derives v2 time only from the durable
  approval event, and requires a fresh `mountPortableWorkspace` tuple check
  before and after each prompt artifact put/read. The production resident store
  is portable-only and has no internal fallback.
- Admission is two phase. R0 returns a private prepared binding only after exact
  durable v2 readback; the orchestrator appends and reads the receipt; the port
  then mints an ephemeral token from private prepared-object membership plus
  exact receipt-event readback. Restart repeats live checks and remints only
  from v1, approval, receipt, and mounted v2 evidence.
- Existing `runner-dispatching` is no longer an unconditional return. The
  deterministic invocation stream decides recovery: no request may dispatch;
  requested-only records one causally linked, non-retryable orchestration
  failure for an unknown provider outcome; failed needs a new explicitly safe
  task/retry policy and approval; completed never reinvokes and may resume only
  from durable derivative/handoff readback; terminal history returns without
  replay.
- Task140H's entire prior implementation block is superseded. H explicitly owns
  `specialist-runner-kernel.ts`, removes the public legacy proof mint, creates
  `production-specialist-invocation-proof.test.ts`, adds runtime proof-consumer
  coverage, consumes the exact private token once, and mints invocation
  authority only from the v2 readback-bound consumed admission. Its complete
  file set and runnable `&&` gate are frozen in CF-1R6.
- The interrupted Task133.1 source branch remains rejected historical input and
  cannot be committed, rebased, reviewed, or integrated from this plan repair.
  Full verification, provider/network/credential/Nous activity, reset credits,
  `neo`, source implementation in this worktree, self-review, self-integration,
  and merge remain closed.

Documentation validation remains only:

```bash
git diff --check && npm run factory:check
```

The next reviewer must inspect exact full lineage
`0481c1e0b921ff03e2f286ccf8e356f6fbf0cda8..HEAD` and return unqualified
`APPROVED` before coordinator-only integration. A later implementation message
must specifically approve `superpowers:subagent-driven-development` for every
serialized task.
