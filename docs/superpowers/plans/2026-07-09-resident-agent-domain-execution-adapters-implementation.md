# Resident Agent Domain Execution Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build descriptor-backed resident-agent domain execution adapters that consume already-approved tool requests through the scheduler without bypassing provider, PRR, ontology, governance, workspace, or legacy staging gates.

**Architecture:** The tool gateway remains an append-only lifecycle recorder for requests, decisions, completions, and failures. The scheduler/resumer owns consume-time approval validation and calls descriptor-backed adapters only after preview, source, lock, provenance, policy, and secret-safety checks pass. Each adapter family translates a validated request into the authoritative domain service call, then maps the service result back to `agent.tool.completed` or `agent.tool.failed` evidence.

**Tech Stack:** TypeScript, Node.js 26, Vitest, Zod, existing Cestus event ledger/domain services, Markdown factory plans.

## Global Constraints

- Start from `neo` after the scheduler/resumer branch lands the shared descriptor/executor interface. Broad domain execution remains blocked until that merge is visible in `packages/agent/src`.
- Domain services remain authoritative. Adapters must not append final PRR send, provider transfer, export/report, destructive repair, legal escalation, accepted graph, or legacy staging events directly when an existing service owns that gate.
- Approval is not execution. Every execution path must revalidate independent human approval, approval class, exact preview hash, source hashes, projection high-water marks, active locks, policy version, provenance, and secret safety at consume time.
- Keep adapter families separate: provider byte transfer, PRR send/follow-up, accepted graph review, export/report, destructive repair, and legacy staging.
- Treat draft/proposal/local derivative work separately from external or review effects. Drafts may create local artifacts or proposed events; sends, exports, legal escalation, accepted graph changes, provider byte transfer, and repair must flow through existing human/domain gates.
- Preserve append-only ledger semantics, provenance requirements, projection rebuildability, human-approved PRR send gates, legal escalation locks, provider byte-transfer approvals, evidence-first legacy bootstrap, portable workspace compatibility, and secret-safe diagnostics.
- Standard verification for these tasks remains credential-free. Live provider or correspondence smoke checks are opt-in acceptance evidence only when the task explicitly says so.

---

## Current Checkpoint

The current `neo` resident-agent stack has:

- `packages/agent/src/tool-gateway.ts`: request/approve/deny/complete/fail lifecycle events with hash-bound previews and result sanitization.
- `packages/agent/src/execution-loop.ts`: a fake scheduler/resumer proving consume-time approval checks, stale-preview failures, active-lock blocking, and safe result mapping.
- `packages/agent/src/approval-cockpit.ts`: decision-only approval review DTOs and route/UI constraints.
- Domain services that already enforce gates:
  - `ProviderParseApprovalService` records `ingestion.provider.approved` without transferring bytes.
  - `PrrCorrespondenceService.sendInitialRequest()` checks approved message input, request lifecycle, provider adapter results, body hash, attachments, and idempotency.
  - `AssertionService.accept()` accepts only previously proposed assertions.
  - `GovernanceService.recordExportGenerated()` and `recordReportGenerated()` enforce governed export plans, content hashes, causation, sensitive opt-ins, and human service actors where required.
  - `workspace-ops` marks canonical repair actions as human-approved append-only repair work and limits projection rebuild outputs to expendable artifacts.
  - `LegacyOntologyStagingService` binds report and candidate-set hashes and appends only `assertion.proposed`.

Missing pieces this plan owns:

- A stable descriptor contract for approved domain execution adapters.
- Result and failure mappers that fit `agent.tool.completed` and `agent.tool.failed`.
- Family-specific preview builders and current-preview rebuilders.
- Family-specific stale-source, lock, and provenance checks.
- Scheduler integration after the scheduler/resumer contract lands.

## Desired Scheduler Interface

This plan expects the scheduler branch to provide an interface equivalent to the shape below. If the landed names differ, workers should adapt the descriptor contract to the landed names without changing the semantics.

```ts
export interface ApprovedToolExecutionRequest {
  readonly toolRequestId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly approvedPreviewHash: `sha256:${string}`;
  readonly requestedPreviewHash: `sha256:${string}`;
  readonly approvingActorId: string;
  readonly approvalEventId: string;
  readonly activeLocks: readonly AgentDomainActiveLock[];
}

export interface AgentDomainExecutionScheduler {
  resumeApprovedTool(input: ApprovedToolExecutionRequest): Promise<void>;
}
```

If this interface or an equivalent does not exist on `neo`, execute Task 1 only and stop before Task 2.

## File Structure

- `packages/agent/src/domain-execution-descriptors.ts`: pure descriptor types, preview/result/failure DTOs, stable preview hashing, descriptor registry validation, and descriptor-level forbidden-effect declarations.
- `packages/agent/src/domain-execution-dispatcher.ts`: scheduler-facing dispatcher that consumes approved requests, rebuilds current previews through descriptors, runs shared stale/lock/provenance checks, calls adapters, and records gateway completion/failure.
- `packages/agent/src/adapters/legacy-staging.ts`: legacy staging descriptor family over existing legacy runtime and staging services.
- `packages/agent/src/adapters/accepted-graph-review.ts`: accepted graph review descriptors over ontology review services.
- `packages/agent/src/adapters/export-report.ts`: export/report descriptors over governance export/report planning and generation services.
- `packages/agent/src/adapters/provider-byte-transfer.ts`: provider byte-transfer descriptors over ingestion/provider approval and provider execution services as they become available.
- `packages/agent/src/adapters/prr-correspondence.ts`: PRR initial-send and follow-up descriptors over PRR correspondence services.
- `packages/agent/src/adapters/destructive-repair.ts`: destructive/repair descriptors over workspace-ops readiness, projection rebuild, diagnostics, and future append-only repair services.
- `packages/agent/src/index.ts`: public exports for descriptor contracts, dispatcher, and registered adapter families.
- `packages/agent/test/*domain*adapter*.test.ts`: focused adapter contract tests.
- Domain package tests named in each task remain part of targeted verification because domain services, not adapters, own final gates.

## Adapter Family Matrix

| Family | Tool IDs | Side-effect class | Approval class | Domain target | Forbidden effects |
| --- | --- | --- | --- | --- | --- |
| Provider byte transfer | `provider.bytes.transfer`, `ingestion.provider-parse.execute` | `external-byte-transfer` | `provider-byte-transfer` | `ProviderParseApprovalService`, `DocumentAiProvider`, ingestion runtime provider execution when present | PRR send, graph acceptance, export/report, repair, direct secret storage |
| PRR send/follow-up | `prr.initial-send.execute`, `prr.follow-up.execute` | `external-message-send` | `external-message-send` | `PrrCorrespondenceService` and PRR lifecycle services | legal escalation confirmation, raw mailbox mutation outside adapter, accepted graph events |
| Accepted graph review | `ontology.assertion.accept`, `ontology.relationship.accept`, `ontology.entity.resolve` | `ledger-review` | `ledger-review` | `AssertionService` and future relationship/entity review services | accepting without proposal/evidence, agent actor review, memory-to-truth promotion |
| Export/report | `governance.export.generate`, `governance.report.generate` | `export-or-publication` | `export-or-publication` | `GovernanceService`, governed export plan projection, content-addressed artifact writer | sensitive opt-in bypass, PRR send, graph acceptance, unplanned evidence inclusion |
| Destructive repair | `workspace.projection-rebuild.execute`, `workspace.canonical-repair.record` | `destructive-or-repair` | `destructive-or-repair` | `workspace-ops` projection rebuild/readiness, future append-only repair service | ledger rewrite, blob deletion, silent migration, repair without human event |
| Legacy staging | `legacy.staging.approve`, `legacy.staging.execute` | `ledger-review` for approval, `ledger-proposal` for execution after staging approval | `ledger-review` for approval request, `none` for execution only when staging approval already exists | `LegacyOntologyStagingService`, `LegacyImportRuntime` | accepted graph events, source-tree mutation, raw import bypass, candidate-set drift |

## Shared Preview Contract

Every preview builder and current-preview rebuilder must return stable JSON that includes:

- `toolRequestId`, `toolId`, `toolVersion`, `runId`, `taskId`, `residentAgentId`
- `sideEffectClass` and `requiredApprovalClass`
- `targetDomainService`
- `inputSchemaId` and `normalizedInputHash`
- plain-language `summary`, `scope`, `estimatedEffect`, and `consequence`
- affected evidence IDs, event IDs, artifact hashes, PRR IDs, report/export IDs, workspace refs, candidate IDs, or assertion IDs
- expected event types and artifact kinds
- context pack refs and hashes
- governance policy version and lock snapshot
- projection high-water marks
- idempotency key
- source content hashes or source state hashes
- stale-after condition when the domain family needs one

Formatting and display order must not affect the preview hash. Semantic changes must affect the hash.

## Shared Result Contract

Each adapter returns an `AgentDomainExecutionResult` that maps to `AgentToolResult`:

```ts
export interface AgentDomainExecutionResult {
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly readModelChanges: readonly {
    readonly projectionName: string;
    readonly change: string;
    readonly relatedIds?: readonly string[];
  }[];
  readonly resultSummary: string;
}
```

Result mappers must include every domain event ID the service returned and every content-addressed artifact hash the adapter produced or consumed as output. Diagnostic events are event IDs too.

## Failure Categories

Adapters should use the failure categories in the execution approval design:

- `approval-required`
- `approval-denied`
- `approval-stale`
- `provider-unavailable`
- `provider-rate-limited`
- `credential-missing`
- `credential-revoked`
- `model-output-invalid`
- `secret-detected`
- `permission-denied`
- `lock-active`
- `projection-lag`
- `context-budget-exceeded`
- `missing-provenance`
- `domain-gate-failed`
- `stale-source`
- `external-effect-failed`
- `data-loss-risk`

The current gateway and ontology schema do not yet include every category above. Task 1 extends the schema before any adapter can emit the new categories.

## Task 1: Pure Descriptor Contract And Failure Categories

**Files:**
- Create: `packages/agent/src/domain-execution-descriptors.ts`
- Create: `packages/agent/test/domain-execution-descriptors.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/src/projection-types.ts`
- Modify: `packages/agent/src/tool-gateway.ts`
- Modify: `packages/agent/src/execution-loop.ts`
- Modify: `packages/ontology/src/contracts.ts`
- Modify: `packages/ontology/test/agent-contracts.test.ts`
- Modify: `packages/agent/test/tool-gateway.test.ts`
- Modify: `packages/agent/test/execution-loop.test.ts`

**Interfaces:**
- Consumes: existing `AgentToolPreview`, `AgentToolResult`, `AgentToolFailureCategory`, `AgentToolSideEffectClass`, `AgentToolApprovalClass`.
- Produces: `AgentDomainToolDescriptor`, `AgentDomainPreview`, `AgentDomainExecutionResult`, `AgentDomainExecutionFailure`, `createAgentDomainToolRegistry()`, `hashAgentDomainPreview()`.

- [x] **Step 1: Write the failing descriptor contract tests**

Create `packages/agent/test/domain-execution-descriptors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createAgentDomainToolRegistry,
  hashAgentDomainPreview
} from "../src/domain-execution-descriptors.js";

describe("agent domain execution descriptors", () => {
  it("hashes semantic preview content with stable key ordering", () => {
    const left = hashAgentDomainPreview({
      schemaVersion: "agent-domain-preview.v1",
      toolRequestId: "toolreq_provider_transfer",
      toolId: "provider.bytes.transfer",
      toolVersion: "0.1.0",
      runId: "run_provider_transfer",
      taskId: "task_provider_transfer",
      residentAgentId: "agent_default",
      sideEffectClass: "external-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      targetDomainService: "ingestion.provider",
      inputSchemaId: "provider-bytes-transfer-input.v1",
      normalizedInputHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      summary: "Send selected evidence bytes to the configured provider.",
      scope: "Selected evidence for provider parsing.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      affectedRefs: [{ kind: "evidence", id: "ev_provider_001", hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" }],
      expectedOutputs: [{ kind: "event", type: "ingestion.provider.approved" }],
      contextPackRefs: [],
      governancePolicyVersion: "policy_public_records_v1",
      lockSnapshot: [],
      projectionHighWaterMarks: [{ projectionName: "ingestion", highWaterMark: 12 }],
      idempotencyKey: "provider-bytes-transfer:provider_001",
      staleAfter: { kind: "source-hash-change", refs: ["ev_provider_001"] }
    });
    const right = hashAgentDomainPreview({
      schemaVersion: "agent-domain-preview.v1",
      staleAfter: { refs: ["ev_provider_001"], kind: "source-hash-change" },
      idempotencyKey: "provider-bytes-transfer:provider_001",
      projectionHighWaterMarks: [{ highWaterMark: 12, projectionName: "ingestion" }],
      lockSnapshot: [],
      governancePolicyVersion: "policy_public_records_v1",
      contextPackRefs: [],
      expectedOutputs: [{ type: "ingestion.provider.approved", kind: "event" }],
      affectedRefs: [{ hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222", id: "ev_provider_001", kind: "evidence" }],
      consequence: "The provider may process the listed evidence; no PRR, export, repair, or graph review occurs.",
      estimatedEffect: "Provider receives the listed byte hashes after approval is consumed.",
      scope: "Selected evidence for provider parsing.",
      summary: "Send selected evidence bytes to the configured provider.",
      normalizedInputHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      inputSchemaId: "provider-bytes-transfer-input.v1",
      targetDomainService: "ingestion.provider",
      requiredApprovalClass: "provider-byte-transfer",
      sideEffectClass: "external-byte-transfer",
      residentAgentId: "agent_default",
      taskId: "task_provider_transfer",
      runId: "run_provider_transfer",
      toolVersion: "0.1.0",
      toolId: "provider.bytes.transfer",
      toolRequestId: "toolreq_provider_transfer"
    });

    expect(left).toBe(right);
  });

  it("rejects descriptors that mismatch side-effect and approval classes", () => {
    expect(() => createAgentDomainToolRegistry([{
      toolId: "prr.initial-send.execute",
      toolVersion: "0.1.0",
      family: "prr-correspondence",
      sideEffectClass: "external-message-send",
      requiredApprovalClass: "provider-byte-transfer",
      inputSchemaId: "prr-send-input.v1",
      outputSchemaId: "agent-domain-result.v1",
      targetDomainService: "prr.correspondence",
      idempotencyKeyFields: ["prrRequestId", "correspondenceId"],
      forbiddenEffects: ["provider-byte-transfer", "accepted-graph-review"]
    }])).toThrow(/approval class/i);
  });
});
```

- [x] **Step 2: Run the descriptor test to verify it fails**

Run:

```bash
npm test -- packages/agent/test/domain-execution-descriptors.test.ts
```

Expected: fail because `../src/domain-execution-descriptors.js` does not exist.

- [x] **Step 3: Extend failure categories before adapters can emit them**

Modify `packages/ontology/src/contracts.ts`, `packages/agent/src/projection-types.ts`, and `packages/agent/src/tool-gateway.ts` so `agent.tool.failed` accepts the full failure category list from this plan.

Update the fake loop active-lock mapper in `packages/agent/src/execution-loop.ts` to emit `lock-active` instead of the old residual `legal-lock-active` when generic active locks block resume.

- [x] **Step 4: Add the pure descriptor contract**

Create `packages/agent/src/domain-execution-descriptors.ts` with frozen DTOs, stable JSON hashing, side-effect/approval-class validation, secret-safe text validation, descriptor-family validation, and registry lookup by `toolId@toolVersion`.

- [x] **Step 5: Run focused descriptor and lifecycle tests**

Run:

```bash
npm test -- packages/agent/test/domain-execution-descriptors.test.ts packages/ontology/test/agent-contracts.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/execution-loop.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/domain-execution-descriptors.ts packages/agent/src/index.ts packages/agent/src/projection-types.ts packages/agent/src/tool-gateway.ts packages/agent/src/execution-loop.ts packages/ontology/src/contracts.ts packages/agent/test/domain-execution-descriptors.test.ts packages/ontology/test/agent-contracts.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/execution-loop.test.ts
git commit -m "feat: add resident agent domain execution descriptor contracts"
```

## Task 2: Scheduler Dispatcher Boundary

**Files:**
- Create: `packages/agent/src/domain-execution-dispatcher.ts`
- Create: `packages/agent/test/domain-execution-dispatcher.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify only the landed scheduler file if the scheduler branch exposes a different integration point.

**Interfaces:**
- Consumes: `AgentDomainToolDescriptor`, `createAgentToolGateway()`, landed scheduler approved-request interface.
- Produces: `createAgentDomainExecutionDispatcher()` and a `resumeApprovedDomainTool()` path that calls one descriptor and maps completion/failure through the gateway.

- [x] **Step 1: Confirm scheduler dependency exists**

Run:

```bash
rg -n "ApprovedToolExecution|resumeApproved|scheduler" packages/agent/src packages/agent/test
```

Expected: output names the scheduler/resumer contract from the scheduler branch. If no shared scheduler contract exists, stop before editing this task.

- [x] **Step 2: Write the failing dispatcher tests**

Create `packages/agent/test/domain-execution-dispatcher.test.ts` with tests that prove:

- an unknown descriptor fails with `permission-denied`
- a rebuilt current preview hash mismatch fails with `approval-stale`
- an active lock fails with `lock-active`
- missing source event or artifact provenance fails with `missing-provenance`
- a descriptor execution result maps to `agent.tool.completed` with exact event IDs, artifact hashes, read-model changes, and result summary
- a domain service rejection maps to `domain-gate-failed` without appending completion

- [x] **Step 3: Run dispatcher tests to verify they fail**

Run:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts
```

Expected: fail because `domain-execution-dispatcher.ts` does not exist.

- [x] **Step 4: Implement the dispatcher**

Implement a dispatcher that:

- reads the current tool request lifecycle through the scheduler-provided approved request
- finds the descriptor by `toolId` and `toolVersion`
- rebuilds the current preview through `descriptor.rebuildPreview()`
- compares the rebuilt hash to the stored request hash and approval hash
- runs descriptor stale-source, lock, provenance, and secret-safety checks
- calls `descriptor.execute()` only after all checks pass
- maps success through `gateway.completeTool()`
- maps failure through `gateway.failTool()` with a safe category and allowed actions

- [x] **Step 5: Run dispatcher and existing resume tests**

Run:

```bash
npm test -- packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/tool-gateway.test.ts packages/agent/test/approval-queue.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/domain-execution-dispatcher.ts packages/agent/src/index.ts packages/agent/test/domain-execution-dispatcher.test.ts
git commit -m "feat: add approved domain execution dispatcher"
```

## Task 3: Legacy Staging Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/legacy-staging.ts`
- Create: `packages/agent/test/legacy-staging-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `LegacyOntologyStagingService`, `LegacyImportRuntime`, legacy report hashes, evidence-tied candidates.
- Produces: descriptors for `legacy.staging.approve` and `legacy.staging.execute`.

- [x] **Step 1: Write failing adapter tests**

Create `packages/agent/test/legacy-staging-adapter.test.ts` with tests that prove:

- preview includes source collection, scan batch, staging batch, legacy report ID, report hash, candidate-set hash, selected candidate IDs, imported evidence IDs, evidence content hashes, and plain-language consequence copy
- current-preview rebuild fails stale when the stored report hash or candidate-set hash changes
- staging execution fails with `approval-stale` when selected candidate IDs are not present in the current evidence-tied candidate set
- execution maps `assertion.proposed` event IDs into `agent.tool.completed`
- execution fails if any appended event type is `assertion.accepted`, `entity.resolved`, or `relationship.accepted`

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/legacy-staging-adapter.test.ts
```

Expected: fail because `legacy-staging.ts` does not exist.

- [x] **Step 3: Implement preview builders and stale checks**

Implement `buildLegacyStagingApprovalPreview()` and `rebuildLegacyStagingCurrentPreview()` using report identity, candidate-set hash, selected candidates, evidence IDs, and evidence content hashes.

- [x] **Step 4: Implement execution descriptors**

Implement:

- `legacy.staging.approve`: calls `LegacyOntologyStagingService.approveStaging()` through a human actor context and maps the approval event.
- `legacy.staging.execute`: calls `stageApprovedAssertions()` only after a matching staging approval already exists and maps only `assertion.proposed` events.

- [x] **Step 5: Run legacy adapter and domain tests**

Run:

```bash
npm test -- packages/agent/test/legacy-staging-adapter.test.ts packages/ingestion/test/legacy-staging.test.ts packages/ingestion/test/legacy-runtime.test.ts packages/agent/test/ontology-bootstrap-workflow.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/legacy-staging.ts packages/agent/src/index.ts packages/agent/test/legacy-staging-adapter.test.ts
git commit -m "feat: add legacy staging execution adapters"
```

## Task 4: Accepted Graph Review Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/accepted-graph-review.ts`
- Create: `packages/agent/test/accepted-graph-review-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify ontology review services only if a descriptor requires a domain-owned service that does not yet exist.

**Interfaces:**
- Consumes: `AssertionService.accept()`, graph projection provenance, ontology pack versions.
- Produces: descriptors for `ontology.assertion.accept` first; relationship/entity descriptors only after corresponding ontology services exist.

- [x] **Step 1: Write failing accepted-graph tests**

Create `packages/agent/test/accepted-graph-review-adapter.test.ts` with tests that prove:

- assertion-acceptance previews include assertion ID, proposal event ID, evidence ID, evidence content hash, current review state, reviewer rationale draft, ontology pack versions, and projected graph impact
- current-preview rebuild fails stale when the assertion is already accepted, missing, superseded, or its evidence hash changed
- execution calls `AssertionService.accept()` and maps the `assertion.accepted` event ID
- agent actors cannot execute accepted graph review as the domain review actor
- relationship/entity descriptors are not registered until domain services exist

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts
```

Expected: fail because `accepted-graph-review.ts` does not exist.

- [x] **Step 3: Implement assertion review descriptor**

Implement `ontology.assertion.accept` with `sideEffectClass: "ledger-review"` and `requiredApprovalClass: "ledger-review"`. The adapter must call `AssertionService.accept()` and must not append accepted graph events directly.

- [x] **Step 4: Run accepted graph tests**

Run:

```bash
npm test -- packages/agent/test/accepted-graph-review-adapter.test.ts packages/ontology/test/assertion-service.test.ts packages/ontology/test/graph-projection.test.ts packages/ontology/test/jsonld-export.test.ts
```

Expected: pass.

- [x] **Step 5: Commit**

```bash
git add packages/agent/src/adapters/accepted-graph-review.ts packages/agent/src/index.ts packages/agent/test/accepted-graph-review-adapter.test.ts
git commit -m "feat: add accepted graph review execution adapter"
```

## Task 5: Export And Report Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/export-report.ts`
- Create: `packages/agent/test/export-report-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `GovernanceService.recordExportGenerated()`, `GovernanceService.recordReportGenerated()`, `buildGovernanceProjection().planExport()`, content-addressed artifact hashes.
- Produces: descriptors for `governance.export.generate` and `governance.report.generate`.

- [x] **Step 1: Write failing export/report tests**

Create `packages/agent/test/export-report-adapter.test.ts` with tests that prove:

- preview includes export/report ID, included evidence IDs, content hashes, governed plan result, public-safe default state, sensitive opt-ins, policy version, excluded restricted categories, artifact hash, and plain-language consequence copy
- current-preview rebuild fails stale when evidence content hashes, governance policy, quarantine/tombstone state, sensitive opt-ins, or export plan output changes
- execution calls `GovernanceService.recordExportGenerated()` or `recordReportGenerated()`
- sensitive opt-ins require the human service actor named by the approval
- result mapper records `export.generated` or `report.generated` event IDs and output artifact hashes

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/export-report-adapter.test.ts
```

Expected: fail because `export-report.ts` does not exist.

- [x] **Step 3: Implement governed preview builders**

Build previews from governance projection export plans and the content-addressed report/export artifact hash. Keep report drafting as a separate local-derivative tool outside this `export-or-publication` adapter.

- [x] **Step 4: Implement execution descriptors**

Call the governance service methods and map service events plus generated artifact hashes. Map governance rejections to `domain-gate-failed`, stale plan changes to `approval-stale`, active export/governance locks to `lock-active`, and possible restricted evidence leaks to `secret-detected`.

- [x] **Step 5: Run export/report adapter and governance tests**

Run:

```bash
npm test -- packages/agent/test/export-report-adapter.test.ts packages/ontology/test/governance-export.test.ts packages/ontology/test/governance-projection.test.ts packages/ontology/test/governance-service.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/export-report.ts packages/agent/src/index.ts packages/agent/test/export-report-adapter.test.ts
git commit -m "feat: add export and report execution adapters"
```

## Task 6: Provider Byte Transfer Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/provider-byte-transfer.ts`
- Create: `packages/agent/test/provider-byte-transfer-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify provider execution services only after the ingestion/runtime owner exposes the transfer executor on `neo`.

**Interfaces:**
- Consumes: `ProviderParseApprovalService`, `DocumentAiProvider`, provider readiness descriptors, prompt artifact transfer policy, ingestion runtime provider-job projections.
- Produces: descriptors for `provider.bytes.transfer` and `ingestion.provider-parse.execute`.

- [x] **Step 1: Write failing provider byte-transfer tests**

Create `packages/agent/test/provider-byte-transfer-adapter.test.ts` with tests that prove:

- preview includes provider label, adapter version, evidence IDs, content hashes, byte counts, media types, excerpt policy, eligible media types, max bytes per file, provider retention/data-transfer note, governance tags, provider readiness ref, credential reference ID, and idempotency key
- current-preview rebuild fails stale when evidence content hash, prompt artifact hash, provider descriptor version, provider approval payload, or provider readiness state changes
- execution refuses to transfer bytes when the matching `ingestion.provider.approved` event is absent or mismatched
- result mapper records provider approval event IDs and parse output artifact hashes when provider execution is available
- no provider error, credential ref secret, environment variable name, raw document body, or raw prompt text enters `agent.tool.failed` or `agent.tool.completed`

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts
```

Expected: fail because `provider-byte-transfer.ts` does not exist.

- [x] **Step 3: Implement provider previews and domain gate checks**

Build previews from exact evidence/source refs, content hashes, byte counts, provider capability metadata, provider transfer policy, and current provider readiness. Require both source event refs and artifact hashes for provider-byte-transfer approval.

- [x] **Step 4: Implement provider execution descriptors**

The adapter must call the ingestion/provider domain gate first. If provider parse execution is not yet exposed by ingestion runtime, register only the approval/preview descriptor and make the execution descriptor fail with `domain-gate-failed` and allowed action `wait for ingestion provider execution service`.

- [x] **Step 5: Run provider adapter and ingestion tests**

Run:

```bash
npm test -- packages/agent/test/provider-byte-transfer-adapter.test.ts packages/ingestion/test/provider-adapter.test.ts packages/ingestion/test/runtime-jobs-provider.test.ts packages/agent/test/prompt-artifacts.test.ts packages/agent/test/provider-readiness.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/provider-byte-transfer.ts packages/agent/src/index.ts packages/agent/test/provider-byte-transfer-adapter.test.ts
git commit -m "feat: add provider byte transfer execution adapters"
```

## Task 7: PRR Send And Follow-Up Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/prr-correspondence.ts`
- Create: `packages/agent/test/prr-correspondence-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/prr/src/correspondence-service.ts`
- Modify: `packages/prr/test/correspondence-service.test.ts`

**Interfaces:**
- Consumes: `PrrCorrespondenceService`, PRR lifecycle projection, PRR provider adapters, legal escalation gates.
- Produces: descriptors for `prr.initial-send.execute` and `prr.follow-up.execute`.

- [x] **Step 1: Write failing PRR adapter tests**

Create `packages/agent/test/prr-correspondence-adapter.test.ts` with tests that prove:

- preview includes PRR request ID, correspondence ID, provider, recipients, subject, body hash, rendered body hash, attachment evidence IDs and content hashes, jurisdiction pack refs, send gate checks, idempotency key, provider capability summary, and legal-lock state
- current-preview rebuild fails stale when body hash, recipients, attachments, request lifecycle state, deadline/legal posture, or provider idempotency key changes
- execution calls `PrrCorrespondenceService.sendInitialRequest()` for initial sends
- follow-up execution calls a PRR-owned follow-up service method that appends `prr.followup.sent`
- legal escalation text fails with `lock-active` unless the PRR/legal domain gate already recorded the required confirmation
- result mapper records PRR event IDs and safe provider message refs only through domain events

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/prr-correspondence-adapter.test.ts
```

Expected: fail because `prr-correspondence.ts` does not exist.

- [x] **Step 3: Extend PRR correspondence service for follow-ups if absent**

If `PrrCorrespondenceService` still lacks a follow-up method, add `sendFollowUp()` that mirrors `sendInitialRequest()` but routes to the existing `prr.followup.sent` contract, requires approved message input, request lifecycle eligibility, body hash, attachment evidence IDs, provider metadata validation, and idempotency.

- [x] **Step 4: Implement PRR descriptors**

Implement initial-send and follow-up descriptors with `sideEffectClass: "external-message-send"` and `requiredApprovalClass: "external-message-send"`. Do not let this adapter confirm legal escalation or send legal pressure language without the separate legal domain gate.

- [x] **Step 5: Run PRR adapter and PRR service tests**

Run:

```bash
npm test -- packages/agent/test/prr-correspondence-adapter.test.ts packages/prr/test/correspondence-service.test.ts packages/prr/test/lifecycle.test.ts packages/prr/test/escalation-gate.test.ts packages/prr/test/provider-adapters.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/prr-correspondence.ts packages/agent/src/index.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/prr/src/correspondence-service.ts packages/prr/test/correspondence-service.test.ts
git commit -m "feat: add prr correspondence execution adapters"
```

## Task 8: Destructive Repair Adapter Family

**Files:**
- Create: `packages/agent/src/adapters/destructive-repair.ts`
- Create: `packages/agent/test/destructive-repair-adapter.test.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `workspace-ops` verification, diagnostics, projection rebuild readiness/result envelopes, future append-only repair events.
- Produces: descriptors for `workspace.projection-rebuild.execute` and blocked canonical repair descriptors.

- [x] **Step 1: Write failing destructive repair tests**

Create `packages/agent/test/destructive-repair-adapter.test.ts` with tests that prove:

- preview includes workspace refs, target projection or canonical root, proposed repair action, mutation class, data-loss risk summary, backup or manifest refs, ledger high-water mark, projection rebuild readiness checks, and append-only repair event plan
- current-preview rebuild fails stale when workspace identity, manifest hash, ledger high-water mark, backup manifest, projection readiness, or proposed repair action changes
- projection rebuild execution may write only expendable projection artifacts and maps workspace-ops artifact hashes to `agent.tool.completed`
- canonical ledger/blob repair descriptors fail with `data-loss-risk` until an append-only repair event service exists
- no descriptor can delete, rewrite, compact, reset, migrate, or silently modify canonical ledger/blob state

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- packages/agent/test/destructive-repair-adapter.test.ts
```

Expected: fail because `destructive-repair.ts` does not exist.

- [x] **Step 3: Implement projection rebuild descriptor**

Route `workspace.projection-rebuild.execute` through `rebuildProjectionReadiness()` and `rebuildProjection()`. Require readiness pass, exact projection name, exact rebuild ID, expendable artifact outputs, and prior-artifact preservation.

- [x] **Step 4: Implement blocked canonical repair descriptors**

Register canonical repair descriptors only as fail-closed descriptors that return `data-loss-risk` and allowed actions naming the missing append-only repair event service. Do not mutate canonical ledger or blob files.

- [x] **Step 5: Run destructive repair and workspace-ops tests**

Run:

```bash
npm test -- packages/agent/test/destructive-repair-adapter.test.ts packages/workspace-ops/test/projection-rebuild.test.ts packages/workspace-ops/test/ops.test.ts packages/workspace-ops/test/contracts.test.ts
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add packages/agent/src/adapters/destructive-repair.ts packages/agent/src/index.ts packages/agent/test/destructive-repair-adapter.test.ts
git commit -m "feat: add destructive repair execution adapters"
```

## Task 9: Adapter Registry Readiness And Cross-Family Verification

**Files:**
- Create: `packages/agent/src/domain-execution-adapter-registry.ts`
- Create: `packages/agent/test/domain-execution-adapter-registry.test.ts`
- Modify: `packages/agent/src/adapters/destructive-repair.ts`
- Modify: `packages/agent/src/adapters/legacy-staging.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/test/legacy-staging-adapter.test.ts`
- Modify: `docs/agentic/software-factory.md`
- Modify: `scripts/check-agent-readiness.mjs`
- Modify: this plan file with final readiness evidence.

**Interfaces:**
- Consumes: all adapter descriptors from Tasks 3 through 8.
- Produces: one exported registry helper for the scheduler to consume.

- [x] **Step 1: Write registry coverage tests**

Create `packages/agent/test/domain-execution-adapter-registry.test.ts` with tests that prove:

- every registered descriptor has a unique `toolId@toolVersion`
- every descriptor side-effect class matches its approval class
- every descriptor declares preview builder, current-preview rebuilder, stale checks, lock checks, provenance requirements, idempotency fields, result mapper, safe failure categories, target domain service, and forbidden effects
- no descriptor declares a forbidden effect that belongs to its own execution path
- provider, PRR, accepted graph, export/report, destructive repair, and legacy staging families are present as separate groups

- [x] **Step 2: Run cross-family tests**

Run:

```bash
npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/legacy-staging-adapter.test.ts packages/agent/test/accepted-graph-review-adapter.test.ts packages/agent/test/export-report-adapter.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/agent/test/destructive-repair-adapter.test.ts
```

Expected: pass.

- [x] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: pass with typecheck, tests, Vite build, and factory readiness.

- [x] **Step 4: Record readiness**

Append readiness evidence to `docs/agentic/software-factory.md`, add this plan to `scripts/check-agent-readiness.mjs`, and mark all completed checkboxes in this plan.

- [x] **Step 5: Commit**

```bash
git add packages/agent/src/index.ts packages/agent/test/domain-execution-adapter-registry.test.ts docs/agentic/software-factory.md scripts/check-agent-readiness.mjs docs/superpowers/plans/2026-07-09-resident-agent-domain-execution-adapters-implementation.md
git commit -m "docs: record resident agent domain adapter readiness"
```

### Task 9 Readiness Evidence

Task 9 completed the descriptor-discovery and cross-family verification slice
on 2026-07-09. The public agent package now exports one frozen, descriptor-only
registry containing 11 tools across the six required adapter families. Registry
construction validates the existing base descriptors but does not instantiate
provider, PRR, ontology, governance, workspace, or legacy adapter factories.

Recorded RED/GREEN verification:

```text
npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts
RED: Test Files 1 failed; Tests 3 failed
GREEN: Test Files 1 passed; Tests 3 passed
```

Recorded review-repair RED/GREEN verification:

```text
npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/legacy-staging-adapter.test.ts
RED: Test Files 2 failed; Tests 2 failed | 15 passed
GREEN: Test Files 2 passed; Tests 17 passed

npx vitest run packages/agent/test/legacy-staging-adapter.test.ts -t "reports active resident-agent locks"
Non-default resident identity RED: Test Files 1 failed; Tests 1 failed | 13 skipped

npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts
Canonical metadata RED: Test Files 1 failed; Tests no tests

npx vitest run packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/destructive-repair-adapter.test.ts
Canonical metadata GREEN: Test Files 2 passed; Tests 13 passed
```

Recorded cross-family verification:

```text
npm test -- packages/agent/test/domain-execution-adapter-registry.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/legacy-staging-adapter.test.ts packages/agent/test/accepted-graph-review-adapter.test.ts packages/agent/test/export-report-adapter.test.ts packages/agent/test/provider-byte-transfer-adapter.test.ts packages/agent/test/prr-correspondence-adapter.test.ts packages/agent/test/destructive-repair-adapter.test.ts
Test Files  8 passed (8)
Tests  88 passed (88)
```

Recorded available gates:

```text
npm run typecheck
typecheck passed

npm run ui:build
Vite build passed with the existing chunk-size warning

npm run verify
typecheck passed
Test Files  3 failed | 151 passed | 1 skipped (155)
Tests  19 failed | 1546 passed | 1 skipped (1566)
```

All 19 child full-suite failures were managed-sandbox restrictions: local HTTP
listeners returned `listen EPERM`, and executable tests could not create `tsx`
IPC pipes. The coordinator's unrestricted `npm run verify` passed with 154
passed / 1 skipped test files and 1565 passed / 1 skipped tests, followed by
the Vite production build and factory readiness check.

Closing repair-delta review verdict: **APPROVED**, with no remaining Critical
or Important findings. The review confirmed exact per-tool current-preview
rebuilder binding for canonical repair and non-default resident-agent lock
enforcement for legacy staging.

## Merge Order

1. Merge the scheduler/resumer descriptor/executor branch into `neo`.
2. Merge Task 1 so all later workers share descriptor contracts and failure categories.
3. Merge Task 2 so scheduler integration has one dispatcher boundary.
4. Merge Task 3 first among domain families because legacy staging is evidence-first and can only append `assertion.proposed`.
5. Merge Task 4 after Task 3 because accepted graph review is higher-risk and must prove domain review authority.
6. Merge Task 5 after accepted graph review because export/report must use governed plans and content hashes.
7. Merge Task 6 after provider execution ownership is clear in ingestion/runtime.
8. Merge Task 7 after PRR follow-up service support is present.
9. Merge Task 8 last among effect families because destructive/repair work has the highest data-loss blast radius.
10. Merge Task 9 as the final adapter registry/readiness gate after all selected families have landed.

## Acceptance Criteria

- Descriptor registry validates every adapter family independently and rejects mismatched side-effect/approval classes.
- Scheduler dispatcher never calls an adapter until approval is consumed and preview, source, lock, provenance, policy, projection, and secret-safety checks pass.
- Every adapter calls the authoritative domain service for its family.
- Every completion records exact domain event IDs, artifact hashes, read-model changes, and a secret-safe result summary.
- Every failure records a safe category, safe message, retryability, and explicit allowed repair actions.
- Provider byte-transfer previews include exact byte/provenance refs and no raw content.
- PRR send/follow-up execution uses PRR correspondence services and preserves legal escalation locks.
- Accepted graph review execution uses ontology review services and cannot promote memory or unproposed facts.
- Export/report execution uses governance export plans and human opt-ins for sensitive evidence.
- Destructive repair cannot mutate canonical state without an append-only repair event service and human gate.
- Legacy staging can append only evidence-tied `assertion.proposed` events and fails closed on report, candidate-set, or evidence hash drift.
- `npm run verify` passes before any completed task is merged.

## Stop Conditions

- Scheduler/resumer contract is absent from `neo`.
- A task requires a domain service that does not exist and cannot be represented as a fail-closed descriptor.
- Any adapter would append final domain events directly instead of calling the owning service.
- Any preview builder needs raw secrets, raw provider errors, raw private evidence bodies, raw prompt text, or unredacted correspondence bodies.
- Any stale-source check cannot bind exact content hashes, candidate-set hashes, body hashes, projection high-water marks, or policy versions.
- Any path can send PRR correspondence, transfer provider bytes, export material, clear legal/export/data-loss locks, repair canonical state, or accept graph truth from an agent actor or stale approval.
- Any verifier fails twice after focused repair attempts.
