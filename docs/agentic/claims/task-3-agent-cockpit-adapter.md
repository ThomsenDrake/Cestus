# Task 3 Claim: Agent Cockpit Browser Adapter

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
Requirements: `.superpowers/sdd/task-3-brief.md`
Task: Task 3: Browser Adapter For Cockpit And Task Handoff
Worker: Codex GPT-5
Branch: `codex/resident-agent-cockpit-task-run-plan`
Worktree: `/home/drake/.codex/worktrees/50b6/Cestus`
Claimed-at: 2026-07-09T01:45:25Z
Status: ready-for-review

Implementation recorded at: 2026-07-09T01:45:45Z

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

Command evidence:
- Red: `npm test -- packages/ui/test/agent-cockpit-adapter.test.ts` failed before implementation with 3 failing tests, including `Agent adapter does not expose loadCockpit.` and `Agent adapter does not expose createTask.`
- Targeted: `npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts` passed with 2 test files and 14 tests passing.
- Verify: `npm run verify` passed with `typecheck passed`, `Test Files  146 passed | 1 skipped (147)`, `Tests  1392 passed | 1 skipped (1393)`, `tests passed`, `vite build` succeeded, and `factory-readiness passed`.

Self-review notes:
- Added browser-safe cockpit, task-create, and run-start adapter methods using the existing fetch/redaction helpers and strict local route schemas.
- Static adapters now expose frozen cockpit fixtures and safe default mutation failures, with optional explicit test-double overrides for mutation methods.
- The adapter route surface remains limited to `/api/agent/cockpit`, `/api/agent/tasks`, and `/api/agent/runs`; no scheduler wake, provider transfer, PRR send, export, repair, legal escalation, accepted graph review, legacy import, or staging paths were added.
