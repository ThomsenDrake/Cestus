# Task 3 Durable Specialist Handoff Projector Claim

Status: claimed
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
