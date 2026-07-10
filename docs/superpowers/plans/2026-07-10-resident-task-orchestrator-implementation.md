# Resident Task Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the always-on resident task orchestration layer described in `docs/superpowers/specs/2026-07-10-resident-task-orchestrator-design.md`: queued resident-agent tasks become durable plans, specialist runs, verified resolved context, exact approval waits, provider dispatch, durable handoffs, restart-safe progress, and human-facing projections.

**Architecture:** Add a new task orchestrator package/module above the existing approved-tool scheduler. The orchestrator owns queued-task claims, leases, attempts, retry generation, context assembly, provider posture, runner dispatch, handoff sequencing, and task terminal projection. The existing approved-tool scheduler keeps exclusive ownership of approved-tool execution claims and domain effects.

**Tech Stack:** TypeScript, Vitest, Zod event contracts, append-only ontology ledger, existing `packages/agent` runtime, existing local runtime routes, existing provider-byte-transfer approval contracts, live Nous provider wiring.

## Prerequisite Implementation Readiness Gate

Design/spec commits are required reading, not proof that executable code exists. Do not claim Task 1 until the implementation branch is based on a `neo` commit where the source files, exports, and targeted tests below are present and passing. The Task 1 claim must record:

- the merged implementation base commit from `git rev-parse HEAD`;
- the implementation commits that introduced each prerequisite lane;
- the exact output of every prerequisite `rg` and `npm test` command in this section;
- any prerequisite that is intentionally inapplicable to the first non-PRR evidence-triage vertical.

Required reading before Task 1:

- `docs/superpowers/specs/2026-07-10-resident-task-orchestrator-design.md`
- `docs/superpowers/specs/2026-07-10-resident-lifecycle-bootstrap-design.md`
- `docs/superpowers/plans/2026-07-10-resident-lifecycle-bootstrap-implementation.md`
- `docs/superpowers/specs/2026-07-10-operational-context-packs-design.md`
- `docs/superpowers/plans/2026-07-10-operational-context-packs-implementation.md`
- `docs/superpowers/specs/2026-07-10-investigative-context-packs-design.md`
- `docs/superpowers/plans/2026-07-10-investigative-context-packs-implementation.md`
- `docs/superpowers/specs/2026-07-10-production-specialist-prompt-template-registry-design.md`
- `docs/superpowers/plans/2026-07-10-production-specialist-prompt-template-registry-implementation.md`
- `docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md`
- `docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md`
- `docs/superpowers/specs/2026-07-10-prr-jurisdiction-context-packs-design.md`
- `docs/superpowers/plans/2026-07-10-prr-jurisdiction-context-packs-implementation.md`

### Lifecycle Bootstrap Readiness

Mounted workspaces must project canonical `agent_default` ready before orchestration can claim or mutate tasks.

Required source and exports:

- `packages/agent/src/identity-bootstrap.ts` exports `defaultResidentAgentId`, `defaultResidentIdentityStreamId`, `ensureDefaultResidentIdentity`, and `ResidentIdentityLifecycleDto`.
- `packages/agent/src/runtime-types.ts` exposes `identityLifecycle` on agent status DTOs.
- `packages/local-runtime/src/runtime-factory.ts` or the landed runtime factory module exposes `LocalRuntimeHandle.residentIdentity.ready(): Promise<ResidentIdentityLifecycleDto>`.
- Task and memory mutation routes await lifecycle `ready`; read-only status/detect/verify paths do not append identity events.

Preflight:

```bash
rg -n "defaultResidentAgentId|defaultResidentIdentityStreamId|ensureDefaultResidentIdentity|ResidentIdentityLifecycleDto|identityLifecycle|residentIdentity\\.ready" packages/agent/src packages/local-runtime/src packages/agent/test packages/local-runtime/test
npm test -- packages/agent/test/identity-bootstrap.test.ts packages/agent/test/runtime.test.ts packages/local-runtime/test/resident-identity-bootstrap.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected: all required symbols exist, every listed test passes, and runtime status can report `identityLifecycle.state === "ready"` for a mounted workspace before queued-task orchestration starts.

### Operational Resolved Context Readiness

Required source and exports:

- `packages/agent/src/context-packs.ts` exports `ResolvedContextPack`, opaque `VerifiedResolvedContextPack`, `ContextPackPayloadResolver`, `buildResolvedContextPack`, `verifyResolvedContextPack`, `assertResolvedContextPacksForExecution`, `createContextPackRegistry`, and `ContextPackRegistry.buildResolved()`.
- `packages/agent/src/operational-context-packs.ts` exports builders/registration for `workspace-runtime-status.v1`, `task-run-history.v1`, and `agent-memory-summary.v1`, including exact payload parsers.
- `packages/agent/test/fixtures/resolved-context-pack-sentinel.ts` exports the sentinel fixture used by prompt/orchestrator live acceptance.

Preflight:

```bash
rg -n "VerifiedResolvedContextPack|assertResolvedContextPacksForExecution|buildResolvedContextPack|verifyResolvedContextPack|buildResolved\\(|workspace-runtime-status\\.v1|task-run-history\\.v1|agent-memory-summary\\.v1|resolved-context-pack-sentinel" packages/agent/src packages/agent/test
npm test -- packages/agent/test/context-packs.test.ts packages/agent/test/operational-context-packs.test.ts packages/agent/test/memory.test.ts packages/agent/test/specialist-readiness.test.ts
```

Expected: execution verification is produced only by registry/execution code after hash, size, and exact parser checks. A caller-supplied serializable field such as `ok`, `verified`, or `parserVerification` is ignored or rejected and cannot satisfy provider execution readiness.

### Investigative Context Readiness

The investigative lane in this batch produces exactly:

- `evidence-summary.v1`
- `accepted-graph-projection.v1`
- `governance-locks.v1`

Timeline and contradiction packs are not part of this prerequisite batch. They remain explicit readiness blockers only for specialist modes whose prompt/workflow descriptor marks them applicable. The first non-PRR evidence-triage vertical must not require `timeline-draft-summary.v1` or `contradiction-candidate-summary.v1`.

Required source and exports:

- `packages/agent/src/investigative-context-packs.ts` exports `buildEvidenceSummaryContextPack`, `buildAcceptedGraphProjectionContextPack`, `buildGovernanceLocksContextPack`, their exact payload parsers, and `registerInvestigativeContextPacks`.

Preflight:

```bash
rg -n "buildEvidenceSummaryContextPack|buildAcceptedGraphProjectionContextPack|buildGovernanceLocksContextPack|evidence-summary\\.v1|accepted-graph-projection\\.v1|governance-locks\\.v1|registerInvestigativeContextPacks" packages/agent/src packages/agent/test
npm test -- packages/agent/test/investigative-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected: all three investigative packs can be built as resolved envelopes and parser-verified by the operational context system. No plan or readiness claim may state that timeline, contradiction, or all six specialist modes are execution-ready from this three-pack batch.

### Prompt Applicability And Production Rendering Readiness

Required source and exports:

- `packages/agent/src/production-specialist-prompts.ts` exports production prompt registrations, renderer verification, context applicability evaluation, `renderProductionSpecialistPrompt()`, and strict provider output validation.
- `packages/agent/src/specialist-workflows.ts` exposes conditional context requirement modes, including PRR requirements as `when-scope-associated-prr` for non-PRR evidence triage.
- Provider preparation rejects ref-only prompt synthesis and requires verified resolved payloads for every applicable pack.

Preflight:

```bash
rg -n "renderProductionSpecialistPrompt|verifyProductionSpecialistPromptArtifact|ProductionContextRequirement|when-scope-associated-prr|no-associated-prr|promptText\\(" packages/agent/src packages/agent/test
npm test -- packages/agent/test/production-specialist-prompts.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialist-readiness.test.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
```

Expected: non-PRR evidence triage records `no-associated-prr` instead of blocking on PRR context; PRR-linked modes remain blocked until PRR packs exist.

### Durable Handoff Readiness

Required source and exports:

- `packages/agent/src/specialist-handoff-manifest.ts` exports manifest hashing and verification helpers.
- `packages/agent/src/specialist-handoff-projection.ts` exports projector states including `handoff-pending` and verified recorded/readback states.
- `packages/agent/src/specialist-runner-kernel.ts` exposes the final-output to prepared to recorded/readback to run-terminal helper sequence.

Preflight:

```bash
rg -n "specialist-handoff\\.prepared|specialist-handoff\\.recorded|handoff-pending|final-output|readback|VerifiedSpecialistHandoff|prepare.*record.*readback" packages/ontology/src packages/agent/src packages/agent/test
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Expected: task success cannot project until verified handoff readback exists, and no code path can synthesize a handoff from run output hashes alone.

### PRR Pack Readiness

PRR context packs can land independently of the first non-PRR evidence-triage vertical. They are not required to complete the first non-PRR evidence-triage gate. They are required before PRR-linked evidence triage, PRR negotiation, PRR-linked planner/report modes, or any selected-request workflow can be execution-ready.

Required source and exports when a PRR-linked mode is applicable:

- `packages/agent/src/prr-context-packs.ts` exports builders/registration for `prr-read-model.v1` and `jurisdiction-pack-summary.v1`.
- `packages/local-runtime/src/agent-prr-context-packs.ts` registers selected-request runtime inputs without scanning unrelated PRRs.

Preflight for PRR-linked modes:

```bash
rg -n "prr-read-model\\.v1|jurisdiction-pack-summary\\.v1|buildPrrReadModelContextPack|buildJurisdictionPackSummaryContextPack|registerPrrContextPacks" packages/agent/src packages/local-runtime/src packages/agent/test packages/local-runtime/test
npm test -- packages/agent/test/prr-context-packs.test.ts packages/local-runtime/test/agent-prr-context-packs.test.ts packages/agent/test/specialist-readiness.test.ts
```

Expected: PRR-linked modes remain blocked if this preflight is absent or failing. Non-PRR evidence triage records PRR context as inapplicable and can continue.

Stop if any required source/export/test for the first evidence-triage vertical is absent, if the mounted workspace cannot prove `agent_default` ready, if the handoff lane changes the final-output to prepared to recorded/readback to run-terminal order, if the prompt lane cannot identify applicable packs before provider dispatch, or if configured live Nous provider credentials are unavailable for the mandatory acceptance gate.

## Required Lane Interfaces

The implementation must consume these interfaces from the prerequisite lanes. If an interface lands with a different exact exported name, create a thin orchestrator adapter and preserve the semantics below.

```ts
export interface ResolvedContextPack {
  readonly ref: ContextPackRef;
  readonly payload: AgentContextPackJsonValue;
}

declare const verifiedResolvedContextPackBrand: unique symbol;

export type VerifiedResolvedContextPack = ResolvedContextPack & {
  readonly [verifiedResolvedContextPackBrand]: true;
};

export interface ContextPackPayloadResolver {
  resolve(ref: ContextPackRef): Promise<ResolvedContextPack>;
}

export function assertResolvedContextPacksForExecution(input: {
  readonly refs: readonly ContextPackRef[];
  readonly resolved: readonly ResolvedContextPack[];
}): readonly VerifiedResolvedContextPack[];
```

The orchestrator consumes only opaque `VerifiedResolvedContextPack` values returned by the operational registry/execution assertion after local resolve, hash check, size check, and exact parser validation. It never trusts a caller-supplied object with `ok: true`, `verified: true`, `parserVerification`, or equivalent serializable proof.

```ts
export interface SpecialistContextApplicabilityPlan {
  readonly applicablePackIds: readonly string[];
  readonly inapplicablePackIds: readonly string[];
  readonly reasonByPackId: Readonly<Record<string, string>>;
}

export interface SpecialistPromptWorkflowRenderer {
  contextApplicability(input: {
    readonly taskId: string;
    readonly runType: AgentSpecialistRunType;
    readonly taskKind: string;
    readonly taskPayload: AgentJsonValue;
  }): SpecialistContextApplicabilityPlan;

  render(input: {
    readonly taskId: string;
    readonly runType: AgentSpecialistRunType;
    readonly applicableResolvedPacks: readonly VerifiedResolvedContextPack[];
    readonly providerPosture: AgentProviderPosture;
  }): Promise<PromptArtifactEnvelope>;
}
```

```ts
export interface DurableSpecialistHandoffCapability {
  prepare(input: {
    readonly taskId: string;
    readonly runId: string;
    readonly attemptId: string;
    readonly finalOutputArtifactRef: ContentAddressedArtifactRef;
  }): Promise<PreparedSpecialistHandoffManifest>;

  record(input: {
    readonly preparedManifest: PreparedSpecialistHandoffManifest;
    readonly expectedSequence: number;
  }): Promise<RecordedSpecialistHandoff>;

  readback(input: {
    readonly handoffId: string;
    readonly manifestHash: string;
  }): Promise<VerifiedSpecialistHandoff>;
}
```

The orchestrator must never ledger raw resolved payloads, cockpit raw payloads, log raw payloads, synthetic approvals, synthetic domain proof, synthetic handoffs, accepted graph truth, legal escalation, PRR submission, exports, lock clearing, or old-source mutation.

## Deterministic Orchestrator Contracts

- Claim stream ID: `agent_task_orchestration_${taskId}_${runType}`.
- Claim append rule: append `agent.task.orchestration.claimed` with `expectedNextSequence = latestSequence + 1`, then read back the stream and verify the appended claim is latest active claim with no superseding release, checkpoint, cancellation, retry, or terminal event.
- Stable attempt identity: `attemptId = sha256("agent-task-attempt:v1:" + taskId + ":" + runType + ":" + retryGeneration)`.
- Lease identity: `leaseClaimGeneration` increments on each claim or reclaim and never enters provider, prompt, run, handoff, or domain idempotency keys.
- Side-effect idempotency keys use `{ taskId, runType, retryGeneration, attemptId, phase }`.
- At most one active execution attempt per `{ taskId, runType, retryGeneration }`. A second active worker is a hard recovery conflict unless a later explicit retry generation event exists.
- Task terminal status is projected only from `agent.task.status.changed`. Orchestration terminal events must precede task status changes and be causally linked by event ID. Missing or inverted terminal sequences project blocked or handoff-pending, never completed.
- Provider dispatch requires verified local resolution of every applicable context pack. Context refs alone support advisory readiness only.
- Checkpoints bind context refs, context content hashes, byte counts, schema IDs, provenance event IDs, prompt artifact hash, provider posture, and approval IDs. They never bind raw payload bytes.
- Exact provider-byte-transfer approval wait creates a durable suspended checkpoint and releases the worker lease. Reclaim after valid approval keeps the same stable `attemptId` and increments `leaseClaimGeneration`.
- Runner order is final-output artifact, handoff prepared, handoff recorded/readback, specialist run terminal, orchestration terminal, task status terminal.

## Task Claim Protocol

Each implementation task below starts with an implementation claim, ends with a commit, and leaves the repo ready for the next task.

- Claim file path pattern: `docs/agentic/claims/resident-task-orchestrator-task-N.md`.
- Claim content includes worker/thread ID, branch name, task number, start timestamp, owned files, merged implementation base commit, prerequisite implementation commits, prerequisite preflight command output, and any prerequisite intentionally inapplicable to that task's mode.
- Every task follows this sequence: write RED tests, run the targeted command and capture the expected RED failure in the claim file, implement the smallest production change, rerun the targeted command, run `npm run verify`, update the claim to complete, commit.
- After Tasks 2, 5, 8, and 11, request review using `superpowers:requesting-code-review`.
- Stop if a task needs to edit a prerequisite lane's owned spec/design files, weakens append-only ledger rebuildability, allows self-approval, sends domain effects outside domain services, or requires placeholder prompts or synthetic handoffs.

## Task 1: Event Contracts And Deterministic Stream Helpers

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-1.md`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/agent/src/task-orchestrator-events.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/test/task-orchestrator-events.test.ts`
- `packages/agent/src/index.ts`

**Tests first:**

- [ ] Add ontology contract tests named:
  - `accepts agent.task.orchestration.claimed with stable attempt and lease generation`
  - `accepts agent.task.orchestration.checkpointed without raw context payload`
  - `accepts agent.task.orchestration.released for approval suspension and stale claim recovery`
  - `accepts agent.task.orchestration.completed only with preceding handoff readback reference`
  - `rejects orchestration events that include payload, domainProof, approvalByAgent, or missing retryGeneration`
- [ ] Add agent helper tests named:
  - `builds deterministic claim stream id from task id and run type`
  - `keeps attempt id stable across lease reclaims`
  - `changes attempt id when retry generation changes`
  - `excludes lease claim generation from side effect idempotency keys`
  - `builds expected sequence append inputs for claim readback`

**Expected RED:** TypeScript or Vitest fails because orchestration event schemas and helper exports do not exist.

**Implementation:**

- [ ] Add Zod schemas for `agent.task.orchestration.claimed`, `agent.task.orchestration.checkpointed`, `agent.task.orchestration.released`, `agent.task.orchestration.completed`, and `agent.task.orchestration.failed`.
- [ ] Keep cancellation as input from `agent.task.status.changed` with status `canceled`; do not mint an orchestration cancellation event unless recovery proves a durable gap.
- [ ] Add `taskOrchestrationStreamId(taskId, runType)`.
- [ ] Add `buildTaskAttemptId({ taskId, runType, retryGeneration })`.
- [ ] Add `buildTaskOrchestratorIdempotencyKey({ taskId, runType, retryGeneration, attemptId, phase })`.
- [ ] Add event payload types that distinguish append-only events from derived projection states.
- [ ] Export only stable types and helpers from `packages/agent/src/index.ts`.

**Verify:**

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts packages/agent/test/task-orchestrator-events.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-1.md packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts packages/agent/src/task-orchestrator-events.ts packages/agent/src/task-orchestrator-types.ts packages/agent/test/task-orchestrator-events.test.ts packages/agent/src/index.ts
git commit -m "feat: add resident task orchestration event contracts"
```

## Task 2: Projection, Terminal Truth, And Restart Reconstruction

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-2.md`
- `packages/agent/src/task-orchestrator-projection.ts`
- `packages/agent/src/projection-types.ts`
- `packages/agent/src/projection.ts`
- `packages/agent/test/task-orchestrator-projection.test.ts`
- `packages/agent/test/projection.test.ts`
- `packages/agent/src/index.ts`

**Tests first:**

- [ ] Add projection tests named:
  - `projects queued task awaiting claim from task status source`
  - `projects claimed running attempt from orchestration claim and task status`
  - `projects approval-suspended checkpoint without an active lease`
  - `projects stale claim recoverable when lease expires without terminal event`
  - `projects handoff-pending when final output or prepared manifest exists without verified handoff readback`
  - `does not project completed from orchestration completed without causal task status changed event`
  - `does not project completed from task status changed without preceding orchestration completed event`
  - `rebuilds the same projection from a shuffled stream read sorted by ledger sequence`
  - `fails closed on duplicate active attempts for the same task specialist retry generation`

**Expected RED:** Tests fail because there is no orchestration projection, no handoff-pending state, and terminal causation is not enforced.

**Implementation:**

- [ ] Add `TaskOrchestratorProjection` and `TaskOrchestratorAttemptProjection`.
- [ ] Extend `AgentTaskStatus` derived DTOs only where needed; keep `agent.task.status.changed` as the single task-status projection source.
- [ ] Rebuild from ledger events sorted by canonical sequence. Do not rely on in-memory worker state.
- [ ] Treat partial terminal sequences as blocked or handoff-pending with diagnostic reason and recoverable checkpoint ID.
- [ ] Keep append-only events separate from projection labels such as `queued`, `claiming`, `planning`, `approval-suspended`, `handoff-pending`, `completed`, `failed`, and `canceled`.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-2.md packages/agent/src/task-orchestrator-projection.ts packages/agent/src/projection-types.ts packages/agent/src/projection.ts packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/projection.test.ts packages/agent/src/index.ts
git commit -m "feat: project resident task orchestration state"
```

**Review gate:** Request review for event/projection contracts before claim, lease, and retry behavior is added.

## Task 3: Claims, Ordering, Priority, Retry, Cancellation, And Stale Recovery

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-3.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/task-orchestrator-events.ts`
- `packages/agent/test/task-orchestrator-claims.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `selects queued tasks deterministically by priority then created sequence then task id`
  - `claims only one task per specialist boundary under bounded concurrency`
  - `uses expected sequence readback to reject double claims`
  - `reclaims stale lease with same attempt id and higher lease claim generation`
  - `starts explicit retry with retry generation plus one and a new attempt id`
  - `does not duplicate prompt provider or run side effects during stale lease reclaim`
  - `honors cancellation before claim`
  - `honors cancellation after claim before provider dispatch`
  - `marks cancellation during handoff as blocked until handoff protocol resolves`
  - `enforces budget ceilings before provider dispatch`

**Expected RED:** Tests fail because `createTaskOrchestrator` and claim state transitions do not exist.

**Implementation:**

- [ ] Add `createTaskOrchestrator({ ledger, now, actor, policy, concurrency, budgets, workflowRegistry, contextRegistry, promptRendererRegistry, providerRegistry, approvalReader, runnerRegistry, handoffCapability })`.
- [ ] Implement a `tick()` method that selects deterministic candidates and returns a typed summary without calling the approved-tool scheduler.
- [ ] Implement bounded concurrency per run type and global budget ceilings.
- [ ] Implement claim append/readback and release reasons: `approval-suspended`, `stale-recovered`, `budget-blocked`, `canceled-before-dispatch`, `handoff-pending`, `worker-shutdown`.
- [ ] Implement explicit retry generation only from a durable retry policy input, never from lease expiry alone.
- [ ] Persist every recovery boundary with idempotency keys derived from stable attempt identity.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-claims.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-3.md packages/agent/src/task-orchestrator.ts packages/agent/src/task-orchestrator-types.ts packages/agent/src/task-orchestrator-events.ts packages/agent/test/task-orchestrator-claims.test.ts
git commit -m "feat: add resident task orchestration claims"
```

## Task 4: Context Applicability, Resolved Payload Verification, And Leakage Guards

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-4.md`
- `packages/agent/src/task-orchestrator-context.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/test/task-orchestrator-context.test.ts`
- `packages/agent/test/prompt-artifacts.test.ts`
- `packages/agent/test/cockpit.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `uses workflow applicability to skip prr-read-model for non prr evidence triage`
  - `blocks before transfer when an applicable context ref cannot be resolved locally`
  - `blocks before transfer when content hash does not match resolved payload bytes`
  - `blocks before transfer when resolved schema id differs from descriptor schema`
  - `blocks before transfer when resolved byte size differs from descriptor`
  - `passes verified resolved payload bytes to prompt renderer`
  - `records only refs hashes sizes schemas and provenance in checkpoints`
  - `does not expose resolved payload bytes in cockpit projection`
  - `does not include resolved payload bytes in approval preview or logs`
  - `rejects ref only fake dispatch readiness`
  - `rejects caller supplied ok verified or parserVerification fields as execution proof`

**Expected RED:** Tests fail because current context pack handling is ref-only and prompt rendering cannot prove payload-byte consumption.

**Implementation:**

- [ ] Add `assembleTaskOrchestratorContext()` that consumes workflow applicability first, then resolves and verifies each applicable pack.
- [ ] Keep inapplicable pack IDs and reasons in projection diagnostics without blocking dispatch.
- [ ] Build checkpoint context bindings from `{ contextPackId, ref, contentHash, byteLength, schemaId, provenanceEventIds }`.
- [ ] Add a payload leakage assertion helper for tests that scans ledger event JSON, cockpit DTOs, approval previews, and captured logger records.
- [ ] Make production provider dispatch depend on successful local resolution plus operational `assertResolvedContextPacksForExecution()` or the landed equivalent that returns opaque `VerifiedResolvedContextPack` values for every applicable pack.
- [ ] Preserve advisory readiness from context refs for status screens only.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-4.md packages/agent/src/task-orchestrator-context.ts packages/agent/src/task-orchestrator-types.ts packages/agent/src/task-orchestrator.ts packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/cockpit.test.ts
git commit -m "feat: verify resolved context before resident dispatch"
```

## Task 5: Provider Policy, Exact Approval Suspension, And Reclaim

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-5.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/provider-selection.ts`
- `packages/agent/src/approvals.ts`
- `packages/agent/test/task-orchestrator-approval.test.ts`
- `packages/agent/test/provider-selection.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `selects provider and model from policy and capability registry`
  - `records provider posture durably before approval wait`
  - `requires exact provider byte transfer approval before model dispatch`
  - `releases worker lease while waiting for provider approval`
  - `reclaims suspended approval checkpoint with same attempt id after valid approval`
  - `rejects approval proof created by resident agent actor`
  - `rejects approval proof for different provider model prompt hash or payload hash set`
  - `does not call provider while approval is missing`
  - `does not call provider after task cancellation races with approval`

**Expected RED:** Tests fail because provider policy is not wired to task orchestration and approval suspension currently cannot release/reclaim task claims.

**Implementation:**

- [ ] Add provider posture checkpoint fields: provider ID, model ID, policy version, capability IDs, prompt artifact hash, context binding hashes, approval requirement ID.
- [ ] Reuse existing provider-byte-transfer approval reader and validator exactly. Do not add alternate approval proof.
- [ ] Add suspended checkpoint state and claim release when approval is required.
- [ ] On later tick, reclaim the task stream idempotently, verify approval again from durable proof, and resume from the checkpoint.
- [ ] Ensure canceled status after approval but before dispatch wins over provider invocation.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-5.md packages/agent/src/task-orchestrator.ts packages/agent/src/task-orchestrator-types.ts packages/agent/src/provider-selection.ts packages/agent/src/approvals.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/provider-selection.test.ts
git commit -m "feat: suspend resident tasks for exact provider approval"
```

**Review gate:** Request review for provider approval and no-self-approval behavior before runner dispatch is connected.

## Task 6: Runner Dispatch And Durable Handoff Sequencing

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-6.md`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-types.ts`
- `packages/agent/src/specialist-runner-kernel.ts`
- `packages/agent/src/evidence-triage-workflow.ts`
- `packages/agent/src/specialist-workflows.ts`
- `packages/agent/test/task-orchestrator-dispatch.test.ts`
- `packages/agent/test/evidence-triage-workflow.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `dispatches runner only after verified prompt provider approval and context bindings`
  - `records final output artifact before handoff prepare`
  - `prepares handoff before handoff record`
  - `requires verified handoff readback before specialist run completed`
  - `appends orchestration completed only after specialist run completed`
  - `appends task status completed only after orchestration completed`
  - `does not ask runner to append completed before durable handoff readback`
  - `projects handoff pending when prepared manifest exists without recorded readback`
  - `recovers from crash after final output before prepared handoff`
  - `recovers from crash after prepared handoff before recorded readback`
  - `recovers from crash after recorded readback before run terminal`
  - `recovers from crash after run terminal before orchestration terminal`
  - `recovers from crash after orchestration terminal before task status terminal`

**Expected RED:** Tests fail because current runner helpers can terminal a run before durable handoff recording and readback.

**Implementation:**

- [ ] Change runner dispatch to return or persist a final-output content-addressed artifact before terminal run state.
- [ ] Call handoff capability in the approved order: `prepare`, `record`, `readback`.
- [ ] Only after verified handoff readback append the canonical `agent.specialist-run.completed` event.
- [ ] Append `agent.task.orchestration.completed` after run terminal and include canonical handoff event/readback references.
- [ ] Append `agent.task.status.changed` to `completed` after orchestration completed, with causation pointing to the orchestration terminal event.
- [ ] On cancellation during handoff, finish the recoverable handoff protocol first, then project the task according to the durable cancellation race rule from the spec.
- [ ] Never synthesize handoff from output hashes alone.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-6.md packages/agent/src/task-orchestrator.ts packages/agent/src/task-orchestrator-types.ts packages/agent/src/specialist-runner-kernel.ts packages/agent/src/evidence-triage-workflow.ts packages/agent/src/specialist-workflows.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/evidence-triage-workflow.test.ts
git commit -m "feat: sequence resident runs through durable handoffs"
```

## Task 7: Runtime Composition Without Scheduler Ownership Drift

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-7.md`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/runtime.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/test/agent-task-orchestrator-routes.test.ts`
- `packages/agent/test/runtime.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `runtime exposes task orchestrator tick separately from approved tool scheduler wake`
  - `task orchestrator tick does not call createAgentScheduler wake`
  - `approved tool scheduler wake does not claim queued tasks`
  - `optional runtime wake service composes task orchestrator tick then approved tool scheduler wake with separate summaries`
  - `http route labels task orchestration and approved tool scheduling separately`
  - `http route returns suspended approval and handoff pending projection without payload bytes`
  - `task orchestrator tick blocks when resident identity lifecycle is not ready`
  - `task orchestrator tick proceeds only after mounted workspace resident identity is ready`

**Expected RED:** Tests fail because runtime exposes only the approved-tool scheduler wake path.

**Implementation:**

- [ ] Add runtime API method `tickTaskOrchestrator()` returning `TaskOrchestratorTickSummary`.
- [ ] Add a local runtime route such as `POST /api/agent/task-orchestrator/tick`.
- [ ] If a composed wake endpoint is added, return separate `taskOrchestrator` and `approvedToolScheduler` summaries and keep ownership names explicit.
- [ ] Ensure local runtime construction injects the real context resolver, prompt renderer, provider registry, approval reader, runner registry, and handoff capability.
- [ ] Require `LocalRuntimeHandle.residentIdentity.ready()` or the landed lifecycle-ready equivalent before orchestrator task mutation and claim attempts.
- [ ] Do not extend `createAgentScheduler().wake()` for queued-task orchestration.

**Verify:**

```bash
npm test -- packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-7.md packages/agent/src/runtime-types.ts packages/agent/src/runtime.ts packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-task-orchestrator-routes.test.ts packages/agent/test/runtime.test.ts
git commit -m "feat: expose resident task orchestrator runtime tick"
```

## Task 8: Deterministic Evidence-Triage Vertical

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-8.md`
- `packages/agent/test/task-orchestrator-evidence-triage.test.ts`
- `packages/agent/test/task-orchestrator-recovery.test.ts`
- `packages/agent/src/task-orchestrator.ts`
- `packages/agent/src/task-orchestrator-context.ts`
- `packages/agent/src/task-orchestrator-projection.ts`

**Tests first:**

- [ ] Add integration tests named:
  - `evidence triage queue claim plan context approval wait reclaim fake provider final output handoff run terminal task terminal`
  - `evidence triage restart before claim reconstructs queued`
  - `evidence triage restart after claim reconstructs active attempt`
  - `evidence triage restart after context checkpoint reconstructs context bindings`
  - `evidence triage restart during provider approval reconstructs suspended checkpoint without lease`
  - `evidence triage restart after approval before provider call does not duplicate prompt side effects`
  - `evidence triage restart after provider final output completes handoff before terminal`
  - `evidence triage restart after handoff readback completes run and task terminal`
  - `evidence triage rejects ref only fake readiness`
  - `evidence triage never calls approved tool scheduler for task claims`
  - `non prr evidence triage does not require prr timeline or contradiction packs`
  - `prr linked evidence triage remains blocked until prr packs are ready`

**Expected RED:** Tests fail because the full orchestrated vertical path is incomplete.

**Implementation:**

- [ ] Wire the deterministic fake provider only for contract and integration tests; mark it unable to satisfy provider execution readiness.
- [ ] Prove queue to claim to plan to context to approval wait to reclaim to provider to final output to handoff to run terminal to task terminal.
- [ ] Insert restart reconstruction assertions at every crash boundary from the spec.
- [ ] Ensure the task projection shows `handoff-pending` whenever the handoff protocol is incomplete.
- [ ] Prove the first vertical uses only applicable operational and investigative packs plus conditional PRR omissions, without claiming timeline, contradiction, PRR-linked, or all-specialist execution readiness.
- [ ] Assert every event stream can be replayed from scratch into the same projection.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-8.md packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/src/task-orchestrator.ts packages/agent/src/task-orchestrator-context.ts packages/agent/src/task-orchestrator-projection.ts
git commit -m "test: cover resident evidence triage orchestration"
```

**Review gate:** Request review for the deterministic vertical before live provider acceptance is attempted.

## Task 9: Live Nous Sentinel Acceptance

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-9.md`
- `packages/agent/test/task-orchestrator-evidence-triage-live.test.ts`
- `packages/agent/test/evidence-triage-nous-live.test.ts`
- `packages/agent/src/task-orchestrator-context.ts`
- `packages/agent/src/task-orchestrator.ts`

**Tests first:**

- [ ] Add live test named `real nous evidence triage emits structured output containing resolved payload sentinel`.
- [ ] Add live negative test named `live readiness fails when sentinel exists only behind unresolved context ref`.

**Expected RED:** With `CESTUS_AGENT_LIVE_NOUS=1` and repo-local secret setup, tests fail because live task orchestration does not yet prove resolved payload bytes reach the structured model output.

**Implementation:**

- [ ] Add a sentinel fact into an applicable resolved investigative context payload only.
- [ ] Render prompt artifact from verified payload bytes and bind the prompt artifact hash into the approval checkpoint.
- [ ] Require exact provider-byte-transfer approval covering provider, model, prompt hash, and context hash set.
- [ ] Dispatch through the configured real Nous provider; unavailable provider configuration or repo-local secret setup blocks feature completion and escalates to the coordinator.
- [ ] Assert structured model output contains the sentinel fact in the expected schema field.
- [ ] Assert no sentinel raw payload appears in ledger events, cockpit DTOs, approval previews, or logs.
- [ ] Keep offline fake provider tests separate and unable to satisfy live provider execution readiness.

**Verify:**

```bash
npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-9.md packages/agent/test/task-orchestrator-evidence-triage-live.test.ts packages/agent/test/evidence-triage-nous-live.test.ts packages/agent/src/task-orchestrator-context.ts packages/agent/src/task-orchestrator.ts
git commit -m "test: add live nous resident orchestration acceptance"
```

Stop and escalate if the configured live Nous provider or repo-local secret setup is unavailable. The feature cannot be marked complete without this live acceptance. Also stop if provider readiness can be satisfied by an offline fake or if the sentinel appears outside the provider request and structured provider output.

## Task 10: Cockpit And Human Handoff Projection

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-10.md`
- `packages/agent/src/cockpit.ts`
- `packages/agent/src/projection-types.ts`
- `packages/ui/src/agent/agent-types.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/agent/test/cockpit.test.ts`

**Tests first:**

- [ ] Add tests named:
  - `cockpit shows queued claimed approval suspended stale claim handoff pending completed and failed orchestration states`
  - `cockpit shows active attempt id retry generation lease generation and budget posture`
  - `cockpit shows provider posture without raw payload or prompt text`
  - `cockpit shows handoff verified readback reference before completed task state`
  - `ui adapter keeps scheduler and task orchestrator ownership labels separate`
  - `ui adapter exposes no controls for self approval export legal escalation graph truth lock clearing or old source mutation`

**Expected RED:** Tests fail because cockpit DTOs do not include task orchestration state.

**Implementation:**

- [ ] Add read-only orchestrator projection fields to cockpit DTOs.
- [ ] Include human handoff capability status and durable handoff readback references.
- [ ] Display blocked reasons for approval-suspended, context-resolution-blocked, stale-claim-recoverable, budget-blocked, and handoff-pending.
- [ ] Do not add risky autonomous effect controls.
- [ ] Verify payload leakage helper against cockpit and UI adapter outputs.

**Verify:**

```bash
npm test -- packages/agent/test/cockpit.test.ts packages/ui/test/agent-adapter.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-10.md packages/agent/src/cockpit.ts packages/agent/src/projection-types.ts packages/ui/src/agent/agent-types.ts packages/ui/src/agent/agent-adapter.ts packages/ui/test/agent-adapter.test.ts packages/agent/test/cockpit.test.ts
git commit -m "feat: show resident task orchestration in cockpit"
```

## Task 11: Readiness Registration, Full Gates, And Review Package

**Files:**

- `docs/agentic/claims/resident-task-orchestrator-task-11.md`
- `scripts/check-agent-readiness.mjs`
- `docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md`
- Any test snapshot or fixture files created by earlier tasks

**Tests first:**

- [ ] Add readiness checks named in `scripts/check-agent-readiness.mjs` for:
  - resident task orchestrator spec
  - resident task orchestrator implementation plan
  - resident lifecycle bootstrap semantic preflight
  - operational resolved-context semantic preflight
  - investigative three-pack semantic preflight
  - prompt applicability and production rendering semantic preflight
  - durable handoff semantic preflight
  - conditional PRR pack semantic preflight for PRR-linked modes
  - orchestration event contracts
  - deterministic claim stream helper
  - resolved context verification tests
  - approval suspension tests
  - durable handoff sequencing tests
  - deterministic evidence-triage vertical tests
  - live Nous sentinel acceptance test presence
- [ ] Run factory readiness before script changes and capture the missing readiness coverage in the claim file.

**Expected RED:** Factory readiness reports missing orchestrator implementation artifacts or missing test registrations.

**Implementation:**

- [ ] Register the plan and required orchestrator files in `scripts/check-agent-readiness.mjs`.
- [ ] Confirm the script rejects forbidden unfinished markers in the new plan, spec, and test names.
- [ ] Confirm all implementation claims are completed and committed.
- [ ] Prepare a review summary with merged implementation base commit, prerequisite implementation commits, task commits, preflight command output, target test commands, live Nous result, and any accepted residual risk.

**Verify:**

```bash
git diff --check
npm run factory:check
npm test -- packages/agent/test/task-orchestrator-events.test.ts packages/agent/test/task-orchestrator-projection.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-context.test.ts packages/agent/test/task-orchestrator-approval.test.ts packages/agent/test/task-orchestrator-dispatch.test.ts packages/agent/test/task-orchestrator-evidence-triage.test.ts packages/agent/test/task-orchestrator-recovery.test.ts packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/task-orchestrator-evidence-triage-live.test.ts
npm run verify
git status --short
git add docs/agentic/claims/resident-task-orchestrator-task-11.md scripts/check-agent-readiness.mjs docs/superpowers/plans/2026-07-10-resident-task-orchestrator-implementation.md
git commit -m "chore: register resident task orchestrator readiness"
```

**Review gate:** Request final code review after `npm run verify` and the live Nous sentinel acceptance both pass.

## Merge Order

1. Merge implementation lanes into `neo` in dependency order: resident lifecycle bootstrap, operational resolved context packs, investigative three-pack resolved context packs, production prompt applicability/rendering, and durable handoff protocol.
2. PRR context packs may merge before or after the first non-PRR evidence-triage vertical. They are mandatory only before PRR-linked modes are marked execution-ready.
3. Rebase the resident task orchestrator implementation branch onto the updated `neo`.
4. Execute the semantic preflight gate and record actual implementation base/prerequisite commits in the Task 1 claim.
5. Execute Tasks 1 through 11 in order, one commit per task.
6. Do not start Task 6 until the durable handoff canonical event/artifact contract is present in the implementation base.
7. Do not start Task 8 until Tasks 1 through 7 have passed `npm run verify`.
8. Do not start Task 9 until Task 8 deterministic acceptance passes and repo-local Nous configuration is available.
9. Open final review only after Task 11 passes full verification and live Nous sentinel acceptance passes.

## Evidence-Triage Vertical Acceptance Gate

The feature is not complete until the following sequence is proven by deterministic tests and then by live Nous sentinel acceptance:

1. A queued evidence-triage task is selected by deterministic priority and claimed on `agent_task_orchestration_${taskId}_${runType}`.
2. The orchestrator creates a stable attempt ID for retry generation `0` and records a durable planning/context checkpoint.
3. Workflow applicability marks only relevant packs applicable; non-PRR `prr-read-model.v1` is advisory/inapplicable and does not block.
4. Every applicable pack is locally resolved to `ResolvedContextPack { ref, payload }`, then converted by the operational registry/execution assertion into opaque `VerifiedResolvedContextPack` after content hash, size, schema/parser, provenance, and staleness checks.
5. The prompt renderer consumes only opaque verified payload results, creates a prompt artifact hash, and no payload bytes enter ledger, cockpit, logs, approval preview, or handoff metadata.
6. Missing exact provider-byte-transfer approval creates a suspended checkpoint and releases the worker lease.
7. Valid exact approval causes idempotent reclaim with the same attempt ID and a higher lease claim generation.
8. Real Nous dispatch runs only after approval and verified payload resolution.
9. A sentinel fact present only in the resolved payload appears in structured model output.
10. Final output artifact is content-addressed before handoff preparation.
11. Handoff is prepared, recorded, and verified by readback before any specialist run terminal event.
12. Specialist run terminal precedes orchestration terminal.
13. Orchestration terminal precedes `agent.task.status.changed` terminal status and causally references it.
14. Restart reconstruction passes after every boundary above, including approval suspension and handoff-pending states.

## Stop Conditions

- Missing prerequisite source/export/test readiness, unrecorded implementation base/prerequisite commits, or changed cross-lane interface semantics.
- Any design pressure to extend `createAgentScheduler().wake()` so it owns queued-task orchestration.
- Any self-approval path, synthetic provider-byte-transfer proof, synthetic domain proof, or synthetic handoff.
- Any domain effect outside approved-tool scheduler and domain services.
- Any payload leakage into ledger, cockpit, logs, approval preview, or handoff metadata.
- Any terminal projection from runner output hashes without verified handoff readback.
- Any old-source mutation, accepted-graph-truth acceptance, governance lock clearing, PRR submission, export, or legal escalation.
- Any restart boundary that cannot be reconstructed from append-only events.
- Unavailable configured live Nous provider or repo-local secret setup for mandatory acceptance.
- Repeated verifier failure after a systematic debugging pass and one focused correction attempt.
