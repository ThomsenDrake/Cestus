export type AgentTaskStatus =
  | "queued"
  | "running"
  | "waiting-for-approval"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type AgentToolRequestState = "requested" | "approved" | "executing" | "denied" | "completed" | "failed";
export type AgentMemoryState = "active" | "superseded" | "retracted";
export type AgentMemoryEventType = "agent.memory.recorded" | "agent.memory.superseded" | "agent.memory.retracted";
export type AgentPermissionState = "granted" | "revoked";
export type AgentLockState = "active" | "cleared";
export type AgentMemoryKind = "operator-preference" | "agent-observation" | "policy-caveat" | "provider-note";

export type AgentTaskPriority = "low" | "normal" | "high" | "urgent";
export type AgentRunState = "running" | "completed" | "failed";
export type AgentModelInvocationStatus = "requested" | "completed" | "failed";
export type AgentSpecialistFinalOutputStepKind =
  | "audit"
  | "model-review"
  | "tool-request"
  | "local-derivative"
  | "final-output";
export type SpecialistHandoffProjectionState =
  | "no-output"
  | "output-persisted"
  | "handoff-pending"
  | "handoff-recorded"
  | "task-completed"
  | "inconsistent";
export type TaskOrchestratorProjectionState =
  | "queued"
  | "claimed"
  | "approval-suspended"
  | "stale-claim-recoverable"
  | "handoff-pending"
  | "completed"
  | "failed"
  | "canceled"
  | "blocked";
export type AgentSpecialistRunType =
  | "ontology-bootstrap"
  | "prr-negotiation"
  | "evidence-triage"
  | "timeline-builder"
  | "contradiction-finder"
  | "investigation-planner"
  | "report-builder";
export type AgentMemoryScope = "workspace" | "investigation" | "task" | "provider" | "policy";
export type AgentToolSideEffectClass =
  | "read-only"
  | "local-derivative"
  | "ledger-proposal"
  | "ledger-review"
  | "external-byte-transfer"
  | "external-message-send"
  | "export-or-publication"
  | "destructive-or-repair"
  | "legal-escalation";
export type AgentToolApprovalClass =
  | "none"
  | "human-review"
  | "provider-byte-transfer"
  | "external-message-send"
  | "export-or-publication"
  | "destructive-or-repair"
  | "legal-escalation"
  | "ledger-review";
export type AgentLockKind = "legal-escalation" | "export" | "secret" | "governance" | "data-loss" | "provider-byte-transfer";
export type AgentFailureCategory =
  | "provider-unavailable"
  | "provider-rate-limited"
  | "credential-missing"
  | "credential-revoked"
  | "approval-required"
  | "approval-denied"
  | "approval-stale"
  | "permission-denied"
  | "secret-detected"
  | "legal-lock-active"
  | "lock-active"
  | "projection-lag"
  | "context-budget-exceeded"
  | "missing-provenance"
  | "provenance-missing"
  | "model-output-invalid"
  | "domain-gate-failed"
  | "stale-source"
  | "external-effect-failed"
  | "data-loss-risk";

export interface ProjectedAgentProvenance {
  readonly eventIds: readonly string[];
  readonly causationIds: readonly string[];
}

export interface ProjectedAgentTask extends ProjectedAgentProvenance {
  readonly taskId: string;
  readonly residentAgentId: string;
  readonly title: string;
  readonly requestedBy: string;
  readonly priority: AgentTaskPriority;
  readonly status: AgentTaskStatus;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;
  readonly description?: string | undefined;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly changedBy?: string | undefined;
  readonly statusReason?: string | undefined;
  readonly runId?: string | undefined;
}

export interface ProjectedAgentRun extends ProjectedAgentProvenance {
  readonly runId: string;
  readonly residentAgentId: string;
  readonly runType: AgentSpecialistRunType;
  readonly state: AgentRunState;
  readonly startedBy: string;
  readonly startedAt: string;
  readonly taskId?: string | undefined;
  readonly workspaceId?: string | undefined;
  readonly investigationId?: string | undefined;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly outputArtifactHashes: readonly string[];
  readonly stepIds: readonly string[];
  readonly invocationIds: readonly string[];
  readonly toolRequestIds: readonly string[];
  readonly completedAt?: string | undefined;
  readonly failedAt?: string | undefined;
  readonly failureCategory?: AgentFailureCategory | undefined;
  readonly failureMessage?: string | undefined;
  readonly retryable?: boolean | undefined;
  readonly allowedActions: readonly string[];
  readonly summary?: string | undefined;
}

export interface ProjectedAgentReadModelChange {
  readonly projectionName: string;
  readonly change: string;
  readonly relatedIds?: readonly string[] | undefined;
}

export interface ProjectedAgentContextPackScope {
  readonly kind: string;
  readonly id: string;
}

export interface ProjectedAgentContextPackStalenessInput {
  readonly kind: string;
  readonly ref: string;
  readonly value: string;
}

export interface ProjectedAgentContextPackRef {
  readonly contextPackId: string;
  readonly version: number;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly generatedAt: string;
  readonly safeSummary: string;
  readonly provenanceRefs: readonly string[];
  readonly projectionHighWaterMark?: number | undefined;
  readonly sourceEventIds?: readonly string[] | undefined;
  readonly artifactHashes?: readonly string[] | undefined;
  readonly policyVersion?: string | undefined;
  readonly scope?: ProjectedAgentContextPackScope | undefined;
  readonly sizeBudgetBytes?: number | undefined;
  readonly stalenessInputs?: readonly ProjectedAgentContextPackStalenessInput[] | undefined;
}

export interface ProjectedAgentPromptArtifactOmission {
  readonly reason: string;
  readonly sourceRef: string;
  readonly safeSummary: string;
}

export interface ProjectedAgentModelInvocationUsage {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
}

export interface ProjectedAgentProductionContextRequirement {
  readonly contextPackId: string;
  readonly requirementMode: "always" | "when-scope-associated-prr";
  readonly status: "applicable" | "not-applicable";
  readonly contentHash?: string | undefined;
  readonly omissionReason?: "no-associated-prr" | undefined;
}

export interface ProjectedAgentResolvedPayloadAudit {
  readonly contextPackId: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly schemaId: string;
}

export interface ProjectedAgentProductionPromptAuditBase {
  readonly rendererId: string;
  readonly rendererVersion: number;
  readonly rendererHash: string;
  readonly renderedPromptHash: string;
  readonly providerOutputSchemaId: string;
  readonly providerOutputSchemaVersion: number;
  readonly handoffSchemaId: string;
  readonly handoffSchemaVersion: number;
  readonly scopeApplicabilityHash: string;
  readonly evaluatedContextRequirements: readonly ProjectedAgentProductionContextRequirement[];
  readonly resolvedPayloadAudits: readonly ProjectedAgentResolvedPayloadAudit[];
}

export interface ProjectedAgentProductionPromptAuditV1 extends ProjectedAgentProductionPromptAuditBase {
  readonly schemaVersion: "agent-production-prompt-binding.v1";
}

export interface ProjectedAgentProductionPromptProviderPostureV2 {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityIds: readonly string[];
  readonly selectionPolicyVersion: string;
  readonly readinessState: "ready";
  readonly approvalRequirementId: string;
}

export interface ProjectedAgentProductionPromptExactRunBindingV2 {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runId: string;
  readonly runType: Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workflowDescriptorHash: string;
  readonly policyVersion: string;
  readonly providerPosture: ProjectedAgentProductionPromptProviderPostureV2;
}

export interface ProjectedAgentProductionPromptAuditV2 extends ProjectedAgentProductionPromptAuditBase {
  readonly schemaVersion: "agent-production-prompt-binding.v2";
  readonly sourceApprovedPromptArtifactHash: string;
  readonly exactRunBinding: ProjectedAgentProductionPromptExactRunBindingV2;
  readonly providerPostureHash: string;
  readonly exactRunBindingHash: string;
}

export type ProjectedAgentProductionPromptAudit =
  | ProjectedAgentProductionPromptAuditV1
  | ProjectedAgentProductionPromptAuditV2;

export interface ProjectedAgentModelInvocation extends ProjectedAgentProvenance {
  readonly invocationId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly inputArtifactHash: string;
  readonly safetyClass: "workspace-safe" | "public-safe" | "sensitive-local-only" | "provider-approved";
  readonly status: AgentModelInvocationStatus;
  readonly requestedAt: string;
  readonly credentialRefId?: string | undefined;
  readonly credentialKind?: string | undefined;
  readonly contextPackRefs: readonly ProjectedAgentContextPackRef[];
  readonly promptTemplateId?: string | undefined;
  readonly promptTemplateVersion?: number | undefined;
  readonly runType?: AgentSpecialistRunType | undefined;
  readonly safePromptSummary?: string | undefined;
  readonly omissions: readonly ProjectedAgentPromptArtifactOmission[];
  readonly transferApprovalClass?: "none" | "provider-byte-transfer" | undefined;
  readonly production?: ProjectedAgentProductionPromptAudit | undefined;
  readonly providerOutputArtifactHash?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly usage?: ProjectedAgentModelInvocationUsage | undefined;
  readonly failureCategory?: AgentFailureCategory | undefined;
  readonly failureMessage?: string | undefined;
  readonly retryable?: boolean | undefined;
  readonly allowedActions: readonly string[];
}

export interface ProjectedAgentToolRequest extends ProjectedAgentProvenance {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly requestedBy: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly previewHash: string;
  readonly scope: string;
  readonly estimatedEffect: string;
  readonly state: AgentToolRequestState;
  readonly requestedAt: string;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly approvedBy?: string | undefined;
  readonly approvedPreviewHash?: string | undefined;
  readonly approvalClass?: AgentToolApprovalClass | undefined;
  readonly approvalRationale?: string | undefined;
  readonly approvedAt?: string | undefined;
  readonly executionClaimedBy?: string | undefined;
  readonly executionClaimedAt?: string | undefined;
  readonly executionLeaseExpiresAt?: string | undefined;
  readonly executionApprovedPreviewHash?: string | undefined;
  readonly executionClaimEventId?: string | undefined;
  readonly deniedBy?: string | undefined;
  readonly denialRationale?: string | undefined;
  readonly deniedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly resultEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly readModelChanges: readonly ProjectedAgentReadModelChange[];
  readonly resultSummary?: string | undefined;
  readonly failedAt?: string | undefined;
  readonly failureCategory?: AgentFailureCategory | undefined;
  readonly failureMessage?: string | undefined;
  readonly retryable?: boolean | undefined;
  readonly allowedActions: readonly string[];
  /** Opaque, path-free proof that the exact durable boundary binding was validated during projection. */
  readonly residentSourceBoundaryReview?: {
    readonly schemaVersion: "resident-source-boundary-review.v1";
    readonly requestEventId: string;
  } | undefined;
}

export interface ProjectedAgentMemory extends ProjectedAgentProvenance {
  readonly memoryId: string;
  readonly residentAgentId: string;
  readonly scope: AgentMemoryScope;
  readonly memoryKind: AgentMemoryKind;
  readonly summary: string;
  readonly recordedBy: string;
  readonly recordedByKind: "human" | "agent" | "extractor" | "system";
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt?: string | undefined;
  readonly state: AgentMemoryState;
  readonly memoryHistoryEntries: readonly ProjectedAgentMemoryHistoryEntry[];
  readonly supersededByMemoryId?: string | undefined;
  readonly supersededBy?: string | undefined;
  readonly supersededAt?: string | undefined;
  readonly supersessionRationale?: string | undefined;
  readonly retractedBy?: string | undefined;
  readonly retractedAt?: string | undefined;
  readonly retractionRationale?: string | undefined;
}

export interface ProjectedAgentMemoryHistoryEntry {
  readonly eventId: string;
  readonly eventType: AgentMemoryEventType;
  readonly occurredAt: string;
}

export interface ProjectedAgentPermission extends ProjectedAgentProvenance {
  readonly permissionId: string;
  readonly residentAgentId: string;
  readonly grantedBy: string;
  readonly scope: string;
  readonly sideEffectClasses: readonly AgentToolSideEffectClass[];
  readonly rationale: string;
  readonly grantedAt: string;
  readonly expiresAt?: string | undefined;
  readonly state: AgentPermissionState;
  readonly revokedBy?: string | undefined;
  readonly revokedAt?: string | undefined;
  readonly revocationRationale?: string | undefined;
}

export interface ProjectedAgentLock extends ProjectedAgentProvenance {
  readonly lockId: string;
  readonly residentAgentId: string;
  readonly kind: AgentLockKind;
  readonly activatedBy: string;
  readonly reason: string;
  readonly activatedAt: string;
  readonly relatedEventIds: readonly string[];
  readonly state: AgentLockState;
  readonly clearedBy?: string | undefined;
  readonly clearedAt?: string | undefined;
  readonly clearRationale?: string | undefined;
  readonly clearRelatedEventIds: readonly string[];
}

export interface TaskOrchestratorLeaseProjection {
  readonly claimEventId: string;
  readonly leaseClaimGeneration: number;
  readonly workerId: string;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
  readonly expired: boolean;
}

export interface TaskOrchestratorSuspendedCheckpointProjection {
  readonly checkpointEventId: string;
  readonly checkpointKind: string;
  readonly checkpointedAt: string;
  readonly releaseEventId?: string | undefined;
  readonly runId?: string | undefined;
  readonly toolRequestIds: readonly string[];
  readonly safeNextActions: readonly string[];
}

export interface TaskOrchestratorHandoffReadbackProjection {
  readonly handoffId: string;
  readonly handoffManifestHash: string;
  readonly handoffRecordedEventId: string;
  readonly verifiedAt: string;
}

export interface TaskOrchestratorPromptBindingReceiptProjection {
  readonly checkpointEventId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly sourceApprovedPromptArtifactHash: string;
  readonly boundPromptArtifactHash: string;
  readonly approvalEventId: string;
  readonly providerPostureHash: string;
  readonly exactRunBindingHash: string;
  readonly receiptHash: string;
}

export interface TaskOrchestratorLatestCheckpointProjection {
  readonly checkpointEventId: string;
  readonly checkpointKind: string;
  readonly attemptId: string;
  readonly runId?: string | undefined;
}

export interface TaskOrchestratorAttemptProjection extends ProjectedAgentProvenance {
  readonly attemptKey: string;
  readonly taskId: string;
  readonly runType: AgentSpecialistRunType;
  readonly attemptId: string;
  readonly retryGeneration: number;
  readonly state: TaskOrchestratorProjectionState;
  readonly recoverable: boolean;
  readonly leaseClaimGeneration?: number | undefined;
  readonly runId?: string | undefined;
  readonly activeLease?: TaskOrchestratorLeaseProjection | undefined;
  readonly suspendedCheckpoint?: TaskOrchestratorSuspendedCheckpointProjection | undefined;
  readonly finalOutputStepEventId?: string | undefined;
  readonly handoffPreparedEventId?: string | undefined;
  readonly handoffRecordedEventId?: string | undefined;
  readonly handoffReadback?: TaskOrchestratorHandoffReadbackProjection | undefined;
  /** Latest checkpoint state is distinct from the retained prompt-bound audit receipt. */
  readonly latestCheckpoint?: TaskOrchestratorLatestCheckpointProjection | undefined;
  /** Task/hash/event/attempt/run audit reference; it does not grant provider authority. */
  readonly latestPromptBindingReceipt?: TaskOrchestratorPromptBindingReceiptProjection | undefined;
  readonly specialistRunCompletedEventId?: string | undefined;
  readonly orchestrationCompletedEventId?: string | undefined;
  readonly orchestrationFailedEventId?: string | undefined;
  readonly diagnosticReason?: string | undefined;
}

export interface ProjectedTaskOrchestratorTask extends ProjectedAgentProvenance {
  readonly taskId: string;
  readonly taskStatus: AgentTaskStatus;
  readonly state: TaskOrchestratorProjectionState;
  readonly statusEventId: string;
  readonly statusChangedAt: string;
  readonly activeAttemptKey?: string | undefined;
  readonly runId?: string | undefined;
  readonly diagnosticReason?: string | undefined;
}

export interface TaskOrchestratorProjectionDto {
  readonly tasks: readonly ProjectedTaskOrchestratorTask[];
  readonly attempts: readonly TaskOrchestratorAttemptProjection[];
}

export interface AgentProjectionDto {
  readonly residentAgentId?: string;
  readonly tasks: readonly ProjectedAgentTask[];
  readonly taskOrchestrator?: TaskOrchestratorProjectionDto | undefined;
  readonly runs: readonly ProjectedAgentRun[];
  readonly modelInvocations?: readonly ProjectedAgentModelInvocation[];
  readonly toolRequests: readonly ProjectedAgentToolRequest[];
  readonly activeMemory: readonly ProjectedAgentMemory[];
  readonly permissions: readonly ProjectedAgentPermission[];
  readonly locks: readonly ProjectedAgentLock[];
}
