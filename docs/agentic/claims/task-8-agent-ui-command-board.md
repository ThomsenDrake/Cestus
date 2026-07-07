# Task 8 Claim: Agent UI And Command Board Surface

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 8: Agent UI And Command Board Surface
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T18:54:07Z
Status: claimed

Owned files:
- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/src/App.tsx`
- `packages/ui/src/workspace/workspace-nav.ts`
- `packages/ui/src/workspace/command-types.ts`
- `packages/ui/src/workspace/command-model.ts`
- `packages/ui/test/command-model.test.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `packages/ui/test/agent-app-integration.test.tsx`
- `packages/ui/test/app-smoke.test.tsx`
- `packages/ui/test/operator-app-integration.test.tsx`
- `docs/agentic/claims/task-8-agent-ui-command-board.md`

Targeted commands:
- `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts`
- `npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx packages/ui/test/command-model.test.ts packages/ui/test/app-smoke.test.tsx packages/ui/test/operator-app-integration.test.tsx`
- `npm run verify`
- `git diff --check`

Invariant notes:
- Preserve append-only ledger semantics and projection rebuildability: UI reads browser-safe DTOs only and must not write ledger state directly.
- Preserve human gates: no browser control may approve, deny, execute, send, export, repair, clear locks, invoke providers, or accept graph truth.
- Preserve provider and credential boundaries: browser DTOs may show safe provider metadata only and must not expose live credentials, raw provider errors, or secret-shaped strings.
- Preserve command-board compatibility: `AgentBrief` may use `AgentStatusDto` when supplied but must keep existing fixture behavior when absent.
