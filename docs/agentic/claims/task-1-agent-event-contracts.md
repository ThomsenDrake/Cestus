# Task 1 Claim: Agent Event Contracts

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 1: Agent Event Contracts
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T14:50:08Z
Status: in-progress

Owned files:
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `docs/agentic/claims/task-1-agent-event-contracts.md`

Targeted commands:
- `npm test -- packages/ontology/test/agent-contracts.test.ts`
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/ontology/test/contracts.test.ts`
- `npm run verify`

Invariant notes:
- Preserve append-only ledger semantics: agent identity, tasks, runs, tools, memory, permissions, and locks must be represented as new events, not hidden mutation.
- Preserve provenance and projection rebuildability: every agent event must carry deterministic IDs and stream routing that projections can replay.
- Preserve human gates: agent actors must not satisfy approvals, policy installs, permission grants/revocations, identity updates, or lock clearing.
- Preserve provider byte-transfer approvals, PRR send gates, legal escalation locks, export and destructive-action gates, and legacy import evidence-first boundaries.
- Preserve secret safety: credential references are IDs only, and agent event payloads must not accept secret-shaped credential values or unknown fields.
- Preserve portable workspace compatibility: contracts must remain deterministic, local-first, and browser-safe for later DTO surfaces.
