# Task 4 Claim: Agent Approval Cockpit Component

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`

Task heading: `Task 4: Approval Cockpit Component`

Worker identity: Codex

Branch: `codex/resident-agent-approval-cockpit-plan`

Worktree: `/home/drake/.codex/worktrees/b782/Cestus`

Claimed at: `2026-07-08T16:58:44Z`

Status: `claimed`

Owned files:

- `packages/ui/src/agent/AgentApprovalCockpit.tsx`
- `packages/ui/test/agent-approval-cockpit.test.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-workspace.test.tsx`
- `docs/agentic/claims/task-4-agent-approval-cockpit-component.md`
- `.superpowers/sdd/task-4-report.md`

Verification:

- Targeted failing command: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx`
- Targeted passing command: `npm test -- packages/ui/test/agent-approval-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx`
- Full gate: `npm run verify`

Stop conditions:

- The cockpit needs raw provider bytes, raw evidence text, secret-bearing diagnostics, or direct domain-service calls.
- Approval or denial actions become execution controls instead of append-only decision intents.
- Any change would weaken append-only ledger semantics, provenance requirements, projection rebuildability, or consume-time approval revalidation.
