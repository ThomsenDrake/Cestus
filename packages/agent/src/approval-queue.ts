import type { ContextPackRef } from "./context-packs.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export const agentApprovalQueueClassValues = [
  "provider-byte-transfer",
  "prr-send-followup",
  "legal-escalation",
  "export-publication",
  "destructive-repair",
  "accepted-graph-review",
  "ledger-review",
  "human-review"
] as const;

export const agentApprovalQueueLegacyApprovalClassAliases = [
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair"
] as const;

export type AgentApprovalQueueDefaultApprovalClass = typeof agentApprovalQueueClassValues[number];
export type AgentApprovalQueueLegacyApprovalClassAlias =
  typeof agentApprovalQueueLegacyApprovalClassAliases[number];
export type AgentApprovalQueueApprovalClass = string;
export type AgentApprovalQueueInputApprovalClass = string;

const forbiddenSentinelApprovalClasses = new Set<AgentApprovalQueueInputApprovalClass>([
  "none"
]);

export interface AgentAffectedRefDto {
  readonly kind: string;
  readonly id: string;
  readonly hash?: string;
  readonly label?: string;
}

export interface AgentActiveLockDto {
  readonly lockId: string;
  readonly category: string;
  readonly message: string;
  readonly relatedRefs?: readonly AgentAffectedRefDto[];
  readonly appliesToToolRequestIds?: readonly string[];
  readonly appliesToApprovalClasses?: readonly AgentApprovalQueueInputApprovalClass[];
}

export interface AgentApprovalQueueRequestDto {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly toolVersion: number | string;
  readonly sideEffectClass: string;
  readonly requiredApprovalClass: AgentApprovalQueueInputApprovalClass;
  readonly previewHash: string;
  readonly previewSummary: string;
  readonly affectedRefs: readonly AgentAffectedRefDto[];
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly requestedAt: string;
  readonly state: string;
}

export interface AgentToolApprovalDto {
  readonly toolRequestId: string;
  readonly approvedBy: string;
  readonly approvedPreviewHash: string;
  readonly approvedAt: string;
  readonly rationale: string;
  readonly approvalClass?: AgentApprovalQueueInputApprovalClass;
}

export interface AgentToolDenialDto {
  readonly toolRequestId: string;
  readonly deniedBy: string;
  readonly deniedAt: string;
  readonly rationale: string;
  readonly approvalClass?: AgentApprovalQueueInputApprovalClass;
}

export interface AgentToolCompletionDto {
  readonly toolRequestId: string;
  readonly completedAt: string;
  readonly resultSummary?: string;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly readModelChanges: readonly string[];
}

export interface AgentToolFailureDto {
  readonly toolRequestId: string;
  readonly failedAt: string;
  readonly category: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

export interface AgentApprovalRiskDto {
  readonly sideEffectClass: string;
  readonly approvalClass: AgentApprovalQueueApprovalClass;
  readonly previewSummary: string;
  readonly affectedRefs: readonly AgentAffectedRefDto[];
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly activeLocks: readonly AgentActiveLockDto[];
  readonly blockingReasons: readonly string[];
}

export interface AgentApprovalQueueItemDto {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly toolId: string;
  readonly toolVersion: number | string;
  readonly sideEffectClass: string;
  readonly approvalClass: AgentApprovalQueueApprovalClass;
  readonly previewHash: string;
  readonly currentPreviewHash?: string;
  readonly previewSummary: string;
  readonly requestedAt: string;
  readonly stale: boolean;
  readonly executableByApproval: false;
  readonly affectedRefs: readonly AgentAffectedRefDto[];
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly activeLocks: readonly AgentActiveLockDto[];
  readonly blockingReasons: readonly string[];
  readonly risk: AgentApprovalRiskDto;
  readonly approval?: AgentToolApprovalDto;
  readonly denial?: AgentToolDenialDto;
  readonly completion?: AgentToolCompletionDto;
  readonly failure?: AgentToolFailureDto;
}

export interface AgentApprovalQueueInput {
  readonly now: string;
  readonly requests: readonly AgentApprovalQueueRequestDto[];
  readonly approvals: readonly AgentToolApprovalDto[];
  readonly denials: readonly AgentToolDenialDto[];
  readonly completed: readonly AgentToolCompletionDto[];
  readonly failures: readonly AgentToolFailureDto[];
  readonly currentPreviewHashes: Readonly<Record<string, string>>;
  readonly activeLocks: readonly AgentActiveLockDto[];
}

export interface AgentApprovalQueueOutput {
  readonly generatedAt: string;
  readonly pending: readonly AgentApprovalQueueItemDto[];
  readonly resumable: readonly AgentApprovalQueueItemDto[];
  readonly blocked: readonly AgentApprovalQueueItemDto[];
  readonly stale: readonly AgentApprovalQueueItemDto[];
  readonly denied: readonly AgentApprovalQueueItemDto[];
  readonly completed: readonly AgentApprovalQueueItemDto[];
  readonly failed: readonly AgentApprovalQueueItemDto[];
}

type NormalizedAgentActiveLockDto = Omit<AgentActiveLockDto, "appliesToApprovalClasses" | "relatedRefs"> & {
  readonly relatedRefs?: readonly AgentAffectedRefDto[];
  readonly appliesToApprovalClasses?: readonly AgentApprovalQueueApprovalClass[];
};

type NormalizedAgentApprovalQueueRequestDto = Omit<AgentApprovalQueueRequestDto, "requiredApprovalClass" | "affectedRefs" | "contextPackRefs"> & {
  readonly requiredApprovalClass: AgentApprovalQueueApprovalClass;
  readonly affectedRefs: readonly AgentAffectedRefDto[];
  readonly contextPackRefs: readonly ContextPackRef[];
};

type NormalizedAgentToolApprovalDto = Omit<AgentToolApprovalDto, "approvalClass"> & {
  readonly approvalClass?: AgentApprovalQueueApprovalClass;
};

type NormalizedAgentToolDenialDto = Omit<AgentToolDenialDto, "approvalClass"> & {
  readonly approvalClass?: AgentApprovalQueueApprovalClass;
};

export function buildAgentApprovalQueue(input: AgentApprovalQueueInput): AgentApprovalQueueOutput {
  assertAgentSecretSafeText(input.now, "approval queue generatedAt");
  assertSafeCurrentPreviewHashes(input.currentPreviewHashes);

  const approvalsByRequest = lastByToolRequestId(input.approvals.map(freezeApproval));
  const denialsByRequest = lastByToolRequestId(input.denials.map(freezeDenial));
  const completionsByRequest = lastByToolRequestId(input.completed.map(freezeCompletion));
  const failuresByRequest = lastByToolRequestId(input.failures.map(freezeFailure));
  const activeLocks = freezeActiveLocks(input.activeLocks);

  const pending: AgentApprovalQueueItemDto[] = [];
  const resumable: AgentApprovalQueueItemDto[] = [];
  const blocked: AgentApprovalQueueItemDto[] = [];
  const stale: AgentApprovalQueueItemDto[] = [];
  const denied: AgentApprovalQueueItemDto[] = [];
  const completed: AgentApprovalQueueItemDto[] = [];
  const failed: AgentApprovalQueueItemDto[] = [];

  for (const request of input.requests) {
    const normalizedRequest = freezeRequest(request);
    const approval = approvalsByRequest.get(normalizedRequest.toolRequestId);
    const denial = denialsByRequest.get(normalizedRequest.toolRequestId);
    const completion = completionsByRequest.get(normalizedRequest.toolRequestId);
    const failure = failuresByRequest.get(normalizedRequest.toolRequestId);
    const applicableLocks = locksForRequest(normalizedRequest, activeLocks);
    const currentPreviewHash = input.currentPreviewHashes[normalizedRequest.toolRequestId];

    if (completion !== undefined) {
      completed.push(buildQueueItem(normalizedRequest, currentPreviewHash, applicableLocks, [], {
        ...(approval === undefined ? {} : { approval }),
        completion
      }));
      continue;
    }

    if (failure !== undefined) {
      failed.push(buildQueueItem(normalizedRequest, currentPreviewHash, applicableLocks, [], {
        ...(approval === undefined ? {} : { approval }),
        failure
      }));
      continue;
    }

    if (denial !== undefined) {
      denied.push(buildQueueItem(normalizedRequest, currentPreviewHash, applicableLocks, [], {
        ...(approval === undefined ? {} : { approval }),
        denial
      }));
      continue;
    }

    if (approval === undefined) {
      const blockingReasons = blockingReasonsForRequestedItem(normalizedRequest, currentPreviewHash, applicableLocks);
      const item = buildQueueItem(normalizedRequest, currentPreviewHash, applicableLocks, blockingReasons, {});
      if (blockingReasons.includes("approval-stale")) {
        stale.push(item);
      } else if (blockingReasons.length > 0) {
        blocked.push(item);
      } else {
        pending.push(item);
      }
      continue;
    }

    const blockingReasons = blockingReasonsForApprovedRequest(normalizedRequest, approval, currentPreviewHash, applicableLocks);
    const item = buildQueueItem(normalizedRequest, currentPreviewHash, applicableLocks, blockingReasons, { approval });

    if (blockingReasons.includes("approval-stale")) {
      stale.push(item);
    } else if (blockingReasons.length > 0) {
      blocked.push(item);
    } else {
      resumable.push(item);
    }
  }

  return Object.freeze({
    generatedAt: input.now,
    pending: Object.freeze(pending),
    resumable: Object.freeze(resumable),
    blocked: Object.freeze(blocked),
    stale: Object.freeze(stale),
    denied: Object.freeze(denied),
    completed: Object.freeze(completed),
    failed: Object.freeze(failed)
  });
}

function blockingReasonsForApprovedRequest(
  request: NormalizedAgentApprovalQueueRequestDto,
  approval: NormalizedAgentToolApprovalDto,
  currentPreviewHash: string | undefined,
  locks: readonly NormalizedAgentActiveLockDto[]
): readonly string[] {
  const reasons: string[] = [];
  if (
    currentPreviewHash === undefined ||
    currentPreviewHash !== approval.approvedPreviewHash ||
    request.previewHash !== approval.approvedPreviewHash
  ) {
    reasons.push("approval-stale");
  }
  if (locks.length > 0) {
    reasons.push("lock-active");
  }
  if (approval.approvalClass !== undefined && approval.approvalClass !== request.requiredApprovalClass) {
    reasons.push("approval-class-mismatch");
  }

  return Object.freeze(reasons);
}

function blockingReasonsForRequestedItem(
  request: NormalizedAgentApprovalQueueRequestDto,
  currentPreviewHash: string | undefined,
  locks: readonly NormalizedAgentActiveLockDto[]
): readonly string[] {
  const reasons: string[] = [];
  if (currentPreviewHash === undefined || currentPreviewHash !== request.previewHash) {
    reasons.push("approval-stale");
  }
  if (locks.length > 0) {
    reasons.push("lock-active");
  }

  return Object.freeze(reasons);
}

function buildQueueItem(
  request: NormalizedAgentApprovalQueueRequestDto,
  currentPreviewHash: string | undefined,
  activeLocks: readonly NormalizedAgentActiveLockDto[],
  blockingReasons: readonly string[],
  related: {
    readonly approval?: NormalizedAgentToolApprovalDto;
    readonly denial?: NormalizedAgentToolDenialDto;
    readonly completion?: AgentToolCompletionDto;
    readonly failure?: AgentToolFailureDto;
  }
): AgentApprovalQueueItemDto {
  const stale = blockingReasons.includes("approval-stale");
  const frozenBlockingReasons = Object.freeze([...blockingReasons]);
  const risk = Object.freeze({
    sideEffectClass: request.sideEffectClass,
    approvalClass: request.requiredApprovalClass,
    previewSummary: request.previewSummary,
    affectedRefs: request.affectedRefs,
    contextPackRefs: request.contextPackRefs,
    activeLocks,
    blockingReasons: frozenBlockingReasons
  });
  const base = {
    toolRequestId: request.toolRequestId,
    runId: request.runId,
    taskId: request.taskId,
    toolId: request.toolId,
    toolVersion: request.toolVersion,
    sideEffectClass: request.sideEffectClass,
    approvalClass: request.requiredApprovalClass,
    previewHash: request.previewHash,
    previewSummary: request.previewSummary,
    requestedAt: request.requestedAt,
    stale,
    executableByApproval: false as const,
    affectedRefs: request.affectedRefs,
    contextPackRefs: request.contextPackRefs,
    activeLocks,
    blockingReasons: frozenBlockingReasons,
    risk,
    ...(currentPreviewHash === undefined ? {} : { currentPreviewHash }),
    ...(related.approval === undefined ? {} : { approval: related.approval }),
    ...(related.denial === undefined ? {} : { denial: related.denial }),
    ...(related.completion === undefined ? {} : { completion: related.completion }),
    ...(related.failure === undefined ? {} : { failure: related.failure })
  };

  return Object.freeze(base);
}

function locksForRequest(
  request: NormalizedAgentApprovalQueueRequestDto,
  locks: readonly NormalizedAgentActiveLockDto[]
): readonly NormalizedAgentActiveLockDto[] {
  return Object.freeze(locks.filter((lock) => {
    const toolRequestIds = lock.appliesToToolRequestIds;
    if (toolRequestIds !== undefined && !toolRequestIds.includes(request.toolRequestId)) {
      return false;
    }

    const approvalClasses = lock.appliesToApprovalClasses;
    if (approvalClasses !== undefined && !approvalClasses.includes(request.requiredApprovalClass)) {
      return false;
    }

    return true;
  }));
}

function lastByToolRequestId<T extends { readonly toolRequestId: string }>(items: readonly T[]): Map<string, T> {
  const byToolRequestId = new Map<string, T>();
  for (const item of items) {
    byToolRequestId.set(item.toolRequestId, item);
  }
  return byToolRequestId;
}

function freezeRequest(request: AgentApprovalQueueRequestDto): NormalizedAgentApprovalQueueRequestDto {
  const requiredApprovalClass = normalizeAgentApprovalClass(request.requiredApprovalClass);
  assertSecretSafeStrings([
    [request.toolRequestId, "toolRequestId"],
    [request.runId, "runId"],
    [request.taskId, "taskId"],
    [request.toolId, "toolId"],
    [String(request.toolVersion), "toolVersion"],
    [request.sideEffectClass, "sideEffectClass"],
    [request.requiredApprovalClass, "requiredApprovalClass"],
    [request.previewHash, "previewHash"],
    [request.previewSummary, "previewSummary"],
    [request.requestedAt, "requestedAt"],
    [request.state, "state"]
  ]);

  return Object.freeze({
    ...request,
    requiredApprovalClass,
    affectedRefs: freezeAffectedRefs(request.affectedRefs),
    contextPackRefs: freezeContextPackRefs(request.contextPackRefs)
  });
}

function freezeAffectedRefs(refs: readonly AgentAffectedRefDto[]): readonly AgentAffectedRefDto[] {
  return Object.freeze(refs.map((ref) => {
    assertSecretSafeStrings([
      [ref.kind, "affected ref kind"],
      [ref.id, "affected ref id"],
      [ref.hash, "affected ref hash"],
      [ref.label, "affected ref label"]
    ]);
    return Object.freeze({
      kind: ref.kind,
      id: ref.id,
      ...(ref.hash === undefined ? {} : { hash: ref.hash }),
      ...(ref.label === undefined ? {} : { label: ref.label })
    });
  }));
}

function freezeActiveLocks(locks: readonly AgentActiveLockDto[]): readonly NormalizedAgentActiveLockDto[] {
  return Object.freeze(locks.map((lock) => {
    assertSecretSafeStrings([
      [lock.lockId, "active lock id"],
      [lock.category, "active lock category"],
      [lock.message, "active lock message"]
    ]);

    return Object.freeze({
      lockId: lock.lockId,
      category: lock.category,
      message: lock.message,
      ...(lock.relatedRefs === undefined ? {} : { relatedRefs: freezeAffectedRefs(lock.relatedRefs) }),
      ...(lock.appliesToToolRequestIds === undefined ? {} : {
        appliesToToolRequestIds: freezeSafeStringArray(lock.appliesToToolRequestIds, "active lock toolRequestId")
      }),
      ...(lock.appliesToApprovalClasses === undefined ? {} : {
        appliesToApprovalClasses: freezeApprovalClasses(lock.appliesToApprovalClasses, "active lock approval class")
      })
    });
  }));
}

function freezeContextPackRefs(refs: readonly ContextPackRef[]): readonly ContextPackRef[] {
  return Object.freeze(refs.map((ref) => {
    assertSecretSafeStrings([
      [ref.contextPackId, "context pack id"],
      [String(ref.version), "context pack version"],
      [ref.contentHash, "context pack hash"],
      [String(ref.sizeBytes), "context pack size"],
      [ref.generatedAt, "context pack generatedAt"],
      [ref.safeSummary, "context pack safeSummary"]
    ]);
    const frozenRef = {
      contextPackId: ref.contextPackId,
      version: ref.version,
      contentHash: ref.contentHash,
      sizeBytes: ref.sizeBytes,
      generatedAt: ref.generatedAt,
      safeSummary: ref.safeSummary,
      provenanceRefs: freezeSafeStringArray(ref.provenanceRefs, "context pack provenance ref")
    };

    if (ref.projectionHighWaterMark !== undefined) {
      return Object.freeze({
        ...frozenRef,
        projectionHighWaterMark: ref.projectionHighWaterMark
      });
    }

    return Object.freeze(frozenRef);
  }));
}

function freezeApproval(approval: AgentToolApprovalDto): NormalizedAgentToolApprovalDto {
  assertSecretSafeStrings([
    [approval.toolRequestId, "approval toolRequestId"],
    [approval.approvedBy, "approvedBy"],
    [approval.approvedPreviewHash, "approvedPreviewHash"],
    [approval.approvedAt, "approvedAt"],
    [approval.rationale, "approval rationale"],
    [approval.approvalClass, "approval class"]
  ]);
  const approvalClass = approval.approvalClass === undefined ? undefined : normalizeAgentApprovalClass(approval.approvalClass);
  return Object.freeze({
    toolRequestId: approval.toolRequestId,
    approvedBy: approval.approvedBy,
    approvedPreviewHash: approval.approvedPreviewHash,
    approvedAt: approval.approvedAt,
    rationale: approval.rationale,
    ...(approvalClass === undefined ? {} : { approvalClass })
  });
}

function freezeDenial(denial: AgentToolDenialDto): NormalizedAgentToolDenialDto {
  assertSecretSafeStrings([
    [denial.toolRequestId, "denial toolRequestId"],
    [denial.deniedBy, "deniedBy"],
    [denial.deniedAt, "deniedAt"],
    [denial.rationale, "denial rationale"],
    [denial.approvalClass, "denial approval class"]
  ]);
  const approvalClass = denial.approvalClass === undefined ? undefined : normalizeAgentApprovalClass(denial.approvalClass);
  return Object.freeze({
    toolRequestId: denial.toolRequestId,
    deniedBy: denial.deniedBy,
    deniedAt: denial.deniedAt,
    rationale: denial.rationale,
    ...(approvalClass === undefined ? {} : { approvalClass })
  });
}

function freezeCompletion(completion: AgentToolCompletionDto): AgentToolCompletionDto {
  assertSecretSafeStrings([
    [completion.toolRequestId, "completion toolRequestId"],
    [completion.completedAt, "completedAt"],
    [completion.resultSummary, "resultSummary"]
  ]);
  return Object.freeze({
    toolRequestId: completion.toolRequestId,
    completedAt: completion.completedAt,
    ...(completion.resultSummary === undefined ? {} : { resultSummary: completion.resultSummary }),
    eventIds: freezeSafeStringArray(completion.eventIds, "completion event id"),
    artifactHashes: freezeSafeStringArray(completion.artifactHashes, "completion artifact hash"),
    readModelChanges: freezeSafeStringArray(completion.readModelChanges, "completion read model change")
  });
}

function freezeFailure(failure: AgentToolFailureDto): AgentToolFailureDto {
  assertSecretSafeStrings([
    [failure.toolRequestId, "failure toolRequestId"],
    [failure.failedAt, "failedAt"],
    [failure.category, "failure category"],
    [failure.message, "failure message"]
  ]);
  return Object.freeze({
    toolRequestId: failure.toolRequestId,
    failedAt: failure.failedAt,
    category: failure.category,
    message: failure.message,
    retryable: failure.retryable,
    allowedActions: freezeSafeStringArray(failure.allowedActions, "failure allowed action")
  });
}

function freezeSafeStringArray(values: readonly string[], label: string): readonly string[] {
  for (const value of values) {
    assertAgentSecretSafeText(value, label);
  }
  return Object.freeze([...values]);
}

function freezeApprovalClasses(
  values: readonly AgentApprovalQueueInputApprovalClass[],
  label: string
): readonly AgentApprovalQueueApprovalClass[] {
  return Object.freeze(values.map((value) => {
    assertAgentSecretSafeText(value, label);
    return normalizeAgentApprovalClass(value);
  }));
}

function normalizeAgentApprovalClass(value: AgentApprovalQueueInputApprovalClass): AgentApprovalQueueApprovalClass {
  assertAgentSecretSafeText(value, "approval class");
  if (forbiddenSentinelApprovalClasses.has(value)) {
    throw new Error(`Unsupported approval class for canonical approval queue: ${value}`);
  }
  switch (value) {
    case "external-message-send":
      return "prr-send-followup";
    case "export-or-publication":
      return "export-publication";
    case "destructive-or-repair":
      return "destructive-repair";
    case "provider-byte-transfer":
    case "prr-send-followup":
    case "legal-escalation":
    case "export-publication":
    case "destructive-repair":
    case "accepted-graph-review":
    case "ledger-review":
      return value;
  }

  return value;
}

function assertSecretSafeStrings(entries: readonly (readonly [string | undefined, string])[]): void {
  for (const [value, label] of entries) {
    if (value !== undefined) {
      assertAgentSecretSafeText(value, label);
    }
  }
}

function assertSafeCurrentPreviewHashes(currentPreviewHashes: Readonly<Record<string, string>>): void {
  for (const [toolRequestId, previewHash] of Object.entries(currentPreviewHashes)) {
    assertAgentSecretSafeText(toolRequestId, "current preview hash toolRequestId");
    assertAgentSecretSafeText(previewHash, "current preview hash");
  }
}
