import { describe, expect, it, vi } from "vitest";
import type {
  ActorRef,
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import {
  type AppendOptions,
  type EventLedger,
  InMemoryEventLedger
} from "../../ontology/src/event-ledger.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import type { GovernanceTag } from "../../ontology/src/governance-policy.js";
import { goldenGovernanceLedgerEvents } from "../../ontology/test/fixtures/golden-governance-ledger.js";
import {
  buildExportReportApprovalPreview,
  createExportGenerationAdapter,
  createReportGenerationAdapter,
  exportGenerateDescriptor,
  exportReportDescriptors,
  rebuildExportReportCurrentPreview,
  reportGenerateDescriptor,
  type ExportReportAdapterContext
} from "../src/adapters/export-report.js";
import {
  createAgentDomainExecutionDispatcher,
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutionInput
} from "../src/index.js";

const reviewer = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const agentActor = { id: "actor_export_agent", kind: "agent" as const, label: "Export agent" };
const schedulerActor = { id: "actor_scheduler", kind: "system" as const, label: "Scheduler" };
const policy = { policyId: "gov_policy_default", version: "0.2.0" } as const;
const publicHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const privateHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
const outputHash = "sha256:9999999999999999999999999999999999999999999999999999999999999999" as const;
const changedHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const publicEvidenceId = "ev_source_public";
const publicEvidenceEventId = "evt_ingest_governance_public";
const publicCausationId = "evt_review_governance_public";
const policyEventId = "evt_install_governance_policy_low_threshold";

describe("export and report execution adapters", () => {
  it("publishes only canonical governed generation descriptors", () => {
    expect(exportReportDescriptors).toEqual([exportGenerateDescriptor, reportGenerateDescriptor]);
    expect(exportGenerateDescriptor).toMatchObject({
      toolId: "governance.export.generate",
      toolVersion: "0.1.0",
      family: "export-report",
      sideEffectClass: "export-or-publication",
      requiredApprovalClass: "export-or-publication",
      targetDomainService: "GovernanceService.recordExportGenerated"
    });
    expect(reportGenerateDescriptor).toMatchObject({
      toolId: "governance.report.generate",
      toolVersion: "0.1.0",
      family: "export-report",
      sideEffectClass: "export-or-publication",
      requiredApprovalClass: "export-or-publication",
      targetDomainService: "GovernanceService.recordReportGenerated"
    });
    expect(exportReportDescriptors.flatMap((descriptor) => descriptor.forbiddenEffects)).toEqual(
      expect.arrayContaining(["publish-artifact-bytes", "transfer-artifact-bytes", "bypass-sensitive-opt-in"])
    );
  });

  it("builds a public-safe preview with exact plan, evidence, policy, artifact, and consequence bindings", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const preview = current.preview as Record<string, unknown>;

    expect(preview).toMatchObject({
      toolId: exportGenerateDescriptor.toolId,
      toolVersion: exportGenerateDescriptor.toolVersion,
      artifactKind: "export",
      artifactId: "exp_resident_public_001",
      outputArtifactHash: outputHash,
      requestedEvidenceIds: [publicEvidenceId],
      includedEvidenceIds: [publicEvidenceId],
      includedContentHashes: [publicHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true,
      governancePolicyVersion: policy.version,
      causationEventId: publicCausationId,
      consequence: expect.stringMatching(/record.*export\.generated.*does not publish or transfer/i)
    });
    expect(preview.governedPlan).toEqual({ includedEvidenceIds: [publicEvidenceId], blockedEvidence: [] });
    expect(preview.evidenceBindings).toEqual([{
      evidenceId: publicEvidenceId,
      evidenceEventId: publicEvidenceEventId,
      contentHash: publicHash,
      governanceEventIds: ["evt_classify_governance_public", publicCausationId]
    }]);
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "evidence", id: publicEvidenceId, hash: publicHash }),
      expect.objectContaining({ kind: "governance-policy", id: policy.policyId, version: policy.version }),
      expect.objectContaining({ kind: "output-artifact", id: "exp_resident_public_001", hash: outputHash })
    ]));
    expect(current.sourceEventIds).toEqual(expect.arrayContaining([
      publicEvidenceEventId,
      "evt_classify_governance_public",
      publicCausationId,
      policyEventId
    ]));
    expect(current.inputArtifactHashes).toEqual([publicHash, outputHash]);
    expect(current.provenanceRefs).toEqual(expect.arrayContaining([
      publicEvidenceId,
      publicEvidenceEventId,
      publicHash,
      publicCausationId,
      policyEventId,
      outputHash
    ]));
  });

  it("shows explicit sensitive opt-ins and excluded categories in the approved consequence", async () => {
    const prepared = preparePrivateReport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const preview = current.preview as Record<string, unknown>;

    expect(preview).toMatchObject({
      artifactKind: "report",
      artifactId: "report_resident_private_001",
      includedEvidenceIds: ["ev_source_private"],
      includedContentHashes: [privateHash],
      defaultPublicSafeOnly: false,
      sensitiveOptIns: [
        expect.objectContaining({ tag: "contains_pii", approvedBy: reviewer.id }),
        expect.objectContaining({ tag: "private_correspondence", approvedBy: reviewer.id })
      ],
      consequence: expect.stringMatching(/contains_pii.*private_correspondence.*report\.generated.*does not publish or transfer/i)
    });

    const publicPrepared = preparePublicExport({ requestedEvidenceIds: [publicEvidenceId, "ev_source_private"] });
    const publicCurrent = await rebuildExportReportCurrentPreview(rebuildInput(publicPrepared.context));
    expect(publicCurrent.preview).toMatchObject({
      excludedRestrictedCategories: ["quarantined"],
      governedPlan: {
        includedEvidenceIds: [publicEvidenceId],
        blockedEvidence: [{ evidenceId: "ev_source_private", requiredOptInTags: [] }]
      }
    });
  });

  it("rejects unknown, swapped, missing, or forged public preview bindings", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const input = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>);

    expect(() => buildExportReportApprovalPreview({ ...input, toolId: "governance.export.publish" } as never))
      .toThrow(/canonical export or report descriptor/i);
    expect(() => buildExportReportApprovalPreview({ ...input, toolVersion: "9.9.9" } as never))
      .toThrow(/canonical export or report descriptor/i);
    expect(() => buildExportReportApprovalPreview({ ...input, artifactId: "report_swapped" } as never))
      .toThrow(/artifact id/i);
    expect(() => buildExportReportApprovalPreview({ ...input, outputArtifactHash: "sha256:forged" } as never))
      .toThrow(/sha-256 hash/i);
    expect(() => buildExportReportApprovalPreview({ ...input, includedContentHashes: [changedHash] } as never))
      .toThrow(/content hash/i);
    expect(() => buildExportReportApprovalPreview({
      ...input,
      governedPlan: { includedEvidenceIds: [], blockedEvidence: [] }
    } as never)).toThrow(/governed plan/i);
    expect(() => buildExportReportApprovalPreview({ ...input, causationEventId: "evt_forged" } as never))
      .toThrow(/causation event/i);
    const { artifactId: _artifactId, ...missingArtifactId } = input;
    expect(() => buildExportReportApprovalPreview(missingArtifactId as never)).toThrow(/missing artifactId/i);
  });

  it("rejects hostile preview DTO shapes without invoking getters", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const input = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>) as unknown as Record<PropertyKey, unknown>;
    let getterCalls = 0;
    Object.defineProperty(input, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("preview getter invoked");
      }
    });
    Object.defineProperty(input, Symbol("shadow"), {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("preview symbol getter invoked");
      }
    });

    expect(() => buildExportReportApprovalPreview(input as never)).toThrow(/symbol-keyed|unsupported|data properties/i);
    expect(getterCalls).toBe(0);

    const nested = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>) as unknown as Record<string, unknown>;
    const evidenceBindings = [...(nested.evidenceBindings as unknown[])] as unknown[] & { shadow?: unknown };
    Object.defineProperty(evidenceBindings, "shadow", { enumerable: true, value: "forged" });
    Object.defineProperty(nested, "evidenceBindings", { enumerable: true, configurable: true, value: evidenceBindings });
    expect(() => buildExportReportApprovalPreview(nested as never)).toThrow(/custom array fields/i);
  });

  it("rebuilds current state and reports stale evidence, policy, quarantine, and plan changes", async () => {
    const prepared = preparePublicExport();
    prepared.ledger.addSeeded(changedEvidenceEvent());
    const evidenceChanged = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    expect(evidenceChanged.freshnessChecks).toContainEqual({
      name: "included-content-hashes",
      expected: JSON.stringify([publicHash]),
      actual: JSON.stringify([changedHash]),
      ok: false
    });

    const policyPrepared = preparePublicExport();
    policyPrepared.ledger.addSeeded(changedPolicyEvent());
    const policyChanged = await rebuildExportReportCurrentPreview(rebuildInput(policyPrepared.context));
    expect(policyChanged.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "governance-policy",
      expected: `${policy.policyId}@${policy.version}`,
      actual: `${policy.policyId}@0.3.0`,
      ok: false
    }));

    const quarantined = preparePublicExport();
    quarantined.ledger.addSeeded(publicQuarantineEvent());
    const planChanged = await rebuildExportReportCurrentPreview(rebuildInput(quarantined.context));
    expect(planChanged.preview).toMatchObject({
      governedPlan: { includedEvidenceIds: [], blockedEvidence: [{ evidenceId: publicEvidenceId, requiredOptInTags: [] }] }
    });
    expect(planChanged.freshnessChecks).toContainEqual(expect.objectContaining({
      name: "governed-plan",
      ok: false
    }));
  });

  it("fails closed instead of fabricating provenance when no installed governance policy event exists", async () => {
    const prepared = prepare({
      toolId: exportGenerateDescriptor.toolId,
      artifactKind: "export",
      artifactId: "exp_resident_missing_policy_001",
      requestedEvidenceIds: [publicEvidenceId],
      includedEvidenceIds: [publicEvidenceId],
      includedContentHashes: [publicHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true,
      causationEventId: publicCausationId,
      seededEvents: goldenGovernanceLedgerEvents.filter((event) => event.type !== "governance.policy.installed")
    });

    await expect(rebuildExportReportCurrentPreview(rebuildInput(prepared.context)))
      .rejects.toMatchObject({ category: "approval-stale" });
  });

  it("changes the current preview hash when sensitive opt-ins or output artifact binding changes", async () => {
    const prepared = preparePublicExport();
    const approved = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const withOptIn = await rebuildExportReportCurrentPreview(rebuildInput({
      ...prepared.context,
      sensitiveOptIns: [{
        tag: "contains_pii",
        approvedBy: reviewer.id,
        rationale: "Explicit private generation review."
      }],
      defaultPublicSafeOnly: false
    }));
    const withArtifact = await rebuildExportReportCurrentPreview(rebuildInput({
      ...prepared.context,
      outputArtifactHash: changedHash
    }));

    expect(hashAgentToolPreview(withOptIn.preview)).not.toBe(hashAgentToolPreview(approved.preview));
    expect(hashAgentToolPreview(withArtifact.preview)).not.toBe(hashAgentToolPreview(approved.preview));
  });

  it("reports and enforces active resident-agent locks at consume time", async () => {
    const prepared = preparePublicExport();
    const approved = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    prepared.ledger.addSeeded(agentLockEvent());
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    expect(current.activeLocks).toEqual([{
      lockId: "lock_export_governance",
      category: "governance",
      message: "Export governance review is active."
    }]);

    await expect(createExportGenerationAdapter(prepared.context).executeApproved(
      executionInput(prepared.context, approved)
    )).rejects.toMatchObject({ category: "lock-active" });
    expect((await prepared.ledger.readAll()).filter((event) => event.type === "export.generated")).toHaveLength(0);
  });

  it("calls only the authoritative governance method and maps its exact event and artifact hash", async () => {
    const prepared = preparePublicExport();
    const recordExport = vi.spyOn(prepared.service, "recordExportGenerated");
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const result = await createExportGenerationAdapter(prepared.context).executeApproved(
      executionInput(prepared.context, current)
    );
    const event = eventOfType(await prepared.ledger.readAll(), "export.generated");

    expect(recordExport).toHaveBeenCalledOnce();
    expect(recordExport).toHaveBeenCalledWith({
      exportId: "exp_resident_public_001",
      policy,
      includedEvidenceIds: [publicEvidenceId],
      includedContentHashes: [publicHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true,
      causationId: publicCausationId
    });
    expect(result).toEqual({
      eventIds: [event.id],
      artifactHashes: [outputHash],
      readModelChanges: [{
        projectionName: "governance-generated-artifacts",
        change: "recorded generated export exp_resident_public_001",
        relatedIds: ["exp_resident_public_001", publicEvidenceId]
      }],
      resultSummary: "Governance recorded the approved export generation without publishing or transferring artifact bytes."
    });
  });

  it("rejects unattested or extra domain events instead of mapping shaped service output", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const serviceLedger = new SeededLedger(goldenGovernanceLedgerEvents);
    const service = new GovernanceService({ ledger: serviceLedger, actor: reviewer });
    const unattested = await service.recordExportGenerated({
      exportId: prepared.context.artifactId,
      policy,
      includedEvidenceIds: [publicEvidenceId],
      includedContentHashes: [publicHash],
      sensitiveOptIns: [],
      defaultPublicSafeOnly: true,
      causationId: publicCausationId
    });
    const fakeService = {
      recordExportGenerated: vi.fn(async () => unattested),
      recordReportGenerated: vi.fn(async () => {
        throw new Error("wrong method");
      })
    };

    await expect(createExportGenerationAdapter({
      ...prepared.context,
      governanceService: fakeService
    }).executeApproved(executionInput(prepared.context, current))).rejects.toMatchObject({
      category: "domain-gate-failed"
    });

    const extraPrepared = preparePublicExport();
    const extraCurrent = await rebuildExportReportCurrentPreview(rebuildInput(extraPrepared.context));
    const extraService = {
      recordExportGenerated: vi.fn(async (input: Parameters<GovernanceService["recordExportGenerated"]>[0]) => {
        const generated = await extraPrepared.service.recordExportGenerated(input);
        await extraPrepared.ledger.append({
          type: "incident.recorded",
          version: 1,
          streamId: "incident_incident_export_adapter_extra",
          context: {
            actor: reviewer,
            occurredAt: fixedNow(),
            causationId: generated.id,
            correlationId: "corr_incident_export_adapter_extra",
            coreVersion: "0.1.0",
            packVersions: { core: "0.1.0" }
          },
          payload: {
            incidentId: "incident_export_adapter_extra",
            severity: "warning",
            category: "export",
            recordedBy: reviewer.id,
            summary: "Unexpected extra event emitted during governed export generation.",
            relatedEvidenceIds: [publicEvidenceId],
            relatedEventIds: [generated.id]
          }
        });
        return generated;
      }),
      recordReportGenerated: vi.fn(async () => {
        throw new Error("wrong method");
      })
    };

    await expect(createExportGenerationAdapter({
      ...extraPrepared.context,
      governanceService: extraService
    }).executeApproved(executionInput(extraPrepared.context, extraCurrent))).rejects.toMatchObject({
      category: "domain-gate-failed"
    });
  });

  it("records a sensitive report only for the human service actor named by approval", async () => {
    const prepared = preparePrivateReport();
    const recordReport = vi.spyOn(prepared.service, "recordReportGenerated");
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const valid = executionInput(prepared.context, current);

    await expect(createReportGenerationAdapter(prepared.context).executeApproved({
      ...valid,
      approvedBy: "actor_other_reviewer"
    })).rejects.toMatchObject({ category: "permission-denied" });
    const result = await createReportGenerationAdapter(prepared.context).executeApproved(valid);

    expect(recordReport).toHaveBeenCalledOnce();
    expect(result.artifactHashes).toEqual([outputHash]);
    expect(eventOfType(await prepared.ledger.readAll(), "report.generated").payload.sensitiveOptIns)
      .toEqual(prepared.context.sensitiveOptIns);
  });

  it("rejects forged approved execution evidence and hostile fields without invoking getters", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const adapter = createExportGenerationAdapter(prepared.context);
    const valid = executionInput(prepared.context, current);

    await expect(adapter.executeApproved({ ...valid, approvedPreviewHash: changedHash }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, sourceEventIds: [publicEvidenceEventId] }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, inputArtifactHashes: [outputHash] }))
      .rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({ ...valid, provenanceRefs: [publicEvidenceId] }))
      .rejects.toMatchObject({ category: "provenance-missing" });

    let getterCalls = 0;
    const hostile = { ...valid } as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("execution getter invoked");
      }
    });
    await expect(adapter.executeApproved(hostile as never)).rejects.toBeDefined();
    expect(getterCalls).toBe(0);
  });

  it("fails secret-bearing opt-in copy closed before it reaches previews or failure events", async () => {
    const prepared = preparePrivateReport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const input = previewInputFromCurrent(prepared.context, current.preview as Record<string, unknown>);
    expect(() => buildExportReportApprovalPreview({
      ...input,
      sensitiveOptIns: prepared.context.sensitiveOptIns.map((optIn, index) => index === 0
        ? { ...optIn, rationale: "Approved with access_token=abc123" }
        : optIn)
    } as never)).toThrow(/secret/i);
  });

  it("is idempotent for repeated and concurrent approved retries", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const adapter = createExportGenerationAdapter(prepared.context);
    const input = executionInput(prepared.context, current);
    const [first, concurrent] = await Promise.all([adapter.executeApproved(input), adapter.executeApproved(input)]);
    const repeated = await adapter.executeApproved(input);
    const events = (await prepared.ledger.readAll()).filter((event) => event.type === "export.generated");

    expect(concurrent.eventIds).toEqual(first.eventIds);
    expect(repeated.eventIds).toEqual(first.eventIds);
    expect(events).toHaveLength(1);
  });

  it("completes through the scheduler and gateway with exact append-only evidence", async () => {
    const prepared = preparePublicExport();
    const current = await rebuildExportReportCurrentPreview(rebuildInput(prepared.context));
    const gateway = createAgentToolGateway({ ledger: prepared.ledger, actor: agentActor, now: fixedNow });
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_export_public_001",
      residentAgentId: "agent_default",
      taskId: "task_export_public_001",
      runId: "run_export_public_001",
      toolId: exportGenerateDescriptor.toolId,
      toolVersion: exportGenerateDescriptor.toolVersion,
      sideEffectClass: exportGenerateDescriptor.sideEffectClass,
      requiredApprovalClass: "export-or-publication",
      preview: current.preview
    });
    await gateway.approveTool({
      toolRequestId: requested.payload.toolRequestId,
      approvedPreviewHash: requested.payload.previewHash,
      actor: reviewer,
      rationale: "Approve the exact governed public-safe export generation record."
    });
    const dispatcher = createAgentDomainExecutionDispatcher({
      ledger: prepared.ledger,
      actor: schedulerActor,
      now: fixedNow,
      adapters: [createExportGenerationAdapter(prepared.context)]
    });

    const result = await dispatcher.wake();
    const events = await prepared.ledger.readAll();
    const generated = eventOfType(events, "export.generated");
    const completed = eventOfType(events, "agent.tool.completed");
    expect(result).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(completed.payload.eventIds).toEqual([generated.id]);
    expect(completed.payload.artifactHashes).toEqual([outputHash]);
  });

  it("fails production adapter construction without a ledger, governance service, or human actor", () => {
    const prepared = preparePublicExport();
    expect(() => createExportGenerationAdapter({ ...prepared.context, ledger: undefined } as never)).toThrow(/ledger/i);
    expect(() => createExportGenerationAdapter({ ...prepared.context, governanceService: undefined } as never))
      .toThrow(/governance service/i);
    expect(() => createExportGenerationAdapter({
      ...prepared.context,
      actor: agentActor
    } as never)).toThrow(/human governance actor/i);
    expect(() => createExportGenerationAdapter({
      ...prepared.context,
      artifactWriter: { write() {} }
    } as never)).toThrow(/unsupported/i);
  });
});

class SeededLedger implements EventLedger {
  private readonly appended = new InMemoryEventLedger();
  private readonly seeded: KnowledgeEvent[];

  constructor(events: readonly KnowledgeEvent[]) {
    this.seeded = structuredClone([...events]);
  }

  addSeeded(event: KnowledgeEvent): void {
    this.seeded.push(structuredClone(event));
  }

  append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    return this.appended.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return [
      ...structuredClone(this.seeded.filter((event) => event.streamId === streamId)),
      ...await this.appended.readStream(streamId)
    ];
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return [...structuredClone(this.seeded), ...await this.appended.readAll()];
  }
}

interface Prepared {
  readonly ledger: SeededLedger;
  readonly service: GovernanceService;
  readonly context: ExportReportAdapterContext;
}

function preparePublicExport(
  overrides: Partial<Pick<ExportReportAdapterContext, "requestedEvidenceIds">> = {}
): Prepared {
  return prepare({
    toolId: exportGenerateDescriptor.toolId,
    artifactKind: "export",
    artifactId: "exp_resident_public_001",
    requestedEvidenceIds: overrides.requestedEvidenceIds ?? [publicEvidenceId],
    includedEvidenceIds: [publicEvidenceId],
    includedContentHashes: [publicHash],
    sensitiveOptIns: [],
    defaultPublicSafeOnly: true,
    causationEventId: publicCausationId,
    seededEvents: goldenGovernanceLedgerEvents
  });
}

function preparePrivateReport(): Prepared {
  return prepare({
    toolId: reportGenerateDescriptor.toolId,
    artifactKind: "report",
    artifactId: "report_resident_private_001",
    requestedEvidenceIds: ["ev_source_private"],
    includedEvidenceIds: ["ev_source_private"],
    includedContentHashes: [privateHash],
    sensitiveOptIns: [
      { tag: "contains_pii", approvedBy: reviewer.id, rationale: "Included for private attorney review." },
      { tag: "private_correspondence", approvedBy: reviewer.id, rationale: "Included for non-public source review." }
    ],
    defaultPublicSafeOnly: false,
    causationEventId: "evt_classify_governance_private",
    seededEvents: goldenGovernanceLedgerEvents.filter((event) => event.id !== "evt_quarantine_governance_private")
  });
}

function prepare(input: {
  readonly toolId: string;
  readonly artifactKind: "export" | "report";
  readonly artifactId: string;
  readonly requestedEvidenceIds: readonly string[];
  readonly includedEvidenceIds: readonly string[];
  readonly includedContentHashes: readonly `sha256:${string}`[];
  readonly sensitiveOptIns: readonly { tag: GovernanceTag; approvedBy: string; rationale: string }[];
  readonly defaultPublicSafeOnly: boolean;
  readonly causationEventId: string;
  readonly seededEvents: readonly KnowledgeEvent[];
}): Prepared {
  const ledger = new SeededLedger(input.seededEvents);
  const service = new GovernanceService({ ledger, actor: reviewer });
  return {
    ledger,
    service,
    context: {
      ledger,
      governanceService: service,
      actor: reviewer,
      residentAgentId: "agent_default",
      taskId: input.artifactKind === "export" ? "task_export_public_001" : "task_report_private_001",
      toolId: input.toolId,
      artifactKind: input.artifactKind,
      artifactId: input.artifactId,
      requestedEvidenceIds: input.requestedEvidenceIds,
      includedEvidenceIds: input.includedEvidenceIds,
      includedContentHashes: input.includedContentHashes,
      sensitiveOptIns: input.sensitiveOptIns,
      defaultPublicSafeOnly: input.defaultPublicSafeOnly,
      policy,
      causationEventId: input.causationEventId,
      outputArtifactHash: outputHash
    }
  };
}

function rebuildInput(context: ExportReportAdapterContext) {
  const descriptor = context.artifactKind === "export" ? exportGenerateDescriptor : reportGenerateDescriptor;
  return {
    ...context,
    toolRequestId: context.artifactKind === "export" ? "toolreq_export_public_001" : "toolreq_report_private_001",
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    runId: context.artifactKind === "export" ? "run_export_public_001" : "run_report_private_001",
    taskId: context.taskId
  };
}

function previewInputFromCurrent(
  context: ExportReportAdapterContext,
  preview: Record<string, unknown>
): Parameters<typeof buildExportReportApprovalPreview>[0] {
  return {
    toolRequestId: preview.toolRequestId as string,
    toolId: preview.toolId as string,
    toolVersion: preview.toolVersion as string,
    runId: preview.runId as string,
    taskId: preview.taskId as string,
    residentAgentId: preview.residentAgentId as string,
    artifactKind: context.artifactKind,
    artifactId: context.artifactId,
    requestedEvidenceIds: preview.requestedEvidenceIds as readonly string[],
    includedEvidenceIds: preview.includedEvidenceIds as readonly string[],
    includedContentHashes: preview.includedContentHashes as readonly `sha256:${string}`[],
    evidenceBindings: preview.evidenceBindings as Parameters<typeof buildExportReportApprovalPreview>[0]["evidenceBindings"],
    governedPlan: preview.governedPlan as Parameters<typeof buildExportReportApprovalPreview>[0]["governedPlan"],
    excludedRestrictedCategories: preview.excludedRestrictedCategories as readonly string[],
    sensitiveOptIns: context.sensitiveOptIns,
    defaultPublicSafeOnly: context.defaultPublicSafeOnly,
    policy: context.policy,
    policyEventId: preview.policyEventId as string,
    causationEventId: context.causationEventId,
    outputArtifactHash: context.outputArtifactHash,
    domainActorId: context.actor.id,
    projectionHighWaterMark: preview.projectionHighWaterMarks instanceof Array
      ? (preview.projectionHighWaterMarks[0] as { highWaterMark: number }).highWaterMark
      : 0,
    lockSnapshot: preview.lockSnapshot as readonly { lockId: string; category: string; message: string }[]
  };
}

function executionInput(
  context: ExportReportAdapterContext,
  current: Awaited<ReturnType<typeof rebuildExportReportCurrentPreview>>
): AgentApprovedToolExecutionInput {
  const previewHash = hashAgentToolPreview(current.preview);
  const descriptor = context.artifactKind === "export" ? exportGenerateDescriptor : reportGenerateDescriptor;
  return {
    toolRequestId: context.artifactKind === "export" ? "toolreq_export_public_001" : "toolreq_report_private_001",
    runId: context.artifactKind === "export" ? "run_export_public_001" : "run_report_private_001",
    taskId: context.taskId,
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    sideEffectClass: descriptor.sideEffectClass,
    approvalClass: descriptor.requiredApprovalClass,
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: reviewer.id,
    sourceEventIds: current.sourceEventIds,
    inputArtifactHashes: current.inputArtifactHashes,
    provenanceRefs: current.provenanceRefs
  };
}

function changedEvidenceEvent(): KnowledgeEventOf<"evidence.ingested"> {
  const original = eventOfType(goldenGovernanceLedgerEvents, "evidence.ingested", publicEvidenceId);
  return {
    ...original,
    id: "evt_ingest_governance_public_changed",
    sequence: original.sequence + 1,
    payload: { ...original.payload, contentHash: changedHash }
  };
}

function changedPolicyEvent(): KnowledgeEventOf<"governance.policy.installed"> {
  const original = eventOfType(goldenGovernanceLedgerEvents, "governance.policy.installed");
  return {
    ...original,
    id: "evt_install_governance_policy_changed",
    sequence: original.sequence + 1,
    payload: { ...original.payload, version: "0.3.0" }
  };
}

function publicQuarantineEvent(): KnowledgeEventOf<"evidence.quarantined"> {
  const original = eventOfType(goldenGovernanceLedgerEvents, "evidence.quarantined");
  return {
    ...original,
    id: "evt_quarantine_governance_public",
    streamId: `evidence_${publicEvidenceId}`,
    sequence: 4,
    context: { ...original.context, causationId: publicCausationId },
    payload: {
      ...original.payload,
      evidenceId: publicEvidenceId,
      quarantineId: "quarantine_public_export",
      reason: "Hold public evidence while export review is active."
    }
  };
}

function agentLockEvent(): KnowledgeEventOf<"agent.lock.activated"> {
  return {
    id: "evt_lock_export_governance",
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_export_governance",
    sequence: 1,
    context: {
      actor: reviewer,
      occurredAt: fixedNow(),
      correlationId: "corr_lock_export_governance",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      lockId: "lock_export_governance",
      residentAgentId: "agent_default",
      kind: "governance",
      activatedBy: reviewer.id,
      reason: "Export governance review is active."
    }
  };
}

function eventOfType<Type extends KnowledgeEvent["type"]>(
  events: readonly KnowledgeEvent[],
  type: Type,
  evidenceId?: string
): Extract<KnowledgeEvent, { readonly type: Type }> {
  const event = events.find((candidate): candidate is Extract<KnowledgeEvent, { readonly type: Type }> =>
    candidate.type === type && (evidenceId === undefined || (candidate.payload as { evidenceId?: string }).evidenceId === evidenceId)
  );
  if (event === undefined) {
    throw new Error(`Expected ${type} event.`);
  }
  return structuredClone(event);
}

function fixedNow(): string {
  return "2026-07-09T21:00:00.000Z";
}

void (reviewer satisfies ActorRef);
