import { createHash } from "node:crypto";
import {
  actorRefSchema,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import { buildGovernanceProjection, type ExportPlan } from "../../../ontology/src/governance-projection.js";
import type { GovernanceService } from "../../../ontology/src/governance-service.js";
import {
  assertSecretSafeText,
  governanceTags,
  type GovernanceTag
} from "../../../ontology/src/governance-policy.js";
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
type ArtifactKind = "export" | "report";
type PolicyRef = { readonly policyId: string; readonly version: string };
type SensitiveOptIn = { readonly tag: GovernanceTag; readonly approvedBy: string; readonly rationale: string };

export const exportGenerateDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "governance.export.generate",
  toolVersion: "0.1.0",
  family: "export-report",
  sideEffectClass: "export-or-publication",
  requiredApprovalClass: "export-or-publication",
  inputSchemaId: "governed-export-generation-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "GovernanceService.recordExportGenerated",
  idempotencyKeyFields: ["artifactId", "causationEventId", "outputArtifactHash", "includedContentHashes"],
  forbiddenEffects: [
    "publish-artifact-bytes",
    "transfer-artifact-bytes",
    "bypass-sensitive-opt-in",
    "bypass-governance-plan",
    "include-unapproved-evidence"
  ]
});

export const reportGenerateDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "governance.report.generate",
  toolVersion: "0.1.0",
  family: "export-report",
  sideEffectClass: "export-or-publication",
  requiredApprovalClass: "export-or-publication",
  inputSchemaId: "governed-report-generation-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "GovernanceService.recordReportGenerated",
  idempotencyKeyFields: ["artifactId", "causationEventId", "outputArtifactHash", "includedContentHashes"],
  forbiddenEffects: [
    "publish-artifact-bytes",
    "transfer-artifact-bytes",
    "bypass-sensitive-opt-in",
    "bypass-governance-plan",
    "include-unapproved-evidence"
  ]
});

export const exportReportDescriptors = Object.freeze([
  exportGenerateDescriptor,
  reportGenerateDescriptor
] as const satisfies readonly AgentDomainToolDescriptor[]);

export interface ExportReportEvidenceBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly contentHash: ContentHash;
  readonly governanceEventIds: readonly string[];
}

export interface ExportReportAdapterContext {
  readonly ledger: EventLedger;
  readonly governanceService: Pick<GovernanceService, "recordExportGenerated" | "recordReportGenerated">;
  readonly actor: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly requestedEvidenceIds: readonly string[];
  readonly includedEvidenceIds: readonly string[];
  readonly includedContentHashes: readonly ContentHash[];
  readonly sensitiveOptIns: readonly SensitiveOptIn[];
  readonly defaultPublicSafeOnly: boolean;
  readonly policy: PolicyRef;
  readonly causationEventId: string;
  readonly outputArtifactHash: ContentHash;
}

export interface BuildExportReportPreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly requestedEvidenceIds: readonly string[];
  readonly includedEvidenceIds: readonly string[];
  readonly includedContentHashes: readonly ContentHash[];
  readonly evidenceBindings: readonly ExportReportEvidenceBinding[];
  readonly governedPlan: ExportPlan;
  readonly excludedRestrictedCategories: readonly string[];
  readonly sensitiveOptIns: readonly SensitiveOptIn[];
  readonly defaultPublicSafeOnly: boolean;
  readonly policy: PolicyRef;
  readonly policyEventId: string;
  readonly causationEventId: string;
  readonly outputArtifactHash: ContentHash;
  readonly domainActorId: string;
  readonly projectionHighWaterMark: number;
  readonly lockSnapshot: readonly AgentApprovedToolActiveLock[];
}

export interface RebuildExportReportCurrentPreviewInput extends ExportReportAdapterContext {
  readonly toolRequestId: string;
  readonly toolVersion: string;
  readonly runId: string;
}

interface ValidatedContext extends ExportReportAdapterContext {
  readonly actor: ActorRef & { readonly kind: "human" };
  readonly requestedEvidenceIds: readonly string[];
  readonly includedEvidenceIds: readonly string[];
  readonly includedContentHashes: readonly ContentHash[];
  readonly sensitiveOptIns: readonly SensitiveOptIn[];
  readonly policy: PolicyRef;
}

interface CurrentSnapshot {
  readonly governedPlan: ExportPlan;
  readonly evidenceBindings: readonly ExportReportEvidenceBinding[];
  readonly includedContentHashes: readonly ContentHash[];
  readonly excludedRestrictedCategories: readonly string[];
  readonly policy: PolicyRef;
  readonly policyEventId: string;
  readonly causationPresent: boolean;
  readonly projectionHighWaterMark: number;
}

const previewInputKeys = new Set([
  "toolRequestId", "toolId", "toolVersion", "runId", "taskId", "residentAgentId", "artifactKind",
  "artifactId", "requestedEvidenceIds", "includedEvidenceIds", "includedContentHashes", "evidenceBindings",
  "governedPlan", "excludedRestrictedCategories", "sensitiveOptIns", "defaultPublicSafeOnly", "policy",
  "policyEventId", "causationEventId", "outputArtifactHash", "domainActorId", "projectionHighWaterMark",
  "lockSnapshot"
]);

const contextInputKeys = new Set([
  "ledger", "governanceService", "actor", "residentAgentId", "taskId", "toolId", "artifactKind",
  "artifactId", "requestedEvidenceIds", "includedEvidenceIds", "includedContentHashes", "sensitiveOptIns",
  "defaultPublicSafeOnly", "policy", "causationEventId", "outputArtifactHash"
]);

const rebuildInputKeys = new Set([...contextInputKeys, "toolRequestId", "toolVersion", "runId"]);
const executionInputKeys = new Set([
  "toolRequestId", "runId", "taskId", "toolId", "toolVersion", "sideEffectClass", "approvalClass",
  "previewHash", "approvedPreviewHash", "approvedBy", "sourceEventIds", "inputArtifactHashes", "provenanceRefs"
]);

export function buildExportReportApprovalPreview(input: BuildExportReportPreviewInput): AgentDomainPreview {
  const value = validatePreviewInput(input);
  const descriptor = descriptorFor(value.toolId, value.toolVersion, value.artifactKind);
  const sourceEventIds = sourceEventIdsFor(value);
  const optInTags = value.sensitiveOptIns.map((optIn) => optIn.tag);
  const optInCopy = optInTags.length === 0
    ? "No sensitive evidence opt-ins are included."
    : `Explicit sensitive evidence opt-ins: ${optInTags.join(", ")}.`;
  const consequence = `${optInCopy} Approval records one ${value.artifactKind}.generated event through GovernanceService; it does not publish or transfer artifact bytes.`;
  assertAgentSecretSafeText(consequence, "export and report preview consequence");

  const normalizedInputHash = sha256(stableJson({
    artifactKind: value.artifactKind,
    artifactId: value.artifactId,
    requestedEvidenceIds: value.requestedEvidenceIds,
    includedEvidenceIds: value.includedEvidenceIds,
    includedContentHashes: value.includedContentHashes,
    evidenceBindings: value.evidenceBindings,
    governedPlan: value.governedPlan,
    excludedRestrictedCategories: value.excludedRestrictedCategories,
    sensitiveOptIns: value.sensitiveOptIns,
    defaultPublicSafeOnly: value.defaultPublicSafeOnly,
    policy: value.policy,
    policyEventId: value.policyEventId,
    causationEventId: value.causationEventId,
    outputArtifactHash: value.outputArtifactHash,
    lockSnapshot: value.lockSnapshot
  }));

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
    normalizedInputHash,
    summary: `Record governed ${value.artifactKind} generation for ${value.artifactId}.`,
    scope: `Governance event recording for ${value.includedEvidenceIds.length} included evidence item(s).`,
    estimatedEffect: `Append one ${value.artifactKind}.generated event; no artifact bytes are written or transferred.`,
    consequence,
    affectedRefs: [
      ...value.evidenceBindings.map((binding) => ({
        kind: "evidence",
        id: binding.evidenceId,
        eventId: binding.evidenceEventId,
        hash: binding.contentHash,
        governanceEventIds: [...binding.governanceEventIds]
      })),
      { kind: "governance-policy", id: value.policy.policyId, version: value.policy.version, eventId: value.policyEventId },
      { kind: "output-artifact", id: value.artifactId, hash: value.outputArtifactHash }
    ],
    expectedOutputs: [
      { kind: "event", type: `${value.artifactKind}.generated` },
      { kind: "artifact-reference", hash: value.outputArtifactHash, bytesWrittenByAdapter: false }
    ],
    contextPackRefs: [{ kind: "governance-policy", policyId: value.policy.policyId, version: value.policy.version }],
    governancePolicyVersion: value.policy.version,
    lockSnapshot: value.lockSnapshot.map((lock) => ({ ...lock })),
    projectionHighWaterMarks: [{
      projectionName: "governance-export-plan",
      highWaterMark: value.projectionHighWaterMark
    }],
    idempotencyKey: [
      value.toolId,
      value.artifactId,
      value.causationEventId,
      value.outputArtifactHash,
      ...value.includedContentHashes
    ].join(":"),
    staleAfter: {
      kind: "governance-plan-evidence-policy-or-lock-change",
      refs: [
        value.artifactId,
        value.causationEventId,
        value.policyEventId,
        value.outputArtifactHash,
        ...sourceEventIds,
        ...value.includedContentHashes
      ]
    },
    relatedEventIds: sourceEventIds,
    artifactHashes: [...value.includedContentHashes, value.outputArtifactHash],
    artifactKind: value.artifactKind,
    artifactId: value.artifactId,
    requestedEvidenceIds: [...value.requestedEvidenceIds],
    includedEvidenceIds: [...value.includedEvidenceIds],
    includedContentHashes: [...value.includedContentHashes],
    evidenceBindings: value.evidenceBindings.map((binding) => ({
      ...binding,
      governanceEventIds: [...binding.governanceEventIds]
    })),
    governedPlan: copyPlan(value.governedPlan),
    excludedRestrictedCategories: [...value.excludedRestrictedCategories],
    sensitiveOptIns: value.sensitiveOptIns.map((optIn) => ({ ...optIn })),
    defaultPublicSafeOnly: value.defaultPublicSafeOnly,
    policy: { ...value.policy },
    policyEventId: value.policyEventId,
    causationEventId: value.causationEventId,
    outputArtifactHash: value.outputArtifactHash
  };
}

export async function rebuildExportReportCurrentPreview(
  input: RebuildExportReportCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "export and report current-preview input");
  rejectUnsupportedKeys(record, rebuildInputKeys, "export and report current-preview input");
  const context = validatedContextFromRecord(record);
  const toolRequestId = readStringProperty(record, "toolRequestId", "export and report current-preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "export and report current-preview input");
  descriptorFor(context.toolId, toolVersion, context.artifactKind);
  const runId = readStringProperty(record, "runId", "export and report current-preview input");
  const snapshot = await readCurrentSnapshot(context);
  const activeLocks = await readActiveLocks(context);
  const preview = buildPreviewForSnapshot(context, snapshot, activeLocks, toolRequestId, toolVersion, runId);

  return {
    preview,
    sourceEventIds: sourceEventIdsForPreview(context, snapshot),
    inputArtifactHashes: inputArtifactHashesFor(context, snapshot),
    provenanceRefs: provenanceRefsFor(context, snapshot),
    activeLocks,
    freshnessChecks: freshnessChecksFor(context, snapshot)
  };
}

export function createExportGenerationAdapter(input: ExportReportAdapterContext): AgentDomainExecutionAdapter {
  const context = validateAdapterContext(input, "export");
  return createAdapter(context, exportGenerateDescriptor);
}

export function createReportGenerationAdapter(input: ExportReportAdapterContext): AgentDomainExecutionAdapter {
  const context = validateAdapterContext(input, "report");
  return createAdapter(context, reportGenerateDescriptor);
}

function createAdapter(
  context: ValidatedContext,
  descriptor: AgentDomainToolDescriptor
): AgentDomainExecutionAdapter {
  return Object.freeze({
    descriptor,
    buildCurrentPreview(request: AgentApprovedToolPreviewInput) {
      return rebuildExportReportCurrentPreview({
        ...context,
        toolRequestId: request.toolRequestId,
        toolVersion: request.toolVersion,
        runId: request.runId
      });
    },
    executeApproved(request: AgentApprovedToolExecutionInput) {
      return executeApproved(context, request);
    }
  });
}

async function executeApproved(
  context: ValidatedContext,
  input: AgentApprovedToolExecutionInput
): Promise<AgentDomainExecutionResult> {
  const execution = validateExecutionInput(context, input);
  const activeLocks = await readActiveLocks(context);
  if (activeLocks.length > 0) {
    throw agentDomainExecutionFailure({
      category: "lock-active",
      message: "An active resident-agent lock blocks governed export or report generation.",
      retryable: false,
      allowedActions: ["inspect active agent locks", "request human lock review before retrying"]
    });
  }

  const snapshot = await readCurrentSnapshot(context);
  assertSnapshotFresh(context, snapshot);
  const currentPreview = buildPreviewForSnapshot(
    context,
    snapshot,
    [],
    execution.toolRequestId,
    execution.toolVersion,
    execution.runId
  );
  if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
    throw staleApprovalFailure("The governed export or report preview changed after approval.");
  }
  if (!sameOrderedStrings(execution.sourceEventIds, sourceEventIdsForPreview(context, snapshot))) {
    throw staleApprovalFailure("The governed export or report source events changed after approval.");
  }
  if (!sameOrderedStrings(execution.inputArtifactHashes, inputArtifactHashesFor(context, snapshot))) {
    throw staleApprovalFailure("The governed export or report artifact hashes changed after approval.");
  }
  if (!sameOrderedStrings(execution.provenanceRefs, provenanceRefsFor(context, snapshot))) {
    throw agentDomainExecutionFailure({
      category: "provenance-missing",
      message: "Export or report provenance does not match the approved evidence and governance plan.",
      retryable: false,
      allowedActions: ["rebuild the governed generation preview", "request a new export approval"]
    });
  }

  const existing = await findExistingGeneratedEvent(context);
  if (existing !== undefined) {
    if (!generatedEventMatches(existing, context)) {
      throw domainGateFailure("The generated artifact stream already contains a different governance record.");
    }
    return mapResult(existing, context);
  }

  const beforeEvents = await context.ledger.readAll();
  let generated: KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated">;
  try {
    const serviceInput = {
      policy: context.policy,
      includedEvidenceIds: context.includedEvidenceIds,
      includedContentHashes: context.includedContentHashes,
      sensitiveOptIns: context.sensitiveOptIns,
      defaultPublicSafeOnly: context.defaultPublicSafeOnly,
      causationId: context.causationEventId
    };
    generated = context.artifactKind === "export"
      ? await context.governanceService.recordExportGenerated({ ...serviceInput, exportId: context.artifactId })
      : await context.governanceService.recordReportGenerated({ ...serviceInput, reportId: context.artifactId });
  } catch {
    const concurrent = await findExistingGeneratedEvent(context);
    if (concurrent !== undefined && generatedEventMatches(concurrent, context)) {
      await assertLedgerAttestedResult(beforeEvents, concurrent, context);
      return mapResult(concurrent, context);
    }
    throw domainGateFailure("Governance rejected the approved export or report generation record.");
  }

  if (!generatedEventMatches(generated, context)) {
    throw domainGateFailure("Governance returned a generation event outside the approved plan.");
  }
  await assertLedgerAttestedResult(beforeEvents, generated, context);
  return mapResult(generated, context);
}

function validatePreviewInput(input: BuildExportReportPreviewInput): BuildExportReportPreviewInput {
  const record = dataRecordFromObject(input, "export and report preview input");
  rejectUnsupportedKeys(record, previewInputKeys, "export and report preview input");
  const toolId = readStringProperty(record, "toolId", "export and report preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "export and report preview input");
  const artifactKind = readArtifactKind(record, "artifactKind", "export and report preview input");
  descriptorFor(toolId, toolVersion, artifactKind);
  const artifactId = readStringProperty(record, "artifactId", "export and report preview input");
  assertArtifactId(artifactKind, artifactId);
  const requestedEvidenceIds = readUniqueStringArray(record, "requestedEvidenceIds", "export and report preview input", true);
  const includedEvidenceIds = readUniqueStringArray(record, "includedEvidenceIds", "export and report preview input", false);
  const includedContentHashes = readHashArray(record, "includedContentHashes", "export and report preview input");
  const evidenceBindings = readEvidenceBindings(record, "evidenceBindings", "export and report preview input");
  const governedPlan = readGovernedPlan(record, "governedPlan", "export and report preview input");
  const excludedRestrictedCategories = readUniqueStringArray(
    record,
    "excludedRestrictedCategories",
    "export and report preview input",
    false
  );
  const sensitiveOptIns = readSensitiveOptIns(record, "sensitiveOptIns", "export and report preview input");
  const defaultPublicSafeOnly = readBooleanProperty(record, "defaultPublicSafeOnly", "export and report preview input");
  const policy = readPolicyRef(record, "policy", "export and report preview input");
  const policyEventId = readEventIdProperty(record, "policyEventId", "export and report preview input");
  const causationEventId = readEventIdProperty(record, "causationEventId", "export and report preview input");
  const outputArtifactHash = readHashProperty(record, "outputArtifactHash", "export and report preview input");
  const domainActorId = readStringProperty(record, "domainActorId", "export and report preview input");
  const projectionHighWaterMark = readNonNegativeInteger(
    record,
    "projectionHighWaterMark",
    "export and report preview input"
  );
  const lockSnapshot = readLocks(record, "lockSnapshot", "export and report preview input");

  if (!sameOrderedStrings(includedEvidenceIds, governedPlan.includedEvidenceIds)) {
    throw new Error("Export and report included evidence IDs must match the governed plan.");
  }
  if (!sameOrderedStrings(evidenceBindings.map((binding) => binding.evidenceId), includedEvidenceIds)) {
    throw new Error("Export and report evidence bindings must match every included evidence ID.");
  }
  if (!sameOrderedStrings(evidenceBindings.map((binding) => binding.contentHash), includedContentHashes)) {
    throw new Error("Export and report content hashes must match the evidence bindings.");
  }
  if (governedPlan.blockedEvidence.some((blocked) => !requestedEvidenceIds.includes(blocked.evidenceId))) {
    throw new Error("Export and report governed plan contains an unrequested blocked evidence ID.");
  }
  if (governedPlan.includedEvidenceIds.some((evidenceId) => !requestedEvidenceIds.includes(evidenceId))) {
    throw new Error("Export and report governed plan contains an unrequested included evidence ID.");
  }
  const sourceEventIds = new Set(evidenceBindings.flatMap((binding) => [
    binding.evidenceEventId,
    ...binding.governanceEventIds
  ]));
  if (evidenceBindings.length > 0 && !sourceEventIds.has(causationEventId)) {
    throw new Error("Export and report causation event must be bound to included evidence provenance.");
  }
  if (sensitiveOptIns.some((optIn) => optIn.approvedBy !== domainActorId)) {
    throw new Error("Sensitive opt-in approvedBy must match the human governance actor.");
  }
  if (defaultPublicSafeOnly !== (sensitiveOptIns.length === 0)) {
    throw new Error("Export and report public-safe default must match sensitive opt-in state.");
  }
  if (governedPlan.blockedEvidence.length === 0 && excludedRestrictedCategories.length !== 0) {
    throw new Error("Export and report excluded restricted categories require blocked evidence.");
  }
  if (governedPlan.blockedEvidence.length > 0 && excludedRestrictedCategories.length === 0) {
    throw new Error("Export and report blocked evidence requires an excluded restricted category.");
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "export and report preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "export and report preview input"),
    taskId: readStringProperty(record, "taskId", "export and report preview input"),
    residentAgentId: readStringProperty(record, "residentAgentId", "export and report preview input"),
    artifactKind,
    artifactId,
    requestedEvidenceIds,
    includedEvidenceIds,
    includedContentHashes,
    evidenceBindings,
    governedPlan,
    excludedRestrictedCategories,
    sensitiveOptIns,
    defaultPublicSafeOnly,
    policy,
    policyEventId,
    causationEventId,
    outputArtifactHash,
    domainActorId,
    projectionHighWaterMark,
    lockSnapshot
  };
}

function validateAdapterContext(input: ExportReportAdapterContext, expectedKind: ArtifactKind): ValidatedContext {
  const record = dataRecordFromObject(input, "export and report adapter input");
  rejectUnsupportedKeys(record, contextInputKeys, "export and report adapter input");
  const context = validatedContextFromRecord(record);
  if (context.artifactKind !== expectedKind) {
    throw new Error(`Export and report adapter requires artifact kind ${expectedKind}.`);
  }
  descriptorFor(context.toolId, descriptorForKind(expectedKind).toolVersion, expectedKind);
  return context;
}

function validatedContextFromRecord(record: Record<string, unknown>): ValidatedContext {
  const ledger = readDataProperty(record, "ledger", "export and report adapter input") as EventLedger;
  requireCallable(ledger, "readAll", "export and report ledger");
  requireCallable(ledger, "readStream", "export and report ledger");
  const governanceService = readDataProperty(
    record,
    "governanceService",
    "export and report adapter input"
  ) as Pick<GovernanceService, "recordExportGenerated" | "recordReportGenerated">;
  requireCallable(governanceService, "recordExportGenerated", "export and report governance service");
  requireCallable(governanceService, "recordReportGenerated", "export and report governance service");
  const actor = readActorRef(record, "actor", "export and report adapter input");
  if (actor.kind !== "human") {
    throw new Error("Export and report generation requires a human governance actor.");
  }
  const artifactKind = readArtifactKind(record, "artifactKind", "export and report adapter input");
  const artifactId = readStringProperty(record, "artifactId", "export and report adapter input");
  assertArtifactId(artifactKind, artifactId);
  const sensitiveOptIns = readSensitiveOptIns(record, "sensitiveOptIns", "export and report adapter input");
  if (sensitiveOptIns.some((optIn) => optIn.approvedBy !== actor.id)) {
    throw new Error("Sensitive opt-in approvedBy must match the human governance actor.");
  }
  const defaultPublicSafeOnly = readBooleanProperty(record, "defaultPublicSafeOnly", "export and report adapter input");
  if (defaultPublicSafeOnly !== (sensitiveOptIns.length === 0)) {
    throw new Error("Export and report public-safe default must match sensitive opt-in state.");
  }
  const requestedEvidenceIds = readUniqueStringArray(
    record,
    "requestedEvidenceIds",
    "export and report adapter input",
    true
  );
  const includedEvidenceIds = readUniqueStringArray(
    record,
    "includedEvidenceIds",
    "export and report adapter input",
    true
  );
  const includedContentHashes = readHashArray(record, "includedContentHashes", "export and report adapter input");
  if (includedEvidenceIds.length !== includedContentHashes.length) {
    throw new Error("Export and report included evidence IDs must match included content hashes.");
  }
  if (includedEvidenceIds.some((evidenceId) => !requestedEvidenceIds.includes(evidenceId))) {
    throw new Error("Export and report included evidence must be requested.");
  }
  const toolId = readStringProperty(record, "toolId", "export and report adapter input");
  descriptorFor(toolId, descriptorForKind(artifactKind).toolVersion, artifactKind);
  const parsedActor: ActorRef & { readonly kind: "human" } = Object.freeze({
    id: actor.id,
    kind: "human",
    label: actor.label
  });

  return {
    ledger,
    governanceService,
    actor: parsedActor,
    residentAgentId: readStringProperty(record, "residentAgentId", "export and report adapter input"),
    taskId: readStringProperty(record, "taskId", "export and report adapter input"),
    toolId,
    artifactKind,
    artifactId,
    requestedEvidenceIds,
    includedEvidenceIds,
    includedContentHashes,
    sensitiveOptIns,
    defaultPublicSafeOnly,
    policy: readPolicyRef(record, "policy", "export and report adapter input"),
    causationEventId: readEventIdProperty(record, "causationEventId", "export and report adapter input"),
    outputArtifactHash: readHashProperty(record, "outputArtifactHash", "export and report adapter input")
  };
}

function validateExecutionInput(
  context: ValidatedContext,
  input: AgentApprovedToolExecutionInput
): AgentApprovedToolExecutionInput {
  let record: Record<string, unknown>;
  try {
    record = dataRecordFromObject(input, "export and report approved execution input");
    rejectUnsupportedKeys(record, executionInputKeys, "export and report approved execution input");
  } catch {
    throw permissionFailure("Export and report execution input must be a plain approved-execution DTO.");
  }
  const toolId = readStringProperty(record, "toolId", "export and report approved execution input");
  const toolVersion = readStringProperty(record, "toolVersion", "export and report approved execution input");
  try {
    descriptorFor(toolId, toolVersion, context.artifactKind);
  } catch {
    throw permissionFailure("Export and report execution requires the registered governed generation descriptor.");
  }
  if (
    readStringProperty(record, "sideEffectClass", "export and report approved execution input") !== "export-or-publication" ||
    readStringProperty(record, "approvalClass", "export and report approved execution input") !== "export-or-publication"
  ) {
    throw permissionFailure("Export and report execution requires export-or-publication approval.");
  }
  const approvedBy = readStringProperty(record, "approvedBy", "export and report approved execution input");
  if (approvedBy !== context.actor.id) {
    throw permissionFailure("Export and report approval actor must match the human governance actor.");
  }
  let previewHash: ContentHash;
  let approvedPreviewHash: ContentHash;
  try {
    previewHash = readHashProperty(record, "previewHash", "export and report approved execution input");
    approvedPreviewHash = readHashProperty(record, "approvedPreviewHash", "export and report approved execution input");
  } catch {
    throw staleApprovalFailure("Export and report preview hashes must be exact SHA-256 values.");
  }
  if (previewHash !== approvedPreviewHash) {
    throw staleApprovalFailure("Export and report preview hashes do not match.");
  }
  const sourceEventIds = readPlainStringArray(
    readDataProperty(record, "sourceEventIds", "export and report approved execution input"),
    "export and report source event IDs"
  );
  const inputArtifactHashes = readPlainStringArray(
    readDataProperty(record, "inputArtifactHashes", "export and report approved execution input"),
    "export and report input artifact hashes"
  );
  const provenanceRefs = readPlainStringArray(
    readDataProperty(record, "provenanceRefs", "export and report approved execution input"),
    "export and report provenance refs"
  );
  const taskId = readOptionalStringProperty(record, "taskId", "export and report approved execution input");
  if (taskId !== undefined && taskId !== context.taskId) {
    throw staleApprovalFailure("Export and report task identity changed after approval.");
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "export and report approved execution input"),
    runId: readStringProperty(record, "runId", "export and report approved execution input"),
    ...(taskId === undefined ? {} : { taskId }),
    toolId,
    toolVersion,
    sideEffectClass: "export-or-publication",
    approvalClass: "export-or-publication",
    previewHash,
    approvedPreviewHash,
    approvedBy,
    sourceEventIds,
    inputArtifactHashes,
    provenanceRefs
  };
}

async function readCurrentSnapshot(context: ValidatedContext): Promise<CurrentSnapshot> {
  const events = await context.ledger.readAll();
  const projection = buildGovernanceProjection(events);
  const governedPlan = projection.planExport({
    requestedEvidenceIds: context.requestedEvidenceIds,
    sensitiveOptInTags: context.sensitiveOptIns.map((optIn) => optIn.tag)
  });
  const evidenceBindings = governedPlan.includedEvidenceIds.map((evidenceId) => {
    const evidence = events.findLast(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
    );
    if (evidence === undefined) {
      throw staleApprovalFailure("Governed export or report evidence is no longer available.");
    }
    const state = projection.evidenceGovernance.get(evidenceId);
    return Object.freeze({
      evidenceId,
      evidenceEventId: evidence.id,
      contentHash: evidence.payload.contentHash as ContentHash,
      governanceEventIds: Object.freeze([
        ...(state?.classifiedEventIds ?? []),
        ...(state?.reviewedEventIds ?? [])
      ])
    });
  });
  const policyEvent = events.findLast(
    (event): event is KnowledgeEventOf<"governance.policy.installed"> => event.type === "governance.policy.installed"
  );
  if (policyEvent === undefined) {
    throw staleApprovalFailure("Governed export or report generation requires an installed governance policy event.");
  }
  const policyRef = { policyId: policyEvent.payload.policyId, version: policyEvent.payload.version };
  const policyEventId = policyEvent.id;
  const excludedRestrictedCategories = excludedCategoriesFor(governedPlan, projection);
  const relevantEventIds = new Set([
    policyEventId,
    context.causationEventId,
    ...evidenceBindings.flatMap((binding) => [binding.evidenceEventId, ...binding.governanceEventIds])
  ]);

  return {
    governedPlan: copyPlan(governedPlan),
    evidenceBindings,
    includedContentHashes: Object.freeze(evidenceBindings.map((binding) => binding.contentHash)),
    excludedRestrictedCategories,
    policy: Object.freeze(policyRef),
    policyEventId,
    causationPresent: events.some((event) => event.id === context.causationEventId),
    projectionHighWaterMark: events.filter((event) => relevantEventIds.has(event.id)).length
  };
}

function buildPreviewForSnapshot(
  context: ValidatedContext,
  snapshot: CurrentSnapshot,
  activeLocks: readonly AgentApprovedToolActiveLock[],
  toolRequestId: string,
  toolVersion: string,
  runId: string
): AgentDomainPreview {
  return buildExportReportApprovalPreview({
    toolRequestId,
    toolId: context.toolId,
    toolVersion,
    runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    artifactKind: context.artifactKind,
    artifactId: context.artifactId,
    requestedEvidenceIds: context.requestedEvidenceIds,
    includedEvidenceIds: snapshot.governedPlan.includedEvidenceIds,
    includedContentHashes: snapshot.includedContentHashes,
    evidenceBindings: snapshot.evidenceBindings,
    governedPlan: snapshot.governedPlan,
    excludedRestrictedCategories: snapshot.excludedRestrictedCategories,
    sensitiveOptIns: context.sensitiveOptIns,
    defaultPublicSafeOnly: context.defaultPublicSafeOnly,
    policy: snapshot.policy,
    policyEventId: snapshot.policyEventId,
    causationEventId: context.causationEventId,
    outputArtifactHash: context.outputArtifactHash,
    domainActorId: context.actor.id,
    projectionHighWaterMark: snapshot.projectionHighWaterMark,
    lockSnapshot: activeLocks
  });
}

async function readActiveLocks(context: ValidatedContext): Promise<readonly AgentApprovedToolActiveLock[]> {
  const projection = buildAgentProjection(await context.ledger.readAll());
  return Object.freeze(
    [...projection.locks.values()]
      .filter((lock) => lock.state === "active" && lock.residentAgentId === context.residentAgentId)
      .sort((left, right) => left.lockId.localeCompare(right.lockId))
      .map((lock) => Object.freeze({ lockId: lock.lockId, category: lock.kind, message: lock.reason }))
  );
}

function freshnessChecksFor(context: ValidatedContext, snapshot: CurrentSnapshot) {
  return [
    freshnessCheck("governed-plan", stableJson(context.includedEvidenceIds), stableJson(snapshot.governedPlan.includedEvidenceIds)),
    freshnessCheck("included-content-hashes", JSON.stringify(context.includedContentHashes), JSON.stringify(snapshot.includedContentHashes)),
    freshnessCheck(
      "governance-policy",
      `${context.policy.policyId}@${context.policy.version}`,
      `${snapshot.policy.policyId}@${snapshot.policy.version}`
    ),
    freshnessCheck("causation-event", context.causationEventId, snapshot.causationPresent ? context.causationEventId : "missing"),
    freshnessCheck(
      "public-safe-default",
      String(context.defaultPublicSafeOnly),
      String(context.sensitiveOptIns.length === 0)
    )
  ];
}

function freshnessCheck(name: string, expected: string, actual: string) {
  return { name, expected, actual, ok: expected === actual };
}

function assertSnapshotFresh(context: ValidatedContext, snapshot: CurrentSnapshot): void {
  if (
    !sameOrderedStrings(context.includedEvidenceIds, snapshot.governedPlan.includedEvidenceIds) ||
    !sameOrderedStrings(context.includedContentHashes, snapshot.includedContentHashes) ||
    context.policy.policyId !== snapshot.policy.policyId ||
    context.policy.version !== snapshot.policy.version ||
    !snapshot.causationPresent
  ) {
    throw staleApprovalFailure("The governed export plan, evidence, policy, or causation changed after approval.");
  }
}

function sourceEventIdsForPreview(context: ValidatedContext, snapshot: CurrentSnapshot): readonly string[] {
  return sourceEventIdsFor({
    policyEventId: snapshot.policyEventId,
    causationEventId: context.causationEventId,
    evidenceBindings: snapshot.evidenceBindings
  });
}

function sourceEventIdsFor(input: {
  readonly policyEventId: string;
  readonly causationEventId: string;
  readonly evidenceBindings: readonly ExportReportEvidenceBinding[];
}): readonly string[] {
  return Object.freeze([...new Set([
    input.policyEventId,
    ...input.evidenceBindings.flatMap((binding) => [binding.evidenceEventId, ...binding.governanceEventIds]),
    input.causationEventId
  ])].sort());
}

function inputArtifactHashesFor(context: ValidatedContext, snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([...snapshot.includedContentHashes, context.outputArtifactHash]);
}

function provenanceRefsFor(context: ValidatedContext, snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([
    context.artifactId,
    context.outputArtifactHash,
    context.policy.policyId,
    context.policy.version,
    snapshot.policyEventId,
    context.causationEventId,
    ...snapshot.evidenceBindings.flatMap((binding) => [
      binding.evidenceId,
      binding.evidenceEventId,
      binding.contentHash,
      ...binding.governanceEventIds
    ])
  ]);
}

async function findExistingGeneratedEvent(
  context: ValidatedContext
): Promise<KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated"> | undefined> {
  const streamId = `${context.artifactKind}_${context.artifactId}`;
  const events = await context.ledger.readStream(streamId);
  return events.find((event): event is KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated"> =>
    event.type === `${context.artifactKind}.generated`
  );
}

function generatedEventMatches(
  event: KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated">,
  context: ValidatedContext
): boolean {
  const artifactId = event.type === "export.generated" ? event.payload.exportId : event.payload.reportId;
  return event.type === `${context.artifactKind}.generated` &&
    artifactId === context.artifactId &&
    event.context.causationId === context.causationEventId &&
    event.context.actor.id === context.actor.id &&
    event.payload.generatedBy === context.actor.id &&
    event.payload.policy.policyId === context.policy.policyId &&
    event.payload.policy.version === context.policy.version &&
    sameOrderedStrings(event.payload.includedEvidenceIds, context.includedEvidenceIds) &&
    sameOrderedStrings(event.payload.includedContentHashes, context.includedContentHashes) &&
    stableJson(event.payload.sensitiveOptIns) === stableJson(context.sensitiveOptIns) &&
    event.payload.defaultPublicSafeOnly === context.defaultPublicSafeOnly;
}

async function assertLedgerAttestedResult(
  beforeEvents: readonly KnowledgeEvent[],
  event: KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated">,
  context: ValidatedContext
): Promise<void> {
  const afterEvents = await context.ledger.readAll();
  const appended = eventsAddedAfter(beforeEvents, afterEvents);
  const attested = afterEvents.find((candidate) => candidate.id === event.id);
  if (
    attested === undefined ||
    appended.length !== 1 ||
    appended[0]?.id !== event.id ||
    !generatedEventMatches(event, context)
  ) {
    throw domainGateFailure("Governance generation results must be exactly attested by one append-only domain event.");
  }
}

function eventsAddedAfter(before: readonly KnowledgeEvent[], after: readonly KnowledgeEvent[]): KnowledgeEvent[] {
  const beforeIds = new Set(before.map((event) => event.id));
  return after.filter((event) => !beforeIds.has(event.id));
}

function mapResult(
  event: KnowledgeEventOf<"export.generated"> | KnowledgeEventOf<"report.generated">,
  context: ValidatedContext
): AgentDomainExecutionResult {
  return {
    eventIds: [event.id],
    artifactHashes: [context.outputArtifactHash],
    readModelChanges: [{
      projectionName: "governance-generated-artifacts",
      change: `recorded generated ${context.artifactKind} ${context.artifactId}`,
      relatedIds: [context.artifactId, ...context.includedEvidenceIds]
    }],
    resultSummary: `Governance recorded the approved ${context.artifactKind} generation without publishing or transferring artifact bytes.`
  };
}

function descriptorFor(toolId: string, toolVersion: string, kind: ArtifactKind): AgentDomainToolDescriptor {
  const descriptor = descriptorForKind(kind);
  if (toolId !== descriptor.toolId || toolVersion !== descriptor.toolVersion) {
    throw new Error("Export and report generation requires a canonical export or report descriptor.");
  }
  return descriptor;
}

function descriptorForKind(kind: ArtifactKind): AgentDomainToolDescriptor {
  return kind === "export" ? exportGenerateDescriptor : reportGenerateDescriptor;
}

function excludedCategoriesFor(
  plan: ExportPlan,
  projection: ReturnType<typeof buildGovernanceProjection>
): readonly string[] {
  const categories = new Set<string>();
  for (const blocked of plan.blockedEvidence) {
    if (blocked.requiredOptInTags.length > 0) {
      blocked.requiredOptInTags.forEach((tag) => categories.add(tag));
      continue;
    }
    const state = projection.evidenceGovernance.get(blocked.evidenceId);
    categories.add(state?.quarantined === true ? "quarantined" : state?.tombstoned === true ? "tombstoned" : "unavailable");
  }
  return Object.freeze([...categories].sort());
}

function staleApprovalFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "approval-stale",
    message,
    retryable: false,
    allowedActions: ["rebuild the governed generation preview", "request a new export approval"]
  });
}

function permissionFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "permission-denied",
    message,
    retryable: false,
    allowedActions: ["use the human governance actor named by the approval"]
  });
}

function domainGateFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "domain-gate-failed",
    message,
    retryable: false,
    allowedActions: ["inspect the governance export plan", "request a new export approval after repair"]
  });
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainDataObject(value)) {
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

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
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

function readDataProperty(record: Record<string, unknown>, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(`${label} is missing ${key}.`);
  }
  return descriptor.value;
}

function readStringProperty(record: Record<string, unknown>, key: string, label: string): string {
  const value = readDataProperty(record, key, label);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} field ${key} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, `${label} field ${key}`);
  return value;
}

function readOptionalStringProperty(record: Record<string, unknown>, key: string, label: string): string | undefined {
  return Object.hasOwn(record, key) ? readStringProperty(record, key, label) : undefined;
}

function readBooleanProperty(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = readDataProperty(record, key, label);
  if (typeof value !== "boolean") {
    throw new Error(`${label} field ${key} must be a boolean.`);
  }
  return value;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readDataProperty(record, key, label);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} field ${key} must be a non-negative integer.`);
  }
  return value;
}

function readEventIdProperty(record: Record<string, unknown>, key: string, label: string): string {
  const value = readStringProperty(record, key, label);
  if (!/^evt_[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`${label} field ${key} must be an event ID.`);
  }
  return value;
}

function readHashProperty(record: Record<string, unknown>, key: string, label: string): ContentHash {
  const value = readStringProperty(record, key, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} field ${key} must be an exact SHA-256 hash.`);
  }
  return value as ContentHash;
}

function readArtifactKind(record: Record<string, unknown>, key: string, label: string): ArtifactKind {
  const value = readStringProperty(record, key, label);
  if (value !== "export" && value !== "report") {
    throw new Error(`${label} field ${key} must be export or report.`);
  }
  return value;
}

function assertArtifactId(kind: ArtifactKind, artifactId: string): void {
  const pattern = kind === "export" ? /^exp_[a-zA-Z0-9_-]+$/ : /^report_[a-zA-Z0-9_-]+$/;
  if (!pattern.test(artifactId)) {
    throw new Error(`Export and report artifact ID must match artifact kind ${kind}.`);
  }
}

function readActorRef(record: Record<string, unknown>, key: string, label: string): ActorRef {
  const value = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  const parsed = actorRefSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} field ${key} must be a valid actor reference.`);
  }
  return parsed.data;
}

function readPolicyRef(record: Record<string, unknown>, key: string, label: string): PolicyRef {
  const value = dataRecordFromObject(
    clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`),
    `${label} field ${key}`
  );
  rejectUnsupportedKeys(value, new Set(["policyId", "version"]), `${label} field ${key}`);
  const policyId = readStringProperty(value, "policyId", `${label} field ${key}`);
  if (!/^gov_policy_[a-zA-Z0-9_-]+$/.test(policyId)) {
    throw new Error(`${label} policy ID must be canonical.`);
  }
  return Object.freeze({ policyId, version: readStringProperty(value, "version", `${label} field ${key}`) });
}

function readUniqueStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
  requireNonEmpty: boolean
): readonly string[] {
  const values = readPlainStringArray(readDataProperty(record, key, label), `${label} field ${key}`);
  if (requireNonEmpty && values.length === 0) {
    throw new Error(`${label} field ${key} must not be empty.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} field ${key} must not contain duplicates.`);
  }
  return values;
}

function readHashArray(record: Record<string, unknown>, key: string, label: string): readonly ContentHash[] {
  const values = readPlainStringArray(readDataProperty(record, key, label), `${label} field ${key}`);
  return Object.freeze(values.map((value) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
      throw new Error(`${label} field ${key} must contain exact SHA-256 hashes.`);
    }
    return value as ContentHash;
  }));
}

function readEvidenceBindings(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly ExportReportEvidenceBinding[] {
  const values = readPlainObjectArray(record, key, label);
  return Object.freeze(values.map((value) => {
    rejectUnsupportedKeys(
      value,
      new Set(["evidenceId", "evidenceEventId", "contentHash", "governanceEventIds"]),
      `${label} evidence binding`
    );
    return Object.freeze({
      evidenceId: readStringProperty(value, "evidenceId", `${label} evidence binding`),
      evidenceEventId: readEventIdProperty(value, "evidenceEventId", `${label} evidence binding`),
      contentHash: readHashProperty(value, "contentHash", `${label} evidence binding`),
      governanceEventIds: Object.freeze(readPlainStringArray(
        readDataProperty(value, "governanceEventIds", `${label} evidence binding`),
        `${label} governance event IDs`
      ).map((eventId) => {
        if (!/^evt_[a-zA-Z0-9_-]+$/.test(eventId)) {
          throw new Error(`${label} governance event IDs must be event IDs.`);
        }
        return eventId;
      }))
    });
  }));
}

function readGovernedPlan(record: Record<string, unknown>, key: string, label: string): ExportPlan {
  const value = dataRecordFromObject(
    clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`),
    `${label} field ${key}`
  );
  rejectUnsupportedKeys(value, new Set(["includedEvidenceIds", "blockedEvidence"]), `${label} governed plan`);
  const includedEvidenceIds = readUniqueStringArray(value, "includedEvidenceIds", `${label} governed plan`, false);
  const blockedEvidence = readPlainObjectArray(value, "blockedEvidence", `${label} governed plan`).map((blocked) => {
    rejectUnsupportedKeys(blocked, new Set(["evidenceId", "requiredOptInTags"]), `${label} blocked evidence`);
    return Object.freeze({
      evidenceId: readStringProperty(blocked, "evidenceId", `${label} blocked evidence`),
      requiredOptInTags: readGovernanceTags(blocked, "requiredOptInTags", `${label} blocked evidence`)
    });
  });
  return Object.freeze({ includedEvidenceIds, blockedEvidence: Object.freeze(blockedEvidence) });
}

function readSensitiveOptIns(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly SensitiveOptIn[] {
  const values = readPlainObjectArray(record, key, label).map((optIn) => {
    rejectUnsupportedKeys(optIn, new Set(["tag", "approvedBy", "rationale"]), `${label} sensitive opt-in`);
    const tag = readGovernanceTag(optIn, "tag", `${label} sensitive opt-in`);
    const rationale = readStringProperty(optIn, "rationale", `${label} sensitive opt-in`);
    assertAgentSecretSafeText(rationale, `${label} sensitive opt-in rationale`);
    assertSecretSafeText(rationale);
    return Object.freeze({
      tag,
      approvedBy: readStringProperty(optIn, "approvedBy", `${label} sensitive opt-in`),
      rationale
    });
  });
  if (new Set(values.map((value) => value.tag)).size !== values.length) {
    throw new Error(`${label} sensitive opt-ins must not contain duplicate tags.`);
  }
  return Object.freeze(values);
}

function readGovernanceTags(record: Record<string, unknown>, key: string, label: string): readonly GovernanceTag[] {
  const values = readPlainStringArray(readDataProperty(record, key, label), `${label} field ${key}`);
  return Object.freeze(values.map((value) => {
    if (!governanceTags.includes(value as GovernanceTag)) {
      throw new Error(`${label} field ${key} contains an unsupported governance tag.`);
    }
    return value as GovernanceTag;
  }));
}

function readGovernanceTag(record: Record<string, unknown>, key: string, label: string): GovernanceTag {
  const value = readStringProperty(record, key, label);
  if (!governanceTags.includes(value as GovernanceTag)) {
    throw new Error(`${label} field ${key} contains an unsupported governance tag.`);
  }
  return value as GovernanceTag;
}

function readLocks(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly AgentApprovedToolActiveLock[] {
  return Object.freeze(readPlainObjectArray(record, key, label).map((lock) => {
    rejectUnsupportedKeys(lock, new Set(["lockId", "category", "message"]), `${label} lock`);
    return Object.freeze({
      lockId: readStringProperty(lock, "lockId", `${label} lock`),
      category: readStringProperty(lock, "category", `${label} lock`),
      message: readStringProperty(lock, "message", `${label} lock`)
    });
  }));
}

function readPlainObjectArray(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly Record<string, unknown>[] {
  const cloned = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  if (!Array.isArray(cloned)) {
    throw new Error(`${label} field ${key} must be a plain array.`);
  }
  return cloned.map((item, index) => dataRecordFromObject(item, `${label} field ${key}[${index}]`));
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
  if (!isPlainDataObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must contain plain JSON data only.`);
  }
  const cloned: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must use enumerable data properties only.`);
    }
    cloned[name] = clonePlainJson(descriptor.value, `${label}.${name}`);
  }
  return cloned;
}

function readPlainStringArray(value: unknown, label: string): readonly string[] {
  const cloned = clonePlainJson(value, label);
  if (!Array.isArray(cloned) || cloned.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be a plain string array.`);
  }
  cloned.forEach((item) => assertAgentSecretSafeText(item as string, label));
  return Object.freeze([...cloned] as string[]);
}

function requireCallable(value: unknown, key: string, label: string): void {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} must provide ${key}().`);
  }
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new Error(`${label} must provide ${key}() as a data method.`);
      }
      return;
    }
    current = Object.getPrototypeOf(current);
  }
  throw new Error(`${label} must provide ${key}().`);
}

function copyPlan(plan: ExportPlan): ExportPlan {
  return Object.freeze({
    includedEvidenceIds: Object.freeze([...plan.includedEvidenceIds]),
    blockedEvidence: Object.freeze(plan.blockedEvidence.map((blocked) => Object.freeze({
      evidenceId: blocked.evidenceId,
      requiredOptInTags: Object.freeze([...blocked.requiredOptInTags])
    })))
  });
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
