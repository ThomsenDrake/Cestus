# Task 4 Claim: Agent Task Composer

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`

Task heading: `Task 4: Task Composer And Safe Handoff Controls`

Worker identity: Codex

Branch: `codex/resident-agent-cockpit-task-run-plan`

Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`

Claimed at: `2026-07-09T02:05:13Z`

Status: `claimed`

Owned files:

- `packages/ui/src/agent/AgentTaskComposer.tsx`
- `packages/ui/test/agent-task-composer.test.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-workspace.test.tsx`
- `docs/agentic/claims/task-4-agent-task-composer.md`
- `.superpowers/sdd/task-4-report.md`

Verification:

- Targeted failing command: `npm test -- packages/ui/test/agent-task-composer.test.tsx`
- Targeted passing command: `npm test -- packages/ui/test/agent-task-composer.test.tsx packages/ui/test/agent-workspace.test.tsx`
- Full gate: `npm run verify`

Stop conditions:

- The composer needs raw provider bytes, raw prompt text, secret-bearing diagnostics, or direct domain-service execution.
- Start controls bypass callback-only UI boundaries or attempt forbidden provider transfer, PRR send, export, repair, lock clearing, accepted graph, scheduler wake, import, or staging actions.
- Any change would weaken append-only ledger semantics, provenance requirements, projection rebuildability, or approval-gated runtime safety.

Implementation log:

