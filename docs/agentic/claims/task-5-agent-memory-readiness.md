# Task 5 Claim: Factory Readiness And Final Verification

Plan: `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`

Task heading: `Task 5: Factory Readiness And Final Verification`

Worker identity: Codex subagent-driven worker

Branch: `codex/resident-agent-memory-context-plan`

Worktree: `/home/drake/.codex/worktrees/5ced/Cestus`

Claimed at: `2026-07-09T14:11:26Z`

Status: `in-progress`

Owned files:

- `scripts/check-agent-readiness.mjs`
- `docs/agentic/software-factory.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-memory-context-surface-implementation.md`
- `docs/agentic/claims/task-5-agent-memory-readiness.md`

Targeted commands:

- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/memory.test.ts packages/agent/test/memory-runtime.test.ts packages/agent/test/context-packs.test.ts packages/local-runtime/test/agent-memory-routes.test.ts packages/ui/test/agent-memory-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-app-integration.test.tsx`
- `git diff --check`
- `npm run factory:check`
- `npm run verify`

Stop conditions:

- Readiness tracking would require broadening the memory/context implementation scope.
- Verification repeatedly fails on the same memory/context regression after two focused repair attempts.
- Verification failure is unrelated existing suite flake; record exact evidence instead of patching unrelated behavior.
- Readiness evidence would need to include raw provider output, raw evidence bodies, secrets, or credential-shaped values.
- Final diff exposes a hidden path from memory to accepted ontology truth or external effects.
