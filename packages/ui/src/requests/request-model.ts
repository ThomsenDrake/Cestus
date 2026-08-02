import type {
  PrrWorkspaceDtoActionPacket,
  PrrWorkspaceDtoCard,
  PrrWorkspaceDtoGateCheck,
  PrrWorkspaceDtoRequestDetail,
  PrrWorkspaceDtoSavedView,
  PrrWorkspaceDtoSeverity,
  PrrWorkspaceDtoSignalMapEdge,
  PrrWorkspaceDtoSignalMapNode
} from "../../../prr/src/read-api.js";
import {
  prrWorkspaceDtoLegalEscalationGateCheckIds,
  prrWorkspaceDtoSendGateCheckIds
} from "../../../prr/src/read-api.js";
import {
  prrLaneOrder,
  type PrrAgencyGroup,
  type PrrBuilderModel,
  type PrrBuilderStep,
  type PrrDetailModel,
  type PrrGateCheck,
  type PrrGrouping,
  type PrrLaneId,
  type PrrLaneModel,
  type PrrProvider,
  type PrrRequestCard,
  type PrrSavedView,
  type PrrSavedViewFilters,
  type PrrSeverity,
  type PrrSignalMapEdge,
  type PrrSignalMapModel,
  type PrrSignalMapNode,
  type PrrSignalTone,
  type PrrSuggestedFill,
  type PrrViewMode,
  type PrrWorkspaceData,
  type PrrWorkspaceIntelligenceModel,
  type PrrWorkspaceIntelligenceNextWork,
  type PrrWorkspaceIntelligenceSignal,
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

export interface BuildPrrWorkspaceIntelligenceOptions {
  readonly savedViewId?: string | undefined;
  readonly viewMode?: PrrViewMode | undefined;
}

const severityRank: Record<PrrSeverity, number> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
});

const savedViewDefaults: Record<
  string,
  {
    readonly mode: PrrViewMode;
    readonly grouping: PrrGrouping;
    readonly filters: PrrSavedViewFilters;
  }
> = Object.freeze({
  "all-active": Object.freeze({ mode: "board", grouping: "agency", filters: Object.freeze({}) }),
  overdue: Object.freeze({ mode: "board", grouping: "agency", filters: Object.freeze({}) }),
  "florida-fees": Object.freeze({ mode: "board", grouping: "agency", filters: Object.freeze({}) }),
  "productions-arrived": Object.freeze({ mode: "signal-map", grouping: "agency", filters: Object.freeze({}) })
});

const signalPositions: readonly { readonly x: number; readonly y: number }[] = Object.freeze([
  { x: 18, y: 24 },
  { x: 48, y: 18 },
  { x: 76, y: 28 },
  { x: 25, y: 58 },
  { x: 55, y: 52 },
  { x: 82, y: 66 },
  { x: 36, y: 82 },
  { x: 66, y: 84 }
]);

export function buildPrrWorkspaceViewModel(
  workspace: PrrWorkspaceData,
  options: BuildPrrWorkspaceOptions
): PrrWorkspaceViewModel {
  const savedViews = Object.freeze(workspace.savedViews.map(toSavedView));
  const activeView = getSavedView(savedViews, options.savedViewId);
  const detailByRequestId = new Map(workspace.requestDetails.map((detail) => [detail.prrRequestId, detail]));
  const cards = Object.freeze(workspace.cards.map((card) => toRequestCard(card, detailByRequestId.get(card.prrRequestId))));
  const visibleCards = cards.filter((card) => cardMatchesView(card, activeView));

  return Object.freeze({
    savedViews,
    activeView,
    viewMode: options.viewMode ?? activeView.mode,
    lanes: Object.freeze(prrLaneOrder.map((laneId) => buildLane(laneId, visibleCards))),
    selectedRequest: getSelectedPrrRequest(workspace, options.selectedRequestId),
    signalMap: buildSignalMap(workspace.signalMap.nodes, workspace.signalMap.edges, visibleCards),
    builder: buildPrrBuilderModel(workspace)
  });
}

export function buildPrrBuilderModel(workspace: PrrWorkspaceData): PrrBuilderModel {
  return Object.freeze({
    steps: Object.freeze(workspace.builder.steps.map(toBuilderStep))
  });
}

export function buildPrrWorkspaceIntelligenceModel(
  workspace: PrrWorkspaceData,
  options: BuildPrrWorkspaceIntelligenceOptions = {}
): PrrWorkspaceIntelligenceModel {
  const defaultSavedViewId = workspace.savedViews[0]?.id ?? "all-active";
  const viewModel = buildPrrWorkspaceViewModel(workspace, {
    savedViewId: options.savedViewId ?? defaultSavedViewId,
    selectedRequestId: undefined,
    viewMode: options.viewMode
  });
  const visibleCards = viewModel.lanes.flatMap((lane) => lane.agencyGroups.flatMap((group) => group.cards));
  const visibleRequestIds = new Set(visibleCards.map((card) => card.prrRequestId));
  const visibleDtoCards = workspace.cards.filter((card) => visibleRequestIds.has(card.prrRequestId));
  const feeScopeCount = visibleCards.filter((card) => card.laneId === "review-fee-scope").length;
  const escalationCount = visibleCards.filter((card) => card.laneId === "appeal-escalation").length;
  const overdueCount = visibleDtoCards.filter((card) => card.dueState === "overdue").length;
  const diagnosticCount = visibleCards.reduce((total, card) => total + card.diagnosticCount, 0);
  const draftCount = visibleCards.filter((card) => card.laneId === "drafting").length;
  const visibleRequestCount = visibleCards.length;

  const healthSignals: PrrWorkspaceIntelligenceSignal[] = [
    {
      id: "active-requests",
      label: "Visible requests",
      value: String(visibleRequestCount),
      tone: "cyan",
      detail: `Requests visible in the ${viewModel.activeView.label} saved view.`
    },
    {
      id: "review-fee-scope",
      label: "Review fee/scope",
      value: String(feeScopeCount),
      tone: feeScopeCount > 0 ? "amber" : "neutral",
      detail: "Fee estimates and scope narrowing need human review before action."
    },
    {
      id: "appeal-escalation",
      label: "Appeal/escalation",
      value: String(escalationCount),
      tone: escalationCount > 0 ? "red" : "neutral",
      detail: "Appeals and legal escalation candidates stay locked behind explicit approval."
    },
    {
      id: "deadlines",
      label: "Deadline pressure",
      value: String(overdueCount),
      tone: overdueCount > 0 ? "red" : "green",
      detail: "Overdue requests based on replayed deadline state."
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      value: String(diagnosticCount),
      tone: diagnosticCount > 0 ? "amber" : "green",
      detail: "Open projection or workflow diagnostics tied to PRR events."
    }
  ];

  const nextWork: PrrWorkspaceIntelligenceNextWork[] = [
    {
      id: "review-drafts",
      label: "Review draft queue",
      detail: `${draftCount} draft request${draftCount === 1 ? "" : "s"} can be checked before send approval.`,
      tone: draftCount > 0 ? "cyan" : "neutral"
    },
    {
      id: "review-fee-scope-work",
      label: "Review fee and scope signals",
      detail: `${feeScopeCount} ${requestNoun(feeScopeCount)} ${feeScopeCount === 1 ? "needs" : "need"} fee or scope review.`,
      tone: feeScopeCount > 0 ? "amber" : "neutral"
    },
    {
      id: "inspect-escalation",
      label: "Inspect escalation candidates",
      detail: `${escalationCount} ${requestNoun(escalationCount)} ${escalationCount === 1 ? "sits" : "sit"} in appeal or escalation lanes.`,
      tone: escalationCount > 0 ? "red" : "neutral"
    }
  ];

  return Object.freeze({
    activeRequestCount: workspace.cards.length,
    activeViewLabel: viewModel.activeView.label,
    visibleRequestCount,
    generatedAt: workspace.generatedAt,
    healthSignals: Object.freeze(healthSignals.map((signal) => Object.freeze(signal))),
    nextWork: Object.freeze(nextWork.map((item) => Object.freeze(item)))
  });
}

function requestNoun(count: number): string {
  return `request${count === 1 ? "" : "s"}`;
}

export function getSelectedPrrRequest(
  workspace: PrrWorkspaceData,
  selectedRequestId: string | undefined
): PrrDetailModel | undefined {
  const detail =
    selectedRequestId === undefined
      ? workspace.requestDetails[0]
      : workspace.requestDetails.find((requestDetail) => requestDetail.prrRequestId === selectedRequestId);

  if (detail === undefined) {
    return undefined;
  }

  const card = workspace.cards.find((candidate) => candidate.prrRequestId === detail.prrRequestId);
  return toDetailModel(detail, card);
}

export function sendGateArmed(gate: readonly PrrGateCheck[] | undefined): boolean {
  return (
    hasExactGateTopology(gate, prrWorkspaceDtoSendGateCheckIds) &&
    gate.every((check) => check.complete && !check.locked)
  );
}

export function unresolvedEscalationPrerequisites(gate: readonly PrrGateCheck[] | undefined): readonly string[] {
  if (!hasExactGateTopology(gate, prrWorkspaceDtoLegalEscalationGateCheckIds)) {
    return Object.freeze(["Legal escalation gate unavailable"]);
  }
  return Object.freeze(gate.filter((check) => !check.complete || check.locked).map((check) => check.label));
}

function hasExactGateTopology(
  gate: readonly PrrGateCheck[] | undefined,
  expectedIds: readonly string[]
): gate is readonly PrrGateCheck[] {
  if (gate === undefined || gate.length !== expectedIds.length) {
    return false;
  }

  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  for (const check of gate) {
    if (
      !expected.has(check.id) ||
      seen.has(check.id) ||
      check.complete === check.locked
    ) {
      return false;
    }
    seen.add(check.id);
  }
  return seen.size === expectedIds.length;
}

function toSavedView(view: PrrWorkspaceDtoSavedView): PrrSavedView {
  const defaults = savedViewDefaults[view.id] ?? savedViewDefaults["all-active"];
  if (defaults === undefined) {
    throw new Error("Requests workspace saved view defaults are unavailable.");
  }

  return Object.freeze({
    id: view.id,
    label: view.label,
    mode: defaults.mode,
    grouping: defaults.grouping,
    filters: defaults.filters,
    cardIds: Object.freeze([...view.cardIds])
  });
}

function toRequestCard(
  card: PrrWorkspaceDtoCard,
  detail: PrrWorkspaceDtoRequestDetail | undefined
): PrrRequestCard {
  const agencyId = stableAgencyId(card.agencyName);
  return Object.freeze({
    id: `card_${card.prrRequestId}`,
    prrRequestId: card.prrRequestId,
    title: card.title,
    agencyId,
    agencyName: card.agencyName,
    jurisdictionId: card.jurisdictionPackName,
    jurisdictionLabel: jurisdictionLabel(card.jurisdictionPackName),
    investigationId: "none",
    investigationLabel: "No investigation link",
    laneId: card.laneId,
    severity: card.severity,
    deadlineLabel: card.deadlineLabel ?? "No deadline",
    deadlineSource: card.deadlineSource ?? "none",
    providerLabel: providerLabelForDetail(detail),
    stallingState: stallingStateForCard(card),
    feeSignal: card.feeSignal ?? "No fee issue",
    productionCount: card.productionCount,
    diagnosticCount: detail?.diagnostics.length ?? 0,
    ownerLabel: "Local replay",
    nextActionLabel: card.actionLabel
  });
}

function toDetailModel(detail: PrrWorkspaceDtoRequestDetail, card: PrrWorkspaceDtoCard | undefined): PrrDetailModel {
  const actionPacket = detail.actionPackets[0] ?? fallbackActionPacket(detail);

  return Object.freeze({
    prrRequestId: detail.prrRequestId,
    title: card?.title ?? deriveTitle(detail.requestText),
    agencyName: detail.agencyName,
    nextAction: Object.freeze({
      label: actionPacket.label,
      summary: actionPacket.detail,
      risk: severityToTone(actionPacket.severity),
      primaryActionLabel: actionPacket.label,
      requiredHumanDecision: requiredHumanDecision(actionPacket),
      explanation: Object.freeze([actionPacket.detail])
    }),
    sendGate: Object.freeze(detail.sendGate.map(toGateCheck)),
    escalationGate: Object.freeze(detail.escalationGate.map(toGateCheck)),
    deadlinePosture: deadlinePosture(detail),
    correspondence: Object.freeze({
      provider: correspondenceProvider(detail),
      syncState: correspondenceSyncState(detail),
      latestInbound: correspondenceLabel(detail.latestInboundCorrespondence, "No inbound correspondence in replayed events."),
      latestOutbound: correspondenceLabel(detail.latestOutboundCorrespondence, "No outbound correspondence in replayed events.")
    }),
    evidencePackets: Object.freeze(detail.evidencePackets.map(toEvidencePacket)),
    ...(detail.followUpDraft === undefined
      ? {}
      : {
          followUpDraft: Object.freeze({
            deadlineBasisLabel: `${detail.followUpDraft.deadlineBasis.source === "estimated" ? "Estimated" : "Confirmed"} deadline basis: ${detail.followUpDraft.deadlineBasis.deadlineDate}`,
            recipients: Object.freeze([...detail.followUpDraft.recipients]),
            subject: detail.followUpDraft.subject,
            body: detail.followUpDraft.body,
            citations: Object.freeze(detail.followUpDraft.citations.map((rule) => rule.citation)),
            attachmentEvidenceIds: Object.freeze([...detail.followUpDraft.attachmentEvidenceIds]),
            evidenceIds: Object.freeze([...detail.followUpDraft.evidenceIds]),
            providerState: detail.followUpDraft.providerState.detail
          })
        }),
    ...(detail.feeEstimate === undefined && detail.scopeNarrowing === undefined
      ? {}
      : {
          feeScopePressure: Object.freeze({
            ...(detail.feeEstimate === undefined
              ? {}
              : {
                  feeSummary: formatFeePressure(detail.feeEstimate),
                  ...(detail.feeEstimate.sourceEvidenceId === undefined
                    ? {}
                    : { feeEvidenceId: detail.feeEstimate.sourceEvidenceId })
                }),
            ...(detail.scopeNarrowing === undefined
              ? {}
              : {
                  proposedScope: detail.scopeNarrowing.proposedScope,
                  ...(detail.scopeNarrowing.acceptedScope === undefined
                    ? {}
                    : { acceptedScope: detail.scopeNarrowing.acceptedScope }),
                  ...(detail.scopeNarrowing.sourceEvidenceId === undefined
                    ? {}
                    : { scopeEvidenceId: detail.scopeNarrowing.sourceEvidenceId })
                })
          })
        }),
    productions: Object.freeze(
      detail.productionBatches.map((batch) =>
        Object.freeze({
          productionId: batch.productionId,
          label: batch.label,
          receivedAt: batch.receivedAt,
          evidenceIds: Object.freeze([...batch.evidenceIds])
        })
      )
    ),
    diagnostics: Object.freeze(detail.diagnostics.map((diagnostic) => diagnostic.message)),
    timeline: Object.freeze(detail.timeline.map((entry) => `${entry.type} at ${entry.occurredAt}`))
  });
}

function formatFeePressure(fee: NonNullable<PrrWorkspaceDtoRequestDetail["feeEstimate"]>): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: fee.currency
  }).format(fee.amountCents / 100);
  return fee.challenged ? `${amount} challenged` : `${amount} estimated`;
}

function toGateCheck(check: PrrWorkspaceDtoGateCheck): PrrGateCheck {
  return Object.freeze({
    id: check.id,
    label: check.id === "risk-review" ? "Risk flags" : check.label,
    complete: check.ready && !check.locked,
    locked: check.locked,
    detail: check.detail
  });
}

function toEvidencePacket(packet: PrrWorkspaceDtoRequestDetail["evidencePackets"][number]) {
  return Object.freeze({
    evidenceId: packet.id,
    title: packet.label,
    sourceArtifact: packet.evidenceIds.length > 0 ? packet.evidenceIds.join(", ") : "No evidence IDs",
    fileCount: packet.evidenceIds.length,
    hashState: packet.evidenceIds.length > 0 ? "Evidence references recorded" : "No hash reference",
    extractionState: packet.evidenceIds.length > 0 ? "Queued for extraction review" : "No extraction queued",
    classificationState: "Needs classification"
  });
}

function toBuilderStep(step: PrrWorkspaceData["builder"]["steps"][number]): PrrBuilderStep {
  return Object.freeze({
    id: step.id,
    label: step.label,
    state: step.status === "locked" ? "needs-review" : "ready",
    suggestedFills: Object.freeze(step.suggestedFills.map(toSuggestedFill))
  });
}

function toSuggestedFill(fill: PrrWorkspaceData["builder"]["steps"][number]["suggestedFills"][number]): PrrSuggestedFill {
  return Object.freeze({
    id: fill.fieldId,
    fieldLabel: fill.label,
    value: fill.value,
    provenance:
      fill.evidenceIds.length > 0
        ? `Suggested from evidence ${fill.evidenceIds.join(", ")}`
        : "No event-backed suggestion provenance yet."
  });
}

function getSavedView(savedViews: readonly PrrSavedView[], savedViewId: string): PrrSavedView {
  const activeView = savedViews.find((view) => view.id === savedViewId) ?? savedViews[0];
  if (activeView === undefined) {
    throw new Error("PRR workspace DTO must include at least one saved view.");
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

function buildSignalMap(
  dtoNodes: readonly PrrWorkspaceDtoSignalMapNode[],
  dtoEdges: readonly PrrWorkspaceDtoSignalMapEdge[],
  cards: readonly PrrRequestCard[]
): PrrSignalMapModel {
  const visibleRequestIds = new Set(cards.map((card) => card.prrRequestId));
  const nodes = dtoNodes
    .filter((node) => node.prrRequestIds.some((prrRequestId) => visibleRequestIds.has(prrRequestId)))
    .map(toSignalMapNode);
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = dtoEdges
    .filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
    .map(toSignalMapEdge);

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges)
  });
}

function toSignalMapNode(node: PrrWorkspaceDtoSignalMapNode, index: number): PrrSignalMapNode {
  const position = signalPositions[index % signalPositions.length] ?? signalPositions[0];
  if (position === undefined) {
    throw new Error("Requests signal map positions are unavailable.");
  }

  return Object.freeze({
    id: node.id,
    agencyId: node.id,
    agencyName: node.agencyName,
    tone: severityToTone(node.tone),
    x: position.x,
    y: position.y,
    summary: node.summary
  });
}

function toSignalMapEdge(edge: PrrWorkspaceDtoSignalMapEdge): PrrSignalMapEdge {
  return Object.freeze({
    id: edge.id,
    from: edge.sourceNodeId,
    to: edge.targetNodeId,
    label: edge.label,
    tone: "neutral"
  });
}

function cardMatchesView(card: PrrRequestCard, view: PrrSavedView): boolean {
  if (view.cardIds !== undefined && !view.cardIds.includes(card.prrRequestId)) {
    return false;
  }

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

function jurisdictionLabel(jurisdictionPackName: string): string {
  switch (jurisdictionPackName) {
    case "us-federal-foia":
      return "US Federal FOIA";
    case "florida-public-records":
      return "Florida Public Records";
    default:
      return jurisdictionPackName;
  }
}

function providerLabelForDetail(detail: PrrWorkspaceDtoRequestDetail | undefined): string {
  const correspondence = detail?.latestInboundCorrespondence ?? detail?.latestOutboundCorrespondence;
  if (correspondence === undefined) {
    return "No provider event";
  }

  return `${providerDisplayName(correspondence.provider)} replayed`;
}

function stallingStateForCard(card: PrrWorkspaceDtoCard): string {
  if (card.flags.includes("confirmed stalling")) {
    return "Confirmed stalling";
  }
  if (card.flags.includes("possible stalling")) {
    return "Possible stalling";
  }
  if (card.flags.includes("fee challenged")) {
    return "Fee challenge";
  }
  if (card.flags.includes("fee estimate")) {
    return "Fee estimate";
  }
  if (card.flags.includes("production arrived")) {
    return "Production received";
  }
  return "No stalling";
}

function fallbackActionPacket(detail: PrrWorkspaceDtoRequestDetail): PrrWorkspaceDtoActionPacket {
  return Object.freeze({
    id: `${detail.prrRequestId}:review`,
    prrRequestId: detail.prrRequestId,
    kind: "review-draft",
    label: "Review request",
    detail: "No action packet was supplied by the workspace DTO.",
    severity: detail.severity
  });
}

function requiredHumanDecision(packet: PrrWorkspaceDtoActionPacket): string {
  if (packet.kind === "legal-review") {
    return "A human must confirm any legal escalation language before use.";
  }
  if (packet.kind === "intake-production") {
    return "A human should classify received evidence before downstream use.";
  }
  return "A human review gate must be satisfied before send or escalation.";
}

function deadlinePosture(detail: PrrWorkspaceDtoRequestDetail): string {
  if (detail.activeDeadline === undefined) {
    return "No event-backed deadline estimate is available.";
  }

  const label = detail.activeDeadline.source === "confirmed" ? "Confirmed deadline" : "Estimated deadline";
  const explanation = detail.activeDeadline.explanation ?? detail.activeDeadline.rationale ?? "No deadline explanation recorded.";
  return `${label} ${detail.activeDeadline.deadlineDate}. ${explanation}`;
}

function correspondenceProvider(detail: PrrWorkspaceDtoRequestDetail): PrrProvider {
  return (detail.latestInboundCorrespondence ?? detail.latestOutboundCorrespondence)?.provider ?? "none";
}

function correspondenceSyncState(detail: PrrWorkspaceDtoRequestDetail): string {
  const correspondence = detail.latestInboundCorrespondence ?? detail.latestOutboundCorrespondence;
  if (correspondence === undefined) {
    return "No provider event in replayed DTO.";
  }

  return `${providerDisplayName(correspondence.provider)} correspondence replayed from ledger events.`;
}

function correspondenceLabel(
  correspondence: PrrWorkspaceDtoRequestDetail["latestInboundCorrespondence"],
  emptyLabel: string
): string {
  if (correspondence === undefined) {
    return emptyLabel;
  }

  return `${correspondence.subject} (${correspondence.occurredAt.slice(0, 10)})`;
}

function providerDisplayName(provider: string): string {
  switch (provider) {
    case "none":
      return "No provider event";
    case "gmail":
      return "Gmail";
    case "imap-smtp":
      return "IMAP/SMTP";
    case "himalaya":
      return "Himalaya";
    default:
      return provider;
  }
}

function severityToTone(severity: PrrWorkspaceDtoSeverity): PrrSignalTone {
  switch (severity) {
    case "critical":
      return "red";
    case "high":
      return "amber";
    case "medium":
      return "cyan";
    case "low":
      return "neutral";
  }
}

function deriveTitle(requestText: string): string {
  const trimmed = requestText.trim();
  if (trimmed.length <= 80) {
    return trimmed;
  }

  return `${trimmed.slice(0, 77)}...`;
}

function stableAgencyId(agencyName: string): string {
  return `agency:${[...new TextEncoder().encode(agencyName)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
