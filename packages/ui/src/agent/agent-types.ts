export type {
  AgentApprovalCockpitDto,
  AgentApprovalDecisionResultDto
} from "../../../agent/src/approval-cockpit.js";
export type {
  AgentApprovalQueueApprovalClass,
  AgentApprovalQueueItemDto
} from "../../../agent/src/approval-queue.js";
import type { AgentApprovalQueueApprovalClass } from "../../../agent/src/approval-queue.js";
import type {
  AgentStatusDto as RuntimeAgentStatusDto
} from "../../../agent/src/runtime-types.js";

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
