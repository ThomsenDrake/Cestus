# Task 2 Claim: Agent Projection Package

Plan: `docs/superpowers/plans/2026-07-07-cestus-resident-agent-implementation.md`
Task: Task 2: Agent Projection Package
Worker: Codex GPT-5
Branch: `codex/cestus-resident-agent-foundation`
Worktree: `/home/drake/.codex/worktrees/6fc5/Cestus`
Claimed-at: 2026-07-07T15:37:23Z
Status: in-progress

Owned files:
- `packages/agent/src/projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/fixtures/golden-agent-ledger.ts`
- `packages/agent/test/projection.test.ts`
- `docs/agentic/claims/task-2-agent-projection-package.md`

Targeted commands:
- `npm test -- packages/agent/test/projection.test.ts`
- `npm test -- packages/agent/test/projection.test.ts packages/ontology/test/agent-contracts.test.ts`
- `npm run verify`

Invariant notes:
- Preserve append-only ledger semantics: the projection may only derive current state by replaying supplied events.
- Preserve provenance and projection rebuildability: every projected object must carry source event IDs and causation references where present.
- Preserve human gates: task, tool, permission, and lock read models must reflect ledger events without granting implicit authority.
- Preserve provider byte-transfer approvals, PRR send gates, legal escalation locks, export/destructive-action gates, secret safety, and portable workspace compatibility.
- Preserve memory boundaries: agent memory can guide the resident agent but must not become accepted ontology truth.
