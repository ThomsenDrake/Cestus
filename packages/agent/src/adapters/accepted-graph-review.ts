import { createHash } from "node:crypto";
import {
  actorRefSchema,
  validateKnowledgeEvent,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import type { AssertionService } from "../../../ontology/src/assertion-service.js";
import type { AgentDomainExecutionAdapter } from "../domain-execution-dispatcher.js";
import { agentDomainExecutionFailure } from "../domain-execution-dispatcher.js";
import { buildAgentProjection } from "../projection.js";
import type {
  AgentDomainExecutionResult,
  AgentDomainPreview,
  AgentDomainToolDescriptor
} from "../domain-execution-descriptors.js";
import type {
  AgentApprovedToolActiveLock,
  AgentApprovedToolExecutionInput,
  AgentApprovedToolPreviewResult
} from "../scheduler-types.js";
import { assertAgentSecretSafeText } from "../secret-safety.js";
import { hashAgentToolPreview } from "../tool-gateway.js";

type ContentHash = `sha256:${string}`;
type ReviewState = "missing" | "proposed" | "accepted" | "superseded";

export const acceptedGraphAssertionReviewDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "ontology.assertion.accept",
  toolVersion: "0.1.0",
  family: "accepted-graph-review",
  sideEffectClass: "ledger-review",
  requiredApprovalClass: "ledger-review",
  inputSchemaId: "accepted-graph-assertion-review-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "ontology.assertion-service",
  idempotencyKeyFields: [
    "assertionId",
    "proposalEventId",
    "evidenceEventId",
    "evidenceContentHash",
    "ontologyPackVersions"
  ],
  forbiddenEffects: [
    "entity.resolved",
    "relationship.accepted",
    "agent-reviewer",
    "accept-without-evidence",
    "memory-to-truth-promotion"
  ]
});

export const acceptedGraphReviewDescriptors = Object.freeze([
  acceptedGraphAssertionReviewDescriptor
] as const satisfies readonly AgentDomainToolDescriptor[]);

export interface AcceptedGraphReviewAdapterContext {
  readonly ledger: EventLedger;
  readonly assertionService: Pick<AssertionService, "accept">;
  readonly reviewer: ActorRef;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly assertionId: string;
  readonly proposalEventId: string;
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly evidenceContentHash: ContentHash;
  readonly reviewerRationaleDraft: string;
  readonly ontologyPackVersions: Readonly<Record<string, string>>;
}

export interface BuildAcceptedGraphReviewPreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly assertionId: string;
  readonly proposalEventId: string;
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly evidenceContentHash: ContentHash;
  readonly proposalEvent: KnowledgeEventOf<"assertion.proposed">;
  readonly evidenceEvent: KnowledgeEventOf<"evidence.ingested">;
  readonly reviewerRationaleDraft: string;
  readonly ontologyPackVersions: Readonly<Record<string, string>>;
}

export interface RebuildAcceptedGraphReviewCurrentPreviewInput extends AcceptedGraphReviewAdapterContext {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
}

interface ValidatedAcceptedGraphReviewContext extends AcceptedGraphReviewAdapterContext {
  readonly reviewer: ActorRef & { readonly kind: "human" };
  readonly ontologyPackVersions: Readonly<Record<string, string>>;
}

interface AcceptedGraphReviewSnapshot {
  readonly reviewState: ReviewState;
  readonly assertionId: string;
  readonly proposalEventId: string;
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly evidenceContentHash: ContentHash;
  readonly proposal?: KnowledgeEventOf<"assertion.proposed">;
  readonly evidence?: KnowledgeEventOf<"evidence.ingested">;
  readonly accepted?: KnowledgeEventOf<"assertion.accepted">;
  readonly ontologyPackVersions: Readonly<Record<string, string>>;
  readonly assertionHighWaterMark: number;
  readonly evidenceHighWaterMark: number;
}

const previewInputKeys = new Set([
  "toolRequestId",
  "toolId",
  "toolVersion",
  "runId",
  "taskId",
  "residentAgentId",
  "assertionId",
  "proposalEventId",
  "evidenceId",
  "evidenceEventId",
  "evidenceContentHash",
  "proposalEvent",
  "evidenceEvent",
  "reviewerRationaleDraft",
  "ontologyPackVersions"
]);

const contextInputKeys = new Set([
  "ledger",
  "assertionService",
  "reviewer",
  "residentAgentId",
  "taskId",
  "assertionId",
  "proposalEventId",
  "evidenceId",
  "evidenceEventId",
  "evidenceContentHash",
  "reviewerRationaleDraft",
  "ontologyPackVersions"
]);

const rebuildInputKeys = new Set([
  ...contextInputKeys,
  "toolRequestId",
  "toolId",
  "toolVersion",
  "runId",
  "taskId"
]);

const executionInputKeys = new Set([
  "toolRequestId",
  "runId",
  "taskId",
  "toolId",
  "toolVersion",
  "sideEffectClass",
  "approvalClass",
  "previewHash",
  "approvedPreviewHash",
  "approvedBy",
  "sourceEventIds",
  "inputArtifactHashes",
  "provenanceRefs"
]);

export function buildAcceptedGraphReviewApprovalPreview(
  input: BuildAcceptedGraphReviewPreviewInput
): AgentDomainPreview {
  const validated = validatePreviewInput(input);
  return buildAcceptedGraphReviewPreview({
    toolRequestId: validated.toolRequestId,
    toolId: validated.toolId,
    toolVersion: validated.toolVersion,
    runId: validated.runId,
    taskId: validated.taskId,
    residentAgentId: validated.residentAgentId,
    reviewerRationaleDraft: validated.reviewerRationaleDraft,
    lockSnapshot: [],
    expected: bindingFromPreviewInput(validated),
    snapshot: {
      reviewState: "proposed",
      assertionId: validated.assertionId,
      proposalEventId: validated.proposalEventId,
      evidenceId: validated.evidenceId,
      evidenceEventId: validated.evidenceEventId,
      evidenceContentHash: validated.evidenceContentHash,
      proposal: validated.proposalEvent,
      evidence: validated.evidenceEvent,
      ontologyPackVersions: validated.ontologyPackVersions,
      assertionHighWaterMark: validated.proposalEvent.sequence,
      evidenceHighWaterMark: validated.evidenceEvent.sequence
    }
  });
}

export async function rebuildAcceptedGraphReviewCurrentPreview(
  input: RebuildAcceptedGraphReviewCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const record = dataRecordFromObject(input, "accepted graph current-preview input");
  rejectUnsupportedKeys(record, rebuildInputKeys, "accepted graph current-preview input");
  const context = validatedContextFromRecord(record);
  const toolId = readStringProperty(record, "toolId", "accepted graph current-preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "accepted graph current-preview input");
  descriptorForAcceptedGraphTool(toolId, toolVersion);
  const snapshot = await readCurrentSnapshot(context);
  const activeLocks = await readActiveLocks(context);
  const preview = buildAcceptedGraphReviewPreview({
    toolRequestId: readStringProperty(record, "toolRequestId", "accepted graph current-preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "accepted graph current-preview input"),
    taskId: readStringProperty(record, "taskId", "accepted graph current-preview input"),
    residentAgentId: context.residentAgentId,
    reviewerRationaleDraft: context.reviewerRationaleDraft,
    lockSnapshot: activeLocks,
    expected: bindingFromContext(context),
    snapshot
  });

  const sourceEventIds = currentSourceEventIds(context, snapshot);
  const inputArtifactHashes = [snapshot.evidenceContentHash];
  const provenanceRefs = provenanceRefsFor(snapshot);
  return {
    preview,
    sourceEventIds,
    inputArtifactHashes,
    provenanceRefs,
    activeLocks,
    freshnessChecks: freshnessChecksFor(context, snapshot)
  };
}

export function createAcceptedGraphAssertionReviewAdapter(
  input: AcceptedGraphReviewAdapterContext
): AgentDomainExecutionAdapter {
  const context = validateAdapterContext(input);
  const adapter: AgentDomainExecutionAdapter = {
    descriptor: acceptedGraphAssertionReviewDescriptor,
    buildCurrentPreview(request) {
      return rebuildAcceptedGraphReviewCurrentPreview({
        ...context,
        toolRequestId: request.toolRequestId,
        toolId: request.toolId,
        toolVersion: request.toolVersion,
        runId: request.runId,
        taskId: context.taskId
      });
    },
    executeApproved(request) {
      return executeAcceptedGraphAssertionReview(context, request);
    }
  };
  return Object.freeze(adapter);
}

async function executeAcceptedGraphAssertionReview(
  context: ValidatedAcceptedGraphReviewContext,
  input: AgentApprovedToolExecutionInput
): Promise<AgentDomainExecutionResult> {
  const execution = validateExecutionInput(context, input);
  const snapshot = await readCurrentSnapshot(context);
  const activeLocks = await readActiveLocks(context);
  if (activeLocks.length > 0) {
    throw agentDomainExecutionFailure({
      category: "lock-active",
      message: "An active resident-agent lock blocks accepted graph review.",
      retryable: false,
      allowedActions: ["inspect active agent locks", "request human lock review before retrying"]
    });
  }

  if (snapshot.accepted !== undefined && acceptanceMatchesBinding(snapshot.accepted, context)) {
    const approvedPreview = buildAcceptedGraphReviewPreview({
      toolRequestId: execution.toolRequestId,
      toolId: execution.toolId,
      toolVersion: execution.toolVersion,
      runId: execution.runId,
      taskId: context.taskId,
      residentAgentId: context.residentAgentId,
      reviewerRationaleDraft: context.reviewerRationaleDraft,
      lockSnapshot: [],
      expected: bindingFromContext(context),
      snapshot: proposedSnapshotForExistingAcceptance(context, snapshot)
    });
    if (hashAgentToolPreview(approvedPreview) !== execution.approvedPreviewHash) {
      throw staleApprovalFailure("Accepted graph review preview changed after approval.");
    }
    return mapAcceptedGraphResult(snapshot.accepted, context);
  }

  assertSnapshotIsFresh(context, snapshot);
  const currentPreview = buildAcceptedGraphReviewPreview({
    toolRequestId: execution.toolRequestId,
    toolId: execution.toolId,
    toolVersion: execution.toolVersion,
    runId: execution.runId,
    taskId: context.taskId,
    residentAgentId: context.residentAgentId,
    reviewerRationaleDraft: context.reviewerRationaleDraft,
    lockSnapshot: [],
    expected: bindingFromContext(context),
    snapshot
  });
  if (hashAgentToolPreview(currentPreview) !== execution.approvedPreviewHash) {
    throw staleApprovalFailure("Accepted graph review preview changed after approval.");
  }

  const beforeEvents = await context.ledger.readAll();
  let accepted: KnowledgeEventOf<"assertion.accepted">;
  try {
    accepted = await context.assertionService.accept({
      assertionId: context.assertionId,
      acceptedBy: context.reviewer.id,
      rationale: context.reviewerRationaleDraft,
      actor: context.reviewer
    });
  } catch {
    throw agentDomainExecutionFailure({
      category: "domain-gate-failed",
      message: "Ontology assertion review rejected the approved acceptance request.",
      retryable: false,
      allowedActions: ["inspect the assertion review state", "request a new ledger review if the proposal changed"]
    });
  }

  const afterEvents = await context.ledger.readAll();
  const appended = eventsAddedAfter(beforeEvents, afterEvents);
  if (
    appended.length !== 1 ||
    appended[0]?.id !== accepted.id ||
    !acceptanceMatchesBinding(accepted, context) ||
    appended.some((event) => event.type === "entity.resolved" || event.type === "relationship.accepted")
  ) {
    throw agentDomainExecutionFailure({
      category: "domain-gate-failed",
      message: "Ontology assertion review returned events outside the approved assertion acceptance.",
      retryable: false,
      allowedActions: ["inspect the ontology assertion review service"]
    });
  }

  return mapAcceptedGraphResult(accepted, context);
}

function validatePreviewInput(input: BuildAcceptedGraphReviewPreviewInput): BuildAcceptedGraphReviewPreviewInput {
  const record = dataRecordFromObject(input, "accepted graph review preview input");
  rejectUnsupportedKeys(record, previewInputKeys, "accepted graph review preview input");
  const toolId = readStringProperty(record, "toolId", "accepted graph review preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "accepted graph review preview input");
  descriptorForAcceptedGraphTool(toolId, toolVersion);
  const assertionId = readStringProperty(record, "assertionId", "accepted graph review preview input");
  const proposalEventId = readEventIdProperty(record, "proposalEventId", "accepted graph review preview input");
  const evidenceId = readStringProperty(record, "evidenceId", "accepted graph review preview input");
  const evidenceEventId = readEventIdProperty(record, "evidenceEventId", "accepted graph review preview input");
  const evidenceContentHash = readHashProperty(record, "evidenceContentHash", "accepted graph review preview input");
  const proposalEvent = readKnowledgeEvent(
    record,
    "proposalEvent",
    "assertion.proposed",
    "accepted graph review preview input"
  );
  const evidenceEvent = readKnowledgeEvent(
    record,
    "evidenceEvent",
    "evidence.ingested",
    "accepted graph review preview input"
  );
  const ontologyPackVersions = readPackVersions(record, "ontologyPackVersions", "accepted graph review preview input");
  const reviewerRationaleDraft = readSecretSafeStringProperty(
    record,
    "reviewerRationaleDraft",
    "accepted graph review preview input"
  );

  if (assertionId !== proposalEvent.payload.assertionId || proposalEvent.streamId !== `assertion_${assertionId}`) {
    throw new Error("Accepted graph review assertion ID must match the proposed assertion event.");
  }
  if (proposalEventId !== proposalEvent.id) {
    throw new Error("Accepted graph review proposal event ID must match the proposed assertion event.");
  }
  if (
    evidenceId !== proposalEvent.payload.evidenceId ||
    evidenceId !== evidenceEvent.payload.evidenceId ||
    evidenceEvent.streamId !== `evidence_${evidenceId}`
  ) {
    throw new Error("Accepted graph review evidence ID must match the proposal and evidence event.");
  }
  if (evidenceEventId !== evidenceEvent.id || proposalEvent.context.causationId !== evidenceEventId) {
    throw new Error("Accepted graph review evidence event ID must match proposal causation.");
  }
  if (evidenceContentHash !== evidenceEvent.payload.contentHash) {
    throw new Error("Accepted graph review evidence content hash must match the evidence event.");
  }
  if (!sameStringRecord(ontologyPackVersions, proposalEvent.context.packVersions)) {
    throw new Error("Accepted graph review ontology pack versions must match the proposal event.");
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "accepted graph review preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "accepted graph review preview input"),
    taskId: readStringProperty(record, "taskId", "accepted graph review preview input"),
    residentAgentId: readStringProperty(record, "residentAgentId", "accepted graph review preview input"),
    assertionId,
    proposalEventId,
    evidenceId,
    evidenceEventId,
    evidenceContentHash,
    proposalEvent,
    evidenceEvent,
    reviewerRationaleDraft,
    ontologyPackVersions
  };
}

function validateAdapterContext(input: AcceptedGraphReviewAdapterContext): ValidatedAcceptedGraphReviewContext {
  const record = dataRecordFromObject(input, "accepted graph review adapter input");
  rejectUnsupportedKeys(record, contextInputKeys, "accepted graph review adapter input");
  return validatedContextFromRecord(record);
}

function validatedContextFromRecord(record: Record<string, unknown>): ValidatedAcceptedGraphReviewContext {
  const ledger = readDataProperty(record, "ledger", "accepted graph review adapter input") as EventLedger;
  requireCallable(ledger, "readStream", "accepted graph review ledger");
  requireCallable(ledger, "readAll", "accepted graph review ledger");
  const assertionService = readDataProperty(
    record,
    "assertionService",
    "accepted graph review adapter input"
  ) as Pick<AssertionService, "accept">;
  requireCallable(assertionService, "accept", "accepted graph assertion service");
  const reviewer = readActorRef(record, "reviewer", "accepted graph review adapter input");
  if (reviewer.kind !== "human") {
    throw new Error("Accepted graph review requires a human domain review actor.");
  }
  const humanReviewer: ActorRef & { readonly kind: "human" } = Object.freeze({
    id: reviewer.id,
    kind: "human",
    label: reviewer.label
  });

  return {
    ledger,
    assertionService,
    reviewer: humanReviewer,
    residentAgentId: readStringProperty(record, "residentAgentId", "accepted graph review adapter input"),
    taskId: readStringProperty(record, "taskId", "accepted graph review adapter input"),
    assertionId: readStringProperty(record, "assertionId", "accepted graph review adapter input"),
    proposalEventId: readEventIdProperty(record, "proposalEventId", "accepted graph review adapter input"),
    evidenceId: readStringProperty(record, "evidenceId", "accepted graph review adapter input"),
    evidenceEventId: readEventIdProperty(record, "evidenceEventId", "accepted graph review adapter input"),
    evidenceContentHash: readHashProperty(record, "evidenceContentHash", "accepted graph review adapter input"),
    reviewerRationaleDraft: readSecretSafeStringProperty(
      record,
      "reviewerRationaleDraft",
      "accepted graph review adapter input"
    ),
    ontologyPackVersions: readPackVersions(record, "ontologyPackVersions", "accepted graph review adapter input")
  };
}

function validateExecutionInput(
  context: ValidatedAcceptedGraphReviewContext,
  input: AgentApprovedToolExecutionInput
): AgentApprovedToolExecutionInput {
  const record = dataRecordFromObject(input, "accepted graph approved execution input");
  rejectUnsupportedKeys(record, executionInputKeys, "accepted graph approved execution input");
  const toolId = readStringProperty(record, "toolId", "accepted graph approved execution input");
  const toolVersion = readStringProperty(record, "toolVersion", "accepted graph approved execution input");
  try {
    descriptorForAcceptedGraphTool(toolId, toolVersion);
  } catch {
    throw permissionFailure("Accepted graph execution requires the registered assertion review descriptor.");
  }
  if (
    readStringProperty(record, "sideEffectClass", "accepted graph approved execution input") !== "ledger-review" ||
    readStringProperty(record, "approvalClass", "accepted graph approved execution input") !== "ledger-review"
  ) {
    throw permissionFailure("Accepted graph review requires the canonical ledger review approval class.");
  }
  const approvedBy = readStringProperty(record, "approvedBy", "accepted graph approved execution input");
  if (approvedBy !== context.reviewer.id) {
    throw permissionFailure("Accepted graph review approval actor must match the human domain reviewer.");
  }
  const previewHash = readHashProperty(record, "previewHash", "accepted graph approved execution input");
  const approvedPreviewHash = readHashProperty(
    record,
    "approvedPreviewHash",
    "accepted graph approved execution input"
  );
  if (previewHash !== approvedPreviewHash) {
    throw staleApprovalFailure("Accepted graph review preview hashes do not match.");
  }
  const sourceEventIds = readPlainStringArray(
    readDataProperty(record, "sourceEventIds", "accepted graph approved execution input"),
    "accepted graph source event IDs"
  );
  if (!sameOrderedStrings(sourceEventIds, [context.proposalEventId, context.evidenceEventId])) {
    throw staleApprovalFailure("Accepted graph review source event IDs changed after approval.");
  }
  const inputArtifactHashes = readPlainStringArray(
    readDataProperty(record, "inputArtifactHashes", "accepted graph approved execution input"),
    "accepted graph input artifact hashes"
  );
  if (!sameOrderedStrings(inputArtifactHashes, [context.evidenceContentHash])) {
    throw staleApprovalFailure("Accepted graph review evidence hash changed after approval.");
  }
  const provenanceRefs = readPlainStringArray(
    readDataProperty(record, "provenanceRefs", "accepted graph approved execution input"),
    "accepted graph provenance refs"
  );
  const expectedProvenance = provenanceRefsFor(bindingSnapshot(context));
  if (!sameOrderedStrings(provenanceRefs, expectedProvenance)) {
    throw agentDomainExecutionFailure({
      category: "provenance-missing",
      message: "Accepted graph review provenance does not match the approved assertion and evidence.",
      retryable: false,
      allowedActions: ["rebuild the assertion review preview", "request a new ledger review"]
    });
  }
  const taskId = readOptionalStringProperty(record, "taskId", "accepted graph approved execution input");
  if (taskId !== undefined && taskId !== context.taskId) {
    throw staleApprovalFailure("Accepted graph review task ID changed after approval.");
  }

  return {
    toolRequestId: readStringProperty(record, "toolRequestId", "accepted graph approved execution input"),
    runId: readStringProperty(record, "runId", "accepted graph approved execution input"),
    ...(taskId === undefined ? {} : { taskId }),
    toolId,
    toolVersion,
    sideEffectClass: "ledger-review",
    approvalClass: "ledger-review",
    previewHash,
    approvedPreviewHash,
    approvedBy,
    sourceEventIds,
    inputArtifactHashes,
    provenanceRefs
  };
}

async function readCurrentSnapshot(
  context: ValidatedAcceptedGraphReviewContext
): Promise<AcceptedGraphReviewSnapshot> {
  const assertionEvents = await context.ledger.readStream(`assertion_${context.assertionId}`);
  const proposals = assertionEvents.filter(
    (event): event is KnowledgeEventOf<"assertion.proposed"> =>
      event.type === "assertion.proposed" && event.payload.assertionId === context.assertionId
  );
  const expectedProposal = proposals.find((event) => event.id === context.proposalEventId);
  const proposal = expectedProposal ?? proposals.at(-1);
  const accepted = assertionEvents.find(
    (event): event is KnowledgeEventOf<"assertion.accepted"> =>
      event.type === "assertion.accepted" &&
      event.payload.assertionId === context.assertionId &&
      event.context.causationId === context.proposalEventId
  );
  const superseded = assertionEvents.find((event) => isAssertionSupersededEvent(event, context.assertionId));

  const evidenceEvents = await context.ledger.readStream(`evidence_${context.evidenceId}`);
  const ingestedEvidence = evidenceEvents.filter(
    (event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.type === "evidence.ingested" && event.payload.evidenceId === context.evidenceId
  );
  const evidence = ingestedEvidence.at(-1);
  const reviewState: ReviewState = superseded !== undefined
    ? "superseded"
    : accepted !== undefined
      ? "accepted"
      : proposal === undefined
        ? "missing"
        : "proposed";

  return {
    reviewState,
    assertionId: proposal?.payload.assertionId ?? context.assertionId,
    proposalEventId: proposal?.id ?? context.proposalEventId,
    evidenceId: proposal?.payload.evidenceId ?? evidence?.payload.evidenceId ?? context.evidenceId,
    evidenceEventId: evidence?.id ?? context.evidenceEventId,
    evidenceContentHash: (evidence?.payload.contentHash ?? context.evidenceContentHash) as ContentHash,
    ...(proposal === undefined ? {} : { proposal }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(accepted === undefined ? {} : { accepted }),
    ontologyPackVersions: copyStringRecord(proposal?.context.packVersions ?? context.ontologyPackVersions),
    assertionHighWaterMark: maxSequence(assertionEvents),
    evidenceHighWaterMark: maxSequence(evidenceEvents)
  };
}

async function readActiveLocks(
  context: ValidatedAcceptedGraphReviewContext
): Promise<readonly AgentApprovedToolActiveLock[]> {
  const projection = buildAgentProjection(await context.ledger.readAll());
  return Object.freeze(
    [...projection.locks.values()]
      .filter((lock) => lock.state === "active" && lock.residentAgentId === context.residentAgentId)
      .sort((left, right) => left.lockId.localeCompare(right.lockId))
      .map((lock) => Object.freeze({
        lockId: lock.lockId,
        category: lock.kind,
        message: lock.reason
      }))
  );
}

interface BuildPreviewFromSnapshotInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly reviewerRationaleDraft: string;
  readonly lockSnapshot: readonly AgentApprovedToolActiveLock[];
  readonly expected: ReviewBinding;
  readonly snapshot: AcceptedGraphReviewSnapshot;
}

interface ReviewBinding {
  readonly assertionId: string;
  readonly proposalEventId: string;
  readonly evidenceId: string;
  readonly evidenceEventId: string;
  readonly evidenceContentHash: ContentHash;
  readonly ontologyPackVersions: Readonly<Record<string, string>>;
}

function buildAcceptedGraphReviewPreview(input: BuildPreviewFromSnapshotInput): AgentDomainPreview {
  descriptorForAcceptedGraphTool(input.toolId, input.toolVersion);
  const impact = projectedGraphImpact(input.snapshot);
  assertAgentSecretSafeText(impact, "accepted graph projected impact");
  const normalizedInputHash = sha256(stableJson({
    assertionId: input.snapshot.assertionId,
    proposalEventId: input.snapshot.proposalEventId,
    evidenceId: input.snapshot.evidenceId,
    evidenceEventId: input.snapshot.evidenceEventId,
    evidenceContentHash: input.snapshot.evidenceContentHash,
    currentReviewState: input.snapshot.reviewState,
    reviewerRationaleDraft: input.reviewerRationaleDraft,
    lockSnapshot: input.lockSnapshot.map((lock) => ({
      lockId: lock.lockId,
      category: lock.category,
      message: lock.message
    })),
    ontologyPackVersions: input.snapshot.ontologyPackVersions,
    projectedGraphImpact: impact
  }));
  const relatedEventIds = [
    input.snapshot.proposalEventId,
    input.snapshot.evidenceEventId,
    ...(input.snapshot.accepted === undefined ? [] : [input.snapshot.accepted.id])
  ];

  return {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: input.toolRequestId,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: input.residentAgentId,
    sideEffectClass: acceptedGraphAssertionReviewDescriptor.sideEffectClass,
    requiredApprovalClass: acceptedGraphAssertionReviewDescriptor.requiredApprovalClass,
    targetDomainService: acceptedGraphAssertionReviewDescriptor.targetDomainService,
    inputSchemaId: acceptedGraphAssertionReviewDescriptor.inputSchemaId,
    normalizedInputHash,
    summary: `Review assertion ${input.snapshot.assertionId} for acceptance into the shared graph.`,
    scope: `Human ontology review for assertion ${input.snapshot.assertionId}.`,
    estimatedEffect: "Append one assertion.accepted event through the ontology assertion service.",
    consequence: "Acceptance makes this evidence-backed assertion visible in the accepted graph projection; it does not resolve entities, accept relationships, or promote agent memory to truth.",
    affectedRefs: [
      {
        kind: "assertion",
        id: input.snapshot.assertionId,
        eventId: input.snapshot.proposalEventId,
        reviewState: input.snapshot.reviewState
      },
      {
        kind: "evidence",
        id: input.snapshot.evidenceId,
        eventId: input.snapshot.evidenceEventId,
        hash: input.snapshot.evidenceContentHash
      }
    ],
    expectedOutputs: [{ kind: "event", type: "assertion.accepted" }],
    contextPackRefs: [{
      kind: "ontology-pack-versions",
      versions: copyStringRecord(input.snapshot.ontologyPackVersions)
    }],
    governancePolicyVersion: "ontology-review.v1",
    lockSnapshot: input.lockSnapshot.map((lock) => ({
      lockId: lock.lockId,
      category: lock.category,
      message: lock.message
    })),
    projectionHighWaterMarks: [
      { projectionName: "ontology-assertion-review", highWaterMark: input.snapshot.assertionHighWaterMark },
      { projectionName: "ontology-evidence-provenance", highWaterMark: input.snapshot.evidenceHighWaterMark }
    ],
    idempotencyKey: [
      input.toolId,
      input.expected.assertionId,
      input.expected.proposalEventId,
      input.expected.evidenceEventId,
      input.expected.evidenceContentHash
    ].join(":"),
    staleAfter: {
      kind: "assertion-review-or-evidence-change",
      refs: [
        input.expected.assertionId,
        input.expected.proposalEventId,
        input.expected.evidenceId,
        input.expected.evidenceEventId,
        input.expected.evidenceContentHash,
        stableJson(input.expected.ontologyPackVersions)
      ]
    },
    relatedEventIds,
    artifactHashes: [input.snapshot.evidenceContentHash],
    assertionId: input.snapshot.assertionId,
    proposalEventId: input.snapshot.proposalEventId,
    evidenceId: input.snapshot.evidenceId,
    evidenceEventId: input.snapshot.evidenceEventId,
    evidenceContentHash: input.snapshot.evidenceContentHash,
    currentReviewState: input.snapshot.reviewState,
    reviewerRationaleDraft: input.reviewerRationaleDraft,
    ontologyPackVersions: copyStringRecord(input.snapshot.ontologyPackVersions),
    projectedGraphImpact: impact
  };
}

function assertSnapshotIsFresh(
  context: ValidatedAcceptedGraphReviewContext,
  snapshot: AcceptedGraphReviewSnapshot
): void {
  if (
    snapshot.reviewState !== "proposed" ||
    snapshot.proposal === undefined ||
    snapshot.evidence === undefined ||
    snapshot.assertionId !== context.assertionId ||
    snapshot.proposalEventId !== context.proposalEventId ||
    snapshot.evidenceId !== context.evidenceId ||
    snapshot.evidenceEventId !== context.evidenceEventId ||
    snapshot.evidenceContentHash !== context.evidenceContentHash ||
    snapshot.proposal.context.causationId !== context.evidenceEventId ||
    !sameStringRecord(snapshot.ontologyPackVersions, context.ontologyPackVersions)
  ) {
    throw staleApprovalFailure("Accepted graph assertion, evidence, or ontology pack state changed after approval.");
  }
}

function proposedSnapshotForExistingAcceptance(
  context: ValidatedAcceptedGraphReviewContext,
  snapshot: AcceptedGraphReviewSnapshot
): AcceptedGraphReviewSnapshot {
  if (
    snapshot.reviewState !== "accepted" ||
    snapshot.proposal === undefined ||
    snapshot.evidence === undefined ||
    snapshot.assertionId !== context.assertionId ||
    snapshot.proposalEventId !== context.proposalEventId ||
    snapshot.evidenceId !== context.evidenceId ||
    snapshot.evidenceEventId !== context.evidenceEventId ||
    snapshot.evidenceContentHash !== context.evidenceContentHash ||
    snapshot.proposal.context.causationId !== context.evidenceEventId ||
    !sameStringRecord(snapshot.ontologyPackVersions, context.ontologyPackVersions)
  ) {
    throw staleApprovalFailure("Accepted graph assertion or evidence changed before the idempotent result was read.");
  }

  return {
    reviewState: "proposed",
    assertionId: snapshot.assertionId,
    proposalEventId: snapshot.proposalEventId,
    evidenceId: snapshot.evidenceId,
    evidenceEventId: snapshot.evidenceEventId,
    evidenceContentHash: snapshot.evidenceContentHash,
    proposal: snapshot.proposal,
    evidence: snapshot.evidence,
    ontologyPackVersions: snapshot.ontologyPackVersions,
    assertionHighWaterMark: snapshot.proposal.sequence,
    evidenceHighWaterMark: snapshot.evidence.sequence
  };
}

function freshnessChecksFor(
  context: ValidatedAcceptedGraphReviewContext,
  snapshot: AcceptedGraphReviewSnapshot
) {
  return [
    freshnessCheck("assertion-review-state", "proposed", snapshot.reviewState),
    freshnessCheck("assertion-id", context.assertionId, snapshot.assertionId),
    freshnessCheck("assertion-proposal-event-id", context.proposalEventId, snapshot.proposalEventId),
    freshnessCheck("evidence-id", context.evidenceId, snapshot.evidenceId),
    freshnessCheck("evidence-event-id", context.evidenceEventId, snapshot.evidenceEventId),
    freshnessCheck("evidence-content-hash", context.evidenceContentHash, snapshot.evidenceContentHash),
    freshnessCheck(
      "ontology-pack-versions",
      stableJson(context.ontologyPackVersions),
      stableJson(snapshot.ontologyPackVersions)
    )
  ];
}

function freshnessCheck(name: string, expected: string, actual: string) {
  return { name, expected, actual, ok: expected === actual };
}

function mapAcceptedGraphResult(
  event: KnowledgeEventOf<"assertion.accepted">,
  context: AcceptedGraphReviewAdapterContext
): AgentDomainExecutionResult {
  return {
    eventIds: [event.id],
    artifactHashes: [],
    readModelChanges: [{
      projectionName: "ontology-graph",
      change: `accepted assertion ${context.assertionId}`,
      relatedIds: [context.assertionId, context.evidenceId]
    }],
    resultSummary: "The human-reviewed assertion was accepted through the ontology assertion service."
  };
}

function acceptanceMatchesBinding(
  event: KnowledgeEventOf<"assertion.accepted">,
  context: AcceptedGraphReviewAdapterContext
): boolean {
  return event.payload.assertionId === context.assertionId &&
    event.context.causationId === context.proposalEventId &&
    event.context.actor.kind === "human" &&
    event.payload.acceptedBy === event.context.actor.id;
}

function bindingFromPreviewInput(input: BuildAcceptedGraphReviewPreviewInput): ReviewBinding {
  return {
    assertionId: input.assertionId,
    proposalEventId: input.proposalEventId,
    evidenceId: input.evidenceId,
    evidenceEventId: input.evidenceEventId,
    evidenceContentHash: input.evidenceContentHash,
    ontologyPackVersions: input.ontologyPackVersions
  };
}

function bindingFromContext(input: AcceptedGraphReviewAdapterContext): ReviewBinding {
  return {
    assertionId: input.assertionId,
    proposalEventId: input.proposalEventId,
    evidenceId: input.evidenceId,
    evidenceEventId: input.evidenceEventId,
    evidenceContentHash: input.evidenceContentHash,
    ontologyPackVersions: input.ontologyPackVersions
  };
}

function bindingSnapshot(input: AcceptedGraphReviewAdapterContext): AcceptedGraphReviewSnapshot {
  return {
    reviewState: "proposed",
    assertionId: input.assertionId,
    proposalEventId: input.proposalEventId,
    evidenceId: input.evidenceId,
    evidenceEventId: input.evidenceEventId,
    evidenceContentHash: input.evidenceContentHash,
    ontologyPackVersions: input.ontologyPackVersions,
    assertionHighWaterMark: 0,
    evidenceHighWaterMark: 0
  };
}

function currentSourceEventIds(
  context: AcceptedGraphReviewAdapterContext,
  snapshot: AcceptedGraphReviewSnapshot
): readonly string[] {
  if (snapshot.reviewState === "accepted" && snapshot.accepted !== undefined) {
    return [snapshot.proposalEventId, snapshot.evidenceEventId, snapshot.accepted.id];
  }
  if (snapshot.proposal === undefined && snapshot.evidence === undefined) {
    return [context.proposalEventId, context.evidenceEventId];
  }
  return [snapshot.proposalEventId, snapshot.evidenceEventId];
}

function provenanceRefsFor(snapshot: AcceptedGraphReviewSnapshot): readonly string[] {
  return [
    snapshot.assertionId,
    snapshot.proposalEventId,
    snapshot.evidenceId,
    snapshot.evidenceEventId,
    snapshot.evidenceContentHash
  ];
}

function projectedGraphImpact(snapshot: AcceptedGraphReviewSnapshot): string {
  if (snapshot.proposal === undefined) {
    return `Assertion ${snapshot.assertionId} is unavailable and cannot change the accepted graph.`;
  }
  const subject = snapshot.proposal.payload.subjectRef ?? snapshot.assertionId;
  return `Accepting assertion ${snapshot.assertionId} would expose predicate ${snapshot.proposal.payload.predicate} for ${subject} in the accepted graph projection.`;
}

function descriptorForAcceptedGraphTool(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
  if (
    toolId === acceptedGraphAssertionReviewDescriptor.toolId &&
    toolVersion === acceptedGraphAssertionReviewDescriptor.toolVersion
  ) {
    return acceptedGraphAssertionReviewDescriptor;
  }
  throw new Error("Accepted graph review requires the canonical accepted graph review tool descriptor.");
}

function staleApprovalFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "approval-stale",
    message,
    retryable: false,
    allowedActions: ["rebuild the assertion review preview", "request a new ledger review"]
  });
}

function permissionFailure(message: string) {
  return agentDomainExecutionFailure({
    category: "permission-denied",
    message,
    retryable: false,
    allowedActions: ["use the independent human reviewer named by the ledger approval"]
  });
}

function eventsAddedAfter(before: readonly KnowledgeEvent[], after: readonly KnowledgeEvent[]): KnowledgeEvent[] {
  const beforeIds = new Set(before.map((event) => event.id));
  return after.filter((event) => !beforeIds.has(event.id));
}

function isAssertionSupersededEvent(event: KnowledgeEvent, assertionId: string): boolean {
  const candidate = event as unknown as { readonly type?: unknown; readonly payload?: unknown };
  if (candidate.type !== "assertion.superseded" || !isPlainDataObject(candidate.payload)) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(candidate.payload, "assertionId");
  return descriptor !== undefined && "value" in descriptor && descriptor.value === assertionId;
}

function maxSequence(events: readonly KnowledgeEvent[]): number {
  return events.reduce((highest, event) => Math.max(highest, event.sequence), 0);
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
  return value;
}

function readOptionalStringProperty(record: Record<string, unknown>, key: string, label: string): string | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return readStringProperty(record, key, label);
}

function readSecretSafeStringProperty(record: Record<string, unknown>, key: string, label: string): string {
  const value = readStringProperty(record, key, label);
  assertAgentSecretSafeText(value, `${label} field ${key}`);
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
    throw staleApprovalFailure(`${label} field ${key} must be an exact SHA-256 hash.`);
  }
  return value as ContentHash;
}

function readPackVersions(
  record: Record<string, unknown>,
  key: string,
  label: string
): Readonly<Record<string, string>> {
  const value = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  if (!isPlainDataObject(value) || Object.keys(value).length === 0) {
    throw new Error(`${label} field ${key} must be a non-empty plain version record.`);
  }
  const versions: Record<string, string> = {};
  for (const [name, version] of Object.entries(value)) {
    if (name.length === 0 || typeof version !== "string" || version.length === 0) {
      throw new Error(`${label} field ${key} must contain string pack versions.`);
    }
    assertAgentSecretSafeText(name, "ontology pack name");
    assertAgentSecretSafeText(version, "ontology pack version");
    versions[name] = version;
  }
  return Object.freeze(versions);
}

function readActorRef(record: Record<string, unknown>, key: string, label: string): ActorRef {
  const value = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  const parsed = actorRefSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} field ${key} must be a valid actor reference.`);
  }
  return parsed.data;
}

function readKnowledgeEvent<Type extends "assertion.proposed" | "evidence.ingested">(
  record: Record<string, unknown>,
  key: string,
  type: Type,
  label: string
): KnowledgeEventOf<Type> {
  const value = clonePlainJson(readDataProperty(record, key, label), `${label} field ${key}`);
  const parsed = validateKnowledgeEvent(value);
  if (!parsed.success || parsed.data.type !== type) {
    throw new Error(`${label} field ${key} must be a valid ${type} event.`);
  }
  return parsed.data as KnowledgeEventOf<Type>;
}

function clonePlainJson(value: unknown, label: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${label} must not contain symbol-keyed fields.`);
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
        throw new Error(`${label} arrays must not contain custom fields.`);
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

function sameStringRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  return stableJson(left) === stableJson(right);
}

function copyStringRecord(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right))));
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
