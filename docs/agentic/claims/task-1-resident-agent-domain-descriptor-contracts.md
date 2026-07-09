# Task 1 Claim: Resident Agent Domain Descriptor Contracts

- Plan: `docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md`
- Task heading: `Task 1: Pure Descriptor Contract And Failure Categories`
- Worker identity: Codex controller with subagent-driven implementer/reviewer flow
- Branch: `codex/resident-agent-domain-adapters-plan`
- Worktree: `/home/drake/.codex/worktrees/7018/Cestus`
- Claimed at: `2026-07-09T01:02:19Z`
- Status: `claimed`

## Owned Files

- `packages/agent/src/domain-execution-descriptors.ts`
- `packages/agent/test/domain-execution-descriptors.test.ts`
- `packages/agent/src/index.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/execution-loop.ts`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/agent/test/tool-gateway.test.ts`
- `packages/agent/test/execution-loop.test.ts`
- `docs/agentic/claims/task-1-resident-agent-domain-descriptor-contracts.md`

## Scope And Stop Conditions

This task is pure descriptor/type scaffolding plus failure-category alignment. It must not implement the scheduler dispatcher or any broad domain execution adapter. The scheduler/resumer descriptor interface is not present on this branch, so implementation must stop after Task 1 and before Task 2.

Preserve append-only ledger semantics, provenance requirements, projection rebuildability, human approval gates, legal escalation locks, provider byte-transfer gates, and secret-safe diagnostics.
