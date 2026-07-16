# Task135B Claim: Portable Mounted Handoff Stores

- **Status:** ready-for-review
- **Task:** Task135B component-only, operation-bound portable mounted handoff-store producer
- **Claimed at (UTC):** 2026-07-16T22:08:48Z
- **Worker:** Codex Task135B implementation owner
- **Branch:** `codex/task135b-portable-mounted-handoff-stores`
- **Worktree:** `/home/drake/.codex/worktrees/task135b-portable-mounted-handoff-stores`
- **Exact dispatch base:** `44db1ca0c34076c7235da229109614d59ddb4457`
- **Task117A immutable coordinator attestation:** `1cde7adb1a3b9fb1621b75410c203eec631a45ba`
- **Released Task137A revision:** `85e5c6cbc86f4d636702ce825baf21eb7d7ac89c`
- **Released Task129-MFA integration:** `c599f9d7c9e08de155bfb98f49462ad01416ec40`
- **Plan:** `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md` (Task135B final overlays at 4199, 4822, 5300, 5522, and 6414)
- **Supporting design/plan:** `docs/superpowers/specs/2026-07-16-mounted-provider-feasibility-authority-recovery-design.md`; `docs/superpowers/plans/2026-07-16-mounted-provider-feasibility-authority-recovery-implementation.md`

## Exclusive Scope

1. `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`
2. `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
3. `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`

No package index, runtime factory, lifecycle, authority-operation, existing test,
agent, ontology, registry, Task139, `neo`, integration, or release-record edit is
authorized.

## Execution Authority

The coordinator explicitly approves task-scoped
`superpowers:subagent-driven-development` and
`superpowers:test-driven-development` for Task135B only. The implementation
will write and causally observe the focused RED before production code, then run
the identical GREEN command and the prescribed bounded review command.

The producer accepts only an exact `MountedArtifactAuthorityOperation` and exact
run identity. It obtains mounted state, paths, ledger, currentness, and
progression only through the operation's private inspector/capture. Its source-
private result is `factory-portable-mounted-agent-handoff-result.v1`, containing
only a frozen data/store binding and a separate opaque frozen controller identity
backed by module-private maps.

## Restrictions And Stop Conditions

- Do not run `npm run verify` or a full verifier.
- Do not use providers, network, credentials, external services, or Nous.
- Do not push, reset, rebase, integrate, merge, release, or touch `neo`.
- Stop and return structured evidence for a schema conflict, unavailable
  dependency, data-loss risk, or repeated focused-verifier failure.
- Commit the claim first, commit implementation/evidence in forward history,
  update this claim's latest status to exactly `ready-for-review`, then stop for
  two fresh exact-revision reviews.

## Verification Evidence

- RED: `npm test -- packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
  exited `1` because `portable-mounted-agent-artifact-stores.js` was absent;
  Vitest collected no tests.
- GREEN: the identical focused command passed `1` file and `13` tests.
- Prescribed aggregate review command passed `9` files and `113` tests;
  `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`, `typecheck passed`, and
  `factory-readiness passed` were observed.
- `npm run verify`, provider/network/credential activity, Task139 work,
  integration, release, push, reset, rebase, and `neo` actions were not run.

## Task135B one-admission correction

- **Status:** in-progress
- **Correction authority:** `RV-1-E-647`
- **Starting candidate:** `bdf7d2a9eb75499d273a5ee2b7900dc3fc3c5d14`
- **TASK135B_CORRECTION_SHA:** `6b203d03d2342cee2c8d8712710a3ad61600a98a`
- **Governing design:** `docs/superpowers/specs/2026-07-16-task135b-one-admission-cursor-design.md`
- **Governing plan:** `docs/superpowers/plans/2026-07-16-task135b-one-admission-cursor-implementation.md`
- **Exact ceiling:** `packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts`,
  `packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`, and
  `docs/agentic/claims/task-135b-portable-mounted-handoff-stores.md`
- **Coordinator authorization:** task-scoped
  `superpowers:subagent-driven-development` and
  `superpowers:test-driven-development` are explicitly authorized for this
  correction. This record does not claim an approval.
- **RED receipt:** `npm test --
  packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts`
  exited `1` with `1` file / `20` tests. Named review-gap failures were
  `foreign resident actor cannot advance canonical handoff authority`,
  `attempt swapped orchestration cannot advance task status authority`,
  `mismatched final prepared recorded and terminal artifacts burn authority`,
  and `hostile ledger values fail before serialization observation or store io`.
