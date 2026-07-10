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
- Review-fix RED: added coverage for unscoped multi-run replay, strict task-completed causation, prepared/recorded causation, and revision-without-supersession rejection. `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts` failed as expected with 3 failing projector assertions: cross-run final-output conflict, failed terminal accepted as task-completed, and wrong prepared causation accepted.
- Review-fix GREEN: the same targeted command passed with 3 test files and 35 tests after grouping final outputs per run/task/type/final-output scope and enforcing ledger causation for prepared, recorded, completed-run, and completed-task events.
- Review-fix verification: first `npm run verify` caught a TypeScript-only optional `taskId` fixture issue in the new multi-run test. After tightening that fixture, the targeted command passed again with 3 files and 35 tests, and `npm run verify` passed: typecheck; 172 passed test files, 3 skipped; 1,745 passed tests, 3 skipped; Vite production build; factory-readiness passed.
- Review-fix cleanup: removed tracked `.superpowers/sdd/task-3-report.md`; durable evidence now lives in this claim file.
- Second review-fix RED: added coverage for same-`handoffId` prepared compact-binding conflicts and post-terminal valid presentation supersession preserving completion state. `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts` failed as expected with 2 failing projector assertions: conflicting prepared handoffs projected `handoff-pending`, and a valid post-terminal revision-2 supersession projected `handoff-recorded` instead of preserving `task-completed`.
- Second review-fix GREEN: the same targeted command passed with 3 test files and 37 tests after grouping prepared events by durable handoff ID as well as event ID, and after task-completed detection reused a valid completed-run/task chain from the superseded same-run/task handoff.
- Second review-fix verification: `npm run verify` passed: typecheck; 172 passed test files, 3 skipped; 1,747 passed tests, 3 skipped; Vite production build; factory-readiness passed.
- Third review-fix RED: added coverage for same-run/task/type final-output conflicts with different step IDs, terminal causation/status mismatch, and supersession provenance drift through prompt/context refs. `npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts` failed as expected with 3 projector assertions: conflicting final-output projected `handoff-recorded`, failed/unrelated terminal projected `handoff-recorded`, and changed prompt/context supersession projected `handoff-recorded`.
- Third review-fix GREEN: the same targeted command passed with 3 test files and 39 tests after scoping final-output conflicts by run/task/type, enforcing terminal causation/status compatibility, and requiring supersession anchors to preserve prompt and context provenance.
- Third review-fix verification: `npm run verify` passed: typecheck; 172 passed test files, 3 skipped; 1,749 passed tests, 3 skipped; Vite production build; factory-readiness passed.
