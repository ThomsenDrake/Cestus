# Task 2 Claim: Model Invocation Audit Metadata

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 2: Model Invocation Audit Metadata`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: `/home/drake/.codex/worktrees/9b6b/Cestus`

Claimed at: `2026-07-08T13:50:15Z`

Status: `claimed`

Owned files:

- `docs/agentic/claims/task-2-agent-model-invocation-audit.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/test/projection.test.ts`

Targeted commands:

- RED ontology: `npm test -- packages/ontology/test/agent-contracts.test.ts`
- RED runtime/projection: `npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts`
- GREEN targeted: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prompt-artifacts.test.ts`
- Full gate: `npm run verify`

Stop conditions:

- Schema conflicts with existing agent event contracts.
- Data-loss risk or any need to weaken append-only ledger semantics, provenance requirements, projection rebuildability, provider-transfer approval gates, legal locks, or secret-safety boundaries.
- Need to modify prompt-artifacts/context-packs, provider/local-runtime files, package lockfiles, or other files outside Task 2 scope.
- Repeated targeted or full verifier failure after two focused repair attempts.
