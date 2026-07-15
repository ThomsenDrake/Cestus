# Task 135A Recovery Claim: Mounted Preparation Stores

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, Task 135A.
- Worker: `/root/task135a_mounted_preparation_stores` (Terra/xhigh-attested).
- Branch: `codex/task-135a-mounted-preparation-stores`.
- Worktree: `/home/drake/.codex/worktrees/task-135a-mounted-preparation-stores`.
- Claimed at: 2026-07-15T05:12:00Z.
- Status: in-progress.

## Frozen Ancestry Gate

- Exact program base: `7fd10a7fcc08eb8ed315484cfcd1a08edeac2334`.
- CF-1 integration: `48c9cbcdcf723bcc74868f782bc2375bae565ae6`.
- Task121: `1a92a2c2e41a6f15282307c6a29deb196a2e3fb5`.
- Task122: `9839fbf8c9010425f8585a4eb5edd8879c738eba`.
- Task123: `87f5d940a4476fdcb0040c4554d5a7a2172d0c4b`.
- Task125: `2e5c35ab7bca33df9f1a0c482c496fbb93350086`.
- Reviewed/coordinator-integrated Task134A: `83a301d541e7fec5d0b29e6f2003566c06336158`.

`7fd10a7fcc08eb8ed315484cfcd1a08edeac2334` is a descendant of every
required frozen ancestor and records Task134A integration. A mismatch blocks
this task; this child neither rebases nor integrates.

## Exclusive Scope

- `packages/local-runtime/src/mounted-agent-artifact-stores.ts`
- `packages/local-runtime/test/mounted-agent-artifact-stores.test.ts`
- this append-only claim

The implementation consumes only parsed-but-untrusted Task134A preparation and
returns canonical data-only preparation readback from a captured mounted binder.
It must use the agent-owned codec; recheck authority, task, attempt, approved
run, and run type; and perform no material/manifest write or readback, H
activity, terminal state, task-status completion, default-factory, index, or
public capability/tuple/fallback work. Full `npm run verify` is closed; the
authorized final gate is the Task135A non-full fail-fast chain.

## Forward compiler-repair migration

- The original `7fd10a7f` base is preserved above as historical dispatch
  evidence. Coordinator-controlled preservation stashed the dirty exclusive
  source/test/claim lane, then no-ff merge `9e624531ae8e87af57a2e7f0a18a20ed171c143f`
  moved this branch forward through reviewed compiler-repair integration
  `271406fca811d49ee9ebb7ff31f58b0b870ac1d7`; the preserved work was restored
  afterward without reset, rebase, or child integration.
- The repaired program ancestry supplies
  `52bb8e5e22ffadbb21a72d95fe054630700abbeb` (the two-file TS2677/TS2322
  correction) and the actual post-merge single-compiler gate exit `0` recorded
  at program checkpoint `c2be6e89f840cf20d2c3f2bdc9eeb4d87a6fb68c`. This lane
  owns no part of that repair and may not alter either repaired file.
- Before review, this restored lane must rerun exactly:
  `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  The coordinator must obtain the single actual `tsc` exit after a no-live-
  compiler guard; full verification, provider/network/credential/Nous,
  reset-credit, neo, self-integration, and merge remain closed.
- Coordinator rerun after restoration used one detached shell and recorded exit
  `0`: 3 focused files / 52 tests passed, followed by `typecheck passed`,
  `git diff --check`, and `factory-readiness passed`; no `tsc` or npm process
  remained. This makes the three-file lane a candidate for fresh independent
  review only. It is not integrated, executable, durable-terminal, or H
  completion evidence.

## Independent Review Repair Evidence (2026-07-15)

- Repair author: `/root/task135a_store_identity_repair`. The current task
  session's latest authoritative `turn_context` in
  `/home/drake/.codex/sessions/2026/07/15/rollout-2026-07-15T01-49-46-019f6452-f55e-78e0-94bd-1b157a4a0ecf.jsonl`
  attests `gpt-5.6-terra` with `xhigh`; no later
  `thread_settings_applied` record exists in that session file.
- Causal test repair: after binder construction, the mutable captured
  `artifactStores` source now independently swaps `workspaceId`,
  `mountInstanceId`, `materialStore`, and `manifestStore`. Every case requires
  `prepare` to reject before all material/manifest `put`/`get` counters remain
  zero. Replacement stores share those counters, so the test also proves a
  replacement store was not called.
- RED-stage execution:
  `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts`
  exited `0` with 1 file / 18 tests passed. There was no runtime failure to
  repair: the existing `assertCapturedBindingCurrent` already re-captures the
  original stores and rejects all four changed identities. Accordingly this
  repair changes no production source.
- Process evidence: two no-live npm/tsc guards, six seconds apart, both
  reported `no-live-npm-or-tsc` before the one controlled final gate. The
  controlled `npm run typecheck` invokes the package script's actual
  `tsc --noEmit`; its successful compiler exit is evidenced by its
  `typecheck passed` output and the enclosing `&&` chain exit `0`.
- GREEN/final non-full gate exited `0`:
  `npm test -- packages/local-runtime/test/mounted-agent-artifact-stores.test.ts packages/agent/test/specialist-handoff-preparation.test.ts packages/agent/test/specialist-handoff-projection.test.ts && npm run typecheck && git diff --check && npm run factory:check`.
  It reported 3 test files / 56 tests passed, then `typecheck passed` and
  `factory-readiness passed`. Full verification, providers, network,
  credentials, Nous, reset-credit, neo, source changes, self-review,
  self-integration, and merges remain unperformed.
