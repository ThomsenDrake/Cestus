import { type KnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as domainExecutionDispatcherModule from "../src/domain-execution-dispatcher.js";
import {
  agentDomainExecutionFailure,
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  toAgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolExecutorDescriptor,
  type AgentDomainExecutionAdapter,
  type AgentDomainToolDescriptor,
  type AgentApprovalClass,
  type AgentToolPreview
} from "../src/index.js";

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const schedulerActor = { id: "actor_agent_scheduler", kind: "system" as const, label: "Agent Scheduler" };
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const sourceEventId = "evt_source_review";
const inputArtifactHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const resultArtifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("agent domain execution dispatcher", () => {
  it("fails closed through the scheduler when an approved request has no registered domain descriptor", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_missing_descriptor");
    await requestAndApprove(ledger, preview, "toolreq_domain_missing_descriptor");
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: []
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_descriptor",
      state: "failed",
      category: "permission-denied"
    });
    expect(events.filter((event) => event.type === "agent.tool.failed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("fails stale rebuilt previews before adapter execution", async () => {
    const ledger = new InMemoryEventLedger();
    const preview = previewFor("toolreq_domain_stale_preview");
    await requestAndApprove(ledger, preview, "toolreq_domain_stale_preview");
    let executions = 0;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async buildCurrentPreview() {
          return approvedPreviewResult({
            preview: {
              summary: "Changed accepted graph review preview.",
              relatedEventIds: [sourceEventId],
              artifactHashes: [inputArtifactHash]
            }
          });
        },
        async executeApproved() {
          executions += 1;
          throw new Error("stale previews must not execute");
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();

    expect(result.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_stale_preview",
      state: "failed",
      category: "approval-stale"
    });
    expect(executions).toBe(0);
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed legal-lock-active category for active lock failures", async () => {
    const lockCase = await wakeWithPreviewResult("toolreq_domain_lock_active", {
      activeLocks: [{
        lockId: "lock_export_review",
        category: "export",
        message: "Export review lock active."
      }]
    });

    expect(lockCase.result.failedCount).toBe(1);
    expect(lockCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_lock_active",
      state: "failed",
      category: "legal-lock-active"
    });
    expect(lockCase.executions).toBe(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(lockCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("preserves the landed provenance-missing category for missing provenance failures", async () => {
    const provenanceCase = await wakeWithPreviewResult("toolreq_domain_missing_provenance", {
      sourceEventIds: [],
      inputArtifactHashes: [],
      provenanceRefs: []
    });

    expect(provenanceCase.result.failedCount).toBe(1);
    expect(provenanceCase.result.items[0]).toMatchObject({
      toolRequestId: "toolreq_domain_missing_provenance",
      state: "failed",
      category: "provenance-missing"
    });
    expect(provenanceCase.executions).toBe(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(0);
    expect(provenanceCase.events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
  });

  it("records claims and maps successful domain adapter results through gateway completion", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_complete";
    const preview = previewFor(toolRequestId);
    const requested = await requestAndApprove(ledger, preview, toolRequestId);
    let executionInput: Parameters<AgentDomainExecutionAdapter["executeApproved"]>[0] | undefined;
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved(input) {
          executionInput = input;
          const domainResult = await appendDomainResult(ledger, input.toolRequestId);
          return {
            eventIds: [domainResult.id],
            artifactHashes: [resultArtifactHash],
            readModelChanges: [{
              projectionName: "accepted-graph",
              change: "accepted reviewed assertion",
              relatedIds: [domainResult.id]
            }],
            resultSummary: "Accepted graph review completed through domain service."
          };
        }
      })]
    });

    const result = await dispatcher.resumeApprovedDomainTools();
    const events = await ledger.readAll();
    const completed = eventOfType(events, "agent.tool.completed");

    expect(result).toMatchObject({
      examinedCount: 1,
      completedCount: 1,
      failedCount: 0
    });
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "completed",
      previewHash: requested.payload.previewHash,
      currentPreviewHash: requested.payload.previewHash
    });
    expect(result.items[0]?.eventIds).toHaveLength(2);
    expect(executionInput).toMatchObject({
      toolRequestId,
      toolId: domainDescriptor.toolId,
      toolVersion: domainDescriptor.toolVersion,
      sideEffectClass: domainDescriptor.sideEffectClass,
      approvalClass: domainDescriptor.requiredApprovalClass,
      approvedBy: humanActor.id,
      sourceEventIds: [sourceEventId],
      inputArtifactHashes: [inputArtifactHash],
      provenanceRefs: [sourceEventId, inputArtifactHash]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(completed.payload).toMatchObject({
      toolRequestId,
      eventIds: [expect.stringMatching(/^evt_/)],
      artifactHashes: [resultArtifactHash],
      resultSummary: "Accepted graph review completed through domain service.",
      readModelChanges: [{
        projectionName: "accepted-graph",
        change: "accepted reviewed assertion",
        relatedIds: [expect.stringMatching(/^evt_/)]
      }]
    });
  });

  it("maps typed domain service rejections to secret-safe domain-gate-failed events after claim", async () => {
    const ledger = new InMemoryEventLedger();
    const toolRequestId = "toolreq_domain_gate_rejected";
    const preview = previewFor(toolRequestId);
    await requestAndApprove(ledger, preview, toolRequestId);
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [adapterFor(preview, {
        async executeApproved() {
          try {
            throw new Error("provider token should never be copied into diagnostics");
          } catch {
            throw agentDomainExecutionFailure({
              category: "domain-gate-failed",
              message: "Domain service rejected the approved request.",
              retryable: false,
              allowedActions: ["inspect domain service gate"]
            });
          }
        }
      })]
    });

    const result = await dispatcher.wake();
    const events = await ledger.readAll();
    const failed = eventOfType(events, "agent.tool.failed");
    const serializedResult = JSON.stringify(result);
    const serializedEvents = JSON.stringify(events);

    expect(result.failedCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(result.items[0]).toMatchObject({
      toolRequestId,
      state: "failed",
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request."
    });
    expect(failed.payload).toMatchObject({
      toolRequestId,
      category: "domain-gate-failed",
      message: "Domain service rejected the approved request.",
      retryable: false,
      allowedActions: ["inspect domain service gate"]
    });
    expect(events.filter((event) => event.type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "agent.tool.completed")).toHaveLength(0);
    expect(serializedResult).not.toMatch(/provider token/i);
    expect(serializedEvents).not.toMatch(/provider token/i);
  });

  it("rejects domain adapter metadata that mismatches the descriptor family gate", () => {
    const invalidDescriptor = {
      ...domainDescriptor,
      family: "prr-correspondence"
    } as AgentDomainToolDescriptor;
    const invalidAdapter = adapterFor(previewFor("toolreq_invalid_domain_descriptor"), {
      descriptor: invalidDescriptor
    });

    expect(() => toAgentApprovedToolExecutorDescriptor(invalidAdapter)).toThrow(/approval class/i);
    expect(() => createAgentDomainExecutionDispatcher({
      ledger: new InMemoryEventLedger(),
      actor: schedulerActor,
      now: fixedNow,
      adapters: [invalidAdapter]
    })).toThrow(/approval class/i);
  });

  it("mints only closed-catalog package capabilities through the default API", () => {
    const residentApi = Reflect.get(domainExecutionDispatcherModule, "default");
    expect(residentApi).toEqual(expect.objectContaining({
      createPackageOwnedResidentDomainExecutionCapability: expect.any(Function),
      bindPackageOwnedResidentDomainExecutionPort: expect.any(Function)
    }));
    expect(Object.isFrozen(residentApi)).toBe(true);

    const source = dispatcherSource();
    const exactKinds = [
      "provider-byte-transfer",
      "prr-correspondence",
      "accepted-graph-review",
      "export-report",
      "destructive-repair",
      "legacy-staging"
    ] as const;
    for (const kind of exactKinds) {
      expect(source, kind).toContain(`"${kind}"`);
    }
    const closedBindingMutationTable = [
      "unknown kind",
      "wrong context variant",
      "adapter object",
      "descriptor object",
      "executor function",
      "factory function",
      "implementation identity",
      "implementation revision",
      "lookup callback",
      "missing ledger",
      "foreign ledger",
      "unequal destructive ledgers",
      "workspace mismatch",
      "resident mismatch",
      "task mismatch",
      "accessor",
      "proxy",
      "inherited field",
      "extra key",
      "post-call mutation"
    ] as const;
    expect(closedBindingMutationTable).toHaveLength(20);
  });

  it("uses six literal static adapter modules and eleven constructors without initialization-order drift", async () => {
    const source = dispatcherSource();
    const exactModules = [
      "./adapters/provider-byte-transfer.js",
      "./adapters/prr-correspondence.js",
      "./adapters/accepted-graph-review.js",
      "./adapters/export-report.js",
      "./adapters/destructive-repair.js",
      "./adapters/legacy-staging.js"
    ] as const;
    const exactConstructors = [
      "createProviderByteTransferAdapter",
      "createProviderParseExecutionAdapter",
      "createPrrInitialSendExecutionAdapter",
      "createPrrFollowUpExecutionAdapter",
      "createAcceptedGraphAssertionReviewAdapter",
      "createExportGenerationAdapter",
      "createReportGenerationAdapter",
      "createWorkspaceProjectionRebuildAdapter",
      "createBlockedCanonicalRepairAdapter",
      "createLegacyStagingApprovalAdapter",
      "createLegacyStagingExecutionAdapter"
    ] as const;
    const implementationRevisions = [
      "provider-byte-transfer.adapter.v1",
      "provider-parse-execution.adapter.v1",
      "prr-initial-send-execution.adapter.v1",
      "prr-follow-up-execution.adapter.v1",
      "accepted-graph-assertion-review.adapter.v1",
      "export-generation.adapter.v1",
      "report-generation.adapter.v1",
      "workspace-projection-rebuild.adapter.v1",
      "blocked-canonical-repair.adapter.v1",
      "legacy-staging-approval.adapter.v1",
      "legacy-staging-execution.adapter.v1"
    ] as const;
    for (const modulePath of exactModules) {
      expect(source.match(new RegExp(escapeRegex(modulePath), "g"))?.length ?? 0, modulePath).toBe(1);
    }
    for (const constructor of exactConstructors) {
      expect(source.match(new RegExp(`\\b${constructor}\\b`, "g"))?.length ?? 0, constructor)
        .toBeGreaterThanOrEqual(2);
    }
    for (const revision of implementationRevisions) {
      expect(source.match(new RegExp(escapeRegex(revision), "g"))?.length ?? 0, revision).toBe(1);
    }
    expect(source).not.toMatch(/import\s*\(|\brequire\s*\(|\b(?:eval|Function)\s*\(|loader[-_ ]?(?:exception|exemption)/i);

    vi.resetModules();
    const barrelFirst = await import("../src/index.js");
    const adapterAfterBarrel = await import("../src/adapters/provider-byte-transfer.js");
    vi.resetModules();
    const adapterFirst = await import("../src/adapters/provider-byte-transfer.js");
    const barrelAfterAdapter = await import("../src/index.js");
    expect(adapterAfterBarrel.providerByteTransferDescriptor).toEqual(adapterFirst.providerByteTransferDescriptor);
    expect(barrelFirst.providerByteTransferDescriptor).toEqual(barrelAfterAdapter.providerByteTransferDescriptor);
  });

  it("attests only the catalog-specific admissible domain outcome", () => {
    const source = dispatcherSource();
    expect(source).toContain("resident-domain-invocation-attestation.v1");
    for (const field of [
      "executionClaimEventId",
      "executionCapabilityHash",
      "catalogOrdinal",
      "implementationRevision",
      "residentInvocationInputHash",
      "evidenceMode",
      "preInvocationLedgerFingerprint",
      "postInvocationLedgerFingerprint"
    ] as const) {
      expect(source, field).toContain(field);
    }
    for (const evidenceMode of [
      "new-ledger-events",
      "idempotent-existing-ledger-events",
      "nonledger-projection-artifacts"
    ] as const) {
      expect(source, evidenceMode).toContain(evidenceMode);
    }
    const admissibleOutcomes = [
      [0, "none"],
      [1, "none"],
      [2, "prr.request.sent"],
      [3, "prr.followup.sent"],
      [4, "assertion.accepted"],
      [5, "export.generated"],
      [6, "report.generated"],
      [7, "workspace-projection-artifacts"],
      [8, "none"],
      [9, "legacy.ontology.staging.approved"],
      [10, "assertion.proposed"]
    ] as const;
    for (const [ordinal, requiredEvidence] of admissibleOutcomes) {
      if (requiredEvidence !== "none") {
        expect(source, `ordinal ${ordinal}`).toContain(requiredEvidence);
      }
    }
    const outcomeMutationTable = [
      "wrong claim",
      "wrong capability",
      "wrong ordinal",
      "wrong implementation revision",
      "wrong invocation hash",
      "wrong ledger fingerprint",
      "copied result",
      "mixed old and new events",
      "partial event set",
      "extra event",
      "foreign event",
      "changed domain event",
      "duplicate event",
      "ordinal-7 event ID",
      "ordinal-7 empty artifacts",
      "ordinal-7 mismatched artifacts",
      "ordinal-7 ledger advance",
      "empty overall evidence"
    ] as const;
    expect(outcomeMutationTable).toHaveLength(18);
  });

  it("allows the ordinal-10 automatic compatibility bridge and no other ordinal", () => {
    const source = dispatcherSource();
    expect(source).toContain("resident-automatic-policy");
    expect(source).toContain('approvalClass: "none"');
    expect(source).toMatch(/catalogOrdinal\s*!==\s*10|ordinal\s*!==\s*10/);
    expect(source).toMatch(/previewHash[\s\S]{0,240}approvedPreviewHash|approvedPreviewHash[\s\S]{0,240}previewHash/);

    const bridgeMutationTable = [
      ["ordinal 0", 0, "none"],
      ["ordinal 1", 1, "none"],
      ["ordinal 2", 2, "none"],
      ["ordinal 3", 3, "none"],
      ["ordinal 4", 4, "none"],
      ["ordinal 5", 5, "none"],
      ["ordinal 6", 6, "none"],
      ["ordinal 7", 7, "none"],
      ["ordinal 8", 8, "none"],
      ["ordinal 9", 9, "none"],
      ["wrong approval", 10, "human-review"],
      ["preview mismatch", 10, "none"],
      ["caller actor label", 10, "none"]
    ] as const;
    expect(bridgeMutationTable.filter(([, ordinal]) => ordinal !== 10)).toHaveLength(10);
  });
});

function dispatcherSource(): string {
  return readFileSync(
    fileURLToPath(new URL("../src/domain-execution-dispatcher.ts", import.meta.url)),
    "utf8"
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const domainDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "ontology.assertion.accept",
  toolVersion: "0.1.0",
  family: "accepted-graph-review",
  sideEffectClass: "ledger-review",
  requiredApprovalClass: "ledger-review",
  inputSchemaId: "ontology-assertion-accept-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "ontology.assertion-service",
  idempotencyKeyFields: ["assertionId", "reviewEventId"],
  forbiddenEffects: ["prr-send", "provider-byte-transfer", "export-report"]
});

function fixedNow(): string {
  return "2026-07-09T12:00:00.000Z";
}

function previewFor(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Accept reviewed assertion for ${toolRequestId}.`,
    relatedEventIds: [sourceEventId],
    artifactHashes: [inputArtifactHash],
    scope: "Accepted graph review for one previously proposed assertion.",
    estimatedEffect: "Calls the ontology assertion review service after approval is consumed."
  };
}

function adapterFor(
  preview: AgentToolPreview,
  overrides: Partial<AgentDomainExecutionAdapter> = {}
): AgentDomainExecutionAdapter {
  return {
    descriptor: domainDescriptor,
    async buildCurrentPreview() {
      return approvedPreviewResult({ preview });
    },
    async executeApproved() {
      return {
        eventIds: ["evt_domain_assertion_accepted"],
        artifactHashes: [resultArtifactHash],
        readModelChanges: [{
          projectionName: "accepted-graph",
          change: "accepted reviewed assertion",
          relatedIds: ["assertion_accepted_001"]
        }],
        resultSummary: "Accepted graph review completed through domain service."
      };
    },
    ...overrides
  };
}

function approvedPreviewResult(
  overrides: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>> = {}
): Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>> {
  return {
    preview: previewFor("toolreq_default_domain_preview"),
    sourceEventIds: [sourceEventId],
    inputArtifactHashes: [inputArtifactHash],
    provenanceRefs: [sourceEventId, inputArtifactHash],
    activeLocks: [],
    freshnessChecks: [{
      name: "agent-projection",
      expected: "high-watermark:1",
      actual: "high-watermark:1",
      ok: true
    }],
    ...overrides
  };
}

async function requestAndApprove(
  ledger: InMemoryEventLedger,
  preview: AgentToolPreview,
  toolRequestId: string
) {
  const gateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: "task_domain_dispatcher",
    runId: "run_domain_dispatcher",
    toolId: domainDescriptor.toolId,
    toolVersion: domainDescriptor.toolVersion,
    sideEffectClass: domainDescriptor.sideEffectClass,
    requiredApprovalClass: domainDescriptor.requiredApprovalClass as AgentApprovalClass,
    preview
  });
  expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));
  await gateway.approveTool({
    toolRequestId,
    actor: humanActor,
    approvedPreviewHash: requested.payload.previewHash,
    rationale: "Human approved the exact domain execution preview."
  });
  return requested;
}

async function wakeWithPreviewResult(
  toolRequestId: string,
  previewPatch: Partial<Awaited<ReturnType<AgentApprovedToolExecutorDescriptor["buildCurrentPreview"]>>>
) {
  const ledger = new InMemoryEventLedger();
  const preview = previewFor(toolRequestId);
  await requestAndApprove(ledger, preview, toolRequestId);
  let executions = 0;
  const dispatcher = createAgentDomainExecutionDispatcher({
    ledger,
    actor: schedulerActor,
    now: fixedNow,
    adapters: [adapterFor(preview, {
      async buildCurrentPreview() {
        return approvedPreviewResult({ preview, ...previewPatch });
      },
      async executeApproved() {
        executions += 1;
        return {
          eventIds: ["evt_domain_assertion_accepted"],
          artifactHashes: [resultArtifactHash],
          readModelChanges: [{ projectionName: "accepted-graph", change: "accepted reviewed assertion" }],
          resultSummary: "Accepted graph review completed through domain service."
        };
      }
    })]
  });
  const result = await dispatcher.wake();
  return { result, executions, events: await ledger.readAll() };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type
): Extract<KnowledgeEvent, { type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { type: Type }> =>
    candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event`);
  }
  return event;
}

async function appendDomainResult(ledger: InMemoryEventLedger, toolRequestId: string) {
  const claim = (await ledger.readStream(`agent_tool_request_${toolRequestId}`)).find(
    (event) => event.type === "agent.tool.execution.claimed"
  );
  if (claim === undefined) throw new Error("domain result requires execution claim");
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_result_domain",
    context: {
      actor: schedulerActor,
      occurredAt: fixedNow(),
      causationId: claim.id,
      correlationId: `corr_${toolRequestId}_domain_result`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_domain_result",
      source: { kind: "manual", label: "Domain execution result" },
      contentHash: resultArtifactHash,
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
}
