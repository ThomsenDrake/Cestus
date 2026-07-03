import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { createPrrDiagnostic, type PrrDiagnostic } from "./diagnostics.js";
import type { CorrespondenceProvider, PrrStatus } from "./types.js";

export interface PrrJurisdictionPackRef {
  readonly name: string;
  readonly version: string;
}

export interface PrrContactReadModel {
  readonly name: string;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}

export interface PrrCitedRuleReadModel {
  readonly jurisdictionPack: PrrJurisdictionPackRef;
  readonly label: string;
  readonly citation: string;
  readonly url?: string | undefined;
}

export interface PrrDeadlineReadModel {
  readonly deadlineDate: string;
  readonly source: "estimated" | "confirmed";
  readonly confidence?: "statutory" | "workflow" | undefined;
  readonly explanation?: string | undefined;
  readonly confirmedBy?: string | undefined;
  readonly rationale?: string | undefined;
  readonly citedRules: readonly PrrCitedRuleReadModel[];
}

export interface PrrCorrespondenceSummaryReadModel {
  readonly correspondenceId: string;
  readonly provider: CorrespondenceProvider;
  readonly providerMessageId: string;
  readonly providerThreadId?: string | undefined;
  readonly subject: string;
  readonly occurredAt: string;
  readonly bodyHash?: string | undefined;
  readonly evidenceIds: readonly string[];
  readonly attachmentEvidenceIds?: readonly string[] | undefined;
  readonly approvedBy?: string | undefined;
  readonly from?: PrrContactReadModel | undefined;
  readonly rawMetadata?: Readonly<Record<string, string>> | undefined;
}

export interface PrrFeeEstimateReadModel {
  readonly amountCents: number;
  readonly currency: string;
  readonly sourceEvidenceId?: string | undefined;
  readonly challenged: boolean;
  readonly challengeId?: string | undefined;
  readonly challengeAmountCents?: number | undefined;
  readonly rationale?: string | undefined;
  readonly approvedBy?: string | undefined;
  readonly citedRules: readonly PrrCitedRuleReadModel[];
}

export interface PrrScopeNarrowingReadModel {
  readonly narrowingId: string;
  readonly proposedScope: string;
  readonly proposedBy: string;
  readonly sourceEvidenceId?: string | undefined;
  readonly acceptedScope?: string | undefined;
  readonly acceptedBy?: string | undefined;
  readonly rationale?: string | undefined;
}

export interface PrrProductionBatchReadModel {
  readonly productionId: string;
  readonly label: string;
  readonly receivedAt: string;
  readonly evidenceIds: readonly string[];
}

export interface PrrExemptionReadModel {
  readonly exemptionId: string;
  readonly claimedBy: string;
  readonly citedRules: readonly PrrCitedRuleReadModel[];
  readonly sourceEvidenceId?: string | undefined;
}

export interface PrrDenialReadModel {
  readonly denialId: string;
  readonly receivedAt: string;
  readonly reason: string;
  readonly sourceEvidenceId?: string | undefined;
}

export interface PrrAppealReadModel {
  readonly appealId: string;
  readonly correspondenceId: string;
  readonly filedAt: string;
  readonly approvedBy: string;
  readonly citedRules: readonly PrrCitedRuleReadModel[];
}

export interface PrrStallingSignalReadModel {
  readonly kind:
    | "deadline-breached"
    | "repeated-vague-delays"
    | "high-fee-estimate"
    | "silence-after-followup"
    | "narrowing-pressure"
    | "exemption-review-needed";
  readonly explanation: string;
}

export interface PrrStallingConfirmationReadModel {
  readonly confirmedBy: string;
  readonly rationale: string;
  readonly signalKinds: readonly PrrStallingSignalReadModel["kind"][];
}

export interface PrrLegalEscalationReadModel {
  readonly confirmedBy: string;
  readonly rationale: string;
  readonly citedRules: readonly PrrCitedRuleReadModel[];
  readonly evidenceIds: readonly string[];
}

export interface PrrRequestReadModel {
  readonly prrRequestId: string;
  readonly status: PrrStatus;
  readonly agencyName: string;
  readonly jurisdictionPack?: PrrJurisdictionPackRef;
  readonly agency?: PrrContactReadModel;
  readonly requester?: PrrContactReadModel;
  readonly requestText?: string;
  readonly activeDeadline?: PrrDeadlineReadModel;
  readonly latestOutboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  readonly latestInboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  readonly feeEstimate?: PrrFeeEstimateReadModel;
  readonly scopeNarrowing?: PrrScopeNarrowingReadModel;
  readonly productionBatches?: readonly PrrProductionBatchReadModel[];
  readonly productionEvidenceIds: readonly string[];
  readonly exemptions?: readonly PrrExemptionReadModel[];
  readonly denial?: PrrDenialReadModel;
  readonly appeal?: PrrAppealReadModel;
  readonly possibleStalling: boolean;
  readonly confirmedStalling: boolean;
  readonly stallingSignals?: readonly PrrStallingSignalReadModel[];
  readonly stallingConfirmation?: PrrStallingConfirmationReadModel;
  readonly legalEscalation?: PrrLegalEscalationReadModel;
}

export interface PrrTimelineEntry {
  readonly eventId: string;
  readonly type: KnowledgeEvent["type"];
  readonly occurredAt: string;
  readonly payload: KnowledgeEvent["payload"];
}

export interface PrrProjection {
  requests: ReadonlyMap<string, PrrRequestReadModel>;
  diagnostics: readonly PrrDiagnostic[];
  timelineForRequest(prrRequestId: string): PrrTimelineEntry[];
}

interface MutablePrrRequestReadModel {
  prrRequestId: string;
  status: PrrStatus;
  agencyName: string;
  jurisdictionPack: PrrJurisdictionPackRef;
  agency: PrrContactReadModel;
  requester: PrrContactReadModel;
  requestText: string;
  activeDeadline?: PrrDeadlineReadModel;
  latestOutboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  latestInboundCorrespondence?: PrrCorrespondenceSummaryReadModel;
  feeEstimate?: PrrFeeEstimateReadModel;
  scopeNarrowing?: PrrScopeNarrowingReadModel;
  productionBatches: PrrProductionBatchReadModel[];
  productionEvidenceIds: string[];
  exemptions: PrrExemptionReadModel[];
  denial?: PrrDenialReadModel;
  appeal?: PrrAppealReadModel;
  possibleStalling: boolean;
  confirmedStalling: boolean;
  stallingSignals: PrrStallingSignalReadModel[];
  stallingConfirmation?: PrrStallingConfirmationReadModel;
  legalEscalation?: PrrLegalEscalationReadModel;
}

export function buildPrrProjection(events: readonly KnowledgeEvent[]): PrrProjection {
  const requests = new Map<string, MutablePrrRequestReadModel>();
  const timelines = new Map<string, PrrTimelineEntry[]>();
  const diagnostics: PrrDiagnostic[] = [];

  for (const event of events) {
    const prrRequestId = requestIdFromPrrEvent(event);
    if (!prrRequestId) {
      continue;
    }

    if (event.type === "prr.request.created") {
      requests.set(prrRequestId, {
        prrRequestId,
        status: "draft",
        agencyName: event.payload.agency.name,
        jurisdictionPack: cloneJurisdictionPackRef(event.payload.jurisdictionPack),
        agency: cloneContact(event.payload.agency),
        requester: cloneContact(event.payload.requester),
        requestText: event.payload.requestText,
        possibleStalling: false,
        confirmedStalling: false,
        stallingSignals: [],
        productionBatches: [],
        productionEvidenceIds: [],
        exemptions: []
      });
      appendTimelineEntry(timelines, prrRequestId, event);
      continue;
    }

    const request = requests.get(prrRequestId);
    if (!request) {
      diagnostics.push(createUncreatedRequestDiagnostic(event, prrRequestId));
      continue;
    }

    appendTimelineEntry(timelines, prrRequestId, event);
    applyPrrEvent(request, event);
  }

  return {
    requests: cloneRequests(requests),
    diagnostics: cloneDiagnostics(diagnostics),
    timelineForRequest(prrRequestId) {
      return (timelines.get(prrRequestId) ?? []).map(cloneTimelineEntry);
    }
  };
}

function createUncreatedRequestDiagnostic(event: KnowledgeEvent, prrRequestId: string): PrrDiagnostic {
  return createPrrDiagnostic({
    diagnosticId: `diag_prr_projection_${event.id}`,
    prrRequestId,
    eventId: event.id,
    category: "projection",
    message: `Cannot project ${event.type} before prr.request.created`,
    violatedPath: "prr.request.created",
    allowedActions: ["replay a ledger containing prr.request.created before dependent PRR events"]
  });
}

function applyPrrEvent(request: MutablePrrRequestReadModel, event: KnowledgeEvent): void {
  switch (event.type) {
    case "prr.request.created":
      break;

    case "prr.request.sent":
      request.status = "sent";
      request.latestOutboundCorrespondence = freezeCorrespondenceSummary({
        correspondenceId: event.payload.correspondenceId,
        provider: event.payload.provider,
        providerMessageId: event.payload.providerMessageId,
        providerThreadId: event.payload.providerThreadId,
        subject: event.payload.subject,
        occurredAt: event.payload.sentAt,
        bodyHash: event.payload.bodyHash,
        evidenceIds: [],
        attachmentEvidenceIds: event.payload.attachmentEvidenceIds,
        approvedBy: event.payload.approvedBy,
        rawMetadata: event.payload.rawMetadata
      });
      break;

    case "prr.correspondence.received":
      request.status = "acknowledged";
      request.latestInboundCorrespondence = freezeCorrespondenceSummary({
        correspondenceId: event.payload.correspondenceId,
        provider: event.payload.provider,
        providerMessageId: event.payload.providerMessageId,
        providerThreadId: event.payload.providerThreadId,
        subject: event.payload.subject,
        occurredAt: event.payload.receivedAt,
        bodyHash: event.payload.bodyHash,
        evidenceIds: event.payload.evidenceIds,
        from: event.payload.from
      });
      break;

    case "prr.deadline.estimated":
      if (request.activeDeadline?.source !== "confirmed") {
        request.activeDeadline = freezeDeadline({
          deadlineDate: event.payload.deadlineDate,
          source: "estimated",
          confidence: event.payload.confidence,
          explanation: event.payload.explanation,
          citedRules: event.payload.citedRules
        });
      }
      break;

    case "prr.deadline.confirmed":
      request.activeDeadline = freezeDeadline({
        deadlineDate: event.payload.deadlineDate,
        source: "confirmed",
        confirmedBy: event.payload.confirmedBy,
        rationale: event.payload.rationale,
        citedRules: event.payload.citedRules
      });
      break;

    case "prr.fee.estimated":
      request.status = "inNegotiation";
      request.feeEstimate = freezeFeeEstimate({
        amountCents: event.payload.amountCents,
        currency: event.payload.currency,
        sourceEvidenceId: event.payload.sourceEvidenceId,
        challenged: false,
        citedRules: []
      });
      break;

    case "prr.fee.challenged":
      request.status = "inNegotiation";
      request.feeEstimate = freezeFeeEstimate({
        amountCents: request.feeEstimate?.amountCents ?? event.payload.amountCents,
        currency: request.feeEstimate?.currency ?? "USD",
        sourceEvidenceId: request.feeEstimate?.sourceEvidenceId,
        challenged: true,
        challengeId: event.payload.feeChallengeId,
        challengeAmountCents: event.payload.amountCents,
        rationale: event.payload.rationale,
        approvedBy: event.payload.approvedBy,
        citedRules: event.payload.citedRules
      });
      break;

    case "prr.scope.narrowing.proposed":
      request.status = "inNegotiation";
      request.scopeNarrowing = freezeScopeNarrowing({
        narrowingId: event.payload.narrowingId,
        proposedScope: event.payload.proposedScope,
        proposedBy: event.payload.proposedBy,
        sourceEvidenceId: event.payload.sourceEvidenceId
      });
      break;

    case "prr.scope.narrowing.accepted":
      request.status = "inNegotiation";
      request.scopeNarrowing = freezeScopeNarrowing({
        narrowingId: event.payload.narrowingId,
        proposedScope: request.scopeNarrowing?.proposedScope ?? "",
        proposedBy: request.scopeNarrowing?.proposedBy ?? "",
        sourceEvidenceId: request.scopeNarrowing?.sourceEvidenceId,
        acceptedScope: event.payload.acceptedScope,
        acceptedBy: event.payload.acceptedBy,
        rationale: event.payload.rationale
      });
      break;

    case "prr.production.received": {
      request.status = "awaitingProduction";
      const batch = freezeProductionBatch({
        productionId: event.payload.productionId,
        label: event.payload.label,
        receivedAt: event.payload.receivedAt,
        evidenceIds: event.payload.evidenceIds
      });
      request.productionBatches.push(batch);
      request.productionEvidenceIds.push(...event.payload.evidenceIds);
      break;
    }

    case "prr.exemption.claimed":
      request.exemptions.push(
        freezeExemption({
          exemptionId: event.payload.exemptionId,
          claimedBy: event.payload.claimedBy,
          citedRules: event.payload.citedRules,
          sourceEvidenceId: event.payload.sourceEvidenceId
        })
      );
      break;

    case "prr.denial.recorded":
      request.status = "denied";
      request.denial = freezeDenial({
        denialId: event.payload.denialId,
        receivedAt: event.payload.receivedAt,
        reason: event.payload.reason,
        sourceEvidenceId: event.payload.sourceEvidenceId
      });
      break;

    case "prr.appeal.created":
      request.status = "appealed";
      request.appeal = freezeAppeal({
        appealId: event.payload.appealId,
        correspondenceId: event.payload.correspondenceId,
        filedAt: event.payload.filedAt,
        approvedBy: event.payload.approvedBy,
        citedRules: event.payload.citedRules
      });
      break;

    case "prr.stalling.detected":
      request.possibleStalling = true;
      request.stallingSignals = event.payload.signals.map(freezeStallingSignal);
      break;

    case "prr.stalling.confirmed":
      request.confirmedStalling = true;
      request.stallingConfirmation = freezeStallingConfirmation({
        confirmedBy: event.payload.confirmedBy,
        rationale: event.payload.rationale,
        signalKinds: event.payload.signalKinds
      });
      break;

    case "prr.legal-escalation.confirmed":
      request.legalEscalation = freezeLegalEscalation({
        confirmedBy: event.payload.confirmedBy,
        rationale: event.payload.rationale,
        citedRules: event.payload.citedRules,
        evidenceIds: event.payload.evidenceIds
      });
      break;

    case "prr.request.closed":
      request.status = "closed";
      break;

    default:
      break;
  }
}

function appendTimelineEntry(
  timelines: Map<string, PrrTimelineEntry[]>,
  prrRequestId: string,
  event: KnowledgeEvent
): void {
  const timeline = timelines.get(prrRequestId) ?? [];
  timeline.push(
    Object.freeze({
      eventId: event.id,
      type: event.type,
      occurredAt: event.context.occurredAt,
      payload: deepFreezeClone(event.payload)
    })
  );
  timelines.set(prrRequestId, timeline);
}

function requestIdFromPrrEvent(event: KnowledgeEvent): string | undefined {
  if (!event.type.startsWith("prr.")) {
    return undefined;
  }
  return "prrRequestId" in event.payload ? event.payload.prrRequestId : undefined;
}

function cloneRequests(
  requests: Map<string, MutablePrrRequestReadModel>
): ReadonlyMap<string, PrrRequestReadModel> {
  return new RuntimeReadonlyMap(
    [...requests.entries()].map(([prrRequestId, request]) => [
      prrRequestId,
      cloneRequest(request)
    ])
  );
}

class RuntimeReadonlyMap<Key, Value> implements ReadonlyMap<Key, Value> {
  private readonly valuesByKey: Map<Key, Value>;

  constructor(entries: Iterable<readonly [Key, Value]>) {
    this.valuesByKey = new Map(entries);
  }

  get size(): number {
    return this.valuesByKey.size;
  }

  get [Symbol.toStringTag](): string {
    return "Map";
  }

  get(key: Key): Value | undefined {
    return this.valuesByKey.get(key);
  }

  has(key: Key): boolean {
    return this.valuesByKey.has(key);
  }

  keys(): MapIterator<Key> {
    return this.valuesByKey.keys();
  }

  values(): MapIterator<Value> {
    return this.valuesByKey.values();
  }

  entries(): MapIterator<[Key, Value]> {
    return this.valuesByKey.entries();
  }

  forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.valuesByKey) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries();
  }

  set(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }

  delete(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }

  clear(): never {
    throw new TypeError("PrrProjection.requests is read-only; rebuild the projection from ledger events instead.");
  }
}

function cloneRequest(request: MutablePrrRequestReadModel): PrrRequestReadModel {
  return Object.freeze({
    prrRequestId: request.prrRequestId,
    status: request.status,
    agencyName: request.agencyName,
    jurisdictionPack: cloneJurisdictionPackRef(request.jurisdictionPack),
    agency: cloneContact(request.agency),
    requester: cloneContact(request.requester),
    requestText: request.requestText,
    ...(request.activeDeadline === undefined ? {} : { activeDeadline: cloneDeadline(request.activeDeadline) }),
    ...(request.latestOutboundCorrespondence === undefined
      ? {}
      : { latestOutboundCorrespondence: cloneCorrespondenceSummary(request.latestOutboundCorrespondence) }),
    ...(request.latestInboundCorrespondence === undefined
      ? {}
      : { latestInboundCorrespondence: cloneCorrespondenceSummary(request.latestInboundCorrespondence) }),
    ...(request.feeEstimate === undefined ? {} : { feeEstimate: cloneFeeEstimate(request.feeEstimate) }),
    ...(request.scopeNarrowing === undefined
      ? {}
      : { scopeNarrowing: cloneScopeNarrowing(request.scopeNarrowing) }),
    productionBatches: Object.freeze(request.productionBatches.map(cloneProductionBatch)),
    productionEvidenceIds: Object.freeze([...request.productionEvidenceIds]),
    exemptions: Object.freeze(request.exemptions.map(cloneExemption)),
    ...(request.denial === undefined ? {} : { denial: cloneDenial(request.denial) }),
    ...(request.appeal === undefined ? {} : { appeal: cloneAppeal(request.appeal) }),
    possibleStalling: request.possibleStalling,
    confirmedStalling: request.confirmedStalling,
    stallingSignals: Object.freeze(request.stallingSignals.map(cloneStallingSignal)),
    ...(request.stallingConfirmation === undefined
      ? {}
      : { stallingConfirmation: cloneStallingConfirmation(request.stallingConfirmation) }),
    ...(request.legalEscalation === undefined
      ? {}
      : { legalEscalation: cloneLegalEscalation(request.legalEscalation) })
  });
}

function cloneJurisdictionPackRef(ref: PrrJurisdictionPackRef): PrrJurisdictionPackRef {
  return Object.freeze({
    name: ref.name,
    version: ref.version
  });
}

function cloneContact(contact: PrrContactReadModel): PrrContactReadModel {
  return Object.freeze({
    name: contact.name,
    ...(contact.email === undefined ? {} : { email: contact.email }),
    ...(contact.phone === undefined ? {} : { phone: contact.phone })
  });
}

function freezeDeadline(deadline: {
  deadlineDate: string;
  source: "estimated" | "confirmed";
  confidence?: "statutory" | "workflow" | undefined;
  explanation?: string | undefined;
  confirmedBy?: string | undefined;
  rationale?: string | undefined;
  citedRules: readonly PrrCitedRuleReadModel[];
}): PrrDeadlineReadModel {
  return Object.freeze({
    deadlineDate: deadline.deadlineDate,
    source: deadline.source,
    ...(deadline.confidence === undefined ? {} : { confidence: deadline.confidence }),
    ...(deadline.explanation === undefined ? {} : { explanation: deadline.explanation }),
    ...(deadline.confirmedBy === undefined ? {} : { confirmedBy: deadline.confirmedBy }),
    ...(deadline.rationale === undefined ? {} : { rationale: deadline.rationale }),
    citedRules: Object.freeze(deadline.citedRules.map(cloneCitedRule))
  });
}

function cloneDeadline(deadline: PrrDeadlineReadModel): PrrDeadlineReadModel {
  return freezeDeadline(deadline);
}

function cloneCitedRule(rule: PrrCitedRuleReadModel): PrrCitedRuleReadModel {
  return Object.freeze({
    jurisdictionPack: cloneJurisdictionPackRef(rule.jurisdictionPack),
    label: rule.label,
    citation: rule.citation,
    ...(rule.url === undefined ? {} : { url: rule.url })
  });
}

function freezeCorrespondenceSummary(input: {
  correspondenceId: string;
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string | undefined;
  subject: string;
  occurredAt: string;
  bodyHash?: string | undefined;
  evidenceIds: readonly string[];
  attachmentEvidenceIds?: readonly string[] | undefined;
  approvedBy?: string | undefined;
  from?: PrrContactReadModel | undefined;
  rawMetadata?: Readonly<Record<string, string>> | undefined;
}): PrrCorrespondenceSummaryReadModel {
  return Object.freeze({
    correspondenceId: input.correspondenceId,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    ...(input.providerThreadId === undefined ? {} : { providerThreadId: input.providerThreadId }),
    subject: input.subject,
    occurredAt: input.occurredAt,
    ...(input.bodyHash === undefined ? {} : { bodyHash: input.bodyHash }),
    evidenceIds: Object.freeze([...input.evidenceIds]),
    ...(input.attachmentEvidenceIds === undefined
      ? {}
      : { attachmentEvidenceIds: Object.freeze([...input.attachmentEvidenceIds]) }),
    ...(input.approvedBy === undefined ? {} : { approvedBy: input.approvedBy }),
    ...(input.from === undefined ? {} : { from: cloneContact(input.from) }),
    ...(input.rawMetadata === undefined ? {} : { rawMetadata: freezeStringRecord(input.rawMetadata) })
  });
}

function cloneCorrespondenceSummary(
  summary: PrrCorrespondenceSummaryReadModel
): PrrCorrespondenceSummaryReadModel {
  return freezeCorrespondenceSummary(summary);
}

function freezeFeeEstimate(input: {
  amountCents: number;
  currency: string;
  sourceEvidenceId?: string | undefined;
  challenged: boolean;
  challengeId?: string | undefined;
  challengeAmountCents?: number | undefined;
  rationale?: string | undefined;
  approvedBy?: string | undefined;
  citedRules: readonly PrrCitedRuleReadModel[];
}): PrrFeeEstimateReadModel {
  return Object.freeze({
    amountCents: input.amountCents,
    currency: input.currency,
    ...(input.sourceEvidenceId === undefined ? {} : { sourceEvidenceId: input.sourceEvidenceId }),
    challenged: input.challenged,
    ...(input.challengeId === undefined ? {} : { challengeId: input.challengeId }),
    ...(input.challengeAmountCents === undefined ? {} : { challengeAmountCents: input.challengeAmountCents }),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.approvedBy === undefined ? {} : { approvedBy: input.approvedBy }),
    citedRules: Object.freeze(input.citedRules.map(cloneCitedRule))
  });
}

function cloneFeeEstimate(feeEstimate: PrrFeeEstimateReadModel): PrrFeeEstimateReadModel {
  return freezeFeeEstimate(feeEstimate);
}

function freezeScopeNarrowing(input: {
  narrowingId: string;
  proposedScope: string;
  proposedBy: string;
  sourceEvidenceId?: string | undefined;
  acceptedScope?: string | undefined;
  acceptedBy?: string | undefined;
  rationale?: string | undefined;
}): PrrScopeNarrowingReadModel {
  return Object.freeze({
    narrowingId: input.narrowingId,
    proposedScope: input.proposedScope,
    proposedBy: input.proposedBy,
    ...(input.sourceEvidenceId === undefined ? {} : { sourceEvidenceId: input.sourceEvidenceId }),
    ...(input.acceptedScope === undefined ? {} : { acceptedScope: input.acceptedScope }),
    ...(input.acceptedBy === undefined ? {} : { acceptedBy: input.acceptedBy }),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale })
  });
}

function cloneScopeNarrowing(scopeNarrowing: PrrScopeNarrowingReadModel): PrrScopeNarrowingReadModel {
  return freezeScopeNarrowing(scopeNarrowing);
}

function freezeProductionBatch(batch: {
  productionId: string;
  label: string;
  receivedAt: string;
  evidenceIds: readonly string[];
}): PrrProductionBatchReadModel {
  return Object.freeze({
    productionId: batch.productionId,
    label: batch.label,
    receivedAt: batch.receivedAt,
    evidenceIds: Object.freeze([...batch.evidenceIds])
  });
}

function cloneProductionBatch(batch: PrrProductionBatchReadModel): PrrProductionBatchReadModel {
  return freezeProductionBatch(batch);
}

function freezeExemption(exemption: {
  exemptionId: string;
  claimedBy: string;
  citedRules: readonly PrrCitedRuleReadModel[];
  sourceEvidenceId?: string | undefined;
}): PrrExemptionReadModel {
  return Object.freeze({
    exemptionId: exemption.exemptionId,
    claimedBy: exemption.claimedBy,
    citedRules: Object.freeze(exemption.citedRules.map(cloneCitedRule)),
    ...(exemption.sourceEvidenceId === undefined ? {} : { sourceEvidenceId: exemption.sourceEvidenceId })
  });
}

function cloneExemption(exemption: PrrExemptionReadModel): PrrExemptionReadModel {
  return freezeExemption(exemption);
}

function freezeDenial(denial: {
  denialId: string;
  receivedAt: string;
  reason: string;
  sourceEvidenceId?: string | undefined;
}): PrrDenialReadModel {
  return Object.freeze({
    denialId: denial.denialId,
    receivedAt: denial.receivedAt,
    reason: denial.reason,
    ...(denial.sourceEvidenceId === undefined ? {} : { sourceEvidenceId: denial.sourceEvidenceId })
  });
}

function cloneDenial(denial: PrrDenialReadModel): PrrDenialReadModel {
  return freezeDenial(denial);
}

function freezeAppeal(appeal: {
  appealId: string;
  correspondenceId: string;
  filedAt: string;
  approvedBy: string;
  citedRules: readonly PrrCitedRuleReadModel[];
}): PrrAppealReadModel {
  return Object.freeze({
    appealId: appeal.appealId,
    correspondenceId: appeal.correspondenceId,
    filedAt: appeal.filedAt,
    approvedBy: appeal.approvedBy,
    citedRules: Object.freeze(appeal.citedRules.map(cloneCitedRule))
  });
}

function cloneAppeal(appeal: PrrAppealReadModel): PrrAppealReadModel {
  return freezeAppeal(appeal);
}

function freezeStallingSignal(signal: PrrStallingSignalReadModel): PrrStallingSignalReadModel {
  return Object.freeze({
    kind: signal.kind,
    explanation: signal.explanation
  });
}

function cloneStallingSignal(signal: PrrStallingSignalReadModel): PrrStallingSignalReadModel {
  return freezeStallingSignal(signal);
}

function freezeStallingConfirmation(
  confirmation: PrrStallingConfirmationReadModel
): PrrStallingConfirmationReadModel {
  return Object.freeze({
    confirmedBy: confirmation.confirmedBy,
    rationale: confirmation.rationale,
    signalKinds: Object.freeze([...confirmation.signalKinds])
  });
}

function cloneStallingConfirmation(
  confirmation: PrrStallingConfirmationReadModel
): PrrStallingConfirmationReadModel {
  return freezeStallingConfirmation(confirmation);
}

function freezeLegalEscalation(input: {
  confirmedBy: string;
  rationale: string;
  citedRules: readonly PrrCitedRuleReadModel[];
  evidenceIds: readonly string[];
}): PrrLegalEscalationReadModel {
  return Object.freeze({
    confirmedBy: input.confirmedBy,
    rationale: input.rationale,
    citedRules: Object.freeze(input.citedRules.map(cloneCitedRule)),
    evidenceIds: Object.freeze([...input.evidenceIds])
  });
}

function cloneLegalEscalation(
  legalEscalation: PrrLegalEscalationReadModel
): PrrLegalEscalationReadModel {
  return freezeLegalEscalation(legalEscalation);
}

function cloneTimelineEntry(entry: PrrTimelineEntry): PrrTimelineEntry {
  return Object.freeze({
    eventId: entry.eventId,
    type: entry.type,
    occurredAt: entry.occurredAt,
    payload: deepFreezeClone(entry.payload)
  });
}

function cloneDiagnostics(diagnostics: readonly PrrDiagnostic[]): readonly PrrDiagnostic[] {
  return Object.freeze(
    diagnostics.map((diagnostic) =>
      Object.freeze({
        diagnosticId: diagnostic.diagnosticId,
        prrRequestId: diagnostic.prrRequestId,
        category: diagnostic.category,
        message: diagnostic.message,
        ...(diagnostic.eventId === undefined ? {} : { eventId: diagnostic.eventId }),
        repairHint: Object.freeze({
          violatedPath: diagnostic.repairHint.violatedPath,
          allowedActions: Object.freeze([...diagnostic.repairHint.allowedActions])
        })
      })
    )
  );
}

function freezeStringRecord(record: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze({ ...record });
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
