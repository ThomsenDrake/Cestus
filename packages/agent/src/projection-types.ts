export type AgentTaskStatus =
  | "queued"
  | "running"
  | "waiting-for-approval"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type AgentToolRequestState = "requested" | "approved" | "denied" | "completed" | "failed";
export type AgentMemoryState = "active" | "superseded" | "retracted";
export type AgentPermissionState = "granted" | "revoked";
export type AgentLockState = "active" | "cleared";

export type AgentTaskPriority = "low" | "normal" | "high" | "urgent";
export type AgentRunState = "running" | "completed" | "failed";
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
  | "credential-missing"
  | "credential-revoked"
  | "approval-required"
  | "approval-stale"
  | "permission-denied"
  | "secret-detected"
  | "legal-lock-active"
  | "projection-lag"
  | "provenance-missing"
  | "model-output-invalid"
  | "external-effect-failed";

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
}

export interface ProjectedAgentMemory extends ProjectedAgentProvenance {
  readonly memoryId: string;
  readonly residentAgentId: string;
  readonly scope: AgentMemoryScope;
  readonly summary: string;
  readonly sourceEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt?: string | undefined;
  readonly state: AgentMemoryState;
  readonly supersededByMemoryId?: string | undefined;
  readonly supersededBy?: string | undefined;
  readonly supersededAt?: string | undefined;
  readonly supersessionRationale?: string | undefined;
  readonly retractedBy?: string | undefined;
  readonly retractedAt?: string | undefined;
  readonly retractionRationale?: string | undefined;
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

export interface AgentProjectionDto {
  readonly residentAgentId?: string;
  readonly tasks: readonly ProjectedAgentTask[];
  readonly runs: readonly ProjectedAgentRun[];
  readonly toolRequests: readonly ProjectedAgentToolRequest[];
  readonly activeMemory: readonly ProjectedAgentMemory[];
  readonly permissions: readonly ProjectedAgentPermission[];
  readonly locks: readonly ProjectedAgentLock[];
}
