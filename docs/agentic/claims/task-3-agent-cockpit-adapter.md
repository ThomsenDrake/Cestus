# Task 3 Claim: Agent Cockpit Browser Adapter

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
Requirements: `.superpowers/sdd/task-3-brief.md`
Task: Task 3: Browser Adapter For Cockpit And Task Handoff
Worker: Codex GPT-5
Branch: `codex/resident-agent-cockpit-task-run-plan`
Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`
Claimed-at: 2026-07-09T01:45:25Z
Status: claimed

Owned files:
- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-cockpit-adapter.test.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `docs/agentic/claims/task-3-agent-cockpit-adapter.md`

Targeted commands:
- `npm test -- packages/ui/test/agent-cockpit-adapter.test.ts`
- `npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts`
- `npm run verify`

Invariant notes:
- The browser adapter may call only `/api/agent/cockpit`, `/api/agent/tasks`, and `/api/agent/runs` for this slice.
- The adapter must stay browser-safe and must not introduce Node-only imports.
- Runtime and malformed JSON failures must stay secret-safe and must not echo raw unsafe text.
