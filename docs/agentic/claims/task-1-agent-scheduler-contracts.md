# Task 1 Claim: Agent Scheduler Contracts

Plan: `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
Task: Task 1: Scheduler Contracts And Preview Hash Boundary
Branch: `codex/mvp-resident-agent-scheduler-resumer-plan`
Status: ready-for-review

## Owned Files

- `packages/agent/src/scheduler-types.ts`
- `packages/agent/test/scheduler-types.test.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/src/index.ts`
- `docs/agentic/claims/task-1-agent-scheduler-contracts.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`

## Verification

- Red: `npm test -- packages/agent/test/scheduler-types.test.ts`
- Green: `npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts`
