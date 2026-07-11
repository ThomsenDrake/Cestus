import { createHash } from "node:crypto";
import {
  actorRefSchema,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import { buildGovernanceProjection } from "../../../ontology/src/governance-projection.js";
import { governanceTags, type GovernanceTag } from "../../../ontology/src/governance-policy.js";
import { contextPackRefSchema, type ContextPackRef } from "../context-packs.js";
import { agentDomainExecutionFailure, type AgentDomainExecutionAdapter } from "../domain-execution-dispatcher.js";
import type {
  AgentDomainPreview,
  AgentDomainToolDescriptor
} from "../domain-execution-descriptors.js";
import { buildAgentProjection } from "../projection.js";
import type { PromptArtifactAuditMetadata, PromptArtifactProductionBinding } from "../prompt-artifacts.js";
import {
  createProviderCapabilityDescriptor,
  type ProviderCapabilityDescriptor,
  type ProviderCapabilityRegistry
} from "../provider-registry.js";
import {
  providerReadinessDtoSchema,
  providerSetupCardSchema,
  type ProviderReadinessDto,
  type ProviderSetupCard
} from "../provider-readiness.js";
import type {
  AgentApprovedToolActiveLock,
  AgentApprovedToolExecutionInput,
  AgentApprovedToolPreviewInput,
  AgentApprovedToolPreviewResult
} from "../scheduler-types.js";
import { assertAgentSecretSafeText } from "../secret-safety.js";
import { approvedAgentSpecialistRunTypes } from "../specialists.js";
import { hashAgentToolPreview } from "../tool-gateway.js";

type ContentHash = `sha256:${string}`;
type ExcerptPolicy = "send-full-technically-eligible";

export const providerByteTransferDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "provider.bytes.transfer",
  toolVersion: "0.1.0",
  family: "provider-byte-transfer",
  sideEffectClass: "external-byte-transfer",
  requiredApprovalClass: "provider-byte-transfer",
  inputSchemaId: "provider-byte-transfer-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "IngestionRuntime.providerExecutionService",
  idempotencyKeyFields: [
    "providerJobId",
    "providerApprovalEventId",
    "evidenceBindings",
    "promptArtifactHash",
    "providerAdapterVersion"
  ],
  forbiddenEffects: [
    "direct-document-provider-parse",
    "model-provider-substitution",
    "raw-byte-lifecycle-evidence",
    "raw-prompt-lifecycle-evidence",
    "credential-resolution",
    "provider-call-without-ingestion-executor"
  ]
});

export const providerParseExecuteDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "ingestion.provider-parse.execute",
  toolVersion: "0.1.0",
  family: "provider-byte-transfer",
  sideEffectClass: "external-byte-transfer",
  requiredApprovalClass: "provider-byte-transfer",
  inputSchemaId: "ingestion-provider-parse-execution-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "IngestionRuntime.providerExecutionService",
  idempotencyKeyFields: [
    "providerJobId",
    "providerApprovalEventId",
    "evidenceBindings",
    "promptArtifactHash",
    "providerAdapterVersion"
  ],
  forbiddenEffects: [
    "direct-document-provider-parse",
    "model-provider-substitution",
    "raw-byte-lifecycle-evidence",
    "raw-prompt-lifecycle-evidence",
    "credential-resolution",
    "provider-call-without-ingestion-executor"
  ]
});

export const providerByteTransferDescriptors = Object.freeze([
  providerByteTransferDescriptor,
  providerParseExecuteDescriptor
] as const satisfies readonly AgentDomainToolDescriptor[]);

export interface ProviderTransferEvidenceBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly linkEventId: string;
  readonly contentHash: ContentHash;
  readonly byteCount: number;
  readonly mediaType: string;
}

export interface ProviderApprovalBinding {
  readonly eventId: string;
  readonly providerJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly provider: { readonly name: string; readonly version: string };
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly eligibleMediaTypes: readonly string[];
  readonly maxBytesPerFile: number;
  readonly policy: "send-all-technically-eligible";
}

export interface ProviderByteTransferAdapterContext {
  readonly ledger: EventLedger;
  readonly reviewer: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly providerJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly providerId: string;
  readonly approvalEventId: string;
  readonly credentialRefId: string;
  readonly evidenceBindings: readonly ProviderTransferEvidenceBinding[];
  readonly approvedProviderCapability: ProviderCapabilityDescriptor;
  readonly approvedProviderReadiness: ProviderSetupCard;
  readonly approvedPromptArtifact: PromptArtifactAuditMetadata;
  readonly excerptPolicy: ExcerptPolicy;
  readonly providerRegistry: Pick<ProviderCapabilityRegistry, "require">;
  readonly readProviderReadiness: () => ProviderReadinessDto | Promise<ProviderReadinessDto>;
  readonly readPromptArtifactAudit: () => PromptArtifactAuditMetadata | Promise<PromptArtifactAuditMetadata>;
}

export interface BuildProviderByteTransferPreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly providerJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly providerId: string;
  readonly providerCapability: ProviderCapabilityDescriptor;
  readonly providerReadiness: ProviderSetupCard;
  readonly credentialRefId: string;
  readonly providerApprovalEventId: string;
  readonly providerApproval: ProviderApprovalBinding;
  readonly evidenceBindings: readonly ProviderTransferEvidenceBinding[];
  readonly promptArtifact: PromptArtifactAuditMetadata;
  readonly excerptPolicy: ExcerptPolicy;
  readonly governanceTags: readonly string[];
  readonly activeLocks: readonly AgentApprovedToolActiveLock[];
  readonly projectionHighWaterMark: number;
  readonly domainReviewerId: string;
}

export interface RebuildProviderByteTransferCurrentPreviewInput extends ProviderByteTransferAdapterContext {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
}

interface ValidatedContext extends ProviderByteTransferAdapterContext {
  readonly reviewer: ActorRef & { readonly kind: "human" };
  readonly evidenceBindings: readonly ProviderTransferEvidenceBinding[];
  readonly approvedProviderCapability: ProviderCapabilityDescriptor;
  readonly approvedProviderReadiness: ProviderSetupCard;
  readonly approvedPromptArtifact: PromptArtifactAuditMetadata;
}

interface CurrentSnapshot {
  readonly providerApproval: ProviderApprovalBinding;
  readonly evidenceBindings: readonly ProviderTransferEvidenceBinding[];
  readonly providerCapability: ProviderCapabilityDescriptor;
  readonly providerReadiness: ProviderSetupCard;
  readonly promptArtifact: PromptArtifactAuditMetadata;
  readonly governanceTags: readonly GovernanceTag[];
  readonly projectionHighWaterMark: number;
}

const previewInputKeys = new Set([
  "toolRequestId", "toolId", "toolVersion", "runId", "taskId", "residentAgentId", "providerJobId",
  "sourceCollectionId", "importBatchId", "providerId", "providerCapability", "providerReadiness",
  "credentialRefId", "providerApprovalEventId", "providerApproval", "evidenceBindings", "promptArtifact",
  "excerptPolicy", "governanceTags", "activeLocks", "projectionHighWaterMark", "domainReviewerId"
]);

const contextInputKeys = new Set([
  "ledger", "reviewer", "residentAgentId", "taskId", "providerJobId", "sourceCollectionId", "importBatchId",
  "providerId", "approvalEventId", "credentialRefId", "evidenceBindings", "approvedProviderCapability",
  "approvedProviderReadiness", "approvedPromptArtifact", "excerptPolicy", "providerRegistry",
  "readProviderReadiness", "readPromptArtifactAudit"
]);

const rebuildInputKeys = new Set([
  ...contextInputKeys,
  "toolRequestId", "toolId", "toolVersion", "runId"
]);

const executionInputKeys = new Set([
  "toolRequestId", "runId", "taskId", "toolId", "toolVersion", "sideEffectClass", "approvalClass",
  "previewHash", "approvedPreviewHash", "approvedBy", "sourceEventIds", "inputArtifactHashes", "provenanceRefs"
]);

export function buildProviderByteTransferApprovalPreview(
  input: BuildProviderByteTransferPreviewInput
): AgentDomainPreview {
  return buildProviderByteTransferPreview(validatePreviewInput(input, true));
}

export async function rebuildProviderByteTransferCurrentPreview(
  input: RebuildProviderByteTransferCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "provider byte-transfer current-preview input");
  rejectUnsupportedKeys(record, rebuildInputKeys, "provider byte-transfer current-preview input");
  const context = validatedContextFromRecord(record);
  const toolId = readStringProperty(record, "toolId", "provider byte-transfer current-preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "provider byte-transfer current-preview input");
  descriptorFor(toolId, toolVersion);
  const snapshot = await readCurrentSnapshot(context);
  const activeLocks = await readActiveLocks(context);
  const currentInput = currentPreviewInput({
    context,
    snapshot,
    activeLocks,
    toolRequestId: readStringProperty(record, "toolRequestId", "provider byte-transfer current-preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "provider byte-transfer current-preview input")
  });
  const preview = buildProviderByteTransferPreview(validatePreviewInput(currentInput, false));

  return {
    preview,
    sourceEventIds: sourceEventIdsFor(snapshot),
    inputArtifactHashes: inputArtifactHashesFor(snapshot),
    provenanceRefs: provenanceRefsFor(context, snapshot),
    activeLocks,
    freshnessChecks: freshnessChecksFor(context, snapshot)
  };
}

export function createProviderByteTransferAdapter(
  input: ProviderByteTransferAdapterContext
): AgentDomainExecutionAdapter {
  return createFailClosedAdapter(validateAdapterContext(input), providerByteTransferDescriptor);
}

export function createProviderParseExecutionAdapter(
  input: ProviderByteTransferAdapterContext
): AgentDomainExecutionAdapter {
  return createFailClosedAdapter(validateAdapterContext(input), providerParseExecuteDescriptor);
}

function createFailClosedAdapter(
  context: ValidatedContext,
  descriptor: AgentDomainToolDescriptor
): AgentDomainExecutionAdapter {
  return Object.freeze({
    descriptor,
    buildCurrentPreview(request: AgentApprovedToolPreviewInput) {
      return rebuildProviderByteTransferCurrentPreview({
        ...context,
        toolRequestId: request.toolRequestId,
        toolId: request.toolId,
        toolVersion: request.toolVersion,
        runId: request.runId
      });
    },
    executeApproved(request: AgentApprovedToolExecutionInput) {
      return executeFailClosed(context, descriptor, request);
    }
  });
}

async function executeFailClosed(
  context: ValidatedContext,
  descriptor: AgentDomainToolDescriptor,
  input: AgentApprovedToolExecutionInput
): Promise<never> {
  const execution = validateExecutionInput(context, descriptor, input);
  const activeLocks = await readActiveLocks(context);
  if (activeLocks.length > 0) {
    throw agentDomainExecutionFailure({
      category: "lock-active",
      message: "An active resident-agent lock blocks provider byte transfer.",
      retryable: false,
      allowedActions: ["inspect active agent locks", "request human lock review before retrying"]
    });
  }

  const snapshot = await readCurrentSnapshot(context);
  assertSnapshotFresh(context, snapshot);
  const currentInput = currentPreviewInput({
    context,
    snapshot,
    activeLocks: [],
    toolRequestId: execution.toolRequestId,
    toolId: execution.toolId,
    toolVersion: execution.toolVersion,
    runId: execution.runId
  });
  const currentPreview = buildProviderByteTransferPreview(validatePreviewInput(currentInput, false));
  if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
    throw staleApprovalFailure("Provider byte-transfer preview changed after approval.");
  }
  if (!sameOrderedStrings(execution.sourceEventIds, sourceEventIdsFor(snapshot))) {
    throw staleApprovalFailure("Provider byte-transfer source event bindings changed after approval.");
  }
  if (!sameOrderedStrings(execution.inputArtifactHashes, inputArtifactHashesFor(snapshot))) {
    throw staleApprovalFailure("Provider byte-transfer artifact hashes changed after approval.");
  }
  if (!sameOrderedStrings(execution.provenanceRefs, provenanceRefsFor(context, snapshot))) {
    throw agentDomainExecutionFailure({
      category: "provenance-missing",
      message: "Provider byte-transfer provenance does not match the approved evidence and provider gate.",
      retryable: false,
      allowedActions: ["rebuild the provider transfer preview", "request a new provider byte-transfer approval"]
    });
  }

  throw agentDomainExecutionFailure({
    category: "domain-gate-failed",
    message: "Ingestion provider execution service is not available.",
    retryable: false,
    allowedActions: ["wait for ingestion provider execution service"]
  });
}

function validatePreviewInput(
  input: BuildProviderByteTransferPreviewInput,
  strictBindings: boolean
): BuildProviderByteTransferPreviewInput {
  const record = dataRecordFromObject(input, "provider byte-transfer preview input");
  rejectUnsupportedKeys(record, previewInputKeys, "provider byte-transfer preview input");
  const toolId = readStringProperty(record, "toolId", "provider byte-transfer preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "provider byte-transfer preview input");
  descriptorFor(toolId, toolVersion);
  const providerJobId = readIdentifier(record, "providerJobId", /^provider_[a-zA-Z0-9_-]+$/, "provider job ID");
  const sourceCollectionId = readIdentifier(record, "sourceCollectionId", /^src_[a-zA-Z0-9_-]+$/, "source collection ID");
  const importBatchId = readIdentifier(record, "importBatchId", /^imp_[a-zA-Z0-9_-]+$/, "import batch ID");
  const providerId = readIdentifier(record, "providerId", /^provider_[a-zA-Z0-9_-]+$/, "provider ID");
  const providerCapability = readProviderCapability(record, "providerCapability", "provider byte-transfer preview input");
  const providerReadiness = readProviderReadinessCard(record, "providerReadiness", "provider byte-transfer preview input");
  const credentialRefId = readIdentifier(
    record,
    "credentialRefId",
    /^agent_credref_[a-zA-Z0-9_-]+$/,
    "credential reference ID"
  );
  const providerApprovalEventId = readEventIdProperty(
    record,
    "providerApprovalEventId",
    "provider byte-transfer preview input"
  );
  const providerApproval = readProviderApproval(record, "providerApproval", "provider byte-transfer preview input");
  const evidenceBindings = readEvidenceBindings(record, "evidenceBindings", "provider byte-transfer preview input");
  const promptArtifact = readPromptArtifactAudit(record, "promptArtifact", "provider byte-transfer preview input");
  const excerptPolicy = readExcerptPolicy(record, "excerptPolicy", "provider byte-transfer preview input");
  const currentGovernanceTags = readGovernanceTags(record, "governanceTags", "provider byte-transfer preview input");
  const activeLocks = readLocks(record, "activeLocks", "provider byte-transfer preview input");
  const projectionHighWaterMark = readNonNegativeInteger(
    record,
    "projectionHighWaterMark",
    "provider byte-transfer preview input"
  );
  const domainReviewerId = readStringProperty(record, "domainReviewerId", "provider byte-transfer preview input");

  if (strictBindings) {
    if (providerApprovalEventId !== providerApproval.eventId) {
      throw new Error("Provider byte-transfer approval event must match the approved event binding.");
    }
    if (
      providerApproval.providerJobId !== providerJobId ||
      providerApproval.sourceCollectionId !== sourceCollectionId ||
      providerApproval.importBatchId !== importBatchId
    ) {
      throw new Error("Provider byte-transfer approval identity must match the requested provider job and import.");
    }
    if (
      providerCapability.providerId !== providerId ||
      providerApproval.provider.name !== providerId ||
      providerApproval.provider.version !== providerCapability.adapterVersion
    ) {
      throw new Error("Provider byte-transfer approval provider must match the current provider descriptor.");
    }
    if (
      providerReadiness.providerId !== providerId ||
      providerReadiness.credentialRefId !== credentialRefId
    ) {
      throw new Error("Provider byte-transfer readiness credential reference must match the approved provider binding.");
    }
    if (
      providerReadiness.state !== "requires-byte-transfer-approval" ||
      providerReadiness.requiredApprovalClass !== "provider-byte-transfer" ||
      providerReadiness.credentialHealth !== "local-binding-healthy"
    ) {
      throw new Error("Provider byte-transfer readiness must require provider-byte-transfer approval with a healthy local binding.");
    }
    if (providerApproval.approvedBy !== domainReviewerId) {
      throw new Error("Provider byte-transfer approval actor must match the human domain reviewer.");
    }
    if (
      promptArtifact.safetyClass !== "provider-approved" ||
      promptArtifact.transferApprovalClass !== "provider-byte-transfer"
    ) {
      throw new Error("Prompt artifact must be provider-approved for provider-byte-transfer.");
    }
    for (const binding of evidenceBindings) {
      if (!providerApproval.eligibleMediaTypes.includes(binding.mediaType)) {
        throw new Error("Provider byte-transfer evidence media type is outside the approved provider policy.");
      }
      if (binding.byteCount > providerApproval.maxBytesPerFile) {
        throw new Error("Provider byte-transfer evidence exceeds the approved maximum byte count.");
      }
      if (!promptAuditBindsEvidence(promptArtifact, binding)) {
        throw new Error("Provider byte-transfer prompt artifact does not bind the evidence content hash and source events.");
      }
    }
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "provider byte-transfer preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "provider byte-transfer preview input"),
    taskId: readStringProperty(record, "taskId", "provider byte-transfer preview input"),
    residentAgentId: readStringProperty(record, "residentAgentId", "provider byte-transfer preview input"),
    providerJobId,
    sourceCollectionId,
    importBatchId,
    providerId,
    providerCapability,
    providerReadiness,
    credentialRefId,
    providerApprovalEventId,
    providerApproval,
    evidenceBindings,
    promptArtifact,
    excerptPolicy,
    governanceTags: currentGovernanceTags,
    activeLocks,
    projectionHighWaterMark,
    domainReviewerId
  };
}

function validateAdapterContext(input: ProviderByteTransferAdapterContext): ValidatedContext {
  const record = dataRecordFromObject(input, "provider byte-transfer adapter input");
  rejectUnsupportedKeys(record, contextInputKeys, "provider byte-transfer adapter input");
  return validatedContextFromRecord(record);
}

function validatedContextFromRecord(record: Record<string, unknown>): ValidatedContext {
  const ledger = readDataProperty(record, "ledger", "provider byte-transfer adapter input") as EventLedger;
  requireCallable(ledger, "readAll", "provider byte-transfer ledger");
  requireCallable(ledger, "readStream", "provider byte-transfer ledger");
  const reviewer = readActorRef(record, "reviewer", "provider byte-transfer adapter input");
  if (reviewer.kind !== "human") {
    throw new Error("Provider byte-transfer adapter requires a human reviewer.");
  }
  const providerRegistry = readDataProperty(
    record,
    "providerRegistry",
    "provider byte-transfer adapter input"
  ) as Pick<ProviderCapabilityRegistry, "require">;
  requireCallable(providerRegistry, "require", "provider byte-transfer provider registry");
  const readProviderReadiness = readFunctionProperty(
    record,
    "readProviderReadiness",
    "provider byte-transfer provider readiness reader"
  ) as ProviderByteTransferAdapterContext["readProviderReadiness"];
  const promptArtifactAuditReader = readFunctionProperty(
    record,
    "readPromptArtifactAudit",
    "provider byte-transfer prompt artifact audit reader"
  ) as ProviderByteTransferAdapterContext["readPromptArtifactAudit"];
  const providerId = readIdentifier(record, "providerId", /^provider_[a-zA-Z0-9_-]+$/, "provider ID");
  const credentialRefId = readIdentifier(
    record,
    "credentialRefId",
    /^agent_credref_[a-zA-Z0-9_-]+$/,
    "credential reference ID"
  );
  const approvedProviderCapability = readProviderCapability(
    record,
    "approvedProviderCapability",
    "provider byte-transfer adapter input"
  );
  const approvedProviderReadiness = readProviderReadinessCard(
    record,
    "approvedProviderReadiness",
    "provider byte-transfer adapter input"
  );
  const approvedPromptArtifact = readPromptArtifactAudit(
    record,
    "approvedPromptArtifact",
    "provider byte-transfer adapter input"
  );
  if (approvedProviderCapability.providerId !== providerId) {
    throw new Error("Provider byte-transfer approved descriptor must match the provider ID.");
  }
  if (approvedProviderReadiness.providerId !== providerId) {
    throw new Error("Provider byte-transfer approved readiness must match the provider ID.");
  }
  if (approvedProviderReadiness.credentialRefId !== credentialRefId) {
    throw new Error("Provider byte-transfer approved readiness must match the credential reference ID.");
  }
  if (
    approvedProviderReadiness.state !== "requires-byte-transfer-approval" ||
    approvedProviderReadiness.requiredApprovalClass !== "provider-byte-transfer" ||
    approvedProviderReadiness.credentialHealth !== "local-binding-healthy"
  ) {
    throw new Error("Provider byte-transfer approved readiness must preserve the approval gate and healthy local binding.");
  }
  if (
    approvedPromptArtifact.safetyClass !== "provider-approved" ||
    approvedPromptArtifact.transferApprovalClass !== "provider-byte-transfer"
  ) {
    throw new Error("Provider byte-transfer approved prompt audit must preserve the transfer gate.");
  }
  const humanReviewer: ActorRef & { readonly kind: "human" } = Object.freeze({
    id: reviewer.id,
    kind: "human",
    label: reviewer.label
  });
  const evidenceBindings = readEvidenceBindings(record, "evidenceBindings", "provider byte-transfer adapter input");
  for (const binding of evidenceBindings) {
    if (!promptAuditBindsEvidence(approvedPromptArtifact, binding)) {
      throw staleApprovalFailure("Provider byte-transfer approved prompt artifact must bind every evidence hash and source event.");
    }
  }

  return {
    ledger,
    reviewer: humanReviewer,
    residentAgentId: readStringProperty(record, "residentAgentId", "provider byte-transfer adapter input"),
    taskId: readStringProperty(record, "taskId", "provider byte-transfer adapter input"),
    providerJobId: readIdentifier(record, "providerJobId", /^provider_[a-zA-Z0-9_-]+$/, "provider job ID"),
    sourceCollectionId: readIdentifier(record, "sourceCollectionId", /^src_[a-zA-Z0-9_-]+$/, "source collection ID"),
    importBatchId: readIdentifier(record, "importBatchId", /^imp_[a-zA-Z0-9_-]+$/, "import batch ID"),
    providerId,
    approvalEventId: readEventIdProperty(record, "approvalEventId", "provider byte-transfer adapter input"),
    credentialRefId,
    evidenceBindings,
    approvedProviderCapability,
    approvedProviderReadiness,
    approvedPromptArtifact,
    excerptPolicy: readExcerptPolicy(record, "excerptPolicy", "provider byte-transfer adapter input"),
    providerRegistry,
    readProviderReadiness,
    readPromptArtifactAudit: promptArtifactAuditReader
  };
}

function validateExecutionInput(
  context: ValidatedContext,
  descriptor: AgentDomainToolDescriptor,
  input: AgentApprovedToolExecutionInput
): AgentApprovedToolExecutionInput {
  let record: Record<string, unknown>;
  try {
    record = dataRecordFromObject(input, "provider byte-transfer approved execution input");
    rejectUnsupportedKeys(record, executionInputKeys, "provider byte-transfer approved execution input");
  } catch {
    throw permissionFailure("Provider byte-transfer execution input must be a plain approved-execution DTO.");
  }
  const toolId = readStringProperty(record, "toolId", "provider byte-transfer approved execution input");
  const toolVersion = readStringProperty(record, "toolVersion", "provider byte-transfer approved execution input");
  if (toolId !== descriptor.toolId || toolVersion !== descriptor.toolVersion) {
    throw permissionFailure("Provider byte-transfer execution requires the registered descriptor.");
  }
  if (
    readStringProperty(record, "sideEffectClass", "provider byte-transfer approved execution input") !== "external-byte-transfer" ||
    readStringProperty(record, "approvalClass", "provider byte-transfer approved execution input") !== "provider-byte-transfer"
  ) {
    throw permissionFailure("Provider byte-transfer execution requires provider-byte-transfer approval.");
  }
  const approvedBy = readStringProperty(record, "approvedBy", "provider byte-transfer approved execution input");
  if (approvedBy !== context.reviewer.id) {
    throw permissionFailure("Provider byte-transfer approval actor must match the human domain reviewer.");
  }
  let previewHash: ContentHash;
  let approvedPreviewHash: ContentHash;
  try {
    previewHash = readHashProperty(record, "previewHash", "provider byte-transfer approved execution input");
    approvedPreviewHash = readHashProperty(record, "approvedPreviewHash", "provider byte-transfer approved execution input");
  } catch {
    throw staleApprovalFailure("Provider byte-transfer preview hashes must be exact SHA-256 values.");
  }
  if (previewHash !== approvedPreviewHash) {
    throw staleApprovalFailure("Provider byte-transfer preview hashes do not match.");
  }
  const sourceEventIds = readPlainStringArray(
    readDataProperty(record, "sourceEventIds", "provider byte-transfer approved execution input"),
    "provider byte-transfer source event IDs"
  );
  const inputArtifactHashes = readPlainStringArray(
    readDataProperty(record, "inputArtifactHashes", "provider byte-transfer approved execution input"),
    "provider byte-transfer input artifact hashes"
  );
  const provenanceRefs = readPlainStringArray(
    readDataProperty(record, "provenanceRefs", "provider byte-transfer approved execution input"),
    "provider byte-transfer provenance refs"
  );
  const taskId = readOptionalStringProperty(record, "taskId", "provider byte-transfer approved execution input");
  if (taskId !== undefined && taskId !== context.taskId) {
    throw staleApprovalFailure("Provider byte-transfer task identity changed after approval.");
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "provider byte-transfer approved execution input"),
    runId: readStringProperty(record, "runId", "provider byte-transfer approved execution input"),
    ...(taskId === undefined ? {} : { taskId }),
    toolId,
    toolVersion,
    sideEffectClass: "external-byte-transfer",
    approvalClass: "provider-byte-transfer",
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
  const approvalEvent = events.find(
    (event): event is KnowledgeEventOf<"ingestion.provider.approved"> =>
      event.id === context.approvalEventId && event.type === "ingestion.provider.approved"
  );
  if (approvalEvent === undefined) {
    throw staleApprovalFailure("The exact ingestion provider approval event is missing.");
  }
  if (
    approvalEvent.context.actor.kind !== "human" ||
    approvalEvent.context.actor.id !== approvalEvent.payload.approvedBy ||
    approvalEvent.context.actor.id !== context.reviewer.id
  ) {
    throw staleApprovalFailure("The ingestion provider approval event is not attested by the expected human reviewer.");
  }
  const evidenceBindings = context.evidenceBindings.map((expected) => {
    const approvedEvidence = events.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.id === expected.evidenceEventId && event.type === "evidence.ingested"
    );
    const evidence = events.findLast(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === expected.evidenceId
    );
    const link = events.find(
      (event): event is KnowledgeEventOf<"ingestion.evidence.linked"> =>
        event.id === expected.linkEventId && event.type === "ingestion.evidence.linked"
    );
    if (approvedEvidence === undefined || evidence === undefined || link === undefined) {
      throw staleApprovalFailure("Provider byte-transfer evidence or ingestion linkage is missing.");
    }
    if (
      approvedEvidence.payload.evidenceId !== expected.evidenceId ||
      approvedEvidence.payload.contentHash !== expected.contentHash ||
      approvedEvidence.payload.sizeBytes !== expected.byteCount ||
      approvedEvidence.payload.mediaType !== expected.mediaType ||
      link.payload.evidenceId !== expected.evidenceId ||
      link.payload.importBatchId !== context.importBatchId ||
      link.payload.sourceCollectionId !== context.sourceCollectionId ||
      link.payload.contentHash !== expected.contentHash
    ) {
      throw staleApprovalFailure("Provider byte-transfer evidence or ingestion linkage no longer matches the approved binding.");
    }
    return Object.freeze({
      evidenceId: evidence.payload.evidenceId,
      evidenceEventId: evidence.id,
      linkEventId: link.id,
      contentHash: evidence.payload.contentHash as ContentHash,
      byteCount: evidence.payload.sizeBytes,
      mediaType: evidence.payload.mediaType
    });
  });

  let providerCapability: ProviderCapabilityDescriptor;
  let providerReadiness: ProviderSetupCard;
  let promptArtifact: PromptArtifactAuditMetadata;
  try {
    providerCapability = createProviderCapabilityDescriptor(context.providerRegistry.require(context.providerId));
    const readinessDto = providerReadinessDtoSchema.parse(
      clonePlainJson(await context.readProviderReadiness(), "provider readiness DTO")
    );
    const card = readinessDto.cards.find((candidate) => candidate.providerId === context.providerId);
    if (card === undefined) {
      throw new Error("missing provider readiness card");
    }
    providerReadiness = providerSetupCardSchema.parse(card);
    promptArtifact = parsePromptArtifactAudit(
      await context.readPromptArtifactAudit(),
      "provider prompt artifact audit"
    );
  } catch {
    throw staleApprovalFailure("Current provider descriptor, readiness, or prompt artifact audit is unavailable.");
  }

  const projection = buildGovernanceProjection(events);
  const currentTags = new Set<GovernanceTag>();
  for (const binding of evidenceBindings) {
    const state = projection.evidenceGovernance.get(binding.evidenceId);
    for (const tag of state?.currentTags.values() ?? []) {
      if (tag.status === "active") {
        currentTags.add(tag.tag);
      }
    }
  }
  const relevantIds = new Set([
    approvalEvent.id,
    ...evidenceBindings.flatMap((binding) => [binding.evidenceEventId, binding.linkEventId])
  ]);

  return {
    providerApproval: providerApprovalFromEvent(approvalEvent),
    evidenceBindings: Object.freeze(evidenceBindings),
    providerCapability,
    providerReadiness,
    promptArtifact,
    governanceTags: Object.freeze([...currentTags].sort()),
    projectionHighWaterMark: events.filter((event) => relevantIds.has(event.id)).length
  };
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

function currentPreviewInput(input: {
  readonly context: ValidatedContext;
  readonly snapshot: CurrentSnapshot;
  readonly activeLocks: readonly AgentApprovedToolActiveLock[];
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
}): BuildProviderByteTransferPreviewInput {
  return {
    toolRequestId: input.toolRequestId,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    runId: input.runId,
    taskId: input.context.taskId,
    residentAgentId: input.context.residentAgentId,
    providerJobId: input.context.providerJobId,
    sourceCollectionId: input.context.sourceCollectionId,
    importBatchId: input.context.importBatchId,
    providerId: input.context.providerId,
    providerCapability: input.snapshot.providerCapability,
    providerReadiness: input.snapshot.providerReadiness,
    credentialRefId: input.context.credentialRefId,
    providerApprovalEventId: input.context.approvalEventId,
    providerApproval: input.snapshot.providerApproval,
    evidenceBindings: input.snapshot.evidenceBindings,
    promptArtifact: input.snapshot.promptArtifact,
    excerptPolicy: input.context.excerptPolicy,
    governanceTags: input.snapshot.governanceTags,
    activeLocks: input.activeLocks,
    projectionHighWaterMark: input.snapshot.projectionHighWaterMark,
    domainReviewerId: input.context.reviewer.id
  };
}

function buildProviderByteTransferPreview(input: BuildProviderByteTransferPreviewInput): AgentDomainPreview {
  const descriptor = descriptorFor(input.toolId, input.toolVersion);
  const totalBytes = input.evidenceBindings.reduce((sum, binding) => sum + binding.byteCount, 0);
  const consequence = `Approval would allow ${totalBytes} bytes of selected evidence to leave this machine for ${input.providerCapability.label}; this adapter does not transfer bytes because the ingestion provider execution service is unavailable.`;
  assertAgentSecretSafeText(consequence, "provider byte-transfer consequence");
  const readinessRef = sha256(stableJson(input.providerReadiness));
  const production = input.promptArtifact.production;
  const normalizedInputHash = sha256(stableJson({
    providerJobId: input.providerJobId,
    sourceCollectionId: input.sourceCollectionId,
    importBatchId: input.importBatchId,
    providerId: input.providerId,
    providerCapability: input.providerCapability,
    providerReadiness: input.providerReadiness,
    credentialRefId: input.credentialRefId,
    providerApproval: input.providerApproval,
    evidenceBindings: input.evidenceBindings,
    promptArtifact: input.promptArtifact,
    excerptPolicy: input.excerptPolicy,
    governanceTags: input.governanceTags,
    activeLocks: input.activeLocks
  }));

  return {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: input.toolRequestId,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: input.residentAgentId,
    sideEffectClass: descriptor.sideEffectClass,
    requiredApprovalClass: descriptor.requiredApprovalClass,
    targetDomainService: descriptor.targetDomainService,
    inputSchemaId: descriptor.inputSchemaId,
    normalizedInputHash,
    summary: `Review provider byte transfer for job ${input.providerJobId}.`,
    scope: `${input.evidenceBindings.length} evidence item(s), ${totalBytes} bytes, provider ${input.providerCapability.label}.`,
    estimatedEffect: "No bytes transfer until the ingestion provider execution service exists.",
    consequence,
    affectedRefs: [
      ...input.evidenceBindings.map((binding) => ({
        kind: "evidence",
        id: binding.evidenceId,
        eventId: binding.evidenceEventId,
        linkEventId: binding.linkEventId,
        hash: binding.contentHash,
        byteCount: binding.byteCount,
        mediaType: binding.mediaType
      })),
      {
        kind: "provider-approval",
        id: input.providerApproval.eventId,
        providerJobId: input.providerJobId,
        policy: input.providerApproval.policy
      },
      {
        kind: "provider-capability",
        id: input.providerCapability.providerId,
        adapterVersion: input.providerCapability.adapterVersion
      },
      {
        kind: "provider-readiness",
        id: input.providerReadiness.providerId,
        hash: readinessRef,
        state: input.providerReadiness.state,
        providerBindingRefId: input.providerReadiness.credentialRefId
      },
      {
        kind: "prompt-artifact-audit",
        id: input.promptArtifact.inputArtifactHash,
        hash: input.promptArtifact.inputArtifactHash,
        transferApprovalClass: input.promptArtifact.transferApprovalClass,
        ...(production === undefined ? {} : {
          rendererId: production.rendererId,
          rendererVersion: production.rendererVersion,
          rendererHash: production.rendererHash,
          renderedPromptHash: production.renderedPromptHash,
          providerOutputSchemaId: production.providerOutputSchemaId,
          providerOutputSchemaVersion: production.providerOutputSchemaVersion,
          handoffSchemaId: production.handoffSchemaId,
          handoffSchemaVersion: production.handoffSchemaVersion,
          scopeApplicabilityHash: production.scopeApplicabilityHash,
          resolvedPayloadVerificationStatus: "verified"
        })
      }
    ],
    expectedOutputs: [{
      kind: "blocked-domain-execution",
      service: "IngestionRuntime.providerExecutionService",
      allowedAction: "wait for ingestion provider execution service"
    }],
    contextPackRefs: input.promptArtifact.contextPackRefs.map((ref) => ({ ...ref })),
    governancePolicyVersion: input.providerApproval.policy,
    lockSnapshot: input.activeLocks.map((lock) => ({ ...lock })),
    projectionHighWaterMarks: [{
      projectionName: "ingestion-provider-transfer",
      highWaterMark: input.projectionHighWaterMark
    }],
    idempotencyKey: sha256(stableJson({
      toolId: input.toolId,
      providerJobId: input.providerJobId,
      providerApprovalEventId: input.providerApproval.eventId,
      evidenceBindings: input.evidenceBindings,
      promptArtifactHash: input.promptArtifact.inputArtifactHash,
      production: input.promptArtifact.production,
      providerAdapterVersion: input.providerCapability.adapterVersion
    })),
    staleAfter: {
      kind: "provider-approval-evidence-readiness-or-prompt-change",
      refs: [
        input.providerApproval.eventId,
        input.providerCapability.providerId,
        input.providerCapability.adapterVersion,
        input.credentialRefId,
        input.promptArtifact.inputArtifactHash,
        ...productionAuditRefs(input.promptArtifact),
        ...sourceEventIdsForInput(input),
        ...input.evidenceBindings.map((binding) => binding.contentHash)
      ]
    },
    relatedEventIds: sourceEventIdsForInput(input),
    artifactHashes: uniqueStrings([
      ...input.evidenceBindings.map((binding) => binding.contentHash),
      input.promptArtifact.inputArtifactHash,
      ...productionArtifactHashes(input.promptArtifact)
    ]),
    provenanceRefs: provenanceRefsForInput(input),
    providerJobId: input.providerJobId,
    sourceCollectionId: input.sourceCollectionId,
    importBatchId: input.importBatchId,
    providerId: input.providerId,
    providerLabel: input.providerCapability.label,
    adapterVersion: input.providerCapability.adapterVersion,
    providerReadinessRef: readinessRef,
    providerBindingRefId: input.credentialRefId,
    providerApprovalEventId: input.providerApproval.eventId,
    providerApproval: copyPlain(input.providerApproval),
    evidenceBindings: input.evidenceBindings.map((binding) => ({ ...binding })),
    promptArtifactHash: input.promptArtifact.inputArtifactHash,
    promptArtifact: copyPlain(input.promptArtifact),
    ...(production === undefined ? {} : {
      renderedPromptHash: production.renderedPromptHash,
      scopeApplicabilityHash: production.scopeApplicabilityHash,
      providerOutputSchemaId: production.providerOutputSchemaId,
      handoffSchemaId: production.handoffSchemaId,
      resolvedPayloadVerificationStatus: "verified"
    }),
    excerptPolicy: input.excerptPolicy,
    eligibleMediaTypes: [...input.providerApproval.eligibleMediaTypes],
    maxBytesPerFile: input.providerApproval.maxBytesPerFile,
    providerRetentionDataHandlingNote: input.providerCapability.dataHandlingNotes,
    governanceTags: [...input.governanceTags]
  };
}

function freshnessChecksFor(context: ValidatedContext, snapshot: CurrentSnapshot) {
  return [
    freshnessCheck(
      "provider-approval",
      "matching",
      providerApprovalMatchesContext(snapshot.providerApproval, context) ? "matching" : "mismatch"
    ),
    freshnessCheck("evidence-bindings", sha256(stableJson(context.evidenceBindings)), sha256(stableJson(snapshot.evidenceBindings))),
    freshnessCheck(
      "provider-capability",
      sha256(stableJson(context.approvedProviderCapability)),
      sha256(stableJson(snapshot.providerCapability))
    ),
    freshnessCheck(
      "provider-readiness",
      sha256(stableJson(context.approvedProviderReadiness)),
      sha256(stableJson(snapshot.providerReadiness))
    ),
    freshnessCheck(
      "prompt-artifact-audit",
      sha256(stableJson(context.approvedPromptArtifact)),
      sha256(stableJson(snapshot.promptArtifact))
    )
  ];
}

function freshnessCheck(name: string, expected: string, actual: string) {
  return { name, expected, actual, ok: expected === actual };
}

function assertSnapshotFresh(context: ValidatedContext, snapshot: CurrentSnapshot): void {
  if (
    !providerApprovalMatchesContext(snapshot.providerApproval, context) ||
    stableJson(context.evidenceBindings) !== stableJson(snapshot.evidenceBindings) ||
    stableJson(context.approvedProviderCapability) !== stableJson(snapshot.providerCapability) ||
    stableJson(context.approvedProviderReadiness) !== stableJson(snapshot.providerReadiness) ||
    stableJson(context.approvedPromptArtifact) !== stableJson(snapshot.promptArtifact)
  ) {
    throw staleApprovalFailure("Provider approval, evidence, descriptor, readiness, or prompt audit changed after approval.");
  }
}

function providerApprovalMatchesContext(
  approval: ProviderApprovalBinding,
  context: ValidatedContext
): boolean {
  return approval.eventId === context.approvalEventId &&
    approval.providerJobId === context.providerJobId &&
    approval.sourceCollectionId === context.sourceCollectionId &&
    approval.importBatchId === context.importBatchId &&
    approval.provider.name === context.providerId &&
    approval.provider.version === context.approvedProviderCapability.adapterVersion &&
    approval.approvedBy === context.reviewer.id &&
    approval.policy === "send-all-technically-eligible" &&
    context.evidenceBindings.every((binding) =>
      approval.eligibleMediaTypes.includes(binding.mediaType) && binding.byteCount <= approval.maxBytesPerFile
    );
}

function providerApprovalFromEvent(
  event: KnowledgeEventOf<"ingestion.provider.approved">
): ProviderApprovalBinding {
  return Object.freeze({
    eventId: event.id,
    providerJobId: event.payload.providerJobId,
    sourceCollectionId: event.payload.sourceCollectionId,
    importBatchId: event.payload.importBatchId,
    provider: Object.freeze({ ...event.payload.provider }),
    approvedBy: event.payload.approvedBy,
    approvedAt: event.payload.approvedAt,
    eligibleMediaTypes: Object.freeze([...event.payload.eligibleMediaTypes]),
    maxBytesPerFile: event.payload.maxBytesPerFile,
    policy: event.payload.policy
  });
}

function sourceEventIdsFor(snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([
    snapshot.providerApproval.eventId,
    ...snapshot.evidenceBindings.flatMap((binding) => [binding.evidenceEventId, binding.linkEventId])
  ].sort());
}

function sourceEventIdsForInput(input: BuildProviderByteTransferPreviewInput): readonly string[] {
  return Object.freeze([
    input.providerApproval.eventId,
    ...input.evidenceBindings.flatMap((binding) => [binding.evidenceEventId, binding.linkEventId])
  ].sort());
}

function inputArtifactHashesFor(snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([
    ...snapshot.evidenceBindings.map((binding) => binding.contentHash),
    snapshot.promptArtifact.inputArtifactHash,
    ...productionArtifactHashes(snapshot.promptArtifact)
  ]);
}

function provenanceRefsFor(context: ValidatedContext, snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([
    context.providerJobId,
    context.sourceCollectionId,
    context.importBatchId,
    snapshot.providerApproval.eventId,
    context.providerId,
    snapshot.providerCapability.adapterVersion,
    context.credentialRefId,
    snapshot.promptArtifact.inputArtifactHash,
    ...productionAuditRefs(snapshot.promptArtifact),
    ...snapshot.evidenceBindings.flatMap((binding) => [
      binding.evidenceId,
      binding.evidenceEventId,
      binding.linkEventId,
      binding.contentHash
    ])
  ]);
}

function provenanceRefsForInput(input: BuildProviderByteTransferPreviewInput): readonly string[] {
  return Object.freeze([
    input.providerJobId,
    input.sourceCollectionId,
    input.importBatchId,
    input.providerApproval.eventId,
    input.providerId,
    input.providerCapability.adapterVersion,
    input.credentialRefId,
    input.promptArtifact.inputArtifactHash,
    ...productionAuditRefs(input.promptArtifact),
    ...input.evidenceBindings.flatMap((binding) => [
      binding.evidenceId,
      binding.evidenceEventId,
      binding.linkEventId,
      binding.contentHash
    ])
  ]);
}

function productionArtifactHashes(promptArtifact: PromptArtifactAuditMetadata): readonly string[] {
  const production = promptArtifact.production;
  if (production === undefined) {
    return [];
  }
  return Object.freeze([
    production.rendererHash,
    production.renderedPromptHash,
    production.scopeApplicabilityHash,
    ...production.evaluatedContextRequirements.flatMap((requirement) => requirement.contentHash === undefined ? [] : [requirement.contentHash]),
    ...production.resolvedPayloadAudits.map((audit) => audit.contentHash)
  ]);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function productionAuditRefs(promptArtifact: PromptArtifactAuditMetadata): readonly string[] {
  const production = promptArtifact.production;
  if (production === undefined) {
    return [];
  }
  return Object.freeze([
    production.rendererId,
    String(production.rendererVersion),
    production.providerOutputSchemaId,
    String(production.providerOutputSchemaVersion),
    production.handoffSchemaId,
    String(production.handoffSchemaVersion),
    ...productionArtifactHashes(promptArtifact),
    ...production.evaluatedContextRequirements.flatMap((requirement) => [
      requirement.contextPackId,
      requirement.requirementMode,
      requirement.status,
      ...(requirement.omissionReason === undefined ? [] : [requirement.omissionReason])
    ]),
    ...production.resolvedPayloadAudits.flatMap((audit) => [audit.contextPackId, audit.schemaId, String(audit.sizeBytes)])
  ]);
}

function promptAuditBindsEvidence(
  promptArtifact: PromptArtifactAuditMetadata,
  binding: ProviderTransferEvidenceBinding
): boolean {
  return promptArtifact.contextPackRefs.some((ref) =>
    ref.provenanceRefs.includes(binding.evidenceId) &&
    ref.provenanceRefs.includes(binding.evidenceEventId) &&
    ref.provenanceRefs.includes(binding.contentHash) &&
    ref.sourceEventIds?.includes(binding.evidenceEventId) === true &&
    ref.sourceEventIds.includes(binding.linkEventId) &&
    ref.artifactHashes?.includes(binding.contentHash) === true
  );
}

function descriptorFor(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
  const descriptor = providerByteTransferDescriptors.find(
    (candidate) => candidate.toolId === toolId && candidate.toolVersion === toolVersion
  );
  if (descriptor === undefined) {
    throw new Error("Provider byte transfer requires a canonical provider byte-transfer descriptor.");
  }
  return descriptor;
}

function staleApprovalFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "approval-stale",
    message,
    retryable: false,
    allowedActions: ["rebuild the provider transfer preview", "request a new provider byte-transfer approval"]
  });
}

function permissionFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "permission-denied",
    message,
    retryable: false,
    allowedActions: ["use the human reviewer named by the provider approval"]
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

function readIdentifier(
  record: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  name: string
): string {
  const value = readStringProperty(record, key, name);
  if (!pattern.test(value)) {
    throw new Error(`${name} must be canonical.`);
  }
  return value;
}

function readEventIdProperty(record: Record<string, unknown>, key: string, label: string): string {
  return readIdentifier(record, key, /^evt_[a-zA-Z0-9_-]+$/, `${label} event ID`);
}

function readHashProperty(record: Record<string, unknown>, key: string, label: string): ContentHash {
  const value = readStringProperty(record, key, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} field ${key} must be an exact SHA-256 hash.`);
  }
  return value as ContentHash;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readDataProperty(record, key, label);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} field ${key} must be a non-negative integer.`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readNonNegativeInteger(record, key, label);
  if (value < 1) {
    throw new Error(`${label} field ${key} must be a positive integer.`);
  }
  return value;
}

function readActorRef(record: Record<string, unknown>, key: string, label: string): ActorRef {
  const value = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  const parsed = actorRefSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} field ${key} must be a valid actor reference.`);
  }
  return parsed.data;
}

function readFunctionProperty(record: Record<string, unknown>, key: string, label: string): Function {
  const value = readDataProperty(record, key, label);
  if (typeof value !== "function") {
    throw new Error(`${label} must be a function.`);
  }
  return value;
}

function readProviderCapability(
  record: Record<string, unknown>,
  key: string,
  label: string
): ProviderCapabilityDescriptor {
  try {
    return createProviderCapabilityDescriptor(
      clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`)
    );
  } catch {
    throw new Error(`${label} field ${key} must be a safe provider capability descriptor.`);
  }
}

function readProviderReadinessCard(
  record: Record<string, unknown>,
  key: string,
  label: string
): ProviderSetupCard {
  try {
    return providerSetupCardSchema.parse(
      clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`)
    );
  } catch {
    throw new Error(`${label} field ${key} must be a safe provider readiness card.`);
  }
}

function readProviderApproval(
  record: Record<string, unknown>,
  key: string,
  label: string
): ProviderApprovalBinding {
  const value = dataRecordFromObject(
    clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`),
    `${label} field ${key}`
  );
  rejectUnsupportedKeys(value, new Set([
    "eventId", "providerJobId", "sourceCollectionId", "importBatchId", "provider", "approvedBy",
    "approvedAt", "eligibleMediaTypes", "maxBytesPerFile", "policy"
  ]), `${label} provider approval`);
  const provider = dataRecordFromObject(
    readDataProperty(value, "provider", `${label} provider approval`),
    `${label} provider approval provider`
  );
  rejectUnsupportedKeys(provider, new Set(["name", "version"]), `${label} provider approval provider`);
  const policy = readStringProperty(value, "policy", `${label} provider approval`);
  if (policy !== "send-all-technically-eligible") {
    throw new Error(`${label} provider approval policy must be send-all-technically-eligible.`);
  }
  const approvedAt = readStringProperty(value, "approvedAt", `${label} provider approval`);
  if (Number.isNaN(Date.parse(approvedAt))) {
    throw new Error(`${label} provider approval approvedAt must be an ISO timestamp.`);
  }
  return Object.freeze({
    eventId: readEventIdProperty(value, "eventId", `${label} provider approval`),
    providerJobId: readIdentifier(value, "providerJobId", /^provider_[a-zA-Z0-9_-]+$/, "provider job ID"),
    sourceCollectionId: readIdentifier(value, "sourceCollectionId", /^src_[a-zA-Z0-9_-]+$/, "source collection ID"),
    importBatchId: readIdentifier(value, "importBatchId", /^imp_[a-zA-Z0-9_-]+$/, "import batch ID"),
    provider: Object.freeze({
      name: readStringProperty(provider, "name", `${label} provider approval provider`),
      version: readStringProperty(provider, "version", `${label} provider approval provider`)
    }),
    approvedBy: readStringProperty(value, "approvedBy", `${label} provider approval`),
    approvedAt,
    eligibleMediaTypes: readUniqueStringArray(value, "eligibleMediaTypes", `${label} provider approval`, true),
    maxBytesPerFile: readPositiveInteger(value, "maxBytesPerFile", `${label} provider approval`),
    policy
  });
}

function readEvidenceBindings(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly ProviderTransferEvidenceBinding[] {
  const values = readPlainObjectArray(record, key, label);
  if (values.length === 0) {
    throw new Error(`${label} evidence bindings must not be empty.`);
  }
  const bindings = values.map((value) => {
    rejectUnsupportedKeys(
      value,
      new Set(["evidenceId", "evidenceEventId", "linkEventId", "contentHash", "byteCount", "mediaType"]),
      `${label} evidence binding`
    );
    return Object.freeze({
      evidenceId: readIdentifier(value, "evidenceId", /^ev_[a-zA-Z0-9_-]+$/, "evidence ID"),
      evidenceEventId: readEventIdProperty(value, "evidenceEventId", `${label} evidence binding`),
      linkEventId: readEventIdProperty(value, "linkEventId", `${label} evidence binding`),
      contentHash: readHashProperty(value, "contentHash", `${label} evidence binding`),
      byteCount: readNonNegativeInteger(value, "byteCount", `${label} evidence binding`),
      mediaType: readStringProperty(value, "mediaType", `${label} evidence binding`)
    });
  });
  if (new Set(bindings.map((binding) => binding.evidenceId)).size !== bindings.length) {
    throw new Error(`${label} evidence bindings must not contain duplicate evidence IDs.`);
  }
  return Object.freeze(bindings);
}

function readPromptArtifactAudit(
  record: Record<string, unknown>,
  key: string,
  label: string
): PromptArtifactAuditMetadata {
  return parsePromptArtifactAudit(readDataProperty(record, key, label), `${label} field ${key}`);
}

function parsePromptArtifactAudit(value: unknown, label: string): PromptArtifactAuditMetadata {
  const record = dataRecordFromObject(clonePlainJson(value, label), label);
  rejectUnsupportedKeys(record, new Set([
    "inputArtifactHash", "promptTemplateId", "promptTemplateVersion", "runType", "safetyClass",
    "transferApprovalClass", "contextPackRefs", "omissions", "safeSummary", "production"
  ]), label);
  const inputArtifactHash = readHashProperty(record, "inputArtifactHash", label);
  const safetyClass = readStringProperty(record, "safetyClass", label);
  if (!new Set(["workspace-safe", "public-safe", "sensitive-local-only", "provider-approved"]).has(safetyClass)) {
    throw new Error(`${label} safetyClass is unsupported.`);
  }
  const transferApprovalClass = readStringProperty(record, "transferApprovalClass", label);
  if (transferApprovalClass !== "none" && transferApprovalClass !== "provider-byte-transfer") {
    throw new Error(`${label} transferApprovalClass is unsupported.`);
  }
  const runType = readStringProperty(record, "runType", label);
  if (!approvedAgentSpecialistRunTypes.includes(runType as PromptArtifactAuditMetadata["runType"])) {
    throw new Error(`${label} runType is unsupported.`);
  }
  const contextPackValues = clonePlainJson(readDataProperty(record, "contextPackRefs", label), `${label}.contextPackRefs`);
  if (!Array.isArray(contextPackValues) || contextPackValues.length === 0) {
    throw new Error(`${label} contextPackRefs must not be empty.`);
  }
  const contextPackRefs = contextPackValues.map((ref) => contextPackRefSchema.parse(ref));
  const omissionValues = readPlainObjectArray(record, "omissions", label).map((omission) => {
    rejectUnsupportedKeys(omission, new Set(["reason", "sourceRef", "safeSummary"]), `${label} omission`);
    return Object.freeze({
      reason: readStringProperty(omission, "reason", `${label} omission`),
      sourceRef: readStringProperty(omission, "sourceRef", `${label} omission`),
      safeSummary: readStringProperty(omission, "safeSummary", `${label} omission`)
    });
  });
  const production = Object.hasOwn(record, "production")
    ? parseProductionPromptAudit(readDataProperty(record, "production", label), `${label} production`, contextPackRefs)
    : undefined;
  if (runType !== "ontology-bootstrap" && production === undefined) {
    throw new Error(`${label} production run types require a production audit binding.`);
  }
  return Object.freeze({
    inputArtifactHash,
    promptTemplateId: readStringProperty(record, "promptTemplateId", label),
    promptTemplateVersion: readPositiveInteger(record, "promptTemplateVersion", label),
    runType: runType as PromptArtifactAuditMetadata["runType"],
    safetyClass: safetyClass as PromptArtifactAuditMetadata["safetyClass"],
    transferApprovalClass: transferApprovalClass as PromptArtifactAuditMetadata["transferApprovalClass"],
    contextPackRefs: Object.freeze(contextPackRefs) as readonly ContextPackRef[],
    omissions: Object.freeze(omissionValues),
    safeSummary: readStringProperty(record, "safeSummary", label),
    ...(production === undefined ? {} : { production })
  });
}

function parseProductionPromptAudit(
  value: unknown,
  label: string,
  contextPackRefs: readonly ContextPackRef[]
): PromptArtifactProductionBinding {
  const record = dataRecordFromObject(clonePlainJson(value, label), label);
  rejectUnsupportedKeys(record, new Set([
    "rendererId", "rendererVersion", "rendererHash", "renderedPromptHash", "providerOutputSchemaId",
    "providerOutputSchemaVersion", "handoffSchemaId", "handoffSchemaVersion", "scopeApplicabilityHash",
    "evaluatedContextRequirements", "resolvedPayloadAudits"
  ]), label);
  const requirements = readPlainObjectArray(record, "evaluatedContextRequirements", label).map((requirement) => {
    rejectUnsupportedKeys(requirement, new Set([
      "contextPackId", "requirementMode", "status", "contentHash", "omissionReason"
    ]), `${label} context requirement`);
    const requirementMode = readStringProperty(requirement, "requirementMode", `${label} context requirement`);
    if (requirementMode !== "always" && requirementMode !== "when-scope-associated-prr") {
      throw new Error(`${label} context requirement mode is unsupported.`);
    }
    const status = readStringProperty(requirement, "status", `${label} context requirement`);
    if (status !== "applicable" && status !== "not-applicable") {
      throw new Error(`${label} context requirement status is unsupported.`);
    }
    const contentHash = Object.hasOwn(requirement, "contentHash")
      ? readHashProperty(requirement, "contentHash", `${label} context requirement`)
      : undefined;
    const omissionReason = Object.hasOwn(requirement, "omissionReason")
      ? readStringProperty(requirement, "omissionReason", `${label} context requirement`)
      : undefined;
    if (status === "applicable" && (contentHash === undefined || omissionReason !== undefined)) {
      throw new Error(`${label} applicable context requirements require contentHash and no omission reason.`);
    }
    if (
      status === "not-applicable" && (
        requirementMode !== "when-scope-associated-prr" ||
        contentHash !== undefined ||
        omissionReason !== "no-associated-prr"
      )
    ) {
      throw new Error(`${label} not-applicable context requirements require conditional PRR mode and no-associated-prr.`);
    }
    return Object.freeze({
      contextPackId: readProductionAuditId(requirement, "contextPackId", `${label} context requirement`),
      requirementMode,
      status,
      ...(contentHash === undefined ? {} : { contentHash }),
      ...(omissionReason === undefined ? {} : { omissionReason: "no-associated-prr" as const })
    });
  });
  if (requirements.length === 0 || new Set(requirements.map((requirement) => requirement.contextPackId)).size !== requirements.length) {
    throw new Error(`${label} context requirements must be non-empty and unique.`);
  }
  const payloadAudits = readPlainObjectArray(record, "resolvedPayloadAudits", label).map((audit) => {
    rejectUnsupportedKeys(audit, new Set(["contextPackId", "contentHash", "sizeBytes", "schemaId"]), `${label} resolved payload audit`);
    return Object.freeze({
      contextPackId: readProductionAuditId(audit, "contextPackId", `${label} resolved payload audit`),
      contentHash: readHashProperty(audit, "contentHash", `${label} resolved payload audit`),
      sizeBytes: readNonNegativeInteger(audit, "sizeBytes", `${label} resolved payload audit`),
      schemaId: readProductionAuditId(audit, "schemaId", `${label} resolved payload audit`)
    });
  });
  if (payloadAudits.length === 0 || new Set(payloadAudits.map((audit) => audit.contextPackId)).size !== payloadAudits.length) {
    throw new Error(`${label} resolved payload audits must be non-empty and unique.`);
  }
  for (const requirement of requirements) {
    const audit = payloadAudits.find((candidate) => candidate.contextPackId === requirement.contextPackId);
    const contextPackRef = requirement.status === "applicable"
      ? contextPackRefs.find((ref) => ref.contextPackId === requirement.contextPackId)
      : undefined;
    if (requirement.status === "applicable" && (audit === undefined || audit.contentHash !== requirement.contentHash)) {
      throw new Error(`${label} applicable context requirements require a matching resolved payload audit.`);
    }
    if (requirement.status === "applicable" && (contextPackRef === undefined || contextPackRef.contentHash !== requirement.contentHash)) {
      throw new Error(`${label} applicable context requirements require a matching context pack ref.`);
    }
    if (requirement.status === "not-applicable" && audit !== undefined) {
      throw new Error(`${label} not-applicable context requirements must not include a resolved payload audit.`);
    }
  }
  if (contextPackRefs.some((ref) => !requirements.some((requirement) =>
    requirement.status === "applicable" &&
    requirement.contextPackId === ref.contextPackId &&
    requirement.contentHash === ref.contentHash
  ))) {
    throw new Error(`${label} context pack refs require matching applicable production context requirements.`);
  }
  if (payloadAudits.some((audit) => !requirements.some((requirement) =>
    requirement.contextPackId === audit.contextPackId && requirement.status === "applicable"
  ))) {
    throw new Error(`${label} resolved payload audits require applicable context requirements.`);
  }
  return Object.freeze({
    rendererId: readProductionAuditId(record, "rendererId", label),
    rendererVersion: readPositiveInteger(record, "rendererVersion", label),
    rendererHash: readHashProperty(record, "rendererHash", label),
    renderedPromptHash: readHashProperty(record, "renderedPromptHash", label),
    providerOutputSchemaId: readProductionAuditId(record, "providerOutputSchemaId", label),
    providerOutputSchemaVersion: readPositiveInteger(record, "providerOutputSchemaVersion", label),
    handoffSchemaId: readProductionAuditId(record, "handoffSchemaId", label),
    handoffSchemaVersion: readPositiveInteger(record, "handoffSchemaVersion", label),
    scopeApplicabilityHash: readHashProperty(record, "scopeApplicabilityHash", label),
    evaluatedContextRequirements: Object.freeze(requirements) as PromptArtifactProductionBinding["evaluatedContextRequirements"],
    resolvedPayloadAudits: Object.freeze(payloadAudits) as PromptArtifactProductionBinding["resolvedPayloadAudits"]
  });
}

function readProductionAuditId(record: Record<string, unknown>, key: string, label: string): string {
  const value = readStringProperty(record, key, label);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value)) {
    throw new Error(`${label} field ${key} must be a bounded safe ID.`);
  }
  return value;
}

function readExcerptPolicy(record: Record<string, unknown>, key: string, label: string): ExcerptPolicy {
  const value = readStringProperty(record, key, label);
  if (value !== "send-full-technically-eligible") {
    throw new Error(`${label} excerpt policy must be send-full-technically-eligible.`);
  }
  return value;
}

function readGovernanceTags(record: Record<string, unknown>, key: string, label: string): readonly GovernanceTag[] {
  const values = readUniqueStringArray(record, key, label, false);
  return Object.freeze(values.map((value) => {
    if (!governanceTags.includes(value as GovernanceTag)) {
      throw new Error(`${label} governance tag is unsupported.`);
    }
    return value as GovernanceTag;
  }));
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

function copyPlain<T>(value: T): T {
  return structuredClone(value);
}

function sha256(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
