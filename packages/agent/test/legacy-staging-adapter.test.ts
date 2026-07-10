import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createLegacyImportRuntime, type LegacyImportRuntime } from "../../ingestion/src/legacy-runtime.js";
import { createFakeMountedWorkspace } from "../../ingestion/test/runtime-test-helpers.js";
import { writeLegacyCestusFixture } from "../../ingestion/test/fixtures/legacy-cestus-fixtures.js";
import {
  buildLegacyStagingApprovalPreview,
  createLegacyStagingApprovalAdapter,
  createLegacyStagingExecutionAdapter,
  forbiddenLegacyStagingEventTypes,
  legacyStagingApproveDescriptor,
  legacyStagingExecuteDescriptor,
  rebuildLegacyStagingCurrentPreview,
  type LegacyStagingAdapterContext
} from "../src/adapters/legacy-staging.js";
import {
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentApprovedToolExecutionInput
} from "../src/index.js";

let sourceRoot: string;

const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const humanActor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };
const schedulerActor = { id: "actor_scheduler", kind: "system" as const, label: "Scheduler" };
const now = () => "2026-07-09T12:00:00.000Z";

beforeEach(() => {
  sourceRoot = mkdtempSync(join(tmpdir(), "legacy-staging-adapter-"));
  writeLegacyCestusFixture(sourceRoot);
});

afterEach(() => {
  rmSync(sourceRoot, { recursive: true, force: true });
});

describe("legacy staging domain execution adapter", () => {
  it("builds approval previews with exact report, candidate, evidence, and consequence binding", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);

    const preview = buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      toolRequestId: "toolreq_legacy_staging_approve",
      toolId: legacyStagingApproveDescriptor.toolId,
      toolVersion: legacyStagingApproveDescriptor.toolVersion,
      runId: "run_legacy_staging",
      taskId: "task_legacy_staging",
      residentAgentId: "agent_default",
      selectedCandidateIds
    }));

    expect(preview).toMatchObject({
      toolRequestId: "toolreq_legacy_staging_approve",
      toolId: "legacy.staging.approve",
      toolVersion: "0.1.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_001",
      legacyReportId: prepared.inspected.legacyReportId,
      reportHash: prepared.inspected.reportHash,
      candidateSetHash: prepared.inspected.candidateSetHash,
      selectedCandidateIds,
      importedEvidenceIds: expect.arrayContaining([prepared.preview.candidates[0]?.evidenceId]),
      evidenceContentHashes: expect.arrayContaining([prepared.preview.candidates[0]?.evidenceContentHash]),
      consequence: expect.stringContaining("assertion.proposed")
    });
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "legacy-report", id: prepared.inspected.legacyReportId, hash: prepared.inspected.reportHash }),
      expect.objectContaining({ kind: "candidate-set", id: prepared.inspected.legacyReportId, hash: prepared.inspected.candidateSetHash }),
      expect.objectContaining({
        kind: "legacy-candidate",
        id: selectedCandidateIds[0],
        evidenceId: prepared.preview.candidates[0]?.evidenceId,
        evidenceContentHash: prepared.preview.candidates[0]?.evidenceContentHash
      })
    ]));
    expect(preview.artifactHashes).toEqual(expect.arrayContaining([
      prepared.inspected.reportHash,
      prepared.inspected.candidateSetHash,
      prepared.preview.candidates[0]?.evidenceContentHash
    ]));
    expect(JSON.stringify(preview)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("rejects unknown or swapped legacy staging tool metadata before building a preview", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    const baseInput = legacyPreviewInput(prepared, {
      toolId: legacyStagingApproveDescriptor.toolId,
      toolVersion: legacyStagingApproveDescriptor.toolVersion,
      selectedCandidateIds
    });

    expect(() => buildLegacyStagingApprovalPreview({
      ...baseInput,
      toolId: "legacy.staging.destroy"
    })).toThrow(/canonical legacy staging tool descriptor/i);
    expect(() => buildLegacyStagingApprovalPreview({
      ...baseInput,
      toolVersion: "9.9.9"
    })).toThrow(/canonical legacy staging tool descriptor/i);
    expect(() => buildLegacyStagingApprovalPreview({
      ...baseInput,
      toolId: legacyStagingExecuteDescriptor.toolId,
      toolVersion: "9.9.9"
    })).toThrow(/canonical legacy staging tool descriptor/i);
  });

  it("rejects preview builds when approved report or candidate hashes do not match the current staging preview", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    const changedHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

    expect(() => buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      reportHash: changedHash,
      selectedCandidateIds
    }))).toThrow(/legacy staging report hash/i);
    expect(() => buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      candidateSetHash: changedHash,
      selectedCandidateIds
    }))).toThrow(/legacy staging candidate set hash/i);
  });

  it("rejects empty, duplicate, or absent selected candidates before dropping bindings", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);

    expect(() => buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      selectedCandidateIds: []
    }))).toThrow(/at least one/i);
    expect(() => buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      selectedCandidateIds: [selectedCandidateIds[0]!, selectedCandidateIds[0]!]
    }))).toThrow(/duplicate/i);
    expect(() => buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      selectedCandidateIds: ["legacy_candidate_missing"]
    }))).toThrow(/absent/i);
  });

  it("does not traverse hostile extra input fields while validating the public preview boundary", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    let getterCalls = 0;
    const symbolKey = Symbol("legacy-preview-shadow");
    const input = legacyPreviewInput(prepared, { selectedCandidateIds }) as unknown as Record<PropertyKey, unknown>;
    Object.defineProperty(input, "extra", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("legacy preview extra getter invoked");
      }
    });
    Object.defineProperty(input, symbolKey, {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("legacy preview symbol getter invoked");
      }
    });

    expect(() => buildLegacyStagingApprovalPreview(input as any)).toThrow(/symbol-keyed|unsupported/i);
    expect(getterCalls).toBe(0);
  });

  it("fails closed when production legacy staging adapters are constructed without a ledger", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    const { ledger: _ledger, ...contextWithoutLedger } = prepared.context;

    expect(() => createLegacyStagingApprovalAdapter({
      ...contextWithoutLedger,
      selectedCandidateIds
    })).toThrow(/ledger/i);
    expect(() => createLegacyStagingExecutionAdapter({
      ...contextWithoutLedger,
      selectedCandidateIds
    })).toThrow(/ledger/i);
  });

  it("marks current-preview rebuilds stale when report or candidate-set hashes change", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    const changedHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

    const staleReport = await rebuildLegacyStagingCurrentPreview({
      ...prepared.context,
      runtime: fakePreviewRuntime({
        ...prepared.preview,
        reportHash: changedHash
      }),
      toolRequestId: "toolreq_legacy_staging_stale_report",
      toolId: legacyStagingApproveDescriptor.toolId,
      toolVersion: legacyStagingApproveDescriptor.toolVersion,
      runId: "run_legacy_staging",
      taskId: "task_legacy_staging",
      residentAgentId: "agent_default",
      approvedReportHash: prepared.inspected.reportHash,
      approvedCandidateSetHash: prepared.inspected.candidateSetHash,
      selectedCandidateIds
    });
    const staleCandidates = await rebuildLegacyStagingCurrentPreview({
      ...prepared.context,
      runtime: fakePreviewRuntime({
        ...prepared.preview,
        candidateSetHash: changedHash
      }),
      toolRequestId: "toolreq_legacy_staging_stale_candidates",
      toolId: legacyStagingApproveDescriptor.toolId,
      toolVersion: legacyStagingApproveDescriptor.toolVersion,
      runId: "run_legacy_staging",
      taskId: "task_legacy_staging",
      residentAgentId: "agent_default",
      approvedReportHash: prepared.inspected.reportHash,
      approvedCandidateSetHash: prepared.inspected.candidateSetHash,
      selectedCandidateIds
    });

    expect(staleReport.freshnessChecks).toContainEqual({
      name: "legacy-report-hash",
      expected: prepared.inspected.reportHash,
      actual: changedHash,
      ok: false
    });
    expect(staleCandidates.freshnessChecks).toContainEqual({
      name: "legacy-candidate-set-hash",
      expected: prepared.inspected.candidateSetHash,
      actual: changedHash,
      ok: false
    });
  });

  it("reports active resident-agent locks and blocks direct legacy staging execution", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    await prepared.workspace.ledger.append({
      type: "agent.lock.activated",
      version: 1,
      streamId: "agent_lock_lock_legacy_staging",
      context: {
        actor: humanActor,
        occurredAt: now(),
        correlationId: "corr_lock_legacy_staging",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        lockId: "lock_legacy_staging",
        residentAgentId: "agent_legacy_staging",
        kind: "governance",
        activatedBy: humanActor.id,
        reason: "Legacy staging review is active."
      }
    });

    const current = await rebuildLegacyStagingCurrentPreview({
      ...prepared.context,
      toolRequestId: "toolreq_legacy_staging_locked",
      toolId: legacyStagingApproveDescriptor.toolId,
      toolVersion: legacyStagingApproveDescriptor.toolVersion,
      runId: "run_legacy_staging",
      taskId: "task_legacy_staging",
      residentAgentId: "agent_legacy_staging",
      approvedReportHash: prepared.inspected.reportHash,
      approvedCandidateSetHash: prepared.inspected.candidateSetHash,
      selectedCandidateIds
    });

    expect(current.activeLocks).toEqual([{
      lockId: "lock_legacy_staging",
      category: "governance",
      message: "Legacy staging review is active."
    }]);
    await expect(createLegacyStagingApprovalAdapter({
      ...prepared.context,
      residentAgentId: "agent_legacy_staging",
      selectedCandidateIds
    }).executeApproved(executionInputFor(
      prepared.context,
      undefined,
      legacyStagingApproveDescriptor
    ))).rejects.toMatchObject({ category: "lock-active" });
    expect((await prepared.workspace.ledger.readAll()).filter(
      (event) => event.type === "legacy.ontology.staging.approved"
    )).toHaveLength(0);
  });

  it("fails execution with approval-stale when selected candidates are absent from current evidence-tied candidates", async () => {
    const prepared = await prepareLegacyStagingContext();
    const adapter = createLegacyStagingExecutionAdapter({
      ...prepared.context,
      selectedCandidateIds: ["legacy_candidate_missing"]
    });

    await expect(adapter.executeApproved(executionInputFor(prepared.context))).rejects.toMatchObject({
      category: "approval-stale",
      message: "Legacy staging selection is no longer present in the current evidence-tied candidate set."
    });
  });

  it("maps assertion.proposed event IDs into agent.tool.completed without old ontology import", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    await prepared.runtime.approveStaging({
      sourceCollectionId: prepared.context.sourceCollectionId,
      scanBatchId: prepared.context.scanBatchId,
      legacyReportId: prepared.context.legacyReportId,
      stagingBatchId: prepared.context.stagingBatchId,
      approvedBy: humanActor.id,
      approvedAssertionCandidateIds: selectedCandidateIds
    });
    const adapter = createLegacyStagingExecutionAdapter({
      ...prepared.context,
      selectedCandidateIds
    });
    const gateway = createAgentToolGateway({
      ledger: prepared.workspace.ledger,
      actor: agentActor,
      now
    });
    const preview = buildLegacyStagingApprovalPreview(legacyPreviewInput(prepared, {
      toolRequestId: "toolreq_legacy_staging_execute",
      toolId: legacyStagingExecuteDescriptor.toolId,
      toolVersion: legacyStagingExecuteDescriptor.toolVersion,
      runId: "run_legacy_staging",
      taskId: "task_legacy_staging",
      residentAgentId: "agent_default",
      selectedCandidateIds
    }));
    const requested = await gateway.requestTool({
      toolRequestId: "toolreq_legacy_staging_execute",
      residentAgentId: "agent_default",
      taskId: "task_legacy_staging",
      runId: "run_legacy_staging",
      toolId: legacyStagingExecuteDescriptor.toolId,
      toolVersion: legacyStagingExecuteDescriptor.toolVersion,
      sideEffectClass: legacyStagingExecuteDescriptor.sideEffectClass,
      requiredApprovalClass: "none",
      preview
    });
    expect(requested.payload.previewHash).toBe(hashAgentToolPreview(preview));

    const result = await adapter.executeApproved(executionInputFor(prepared.context, requested.payload.previewHash));
    await gateway.completeTool({
      toolRequestId: "toolreq_legacy_staging_execute",
      result
    });
    const events = await prepared.workspace.ledger.readAll();
    const completed = eventOfType(events, "agent.tool.completed");

    expect(result.eventIds).toHaveLength(1);
    expect(completed.payload.eventIds).toEqual(result.eventIds);
    expect(completed.payload.readModelChanges).toContainEqual({
      projectionName: "legacy-staging",
      change: "staged 1 legacy assertion proposal",
      relatedIds: selectedCandidateIds
    });
    expect(events.map((event) => event.type)).toContain("assertion.proposed");
    expect(events.map((event) => event.type)).not.toContain("legacy.old-ontology.imported");
    expect(events.map((event) => event.type)).not.toContain("assertion.accepted");
    expect(events.map((event) => event.type)).not.toContain("entity.resolved");
    expect(events.map((event) => event.type)).not.toContain("relationship.accepted");
  });

  it("treats repeated staging approval and execution as idempotent append-only results", async () => {
    const prepared = await prepareLegacyStagingContext();
    const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
    const approvalAdapter = createLegacyStagingApprovalAdapter({
      ...prepared.context,
      selectedCandidateIds
    });
    const executionAdapter = createLegacyStagingExecutionAdapter({
      ...prepared.context,
      selectedCandidateIds
    });

    const firstApproval = await approvalAdapter.executeApproved(
      executionInputFor(prepared.context, undefined, legacyStagingApproveDescriptor)
    );
    const secondApproval = await approvalAdapter.executeApproved(
      executionInputFor(prepared.context, undefined, legacyStagingApproveDescriptor)
    );
    const firstExecution = await executionAdapter.executeApproved(executionInputFor(prepared.context));
    const secondExecution = await executionAdapter.executeApproved(executionInputFor(prepared.context));
    const events = await prepared.workspace.ledger.readAll();

    expect(secondApproval.eventIds).toEqual(firstApproval.eventIds);
    expect(secondExecution.eventIds).toEqual(firstExecution.eventIds);
    expect(events.filter((event) => event.type === "legacy.ontology.staging.approved")).toHaveLength(1);
    expect(events.filter((event) => event.type === "assertion.proposed")).toHaveLength(1);
  });

  it.each([...forbiddenLegacyStagingEventTypes])(
    "fails if legacy staging execution observes forbidden %s events",
    async (forbiddenType) => {
      const prepared = await prepareLegacyStagingContext();
      const selectedCandidateIds = prepared.preview.candidates.map((candidate) => candidate.candidateId);
      const runtime = fakeStageRuntime(prepared.preview, async () => {
        const forbidden = await appendForbiddenEvent(prepared.workspace.ledger, forbiddenType);
        return {
          ok: true,
          command: "legacy stage",
          eventIds: [forbidden.id],
          nextActions: [],
          legacyReportId: prepared.context.legacyReportId,
          stagingBatchId: prepared.context.stagingBatchId,
          proposedAssertionIds: ["as_forbidden"]
        };
      });
      const adapter = createLegacyStagingExecutionAdapter({
        ...prepared.context,
        runtime,
        selectedCandidateIds
      });
      await expect(adapter.executeApproved(executionInputFor(prepared.context))).rejects.toMatchObject({
        category: "domain-gate-failed",
        message: "Legacy ontology staging may append assertion proposals only."
      });
    }
  );
});

async function prepareLegacyStagingContext() {
  const workspace = createFakeMountedWorkspace("Legacy staging adapter workspace");
  const runtime = createLegacyImportRuntime({ mountedWorkspace: workspace, actor: humanActor });
  const inspected = await runtime.inspect({
    sourceCollectionId: "src_old_cestus",
    label: "Old Cestus",
    sourceRoot,
    scanBatchId: "scan_old_cestus_001"
  });
  expect(inspected.ok).toBe(true);
  if (!inspected.ok) {
    throw new Error("legacy inspect failed");
  }
  await runtime.approveRawImport({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001",
    approvedBy: humanActor.id
  });
  await runtime.importApproved({
    sourceCollectionId: "src_old_cestus",
    scanBatchId: "scan_old_cestus_001",
    importBatchId: "imp_old_cestus_001"
  });
  const preview = await runtime.stagingPreview({
    sourceCollectionId: "src_old_cestus",
    legacyReportId: inspected.legacyReportId
  });
  expect(preview.ok).toBe(true);
  if (!preview.ok) {
    throw new Error("legacy staging preview failed");
  }

  return {
    workspace,
    runtime,
    inspected,
    preview,
    context: {
      runtime,
      ledger: workspace.ledger,
      sourceCollectionId: "src_old_cestus",
      scanBatchId: "scan_old_cestus_001",
      stagingBatchId: "legacy_stage_001",
      legacyReportId: inspected.legacyReportId,
      reportHash: inspected.reportHash,
      candidateSetHash: inspected.candidateSetHash
    } satisfies LegacyStagingAdapterContext
  };
}

function legacyPreviewInput(
  prepared: Awaited<ReturnType<typeof prepareLegacyStagingContext>>,
  overrides: Partial<Parameters<typeof buildLegacyStagingApprovalPreview>[0]> = {}
): Parameters<typeof buildLegacyStagingApprovalPreview>[0] {
  return {
    sourceCollectionId: prepared.context.sourceCollectionId,
    scanBatchId: prepared.context.scanBatchId,
    stagingBatchId: prepared.context.stagingBatchId,
    legacyReportId: prepared.context.legacyReportId,
    reportHash: prepared.context.reportHash,
    candidateSetHash: prepared.context.candidateSetHash,
    toolRequestId: "toolreq_legacy_staging_approve",
    toolId: legacyStagingApproveDescriptor.toolId,
    toolVersion: legacyStagingApproveDescriptor.toolVersion,
    runId: "run_legacy_staging",
    taskId: "task_legacy_staging",
    residentAgentId: "agent_default",
    preview: prepared.preview,
    selectedCandidateIds: prepared.preview.candidates.map((candidate) => candidate.candidateId),
    ...overrides
  };
}

function executionInputFor(
  context: LegacyStagingAdapterContext,
  previewHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  descriptor = legacyStagingExecuteDescriptor
): AgentApprovedToolExecutionInput {
  return {
    toolRequestId: `toolreq_${descriptor.toolId.replaceAll(".", "_")}`,
    runId: "run_legacy_staging",
    taskId: "task_legacy_staging",
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    sideEffectClass: descriptor.sideEffectClass,
    approvalClass: descriptor.requiredApprovalClass,
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: humanActor.id,
    sourceEventIds: [],
    inputArtifactHashes: [context.reportHash, context.candidateSetHash],
    provenanceRefs: [context.reportHash, context.candidateSetHash]
  };
}

function fakePreviewRuntime(
  preview: Awaited<ReturnType<LegacyImportRuntime["stagingPreview"]>>
): LegacyImportRuntime {
  return {
    async inspect() {
      throw new Error("unused");
    },
    async report() {
      throw new Error("unused");
    },
    async quarantine() {
      throw new Error("unused");
    },
    async stagingPreview() {
      return preview;
    },
    async approveRawImport() {
      throw new Error("unused");
    },
    async importApproved() {
      throw new Error("unused");
    },
    async approveStaging() {
      throw new Error("unused");
    },
    async stageApproved() {
      throw new Error("unused");
    }
  };
}

function fakeStageRuntime(
  preview: Awaited<ReturnType<LegacyImportRuntime["stagingPreview"]>>,
  stageApproved: () => Promise<Awaited<ReturnType<LegacyImportRuntime["stageApproved"]>>>
): LegacyImportRuntime {
  return {
    ...fakePreviewRuntime(preview),
    async stageApproved() {
      return stageApproved();
    }
  };
}

async function appendForbiddenEvent(
  ledger: { append(event: any): Promise<KnowledgeEvent> },
  type: typeof forbiddenLegacyStagingEventTypes[number]
): Promise<KnowledgeEvent> {
  if (type === "assertion.accepted") {
    return await ledger.append({
      type,
      version: 1,
      streamId: "assertion_as_forbidden",
      context: eventContext(),
      payload: {
        assertionId: "as_forbidden",
        acceptedBy: humanActor.id,
        rationale: "Forbidden accepted graph mutation."
      }
    });
  }

  if (type === "entity.resolved") {
    return await ledger.append({
      type,
      version: 1,
      streamId: "entity_ent_forbidden",
      context: eventContext(),
      payload: {
        entityId: "ent_forbidden",
        assertionIds: ["as_forbidden"],
        canonicalLabel: "Forbidden Entity",
        entityType: "agency"
      }
    });
  }

  return await ledger.append({
    type,
    version: 1,
    streamId: "relationship_rel_forbidden",
    context: eventContext(),
    payload: {
      relationshipId: "rel_forbidden",
      fromEntityId: "ent_forbidden_from",
      toEntityId: "ent_forbidden_to",
      relationshipType: "related-to",
      assertionIds: ["as_forbidden"]
    }
  });
}

function eventContext() {
  return {
    actor: humanActor,
    occurredAt: now(),
    correlationId: "corr_forbidden_legacy_stage",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", ontology: "0.1.0" }
  };
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
