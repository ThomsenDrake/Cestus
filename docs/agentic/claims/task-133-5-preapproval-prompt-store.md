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
