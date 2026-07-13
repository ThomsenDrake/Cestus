# Resident Agent Bounded Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development only after the coordinator issues a
> scoped authorization naming the approved Lane L design, this plan, exact task
> range, wave stop, user-confirmed GPT-5.6 Terra / Extra High configuration,
> fresh review, verification-before-completion, and the no-self-merge rule.

**Goal:** Deliver a finite resident plan/observe/tool/replan capability whose
durable records are provenance-complete and replayable and which cannot grant
itself a tool, provider, budget, approval, mount, or ontology-truth privilege.

**Architecture:** CF-1 freezes shared schema/event ownership first. Task 120
adds strict plan/observation contracts, append/readback, and a rebuildable
projection. Task 136 consumes that reviewed store with W's claim/authority
boundary, P's verified provider posture, the existing tool gateway, and H's
handoff readback. It delegates effects and never replaces those owners.

**Tech Stack:** TypeScript strict mode, Zod, Vitest, the existing EventLedger,
tool gateway, task-orchestrator, mounted-workspace capabilities, and
credential-free deterministic fakes.

## Global Constraints

- Approved Lane L design:
  docs/superpowers/specs/2026-07-12-resident-agent-bounded-loop-design.md at
  baa980e04f126ce06f41398fc45169f112321e39.
- This Wave 0B plan is not implementation permission. Each Task 120 or 136
  worker receives its own scoped coordinator authorization, claim, RED/GREEN
  evidence, fresh review, rebase record, git diff --check, and npm run verify.
  A child never merges into neo.
- agent_default remains the sole resident identity. A workflow, run mode,
  provider, credential, tool, or harness is a capability and not a resident.
- Mounted workspace identity, ledger/artifact identities, high-water, policy,
  locks, source/context hashes, and durable task claim are authoritative. A
  missing, stale, swapped, or mismatched fact permits no append, effect,
  projection substitute, cached recovery, or fallback store.
- Plans, observations, model output, tools, and memory remain advisory. They
  cannot accept graph truth, bypass a domain service, or complete a task without
  H-owned exact handoff and ledger readback.
- Normalize every public object/array to frozen plain own-data before append,
  blob write, provider call, tool request, or await. Reject accessors,
  inherited/symbol/unexpected keys, sparse/custom arrays, raw prompt/source/
  provider/path text, and secret-shaped values.
- Exact tool ID + exact toolVersion matching is mandatory. Prefixes, aliases,
  tool families, compatible majors, capability labels, and relabelled side
  effects fail closed; the loop selects no fallback tool, provider, model,
  credential, endpoint, or storage.
- Automatic action requires a policy entry with automaticLocalAction true,
  approval none, and class read-only, local-derivative, or ledger-proposal. It
  never automatically performs ledger review, byte transfer, sending,
  publication/export, destructive repair, legal escalation, sensitive
  disclosure, accepted graph mutation, or another irreversible effect.
- Approval suspension uses the existing independent-human gateway. Consumption
  revalidates the exact request, preview, actor, causation, policy, authority,
  locks, source/context/artifact hashes, P posture, and reservation; no
  self-approval, stale approval, or approval reuse is valid.
- Ledger history stays append-only and projections rebuild only from ledger
  events. Replans, suspensions, resumes, recovery, and corrections append new
  causally linked records; old record bytes never change.
- Deterministic tests are credential-free. Only the coordinator may run the
  later real Nous gate after P selects the capability and current approval,
  budget, lock, source, context, and mounted-authority facts pass. Live
  evidence contains safe IDs, hashes, event IDs, counts, categories, and
  fixed markers only.
- Lane L owns only the stated implementation files. CF-1 owns shared
  schema/event choices; W owns mounts/claims; P owns provider feasibility;
  H owns handoff; R owns the default factory; T owns triggers; U owns browser
  DTOs; and A owns integrated acceptance.

## CF-1 Consumed Contract Surface

CF-1 is the sole shared-contract freeze. Before RED it records the canonical
event names, versions, Zod parsers, fixtures, idempotency keys, module exports,
and owners. A required field, parser, module, or owner mismatch stops the
worker for a coordinator CF-1 correction and rebase; neither L task creates a
shadow type or compatibility parser.

~~~ts
export interface ResidentLoopBudgetUsage {
  readonly planRevisions: number;
  readonly observationRecords: number;
  readonly toolSteps: number;
  readonly providerInvocations: number;
  readonly providerRequestBytes: number;
  readonly providerResponseBytes: number;
  readonly contextBytes: number;
  readonly derivativeArtifactBytes: number;
  readonly activeExecutionMs: number;
  readonly approvalSuspensionMs: number;
}

/** CF-1 re-parses port output as frozen plain own-data; it is not prompt text or authority. */
export interface ResidentVerifiedProviderPostureRef {
  readonly providerCapabilityId: string;
  readonly providerCapabilityVersion: string;
  readonly providerPostureHash: `sha256:${string}`;
  readonly modelId: string;
}

export interface ResidentPlanCandidateBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly residentAgentId: "agent_default";
  readonly runMode: ResidentRunMode;
  readonly workflowDescriptor: ResidentWorkflowDescriptorBinding;
  readonly policyVersion: string;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly sourceEventIds: readonly string[];
  readonly contextPackRefs: readonly {
    readonly contextPackId: string; readonly contentHash: `sha256:${string}`;
  }[];
  readonly budget: { readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage };
  readonly providerPosture?: ResidentVerifiedProviderPostureRef;
  readonly causationId: string;
  readonly correlationId: string;
}

export interface ResidentInitialPlanCandidate extends ResidentPlanCandidateBinding {
  readonly schemaVersion: "resident-initial-plan-candidate.v1";
  readonly planId: string;
  readonly planRevision: 0;
  readonly steps: readonly ResidentPlannedStep[];
}

export interface ResidentReplanCandidate extends ResidentPlanCandidateBinding {
  readonly schemaVersion: "resident-replan-candidate.v1";
  readonly planId: string;
  readonly planRevision: number;
  readonly supersedesPlanRecordEventId: string;
  readonly steps: readonly ResidentPlannedStep[];
}

export interface ResidentInitialPlanPlannerPort {
  createInitialCandidate(input: ResidentPlanCandidateBinding): Promise<ResidentInitialPlanCandidate>;
}

export interface ResidentPlanReplannerPort {
  createReplanCandidate(input: {
    readonly priorPlan: ResidentPlanReadback;
    readonly observation: ResidentObservationRecord;
    readonly binding: ResidentPlanCandidateBinding;
  }): Promise<ResidentReplanCandidate>;
}

export interface ResidentPlannedStep {
  readonly ordinal: number;
  readonly purpose: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly allowlistEntryHash: string;
  readonly expectedSafeOutputClass:
    | "observation" | "derivative" | "proposal" | "approval-request";
  readonly prerequisiteStepOrdinals: readonly number[];
}

export interface ResidentPlanReadback {
  readonly eventId: string;
  readonly streamSequence: number;
  readonly record: ResidentPlanRecord;
}

export interface ResidentPlanObservationStore {
  appendPlan(input: ResidentPlanRecord): Promise<ResidentPlanReadback>;
  appendObservation(input: ResidentObservationRecord): Promise<{
    readonly eventId: string; readonly record: ResidentObservationRecord;
  }>;
  appendToolStep(input: ResidentToolStepRecord): Promise<{
    readonly eventId: string; readonly record: ResidentToolStepRecord;
  }>;
  appendResult(input: ResidentLoopTerminalOrResumableResult): Promise<{
    readonly eventId: string; readonly record: ResidentLoopTerminalOrResumableResult;
  }>;
  readPlan(input: { readonly planRecordEventId: string }): Promise<ResidentPlanReadback | undefined>;
  readObservation(input: { readonly observationEventId: string }): Promise<ResidentObservationRecord | undefined>;
  readToolStep(input: { readonly toolStepEventId: string }): Promise<ResidentToolStepRecord | undefined>;
  readResult(input: { readonly resultEventId: string }): Promise<ResidentLoopTerminalOrResumableResult | undefined>;
}

export interface ResidentLoopCheckpointReadback {
  readonly checkpointEventId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly residentAgentId: "agent_default";
  readonly runMode: ResidentRunMode;
  readonly workflowDescriptor: ResidentWorkflowDescriptorBinding;
  readonly planId: string;
  readonly planRecordEventId: string;
  readonly stepOrdinal: number;
  readonly requestEventId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly allowlistEntryHash: `sha256:${string}`;
  readonly sideEffectClass: ResidentToolSideEffectClass;
  readonly requiredApprovalClass: ResidentApprovalClass;
  readonly previewHash: `sha256:${string}`;
  readonly inputArtifactHashes: readonly `sha256:${string}`[];
  readonly resumptionDeadlineAt: string;
  readonly policyVersion: string;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly sourceEventIds: readonly string[];
  readonly contextPackRefs: readonly { readonly contextPackId: string; readonly contentHash: `sha256:${string}` }[];
  readonly budget: { readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage };
  readonly causationId: string;
  readonly correlationId: string;
}

export interface ResidentLoopCheckpointPort {
  suspendAndReadback(input: ResidentLoopCheckpointReadback): Promise<ResidentLoopCheckpointReadback>;
  readCheckpoint(input: { readonly checkpointEventId: string }): Promise<ResidentLoopCheckpointReadback | undefined>;
}

export interface ResidentLoopApprovalReadback {
  readonly approvalEventId: string;
  readonly requestEventId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly previewHash: `sha256:${string}`;
  readonly approvalClass: ResidentApprovalClass;
  readonly approvingActorId: string;
  readonly causationId: string;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
}

export interface ResidentLoopApprovalPort {
  readApproval(input: { readonly approvalEventId: string }): Promise<ResidentLoopApprovalReadback | undefined>;
  consumeApproval(input: ResidentLoopApprovalReadback): Promise<ResidentLoopApprovalReadback>;
}

export interface ResidentLoopGatewayReadback {
  readonly requestEventId: string;
  readonly decisionEventId?: string;
  readonly resultEventId?: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planRecordEventId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly previewHash?: `sha256:${string}`;
  readonly policyHash: `sha256:${string}`;
  readonly authority: ResidentLoopAuthorityBinding;
  readonly sourceEventIds: readonly string[];
  readonly contextPackRefs: readonly { readonly contextPackId: string; readonly contentHash: `sha256:${string}` }[];
  readonly budget: { readonly consumed: ResidentLoopBudgetUsage; readonly remaining: ResidentLoopBudgetUsage };
  readonly causationId: string;
  readonly correlationId: string;
}

export interface ResidentLoopToolGateway {
  requestAndReadback(input: ResidentLoopGatewayReadback): Promise<ResidentLoopGatewayReadback>;
  readRequest(input: { readonly requestEventId: string }): Promise<ResidentLoopGatewayReadback | undefined>;
  readDecision(input: { readonly requestEventId: string }): Promise<ResidentLoopGatewayReadback | undefined>;
  executeAndReadback(input: ResidentLoopGatewayReadback): Promise<ResidentLoopGatewayReadback>;
  readResult(input: { readonly requestEventId: string }): Promise<ResidentLoopGatewayReadback | undefined>;
}

export interface ResidentLoopMountedAuthorityPort {
  suspendAndRelease(input: ResidentLoopCheckpointReadback): Promise<ResidentLoopCheckpointReadback | undefined>;
  reclaimAndReverify(input: ResidentLoopCheckpointReadback): Promise<ResidentLoopAuthorityBinding | undefined>;
  reverifyAfterAwait(input: ResidentPlanCandidateBinding): Promise<ResidentLoopAuthorityBinding | undefined>;
}

export function parseResidentPlanPolicy(input: unknown): ResidentPlanPolicy;
export function parseResidentInitialPlanCandidate(input: unknown): ResidentInitialPlanCandidate;
export function parseResidentReplanCandidate(input: unknown): ResidentReplanCandidate;
export function parseResidentPlanRecord(input: unknown): ResidentPlanRecord;
export function parseResidentObservationRecord(input: unknown): ResidentObservationRecord;
export function parseResidentToolStepRecord(input: unknown): ResidentToolStepRecord;
export function parseResidentLoopResult(input: unknown): ResidentLoopTerminalOrResumableResult;
export function createResidentPlanObservationStore(input: {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
}): ResidentPlanObservationStore;
~~~

The frozen policy retains all ten ceilings: maxPlanRevisions,
maxObservationRecords, maxToolSteps, maxProviderInvocations,
maxProviderRequestBytes, maxProviderResponseBytes, maxContextBytes,
maxDerivativeArtifactBytes, maxActiveExecutionMs, and approvalTtlMs. Each
dependent record carries planRecordEventId. **The plan equality tuple is exact:**
taskId, attemptId, runId, residentAgentId, runMode, workflowDescriptor ID,
workflowDescriptor version, workflowDescriptor hash, policyVersion, policyHash,
sourceEventIds, contextPackRefs, consumed budget, remaining budget,
workspaceIdentityHash, mountGeneration, ledgerStoreIdentity,
artifactStoreIdentity, ledgerHighWaterEventId, activeLocksHash, causationId,
correlationId, and planId. The store reads the exact plan and rejects any
dependent append or projection when any equality-tuple item differs.

An initial candidate has `planRevision: 0`, a fresh planId, and no superseded
plan. A replan has a fresh planId, the next integer planRevision, and the exact
prior plan event ID in supersedesPlanRecordEventId. CF-1 validates each returned
candidate as plain own-data and requires its binding to equal the frozen policy
and mounted authority exactly. Candidate steps are a finite subset of the
policy's exact allowlist and cannot widen a tool, version, side effect, approval
class, source/context, budget, automatic action, or output class. If a step
needs a provider, its providerCapabilityId, providerCapabilityVersion,
providerPostureHash, and modelId must exactly equal P's verified posture; the
planner/replanner cannot choose, substitute, or widen a provider/model.

The checkpoint, approval, gateway, and W mounted-authority ports are the only
resume path. Task 136 reads a checkpoint, exact plan, gateway request/decision/
result, and approval only from their durable readback ports; it consumes an
approval only through consumeApproval after exact revalidation. W alone
suspends/releases, reclaims/reverifies, and reports mount loss. If W cannot
return mounted authority, Lane L performs no append, effect, projection
substitute, cached continuation, local write, or fallback write.

`ResidentLoopCheckpointReadback` binds the exact resident, descriptor, plan,
step, tool, required approval class, preview, input-artifact hashes, and
resumption deadline in addition to its task/attempt/run, request, policy,
authority, source/context, budget, causation, and correlation bindings. Resume
compares every one of those fields to the authoritative plan, gateway request,
approval, and current mounted authority before append, request, execution, or
continuation. Every resident/descriptor/step/tool/approval/preview/artifact/
deadline mismatch fails closed with no Lane L append, gateway request, or
gateway execution.

~~~ts
export interface ResidentPlanObservationProjection {
  readonly plansByEventId: ReadonlyMap<string, ResidentPlanRecord>;
  readonly observationsByEventId: ReadonlyMap<string, ResidentObservationRecord>;
  readonly toolStepsByEventId: ReadonlyMap<string, ResidentToolStepRecord>;
  readonly resultsByEventId: ReadonlyMap<string, ResidentLoopTerminalOrResumableResult>;
  readonly invalidEventIds: readonly string[];
}

export function projectResidentPlanObservationEvents(
  events: readonly KnowledgeEvent[]
): ResidentPlanObservationProjection;
~~~

The projection derives state only from validated CF-1 ledger events. It marks a
malformed, stale, cross-plan, or unbound record invalid without a fallback
write, blob scan, service-return trust, or accepted-graph mutation. Idempotent
replay returns the same event; changed policy, revision, scope, source/context,
tool/version, budget, preview, authority, or causation is a visible conflict.
A completed / handoff-recorded result requires the authoritative H
`HandoffReadback` verbatim, not a narrowed L-shaped selection, tool/model
success, or copied task status. Its verified outcome, recorded/terminal/task
lifecycle event IDs, and exact H authority binding remain available for the
completion decision.

## File Ownership and Merge Order

| Task | Create only | Must consume | Forbidden | Prerequisites |
| --- | --- | --- | --- | --- |
| 120 | packages/agent/src/plan-observation-contracts.ts; packages/agent/src/plan-observation-projection.ts; packages/agent/test/plan-observation-contracts.test.ts; packages/agent/test/plan-observation-projection.test.ts | CF-1 L contract, EventLedger, secret-safety normalizer | ontology contracts, gateway, task orchestrator, W/P/H/R/T/U/A files, default factory | CF-1 merged |
| 136 | packages/agent/src/bounded-agent-loop.ts; packages/agent/test/bounded-agent-loop.test.ts | reviewed 120 store, W authority/claim, P posture, existing gateway, H readback | all 120 files, shared schemas, provider config, mounts, factory, routes/UI, trigger files | CF-1, 120, 124, 126-130 merged and rebased |

Task 120 merges before Task 136. Any needed shared contract change returns to a
new CF-1 revision. Neither task implements Task 142, runs a direct provider,
or composes the runtime factory.

## Task 120: Versioned Plan/Observation Contracts and Projection

**Files:**

- Create: packages/agent/src/plan-observation-contracts.ts
- Create: packages/agent/src/plan-observation-projection.ts
- Create: packages/agent/test/plan-observation-contracts.test.ts
- Create: packages/agent/test/plan-observation-projection.test.ts
- Claim: docs/agentic/claims/task-120-resident-full-vision-plan-observation-contracts.md

**Consumes and produces:** consume exact CF-1 fixture/event parser. Produce the
strict parsers, ResidentPlanObservationStore, and
projectResidentPlanObservationEvents for Task 136 only.

- [ ] **Step 1: Write failing contract and projection tests.**

Create both tests using the CF-1 fixture. The contract test proves every
immutable readback binding rejects before a dependent append:

~~~ts
it("rejects a dependent observation whose read-back plan binding is forged", async () => {
  const store = createResidentPlanObservationStore({ ledger, actor, now });
  const plan = await store.appendPlan(planRecord());

  await expect(store.appendObservation({
    ...observationFor(plan),
    authority: { ...plan.record.authority, activeLocksHash: hash("other-locks") }
  })).rejects.toThrow(/plan.*authority|authority.*plan/i);

  expect(await ledger.readAll()).toHaveLength(1);
});

it.each([
  ["prefix tool", { toolId: "local.read.extra", toolVersion: "1.0.0" }],
  ["wrong version", { toolId: "local.read", toolVersion: "1.0.1" }],
  ["relabelled effect", { toolId: "local.read", toolVersion: "1.0.0", sideEffectClass: "external-byte-transfer" }]
])("rejects %s before a tool-step append", async (_label, mutation) => {
  await expect(parseResidentToolStepRecord({ ...toolStepFor(plan), ...mutation })).toThrow();
});
~~~

The projection test rebuilds shuffled ledger events, proves stable idempotent
replay, and rejects changed causation/correlation, stale planRecordEventId,
unsafe accessor, cross-run result, and counterfeit completion:

~~~ts
it("does not project a cross-run completed result or mutate accepted graph state", () => {
  const projection = projectResidentPlanObservationEvents([
    planEvent(), observationEvent(), {
      ...resultEvent(), payload: { ...resultEvent().payload, runId: "run_other" }
    }
  ]);

  expect(projection.resultsByEventId.size).toBe(0);
  expect(projection.invalidEventIds).toContain("evt_result_other_run");
  expect(acceptedGraphProjection()).toEqual(beforeAcceptedGraph);
});
~~~

It also enumerates every frozen counter directly. The counterfactual suite
attempts the next action at its ceiling for planRevisions, observationRecords,
toolSteps, providerInvocations, providerRequestBytes, providerResponseBytes,
contextBytes, derivativeArtifactBytes, activeExecutionMs, and
approvalSuspensionMs; every case rejects before append/effect and reads the
unchanged durable counter back. This includes a provider response whose received
byte count would exceed maxProviderResponseBytes before parsing.

- [ ] **Step 2: Run the focused RED command.**

Run:

~~~bash
npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
~~~

Expected: FAIL because both plan-observation modules and their exports are
absent. Record the missing import/export failure in the claim before production
work.

- [ ] **Step 3: Implement the smallest strict contract and projection.**

In plan-observation-contracts.ts add strict Zod parsers and one plain-own-data
normalizer. Require non-optional identity, descriptor, policy, authority,
source/context, budget, causation, and correlation fields. Require finite
nonnegative integer usage/ceilings and consumed plus remaining equality with the
immutable policy; reserve and reread provider/tool/output consumption before
effect. Validate the exact allowlist entry, maximum calls, context packs,
side-effect/approval pairing, and automatic-action restriction.

Implement createResidentPlanObservationStore as validate, append with expected
stream sequence/idempotency, and exact ledger readback. Each observation,
tool-step, and result first reads planRecordEventId and checks the frozen
equality tuple. A mismatch becomes a secret-safe conflict with no substitute
append or memory retry. completed / handoff-recorded requires H exact handoff
readback plus causal run/task proof.

In plan-observation-projection.ts rebuild immutable plans, observations, steps,
and results from validated events; link replans through
supersedesPlanRecordEventId; retain actual counters; list invalid event IDs;
and export read-only collections. It never calls a graph service or writes
state.

- [ ] **Step 4: Run the focused GREEN command.**

Run:

~~~bash
npm test -- packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts
~~~

Expected: PASS proving strict boundary rejection, ten budgets, append/readback,
conflict visibility, exact plan equality, exact allowlist, replan immutability,
replay, and no accepted-graph mutation.

- [ ] **Step 5: Verify, commit, and request fresh review.**

Run:

~~~bash
git diff --check
npm run factory:check
npm run verify
git add packages/agent/src/plan-observation-contracts.ts packages/agent/src/plan-observation-projection.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts docs/agentic/claims/task-120-resident-full-vision-plan-observation-contracts.md
git commit -m "feat: add resident plan observation contracts"
~~~

Expected: all gates pass. A fresh reviewer checks CF-1 binding, negative tests,
append/readback, projection-only behavior, ownership, and claim before merge.

## Task 136: Bounded Plan/Observe/Tool/Replan Loop

**Files:**

- Create: packages/agent/src/bounded-agent-loop.ts
- Create: packages/agent/test/bounded-agent-loop.test.ts
- Claim: docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md

**Dependencies:** CF-1, fresh-reviewed Task 120, Task 124, and Tasks 126-130
are merged. Before RED, coordinator rebases Task 136 to every recorded SHA,
runs the Task 120 focused suite, and records results in the Task 136 claim.

~~~ts
export interface ResidentLoopAdvanceInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly runMode: ResidentRunMode;
  readonly policy: ResidentPlanPolicy;
  readonly sourceEventIds: readonly string[];
  readonly contextPackRefs: readonly {
    readonly contextPackId: string; readonly contentHash: string;
  }[];
  readonly causationId: string;
  readonly correlationId: string;
}

export interface CreateBoundedAgentLoopInput {
  readonly planObservationStore: ResidentPlanObservationStore;
  readonly initialPlanPlanner: ResidentInitialPlanPlannerPort;
  readonly planReplanner: ResidentPlanReplannerPort;
  readonly checkpointPort: ResidentLoopCheckpointPort;
  readonly approvalPort: ResidentLoopApprovalPort;
  readonly mountedAuthorityPort: ResidentLoopMountedAuthorityPort;
  readonly readProviderPosture: (input: ResidentLoopAdvanceInput) => Promise<VerifiedProviderPosture | undefined>;
  readonly toolGateway: ResidentLoopToolGateway;
  readonly readHandoff: (input: {
    readonly taskId: string; readonly attemptId: string; readonly runId: string;
    readonly authority: ResidentLoopAuthorityBinding;
  }) => Promise<HandoffReadback | undefined>;
  readonly nowMonotonicMs: () => number;
}

export interface BoundedAgentLoop {
  advance(input: ResidentLoopAdvanceInput): Promise<ResidentLoopTerminalOrResumableResult>;
  resume(input: ResidentLoopAdvanceInput & {
    readonly resumeCheckpointEventId: string;
  }): Promise<ResidentLoopTerminalOrResumableResult>;
}

export function createBoundedAgentLoop(input: CreateBoundedAgentLoopInput): BoundedAgentLoop;
~~~

ResidentLoopToolGateway is a CF-1 adapter over the existing gateway. It accepts
only a parsed allowlist entry and returns durable request/decision/result
readbacks; it has no raw shell, credential, provider-body, source-byte,
arbitrary-tool, or arbitrary-provider API. Task 136 must call requestAndReadback
then readRequest/readDecision, and executeAndReadback then readResult; it must
not treat a returned gateway-shaped object as a durable fact. VerifiedProvider-
Posture remains P-owned and cannot be chosen, widened, or substituted by L.
InitialPlanPlannerPort and PlanReplannerPort return typed own-data candidates
that CF-1 parses again before append. CheckpointPort, ApprovalPort,
and MountedAuthorityPort make resume ledger-only: an unknown, foreign-task,
foreign-run, or stale checkpoint/approval cannot select a memory recovery path.
H owns `HandoffReadback`; Task 136 consumes that full authoritative type and
does not reconstruct a three-field handoff shape. Completion requires
`handoffReadback.outcome === "verified"`, exact task/run identity, causal
`recordedEventId`, `terminalRunEventId`, and `taskStatusEventId`, and an
`authorityBinding` exactly equal to current mounted authority. These fields
preserve H's lifecycle and authority proof; missing, resumable, unavailable,
inconsistent, cross-run, or authority-mismatched HandoffReadback fails closed
as `persistence-unconfirmed`, never `completed`.

- [ ] **Step 1: Write failing bounded-loop tests.**

Create one test file with frozen Task 120/W/P/H fakes. It covers every matrix
row, beginning with these direct behavior tests:

~~~ts
it("fails before an unlisted prefix tool reaches authoritative gateway readback", async () => {
  const fixture = loopInput();
  const loop = createBoundedAgentLoop(fixture);

  const result = await loop.advance(inputFor({
    policy: policyWithStep({ toolId: "local.inspect.extra", toolVersion: "1.0.0" })
  }));

  expect(result).toMatchObject({ outcome: "failed", category: "validation-failed" });
  expect(fixture.toolGateway.requestAndReadback).not.toHaveBeenCalled();
  expect(fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled();
});

it("suspends, releases through W, and revalidates a changed preview before any effect", async () => {
  const fixture = loopInput({ gatewayDecision: "approval-required" });
  const waiting = await createBoundedAgentLoop(fixture).advance(inputFor());
  expect(waiting).toMatchObject({ outcome: "resumable", category: "approval-required" });

  const resumed = await createBoundedAgentLoop({
    ...fixture, gatewayDecision: "approved", previewHash: hash("changed")
  }).resume({ ...inputFor(), resumeCheckpointEventId: waiting.resumeAnchor!.checkpointEventId });

  expect(resumed).toMatchObject({ outcome: "resumable", category: "approval-stale" });
  expect(fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled();
});

it.each([
  ["missing HandoffReadback", undefined],
  ["resumable HandoffReadback", handoffReadback({ outcome: "resumable" })],
  ["cross-run HandoffReadback", handoffReadback({ runId: "run_other" })],
  ["HandoffReadback with changed authorityBinding", handoffReadback({ authorityBinding: otherAuthority() })],
  ["HandoffReadback without terminal lifecycle proof", handoffReadback({ terminalRunEventId: undefined })]
])("cannot report completed with %s", async (_label, handoffReadback) => {
  const result = await createBoundedAgentLoop(loopInput({ handoffReadback })).advance(inputFor());
  expect(result).not.toMatchObject({ outcome: "completed" });
  expect(result.category).toBe("persistence-unconfirmed");
});

it.each(["unknown checkpoint", "foreign-task checkpoint", "foreign-run checkpoint"])(
  "does not resume from a %s", async (label) => {
    const fixture = loopInput({ resumeCheckpoint: checkpointFor(label) });
    const result = await createBoundedAgentLoop(fixture).resume(resumeInput());
    expect(result).toMatchObject({ outcome: "resumable", category: "persistence-unconfirmed" });
    expect(fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled();
  }
);

it.each([
  "resident", "descriptor", "step", "tool", "approval", "preview", "artifact", "deadline"
])("fails closed before every gateway method on a checkpoint %s mismatch", async (binding) => {
  const fixture = loopInput({ resumeCheckpoint: checkpointFor(`${binding} mismatch`) });
  const result = await createBoundedAgentLoop(fixture).resume(resumeInput());

  expect(result).toMatchObject({ outcome: "resumable", category: "persistence-unconfirmed" });
  expect(fixture.planObservationStore.appendObservation).not.toHaveBeenCalled();
  expect(fixture.toolGateway.requestAndReadback).not.toHaveBeenCalled();
  expect(fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled();
});

it("releases through W without a Lane L write when mount reverify fails", async () => {
  const fixture = loopInput({ mountedAuthorityPort: unavailableAfterSuspend() });
  const result = await createBoundedAgentLoop(fixture).advance(inputFor());
  expect(result).toMatchObject({ outcome: "resumable", category: "workspace-unavailable" });
  expect(fixture.mountedAuthorityPort.suspendAndRelease).toHaveBeenCalledOnce();
  expect(fixture.planObservationStore.appendObservation).not.toHaveBeenCalled();
  expect(fixture.toolGateway.requestAndReadback).not.toHaveBeenCalled();
});

it("rejects a stale approval at consume readback before gateway execution", async () => {
  const fixture = loopInput({ approval: staleApprovalForCurrentRequest() });
  const result = await createBoundedAgentLoop(fixture).resume(resumeInput());
  expect(result).toMatchObject({ outcome: "resumable", category: "approval-stale" });
  expect(fixture.approvalPort.consumeApproval).not.toHaveBeenCalled();
  expect(fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled();
});
~~~

Every resident/descriptor/step/tool/approval/preview/artifact/deadline mismatch
is an individual `it.each` case, not a generic checkpoint test: each must
return the safe resumable category before any append, requestAndReadback, or
executeAndReadback.

- [ ] **Step 2: Run the focused RED command.**

Run:

~~~bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts
~~~

Expected: FAIL because bounded-agent-loop.ts and createBoundedAgentLoop are
absent. Record exact failure and do not alter Task 120, W, P, H, or gateway
files merely to compile.

- [ ] **Step 3: Implement the finite state machine.**

Implement only bounded-agent-loop.ts. At initial plan, before every step, and
after every await before any append/effect/return continuation, call W's
reverifyAfterAwait and require exact task, attempt, run, resident, workspace,
mount generation, ledger/artifact identity, high-water, policy hash, and
active-lock hash. After every await, re-read and compare sourceEventIds,
contextPackRefs, their artifact hashes, policy, and P posture before selecting
the next step. Recheck exact tool/version/side-effect/approval, context packs,
and every reservation before effect.

Advance only: validate a typed own-data initial candidate through
InitialPlanPlannerPort and the CF-1 parser, append/readback initial plan,
append/readback context observation, request one parsed allowlisted action via
requestAndReadback/readRequest, and consume gateway approval only after
ApprovalPort readApproval/consumeApproval exact readback. Execute only through
executeAndReadback/readResult, append/readback outcome observation, then validate
a typed own-data replan through PlanReplannerPort or append a terminal result
or resumable checkpoint. Replan follows only durable observation and cannot add a
tool, tool version, provider/model posture, source/context, approval class,
automatic action, byte budget, or side effect. It references the old plan and
never restores consumed budget. Initial/replan IDs, revisions, supersedes link,
policy equality tuple, exact policy subset, and provider posture must all be
read back before append.

For denial, tool failure, stale source/policy/mount/claim, provider outage,
readback uncertainty, crash boundary, or exhaustion, append a safe result only
while mounted authority remains valid and return matching failed/resumable
category. For approval suspension, CheckpointPort first appends/reads back the
checkpoint, then W suspendAndRelease releases the claim. Resume starts only
after readCheckpoint finds the exact durable resumeAnchor, W
reclaimAndReverify returns current mounted authority, and every plan/gateway/
approval readback is equal. In particular, the checkpoint's resident,
workflowDescriptor, plan/step, tool/version/allowlist/side effect, required
approval class, preview, input-artifact hashes, and resumption deadline must
equal the authoritative plan/gateway/approval facts; each individual mismatch
fails closed before a Lane L append, requestAndReadback, or
executeAndReadback. Unknown/foreign checkpoints, stale approvals, and mount
loss fail closed; mount loss releases through W and writes no Lane L
observation, result, projection substitute, local write, or fallback write.
Resume replays Task 120/gateway/H records and never scans artifacts or trusts
in-memory counters. Exact `HandoffReadback` plus causal run/task/lifecycle and
authority proof alone permits completed; Task 136 retains and checks the full
H-owned readback rather than narrowing it to manifest/output fields.

- [ ] **Step 4: Run the focused GREEN command.**

Run:

~~~bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts
~~~

Expected: PASS proving finite accounting, exact allowlist/approval enforcement,
immutable replan, durable suspension/revalidation, terminal/resumable outcomes,
ledger-only restart recovery, no fallback storage, and no completion without H.

- [ ] **Step 5: Verify, commit, and request fresh review.**

Run:

~~~bash
git diff --check
npm run factory:check
npm run verify
git add packages/agent/src/bounded-agent-loop.ts packages/agent/test/bounded-agent-loop.test.ts docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md
git commit -m "feat: add bounded resident agent loop"
~~~

Expected: all gates pass. Fresh review leads with defects, missing negative
tests, spec drift, no-fallback/approval/completion violations, and ownership
gaps before coordinator merge.

## Deterministic Failure-Injection Matrix

| ID | Owner | Required deterministic proof | Fail-closed result |
| --- | --- | --- | --- |
| L-01 | 120/136 | Next plan revision, observation, tool, provider invocation, provider request bytes, provider response bytes, context bytes, derivative artifact bytes, active execution ms, or approval suspension ms action exceeds its named ceiling. | No effect; every named durable counter reads back unchanged; policy selects terminal/resumable budget result. |
| L-02 | 120/136 | Unknown, prefix, alias, wrong-version, relabelled-side-effect, missing-context, or over-call-count tool. | No gateway execution; validation failure. |
| L-03 | 120/136 | Replan adds tool/provider/model/source/context/approval/automatic-action/budget/effect. | Old plan immutable; visible conflict; no effect. |
| L-04 | 136 | Unknown, foreign-task, foreign-run, forged, self, denied, expired, cross-run, or changed resident/descriptor/step/tool/approval/preview/artifact/deadline/source/context/policy/lock/mount checkpoint or approval. | No effect; exact checkpoint/request/approval readback and stale/denied/persistence-unconfirmed resumable result. |
| L-05 | 136 | Claim loss, mount replacement/disconnect, provider outage, crash between request/checkpoint, or post-await source/context drift. | W suspend/release/reclaim/reverify and durable non-success where mounted; mount loss performs no Lane L write or internal fallback write. |
| L-06 | 120/136 | Orphan bytes, caller result, cached counter, blob scan, or adjacent-task event after restart. | No resume except ledger/H records from resumeAnchor. |
| L-07 | 120 | Accessor, inherited/symbol/unknown key, sparse array, secret/raw text reaches parser/diagnostic. | Reject before append/effect; primary safe durable outcome remains visible. |
| L-08 | 120/136 | Tool/model success, copied task status, or mismatched H manifest claims completion. | Never completed; exact H handoff and causal readback only. |

Task 120 additionally proves projection never calls an accepted-graph service.
Task 136 uses capability-shaped fakes and no real provider. Its gateway fakes
expose only `requestAndReadback`/`readRequest`/`readDecision` and
`executeAndReadback`/`readResult`; no stale `gateway.request` or
`toolGateway.execute` expectation is a valid proof of an effect boundary.

## Rebase, Review, and Coordinator-Only Live Gate

1. Coordinator merges CF-1 and records SHA before Task 120. The Task 120
   reviewer rejects any shared-file edit.
2. After Task 120 review/merge, coordinator rebases Task 136 to its SHA and
   reviewed W/P SHAs, reruns Task 120 focused tests, and records it.
3. Fresh reviewer receives exact design/plan SHAs, commit range, owned files,
   verification, and L-01 through L-08. Important or critical defects get a
   new scoped repair authorization and fresh review while prior claim evidence
   remains immutable.
4. No 120/136 worker invokes Nous or reads credentials. Later, the coordinator
   alone may run npm run agent:nous:smoke only after P selection and current
   approval/budget/lock/source/context/mounted-authority checks. Outage is safe
   feasibility evidence or resumable state, never fabricated pass.

## Rollback and Acceptance Mapping

Rollback is forward-only: parser, policy, projection, or runtime correction is
new coordinator-authorized work with causally linked durable records and fresh
review. It never deletes or rewrites a plan, observation, suspension, gateway
event, terminal result, manifest, or claim. An unsafe consumed contract stops
before an effect and returns to CF-1 correction/rebase.

| Acceptance ID | Lane L proof | Owner |
| --- | --- | --- |
| A-01 | Restart rebuilds plans, counters, observations, results, and handoff only from mounted ledger/artifact/H evidence. | A with L |
| A-02 | Disconnect/replacement releases through W and permits no fallback write. | W/A with 136 |
| A-03/A-06 | Later provider vertical reaches advisory handoff only after P and coordinator Nous gate. | vertical/A, not 120/136 |
| A-05 | Trigger demand cannot bypass L policy; PRR remains draft-only. | T/H/A |
| A-10 | L-01 through L-08 cover budget, approvals, source, crash, secret, cross-run, and handoff failures. | A with L |

## Documentation Audit and Self-Review

Run this audit before the Task 112 documentation commit. It scopes checks to the
relevant section and rejects concrete counterfactuals, including deletion of a
single equality-tuple item, budget counter, recovery port, or post-await guard.

~~~bash
node --input-type=module <<'NODE'
import fs from "node:fs";
const source = fs.readFileSync(
  "docs/superpowers/plans/2026-07-12-resident-agent-bounded-loop-implementation.md",
  "utf8"
);
const part = (value, start, end) => {
  const from = value.indexOf(start);
  const to = value.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error("missing section " + start);
  return value.slice(from, to);
};
const audit = (value) => {
  const global = part(value, "## Global Constraints", "## CF-1 Consumed Contract Surface");
  const contracts = part(value, "## CF-1 Consumed Contract Surface", "## File Ownership and Merge Order");
  const t120 = part(value, "## Task 120:", "## Task 136:");
  const t136 = part(value, "## Task 136:", "## Deterministic Failure-Injection Matrix");
  const matrix = part(value, "## Deterministic Failure-Injection Matrix", "## Rebase, Review, and Coordinator-Only Live Gate");
  const operations = part(value, "## Rebase, Review, and Coordinator-Only Live Gate", "## Rollback and Acceptance Mapping");
  const rollback = part(value, "## Rollback and Acceptance Mapping", "## Documentation Audit and Self-Review");
  const checkpoint = part(
    contracts,
    "export interface ResidentLoopCheckpointReadback",
    "export interface ResidentLoopCheckpointPort"
  );
  const need = (scope, text) => { if (!scope.includes(text)) throw new Error("missing " + text); };
  const needAll = (scope, texts) => texts.forEach(text => need(scope, text));
  needAll(global, [
    "agent_default remains the sole resident identity",
    "fallback store",
    "Exact tool ID + exact toolVersion",
    "revalidates the exact request, preview, actor, causation",
    "Only the coordinator may run the"
  ]);
  needAll(contracts, [
    "ResidentLoopBudgetUsage",
    "maxPlanRevisions", "maxObservationRecords", "maxToolSteps",
    "maxProviderInvocations", "maxProviderRequestBytes", "maxProviderResponseBytes",
    "maxContextBytes", "maxDerivativeArtifactBytes", "maxActiveExecutionMs", "approvalTtlMs",
    "planRecordEventId", "projectResidentPlanObservationEvents", "completed / handoff-recorded",
    "The plan equality tuple is exact:",
    "taskId, attemptId, runId, residentAgentId, runMode, workflowDescriptor ID,",
    "workflowDescriptor version, workflowDescriptor hash, policyVersion, policyHash,",
    "sourceEventIds, contextPackRefs, consumed budget, remaining budget,",
    "workspaceIdentityHash, mountGeneration, ledgerStoreIdentity,",
    "artifactStoreIdentity, ledgerHighWaterEventId, activeLocksHash, causationId,",
    "correlationId, and planId.",
    "ResidentInitialPlanPlannerPort", "createInitialCandidate",
    "ResidentPlanReplannerPort", "createReplanCandidate",
    "readObservation", "readToolStep", "readResult",
    "ResidentLoopCheckpointPort", "readCheckpoint",
    "ResidentLoopApprovalPort", "consumeApproval",
    "ResidentLoopToolGateway", "requestAndReadback",
    "ResidentLoopMountedAuthorityPort", "suspendAndRelease", "reclaimAndReverify", "reverifyAfterAwait",
    "providerCapabilityId, providerCapabilityVersion,",
    "providerPostureHash, and modelId",
    "substitute, cached continuation, local write, or fallback write"
  ]);
  needAll(checkpoint, [
    "residentAgentId", "workflowDescriptor", "planId", "stepOrdinal",
    "toolId", "toolVersion", "allowlistEntryHash", "sideEffectClass",
    "requiredApprovalClass", "previewHash", "inputArtifactHashes",
    "resumptionDeadlineAt", "policyVersion"
  ]);
  needAll(t120, [
    "plan-observation-contracts.ts", "plan-observation-projection.ts",
    "**Step 2: Run the focused RED command.**", "**Step 4: Run the focused GREEN command.**",
    "exact allowlist entry", "completed / handoff-recorded requires H exact handoff",
    "providerResponseBytes", "maxProviderResponseBytes"
  ]);
  needAll(t136, [
    "bounded-agent-loop.ts", "createBoundedAgentLoop",
    "**Step 2: Run the focused RED command.**", "**Step 4: Run the focused GREEN command.**",
    "releases through W", "durable resumeAnchor", "unknown checkpoint", "foreign-task checkpoint",
    "stale approval", "after every await before any append/effect/return continuation",
    "After every await, re-read and compare sourceEventIds,",
    "mount loss releases through W and writes no Lane L",
    "observation, result, projection substitute, local write, or fallback write",
    "fixture.toolGateway.requestAndReadback).not.toHaveBeenCalled()",
    "fixture.toolGateway.executeAndReadback).not.toHaveBeenCalled()",
    "Every resident/descriptor/step/tool/approval/preview/artifact/",
    "is an individual `it.each` case",
    "Promise<HandoffReadback | undefined>",
    "H owns `HandoffReadback`; Task 136 consumes that full authoritative type",
    "handoffReadback.outcome === \"verified\"", "recordedEventId",
    "terminalRunEventId", "taskStatusEventId", "authorityBinding",
    "`authorityBinding` exactly equal to current mounted authority",
    "HandoffReadback with changed authorityBinding",
    "HandoffReadback without terminal lifecycle proof"
  ]);
  if (t136.includes("gateway.request).") || t136.includes("toolGateway.execute).")) {
    throw new Error("stale gateway API in Task 136 test proof");
  }
  if (t136.includes("ResidentLoopTerminalOrResumableResult[\"handoffReadback\"]")) {
    throw new Error("narrowed handoff readback in Task 136");
  }
  needAll(matrix, [
    "L-01", "L-02", "L-03", "L-04", "L-05", "L-06", "L-07", "L-08",
    "provider response bytes", "post-await source/context drift"
  ]);
  need(operations, "coordinator\n   alone may run npm run agent:nous:smoke");
  need(rollback, "Rollback is forward-only");
  need(rollback, "A-10");
};
audit(source);
const replaceInCheckpoint = (value, from, to) => {
  const start = value.indexOf("export interface ResidentLoopCheckpointReadback");
  const end = value.indexOf("export interface ResidentLoopCheckpointPort", start);
  return value.slice(0, start) + value.slice(start, end).replace(from, to) + value.slice(end);
};
const cases = [
  ["tool exactness", value => value.replaceAll("Exact tool ID + exact toolVersion", "tool family")],
  ["plan readback", value => value.replaceAll("planRecordEventId", "removedPlanRecordEventId")],
  ["projection", value => value.replaceAll("projectResidentPlanObservationEvents", "removedProjection")],
  ["loop", value => value.replaceAll("createBoundedAgentLoop", "removedLoop")],
  ["W release", value => value.replaceAll("releases through W", "continues in memory")],
  ["restart", value => value.replaceAll("durable resumeAnchor", "memory cache")],
  ["matrix", value => value.replace("| L-08", "| OMITTED")],
  ["Nous", value => value.replaceAll("coordinator\n   alone may run npm run agent:nous:smoke", "worker may run provider")],
  ["rollback", value => value.replace("Rollback is forward-only", "Rollback is unspecified")],
  ["equality tuple", value => value.replace("correlationId, and planId.", "correlationId.")],
  ["response-byte counter", value => value.replaceAll("maxProviderResponseBytes", "removedProviderResponseCounter")],
  ["initial candidate port", value => value.replaceAll("createInitialCandidate", "removedInitialCandidatePort")],
  ["replan candidate port", value => value.replaceAll("createReplanCandidate", "removedReplanCandidatePort")],
  ["checkpoint port", value => value.replaceAll("readCheckpoint", "removedCheckpointReadback")],
  ["approval consume port", value => value.replaceAll("consumeApproval", "removedApprovalConsume")],
  ["gateway readback port", value => value.replaceAll("requestAndReadback", "removedGatewayReadback")],
  ["gateway execution readback port", value => value.replaceAll("executeAndReadback", "removedGatewayExecutionReadback")],
  ["checkpoint resident binding", value => replaceInCheckpoint(value, "readonly residentAgentId: \"agent_default\";", "readonly removedResidentBinding: string;")],
  ["checkpoint descriptor binding", value => replaceInCheckpoint(value, "readonly workflowDescriptor: ResidentWorkflowDescriptorBinding;", "readonly removedDescriptorBinding: string;")],
  ["checkpoint step binding", value => replaceInCheckpoint(value, "readonly stepOrdinal: number;", "readonly removedStepBinding: number;")],
  ["checkpoint tool binding", value => replaceInCheckpoint(value, "readonly allowlistEntryHash: `sha256:${string}`;", "readonly removedToolBinding: string;")],
  ["checkpoint approval binding", value => replaceInCheckpoint(value, "readonly requiredApprovalClass: ResidentApprovalClass;", "readonly removedApprovalBinding: string;")],
  ["checkpoint preview binding", value => replaceInCheckpoint(value, "readonly previewHash: `sha256:${string}`;", "readonly removedPreviewBinding: string;")],
  ["checkpoint artifact binding", value => replaceInCheckpoint(value, "readonly inputArtifactHashes: readonly `sha256:${string}`[];", "readonly removedArtifactBinding: readonly string[];")],
  ["checkpoint deadline binding", value => replaceInCheckpoint(value, "readonly resumptionDeadlineAt: string;", "readonly removedDeadlineBinding: string;")],
  ["checkpoint mismatch test", value => value.replace("is an individual `it.each` case", "may continue as a generic case")],
  ["handoff ABI", value => value.replaceAll("HandoffReadback", "NarrowedHandoffShape")],
  ["handoff verified outcome", value => value.replace("handoffReadback.outcome === \"verified\"", "handoffReadback.outcome is ignored")],
  ["handoff authority proof", value => value.replace("`authorityBinding` exactly equal to current mounted authority", "authorityBinding is ignored")],
  ["W authority port", value => value.replaceAll("reclaimAndReverify", "removedWReverify")],
  ["W no-write", value => value.replace("mount loss releases through W and writes no Lane L", "mount loss may write locally")],
  ["post-await source/context", value => value.replace("After every await, re-read and compare sourceEventIds,", "After await, use cached source/context")]
];
for (const [label, mutate] of cases) {
  let rejected = false;
  try { audit(mutate(source)); } catch { rejected = true; }
  if (!rejected) throw new Error("counterfactual escaped " + label);
}
console.log("GREEN: Task 112 section-local bounded-loop plan audit passed (" + cases.length + " counterfactual omissions rejected).");
NODE
~~~

Self-review confirms Task 120 covers versioned records, every budget, exact
allowlists, append/readback, replay, and no graph mutation. Task 136 covers
W/P/H consumption, finite progression, suspension/revalidation, terminal and
resumable recovery, and no fallback. The tasks share one Task 120 store,
disjoint files, and CF-1/rebase gates; no shared schema, factory, provider,
handoff, trigger, UI, or acceptance source is claimed.

## Completion and Stop Point

Run the documentation audit, git diff --check, npm run factory:check, and npm
run verify; commit only this plan and the Task 112 claim. Stop for fresh plan
review and coordinator lane-plan approval. This task does not authorize Task
120/136, CF-1 implementation, provider call, child dispatch, integration merge,
or merge into neo.
