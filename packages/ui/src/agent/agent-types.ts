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
  AgentRuntimeDiagnosticDto,
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
