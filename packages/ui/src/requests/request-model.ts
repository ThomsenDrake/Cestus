import {
  prrLaneOrder,
  type PrrAgencyGroup,
  type PrrDetailModel,
  type PrrGateCheck,
  type PrrLaneId,
  type PrrLaneModel,
  type PrrRequestCard,
  type PrrSavedView,
  type PrrSeverity,
  type PrrSignalMapModel,
  type PrrSignalTone,
  type PrrViewMode,
  type PrrWorkspaceFixture,
  type PrrWorkspaceViewModel
} from "./request-types.js";

export { prrLaneOrder } from "./request-types.js";

export const prrLaneLabels: Record<PrrLaneId, string> = Object.freeze({
  drafting: "Drafting",
  "ready-to-send": "Ready to send",
  "awaiting-agency": "Awaiting agency",
  "needs-follow-up": "Needs follow-up",
  "review-fee-scope": "Review fee/scope",
  "production-arrived": "Production arrived",
  "appeal-escalation": "Appeal/escalation"
});

export interface BuildPrrWorkspaceOptions {
  readonly savedViewId: string;
  readonly selectedRequestId: string | undefined;
  readonly viewMode: PrrViewMode | undefined;
}

const severityRank: Record<PrrSeverity, number> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
});

export function buildPrrWorkspaceViewModel(
  fixture: PrrWorkspaceFixture,
  options: BuildPrrWorkspaceOptions
): PrrWorkspaceViewModel {
  const activeView = getSavedView(fixture, options.savedViewId);
  const visibleCards = fixture.cards.filter((card) => cardMatchesView(card, activeView));

  return Object.freeze({
    savedViews: fixture.savedViews,
    activeView,
    viewMode: options.viewMode ?? activeView.mode,
    lanes: Object.freeze(prrLaneOrder.map((laneId) => buildLane(laneId, visibleCards))),
    selectedRequest: getSelectedPrrRequest(fixture, options.selectedRequestId),
    signalMap: buildSignalMap(fixture.signalMap, visibleCards),
    builder: fixture.builder
  });
}

export function getSelectedPrrRequest(
  fixture: PrrWorkspaceFixture,
  selectedRequestId: string | undefined
): PrrDetailModel | undefined {
  if (selectedRequestId === undefined) {
    return fixture.requestDetails[0];
  }

  return fixture.requestDetails.find((detail) => detail.prrRequestId === selectedRequestId);
}

export function sendGateArmed(gate: readonly PrrGateCheck[] | undefined): boolean {
  return gate !== undefined && gate.length > 0 && gate.every((check) => check.complete);
}

export function unresolvedEscalationPrerequisites(gate: readonly PrrGateCheck[] | undefined): readonly string[] {
  return Object.freeze((gate ?? []).filter((check) => !check.complete).map((check) => check.label));
}

function getSavedView(fixture: PrrWorkspaceFixture, savedViewId: string): PrrSavedView {
  const activeView = fixture.savedViews.find((view) => view.id === savedViewId) ?? fixture.savedViews[0];
  if (activeView === undefined) {
    throw new Error("PRR workspace fixture must include at least one saved view.");
  }

  return activeView;
}

function buildLane(laneId: PrrLaneId, cards: readonly PrrRequestCard[]): PrrLaneModel {
  const cardsByAgency = new Map<string, PrrRequestCard[]>();
  for (const card of cards) {
    if (card.laneId !== laneId) {
      continue;
    }

    const agencyCards = cardsByAgency.get(card.agencyId) ?? [];
    agencyCards.push(card);
    cardsByAgency.set(card.agencyId, agencyCards);
  }

  const agencyGroups: PrrAgencyGroup[] = [];
  for (const [agencyId, agencyCards] of cardsByAgency.entries()) {
    const first = agencyCards[0];
    if (first === undefined) {
      continue;
    }

    agencyGroups.push(
      Object.freeze({
        agencyId,
        agencyName: first.agencyName,
        jurisdictionLabel: first.jurisdictionLabel,
        heat: heatForCards(agencyCards),
        summary: `${agencyCards.length} active signal${agencyCards.length === 1 ? "" : "s"}`,
        cards: Object.freeze([...agencyCards])
      })
    );
  }

  return Object.freeze({
    id: laneId,
    label: prrLaneLabels[laneId],
    agencyGroups: Object.freeze(agencyGroups)
  });
}

function heatForCards(cards: readonly PrrRequestCard[]): PrrSignalTone {
  if (cards.some((card) => card.severity === "critical")) {
    return "red";
  }
  if (cards.some((card) => card.severity === "high")) {
    return "amber";
  }
  if (cards.some((card) => card.severity === "medium")) {
    return "cyan";
  }
  return "neutral";
}

function buildSignalMap(signalMap: PrrSignalMapModel, cards: readonly PrrRequestCard[]): PrrSignalMapModel {
  const visibleAgencyIds = new Set(cards.map((card) => card.agencyId));
  const nodes = signalMap.nodes.filter((node) => visibleAgencyIds.has(node.agencyId));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = signalMap.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to));

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges)
  });
}

function cardMatchesView(card: PrrRequestCard, view: PrrSavedView): boolean {
  if (
    view.filters.jurisdiction !== undefined &&
    card.jurisdictionId !== view.filters.jurisdiction &&
    card.jurisdictionLabel !== view.filters.jurisdiction
  ) {
    return false;
  }

  if (view.filters.laneIds !== undefined && !view.filters.laneIds.includes(card.laneId)) {
    return false;
  }

  if (view.filters.agencyIds !== undefined && !view.filters.agencyIds.includes(card.agencyId)) {
    return false;
  }

  if (view.filters.investigationIds !== undefined && !view.filters.investigationIds.includes(card.investigationId)) {
    return false;
  }

  if (view.filters.minSeverity !== undefined && severityRank[card.severity] > severityRank[view.filters.minSeverity]) {
    return false;
  }

  return true;
}
