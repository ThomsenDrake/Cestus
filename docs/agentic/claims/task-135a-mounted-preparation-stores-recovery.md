# Task 135A Recovery Claim: Mounted Preparation Stores

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, Task 135A.
- Worker: `/root/task135a_mounted_preparation_stores` (Terra/xhigh-attested).
- Branch: `codex/task-135a-mounted-preparation-stores`.
- Worktree: `/home/drake/.codex/worktrees/task-135a-mounted-preparation-stores`.
- Claimed at: 2026-07-15T05:12:00Z.
- Status: claimed.

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
