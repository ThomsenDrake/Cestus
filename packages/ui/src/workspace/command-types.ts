import type { PrrDiagnostic } from "../../../prr/src/diagnostics.js";
import type { RequestQueueRow } from "../../../prr/src/read-api.js";
import type { AgentStatusDto } from "../agent/agent-types.js";

export type QueueFilter = "all" | "deadline" | "signal" | "evidence" | "advisory" | "diagnostic";
export type CommandItemKind = Exclude<QueueFilter, "all">;
export type CommandSeverity = "critical" | "high" | "medium" | "low";
export type MetricTone = "amber" | "red" | "green" | "cyan" | "neutral";
export type DecisionVoteId = "legal-risk" | "factual-confidence" | "cost-pressure";
export type DecisionVoteState = "go" | "review" | "watch" | "blocked" | "needs-evidence" | "human-decision-required" | "unknown";
export type CommandRuntimeSourceId = "prr" | "evidence" | "ingestion" | "ontology" | "operator" | "agent";
export type CommandRuntimeSourceState = "loading" | "ready" | "degraded" | "unavailable";

export interface EvidenceAlert {
  readonly evidenceId: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly receivedAt?: string;
  readonly linkedRequestId?: string;
  readonly confidence?: number;
  readonly uncertainty?: string;
  readonly provenanceRefs?: readonly string[];
}

export interface StatusMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: MetricTone;
}

export interface DecisionVote {
  readonly id: DecisionVoteId;
  readonly label: string;
  readonly state: DecisionVoteState;
  readonly tone: MetricTone;
  readonly summary: string;
}

export interface DecisionRailModel {
  readonly modeLabel: string;
  readonly defaultVotes: readonly DecisionVote[];
}

export interface CommandItemDetail {
  readonly summary: string;
  readonly basis: string;
  readonly recommendedAction: string;
  readonly provenanceRefs: readonly string[];
  readonly decisionVotes: readonly DecisionVote[];
  readonly runtimeTimestamp?: string;
  readonly confidence?: number;
  readonly uncertainty: string;
}

export interface CommandQueueItem {
  readonly id: string;
  readonly kind: CommandItemKind;
  readonly severity: CommandSeverity;
  readonly title: string;
  readonly context: string;
  readonly state: string;
  readonly sourceLabel: string;
  readonly actionLabel: string;
  readonly reviewed: boolean;
  readonly deadlineDate?: string;
  readonly occurredAt?: string;
  readonly actionTarget?: string;
  readonly detail: CommandItemDetail;
}

export interface CommandRuntimeDiagnostic {
  readonly diagnosticId: string;
  readonly sourceId: CommandRuntimeSourceId;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly basis: string;
  readonly recommendedAction: string;
  readonly provenanceRefs: readonly string[];
  readonly runtimeTimestamp?: string;
  readonly actionTarget?: string;
  readonly priorityKind: "diagnostic" | "advisory";
}

export interface CommandRuntimeSourceStatus {
  readonly sourceId: CommandRuntimeSourceId;
  readonly label: string;
  readonly state: CommandRuntimeSourceState;
  readonly summary: string;
  readonly provenanceRefs: readonly string[];
  readonly runtimeTimestamp?: string;
  readonly actionLabel: string;
  readonly actionTarget?: string;
}

export interface TacticalPanelItem {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly tone: MetricTone;
}

export interface TacticalPanelModel {
  readonly id: string;
  readonly title: string;
  readonly items: readonly TacticalPanelItem[];
}

export interface AgentBrief {
  readonly watching: readonly string[];
  readonly changedSinceReview: readonly string[];
  readonly uncertain: readonly string[];
  readonly recommendedActions: readonly string[];
}

export interface CommandBoardViewModel {
  readonly statusMetrics: readonly StatusMetric[];
  readonly queueItems: readonly CommandQueueItem[];
  readonly tacticalPanels: readonly TacticalPanelModel[];
  readonly agentBrief: AgentBrief;
  readonly decisionRail: DecisionRailModel;
  readonly runtimeSources: readonly CommandRuntimeSourceStatus[];
}

export interface CommandBoardInput {
  readonly requestRows: readonly RequestQueueRow[];
  readonly diagnostics: readonly PrrDiagnostic[];
  readonly evidenceAlerts: readonly EvidenceAlert[];
  readonly todayIso: string;
  readonly reviewedItemIds: readonly string[];
  readonly agentStatus?: AgentStatusDto | undefined;
  readonly runtimeDiagnostics?: readonly CommandRuntimeDiagnostic[];
  readonly runtimeSources?: readonly CommandRuntimeSourceStatus[];
  readonly supplementalMetrics?: readonly StatusMetric[];
  readonly runtimeGeneratedAt?: string;
}
