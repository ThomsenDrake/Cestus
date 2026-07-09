# Task 1 Report: Agent Scheduler Contracts

## Status

ready-for-review

## Commits

- `2c58916` `chore: claim task 1`
- `8709386` `feat: add agent scheduler contracts`

## Files Changed

- `docs/agentic/claims/task-1-agent-scheduler-contracts.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
- `packages/agent/src/index.ts`
- `packages/agent/src/scheduler-types.ts`
- `packages/agent/src/tool-gateway.ts`
- `packages/agent/test/scheduler-types.test.ts`

## Red Command Output Summary

Command: `npm test -- packages/agent/test/scheduler-types.test.ts`

Result: failed as expected before implementation.

- `agentSchedulerWakeResultDtoSchema` was `undefined`, so `.parse()` failed.
- `hashAgentToolPreview` was not exported, so the preview-hash parity test failed.

## Green Command Output Summary

Command: `npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts`

Result: passed.

- `Test Files  2 passed (2)`
- `Tests  30 passed (30)`

## `npm run verify` Summary

Result: passed.

- `typecheck passed`
- `Test Files  144 passed | 1 skipped (145)`
- `Tests  1376 passed | 1 skipped (1377)`
- `tests passed`
- Vite production build succeeded
- `factory-readiness passed`

## Self-Review

- Kept the scheduler slice contract-only: DTO schemas, descriptor interfaces, and the shared preview-hash export.
- Reused the gateway's existing sanitization path for public preview hashing so the scheduler cannot drift onto a looser hash boundary.
- Avoided adding any domain execution semantics, tool routing, or approval-bypass behavior.

## Concerns

- `hashAgentToolPreview()` now re-sanitizes previews even when `requestTool()` already sanitized them first. That preserves safety and parity, but it is a small duplicate validation cost.

## Review Fix

### Commits

- Pending commit: `fix: tighten scheduler dto secret-safe parsing`

### Files Changed

- `packages/agent/src/scheduler-types.ts`
- `packages/agent/test/scheduler-types.test.ts`

### Red Summary

- Command: `npm test -- packages/agent/test/scheduler-types.test.ts`
- Result: failed as expected before the fix.
- Evidence: 9 new negative cases proved the scheduler wake-result DTO still accepted unsafe `toolRequestId`, `runId`, `toolId`, `toolVersion`, `approvalClass`, `category`, `message`, and `allowedNextActions` values.

### Green Summary

- Command: `npm test -- packages/agent/test/scheduler-types.test.ts packages/agent/test/tool-gateway.test.ts`
- Result: passed.
- Evidence: `Test Files  2 passed (2)`, `Tests  39 passed (39)`.

### Verify Summary

- Command: `npm run verify`
- Result: passed.
- Evidence: `typecheck passed`, `Test Files  144 passed | 1 skipped (145)`, `Tests  1385 passed | 1 skipped (1386)`, `tests passed`, Vite production build succeeded, `factory-readiness passed`.

### Self-Review

- Tightened the scheduler DTO boundary with the same secret-safe and canonical approval-class refinement style already used by `approval-cockpit.ts`, without adding execution semantics or changing scheduler interfaces.
- Added focused negative tests at the public DTO boundary, including both top-level and per-item `allowedNextActions`.
- Kept the fixtures aligned with the shared `assertAgentSecretSafeText()` predicate so the new tests prove parity with existing public DTO behavior instead of inventing a stricter private rule.
