# Task 2 Claim: Model Invocation Audit Metadata

Plan: `docs/superpowers/plans/2026-07-08-resident-agent-prompt-artifact-context-resolver-implementation.md`

Task heading: `Task 2: Model Invocation Audit Metadata`

Worker identity: Codex GPT-5

Branch: `codex/resident-agent-prompt-artifact-plan`

Worktree: `/home/drake/.codex/worktrees/9b6b/Cestus`

Claimed at: `2026-07-08T13:50:15Z`

Status: `ready-for-review`

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

Implementation evidence:

- Claim commit: `0282826 chore: claim task 2 agent model invocation audit`
- Ontology RED: `npm test -- packages/ontology/test/agent-contracts.test.ts` failed with 1 expected failing test because strict `agent.model-invocation.requested` rejected prompt artifact audit metadata.
- Ontology GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts` passed with 1 file and 25 tests.
- Runtime/projection RED: `npm test -- packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts` failed with 5 expected failing tests because remote invocation still accepted hash-only input and projection DTOs had no prompt audit metadata.
- Targeted GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prompt-artifacts.test.ts` passed with 4 files and 55 tests.
- Full gate: `npm run verify` passed with typecheck, 131 test files, 1276 tests, Vite build, and factory-readiness.
