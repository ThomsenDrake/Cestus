# Resident Task Orchestrator Task 5 Claim

## Status

complete-coordinator-commit-pending

## Task

- Plan: `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Task: Task 5, Provider Policy, Exact Approval Suspension, And Reclaim
- Worker: Codex resident task orchestrator lane
- Branch: `codex/resident-task-orchestrator-design`
- Worktree: `/home/drake/.codex/worktrees/eb36/Cestus`
- Coordinator boundary: `HEAD 1894fe6a`

## Scope

- `docs/agentic/claims/resident-task-orchestrator-task-5.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/task-orchestrator-approval.ts`
- `packages/agent/src/provider-selection.ts`
- `packages/agent/test/task-orchestrator-approval.test.ts`
- `packages/agent/test/provider-selection.test.ts`

Tasks 1-4 are shared uncommitted scoped diffs in this managed worktree. They
are preserved unchanged. Git staging and commits are not attempted because
linked-worktree Git metadata is read-only.

## RED Evidence

Command:

```bash
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts
```

Result: expected RED.

`task-orchestrator-approval.test.ts` failed at import because
`../src/task-orchestrator-approval.js` does not exist. The selector test
failed because a successful selection has no `modelId` or `capabilityIds`.
This isolates the missing Task 5 provider posture, approval suspension, and
reclaim behavior before production edits.

## Commit Boundary

No staging or commit will be attempted. The coordinator boundary remains
`HEAD 1894fe6a`.

## GREEN Evidence

```bash
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests  20 passed (20)
```

The focused tests cover model/capability selection, durable provider posture,
exact provider-byte-transfer approval waits, lease release, same-attempt
reclaim with a higher lease generation, self-approval rejection, swapped
provider/model/prompt/context bindings, missing approval, and cancellation.

Coordinator follow-up found that the first implementation only carried
`capabilityIds` in a safe-next-action string because the existing ontology
checkpoint schema lacked a structured field. That would not meet Task 5's
durable provider-posture requirement. A focused RED contract assertion was
added to `packages/ontology/test/agent-contracts.test.ts`; it failed because
`providerPosture.capabilityIds` was rejected. The schema now accepts
structured `capabilityIds`, and the orchestrator writes the selected IDs into
the approval-wait checkpoint.

Fresh focused verification after the schema-support edit:

```text
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts
Test Files  3 passed (3)
Tests  80 passed (80)
```

## Verification

```bash
npm run typecheck
```

Result: `typecheck passed`.

```bash
git diff --check
```

Result: no output.

```bash
npm run verify
```

Fresh coordinator result: `typecheck passed`.

```bash
git diff --check
```

Fresh coordinator result: no output.

```bash
npm run verify
```

Result: blocked only by known managed-sandbox limits after typecheck.
Fresh count:

```text
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2152 passed | 3 skipped (2174)
```

The failing areas are unchanged: local-runtime server tests cannot bind
`127.0.0.1` or `0.0.0.0`, workspace-ops executable tests cannot create `tsx`
IPC pipes under `/tmp/tsx-1000/*.pipe`, and readiness-smoke stdout is empty
because the child executable is blocked. Re-run full verification in the
unrestricted coordinator environment.

## Supporting Edit

Task 5 required one narrow supporting edit outside the original file list:

- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`

Reason: the durable approval-wait event schema already owns
`providerPosture`, and Task 5 requires structured `capabilityIds` to be bound
there rather than inferred from strings.

## Review Fix Evidence

The review repair makes approval reclaim idempotent and crash-resumable. A
checkpoint with no matching `approval-suspended` release is released first and
only a later tick can inspect approval and reclaim. A later unexpired claim
after the checkpoint is reported as verified or waiting without appending a
second reclaim claim.

`task-orchestrator-approval.ts` now calls the exported, assertion-only runner
consume-time check. The in-memory proof carries the credential reference,
provider readiness snapshot, prompt artifact envelope, and existing
provider-transfer proof; none of this prompt material is appended to the
ledger. The adapter additionally binds `approvalRequirementId` to the actual
`agent.tool.requested` event ID in that request stream.

The durable checkpoint schema uses `providerPosture.modelFamily`; the selector
returns `modelId` as the same provider capability family key. The shared runner
assertion now accepts the landed provider-transfer preview contract, where the
preview may omit a model field, but it still requires the approved provider
capability to include the selected model key. If a preview does include
`modelId` or `modelFamily`, that value must also match the selected model.

The review repair also found a PRR vertical regression introduced by the
stricter shared assertion. A RED regression proved that model-less landed
provider-transfer previews stayed suspended and that unavailable providers
reported proof-missing before readiness. The runner now checks non-approval
readiness failures before proof-missing errors and binds selected models through
the approved provider capability, preserving the current provider-transfer
adapter contract.

Focused review-repair verification:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  2 passed (2)
Tests  26 passed (26)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  137 passed (137)

npm run typecheck
typecheck passed

git diff --check
(no output)
```

`npm run verify` was also rerun after the repair. It passed typecheck, then
hit the known managed-sandbox boundary. Fresh count:

```text
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2158 passed | 3 skipped (2180)
```

The failures are the known local-runtime socket `listen EPERM`, workspace-ops
`tsx` IPC `listen EPERM`, and readiness-smoke empty stdout from the blocked
child executable.

## Second Review Fix Evidence

The second review found three approval-hardening gaps. The shared runner
consume-time assertion now rejects stored approval events whose human
`context.actor.id` does not match `approvedBy`, whose causation does not point
at the durable request event, or whose actor is the resident/request actor. The
exported provider-byte-transfer assertion also rejects `ready` and
`works-locally` proof snapshots; the ordinary runner still handles those states
before calling the approval-only assertion, but the orchestrator approval path
cannot bypass exact proof with a stale readiness snapshot.

The orchestrator approval adapter now refuses hash-only proof fields when
`promptArtifactHash` or `contextBindingHashes` do not match the prompt envelope.
Approval-wait checkpoints derive their prompt hash and context binding hashes
from the prompt envelope, with a safe audit fallback only for malformed
unreclaimable proof fixtures.

Focused verification after the second review repair:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
Test Files  1 passed (1)
Tests  18 passed (18)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  141 passed (141)

npm run typecheck
typecheck passed

git diff --check
(no output)
```

`npm run verify` passed typecheck and then reached only the managed-sandbox
boundaries:

```text
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2162 passed | 3 skipped (2184)
```

## Third Review Fix Evidence

The third review found two remaining approval-proof hardening gaps. The runner
now also requires the referenced `ingestion.provider.approved` domain approval
event's human `context.actor.id` to match `payload.approvedBy`. The approval
metadata helper now validates the minimum prompt-envelope/manifest/ref shape
before trusting it, so malformed-but-present prompt artifacts fall back to safe
audit metadata for checkpointing while remaining unreclaimable.

Focused verification after this repair:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
Test Files  1 passed (1)
Tests  20 passed (20)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  143 passed (143)

npm run typecheck
typecheck passed

git diff --check
(no output)

npm run verify
typecheck passed
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2164 passed | 3 skipped (2186)
```

## Sixth Review Fix Evidence

The sixth review found the same dense-array issue in nested `provenanceRefs`.
The context-ref validator now runs provenance refs through the dense plain data
array helper before validating event IDs, rejecting sparse arrays and
getter-backed provenance indices without invoking accessors.

Focused verification after this repair:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
Test Files  1 passed (1)
Tests  20 passed (20)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  143 passed (143)

npm run typecheck
typecheck passed

git diff --check
(no output)

npm run verify
typecheck passed
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2164 passed | 3 skipped (2186)
```

## Fifth Review Fix Evidence

The fifth review found that accessor-backed array indices could still be read
while validating malformed context refs. The helper now accepts context-ref
arrays only when they are dense plain data arrays with no holes, no accessor
indices, no symbol properties, and no custom own properties. It copies values
from property descriptors before validating refs, so getter-backed array
indices are never invoked.

Focused verification after this repair:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
Test Files  1 passed (1)
Tests  20 passed (20)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  143 passed (143)

npm run typecheck
typecheck passed

git diff --check
(no output)

npm run verify
typecheck passed
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2164 passed | 3 skipped (2186)
```

The remaining full-verify failures are unchanged managed-sandbox boundaries:
local-runtime socket `listen EPERM`, workspace-ops `tsx` IPC `listen EPERM`,
and readiness-smoke empty stdout.

## Fourth Review Fix Evidence

The fourth review found that malformed-but-shaped prompt artifacts could still
copy checkpoint-invalid values after claim. The prompt-envelope helper now
requires plain own data objects and checkpoint-compatible metadata before it
trusts an envelope: valid `sha256:` hashes, nonnegative integer sizes, nonempty
event-ID provenance refs, and no accessor-backed manifest or context-ref
fields. Checkpoint construction uses the same validated context-ref helper, so
invalid shaped envelopes fall back to safe approved-audit metadata and remain
unreclaimable.

Focused verification after this repair:

```text
npm test -- packages/agent/test/task-orchestrator-approval.test.ts
Test Files  1 passed (1)
Tests  20 passed (20)

npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/prr-negotiation-workflow.test.ts
Test Files  5 passed (5)
Tests  143 passed (143)

npm run typecheck
typecheck passed

git diff --check
(no output)

npm run verify
typecheck passed
Test Files  3 failed | 181 passed | 3 skipped (187)
Tests  19 failed | 2164 passed | 3 skipped (2186)
```
