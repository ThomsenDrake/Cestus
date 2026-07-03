import type { PrrDiagnostic } from "../../../prr/src/diagnostics.js";
import type { RequestQueueRow } from "../../../prr/src/read-api.js";

export type QueueFilter = "all" | "deadline" | "signal" | "evidence" | "diagnostic";
export type CommandItemKind = Exclude<QueueFilter, "all">;
export type CommandSeverity = "critical" | "high" | "medium" | "low";
export type MetricTone = "amber" | "red" | "green" | "cyan" | "neutral";
export type DecisionVoteId = "legal-risk" | "factual-confidence" | "cost-pressure";
export type DecisionVoteState = "go" | "review" | "watch" | "blocked" | "needs-evidence" | "human-decision-required";

export interface EvidenceAlert {
  readonly evidenceId: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly receivedAt: string;
  readonly linkedRequestId?: string;
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
  readonly detail: CommandItemDetail;
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
}

export interface CommandBoardInput {
  readonly requestRows: readonly RequestQueueRow[];
  readonly diagnostics: readonly PrrDiagnostic[];
  readonly evidenceAlerts: readonly EvidenceAlert[];
  readonly todayIso: string;
  readonly reviewedItemIds: readonly string[];
}
