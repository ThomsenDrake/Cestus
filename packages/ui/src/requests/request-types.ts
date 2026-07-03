export const prrLaneOrder = Object.freeze([
  "drafting",
  "ready-to-send",
  "awaiting-agency",
  "needs-follow-up",
  "review-fee-scope",
  "production-arrived",
  "appeal-escalation"
] as const);

export type PrrLaneId = (typeof prrLaneOrder)[number];
export type PrrViewMode = "board" | "signal-map";
export type PrrGrouping = "agency" | "jurisdiction" | "investigation" | "none";
export type PrrSeverity = "critical" | "high" | "medium" | "low";
export type PrrSignalTone = "red" | "amber" | "green" | "cyan" | "neutral";
export type PrrProvider = "gmail" | "imap-smtp" | "himalaya";
export type PrrDeadlineSource = "estimated" | "confirmed" | "none";

export interface PrrSavedViewFilters {
  readonly jurisdiction?: string;
  readonly laneIds?: readonly PrrLaneId[];
  readonly agencyIds?: readonly string[];
  readonly investigationIds?: readonly string[];
  readonly minSeverity?: PrrSeverity;
}

export interface PrrSavedView {
  readonly id: string;
  readonly label: string;
  readonly mode: PrrViewMode;
  readonly grouping: PrrGrouping;
  readonly filters: PrrSavedViewFilters;
}

export interface PrrRequestCard {
  readonly id: string;
  readonly prrRequestId: string;
  readonly title: string;
  readonly agencyId: string;
  readonly agencyName: string;
  readonly jurisdictionId: string;
  readonly jurisdictionLabel: string;
  readonly investigationId: string;
  readonly investigationLabel: string;
  readonly laneId: PrrLaneId;
  readonly severity: PrrSeverity;
  readonly deadlineLabel: string;
  readonly deadlineSource: PrrDeadlineSource;
  readonly providerLabel: string;
  readonly stallingState: string;
  readonly feeSignal: string;
  readonly productionCount: number;
  readonly diagnosticCount: number;
  readonly ownerLabel: string;
  readonly nextActionLabel: string;
}

export interface PrrAgencyGroup {
  readonly agencyId: string;
  readonly agencyName: string;
  readonly jurisdictionLabel: string;
  readonly heat: PrrSignalTone;
  readonly summary: string;
  readonly cards: readonly PrrRequestCard[];
}

export interface PrrLaneModel {
  readonly id: PrrLaneId;
  readonly label: string;
  readonly agencyGroups: readonly PrrAgencyGroup[];
}

export interface PrrGateCheck {
  readonly id: string;
  readonly label: string;
  readonly complete: boolean;
  readonly detail: string;
}

export interface PrrActionPacket {
  readonly label: string;
  readonly summary: string;
  readonly risk: PrrSignalTone;
  readonly primaryActionLabel: string;
  readonly requiredHumanDecision: string;
  readonly explanation: readonly string[];
}

export interface PrrCorrespondenceSummary {
  readonly provider: PrrProvider;
  readonly syncState: string;
  readonly latestInbound: string;
  readonly latestOutbound: string;
}

export interface PrrEvidencePacket {
  readonly evidenceId: string;
  readonly title: string;
  readonly sourceArtifact: string;
  readonly fileCount: number;
  readonly hashState: string;
  readonly extractionState: string;
  readonly classificationState: string;
}

export interface PrrDetailModel {
  readonly prrRequestId: string;
  readonly title: string;
  readonly agencyName: string;
  readonly nextAction: PrrActionPacket;
  readonly sendGate: readonly PrrGateCheck[];
  readonly escalationGate: readonly PrrGateCheck[];
  readonly deadlinePosture: string;
  readonly correspondence: PrrCorrespondenceSummary;
  readonly evidencePackets: readonly PrrEvidencePacket[];
  readonly diagnostics: readonly string[];
  readonly timeline: readonly string[];
}

export interface PrrSignalMapNode {
  readonly id: string;
  readonly agencyId: string;
  readonly agencyName: string;
  readonly tone: PrrSignalTone;
  readonly x: number;
  readonly y: number;
  readonly summary: string;
}

export interface PrrSignalMapEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly tone: PrrSignalTone;
}

export interface PrrSignalMapModel {
  readonly nodes: readonly PrrSignalMapNode[];
  readonly edges: readonly PrrSignalMapEdge[];
}

export interface PrrSuggestedFill {
  readonly id: string;
  readonly fieldLabel: string;
  readonly value: string;
  readonly provenance: string;
}

export interface PrrBuilderStep {
  readonly id: string;
  readonly label: string;
  readonly state: "ready" | "needs-review" | "complete";
  readonly suggestedFills: readonly PrrSuggestedFill[];
}

export interface PrrBuilderModel {
  readonly steps: readonly PrrBuilderStep[];
}

export interface PrrWorkspaceFixture {
  readonly savedViews: readonly PrrSavedView[];
  readonly cards: readonly PrrRequestCard[];
  readonly requestDetails: readonly PrrDetailModel[];
  readonly signalMap: PrrSignalMapModel;
  readonly builder: PrrBuilderModel;
}

export interface PrrWorkspaceViewModel {
  readonly savedViews: readonly PrrSavedView[];
  readonly activeView: PrrSavedView;
  readonly viewMode: PrrViewMode;
  readonly lanes: readonly PrrLaneModel[];
  readonly selectedRequest: PrrDetailModel | undefined;
  readonly signalMap: PrrSignalMapModel;
  readonly builder: PrrBuilderModel;
}
