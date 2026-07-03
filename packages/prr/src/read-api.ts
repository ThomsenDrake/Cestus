import { floridaPublicRecordsPack, usFederalFoiaPack, type JurisdictionPack } from "./jurisdiction-packs.js";
import type { PrrDiagnostic } from "./diagnostics.js";
import type {
  PrrAppealReadModel,
  PrrCorrespondenceSummaryReadModel,
  PrrDeadlineReadModel,
  PrrDenialReadModel,
  PrrFeeEstimateReadModel,
  PrrJurisdictionPackRef,
  PrrProductionBatchReadModel,
  PrrProjection,
  PrrRequestReadModel,
  PrrScopeNarrowingReadModel,
  PrrStallingSignalReadModel,
  PrrTimelineEntry
} from "./projection.js";
import type { PrrStatus } from "./types.js";

export const prrWorkspaceDtoLaneOrder = [
  "drafting",
  "ready-to-send",
  "awaiting-agency",
  "needs-follow-up",
  "review-fee-scope",
  "production-arrived",
  "appeal-escalation"
] as const;

export type PrrWorkspaceDtoLaneId = (typeof prrWorkspaceDtoLaneOrder)[number];
export type PrrWorkspaceDtoSeverity = "low" | "medium" | "high" | "critical";
export type PrrWorkspaceDtoDueState = "none" | "upcoming" | "overdue";

export interface PrrWorkspaceDtoBuildOptions {
  readonly now?: string;
}

export interface PrrWorkspaceDto {
  readonly generatedAt: string;
  readonly savedViews: readonly PrrWorkspaceDtoSavedView[];
  readonly laneOrder: readonly PrrWorkspaceDtoLaneId[];
  readonly lanes: readonly PrrWorkspaceDtoLane[];
  readonly cards: readonly PrrWorkspaceDtoCard[];
  readonly requestDetails: readonly PrrWorkspaceDtoRequestDetail[];
  readonly gates: readonly PrrWorkspaceDtoGateSummary[];
  readonly actionPackets: readonly PrrWorkspaceDtoActionPacket[];
  readonly evidencePackets: readonly PrrWorkspaceDtoEvidencePacket[];
  readonly diagnostics: readonly PrrWorkspaceDtoDiagnostic[];
  readonly timeline: readonly PrrWorkspaceDtoTimelineEntry[];
  readonly signalMap: PrrWorkspaceDtoSignalMap;
  readonly builder: PrrWorkspaceDtoBuilderModel;
  readonly queueRows: readonly RequestQueueRow[];
}

export interface PrrWorkspaceDtoSavedView {
  readonly id: "all-active" | "overdue" | "florida-fees" | "productions-arrived";
  readonly label: string;
  readonly description: string;
  readonly cardIds: readonly string[];
}

export interface PrrWorkspaceDtoLane {
  readonly id: PrrWorkspaceDtoLaneId;
  readonly label: string;
  readonly cardIds: readonly string[];
  readonly agencyGroups: readonly PrrWorkspaceDtoAgencyGroup[];
}

export interface PrrWorkspaceDtoAgencyGroup {
  readonly agencyName: string;
  readonly tone: PrrWorkspaceDtoSeverity;
  readonly cardIds: readonly string[];
}

export interface PrrWorkspaceDtoCard {
  readonly prrRequestId: string;
  readonly agencyName: string;
  readonly jurisdictionPackName: string;
  readonly title: string;
  readonly status: PrrStatus;
  readonly laneId: PrrWorkspaceDtoLaneId;
  readonly severity: PrrWorkspaceDtoSeverity;
  readonly dueState: PrrWorkspaceDtoDueState;
  readonly productionCount: number;
  readonly actionLabel: string;
  readonly flags: readonly string[];
  readonly deadlineDate?: string;
  readonly deadlineSource?: "estimated" | "confirmed";
  readonly deadlineLabel?: string;
  readonly feeSignal?: string;
}

export interface PrrWorkspaceDtoRequestDetail {
  readonly prrRequestId: string;
  readonly agencyName: string;
  readonly jurisdictionPack: PrrJurisdictionPackRef;
  readonly agency: PrrRequestReadModel["agency"];
  readonly requester: PrrRequestReadModel["requester"];
  readonly requestText: string;
  readonly status: PrrStatus;
  readonly laneId: PrrWorkspaceDtoLaneId;
  readonly severity: PrrWorkspaceDtoSeverity;
  readonly actionPackets: readonly PrrWorkspaceDtoActionPacket[];
  readonly evidencePackets: readonly PrrWorkspaceDtoEvidencePacket[];
  readonly sendGate: readonly PrrWorkspaceDtoGateCheck[];
  readonly escalationGate: readonly PrrWorkspaceDtoGateCheck[];
  readonly diagnostics: readonly PrrWorkspaceDtoDiagnostic[];
  readonly timeline: readonly PrrWorkspaceDtoTimelineEntry[];
  readonly stallingSignals: readonly PrrStallingSignalReadModel[];
  readonly productionBatches: readonly PrrProductionBatchReadModel[];
  readonly latestOutboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  readonly latestInboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  readonly activeDeadline?: PrrDeadlineReadModel;
  readonly feeEstimate?: PrrFeeEstimateReadModel;
  readonly scopeNarrowing?: PrrScopeNarrowingReadModel;
  readonly denial?: PrrDenialReadModel;
  readonly appeal?: PrrAppealReadModel;
}

export interface PrrWorkspaceDtoGateSummary {
  readonly prrRequestId: string;
  readonly kind: "send" | "legal-escalation";
  readonly ready: boolean;
  readonly locked: boolean;
  readonly checks: readonly PrrWorkspaceDtoGateCheck[];
}

export interface PrrWorkspaceDtoGateCheck {
  readonly id: string;
  readonly label: string;
  readonly ready: boolean;
  readonly locked: boolean;
  readonly detail: string;
  readonly evidenceIds?: readonly string[];
}

export interface PrrWorkspaceDtoActionPacket {
  readonly id: string;
  readonly prrRequestId: string;
  readonly kind:
    | "review-draft"
    | "wait"
    | "follow-up"
    | "review-fee-scope"
    | "intake-production"
    | "legal-review";
  readonly label: string;
  readonly detail: string;
  readonly severity: PrrWorkspaceDtoSeverity;
}

export interface PrrWorkspaceDtoEvidencePacket {
  readonly id: string;
  readonly prrRequestId: string;
  readonly kind:
    | "outbound-correspondence"
    | "inbound-correspondence"
    | "fee"
    | "scope"
    | "production"
    | "denial"
    | "legal-escalation";
  readonly label: string;
  readonly evidenceIds: readonly string[];
}

export interface PrrWorkspaceDtoDiagnostic {
  readonly diagnosticId: string;
  readonly prrRequestId: string;
  readonly category: string;
  readonly message: string;
  readonly repairHint: {
    readonly violatedPath: string;
    readonly allowedActions: readonly string[];
  };
  readonly eventId?: string;
}

export interface PrrWorkspaceDtoTimelineEntry {
  readonly prrRequestId: string;
  readonly eventId: string;
  readonly type: PrrTimelineEntry["type"];
  readonly occurredAt: string;
  readonly payload: PrrTimelineEntry["payload"];
}

export interface PrrWorkspaceDtoSignalMap {
  readonly nodes: readonly PrrWorkspaceDtoSignalMapNode[];
  readonly edges: readonly PrrWorkspaceDtoSignalMapEdge[];
}

export interface PrrWorkspaceDtoSignalMapNode {
  readonly id: string;
  readonly agencyName: string;
  readonly tone: PrrWorkspaceDtoSeverity;
  readonly requestCount: number;
  readonly summary: string;
  readonly prrRequestIds: readonly string[];
}

export interface PrrWorkspaceDtoSignalMapEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly label: string;
  readonly evidenceIds: readonly string[];
}

export interface PrrWorkspaceDtoBuilderModel {
  readonly jurisdictionPacks: readonly PrrWorkspaceDtoBuilderPackOption[];
  readonly steps: readonly PrrWorkspaceDtoBuilderStep[];
}

export interface PrrWorkspaceDtoBuilderPackOption {
  readonly name: string;
  readonly version: string;
  readonly jurisdiction: string;
  readonly description: string;
  readonly agentGuidance: string;
  readonly rules: readonly PrrWorkspaceDtoBuilderRule[];
}

export interface PrrWorkspaceDtoBuilderRule {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly description: string;
  readonly citations: readonly {
    readonly label: string;
    readonly citation: string;
    readonly url: string;
  }[];
  readonly agentWarning: string;
}

export interface PrrWorkspaceDtoBuilderStep {
  readonly id:
    | "jurisdiction-pack"
    | "agency-contact"
    | "request-scope"
    | "delivery-channel"
    | "deadline-estimate"
    | "review-send-gate";
  readonly label: string;
  readonly status: "available" | "locked";
  readonly detail: string;
  readonly suggestedFills: readonly PrrWorkspaceDtoSuggestedFill[];
}

export interface PrrWorkspaceDtoSuggestedFill {
  readonly fieldId: string;
  readonly label: string;
  readonly value: string;
  readonly evidenceIds: readonly string[];
}

export interface RequestQueueRow {
  readonly prrRequestId: string;
  readonly agencyName: string;
  readonly status: PrrStatus;
  readonly possibleStalling: boolean;
  readonly confirmedStalling: boolean;
  readonly productionCount: number;
  readonly deadlineDate?: string;
  readonly deadlineSource?: "estimated" | "confirmed";
}

const laneLabels: Record<PrrWorkspaceDtoLaneId, string> = {
  drafting: "Drafting",
  "ready-to-send": "Ready to send",
  "awaiting-agency": "Awaiting agency",
  "needs-follow-up": "Needs follow-up",
  "review-fee-scope": "Review fee/scope",
  "production-arrived": "Production arrived",
  "appeal-escalation": "Appeal/escalation"
};

const severityRank: Record<PrrWorkspaceDtoSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function buildPrrWorkspaceDto(
  projection: PrrProjection,
  options: PrrWorkspaceDtoBuildOptions = {}
): PrrWorkspaceDto {
  const generatedAt = options.now ?? new Date().toISOString();
  const today = generatedAt.slice(0, 10);
  const requests = [...projection.requests.values()];
  const diagnostics = projection.diagnostics.map(toDiagnosticDto);
  const cards = sortCards(
    requests.map((request) => buildCard(request, today))
  );
  const requestsByCardOrder = cards.map((card) => requireRequest(projection, card.prrRequestId));
  const actionPackets = cards.map((card) =>
    buildActionPacket(requireRequest(projection, card.prrRequestId), card)
  );
  const evidencePackets = requestsByCardOrder.flatMap(buildEvidencePackets);
  const gates = requestsByCardOrder.flatMap((request) => [
    buildGateSummary(request.prrRequestId, "send", buildSendGate(request)),
    buildGateSummary(request.prrRequestId, "legal-escalation", buildEscalationGate(request))
  ]);
  const timeline = sortTimeline(
    requests.flatMap((request) =>
      projection.timelineForRequest(request.prrRequestId).map((entry) =>
        toTimelineDto(request.prrRequestId, entry)
      )
    )
  );
  const requestDetails = cards.map((card) => {
    const request = requireRequest(projection, card.prrRequestId);
    const detailDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.prrRequestId === request.prrRequestId
    );
    const detailTimeline = timeline.filter((entry) => entry.prrRequestId === request.prrRequestId);
    const detailActionPackets = actionPackets.filter(
      (packet) => packet.prrRequestId === request.prrRequestId
    );
    const detailEvidencePackets = evidencePackets.filter(
      (packet) => packet.prrRequestId === request.prrRequestId
    );

    return freezeRequestDetail({
      prrRequestId: request.prrRequestId,
      agencyName: request.agencyName,
      jurisdictionPack: request.jurisdictionPack,
      agency: request.agency,
      requester: request.requester,
      requestText: request.requestText,
      status: request.status,
      laneId: card.laneId,
      severity: card.severity,
      actionPackets: detailActionPackets,
      evidencePackets: detailEvidencePackets,
      sendGate: buildSendGate(request),
      escalationGate: buildEscalationGate(request),
      diagnostics: detailDiagnostics,
      timeline: detailTimeline,
      stallingSignals: request.stallingSignals,
      productionBatches: request.productionBatches,
      latestOutboundCorrespondence: request.latestOutboundCorrespondence,
      latestInboundCorrespondence: request.latestInboundCorrespondence,
      activeDeadline: request.activeDeadline,
      feeEstimate: request.feeEstimate,
      scopeNarrowing: request.scopeNarrowing,
      denial: request.denial,
      appeal: request.appeal
    });
  });

  return Object.freeze({
    generatedAt,
    savedViews: buildSavedViews(cards),
    laneOrder: Object.freeze([...prrWorkspaceDtoLaneOrder]),
    lanes: buildLanes(cards),
    cards: Object.freeze(cards),
    requestDetails: Object.freeze(requestDetails),
    gates: Object.freeze(gates),
    actionPackets: Object.freeze(actionPackets),
    evidencePackets: Object.freeze(evidencePackets),
    diagnostics: Object.freeze(diagnostics),
    timeline: Object.freeze(timeline),
    signalMap: buildSignalMap(cards),
    builder: buildBuilderModel(),
    queueRows: buildQueueRowsFromRequests(requests)
  });
}

export function buildRequestQueueRows(projection: PrrProjection): RequestQueueRow[] {
  return [...buildQueueRowsFromRequests([...projection.requests.values()])];
}

function buildCard(request: PrrRequestReadModel, today: string): PrrWorkspaceDtoCard {
  const laneId = deriveLaneId(request, today);
  const severity = deriveSeverity(request, today);
  const dueState = deriveDueState(request, today);
  const feeSignal = request.feeEstimate === undefined ? undefined : formatFeeSignal(request.feeEstimate);

  return Object.freeze({
    prrRequestId: request.prrRequestId,
    agencyName: request.agencyName,
    jurisdictionPackName: request.jurisdictionPack.name,
    title: deriveTitle(request),
    status: request.status,
    laneId,
    severity,
    dueState,
    productionCount: request.productionEvidenceIds.length,
    actionLabel: actionLabelForLane(laneId),
    flags: Object.freeze(buildCardFlags(request, dueState)),
    ...(request.activeDeadline === undefined
      ? {}
      : {
          deadlineDate: request.activeDeadline.deadlineDate,
          deadlineSource: request.activeDeadline.source,
          deadlineLabel: `${request.activeDeadline.source} ${request.activeDeadline.deadlineDate}`
        }),
    ...(feeSignal === undefined ? {} : { feeSignal })
  });
}

function deriveLaneId(request: PrrRequestReadModel, today: string): PrrWorkspaceDtoLaneId {
  if (
    request.denial !== undefined ||
    request.appeal !== undefined ||
    request.confirmedStalling ||
    request.legalEscalation !== undefined
  ) {
    return "appeal-escalation";
  }

  if (request.productionBatches.length > 0 && request.status !== "closed") {
    return "production-arrived";
  }

  if (request.feeEstimate !== undefined || request.scopeNarrowing !== undefined) {
    return "review-fee-scope";
  }

  if (request.status === "draft") {
    return "drafting";
  }

  if (request.possibleStalling || deriveDueState(request, today) === "overdue") {
    return "needs-follow-up";
  }

  if (request.status === "sent" || request.status === "acknowledged") {
    return "awaiting-agency";
  }

  return "awaiting-agency";
}

function deriveSeverity(request: PrrRequestReadModel, today: string): PrrWorkspaceDtoSeverity {
  if (request.confirmedStalling || request.legalEscalation !== undefined || request.appeal !== undefined) {
    return "critical";
  }

  if (
    request.denial !== undefined ||
    request.possibleStalling ||
    (request.status !== "draft" && deriveDueState(request, today) === "overdue") ||
    request.feeEstimate?.challenged === true
  ) {
    return "high";
  }

  if (
    request.productionBatches.length > 0 ||
    request.feeEstimate !== undefined ||
    request.scopeNarrowing !== undefined ||
    request.status === "sent" ||
    request.status === "acknowledged"
  ) {
    return "medium";
  }

  return "low";
}

function deriveDueState(request: PrrRequestReadModel, today: string): PrrWorkspaceDtoDueState {
  if (request.activeDeadline === undefined) {
    return "none";
  }

  return request.activeDeadline.deadlineDate < today ? "overdue" : "upcoming";
}

function deriveTitle(request: PrrRequestReadModel): string {
  const trimmed = request.requestText.trim();
  if (trimmed.length <= 80) {
    return trimmed;
  }

  return `${trimmed.slice(0, 77)}...`;
}

function actionLabelForLane(laneId: PrrWorkspaceDtoLaneId): string {
  switch (laneId) {
    case "drafting":
      return "Review draft";
    case "ready-to-send":
      return "Confirm send";
    case "awaiting-agency":
      return "Monitor response";
    case "needs-follow-up":
      return "Prepare follow-up";
    case "review-fee-scope":
      return "Review fee/scope";
    case "production-arrived":
      return "Intake production";
    case "appeal-escalation":
      return "Review legal posture";
  }
}

function buildCardFlags(
  request: PrrRequestReadModel,
  dueState: PrrWorkspaceDtoDueState
): string[] {
  const flags: string[] = [];
  if (dueState === "overdue" && request.status !== "draft") {
    flags.push("overdue");
  }
  if (request.feeEstimate !== undefined) {
    flags.push(request.feeEstimate.challenged ? "fee challenged" : "fee estimate");
  }
  if (request.scopeNarrowing !== undefined) {
    flags.push("scope narrowing");
  }
  if (request.productionBatches.length > 0) {
    flags.push("production arrived");
  }
  if (request.denial !== undefined) {
    flags.push("denial");
  }
  if (request.appeal !== undefined) {
    flags.push("appeal");
  }
  if (request.confirmedStalling) {
    flags.push("confirmed stalling");
  } else if (request.possibleStalling) {
    flags.push("possible stalling");
  }
  return flags;
}

function buildActionPacket(
  request: PrrRequestReadModel,
  card: PrrWorkspaceDtoCard
): PrrWorkspaceDtoActionPacket {
  switch (card.laneId) {
    case "drafting":
      return freezeActionPacket({
        id: `${request.prrRequestId}:review-draft`,
        prrRequestId: request.prrRequestId,
        kind: "review-draft",
        label: "Review draft request",
        detail: "Draft exists from replayed events; send readiness remains locked until event-backed review exists.",
        severity: card.severity
      });
    case "ready-to-send":
      return freezeActionPacket({
        id: `${request.prrRequestId}:ready-to-send`,
        prrRequestId: request.prrRequestId,
        kind: "review-draft",
        label: "Confirm send readiness",
        detail: "Send readiness is derived only from event-backed gate checks.",
        severity: card.severity
      });
    case "awaiting-agency":
      return freezeActionPacket({
        id: `${request.prrRequestId}:wait`,
        prrRequestId: request.prrRequestId,
        kind: "wait",
        label: "Await agency response",
        detail: "Monitor correspondence and deadline posture from replayed events.",
        severity: card.severity
      });
    case "needs-follow-up":
      return freezeActionPacket({
        id: `${request.prrRequestId}:follow-up`,
        prrRequestId: request.prrRequestId,
        kind: "follow-up",
        label: "Review follow-up posture",
        detail: "Deadline pressure or possible stalling requires human review before follow-up language.",
        severity: card.severity
      });
    case "review-fee-scope":
      return freezeActionPacket({
        id: `${request.prrRequestId}:review-fee-scope`,
        prrRequestId: request.prrRequestId,
        kind: "review-fee-scope",
        label: "Review fee or scope",
        detail: "Fee estimates, challenges, and narrowing proposals remain human-reviewed.",
        severity: card.severity
      });
    case "production-arrived":
      return freezeActionPacket({
        id: `${request.prrRequestId}:intake-production`,
        prrRequestId: request.prrRequestId,
        kind: "intake-production",
        label: "Intake production",
        detail: "Classify received evidence before using records in investigations.",
        severity: card.severity
      });
    case "appeal-escalation":
      return freezeActionPacket({
        id: `${request.prrRequestId}:legal-review`,
        prrRequestId: request.prrRequestId,
        kind: "legal-review",
        label: "Review appeal or escalation",
        detail: "Legal posture is visible but never autonomous.",
        severity: card.severity
      });
  }
}

function buildSendGate(request: PrrRequestReadModel): readonly PrrWorkspaceDtoGateCheck[] {
  const providerReady = request.latestOutboundCorrespondence !== undefined;
  return Object.freeze([
    freezeGateCheck({
      id: "draft-body",
      label: "Draft body",
      ready: false,
      locked: true,
      detail:
        request.requestText.trim().length > 0
          ? "Request text exists, but send readiness must be backed by an explicit review event."
          : "No request text is available from replay."
    }),
    freezeGateCheck({
      id: "recipient",
      label: "Recipient",
      ready: false,
      locked: true,
      detail:
        request.agency.email === undefined
          ? "Agency email is absent from replayed request state."
          : "Agency contact exists, but recipient readiness must be backed by an explicit review event."
    }),
    freezeGateCheck({
      id: "subject",
      label: "Subject",
      ready: false,
      locked: true,
      detail: "Subject readiness has no event-backed review in this slice."
    }),
    freezeGateCheck({
      id: "citations",
      label: "Citations",
      ready: false,
      locked: true,
      detail: "Jurisdiction citations are guidance only until reviewed for this draft."
    }),
    freezeGateCheck({
      id: "attachments",
      label: "Attachments",
      ready: false,
      locked: true,
      detail: "Attachment readiness requires explicit review event evidence."
    }),
    freezeGateCheck({
      id: "risk-review",
      label: "Risk review",
      ready: false,
      locked: true,
      detail: "Risk review cannot be inferred from request estimates."
    }),
    freezeGateCheck({
      id: "provider-ready",
      label: "Provider ready",
      ready: providerReady,
      locked: !providerReady,
      detail: providerReady
        ? "Outbound correspondence exists in replayed events."
        : "No outbound provider event proves send capability."
    })
  ]);
}

function buildEscalationGate(request: PrrRequestReadModel): readonly PrrWorkspaceDtoGateCheck[] {
  const hasConfirmedDeadlineBasis = request.activeDeadline?.source === "confirmed";
  const hasConfirmedStalling = request.confirmedStalling;
  const hasLegalEscalation = request.legalEscalation !== undefined;
  const legalEvidenceIds = request.legalEscalation?.evidenceIds ?? [];

  return Object.freeze([
    freezeGateCheck({
      id: "confirmed-deadline-or-stalling",
      label: "Confirmed basis",
      ready: hasConfirmedDeadlineBasis || hasConfirmedStalling,
      locked: !(hasConfirmedDeadlineBasis || hasConfirmedStalling),
      detail: hasConfirmedDeadlineBasis
        ? "A confirmed deadline exists in replayed events."
        : hasConfirmedStalling
          ? "User-confirmed stalling exists in replayed events."
          : "Estimated deadlines alone do not satisfy legal escalation."
    }),
    freezeGateCheck({
      id: "jurisdiction-guidance",
      label: "Jurisdiction guidance",
      ready: (request.legalEscalation?.citedRules.length ?? 0) > 0,
      locked: (request.legalEscalation?.citedRules.length ?? 0) === 0,
      detail:
        (request.legalEscalation?.citedRules.length ?? 0) > 0
          ? "Legal escalation cited rules are present in replayed events."
          : "No escalation-specific cited rules are present."
    }),
    freezeGateCheck({
      id: "correspondence-evidence",
      label: "Correspondence evidence",
      ready: legalEvidenceIds.length > 0,
      locked: legalEvidenceIds.length === 0,
      detail:
        legalEvidenceIds.length > 0
          ? "Escalation evidence IDs are present in replayed events."
          : "No escalation correspondence evidence is present.",
      ...(legalEvidenceIds.length === 0 ? {} : { evidenceIds: legalEvidenceIds })
    }),
    freezeGateCheck({
      id: "user-confirmed-escalation",
      label: "User confirmed escalation",
      ready: hasLegalEscalation,
      locked: !hasLegalEscalation,
      detail: hasLegalEscalation
        ? "A user-confirmed legal escalation event exists."
        : "Legal escalation requires an explicit user confirmation event."
    })
  ]);
}

function buildGateSummary(
  prrRequestId: string,
  kind: PrrWorkspaceDtoGateSummary["kind"],
  checks: readonly PrrWorkspaceDtoGateCheck[]
): PrrWorkspaceDtoGateSummary {
  const ready = checks.every((check) => check.ready);
  return Object.freeze({
    prrRequestId,
    kind,
    ready,
    locked: !ready || checks.some((check) => check.locked),
    checks: Object.freeze([...checks])
  });
}

function buildEvidencePackets(request: PrrRequestReadModel): PrrWorkspaceDtoEvidencePacket[] {
  const packets: PrrWorkspaceDtoEvidencePacket[] = [];

  if ((request.latestOutboundCorrespondence?.attachmentEvidenceIds?.length ?? 0) > 0) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:outbound-correspondence`,
        prrRequestId: request.prrRequestId,
        kind: "outbound-correspondence",
        label: "Outbound attachments",
        evidenceIds: request.latestOutboundCorrespondence?.attachmentEvidenceIds ?? []
      })
    );
  }

  if ((request.latestInboundCorrespondence?.evidenceIds.length ?? 0) > 0) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:inbound-correspondence`,
        prrRequestId: request.prrRequestId,
        kind: "inbound-correspondence",
        label: "Inbound correspondence evidence",
        evidenceIds: request.latestInboundCorrespondence?.evidenceIds ?? []
      })
    );
  }

  if (request.feeEstimate?.sourceEvidenceId !== undefined) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:fee`,
        prrRequestId: request.prrRequestId,
        kind: "fee",
        label: "Fee evidence",
        evidenceIds: [request.feeEstimate.sourceEvidenceId]
      })
    );
  }

  if (request.scopeNarrowing?.sourceEvidenceId !== undefined) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:scope`,
        prrRequestId: request.prrRequestId,
        kind: "scope",
        label: "Scope narrowing evidence",
        evidenceIds: [request.scopeNarrowing.sourceEvidenceId]
      })
    );
  }

  for (const batch of request.productionBatches) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:production:${batch.productionId}`,
        prrRequestId: request.prrRequestId,
        kind: "production",
        label: batch.label,
        evidenceIds: batch.evidenceIds
      })
    );
  }

  if (request.denial?.sourceEvidenceId !== undefined) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:denial`,
        prrRequestId: request.prrRequestId,
        kind: "denial",
        label: "Denial evidence",
        evidenceIds: [request.denial.sourceEvidenceId]
      })
    );
  }

  if ((request.legalEscalation?.evidenceIds.length ?? 0) > 0) {
    packets.push(
      freezeEvidencePacket({
        id: `${request.prrRequestId}:legal-escalation`,
        prrRequestId: request.prrRequestId,
        kind: "legal-escalation",
        label: "Escalation evidence",
        evidenceIds: request.legalEscalation?.evidenceIds ?? []
      })
    );
  }

  return packets;
}

function buildSavedViews(cards: readonly PrrWorkspaceDtoCard[]): readonly PrrWorkspaceDtoSavedView[] {
  return Object.freeze([
    freezeSavedView({
      id: "all-active",
      label: "All active",
      description: "All open requests from replayed PRR state.",
      cardIds: cards.filter((card) => card.status !== "closed").map((card) => card.prrRequestId)
    }),
    freezeSavedView({
      id: "overdue",
      label: "Overdue",
      description: "Requests with overdue non-draft deadline posture.",
      cardIds: cards
        .filter((card) => card.dueState === "overdue" && card.status !== "draft")
        .map((card) => card.prrRequestId)
    }),
    freezeSavedView({
      id: "florida-fees",
      label: "Florida fees",
      description: "Florida requests with replayed fee pressure.",
      cardIds: cards
        .filter(
          (card) =>
            card.jurisdictionPackName === "florida-public-records" &&
            card.feeSignal !== undefined &&
            card.flags.some((flag) => flag.includes("fee"))
        )
        .map((card) => card.prrRequestId)
    }),
    freezeSavedView({
      id: "productions-arrived",
      label: "Productions arrived",
      description: "Requests with replayed production batches.",
      cardIds: cards.filter((card) => card.productionCount > 0).map((card) => card.prrRequestId)
    })
  ]);
}

function buildLanes(cards: readonly PrrWorkspaceDtoCard[]): readonly PrrWorkspaceDtoLane[] {
  return Object.freeze(
    prrWorkspaceDtoLaneOrder.map((laneId) => {
      const laneCards = cards.filter((card) => card.laneId === laneId);
      return Object.freeze({
        id: laneId,
        label: laneLabels[laneId],
        cardIds: Object.freeze(laneCards.map((card) => card.prrRequestId)),
        agencyGroups: buildAgencyGroups(laneCards)
      });
    })
  );
}

function buildAgencyGroups(cards: readonly PrrWorkspaceDtoCard[]): readonly PrrWorkspaceDtoAgencyGroup[] {
  const cardsByAgency = new Map<string, PrrWorkspaceDtoCard[]>();
  for (const card of cards) {
    const agencyCards = cardsByAgency.get(card.agencyName) ?? [];
    agencyCards.push(card);
    cardsByAgency.set(card.agencyName, agencyCards);
  }

  return Object.freeze(
    [...cardsByAgency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([agencyName, agencyCards]) =>
        Object.freeze({
          agencyName,
          tone: highestSeverity(agencyCards.map((card) => card.severity)),
          cardIds: Object.freeze(agencyCards.map((card) => card.prrRequestId))
        })
      )
  );
}

function buildSignalMap(cards: readonly PrrWorkspaceDtoCard[]): PrrWorkspaceDtoSignalMap {
  const cardsByAgency = new Map<string, PrrWorkspaceDtoCard[]>();
  for (const card of cards) {
    const agencyCards = cardsByAgency.get(card.agencyName) ?? [];
    agencyCards.push(card);
    cardsByAgency.set(card.agencyName, agencyCards);
  }

  const nodes = [...cardsByAgency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agencyName, agencyCards]) => {
      const tone = highestSeverity(agencyCards.map((card) => card.severity));
      return Object.freeze({
        id: signalNodeId(agencyName),
        agencyName,
        tone,
        requestCount: agencyCards.length,
        summary: `${agencyCards.length} visible request${agencyCards.length === 1 ? "" : "s"}; highest posture ${tone}.`,
        prrRequestIds: Object.freeze(agencyCards.map((card) => card.prrRequestId))
      });
    });

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze([])
  });
}

function buildBuilderModel(): PrrWorkspaceDtoBuilderModel {
  return Object.freeze({
    jurisdictionPacks: Object.freeze(
      [usFederalFoiaPack, floridaPublicRecordsPack].map(toBuilderPackOption)
    ),
    steps: Object.freeze([
      freezeBuilderStep({
        id: "jurisdiction-pack",
        label: "Jurisdiction pack",
        status: "available",
        detail: "Choose a shipped jurisdiction pack before drafting request language."
      }),
      freezeBuilderStep({
        id: "agency-contact",
        label: "Agency/contact",
        status: "available",
        detail: "Capture agency and requester contact facts for replayable draft creation."
      }),
      freezeBuilderStep({
        id: "request-scope",
        label: "Request scope",
        status: "available",
        detail: "Write the records request text that will be committed as draft state."
      }),
      freezeBuilderStep({
        id: "delivery-channel",
        label: "Delivery channel",
        status: "available",
        detail: "Select delivery metadata for future correspondence review."
      }),
      freezeBuilderStep({
        id: "deadline-estimate",
        label: "Deadline estimate",
        status: "available",
        detail: "Use jurisdiction pack rules to create a workflow or statutory estimate."
      }),
      freezeBuilderStep({
        id: "review-send-gate",
        label: "Review/send gate",
        status: "locked",
        detail: "Sending remains locked until event-backed readiness exists."
      })
    ])
  });
}

function toBuilderPackOption(pack: JurisdictionPack): PrrWorkspaceDtoBuilderPackOption {
  return Object.freeze({
    name: pack.name,
    version: pack.version,
    jurisdiction: pack.jurisdiction,
    description: pack.description,
    agentGuidance: pack.agentGuidance,
    rules: Object.freeze(
      pack.rules.map((rule) =>
        Object.freeze({
          id: rule.id,
          label: rule.label,
          kind: rule.kind,
          description: rule.description,
          citations: Object.freeze(rule.citations.map((citation) => Object.freeze({ ...citation }))),
          agentWarning: rule.agentWarning
        })
      )
    )
  });
}

function buildQueueRowsFromRequests(requests: readonly PrrRequestReadModel[]): readonly RequestQueueRow[] {
  return Object.freeze(
    [...requests]
      .sort((left, right) => left.prrRequestId.localeCompare(right.prrRequestId))
      .map((request) =>
        Object.freeze({
          prrRequestId: request.prrRequestId,
          agencyName: request.agencyName,
          status: request.status,
          ...(request.activeDeadline === undefined
            ? {}
            : {
                deadlineDate: request.activeDeadline.deadlineDate,
                deadlineSource: request.activeDeadline.source
              }),
          possibleStalling: request.possibleStalling,
          confirmedStalling: request.confirmedStalling,
          productionCount: request.productionEvidenceIds.length
        })
      )
  );
}

function sortCards(cards: readonly PrrWorkspaceDtoCard[]): PrrWorkspaceDtoCard[] {
  return [...cards].sort(compareCards);
}

function compareCards(left: PrrWorkspaceDtoCard, right: PrrWorkspaceDtoCard): number {
  return (
    prrWorkspaceDtoLaneOrder.indexOf(left.laneId) - prrWorkspaceDtoLaneOrder.indexOf(right.laneId) ||
    left.agencyName.localeCompare(right.agencyName) ||
    severityRank[left.severity] - severityRank[right.severity] ||
    deadlineSortValue(left).localeCompare(deadlineSortValue(right)) ||
    left.prrRequestId.localeCompare(right.prrRequestId)
  );
}

function sortTimeline(entries: readonly PrrWorkspaceDtoTimelineEntry[]): readonly PrrWorkspaceDtoTimelineEntry[] {
  return Object.freeze(
    [...entries].sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.prrRequestId.localeCompare(right.prrRequestId) ||
        left.eventId.localeCompare(right.eventId)
    )
  );
}

function deadlineSortValue(card: PrrWorkspaceDtoCard): string {
  return card.deadlineDate ?? "9999-12-31";
}

function highestSeverity(severities: readonly PrrWorkspaceDtoSeverity[]): PrrWorkspaceDtoSeverity {
  return [...severities].sort((left, right) => severityRank[left] - severityRank[right])[0] ?? "low";
}

function formatFeeSignal(feeEstimate: PrrFeeEstimateReadModel): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: feeEstimate.currency
  }).format(feeEstimate.amountCents / 100);

  return feeEstimate.challenged ? `${amount} challenged` : amount;
}

function signalNodeId(agencyName: string): string {
  return `agency:${utf8Hex(agencyName)}`;
}

function toDiagnosticDto(diagnostic: PrrDiagnostic): PrrWorkspaceDtoDiagnostic {
  return Object.freeze({
    diagnosticId: diagnostic.diagnosticId,
    prrRequestId: diagnostic.prrRequestId,
    category: diagnostic.category,
    message: diagnostic.message,
    repairHint: Object.freeze({
      violatedPath: diagnostic.repairHint.violatedPath,
      allowedActions: Object.freeze([...diagnostic.repairHint.allowedActions])
    }),
    ...(diagnostic.eventId === undefined ? {} : { eventId: diagnostic.eventId })
  });
}

function toTimelineDto(
  prrRequestId: string,
  entry: PrrTimelineEntry
): PrrWorkspaceDtoTimelineEntry {
  return Object.freeze({
    prrRequestId,
    eventId: entry.eventId,
    type: entry.type,
    occurredAt: entry.occurredAt,
    payload: deepFreezeClone(entry.payload)
  });
}

function requireRequest(projection: PrrProjection, prrRequestId: string): PrrRequestReadModel {
  const request = projection.requests.get(prrRequestId);
  if (request === undefined) {
    throw new Error(`Projection card references missing request ${prrRequestId}`);
  }
  return request;
}

function freezeRequestDetail(
  detail: Omit<PrrWorkspaceDtoRequestDetail, "latestOutboundCorrespondence" | "latestInboundCorrespondence" | "activeDeadline" | "feeEstimate" | "scopeNarrowing" | "denial" | "appeal"> & {
    readonly latestOutboundCorrespondence?: PrrCorrespondenceSummaryReadModel | undefined;
    readonly latestInboundCorrespondence?: PrrCorrespondenceSummaryReadModel | undefined;
    readonly activeDeadline?: PrrDeadlineReadModel | undefined;
    readonly feeEstimate?: PrrFeeEstimateReadModel | undefined;
    readonly scopeNarrowing?: PrrScopeNarrowingReadModel | undefined;
    readonly denial?: PrrDenialReadModel | undefined;
    readonly appeal?: PrrAppealReadModel | undefined;
  }
): PrrWorkspaceDtoRequestDetail {
  return Object.freeze({
    prrRequestId: detail.prrRequestId,
    agencyName: detail.agencyName,
    jurisdictionPack: deepFreezeClone(detail.jurisdictionPack),
    agency: deepFreezeClone(detail.agency),
    requester: deepFreezeClone(detail.requester),
    requestText: detail.requestText,
    status: detail.status,
    laneId: detail.laneId,
    severity: detail.severity,
    actionPackets: Object.freeze([...detail.actionPackets]),
    evidencePackets: Object.freeze([...detail.evidencePackets]),
    sendGate: Object.freeze([...detail.sendGate]),
    escalationGate: Object.freeze([...detail.escalationGate]),
    diagnostics: Object.freeze([...detail.diagnostics]),
    timeline: Object.freeze([...detail.timeline]),
    stallingSignals: deepFreezeClone(detail.stallingSignals),
    productionBatches: deepFreezeClone(detail.productionBatches),
    ...(detail.latestOutboundCorrespondence === undefined
      ? {}
      : { latestOutboundCorrespondence: deepFreezeClone(detail.latestOutboundCorrespondence) }),
    ...(detail.latestInboundCorrespondence === undefined
      ? {}
      : { latestInboundCorrespondence: deepFreezeClone(detail.latestInboundCorrespondence) }),
    ...(detail.activeDeadline === undefined ? {} : { activeDeadline: deepFreezeClone(detail.activeDeadline) }),
    ...(detail.feeEstimate === undefined ? {} : { feeEstimate: deepFreezeClone(detail.feeEstimate) }),
    ...(detail.scopeNarrowing === undefined ? {} : { scopeNarrowing: deepFreezeClone(detail.scopeNarrowing) }),
    ...(detail.denial === undefined ? {} : { denial: deepFreezeClone(detail.denial) }),
    ...(detail.appeal === undefined ? {} : { appeal: deepFreezeClone(detail.appeal) })
  });
}

function freezeSavedView(view: PrrWorkspaceDtoSavedView): PrrWorkspaceDtoSavedView {
  return Object.freeze({
    id: view.id,
    label: view.label,
    description: view.description,
    cardIds: Object.freeze([...view.cardIds])
  });
}

function freezeActionPacket(packet: PrrWorkspaceDtoActionPacket): PrrWorkspaceDtoActionPacket {
  return Object.freeze({ ...packet });
}

function freezeEvidencePacket(packet: PrrWorkspaceDtoEvidencePacket): PrrWorkspaceDtoEvidencePacket {
  return Object.freeze({
    ...packet,
    evidenceIds: Object.freeze([...packet.evidenceIds])
  });
}

function freezeGateCheck(check: PrrWorkspaceDtoGateCheck): PrrWorkspaceDtoGateCheck {
  return Object.freeze({
    id: check.id,
    label: check.label,
    ready: check.ready,
    locked: check.locked,
    detail: check.detail,
    ...(check.evidenceIds === undefined ? {} : { evidenceIds: Object.freeze([...check.evidenceIds]) })
  });
}

function freezeBuilderStep(
  step: Omit<PrrWorkspaceDtoBuilderStep, "suggestedFills"> & {
    readonly suggestedFills?: readonly PrrWorkspaceDtoSuggestedFill[];
  }
): PrrWorkspaceDtoBuilderStep {
  return Object.freeze({
    id: step.id,
    label: step.label,
    status: step.status,
    detail: step.detail,
    suggestedFills: Object.freeze([...(step.suggestedFills ?? [])])
  });
}

function utf8Hex(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function deepFreezeClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepFreezeClone(item))) as T;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => [
      key,
      deepFreezeClone(entryValue)
    ]);
    return Object.freeze(Object.fromEntries(entries)) as T;
  }

  return value;
}
