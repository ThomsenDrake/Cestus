# MVP Specialist Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and stage the MVP specialist workflow orchestration contracts for `prr-negotiation`, `evidence-triage`, `timeline-builder`, `contradiction-finder`, `investigation-planner`, and `report-builder` under the single resident Cestus Agent identity.

**Architecture:** Start with pure registry metadata, prompt/tool descriptors, and handoff DTO schemas that are inert and fail closed. Full workflow runners are dependency-gated until scheduler/resumer contracts and domain adapter contracts land, then each mode composes authoritative domain services through approval-bound tool requests.

**Tech Stack:** TypeScript, Zod, Vitest, existing `packages/agent` runtime/projection/context-pack/prompt-artifact/tool-gateway contracts, existing PRR/ingestion/ontology/governance read models, Markdown factory docs.

## Global Constraints

- There is one durable resident Cestus Agent identity. Specialist workflows are typed run modes under that identity, not new agent personas.
- Registry metadata must not enable workflow execution. Generic `startRun` may append only run-start and task-running events for these modes.
- Full workflow execution must wait for scheduler/resumer and relevant domain adapter contracts.
- Prompt artifacts are the provider boundary. Do not store production prompt text in ledger events, DTOs, diagnostics, docs, claims, or logs.
- Live providers may be used only by explicit opt-in acceptance commands. Live output evidence must be safe hashes, IDs, counts, categories, and markers.
- PRR sends, legal escalation, export/publication, provider byte transfer, destructive repair, accepted graph review, sensitive opt-ins, and quarantine release require human/domain approval gates.
- Evidence triage, timeline building, contradiction finding, planning, and reporting produce dossiers, drafts, proposals, and review bundles only. They do not accept ontology truth.
- Browser DTOs must be secret-safe and raw-content-free by default.
- Every implementation task runs its targeted command, then `npm run verify`, before commit.

---

## Required Reading

Before implementation, read:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
7. `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
8. `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`
9. `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`
10. This plan

## File Map

- `packages/agent/src/specialist-workflows.ts`: pure workflow descriptor registry for the six MVP run modes, context pack requirements, prompt template metadata, tool descriptors, output descriptors, failure categories, and execution prerequisites.
- `packages/agent/src/specialist-handoffs.ts`: strict browser-safe handoff DTO schemas, artifact refs, approval refs, next safe action refs, failure DTOs, and stable hashing helpers.
- `packages/agent/src/specialists.ts`: keep the approved run type vocabulary and fail-closed execution status wired to descriptor metadata.
- `packages/agent/src/index.ts`: public exports for descriptor and handoff modules.
- `packages/agent/test/specialist-workflows.test.ts`: descriptor registry tests proving single resident identity, exact mode coverage, fail-closed execution, context/prompt/tool metadata, and no risky direct execution.
- `packages/agent/test/specialist-handoffs.test.ts`: DTO safety, stable hashing, unknown-field rejection, no raw content, no secret-shaped keys, and no accepted-truth authority claims.
- `docs/agentic/claims/task-*-mvp-specialist-*.md`: future implementation claims.
- `scripts/check-agent-readiness.mjs`: track this approved spec and plan after the planning slice is accepted.
- `docs/agentic/software-factory.md`: record final planning validation evidence.

## Prerequisite Gates

Tasks 1 and 2 may be implemented immediately after this plan is approved because they are pure metadata and schemas. Task 3 may be implemented with them if it keeps runtime behavior fail-closed. Tasks 4 through 9 must not be claimed until the named prerequisite contracts exist in the target branch.

| Task range | Gate |
| --- | --- |
| Tasks 1-3 | Safe metadata and DTO schemas only. No workflow runner, route, scheduler wake, provider call, or domain effect. |
| Task 4 | Scheduler/resumer DTOs expose resumable, stale, blocked-prerequisite, blocked-lock, and waiting-for-approval states. |
| Tasks 5-8 | Relevant domain adapters expose approved-request consumption through authoritative services. |
| Task 9 | At least one workflow runner from Tasks 5-8 has landed, or the UI is limited to descriptor and handoff DTO display. |

## Descriptor Shape

Task 1 should introduce this exported shape:

```ts
export interface SpecialistWorkflowDescriptor {
  readonly runType: AgentSpecialistRunType;
  readonly label: string;
  readonly purpose: string;
  readonly executionEnabled: false;
  readonly prerequisiteContractIds: readonly string[];
  readonly contextPacks: readonly SpecialistContextPackRequirement[];
  readonly promptTemplate: SpecialistPromptTemplateDescriptor;
  readonly allowedTools: readonly SpecialistToolDescriptor[];
  readonly approvalRequirements: readonly SpecialistApprovalDescriptor[];
  readonly outputArtifacts: readonly SpecialistOutputDescriptor[];
  readonly handoffSchemaId: string;
  readonly failureModes: readonly string[];
}
```

All descriptor text must be secret-safe. Descriptors are allowed to name side-effect and approval classes, but they must not expose executable functions.

---

## Task 1: Pure Specialist Workflow Registry

**Files:**

- Create: `docs/agentic/claims/task-1-mvp-specialist-workflow-registry.md`
- Create: `packages/agent/src/specialist-workflows.ts`
- Create: `packages/agent/test/specialist-workflows.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**

- Consumes:
  - `approvedAgentSpecialistRunTypes` and `type AgentSpecialistRunType` from `packages/agent/src/specialists.ts`
  - `type AgentToolApprovalClass` and `type AgentToolSideEffectClass` from `packages/agent/src/projection-types.ts`
- Produces:
  - `specialistWorkflowDescriptors: readonly SpecialistWorkflowDescriptor[]`
  - `specialistWorkflowDescriptorFor(runType: AgentSpecialistRunType): SpecialistWorkflowDescriptor`
  - `specialistWorkflowRegistrySnapshot(): SpecialistWorkflowRegistrySnapshot`

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-mvp-specialist-workflow-registry.md` with status `claimed`, this plan path, branch name, worktree path, owned files, and targeted commands. Commit the claim.

- [ ] **Step 2: Mark the claim in progress**

Change status to `in-progress` before code changes.

- [ ] **Step 3: Write failing descriptor tests**

Create `packages/agent/test/specialist-workflows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";
import {
  specialistWorkflowDescriptorFor,
  specialistWorkflowDescriptors,
  specialistWorkflowRegistrySnapshot
} from "../src/specialist-workflows.js";

const mvpRunTypes = [
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const;

describe("MVP specialist workflow descriptors", () => {
  it("describes exactly the six MVP modes without adding agent identities", () => {
    expect(specialistWorkflowDescriptors.map((descriptor) => descriptor.runType)).toEqual([...mvpRunTypes]);
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(approvedAgentSpecialistRunTypes).toContain(descriptor.runType);
      expect(descriptor.executionEnabled).toBe(false);
      expect(descriptor.residentIdentity).toBe("agent_default");
      expect(JSON.stringify(descriptor)).not.toMatch(/persona|new agent|durable agent identity/i);
    }
  });

  it("keeps runtime execution fail-closed for every MVP mode", () => {
    for (const runType of mvpRunTypes) {
      expect(specialistExecutionStatusFor(runType)).toMatchObject({
        enabled: false,
        diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED"
      });
    }
  });

  it("declares context packs, prompt template, allowed tools, approvals, outputs, and failures for each mode", () => {
    for (const descriptor of specialistWorkflowDescriptors) {
      expect(descriptor.contextPacks.length).toBeGreaterThanOrEqual(5);
      expect(descriptor.contextPacks.map((pack) => pack.contextPackId)).toContain("governance-locks.v1");
      expect(descriptor.promptTemplate.promptTemplateId).toBe(`${descriptor.runType}.context-pack.v1`);
      expect(descriptor.handoffSchemaId).toBe(`${descriptor.runType}-handoff.v1`);
      expect(descriptor.allowedTools.length).toBeGreaterThan(0);
      expect(descriptor.approvalRequirements.length).toBeGreaterThan(0);
      expect(descriptor.outputArtifacts.length).toBeGreaterThan(0);
      expect(descriptor.failureModes).toContain("secret-detected");
      expect(descriptor.prerequisiteContractIds).toEqual(expect.arrayContaining([
        "agent.scheduler-resumer.v1",
        "agent.domain-adapter.v1"
      ]));
    }
  });

  it("exposes a frozen registry snapshot for browser-safe inspection", () => {
    const snapshot = specialistWorkflowRegistrySnapshot();

    expect(snapshot.schemaVersion).toBe("agent-specialist-workflow-registry.v1");
    expect(snapshot.descriptors).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
    expect(() => specialistWorkflowDescriptorFor("ontology-bootstrap")).toThrow(/not part of MVP workflow registry/i);
    expect(JSON.stringify(snapshot)).not.toMatch(/api key|authorization|bearer|password|secret|rawProviderError/i);
  });
});
```

- [ ] **Step 4: Run targeted failing test**

Run:

```bash
npm test -- packages/agent/test/specialist-workflows.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/specialist-workflows.js"
```

- [ ] **Step 5: Implement pure descriptors**

Create `packages/agent/src/specialist-workflows.ts` with:

```ts
import type {
  AgentToolApprovalClass,
  AgentToolSideEffectClass
} from "./projection-types.js";
import type { AgentSpecialistRunType } from "./specialists.js";

export interface SpecialistContextPackRequirement {
  readonly contextPackId: string;
  readonly required: boolean;
  readonly purpose: string;
}

export interface SpecialistPromptTemplateDescriptor {
  readonly promptTemplateId: string;
  readonly promptTemplateVersion: number;
  readonly outputSchemaId: string;
  readonly safetyClass: "workspace-safe" | "public-safe" | "sensitive-local-only" | "provider-approved";
  readonly transferApprovalClass: "none" | "provider-byte-transfer";
}

export interface SpecialistToolDescriptor {
  readonly toolId: string;
  readonly domainOwner: "agent" | "prr" | "ingestion" | "ontology" | "governance" | "reporting";
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly purpose: string;
}

export interface SpecialistApprovalDescriptor {
  readonly approvalClass: AgentToolApprovalClass;
  readonly requiredWhen: string;
}

export interface SpecialistOutputDescriptor {
  readonly artifactKind: string;
  readonly schemaId: string;
  readonly purpose: string;
}

export interface SpecialistWorkflowDescriptor {
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentIdentity: "agent_default";
  readonly label: string;
  readonly purpose: string;
  readonly executionEnabled: false;
  readonly prerequisiteContractIds: readonly string[];
  readonly contextPacks: readonly SpecialistContextPackRequirement[];
  readonly promptTemplate: SpecialistPromptTemplateDescriptor;
  readonly allowedTools: readonly SpecialistToolDescriptor[];
  readonly approvalRequirements: readonly SpecialistApprovalDescriptor[];
  readonly outputArtifacts: readonly SpecialistOutputDescriptor[];
  readonly handoffSchemaId: string;
  readonly failureModes: readonly string[];
}

export interface SpecialistWorkflowRegistrySnapshot {
  readonly schemaVersion: "agent-specialist-workflow-registry.v1";
  readonly descriptors: readonly SpecialistWorkflowDescriptor[];
}
```

Then define six frozen descriptors matching `docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md`. Include these shared prerequisite IDs on every descriptor:

```ts
const sharedPrerequisites = Object.freeze([
  "agent.scheduler-resumer.v1",
  "agent.domain-adapter.v1"
] as const);
```

Use `executionEnabled: false` for every descriptor. Export a lookup that throws for `ontology-bootstrap` because that workflow has its own implemented exemplar and is outside this MVP registry slice.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./specialist-workflows.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/specialist-workflows.test.ts packages/agent/test/specialists.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 8: Commit**

Run:

```bash
git add docs/agentic/claims/task-1-mvp-specialist-workflow-registry.md packages/agent/src/specialist-workflows.ts packages/agent/src/index.ts packages/agent/test/specialist-workflows.test.ts
git commit -m "feat: describe mvp specialist workflow modes"
```

**Acceptance Criteria:**

- Registry covers exactly six MVP modes and excludes `ontology-bootstrap`.
- Every descriptor names context packs, prompt metadata, allowed tools, approval classes, output artifacts, handoff schema, failure modes, and prerequisite contracts.
- Every descriptor is inert with `executionEnabled: false`.
- No descriptor creates a new resident identity or provider identity.

---

## Task 2: Specialist Handoff DTO Schemas

**Files:**

- Create: `docs/agentic/claims/task-2-mvp-specialist-handoffs.md`
- Create: `packages/agent/src/specialist-handoffs.ts`
- Create: `packages/agent/test/specialist-handoffs.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**

- Consumes:
  - `contextPackRefSchema` from `packages/agent/src/context-packs.ts`
  - `type AgentSpecialistRunType` from `packages/agent/src/specialists.ts`
- Produces:
  - `specialistWorkflowHandoffSchema`
  - `parseSpecialistWorkflowHandoff(value: unknown): SpecialistWorkflowHandoffDto`
  - `hashSpecialistWorkflowHandoff(dto: SpecialistWorkflowHandoffDto): \`sha256:${string}\``

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-mvp-specialist-handoffs.md`; mark it `in-progress`.

- [ ] **Step 2: Write failing DTO tests**

Create `packages/agent/test/specialist-handoffs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  hashSpecialistWorkflowHandoff,
  parseSpecialistWorkflowHandoff
} from "../src/specialist-handoffs.js";

const contextPack = buildContextPackRef({
  contextPackId: "evidence-summary.v1",
  version: 1,
  generatedAt: "2026-07-09T12:00:00.000Z",
  payload: { evidenceIds: ["ev_report_001"] },
  safeSummary: "One evidence summary.",
  provenanceRefs: ["ev_report_001"],
  sizeBudgetBytes: 16_384
});

describe("specialist workflow handoffs", () => {
  it("parses and hashes a browser-safe handoff", () => {
    const handoff = parseSpecialistWorkflowHandoff({
      schemaVersion: "agent-specialist-handoff.v1",
      runType: "evidence-triage",
      runId: "run_evidence_triage_001",
      taskId: "task_evidence_triage_001",
      residentAgentId: "agent_default",
      generatedAt: "2026-07-09T12:01:00.000Z",
      status: "ready-for-review",
      safeSummary: "Evidence triage dossier is ready for review.",
      contextPackRefs: [contextPack],
      outputArtifacts: [{
        artifactId: "artifact_evidence_triage_dossier_001",
        artifactKind: "evidence-triage-dossier",
        schemaId: "evidence-triage-handoff.v1",
        artifactHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        safeSummary: "Triage dossier with one evidence item."
      }],
      toolRequestIds: ["toolreq_evidence_triage_governance_review"],
      approvalRequirements: [{
        approvalClass: "human-review",
        reason: "Governance review is required before classification is durable.",
        toolRequestId: "toolreq_evidence_triage_governance_review"
      }],
      nextSafeActions: [{
        actionId: "action_review_triage",
        label: "Review evidence triage dossier",
        kind: "review",
        effect: "none"
      }]
    });

    expect(handoff.runType).toBe("evidence-triage");
    expect(hashSpecialistWorkflowHandoff(handoff)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(handoff)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("rejects unsafe fields, raw content keys, and secret-shaped text", () => {
    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        runType: "report-builder",
        runId: "run_report_builder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "api key sk-live-value",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: []
      })
    ).toThrow(/secret/i);

    expect(() =>
      parseSpecialistWorkflowHandoff({
        schemaVersion: "agent-specialist-handoff.v1",
        runType: "report-builder",
        runId: "run_report_builder_001",
        residentAgentId: "agent_default",
        generatedAt: "2026-07-09T12:01:00.000Z",
        status: "ready-for-review",
        safeSummary: "Report handoff.",
        contextPackRefs: [contextPack],
        outputArtifacts: [],
        toolRequestIds: [],
        approvalRequirements: [],
        nextSafeActions: [],
        rawProviderError: "provider body must not enter browser DTOs"
      })
    ).toThrow(/unsupported|unrecognized/i);
  });
});
```

- [ ] **Step 3: Run targeted failing test**

Run:

```bash
npm test -- packages/agent/test/specialist-handoffs.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/specialist-handoffs.js"
```

- [ ] **Step 4: Implement handoff schemas**

Create `packages/agent/src/specialist-handoffs.ts` with strict Zod schemas for:

- `SpecialistOutputArtifactRef`
- `SpecialistApprovalRequirement`
- `SpecialistNextAction`
- `SpecialistFailureDto`
- `SpecialistWorkflowHandoffDto`

Use `contextPackRefSchema`, approved run type validation, `assertAgentSecretSafeText`, strict object schemas, stable JSON hashing, and frozen return values. Reject status or text that claims accepted graph authority, sends PRRs, clears legal locks, exports, or publishes as a completed effect.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./specialist-handoffs.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/specialist-handoffs.test.ts packages/agent/test/context-packs.test.ts packages/agent/test/tool-gateway.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-2-mvp-specialist-handoffs.md packages/agent/src/specialist-handoffs.ts packages/agent/src/index.ts packages/agent/test/specialist-handoffs.test.ts
git commit -m "feat: add specialist workflow handoff dtos"
```

**Acceptance Criteria:**

- Handoff DTOs are strict, frozen, content-hashable, and browser-safe.
- DTOs can reference artifacts and approvals without carrying raw bodies or provider errors.
- DTOs cannot imply accepted graph changes, PRR sends, legal escalation, export/publication, or provider transfer completion unless exact domain event refs exist in a future adapter result.

---

## Task 3: Runtime Fail-Closed Wiring

**Files:**

- Create: `docs/agentic/claims/task-3-mvp-specialist-fail-closed-runtime.md`
- Modify: `packages/agent/src/specialists.ts`
- Modify: `packages/agent/test/specialists.test.ts`
- Modify: `packages/agent/test/specialist-workflows.test.ts`

**Interfaces:**

- Consumes:
  - Task 1 `specialistWorkflowDescriptorFor`
- Produces:
  - `specialistExecutionStatusFor(runType)` includes descriptor prerequisite IDs while staying disabled.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-mvp-specialist-fail-closed-runtime.md`; mark it `in-progress`.

- [ ] **Step 2: Write failing status tests**

Append to `packages/agent/test/specialists.test.ts`:

```ts
it("reports scheduler and domain adapter prerequisites without enabling MVP specialists", () => {
  const status = specialistExecutionStatusFor("prr-negotiation");

  expect(status).toEqual({
    enabled: false,
    diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
    allowedRepairActions: [
      "review the approved resident-agent foundation",
      "create a focused specialist implementation plan",
      "land agent.scheduler-resumer.v1",
      "land agent.domain-adapter.v1"
    ]
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts
```

Expected before implementation:

```text
expected allowedRepairActions to include prerequisite repair actions
```

- [ ] **Step 4: Implement status enrichment**

Modify `packages/agent/src/specialists.ts` so `specialistExecutionStatusFor` returns existing repair actions plus prerequisite repair actions for the six MVP modes. Do not change `enabled: false`. Do not import runtime, ledger, provider, scheduler, or domain service modules.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts packages/agent/test/runtime.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/agentic/claims/task-3-mvp-specialist-fail-closed-runtime.md packages/agent/src/specialists.ts packages/agent/test/specialists.test.ts packages/agent/test/specialist-workflows.test.ts
git commit -m "feat: explain blocked specialist workflow execution"
```

**Acceptance Criteria:**

- `startRun` behavior stays unchanged: approved run types can start but do not execute workflow steps.
- Unsupported run types still fail before appending runtime events.
- MVP modes tell agents which contracts must land before execution work.

---

## Task 4: Scheduler And Context Readiness Bridge

**Files:**

- Create: `docs/agentic/claims/task-4-mvp-specialist-scheduler-readiness.md`
- Modify only files named by the approved scheduler/resumer plan when that plan lands.

**Prerequisite:** Do not claim this task until `agent.scheduler-resumer.v1` exists in the active branch with tests for approved-resumable, stale, blocked-prerequisite, blocked-lock, and waiting-for-approval states.

**Interfaces:**

- Consumes:
  - Task 1 workflow descriptors.
  - Task 2 handoff DTOs.
  - Scheduler/resumer state DTOs.
- Produces:
  - Readiness mapping from descriptor prerequisites and context pack refs into blocked or ready handoff states.

- [ ] **Step 1: Claim after prerequisite proof**

Create the claim with links to the scheduler/resumer commit, test files, and exported type names.

- [ ] **Step 2: Write failing readiness tests**

Write tests in the scheduler/resumer package proving:

```ts
expect(projectSpecialistWorkflowReadiness({
  runType: "timeline-builder",
  descriptor,
  availableContracts: ["agent.scheduler-resumer.v1"],
  contextPackRefs: []
})).toMatchObject({
  status: "blocked",
  category: "blocked-prerequisite",
  missingContractIds: ["agent.domain-adapter.v1"]
});
```

Also test that context refs must match descriptor context pack IDs and current projection high-water marks before a handoff can become `context-ready`.

- [ ] **Step 3: Run targeted failing command**

Run the exact scheduler/resumer targeted test command from its approved plan. Expected failure should name the missing readiness projector.

- [ ] **Step 4: Implement readiness projection**

Implement only state derivation. Do not call domain services, model providers, approval routes, or tool completion paths.

- [ ] **Step 5: Run targeted tests and full verification**

Run the scheduler/resumer targeted command, then:

```bash
npm run verify
```

- [ ] **Step 6: Commit**

Commit only the scheduler readiness files and claim.

**Acceptance Criteria:**

- Specialist readiness can explain missing scheduler, adapter, context, lock, provenance, and approval prerequisites.
- Readiness derivation cannot execute a tool or invoke a provider.

---

## Task 5: PRR Negotiation And Investigation Planner Runners

**Files:**

- Create claims for PRR/investigation tasks after adapter readiness.
- Modify only files named by the approved PRR domain-adapter plan.

**Prerequisite:** Do not claim until the PRR adapter can consume approved `external-message-send` and `legal-escalation` requests through PRR services, and can produce safe draft artifacts without sending.

**Interfaces:**

- Produces:
  - `runPrrNegotiationWorkflow(input)`
  - `runInvestigationPlannerWorkflow(input)`
  - `prr-negotiation-handoff.v1`
  - `investigation-planner-handoff.v1`

- [ ] **Step 1: Write failing PRR negotiation tests**

Tests must prove the workflow:

- builds context packs from PRR read model, jurisdiction pack, governance locks, memory, task/run history, and workspace status
- writes a draft artifact and handoff DTO
- requests send/follow-up approval through `agent.tool.requested`
- never appends `prr.request.sent`, `prr.followup.sent`, or `prr.legal-escalation.confirmed`

- [ ] **Step 2: Write failing investigation planner tests**

Tests must prove the workflow:

- consumes evidence, PRR, timeline, contradiction, memory, and lock summaries
- writes local task suggestions and PRR draft candidates
- does not create external requests, portal crawls, or PRR sends
- blocks on missing investigation scope or active governance locks

- [ ] **Step 3: Implement through adapters only**

Use PRR adapter methods named by the adapter contract. Do not append PRR send or legal escalation events directly from agent code.

- [ ] **Step 4: Verify**

Run the PRR adapter targeted suite, agent workflow tests, UI DTO tests if touched, then `npm run verify`.

**Acceptance Criteria:**

- PRR send and legal escalation remain human-gated.
- Planner outputs are local derivative artifacts and approval requests only.

---

## Task 6: Evidence Triage Runner

**Files:**

- Create claim after evidence/governance adapter readiness.
- Modify only files named by the approved evidence/governance adapter plan.

**Prerequisite:** Do not claim until ingestion/governance adapters can consume approved provider parse, classification review, quarantine review, and assertion proposal requests through authoritative services.

**Interfaces:**

- Produces:
  - `runEvidenceTriageWorkflow(input)`
  - `evidence-triage-handoff.v1`

- [ ] **Step 1: Write failing evidence triage tests**

Tests must prove:

- context packs include evidence summaries, governance locks, PRR production linkage, accepted graph duplicate checks, memory, history, and workspace status
- output includes triage dossier, safe summaries, governance flags, duplicate groups, evidence gaps, and assertion candidate bundle hashes
- provider parse requests are approval-bound
- governance review and assertion proposal remain domain-owned
- no `assertion.accepted`, `entity.resolved`, `relationship.accepted`, export, legal, or PRR send events are appended

- [ ] **Step 2: Implement runner through adapters only**

Use adapter methods for parse approval previews, governance review requests, quarantine review requests, and assertion proposal requests. Keep raw content local unless provider transfer approval is encoded in prompt artifacts.

- [ ] **Step 3: Verify**

Run evidence/governance targeted tests, agent workflow tests, handoff DTO tests, then `npm run verify`.

**Acceptance Criteria:**

- Evidence triage can organize review and propose candidate material.
- Accepted graph truth remains untouched.

---

## Task 7: Timeline And Contradiction Runners

**Files:**

- Create claims after timeline artifact and contradiction/claim adapter readiness.
- Modify only files named by those approved adapter plans.

**Prerequisite:** Do not claim until local derivative artifact storage and contradiction/claim review adapters exist.

**Interfaces:**

- Produces:
  - `runTimelineBuilderWorkflow(input)`
  - `runContradictionFinderWorkflow(input)`
  - `timeline-builder-handoff.v1`
  - `contradiction-finder-handoff.v1`

- [ ] **Step 1: Write failing timeline tests**

Tests must prove every timeline item has evidence, assertion, PRR, or note provenance; date precision; uncertainty; and citation refs. Tests must reject timeline items without source refs.

- [ ] **Step 2: Write failing contradiction tests**

Tests must prove every contradiction candidate has paired source refs, content hashes, category, confidence caveat, alternative explanations, and reviewer action. Tests must reject candidates that claim a conclusion or reject an assertion.

- [ ] **Step 3: Implement local derivative runners**

Write artifact outputs and handoff DTOs. Request claim/diagnostic review only through domain adapters. Do not change accepted graph state.

- [ ] **Step 4: Verify**

Run targeted timeline, contradiction, agent DTO, and full verification commands.

**Acceptance Criteria:**

- Timeline and contradiction outputs are sourced review material only.
- No accepted fact, entity, relationship, or assertion rejection is created by these runs.

---

## Task 8: Report Builder Runner

**Files:**

- Create claim after report/export adapter readiness.
- Modify only files named by the approved report/export adapter plan.

**Prerequisite:** Do not claim until governance/export adapters can consume approved export/publication and sensitive opt-in requests through authoritative services.

**Interfaces:**

- Produces:
  - `runReportBuilderWorkflow(input)`
  - `report-builder-handoff.v1`

- [ ] **Step 1: Write failing report builder tests**

Tests must prove:

- report drafts cite accepted graph facts, evidence refs, PRR refs, timeline items, and contradiction candidates
- every included evidence item has governance/export eligibility
- sensitive opt-ins and legal locks become approval requirements
- output includes outline hash, section hashes, citation map hash, excluded evidence IDs, unresolved-risk notes, and export preview IDs
- no `export.generated`, `report.generated`, legal escalation, or publication event is appended without domain approval

- [ ] **Step 2: Implement through report/export adapters only**

Write local derivative report artifacts and export previews. Route export/publication through governance adapters after matching approval.

- [ ] **Step 3: Verify**

Run report/export targeted tests, handoff tests, UI adapter tests if touched, then `npm run verify`.

**Acceptance Criteria:**

- Report packets are reviewable, cited, governed, and not published by agent code.
- Sensitive and legal gates remain visible and blocking until human/domain approval exists.

---

## Task 9: Read-Only Agent Cockpit And Readiness Evidence

**Files:**

- Create claim after at least one descriptor/handoff or runner lane is approved for UI display.
- Modify UI and local-runtime files only if named by an approved UI adapter plan.
- Modify `scripts/check-agent-readiness.mjs`.
- Modify `docs/agentic/software-factory.md`.

**Prerequisite:** UI work may display Task 1 and Task 2 metadata immediately after those tasks land. Runner state display requires scheduler/handoff DTO availability.

- [ ] **Step 1: Write failing UI adapter tests**

Tests must prove browser parsers accept descriptor and handoff DTOs, reject unsafe fields, and render pending approval state without execution buttons.

- [ ] **Step 2: Implement read-only display**

Render mode labels, purpose, blocked prerequisites, context pack refs, output artifact refs, approval requirements, and next safe actions. Buttons may navigate or append approve/deny decisions through approved approval routes only.

- [ ] **Step 3: Track approved docs**

Add these files to `scripts/check-agent-readiness.mjs`:

```js
  "docs/superpowers/specs/2026-07-09-mvp-specialist-workflows-design.md",
  "docs/superpowers/plans/2026-07-09-mvp-specialist-workflows-implementation.md"
```

- [ ] **Step 4: Record readiness evidence**

Append a `MVP Specialist Workflows Planning Readiness` section to `docs/agentic/software-factory.md` with targeted commands, full verification, and invariant summary. Do not include prompt bodies, model output text, raw evidence, provider errors, or secrets.

- [ ] **Step 5: Run final commands**

Run:

```bash
git diff --check
npm run factory:check
npm run verify
```

Expected:

```text
factory-readiness passed
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/agentic/claims/task-9-mvp-specialist-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md
git commit -m "docs: record mvp specialist workflow readiness"
```

**Acceptance Criteria:**

- Factory readiness tracks the new spec and plan.
- UI display remains read-only over safe DTOs.
- Readiness evidence states that full workflow execution is gated by scheduler/resumer and domain adapter contracts.

---

## Completion Criteria

This plan is complete when:

- The design spec and this plan are tracked by factory readiness.
- Metadata and handoff schema tasks, if claimed, pass targeted tests and `npm run verify`.
- Every full runner task has confirmed prerequisite contracts before it is claimed.
- No task introduces a new resident agent identity.
- No task lets the resident agent send PRRs, clear legal locks, approve provider byte transfer, publish/export, repair destructively, accept graph truth, or approve itself.
- Every live provider acceptance path is explicit, opt-in, and records safe hashes/IDs/counts/categories only.

## Stop Conditions

Stop and escalate on data-loss risk, schema conflict, unavailable scheduler/resumer contract, unavailable domain adapter, credential need outside an explicit live acceptance gate, raw sensitive content in DTOs/docs/logs, repeated verifier failure, or any implementation path that turns specialist output into accepted ontology truth without the existing human/domain review events.
