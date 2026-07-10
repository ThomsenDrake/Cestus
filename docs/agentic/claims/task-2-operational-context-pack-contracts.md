# Task 2 Claim: Operational Provider Contracts And Descriptors

Plan: `docs/superpowers/plans/2026-07-10-operational-context-packs-implementation.md`

Task heading: `Task 2: Operational Provider Contracts And Descriptors`

Worker identity: Codex

Branch: `codex/operational-context-packs-spec`

Worktree: `/home/drake/.codex/worktrees/a559/Cestus`

Claimed at: `2026-07-10T00:00:00Z`

Status: `claimed`

Owned files:

- `docs/agentic/claims/task-2-operational-context-pack-contracts.md`
- `packages/agent/src/operational-context-packs.ts`
- `packages/agent/src/index.ts`
- `packages/agent/test/operational-context-packs.test.ts`

Verification:

- Targeted RED: `npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/context-packs.test.ts`
- Targeted GREEN: `npm test -- packages/agent/test/operational-context-packs.test.ts packages/agent/test/context-packs.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Contract work would import local runtime, persistence, transport, React, or cockpit modules.
- Exact parser capabilities cannot remain non-serialized registration-time functions.
- A verifier fails after two focused repair attempts.
