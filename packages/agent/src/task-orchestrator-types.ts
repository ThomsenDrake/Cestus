import { type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type {
  ContextPackRef,
  ContextPackRegistry,
  VerifiedResolvedContextPack
} from "./context-packs.js";
import type { AgentSpecialistRunType } from "./specialists.js";
import type { SpecialistWorkflowDescriptor } from "./specialist-workflows.js";
import type { ProductionRunScope } from "./production-specialist-registration-metadata.js";
import type {
  ProviderSelectionPolicy,
  ProviderSelectionTask
} from "./provider-selection.js";
import type { ProviderCapabilityRegistry } from "./provider-registry.js";
import type { ProviderReadinessState } from "./provider-readiness.js";
import type { TaskOrchestratorProviderApprovalProof } from "./task-orchestrator-approval.js";

export type TaskOrchestratorRunType = AgentSpecialistRunType;

export interface TaskOrchestratorContextBinding {
  readonly contextPackId: string;
  readonly ref: ContextPackRef;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly schemaId: string;
  readonly provenanceEventIds: readonly string[];
}

export interface TaskOrchestratorInapplicableContextPack {
  readonly contextPackId: string;
  readonly reason: "no-associated-prr";
}

export interface TaskOrchestratorContextDiagnostic {
  readonly contextPackId: string;
  readonly status: "applicable" | "not-applicable";
  readonly reason?: "no-associated-prr" | undefined;
  readonly contentHash?: string | undefined;
}

export interface TaskOrchestratorContextRenderInput {
  readonly taskId: string;
  /** Captured claim identity; renderers must not derive it after an await. */
  readonly attemptId: string;
  /** Captured normalized orchestrator tick time; renderers must not call a clock. */
  readonly generatedAt: string;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly workflow: SpecialistWorkflowDescriptor;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
}

export interface AssembleTaskOrchestratorContextInput {
  readonly taskId: string;
  /** Required when a caller asks this assembly to render a production prompt. */
  readonly attemptId?: string | undefined;
  /** Required when a caller asks this assembly to render a production prompt. */
  readonly generatedAt?: string | undefined;
  readonly runType: TaskOrchestratorRunType;
  readonly scope: ProductionRunScope;
  readonly workflow: SpecialistWorkflowDescriptor;
  readonly contextRegistry: ContextPackRegistry;
  readonly renderPrompt?: (input: TaskOrchestratorContextRenderInput) => unknown | Promise<unknown>;
}

export interface TaskOrchestratorContextAssembly {
  readonly dispatchReady: true;
  readonly resolvedContextPacks: readonly VerifiedResolvedContextPack[];
  readonly applicableContextPackRefs: readonly ContextPackRef[];
  readonly inapplicable: readonly TaskOrchestratorInapplicableContextPack[];
  readonly diagnostics: readonly TaskOrchestratorContextDiagnostic[];
  readonly checkpointContextBindings: readonly TaskOrchestratorContextBinding[];
  readonly cockpitContext: readonly TaskOrchestratorContextBinding[];
  readonly approvalPreview: { readonly contextBindings: readonly TaskOrchestratorContextBinding[] };
  readonly logRecord: { readonly contextBindings: readonly TaskOrchestratorContextBinding[] };
}

export interface TaskOrchestratorProviderPolicy {
  readonly registry: ProviderCapabilityRegistry;
  readonly task: ProviderSelectionTask;
  readonly readinessByProviderId: Readonly<Record<string, ProviderReadinessState>>;
  readonly selectionPolicy: ProviderSelectionPolicy;
  readonly selectionPolicyVersion: string;
  readonly approval: TaskOrchestratorProviderApprovalProof;
}

export interface TaskOrchestratorProviderPostureCheckpoint {
  readonly providerId: string;
  readonly modelId: string;
  readonly policyVersion: string;
  readonly capabilityIds: readonly string[];
  readonly promptArtifactHash: string;
  readonly contextBindingHashes: readonly string[];
  readonly approvalRequirementId: string;
}

export interface TaskOrchestratorPromptBindingReceiptV1 {
  readonly schemaVersion: "agent-task-orchestrator.prompt-binding-receipt.v1";
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly sourceApprovedPromptArtifactHash: `sha256:${string}`;
  readonly boundPromptArtifactHash: `sha256:${string}`;
  readonly generatedAt: string;
  readonly approvalEventId: string;
  readonly providerPostureHash: `sha256:${string}`;
  readonly exactRunBindingHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly receiptHash: `sha256:${string}`;
}

export interface TaskOrchestrationBoundaryInput {
  readonly taskId: string;
  readonly runType: TaskOrchestratorRunType;
}

export interface TaskAttemptIdentityInput extends TaskOrchestrationBoundaryInput {
  readonly retryGeneration: number;
}

export interface TaskOrchestratorIdempotencyKeyInput extends TaskAttemptIdentityInput {
  readonly attemptId: string;
  readonly phase: string;
}

export interface TaskOrchestrationClaimAppendInput extends TaskOrchestrationBoundaryInput {
  readonly latestSequence: number;
}

export interface TaskOrchestrationClaimAppendTarget {
  readonly streamId: string;
  readonly expectedNextSequence: number;
}

export type TaskOrchestrationClaimedEventPayload =
  KnowledgeEventOf<"agent.task.orchestration.claimed">["payload"];
export type TaskOrchestrationCheckpointedEventPayload =
  KnowledgeEventOf<"agent.task.orchestration.checkpointed">["payload"];
export type TaskOrchestrationReleasedEventPayload =
  KnowledgeEventOf<"agent.task.orchestration.released">["payload"];
export type TaskOrchestrationCompletedEventPayload =
  KnowledgeEventOf<"agent.task.orchestration.completed">["payload"];
export type TaskOrchestrationFailedEventPayload =
  KnowledgeEventOf<"agent.task.orchestration.failed">["payload"];

export type TaskOrchestrationAppendOnlyEvent =
  | KnowledgeEventOf<"agent.task.orchestration.claimed">
  | KnowledgeEventOf<"agent.task.orchestration.checkpointed">
  | KnowledgeEventOf<"agent.task.orchestration.released">
  | KnowledgeEventOf<"agent.task.orchestration.completed">
  | KnowledgeEventOf<"agent.task.orchestration.failed">;

export type TaskOrchestrationDerivedState =
  | "queued"
  | "claimable"
  | "claimed"
  | "planning"
  | "context-ref-ready"
  | "context-ready"
  | "prompt-ready"
  | "approval-wait"
  | "resumable"
  | "runner-dispatching"
  | "handoff-pending"
  | "completed"
  | "blocked"
  | "failed"
  | "canceled";

export type TaskOrchestratorSkipReason =
  | "canceled-before-claim"
  | "concurrency-limit"
  | "not-claimable";

export type TaskOrchestratorConflictReason = "claim-readback-not-owned" | "claim-concurrency-conflict";

export type TaskOrchestratorBlockedReason =
  | "provider-invocation-budget-exhausted"
  | "context-not-ready"
  | "handoff-cancellation-pending";

export interface TaskOrchestratorCandidateSummary extends TaskOrchestrationBoundaryInput {
  readonly priorityRank: number;
  readonly createdSequence: number;
  readonly taskId: string;
}

export interface TaskOrchestratorClaimSummary extends TaskOrchestrationBoundaryInput {
  readonly attemptId: string;
  readonly retryGeneration: number;
  readonly leaseClaimGeneration: number;
  readonly claimEventId: string;
  readonly expectedNextSequence: number;
}

export interface TaskOrchestratorReclaimSummary extends TaskOrchestratorClaimSummary {
  readonly previousClaimEventId: string;
  readonly previousLeaseClaimGeneration: number;
  readonly releaseEventId?: string | undefined;
}

export interface TaskOrchestratorReleaseSummary extends TaskOrchestrationBoundaryInput {
  readonly attemptId: string;
  readonly retryGeneration: number;
  readonly leaseClaimGeneration: number;
  readonly claimEventId: string;
  readonly releaseEventId: string;
  readonly releaseReason: TaskOrchestrationReleasedEventPayload["releaseReason"];
}

export interface TaskOrchestratorSkipSummary extends TaskOrchestrationBoundaryInput {
  readonly reason: TaskOrchestratorSkipReason;
}

export interface TaskOrchestratorConflictSummary extends TaskOrchestrationBoundaryInput {
  readonly reason: TaskOrchestratorConflictReason;
}

export interface TaskOrchestratorBlockedSummary extends TaskOrchestrationBoundaryInput {
  readonly reason: TaskOrchestratorBlockedReason;
}

export interface TaskOrchestratorApprovalSummary extends TaskOrchestrationBoundaryInput {
  readonly attemptId: string;
  readonly toolRequestId: string;
  readonly approvalRequirementId: string;
}

export interface TaskOrchestratorTickSummary {
  readonly tickedAt: string;
  readonly workerId: string;
  readonly orderedCandidates: readonly TaskOrchestratorCandidateSummary[];
  readonly claimed: readonly TaskOrchestratorClaimSummary[];
  readonly reclaimed: readonly TaskOrchestratorReclaimSummary[];
  readonly released: readonly TaskOrchestratorReleaseSummary[];
  readonly skipped: readonly TaskOrchestratorSkipSummary[];
  readonly conflicts: readonly TaskOrchestratorConflictSummary[];
  readonly blocked: readonly TaskOrchestratorBlockedSummary[];
  readonly approvalWaiting: readonly TaskOrchestratorApprovalSummary[];
  readonly approvalVerified: readonly TaskOrchestratorApprovalSummary[];
  readonly sideEffectsScheduled: readonly string[];
}
