# Task133.5 Claim: Portable Pre-Approval V1 Prompt Store Recovery

- Plan: `docs/superpowers/plans/2026-07-14-resident-agent-factory-authority-recovery-implementation.md`, CF-1R9 Task133.5 with CF-1R10 fallback-removal, CF-1R11 opaque mounted-readback, and CF-1R12 fresh-witness overlays.
- Worker: `/root`.
- Branch: `codex/task-133-5-preapproval-prompt-store-recovery`.
- Worktree: `/home/drake/.codex/worktrees/67b2/Cestus`.
- Source base: `140bfd3a0552bcba9ce599bdffe01036a8d2d060`.
- Claimed at (UTC): `2026-07-15T20:35:57Z`.
- Status: `in-progress`.

## Scope

This recovery owns the full Task133.5 file set, including the CF-1R10 and
CF-1R11 overlays:

```text
packages/agent/src/task-orchestrator-types.ts
packages/agent/src/task-orchestrator-context.ts
packages/agent/src/task-orchestrator.ts
packages/agent/src/specialist-runner-kernel.ts
packages/agent/src/production-prompt-readback.ts
packages/agent/test/task-orchestrator-context.test.ts
packages/agent/test/task-orchestrator-evidence-triage.test.ts
packages/agent/test/specialist-runner-kernel.test.ts
packages/agent/test/production-prompt-readback.test.ts
packages/local-runtime/src/agent-prompt-artifacts.ts
packages/local-runtime/src/agent-runtime-factory.ts
packages/local-runtime/src/mounted-prompt-artifact-store.ts
packages/local-runtime/test/agent-prompt-artifacts.test.ts
packages/local-runtime/test/agent-prr-context-packs.test.ts
packages/local-runtime/test/mounted-prompt-artifact-store.test.ts
packages/local-runtime/test/agent-runtime-preapproval-prompt.test.ts
docs/agentic/claims/task-133-5-preapproval-prompt-store.md
```

## Recovery Constraints

The portable store preserves canonical serialized envelope bytes and reparses
them through the existing parser on readback. It has no in-memory, pathname, or
internal-disk fallback. The factory owns the exact attempt/timestamp snapshot,
render/store/readback sequence, and lexical witness handoff. The internal
readback witness is one-use identity authority only; it is not exported from
the agent index. A fresh runtime rereads durable V1 and issues a distinct
witness. This task performs no provider, network, credential, Nous, full
verification, `neo`, merge, rebase, push, or self-integration activity.

## Candidate Evidence

- Focused CF-1R11/R12 command: 8 files passed, 84 tests passed.
- The earlier `npm run typecheck` entry is superseded by the coordinator-admission correction below.
- Full verification, provider/network/credential/Nous activity, `neo`, merge/rebase/push, and self-integration remain excluded.

## Coordinator admission correction — 2026-07-15

Candidate `6e62b9420fa1776554e573df59d8033a6d750443` is rejected before external
review.  A fresh canonical-link `npm run typecheck` exited `2`; this recovery
reproduced the same diagnostic set before repair:

- `production-prompt-readback.test.ts` forges a structural witness without the
  private `MountedProductionPromptReadbackWitness` brand.
- `agent-runtime-factory.ts` and `mounted-prompt-artifact-store.ts` leave the
  exact store/factory callback inputs implicit `any`.
- PRR and mounted-store fixtures widen canonical `sha256:` template values to
  `string`, and the PRR test dereferences an optional witness without a real
  narrowing assertion.

The replacement remains constrained to the claimed Task133.5 paths.  It must
obtain any tested witness through the real issuer/readback path (or exercise
structural rejection without fabricating a branded value), retain exact
template-literal hashes, and rerun the focused eight-file suite plus a
standalone typecheck before becoming a new candidate.

## Second recovery ownership — 2026-07-15

- Worker: `/root`.
- Branch: `codex/task-133-5-preapproval-prompt-store-recovery-2`.
- Worktree: `/home/drake/.codex/worktrees/2f54/Cestus`.
- Recovery base: `c96db07b8a9e19939fa3e6801b31d82e5c96b13c`.
- Status: `in-progress`.

Candidate `c96db07b8a9e19939fa3e6801b31d82e5c96b13c` is retained only as
rejected forensic evidence. Independent reviews
`019f67b3-640d-7fb2-8569-9261d2745d92` and
`019f67b3-71f6-7d01-80f0-af3838059113` both returned `NEEDS-CHANGES`:

- mounted readback and the registrar rebind caller-supplied task/run/scope
  facts instead of deriving them from the canonical parsed V1 artifact;
- consumption does not revalidate the current mount/root/blob/process tuple,
  so a prior-mount witness remains usable;
- restart recovery only consults an in-memory witness map, delayed resume
  compares a newly sampled time to the artifact time, and context-ready can
  accept renderer or approval-hash fallbacks; and
- the claimed lifecycle and adversarial tests are placeholders rather than
  causal mounted-workspace regressions.

This recovery replaces those paths as one coherent authority and restart
boundary. It preserves portable-only canonical-byte storage, lexical
one-use/private witness authority, exact template hashes, and the no-prompt
text boundary. No provider, network, credentials, Nous, full verification,
`neo`, merge, rebase, push, or integration action is authorized.

## Second recovery candidate evidence — 2026-07-15

- Production readback derives task/run/run type from the canonical V1 `Run:`
  line and scope applicability from parsed production metadata. It does not
  accept caller task/run/scope/root/blob/process facts.
- The opaque authority captures the mounted workspace/root/blob tuple and a
  process-local mount instance. Consumption rereads canonical mounted bytes and
  revalidates the current tuple before use; a fresh mounted-store authority
  invalidates a prior-process witness.
- The kernel retains the artifact's authoritative `generatedAt`, revalidates
  around every awaited pre-consumption operation, and compares a recomputed
  current scope hash only to reject a stale or swapped artifact.
- Context-ready has no renderer or approval-hash fallback: it requires the
  mounted-readback hash to equal the rendered canonical artifact hash. A fresh
  local factory can locate the durable context-ready checkpoint, reconstruct
  authoritative pack readbacks, reread the V1 by hash, and issue a new lexical
  witness without rerendering.
- Focused CF-1R11/R12 eight-file command passed: 8 files, 86 tests.
- Standalone `npm run typecheck` passed. The three required negative `rg`
  gates, `git diff --check`, and `npm run factory:check` passed.
- Full verification, provider/network/credential/Nous/reset-credit/`neo`,
  merge/rebase/push, and self-integration were not run.
