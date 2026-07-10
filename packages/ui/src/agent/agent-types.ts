export type {
  AgentCockpitContextPackDto,
  AgentCockpitDto,
  AgentCockpitHandoffDto,
  AgentCockpitMemorySnippetDto,
  AgentCockpitModelAuditDto,
  AgentCockpitNeedDto,
  AgentCockpitRunCardDto,
  AgentCockpitSelectedRunDto,
  AgentCockpitSpecialistsDto,
  AgentCockpitTaskCardDto
} from "../../../agent/src/cockpit.js";
export type {
  AgentApprovalCockpitDto,
  AgentApprovalDecisionResultDto
} from "../../../agent/src/approval-cockpit.js";
export type {
  AgentApprovalQueueApprovalClass,
  AgentApprovalQueueItemDto
} from "../../../agent/src/approval-queue.js";
export type {
  ResidentIdentityLifecycleDto,
  ResidentIdentityLifecycleState
} from "../../../agent/src/identity-bootstrap.js";
import type { AgentTaskPriority } from "../../../agent/src/projection-types.js";
import type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentMemoryMutationResult,
  RecordAgentMemoryInput,
  RetractAgentMemoryInput,
  SupersedeAgentMemoryInput,
  AgentStatusDto as RuntimeAgentStatusDto
} from "../../../agent/src/runtime-types.js";

export type {
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentRuntimeDiagnosticDto
} from "../../../agent/src/runtime-types.js";

export type RecordMemoryInput = RecordAgentMemoryInput;
export type SupersedeMemoryInput = SupersedeAgentMemoryInput;
export type RetractMemoryInput = RetractAgentMemoryInput;
export type AgentMemoryMutationResultDto = { readonly ok: true } & AgentMemoryMutationResult;
export type AgentStatusDto = RuntimeAgentStatusDto;

export interface OntologyBootstrapRouteDto {
  readonly schemaVersion: "agent-ontology-bootstrap-route.v1";
  readonly generatedAt: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly phase?: string;
  readonly legacyReportId?: string;
  readonly reportHash?: string;
  readonly candidateSetHash?: string;
  readonly reviewBundleHash?: string;
  readonly candidateBundleCount?: number;
  readonly candidateCount?: number;
  readonly selectedCandidateIds: readonly string[];
  readonly blockedRequestedCandidateIds: readonly string[];
  readonly pendingApprovalToolRequestIds: readonly string[];
  readonly nextCursor?: {
    readonly currentOffset: number;
    readonly limit: number;
    readonly totalCandidates: number;
    readonly nextOffset?: number;
  };
  readonly nextSafeAction?: {
    readonly actionId?: string;
    readonly label: string;
    readonly kind: string;
    readonly effect: string;
  };
  readonly runState?: string;
  readonly outputArtifactHashes?: readonly string[];
  readonly stepIds?: readonly string[];
}

export interface CreateAgentTaskInput {
  readonly taskId: string;
  readonly title: string;
  readonly priority: AgentTaskPriority;
  readonly description?: string;
}

export interface AgentTaskCreateResultDto {
  readonly ok: true;
  readonly taskId: string;
  readonly eventIds: readonly string[];
}
