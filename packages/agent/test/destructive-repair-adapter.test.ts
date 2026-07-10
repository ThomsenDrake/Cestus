import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type { BackupManifestInput } from "../../workspace-ops/src/backup.js";
import type { WorkspaceStats } from "../../workspace-ops/src/filesystem.js";
import { resolveWorkspaceLayout, type WorkspaceLayoutResult } from "../../workspace-ops/src/layout.js";
import type { WorkspaceEventReader } from "../../workspace-ops/src/ops.js";
import type {
  ProjectionArtifactFileSystem,
  ProjectionBuilder
} from "../../workspace-ops/src/projection-rebuild.js";
import {
  buildDestructiveRepairApprovalPreview,
  createBlockedCanonicalRepairAdapter,
  createWorkspaceProjectionRebuildAdapter,
  destructiveRepairDescriptors,
  rebuildDestructiveRepairCurrentPreview,
  workspaceCanonicalRepairDescriptor,
  workspaceProjectionRebuildDescriptor,
  type BlockedCanonicalRepairAdapterContext,
  type BuildDestructiveRepairPreviewInput,
  type WorkspaceProjectionRebuildAdapterContext
} from "../src/adapters/destructive-repair.js";
import { hashAgentToolPreview, type AgentApprovedToolExecutionInput } from "../src/index.js";

const manifestHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const backupManifestHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const artifactHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const rootPath = "/media/CASE-WORKSPACE";
const domainActor = { id: "actor_workspace_owner", kind: "human" as const, label: "Workspace owner" };

function projectionPreviewInput(): BuildDestructiveRepairPreviewInput {
  return {
    toolRequestId: "toolreq_projection_rebuild_001",
    toolId: "workspace.projection-rebuild.execute",
    toolVersion: "0.1.0",
    runId: "run_projection_rebuild_001",
    taskId: "task_projection_rebuild_001",
    residentAgentId: "agent_resident_001",
    workspace: {
      workspaceId: "ws_repair_001",
      label: "Portable workspace",
      manifestVersion: 1,
      rootUri: "file:///media/CASE-WORKSPACE",
      layoutContractVersion: "portable-workspace-layout.v1"
    },
    manifestHash,
    ledgerHighWaterMark: 1,
    backupManifestRef: {
      available: true,
      manifestHash: backupManifestHash,
      ledgerHighWaterMark: 1,
      stale: false
    },
    target: {
      kind: "projection" as const,
      projectionName: "graph",
      rebuildId: "rb_graph_001"
    },
    proposedAction: {
      actionId: "action_rebuild_projection_graph",
      kind: "rebuild-projection" as const,
      title: "Rebuild the expendable graph projection.",
      severity: "warning" as const,
      requiresHumanApproval: true,
      mutatesCanonicalState: false,
      allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"] as const
    },
    mutationClass: "expendable-projection-rebuild" as const,
    dataLossRiskSummary: "Canonical ledger and blob state are not modified; prior projection artifacts are preserved on failure.",
    readinessChecks: [
      { checkId: "ledger_readable", status: "pass" as const, safeMessage: "Workspace ledger is readable." },
      { checkId: "prior_artifacts_preserved", status: "pass" as const, safeMessage: "Prior artifacts are preserved." }
    ],
    readinessDiagnosticsHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const,
    expectedArtifactOutputs: [{
      artifactId: "artifact_graph_projection_json",
      relativePath: "projections/graph/projection.json",
      artifactHash,
      byteCount: 12,
      expendable: true as const
    }],
    appendOnlyRepairEventPlan: {
      required: false,
      service: "AppendOnlyWorkspaceRepairService",
      serviceAvailable: false,
      status: "not-required-for-expendable-projection" as const
    },
    lockSnapshot: [],
    projectionHighWaterMark: 1
  };
}

describe("resident-agent destructive repair adapters", () => {
  it("publishes projection rebuild and fail-closed canonical repair descriptors", () => {
    expect(destructiveRepairDescriptors).toEqual([
      workspaceProjectionRebuildDescriptor,
      workspaceCanonicalRepairDescriptor
    ]);
    expect(workspaceProjectionRebuildDescriptor).toMatchObject({
      toolId: "workspace.projection-rebuild.execute",
      toolVersion: "0.1.0",
      family: "destructive-repair",
      sideEffectClass: "destructive-or-repair",
      requiredApprovalClass: "destructive-or-repair",
      targetDomainService: "workspace-ops.rebuildProjection"
    });
    expect(workspaceCanonicalRepairDescriptor).toMatchObject({
      toolId: "workspace.canonical-repair.record",
      toolVersion: "0.1.0",
      family: "destructive-repair",
      sideEffectClass: "destructive-or-repair",
      requiredApprovalClass: "destructive-or-repair",
      targetDomainService: "AppendOnlyWorkspaceRepairService"
    });
    for (const descriptor of destructiveRepairDescriptors) {
      expect(descriptor.forbiddenEffects).toEqual(expect.arrayContaining([
        "canonical-ledger-delete",
        "canonical-ledger-rewrite",
        "canonical-ledger-compaction",
        "canonical-ledger-reset",
        "canonical-blob-delete",
        "silent-canonical-migration"
      ]));
    }
  });

  it("builds a consequence-first projection preview using only safe relative artifact refs", () => {
    const preview = buildDestructiveRepairApprovalPreview(projectionPreviewInput());

    expect(preview).toMatchObject({
      toolId: "workspace.projection-rebuild.execute",
      workspace: expect.objectContaining({ workspaceId: "ws_repair_001" }),
      manifestHash,
      ledgerHighWaterMark: 1,
      backupManifestRef: expect.objectContaining({ manifestHash: backupManifestHash, stale: false }),
      target: { kind: "projection", projectionName: "graph", rebuildId: "rb_graph_001" },
      mutationClass: "expendable-projection-rebuild",
      dataLossRiskSummary: expect.stringMatching(/canonical ledger.*not modified/i),
      appendOnlyRepairEventPlan: expect.objectContaining({ required: false, serviceAvailable: false }),
      consequence: expect.stringMatching(/human approval.*expendable projection/i)
    });
    expect(preview.readinessChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: "prior_artifacts_preserved", status: "pass" })
    ]));
    expect(preview.expectedArtifactOutputs).toEqual([
      expect.objectContaining({
        relativePath: "projections/graph/projection.json",
        artifactHash,
        expendable: true
      })
    ]);
    expect(preview.artifactHashes).toEqual([manifestHash, backupManifestHash, artifactHash]);
    expect(preview.idempotencyKey).toContain("rb_graph_001");
    expect(JSON.stringify(preview)).not.toContain("/media/CASE-WORKSPACE");
    expect(JSON.stringify(preview)).not.toMatch(/raw artifact|canonical event payload|delete ledger/i);
  });

  it("fails the public preview boundary closed for canonical and hostile metadata", () => {
    const valid = projectionPreviewInput();
    expect(() => buildDestructiveRepairApprovalPreview({ ...valid, toolId: "workspace.ledger.delete" } as never))
      .toThrow(/canonical destructive repair descriptor/i);
    expect(() => buildDestructiveRepairApprovalPreview({ ...valid, toolVersion: "9.9.9" } as never))
      .toThrow(/canonical destructive repair descriptor/i);
    expect(() => buildDestructiveRepairApprovalPreview({
      ...valid,
      target: { ...valid.target, projectionName: "../ledger" }
    } as never)).toThrow(/projection/i);
    expect(() => buildDestructiveRepairApprovalPreview({
      ...valid,
      expectedArtifactOutputs: [{
        ...valid.expectedArtifactOutputs[0],
        relativePath: "/media/CASE-WORKSPACE/projections/graph/projection.json"
      }]
    } as never)).toThrow(/relative/i);

    let getterCalls = 0;
    const hostile = { ...valid } as Record<PropertyKey, unknown>;
    Object.defineProperty(hostile, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe repair getter");
      }
    });
    Object.defineProperty(hostile, Symbol("shadow"), {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe repair symbol getter");
      }
    });
    expect(() => buildDestructiveRepairApprovalPreview(hostile as never))
      .toThrow(/symbol-keyed|enumerable data properties|unsupported/i);
    expect(getterCalls).toBe(0);
  });

  it("rebuilds and executes only exact expendable projection artifacts through workspace-ops", async () => {
    const prepared = await prepareProjection();
    const current = await rebuildDestructiveRepairCurrentPreview(rebuildInput(prepared.context));
    const result = await createWorkspaceProjectionRebuildAdapter(prepared.context).executeApproved(
      executionInput(prepared.context, current)
    );

    expect(prepared.fileSystem.writes).toEqual([expect.objectContaining({
      path: `${rootPath}/projections/.tmp-rb_graph_001/projection.json`,
      content: prepared.current.outputs["projection.json"]
    })]);
    expect(prepared.fileSystem.promoted).toEqual([{
      from: `${rootPath}/projections/.tmp-rb_graph_001`,
      to: `${rootPath}/projections/graph`
    }]);
    expect(prepared.fileSystem.removed).not.toContain(`${rootPath}/projections/graph`);
    expect(result).toMatchObject({
      eventIds: [],
      artifactHashes: [hashText(prepared.current.outputs["projection.json"] ?? "")],
      resultSummary: "Workspace-ops rebuilt the approved expendable projection artifacts."
    });
    expect(result.readModelChanges).toEqual([expect.objectContaining({
      projectionName: "workspace-projection-artifacts",
      change: expect.stringMatching(/expendable.*artifact/i),
      relatedIds: expect.arrayContaining(["graph", "rb_graph_001", "artifact_graph_projection_json"])
    })]);
    expect(JSON.stringify(result)).not.toContain(rootPath);
    expect(JSON.stringify(result)).not.toContain(prepared.current.outputs["projection.json"]);
  });

  it("rejects stale manifest, ledger, backup, readiness, outputs, target, action, and locks before writes", async () => {
    const staleManifest = await prepareProjection();
    const manifestApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(staleManifest.context));
    staleManifest.fileSystem.files.set(
      staleManifest.layout.layout!.manifestPath,
      JSON.stringify(canonicalManifest("ws_swapped_repair"))
    );
    await expect(createWorkspaceProjectionRebuildAdapter(staleManifest.context).executeApproved(
      executionInput(staleManifest.context, manifestApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleManifest.fileSystem.writes).toEqual([]);

    const staleLedger = await prepareProjection();
    const ledgerApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(staleLedger.context));
    staleLedger.current.events.push(secondEvidenceEvent());
    await expect(createWorkspaceProjectionRebuildAdapter(staleLedger.context).executeApproved(
      executionInput(staleLedger.context, ledgerApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleLedger.fileSystem.writes).toEqual([]);

    const staleBackup = await prepareProjection();
    const backupApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(staleBackup.context));
    staleBackup.current.backup = { ...staleBackup.current.backup, exportedAt: "2026-07-09T23:00:00.000Z" };
    await expect(createWorkspaceProjectionRebuildAdapter(staleBackup.context).executeApproved(
      executionInput(staleBackup.context, backupApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleBackup.fileSystem.writes).toEqual([]);

    const staleOutput = await prepareProjection();
    const outputApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(staleOutput.context));
    staleOutput.current.outputs = { "projection.json": JSON.stringify({ nodes: ["changed"] }) };
    await expect(createWorkspaceProjectionRebuildAdapter(staleOutput.context).executeApproved(
      executionInput(staleOutput.context, outputApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleOutput.fileSystem.writes).toEqual([]);

    const staleReadiness = await prepareProjection();
    const readinessApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(staleReadiness.context));
    staleReadiness.fileSystem.directories.delete(staleReadiness.layout.layout!.projectionRoot);
    await expect(createWorkspaceProjectionRebuildAdapter(staleReadiness.context).executeApproved(
      executionInput(staleReadiness.context, readinessApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(staleReadiness.fileSystem.writes).toEqual([]);

    const changedTarget = await prepareProjection();
    const targetApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(changedTarget.context));
    const targetContext = { ...changedTarget.context, rebuildId: "rb_graph_changed" };
    await expect(createWorkspaceProjectionRebuildAdapter(targetContext).executeApproved(
      executionInput(changedTarget.context, targetApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(changedTarget.fileSystem.writes).toEqual([]);

    const changedAction = await prepareProjection();
    const actionApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(changedAction.context));
    const actionContext = {
      ...changedAction.context,
      proposedAction: { ...changedAction.context.proposedAction, title: "Rebuild a different projection action." }
    };
    await expect(createWorkspaceProjectionRebuildAdapter(actionContext).executeApproved(
      executionInput(changedAction.context, actionApproved)
    )).rejects.toMatchObject({ category: "approval-stale" });
    expect(changedAction.fileSystem.writes).toEqual([]);

    const locked = await prepareProjection();
    const lockApproved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(locked.context));
    await locked.agentLedger.append(agentLockEvent());
    await expect(createWorkspaceProjectionRebuildAdapter(locked.context).executeApproved(
      executionInput(locked.context, lockApproved)
    )).rejects.toMatchObject({ category: "lock-active" });
    expect(locked.fileSystem.writes).toEqual([]);
  });

  it("freezes current builder output before workspace-ops writes and rejects unattested results", async () => {
    const prepared = await prepareProjection();
    const approved = await rebuildDestructiveRepairCurrentPreview(rebuildInput(prepared.context));
    prepared.current.changeAfterNextBuild = true;

    const result = await createWorkspaceProjectionRebuildAdapter(prepared.context).executeApproved(
      executionInput(prepared.context, approved)
    );

    expect(result.artifactHashes).toEqual([hashText(JSON.stringify({ nodes: [] }))]);
    expect(prepared.fileSystem.writes[0]?.content).toBe(JSON.stringify({ nodes: [] }));
  });

  it("keeps canonical ledger and blob repair fail-closed without a mutation dependency", async () => {
    const context = canonicalContext();
    const adapter = createBlockedCanonicalRepairAdapter(context);
    const current = await adapter.buildCurrentPreview({
      toolRequestId: "toolreq_canonical_repair_001",
      runId: "run_canonical_repair_001",
      taskId: context.taskId,
      toolId: context.toolId,
      toolVersion: "0.1.0",
      requestedPreviewHash: manifestHash
    });

    expect(current.preview).toMatchObject({
      mutationClass: "canonical-repair",
      target: { kind: "canonical-root", root: "ledger" },
      appendOnlyRepairEventPlan: { required: true, serviceAvailable: false }
    });
    await expect(adapter.executeApproved(executionInput(context, current)))
      .rejects.toMatchObject({
        category: "data-loss-risk",
        allowedActions: expect.arrayContaining([expect.stringMatching(/append-only repair event service/i)])
      });
    for (const field of ["delete", "rewrite", "compact", "reset", "migrate", "repair", "appendEvent"]) {
      expect(() => createBlockedCanonicalRepairAdapter({ ...context, [field]: () => undefined } as never))
        .toThrow(/unsupported/i);
    }
  });

  it("revalidates canonical repair approval bindings and active locks before its data-loss stop", async () => {
    const context = canonicalContext();
    const adapter = createBlockedCanonicalRepairAdapter(context);
    const current = await adapter.buildCurrentPreview({
      toolRequestId: "toolreq_canonical_repair_001",
      runId: "run_canonical_repair_001",
      taskId: context.taskId,
      toolId: context.toolId,
      toolVersion: "0.1.0",
      requestedPreviewHash: manifestHash
    });
    const valid = executionInput(context, current);

    await expect(adapter.executeApproved({
      ...valid,
      previewHash: manifestHash,
      approvedPreviewHash: manifestHash
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      inputArtifactHashes: [manifestHash]
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(adapter.executeApproved({
      ...valid,
      provenanceRefs: ["workspace:forged"]
    })).rejects.toMatchObject({ category: "provenance-missing" });

    await context.ledger.append(agentLockEvent());
    await expect(adapter.executeApproved(valid)).rejects.toMatchObject({ category: "lock-active" });
  });

  it("rejects canonical repair targets that do not match the proposed action", () => {
    const context = canonicalContext();
    expect(() => createBlockedCanonicalRepairAdapter({
      ...context,
      target: { ...context.target, repairActionId: "repair_different_action" }
    })).toThrow(/repair action/i);

    const canonicalPreviewInput: BuildDestructiveRepairPreviewInput = {
      ...projectionPreviewInput(),
      toolId: context.toolId,
      workspace: context.workspace,
      manifestHash: context.manifestHash,
      ledgerHighWaterMark: context.ledgerHighWaterMark,
      backupManifestRef: context.backupManifestRef,
      target: { ...context.target, repairActionId: "repair_different_action" },
      proposedAction: context.proposedAction,
      mutationClass: "canonical-repair",
      dataLossRiskSummary: context.dataLossRiskSummary,
      readinessChecks: context.readinessChecks,
      readinessDiagnosticsHash: context.readinessDiagnosticsHash,
      expectedArtifactOutputs: [],
      appendOnlyRepairEventPlan: {
        required: true,
        service: "AppendOnlyWorkspaceRepairService",
        serviceAvailable: false,
        status: "blocked-service-unavailable"
      },
      projectionHighWaterMark: context.ledgerHighWaterMark
    };
    expect(() => buildDestructiveRepairApprovalPreview(canonicalPreviewInput)).toThrow(/repair action/i);
  });

  it("fails production construction and execution DTOs closed at hostile public boundaries", async () => {
    const prepared = await prepareProjection();
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, ledger: undefined } as never))
      .toThrow(/ledger/i);
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, workspaceFileSystem: undefined } as never))
      .toThrow(/workspace file system/i);
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, projectionFileSystem: undefined } as never))
      .toThrow(/projection file system/i);
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, eventReader: undefined } as never))
      .toThrow(/event reader/i);
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, builder: undefined } as never))
      .toThrow(/builder/i);
    expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, domainActor: {
      id: "actor_repair_agent", kind: "agent", label: "Repair agent"
    } } as never)).toThrow(/human/i);
    for (const field of ["write", "delete", "repair", "executor", "appendEvent", "canonicalMutation"]) {
      expect(() => createWorkspaceProjectionRebuildAdapter({ ...prepared.context, [field]: () => undefined } as never))
        .toThrow(/unsupported/i);
    }

    const current = await rebuildDestructiveRepairCurrentPreview(rebuildInput(prepared.context));
    const valid = executionInput(prepared.context, current);
    await expect(createWorkspaceProjectionRebuildAdapter(prepared.context).executeApproved({
      ...valid,
      inputArtifactHashes: [manifestHash]
    })).rejects.toMatchObject({ category: "approval-stale" });
    await expect(createWorkspaceProjectionRebuildAdapter(prepared.context).executeApproved({
      ...valid,
      provenanceRefs: ["workspace:forged"]
    })).rejects.toMatchObject({ category: "provenance-missing" });
    let getterCalls = 0;
    const hostile = { ...valid } as Record<string, unknown>;
    Object.defineProperty(hostile, "shadow", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("unsafe execution getter");
      }
    });
    await expect(createWorkspaceProjectionRebuildAdapter(prepared.context).executeApproved(hostile as never))
      .rejects.toMatchObject({ category: "permission-denied" });
    expect(getterCalls).toBe(0);
  });
});

interface MutableProjectionState {
  events: KnowledgeEvent[];
  backup: BackupManifestInput;
  outputs: Record<string, string>;
  changeAfterNextBuild: boolean;
}

interface PreparedProjection {
  agentLedger: InMemoryEventLedger;
  fileSystem: MemoryRepairFileSystem;
  layout: WorkspaceLayoutResult;
  current: MutableProjectionState;
  context: WorkspaceProjectionRebuildAdapterContext;
}

async function prepareProjection(): Promise<PreparedProjection> {
  const fileSystem = new MemoryRepairFileSystem();
  addWorkspace(fileSystem);
  const layout = await resolveWorkspaceLayout({ rootPath, expectedWorkspaceId: "ws_repair_001" }, fileSystem);
  if (layout.layout === undefined || layout.workspace === undefined) {
    throw new Error("Expected ready workspace layout.");
  }
  const current: MutableProjectionState = {
    events: [firstEvidenceEvent()],
    backup: {
      workspaceId: layout.workspace.workspaceId,
      layoutContractVersion: layout.workspace.layoutContractVersion,
      ledgerHighWaterMark: 1,
      coveredCategories: [
        "manifest", "ledger", "blobs", "derivatives", "jobs", "projections", "cache", "config"
      ],
      exportedAt: "2026-07-09T22:00:00.000Z"
    },
    outputs: { "projection.json": JSON.stringify({ nodes: [] }) },
    changeAfterNextBuild: false
  };
  const eventReader: WorkspaceEventReader = {
    async readAll() {
      return current.events.map((event) => structuredClone(event));
    }
  };
  const builder: ProjectionBuilder = {
    projectionName: "graph",
    async build() {
      const output = structuredClone(current.outputs);
      if (current.changeAfterNextBuild) {
        current.changeAfterNextBuild = false;
        current.outputs = { "projection.json": JSON.stringify({ nodes: ["unapproved"] }) };
      }
      return output;
    }
  };
  const agentLedger = new InMemoryEventLedger();
  const context: WorkspaceProjectionRebuildAdapterContext = {
    ledger: agentLedger,
    domainActor,
    residentAgentId: "agent_resident_001",
    taskId: "task_projection_rebuild_001",
    toolId: workspaceProjectionRebuildDescriptor.toolId,
    layout,
    workspaceFileSystem: fileSystem,
    projectionFileSystem: fileSystem,
    eventReader,
    builder,
    projectionName: "graph",
    rebuildId: "rb_graph_001",
    proposedAction: {
      actionId: "action_rebuild_projection_graph",
      kind: "rebuild-projection",
      title: "Rebuild the expendable graph projection.",
      severity: "warning",
      requiresHumanApproval: true,
      mutatesCanonicalState: false,
      allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"]
    },
    dataLossRiskSummary:
      "Canonical ledger and blob state are not modified; prior projection artifacts are preserved on failure.",
    readBackupManifest: async () => structuredClone(current.backup)
  };
  return { agentLedger, fileSystem, layout, current, context };
}

function canonicalContext(): BlockedCanonicalRepairAdapterContext {
  return {
    ledger: new InMemoryEventLedger(),
    domainActor,
    residentAgentId: "agent_resident_001",
    taskId: "task_canonical_repair_001",
    toolId: workspaceCanonicalRepairDescriptor.toolId,
    workspace: projectionPreviewInput().workspace,
    manifestHash,
    ledgerHighWaterMark: 1,
    backupManifestRef: projectionPreviewInput().backupManifestRef,
    target: { kind: "canonical-root", root: "ledger", repairActionId: "repair_ledger_001" },
    proposedAction: {
      actionId: "repair_ledger_001",
      kind: "append-repair-event-required",
      title: "Record a human-approved canonical ledger repair event.",
      severity: "error",
      requiresHumanApproval: true,
      mutatesCanonicalState: true,
      allowedNextCommands: ["diagnostics inspect"]
    },
    dataLossRiskSummary: "Canonical ledger repair is blocked because it could delete or rewrite durable state.",
    readinessChecks: [{
      checkId: "append_only_repair_service_available",
      status: "fail",
      safeMessage: "Append-only workspace repair service is unavailable."
    }],
    readinessDiagnosticsHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  };
}

function rebuildInput(context: WorkspaceProjectionRebuildAdapterContext) {
  return {
    ...context,
    toolRequestId: "toolreq_projection_rebuild_001",
    toolVersion: "0.1.0",
    runId: "run_projection_rebuild_001"
  };
}

function executionInput(
  context: { readonly taskId: string; readonly toolId: string },
  current: Awaited<ReturnType<typeof rebuildDestructiveRepairCurrentPreview>>
): AgentApprovedToolExecutionInput {
  const previewHash = hashAgentToolPreview(current.preview);
  return {
    toolRequestId: context.toolId === workspaceProjectionRebuildDescriptor.toolId
      ? "toolreq_projection_rebuild_001"
      : "toolreq_canonical_repair_001",
    runId: context.toolId === workspaceProjectionRebuildDescriptor.toolId
      ? "run_projection_rebuild_001"
      : "run_canonical_repair_001",
    taskId: context.taskId,
    toolId: context.toolId,
    toolVersion: "0.1.0",
    sideEffectClass: "destructive-or-repair",
    approvalClass: "destructive-or-repair",
    previewHash,
    approvedPreviewHash: previewHash,
    approvedBy: domainActor.id,
    sourceEventIds: current.sourceEventIds,
    inputArtifactHashes: current.inputArtifactHashes,
    provenanceRefs: current.provenanceRefs
  };
}

class MemoryRepairFileSystem implements ProjectionArtifactFileSystem {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly writes: Array<{ readonly path: string; readonly content: string }> = [];
  readonly removed: string[] = [];
  readonly promoted: Array<{ readonly from: string; readonly to: string }> = [];

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw new Error("private missing workspace file");
    }
    return value;
  }

  async stat(path: string): Promise<WorkspaceStats> {
    if (this.directories.has(path)) {
      return { kind: "directory", sizeBytes: 0 };
    }
    const value = this.files.get(path);
    if (value !== undefined) {
      return { kind: "file", sizeBytes: Buffer.byteLength(value) };
    }
    throw new Error("private missing workspace path");
  }

  async lstat(path: string): Promise<WorkspaceStats> {
    return this.stat(path);
  }

  async list(): Promise<readonly string[]> {
    return [];
  }

  async realpath(path: string): Promise<string> {
    return path;
  }

  async availableBytes(): Promise<number | undefined> {
    return 1_000_000;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writes.push({ path, content });
  }

  async remove(path: string): Promise<void> {
    this.removed.push(path);
  }

  async promoteDirectory(from: string, to: string): Promise<void> {
    this.promoted.push({ from, to });
  }
}

function addWorkspace(fileSystem: MemoryRepairFileSystem): void {
  const manifestPath = `${rootPath}/cestus-workspace.json`;
  fileSystem.directories.add(rootPath);
  fileSystem.files.set(manifestPath, JSON.stringify(canonicalManifest()));
  fileSystem.directories.add(`${rootPath}/ledger`);
  fileSystem.files.set(`${rootPath}/ledger/ontology.sqlite`, "sqlite");
  for (const directory of ["blobs", "derivatives", "jobs", "projections", "cache", "config"]) {
    fileSystem.directories.add(`${rootPath}/${directory}`);
  }
}

function canonicalManifest(workspaceId = "ws_repair_001") {
  return {
    version: 1,
    layoutVersion: 1,
    workspaceId,
    label: "Portable workspace",
    createdAt: "2026-07-09T22:00:00.000Z",
    createdBy: "workspace-repair-test",
    coreVersion: "0.1.0"
  };
}

function firstEvidenceEvent(): KnowledgeEvent {
  return {
    id: "evt_repair_evidence_001",
    type: "evidence.ingested",
    version: 1,
    streamId: "evidence_ev_repair_001",
    sequence: 1,
    context: {
      actor: { id: "actor_ingestion", kind: "system", label: "Ingestion" },
      occurredAt: "2026-07-09T22:00:00.000Z",
      correlationId: "corr_repair_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      evidenceId: "ev_repair_001",
      source: { kind: "file", label: "repair.txt" },
      contentHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      mediaType: "text/plain",
      sizeBytes: 1
    }
  };
}

function secondEvidenceEvent(): KnowledgeEvent {
  return {
    ...firstEvidenceEvent(),
    id: "evt_repair_evidence_002",
    streamId: "evidence_ev_repair_002",
    payload: {
      ...firstEvidenceEvent().payload,
      evidenceId: "ev_repair_002",
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    }
  } as KnowledgeEvent;
}

function agentLockEvent(): AppendableKnowledgeEvent<"agent.lock.activated"> {
  return {
    type: "agent.lock.activated",
    version: 1,
    streamId: "agent_lock_lock_workspace_repair",
    context: {
      actor: domainActor,
      occurredAt: "2026-07-09T22:00:00.000Z",
      correlationId: "corr_lock_workspace_repair",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      lockId: "lock_workspace_repair",
      residentAgentId: "agent_resident_001",
      kind: "data-loss",
      activatedBy: domainActor.id,
      reason: "Workspace repair review is active."
    }
  };
}

function hashText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
