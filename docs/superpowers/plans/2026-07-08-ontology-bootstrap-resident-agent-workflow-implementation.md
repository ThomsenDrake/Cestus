# Ontology Bootstrap Resident Agent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing zero-trust ontology-bootstrap foundation into the resident Cestus Agent so legacy reports and imported evidence become reviewable agent work: triage dossier, chunked candidate bundles, evidence-tied proposed assertion material, staging approval requests, safe memory caveats, and live Nous-backed review notes where model output is used.

**Architecture:** Keep legacy import and ontology staging services authoritative. Add a resident-agent workflow bridge in `packages/agent` that turns existing `packages/ontology-bootstrap` dossiers and previews into agent context packs, review-bundle artifacts, `agent.specialist-run.step.recorded`, `agent.tool.requested`, safe memory, and task status updates. Add local-runtime launch/read routes only after the pure bridge is covered; approval decision routes, browser approval cockpit, generic domain execution adapters, accepted graph review, and broad prompt/context resolver work remain separate slices.

**Tech Stack:** TypeScript, Zod, Vitest, existing ontology event ledger, existing resident-agent runtime/tool gateway/context-pack contracts, existing ontology-bootstrap DTOs, existing legacy import runtime, existing Nous OpenAI-compatible provider, content-addressed SHA-256 JSON artifacts.

## Global Constraints

- Legacy-derived structure can only surface as evidence-tied dossier material, review-bundle material, tool previews, or `assertion.proposed` through the existing legacy staging service after exact human staging approval.
- The resident workflow must never append `assertion.accepted`, `entity.resolved`, `relationship.accepted`, accepted merge or split events, PRR send events, legal escalation, export, publication, provider byte transfer without approval, or destructive repair.
- Model-facing behavior must use the live Nous Portal provider for acceptance and smoke verification. Deterministic unit tests may use local fixtures or stub fetches, but they are not acceptance evidence for model output behavior.
- The `.env` Nous settings are ignored shared runtime state. Do not print, commit, log, snapshot, or include API key material or raw provider error text in events, DTOs, diagnostics, tests, docs, or claims.
- Browser and runtime DTOs must be secret-safe and raw-content-free by default. Dossier prompts may include IDs, counts, hashes, predicates, confidence, quarantine categories, and short safe summaries; they must not include raw old-Cestus bodies or source-sensitive excerpts.
- The workflow should prefer live Nous extraction/enrichment when model judgment is part of the feature. If the provider is unavailable, the run must fail or block with a safe diagnostic rather than silently substituting fake model output for model-dependent behavior.
- Human-reviewable candidate bundles must include proposed assertion material, evidence refs, source artifact hashes, confidence, rationale, alternatives or uncertainty, and rejected or blocked reasons.
- High-volume old artifact imports must be handled through stable bundle IDs, candidate chunking, cursor/resume metadata, deterministic artifact hashes, and replayable projections rather than one monolithic dossier or prompt.
- `npm run verify` remains required for every completed implementation task. Live Nous acceptance commands are additional targeted gates for tasks that touch model-facing behavior.

---

## Required Reading

Before implementation, read:

1. `AGENTS.md`
2. `.agents/skills/cestus-software-factory/SKILL.md`
3. `docs/agentic/software-factory.md`
4. `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
5. `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
6. `docs/superpowers/specs/2026-07-06-legacy-cestus-import-design.md`
7. `docs/superpowers/plans/2026-07-06-legacy-cestus-import-implementation.md`
8. `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
9. `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
10. `docs/superpowers/specs/2026-07-07-ontology-bootstrap-specialist-design.md`
11. `docs/superpowers/plans/2026-07-07-ontology-bootstrap-specialist-implementation.md`
12. This plan

---

## File Map

- `packages/agent/src/ontology-bootstrap-workflow.ts`: Pure resident-agent bridge for bootstrap context packs, review bundles, agent tool previews, run steps, safe memory drafts, and workflow result DTOs.
- `packages/agent/src/ontology-bootstrap-nous.ts`: Nous-facing safe prompt builder, model memo validator, and live acceptance helpers for bootstrap review notes.
- `packages/agent/test/ontology-bootstrap-workflow.test.ts`: Pure workflow tests for dossier-to-agent mapping, review-bundle hashing, tool request boundaries, no accepted graph paths, and safe failure mapping.
- `packages/agent/test/ontology-bootstrap-nous.test.ts`: Deterministic tests for safe prompt shape and stubbed OpenAI-compatible request behavior.
- `packages/agent/test/ontology-bootstrap-nous-live.test.ts`: Explicit live Nous acceptance smoke test, run with an opt-in environment flag and the shared ignored `.env`.
- `packages/agent/src/index.ts`: Public exports for the bridge and Nous helpers.
- `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`: Local HTTP route helpers that launch/read ontology-bootstrap work through mounted workspace services without approval decisions.
- `packages/local-runtime/src/agent-http-routes.ts`: Route integration for ontology-bootstrap launch/read endpoints.
- `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`: Runtime route tests using fake mounted workspaces and no live model output.
- `packages/ui/src/agent/agent-adapter.ts`: Browser DTO parser additions for ontology-bootstrap run summaries returned by local runtime routes.
- `packages/ui/src/agent/AgentWorkspace.tsx`: Read-only display of ontology-bootstrap dossier hashes, pending staging requests, and safe next actions.
- `packages/ui/test/agent-ontology-bootstrap-adapter.test.ts`: Browser DTO safety tests for bootstrap route payloads.
- `packages/ui/test/agent-workspace.test.tsx`: Read-only UI rendering tests for bootstrap work.
- `docs/agentic/claims/task-*-ontology-bootstrap-resident-*.md`: Durable claims for each implementation task.
- `scripts/check-agent-readiness.mjs`: Add this plan after approval during readiness tracking.
- `docs/agentic/software-factory.md`: Record final readiness evidence after implementation and review.

---

## Candidate Bundle Contract

Every human-reviewable candidate bundle produced by this plan must be safe to inspect without trusting old ontology truth. A bundle item is review material, not graph state.

Minimum candidate fields:

- `candidateId`, `observationId`, `bundleId`, and `chunkId`
- `status`: `eligible`, `blocked`, `rejected`, or `review-only`
- `proposedAssertion`: subject reference when present, predicate, object, confidence, and review-state label `proposed-material`
- `evidenceRefs`: evidence ID when imported, evidence content hash, source path, source collection ID, scan batch ID, report hash, and candidate-set hash
- `sourceArtifactHashes`: report hash, candidate-set hash, review-bundle hash, and source content hash
- `rationale`: short secret-safe explanation of why this candidate is proposed or held for review
- `alternatives`: secret-safe alternative predicates, objects, or review paths when the old structure is ambiguous
- `uncertainty`: secret-safe confidence caveat and missing context
- `blockedReasons`: exact safe reasons such as missing evidence link, candidate-set mismatch, report mismatch, quarantine category, unsupported shape, stale reference, or duplicate/conflicting legacy ID

Bundle-level fields:

- Stable `bundleId`, `chunkId`, `sourceCollectionId`, `legacyReportId`, `reportHash`, `candidateSetHash`, generated timestamp, and cursor metadata.
- `candidateCount`, `eligibleCount`, `blockedCount`, `rejectedCount`, and `reviewOnlyCount`.
- `nextCursor` when more candidates remain.
- `bundleHash` computed from stable JSON.
- `modelMemoHash` when live Nous enrichment is attached.

The first implementation should default to small chunks for review ergonomics while keeping the chunk size configurable for large old-Cestus imports.

---

## Implementation Boundary

Can be implemented in this slice:

- Pure agent bridge from existing ontology-bootstrap dossiers to agent review bundles, context packs, tool requests, run steps, safe memory drafts, and task status updates.
- Live Nous review-note path for safe model-assisted triage wording and missing-context questions.
- Read-only local-runtime launch/read route that creates resident task/run state and returns review-bundle DTOs.
- Read-only UI display of existing agent projections and bootstrap review-bundle metadata.

Must wait for a separate approved slice:

- Browser approval cockpit decision routes and approve/deny UI.
- Generic domain execution adapters that consume `agent.tool.approved` and call PRR send, provider byte transfer, export, repair, accepted graph review, or legacy staging services.
- Live model-generated assertion extraction from raw evidence bodies.
- General prompt artifact storage and context resolver beyond the small safe bootstrap review-note prompt in this plan.
- Any accepted graph review execution.

---

## Task 1: Pure Agent Bootstrap Review Bundle

**Files:**

- Create: `docs/agentic/claims/task-1-ontology-bootstrap-resident-review-bundle.md`
- Create: `packages/agent/src/ontology-bootstrap-workflow.ts`
- Create: `packages/agent/test/ontology-bootstrap-workflow.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**

- Consumes:
  - `runFakeOntologyBootstrapSpecialist(input)` from `packages/ontology-bootstrap/src/fake-runtime.ts`
  - `buildContextPackRef(input)` and `type ContextPackRef` from `packages/agent/src/context-packs.ts`
  - `type AgentToolPreview` from `packages/agent/src/tool-gateway.ts`
- Produces:
- `buildOntologyBootstrapAgentReviewBundle(input: BuildOntologyBootstrapAgentReviewBundleInput): OntologyBootstrapAgentReviewBundle`
- `buildOntologyBootstrapDossierContextPack(input: BuildOntologyBootstrapDossierContextPackInput): ContextPackRef`
- `buildOntologyBootstrapCandidateBundles(input: BuildOntologyBootstrapCandidateBundlesInput): readonly OntologyBootstrapCandidateBundle[]`
- `toAgentOntologyBootstrapToolPreview(input: OntologyBootstrapToolPreview): AgentToolPreview`
- `hashOntologyBootstrapReviewBundle(bundle: OntologyBootstrapAgentReviewBundle): \`sha256:${string}\``

- [ ] **Step 1: Claim the task**

Create `docs/agentic/claims/task-1-ontology-bootstrap-resident-review-bundle.md` with status `claimed`, this plan path, the branch name, and the owned files above. Commit the claim.

- [ ] **Step 2: Mark the claim in progress**

Change the claim status to `in-progress`.

- [ ] **Step 3: Write failing pure bridge tests**

Create `packages/agent/test/ontology-bootstrap-workflow.test.ts` with these tests:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOntologyBootstrapAgentReviewBundle,
  buildOntologyBootstrapDossierContextPack,
  hashOntologyBootstrapReviewBundle,
  toAgentOntologyBootstrapToolPreview
} from "../src/ontology-bootstrap-workflow.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";

const now = () => "2026-07-08T14:00:00.000Z";

describe("ontology bootstrap resident-agent review bundle", () => {
  it("builds a stable review bundle from an evidence-tied bootstrap dossier", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });

    expect(bundle.schemaVersion).toBe("agent-ontology-bootstrap-review.v1");
    expect(bundle.dossier.legacyReportId).toBe("legacy_report_001");
    expect(bundle.stagingReview.selectedCandidateIds).toEqual(["legacy_candidate_001"]);
    expect(bundle.candidateBundles[0]).toMatchObject({
      bundleId: "bootstrap_bundle_src_old_cestus_scan_old_cestus_001_0001",
      chunkId: "bootstrap_chunk_src_old_cestus_scan_old_cestus_001_0001",
      eligibleCount: 1,
      blockedCount: 1
    });
    expect(bundle.candidateBundles[0]?.candidates[0]).toMatchObject({
      candidateId: "legacy_candidate_001",
      status: "eligible",
      proposedAssertion: {
        predicate: "agency.name",
        object: "Example Agency",
        reviewState: "proposed-material"
      },
      evidenceRefs: [{
        evidenceId: "ev_legacy_claims",
        evidenceContentHash: expect.stringMatching(/^sha256:/),
        sourceCollectionId: "src_old_cestus"
      }],
      sourceArtifactHashes: expect.arrayContaining([
        bootstrapReportFixture.reportHash,
        bootstrapReportFixture.candidateSetHash
      ]),
      rationale: expect.stringContaining("parser"),
      alternatives: expect.any(Array),
      uncertainty: expect.any(String),
      blockedReasons: []
    });
    expect(hashOntologyBootstrapReviewBundle(bundle)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(bundle)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("chunks candidate bundles with stable cursors for high-volume review", () => {
    const report = {
      ...bootstrapReportFixture,
      proposedAssertionCandidates: [
        ...bootstrapReportFixture.proposedAssertionCandidates,
        {
          ...bootstrapReportFixture.proposedAssertionCandidates[0],
          candidateId: "legacy_candidate_002",
          observationId: "legacy_observation_002",
          object: "Example Agency Alternative"
        }
      ]
    };
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001", "legacy_candidate_002"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews,
      maxCandidatesPerBundle: 1
    });

    expect(bundle.candidateBundles).toHaveLength(3);
    expect(bundle.candidateBundles.map((candidateBundle) => candidateBundle.cursor.currentOffset)).toEqual([0, 1, 2]);
    expect(bundle.candidateBundles[0]?.cursor.nextOffset).toBe(1);
    expect(bundle.candidateBundles[2]?.cursor.nextOffset).toBeUndefined();
    expect(new Set(bundle.candidateBundles.map((candidateBundle) => candidateBundle.bundleHash)).size).toBe(3);
  });

  it("creates a context pack ref bound to report, candidate set, and dossier hashes", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const contextPack = buildOntologyBootstrapDossierContextPack({
      generatedAt: now(),
      dossier: bootstrap.dossier,
      reviewBundleHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    });

    expect(contextPack.contextPackId).toBe("ontology-bootstrap-dossier.v1");
    expect(contextPack.provenanceRefs).toEqual(expect.arrayContaining([
      bootstrap.dossier.reportHash,
      bootstrap.dossier.candidateSetHash
    ]));
    expect(contextPack.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("maps ontology-bootstrap tool previews to agent-safe preview objects", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const preview = toAgentOntologyBootstrapToolPreview(bootstrap.toolPreviews[0]);

    expect(preview.summary).toContain("ontology staging approval");
    expect(preview.bootstrapPreviewHash).toMatch(/^sha256:/);
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      { kind: "legacy-report", id: "legacy_report_001", hash: bootstrapReportFixture.reportHash },
      { kind: "candidate-set", id: "legacy_report_001", hash: bootstrapReportFixture.candidateSetHash },
      { kind: "legacy-candidate", id: "legacy_candidate_001" }
    ]));
    expect(JSON.stringify(preview)).not.toMatch(/api key|authorization|bearer|password|secret/i);
  });
});
```

- [ ] **Step 4: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/ontology-bootstrap-workflow.js"
```

- [ ] **Step 5: Implement the pure bridge**

Create `packages/agent/src/ontology-bootstrap-workflow.ts` with strict DTO schemas, stable JSON hashing, context-pack construction, candidate bundle construction, chunk cursors, and preview mapping. The bridge must reject accepted graph event types, secret-shaped keys, missing evidence refs for selected staging candidates, and review bundles whose `runId` or `taskId` does not match `run_` or `task_` ID patterns.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./ontology-bootstrap-workflow.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/ontology-bootstrap/test/fake-runtime.test.ts packages/ontology-bootstrap/test/tool-previews.test.ts
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
git add docs/agentic/claims/task-1-ontology-bootstrap-resident-review-bundle.md packages/agent/src/ontology-bootstrap-workflow.ts packages/agent/src/index.ts packages/agent/test/ontology-bootstrap-workflow.test.ts
git commit -m "feat: add ontology bootstrap agent review bundle"
```

**Acceptance Criteria:**

- Review bundles are deterministic and content-hashable.
- Candidate bundles expose proposed assertion material, evidence refs, source artifact hashes, rationale, alternatives, uncertainty, and blocked or rejected reasons.
- Candidate chunks have stable IDs, stable hashes, and cursor metadata for high-volume imports.
- Agent context packs bind dossier, report hash, candidate-set hash, and selected candidate IDs.
- Tool previews are browser-safe and contain enough affected refs for human review.
- No source-tree reads, imports, staging execution, model calls, approval decisions, or accepted graph paths exist in this task.

---

## Task 2: Durable Resident Workflow Runner

**Files:**

- Create: `docs/agentic/claims/task-2-ontology-bootstrap-resident-runner.md`
- Modify: `packages/agent/src/ontology-bootstrap-workflow.ts`
- Modify: `packages/agent/test/ontology-bootstrap-workflow.test.ts`

**Interfaces:**

- Consumes:
  - Task 1 review-bundle helpers.
  - `EventLedger` from `packages/ontology/src/event-ledger.ts`.
  - `createAgentToolGateway(input)` from `packages/agent/src/tool-gateway.ts`.
  - Existing agent event contracts in `packages/ontology/src/contracts.ts`.
- Produces:
  - `runOntologyBootstrapResidentWorkflow(input: RunOntologyBootstrapResidentWorkflowInput): Promise<RunOntologyBootstrapResidentWorkflowResult>`
  - The function appends `agent.specialist-run.step.recorded`, zero or more `agent.tool.requested`, optional `agent.memory.recorded`, `agent.task.status.changed`, and either `agent.specialist-run.completed` or `agent.specialist-run.failed`.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-2-ontology-bootstrap-resident-runner.md` with the owned files above. Mark it `in-progress` before code changes.

- [ ] **Step 2: Write failing durable runner tests**

Append these tests to `packages/agent/test/ontology-bootstrap-workflow.test.ts`:

```ts
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";
import { buildAgentProjection } from "../src/projection.js";
import { runOntologyBootstrapResidentWorkflow } from "../src/ontology-bootstrap-workflow.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };

describe("runOntologyBootstrapResidentWorkflow", () => {
  it("records dossier review steps and pauses on human staging approval request", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      maxCandidatesPerBundle: 50,
      now
    });

    const projection = buildAgentProjection(await ledger.readAll());
    expect(result.ok).toBe(true);
    expect(projection.runs.get("run_ontology_bootstrap_001")?.stepIds).toContain("step_ontology_bootstrap_dossier");
    expect(projection.toolRequests.get("toolreq_ontology_bootstrap_staging_approval")?.requiredApprovalClass).toBe("ledger-review");
    expect(projection.tasks.get("task_ontology_bootstrap_001")?.status).toBe("waiting-for-approval");
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("assertion.proposed");
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("assertion.accepted");
  });

  it("fails safely without appending tool requests when the report is missing", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.startRun({
      runId: "run_ontology_bootstrap_missing",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_missing",
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: [],
      selectedCandidateIds: [],
      now
    });

    const projection = buildAgentProjection(await ledger.readAll());
    expect(result.ok).toBe(false);
    expect(projection.runs.get("run_ontology_bootstrap_missing")?.state).toBe("failed");
    expect(projection.runs.get("run_ontology_bootstrap_missing")?.failureCategory).toBe("provenance-missing");
    expect(projection.toolRequests.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts
```

Expected before implementation:

```text
runOntologyBootstrapResidentWorkflow is not exported
```

- [ ] **Step 4: Implement the runner**

Update `packages/agent/src/ontology-bootstrap-workflow.ts` so `runOntologyBootstrapResidentWorkflow`:

- Verifies the target run exists and has run type `ontology-bootstrap`.
- Uses existing ontology-bootstrap package functions to build the dossier and tool previews.
- Records a review bundle hash as an output artifact hash.
- Appends `agent.specialist-run.step.recorded` for dossier generation.
- Appends `agent.tool.requested` for `legacy.raw-import.approval.request` and `legacy.staging.approval.request` previews.
- Sets the linked task to `waiting-for-approval` when a ledger-review tool request is emitted.
- Records safe memory only for caveats and gaps with event or artifact provenance.
- Records chunk cursor metadata and processed bundle hashes so a rerun can resume without changing earlier bundle hashes.
- Maps bootstrap failures to existing agent failure categories without adding new ontology events.
- Completes the run only when no human approval is pending.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialists.test.ts packages/agent/test/projection.test.ts packages/agent/test/tool-gateway.test.ts
```

Expected:

```text
Test Files  4 passed
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
git add docs/agentic/claims/task-2-ontology-bootstrap-resident-runner.md packages/agent/src/ontology-bootstrap-workflow.ts packages/agent/test/ontology-bootstrap-workflow.test.ts
git commit -m "feat: run ontology bootstrap through resident agent"
```

**Acceptance Criteria:**

- The resident run produces auditable agent events and pending human review requests.
- The resident run can resume from stable candidate bundle cursors without duplicating tool requests for already recorded bundle hashes.
- The runner does not execute raw import, staging approval, staging execution, accepted graph review, provider transfer, PRR send, legal escalation, export, or repair.
- Missing report, mismatched report, missing evidence links, secret-shaped data, and forbidden event types fail closed with secret-safe diagnostics.

---

## Task 3: Live Nous Review Notes For Model-Facing Behavior

**Files:**

- Create: `docs/agentic/claims/task-3-ontology-bootstrap-resident-nous.md`
- Create: `packages/agent/src/ontology-bootstrap-nous.ts`
- Create: `packages/agent/test/ontology-bootstrap-nous.test.ts`
- Create: `packages/agent/test/ontology-bootstrap-nous-live.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/src/ontology-bootstrap-workflow.ts`
- Modify: `packages/agent/test/ontology-bootstrap-workflow.test.ts`

**Interfaces:**

- Consumes:
  - Task 1 review bundle DTO.
  - `createNousPortalProvider(input)` from `packages/agent/src/openai-compatible-provider.ts`.
  - `SecretMaterial` and `StaticSecretStore` from `packages/agent/src/secret-store.ts`.
  - `createAgentRuntime(input).invokeModel(command)` from `packages/agent/src/runtime.ts`.
- Produces:
  - `buildOntologyBootstrapNousPrompt(input: BuildOntologyBootstrapNousPromptInput): string`
  - `validateOntologyBootstrapNousMemo(text: string): OntologyBootstrapNousMemo`
  - `runOntologyBootstrapNousReview(input: RunOntologyBootstrapNousReviewInput): Promise<RunOntologyBootstrapNousReviewResult>`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-3-ontology-bootstrap-resident-nous.md` with the owned files above. Mark it `in-progress`.

- [ ] **Step 2: Write deterministic Nous helper tests**

Create `packages/agent/test/ontology-bootstrap-nous.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildOntologyBootstrapAgentReviewBundle,
  runOntologyBootstrapResidentWorkflow
} from "../src/ontology-bootstrap-workflow.js";
import {
  buildOntologyBootstrapNousPrompt,
  validateOntologyBootstrapNousMemo
} from "../src/ontology-bootstrap-nous.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";

const now = () => "2026-07-08T15:00:00.000Z";

describe("ontology bootstrap Nous prompt helpers", () => {
  it("builds a raw-content-free prompt from safe dossier metadata", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;
    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });

    const prompt = buildOntologyBootstrapNousPrompt({ bundle });

    expect(prompt).toContain("ontology-bootstrap");
    expect(prompt).toContain("legacy_report_001");
    expect(prompt).toContain("legacy_candidate_001");
    expect(prompt).toContain(bootstrapReportFixture.reportHash);
    expect(prompt).not.toMatch(/api key|authorization|bearer|password|secret/i);
    expect(prompt).not.toContain("{\"legacyCestusType\"");
  });

  it("validates a bounded model memo without treating it as ontology truth", () => {
    const memo = validateOntologyBootstrapNousMemo([
      "Review note: prioritize the eligible candidate batch and inspect malformed quarantine first.",
      "No accepted graph events are authorized by this memo."
    ].join("\\n"));

    expect(memo.summary).toContain("prioritize");
    expect(memo.allowedUse).toBe("review-note-only");
    expect(JSON.stringify(memo)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });
});
```

- [ ] **Step 3: Write the live Nous acceptance test**

Create `packages/agent/test/ontology-bootstrap-nous-live.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SecretMaterial,
  StaticSecretStore,
  createNousPortalProvider
} from "../src/index.js";
import {
  buildOntologyBootstrapAgentReviewBundle
} from "../src/ontology-bootstrap-workflow.js";
import {
  buildOntologyBootstrapNousPrompt,
  validateOntologyBootstrapNousMemo
} from "../src/ontology-bootstrap-nous.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";

const liveFlag = process.env.CESTUS_AGENT_LIVE_NOUS;
const env = loadNousEnv(process.cwd());
const liveDescribe = liveFlag === "1" ? describe : describe.skip;
const inputArtifactHash = "sha256:1212121212121212121212121212121212121212121212121212121212121212";

liveDescribe("live Nous ontology bootstrap review smoke", () => {
  it("returns a secret-safe review memo for a bootstrap dossier prompt", async () => {
    expect(env.apiKey).toBeDefined();
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-08T15:15:00.000Z"
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok || env.apiKey === undefined) return;
    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_live",
      taskId: "task_ontology_bootstrap_live",
      generatedAt: "2026-07-08T15:15:00.000Z",
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });
    const prompt = buildOntologyBootstrapNousPrompt({ bundle });
    const provider = createNousPortalProvider({
      secretStore: new StaticSecretStore({
        agent_credref_nous_portal: SecretMaterial.fromRuntimeValue(env.apiKey)
      }),
      resolveInputText: async (hash) => {
        expect(hash).toBe(inputArtifactHash);
        return prompt;
      },
      ...(env.endpoint === undefined ? {} : { endpointUrl: env.endpoint }),
      ...(env.model === undefined ? {} : { modelId: env.model })
    });

    const result = await provider.invoke({
      invocationId: "inv_ontology_bootstrap_live",
      runId: "run_ontology_bootstrap_live",
      modelFamily: env.model ?? "tencent/hy3:free",
      inputArtifactHash,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });
    const memo = validateOntologyBootstrapNousMemo(result.outputText);
    const serialized = JSON.stringify({ result, memo });

    expect(memo.allowedUse).toBe("review-note-only");
    expect(result.outputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(serialized).not.toMatch(/api key|authorization|bearer|password|private key|oauth|credential/i);
    expect(serialized).not.toContain(env.apiKey);
  }, 60_000);
});

function loadNousEnv(cwd: string): {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly model?: string;
} {
  const values: Record<string, string> = {};
  const envPath = join(cwd, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\\r?\\n/)) {
      const index = line.indexOf("=");
      if (index > 0) {
        values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return {
    apiKey: process.env.CESTUS_AGENT_NOUS_API_KEY ?? values.CESTUS_AGENT_NOUS_API_KEY,
    endpoint: process.env.CESTUS_AGENT_NOUS_ENDPOINT ?? values.CESTUS_AGENT_NOUS_ENDPOINT,
    model: process.env.CESTUS_AGENT_NOUS_MODEL ?? values.CESTUS_AGENT_NOUS_MODEL
  };
}
```

- [ ] **Step 4: Run deterministic failing tests**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-nous.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/ontology-bootstrap-nous.js"
```

- [ ] **Step 5: Implement Nous helper and workflow integration**

Create `packages/agent/src/ontology-bootstrap-nous.ts` so the prompt builder:

- Uses only the current candidate bundle, dossier/report/candidate IDs, hashes, counts, confidence, predicates, rationale, alternatives, uncertainty, quarantine categories, blocked reasons, and next safe actions.
- Asks Nous for a short review memo and missing-context questions.
- States that the memo is review material only and cannot authorize accepted graph state.
- Rejects output that contains credential-shaped text or claims authority to accept graph truth.

Update `packages/agent/src/ontology-bootstrap-workflow.ts` so the workflow can attach a Nous memo artifact and record a model-invocation-related run step when the caller supplies a successful memo result. Do not make deterministic unit tests depend on network.

Modify `packages/agent/src/index.ts`:

```ts
export * from "./ontology-bootstrap-nous.js";
```

- [ ] **Step 6: Run deterministic targeted tests**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/openai-compatible-provider.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Run live Nous acceptance**

Run:

```bash
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts
```

Expected:

```text
Test Files  1 passed
```

The command output must not include the API key, bearer header, raw provider error body, or credential-shaped text.

- [ ] **Step 8: Run full verification**

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

- [ ] **Step 9: Commit**

Run:

```bash
git add docs/agentic/claims/task-3-ontology-bootstrap-resident-nous.md packages/agent/src/ontology-bootstrap-nous.ts packages/agent/src/ontology-bootstrap-workflow.ts packages/agent/src/index.ts packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/ontology-bootstrap-nous-live.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts
git commit -m "feat: enrich ontology bootstrap review with nous"
```

**Acceptance Criteria:**

- Live Nous is the acceptance path for model-facing behavior.
- Unit tests still cover pure prompt and validation logic deterministically.
- Nous output is review-note material only; it can refine rationale, alternatives, uncertainty, and review questions, but it cannot create accepted graph events or bypass staging approval.
- Provider calls use secret-store material and never serialize key material into events, DTOs, docs, claims, or test output.

---

## Task 4: Local Runtime Launch And Read Routes

**Files:**

- Create: `docs/agentic/claims/task-4-ontology-bootstrap-resident-routes.md`
- Create: `packages/local-runtime/src/agent-ontology-bootstrap-routes.ts`
- Create: `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`
- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`

**Interfaces:**

- Consumes:
  - Task 2 `runOntologyBootstrapResidentWorkflow`.
  - Existing mounted workspace handle and legacy runtime report/read API.
  - Existing default local agent runtime factory, which discovers Nous from `.env`.
- Produces:
  - `handleAgentOntologyBootstrapRoute(input: HandleAgentOntologyBootstrapRouteInput): Promise<LocalRuntimeResponse | undefined>`
  - `POST /api/agent/specialists/ontology-bootstrap/runs`
  - `GET /api/agent/specialists/ontology-bootstrap/runs/:runId`

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-4-ontology-bootstrap-resident-routes.md`. Mark it `in-progress`.

- [ ] **Step 2: Write failing route tests**

Create `packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalRuntimeHttpHandler } from "../src/http-handler.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { writeLegacyCestusFixture } from "../../ingestion/test/fixtures/legacy-cestus-fixtures.js";

let cwd: string;
let sourceRoot: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cestus-bootstrap-route-"));
  sourceRoot = mkdtempSync(join(tmpdir(), "cestus-bootstrap-source-"));
  writeLegacyCestusFixture(sourceRoot);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(sourceRoot, { recursive: true, force: true });
});

describe("ontology-bootstrap agent routes", () => {
  it("launches a resident ontology-bootstrap run from a selected legacy report without approval decisions", async () => {
    const handler = createLocalRuntimeHttpHandler({
      config: resolveLocalRuntimeConfig({ cwd, env: {} }),
      actor: { id: "actor_route_owner", kind: "human", label: "Route Owner" },
      now: () => "2026-07-08T16:00:00.000Z"
    });

    const launch = await handler({
      method: "POST",
      url: "/api/agent/specialists/ontology-bootstrap/runs",
      body: JSON.stringify({
        taskId: "task_ontology_bootstrap_route",
        runId: "run_ontology_bootstrap_route",
        sourceCollectionId: "src_old_cestus",
        sourceRoot,
        scanBatchId: "scan_old_cestus_001",
        importBatchId: "imp_old_cestus_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        maxCandidatesPerBundle: 50
      })
    });

    expect(launch.status).toBe(200);
    const body = JSON.parse(launch.body);
    expect(body.schemaVersion).toBe("agent-ontology-bootstrap-route.v1");
    expect(body.runId).toBe("run_ontology_bootstrap_route");
    expect(body.reviewBundleHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toMatch(/api key|authorization|bearer|password|secret/i);

    const status = await handler({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(status.body).runs.map((run: { readonly runId: string }) => run.runId)).toContain("run_ontology_bootstrap_route");
    handler.close();
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts
```

Expected before implementation:

```text
expected 200 but received 404
```

- [ ] **Step 4: Implement route handlers**

Add a route helper that:

- Ensures the resident identity and task exist.
- Runs legacy inspect/report/raw import preview reads only through existing runtime services.
- Calls the resident workflow runner with report/review/evidence-link state and candidate chunk options.
- Returns review-bundle hash, phase, selected candidate IDs, tool request IDs, and safe next action.
- Does not append `agent.tool.approved`, `legacy.ontology.staging.approved`, `assertion.proposed`, accepted graph events, raw import execution, or provider transfer events.

Integrate it from `packages/local-runtime/src/agent-http-routes.ts` before the generic fallback.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts
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
git add docs/agentic/claims/task-4-ontology-bootstrap-resident-routes.md packages/local-runtime/src/agent-ontology-bootstrap-routes.ts packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
git commit -m "feat: expose ontology bootstrap agent routes"
```

**Acceptance Criteria:**

- The route launches resident-agent ontology-bootstrap runs from legacy report evidence.
- The route is read/launch only and does not approve, execute, send, export, repair, or accept graph truth.
- The route output is browser-safe and does not include raw old-Cestus content, source-sensitive excerpts, provider secrets, or raw provider errors.
- Route launch/read behavior is chunk-aware and can report the next cursor for large legacy archives.

---

## Task 5: Read-Only UI Surface

**Files:**

- Create: `docs/agentic/claims/task-5-ontology-bootstrap-resident-ui.md`
- Create: `packages/ui/test/agent-ontology-bootstrap-adapter.test.ts`
- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Modify: `packages/ui/src/agent/agent-types.ts`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-workspace.test.tsx`
- Modify: `packages/ui/test/agent-adapter.test.ts`

**Interfaces:**

- Consumes:
  - Task 4 route DTO shape.
  - Existing `agent-status.v1` DTO.
- Produces:
- Browser parser support for ontology-bootstrap route DTOs.
- Read-only Agent workspace rendering for ontology-bootstrap runs, review-bundle hashes, candidate bundle counts, next cursor, pending staging requests, and safe next action.

- [ ] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-5-ontology-bootstrap-resident-ui.md`. Mark it `in-progress`.

- [ ] **Step 2: Write failing UI adapter and render tests**

Create `packages/ui/test/agent-ontology-bootstrap-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ontologyBootstrapRouteDtoFromJson } from "../src/agent/agent-adapter.js";

describe("ontology bootstrap route DTO parser", () => {
  it("parses browser-safe bootstrap route DTOs and rejects secret-shaped fields", () => {
    const dto = ontologyBootstrapRouteDtoFromJson({
      schemaVersion: "agent-ontology-bootstrap-route.v1",
      generatedAt: "2026-07-08T16:00:00.000Z",
      runId: "run_ontology_bootstrap_route",
      taskId: "task_ontology_bootstrap_route",
      phase: "staging-review",
      reviewBundleHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      selectedCandidateIds: ["legacy_candidate_001"],
      candidateBundleCounts: { eligible: 1, blocked: 1, rejected: 0, reviewOnly: 0 },
      nextCursor: 1,
      toolRequestIds: ["toolreq_ontology_bootstrap_staging_approval"],
      nextSafeAction: "Review staging approval preview"
    });

    expect(dto.runId).toBe("run_ontology_bootstrap_route");
    expect(() =>
      ontologyBootstrapRouteDtoFromJson({
        ...dto,
        rawProviderError: "provider failure details are not allowed"
      })
    ).toThrow();
  });
});
```

Append a render test to `packages/ui/test/agent-workspace.test.tsx` that feeds an `agent-status.v1` fixture with an `ontology-bootstrap` run and a `ledger-review` tool request, then verifies the screen displays the run and pending staging request without approve/execute buttons.

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx
```

Expected before implementation:

```text
ontologyBootstrapRouteDtoFromJson is not exported
```

- [ ] **Step 4: Implement read-only UI parsing and rendering**

Update the UI parser to accept the route DTO and reject unknown/unsafe fields. Update `AgentWorkspace.tsx` to render ontology-bootstrap run phase, review-bundle hash, pending tool request, and safe next action from existing status data. Do not add approval, execution, export, send, legal, repair, provider transfer, or accepted graph buttons.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-app-integration.test.tsx
```

Expected:

```text
Test Files  4 passed
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
git add docs/agentic/claims/task-5-ontology-bootstrap-resident-ui.md packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/agent-types.ts packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ui/test/agent-adapter.test.ts
git commit -m "feat: show ontology bootstrap agent review state"
```

**Acceptance Criteria:**

- UI remains read-only over agent/runtime DTOs.
- Human-reviewable staging state and candidate bundle status are visible as run/tool-request evidence, not as hidden execution controls.
- Browser code does not import Node-only ledger, filesystem, SQLite, legacy runtime, provider, or staging service modules.

---

## Task 6: Readiness Tracking And Review Gates

**Files:**

- Create: `docs/agentic/claims/task-6-ontology-bootstrap-resident-readiness.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md`

**Interfaces:**

- Consumes:
  - Verification evidence from Tasks 1-5.
- Produces:
  - Factory readiness tracking for this approved plan.
  - Final readiness entry with live Nous acceptance evidence and no secret material.

- [x] **Step 1: Claim the task**

Create and commit `docs/agentic/claims/task-6-ontology-bootstrap-resident-readiness.md`. Mark it `in-progress`.

- [x] **Step 2: Run focused non-live verification bundle**

Run:

```bash
npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/ontology-bootstrap-nous.test.ts packages/agent/test/specialists.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/ui/test/agent-ontology-bootstrap-adapter.test.ts packages/ui/test/agent-workspace.test.tsx packages/ingestion/test/legacy-runtime.test.ts packages/ingestion/test/legacy-staging.test.ts
```

Expected:

```text
Test Files  10 passed
```

- [x] **Step 3: Run live Nous acceptance**

Run:

```bash
CESTUS_AGENT_LIVE_NOUS=1 npm test -- packages/agent/test/ontology-bootstrap-nous-live.test.ts
```

Expected:

```text
Test Files  1 passed
```

Review the visible command output before recording evidence. It must not include the API key, bearer header, raw provider error body, or credential-shaped text.

- [x] **Step 4: Run full verification**

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

- [x] **Step 5: Track the approved plan**

Modify `scripts/check-agent-readiness.mjs` by adding:

```js
  "docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md"
```

near the resident-agent and ontology-bootstrap entries.

- [x] **Step 6: Record readiness evidence**

Append a section to `docs/agentic/software-factory.md` titled `Ontology Bootstrap Resident Agent Workflow Readiness`. Record the focused command, live Nous acceptance command, full verification command, and invariant summary. Do not include model output text, request headers, API key material, raw provider errors, or prompt bodies.

- [x] **Step 7: Run final documentation checks**

Run:

```bash
git diff --check
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [x] **Step 8: Run final full verification**

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

- [x] **Step 9: Commit**

Run:

```bash
git add docs/agentic/claims/task-6-ontology-bootstrap-resident-readiness.md scripts/check-agent-readiness.mjs docs/agentic/software-factory.md docs/superpowers/plans/2026-07-08-ontology-bootstrap-resident-agent-workflow-implementation.md
git commit -m "docs: record ontology bootstrap resident workflow readiness"
```

**Acceptance Criteria:**

- Factory readiness tracks this plan.
- Focused verification, live Nous acceptance, and full verification pass.
- Readiness evidence states that live Nous is the model-facing acceptance path for this slice.
- Readiness docs preserve append-only ledger semantics, provenance, projection rebuildability, zero-trust legacy bootstrap, human approval gates, and secret-safe diagnostics.

---

## Completion Criteria

The ontology-bootstrap resident-agent workflow is complete when:

- Every task above has a committed claim and implementation commit.
- `npm run verify` passes after each task.
- Live Nous acceptance passes for Task 3 and Task 6.
- The resident agent can turn existing legacy reports and evidence links into a review-bundle artifact, context pack, run step, pending staging approval request, and safe memory caveat.
- Candidate bundles include evidence refs, source artifact hashes, confidence/rationale, alternatives/uncertainty, and blocked/rejected reasons.
- Large legacy imports are handled through stable chunk IDs, cursors, bundle hashes, and resumable run metadata.
- The route and UI surfaces are read-only over safe DTOs and do not execute approvals.
- Accepted graph state remains untouched unless a later approved staging execution path calls the existing legacy staging service after exact human approval.
- No fake provider output is used as substitute evidence for model-facing behavior.
- No secrets or raw provider errors appear in events, DTOs, diagnostics, docs, tests, logs, claims, or readiness evidence.

## Stop Conditions

Stop and escalate on data-loss risk, schema conflict, unavailable Nous credentials for live acceptance, live provider failure after two focused repair attempts, raw provider diagnostics that cannot be safely redacted, source mutation risk, missing evidence provenance, candidate-set mismatch, approval ambiguity, UI pressure to execute risky actions directly, or any path that imports old ontology truth as accepted graph state.
