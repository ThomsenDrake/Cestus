# Durable Specialist Handoff Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build restart-rebuildable specialist handoffs from append-only runner ledger events and content-addressed manifest artifacts through local-runtime DTOs into the Agent cockpit.

**Architecture:** Core event contracts, manifest hashing, and projection land first and are independently reviewable. Runner lifecycle helpers and specialist workflow adoption land only after the core projection can fail closed. Local-runtime and browser integration land last, after lifecycle/runtime owners have merged, and consume only verified projection DTOs.

**Tech Stack:** TypeScript, Zod, Vitest, append-only ontology event ledger, `FileBlobStore` content-addressed artifacts, local runtime HTTP routes, React Agent cockpit.

## Global Constraints

- Preserve append-only ledger semantics. Corrections, retries, revisions, and supersessions are new events.
- Build first handoffs only from exact run, task, type, exact final-output preterminal/resumable ledger state, content-addressed artifact hashes, tool request IDs, source and related event IDs, context provenance, and safe failure state. Run terminal state must follow verified recorded handoff; historical terminal-before-handoff state is inconsistent only.
- Do not synthesize handoffs from completed-run hashes, caller DTOs, returned service values, browser fixture state, or unindexed blob-store scans.
- A handoff is valid only after manifest hash readback and projector verification.
- Task success must not project until a verified handoff binding exists and the task has the correct causally linked status transition.
- Late blob failures and partial effects must remain visible as resumable or inconsistent state, never terminal-looking success.
- Browser modules must parse production-shaped route DTOs and must not import local runtime modules, server registries, domain execution adapters, artifact stores, runner kernels, filesystem, SQLite, or workspace validation code.
- Do not add generic run-start controls, provider execution controls, PRR send controls, graph acceptance controls, or hidden canonical state in React.
- Avoid context-pack builder, prompt-template, lifecycle-bootstrap, and orchestrator files owned by parallel lanes.
- Stop on projection/ledger mismatch, synthetic provenance, partial-effect ambiguity, browser/server boundary leakage, schema conflict, data-loss risk, unavailable dependency, credential need, or verifier failure after two focused repair attempts.
- Final verification for every implementation task is `npm run verify` after the task-specific targeted command passes.
- This plan is not approval to implement. Stop after this plan commit until the coordinator approves execution.

---

## Required Reading

Read these files before claiming any implementation task:

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/agentic/retrospectives/2026-07-10-resident-agent-mvp.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
- `docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md`
- `docs/superpowers/plans/2026-07-09-resident-agent-cockpit-task-run-interface-implementation.md`
- `docs/superpowers/plans/2026-07-09-mvp-resident-agent-scheduler-resumer-implementation.md`
- `docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md`
- This implementation plan
- Existing `docs/agentic/claims/*.md` files touching the same task area

## File Map

### Core Contract And Projection Files

- Modify `packages/ontology/src/contracts.ts`
  - Add narrow final-output step fields.
  - Add `agent.specialist-handoff.prepared` and `agent.specialist-handoff.recorded`.
  - Route handoff events to `agent_run_${runId}`.
- Modify `packages/ontology/test/agent-contracts.test.ts`
  - RED tests for strict payloads, stream routing, final-output fields, compact handoff events, and human-gate independence.
- Modify `packages/agent/src/specialist-handoffs.ts`
  - Extend browser-safe handoff DTO with durable `handoffId` and `handoffRevision`.
  - Keep parsing and hashing secret-safe and capability-neutral.
- Create `packages/agent/src/specialist-handoff-manifest.ts`
  - Manifest schema, pre-manifest handoff identity, canonical JSON, DTO hash, manifest hash, and verification helpers.
- Create `packages/agent/test/specialist-handoff-manifest.test.ts`
  - Hash, circularity, safeSummary agreement, hash-external timestamp, and hostile object tests.
- Create `packages/agent/src/specialist-handoff-projection.ts`
  - Rebuild handoff state from ledger events plus a capability-injected manifest reader.
  - Return `no-output`, `output-persisted`, `handoff-pending`, `handoff-recorded`, `task-completed`, or `inconsistent`.
- Create `packages/agent/test/specialist-handoff-projection.test.ts`
  - Crash-boundary, conflict, supersession, terminal-order, and no-synthesis tests.
- Modify `packages/agent/src/projection-types.ts`
  - Shared exported type aliases for handoff state, final-output step kind, and projection diagnostics if needed by multiple modules.
- Modify `packages/agent/src/index.ts`
  - Export core handoff manifest and projector APIs after tests define their stable surface.

### Runner Lifecycle And Adoption Files

- Modify `packages/agent/src/specialist-runner-kernel.ts`
  - Add two-phase final-output, prepared, recorded, readback, run-terminal, and task-transition helpers.
  - Add last-sequence expected append helper.
- Modify `packages/agent/test/specialist-runner-kernel.test.ts`
  - RED tests for append order, expected sequence, conflict readback, retry timestamps, infrastructure failure, and failed-result handoff gating.
- Modify `packages/agent/src/prr-negotiation-workflow.ts`
- Modify `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify `packages/agent/src/evidence-triage-workflow.ts`
- Modify `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify `packages/agent/src/investigation-planner-workflow.ts`
- Modify `packages/agent/test/investigation-planner-workflow.test.ts`
  - Adopt durable handoff helpers for MVP specialist workflows.
- Modify `packages/agent/src/ontology-bootstrap-workflow.ts`
- Modify `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- Modify `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
  - Adopt durable handoff helpers for ontology bootstrap without graph acceptance.

### Shared Runtime And Browser Integration Files

- Create `packages/local-runtime/src/agent-handoff-projection.ts`
  - Adapt mounted workspace `FileBlobStore` derivative manifest reads into the agent projector without exposing server storage to UI modules.
- Modify `packages/agent/src/cockpit.ts`
  - Add strict browser-safe `handoffDiagnostics` support to `BuildAgentCockpitInput` and `agentCockpitDtoSchema`.
- Modify `packages/local-runtime/src/agent-http-routes.ts`
  - Feed verified specialist handoffs into `buildAgentCockpit({ specialistHandoffs })`.
  - Surface partial/inconsistent projection as `handoffDiagnostics`, not handoff success.
- Modify `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify `packages/local-runtime/test/agent-cockpit-routes.test.ts`
  - Production route DTO tests for verified, pending, missing manifest, and inconsistent states.
- Modify `packages/agent/test/cockpit.test.ts`
  - Package-level schema and builder tests for strict `handoffDiagnostics`.
- Modify `packages/ui/src/agent/agent-adapter.ts`
  - Parse production-shaped `agent-cockpit.v1` route DTOs containing durable handoff fields and `handoffDiagnostics`.
- Modify `packages/ui/test/agent-cockpit-adapter.test.ts`
- Modify `packages/ui/test/agent-adapter.test.ts`
  - Browser parsing tests for strict `handoffDiagnostics`.
- Modify `packages/ui/src/agent/AgentRunCockpit.tsx`
  - Display verified handoffs and partial-state diagnostics for the selected exact run only.
- Modify `packages/ui/test/agent-run-cockpit.test.tsx`
- Modify `packages/ui/test/agent-workspace.test.tsx`
  - Browser schema, exact-selection, no-synthesis, and import-boundary tests.

### Factory Evidence Files

- Create one claim per implementation task under `docs/agentic/claims/`.
- Modify `scripts/check-agent-readiness.mjs`
  - Add the approved durable handoff spec, this plan, final readiness claim, and new core test files once they exist.
- Modify `docs/agentic/software-factory.md`
  - Append concise durable handoff readiness evidence after implementation, preserving existing entries.

## Merge Order

1. Merge this plan after coordinator approval. Do not implement from this branch until execution is approved.
2. Merge Tasks 1-3 as the independent core handoff lane: event contracts, manifest identity/hashing, and projector readback. These tasks must land before any runner, local-runtime, browser, or orchestrator branch consumes `agent.specialist-handoff.*`.
3. Let the production prompt atomic migration lane land next because it also edits `packages/agent/src/specialist-runner-kernel.ts` and the PRR, evidence-triage, investigation-planner, and ontology-bootstrap workflow tests. If that lane changes prompt/output artifact names, final-output schema IDs, or helper signatures, stop and rebase this plan's implementation tasks before editing shared files.
4. Merge Task 4 after Tasks 1-3 and after the production prompt atomic migration. Task 4 must rebase onto the prompt migration result, preserve its finalized prompt/output contracts, and then add two-phase handoff lifecycle helpers.
5. Merge Task 5 and Task 6 after Task 4. They may run in separate worktrees, but both must rebase on the finalized prompt/output contracts and the Task 4 lifecycle helpers before touching workflow tests.
6. Orchestrator implementation waits for both the production prompt atomic migration and this handoff lane's Tasks 1-6. It must not consume provisional prompt artifacts or provisional handoff lifecycle helpers.
7. Merge Task 7 only after lifecycle/runtime owners for scheduler, resumer, domain adapters, and local runtime route contracts have landed on the target branch. Rebase before editing `packages/local-runtime/src/agent-http-routes.ts`, `packages/agent/src/cockpit.ts`, or browser adapter schemas.
8. Merge Task 8 after Task 7 exposes production-shaped cockpit DTOs with `handoffDiagnostics`.
9. Merge Task 9 last. It records readiness and final verification evidence.

## Review Gates

- Each task starts with a claim commit before source or test edits.
- Each task writes RED tests first and records the failing targeted command in the claim.
- Each task runs its targeted command until green, then `npm run verify`.
- Each task commits only owned files plus its claim/readiness evidence.
- After each task commit, request a spec-alignment review and a code-quality review before starting the next dependent task.
- Reviewers lead with defects, missing tests, spec drift, invariant violations, and verification gaps.

## Claim Template

Use this structure for every task claim:

```md
# Task N Durable Specialist Handoff <slug> Claim

Status: claimed
Branch: codex/durable-specialist-handoffs-<slug>
Plan: docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md
Spec: docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md

Scope:
- <exact files from this task>

RED:
- Command: <targeted command>
- Expected failure: <specific missing schema/function/assertion>

GREEN:
- Command: <targeted command>
- Expected pass: all named tests pass

Verification:
- npm run verify

Review:
- Spec review: pending
- Code review: pending
```

## Task 1: Event Contracts And Final-Output Step Semantics

**Files:**

- Create: `docs/agentic/claims/task-1-durable-handoff-event-contracts.md`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/agent-contracts.test.ts`

**Interfaces:**

- Produces ontology event payload contracts:

```ts
export const payloadSchemas = {
  "agent.specialist-run.step.recorded": agentSpecialistRunStepRecordedPayloadSchema,
  "agent.specialist-handoff.prepared": agentSpecialistHandoffPreparedPayloadSchema,
  "agent.specialist-handoff.recorded": agentSpecialistHandoffRecordedPayloadSchema
} as const;
```

- Produces strict payload fields:

```ts
type AgentSpecialistRunStepKind =
  | "audit"
  | "model-review"
  | "tool-request"
  | "local-derivative"
  | "final-output";

type AgentSpecialistHandoffStatus =
  | "ready-for-review"
  | "waiting-for-approval"
  | "blocked"
  | "failed";
```

- Handoff events consume the run stream: `streamId = agent_run_${runId}`.

- Later tasks consume these event names and field names exactly:

```ts
handoffId;
handoffRevision;
idempotencyKey;
handoffManifestHash;
handoffDtoHash;
runId;
taskId;
runType;
residentAgentId;
status;
safeSummary;
finalOutputStepId;
finalOutputEventId;
contextPackHashes;
promptArtifactHash;
outputArtifactHashes;
toolRequestIds;
sourceEventIds;
relatedEventIds;
supersedesHandoffId;
supersedesEventId;
preparedEventId;
verifiedAt;
```

- [ ] **Step 1: Create and commit the task claim**

Create `docs/agentic/claims/task-1-durable-handoff-event-contracts.md` with the claim template, status `claimed`, and scope limited to the three Task 1 files.

Run:

```bash
git add docs/agentic/claims/task-1-durable-handoff-event-contracts.md
git commit -m "chore: claim durable handoff event contracts"
```

Expected: a claim-only commit.

- [ ] **Step 2: Read the contract and test files**

Run:

```bash
sed -n '1,260p' packages/ontology/test/agent-contracts.test.ts
sed -n '900,1225p' packages/ontology/src/contracts.ts
sed -n '1320,1445p' packages/ontology/src/contracts.ts
sed -n '1840,2030p' packages/ontology/src/contracts.ts
```

Expected: current step schema lacks `stepKind`, `stepSchemaId`, and `idempotencyKey`; no `agent.specialist-handoff.*` payload schemas exist; `expectedAgentStreamId` routes only `agent.specialist-run.*` to run streams.

- [ ] **Step 3: Write RED contract tests**

Add these tests to `packages/ontology/test/agent-contracts.test.ts`:

```ts
it("accepts final-output specialist steps while keeping ordinary steps valid", () => {
  const finalOutput = agentEvent(
    "evt_final_output",
    "agent.specialist-run.step.recorded",
    "agent_run_run_handoff_001",
    {
      runId: "run_handoff_001",
      stepId: "step_run_handoff_001_final_output",
      summary: "Final durable output artifacts are persisted.",
      stepKind: "final-output",
      stepSchemaId: "evidence-triage-final-output.v1",
      idempotencyKey: "specialist-final-output:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:sha256:1111111111111111111111111111111111111111111111111111111111111111",
      inputArtifactHashes: [hash111],
      outputArtifactHashes: [hash222, hash333]
    }
  );

  expect(validateKnowledgeEvent(finalOutput).success).toBe(true);
  expect(
    validateKnowledgeEvent({
      ...finalOutput,
      id: "evt_final_output_unknown",
      payload: { ...finalOutput.payload, bulkyDto: { hidden: true } }
    }).success
  ).toBe(false);

  expect(
    validateKnowledgeEvent(
      agentEvent(
        "evt_audit_step",
        "agent.specialist-run.step.recorded",
        "agent_run_run_handoff_001",
        {
          runId: "run_handoff_001",
          stepId: "step_run_handoff_001_audit",
          summary: "Audit step remains valid but is not final output.",
          outputArtifactHashes: [hash111]
        }
      )
    ).success
  ).toBe(true);
});

it("accepts compact handoff prepared and recorded events on the run stream", () => {
  const compactBinding = {
    handoffId: "handoff_run_handoff_001_0123456789abcdef",
    handoffRevision: 1,
    idempotencyKey: "specialist-handoff:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:sha256:2222222222222222222222222222222222222222222222222222222222222222",
    handoffManifestHash: hash222,
    handoffDtoHash: hash333,
    runId: "run_handoff_001",
    taskId: "task_handoff_001",
    runType: "evidence-triage",
    residentAgentId: "agent_default",
    status: "ready-for-review",
    safeSummary: "Evidence triage handoff is ready for human review.",
    finalOutputStepId: "step_run_handoff_001_final_output",
    finalOutputEventId: "evt_final_output",
    contextPackHashes: [hash111],
    promptArtifactHash: hash111,
    outputArtifactHashes: [hash222],
    toolRequestIds: [],
    sourceEventIds: ["evt_source_001"],
    relatedEventIds: ["evt_final_output"]
  };

  const prepared = agentEvent(
    "evt_handoff_prepared",
    "agent.specialist-handoff.prepared",
    "agent_run_run_handoff_001",
    compactBinding
  );
  expect(validateKnowledgeEvent(prepared).success).toBe(true);
  expect(validateKnowledgeEvent({ ...prepared, streamId: "agent_handoff_handoff_run_handoff_001_0123456789abcdef" }).success).toBe(false);

  expect(
    validateKnowledgeEvent(
      agentEvent(
        "evt_handoff_recorded",
        "agent.specialist-handoff.recorded",
        "agent_run_run_handoff_001",
        {
          ...compactBinding,
          preparedEventId: "evt_handoff_prepared",
          verifiedAt: "2026-07-10T14:00:00.000Z"
        }
      )
    ).success
  ).toBe(true);
});
```

- [ ] **Step 4: Run RED command**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts
```

Expected: FAIL because the new fields and `agent.specialist-handoff.*` event types are not yet defined.

- [ ] **Step 5: Implement the narrow contracts**

In `packages/ontology/src/contracts.ts`, add Zod schemas with strict objects and no raw DTO/raw content fields:

```ts
const agentSpecialistRunStepKindSchema = z.enum([
  "audit",
  "model-review",
  "tool-request",
  "local-derivative",
  "final-output"
]);

const agentSpecialistHandoffStatusSchema = z.enum([
  "ready-for-review",
  "waiting-for-approval",
  "blocked",
  "failed"
]);

const agentSpecialistHandoffCompactBindingSchema = z.object({
  handoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/),
  handoffRevision: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  handoffManifestHash: contentHashSchema,
  handoffDtoHash: contentHashSchema,
  runId: z.string().regex(/^run_[a-zA-Z0-9_-]+$/),
  taskId: z.string().regex(/^task_[a-zA-Z0-9_-]+$/).optional(),
  runType: agentSpecialistRunTypeSchema,
  residentAgentId: z.literal("agent_default"),
  status: agentSpecialistHandoffStatusSchema,
  safeSummary: secretSafeStringSchema,
  finalOutputStepId: z.string().min(3),
  finalOutputEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  contextPackHashes: z.array(contentHashSchema),
  promptArtifactHash: contentHashSchema.optional(),
  outputArtifactHashes: z.array(contentHashSchema),
  toolRequestIds: z.array(z.string().regex(/^toolreq_[a-zA-Z0-9_-]+$/)),
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  relatedEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  supersedesHandoffId: z.string().regex(/^handoff_[a-zA-Z0-9_-]+_[a-f0-9]{16}$/).optional(),
  supersedesEventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional()
}).strict();
```

Extend `agentSpecialistRunStepRecordedPayloadSchema` with optional `stepKind`, `stepSchemaId`, and `idempotencyKey`. Add prepared/recorded schemas to `payloadSchemas` and `eventContracts`. Update `expectedAgentStreamId` so `type.startsWith("agent.specialist-handoff.")` returns `agent_run_${payload.runId}`.

- [ ] **Step 6: Run GREEN command**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim with RED/GREEN/verify evidence, then commit:

```bash
git add docs/agentic/claims/task-1-durable-handoff-event-contracts.md packages/ontology/src/contracts.ts packages/ontology/test/agent-contracts.test.ts
git commit -m "feat: add durable specialist handoff event contracts"
```

Request spec and code-quality reviews before Task 2 starts.

## Task 2: Manifest, Handoff Identity, And DTO Hash Contract

**Files:**

- Create: `docs/agentic/claims/task-2-durable-handoff-manifest-envelope.md`
- Create: `packages/agent/src/specialist-handoff-manifest.ts`
- Create: `packages/agent/test/specialist-handoff-manifest.test.ts`
- Modify: `packages/agent/src/specialist-handoffs.ts`
- Modify: `packages/agent/test/specialist-handoffs.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**

- Consumes Task 1 event field names and status vocabulary.
- Produces these exports:

```ts
export const specialistHandoffManifestSchemaVersion = "agent-specialist-handoff-manifest.v1" as const;

export interface SpecialistHandoffIdentitySeed {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly finalOutputEventId: string;
  readonly outputArtifactHashes: readonly `sha256:${string}`[];
  readonly handoffRevision: number;
  readonly supersedesHandoffId?: string;
}

export function computeSpecialistHandoffId(seed: SpecialistHandoffIdentitySeed): string;
export function canonicalSpecialistHandoffJson(value: unknown): Buffer;
export function hashCanonicalSpecialistHandoffJson(value: unknown): `sha256:${string}`;
export function buildSpecialistHandoffManifest(input: BuildSpecialistHandoffManifestInput): SpecialistHandoffManifest;
export function verifySpecialistHandoffManifest(input: VerifySpecialistHandoffManifestInput): SpecialistWorkflowHandoffDto;
```

- Extends `SpecialistWorkflowHandoffDto` with:

```ts
readonly handoffId: string;
readonly handoffRevision: number;
```

- [ ] **Step 1: Create and commit the task claim**

Create `docs/agentic/claims/task-2-durable-handoff-manifest-envelope.md` and commit it with:

```bash
git add docs/agentic/claims/task-2-durable-handoff-manifest-envelope.md
git commit -m "chore: claim durable handoff manifest envelope"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED manifest and DTO tests**

Create `packages/agent/test/specialist-handoff-manifest.test.ts` with tests named:

```ts
it("computes handoffId from the pre-manifest seed without manifest or DTO hashes", () => {});
it("changes manifest and DTO hashes without changing handoffId when only safe presentation changes", () => {});
it("changes handoffId when final output event, output hash set, status, revision, or supersession changes", () => {});
it("documents that same-seed presentation hash separation is not an appendable same-revision correction", () => {});
it("computes a new handoffId for a real presentation correction with incremented revision and supersession", () => {});
it("builds the canonical handoff DTO internally from ledger-bound refs", () => {});
it("rejects caller-supplied DTO mismatch instead of accepting synthetic provenance", () => {});
it("requires exact safeSummary and compact-ref agreement across manifest and DTO", () => {});
it("keeps verifiedAt outside manifest and DTO hashes", () => {});
it("rejects accessors, prototypes, symbols, sparse arrays, boxed values, functions, and non-finite numbers", () => {});
```

Add this assertion to prove the circular dependency is gone:

```ts
const seed = {
  runId: "run_handoff_001",
  taskId: "task_handoff_001",
  runType: "evidence-triage",
  status: "ready-for-review",
  finalOutputEventId: "evt_final_output",
  outputArtifactHashes: [hash222],
  handoffRevision: 1
} as const;

const handoffId = computeSpecialistHandoffId(seed);
const manifest = buildSpecialistHandoffManifest({ ...manifestInput, handoffId });
const changedSummary = buildSpecialistHandoffManifest({
  ...manifestInput,
  handoffId,
  safeSummary: "Updated safe presentation summary."
});

expect(manifest.handoffId).toBe(handoffId);
expect(changedSummary.handoffId).toBe(handoffId);
expect(hashSpecialistHandoffManifest(manifest)).not.toBe(hashSpecialistHandoffManifest(changedSummary));
expect(hashSpecialistWorkflowHandoff(manifest.handoff)).not.toBe(hashSpecialistWorkflowHandoff(changedSummary.handoff));
expect(JSON.stringify(seed)).not.toContain("handoffManifestHash");
expect(JSON.stringify(seed)).not.toContain("handoffDtoHash");
```

Then add a correction-oriented identity test so the hash-separation fixture is not misread as an appendable revision:

```ts
const sameRevisionPresentationChange = buildSpecialistHandoffManifest({
  ...manifestInput,
  handoffId,
  safeSummary: "Updated safe presentation summary."
});
expect(sameRevisionPresentationChange.handoffId).toBe(handoffId);
expect(sameRevisionPresentationChange.handoffRevision).toBe(1);

const correctionSeed = {
  ...seed,
  handoffRevision: 2,
  supersedesHandoffId: handoffId
} as const;
const correctionHandoffId = computeSpecialistHandoffId(correctionSeed);
const correction = buildSpecialistHandoffManifest({
  ...manifestInput,
  handoffId: correctionHandoffId,
  handoffRevision: 2,
  supersedesHandoffId: handoffId,
  supersedesEventId: "evt_handoff_recorded"
});

expect(correctionHandoffId).not.toBe(handoffId);
expect(correction.handoffRevision).toBe(2);
expect(correction.supersedesHandoffId).toBe(handoffId);
```

This test proves hash separation only. It is not permission to append a second same-revision handoff with the unchanged `handoffId`; Task 3 must project that shape as a conflict unless it is a valid supersession with incremented `handoffRevision`, prior-handoff causation, and a new handoff ID.

Update `packages/agent/test/specialist-handoffs.test.ts` so existing fixture handoffs include `handoffId` and `handoffRevision`.

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts
```

Expected: FAIL because `specialist-handoff-manifest.ts`, durable DTO fields, and new exports do not exist.

- [ ] **Step 4: Implement manifest and canonical hash helpers**

Create `packages/agent/src/specialist-handoff-manifest.ts` with:

```ts
export interface SpecialistHandoffManifest {
  readonly schemaVersion: "agent-specialist-handoff-manifest.v1";
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffDtoHash: `sha256:${string}`;
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: "agent_default";
  readonly status: "ready-for-review" | "waiting-for-approval" | "blocked" | "failed";
  readonly safeSummary: string;
  readonly stateKind: "completed" | "failed" | "resumable";
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly outputArtifacts: readonly SpecialistWorkflowOutputArtifactDto[];
  readonly toolRequestIds: readonly string[];
  readonly approvalRequirements: readonly SpecialistWorkflowApprovalRequirementDto[];
  readonly nextSafeActions: readonly SpecialistWorkflowNextSafeActionDto[];
  readonly failure?: SpecialistWorkflowFailureDto;
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
  readonly handoff: SpecialistWorkflowHandoffDto;
}
```

The builder must derive `handoff` from normalized manifest inputs, compute `handoffDtoHash` from canonical DTO bytes, insert no `verifiedAt`, and freeze returned objects. The verifier must parse the manifest, recompute hashes, parse `handoff` through `specialistWorkflowHandoffSchema`, compare exact compact refs, and return the canonical DTO only after all checks pass.

Modify `packages/agent/src/specialist-handoffs.ts` so DTO parsing accepts and preserves `handoffId` and `handoffRevision` and remains browser-safe. Export the new manifest functions from `packages/agent/src/index.ts`.

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-2-durable-handoff-manifest-envelope.md packages/agent/src/specialist-handoff-manifest.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/src/specialist-handoffs.ts packages/agent/test/specialist-handoffs.test.ts packages/agent/src/index.ts
git commit -m "feat: add durable specialist handoff manifest envelope"
```

Request spec and code-quality reviews before Task 3 starts.

## Task 3: Handoff Projector And Crash-State Readback

**Files:**

- Create: `docs/agentic/claims/task-3-durable-handoff-projector.md`
- Create: `packages/agent/src/specialist-handoff-projection.ts`
- Create: `packages/agent/test/specialist-handoff-projection.test.ts`
- Modify: `packages/agent/src/projection-types.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/test/projection.test.ts`
- Modify: `packages/agent/test/cockpit.test.ts`

**Interfaces:**

- Consumes Task 1 event contracts and Task 2 manifest verification.
- Produces:

```ts
export type SpecialistHandoffProjectionState =
  | "no-output"
  | "output-persisted"
  | "handoff-pending"
  | "handoff-recorded"
  | "task-completed"
  | "inconsistent";

export interface SpecialistHandoffManifestReader {
  get(contentHash: `sha256:${string}`): Promise<Buffer>;
}

export interface BuildSpecialistHandoffProjectionInput {
  readonly events: readonly KnowledgeEvent[];
  readonly manifestReader: SpecialistHandoffManifestReader;
  readonly runId?: string;
  readonly taskId?: string;
}

export interface SpecialistHandoffProjection {
  readonly state: SpecialistHandoffProjectionState;
  readonly handoffs: readonly SpecialistWorkflowHandoffDto[];
  readonly selectedHandoff?: SpecialistWorkflowHandoffDto;
  readonly history: readonly SpecialistHandoffProjectionEntry[];
  readonly diagnostics: readonly SpecialistHandoffProjectionDiagnostic[];
}

export async function buildSpecialistHandoffProjection(
  input: BuildSpecialistHandoffProjectionInput
): Promise<SpecialistHandoffProjection>;
```

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-3-durable-handoff-projector.md`:

```bash
git add docs/agentic/claims/task-3-durable-handoff-projector.md
git commit -m "chore: claim durable handoff projector"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED projector tests**

Create `packages/agent/test/specialist-handoff-projection.test.ts` with fixture helpers that append only ledger events and store manifest bytes by content hash. Include tests named:

```ts
it("projects no-output when no exact final-output step exists", async () => {});
it("ignores arbitrary specialist steps as handoff output", async () => {});
it("projects output-persisted after exact final-output step only", async () => {});
it("projects handoff-pending after prepared when manifest is bound but not recorded", async () => {});
it("projects handoff-recorded only after manifest readback verifies", async () => {});
it("projects task-completed only after an actual completed task event follows the verified handoff", async () => {});
it("does not synthesize a handoff from completed-run output hashes", async () => {});
it("fails closed when the manifest is missing, hash mismatched, malformed, or DTO mismatched", async () => {});
it("fails closed when safeSummary, status, refs, output hashes, tool requests, source events, or related events disagree", async () => {});
it("marks terminal-before-handoff historical state inconsistent", async () => {});
it("keeps waiting-for-approval, blocked, and failed outcomes out of task-completed", async () => {});
it("selects the latest valid non-superseded handoff and preserves prior handoffs", async () => {});
it("marks a same-revision presentation change with the unchanged handoffId and different manifest hash inconsistent", async () => {});
it("accepts presentation correction only as an incremented revision with supersedesHandoffId and a new handoffId", async () => {});
it("rejects supersession cycles, cross-run supersession, missing prior handoff, and changed output refs", async () => {});
```

Add focused assertions to `packages/agent/test/projection.test.ts` and `packages/agent/test/cockpit.test.ts`:

```ts
expect(cockpit.selectedRun?.handoff).toBeUndefined();
expect(cockpit.recommendedActions.some((action) => action.kind === "handoff")).toBe(false);
```

Those assertions must use a completed run with output hashes but no `agent.specialist-handoff.recorded`.

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
```

Expected: FAIL because `buildSpecialistHandoffProjection` and projector types do not exist.

- [ ] **Step 4: Implement projector readback**

Create `packages/agent/src/specialist-handoff-projection.ts`. The implementation must:

- Scan events in ledger order.
- Treat `agent.specialist-run.step.recorded` as final output only when `stepKind === "final-output"`, `stepSchemaId` is present, `idempotencyKey` is present, and `outputArtifactHashes` is the complete canonical set referenced by the handoff.
- Never use `agent.specialist-run.completed.payload.outputArtifactHashes` to construct a handoff.
- Load manifest bytes only through `manifestReader.get(handoffManifestHash)`.
- Recompute manifest hash before parsing the manifest.
- Use Task 2 verification to compare exact DTO, manifest, prepared event, recorded event, final-output step, run/task/type/resident/status, safeSummary, context hashes, prompt hash, output hashes, tool request IDs, source event IDs, and related event IDs.
- Return `inconsistent` with secret-safe diagnostics for missing manifest, mismatch, terminal-before-handoff, conflicting final-output step, conflicting prepared/recorded pair, and supersession violations.
- Emit `handoff-recorded` for verified recorded handoffs and `task-completed` only when a completed task status event is causally linked after the verified handoff path.

Export the projector from `packages/agent/src/index.ts`.

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-3-durable-handoff-projector.md packages/agent/src/specialist-handoff-projection.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/src/projection-types.ts packages/agent/src/index.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
git commit -m "feat: project durable specialist handoffs from ledger state"
```

Request spec and code-quality reviews before Task 4 starts.

## Task 4: Runner Kernel Two-Phase Lifecycle Helpers

**Files:**

- Create: `docs/agentic/claims/task-4-durable-handoff-runner-kernel.md`
- Modify: `packages/agent/src/specialist-runner-kernel.ts`
- Modify: `packages/agent/test/specialist-runner-kernel.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**

- Consumes Task 3 projector and Task 2 manifest helpers.
- Produces:

```ts
export interface SpecialistHandoffManifestStore {
  put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }>;
  get(contentHash: `sha256:${string}`): Promise<Buffer>;
}

export function expectedNextSequenceFromStream(events: readonly KnowledgeEvent[]): number;

export async function appendSpecialistFinalOutputStep(input: AppendSpecialistFinalOutputStepInput): Promise<KnowledgeEventOf<"agent.specialist-run.step.recorded">>;
export async function recordSpecialistHandoff(input: RecordSpecialistHandoffInput): Promise<RecordSpecialistHandoffResult>;
export async function finalizeSpecialistRunAfterHandoff(input: FinalizeSpecialistRunAfterHandoffInput): Promise<FinalizeSpecialistRunAfterHandoffResult>;
```

- Required append order:

```text
final-output step -> prepared -> recorded/readback -> run terminal -> causally linked task status transition
```

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-4-durable-handoff-runner-kernel.md`:

```bash
git add docs/agentic/claims/task-4-durable-handoff-runner-kernel.md
git commit -m "chore: claim durable handoff runner kernel"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED kernel tests**

Add tests to `packages/agent/test/specialist-runner-kernel.test.ts` named:

```ts
it("uses last stream sequence plus one for expected append sequencing", async () => {});
it("records final-output, prepared, recorded, terminal run, and task status in order", async () => {});
it("reuses an exact recorded conflict with the original verifiedAt", async () => {});
it("stops on conflicting final-output, prepared, recorded, terminal, or task status events", async () => {});
it("does not append terminal success when manifest persistence fails after final-output", async () => {});
it("allows pre-output infrastructure failure to terminally fail without a handoff", async () => {});
it("requires a verified failed handoff before terminal run failure for a specialist failed result", async () => {});
it("maps ready-for-review, waiting-for-approval, blocked, and failed handoffs to exact task transitions", async () => {});
```

The sequence helper test must include a stream fixture with non-contiguous array length and last sequence:

```ts
expect(expectedNextSequenceFromStream([
  { ...eventA, sequence: 2 },
  { ...eventB, sequence: 7 }
])).toBe(8);
```

The timestamp retry test must use an injected clock that would return a different value on the second attempt and assert the already committed recorded event is reused:

```ts
expect(result.recorded.payload.verifiedAt).toBe("2026-07-10T15:00:00.000Z");
expect(clock.calls).toBe(1);
```

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: FAIL because lifecycle helpers and last-sequence helper do not exist.

- [ ] **Step 4: Implement kernel helpers**

Modify `packages/agent/src/specialist-runner-kernel.ts` so:

- `expectedNextSequenceFromStream(events)` returns `events.at(-1)?.sequence + 1 ?? 1`.
- Final-output append reads the run stream and appends with `expectedNextSequenceFromStream`.
- Exact final-output conflicts continue only when idempotency key, schema, and output hashes match.
- Manifest bytes are written through a store that supports `put` and read through `get`; missing `get` is an unavailable dependency stop.
- `recordSpecialistHandoff` writes manifest bytes, reads them back by hash, appends prepared, verifies through `buildSpecialistHandoffProjection`, appends recorded, then verifies readback again.
- Exact recorded conflicts return the existing recorded event and original `verifiedAt`.
- Terminal run append happens only after verified recorded readback.
- `ready-for-review`, `waiting-for-approval`, `blocked`, and `failed` task mapping follows the approved spec.
- Existing `appendSpecialistCompletion` and `appendSpecialistFailure` remain available for pre-output infrastructure failure paths, but successful specialist result flows move to the new helpers.

Export the helpers from `packages/agent/src/index.ts`.

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-4-durable-handoff-runner-kernel.md packages/agent/src/specialist-runner-kernel.ts packages/agent/test/specialist-runner-kernel.test.ts packages/agent/src/index.ts
git commit -m "feat: add two-phase specialist handoff lifecycle helpers"
```

Request spec and code-quality reviews before runner adoption starts.

## Task 5: PRR, Evidence Triage, And Investigation Planner Runner Adoption

**Files:**

- Create: `docs/agentic/claims/task-5-durable-handoff-mvp-runners.md`
- Modify: `packages/agent/src/prr-negotiation-workflow.ts`
- Modify: `packages/agent/test/prr-negotiation-workflow.test.ts`
- Modify: `packages/agent/src/evidence-triage-workflow.ts`
- Modify: `packages/agent/test/evidence-triage-workflow.test.ts`
- Modify: `packages/agent/src/investigation-planner-workflow.ts`
- Modify: `packages/agent/test/investigation-planner-workflow.test.ts`

**Interfaces:**

- Consumes Task 4 lifecycle helpers.
- Produces durable handoff adoption for run types:

```ts
"prr-negotiation";
"evidence-triage";
"investigation-planner";
```

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-5-durable-handoff-mvp-runners.md`:

```bash
git add docs/agentic/claims/task-5-durable-handoff-mvp-runners.md
git commit -m "chore: claim durable handoff MVP runner adoption"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED adoption tests**

Update each workflow test file with these expectations for successful and resumable outcomes:

```ts
expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
  "agent.specialist-run.step.recorded",
  "agent.specialist-handoff.prepared",
  "agent.specialist-handoff.recorded"
]));

const finalOutputIndex = eventTypes.indexOf("agent.specialist-run.step.recorded");
const preparedIndex = eventTypes.indexOf("agent.specialist-handoff.prepared");
const recordedIndex = eventTypes.indexOf("agent.specialist-handoff.recorded");
const terminalIndex = Math.max(
  eventTypes.indexOf("agent.specialist-run.completed"),
  eventTypes.indexOf("agent.specialist-run.failed")
);
expect(finalOutputIndex).toBeLessThan(preparedIndex);
expect(preparedIndex).toBeLessThan(recordedIndex);
expect(recordedIndex).toBeLessThan(terminalIndex);
expect(result.handoff).toEqual(projected.selectedHandoff);
```

Add crash-boundary tests:

```ts
it("leaves late derivative or manifest persistence failure visible without terminal success", async () => {});
it("records invalid model output as a verified failed handoff before terminal run failure", async () => {});
it("keeps waiting-for-approval task state waiting instead of completed", async () => {});
it("keeps blocked task state blocked and resumable instead of completed", async () => {});
```

Update existing tests that currently assert failed model output has no step event. Failed specialist results now need a failed final-output binding when they have durable safe result state; pre-output infrastructure failures remain allowed to fail without handoff.

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Expected: FAIL because the runners still append terminal run events before durable handoff recording or return handoffs from local DTO construction.

- [ ] **Step 4: Adopt lifecycle helpers in the three runners**

For each runner:

- Normalize and freeze handoff-bound values before blob writes or awaits.
- Persist all output artifacts and read them back through the derivative store.
- Append an exact final-output step with `stepKind: "final-output"`, the descriptor final-output schema ID, complete output hash set, and deterministic idempotency key.
- Build the handoff manifest from ledger-bound refs and verified artifacts, not from the returned DTO.
- Call `recordSpecialistHandoff`.
- Read back projection and return only `selectedHandoff`.
- Append terminal run and task transition only through `finalizeSpecialistRunAfterHandoff`.
- Keep pre-output infrastructure failure paths on `appendSpecialistFailure` without a handoff.
- Keep PRR send, provider execution, and graph acceptance outside this task.

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts packages/agent/test/specialist-runner-kernel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-5-durable-handoff-mvp-runners.md packages/agent/src/prr-negotiation-workflow.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/src/evidence-triage-workflow.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/src/investigation-planner-workflow.ts packages/agent/test/investigation-planner-workflow.test.ts
git commit -m "feat: record durable handoffs in MVP specialist runners"
```

Request spec and code-quality reviews before Task 6 starts.

## Task 6: Ontology Bootstrap Durable Handoff Adoption

**Files:**

- Create: `docs/agentic/claims/task-6-durable-handoff-ontology-bootstrap.md`
- Modify: `packages/agent/src/ontology-bootstrap-workflow.ts`
- Modify: `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- Modify: `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`

**Interfaces:**

- Consumes Task 4 lifecycle helpers.
- Produces durable handoff adoption for run type `"ontology-bootstrap"` without accepting graph state.

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-6-durable-handoff-ontology-bootstrap.md`:

```bash
git add docs/agentic/claims/task-6-durable-handoff-ontology-bootstrap.md
git commit -m "chore: claim durable handoff ontology bootstrap adoption"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED ontology bootstrap tests**

Update `packages/agent/test/ontology-bootstrap-workflow.test.ts` with:

```ts
it("records final-output, prepared, recorded, terminal run, and task transition in order", async () => {});
it("returns the projector-readback handoff rather than a caller DTO", async () => {});
it("does not accept graph state or stage ontology facts as part of handoff recording", async () => {});
it("keeps manifest persistence failure after output-persisted resumable and non-successful", async () => {});
it("records failed specialist result as verified failed handoff before terminal failure", async () => {});
```

Update `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts` only for route fixtures that assert the old terminal-before-handoff order.

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: FAIL because ontology bootstrap still uses its own step/completion helpers and does not record a manifest-bound handoff.

- [ ] **Step 4: Adopt lifecycle helpers in ontology bootstrap**

Modify `packages/agent/src/ontology-bootstrap-workflow.ts` so final report, candidate set, bundle, preview, and context hashes are represented in the final-output step and handoff manifest. Use the same two-phase helper sequence as Task 5. Preserve existing ontology bootstrap restrictions:

- no accepted graph review
- no graph acceptance
- no PRR send
- no legacy staging approval
- no provider execution controls

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/agent/test/specialist-handoff-projection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-6-durable-handoff-ontology-bootstrap.md packages/agent/src/ontology-bootstrap-workflow.ts packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts
git commit -m "feat: record durable handoffs in ontology bootstrap"
```

Request spec and code-quality reviews before shared runtime integration starts.

## Task 7: Local Runtime Production Handoff Projection

**Files:**

- Create: `docs/agentic/claims/task-7-durable-handoff-local-runtime-projection.md`
- Create: `packages/local-runtime/src/agent-handoff-projection.ts`
- Modify: `packages/agent/src/cockpit.ts`
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/agent/test/cockpit.test.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`
- Modify: `packages/local-runtime/test/agent-cockpit-routes.test.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Modify: `packages/ui/test/agent-cockpit-adapter.test.ts`
- Modify: `packages/ui/test/agent-adapter.test.ts`

**Interfaces:**

- Consumes Task 3 projector and verified handoff DTOs from Tasks 5-6.
- Produces:

```ts
export interface LocalAgentHandoffProjectionResult {
  readonly specialistHandoffs: readonly SpecialistWorkflowHandoffDto[];
  readonly diagnostics: readonly SpecialistHandoffProjectionDiagnostic[];
}

export async function projectLocalAgentHandoffsForCockpit(input: {
  readonly handle: LocalRuntimeHandle;
  readonly events: readonly KnowledgeEvent[];
}): Promise<LocalAgentHandoffProjectionResult>;

export interface AgentCockpitHandoffDiagnosticDto {
  readonly schemaVersion: "agent-cockpit-handoff-diagnostic.v1";
  readonly runId: string;
  readonly taskId?: string;
  readonly runType?: string;
  readonly state: "no-output" | "output-persisted" | "handoff-pending" | "inconsistent";
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
}
```

- `packages/agent/src/cockpit.ts` must extend `BuildAgentCockpitInput` with `handoffDiagnostics?: readonly AgentCockpitHandoffDiagnosticDto[]` and `agentCockpitDtoSchema` with strict `handoffDiagnostics: z.array(agentCockpitHandoffDiagnosticDtoSchema)`.
- Manifest bytes must be read from `new FileBlobStore(handle.mountedWorkspace.paths.derivativeRoot).get(hash)`.
- If `handle.mountedWorkspace` is absent and the ledger contains handoff events, return a diagnostic and no handoff DTOs.

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-7-durable-handoff-local-runtime-projection.md`:

```bash
git add docs/agentic/claims/task-7-durable-handoff-local-runtime-projection.md
git commit -m "chore: claim durable handoff local-runtime projection"
```

Expected: a claim-only commit.

- [ ] **Step 2: Rebase and inspect runtime owner files**

Before editing, rebase onto the target branch that includes lifecycle/runtime owner changes. Then run:

```bash
sed -n '1,220p' packages/local-runtime/src/runtime-factory.ts
sed -n '1,220p' packages/local-runtime/src/agent-runtime-factory.ts
sed -n '1,240p' packages/local-runtime/src/agent-http-routes.ts
sed -n '1,220p' packages/agent/src/cockpit.ts
sed -n '1,120p' packages/ontology/src/blob-store.ts
```

Expected: `LocalRuntimeHandle` exposes `mountedWorkspace`, and `FileBlobStore.get` verifies content-addressed bytes. If those contracts changed, stop for coordinator merge ordering.

- [ ] **Step 3: Write RED route tests**

Add tests that create production ledger events and manifest bytes, then call `GET /api/agent/cockpit`:

```ts
it("returns cockpit handoffs only from verified handoff projection", async () => {});
it("does not return a handoff for output-persisted or handoff-pending state", async () => {});
it("returns a safe diagnostic for missing or hash-mismatched manifest bytes", async () => {});
it("does not scan blobs or accept caller DTOs when no ledger-bound manifest exists", async () => {});
it("passes production-shaped handoff DTOs through buildAgentCockpit", async () => {});
it("projects partial handoff states into strict cockpit handoffDiagnostics", async () => {});
```

Each successful route DTO test must assert:

```ts
expect(body.selectedRun.handoff.handoffId).toMatch(/^handoff_run_/);
expect(body.selectedRun.handoff.handoffRevision).toBe(1);
expect(body.selectedRun.handoff.safeSummary).toBe(recorded.payload.safeSummary);
```

Each partial-state route DTO test must assert:

```ts
expect(body.selectedRun?.handoff).toBeUndefined();
expect(body.handoffDiagnostics).toEqual([
  expect.objectContaining({
    schemaVersion: "agent-cockpit-handoff-diagnostic.v1",
    runId: "run_handoff_001",
    state: "handoff-pending",
    severity: "warning",
    allowedRepairActions: expect.arrayContaining(["resume handoff recording"])
  })
]);
```

Add package-level tests to `packages/agent/test/cockpit.test.ts`:

```ts
it("includes strict browser-safe handoffDiagnostics in cockpit DTOs", () => {});
it("rejects handoffDiagnostics with raw manifest bytes, blob paths, or unknown fields", () => {});
```

Add browser schema tests to `packages/ui/test/agent-cockpit-adapter.test.ts` or `packages/ui/test/agent-adapter.test.ts`:

```ts
it("parses production cockpit handoffDiagnostics without importing server-only projector code", () => {});
it("rejects malformed handoffDiagnostics instead of treating partial state as success", () => {});
```

- [ ] **Step 4: Run RED command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/agent/test/cockpit.test.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts
```

Expected: FAIL because local runtime does not project handoff manifests into cockpit DTOs and cockpit schemas do not yet define `handoffDiagnostics`.

- [ ] **Step 5: Implement local runtime adapter**

Create `packages/local-runtime/src/agent-handoff-projection.ts` and use it in the cockpit route:

- Read `events` once from `input.handle.ledger.readAll()`.
- Instantiate `FileBlobStore` only inside local-runtime code and only for `mountedWorkspace.paths.derivativeRoot`.
- Call `buildSpecialistHandoffProjection({ events, manifestReader })`.
- Extend `packages/agent/src/cockpit.ts` with strict `AgentCockpitHandoffDiagnosticDto`, `BuildAgentCockpitInput.handoffDiagnostics`, and `agentCockpitDtoSchema.shape.handoffDiagnostics`.
- Map projector diagnostics into `handoffDiagnostics` with safe code, message, allowed repair actions, related event IDs, and artifact hashes only.
- Pass `projection.handoffs` and `handoffDiagnostics` into `buildAgentCockpit({ specialistHandoffs, handoffDiagnostics })`.
- Extend `packages/ui/src/agent/agent-adapter.ts` so browser parsing accepts strict `handoffDiagnostics` and rejects unknown diagnostic fields.
- Do not expose blob paths, local filesystem paths, raw manifest bytes, raw DTO content outside the DTO schema, or server-only storage objects.

- [ ] **Step 6: Run GREEN command**

Run:

```bash
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/agent/test/cockpit.test.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-7-durable-handoff-local-runtime-projection.md packages/local-runtime/src/agent-handoff-projection.ts packages/agent/src/cockpit.ts packages/local-runtime/src/agent-http-routes.ts packages/agent/test/cockpit.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/ui/src/agent/agent-adapter.ts packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts
git commit -m "feat: project durable specialist handoffs in local runtime"
```

Request spec and code-quality reviews before Task 8 starts.

## Task 8: Browser Adapter And Agent Run Cockpit Parsing

**Files:**

- Create: `docs/agentic/claims/task-8-durable-handoff-browser-cockpit.md`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Modify: `packages/ui/src/agent/AgentRunCockpit.tsx`
- Modify: `packages/ui/test/agent-cockpit-adapter.test.ts`
- Modify: `packages/ui/test/agent-adapter.test.ts`
- Modify: `packages/ui/test/agent-run-cockpit.test.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`

**Interfaces:**

- Consumes Task 7 production-shaped `agent-cockpit.v1` DTOs.
- Produces browser parsing and selected-run display for durable handoffs without server imports.

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-8-durable-handoff-browser-cockpit.md`:

```bash
git add docs/agentic/claims/task-8-durable-handoff-browser-cockpit.md
git commit -m "chore: claim durable handoff browser cockpit"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED browser tests**

Update UI tests with production-shaped route fixtures that include durable handoff fields:

```ts
it("parses production-shaped cockpit DTOs with durable handoff identity", () => {});
it("renders selected-run handoff only for exact run, task, and run type", () => {});
it("renders pending or inconsistent handoff diagnostics as unavailable or resumable state", () => {});
it("does not render generic run start, provider execution, PRR send, graph acceptance, or hidden mutation controls", () => {});
it("keeps browser agent modules free of server-only handoff imports", () => {});
```

The import-boundary test must read source text and reject these strings in `packages/ui/src/agent/agent-adapter.ts`, `packages/ui/src/agent/AgentRunCockpit.tsx`, and other React-importable Agent modules:

```ts
[
  "specialist-handoff-projection",
  "agent-handoff-projection",
  "local-runtime",
  "domain-execution-adapter-registry",
  "domain-execution-dispatcher",
  "specialist-runner-kernel",
  "FileBlobStore",
  "node:fs",
  "sqlite"
]
```

- [ ] **Step 3: Run RED command**

Run:

```bash
npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx
```

Expected: FAIL because browser schemas do not yet parse durable handoff fields or diagnostics.

- [ ] **Step 4: Implement browser parsing and display**

Modify `packages/ui/src/agent/agent-adapter.ts` so its schema accepts the same durable handoff fields that Task 7 returns. Keep parsing strict. If a route DTO contains partial handoff diagnostics, parse them as read-only display facts.

Modify `packages/ui/src/agent/AgentRunCockpit.tsx` so:

- Selected run handoff display requires exact run ID, task ID, and run type.
- Missing, pending, or inconsistent handoff state displays a safe unavailable/resumable message.
- Handoff status, safe summary, context refs, output artifact refs, tool request IDs, approval requirements, failure DTO, and next safe actions are read-only.
- No browser state becomes the canonical handoff source.
- No new controls execute provider calls, send PRRs, accept graph state, or start generic runs.

- [ ] **Step 5: Run GREEN command**

Run:

```bash
npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Full verification, claim update, commit, and review**

Run:

```bash
npm run verify
```

Expected: PASS.

Update the claim, then commit:

```bash
git add docs/agentic/claims/task-8-durable-handoff-browser-cockpit.md packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/AgentRunCockpit.tsx packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx
git commit -m "feat: render durable specialist handoffs in Agent cockpit"
```

Request spec and code-quality reviews before Task 9 starts.

## Task 9: Readiness, Factory Index, And Full Verification

**Files:**

- Create: `docs/agentic/claims/task-9-durable-handoff-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md`

**Interfaces:**

- Consumes all prior task commits and review verdicts.
- Produces final factory evidence that the durable specialist handoff lane is ready to merge.

- [ ] **Step 1: Create and commit the task claim**

Create and commit `docs/agentic/claims/task-9-durable-handoff-readiness.md`:

```bash
git add docs/agentic/claims/task-9-durable-handoff-readiness.md
git commit -m "chore: claim durable handoff readiness evidence"
```

Expected: a claim-only commit.

- [ ] **Step 2: Write RED readiness checks**

Modify `scripts/check-agent-readiness.mjs` so `requiredFiles` includes:

```js
"docs/superpowers/specs/2026-07-10-durable-specialist-handoff-production-design.md",
"docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md",
"docs/agentic/claims/task-9-durable-handoff-readiness.md",
"packages/agent/src/specialist-handoff-manifest.ts",
"packages/agent/src/specialist-handoff-projection.ts",
"packages/agent/test/specialist-handoff-manifest.test.ts",
"packages/agent/test/specialist-handoff-projection.test.ts",
"packages/local-runtime/src/agent-handoff-projection.ts"
```

Run:

```bash
npm run factory:check
```

Expected before the claim/readiness evidence is complete: FAIL naming the missing readiness claim or any untracked required file. Expected after evidence is complete: PASS.

- [ ] **Step 3: Append factory readiness evidence**

Append a concise section to `docs/agentic/software-factory.md` with:

- spec path
- plan path
- task claim paths
- final targeted command list
- `npm run verify` result
- reviewer verdict summaries
- merge-order confirmation
- any explicitly accepted residual risk

Preserve existing readiness history and do not remove prior slice evidence.

- [ ] **Step 4: Run final targeted command suite**

Run:

```bash
npm test -- packages/ontology/test/agent-contracts.test.ts
npm test -- packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoffs.test.ts
npm test -- packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/projection.test.ts packages/agent/test/cockpit.test.ts
npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/evidence-triage-workflow.test.ts packages/agent/test/prr-negotiation-workflow.test.ts packages/agent/test/investigation-planner-workflow.test.ts
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts
npm test -- packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-cockpit-routes.test.ts packages/agent/test/cockpit.test.ts
npm test -- packages/ui/test/agent-cockpit-adapter.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-run-cockpit.test.tsx packages/ui/test/agent-workspace.test.tsx
```

Expected: each command PASS.

- [ ] **Step 5: Run final repository gates**

Run:

```bash
git diff --check
npm run factory:check
npm run verify
```

Expected: PASS for all commands.

- [ ] **Step 6: Update claim, plan, commit, and request final reviews**

Update `docs/agentic/claims/task-9-durable-handoff-readiness.md` and this plan with completed evidence links. Then commit:

```bash
git add docs/agentic/claims/task-9-durable-handoff-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-10-durable-specialist-handoff-production-implementation.md
git commit -m "docs: record durable specialist handoff readiness"
```

Request final spec and code-quality reviews. Merge only after both reviews report no blocking defects and `npm run verify` passed on the merge target checkout.

## Stop Conditions

Stop and escalate immediately if any of these happen:

- `agent.specialist-handoff.*` contracts conflict with another branch's event-contract addition.
- The event store cannot expose last stream sequence through readback events.
- Any append helper would need collection length instead of `last.sequence + 1`.
- Recovery would need caller memory, returned DTOs, completed-run hashes, or blob-store scanning.
- A terminal completed run exists before a recorded handoff and a task wants to show success.
- A manifest hash, DTO hash, safeSummary, output hash, tool request ID, source event ID, related event ID, or context provenance ref disagrees.
- A late blob failure or partial-effect path cannot be shown as resumable or inconsistent.
- Supersession would change output artifacts, tool requests, source events, run/task/type/resident identity, terminal run state, or status.
- A browser module would need a local-runtime, server registry, domain adapter, runner kernel, artifact store, filesystem, SQLite, or workspace validation import.
- Any implementation task wants to edit context-pack builders, prompt-template modules, lifecycle-bootstrap files, or orchestrator files owned by parallel lanes.
- `npm run verify` fails twice after focused repair attempts.

## Execution Gate

After this plan is approved, implement with `superpowers:subagent-driven-development` unless the coordinator explicitly selects inline execution. Each subagent receives exactly one task, the approved spec, this plan, owned files, stop conditions, targeted commands, and required review gates. Do not batch dependent tasks through a single unreviewed commit.
