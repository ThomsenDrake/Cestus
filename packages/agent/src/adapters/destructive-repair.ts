import { createHash } from "node:crypto";
import {
  validateKnowledgeEvent,
  type ActorRef,
  type KnowledgeEvent
} from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import {
  checkBackupManifest,
  type BackupManifestInput
} from "../../../workspace-ops/src/backup.js";
import {
  proposedRepairActionSchema,
  type ManifestExportDto,
  type ProposedRepairActionDto
} from "../../../workspace-ops/src/contracts.js";
import type { WorkspaceFileSystem } from "../../../workspace-ops/src/filesystem.js";
import type { WorkspaceLayoutResult } from "../../../workspace-ops/src/layout.js";
import { verifyWorkspace, type WorkspaceEventReader } from "../../../workspace-ops/src/ops.js";
import {
  rebuildProjection,
  rebuildProjectionReadiness,
  type ProjectionArtifactFileSystem,
  type ProjectionBuilder
} from "../../../workspace-ops/src/projection-rebuild.js";
import type { AgentDomainExecutionAdapter } from "../domain-execution-dispatcher.js";
import { agentDomainExecutionFailure } from "../domain-execution-dispatcher.js";
import type {
  AgentDomainExecutionResult,
  AgentDomainPreview,
  AgentDomainToolDescriptor
} from "../domain-execution-descriptors.js";
import { buildAgentProjection } from "../projection.js";
import type {
  AgentApprovedToolActiveLock,
  AgentApprovedToolExecutionInput,
  AgentApprovedToolPreviewInput,
  AgentApprovedToolPreviewResult
} from "../scheduler-types.js";
import { assertAgentSecretSafeText } from "../secret-safety.js";
import { hashAgentToolPreview } from "../tool-gateway.js";

type ContentHash = `sha256:${string}`;

export interface WorkspaceRepairWorkspaceRef {
  readonly workspaceId: string;
  readonly label: string;
  readonly manifestVersion: number;
  readonly rootUri: string;
  readonly layoutContractVersion: string;
}

export interface WorkspaceRepairBackupManifestRef {
  readonly available: boolean;
  readonly manifestHash?: ContentHash;
  readonly ledgerHighWaterMark?: number;
  readonly stale: boolean;
}

export type WorkspaceRepairTarget =
  | {
      readonly kind: "projection";
      readonly projectionName: string;
      readonly rebuildId: string;
    }
  | {
      readonly kind: "canonical-root";
      readonly root: "ledger" | "blobs";
      readonly repairActionId: string;
    };

export interface WorkspaceRepairReadinessCheck {
  readonly checkId: string;
  readonly status: "pass" | "warning" | "fail";
  readonly safeMessage: string;
}

export interface WorkspaceRepairExpectedArtifactOutput {
  readonly artifactId: string;
  readonly relativePath: string;
  readonly artifactHash: ContentHash;
  readonly byteCount: number;
  readonly expendable: true;
}

export interface WorkspaceAppendOnlyRepairEventPlan {
  readonly required: boolean;
  readonly service: "AppendOnlyWorkspaceRepairService";
  readonly serviceAvailable: false;
  readonly status: "not-required-for-expendable-projection" | "blocked-service-unavailable";
}

export interface BuildDestructiveRepairPreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly workspace: WorkspaceRepairWorkspaceRef;
  readonly manifestHash: ContentHash;
  readonly ledgerHighWaterMark: number;
  readonly backupManifestRef: WorkspaceRepairBackupManifestRef;
  readonly target: WorkspaceRepairTarget;
  readonly proposedAction: ProposedRepairActionDto;
  readonly mutationClass: "expendable-projection-rebuild" | "canonical-repair";
  readonly dataLossRiskSummary: string;
  readonly readinessChecks: readonly WorkspaceRepairReadinessCheck[];
  readonly readinessDiagnosticsHash: ContentHash;
  readonly expectedArtifactOutputs: readonly WorkspaceRepairExpectedArtifactOutput[];
  readonly appendOnlyRepairEventPlan: WorkspaceAppendOnlyRepairEventPlan;
  readonly lockSnapshot: readonly AgentApprovedToolActiveLock[];
  readonly projectionHighWaterMark: number;
}

export interface WorkspaceProjectionRebuildAdapterContext {
  readonly ledger: EventLedger;
  readonly domainActor: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly layout: WorkspaceLayoutResult;
  readonly workspaceFileSystem: WorkspaceFileSystem;
  readonly projectionFileSystem: ProjectionArtifactFileSystem;
  readonly eventReader: WorkspaceEventReader;
  readonly builder: ProjectionBuilder;
  readonly projectionName: string;
  readonly rebuildId: string;
  readonly proposedAction: ProposedRepairActionDto;
  readonly dataLossRiskSummary: string;
  readonly readBackupManifest: () =>
    | BackupManifestInput
    | ManifestExportDto
    | undefined
    | Promise<BackupManifestInput | ManifestExportDto | undefined>;
}

export interface RebuildDestructiveRepairCurrentPreviewInput extends WorkspaceProjectionRebuildAdapterContext {
  readonly toolRequestId: string;
  readonly toolVersion: string;
  readonly runId: string;
}

export interface BlockedCanonicalRepairAdapterContext {
  readonly ledger: EventLedger;
  readonly domainActor: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly workspace: WorkspaceRepairWorkspaceRef;
  readonly manifestHash: ContentHash;
  readonly ledgerHighWaterMark: number;
  readonly backupManifestRef: WorkspaceRepairBackupManifestRef;
  readonly target: Extract<WorkspaceRepairTarget, { readonly kind: "canonical-root" }>;
  readonly proposedAction: ProposedRepairActionDto;
  readonly dataLossRiskSummary: string;
  readonly readinessChecks: readonly WorkspaceRepairReadinessCheck[];
  readonly readinessDiagnosticsHash: ContentHash;
}

interface ValidatedProjectionContext extends WorkspaceProjectionRebuildAdapterContext {
  readonly domainActor: ActorRef & { readonly kind: "human" };
  readonly proposedAction: ProposedRepairActionDto;
}

interface ValidatedCanonicalContext extends BlockedCanonicalRepairAdapterContext {
  readonly domainActor: ActorRef & { readonly kind: "human" };
  readonly workspace: WorkspaceRepairWorkspaceRef;
  readonly backupManifestRef: WorkspaceRepairBackupManifestRef;
  readonly target: Extract<WorkspaceRepairTarget, { readonly kind: "canonical-root" }>;
  readonly proposedAction: ProposedRepairActionDto;
  readonly readinessChecks: readonly WorkspaceRepairReadinessCheck[];
}

interface CurrentProjectionSnapshot {
  readonly previewInput: Omit<BuildDestructiveRepairPreviewInput,
    "toolRequestId" | "toolVersion" | "runId" | "taskId" | "residentAgentId" | "lockSnapshot">;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly events: readonly KnowledgeEvent[];
  readonly artifactContents: Readonly<Record<string, string>>;
}

const forbiddenCanonicalEffects = Object.freeze([
  "canonical-ledger-delete",
  "canonical-ledger-rewrite",
  "canonical-ledger-compaction",
  "canonical-ledger-reset",
  "canonical-blob-delete",
  "silent-canonical-migration",
  "repair-without-append-only-event",
  "direct-filesystem-mutation-outside-workspace-ops"
] as const);

export const workspaceProjectionRebuildDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "workspace.projection-rebuild.execute",
  toolVersion: "0.1.0",
  family: "destructive-repair",
  sideEffectClass: "destructive-or-repair",
  requiredApprovalClass: "destructive-or-repair",
  inputSchemaId: "workspace-projection-rebuild-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "workspace-ops.rebuildProjection",
  idempotencyKeyFields: ["workspaceId", "manifestHash", "ledgerHighWaterMark", "projectionName", "rebuildId"],
  forbiddenEffects: forbiddenCanonicalEffects
});

export const workspaceCanonicalRepairDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "workspace.canonical-repair.record",
  toolVersion: "0.1.0",
  family: "destructive-repair",
  sideEffectClass: "destructive-or-repair",
  requiredApprovalClass: "destructive-or-repair",
  inputSchemaId: "workspace-canonical-repair-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "AppendOnlyWorkspaceRepairService",
  idempotencyKeyFields: ["workspaceId", "manifestHash", "ledgerHighWaterMark", "repairActionId"],
  forbiddenEffects: forbiddenCanonicalEffects
});

export const destructiveRepairDescriptors = Object.freeze([
  workspaceProjectionRebuildDescriptor,
  workspaceCanonicalRepairDescriptor
] as const satisfies readonly AgentDomainToolDescriptor[]);

const previewInputKeys = new Set([
  "toolRequestId", "toolId", "toolVersion", "runId", "taskId", "residentAgentId", "workspace",
  "manifestHash", "ledgerHighWaterMark", "backupManifestRef", "target", "proposedAction", "mutationClass",
  "dataLossRiskSummary", "readinessChecks", "readinessDiagnosticsHash", "expectedArtifactOutputs",
  "appendOnlyRepairEventPlan", "lockSnapshot", "projectionHighWaterMark"
]);
const projectionContextKeys = new Set([
  "ledger", "domainActor", "residentAgentId", "taskId", "toolId", "layout", "workspaceFileSystem",
  "projectionFileSystem", "eventReader", "builder", "projectionName", "rebuildId", "proposedAction",
  "dataLossRiskSummary", "readBackupManifest"
]);
const projectionRebuildInputKeys = new Set([
  ...projectionContextKeys, "toolRequestId", "toolVersion", "runId"
]);
const canonicalContextKeys = new Set([
  "ledger", "domainActor", "residentAgentId", "taskId", "toolId", "workspace", "manifestHash",
  "ledgerHighWaterMark", "backupManifestRef", "target", "proposedAction", "dataLossRiskSummary",
  "readinessChecks", "readinessDiagnosticsHash"
]);
const executionInputKeys = new Set([
  "toolRequestId", "runId", "taskId", "toolId", "toolVersion", "sideEffectClass", "approvalClass",
  "previewHash", "approvedPreviewHash", "approvedBy", "sourceEventIds", "inputArtifactHashes",
  "provenanceRefs"
]);

export function buildDestructiveRepairApprovalPreview(
  input: BuildDestructiveRepairPreviewInput
): AgentDomainPreview {
  const value = validatePreviewInput(input);
  const descriptor = descriptorFor(value.toolId, value.toolVersion);
  const projectionTarget = value.target.kind === "projection";
  const backupHash = value.backupManifestRef.manifestHash;
  const artifactHashes = Object.freeze([
    value.manifestHash,
    ...(backupHash === undefined ? [] : [backupHash]),
    ...value.expectedArtifactOutputs.map((output) => output.artifactHash)
  ]);
  const consequence = projectionTarget
    ? "Human approval permits workspace-ops to rebuild only expendable projection artifacts after readiness is revalidated; canonical ledger and blob state remain unchanged."
    : "Canonical repair remains blocked because the required human-approved append-only repair event service is unavailable.";
  assertAgentSecretSafeText(consequence, "destructive repair preview consequence");

  return {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: value.toolRequestId,
    toolId: value.toolId,
    toolVersion: value.toolVersion,
    runId: value.runId,
    taskId: value.taskId,
    residentAgentId: value.residentAgentId,
    sideEffectClass: descriptor.sideEffectClass,
    requiredApprovalClass: descriptor.requiredApprovalClass,
    targetDomainService: descriptor.targetDomainService,
    inputSchemaId: descriptor.inputSchemaId,
    normalizedInputHash: sha256(stableJson({
      workspace: value.workspace,
      manifestHash: value.manifestHash,
      ledgerHighWaterMark: value.ledgerHighWaterMark,
      backupManifestRef: value.backupManifestRef,
      target: value.target,
      proposedAction: value.proposedAction,
      mutationClass: value.mutationClass,
      dataLossRiskSummary: value.dataLossRiskSummary,
      readinessChecks: value.readinessChecks,
      readinessDiagnosticsHash: value.readinessDiagnosticsHash,
      expectedArtifactOutputs: value.expectedArtifactOutputs,
      appendOnlyRepairEventPlan: value.appendOnlyRepairEventPlan,
      lockSnapshot: value.lockSnapshot
    })),
    summary: projectionTarget
      ? `Review expendable projection rebuild ${value.target.rebuildId}.`
      : `Review blocked canonical repair ${value.target.repairActionId}.`,
    scope: projectionTarget
      ? `Projection ${value.target.projectionName}; ${value.expectedArtifactOutputs.length} expected artifact(s).`
      : `Canonical ${value.target.root} root; no mutation is available.`,
    estimatedEffect: projectionTarget
      ? "Replace expendable projection artifacts through workspace-ops temp-write and promotion semantics."
      : "No effect; execution stops with data-loss-risk.",
    consequence,
    affectedRefs: [
      {
        kind: "workspace",
        id: value.workspace.workspaceId,
        manifestVersion: value.workspace.manifestVersion,
        layoutContractVersion: value.workspace.layoutContractVersion,
        rootRef: "workspace-root"
      },
      { kind: "workspace-manifest", hash: value.manifestHash },
      ...(backupHash === undefined ? [] : [{ kind: "backup-manifest", hash: backupHash }]),
      ...value.expectedArtifactOutputs.map((output) => ({
        kind: "projection-artifact",
        id: output.artifactId,
        relativePath: output.relativePath,
        hash: output.artifactHash,
        expendable: true
      }))
    ],
    expectedOutputs: projectionTarget
      ? value.expectedArtifactOutputs.map((output) => ({
          kind: "expendable-projection-artifact",
          artifactId: output.artifactId,
          hash: output.artifactHash
        }))
      : [{ kind: "safe-failure", category: "data-loss-risk" }],
    contextPackRefs: [{
      kind: "workspace-layout",
      version: value.workspace.layoutContractVersion,
      manifestHash: value.manifestHash
    }],
    governancePolicyVersion: value.workspace.layoutContractVersion,
    lockSnapshot: value.lockSnapshot.map((lock) => ({ ...lock })),
    projectionHighWaterMarks: [{
      projectionName: "workspace-ledger",
      highWaterMark: value.projectionHighWaterMark
    }],
    idempotencyKey: projectionTarget
      ? [value.toolId, value.workspace.workspaceId, value.manifestHash, value.ledgerHighWaterMark,
          value.target.projectionName, value.target.rebuildId].join(":")
      : [value.toolId, value.workspace.workspaceId, value.manifestHash, value.ledgerHighWaterMark,
          value.target.root, value.target.repairActionId].join(":"),
    staleAfter: {
      kind: "workspace-manifest-ledger-backup-readiness-output-or-lock-change",
      refs: [
        value.workspace.workspaceId,
        value.manifestHash,
        value.readinessDiagnosticsHash,
        ...(backupHash === undefined ? [] : [backupHash]),
        ...value.expectedArtifactOutputs.map((output) => output.artifactHash)
      ]
    },
    relatedEventIds: [],
    artifactHashes,
    workspace: {
      workspaceId: value.workspace.workspaceId,
      label: value.workspace.label,
      manifestVersion: value.workspace.manifestVersion,
      layoutContractVersion: value.workspace.layoutContractVersion,
      rootRef: "workspace-root"
    },
    manifestHash: value.manifestHash,
    ledgerHighWaterMark: value.ledgerHighWaterMark,
    backupManifestRef: { ...value.backupManifestRef },
    target: { ...value.target },
    proposedAction: { ...value.proposedAction, allowedNextCommands: [...value.proposedAction.allowedNextCommands] },
    mutationClass: value.mutationClass,
    dataLossRiskSummary: value.dataLossRiskSummary,
    readinessChecks: value.readinessChecks.map((check) => ({ ...check })),
    readinessDiagnosticsHash: value.readinessDiagnosticsHash,
    expectedArtifactOutputs: value.expectedArtifactOutputs.map((output) => ({ ...output })),
    appendOnlyRepairEventPlan: { ...value.appendOnlyRepairEventPlan }
  };
}

export async function rebuildDestructiveRepairCurrentPreview(
  input: RebuildDestructiveRepairCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "destructive repair current-preview input");
  rejectUnsupportedKeys(record, projectionRebuildInputKeys, "destructive repair current-preview input");
  const context = validatedProjectionContextFromRecord(record);
  const toolRequestId = readString(record, "toolRequestId", "destructive repair current-preview input");
  const toolVersion = readString(record, "toolVersion", "destructive repair current-preview input");
  descriptorFor(context.toolId, toolVersion);
  const runId = readString(record, "runId", "destructive repair current-preview input");
  const snapshot = await readCurrentProjectionSnapshot(context);
  const activeLocks = await readActiveLocks(context.ledger, context.residentAgentId);
  const preview = buildDestructiveRepairApprovalPreview({
    ...snapshot.previewInput,
    toolRequestId,
    toolVersion,
    runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    lockSnapshot: activeLocks
  });

  return {
    preview,
    sourceEventIds: snapshot.sourceEventIds,
    inputArtifactHashes: snapshot.inputArtifactHashes,
    provenanceRefs: snapshot.provenanceRefs,
    activeLocks,
    freshnessChecks: [
      { name: "workspace-verification", expected: "ready", actual: "ready", ok: true },
      { name: "projection-readiness", expected: "ready", actual: "ready", ok: true },
      { name: "backup-manifest", expected: "ready", actual: "ready", ok: true },
      { name: "prior-artifact-preservation", expected: "pass", actual: "pass", ok: true }
    ]
  };
}

export async function rebuildBlockedCanonicalRepairCurrentPreview(
  input: BlockedCanonicalRepairAdapterContext,
  request: AgentApprovedToolPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "blocked canonical repair current-preview input");
  rejectUnsupportedKeys(record, canonicalContextKeys, "blocked canonical repair current-preview input");
  const context = validatedCanonicalContextFromRecord(record);
  const activeLocks = await readActiveLocks(context.ledger, context.residentAgentId);
  return {
    preview: canonicalPreviewFor(context, request, activeLocks),
    sourceEventIds: [],
    inputArtifactHashes: canonicalArtifactHashes(context),
    provenanceRefs: canonicalProvenanceRefs(context),
    activeLocks,
    freshnessChecks: [{
      name: "append-only-repair-service",
      expected: "unavailable",
      actual: "unavailable",
      ok: true
    }]
  };
}

export function createWorkspaceProjectionRebuildAdapter(
  input: WorkspaceProjectionRebuildAdapterContext
): AgentDomainExecutionAdapter {
  const record = dataRecordFromObject(input, "workspace projection rebuild adapter input");
  rejectUnsupportedKeys(record, projectionContextKeys, "workspace projection rebuild adapter input");
  const context = validatedProjectionContextFromRecord(record);
  return Object.freeze({
    descriptor: workspaceProjectionRebuildDescriptor,
    buildCurrentPreview(request: AgentApprovedToolPreviewInput) {
      return rebuildDestructiveRepairCurrentPreview({
        ...context,
        toolRequestId: request.toolRequestId,
        toolVersion: request.toolVersion,
        runId: request.runId
      });
    },
    executeApproved(request: AgentApprovedToolExecutionInput) {
      return executeProjectionRebuild(context, request);
    }
  });
}

export function createBlockedCanonicalRepairAdapter(
  input: BlockedCanonicalRepairAdapterContext
): AgentDomainExecutionAdapter {
  const record = dataRecordFromObject(input, "blocked canonical repair adapter input");
  rejectUnsupportedKeys(record, canonicalContextKeys, "blocked canonical repair adapter input");
  const context = validatedCanonicalContextFromRecord(record);
  return Object.freeze({
    descriptor: workspaceCanonicalRepairDescriptor,
    buildCurrentPreview(request: AgentApprovedToolPreviewInput) {
      return rebuildBlockedCanonicalRepairCurrentPreview(context, request);
    },
    async executeApproved(request: AgentApprovedToolExecutionInput): Promise<AgentDomainExecutionResult> {
      const execution = validateExecutionInput(context, request);
      const activeLocks = await readActiveLocks(context.ledger, context.residentAgentId);
      if (activeLocks.length > 0) {
        throw lockFailure();
      }
      const currentPreview = canonicalPreviewFor(context, {
        toolRequestId: execution.toolRequestId,
        runId: execution.runId,
        taskId: context.taskId,
        toolId: execution.toolId,
        toolVersion: execution.toolVersion,
        requestedPreviewHash: execution.approvedPreviewHash
      }, []);
      if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
        throw staleApprovalFailure("The blocked canonical repair preview changed after approval.");
      }
      if (execution.sourceEventIds.length > 0) {
        throw staleApprovalFailure("Blocked canonical repair cannot claim source events without a repair service.");
      }
      if (!sameOrderedStrings(execution.inputArtifactHashes, canonicalArtifactHashes(context))) {
        throw staleApprovalFailure("The blocked canonical repair manifest or backup binding changed after approval.");
      }
      if (!sameOrderedStrings(execution.provenanceRefs, canonicalProvenanceRefs(context))) {
        throw provenanceFailure();
      }
      throw dataLossRiskFailure();
    }
  });
}

async function executeProjectionRebuild(
  context: ValidatedProjectionContext,
  input: AgentApprovedToolExecutionInput
): Promise<AgentDomainExecutionResult> {
  const execution = validateExecutionInput(context, input);
  const activeLocks = await readActiveLocks(context.ledger, context.residentAgentId);
  if (activeLocks.length > 0) {
    throw lockFailure();
  }
  const snapshot = await readCurrentProjectionSnapshot(context);
  const currentPreview = buildDestructiveRepairApprovalPreview({
    ...snapshot.previewInput,
    toolRequestId: execution.toolRequestId,
    toolVersion: execution.toolVersion,
    runId: execution.runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    lockSnapshot: []
  });
  if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
    throw staleApprovalFailure("The workspace projection rebuild preview changed after approval.");
  }
  if (!sameOrderedStrings(execution.sourceEventIds, snapshot.sourceEventIds)) {
    throw staleApprovalFailure("The workspace ledger high-water state changed after approval.");
  }
  if (!sameOrderedStrings(execution.inputArtifactHashes, snapshot.inputArtifactHashes)) {
    throw staleApprovalFailure("The workspace manifest, backup, or expected projection outputs changed after approval.");
  }
  if (!sameOrderedStrings(execution.provenanceRefs, snapshot.provenanceRefs)) {
    throw provenanceFailure();
  }

  const layout = requireResolvedLayout(context.layout);
  const frozenReader: WorkspaceEventReader = {
    readAll: async () => snapshot.events.map((event) => structuredClone(event))
  };
  const frozenContents = Object.freeze({ ...snapshot.artifactContents });
  const frozenBuilder: ProjectionBuilder = {
    projectionName: context.projectionName,
    build: async () => ({ ...frozenContents })
  };
  let result: Awaited<ReturnType<typeof rebuildProjection>>;
  try {
    result = await rebuildProjection({
      layout,
      projectionName: context.projectionName,
      rebuildId: context.rebuildId,
      fileSystem: context.projectionFileSystem,
      eventReader: frozenReader,
      builder: frozenBuilder
    });
  } catch {
    throw domainGateFailure("Workspace-ops did not complete the approved expendable projection rebuild.");
  }
  const payload = result.payload;
  if (
    result.command !== "projection rebuild" ||
    result.status !== "ready" ||
    payload === undefined ||
    payload.mode !== "result" ||
    !payload.readiness.ready ||
    !payload.wroteExpendableArtifactsOnly ||
    payload.failures.length > 0 ||
    !payload.readiness.checks.some((check) =>
      check.checkId === "prior_artifacts_preserved" && check.status === "pass"
    ) ||
    !resultArtifactsMatch(payload.artifactOutputs, snapshot.previewInput.expectedArtifactOutputs, context.projectionName)
  ) {
    throw domainGateFailure("Workspace-ops returned a projection rebuild result outside the approved expendable plan.");
  }

  const artifactHashes = payload.artifactOutputs.map((output) => output.artifactHash as ContentHash);
  const artifactIds = payload.artifactOutputs.map((output) => output.artifactId);
  return {
    eventIds: [],
    artifactHashes,
    readModelChanges: [{
      projectionName: "workspace-projection-artifacts",
      change: `rebuilt ${artifactIds.length} expendable projection artifact${artifactIds.length === 1 ? "" : "s"}`,
      relatedIds: [context.projectionName, context.rebuildId, ...artifactIds]
    }],
    resultSummary: "Workspace-ops rebuilt the approved expendable projection artifacts."
  };
}

function validatedProjectionContextFromRecord(record: Record<string, unknown>): ValidatedProjectionContext {
  const ledger = readData(record, "ledger", "workspace projection rebuild adapter input") as EventLedger;
  requireCallable(ledger, "readAll", "workspace projection rebuild ledger");
  requireCallable(ledger, "readStream", "workspace projection rebuild ledger");
  const domainActor = readActor(record, "domainActor", "workspace projection rebuild adapter input");
  if (domainActor.kind !== "human") {
    throw new Error("Workspace projection rebuild requires a human domain actor.");
  }
  const toolId = readString(record, "toolId", "workspace projection rebuild adapter input");
  if (descriptorFor(toolId, workspaceProjectionRebuildDescriptor.toolVersion) !== workspaceProjectionRebuildDescriptor) {
    throw new Error("Workspace projection rebuild requires its canonical descriptor.");
  }
  const layout = readData(record, "layout", "workspace projection rebuild adapter input") as WorkspaceLayoutResult;
  if (typeof layout !== "object" || layout === null) {
    throw new Error("Workspace projection rebuild layout is required.");
  }
  const workspaceFileSystem = readData(
    record,
    "workspaceFileSystem",
    "workspace projection rebuild adapter input"
  ) as WorkspaceFileSystem;
  for (const method of ["exists", "readText", "stat", "list", "realpath", "availableBytes"] as const) {
    requireCallable(workspaceFileSystem, method, "workspace projection rebuild workspace file system");
  }
  const projectionFileSystem = readData(
    record,
    "projectionFileSystem",
    "workspace projection rebuild adapter input"
  ) as ProjectionArtifactFileSystem;
  for (const method of ["exists", "writeText", "remove", "promoteDirectory", "availableBytes"] as const) {
    requireCallable(projectionFileSystem, method, "workspace projection rebuild projection file system");
  }
  const eventReader = readData(record, "eventReader", "workspace projection rebuild adapter input") as WorkspaceEventReader;
  requireCallable(eventReader, "readAll", "workspace projection rebuild event reader");
  const builder = readData(record, "builder", "workspace projection rebuild adapter input") as ProjectionBuilder;
  requireCallable(builder, "build", "workspace projection rebuild builder");
  const projectionName = readSafeSegment(
    record,
    "projectionName",
    "workspace projection rebuild target projection"
  );
  if (builder.projectionName !== projectionName) {
    throw new Error("Workspace projection rebuild builder must match the target projection.");
  }
  const proposedAction = readProposedAction(
    record,
    "proposedAction",
    "workspace projection rebuild adapter input"
  );
  if (proposedAction.kind !== "rebuild-projection" || proposedAction.mutatesCanonicalState) {
    throw new Error("Workspace projection rebuild action must be a noncanonical rebuild-projection action.");
  }
  const readBackupManifest = readCallableDataProperty(
    record,
    "readBackupManifest",
    "workspace projection rebuild backup manifest reader"
  ) as ValidatedProjectionContext["readBackupManifest"];

  return {
    ledger,
    domainActor: Object.freeze({ ...domainActor, kind: "human" as const }),
    residentAgentId: readString(record, "residentAgentId", "workspace projection rebuild adapter input"),
    taskId: readString(record, "taskId", "workspace projection rebuild adapter input"),
    toolId,
    layout,
    workspaceFileSystem,
    projectionFileSystem,
    eventReader,
    builder,
    projectionName,
    rebuildId: readSafeSegment(record, "rebuildId", "workspace projection rebuild ID"),
    proposedAction,
    dataLossRiskSummary: readString(
      record,
      "dataLossRiskSummary",
      "workspace projection rebuild adapter input"
    ),
    readBackupManifest
  };
}

function validatedCanonicalContextFromRecord(record: Record<string, unknown>): ValidatedCanonicalContext {
  const ledger = readData(record, "ledger", "blocked canonical repair adapter input") as EventLedger;
  requireCallable(ledger, "readAll", "blocked canonical repair ledger");
  requireCallable(ledger, "readStream", "blocked canonical repair ledger");
  const domainActor = readActor(record, "domainActor", "blocked canonical repair adapter input");
  if (domainActor.kind !== "human") {
    throw new Error("Blocked canonical repair requires a human domain actor.");
  }
  const toolId = readString(record, "toolId", "blocked canonical repair adapter input");
  if (descriptorFor(toolId, workspaceCanonicalRepairDescriptor.toolVersion) !== workspaceCanonicalRepairDescriptor) {
    throw new Error("Blocked canonical repair requires its canonical descriptor.");
  }
  const target = readTarget(record, "target", "blocked canonical repair adapter input");
  if (target.kind !== "canonical-root") {
    throw new Error("Blocked canonical repair requires a canonical ledger or blob target.");
  }
  const proposedAction = readProposedAction(record, "proposedAction", "blocked canonical repair adapter input");
  if (proposedAction.kind !== "append-repair-event-required" || !proposedAction.mutatesCanonicalState) {
    throw new Error("Blocked canonical repair requires an append-only repair-event action.");
  }
  if (target.repairActionId !== proposedAction.actionId) {
    throw new Error("Blocked canonical repair target must match the proposed repair action.");
  }
  return {
    ledger,
    domainActor: Object.freeze({ ...domainActor, kind: "human" as const }),
    residentAgentId: readString(record, "residentAgentId", "blocked canonical repair adapter input"),
    taskId: readString(record, "taskId", "blocked canonical repair adapter input"),
    toolId,
    workspace: readWorkspaceRef(record, "workspace", "blocked canonical repair adapter input"),
    manifestHash: readHash(record, "manifestHash", "blocked canonical repair adapter input"),
    ledgerHighWaterMark: readNonNegativeInteger(
      record,
      "ledgerHighWaterMark",
      "blocked canonical repair adapter input"
    ),
    backupManifestRef: readBackupManifestRef(
      record,
      "backupManifestRef",
      "blocked canonical repair adapter input"
    ),
    target,
    proposedAction,
    dataLossRiskSummary: readString(record, "dataLossRiskSummary", "blocked canonical repair adapter input"),
    readinessChecks: readReadinessChecks(
      record,
      "readinessChecks",
      "blocked canonical repair adapter input"
    ),
    readinessDiagnosticsHash: readHash(
      record,
      "readinessDiagnosticsHash",
      "blocked canonical repair adapter input"
    )
  };
}

async function readCurrentProjectionSnapshot(
  context: ValidatedProjectionContext
): Promise<CurrentProjectionSnapshot> {
  const layout = requireResolvedLayout(context.layout);
  const workspace = context.layout.workspace;
  if (workspace === undefined || workspace.manifestVersion === undefined) {
    throw staleApprovalFailure("Workspace identity or manifest version is no longer resolved.");
  }
  let rawManifest: string;
  let rawEvents: readonly unknown[];
  let rawBackupManifest: BackupManifestInput | ManifestExportDto | undefined;
  try {
    rawManifest = await context.workspaceFileSystem.readText(layout.manifestPath);
    rawEvents = await context.eventReader.readAll(layout);
    rawBackupManifest = await context.readBackupManifest();
  } catch {
    throw staleApprovalFailure("Workspace manifest, ledger, or backup state could not be rebuilt safely.");
  }
  const events: KnowledgeEvent[] = [];
  for (const rawEvent of rawEvents) {
    const parsed = validateKnowledgeEvent(rawEvent);
    if (!parsed.success) {
      throw staleApprovalFailure("Workspace ledger events changed or failed validation after approval.");
    }
    events.push(parsed.data);
  }
  const frozenReader: WorkspaceEventReader = {
    readAll: async () => events.map((event) => structuredClone(event))
  };
  const frozenWorkspaceFileSystem = workspaceFileSystemWithManifest(
    context.workspaceFileSystem,
    layout.manifestPath,
    rawManifest
  );
  const verification = await verifyWorkspace({
    layout: context.layout,
    fileSystem: frozenWorkspaceFileSystem,
    eventReader: frozenReader
  });
  if (
    verification.status !== "ready" ||
    verification.payload === undefined ||
    verification.workspace === undefined ||
    verification.workspace.workspaceId !== workspace.workspaceId ||
    verification.payload.ledger.highWaterMark !== events.length ||
    !verification.payload.projections.rebuildable
  ) {
    throw staleApprovalFailure("Workspace verification changed or no longer permits projection rebuild.");
  }
  const readiness = await rebuildProjectionReadiness({
    layout,
    projectionName: context.projectionName,
    fileSystem: context.projectionFileSystem,
    eventReader: frozenReader
  });
  if (
    readiness.status !== "ready" ||
    readiness.payload === undefined ||
    !readiness.payload.readiness.ready ||
    readiness.payload.inputLedger.highWaterMark !== events.length ||
    !readiness.payload.readiness.checks.some((check) =>
      check.checkId === "prior_artifacts_preserved" && check.status === "pass"
    )
  ) {
    throw staleApprovalFailure("Workspace projection readiness changed or no longer preserves prior artifacts.");
  }
  const clonedBackup = rawBackupManifest === undefined
    ? undefined
    : clonePlainJson(rawBackupManifest, "workspace projection rebuild backup manifest") as
      BackupManifestInput | ManifestExportDto;
  const backupCheck = await checkBackupManifest({
    workspace: verification.workspace,
    currentLedgerHighWaterMark: events.length,
    backupManifest: clonedBackup
  });
  if (
    backupCheck.status !== "ready" ||
    backupCheck.payload === undefined ||
    !backupCheck.payload.backupManifestPresent ||
    !backupCheck.payload.identityMatches ||
    !backupCheck.payload.layoutContractMatches ||
    backupCheck.payload.stale ||
    backupCheck.payload.containsSecretShapedFields
  ) {
    throw staleApprovalFailure("Workspace backup manifest changed or is no longer current.");
  }
  let rawArtifacts: Record<string, string>;
  try {
    rawArtifacts = await context.builder.build(events.map((event) => structuredClone(event)));
  } catch {
    throw staleApprovalFailure("Workspace projection output planning changed or failed safely.");
  }
  const artifactContents = readArtifactContents(rawArtifacts, context.projectionName);
  const expectedArtifactOutputs = expectedArtifactOutputsFor(artifactContents, context.projectionName);
  if (expectedArtifactOutputs.length === 0) {
    throw staleApprovalFailure("Workspace projection builder produced no expendable artifacts.");
  }
  const manifestHash = sha256(rawManifest);
  const backupManifestHash = sha256(stableJson(clonedBackup));
  const backupManifestRef: WorkspaceRepairBackupManifestRef = Object.freeze({
    available: true,
    manifestHash: backupManifestHash,
    ledgerHighWaterMark: backupCheck.payload.backupLedgerHighWaterMark!,
    stale: false
  });
  const readinessDiagnosticsHash = sha256(stableJson({
    workspaceStatus: verification.status,
    workspaceDiagnostics: verification.diagnostics,
    workspaceActions: verification.proposedActions,
    backupStatus: backupCheck.status,
    backupDiagnostics: backupCheck.diagnostics,
    backupActions: backupCheck.proposedActions,
    readinessStatus: readiness.status,
    readinessChecks: readiness.payload.readiness.checks,
    readinessDiagnostics: readiness.diagnostics,
    readinessActions: readiness.proposedActions
  }));
  const workspaceRef: WorkspaceRepairWorkspaceRef = Object.freeze({
    workspaceId: verification.workspace.workspaceId,
    label: verification.workspace.label,
    manifestVersion: verification.workspace.manifestVersion,
    rootUri: verification.workspace.rootUri,
    layoutContractVersion: verification.workspace.layoutContractVersion
  });
  const previewInput = Object.freeze({
    toolId: context.toolId,
    workspace: workspaceRef,
    manifestHash,
    ledgerHighWaterMark: events.length,
    backupManifestRef,
    target: Object.freeze({
      kind: "projection" as const,
      projectionName: context.projectionName,
      rebuildId: context.rebuildId
    }),
    proposedAction: context.proposedAction,
    mutationClass: "expendable-projection-rebuild" as const,
    dataLossRiskSummary: context.dataLossRiskSummary,
    readinessChecks: Object.freeze(readiness.payload.readiness.checks.map((check) => Object.freeze({ ...check }))),
    readinessDiagnosticsHash,
    expectedArtifactOutputs,
    appendOnlyRepairEventPlan: Object.freeze({
      required: false,
      service: "AppendOnlyWorkspaceRepairService" as const,
      serviceAvailable: false as const,
      status: "not-required-for-expendable-projection" as const
    }),
    projectionHighWaterMark: events.length
  });
  const sourceEventIds = Object.freeze(events.map((event) => event.id));
  const inputArtifactHashes = Object.freeze([
    manifestHash,
    backupManifestHash,
    ...expectedArtifactOutputs.map((output) => output.artifactHash)
  ]);
  const provenanceRefs = Object.freeze([
    `workspace:${workspaceRef.workspaceId}`,
    `manifest:${manifestHash}`,
    `backup:${backupManifestHash}:${backupManifestRef.ledgerHighWaterMark}`,
    `ledger-high-water:${events.length}`,
    `projection:${context.projectionName}:${context.rebuildId}`,
    `repair-action:${context.proposedAction.actionId}:${sha256(stableJson(context.proposedAction))}`,
    `readiness:${readinessDiagnosticsHash}`,
    ...expectedArtifactOutputs.map((output) =>
      `projection-artifact:${output.artifactId}:${output.artifactHash}`
    )
  ]);
  provenanceRefs.forEach((ref) => assertAgentSecretSafeText(ref, "workspace projection provenance"));
  return {
    previewInput,
    sourceEventIds,
    inputArtifactHashes,
    provenanceRefs,
    events: Object.freeze(events.map((event) => structuredClone(event))),
    artifactContents
  };
}

function requireResolvedLayout(layoutResult: WorkspaceLayoutResult) {
  if (layoutResult.layout === undefined || layoutResult.workspace === undefined) {
    throw staleApprovalFailure("Workspace layout identity is no longer resolved.");
  }
  return layoutResult.layout;
}

function workspaceFileSystemWithManifest(
  fileSystem: WorkspaceFileSystem,
  manifestPath: string,
  manifestText: string
): WorkspaceFileSystem {
  return {
    exists: (path) => fileSystem.exists(path),
    readText: (path) => path === manifestPath ? Promise.resolve(manifestText) : fileSystem.readText(path),
    stat: (path) => fileSystem.stat(path),
    lstat: (path) => fileSystem.lstat === undefined ? fileSystem.stat(path) : fileSystem.lstat(path),
    list: (path) => fileSystem.list(path),
    realpath: (path) => fileSystem.realpath(path),
    availableBytes: (path) => fileSystem.availableBytes(path)
  };
}

function readArtifactContents(value: unknown, projectionName: string): Readonly<Record<string, string>> {
  const record = dataRecordFromObject(value, "workspace projection builder output");
  const output: Record<string, string> = {};
  for (const artifactName of Object.keys(record).sort()) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(artifactName) || artifactName === "." || artifactName === "..") {
      throw staleApprovalFailure("Workspace projection builder returned an unsafe artifact name.");
    }
    const content = record[artifactName];
    if (typeof content !== "string") {
      throw staleApprovalFailure("Workspace projection builder returned a non-text artifact.");
    }
    assertAgentSecretSafeText(artifactName, `workspace ${projectionName} artifact name`);
    output[artifactName] = content;
  }
  return Object.freeze(output);
}

function expectedArtifactOutputsFor(
  contents: Readonly<Record<string, string>>,
  projectionName: string
): readonly WorkspaceRepairExpectedArtifactOutput[] {
  return Object.freeze(Object.entries(contents).map(([artifactName, content]) => Object.freeze({
    artifactId: artifactIdFor(projectionName, artifactName),
    relativePath: `projections/${projectionName}/${artifactName}`,
    artifactHash: sha256(content),
    byteCount: Buffer.byteLength(content, "utf8"),
    expendable: true as const
  })));
}

function artifactIdFor(projectionName: string, artifactName: string): string {
  return `artifact_${identifierPart(projectionName)}_${identifierPart(artifactName)}`;
}

function identifierPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "artifact";
}

function resultArtifactsMatch(
  actual: readonly {
    readonly projectionName: string;
    readonly artifactId: string;
    readonly artifactHash?: string | undefined;
    readonly byteCount: number;
    readonly expendable: true;
  }[],
  expected: readonly WorkspaceRepairExpectedArtifactOutput[],
  projectionName: string
): boolean {
  return actual.length === expected.length && actual.every((output, index) => {
    const planned = expected[index];
    return planned !== undefined &&
      output.projectionName === projectionName &&
      output.artifactId === planned.artifactId &&
      output.artifactHash === planned.artifactHash &&
      output.byteCount === planned.byteCount &&
      output.expendable;
  });
}

function canonicalPreviewFor(
  context: ValidatedCanonicalContext,
  request: AgentApprovedToolPreviewInput,
  activeLocks: readonly AgentApprovedToolActiveLock[]
): AgentDomainPreview {
  if (request.toolId !== context.toolId || request.toolVersion !== workspaceCanonicalRepairDescriptor.toolVersion) {
    throw permissionFailure("Canonical repair preview requires the registered fail-closed descriptor.");
  }
  if (request.taskId !== undefined && request.taskId !== context.taskId) {
    throw staleApprovalFailure("Canonical repair task identity changed after approval.");
  }
  return buildDestructiveRepairApprovalPreview({
    toolRequestId: request.toolRequestId,
    toolId: context.toolId,
    toolVersion: request.toolVersion,
    runId: request.runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    workspace: context.workspace,
    manifestHash: context.manifestHash,
    ledgerHighWaterMark: context.ledgerHighWaterMark,
    backupManifestRef: context.backupManifestRef,
    target: context.target,
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
    lockSnapshot: activeLocks,
    projectionHighWaterMark: context.ledgerHighWaterMark
  });
}

function canonicalArtifactHashes(context: ValidatedCanonicalContext): readonly string[] {
  return Object.freeze([
    context.manifestHash,
    ...(context.backupManifestRef.manifestHash === undefined ? [] : [context.backupManifestRef.manifestHash])
  ]);
}

function canonicalProvenanceRefs(context: ValidatedCanonicalContext): readonly string[] {
  return Object.freeze([
    `workspace:${context.workspace.workspaceId}`,
    `manifest:${context.manifestHash}`,
    `ledger-high-water:${context.ledgerHighWaterMark}`,
    `canonical-root:${context.target.root}`,
    `repair-action:${context.target.repairActionId}`,
    "append-only-repair-service:unavailable"
  ]);
}

async function readActiveLocks(
  ledger: EventLedger,
  residentAgentId: string
): Promise<readonly AgentApprovedToolActiveLock[]> {
  const projection = buildAgentProjection(await ledger.readAll());
  return Object.freeze([...projection.locks.values()]
    .filter((lock) => lock.residentAgentId === residentAgentId && lock.state === "active")
    .map((lock) => Object.freeze({
      lockId: lock.lockId,
      category: lock.kind,
      message: lock.reason
    }))
    .sort((left, right) => left.lockId.localeCompare(right.lockId)));
}

function validateExecutionInput(
  context: { readonly taskId: string; readonly toolId: string; readonly domainActor: ActorRef },
  input: AgentApprovedToolExecutionInput
): AgentApprovedToolExecutionInput {
  let record: Record<string, unknown>;
  try {
    record = dataRecordFromObject(input, "destructive repair approved execution input");
    rejectUnsupportedKeys(record, executionInputKeys, "destructive repair approved execution input");
  } catch {
    throw permissionFailure("Destructive repair execution input must be a plain approved-execution DTO.");
  }
  try {
    const toolId = readString(record, "toolId", "destructive repair approved execution input");
    const toolVersion = readString(record, "toolVersion", "destructive repair approved execution input");
    descriptorFor(toolId, toolVersion);
    const taskId = Object.hasOwn(record, "taskId") && record.taskId !== undefined
      ? readString(record, "taskId", "destructive repair approved execution input")
      : undefined;
    const sideEffectClass = readString(record, "sideEffectClass", "destructive repair approved execution input");
    const approvalClass = readString(record, "approvalClass", "destructive repair approved execution input");
    const previewHash = readHash(record, "previewHash", "destructive repair approved execution input");
    const approvedPreviewHash = readHash(
      record,
      "approvedPreviewHash",
      "destructive repair approved execution input"
    );
    const approvedBy = readString(record, "approvedBy", "destructive repair approved execution input");
    if (
      toolId !== context.toolId ||
      (taskId !== undefined && taskId !== context.taskId) ||
      sideEffectClass !== "destructive-or-repair" ||
      approvalClass !== "destructive-or-repair" ||
      approvedBy !== context.domainActor.id ||
      previewHash !== approvedPreviewHash
    ) {
      throw new Error("Destructive repair execution metadata mismatch.");
    }
    return {
      toolRequestId: readString(record, "toolRequestId", "destructive repair approved execution input"),
      runId: readString(record, "runId", "destructive repair approved execution input"),
      ...(taskId === undefined ? {} : { taskId }),
      toolId,
      toolVersion,
      sideEffectClass,
      approvalClass,
      previewHash,
      approvedPreviewHash,
      approvedBy,
      sourceEventIds: readUniqueStringArray(
        record,
        "sourceEventIds",
        "destructive repair source event IDs",
        /^evt_[a-zA-Z0-9_-]+$/,
        false
      ),
      inputArtifactHashes: readUniqueStringArray(
        record,
        "inputArtifactHashes",
        "destructive repair input artifact hashes",
        /^sha256:[a-f0-9]{64}$/,
        true
      ),
      provenanceRefs: readUniqueStringArray(
        record,
        "provenanceRefs",
        "destructive repair provenance refs",
        /^.+$/,
        true
      )
    };
  } catch (error) {
    if (isAgentExecutionFailure(error)) {
      throw error;
    }
    throw permissionFailure("Destructive repair execution metadata does not match the approved request.");
  }
}

function readActor(record: Record<string, unknown>, key: string, label: string): ActorRef {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set(["id", "kind", "label"]), `${label} actor`);
  const kind = readString(value, "kind", `${label} actor`);
  if (kind !== "human" && kind !== "extractor" && kind !== "system" && kind !== "agent") {
    throw new Error(`${label} actor kind is unsupported.`);
  }
  return Object.freeze({
    id: readString(value, "id", `${label} actor`),
    kind,
    label: readString(value, "label", `${label} actor`)
  });
}

function readCallableDataProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): (...args: never[]) => unknown {
  const value = readData(record, key, label);
  if (typeof value !== "function") {
    throw new Error(`${label} must be callable.`);
  }
  return value as (...args: never[]) => unknown;
}

function requireCallable(value: unknown, key: string, label: string): void {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new Error(`${label} is required.`);
  }
  if (typeof (value as Record<string, unknown>)[key] !== "function") {
    throw new Error(`${label} must provide ${key}.`);
  }
}

function readUniqueStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
  pattern: RegExp,
  requireNonEmpty: boolean
): readonly string[] {
  const cloned = clonePlainJson(readData(record, key, label), label);
  if (!Array.isArray(cloned) || cloned.some((item) => typeof item !== "string" || !pattern.test(item))) {
    throw new Error(`${label} must contain canonical strings.`);
  }
  if (requireNonEmpty && cloned.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  if (new Set(cloned).size !== cloned.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  (cloned as string[]).forEach((item) => assertAgentSecretSafeText(item, label));
  return Object.freeze([...(cloned as string[])]);
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function staleApprovalFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "approval-stale",
    message,
    retryable: false,
    allowedActions: ["rebuild workspace projection readiness", "request a new destructive-repair approval"]
  });
}

function provenanceFailure() {
  return agentDomainExecutionFailure({
    category: "provenance-missing",
    message: "Workspace repair provenance does not match the approved manifest, backup, ledger, and outputs.",
    retryable: false,
    allowedActions: ["inspect workspace repair provenance", "rebuild the projection preview"]
  });
}

function permissionFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "permission-denied",
    message,
    retryable: false,
    allowedActions: ["submit the exact human-approved destructive-repair execution DTO"]
  });
}

function lockFailure() {
  return agentDomainExecutionFailure({
    category: "lock-active",
    message: "An active resident-agent lock blocks workspace repair execution.",
    retryable: false,
    allowedActions: ["inspect active workspace repair locks", "request human lock review"]
  });
}

function dataLossRiskFailure() {
  return agentDomainExecutionFailure({
    category: "data-loss-risk",
    message: "Canonical workspace repair is unavailable without a human-approved append-only repair event service.",
    retryable: false,
    allowedActions: [
      "install an append-only repair event service before retrying",
      "inspect canonical workspace diagnostics without mutation"
    ]
  });
}

function domainGateFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "domain-gate-failed",
    message,
    retryable: false,
    allowedActions: ["inspect workspace-ops projection diagnostics", "rebuild projection readiness"]
  });
}

function isAgentExecutionFailure(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    "kind" in value && (value as { readonly kind?: unknown }).kind === "agent-approved-tool-execution-failure.v1";
}

function validatePreviewInput(input: BuildDestructiveRepairPreviewInput): BuildDestructiveRepairPreviewInput {
  const record = dataRecordFromObject(input, "destructive repair preview input");
  rejectUnsupportedKeys(record, previewInputKeys, "destructive repair preview input");
  const toolId = readString(record, "toolId", "destructive repair preview input");
  const toolVersion = readString(record, "toolVersion", "destructive repair preview input");
  const descriptor = descriptorFor(toolId, toolVersion);
  const workspace = readWorkspaceRef(record, "workspace", "destructive repair preview input");
  const manifestHash = readHash(record, "manifestHash", "destructive repair preview input");
  const ledgerHighWaterMark = readNonNegativeInteger(record, "ledgerHighWaterMark", "destructive repair preview input");
  const backupManifestRef = readBackupManifestRef(record, "backupManifestRef", "destructive repair preview input");
  const target = readTarget(record, "target", "destructive repair preview input");
  const proposedAction = readProposedAction(record, "proposedAction", "destructive repair preview input");
  const mutationClass = readString(record, "mutationClass", "destructive repair preview input");
  const dataLossRiskSummary = readString(record, "dataLossRiskSummary", "destructive repair preview input");
  const readinessChecks = readReadinessChecks(record, "readinessChecks", "destructive repair preview input");
  const readinessDiagnosticsHash = readHash(
    record,
    "readinessDiagnosticsHash",
    "destructive repair preview input"
  );
  const expectedArtifactOutputs = readExpectedArtifactOutputs(
    record,
    "expectedArtifactOutputs",
    "destructive repair preview input"
  );
  const appendOnlyRepairEventPlan = readAppendOnlyPlan(
    record,
    "appendOnlyRepairEventPlan",
    "destructive repair preview input"
  );
  const lockSnapshot = readLocks(record, "lockSnapshot", "destructive repair preview input");
  const projectionHighWaterMark = readNonNegativeInteger(
    record,
    "projectionHighWaterMark",
    "destructive repair preview input"
  );

  if (projectionHighWaterMark !== ledgerHighWaterMark) {
    throw new Error("Destructive repair projection high-water mark must match the workspace ledger.");
  }
  if (backupManifestRef.available && !backupManifestRef.stale &&
      (backupManifestRef.ledgerHighWaterMark ?? -1) < ledgerHighWaterMark) {
    throw new Error("Destructive repair backup manifest cannot be current behind the workspace ledger.");
  }
  if (target.kind === "projection") {
    if (descriptor !== workspaceProjectionRebuildDescriptor || mutationClass !== "expendable-projection-rebuild") {
      throw new Error("Projection rebuild requires the canonical destructive repair descriptor and mutation class.");
    }
    if (proposedAction.kind !== "rebuild-projection" || proposedAction.mutatesCanonicalState) {
      throw new Error("Projection rebuild requires a noncanonical rebuild-projection action.");
    }
    if (appendOnlyRepairEventPlan.required || appendOnlyRepairEventPlan.status !== "not-required-for-expendable-projection") {
      throw new Error("Expendable projection rebuild must not claim a canonical repair event.");
    }
    if (expectedArtifactOutputs.length === 0 || expectedArtifactOutputs.some((output) =>
      !output.relativePath.startsWith(`projections/${target.projectionName}/`)
    )) {
      throw new Error("Projection rebuild outputs must use safe relative paths under the target projection.");
    }
  } else {
    if (descriptor !== workspaceCanonicalRepairDescriptor || mutationClass !== "canonical-repair") {
      throw new Error("Canonical repair requires the canonical destructive repair descriptor and mutation class.");
    }
    if (proposedAction.kind !== "append-repair-event-required" || !proposedAction.mutatesCanonicalState) {
      throw new Error("Canonical repair requires an append-only repair-event action.");
    }
    if (target.repairActionId !== proposedAction.actionId) {
      throw new Error("Canonical repair target must match the proposed repair action.");
    }
    if (!appendOnlyRepairEventPlan.required || appendOnlyRepairEventPlan.status !== "blocked-service-unavailable") {
      throw new Error("Canonical repair must remain blocked on the unavailable append-only repair service.");
    }
    if (expectedArtifactOutputs.length > 0) {
      throw new Error("Canonical repair cannot declare artifact outputs while its service is unavailable.");
    }
  }

  return {
    toolRequestId: readString(record, "toolRequestId", "destructive repair preview input"),
    toolId,
    toolVersion,
    runId: readString(record, "runId", "destructive repair preview input"),
    taskId: readString(record, "taskId", "destructive repair preview input"),
    residentAgentId: readString(record, "residentAgentId", "destructive repair preview input"),
    workspace,
    manifestHash,
    ledgerHighWaterMark,
    backupManifestRef,
    target,
    proposedAction,
    mutationClass: mutationClass as BuildDestructiveRepairPreviewInput["mutationClass"],
    dataLossRiskSummary,
    readinessChecks,
    readinessDiagnosticsHash,
    expectedArtifactOutputs,
    appendOnlyRepairEventPlan,
    lockSnapshot,
    projectionHighWaterMark
  };
}

function descriptorFor(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
  const descriptor = destructiveRepairDescriptors.find(
    (candidate) => candidate.toolId === toolId && candidate.toolVersion === toolVersion
  );
  if (descriptor === undefined) {
    throw new Error("Destructive repair requires a canonical destructive repair descriptor.");
  }
  return descriptor;
}

function readWorkspaceRef(record: Record<string, unknown>, key: string, label: string): WorkspaceRepairWorkspaceRef {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(
    value,
    new Set(["workspaceId", "label", "manifestVersion", "rootUri", "layoutContractVersion"]),
    `${label} workspace`
  );
  const rootUri = readString(value, "rootUri", `${label} workspace`);
  if (!rootUri.startsWith("file://")) {
    throw new Error("Destructive repair workspace root URI must be a safe file reference.");
  }
  return Object.freeze({
    workspaceId: readPattern(value, "workspaceId", /^ws_[a-zA-Z0-9_-]+$/, "workspace ID"),
    label: readString(value, "label", `${label} workspace`),
    manifestVersion: readPositiveInteger(value, "manifestVersion", `${label} workspace`),
    rootUri,
    layoutContractVersion: readString(value, "layoutContractVersion", `${label} workspace`)
  });
}

function readBackupManifestRef(
  record: Record<string, unknown>,
  key: string,
  label: string
): WorkspaceRepairBackupManifestRef {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set(["available", "manifestHash", "ledgerHighWaterMark", "stale"]), `${label} backup`);
  const available = readBoolean(value, "available", `${label} backup`);
  const stale = readBoolean(value, "stale", `${label} backup`);
  const manifestHash = Object.hasOwn(value, "manifestHash") && value.manifestHash !== undefined
    ? readHash(value, "manifestHash", `${label} backup`)
    : undefined;
  const ledgerHighWaterMark = Object.hasOwn(value, "ledgerHighWaterMark") && value.ledgerHighWaterMark !== undefined
    ? readNonNegativeInteger(value, "ledgerHighWaterMark", `${label} backup`)
    : undefined;
  if (available !== (manifestHash !== undefined && ledgerHighWaterMark !== undefined)) {
    throw new Error("Destructive repair backup availability must match its manifest references.");
  }
  return Object.freeze({
    available,
    ...(manifestHash === undefined ? {} : { manifestHash }),
    ...(ledgerHighWaterMark === undefined ? {} : { ledgerHighWaterMark }),
    stale
  });
}

function readTarget(record: Record<string, unknown>, key: string, label: string): WorkspaceRepairTarget {
  const value = readObject(record, key, label);
  const kind = readString(value, "kind", `${label} target`);
  if (kind === "projection") {
    rejectUnsupportedKeys(value, new Set(["kind", "projectionName", "rebuildId"]), `${label} target`);
    return Object.freeze({
      kind,
      projectionName: readSafeSegment(value, "projectionName", `${label} target projection`),
      rebuildId: readSafeSegment(value, "rebuildId", `${label} target rebuild`)
    });
  }
  if (kind === "canonical-root") {
    rejectUnsupportedKeys(value, new Set(["kind", "root", "repairActionId"]), `${label} target`);
    const root = readString(value, "root", `${label} target`);
    if (root !== "ledger" && root !== "blobs") {
      throw new Error("Canonical repair target root must be ledger or blobs.");
    }
    return Object.freeze({
      kind,
      root,
      repairActionId: readSafeSegment(value, "repairActionId", `${label} target repair action`)
    });
  }
  throw new Error("Destructive repair target kind is unsupported.");
}

function readProposedAction(
  record: Record<string, unknown>,
  key: string,
  label: string
): ProposedRepairActionDto {
  const value = clonePlainJson(readData(record, key, label), `${label} proposed action`);
  const parsed = proposedRepairActionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Destructive repair proposed action is invalid.");
  }
  return Object.freeze({ ...parsed.data, allowedNextCommands: [...parsed.data.allowedNextCommands] });
}

function readReadinessChecks(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly WorkspaceRepairReadinessCheck[] {
  const checks = readObjectArray(record, key, label).map((check) => {
    rejectUnsupportedKeys(check, new Set(["checkId", "status", "safeMessage"]), `${label} readiness check`);
    const status = readString(check, "status", `${label} readiness check`);
    if (status !== "pass" && status !== "warning" && status !== "fail") {
      throw new Error("Destructive repair readiness status is unsupported.");
    }
    return Object.freeze({
      checkId: readSafeSegment(check, "checkId", `${label} readiness check`),
      status,
      safeMessage: readString(check, "safeMessage", `${label} readiness check`)
    });
  });
  if (checks.length === 0 || new Set(checks.map((check) => check.checkId)).size !== checks.length) {
    throw new Error("Destructive repair readiness checks must be unique and non-empty.");
  }
  return Object.freeze(checks);
}

function readExpectedArtifactOutputs(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly WorkspaceRepairExpectedArtifactOutput[] {
  const outputs = readObjectArray(record, key, label).map((output) => {
    rejectUnsupportedKeys(
      output,
      new Set(["artifactId", "relativePath", "artifactHash", "byteCount", "expendable"]),
      `${label} artifact output`
    );
    const relativePath = readString(output, "relativePath", `${label} artifact output`);
    if (
      relativePath.startsWith("/") ||
      relativePath.includes("\\") ||
      relativePath.split("/").some((part) => part.length === 0 || part === "." || part === "..")
    ) {
      throw new Error("Destructive repair artifact output must use a safe relative path.");
    }
    if (readData(output, "expendable", `${label} artifact output`) !== true) {
      throw new Error("Destructive repair artifact output must be expendable.");
    }
    return Object.freeze({
      artifactId: readSafeSegment(output, "artifactId", `${label} artifact output`),
      relativePath,
      artifactHash: readHash(output, "artifactHash", `${label} artifact output`),
      byteCount: readNonNegativeInteger(output, "byteCount", `${label} artifact output`),
      expendable: true as const
    });
  });
  if (new Set(outputs.map((output) => output.artifactId)).size !== outputs.length) {
    throw new Error("Destructive repair artifact outputs must have unique IDs.");
  }
  return Object.freeze(outputs);
}

function readAppendOnlyPlan(
  record: Record<string, unknown>,
  key: string,
  label: string
): WorkspaceAppendOnlyRepairEventPlan {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set(["required", "service", "serviceAvailable", "status"]), `${label} repair plan`);
  const service = readString(value, "service", `${label} repair plan`);
  const status = readString(value, "status", `${label} repair plan`);
  if (service !== "AppendOnlyWorkspaceRepairService" || readData(value, "serviceAvailable", `${label} repair plan`) !== false) {
    throw new Error("Destructive repair append-only repair service must remain unavailable.");
  }
  if (status !== "not-required-for-expendable-projection" && status !== "blocked-service-unavailable") {
    throw new Error("Destructive repair append-only repair plan status is unsupported.");
  }
  return Object.freeze({
    required: readBoolean(value, "required", `${label} repair plan`),
    service,
    serviceAvailable: false,
    status
  });
}

function readLocks(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly AgentApprovedToolActiveLock[] {
  return Object.freeze(readObjectArray(record, key, label).map((lock) => {
    rejectUnsupportedKeys(lock, new Set(["lockId", "category", "message"]), `${label} lock`);
    return Object.freeze({
      lockId: readString(lock, "lockId", `${label} lock`),
      category: readString(lock, "category", `${label} lock`),
      message: readString(lock, "message", `${label} lock`)
    });
  }));
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must use enumerable data properties only.`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }
}

function readData(record: Record<string, unknown>, key: string, label: string): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new Error(`${label} is missing ${key}.`);
  }
  return record[key];
}

function readString(record: Record<string, unknown>, key: string, label: string): string {
  const value = readData(record, key, label);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} field ${key} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, `${label} field ${key}`);
  return value;
}

function readPattern(record: Record<string, unknown>, key: string, pattern: RegExp, label: string): string {
  const value = readString(record, key, label);
  if (!pattern.test(value)) {
    throw new Error(`${label} must be canonical.`);
  }
  return value;
}

function readSafeSegment(record: Record<string, unknown>, key: string, label: string): string {
  return readPattern(record, key, /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, label);
}

function readHash(record: Record<string, unknown>, key: string, label: string): ContentHash {
  return readPattern(record, key, /^sha256:[a-f0-9]{64}$/, `${label} hash`) as ContentHash;
}

function readBoolean(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = readData(record, key, label);
  if (typeof value !== "boolean") {
    throw new Error(`${label} field ${key} must be a boolean.`);
  }
  return value;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readData(record, key, label);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} field ${key} must be a non-negative integer.`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readNonNegativeInteger(record, key, label);
  if (value === 0) {
    throw new Error(`${label} field ${key} must be positive.`);
  }
  return value;
}

function readObject(record: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return dataRecordFromObject(clonePlainJson(readData(record, key, label), `${label} field ${key}`), `${label} field ${key}`);
}

function readObjectArray(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly Record<string, unknown>[] {
  const value = clonePlainJson(readData(record, key, label), `${label} field ${key}`);
  if (!Array.isArray(value)) {
    throw new Error(`${label} field ${key} must be a plain array.`);
  }
  return value.map((item, index) => dataRecordFromObject(item, `${label} field ${key}[${index}]`));
}

function clonePlainJson(value: unknown, label: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${label} must be a plain array without symbol-keyed fields.`);
    }
    const cloned: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(`${label} arrays must use dense enumerable data properties.`);
      }
      cloned.push(clonePlainJson(descriptor.value, `${label}[${index}]`));
    }
    for (const name of Object.getOwnPropertyNames(value)) {
      if (name !== "length" && !/^(0|[1-9]\d*)$/.test(name)) {
        throw new Error(`${label} arrays must not contain custom array fields.`);
      }
    }
    return cloned;
  }
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must contain plain JSON data only.`);
  }
  const cloned: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must use enumerable data properties only.`);
    }
    cloned[key] = clonePlainJson(descriptor.value, `${label}.${key}`);
  }
  return cloned;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
