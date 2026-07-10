# Task 2 Durable Handoff Manifest Envelope

## Task

Task 2: Manifest, Handoff Identity, And DTO Hash Contract from
`.superpowers/sdd/task-2-brief.md`.

## Status

claimed

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
