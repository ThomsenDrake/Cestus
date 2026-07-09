import { createHash } from "node:crypto";
import type { ActorRef, KnowledgeEvent, KnowledgeEventOf } from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import type {
  AdapterCapabilities,
  ApprovedMessageAttachment
} from "../../../prr/src/correspondence-adapter.js";
import type { PrrCorrespondenceService } from "../../../prr/src/correspondence-service.js";
import { evaluateLegalEscalationGate } from "../../../prr/src/deadlines.js";
import { buildPrrProjection } from "../../../prr/src/projection.js";
import type { CorrespondenceProvider, PrrStatus } from "../../../prr/src/types.js";
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

export interface PrrCorrespondenceAttachmentBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly filename: string;
  readonly contentHash: ContentHash;
}

export interface PrrCorrespondenceLegalEvidenceBinding {
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly contentHash: ContentHash;
}

export interface PrrCorrespondenceApprovedMessage {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly subjectHash: ContentHash;
  readonly bodyHash: ContentHash;
  readonly renderedBodyHash: ContentHash;
  readonly attachments: readonly PrrCorrespondenceAttachmentBinding[];
  readonly requiresLegalConfirmation: boolean;
  readonly providerIdempotencyKey: string;
}

export interface PrrCorrespondenceCitedRule {
  readonly jurisdictionPack: { readonly name: string; readonly version: string };
  readonly label: string;
  readonly citation: string;
  readonly url?: string | undefined;
}

export interface PrrCorrespondenceRequestState {
  readonly requestCreatedEventId: string;
  readonly status: PrrStatus;
  readonly jurisdictionPack: { readonly name: string; readonly version: string };
  readonly activeDeadline?: {
    readonly eventId: string;
    readonly deadlineDate: string;
    readonly source: "estimated" | "confirmed";
    readonly citedRules: readonly PrrCorrespondenceCitedRule[];
  };
  readonly confirmedStalling: boolean;
  readonly legalEscalation?: {
    readonly eventId: string;
    readonly confirmedBy: string;
    readonly rationale: string;
    readonly citedRules: readonly PrrCorrespondenceCitedRule[];
    readonly evidenceIds: readonly string[];
  };
  readonly initialSentEventId?: string;
}

export interface PrrCorrespondenceProviderCapability {
  readonly provider: CorrespondenceProvider;
  readonly canSend: boolean;
  readonly canSync: boolean;
  readonly canFetchAttachments: boolean;
  readonly capabilityRef: ContentHash;
}

export interface PrrCorrespondenceLegalGateCheck {
  readonly id: string;
  readonly ready: boolean;
  readonly locked: boolean;
  readonly detail: string;
}

export interface BuildPrrCorrespondencePreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly provider: CorrespondenceProvider;
  readonly messageSourceEventId: string;
  readonly message: PrrCorrespondenceApprovedMessage;
  readonly requestState: PrrCorrespondenceRequestState;
  readonly providerCapability: PrrCorrespondenceProviderCapability;
  readonly legalGateChecks: readonly PrrCorrespondenceLegalGateCheck[];
  readonly legalEvidenceBindings: readonly PrrCorrespondenceLegalEvidenceBinding[];
  readonly lockSnapshot: readonly AgentApprovedToolActiveLock[];
  readonly projectionHighWaterMark: number;
}

export interface PrrCorrespondenceCurrentMessage {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly renderedBody: string;
  readonly attachments: readonly PrrCorrespondenceAttachmentBinding[];
  readonly requiresLegalConfirmation: boolean;
}

export interface PrrCorrespondenceAdapterContext {
  readonly ledger: EventLedger;
  readonly correspondenceService: Pick<PrrCorrespondenceService, "sendInitialRequest" | "sendFollowUp">;
  readonly domainActor: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly provider: CorrespondenceProvider;
  readonly messageSourceEventId: string;
  readonly approvedMessage: PrrCorrespondenceApprovedMessage;
  readonly approvedRequestState: PrrCorrespondenceRequestState;
  readonly approvedProviderCapabilities: AdapterCapabilities;
  readonly readCurrentMessage: () => PrrCorrespondenceCurrentMessage | Promise<PrrCorrespondenceCurrentMessage>;
  readonly readProviderCapabilities: () => AdapterCapabilities | Promise<AdapterCapabilities>;
}

export interface RebuildPrrCorrespondenceCurrentPreviewInput extends PrrCorrespondenceAdapterContext {
  readonly toolRequestId: string;
  readonly toolVersion: string;
  readonly runId: string;
}

interface ValidatedContext extends PrrCorrespondenceAdapterContext {
  readonly domainActor: ActorRef & { readonly kind: "human" };
  readonly approvedMessage: PrrCorrespondenceApprovedMessage;
  readonly approvedRequestState: PrrCorrespondenceRequestState;
  readonly approvedProviderCapabilities: AdapterCapabilities;
}

interface CurrentSnapshot {
  readonly message: PrrCorrespondenceCurrentMessage;
  readonly approvedShapeMessage: PrrCorrespondenceApprovedMessage;
  readonly requestState: PrrCorrespondenceRequestState;
  readonly providerCapabilities: AdapterCapabilities;
  readonly providerCapability: PrrCorrespondenceProviderCapability;
  readonly legalGateChecks: readonly PrrCorrespondenceLegalGateCheck[];
  readonly sourceEventIds: readonly string[];
  readonly legalEvidenceBindings: readonly PrrCorrespondenceLegalEvidenceBinding[];
  readonly projectionHighWaterMark: number;
}

export const prrInitialSendExecuteDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "prr.initial-send.execute",
  toolVersion: "0.1.0",
  family: "prr-correspondence",
  sideEffectClass: "external-message-send",
  requiredApprovalClass: "external-message-send",
  inputSchemaId: "prr-initial-send-execution-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "PrrCorrespondenceService.sendInitialRequest",
  idempotencyKeyFields: ["prrRequestId", "correspondenceId", "provider", "renderedBodyHash"],
  forbiddenEffects: [
    "direct-prr-send-event-append",
    "live-provider-substitution",
    "self-confirmed-legal-escalation",
    "raw-message-lifecycle-evidence",
    "unsafe-provider-diagnostics"
  ]
});

export const prrFollowUpExecuteDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "prr.follow-up.execute",
  toolVersion: "0.1.0",
  family: "prr-correspondence",
  sideEffectClass: "external-message-send",
  requiredApprovalClass: "external-message-send",
  inputSchemaId: "prr-follow-up-execution-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "PrrCorrespondenceService.sendFollowUp",
  idempotencyKeyFields: ["prrRequestId", "correspondenceId", "provider", "renderedBodyHash"],
  forbiddenEffects: [
    "direct-prr-send-event-append",
    "live-provider-substitution",
    "self-confirmed-legal-escalation",
    "raw-message-lifecycle-evidence",
    "unsafe-provider-diagnostics"
  ]
});

export const prrCorrespondenceDescriptors = Object.freeze([
  prrInitialSendExecuteDescriptor,
  prrFollowUpExecuteDescriptor
] as const satisfies readonly AgentDomainToolDescriptor[]);

const previewInputKeys = new Set([
  "toolRequestId", "toolId", "toolVersion", "runId", "taskId", "residentAgentId", "prrRequestId",
  "correspondenceId", "provider", "messageSourceEventId", "message", "requestState", "providerCapability",
  "legalGateChecks", "legalEvidenceBindings", "lockSnapshot", "projectionHighWaterMark"
]);

const contextInputKeys = new Set([
  "ledger", "correspondenceService", "domainActor", "residentAgentId", "taskId", "toolId",
  "prrRequestId", "correspondenceId", "provider", "messageSourceEventId", "approvedMessage",
  "approvedRequestState", "approvedProviderCapabilities", "readCurrentMessage", "readProviderCapabilities"
]);
const rebuildInputKeys = new Set([...contextInputKeys, "toolRequestId", "toolVersion", "runId"]);
const executionInputKeys = new Set([
  "toolRequestId", "runId", "taskId", "toolId", "toolVersion", "sideEffectClass", "approvalClass",
  "previewHash", "approvedPreviewHash", "approvedBy", "sourceEventIds", "inputArtifactHashes",
  "provenanceRefs"
]);

export function buildPrrCorrespondenceApprovalPreview(
  input: BuildPrrCorrespondencePreviewInput
): AgentDomainPreview {
  const value = validatePreviewInput(input);
  const descriptor = descriptorFor(value.toolId, value.toolVersion);
  const relatedEventIds = sourceEventIdsForPreview(value);
  const artifactHashes = Object.freeze([
    value.message.bodyHash,
    value.message.renderedBodyHash,
    ...value.message.attachments.map((attachment) => attachment.contentHash),
    ...value.legalEvidenceBindings.map((binding) => binding.contentHash)
  ]);
  const legalReady = value.legalGateChecks.every((check) => check.ready && !check.locked);
  const consequence = value.message.requiresLegalConfirmation
    ? "Approval may send this correspondence outside Cestus only after human approval and the separate PRR legal confirmation gate are both current."
    : "Approval may send this correspondence outside Cestus through the configured PRR provider after independent human approval.";
  assertAgentSecretSafeText(consequence, "PRR correspondence preview consequence");
  const normalizedInputHash = sha256(stableJson({
    prrRequestId: value.prrRequestId,
    correspondenceId: value.correspondenceId,
    provider: value.provider,
    messageSourceEventId: value.messageSourceEventId,
    message: value.message,
    requestState: value.requestState,
    providerCapability: value.providerCapability,
    legalGateChecks: value.legalGateChecks,
    legalEvidenceBindings: value.legalEvidenceBindings,
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
    summary: `Review PRR correspondence ${value.correspondenceId}.`,
    scope: `${value.message.to.length} primary recipient(s), ${value.message.attachments.length} attachment(s).`,
    estimatedEffect: "Send one approved message through the configured PRR correspondence service.",
    consequence,
    affectedRefs: [
      { kind: "prr-request", id: value.prrRequestId, eventId: value.requestState.requestCreatedEventId },
      { kind: "correspondence", id: value.correspondenceId, sourceEventId: value.messageSourceEventId },
      ...value.message.attachments.map((attachment) => ({
        kind: "attachment-evidence",
        id: attachment.evidenceId,
        eventId: attachment.evidenceEventId,
        hash: attachment.contentHash
      })),
      ...value.legalEvidenceBindings.map((binding) => ({
        kind: "legal-evidence",
        id: binding.evidenceId,
        eventId: binding.evidenceEventId,
        hash: binding.contentHash
      }))
    ],
    expectedOutputs: [{
      kind: "event",
      type: descriptor === prrInitialSendExecuteDescriptor ? "prr.request.sent" : "prr.followup.sent"
    }],
    contextPackRefs: [{
      kind: "jurisdiction-pack",
      name: value.requestState.jurisdictionPack.name,
      version: value.requestState.jurisdictionPack.version
    }],
    governancePolicyVersion: value.requestState.jurisdictionPack.version,
    lockSnapshot: value.lockSnapshot.map((lock) => ({ ...lock })),
    projectionHighWaterMarks: [{
      projectionName: "prr-lifecycle-legal",
      highWaterMark: value.projectionHighWaterMark
    }],
    idempotencyKey: value.message.providerIdempotencyKey,
    staleAfter: {
      kind: "prr-message-lifecycle-deadline-legal-provider-or-lock-change",
      refs: [
        value.prrRequestId,
        value.correspondenceId,
        value.messageSourceEventId,
        value.providerCapability.capabilityRef,
        value.message.subjectHash,
        ...artifactHashes,
        ...relatedEventIds
      ]
    },
    relatedEventIds,
    artifactHashes,
    prrRequestId: value.prrRequestId,
    correspondenceId: value.correspondenceId,
    provider: value.provider,
    recipients: {
      from: value.message.from,
      to: [...value.message.to],
      cc: [...value.message.cc]
    },
    subject: value.message.subject,
    subjectHash: value.message.subjectHash,
    bodyHash: value.message.bodyHash,
    renderedBodyHash: value.message.renderedBodyHash,
    attachmentBindings: value.message.attachments.map((attachment) => ({ ...attachment })),
    providerIdempotencyKey: value.message.providerIdempotencyKey,
    providerCapability: { ...value.providerCapability },
    jurisdictionPack: { ...value.requestState.jurisdictionPack },
    citedRules: citedRulesFor(value.requestState).map(copyCitedRule),
    requestStatus: value.requestState.status,
    activeDeadline: value.requestState.activeDeadline === undefined
      ? null
      : copyDeadline(value.requestState.activeDeadline),
    confirmedStalling: value.requestState.confirmedStalling,
    legalConfirmationRequired: value.message.requiresLegalConfirmation,
    legalGateReady: legalReady,
    legalGateChecks: value.legalGateChecks.map((check) => ({ ...check })),
    legalEvidenceBindings: value.legalEvidenceBindings.map((binding) => ({ ...binding })),
    legalEscalationEventId: value.requestState.legalEscalation?.eventId ?? null
  };
}

export async function rebuildPrrCorrespondenceCurrentPreview(
  input: RebuildPrrCorrespondenceCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "PRR correspondence current-preview input");
  rejectUnsupportedKeys(record, rebuildInputKeys, "PRR correspondence current-preview input");
  const context = validatedContextFromRecord(record);
  const toolRequestId = readString(record, "toolRequestId", "PRR correspondence current-preview input");
  const toolVersion = readString(record, "toolVersion", "PRR correspondence current-preview input");
  descriptorFor(context.toolId, toolVersion);
  const runId = readString(record, "runId", "PRR correspondence current-preview input");
  const snapshot = await readCurrentSnapshot(context);
  const activeLocks = await readActiveLocks(context);
  const preview = buildPreviewForSnapshot(context, snapshot, activeLocks, toolRequestId, toolVersion, runId);

  return {
    preview,
    sourceEventIds: snapshot.sourceEventIds,
    inputArtifactHashes: inputArtifactHashesFor(snapshot),
    provenanceRefs: provenanceRefsFor(context, snapshot),
    activeLocks,
    freshnessChecks: freshnessChecksFor(context, snapshot)
  };
}

export function createPrrInitialSendExecutionAdapter(
  input: PrrCorrespondenceAdapterContext
): AgentDomainExecutionAdapter {
  const context = validateAdapterContext(input, prrInitialSendExecuteDescriptor);
  return createAdapter(context, prrInitialSendExecuteDescriptor);
}

export function createPrrFollowUpExecutionAdapter(
  input: PrrCorrespondenceAdapterContext
): AgentDomainExecutionAdapter {
  const context = validateAdapterContext(input, prrFollowUpExecuteDescriptor);
  return createAdapter(context, prrFollowUpExecuteDescriptor);
}

function createAdapter(
  context: ValidatedContext,
  descriptor: AgentDomainToolDescriptor
): AgentDomainExecutionAdapter {
  return Object.freeze({
    descriptor,
    buildCurrentPreview(input: AgentApprovedToolPreviewInput) {
      return rebuildPrrCorrespondenceCurrentPreview({
        ...context,
        toolRequestId: input.toolRequestId,
        toolVersion: input.toolVersion,
        runId: input.runId
      });
    },
    executeApproved(input: AgentApprovedToolExecutionInput) {
      return executeApproved(context, input);
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
    throw lockFailure("An active resident-agent lock blocks PRR correspondence.");
  }

  const existing = await findExistingResult(context);
  if (existing !== undefined) {
    if (!resultEventMatches(existing, context)) {
      throw domainGateFailure("The PRR correspondence identity already has a different domain result.");
    }
    return mapResult(existing, context);
  }

  const snapshot = await readCurrentSnapshot(context);
  assertSnapshotFresh(context, snapshot);
  if (!snapshot.providerCapabilities.canSend) {
    throw domainGateFailure("The configured PRR correspondence provider is not ready to send.");
  }
  if (
    snapshot.approvedShapeMessage.requiresLegalConfirmation &&
    !snapshot.legalGateChecks.every((check) => check.ready && !check.locked)
  ) {
    throw lockFailure("The separate human PRR legal confirmation gate is not current.");
  }

  const currentPreview = buildPreviewForSnapshot(
    context,
    snapshot,
    [],
    execution.toolRequestId,
    execution.toolVersion,
    execution.runId
  );
  if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
    throw staleApprovalFailure("The PRR correspondence preview changed after approval.");
  }
  if (!sameOrderedStrings(execution.sourceEventIds, snapshot.sourceEventIds)) {
    throw staleApprovalFailure("The PRR correspondence source events changed after approval.");
  }
  if (!sameOrderedStrings(execution.inputArtifactHashes, inputArtifactHashesFor(snapshot))) {
    throw staleApprovalFailure("The PRR correspondence artifact hashes changed after approval.");
  }
  if (!sameOrderedStrings(execution.provenanceRefs, provenanceRefsFor(context, snapshot))) {
    throw provenanceFailure();
  }

  const beforeEvents = await context.ledger.readAll();
  let result: KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent">;
  const serviceInput = {
    prrRequestId: context.prrRequestId,
    correspondenceId: context.correspondenceId,
    provider: context.provider,
    from: snapshot.message.from,
    to: [...snapshot.message.to],
    cc: [...snapshot.message.cc],
    subject: snapshot.message.subject,
    body: snapshot.message.renderedBody,
    approvedBy: execution.approvedBy,
    attachments: snapshot.approvedShapeMessage.attachments.map(toServiceAttachment)
  };
  try {
    result = context.toolId === prrInitialSendExecuteDescriptor.toolId
      ? await context.correspondenceService.sendInitialRequest(serviceInput)
      : await context.correspondenceService.sendFollowUp(serviceInput);
  } catch {
    const concurrent = await findExistingResult(context);
    if (concurrent !== undefined && resultEventMatches(concurrent, context)) {
      return mapResult(concurrent, context);
    }
    throw agentDomainExecutionFailure({
      category: "external-effect-failed",
      message: "The authoritative PRR correspondence service did not complete the approved send.",
      retryable: false,
      allowedActions: ["inspect PRR provider readiness", "rebuild the correspondence preview before retrying"]
    });
  }

  if (!resultEventMatches(result, context)) {
    throw domainGateFailure("The PRR correspondence service returned an event outside the approved request.");
  }
  await assertLedgerAttestedResult(beforeEvents, result, context);
  return mapResult(result, context);
}

function validatePreviewInput(input: BuildPrrCorrespondencePreviewInput): BuildPrrCorrespondencePreviewInput {
  const record = dataRecordFromObject(input, "PRR correspondence preview input");
  rejectUnsupportedKeys(record, previewInputKeys, "PRR correspondence preview input");
  const toolId = readString(record, "toolId", "PRR correspondence preview input");
  const toolVersion = readString(record, "toolVersion", "PRR correspondence preview input");
  const descriptor = descriptorFor(toolId, toolVersion);
  const prrRequestId = readPattern(record, "prrRequestId", /^prr_[a-zA-Z0-9_-]+$/, "PRR request ID");
  const correspondenceId = readPattern(
    record,
    "correspondenceId",
    /^corr_[a-zA-Z0-9_-]+$/,
    "correspondence ID"
  );
  const provider = readProvider(record, "provider", "PRR correspondence preview input");
  const messageSourceEventId = readEventId(record, "messageSourceEventId", "PRR correspondence preview input");
  const message = readMessage(record, "message", "PRR correspondence preview input");
  const requestState = readRequestState(record, "requestState", "PRR correspondence preview input");
  const providerCapability = readProviderCapability(record, "providerCapability", "PRR correspondence preview input");
  const legalGateChecks = readLegalGateChecks(record, "legalGateChecks", "PRR correspondence preview input");
  const legalEvidenceBindings = readLegalEvidenceBindings(
    record,
    "legalEvidenceBindings",
    "PRR correspondence preview input"
  );
  const lockSnapshot = readLocks(record, "lockSnapshot", "PRR correspondence preview input");

  const expectedIdempotencyKey = descriptor === prrInitialSendExecuteDescriptor
    ? `send_${prrRequestId}_${correspondenceId}`
    : `followup_${prrRequestId}_${correspondenceId}`;
  if (message.providerIdempotencyKey !== expectedIdempotencyKey) {
    throw new Error("PRR correspondence provider idempotency key does not match the canonical send identity.");
  }
  if (providerCapability.provider !== provider) {
    throw new Error("PRR correspondence provider capability must match the selected provider.");
  }
  if (message.subjectHash !== sha256(message.subject)) {
    throw new Error("PRR correspondence subject hash does not match the approved subject.");
  }
  if (
    descriptor === prrInitialSendExecuteDescriptor &&
    messageSourceEventId !== requestState.requestCreatedEventId
  ) {
    throw new Error("Initial PRR correspondence must use the exact request-created source event.");
  }
  if (!sameOrderedStrings(
    legalEvidenceBindings.map((binding) => binding.evidenceId),
    requestState.legalEscalation?.evidenceIds ?? []
  )) {
    throw new Error("PRR legal evidence bindings must match the confirmed legal escalation evidence.");
  }

  return {
    toolRequestId: readString(record, "toolRequestId", "PRR correspondence preview input"),
    toolId,
    toolVersion,
    runId: readString(record, "runId", "PRR correspondence preview input"),
    taskId: readString(record, "taskId", "PRR correspondence preview input"),
    residentAgentId: readString(record, "residentAgentId", "PRR correspondence preview input"),
    prrRequestId,
    correspondenceId,
    provider,
    messageSourceEventId,
    message,
    requestState,
    providerCapability,
    legalGateChecks,
    legalEvidenceBindings,
    lockSnapshot,
    projectionHighWaterMark: readNonNegativeInteger(
      record,
      "projectionHighWaterMark",
      "PRR correspondence preview input"
    )
  };
}

function validateAdapterContext(
  input: PrrCorrespondenceAdapterContext,
  expectedDescriptor: AgentDomainToolDescriptor
): ValidatedContext {
  const record = dataRecordFromObject(input, "PRR correspondence adapter input");
  rejectUnsupportedKeys(record, contextInputKeys, "PRR correspondence adapter input");
  const context = validatedContextFromRecord(record);
  if (context.toolId !== expectedDescriptor.toolId) {
    throw new Error(`PRR correspondence adapter requires ${expectedDescriptor.toolId}.`);
  }
  return context;
}

function validatedContextFromRecord(record: Record<string, unknown>): ValidatedContext {
  const ledger = readData(record, "ledger", "PRR correspondence adapter input") as EventLedger;
  requireCallable(ledger, "readAll", "PRR correspondence ledger");
  requireCallable(ledger, "readStream", "PRR correspondence ledger");
  const correspondenceService = readData(
    record,
    "correspondenceService",
    "PRR correspondence adapter input"
  ) as Pick<PrrCorrespondenceService, "sendInitialRequest" | "sendFollowUp">;
  requireCallable(correspondenceService, "sendInitialRequest", "PRR correspondence service");
  requireCallable(correspondenceService, "sendFollowUp", "PRR correspondence service");
  const domainActor = readActor(record, "domainActor", "PRR correspondence adapter input");
  if (domainActor.kind !== "human") {
    throw new Error("PRR correspondence execution requires a human domain actor.");
  }
  const toolId = readString(record, "toolId", "PRR correspondence adapter input");
  descriptorFor(toolId, "0.1.0");
  const prrRequestId = readPattern(record, "prrRequestId", /^prr_[a-zA-Z0-9_-]+$/, "PRR request ID");
  const correspondenceId = readPattern(
    record,
    "correspondenceId",
    /^corr_[a-zA-Z0-9_-]+$/,
    "correspondence ID"
  );
  const provider = readProvider(record, "provider", "PRR correspondence adapter input");
  const messageSourceEventId = readEventId(
    record,
    "messageSourceEventId",
    "PRR correspondence adapter input"
  );
  const approvedMessage = readMessage(record, "approvedMessage", "PRR correspondence adapter input");
  const approvedRequestState = readRequestState(
    record,
    "approvedRequestState",
    "PRR correspondence adapter input"
  );
  const approvedProviderCapabilities = readAdapterCapabilities(
    record,
    "approvedProviderCapabilities",
    "PRR correspondence adapter input"
  );
  if (approvedProviderCapabilities.provider !== provider) {
    throw new Error("PRR correspondence approved provider capabilities must match the selected provider.");
  }
  const expectedIdempotencyKey = toolId === prrInitialSendExecuteDescriptor.toolId
    ? `send_${prrRequestId}_${correspondenceId}`
    : `followup_${prrRequestId}_${correspondenceId}`;
  if (approvedMessage.providerIdempotencyKey !== expectedIdempotencyKey) {
    throw new Error("PRR correspondence approved idempotency key is not canonical.");
  }
  const readCurrentMessage = readCallableDataProperty(
    record,
    "readCurrentMessage",
    "PRR correspondence current message reader"
  ) as ValidatedContext["readCurrentMessage"];
  const readProviderCapabilities = readCallableDataProperty(
    record,
    "readProviderCapabilities",
    "PRR correspondence provider capabilities reader"
  ) as ValidatedContext["readProviderCapabilities"];

  return {
    ledger,
    correspondenceService,
    domainActor: Object.freeze({ ...domainActor, kind: "human" as const }),
    residentAgentId: readString(record, "residentAgentId", "PRR correspondence adapter input"),
    taskId: readString(record, "taskId", "PRR correspondence adapter input"),
    toolId,
    prrRequestId,
    correspondenceId,
    provider,
    messageSourceEventId,
    approvedMessage,
    approvedRequestState,
    approvedProviderCapabilities,
    readCurrentMessage,
    readProviderCapabilities
  };
}

async function readCurrentSnapshot(context: ValidatedContext): Promise<CurrentSnapshot> {
  const rawMessage = await context.readCurrentMessage();
  const rawCapabilities = await context.readProviderCapabilities();
  const message = readCurrentMessageValue(rawMessage);
  const providerCapabilities = readAdapterCapabilitiesValue(rawCapabilities);
  const events = await context.ledger.readAll();
  const stream = events.filter((event) => event.streamId === context.prrRequestId);
  const created = events.find((event): event is KnowledgeEventOf<"prr.request.created"> =>
    event.id === context.approvedRequestState.requestCreatedEventId &&
    event.type === "prr.request.created" &&
    event.payload.prrRequestId === context.prrRequestId
  );
  if (created === undefined) {
    throw provenanceFailure("The approved PRR request-created event is missing.");
  }
  const projection = buildPrrProjection(events);
  const request = projection.requests.get(context.prrRequestId);
  if (request === undefined) {
    throw provenanceFailure("The approved PRR request is absent from the authoritative projection.");
  }
  if (
    request.requester.email === undefined ||
    request.agency.email === undefined ||
    message.from !== request.requester.email ||
    !message.to.includes(request.agency.email)
  ) {
    throw domainGateFailure("Current PRR correspondence recipients do not match the request parties.");
  }
  if (providerCapabilities.provider !== context.provider) {
    throw staleApprovalFailure("The PRR correspondence provider changed after approval.");
  }

  const sourceEvent = eventForId(events, context.messageSourceEventId);
  if (context.toolId === prrInitialSendExecuteDescriptor.toolId) {
    if (sourceEvent?.type !== "prr.request.created" || sourceEvent.id !== created.id) {
      throw provenanceFailure("Initial PRR correspondence is not bound to its request-created event.");
    }
    if (sha256(message.body) !== sha256(created.payload.requestText)) {
      throw staleApprovalFailure("The current PRR request body no longer matches the created request.");
    }
  } else {
    if (
      sourceEvent?.type !== "prr.followup.drafted" ||
      sourceEvent.payload.prrRequestId !== context.prrRequestId ||
      sourceEvent.payload.correspondenceId !== context.correspondenceId ||
      sourceEvent.payload.subject !== message.subject ||
      sourceEvent.payload.bodyHash !== sha256(message.renderedBody)
    ) {
      throw staleApprovalFailure("The current PRR follow-up no longer matches its evidence-bound draft.");
    }
  }

  const attachments = message.attachments.map((attachment) => {
    const referenced = events.find((event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.id === attachment.evidenceEventId &&
      event.type === "evidence.ingested" &&
      event.payload.evidenceId === attachment.evidenceId
    );
    if (referenced === undefined) {
      throw provenanceFailure("A PRR correspondence attachment is missing its evidence event.");
    }
    const latest = events.findLast((event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.type === "evidence.ingested" && event.payload.evidenceId === attachment.evidenceId
    );
    if (latest === undefined) {
      throw provenanceFailure("A PRR correspondence attachment is absent from evidence.");
    }
    return Object.freeze({
      ...attachment,
      evidenceEventId: latest.id,
      contentHash: latest.payload.contentHash as ContentHash
    });
  });
  const legalRequired = message.requiresLegalConfirmation || containsLegalPressure(
    `${message.subject}\n${message.body}\n${message.renderedBody}`
  );
  if (context.toolId === prrFollowUpExecuteDescriptor.toolId && attachments.length > 0) {
    throw domainGateFailure(
      "PRR follow-up attachments are blocked because the current domain event cannot attest them."
    );
  }
  const currentMessage = Object.freeze({
    ...message,
    attachments: Object.freeze(attachments),
    requiresLegalConfirmation: legalRequired
  });
  const initialSent = stream.find((event): event is KnowledgeEventOf<"prr.request.sent"> =>
    event.type === "prr.request.sent"
  );
  const deadlineEvent = deadlineEventForRequest(stream, request.activeDeadline?.source, request.activeDeadline?.deadlineDate);
  const legalEvent = stream.findLast((event): event is KnowledgeEventOf<"prr.legal-escalation.confirmed"> =>
    event.type === "prr.legal-escalation.confirmed"
  );
  const requestState: PrrCorrespondenceRequestState = Object.freeze({
    requestCreatedEventId: created.id,
    status: request.status,
    jurisdictionPack: Object.freeze({ ...request.jurisdictionPack }),
    ...(request.activeDeadline === undefined || deadlineEvent === undefined
      ? {}
      : {
          activeDeadline: Object.freeze({
            eventId: deadlineEvent.id,
            deadlineDate: request.activeDeadline.deadlineDate,
            source: request.activeDeadline.source,
            citedRules: Object.freeze(request.activeDeadline.citedRules.map(copyCitedRule))
          })
        }),
    confirmedStalling: request.confirmedStalling,
    ...(request.legalEscalation === undefined || legalEvent === undefined
      ? {}
      : {
          legalEscalation: Object.freeze({
            eventId: legalEvent.id,
            confirmedBy: request.legalEscalation.confirmedBy,
            rationale: request.legalEscalation.rationale,
            citedRules: Object.freeze(request.legalEscalation.citedRules.map(copyCitedRule)),
            evidenceIds: Object.freeze([...request.legalEscalation.evidenceIds])
          })
        }),
    ...(initialSent === undefined ? {} : { initialSentEventId: initialSent.id })
  });
  const capabilityRef = sha256(stableJson(providerCapabilities));
  const providerCapability: PrrCorrespondenceProviderCapability = Object.freeze({
    provider: providerCapabilities.provider,
    canSend: providerCapabilities.canSend,
    canSync: providerCapabilities.canSync,
    canFetchAttachments: providerCapabilities.canFetchAttachments,
    capabilityRef
  });
  const legalEvidenceBindings = legalEvidenceBindingsFor(
    events,
    requestState.legalEscalation?.evidenceIds ?? []
  );
  const legalGateChecks = legalGateChecksFor(requestState, legalEvent, events, legalRequired);
  const approvedShapeMessage: PrrCorrespondenceApprovedMessage = Object.freeze({
    from: currentMessage.from,
    to: Object.freeze([...currentMessage.to]),
    cc: Object.freeze([...currentMessage.cc]),
    subject: currentMessage.subject,
    subjectHash: sha256(currentMessage.subject),
    bodyHash: sha256(currentMessage.body),
    renderedBodyHash: sha256(currentMessage.renderedBody),
    attachments: Object.freeze(currentMessage.attachments.map((attachment) => Object.freeze({ ...attachment }))),
    requiresLegalConfirmation: currentMessage.requiresLegalConfirmation,
    providerIdempotencyKey: canonicalIdempotencyKey(context)
  });
  const sourceEventIds = Object.freeze([...new Set([
    requestState.requestCreatedEventId,
    context.messageSourceEventId,
    ...(requestState.initialSentEventId === undefined ? [] : [requestState.initialSentEventId]),
    ...(requestState.activeDeadline === undefined ? [] : [requestState.activeDeadline.eventId]),
    ...(requestState.legalEscalation === undefined ? [] : [requestState.legalEscalation.eventId]),
    ...approvedShapeMessage.attachments.map((attachment) => attachment.evidenceEventId),
    ...legalEvidenceBindings.map((binding) => binding.evidenceEventId)
  ])].sort());

  return {
    message: currentMessage,
    approvedShapeMessage,
    requestState,
    providerCapabilities,
    providerCapability,
    legalGateChecks,
    sourceEventIds,
    legalEvidenceBindings,
    projectionHighWaterMark: events.filter((event) =>
      event.type.startsWith("prr.") || event.type === "evidence.ingested"
    ).length
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
  return buildPrrCorrespondenceApprovalPreview({
    toolRequestId,
    toolId: context.toolId,
    toolVersion,
    runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    prrRequestId: context.prrRequestId,
    correspondenceId: context.correspondenceId,
    provider: context.provider,
    messageSourceEventId: context.messageSourceEventId,
    message: snapshot.approvedShapeMessage,
    requestState: snapshot.requestState,
    providerCapability: snapshot.providerCapability,
    legalGateChecks: snapshot.legalGateChecks,
    legalEvidenceBindings: snapshot.legalEvidenceBindings,
    lockSnapshot: activeLocks,
    projectionHighWaterMark: snapshot.projectionHighWaterMark
  });
}

function inputArtifactHashesFor(snapshot: CurrentSnapshot): readonly string[] {
  return Object.freeze([...new Set([
    snapshot.approvedShapeMessage.bodyHash,
    snapshot.approvedShapeMessage.renderedBodyHash,
    ...snapshot.approvedShapeMessage.attachments.map((attachment) => attachment.contentHash),
    ...snapshot.legalEvidenceBindings.map((binding) => binding.contentHash)
  ])]);
}

function provenanceRefsFor(
  context: ValidatedContext,
  snapshot: CurrentSnapshot
): readonly string[] {
  return Object.freeze([
    `prr-request:${context.prrRequestId}:${snapshot.requestState.requestCreatedEventId}`,
    `correspondence:${context.correspondenceId}:${context.messageSourceEventId}`,
    `provider:${context.provider}:${snapshot.providerCapability.capabilityRef}`,
    `jurisdiction:${snapshot.requestState.jurisdictionPack.name}@${snapshot.requestState.jurisdictionPack.version}`,
    `idempotency:${snapshot.approvedShapeMessage.providerIdempotencyKey}`,
    ...snapshot.approvedShapeMessage.attachments.map((attachment) =>
      `evidence:${attachment.evidenceId}:${attachment.evidenceEventId}:${attachment.contentHash}`
    ),
    ...snapshot.legalEvidenceBindings.map((binding) =>
      `legal-evidence:${binding.evidenceId}:${binding.evidenceEventId}:${binding.contentHash}`
    )
  ]);
}

function freshnessChecksFor(
  context: ValidatedContext,
  snapshot: CurrentSnapshot
) {
  return Object.freeze([
    freshnessCheck("message", context.approvedMessage, snapshot.approvedShapeMessage),
    freshnessCheck("request-state", context.approvedRequestState, snapshot.requestState),
    freshnessCheck("provider", context.approvedProviderCapabilities, snapshot.providerCapabilities)
  ]);
}

function freshnessCheck(name: string, expectedValue: unknown, actualValue: unknown) {
  const expected = sha256(stableJson(expectedValue));
  const actual = sha256(stableJson(actualValue));
  return Object.freeze({ name, expected, actual, ok: expected === actual });
}

function assertSnapshotFresh(context: ValidatedContext, snapshot: CurrentSnapshot): void {
  if (freshnessChecksFor(context, snapshot).some((check) => !check.ok)) {
    throw staleApprovalFailure("PRR correspondence source state changed after approval.");
  }
  const streamEligible = context.toolId === prrInitialSendExecuteDescriptor.toolId
    ? snapshot.requestState.status === "draft" && snapshot.requestState.initialSentEventId === undefined
    : snapshot.requestState.status !== "closed" && snapshot.requestState.initialSentEventId !== undefined;
  if (!streamEligible) {
    throw domainGateFailure("The authoritative PRR lifecycle does not permit this correspondence send.");
  }
}

function validateExecutionInput(
  context: ValidatedContext,
  input: AgentApprovedToolExecutionInput
): AgentApprovedToolExecutionInput {
  let record: Record<string, unknown>;
  try {
    record = dataRecordFromObject(input, "PRR correspondence approved execution input");
    rejectUnsupportedKeys(record, executionInputKeys, "PRR correspondence approved execution input");
  } catch {
    throw permissionFailure("PRR correspondence execution input must be a plain approved-execution DTO.");
  }
  try {
    const toolId = readString(record, "toolId", "PRR correspondence approved execution input");
    const toolVersion = readString(record, "toolVersion", "PRR correspondence approved execution input");
    descriptorFor(toolId, toolVersion);
    const toolRequestId = readString(record, "toolRequestId", "PRR correspondence approved execution input");
    const runId = readString(record, "runId", "PRR correspondence approved execution input");
    const taskId = Object.hasOwn(record, "taskId") && record.taskId !== undefined
      ? readString(record, "taskId", "PRR correspondence approved execution input")
      : undefined;
    const sideEffectClass = readString(
      record,
      "sideEffectClass",
      "PRR correspondence approved execution input"
    );
    const approvalClass = readString(record, "approvalClass", "PRR correspondence approved execution input");
    const previewHash = readHash(record, "previewHash", "PRR correspondence approved execution input");
    const approvedPreviewHash = readHash(
      record,
      "approvedPreviewHash",
      "PRR correspondence approved execution input"
    );
    const approvedBy = readString(record, "approvedBy", "PRR correspondence approved execution input");
    const sourceEventIds = readUniquePatternArray(
      record,
      "sourceEventIds",
      /^evt_[a-zA-Z0-9_-]+$/,
      "PRR correspondence source event IDs",
      true
    );
    const inputArtifactHashes = readUniquePatternArray(
      record,
      "inputArtifactHashes",
      /^sha256:[a-f0-9]{64}$/,
      "PRR correspondence input artifact hashes",
      true
    );
    const provenanceRefs = readUniquePatternArray(
      record,
      "provenanceRefs",
      /^.+$/,
      "PRR correspondence provenance references",
      true
    );
    if (
      toolId !== context.toolId ||
      (taskId !== undefined && taskId !== context.taskId) ||
      sideEffectClass !== "external-message-send" ||
      approvalClass !== "external-message-send" ||
      approvedBy !== context.domainActor.id ||
      previewHash !== approvedPreviewHash
    ) {
      throw new Error("Approved PRR correspondence execution metadata does not match the adapter context.");
    }
    return {
      toolRequestId,
      runId,
      ...(taskId === undefined ? {} : { taskId }),
      toolId,
      toolVersion,
      sideEffectClass,
      approvalClass,
      previewHash,
      approvedPreviewHash,
      approvedBy,
      sourceEventIds,
      inputArtifactHashes,
      provenanceRefs
    };
  } catch {
    throw permissionFailure("PRR correspondence execution metadata does not match the approved request.");
  }
}

async function readActiveLocks(context: ValidatedContext): Promise<readonly AgentApprovedToolActiveLock[]> {
  const projection = buildAgentProjection(await context.ledger.readAll());
  return Object.freeze([...projection.locks.values()]
    .filter((lock) => lock.residentAgentId === context.residentAgentId && lock.state === "active")
    .map((lock) => Object.freeze({
      lockId: lock.lockId,
      category: lock.kind,
      message: lock.reason
    }))
    .sort((left, right) => left.lockId.localeCompare(right.lockId)));
}

function legalGateChecksFor(
  requestState: PrrCorrespondenceRequestState,
  legalEvent: KnowledgeEventOf<"prr.legal-escalation.confirmed"> | undefined,
  events: readonly KnowledgeEvent[],
  required: boolean
): readonly PrrCorrespondenceLegalGateCheck[] {
  if (!required) {
    return Object.freeze([Object.freeze({
      id: "legal-confirmation-not-required",
      ready: true,
      locked: false,
      detail: "Routine correspondence does not require legal escalation confirmation."
    })]);
  }
  const confirmedDeadlineEvent = requestState.activeDeadline?.source === "confirmed"
    ? eventForId(events, requestState.activeDeadline.eventId)
    : undefined;
  const stallingEvent = events.findLast((event) =>
    event.type === "prr.stalling.confirmed" && event.payload.prrRequestId === requestStateFromEventId(events, requestState)
  );
  const humanBasisReady = (
    confirmedDeadlineEvent?.type === "prr.deadline.confirmed" &&
    confirmedDeadlineEvent.context.actor.kind === "human" &&
    confirmedDeadlineEvent.payload.confirmedBy === confirmedDeadlineEvent.context.actor.id
  ) || (
    requestState.confirmedStalling &&
    stallingEvent?.type === "prr.stalling.confirmed" &&
    stallingEvent.context.actor.kind === "human" &&
    stallingEvent.payload.confirmedBy === stallingEvent.context.actor.id
  );
  const humanConfirmationReady = legalEvent !== undefined &&
    legalEvent.context.actor.kind === "human" &&
    legalEvent.payload.confirmedBy === legalEvent.context.actor.id &&
    requestState.legalEscalation?.confirmedBy === legalEvent.payload.confirmedBy;
  const jurisdictionCitationsReady = (requestState.legalEscalation?.citedRules.length ?? 0) > 0 &&
    requestState.legalEscalation?.citedRules.every((rule) =>
      rule.jurisdictionPack.name === requestState.jurisdictionPack.name &&
      rule.jurisdictionPack.version === requestState.jurisdictionPack.version
    ) === true;
  const evidenceEventsReady = (requestState.legalEscalation?.evidenceIds.length ?? 0) > 0 &&
    requestState.legalEscalation?.evidenceIds.every((evidenceId) =>
      events.some((event) => event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId)
    ) === true;
  const prrRequestId = requestStateFromEventId(events, requestState);
  if (prrRequestId === undefined) {
    throw provenanceFailure("The PRR legal gate is missing its request-created event.");
  }
  const domainGate = evaluateLegalEscalationGate({
    prrRequestId,
    hasConfirmedDeadlineBasis: requestState.activeDeadline?.source === "confirmed",
    hasUserConfirmedStalling: requestState.confirmedStalling,
    citedRules: (requestState.legalEscalation?.citedRules ?? []).map((rule) => ({
      jurisdictionPack: { ...rule.jurisdictionPack },
      label: rule.label,
      citation: rule.citation,
      ...(rule.url === undefined ? {} : { url: rule.url })
    })),
    evidenceIds: [...(requestState.legalEscalation?.evidenceIds ?? [])],
    userConfirmedEscalation: humanConfirmationReady
  });
  const basisReady = humanBasisReady && !domainGate.missing.includes("confirmedDeadlineOrStallingBasis");
  const citationsReady = jurisdictionCitationsReady && !domainGate.missing.includes("citedRules");
  const evidenceReady = evidenceEventsReady && !domainGate.missing.includes("evidenceIds");
  const confirmationReady = humanConfirmationReady && !domainGate.missing.includes("userConfirmedEscalation");

  return Object.freeze([
    gateCheck("human-legal-confirmation", confirmationReady, "Human legal confirmation event is current."),
    gateCheck("confirmed-deadline-or-stalling", basisReady, "A human-confirmed deadline or stalling basis is current."),
    gateCheck("jurisdiction-citations", citationsReady, "Legal citations match the active jurisdiction pack."),
    gateCheck("legal-evidence", evidenceReady, "Legal confirmation remains bound to ledger evidence.")
  ]);
}

function requestStateFromEventId(
  events: readonly KnowledgeEvent[],
  requestState: PrrCorrespondenceRequestState
): string | undefined {
  const created = eventForId(events, requestState.requestCreatedEventId);
  return created?.type === "prr.request.created" ? created.payload.prrRequestId : undefined;
}

function gateCheck(id: string, ready: boolean, detail: string): PrrCorrespondenceLegalGateCheck {
  return Object.freeze({ id, ready, locked: !ready, detail });
}

function legalEvidenceBindingsFor(
  events: readonly KnowledgeEvent[],
  evidenceIds: readonly string[]
): readonly PrrCorrespondenceLegalEvidenceBinding[] {
  return Object.freeze(evidenceIds.map((evidenceId) => {
    const event = events.findLast((candidate): candidate is KnowledgeEventOf<"evidence.ingested"> =>
      candidate.type === "evidence.ingested" && candidate.payload.evidenceId === evidenceId
    );
    if (event === undefined) {
      throw provenanceFailure("PRR legal confirmation references missing evidence.");
    }
    return Object.freeze({
      evidenceId,
      evidenceEventId: event.id,
      contentHash: event.payload.contentHash as ContentHash
    });
  }));
}

function deadlineEventForRequest(
  events: readonly KnowledgeEvent[],
  source: "estimated" | "confirmed" | undefined,
  deadlineDate: string | undefined
): KnowledgeEventOf<"prr.deadline.estimated"> | KnowledgeEventOf<"prr.deadline.confirmed"> | undefined {
  if (source === undefined || deadlineDate === undefined) {
    return undefined;
  }
  return events.findLast((event): event is KnowledgeEventOf<"prr.deadline.estimated"> | KnowledgeEventOf<"prr.deadline.confirmed"> => {
    if (source === "estimated" && event.type === "prr.deadline.estimated") {
      return event.payload.deadlineDate === deadlineDate;
    }
    if (source === "confirmed" && event.type === "prr.deadline.confirmed") {
      return event.payload.deadlineDate === deadlineDate;
    }
    return false;
  });
}

function eventForId(events: readonly KnowledgeEvent[], eventId: string): KnowledgeEvent | undefined {
  return events.find((event) => event.id === eventId);
}

function containsLegalPressure(value: string): boolean {
  return /\b(?:legal action|legal escalation|litigation|lawsuit|court action|judicial review|appeal this|file (?:an? )?(?:appeal|complaint|lawsuit)|retain counsel|refer (?:this )?to (?:the )?attorney general|pursue (?:all )?(?:legal )?remedies|seek (?:a )?(?:writ|injunction|court order)|sue|subpoena|compel|sanctions?|violation of (?:the )?law)\b/i.test(value);
}

async function findExistingResult(
  context: ValidatedContext
): Promise<KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent"> | undefined> {
  const events = await context.ledger.readAll();
  return events.find((event): event is KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent"> =>
    (event.type === "prr.request.sent" || event.type === "prr.followup.sent") &&
    event.payload.prrRequestId === context.prrRequestId &&
    event.payload.correspondenceId === context.correspondenceId
  );
}

function resultEventMatches(
  event: KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent">,
  context: ValidatedContext
): boolean {
  const expectedType = context.toolId === prrInitialSendExecuteDescriptor.toolId
    ? "prr.request.sent"
    : "prr.followup.sent";
  if (
    event.type !== expectedType ||
    event.payload.prrRequestId !== context.prrRequestId ||
    event.payload.correspondenceId !== context.correspondenceId ||
    event.payload.provider !== context.provider ||
    event.payload.subject !== context.approvedMessage.subject ||
    event.payload.bodyHash !== context.approvedMessage.renderedBodyHash ||
    event.payload.approvedBy !== context.domainActor.id ||
    event.context.actor.kind !== "human" ||
    event.context.actor.id !== context.domainActor.id
  ) {
    return false;
  }
  try {
    assertAgentSecretSafeText(event.payload.providerMessageId, "PRR correspondence provider message reference");
    if (event.type === "prr.request.sent" && event.payload.providerThreadId !== undefined) {
      assertAgentSecretSafeText(event.payload.providerThreadId, "PRR correspondence provider thread reference");
    }
  } catch {
    return false;
  }
  return event.type === "prr.followup.sent" || (
    event.payload.idempotencyKey === context.approvedMessage.providerIdempotencyKey &&
    sameOrderedStrings(
      event.payload.attachmentEvidenceIds,
      context.approvedMessage.attachments.map((attachment) => attachment.evidenceId)
    )
  );
}

async function assertLedgerAttestedResult(
  beforeEvents: readonly KnowledgeEvent[],
  event: KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent">,
  context: ValidatedContext
): Promise<void> {
  const afterEvents = await context.ledger.readAll();
  const beforeIds = new Set(beforeEvents.map((candidate) => candidate.id));
  const appended = afterEvents.filter((candidate) => !beforeIds.has(candidate.id));
  const attested = afterEvents.find((candidate) => candidate.id === event.id);
  if (
    attested === undefined ||
    appended.length !== 1 ||
    appended[0]?.id !== event.id ||
    !resultEventMatches(event, context)
  ) {
    throw domainGateFailure("PRR correspondence results must be exactly attested by one append-only domain event.");
  }
}

function mapResult(
  event: KnowledgeEventOf<"prr.request.sent"> | KnowledgeEventOf<"prr.followup.sent">,
  context: ValidatedContext
): AgentDomainExecutionResult {
  const relatedIds = [context.prrRequestId, context.correspondenceId, event.payload.providerMessageId];
  if (event.type === "prr.request.sent" && event.payload.providerThreadId !== undefined) {
    relatedIds.push(event.payload.providerThreadId);
  }
  relatedIds.forEach((id) => assertAgentSecretSafeText(id, "PRR correspondence result reference"));
  return {
    eventIds: [event.id],
    artifactHashes: [],
    readModelChanges: [{
      projectionName: event.type === "prr.request.sent" ? "prr" : "prr-timeline",
      change: event.type === "prr.request.sent"
        ? "recorded approved initial request correspondence"
        : "appended approved follow-up correspondence to the PRR timeline",
      relatedIds
    }],
    resultSummary: "PRR correspondence was recorded by the authoritative domain service."
  };
}

function toServiceAttachment(attachment: PrrCorrespondenceAttachmentBinding): ApprovedMessageAttachment {
  return {
    evidenceId: attachment.evidenceId,
    filename: attachment.filename,
    contentHash: attachment.contentHash
  };
}

function canonicalIdempotencyKey(context: ValidatedContext): string {
  return context.toolId === prrInitialSendExecuteDescriptor.toolId
    ? `send_${context.prrRequestId}_${context.correspondenceId}`
    : `followup_${context.prrRequestId}_${context.correspondenceId}`;
}

function staleApprovalFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "approval-stale",
    message,
    retryable: false,
    allowedActions: ["rebuild the PRR correspondence preview", "request a new human send approval"]
  });
}

function provenanceFailure(message = "PRR correspondence provenance does not match the approved evidence.") {
  return agentDomainExecutionFailure({
    category: "provenance-missing",
    message,
    retryable: false,
    allowedActions: ["inspect the PRR evidence bindings", "rebuild the correspondence preview"]
  });
}

function permissionFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "permission-denied",
    message,
    retryable: false,
    allowedActions: ["submit the exact approved PRR correspondence execution DTO"]
  });
}

function lockFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "lock-active",
    message,
    retryable: false,
    allowedActions: ["inspect the active PRR or resident-agent gate", "request human review before retrying"]
  });
}

function domainGateFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "domain-gate-failed",
    message,
    retryable: false,
    allowedActions: ["inspect the authoritative PRR lifecycle", "rebuild the correspondence preview"]
  });
}

function descriptorFor(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
  const descriptor = prrCorrespondenceDescriptors.find(
    (candidate) => candidate.toolId === toolId && candidate.toolVersion === toolVersion
  );
  if (descriptor === undefined) {
    throw new Error("PRR correspondence requires a canonical PRR correspondence descriptor.");
  }
  return descriptor;
}

function sourceEventIdsForPreview(input: BuildPrrCorrespondencePreviewInput): readonly string[] {
  return Object.freeze([...new Set([
    input.requestState.requestCreatedEventId,
    input.messageSourceEventId,
    ...(input.requestState.initialSentEventId === undefined ? [] : [input.requestState.initialSentEventId]),
    ...(input.requestState.activeDeadline === undefined ? [] : [input.requestState.activeDeadline.eventId]),
    ...(input.requestState.legalEscalation === undefined ? [] : [input.requestState.legalEscalation.eventId]),
    ...input.message.attachments.map((attachment) => attachment.evidenceEventId),
    ...input.legalEvidenceBindings.map((binding) => binding.evidenceEventId)
  ])].sort());
}

function citedRulesFor(input: PrrCorrespondenceRequestState): readonly PrrCorrespondenceCitedRule[] {
  return input.legalEscalation?.citedRules ?? input.activeDeadline?.citedRules ?? [];
}

function copyCitedRule(rule: PrrCorrespondenceCitedRule): PrrCorrespondenceCitedRule {
  return {
    ...rule,
    jurisdictionPack: { ...rule.jurisdictionPack }
  };
}

function copyDeadline(deadline: NonNullable<PrrCorrespondenceRequestState["activeDeadline"]>) {
  return {
    ...deadline,
    citedRules: deadline.citedRules.map(copyCitedRule)
  };
}

function readCurrentMessageValue(value: unknown): PrrCorrespondenceCurrentMessage {
  const record = dataRecordFromObject(
    clonePlainJson(value, "PRR correspondence current message"),
    "PRR correspondence current message"
  );
  rejectUnsupportedKeys(record, new Set([
    "from", "to", "cc", "subject", "body", "renderedBody", "attachments", "requiresLegalConfirmation"
  ]), "PRR correspondence current message");
  const attachments = readObjectArray(record, "attachments", "PRR correspondence current message").map(
    (attachment) => {
      rejectUnsupportedKeys(
        attachment,
        new Set(["evidenceId", "evidenceEventId", "filename", "contentHash"]),
        "PRR correspondence current attachment"
      );
      return Object.freeze({
        evidenceId: readPattern(
          attachment,
          "evidenceId",
          /^ev_[a-zA-Z0-9_-]+$/,
          "PRR correspondence attachment evidence ID"
        ),
        evidenceEventId: readEventId(
          attachment,
          "evidenceEventId",
          "PRR correspondence current attachment"
        ),
        filename: readString(attachment, "filename", "PRR correspondence current attachment"),
        contentHash: readHash(attachment, "contentHash", "PRR correspondence current attachment")
      });
    }
  );
  if (new Set(attachments.map((attachment) => attachment.evidenceId)).size !== attachments.length) {
    throw new Error("PRR correspondence current attachments must contain unique evidence IDs.");
  }
  return Object.freeze({
    from: readEmail(record, "from", "PRR correspondence current message"),
    to: readUniqueEmails(record, "to", "PRR correspondence current message", true),
    cc: readUniqueEmails(record, "cc", "PRR correspondence current message", false),
    subject: readString(record, "subject", "PRR correspondence current message"),
    body: readRawString(record, "body", "PRR correspondence current message"),
    renderedBody: readRawString(record, "renderedBody", "PRR correspondence current message"),
    attachments: Object.freeze(attachments),
    requiresLegalConfirmation: readBoolean(
      record,
      "requiresLegalConfirmation",
      "PRR correspondence current message"
    )
  });
}

function readAdapterCapabilities(
  record: Record<string, unknown>,
  key: string,
  label: string
): AdapterCapabilities {
  return readAdapterCapabilitiesValue(readData(record, key, label));
}

function readAdapterCapabilitiesValue(value: unknown): AdapterCapabilities {
  const record = dataRecordFromObject(
    clonePlainJson(value, "PRR correspondence provider capabilities"),
    "PRR correspondence provider capabilities"
  );
  rejectUnsupportedKeys(
    record,
    new Set(["provider", "canSend", "canSync", "canFetchAttachments", "credentialMode"]),
    "PRR correspondence provider capabilities"
  );
  const credentialMode = readRawString(record, "credentialMode", "PRR correspondence provider capabilities");
  if (
    credentialMode !== "cestus-oauth" &&
    credentialMode !== "external-secret" &&
    credentialMode !== "external-config"
  ) {
    throw new Error("PRR correspondence provider credential mode is unsupported.");
  }
  return Object.freeze({
    provider: readProvider(record, "provider", "PRR correspondence provider capabilities"),
    canSend: readBoolean(record, "canSend", "PRR correspondence provider capabilities"),
    canSync: readBoolean(record, "canSync", "PRR correspondence provider capabilities"),
    canFetchAttachments: readBoolean(
      record,
      "canFetchAttachments",
      "PRR correspondence provider capabilities"
    ),
    credentialMode
  });
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

function readMessage(
  record: Record<string, unknown>,
  key: string,
  label: string
): PrrCorrespondenceApprovedMessage {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set([
    "from", "to", "cc", "subject", "subjectHash", "bodyHash", "renderedBodyHash", "attachments",
    "requiresLegalConfirmation", "providerIdempotencyKey"
  ]), `${label} message`);
  const attachments = readObjectArray(value, "attachments", `${label} message`).map((attachment) => {
    rejectUnsupportedKeys(
      attachment,
      new Set(["evidenceId", "evidenceEventId", "filename", "contentHash"]),
      `${label} attachment`
    );
    return Object.freeze({
      evidenceId: readPattern(attachment, "evidenceId", /^ev_[a-zA-Z0-9_-]+$/, "attachment evidence ID"),
      evidenceEventId: readEventId(attachment, "evidenceEventId", `${label} attachment`),
      filename: readString(attachment, "filename", `${label} attachment`),
      contentHash: readHash(attachment, "contentHash", `${label} attachment`)
    });
  });
  if (new Set(attachments.map((attachment) => attachment.evidenceId)).size !== attachments.length) {
    throw new Error("PRR correspondence attachments must not contain duplicate evidence IDs.");
  }
  return Object.freeze({
    from: readEmail(value, "from", `${label} message`),
    to: readUniqueEmails(value, "to", `${label} message`, true),
    cc: readUniqueEmails(value, "cc", `${label} message`, false),
    subject: readString(value, "subject", `${label} message`),
    subjectHash: readHash(value, "subjectHash", `${label} message`),
    bodyHash: readHash(value, "bodyHash", `${label} message`),
    renderedBodyHash: readHash(value, "renderedBodyHash", `${label} message`),
    attachments: Object.freeze(attachments),
    requiresLegalConfirmation: readBoolean(value, "requiresLegalConfirmation", `${label} message`),
    providerIdempotencyKey: readString(value, "providerIdempotencyKey", `${label} message`)
  });
}

function readRequestState(
  record: Record<string, unknown>,
  key: string,
  label: string
): PrrCorrespondenceRequestState {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set([
    "requestCreatedEventId", "status", "jurisdictionPack", "activeDeadline", "confirmedStalling",
    "legalEscalation", "initialSentEventId"
  ]), `${label} request state`);
  const status = readString(value, "status", `${label} request state`) as PrrStatus;
  if (!new Set<PrrStatus>([
    "draft", "sent", "acknowledged", "inNegotiation", "awaitingProduction", "partiallyProduced",
    "produced", "denied", "appealed", "closed"
  ]).has(status)) {
    throw new Error("PRR correspondence request status is unsupported.");
  }
  const jurisdictionPack = readJurisdictionPack(value, "jurisdictionPack", `${label} request state`);
  const activeDeadline = Object.hasOwn(value, "activeDeadline") && value.activeDeadline !== undefined
    ? readDeadline(value, "activeDeadline", `${label} request state`)
    : undefined;
  const legalEscalation = Object.hasOwn(value, "legalEscalation") && value.legalEscalation !== undefined
    ? readLegalEscalation(value, "legalEscalation", `${label} request state`)
    : undefined;
  return Object.freeze({
    requestCreatedEventId: readEventId(value, "requestCreatedEventId", `${label} request state`),
    status,
    jurisdictionPack,
    ...(activeDeadline === undefined ? {} : { activeDeadline }),
    confirmedStalling: readBoolean(value, "confirmedStalling", `${label} request state`),
    ...(legalEscalation === undefined ? {} : { legalEscalation }),
    ...(Object.hasOwn(value, "initialSentEventId") && value.initialSentEventId !== undefined
      ? { initialSentEventId: readEventId(value, "initialSentEventId", `${label} request state`) }
      : {})
  });
}

function readDeadline(
  record: Record<string, unknown>,
  key: string,
  label: string
): NonNullable<PrrCorrespondenceRequestState["activeDeadline"]> {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set(["eventId", "deadlineDate", "source", "citedRules"]), `${label} deadline`);
  const source = readString(value, "source", `${label} deadline`);
  if (source !== "estimated" && source !== "confirmed") {
    throw new Error("PRR correspondence deadline source is unsupported.");
  }
  const deadlineDate = readString(value, "deadlineDate", `${label} deadline`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
    throw new Error("PRR correspondence deadline date must use YYYY-MM-DD.");
  }
  return Object.freeze({
    eventId: readEventId(value, "eventId", `${label} deadline`),
    deadlineDate,
    source,
    citedRules: readCitedRules(value, "citedRules", `${label} deadline`)
  });
}

function readLegalEscalation(
  record: Record<string, unknown>,
  key: string,
  label: string
): NonNullable<PrrCorrespondenceRequestState["legalEscalation"]> {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(
    value,
    new Set(["eventId", "confirmedBy", "rationale", "citedRules", "evidenceIds"]),
    `${label} legal escalation`
  );
  return Object.freeze({
    eventId: readEventId(value, "eventId", `${label} legal escalation`),
    confirmedBy: readString(value, "confirmedBy", `${label} legal escalation`),
    rationale: readString(value, "rationale", `${label} legal escalation`),
    citedRules: readCitedRules(value, "citedRules", `${label} legal escalation`),
    evidenceIds: readUniquePatternArray(
      value,
      "evidenceIds",
      /^ev_[a-zA-Z0-9_-]+$/,
      `${label} legal evidence IDs`,
      true
    )
  });
}

function readCitedRules(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly PrrCorrespondenceCitedRule[] {
  return Object.freeze(readObjectArray(record, key, label).map((rule) => {
    rejectUnsupportedKeys(rule, new Set(["jurisdictionPack", "label", "citation", "url"]), `${label} cited rule`);
    return Object.freeze({
      jurisdictionPack: readJurisdictionPack(rule, "jurisdictionPack", `${label} cited rule`),
      label: readString(rule, "label", `${label} cited rule`),
      citation: readString(rule, "citation", `${label} cited rule`),
      ...(Object.hasOwn(rule, "url") && rule.url !== undefined
        ? { url: readString(rule, "url", `${label} cited rule`) }
        : {})
    });
  }));
}

function readJurisdictionPack(
  record: Record<string, unknown>,
  key: string,
  label: string
): { readonly name: string; readonly version: string } {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(value, new Set(["name", "version"]), `${label} jurisdiction pack`);
  return Object.freeze({
    name: readString(value, "name", `${label} jurisdiction pack`),
    version: readString(value, "version", `${label} jurisdiction pack`)
  });
}

function readProviderCapability(
  record: Record<string, unknown>,
  key: string,
  label: string
): PrrCorrespondenceProviderCapability {
  const value = readObject(record, key, label);
  rejectUnsupportedKeys(
    value,
    new Set(["provider", "canSend", "canSync", "canFetchAttachments", "capabilityRef"]),
    `${label} provider capability`
  );
  return Object.freeze({
    provider: readProvider(value, "provider", `${label} provider capability`),
    canSend: readBoolean(value, "canSend", `${label} provider capability`),
    canSync: readBoolean(value, "canSync", `${label} provider capability`),
    canFetchAttachments: readBoolean(value, "canFetchAttachments", `${label} provider capability`),
    capabilityRef: readHash(value, "capabilityRef", `${label} provider capability`)
  });
}

function readLegalGateChecks(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly PrrCorrespondenceLegalGateCheck[] {
  const checks = readObjectArray(record, key, label).map((check) => {
    rejectUnsupportedKeys(check, new Set(["id", "ready", "locked", "detail"]), `${label} legal gate check`);
    return Object.freeze({
      id: readString(check, "id", `${label} legal gate check`),
      ready: readBoolean(check, "ready", `${label} legal gate check`),
      locked: readBoolean(check, "locked", `${label} legal gate check`),
      detail: readString(check, "detail", `${label} legal gate check`)
    });
  });
  if (checks.length === 0) {
    throw new Error("PRR correspondence legal gate checks must not be empty.");
  }
  return Object.freeze(checks);
}

function readLegalEvidenceBindings(
  record: Record<string, unknown>,
  key: string,
  label: string
): readonly PrrCorrespondenceLegalEvidenceBinding[] {
  const bindings = readObjectArray(record, key, label).map((binding) => {
    rejectUnsupportedKeys(
      binding,
      new Set(["evidenceId", "evidenceEventId", "contentHash"]),
      `${label} legal evidence binding`
    );
    return Object.freeze({
      evidenceId: readPattern(
        binding,
        "evidenceId",
        /^ev_[a-zA-Z0-9_-]+$/,
        "PRR legal evidence ID"
      ),
      evidenceEventId: readEventId(binding, "evidenceEventId", `${label} legal evidence binding`),
      contentHash: readHash(binding, "contentHash", `${label} legal evidence binding`)
    });
  });
  if (new Set(bindings.map((binding) => binding.evidenceId)).size !== bindings.length) {
    throw new Error("PRR legal evidence bindings must contain unique evidence IDs.");
  }
  return Object.freeze(bindings);
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

function readRawString(record: Record<string, unknown>, key: string, label: string): string {
  const value = readData(record, key, label);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} field ${key} must be a non-empty string.`);
  }
  return value;
}

function readPattern(
  record: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  label: string
): string {
  const value = readString(record, key, label);
  if (!pattern.test(value)) {
    throw new Error(`${label} must be canonical.`);
  }
  return value;
}

function readEventId(record: Record<string, unknown>, key: string, label: string): string {
  return readPattern(record, key, /^evt_[a-zA-Z0-9_-]+$/, `${label} event ID`);
}

function readHash(record: Record<string, unknown>, key: string, label: string): ContentHash {
  return readPattern(record, key, /^sha256:[a-f0-9]{64}$/, `${label} hash`) as ContentHash;
}

function readProvider(record: Record<string, unknown>, key: string, label: string): CorrespondenceProvider {
  const value = readString(record, key, label);
  if (value !== "gmail" && value !== "imap-smtp" && value !== "himalaya") {
    throw new Error(`${label} provider is unsupported.`);
  }
  return value;
}

function readEmail(record: Record<string, unknown>, key: string, label: string): string {
  const value = readString(record, key, label);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${label} field ${key} must be an email address.`);
  }
  return value;
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

function readUniqueEmails(
  record: Record<string, unknown>,
  key: string,
  label: string,
  requireNonEmpty: boolean
): readonly string[] {
  const values = readPlainStringArray(readData(record, key, label), `${label} field ${key}`);
  if (requireNonEmpty && values.length === 0) {
    throw new Error(`${label} field ${key} must not be empty.`);
  }
  for (const value of values) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error(`${label} field ${key} must contain email addresses.`);
    }
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} field ${key} must not contain duplicates.`);
  }
  return values;
}

function readUniquePatternArray(
  record: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  label: string,
  requireNonEmpty: boolean
): readonly string[] {
  const values = readPlainStringArray(readData(record, key, label), label);
  if (requireNonEmpty && values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  if (values.some((value) => !pattern.test(value)) || new Set(values).size !== values.length) {
    throw new Error(`${label} must contain unique canonical values.`);
  }
  return values;
}

function readPlainStringArray(value: unknown, label: string): readonly string[] {
  const cloned = clonePlainJson(value, label);
  if (!Array.isArray(cloned) || cloned.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be a plain string array.`);
  }
  cloned.forEach((item) => assertAgentSecretSafeText(item as string, label));
  return Object.freeze([...(cloned as string[])]);
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

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
