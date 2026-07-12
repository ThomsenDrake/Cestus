import type { AgentProjectionIdentity } from "./projection.js";
import type { ResidentIdentityLifecycleDto } from "./identity-bootstrap.js";
import type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentMemoryTruthBoundaryDto
} from "./memory.js";
import type { AgentMemoryKind, AgentMemoryScope, AgentMemoryState, AgentProjectionDto } from "./projection-types.js";
import type { ProviderDescriptor } from "./provider.js";
import type { ProviderCapabilityRegistry } from "./provider-registry.js";
import type { ProviderReadinessDto } from "./provider-readiness.js";
import type { AgentSchedulerWakeResultDto } from "./scheduler-types.js";
import type { SpecialistWorkflowDescriptor } from "./specialist-workflows.js";
import type {
  TaskOrchestratorRunnerRegistry
} from "./task-orchestrator.js";
import type {
  TaskOrchestratorContextRenderInput,
  TaskOrchestratorProviderPolicy,
  TaskOrchestratorRunType
} from "./task-orchestrator-types.js";
import type { ContextPackRegistry } from "./context-packs.js";
import type { PromptArtifactEnvelope } from "./prompt-artifacts.js";
import type {
  InspectTaskOrchestratorProviderApprovalInput,
  TaskOrchestratorProviderApprovalInspection
} from "./task-orchestrator-approval.js";
import type { TaskOrchestratorTickSummary } from "./task-orchestrator-types.js";

export interface AgentRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: "agent" | "provider" | "credential" | "tool-gateway" | "policy" | "runtime";
  readonly message: string;
  readonly allowedRepairActions?: readonly string[];
}

export interface AgentStatusDto extends AgentProjectionDto {
  readonly schemaVersion: "agent-status.v1";
  readonly generatedAt: string;
  readonly identityLifecycle: ResidentIdentityLifecycleDto;
  readonly identity?: AgentProjectionIdentity | undefined;
  readonly providers: readonly ProviderDescriptor[];
  readonly providerReadiness?: ProviderReadinessDto | undefined;
  readonly pendingApprovalCount: number;
  readonly activeLockCount: number;
  readonly diagnostics: readonly AgentRuntimeDiagnosticDto[];
}

export interface AgentProviderReadinessEnvelope {
  readonly providerReadiness: ProviderReadinessDto;
}

export interface AgentRuntimeWakeResultDto {
  readonly schemaVersion: "agent-runtime-wake-result.v1";
  readonly generatedAt: string;
  readonly taskOrchestrator: TaskOrchestratorTickSummary;
  readonly approvedToolScheduler: AgentSchedulerWakeResultDto;
}

export interface AgentTaskOrchestratorWorkflowRegistry {
  require(runType: TaskOrchestratorRunType): SpecialistWorkflowDescriptor;
}

export interface AgentTaskOrchestratorPromptRendererRegistry {
  render(input: TaskOrchestratorContextRenderInput): PromptArtifactEnvelope | Promise<PromptArtifactEnvelope>;
}

export interface AgentTaskOrchestratorApprovalReader {
  inspect(input: InspectTaskOrchestratorProviderApprovalInput): Promise<TaskOrchestratorProviderApprovalInspection>;
}

export interface AgentTaskOrchestratorHandoffCapability {
  prepare(input: unknown): Promise<unknown> | unknown;
  bind(input: unknown): Promise<unknown> | unknown;
  readback(input: unknown): Promise<unknown> | unknown;
}

export interface AgentTaskOrchestratorRuntimeCapabilities {
  readonly schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1";
  readonly workflowRegistry: AgentTaskOrchestratorWorkflowRegistry;
  readonly contextRegistry: ContextPackRegistry;
  readonly promptRendererRegistry: AgentTaskOrchestratorPromptRendererRegistry;
  readonly providerRegistry: ProviderCapabilityRegistry;
  readonly approvalReader: AgentTaskOrchestratorApprovalReader;
  readonly runnerRegistry: TaskOrchestratorRunnerRegistry;
  readonly handoffCapability: AgentTaskOrchestratorHandoffCapability;
  readonly providerPolicy?: TaskOrchestratorProviderPolicy | undefined;
}

export interface RecordAgentMemoryInput {
  readonly memoryId: string;
  readonly scope: AgentMemoryScope;
  readonly memoryKind?: AgentMemoryKind;
  readonly summary: string;
  readonly sourceEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly confidence: number;
  readonly expiresAt?: string;
}

export interface SupersedeAgentMemoryInput extends RecordAgentMemoryInput {
  readonly supersededByMemoryId: string;
  readonly rationale: string;
}

export interface RetractAgentMemoryInput {
  readonly memoryId: string;
  readonly rationale: string;
}

export interface AgentMemoryMutationResult {
  readonly memoryId: string;
  readonly eventIds: readonly string[];
}

export type AgentRuntimeResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: AgentRuntimeDiagnosticDto };

export type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentMemoryTruthBoundaryDto,
  AgentMemoryKind,
  AgentMemoryScope,
  AgentMemoryState
};
