import { z } from "zod";
import {
  agentApprovalQueueClassValues,
  buildAgentApprovalQueue,
  type AgentAffectedRefDto,
  type AgentApprovalQueueInputApprovalClass,
  type AgentApprovalQueueItemDto,
  type AgentApprovalQueueOutput,
  type AgentApprovalQueueRequestDto
} from "./approval-queue.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentStatusDto } from "./runtime-types.js";

const schemaVersion = "agent-approval-cockpit.v1" as const;
const decisionResultSchemaVersion = "agent-approval-decision-result.v1" as const;
const providerByteTransferClass = "provider-byte-transfer" as const;
const forbiddenDirectEffects = [
  "provider-byte-transfer",
  "prr-send-followup",
  "legal-escalation",
  "export-publication",
  "destructive-repair",
  "accepted-graph-review"
] as const;
const afterApproval =
  "Approval records a human decision only. A separate scheduler or executor may later revalidate the exact preview hash before doing any work.";

export const agentApprovalCockpitDtoSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  generatedAt: z.string().datetime(),
  summary: z.object({
    pendingCount: z.number().int().nonnegative(),
    resumableCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
    terminalCount: z.number().int().nonnegative()
  }).strict(),
  decisionContract: z.object({
    approvalAppendsDecisionOnly: z.literal(true),
    denialAppendsDecisionOnly: z.literal(true),
    requiresHumanActor: z.literal(true),
    afterApproval: z.string().min(1),
    forbiddenDirectEffects: z.array(z.string().min(1))
  }).strict(),
  approvalClasses: z.array(z.object({
    approvalClass: z.enum(agentApprovalQueueClassValues),
    label: z.string().min(1),
    requiredFor: z.string().min(1),
    providerByteTransferNote: z.string().min(1).optional(),
    rationale: z.object({
      required: z.literal(true),
      secretSafe: z.literal(true)
    }).strict()
  }).strict()),
  queue: z.custom<AgentApprovalCockpitQueueDto>(),
  forbiddenDirectEffects: z.array(z.enum(forbiddenDirectEffects))
}).strict();

export type AgentApprovalCockpitDto = z.infer<typeof agentApprovalCockpitDtoSchema>;

export interface AgentApprovalCockpitQueueDto {
  readonly generatedAt: string;
  readonly pending: readonly AgentApprovalCockpitItemDto[];
  readonly resumable: readonly AgentApprovalCockpitItemDto[];
  readonly blocked: readonly AgentApprovalCockpitItemDto[];
  readonly stale: readonly AgentApprovalCockpitItemDto[];
  readonly denied: readonly AgentApprovalCockpitItemDto[];
  readonly completed: readonly AgentApprovalCockpitItemDto[];
  readonly failed: readonly AgentApprovalCockpitItemDto[];
}

export interface AgentApprovalCockpitItemDto extends AgentApprovalQueueItemDto {
  readonly requiredApprovalClass: AgentApprovalQueueItemDto["approvalClass"];
  readonly providerByteTransferNote?: string;
  readonly staleness: {
    readonly state: "current" | "stale";
    readonly approvable: boolean;
    readonly currentPreviewHash?: string;
    readonly guidance?: string;
  };
  readonly approvalContract: {
    readonly requiredApprovalClass: AgentApprovalQueueItemDto["approvalClass"];
    readonly approvalRouteAppendsOnly: true;
    readonly denialRouteAppendsOnly: true;
    readonly rationaleRequired: true;
    readonly rationaleSecretSafe: true;
    readonly afterApproval: string;
  };
  readonly review: {
    readonly what: string;
    readonly why: string;
    readonly dataLeavesOrChanges: string;
    readonly evidenceRefs: readonly AgentAffectedRefDto[];
    readonly artifactRefs: readonly AgentAffectedRefDto[];
    readonly riskAndLockStatus: string;
    readonly whatHappensAfterApproval: string;
    readonly staleOrUnsafePrevention: readonly string[];
  };
}

export interface BuildAgentApprovalCockpitInput {
  readonly status: AgentStatusDto;
  readonly generatedAt?: string;
  readonly currentPreviewHashes?: Readonly<Record<string, string>>;
}

export interface AgentApprovalDecisionResultDto {
  readonly ok: true;
  readonly schemaVersion: typeof decisionResultSchemaVersion;
  readonly eventIds: readonly string[];
  readonly approvalCockpit: AgentApprovalCockpitDto;
}

interface ReviewInput {
  readonly what: string;
  readonly why: string;
  readonly dataLeavesOrChanges: string;
  readonly evidenceRefs: readonly AgentAffectedRefDto[];
  readonly artifactRefs: readonly AgentAffectedRefDto[];
}

export function buildAgentApprovalCockpit(input: BuildAgentApprovalCockpitInput): AgentApprovalCockpitDto {
  const generatedAt = input.generatedAt ?? input.status.generatedAt;
  assertAgentSecretSafeText(generatedAt, "approval cockpit generatedAt");

  const taskIdsByRunId = new Map(input.status.runs.map((run) => [run.runId, run.taskId]));
  const requests = input.status.toolRequests.map((request) => projectRequestForQueue(request, taskIdsByRunId.get(request.runId)));
  const reviewInputsById = new Map(input.status.toolRequests.map((request) => [
    request.toolRequestId,
    {
      what: request.scope,
      why: `Agent requested ${request.toolId} during run ${request.runId}.`,
      dataLeavesOrChanges: request.estimatedEffect,
      evidenceRefs: freezeAffectedRefs(request.sourceEventIds.map((id) => ({ kind: "event", id }))),
      artifactRefs: freezeAffectedRefs(request.inputArtifactHashes.map((hash) => ({ kind: "artifact", id: hash, hash })))
    } satisfies ReviewInput
  ]));

  const queue = enrichQueue(buildAgentApprovalQueue({
    now: generatedAt,
    requests,
    approvals: input.status.toolRequests.flatMap(projectApprovalForQueue),
    denials: input.status.toolRequests.flatMap(projectDenialForQueue),
    completed: input.status.toolRequests.flatMap(projectCompletionForQueue),
    failures: input.status.toolRequests.flatMap(projectFailureForQueue),
    currentPreviewHashes: input.currentPreviewHashes ?? currentPreviewHashesFor(requests),
    activeLocks: input.status.locks
      .filter((lock) => lock.state === "active")
      .map((lock) => ({
        lockId: lock.lockId,
        category: lock.kind,
        message: lock.reason,
        relatedRefs: lock.relatedEventIds.map((id) => ({ kind: "event", id })),
        ...(lock.kind === providerByteTransferClass ? { appliesToApprovalClasses: [providerByteTransferClass] } : {})
      }))
  }), reviewInputsById);

  const dto = {
    schemaVersion,
    generatedAt,
    summary: {
      pendingCount: queue.pending.length,
      resumableCount: queue.resumable.length,
      blockedCount: queue.blocked.length,
      staleCount: queue.stale.length,
      terminalCount: queue.denied.length + queue.completed.length + queue.failed.length
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval,
      forbiddenDirectEffects: [...forbiddenDirectEffects]
    },
    approvalClasses: approvalClassMetadata(),
    queue,
    forbiddenDirectEffects: [...forbiddenDirectEffects]
  } satisfies AgentApprovalCockpitDto;

  return deepFreeze(agentApprovalCockpitDtoSchema.parse(dto));
}

function projectRequestForQueue(
  request: AgentStatusDto["toolRequests"][number],
  taskId: string | undefined
): AgentApprovalQueueRequestDto {
  assertAgentSecretSafeText(request.scope, "approval cockpit request scope");
  assertAgentSecretSafeText(request.estimatedEffect, "approval cockpit request estimatedEffect");

  return Object.freeze({
    toolRequestId: request.toolRequestId,
    runId: request.runId,
    taskId: taskId ?? request.runId,
    toolId: request.toolId,
    toolVersion: request.toolVersion,
    sideEffectClass: request.sideEffectClass,
    requiredApprovalClass: normalizeApprovalClass(request.requiredApprovalClass),
    previewHash: request.previewHash,
    previewSummary: request.estimatedEffect,
    affectedRefs: freezeAffectedRefs([
      ...request.sourceEventIds.map((id) => ({ kind: "event", id })),
      ...request.inputArtifactHashes.map((hash) => ({ kind: "artifact", id: hash, hash }))
    ]),
    contextPackRefs: Object.freeze([]),
    requestedAt: request.requestedAt,
    state: request.state
  });
}

function projectApprovalForQueue(request: AgentStatusDto["toolRequests"][number]) {
  if (request.state !== "approved" || request.approvedBy === undefined || request.approvedPreviewHash === undefined || request.approvedAt === undefined || request.approvalRationale === undefined) {
    return [];
  }

  return [Object.freeze({
    toolRequestId: request.toolRequestId,
    approvedBy: request.approvedBy,
    approvedPreviewHash: request.approvedPreviewHash,
    approvedAt: request.approvedAt,
    rationale: request.approvalRationale,
    ...(request.approvalClass === undefined ? {} : { approvalClass: normalizeApprovalClass(request.approvalClass) })
  })];
}

function projectDenialForQueue(request: AgentStatusDto["toolRequests"][number]) {
  if (request.state !== "denied" || request.deniedBy === undefined || request.denialRationale === undefined || request.deniedAt === undefined) {
    return [];
  }

  return [Object.freeze({
    toolRequestId: request.toolRequestId,
    deniedBy: request.deniedBy,
    deniedAt: request.deniedAt,
    rationale: request.denialRationale,
    ...(request.approvalClass === undefined ? {} : { approvalClass: normalizeApprovalClass(request.approvalClass) })
  })];
}

function projectCompletionForQueue(request: AgentStatusDto["toolRequests"][number]) {
  if (request.state !== "completed" || request.completedAt === undefined) {
    return [];
  }

  return [Object.freeze({
    toolRequestId: request.toolRequestId,
    completedAt: request.completedAt,
    ...(request.resultSummary === undefined ? {} : { resultSummary: request.resultSummary }),
    eventIds: Object.freeze([...request.resultEventIds]),
    artifactHashes: Object.freeze([...request.artifactHashes]),
    readModelChanges: Object.freeze(request.readModelChanges.map((change) => change.change))
  })];
}

function projectFailureForQueue(request: AgentStatusDto["toolRequests"][number]) {
  if (
    request.state !== "failed" ||
    request.failedAt === undefined ||
    request.failureCategory === undefined ||
    request.failureMessage === undefined ||
    request.retryable === undefined
  ) {
    return [];
  }

  return [Object.freeze({
    toolRequestId: request.toolRequestId,
    failedAt: request.failedAt,
    category: request.failureCategory,
    message: request.failureMessage,
    retryable: request.retryable,
    allowedActions: Object.freeze([...request.allowedActions])
  })];
}

function currentPreviewHashesFor(requests: readonly AgentApprovalQueueRequestDto[]): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(requests.map((request) => [request.toolRequestId, request.previewHash])));
}

function enrichQueue(
  queue: AgentApprovalQueueOutput,
  reviewInputsById: ReadonlyMap<string, ReviewInput>
): AgentApprovalCockpitQueueDto {
  return deepFreeze({
    generatedAt: queue.generatedAt,
    pending: queue.pending.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    resumable: queue.resumable.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    blocked: queue.blocked.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    stale: queue.stale.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    denied: queue.denied.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    completed: queue.completed.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId))),
    failed: queue.failed.map((item) => enrichQueueItem(item, reviewInputsById.get(item.toolRequestId)))
  });
}

function enrichQueueItem(
  item: AgentApprovalQueueItemDto,
  reviewInput: ReviewInput | undefined
): AgentApprovalCockpitItemDto {
  const staleness = item.stale
    ? {
        state: "stale" as const,
        approvable: false,
        ...(item.currentPreviewHash === undefined ? {} : { currentPreviewHash: item.currentPreviewHash }),
        guidance: "Preview changed or is missing. Rebuild the preview and revalidate the exact preview hash before any approval."
      }
    : {
        state: "current" as const,
        approvable: item.blockingReasons.length === 0,
        ...(item.currentPreviewHash === undefined ? {} : { currentPreviewHash: item.currentPreviewHash })
      };

  const safeReviewInput = reviewInput ?? {
    what: item.previewSummary,
    why: `Agent requested ${item.toolId} during run ${item.runId}.`,
    dataLeavesOrChanges: item.previewSummary,
    evidenceRefs: Object.freeze([]),
    artifactRefs: Object.freeze([])
  };

  const review = {
    what: safeReviewInput.what,
    why: safeReviewInput.why,
    dataLeavesOrChanges: safeReviewInput.dataLeavesOrChanges,
    evidenceRefs: safeReviewInput.evidenceRefs,
    artifactRefs: safeReviewInput.artifactRefs,
    riskAndLockStatus: describeRiskAndLockStatus(item),
    whatHappensAfterApproval: afterApproval,
    staleOrUnsafePrevention: staleOrUnsafePrevention(item)
  };

  return deepFreeze({
    ...item,
    requiredApprovalClass: item.approvalClass,
    ...(item.approvalClass === providerByteTransferClass
      ? { providerByteTransferNote: "Approval itself does not transfer bytes; it records a human decision only." }
      : {}),
    staleness,
    approvalContract: {
      requiredApprovalClass: item.approvalClass,
      approvalRouteAppendsOnly: true,
      denialRouteAppendsOnly: true,
      rationaleRequired: true,
      rationaleSecretSafe: true,
      afterApproval
    },
    review
  });
}

function approvalClassMetadata() {
  return deepFreeze(agentApprovalQueueClassValues.map((approvalClass) => ({
    approvalClass,
    label: approvalClassLabel(approvalClass),
    requiredFor: approvalClassRequiredFor(approvalClass),
    ...(approvalClass === providerByteTransferClass
      ? { providerByteTransferNote: "Provider byte transfer requires exact-preview human approval before any byte transfer work may resume." }
      : {}),
    rationale: {
      required: true as const,
      secretSafe: true as const
    }
  })));
}

function approvalClassLabel(approvalClass: typeof agentApprovalQueueClassValues[number]): string {
  switch (approvalClass) {
    case "provider-byte-transfer":
      return "Provider byte transfer";
    case "prr-send-followup":
      return "PRR send follow-up";
    case "legal-escalation":
      return "Legal escalation";
    case "export-publication":
      return "Export or publication";
    case "destructive-repair":
      return "Destructive repair";
    case "accepted-graph-review":
      return "Accepted graph review";
    case "ledger-review":
      return "Ledger review";
  }
}

function approvalClassRequiredFor(approvalClass: typeof agentApprovalQueueClassValues[number]): string {
  switch (approvalClass) {
    case "provider-byte-transfer":
      return "Transfers selected workspace bytes to a configured provider.";
    case "prr-send-followup":
      return "Sends PRR correspondence outside the workspace.";
    case "legal-escalation":
      return "Escalates a matter into a legal review lane.";
    case "export-publication":
      return "Exports or publishes sensitive workspace material.";
    case "destructive-repair":
      return "Runs a repair that can change or remove local workspace state.";
    case "accepted-graph-review":
      return "Applies accepted graph review decisions to shared ontology state.";
    case "ledger-review":
      return "Commits ledger review actions that require explicit human judgment.";
  }
}

function describeRiskAndLockStatus(item: AgentApprovalQueueItemDto): string {
  if (item.blockingReasons.includes("approval-stale")) {
    return "Blocked because the current preview hash is stale or missing.";
  }
  if (item.blockingReasons.includes("lock-active")) {
    return "Blocked because an active lock currently prevents approval.";
  }
  if (item.blockingReasons.includes("approval-class-mismatch")) {
    return "Blocked because the stored approval class does not match the current request.";
  }
  return "Current preview hash matches and no active lock blocks this review.";
}

function staleOrUnsafePrevention(item: AgentApprovalQueueItemDto): readonly string[] {
  const checks = [
    "Approval binds the exact preview hash.",
    "Approval and denial append decision events only.",
    "A later scheduler must revalidate locks, preview hash, and runtime safety before any work resumes."
  ];

  if (item.blockingReasons.includes("approval-stale")) {
    checks.push("Stale requests stay non-approvable until a fresh preview is built.");
  }
  if (item.blockingReasons.includes("lock-active")) {
    checks.push("Active locks keep requests blocked even when the preview hash is current.");
  }

  return Object.freeze(checks);
}

function freezeAffectedRefs(refs: readonly AgentAffectedRefDto[]): readonly AgentAffectedRefDto[] {
  return Object.freeze(refs.map((ref) => Object.freeze({ ...ref })));
}

function normalizeApprovalClass(
  value: string
): AgentApprovalQueueInputApprovalClass {
  switch (value) {
    case "external-message-send":
    case "export-or-publication":
    case "destructive-or-repair":
    case "provider-byte-transfer":
    case "prr-send-followup":
    case "legal-escalation":
    case "export-publication":
    case "destructive-repair":
    case "accepted-graph-review":
    case "ledger-review":
      return value;
    case "none":
    case "human-review":
      throw new Error(`Unsupported approval class for cockpit queue: ${value}`);
    default:
      throw new Error(`Unsupported approval class for cockpit queue: ${value}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const nested of Object.values(record)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }

  return value;
}
