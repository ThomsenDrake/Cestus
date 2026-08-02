import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "../../../ontology/src/contracts.js";
import {
  buildDraftRequestEvents,
  type ActorRef,
  type ContactRef,
  type DeadlineEstimateKind,
  type JurisdictionPackRef
} from "../../../prr/src/draft-events.js";
import { buildPrrProjection } from "../../../prr/src/projection.js";
import {
  buildPrrWorkspaceDto,
  prrWorkspaceDtoLaneOrder,
  type PrrWorkspaceDto
} from "../../../prr/src/read-api.js";
import { prrWorkspaceSeedEvents } from "../../../prr/src/workspace-seed.js";

export type RequestsAdapterNow = string | (() => string);

export interface RequestsCreateDraftInput {
  readonly jurisdictionPack: JurisdictionPackRef;
  readonly agency: ContactRef;
  readonly requester: ContactRef;
  readonly requestText: string;
  readonly receivedAt?: string;
  readonly deadlineEstimateKind?: DeadlineEstimateKind;
}

export type RequestsCreateDraftFailedStep =
  | "validate-input"
  | "append-request"
  | "estimate-deadline"
  | "append-deadline";

export interface RequestsDraftDiagnostic {
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}

export type RequestsCreateDraftResult =
  | {
      readonly ok: true;
      readonly prrRequestId: string;
      readonly committedEventIds: readonly string[];
      readonly workspace: PrrWorkspaceDto;
    }
  | {
      readonly ok: false;
      readonly failedStep: RequestsCreateDraftFailedStep;
      readonly committedEventIds: readonly string[];
      readonly diagnostic: RequestsDraftDiagnostic;
      readonly workspace: PrrWorkspaceDto;
      readonly workspaceStale?: true;
    };

export interface RequestsWorkspaceAdapter {
  loadRequestsWorkspace(): Promise<PrrWorkspaceDto>;
  createDraftRequest(input: RequestsCreateDraftInput): Promise<RequestsCreateDraftResult>;
}

export interface LocalReplayRequestsAdapter extends RequestsWorkspaceAdapter {
  readEventsForTest(): readonly KnowledgeEvent[];
}

export interface LocalReplayRequestsAdapterOptions {
  readonly actor?: ActorRef;
  readonly now?: RequestsAdapterNow;
  readonly requestIdFactory?: () => string;
  readonly idFactory?: () => string;
}

export interface StaticRequestsAdapterOptions {
  readonly createDraftResult?:
    | RequestsCreateDraftResult
    | ((input: RequestsCreateDraftInput) => RequestsCreateDraftResult | Promise<RequestsCreateDraftResult>);
}

export interface HttpRequestsAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
}

const defaultActor: ActorRef = Object.freeze({
  id: "actor_ui_local",
  kind: "human",
  label: "Local UI user"
});

const draftDiagnostics: Record<RequestsCreateDraftFailedStep, RequestsDraftDiagnostic> = Object.freeze({
  "validate-input": Object.freeze({
    message: "Draft creation input did not match the request event contract. Review the required fields and try again.",
    allowedRepairActions: Object.freeze(["review draft request input"])
  }),
  "append-request": Object.freeze({
    message: "Draft creation could not start because the request stream already exists. Reload Requests and try again.",
    allowedRepairActions: Object.freeze(["reload Requests", "create a new draft"])
  }),
  "estimate-deadline": Object.freeze({
    message: "Draft creation could not estimate a deadline for the selected jurisdiction pack.",
    allowedRepairActions: Object.freeze(["select a supported jurisdiction pack", "retry deadline estimate"])
  }),
  "append-deadline": Object.freeze({
    message: "Draft was created, but the deadline estimate could not be committed. Reload Requests to inspect the draft.",
    allowedRepairActions: Object.freeze(["reload Requests", "retry deadline estimate"])
  })
});
const validLaneIds = new Set<string>(prrWorkspaceDtoLaneOrder);
const validSeverities = new Set(["low", "medium", "high", "critical"]);
const validDueStates = new Set(["none", "upcoming", "overdue"]);
const validPrrStatuses = new Set([
  "draft",
  "sent",
  "acknowledged",
  "inNegotiation",
  "awaitingProduction",
  "partiallyProduced",
  "produced",
  "denied",
  "appealed",
  "closed"
]);
const validActionPacketKinds = new Set([
  "review-draft",
  "wait",
  "follow-up",
  "review-fee-scope",
  "intake-production",
  "legal-review"
]);
const validEvidencePacketKinds = new Set([
  "outbound-correspondence",
  "inbound-correspondence",
  "fee",
  "scope",
  "production",
  "denial",
  "legal-escalation"
]);
const validCorrespondenceProviders = new Set(["gmail", "imap-smtp", "himalaya"]);
const validDeadlineConfidences = new Set(["statutory", "workflow"]);
const validStallingSignalKinds = new Set([
  "deadline-breached",
  "repeated-vague-delays",
  "high-fee-estimate",
  "silence-after-followup",
  "narrowing-pressure",
  "exemption-review-needed"
]);

export function createLocalReplayRequestsAdapter(
  seedEvents: readonly KnowledgeEvent[],
  options: LocalReplayRequestsAdapterOptions = {}
): LocalReplayRequestsAdapter {
  const events = seedEvents.map((event) => structuredClone(event));
  const usedEventIds = new Set(events.map((event) => event.id));
  const now = options.now ?? (() => new Date().toISOString());
  const actor = options.actor ?? defaultActor;
  let nextGeneratedRequestId = 1;
  const requestIdFactory =
    options.requestIdFactory ??
    (() => {
      const requestNumber = nextGeneratedRequestId;
      nextGeneratedRequestId += 1;
      return `prr_draft_${normalizeIdentifierPart(currentTimestamp(now))}_${requestNumber}`;
    });

  function buildWorkspace(generatedAt: string): PrrWorkspaceDto {
    return buildPrrWorkspaceDto(buildPrrProjection(events), { now: generatedAt });
  }

  async function createDraftRequest(input: RequestsCreateDraftInput): Promise<RequestsCreateDraftResult> {
    const occurredAt = currentTimestamp(now);
    const receivedAt = normalizeOptionalInput(input.receivedAt) ?? occurredAt;
    const prrRequestId = requestIdFactory();
    if (nextStreamSequence(events, prrRequestId) !== 1) {
      return createFailure("append-request", [], diagnosticForStep("append-request"), occurredAt);
    }

    let appendableEvents: {
      readonly requestCreated: AppendableKnowledgeEvent<"prr.request.created">;
      readonly deadlineEstimated: AppendableKnowledgeEvent<"prr.deadline.estimated">;
    };

    try {
      appendableEvents = buildDraftRequestEvents({
        ...input,
        prrRequestId,
        actor,
        occurredAt,
        receivedAt
      });
    } catch (error) {
      return createFailure(
        "estimate-deadline",
        [],
        diagnosticForStep("estimate-deadline"),
        occurredAt
      );
    }

    let committedCreated: KnowledgeEvent;
    try {
      committedCreated = commitAppendableEvent(
        appendableEvents.requestCreated,
        reserveEventId(options.idFactory, usedEventIds),
        1
      );
    } catch (error) {
      return createFailure("validate-input", [], diagnosticForStep("validate-input"), occurredAt);
    }

    try {
      const committedDeadline = commitAppendableEvent(
        {
          ...appendableEvents.deadlineEstimated,
          context: {
            ...appendableEvents.deadlineEstimated.context,
            causationId: committedCreated.id
          }
        },
        reserveEventId(options.idFactory, usedEventIds),
        2
      );

      return Object.freeze({
        ok: true,
        prrRequestId,
        committedEventIds: Object.freeze([committedCreated.id, committedDeadline.id]),
        workspace: buildWorkspace(occurredAt)
      });
    } catch (error) {
      return createFailure(
        "append-deadline",
        [committedCreated.id],
        diagnosticForStep("append-deadline"),
        occurredAt
      );
    }
  }

  function commitAppendableEvent(
    appendable: AppendableKnowledgeEvent,
    id: string,
    sequence: number
  ): KnowledgeEvent {
    const nextSequence = nextStreamSequence(events, appendable.streamId);
    if (nextSequence !== sequence) {
      throw new Error(
        `Concurrency conflict for ${appendable.streamId}: expected sequence ${sequence}, next sequence ${nextSequence}`
      );
    }

    const committed = {
      ...appendable,
      id,
      sequence
    } as KnowledgeEvent;
    const validation = validateKnowledgeEvent(committed);
    if (!validation.success) {
      throw new Error(validation.error.message);
    }

    events.push(structuredClone(committed));
    return committed;
  }

  function createFailure(
    failedStep: RequestsCreateDraftFailedStep,
    committedEventIds: readonly string[],
    diagnostic: RequestsDraftDiagnostic,
    generatedAt: string
  ): RequestsCreateDraftResult {
    return Object.freeze({
      ok: false,
      failedStep,
      committedEventIds: Object.freeze([...committedEventIds]),
      diagnostic,
      workspace: buildWorkspace(generatedAt)
    });
  }

  return Object.freeze({
    async loadRequestsWorkspace() {
      return buildWorkspace(currentTimestamp(now));
    },
    createDraftRequest,
    readEventsForTest() {
      return Object.freeze(events.map((event) => structuredClone(event)));
    }
  });
}

export function createStaticRequestsAdapter(
  workspace: PrrWorkspaceDto,
  options: StaticRequestsAdapterOptions = {}
): RequestsWorkspaceAdapter {
  let currentWorkspace = workspace;

  return Object.freeze({
    async loadRequestsWorkspace() {
      return currentWorkspace;
    },
    async createDraftRequest(input: RequestsCreateDraftInput) {
      const result =
        typeof options.createDraftResult === "function"
          ? await options.createDraftResult(input)
          : options.createDraftResult ??
            Object.freeze({
              ok: false,
              failedStep: "append-request",
              committedEventIds: Object.freeze([]),
              diagnostic: Object.freeze({
                message: "This Requests adapter cannot create draft requests.",
                allowedRepairActions: Object.freeze(["use a replay-capable Requests adapter"])
              }),
              workspace: currentWorkspace
            });

      currentWorkspace = result.workspace;
      return result;
    }
  });
}

export function createHttpRequestsAdapter(
  options: HttpRequestsAdapterOptions = {}
): RequestsWorkspaceAdapter {
  const baseUrl = options.baseUrl ?? "";
  const credentials = options.credentials ?? "same-origin";
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return Object.freeze({
    async loadRequestsWorkspace() {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/api/requests/workspace`, {
          credentials,
          headers: authHeaders(options.authToken),
          method: "GET"
        });
      } catch (error) {
        throw new Error("Requests runtime request failed.");
      }
      if (!response.ok) {
        throw new Error(`Requests runtime returned HTTP ${response.status}.`);
      }

      try {
        const workspace = workspaceDtoFromJson(await response.json());
        if (workspace === undefined) {
          throw new Error("invalid workspace payload");
        }
        return workspace;
      } catch (error) {
        throw new Error(
          error instanceof SyntaxError
            ? "Requests runtime returned invalid workspace JSON."
            : "Requests runtime returned invalid workspace payload."
        );
      }
    },
    async createDraftRequest(input: RequestsCreateDraftInput) {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/api/requests/drafts`, {
          body: JSON.stringify(input),
          credentials,
          headers: {
            ...authHeaders(options.authToken),
            "content-type": "application/json"
          },
          method: "POST"
        });
      } catch (error) {
        return httpFailure("request failed", await safeWorkspaceFallback());
      }

      if (!response.ok) {
        return httpFailure(`HTTP ${response.status}`, await safeWorkspaceFallback());
      }

      try {
        const result = createDraftResultFromJson(await response.json());
        if (result === undefined) {
          return httpFailure("invalid draft result", await safeWorkspaceFallback());
        }
        return sanitizeCreateDraftResult(result);
      } catch (error) {
        return httpFailure("invalid JSON", await safeWorkspaceFallback());
      }
    }
  });
}

export const httpRequestsAdapter = createHttpRequestsAdapter();

export const localReplayRequestsAdapter = createLocalReplayRequestsAdapter(prrWorkspaceSeedEvents);

export function loadRequestsWorkspace(): Promise<PrrWorkspaceDto> {
  return localReplayRequestsAdapter.loadRequestsWorkspace();
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

async function safeWorkspaceFallback(): Promise<PrrWorkspaceDto> {
  return buildPrrWorkspaceDto(buildPrrProjection([]), { now: new Date().toISOString() });
}

async function httpFailure(reason: string, workspace: PrrWorkspaceDto): Promise<RequestsCreateDraftResult> {
  return Object.freeze({
    ok: false,
    failedStep: "append-request",
    committedEventIds: Object.freeze([]),
    diagnostic: Object.freeze({
      message: `Requests runtime returned ${reason}.`,
      allowedRepairActions: Object.freeze(["reload Requests", "check the local runtime"])
    }),
    workspace,
    workspaceStale: true
  });
}

function sanitizeCreateDraftResult(result: RequestsCreateDraftResult): RequestsCreateDraftResult {
  if (result.ok) {
    return result;
  }

  return Object.freeze({
    ...result,
    diagnostic: Object.freeze({
      message: "Requests runtime returned a failure result.",
      allowedRepairActions: Object.freeze(["retry request creation"])
    })
  });
}

function createDraftResultFromJson(value: unknown): RequestsCreateDraftResult | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const workspace = workspaceDtoFromJson(value.workspace);
  const committedEventIds = stringArrayFromJson(value.committedEventIds);
  if (workspace === undefined || committedEventIds === undefined) {
    return undefined;
  }

  if (value.ok === true) {
    if (!isNonEmptyString(value.prrRequestId)) {
      return undefined;
    }
    return Object.freeze({
      ok: true,
      prrRequestId: value.prrRequestId,
      committedEventIds: Object.freeze(committedEventIds),
      workspace
    });
  }

  if (value.ok !== false || !isFailedStep(value.failedStep)) {
    return undefined;
  }

  const diagnostic = diagnosticFromJson(value.diagnostic);
  if (diagnostic === undefined) {
    return undefined;
  }

  return Object.freeze({
    ok: false,
    failedStep: value.failedStep,
    committedEventIds: Object.freeze(committedEventIds),
    diagnostic,
    workspace
  });
}

function workspaceDtoFromJson(value: unknown): PrrWorkspaceDto | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.generatedAt) ||
    !arrayOf(value.savedViews, isSavedView) ||
    !arrayOf(value.laneOrder, isLaneId) ||
    !arrayOf(value.lanes, isLane) ||
    !arrayOf(value.cards, isCard) ||
    !arrayOf(value.requestDetails, isRequestDetail) ||
    !arrayOf(value.gates, isGateSummary) ||
    !arrayOf(value.actionPackets, isActionPacket) ||
    !arrayOf(value.evidencePackets, isEvidencePacket) ||
    !arrayOf(value.diagnostics, isWorkspaceDiagnostic) ||
    !arrayOf(value.timeline, isTimelineEntry) ||
    !isSignalMap(value.signalMap) ||
    !isBuilderModel(value.builder) ||
    !arrayOf(value.queueRows, isQueueRow)
  ) {
    return undefined;
  }

  return value as unknown as PrrWorkspaceDto;
}

function isSavedView(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.description) &&
    isStringArray(value.cardIds)
  );
}

function isLane(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isLaneId(value.id) &&
    isNonEmptyString(value.label) &&
    isStringArray(value.cardIds) &&
    arrayOf(value.agencyGroups, isAgencyGroup)
  );
}

function isAgencyGroup(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.agencyName) &&
    isSeverity(value.tone) &&
    isStringArray(value.cardIds)
  );
}

function isCard(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.prrRequestId) &&
    isNonEmptyString(value.agencyName) &&
    isNonEmptyString(value.jurisdictionPackName) &&
    isNonEmptyString(value.title) &&
    isPrrStatus(value.status) &&
    isLaneId(value.laneId) &&
    isSeverity(value.severity) &&
    isDueState(value.dueState) &&
    typeof value.productionCount === "number" &&
    isNonEmptyString(value.actionLabel) &&
    isStringArray(value.flags) &&
    isOptionalString(value.deadlineDate) &&
    (value.deadlineSource === undefined || value.deadlineSource === "estimated" || value.deadlineSource === "confirmed") &&
    isOptionalString(value.deadlineLabel) &&
    isOptionalString(value.feeSignal)
  );
}

function isRequestDetail(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.prrRequestId) &&
    isNonEmptyString(value.agencyName) &&
    isJurisdictionPackRef(value.jurisdictionPack) &&
    isContactRef(value.agency) &&
    isContactRef(value.requester) &&
    isNonEmptyString(value.requestText) &&
    isPrrStatus(value.status) &&
    isLaneId(value.laneId) &&
    isSeverity(value.severity) &&
    arrayOf(value.actionPackets, isActionPacket) &&
    arrayOf(value.evidencePackets, isEvidencePacket) &&
    arrayOf(value.sendGate, isGateCheck) &&
    arrayOf(value.escalationGate, isGateCheck) &&
    arrayOf(value.diagnostics, isWorkspaceDiagnostic) &&
    arrayOf(value.timeline, isTimelineEntry) &&
    arrayOf(value.stallingSignals, isStallingSignal) &&
    arrayOf(value.productionBatches, isProductionBatch) &&
    isOptional(value.followUpDraft, isFollowUpDraft) &&
    isOptional(value.latestOutboundCorrespondence, isCorrespondenceSummary) &&
    isOptional(value.latestInboundCorrespondence, isCorrespondenceSummary) &&
    isOptional(value.activeDeadline, isDeadline) &&
    isOptional(value.feeEstimate, isFeeEstimate) &&
    isOptional(value.scopeNarrowing, isScopeNarrowing) &&
    isOptional(value.denial, isDenial) &&
    isOptional(value.appeal, isAppeal)
  );
}

function isFollowUpDraft(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    value.kind === "routine-follow-up" &&
    isJsonObject(value.deadlineBasis) &&
    (value.deadlineBasis.source === "estimated" || value.deadlineBasis.source === "confirmed") &&
    isNonEmptyString(value.deadlineBasis.deadlineDate) &&
    isNonEmptyString(value.deadlineBasis.explanation) &&
    isStringArray(value.recipients) &&
    isNonEmptyString(value.subject) &&
    isNonEmptyString(value.body) &&
    arrayOf(value.citations, isCitedRule) &&
    isStringArray(value.attachmentEvidenceIds) &&
    isStringArray(value.evidenceIds) &&
    isJsonObject(value.providerState) &&
    (value.providerState.provider === "none" ||
      isStringInSet(value.providerState.provider, validCorrespondenceProviders)) &&
    value.providerState.reviewState === "requires-review" &&
    isNonEmptyString(value.providerState.detail)
  );
}

function isGateSummary(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.prrRequestId) &&
    (value.kind === "send" || value.kind === "legal-escalation") &&
    typeof value.ready === "boolean" &&
    typeof value.locked === "boolean" &&
    arrayOf(value.checks, isGateCheck)
  );
}

function isGateCheck(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    typeof value.ready === "boolean" &&
    typeof value.locked === "boolean" &&
    isNonEmptyString(value.detail) &&
    (value.evidenceIds === undefined || isStringArray(value.evidenceIds))
  );
}

function isActionPacket(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.prrRequestId) &&
    isStringInSet(value.kind, validActionPacketKinds) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.detail) &&
    isSeverity(value.severity)
  );
}

function isEvidencePacket(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.prrRequestId) &&
    isStringInSet(value.kind, validEvidencePacketKinds) &&
    isNonEmptyString(value.label) &&
    isStringArray(value.evidenceIds)
  );
}

function isWorkspaceDiagnostic(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.diagnosticId) &&
    isNonEmptyString(value.prrRequestId) &&
    isNonEmptyString(value.category) &&
    isNonEmptyString(value.message) &&
    isJsonObject(value.repairHint) &&
    isNonEmptyString(value.repairHint.violatedPath) &&
    isStringArray(value.repairHint.allowedActions) &&
    isOptionalString(value.eventId)
  );
}

function isTimelineEntry(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.prrRequestId) &&
    isNonEmptyString(value.eventId) &&
    isNonEmptyString(value.type) &&
    isNonEmptyString(value.occurredAt) &&
    isJsonObject(value.payload)
  );
}

function isQueueRow(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.prrRequestId) &&
    isNonEmptyString(value.agencyName) &&
    isPrrStatus(value.status) &&
    typeof value.possibleStalling === "boolean" &&
    typeof value.confirmedStalling === "boolean" &&
    typeof value.productionCount === "number" &&
    isOptionalString(value.deadlineDate) &&
    (value.deadlineSource === undefined || value.deadlineSource === "estimated" || value.deadlineSource === "confirmed")
  );
}

function diagnosticFromJson(value: unknown): RequestsDraftDiagnostic | undefined {
  if (!isJsonObject(value) || !isNonEmptyString(value.message)) {
    return undefined;
  }

  const allowedRepairActions = stringArrayFromJson(value.allowedRepairActions);
  if (allowedRepairActions === undefined) {
    return undefined;
  }

  return Object.freeze({
    message: value.message,
    allowedRepairActions: Object.freeze(allowedRepairActions)
  });
}

function isSignalMap(value: unknown): value is PrrWorkspaceDto["signalMap"] {
  return isJsonObject(value) && arrayOf(value.nodes, isSignalMapNode) && arrayOf(value.edges, isSignalMapEdge);
}

function isBuilderModel(value: unknown): value is PrrWorkspaceDto["builder"] {
  return isJsonObject(value) && arrayOf(value.jurisdictionPacks, isBuilderPack) && arrayOf(value.steps, isBuilderStep);
}

function isSignalMapNode(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.agencyName) &&
    isSeverity(value.tone) &&
    typeof value.requestCount === "number" &&
    isNonEmptyString(value.summary) &&
    isStringArray(value.prrRequestIds)
  );
}

function isSignalMapEdge(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.sourceNodeId) &&
    isNonEmptyString(value.targetNodeId) &&
    isNonEmptyString(value.label) &&
    isStringArray(value.evidenceIds)
  );
}

function isBuilderPack(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.version) &&
    isNonEmptyString(value.jurisdiction) &&
    isNonEmptyString(value.description) &&
    isNonEmptyString(value.agentGuidance) &&
    arrayOf(value.rules, isBuilderRule)
  );
}

function isBuilderRule(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.kind) &&
    isNonEmptyString(value.description) &&
    arrayOf(value.citations, isBuilderCitation) &&
    isNonEmptyString(value.agentWarning)
  );
}

function isBuilderCitation(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.citation) &&
    isNonEmptyString(value.url)
  );
}

function isBuilderStep(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    (value.status === "available" || value.status === "locked") &&
    isNonEmptyString(value.detail) &&
    arrayOf(value.suggestedFills, isSuggestedFill)
  );
}

function isSuggestedFill(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.fieldId) &&
    isNonEmptyString(value.label) &&
    typeof value.value === "string" &&
    isStringArray(value.evidenceIds)
  );
}

function isCorrespondenceSummary(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.correspondenceId) &&
    isStringInSet(value.provider, validCorrespondenceProviders) &&
    isNonEmptyString(value.providerMessageId) &&
    isOptionalString(value.providerThreadId) &&
    isNonEmptyString(value.subject) &&
    isNonEmptyString(value.occurredAt) &&
    isOptionalString(value.bodyHash) &&
    isStringArray(value.evidenceIds) &&
    (value.attachmentEvidenceIds === undefined || isStringArray(value.attachmentEvidenceIds)) &&
    isOptionalString(value.approvedBy) &&
    isOptional(value.from, isContactRef) &&
    isOptionalStringRecord(value.rawMetadata)
  );
}

function isDeadline(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.deadlineDate) &&
    (value.source === "estimated" || value.source === "confirmed") &&
    (value.confidence === undefined || isStringInSet(value.confidence, validDeadlineConfidences)) &&
    isOptionalString(value.explanation) &&
    isOptionalString(value.confirmedBy) &&
    isOptionalString(value.rationale) &&
    arrayOf(value.citedRules, isCitedRule)
  );
}

function isFeeEstimate(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    typeof value.amountCents === "number" &&
    isNonEmptyString(value.currency) &&
    isOptionalString(value.sourceEvidenceId) &&
    typeof value.challenged === "boolean" &&
    isOptionalString(value.challengeId) &&
    (value.challengeAmountCents === undefined || typeof value.challengeAmountCents === "number") &&
    isOptionalString(value.rationale) &&
    isOptionalString(value.approvedBy) &&
    arrayOf(value.citedRules, isCitedRule)
  );
}

function isScopeNarrowing(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.narrowingId) &&
    isNonEmptyString(value.proposedScope) &&
    isNonEmptyString(value.proposedBy) &&
    isOptionalString(value.sourceEvidenceId) &&
    isOptionalString(value.acceptedScope) &&
    isOptionalString(value.acceptedBy) &&
    isOptionalString(value.rationale)
  );
}

function isProductionBatch(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.productionId) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.receivedAt) &&
    isStringArray(value.evidenceIds)
  );
}

function isDenial(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.denialId) &&
    isNonEmptyString(value.receivedAt) &&
    isNonEmptyString(value.reason) &&
    isOptionalString(value.sourceEvidenceId)
  );
}

function isAppeal(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.appealId) &&
    isNonEmptyString(value.correspondenceId) &&
    isNonEmptyString(value.filedAt) &&
    isNonEmptyString(value.approvedBy) &&
    arrayOf(value.citedRules, isCitedRule)
  );
}

function isStallingSignal(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isStringInSet(value.kind, validStallingSignalKinds) &&
    isNonEmptyString(value.explanation)
  );
}

function isCitedRule(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isJurisdictionPackRef(value.jurisdictionPack) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.citation) &&
    isOptionalString(value.url)
  );
}

function isJurisdictionPackRef(value: unknown): boolean {
  return isJsonObject(value) && isNonEmptyString(value.name) && isNonEmptyString(value.version);
}

function isContactRef(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.name) &&
    isOptionalString(value.email) &&
    isOptionalString(value.phone)
  );
}

function arrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard);
}

function isStringArray(value: unknown): value is readonly string[] {
  return arrayOf(value, (item) => typeof item === "string");
}

function isOptional(value: unknown, guard: (item: unknown) => boolean): boolean {
  return value === undefined || guard(value);
}

function isOptionalStringRecord(value: unknown): boolean {
  return value === undefined || (isJsonObject(value) && Object.values(value).every((item) => typeof item === "string"));
}

function stringArrayFromJson(value: unknown): readonly string[] | undefined {
  return isStringArray(value) ? value : undefined;
}

function isFailedStep(value: unknown): value is RequestsCreateDraftFailedStep {
  return (
    value === "validate-input" ||
    value === "append-request" ||
    value === "estimate-deadline" ||
    value === "append-deadline"
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isLaneId(value: unknown): boolean {
  return isStringInSet(value, validLaneIds);
}

function isSeverity(value: unknown): boolean {
  return isStringInSet(value, validSeverities);
}

function isDueState(value: unknown): boolean {
  return isStringInSet(value, validDueStates);
}

function isPrrStatus(value: unknown): boolean {
  return isStringInSet(value, validPrrStatuses);
}

function isStringInSet(value: unknown, allowed: ReadonlySet<string>): value is string {
  return typeof value === "string" && allowed.has(value);
}

function nextStreamSequence(events: readonly KnowledgeEvent[], streamId: string): number {
  return events.filter((event) => event.streamId === streamId).length + 1;
}

function reserveEventId(idFactory: (() => string) | undefined, usedEventIds: Set<string>): string {
  const baseId = normalizeEventId(idFactory?.() ?? randomEventId());
  let candidate = baseId;
  let suffix = 2;

  while (usedEventIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }

  usedEventIds.add(candidate);
  return candidate;
}

function randomEventId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID !== undefined) {
    return `evt_${randomUUID.call(globalThis.crypto)}`;
  }

  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeEventId(id: string): string {
  return id.startsWith("evt_") ? id : `evt_${id}`;
}

function normalizeIdentifierPart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeOptionalInput(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function currentTimestamp(now: RequestsAdapterNow): string {
  return typeof now === "function" ? now() : now;
}

function diagnosticForStep(failedStep: RequestsCreateDraftFailedStep): RequestsDraftDiagnostic {
  const diagnostic = draftDiagnostics[failedStep];

  return Object.freeze({
    message: diagnostic.message,
    allowedRepairActions: Object.freeze([...diagnostic.allowedRepairActions])
  });
}
