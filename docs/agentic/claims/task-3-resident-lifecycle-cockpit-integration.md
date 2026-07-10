# Task 3 Claim: Resident Lifecycle Cockpit Integration

- Plan: `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`
- Task: `Task 3: Cockpit, UI, And Operator Lifecycle Presentation`
- Worker: `Codex`
- Branch: `codex/resident-lifecycle-bootstrap-implementation`
- Worktree: `/home/drake/.codex/worktrees/14a7/Cestus`
- Claimed at: `2026-07-10T15:58:16Z`
- Started at: `2026-07-10T15:58:16Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-3-resident-lifecycle-cockpit-integration.md`
- `packages/agent/src/cockpit.ts`
- `packages/agent/test/cockpit.test.ts`
- `packages/local-runtime/src/operator-status.ts`
- `packages/local-runtime/test/operator-status.test.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-app-integration.test.tsx`

## Evidence

- RED: `npm test -- packages/agent/test/cockpit.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx` failed as expected because the blocked lifecycle need was not first, the operator agent section remained ready, and the Agent workspace omitted lifecycle state and safe message.
- Targeted GREEN: `npm test -- packages/agent/test/cockpit.test.ts packages/local-runtime/test/operator-status.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx packages/ui/test/app-smoke.test.tsx` passed: 5 files, 68 tests.
- Full verify: `npm run verify` passed: typecheck, 175 test files / 1,756 tests passed (3 skipped), Vite build, and factory readiness.
- Review: the cockpit consumes only the runtime-owned lifecycle DTO; operator output adds safe lifecycle provenance and blocked diagnostics; the browser parser remains Task 2's strict, redacted compatibility boundary; no execution, send, export, repair, provider-transfer, or run-start controls were added.
