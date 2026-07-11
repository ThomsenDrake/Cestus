# Task Claim: Production Prompt Approval Binding

- Plan: `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- Task: `Task 5: Provider Transfer Approval And Audit Projection Binding`
- Worker: `Codex`
- Branch: `codex/production-specialist-prompt-template-registry-spec`
- Worktree: `/home/drake/.codex/worktrees/cde7/Cestus`
- Base commit: `68a8c091`
- Claimed at: `2026-07-11T09:06:25Z`
- Status: `ready-for-review`

## Owned Files

- `docs/agentic/claims/task-5-production-prompt-approval-binding.md`
- `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md` (approval-scoped Task 5 ownership amendment)
- `packages/ontology/src/contracts.ts` (coordinator-approved supporting event contract)
- `packages/ontology/test/agent-contracts.test.ts` (coordinator-approved supporting event contract tests)
- `packages/agent/src/adapters/provider-byte-transfer.ts`
- `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- `packages/agent/src/runtime.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/test/runtime.test.ts`
- `packages/agent/test/projection.test.ts`
- `packages/agent/test/prr-negotiation-workflow.test.ts` (supporting verifier fixture preserving production audit binding)
- `packages/agent/test/evidence-triage-workflow.test.ts` (supporting verifier fixture using real production prompt audit)

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

## Coordinator Approval To Resume

- Coordinator approved a focused supporting ontology event-contract update for
  `agent.model-invocation.requested` v1 after the schema-conflict stop.
- The approval expands Task 5 ownership only to
  `packages/ontology/src/contracts.ts`,
  `packages/ontology/test/agent-contracts.test.ts`, and the Task 5 plan/claim
  lines needed to record the support.
- The ontology binding remains optional for historical replay, while the new
  production runtime path must require it for the six MVP production run types.
- The binding may contain only hashes, IDs, versions, applicability statuses,
  and resolved payload audit metadata; it must never contain production prompt
  text, provider response text, resolved payload values, credentials, request
  bodies, hidden paths, or generic metadata bags.

## Verification Scope Block

- Targeted Task 5 RED: failed as intended because the ontology event contract,
  strict provider-transfer parser, runtime append path, and projection did not
  yet carry the production audit binding.
- Targeted Task 5 GREEN: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts` passed with 4 files and 96 tests.
- `npm run verify` is blocked by the existing unowned test
  `packages/agent/test/prr-negotiation-workflow.test.ts`. Its
  `providerByteTransferPromptArtifactAudit()` helper explicitly removes the
  production binding before building a provider-transfer approval proof. The
  new required production parser correctly rejects that incomplete audit.
- The necessary safe supporting change is to preserve the existing production
  audit object in that helper. It is outside the coordinator-approved Task 5
  ownership list, so no out-of-scope file was edited and no commit was made.

## Completion Evidence

- Supporting verifier fixture repair: `packages/agent/test/prr-negotiation-workflow.test.ts`
  now preserves the existing production audit binding in the provider-transfer
  proof helper.
- Supporting verifier fixture repair: `packages/agent/test/evidence-triage-workflow.test.ts`
  now builds provider-parse preview prompt audit metadata through the real
  production evidence-triage renderer and parser-verified context packs, with
  evidence IDs, evidence events, link events, and content hashes bound in the
  prompt artifact audit.
- Provider-transfer previews deduplicate artifact hash refs after production
  audit hashes are included, preserving the downstream exact-preview contract.
- `npm test -- packages/agent/test/prr-negotiation-workflow.test.ts -t "requires exact provider byte-transfer approval before invoking a remote provider"`:
  passed, 1 test and 11 skipped tests.
- `npm test -- packages/agent/test/evidence-triage-workflow.test.ts`: passed,
  1 file and 11 tests.
- `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts`:
  passed, 6 files and 119 tests.
- `npm run verify`: passed typecheck, 178 test files with 3 skipped, 2036 tests
  with 3 skipped, UI production build, and factory readiness.
- `git diff --check`: passed.

No production prompt text, provider response text, resolved payload values,
credentials, request bodies, hidden paths, or generic metadata bags are recorded
in this claim.

## Review-Fix Evidence

- Review blocker repaired: `runtime.invokeModel()` now determines production
  status from the loaded run projection before constructing a request event.
  All six MVP production run types require a successfully normalized prompt
  audit whose input artifact hash exactly matches the invocation and whose
  audit includes the production binding. Absent, invalid, hash-mismatched, and
  missing-binding artifacts return a safe policy failure before a request event
  is appended or a provider is called.
- RED: `npm test -- packages/agent/test/runtime.test.ts` failed as expected
  before the runtime change. The new production guard test observed the legacy
  runtime failure after request-event construction for an absent artifact.
- GREEN: `npm test -- packages/agent/test/runtime.test.ts` passed with 1 file
  and 22 tests. The loop covers each of the six MVP run types for absent,
  invalid, hash-mismatched, and missing-production-binding artifacts and
  asserts zero provider calls and zero model-request events.
- Regression suite: `npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/runtime.test.ts packages/agent/test/projection.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/evidence-triage-workflow.test.ts` passed with 6 files and 119 tests.
- `npm run verify` passed with typecheck, the full test suite, UI production
  build, and factory readiness. `git diff --check` passed.

No production prompt text, provider response text, resolved payload values,
credentials, request bodies, hidden paths, or generic metadata bags are recorded
in this review-fix evidence.
