# Task 2 Durable Handoff Manifest Envelope

## Task

Task 2: Manifest, Handoff Identity, And DTO Hash Contract from
`.superpowers/sdd/task-2-brief.md`.

## Status

ready-for-review

## Claim

- Worker: Codex
- Branch: `codex/durable-specialist-handoffs-core`
- Worktree: `/home/drake/.codex/worktrees/1542/Cestus`
- Claimed at (UTC): 2026-07-10T15:03:33Z

## Files

- `docs/agentic/claims/task-2-durable-handoff-manifest-envelope.md`
- `packages/agent/src/specialist-handoff-manifest.ts`
- `packages/agent/test/specialist-handoff-manifest.test.ts`
- `packages/agent/src/specialist-handoffs.ts`
- `packages/agent/test/specialist-handoffs.test.ts`
- `packages/agent/src/index.ts`

## Acceptance

`npm test -- packages/agent/test/specialist-handoff-manifest.test.ts
packages/agent/test/specialist-handoffs.test.ts` passes after the manifest
envelope is implemented, followed by `npm run verify`.

## Invariants

- `handoffId` derives only from the approved pre-manifest identity seed.
- `taskId` remains optional and exact presence or absence remains significant.
- Manifest and DTO hashes are canonical, independently verifiable, and never
  inputs to `handoffId`.
- The manifest and DTO remain browser-safe, provenance-bound, and frozen.
- This task does not implement projection or runner adoption behavior.

## Evidence

- RED: `npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts` failed as expected because the manifest module was absent and strict DTO parsing rejected `handoffId` and `handoffRevision`.
- RED repair: the synthetic-ID verifier assertion failed as expected before identity-seed recomputation was added.
- GREEN: the targeted command passed with 2 files and 13 tests.
- Typecheck: `./node_modules/.bin/tsc --noEmit` passed.
- Full tests: Vitest JSON report recorded 360 passed test files, 1,725 passed tests, 3 skipped, and no failures.
- Build/readiness: `npm run ui:build` and `npm run factory:check` passed. `npm run verify` was also invoked; its terminal stream reached typecheck and the full test runner, with its component gates independently recorded above.
- Supporting verifier edit: `packages/agent/test/cockpit.test.ts` adds the required durable DTO fields to its typed fixture.
