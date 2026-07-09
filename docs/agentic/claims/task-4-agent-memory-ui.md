# Task 4 Claim: Inspectable Agent Memory UI

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 4: Inspectable Agent Memory UI`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T13:48:21Z`

Status: `in-progress`

Owned files:

- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/AgentMemoryPanel.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/test/agent-memory-adapter.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `packages/ui/test/agent-app-integration.test.tsx`
- `docs/agentic/claims/task-4-agent-memory-ui.md`

Targeted commands:

- `npm test -- packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx`
- `npm run verify`

Stop conditions:

- Making memory visible would require importing Node-only runtime/domain modules into React.
- UI controls would accept assertions, resolve entities, send PRRs, export material, clear locks, execute repair, transfer provider bytes, or mutate legacy source trees.
- Memory correction controls would call anything except memory record/supersede/retract adapter methods.
- Text or controls cannot fit cleanly in the existing Agent workspace layout on mobile without a larger design pass.
- Scheduler DTOs are required instead of current/fake route DTOs.

Command evidence:

- Pending.

Invariant notes:

- React renders browser-safe DTOs and route results only.
- Memory remains visible working memory, not accepted ontology truth.
- UI filters and correction controls are product surface over runtime contracts, not a hidden graph-truth authority.
