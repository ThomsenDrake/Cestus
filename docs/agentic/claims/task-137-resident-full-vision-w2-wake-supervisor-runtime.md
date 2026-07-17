# Task137B-W Claim: Mounted Wake Supervisor Runtime

- Status: `claimed`
- Task: `Task137B-W`, Task 2 of `docs/superpowers/plans/2026-07-16-task137b-wake-schema-ownership-correction-implementation.md`
- Branch: `codex/task137b-wake-runtime-v3`
- Worktree: `/home/drake/.codex/worktrees/task137b-wake-runtime-v3/Cestus`
- Worker: `Codex Task137B-W implementation worker`
- Claimed at (UTC): `2026-07-16T00:00:00Z`
- Task base: `7400e3c0394fd929c58b0c21434f438f9816d923`

## Authority And Prerequisites

The v3 correction design is
`docs/superpowers/specs/2026-07-16-task137b-wake-schema-ownership-correction-design.md`.
The executable correction plan is
`docs/superpowers/plans/2026-07-16-task137b-wake-schema-ownership-correction-implementation.md`.
The original behavior remains the Task137B section at lines 4893-4974 of
`docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`.

Released prerequisites read before this claim:

- `Task135B`: candidate `23cf539ca9c84980bd6d36001cf60df69b611d74`, integration `908d26fa252989c9217cb40e1f22a5b9f583aa8f`, release `task136-release-v4-Task135B`.
- `T120-R`: candidate and integration `0b5185f0d0dd276164ec70d5db150f5f6ccb3a79`, release `task136-release-v4-T120-R`.
- `Task129-MFA`: candidate `38dbb91a883f5c91e7d07f8fefdfa7bd6ab199f7`, integration `c599f9d7c9e08de155bfb98f49462ad01416ec40`, release `task136-release-v4-Task129-MFA`.

Consumed authority and runtime contract blobs at claim time:

- `packages/agent/src/wake-supervisor.ts`: `53da3ff9b887545a675a3af10ee91907e058ea8d`
- `packages/local-runtime/src/mounted-artifact-authority-operation.ts`: `138d588949ddc9e361bbcca5c90352548d29f3e8`
- `packages/local-runtime/src/portable-workspace-lifecycle.ts`: `5197322a772c322f3f917069ab82da677ea09f5e`
- `packages/local-runtime/src/runtime-factory.ts`: `42822b2d549ae20bd353151583d63dc988397191`
- `packages/ontology/src/event-ledger.ts`: `1f2725ea598f653bd1e58d22eff29c0d9dd4cf04`
- `packages/ontology/src/contracts.ts`: `0331b31cbf98f330853a006f82f82f40cc0a83b5`
- `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`: `f0a50a5663f2a8a92e78dc66ec098697a2b098b2`
- `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`: `e4376726ac1449804010e1c923eb52d3ab776642`

The coordinator explicitly approved task-scoped
`superpowers:subagent-driven-development` and
`superpowers:test-driven-development`. This worker executes the one approved
Task137B-W slice continuously; review and integration remain coordinator work.

## Exact Owned Paths

1. `packages/local-runtime/src/wake-supervisor-runtime.ts`
2. `packages/local-runtime/src/mounted-wake-lifecycle-store.ts`
3. `packages/local-runtime/test/wake-supervisor-runtime.test.ts`
4. `packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts`
5. `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`
6. `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`
7. `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
8. `packages/ontology/src/contracts.ts`
9. `packages/ontology/test/resident-wake-contracts.test.ts`
10. `docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md`

## Global Constraints

- Add only the seven frozen canonical lifecycle schemas and the durable mounted
  lifecycle store/runtime behavior required by Task137B.
- Preserve append-only ledger semantics, strict durable readback, restart
  reconstruction, factory-only authority, provenance, no fallback storage,
  and stop-before-return invalidation.
- Keep the finite policy corpus at exactly eight allowed and twenty rejected
  fixtures, with exactly one `TASK137_POLICY_CORPUS_OK allowed=8 rejected=20`
  marker per prescribed command.
- Do not edit the program registry or any eleventh path; do not implement
  Task 3, Task139, or later work.
- Do not run `npm run verify`; do not use network, providers, credentials,
  external services, live APIs, push, reset, rebase, integrate, or touch
  `neo`.
- Stop with structured evidence on a schema/API conflict, data-loss or safety
  risk, unavailable dependency, or two failed focused repairs.

## Planned Evidence

The next commit will add the causal RED corpus only. The final candidate must
record the committed RED, focused and cross-lane counts, one policy marker for
each, typecheck, the six ordered terminal-gate stages plus completion, exact
cumulative scope, factory readiness, clean status, and non-symlinked
dependencies before it is offered for the coordinator's independent reviews.
