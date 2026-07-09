export type {
  AgentCockpitContextPackDto,
  AgentCockpitDto,
  AgentCockpitHandoffDto,
  AgentCockpitMemorySnippetDto,
  AgentCockpitModelAuditDto,
  AgentCockpitNeedDto,
  AgentCockpitRunCardDto,
  AgentCockpitSelectedRunDto,
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
import type { AgentApprovalQueueApprovalClass } from "../../../agent/src/approval-queue.js";
import type { AgentTaskPriority } from "../../../agent/src/projection-types.js";
import type {
  AgentStatusDto as RuntimeAgentStatusDto
} from "../../../agent/src/runtime-types.js";
import type { AgentSpecialistRunType } from "../../../agent/src/specialists.js";

export type { AgentRuntimeDiagnosticDto } from "../../../agent/src/runtime-types.js";

type BrowserAgentToolRequestDto = Omit<
  RuntimeAgentStatusDto["toolRequests"][number],
  "requiredApprovalClass" | "approvalClass"
> & {
  readonly requiredApprovalClass: AgentApprovalQueueApprovalClass;
  readonly approvalClass?: AgentApprovalQueueApprovalClass | undefined;
};

export type AgentStatusDto = Omit<RuntimeAgentStatusDto, "toolRequests"> & {
  readonly toolRequests: readonly BrowserAgentToolRequestDto[];
};

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
}

export interface StartAgentRunInput {
  readonly runId: string;
  readonly taskId: string;
  readonly runType: AgentSpecialistRunType;
  readonly scope:
    | { readonly kind: "workspace"; readonly refs: readonly string[] }
    | { readonly kind: "investigation"; readonly refs: readonly string[] };
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
}

export interface AgentTaskCreateResultDto {
  readonly ok: true;
  readonly taskId: string;
  readonly eventIds: readonly string[];
}

export interface AgentRunStartResultDto {
  readonly ok: true;
  readonly schemaVersion: "agent-run-start-result.v1";
  readonly runId: string;
  readonly eventIds: readonly string[];
}
