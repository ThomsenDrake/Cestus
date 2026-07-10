# Task 3 Durable Specialist Handoff Projector Claim

Status: ready-for-review
Branch: codex/durable-specialist-handoffs-core
Plan: docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md
Spec: docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md

Claim:
- Worker: Codex
- Worktree: /home/drake/.codex/worktrees/1542/Cestus
- Claimed at (UTC): 2026-07-10T15:51:29Z

Scope:
- docs/agentic/claims/task-3-durable-handoff-projector.md
- packages/agent/src/specialist-handoff-projection.ts
- packages/agent/test/specialist-handoff-projection.test.ts
- packages/agent/src/projection-types.ts
- packages/agent/src/index.ts
- packages/agent/test/projection.test.ts
- packages/agent/test/cockpit.test.ts
- .superpowers/sdd/task-3-report.md

RED:
- Command: npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
- Expected failure: buildSpecialistHandoffProjection and projector types are absent; no durable projector exists to fail closed on crash-state readback.

GREEN:
- Command: npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
- Expected pass: all Task 3 projector, projection, and cockpit no-synthesis assertions pass.

Verification:
- npm run verify

Review:
- Spec review: pending
- Code review: pending

Evidence:
- RED: `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts` failed as expected because `../src/specialist-handoff-projection.js` does not exist. Existing `projection.test.ts` and `cockpit.test.ts` passed in the same run.
- GREEN: `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts` passed with 3 test files and 32 tests.
- Typecheck: `npm run typecheck` passed.
- Full verification: first `npm run verify` attempt cleared typecheck but Vitest exited with SIGTERM 143 after SQLite experimental warnings and no test failure output. Immediate rerun of `npm run verify` passed: typecheck; 172 passed test files, 3 skipped; 1,742 passed tests, 3 skipped; Vite production build; factory-readiness passed.
- Implementation commit: this `feat: project durable specialist handoffs from ledger state` commit.
