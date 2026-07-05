import type { KnowledgeEvent, KnowledgeEventOf } from "./contracts.js";
import {
  defaultGovernancePolicy,
  restrictedExportTags,
  validateGovernancePolicy,
  type GovernanceTag
} from "./governance-policy.js";

type MutatingMapMethod<Key, Value> = {
  set(key: Key, value: Value): never;
  delete(key: Key): never;
  clear(): never;
};

export type ImmutableMap<Key, Value> = ReadonlyMap<Key, Value> & MutatingMapMethod<Key, Value>;

export interface ProjectedGovernanceTag {
  readonly tag: GovernanceTag;
  readonly confidence: number;
  readonly rationale: string;
  readonly source: "ai" | "human";
  readonly status: "active" | "removed";
  readonly eventId: string;
}

export interface EvidenceGovernanceState {
  readonly evidenceId: string;
  readonly currentTags: ImmutableMap<GovernanceTag, ProjectedGovernanceTag>;
  readonly classifiedEventIds: readonly string[];
  readonly reviewedEventIds: readonly string[];
  readonly quarantined: boolean;
  readonly tombstoned: boolean;
}

export interface ExportPlanInput {
  readonly requestedEvidenceIds: readonly string[];
  readonly sensitiveOptInTags: readonly GovernanceTag[];
}

export interface ExportPlan {
  readonly includedEvidenceIds: readonly string[];
  readonly blockedEvidence: ReadonlyArray<{
    readonly evidenceId: string;
    readonly requiredOptInTags: readonly GovernanceTag[];
  }>;
}

export interface NetworkExposureState {
  readonly activeExposure?: {
    readonly exposureId: string;
    readonly mode: "lan" | "tailnet";
    readonly bindScope: "lan" | "tailnet";
    readonly visibleWarning: true;
    readonly eventId: string;
  };
}

export interface DeviceSessionState {
  readonly sessionId: string;
  readonly deviceLabel: string;
  readonly approved: boolean;
  readonly exposureId: string;
  readonly capabilities: readonly ("read" | "write")[];
  readonly approvalEventId: string;
  readonly revocationEventId?: string;
}

export interface GovernanceIncidentState {
  readonly incidentId: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly category: "classification" | "secret-leak" | "export" | "network" | "device" | "quarantine" | "projection";
  readonly summary: string;
  readonly status: "open" | "closed";
  readonly incidentEventId: string;
  readonly repairIds: readonly string[];
  readonly repairEventIds: readonly string[];
}

export interface GovernanceProjection {
  readonly evidenceGovernance: ImmutableMap<string, EvidenceGovernanceState>;
  readonly networkExposure: NetworkExposureState;
  readonly deviceSessions: ImmutableMap<string, DeviceSessionState>;
  readonly incidents: ImmutableMap<string, GovernanceIncidentState>;
  publicSafeEvidenceIds(): readonly string[];
  buildDefaultExportEvidenceIds(): readonly string[];
  planExport(input: ExportPlanInput): ExportPlan;
  requiresExportOptIn(evidenceId: string): boolean;
  isSessionApproved(sessionId: string): boolean;
  openIncidentIds(): readonly string[];
}

interface MutableEvidenceGovernanceState {
  evidenceId: string;
  currentTags: Map<GovernanceTag, ProjectedGovernanceTag>;
  classifiedEventIds: string[];
  reviewedEventIds: string[];
  quarantined: boolean;
  tombstoned: boolean;
}

type ActiveNetworkExposure = NonNullable<NetworkExposureState["activeExposure"]>;

interface MutableDeviceSessionState {
  sessionId: string;
  deviceLabel: string;
  approved: boolean;
  exposureId: string;
  capabilities: ("read" | "write")[];
  approvalEventId: string;
  revocationEventId?: string;
}

interface MutableGovernanceIncidentState {
  incidentId: string;
  severity: GovernanceIncidentState["severity"];
  category: GovernanceIncidentState["category"];
  summary: string;
  status: GovernanceIncidentState["status"];
  incidentEventId: string;
  repairIds: string[];
  repairEventIds: string[];
}

export function buildGovernanceProjection(events: readonly KnowledgeEvent[]): GovernanceProjection {
  const mutableStates = new Map<string, MutableEvidenceGovernanceState>();
  const mutableDeviceSessions = new Map<string, MutableDeviceSessionState>();
  const mutableIncidents = new Map<string, MutableGovernanceIncidentState>();
  let activeConfidenceThreshold = defaultGovernancePolicy.confidenceThreshold;
  let activeNetworkExposure: ActiveNetworkExposure | undefined;

  for (const event of events) {
    switch (event.type) {
      case "governance.policy.installed":
        try {
          const { installedBy: _installedBy, ...policy } = event.payload;
          activeConfidenceThreshold = validateGovernancePolicy(policy).confidenceThreshold;
        } catch {
          activeConfidenceThreshold = defaultGovernancePolicy.confidenceThreshold;
        }
        break;
      case "evidence.ingested":
        ensureState(mutableStates, event.payload.evidenceId);
        break;
      case "evidence.governance.classified":
        applyClassification(ensureState(mutableStates, event.payload.evidenceId), event, activeConfidenceThreshold);
        break;
      case "evidence.governance.reviewed":
        applyReview(ensureState(mutableStates, event.payload.evidenceId), event);
        break;
      case "evidence.quarantined":
        ensureState(mutableStates, event.payload.evidenceId).quarantined = true;
        break;
      case "evidence.tombstoned":
        ensureState(mutableStates, event.payload.evidenceId).tombstoned = true;
        break;
      case "network.exposure.enabled":
        activeNetworkExposure = Object.freeze({
          exposureId: event.payload.exposureId,
          mode: event.payload.mode,
          bindScope: event.payload.bindScope,
          visibleWarning: event.payload.visibleWarning,
          eventId: event.id
        });
        break;
      case "network.exposure.disabled":
        if (activeNetworkExposure?.exposureId === event.payload.exposureId) {
          activeNetworkExposure = undefined;
        }
        break;
      case "device.session.approved":
        mutableDeviceSessions.set(event.payload.sessionId, {
          sessionId: event.payload.sessionId,
          deviceLabel: event.payload.deviceLabel,
          approved: true,
          exposureId: event.payload.exposureId,
          capabilities: [...event.payload.capabilities],
          approvalEventId: event.id
        });
        break;
      case "device.session.revoked": {
        const session = mutableDeviceSessions.get(event.payload.sessionId);
        if (session !== undefined) {
          session.approved = false;
          session.revocationEventId = event.id;
        }
        break;
      }
      case "incident.recorded":
        if (mutableIncidents.has(event.payload.incidentId)) {
          break;
        }

        mutableIncidents.set(event.payload.incidentId, {
          incidentId: event.payload.incidentId,
          severity: event.payload.severity,
          category: event.payload.category,
          summary: event.payload.summary,
          status: "open",
          incidentEventId: event.id,
          repairIds: [],
          repairEventIds: []
        });
        break;
      case "incident.repair.recorded": {
        const incident = mutableIncidents.get(event.payload.incidentId);
        if (incident !== undefined) {
          incident.repairIds.push(event.payload.repairId);
          incident.repairEventIds.push(event.id);
          if (event.payload.closesIncident) {
            incident.status = "closed";
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const evidenceGovernance = readOnlyMap(
    new Map([...mutableStates.entries()].map(([evidenceId, state]) => [evidenceId, freezeState(state)])),
    "GovernanceProjection.evidenceGovernance is read-only"
  );
  const networkExposure = freezeNetworkExposure(activeNetworkExposure);
  const deviceSessions = readOnlyMap(
    new Map([...mutableDeviceSessions.entries()].map(([sessionId, state]) => [sessionId, freezeDeviceSession(state)])),
    "GovernanceProjection.deviceSessions is read-only"
  );
  const incidents = readOnlyMap(
    new Map([...mutableIncidents.entries()].map(([incidentId, state]) => [incidentId, freezeIncident(state)])),
    "GovernanceProjection.incidents is read-only"
  );

  return Object.freeze({
    evidenceGovernance,
    networkExposure,
    deviceSessions,
    incidents,
    publicSafeEvidenceIds() {
      return Object.freeze(
        [...evidenceGovernance.values()]
          .filter((state) => isPublicSafe(state))
          .map((state) => state.evidenceId)
          .sort()
      );
    },
    buildDefaultExportEvidenceIds() {
      return this.publicSafeEvidenceIds();
    },
    planExport(input: ExportPlanInput): ExportPlan {
      const includedEvidenceIds: string[] = [];
      const blockedEvidence: Array<{ evidenceId: string; requiredOptInTags: readonly GovernanceTag[] }> = [];
      const optIns = new Set(input.sensitiveOptInTags);

      for (const evidenceId of input.requestedEvidenceIds) {
        const state = evidenceGovernance.get(evidenceId);
        if (state?.quarantined === true) {
          blockedEvidence.push({ evidenceId, requiredOptInTags: [] });
          continue;
        }

        if (state === undefined || state.tombstoned) {
          blockedEvidence.push({ evidenceId, requiredOptInTags: [...restrictedExportTags] });
          continue;
        }

        const activeRestrictedTags = restrictedExportTags.filter((tag) => hasActiveTag(state, tag));
        const missing = activeRestrictedTags.filter((tag) => !optIns.has(tag));
        if (missing.length > 0) {
          blockedEvidence.push({ evidenceId, requiredOptInTags: missing });
          continue;
        }

        if (hasActiveTag(state, "public_safe") || activeRestrictedTags.length > 0) {
          includedEvidenceIds.push(evidenceId);
        }
      }

      return Object.freeze({
        includedEvidenceIds: Object.freeze([...includedEvidenceIds].sort()),
        blockedEvidence: Object.freeze(
          blockedEvidence
            .map((blocked) => Object.freeze({
              evidenceId: blocked.evidenceId,
              requiredOptInTags: Object.freeze([...blocked.requiredOptInTags].sort())
            }))
            .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))
        )
      });
    },
    requiresExportOptIn(evidenceId: string) {
      const state = evidenceGovernance.get(evidenceId);
      if (state === undefined || state.quarantined || state.tombstoned) {
        return true;
      }

      return restrictedExportTags.some((tag) => hasActiveTag(state, tag));
    },
    isSessionApproved(sessionId: string) {
      const session = deviceSessions.get(sessionId);
      return session?.approved === true && networkExposure.activeExposure?.exposureId === session.exposureId;
    },
    openIncidentIds() {
      return Object.freeze(
        [...incidents.values()]
          .filter((incident) => incident.status === "open")
          .map((incident) => incident.incidentId)
          .sort()
      );
    }
  });
}

function ensureState(states: Map<string, MutableEvidenceGovernanceState>, evidenceId: string): MutableEvidenceGovernanceState {
  const existing = states.get(evidenceId);
  if (existing !== undefined) {
    return existing;
  }

  const created: MutableEvidenceGovernanceState = {
    evidenceId,
    currentTags: new Map(),
    classifiedEventIds: [],
    reviewedEventIds: [],
    quarantined: false,
    tombstoned: false
  };
  states.set(evidenceId, created);

  return created;
}

function applyClassification(
  state: MutableEvidenceGovernanceState,
  event: KnowledgeEventOf<"evidence.governance.classified">,
  activeConfidenceThreshold: number
): void {
  state.classifiedEventIds.push(event.id);

  for (const tag of event.payload.tags) {
    if (!meetsActiveConfidenceThreshold(tag.confidence, activeConfidenceThreshold)) {
      continue;
    }

    if (state.currentTags.get(tag.tag)?.source === "human") {
      continue;
    }

    state.currentTags.set(tag.tag, Object.freeze({
      tag: tag.tag,
      confidence: tag.confidence,
      rationale: tag.rationale,
      source: "ai",
      status: "active",
      eventId: event.id
    }));
  }
}

function applyReview(state: MutableEvidenceGovernanceState, event: KnowledgeEventOf<"evidence.governance.reviewed">): void {
  state.reviewedEventIds.push(event.id);

  for (const decision of event.payload.decisions) {
    state.currentTags.set(decision.tag, Object.freeze({
      tag: decision.tag,
      confidence: 1,
      rationale: decision.rationale,
      source: "human",
      status: decision.action === "remove" ? "removed" : "active",
      eventId: event.id
    }));
  }
}

function freezeState(state: MutableEvidenceGovernanceState): EvidenceGovernanceState {
  return Object.freeze({
    evidenceId: state.evidenceId,
    currentTags: readOnlyMap(new Map(state.currentTags), "EvidenceGovernanceState.currentTags is read-only"),
    classifiedEventIds: Object.freeze([...state.classifiedEventIds]),
    reviewedEventIds: Object.freeze([...state.reviewedEventIds]),
    quarantined: state.quarantined,
    tombstoned: state.tombstoned
  });
}

function freezeNetworkExposure(activeExposure: ActiveNetworkExposure | undefined): NetworkExposureState {
  if (activeExposure === undefined) {
    return Object.freeze({});
  }

  return Object.freeze({
    activeExposure
  });
}

function freezeDeviceSession(state: MutableDeviceSessionState): DeviceSessionState {
  return Object.freeze({
    sessionId: state.sessionId,
    deviceLabel: state.deviceLabel,
    approved: state.approved,
    exposureId: state.exposureId,
    capabilities: Object.freeze([...state.capabilities]),
    approvalEventId: state.approvalEventId,
    ...(state.revocationEventId === undefined ? {} : { revocationEventId: state.revocationEventId })
  });
}

function freezeIncident(state: MutableGovernanceIncidentState): GovernanceIncidentState {
  return Object.freeze({
    incidentId: state.incidentId,
    severity: state.severity,
    category: state.category,
    summary: state.summary,
    status: state.status,
    incidentEventId: state.incidentEventId,
    repairIds: Object.freeze([...state.repairIds]),
    repairEventIds: Object.freeze([...state.repairEventIds])
  });
}

function isPublicSafe(state: EvidenceGovernanceState): boolean {
  return !state.quarantined && !state.tombstoned && hasActiveTag(state, "public_safe") && !hasActiveRestrictedTag(state);
}

function hasActiveTag(state: EvidenceGovernanceState, tag: GovernanceTag): boolean {
  return state.currentTags.get(tag)?.status === "active";
}

function hasActiveRestrictedTag(state: EvidenceGovernanceState): boolean {
  return restrictedExportTags.some((tag) => hasActiveTag(state, tag));
}

function meetsActiveConfidenceThreshold(confidence: number, threshold: number): boolean {
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 && confidence >= threshold;
}

function readOnlyMap<Key, Value>(source: Map<Key, Value>, mutationErrorMessage: string): ImmutableMap<Key, Value> {
  return new Proxy(source, {
    get(target, property) {
      if (property === "set" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError(mutationErrorMessage);
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as unknown as ImmutableMap<Key, Value>;
}
