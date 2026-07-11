# Task Claim: Production Prompt Approval Binding

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: `Task 5: Provider Transfer Approval And Audit Projection Binding`
- Worker: `Codex`
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Base commit: `68a8c091`
- Claimed at: `2026-07-11T09:06:25Z`
- Status: `blocked`

## Owned Files

- `docs/agentic/claims/task-5-production-prompt-approval-binding.md`
- `packages/agent/src/adapters/provider-byte-transfer.ts`
- `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/agent/test/projection.test.ts`

## Scope

Bind provider byte-transfer approval previews and model invocation audit projections
to the exact production prompt metadata while retaining only safe hashes, refs,
versions, statuses, and summaries.

## Planned Evidence

1. Add RED coverage for preview binding, freshness, and JSON redaction.
2. Run the exact Task 5 targeted RED command and record safe failure summaries.
3. Implement the smallest scoped binding across the owned adapter, runtime, and
   projection files.
4. Run targeted GREEN, `npm run verify`, and `git diff --check`.

## Stop Conditions

Stop and report blocked for prompt, resolved-payload, or provider-response
leakage; schema conflict; credential exposure; unsafe external-effect semantics;
or repeated verifier failure after two focused repair attempts.

## Blocked Evidence

- Before RED test edits, Task 5 contract inspection found a schema conflict:
  `agent.model-invocation.requested` is strict in the ontology event contract
  and currently allows only the pre-Task-5 prompt audit fields. The required
  production audit binding has no permitted event payload field.
- The Task 5 source ownership list excludes `packages/ontology/src/contracts.ts`.
  Adding production metadata in the owned runtime file would therefore fail the
  append-time schema validation instead of producing the required durable event.
- No prompt text, resolved payload values, provider response text, credentials,
  raw request bodies, or hidden paths were recorded.
