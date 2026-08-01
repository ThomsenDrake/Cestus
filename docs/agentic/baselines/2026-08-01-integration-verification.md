# Integration Verification Baseline — 2026-08-01

Status: non-authoritative baseline debt record.

This records pre-cutover product-test debt once so later product slices can
detect regressions without rediscovering or silently reclassifying the same
failures. It is not factory authority and does not waive any new failure.

## Source State

- Integration branch: `neo`
- Integration commit: `baab662fb6ecd79de9a34f1c3801aa76d3428848`
- Candidate base: reference-only child
  `f06735b3b26b7701842513d677b6589af7f92d8d`
- Setup: clean isolated worktree followed by `npm ci`
- Command: `npm run verify`

## Exact Result

- Typecheck: passed.
- Vitest: 13 failed, 226 passed, 3 skipped test files.
- Tests: 51 failed, 3,316 passed, 5 skipped.
- UI build and the old factory gate were not reached because Vitest failed.

Failed files:

- `packages/agent/test/evidence-triage-workflow.test.ts`
- `packages/agent/test/resident-loop-scheduler-completion-imports.test.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/local-runtime/test/agent-approval-routes.test.ts`
- `packages/local-runtime/test/agent-cockpit-routes.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/local-runtime/test/agent-memory-routes.test.ts`
- `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- `packages/local-runtime/test/check-resident-task-prerequisites.test.ts`
- `packages/local-runtime/test/cli.test.ts`
- `packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts`
- `packages/local-runtime/test/server.test.ts`
- `packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts`

The failures comprise missing mounted prompt-readback witnesses, current
resident-agent/runtime availability mismatches, one scheduler completion
mismatch, and timeout-heavy source/import-policy checks. None of these files is
inside the software-factory cutover scope. A later candidate must run its
targeted checks and compare broad verification against this list; any added or
worsened failure is a regression.
