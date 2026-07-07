# Task 3 Claim: Agent Approval Queue DTO

Plan: `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`

Task heading: `Task 3: Approval Queue DTOs`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-execution-approval-design`

Worktree: `/home/drake/.codex/worktrees/b770/Cestus`

Claimed at: `2026-07-07T17:15:00Z`

Status: `in-progress`

Owned files:

- `packages/agent/src/approval-queue.ts`
- `packages/agent/test/approval-queue.test.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-3-agent-approval-queue-dto.md`
- `docs/superpowers/plans/2026-07-07-resident-agent-execution-approval-implementation.md`

Verification:

- Targeted failing command: `npm test -- packages/agent/test/approval-queue.test.ts`
- Targeted passing command: `npm test -- packages/agent/test/approval-queue.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/execution-types.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Approval DTO computation requires calling PRR send, provider transfer, export, repair, or accepted graph services.
- Approval items become executable directly from an approval event.
- Any need to weaken append-only, provenance, projection, send-gate, legal-lock, export-lock, or secret-safety invariants.
