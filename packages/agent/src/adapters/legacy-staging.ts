import { createHash } from "node:crypto";
import type { KnowledgeEvent } from "../../../ontology/src/contracts.js";
import type { EventLedger } from "../../../ontology/src/event-ledger.js";
import type { LegacyImportRuntime } from "../../../ingestion/src/legacy-runtime.js";
import { sha256, stableJson } from "../../../ingestion/src/legacy-report.js";
import { buildLegacyImportProjection } from "../../../ingestion/src/legacy-projection.js";
import type { LegacyApprovedAssertionCandidate } from "../../../ingestion/src/legacy-staging.js";
import type { LegacyImportRuntimeError } from "../../../ingestion/src/legacy-runtime-types.js";
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
  AgentApprovedToolPreviewResult
} from "../scheduler-types.js";

type LegacyStagingPreviewResult = Awaited<ReturnType<LegacyImportRuntime["stagingPreview"]>>;
type LegacyStagingPreviewSuccess = Extract<LegacyStagingPreviewResult, { readonly ok: true }>;
type LegacyStageResult = Awaited<ReturnType<LegacyImportRuntime["stageApproved"]>>;
type LegacyStageSuccess = Extract<LegacyStageResult, { readonly ok: true }>;
type LegacyApproveResult = Awaited<ReturnType<LegacyImportRuntime["approveStaging"]>>;
type LegacyApproveSuccess = Extract<LegacyApproveResult, { readonly ok: true }>;

export const legacyStagingApproveDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "legacy.staging.approve",
  toolVersion: "0.1.0",
  family: "legacy-staging",
  sideEffectClass: "ledger-review",
  requiredApprovalClass: "ledger-review",
  inputSchemaId: "legacy-staging-approval-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "legacy.import-runtime",
  idempotencyKeyFields: ["sourceCollectionId", "scanBatchId", "stagingBatchId", "legacyReportId", "candidateSetHash"],
  forbiddenEffects: ["assertion.accepted", "entity.resolved", "relationship.accepted", "old-ontology-import"]
});

export const legacyStagingExecuteDescriptor: AgentDomainToolDescriptor = Object.freeze({
  toolId: "legacy.staging.execute",
  toolVersion: "0.1.0",
  family: "legacy-staging",
  sideEffectClass: "ledger-proposal",
  requiredApprovalClass: "none",
  inputSchemaId: "legacy-staging-execution-input.v1",
  outputSchemaId: "agent-domain-result.v1",
  targetDomainService: "legacy.import-runtime",
  idempotencyKeyFields: ["sourceCollectionId", "scanBatchId", "stagingBatchId", "legacyReportId", "candidateSetHash"],
  forbiddenEffects: ["assertion.accepted", "entity.resolved", "relationship.accepted", "old-ontology-import"]
});

export const forbiddenLegacyStagingEventTypes = Object.freeze([
  "assertion.accepted",
  "entity.resolved",
  "relationship.accepted"
] as const satisfies readonly KnowledgeEvent["type"][]);

export interface LegacyStagingAdapterContext {
  readonly runtime: LegacyImportRuntime;
  readonly ledger?: EventLedger;
  readonly residentAgentId?: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly stagingBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
}

export interface BuildLegacyStagingPreviewInput
  extends Omit<LegacyStagingAdapterContext, "runtime" | "ledger"> {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly preview: LegacyStagingPreviewSuccess;
  readonly selectedCandidateIds: readonly string[];
}

export interface RebuildLegacyStagingCurrentPreviewInput
  extends Omit<LegacyStagingAdapterContext, "reportHash" | "candidateSetHash"> {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly runId: string;
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly approvedReportHash: `sha256:${string}`;
  readonly approvedCandidateSetHash: `sha256:${string}`;
  readonly selectedCandidateIds: readonly string[];
}

export interface CreateLegacyStagingAdapterInput extends LegacyStagingAdapterContext {
  readonly selectedCandidateIds: readonly string[];
}

type LegacyStagingAdapterInputWithLedger = CreateLegacyStagingAdapterInput & { readonly ledger: EventLedger };

const legacyStagingPreviewInputKeys = new Set([
  "sourceCollectionId",
  "scanBatchId",
  "stagingBatchId",
  "legacyReportId",
  "reportHash",
  "candidateSetHash",
  "toolRequestId",
  "toolId",
  "toolVersion",
  "runId",
  "taskId",
  "residentAgentId",
  "preview",
  "selectedCandidateIds"
]);

export function buildLegacyStagingApprovalPreview(input: BuildLegacyStagingPreviewInput): AgentDomainPreview {
  const validated = validateLegacyStagingPreviewInput(input);
  const selectedCandidates = selectedCandidatesFor(validated.preview.candidates, validated.selectedCandidateIds);
  const importedEvidenceIds = selectedCandidates.map((candidate) => candidate.evidenceId);
  const evidenceContentHashes = selectedCandidates.map((candidate) => candidate.evidenceContentHash);
  // Pre-binding runtimes can omit assertion semantics; complete current
  // candidates always enter the strict, versioned binding path.
  const selectedCandidateBindingHashes =
    legacySelectedCandidateBindingHashes(selectedCandidates);
  const descriptor = descriptorForLegacyStagingTool(validated.toolId, validated.toolVersion);
  const normalizedInputHash = sha256(stableJson({
    sourceCollectionId: validated.sourceCollectionId,
    scanBatchId: validated.scanBatchId,
    stagingBatchId: validated.stagingBatchId,
    legacyReportId: validated.legacyReportId,
    reportHash: validated.preview.reportHash,
    candidateSetHash: validated.preview.candidateSetHash,
    selectedCandidateIds: [...validated.selectedCandidateIds],
    ...(selectedCandidateBindingHashes === undefined
      ? {}
      : { selectedCandidateBindingHashes }),
    importedEvidenceIds,
    evidenceContentHashes
  }));

  return {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: validated.toolRequestId,
    toolId: validated.toolId,
    toolVersion: validated.toolVersion,
    runId: validated.runId,
    taskId: validated.taskId,
    residentAgentId: validated.residentAgentId,
    sideEffectClass: descriptor.sideEffectClass,
    requiredApprovalClass: descriptor.requiredApprovalClass,
    targetDomainService: descriptor.targetDomainService,
    inputSchemaId: descriptor.inputSchemaId,
    normalizedInputHash,
    summary: summaryFor(validated.toolId, selectedCandidates.length, validated.legacyReportId),
    scope: `Legacy staging ${validated.stagingBatchId} for report ${validated.legacyReportId}.`,
    estimatedEffect: effectFor(validated.toolId, selectedCandidates.length),
    consequence: "Legacy staging remains evidence-first: approval and execution may append staging approval or assertion.proposed events only; it cannot accept graph state, import old ontology truth, mutate source files, send PRR correspondence, or export reports.",
    affectedRefs: [
      { kind: "source-collection", id: validated.sourceCollectionId },
      { kind: "scan-batch", id: validated.scanBatchId },
      { kind: "staging-batch", id: validated.stagingBatchId },
      { kind: "legacy-report", id: validated.legacyReportId, hash: validated.preview.reportHash },
      { kind: "candidate-set", id: validated.legacyReportId, hash: validated.preview.candidateSetHash },
      ...selectedCandidates.map((candidate) => ({
        kind: "legacy-candidate",
        id: candidate.candidateId,
        evidenceId: candidate.evidenceId,
        evidenceContentHash: candidate.evidenceContentHash,
        sourcePath: candidate.sourcePath
      }))
    ],
    expectedOutputs: validated.toolId === legacyStagingExecuteDescriptor.toolId
      ? [{ kind: "event", type: "assertion.proposed" }]
      : [{ kind: "event", type: "legacy.ontology.staging.approved" }],
    contextPackRefs: [],
    governancePolicyVersion: "legacy-staging.v1",
    lockSnapshot: [],
    projectionHighWaterMarks: [],
    idempotencyKey: [
      validated.toolId,
      validated.sourceCollectionId,
      validated.scanBatchId,
      validated.stagingBatchId,
      validated.legacyReportId,
      validated.preview.candidateSetHash,
      ...validated.selectedCandidateIds
    ].join(":"),
    staleAfter: {
      kind: "legacy-report-or-candidate-set-change",
      refs: [validated.legacyReportId, validated.preview.reportHash, validated.preview.candidateSetHash]
    },
    relatedEventIds: [],
    artifactHashes: [
      validated.preview.reportHash,
      validated.preview.candidateSetHash,
      ...evidenceContentHashes
    ],
    sourceCollectionId: validated.sourceCollectionId,
    scanBatchId: validated.scanBatchId,
    stagingBatchId: validated.stagingBatchId,
    legacyReportId: validated.legacyReportId,
    reportHash: validated.preview.reportHash,
    candidateSetHash: validated.preview.candidateSetHash,
    selectedCandidateIds: [...validated.selectedCandidateIds],
    ...(selectedCandidateBindingHashes === undefined
      ? {}
      : { selectedCandidateBindingHashes }),
    importedEvidenceIds,
    evidenceContentHashes
  };
}

function legacySelectedCandidateBindingHashes(
  candidates: readonly LegacyApprovedAssertionCandidate[]
): readonly `sha256:${string}`[] | undefined {
  const bindingKeys = [
    "predicate",
    "object",
    "confidence",
    "subjectRef"
  ] as const;
  const anyBindingMaterial = candidates.some((candidate) =>
    bindingKeys.some((key) => Object.hasOwn(candidate, key))
  );
  if (!anyBindingMaterial) {
    return undefined;
  }
  if (candidates.some((candidate) =>
    !hasCanonicalLegacySelectedCandidateBindingMaterial(candidate)
  )) {
    throw new Error(
      "Legacy staging current candidates have incomplete assertion binding material."
    );
  }
  return candidates.map(legacySelectedCandidateBindingHash);
}

function hasCanonicalLegacySelectedCandidateBindingMaterial(
  candidate: LegacyApprovedAssertionCandidate
): boolean {
  const object = Reflect.get(candidate, "object");
  const predicate = Reflect.get(candidate, "predicate");
  const confidence = Reflect.get(candidate, "confidence");
  const subjectRefPresent = Object.hasOwn(candidate, "subjectRef");
  const subjectRef = Reflect.get(candidate, "subjectRef");
  return (
    Object.hasOwn(candidate, "predicate") &&
    Object.hasOwn(candidate, "object") &&
    Object.hasOwn(candidate, "confidence") &&
    typeof predicate === "string" &&
    predicate.length > 0 &&
    (
      object === null ||
      typeof object === "string" ||
      typeof object === "boolean" ||
      (typeof object === "number" && Number.isFinite(object))
    ) &&
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1 &&
    (
      !subjectRefPresent ||
      (typeof subjectRef === "string" && subjectRef.length > 0)
    )
  );
}

function legacySelectedCandidateBindingHash(
  candidate: LegacyApprovedAssertionCandidate
): `sha256:${string}` {
  const subjectRefPresent = Object.hasOwn(candidate, "subjectRef");
  return sha256(
    "legacy-selected-candidate-binding.v1\n" +
    stableJson({
      candidateId: candidate.candidateId,
      evidenceId: candidate.evidenceId,
      evidenceContentHash: candidate.evidenceContentHash,
      predicate: candidate.predicate,
      object: candidate.object,
      confidence: candidate.confidence,
      subjectRef: {
        present: subjectRefPresent,
        value: subjectRefPresent ? candidate.subjectRef : null
      }
    })
  );
}

function validateLegacyStagingPreviewInput(input: BuildLegacyStagingPreviewInput): BuildLegacyStagingPreviewInput {
  const record = dataRecordFromObject(input, "legacy staging preview input");
  rejectUnsupportedKeys(record, legacyStagingPreviewInputKeys, "legacy staging preview input");

  const preview = readDataProperty(record, "preview", "legacy staging preview input") as LegacyStagingPreviewSuccess;
  const previewRecord = dataRecordFromObject(preview, "legacy staging preview result");
  const toolId = readStringProperty(record, "toolId", "legacy staging preview input");
  const toolVersion = readStringProperty(record, "toolVersion", "legacy staging preview input");
  descriptorForLegacyStagingTool(toolId, toolVersion);

  const reportHash = readHashProperty(record, "reportHash", "legacy staging preview input");
  const candidateSetHash = readHashProperty(record, "candidateSetHash", "legacy staging preview input");
  const previewReportHash = readHashProperty(previewRecord, "reportHash", "legacy staging preview result");
  const previewCandidateSetHash = readHashProperty(previewRecord, "candidateSetHash", "legacy staging preview result");

  if (reportHash !== previewReportHash) {
    throw new Error("Legacy staging report hash must match the current staging preview before a tool preview is built.");
  }
  if (candidateSetHash !== previewCandidateSetHash) {
    throw new Error("Legacy staging candidate set hash must match the current staging preview before a tool preview is built.");
  }

  return {
    sourceCollectionId: readStringProperty(record, "sourceCollectionId", "legacy staging preview input"),
    scanBatchId: readStringProperty(record, "scanBatchId", "legacy staging preview input"),
    stagingBatchId: readStringProperty(record, "stagingBatchId", "legacy staging preview input"),
    legacyReportId: readStringProperty(record, "legacyReportId", "legacy staging preview input"),
    reportHash,
    candidateSetHash,
    toolRequestId: readStringProperty(record, "toolRequestId", "legacy staging preview input"),
    toolId,
    toolVersion,
    runId: readStringProperty(record, "runId", "legacy staging preview input"),
    taskId: readStringProperty(record, "taskId", "legacy staging preview input"),
    residentAgentId: readStringProperty(record, "residentAgentId", "legacy staging preview input"),
    preview,
    selectedCandidateIds: assertSelectedCandidateIds(
      readDataProperty(record, "selectedCandidateIds", "legacy staging preview input")
    )
  };
}

function validateLegacyStagingAdapterInput(input: CreateLegacyStagingAdapterInput): LegacyStagingAdapterInputWithLedger {
  if (input.ledger === undefined) {
    throw new Error("Legacy staging production adapters require a ledger for idempotency and forbidden-event validation.");
  }

  return {
    runtime: input.runtime,
    ledger: input.ledger,
    residentAgentId: input.residentAgentId ?? "agent_default",
    sourceCollectionId: input.sourceCollectionId,
    scanBatchId: input.scanBatchId,
    stagingBatchId: input.stagingBatchId,
    legacyReportId: input.legacyReportId,
    reportHash: input.reportHash,
    candidateSetHash: input.candidateSetHash,
    selectedCandidateIds: assertSelectedCandidateIds(input.selectedCandidateIds)
  };
}

function descriptorForLegacyStagingTool(toolId: string, toolVersion: string): AgentDomainToolDescriptor {
  if (toolId === legacyStagingApproveDescriptor.toolId && toolVersion === legacyStagingApproveDescriptor.toolVersion) {
    return legacyStagingApproveDescriptor;
  }
  if (toolId === legacyStagingExecuteDescriptor.toolId && toolVersion === legacyStagingExecuteDescriptor.toolVersion) {
    return legacyStagingExecuteDescriptor;
  }

  throw new Error("Legacy staging previews require a canonical legacy staging tool descriptor.");
}

export async function rebuildLegacyStagingCurrentPreview(
  input: RebuildLegacyStagingCurrentPreviewInput
): Promise<AgentApprovedToolPreviewResult> {
  const previewResult = await input.runtime.stagingPreview({
    sourceCollectionId: input.sourceCollectionId,
    legacyReportId: input.legacyReportId
  });
  if (!previewResult.ok) {
    throw failureForLegacyRuntimeError(previewResult.error);
  }

  const current = buildLegacyStagingApprovalPreview({
    sourceCollectionId: input.sourceCollectionId,
    scanBatchId: input.scanBatchId,
    stagingBatchId: input.stagingBatchId,
    legacyReportId: input.legacyReportId,
    reportHash: previewResult.reportHash,
    candidateSetHash: previewResult.candidateSetHash,
    toolRequestId: input.toolRequestId,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: input.residentAgentId,
    preview: previewResult,
    selectedCandidateIds: input.selectedCandidateIds
  });
  const selectedCandidateIds = new Set(input.selectedCandidateIds);
  const currentCandidateIds = new Set(previewResult.candidates.map((candidate) => candidate.candidateId));
  const missingSelected = [...selectedCandidateIds].filter((candidateId) => !currentCandidateIds.has(candidateId));
  const artifactHashes = [
    previewResult.reportHash,
    previewResult.candidateSetHash,
    ...previewResult.candidates
      .filter((candidate) => selectedCandidateIds.has(candidate.candidateId))
      .map((candidate) => candidate.evidenceContentHash)
  ];
  const evidenceRefs = previewResult.candidates
    .filter((candidate) => selectedCandidateIds.has(candidate.candidateId))
    .map((candidate) => candidate.evidenceId);
  const activeLocks = await readActiveLocks(input.ledger, input.residentAgentId);

  return {
    preview: current,
    sourceEventIds: [],
    inputArtifactHashes: artifactHashes,
    provenanceRefs: [
      input.sourceCollectionId,
      input.scanBatchId,
      input.stagingBatchId,
      input.legacyReportId,
      previewResult.reportHash,
      previewResult.candidateSetHash,
      ...input.selectedCandidateIds,
      ...evidenceRefs
    ],
    activeLocks,
    freshnessChecks: [
      {
        name: "legacy-report-hash",
        expected: input.approvedReportHash,
        actual: previewResult.reportHash,
        ok: input.approvedReportHash === previewResult.reportHash
      },
      {
        name: "legacy-candidate-set-hash",
        expected: input.approvedCandidateSetHash,
        actual: previewResult.candidateSetHash,
        ok: input.approvedCandidateSetHash === previewResult.candidateSetHash
      },
      {
        name: "legacy-selected-candidates",
        expected: input.selectedCandidateIds.join(","),
        actual: previewResult.candidates.map((candidate) => candidate.candidateId).join(","),
        ok: missingSelected.length === 0
      }
    ]
  };
}

export function createLegacyStagingApprovalAdapter(input: CreateLegacyStagingAdapterInput): AgentDomainExecutionAdapter {
  const validated = validateLegacyStagingAdapterInput(input);
  return {
    descriptor: legacyStagingApproveDescriptor,
    async buildCurrentPreview(request) {
      return rebuildLegacyStagingCurrentPreview({
        ...validated,
        toolRequestId: request.toolRequestId,
        toolId: request.toolId,
        toolVersion: request.toolVersion,
        runId: request.runId,
        taskId: request.taskId ?? "task_legacy_staging",
        residentAgentId: validated.residentAgentId ?? "agent_default",
        approvedReportHash: validated.reportHash,
        approvedCandidateSetHash: validated.candidateSetHash
      });
    },
    async executeApproved(request) {
      return mapLegacyStagingApprovalResult(
        await executeLegacyStagingApproval(validated, request),
        validated.selectedCandidateIds
      );
    }
  };
}

export function createLegacyStagingExecutionAdapter(input: CreateLegacyStagingAdapterInput): AgentDomainExecutionAdapter {
  const validated = validateLegacyStagingAdapterInput(input);
  return {
    descriptor: legacyStagingExecuteDescriptor,
    async buildCurrentPreview(request) {
      return rebuildLegacyStagingCurrentPreview({
        ...validated,
        toolRequestId: request.toolRequestId,
        toolId: request.toolId,
        toolVersion: request.toolVersion,
        runId: request.runId,
        taskId: request.taskId ?? "task_legacy_staging",
        residentAgentId: validated.residentAgentId ?? "agent_default",
        approvedReportHash: validated.reportHash,
        approvedCandidateSetHash: validated.candidateSetHash
      });
    },
    async executeApproved() {
      return executeLegacyStaging(validated);
    }
  };
}

async function executeLegacyStagingApproval(
  context: CreateLegacyStagingAdapterInput,
  request: AgentApprovedToolExecutionInput
): Promise<LegacyApproveSuccess> {
  await assertNoActiveLocks(context);
  await assertCurrentSelectionStillEligible(context);
  const existingApproval = await findExistingMatchingStagingApproval(context);
  if (existingApproval !== undefined) {
    return {
      ok: true,
      command: "legacy approve-staging",
      sourceCollectionId: context.sourceCollectionId,
      scanBatchId: context.scanBatchId,
      eventIds: [existingApproval.approvedEventId],
      nextActions: [],
      legacyReportId: context.legacyReportId,
      stagingBatchId: context.stagingBatchId,
      reportHash: context.reportHash,
      candidateSetHash: context.candidateSetHash,
      approvedAssertionCandidateIds: [...context.selectedCandidateIds]
    };
  }
  const result = await context.runtime.approveStaging({
    ...runtimeIdentity(context),
    approvedBy: request.approvedBy,
    approvedAssertionCandidateIds: [...context.selectedCandidateIds]
  });
  if (!result.ok) {
    throw failureForLegacyRuntimeError(result.error);
  }
  return result;
}

async function executeLegacyStaging(context: CreateLegacyStagingAdapterInput): Promise<AgentDomainExecutionResult> {
  await assertNoActiveLocks(context);
  const selectedCandidates = await assertCurrentSelectionStillEligible(context);
  const existingProposals = await findExistingLegacyAssertionProposals(context, selectedCandidates);
  if (existingProposals.length === selectedCandidates.length) {
    return mapLegacyStageResult({
      ok: true,
      command: "legacy stage",
      sourceCollectionId: context.sourceCollectionId,
      scanBatchId: context.scanBatchId,
      eventIds: existingProposals.map((event) => event.id),
      nextActions: [],
      legacyReportId: context.legacyReportId,
      stagingBatchId: context.stagingBatchId,
      proposedAssertionIds: existingProposals.map((event) => event.payload.assertionId)
    }, context.selectedCandidateIds);
  }
  if (existingProposals.length > 0) {
    throw agentDomainExecutionFailure({
      category: "data-loss-risk",
      message: "Legacy staging has a partial existing proposal set and requires operator inspection before retry.",
      retryable: false,
      allowedActions: ["inspect legacy staging proposal events before retrying"]
    });
  }

  const beforeEvents = context.ledger === undefined ? [] : await context.ledger.readAll();
  const result = await context.runtime.stageApproved(runtimeIdentity(context));
  if (!result.ok) {
    throw failureForLegacyRuntimeError(result.error);
  }

  if (context.ledger !== undefined) {
    const afterEvents = await context.ledger.readAll();
    assertNoForbiddenLegacyEvents(eventsAddedAfter(beforeEvents, afterEvents));
    assertNoForbiddenLegacyEvents(afterEvents.filter((event) => result.eventIds.includes(event.id)));
  }

  return mapLegacyStageResult(result, context.selectedCandidateIds);
}

async function assertNoActiveLocks(context: LegacyStagingAdapterContext): Promise<void> {
  if ((await readActiveLocks(context.ledger, context.residentAgentId ?? "agent_default")).length === 0) {
    return;
  }
  throw agentDomainExecutionFailure({
    category: "lock-active",
    message: "An active resident-agent lock blocks legacy staging.",
    retryable: true,
    allowedActions: ["clear active resident-agent locks before retrying"]
  });
}

async function readActiveLocks(
  ledger: EventLedger | undefined,
  residentAgentId: string
): Promise<readonly AgentApprovedToolActiveLock[]> {
  if (ledger === undefined) {
    return Object.freeze([]);
  }
  const projection = buildAgentProjection(await ledger.readAll());
  return Object.freeze(
    [...projection.locks.values()]
      .filter((lock) => lock.state === "active" && lock.residentAgentId === residentAgentId)
      .sort((left, right) => left.lockId.localeCompare(right.lockId))
      .map((lock) => Object.freeze({
        lockId: lock.lockId,
        category: lock.kind,
        message: lock.reason
      }))
  );
}

async function assertCurrentSelectionStillEligible(
  context: CreateLegacyStagingAdapterInput
): Promise<readonly LegacyApprovedAssertionCandidate[]> {
  const current = await context.runtime.stagingPreview({
    sourceCollectionId: context.sourceCollectionId,
    legacyReportId: context.legacyReportId
  });
  if (!current.ok) {
    throw failureForLegacyRuntimeError(current.error);
  }
  if (current.reportHash !== context.reportHash || current.candidateSetHash !== context.candidateSetHash) {
    throw agentDomainExecutionFailure({
      category: "approval-stale",
      message: "Legacy staging report or candidate set changed after approval.",
      retryable: false,
      allowedActions: ["rerun legacy staging preview", "request a new staging approval"]
    });
  }

  const currentCandidatesById = new Map(current.candidates.map((candidate) => [candidate.candidateId, candidate]));
  if (context.selectedCandidateIds.some((candidateId) => !currentCandidatesById.has(candidateId))) {
    throw agentDomainExecutionFailure({
      category: "approval-stale",
      message: "Legacy staging selection is no longer present in the current evidence-tied candidate set.",
      retryable: false,
      allowedActions: ["rerun legacy staging preview", "request a new staging approval"]
    });
  }
  return context.selectedCandidateIds.map((candidateId) => currentCandidatesById.get(candidateId)!);
}

function mapLegacyStagingApprovalResult(
  result: LegacyApproveSuccess,
  selectedCandidateIds: readonly string[]
): AgentDomainExecutionResult {
  return {
    eventIds: [...result.eventIds],
    artifactHashes: [result.reportHash, result.candidateSetHash],
    readModelChanges: [{
      projectionName: "legacy-staging",
      change: `approved ${selectedCandidateIds.length} legacy staging candidate${selectedCandidateIds.length === 1 ? "" : "s"}`,
      relatedIds: [...selectedCandidateIds]
    }],
    resultSummary: "Legacy ontology staging approval was recorded."
  };
}

function mapLegacyStageResult(
  result: LegacyStageSuccess,
  selectedCandidateIds: readonly string[]
): AgentDomainExecutionResult {
  return {
    eventIds: [...result.eventIds],
    artifactHashes: [],
    readModelChanges: [{
      projectionName: "legacy-staging",
      change: `staged ${result.proposedAssertionIds.length} legacy assertion proposal${result.proposedAssertionIds.length === 1 ? "" : "s"}`,
      relatedIds: [...selectedCandidateIds]
    }],
    resultSummary: "Legacy ontology staging appended evidence-tied assertion proposals."
  };
}

function failureForLegacyRuntimeError(error: LegacyImportRuntimeError) {
  switch (error.code) {
    case "LEGACY_IMPORT_STAGING_APPROVAL_REQUIRED":
      return agentDomainExecutionFailure({
        category: "approval-required",
        message: "Legacy staging execution requires explicit staging approval.",
        retryable: false,
        allowedActions: [...error.allowedRepairActions]
      });
    case "LEGACY_IMPORT_CANDIDATE_SET_MISMATCH":
    case "LEGACY_IMPORT_REPORT_NOT_FOUND":
    case "LEGACY_IMPORT_REPORT_REQUIRED":
      return agentDomainExecutionFailure({
        category: "approval-stale",
        message: error.message,
        retryable: false,
        allowedActions: [...error.allowedRepairActions]
      });
    case "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED":
      return agentDomainExecutionFailure({
        category: "provenance-missing",
        message: error.message,
        retryable: true,
        allowedActions: [...error.allowedRepairActions]
      });
    case "LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN":
      return forbiddenLegacyStagingFailure();
    default:
      return agentDomainExecutionFailure({
        category: "domain-gate-failed",
        message: error.message,
        retryable: true,
        allowedActions: [...error.allowedRepairActions]
      });
  }
}

function assertNoForbiddenLegacyEvents(events: readonly KnowledgeEvent[]): void {
  if (events.some((event) => forbiddenLegacyStagingEventTypes.includes(event.type as typeof forbiddenLegacyStagingEventTypes[number]))) {
    throw forbiddenLegacyStagingFailure();
  }
}

async function findExistingMatchingStagingApproval(context: CreateLegacyStagingAdapterInput) {
  if (context.ledger === undefined) {
    return undefined;
  }

  const projection = buildLegacyImportProjection(await context.ledger.readAll());
  const approval = projection.stagingApprovals.get(context.stagingBatchId);
  if (
    approval !== undefined &&
    approval.sourceCollectionId === context.sourceCollectionId &&
    approval.scanBatchId === context.scanBatchId &&
    approval.legacyReportId === context.legacyReportId &&
    approval.reportHash === context.reportHash &&
    approval.candidateSetHash === context.candidateSetHash &&
    sameStringSet(approval.approvedAssertionCandidateIds, context.selectedCandidateIds)
  ) {
    return approval;
  }
  return undefined;
}

async function findExistingLegacyAssertionProposals(
  context: CreateLegacyStagingAdapterInput,
  selectedCandidates: readonly LegacyApprovedAssertionCandidate[]
): Promise<Array<Extract<KnowledgeEvent, { readonly type: "assertion.proposed" }>>> {
  if (context.ledger === undefined) {
    return [];
  }

  const proposals: Array<Extract<KnowledgeEvent, { readonly type: "assertion.proposed" }>> = [];
  for (const candidate of selectedCandidates) {
    const assertionId = legacyAssertionId(context, candidate.candidateId);
    const streamEvents = await context.ledger.readStream(`assertion_${assertionId}`);
    const proposed = streamEvents.find(
      (event): event is Extract<KnowledgeEvent, { readonly type: "assertion.proposed" }> =>
        event.type === "assertion.proposed" && event.payload.assertionId === assertionId
    );
    if (proposed !== undefined) {
      proposals.push(proposed);
    }
  }
  return proposals;
}

function forbiddenLegacyStagingFailure() {
  return agentDomainExecutionFailure({
    category: "domain-gate-failed",
    message: "Legacy ontology staging may append assertion proposals only.",
    retryable: false,
    allowedActions: ["review the staging service implementation", "do not accept graph state in legacy stage"]
  });
}

function legacyAssertionId(
  context: Pick<CreateLegacyStagingAdapterInput, "sourceCollectionId" | "scanBatchId" | "stagingBatchId" | "candidateSetHash">,
  candidateId: string
): string {
  return `as_legacy_${createHash("sha256").update([
    context.sourceCollectionId,
    context.scanBatchId,
    context.stagingBatchId,
    context.candidateSetHash,
    candidateId
  ].join(":")).digest("hex")}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function runtimeIdentity(context: LegacyStagingAdapterContext): {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly legacyReportId: string;
  readonly stagingBatchId: string;
} {
  return {
    sourceCollectionId: context.sourceCollectionId,
    scanBatchId: context.scanBatchId,
    legacyReportId: context.legacyReportId,
    stagingBatchId: context.stagingBatchId
  };
}

function selectedCandidatesFor(
  candidates: readonly LegacyApprovedAssertionCandidate[],
  selectedCandidateIds: readonly string[]
): readonly LegacyApprovedAssertionCandidate[] {
  const selected = assertSelectedCandidateIds(selectedCandidateIds);
  const candidatesById = new Map<string, LegacyApprovedAssertionCandidate>();
  for (const candidate of candidates) {
    if (candidatesById.has(candidate.candidateId)) {
      throw new Error(`Legacy staging current candidate set has duplicate candidate ${candidate.candidateId}.`);
    }
    candidatesById.set(candidate.candidateId, candidate);
  }

  return selected.map((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    if (candidate === undefined) {
      throw new Error(`Legacy staging selected candidate ${candidateId} is absent from the current evidence-tied candidate set.`);
    }
    return candidate;
  });
}

function assertSelectedCandidateIds(value: unknown): readonly string[] {
  const selectedCandidateIds = readPlainStringArray(value, "legacy staging selected candidate IDs");
  if (selectedCandidateIds.length === 0) {
    throw new Error("Legacy staging selected candidate IDs must include at least one candidate.");
  }

  const seen = new Set<string>();
  for (const candidateId of selectedCandidateIds) {
    if (seen.has(candidateId)) {
      throw new Error(`Legacy staging selected candidate IDs must not contain duplicate candidate ${candidateId}.`);
    }
    seen.add(candidateId);
  }
  return selectedCandidateIds;
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }

  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || "get" in descriptor || "set" in descriptor) {
      throw new Error(`${label} must use data properties only.`);
    }
  }

  return value as Record<string, unknown>;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowedKeys: ReadonlySet<string>, label: string): void {
  for (const key of Object.getOwnPropertyNames(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }
}

function readDataProperty(record: Record<string, unknown>, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) {
    throw new Error(`${label} is missing ${key}.`);
  }
  if ("get" in descriptor || "set" in descriptor) {
    throw new Error(`${label} field ${key} must be a data property.`);
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

function readHashProperty(record: Record<string, unknown>, key: string, label: string): `sha256:${string}` {
  const value = readStringProperty(record, key, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} field ${key} must be a sha256 content hash.`);
  }
  return value as `sha256:${string}`;
}

function readPlainStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "length") {
      continue;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) {
      throw new Error(`${label} must not contain custom array fields.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || "get" in descriptor || "set" in descriptor) {
      throw new Error(`${label} must use data array entries only.`);
    }
  }

  const values: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new Error(`${label} must not contain sparse entries.`);
    }
    if ("get" in descriptor || "set" in descriptor) {
      throw new Error(`${label} must use data array entries only.`);
    }
    if (typeof descriptor.value !== "string" || descriptor.value.trim().length === 0) {
      throw new Error(`${label} entries must be non-empty strings.`);
    }
    values.push(descriptor.value);
  }
  return values;
}

function summaryFor(toolId: string, candidateCount: number, legacyReportId: string): string {
  if (toolId === legacyStagingExecuteDescriptor.toolId) {
    return `Stage ${candidateCount} evidence-tied legacy assertion proposal${candidateCount === 1 ? "" : "s"} from ${legacyReportId}.`;
  }
  return `Approve ${candidateCount} evidence-tied legacy staging candidate${candidateCount === 1 ? "" : "s"} from ${legacyReportId}.`;
}

function effectFor(toolId: string, candidateCount: number): string {
  if (toolId === legacyStagingExecuteDescriptor.toolId) {
    return `Calls the legacy staging runtime to append ${candidateCount} assertion.proposed event${candidateCount === 1 ? "" : "s"} after staging approval.`;
  }
  return `Calls the legacy staging runtime to append one legacy.ontology.staging.approved event for ${candidateCount} candidate${candidateCount === 1 ? "" : "s"}.`;
}

function eventsAddedAfter(beforeEvents: readonly KnowledgeEvent[], afterEvents: readonly KnowledgeEvent[]): readonly KnowledgeEvent[] {
  const beforeIds = new Set(beforeEvents.map((event) => event.id));
  return afterEvents.filter((event) => !beforeIds.has(event.id));
}
