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
}

export function parseResidentPlanPolicy(input: unknown): ResidentPlanPolicy;
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
dependent record carries planRecordEventId. The store reads the exact plan and
requires exact task/attempt/run/resident/run-mode, descriptor ID/version/hash,
policy version/hash, source events, context refs, consumed/remaining budget,
authority, causation, correlation, and plan ID equality before append or
projection.

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
A completed / handoff-recorded result requires exact H handoff readback, not
tool or model success.

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
  readonly readClaimAndAuthority: (input: ResidentLoopAdvanceInput) => Promise<ResidentLoopAuthorityBinding | undefined>;
  readonly readProviderPosture: (input: ResidentLoopAdvanceInput) => Promise<VerifiedProviderPosture | undefined>;
  readonly toolGateway: ResidentLoopToolGateway;
  readonly readHandoff: (input: {
    readonly taskId: string; readonly attemptId: string; readonly runId: string;
  }) => Promise<ResidentLoopTerminalOrResumableResult["handoffReadback"] | undefined>;
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
only a parsed allowlist entry and returns durable request/decision/result IDs;
it has no raw shell, credential, provider-body, source-byte, arbitrary-tool, or
arbitrary-provider API. VerifiedProviderPosture remains P-owned and cannot be
chosen, widened, or substituted by L.

- [ ] **Step 1: Write failing bounded-loop tests.**

Create one test file with frozen Task 120/W/P/H fakes. It covers every matrix
row, beginning with these direct behavior tests:

~~~ts
it("fails before an unlisted prefix tool reaches the gateway", async () => {
  const gateway = { request: vi.fn() };
  const loop = createBoundedAgentLoop(loopInput({ toolGateway: gateway }));

  const result = await loop.advance(inputFor({
    policy: policyWithStep({ toolId: "local.inspect.extra", toolVersion: "1.0.0" })
  }));

  expect(result).toMatchObject({ outcome: "failed", category: "validation-failed" });
  expect(gateway.request).not.toHaveBeenCalled();
});

it("suspends, releases through W, and revalidates a changed preview before any effect", async () => {
  const fixture = loopInput({ gatewayDecision: "approval-required" });
  const waiting = await createBoundedAgentLoop(fixture).advance(inputFor());
  expect(waiting).toMatchObject({ outcome: "resumable", category: "approval-required" });

  const resumed = await createBoundedAgentLoop({
    ...fixture, gatewayDecision: "approved", previewHash: hash("changed")
  }).resume({ ...inputFor(), resumeCheckpointEventId: waiting.resumeAnchor!.checkpointEventId });

  expect(resumed).toMatchObject({ outcome: "resumable", category: "approval-stale" });
  expect(fixture.toolGateway.execute).not.toHaveBeenCalled();
});

it("cannot report completed until exact H handoff readback exists", async () => {
  const result = await createBoundedAgentLoop(loopInput({ handoffReadback: undefined })).advance(inputFor());
  expect(result).not.toMatchObject({ outcome: "completed" });
  expect(result.category).toBe("persistence-unconfirmed");
});
~~~

- [ ] **Step 2: Run the focused RED command.**

Run:

~~~bash
npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/execution-loop.test.ts
~~~

Expected: FAIL because bounded-agent-loop.ts and createBoundedAgentLoop are
absent. Record exact failure and do not alter Task 120, W, P, H, or gateway
files merely to compile.

- [ ] **Step 3: Implement the finite state machine.**

Implement only bounded-agent-loop.ts. At initial plan and before every step or
post-await continuation, read W claim/authority and require exact task, attempt,
run, resident, workspace, mount generation, ledger/artifact identity,
high-water, policy hash, and active-lock hash. Recheck source/context, policy,
P posture, exact tool/version/side-effect/approval, context packs, and every
reservation before effect.

Advance only: append/readback initial plan; append/readback context observation;
request one parsed allowlisted action; execute through current gateway decision;
append/readback outcome observation; then append a narrower/equivalent replan,
terminal result, or resumable checkpoint. Replan follows only durable
observation and cannot add a
tool, tool version, provider/model posture, source/context, approval class,
automatic action, byte budget, or side effect. It references the old plan and
never restores consumed budget.

For denial, tool failure, stale source/policy/mount/claim, provider outage,
readback uncertainty, crash boundary, or exhaustion, append a safe result only
while mounted authority remains valid and return matching failed/resumable
category. Mount loss writes no local substitute. Resume begins only from the
durable resumeAnchor, replays Task 120/gateway/H records, rechecks all bindings,
and never scans artifacts or trusts in-memory counters. Exact H handoff plus
causal run/task proof alone permits completed.

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
| L-01 | 120/136 | Next plan, observation, tool, provider, request/response/context/derivative byte, time, or approval-TTL action exceeds ceiling. | No effect; durable counters read back; policy selects terminal/resumable budget result. |
| L-02 | 120/136 | Unknown, prefix, alias, wrong-version, relabelled-side-effect, missing-context, or over-call-count tool. | No gateway execution; validation failure. |
| L-03 | 120/136 | Replan adds tool/provider/model/source/context/approval/automatic-action/budget/effect. | Old plan immutable; visible conflict; no effect. |
| L-04 | 136 | Forged, self, denied, expired, cross-run, changed-preview/source/context/policy/lock/mount approval. | No effect; exact request readback and stale/denied resumable result. |
| L-05 | 136 | Claim loss, mount replacement/disconnect, provider outage, crash between request/checkpoint. | W release/reverify and durable non-success; no internal fallback write. |
| L-06 | 120/136 | Orphan bytes, caller result, cached counter, blob scan, or adjacent-task event after restart. | No resume except ledger/H records from resumeAnchor. |
| L-07 | 120 | Accessor, inherited/symbol/unknown key, sparse array, secret/raw text reaches parser/diagnostic. | Reject before append/effect; primary safe durable outcome remains visible. |
| L-08 | 120/136 | Tool/model success, copied task status, or mismatched H manifest claims completion. | Never completed; exact H handoff and causal readback only. |

Task 120 additionally proves projection never calls an accepted-graph service.
Task 136 uses capability-shaped fakes and no real provider.

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
relevant section and rejects concrete counterfactuals.

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
  const need = (scope, text) => { if (!scope.includes(text)) throw new Error("missing " + text); };
  for (const text of [
    "agent_default remains the sole resident identity",
    "fallback store",
    "Exact tool ID + exact toolVersion",
    "revalidates the exact request, preview, actor, causation",
    "Only the coordinator may run the"
  ]) need(global, text);
  for (const text of [
    "ResidentLoopBudgetUsage",
    "maxDerivativeArtifactBytes",
    "planRecordEventId",
    "projectResidentPlanObservationEvents",
    "completed / handoff-recorded"
  ]) need(contracts, text);
  for (const text of [
    "plan-observation-contracts.ts",
    "plan-observation-projection.ts",
    "**Step 2: Run the focused RED command.**",
    "**Step 4: Run the focused GREEN command.**",
    "exact allowlist entry",
    "completed / handoff-recorded requires H exact handoff"
  ]) need(t120, text);
  for (const text of [
    "bounded-agent-loop.ts",
    "createBoundedAgentLoop",
    "**Step 2: Run the focused RED command.**",
    "**Step 4: Run the focused GREEN command.**",
    "releases through W",
    "durable resumeAnchor",
    "cannot add a\ntool, tool version, provider/model posture"
  ]) need(t136, text);
  for (const text of ["L-01", "L-02", "L-03", "L-04", "L-05", "L-06", "L-07", "L-08"]) need(matrix, text);
  need(operations, "coordinator\n   alone may run npm run agent:nous:smoke");
  need(rollback, "Rollback is forward-only");
  need(rollback, "A-10");
};
audit(source);
const cases = [
  ["tool exactness", value => value.replaceAll("Exact tool ID + exact toolVersion", "tool family")],
  ["plan readback", value => value.replaceAll("planRecordEventId", "removedPlanRecordEventId")],
  ["projection", value => value.replaceAll("projectResidentPlanObservationEvents", "removedProjection")],
  ["loop", value => value.replaceAll("createBoundedAgentLoop", "removedLoop")],
  ["W release", value => value.replaceAll("releases through W", "continues in memory")],
  ["restart", value => value.replaceAll("durable resumeAnchor", "memory cache")],
  ["matrix", value => value.replace("| L-08", "| OMITTED")],
  ["Nous", value => value.replaceAll("coordinator\n   alone may run npm run agent:nous:smoke", "worker may run provider")],
  ["rollback", value => value.replace("Rollback is forward-only", "Rollback is unspecified")]
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
