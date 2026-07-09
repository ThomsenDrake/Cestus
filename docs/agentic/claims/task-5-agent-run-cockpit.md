# Task 5 Claim: Agent Run Cockpit

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`

Task heading: `Task 5: Run Cockpit Panels`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-cockpit-task-run-plan`

Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`

Claimed at: `2026-07-09T13:31:58Z`

Status: `claimed`

Owned files:

- `packages/ui/src/agent/AgentRunCockpit.tsx`
- `packages/ui/test/agent-run-cockpit.test.tsx`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-workspace.test.tsx`
- `packages/ui/test/agent-approval-cockpit.test.tsx`
- `docs/agentic/claims/task-5-agent-run-cockpit.md`
- `.superpowers/sdd/task-5-report.md`

Verification:

- Targeted failing command: `npm test -- packages/ui/test/agent-run-cockpit.test.tsx`
- Targeted passing command: `npm test -- packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-approval-cockpit.test.tsx`
- Full gate: `npm run verify`

Stop conditions:

- The run cockpit needs runtime execution, direct model invocation, raw prompt text, or domain-service imports instead of browser-safe DTO projection.
- Any change would add forbidden direct action buttons or let the run cockpit bypass the existing approval cockpit decision surface.
- Any change would weaken append-only ledger semantics, provenance requirements, or projection rebuildability.

Implementation log:

- Claim commit: pending
