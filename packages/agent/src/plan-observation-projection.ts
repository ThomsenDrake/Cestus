import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";

type ResidentPlanEvent = KnowledgeEventOf<"agent.resident-plan.recorded.v1">;
type ResidentObservationEvent = KnowledgeEventOf<"agent.resident-observation.recorded.v1">;

export interface ResidentPlanProjectionRecord {
  readonly eventId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planRevision: number;
  readonly sourceEventIds: readonly string[];
  readonly contextArtifactHashes: readonly string[];
  readonly authorityHash: string;
}

export interface ResidentObservationProjectionRecord {
  readonly eventId: string;
  readonly planRecordEventId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly observationOrdinal: number;
  readonly category: string;
}

export interface ResidentPlanObservationProjectionDiagnostic {
  readonly code: "duplicate-plan-idempotency-key" | "observation-plan-readback-invalid" | "observation-plan-superseded" | "duplicate-observation-idempotency-key";
}

export interface ResidentPlanObservationProjection {
  readonly state: "ready" | "blocked";
  readonly plans: readonly ResidentPlanProjectionRecord[];
  readonly observations: readonly ResidentObservationProjectionRecord[];
  readonly diagnostics: readonly ResidentPlanObservationProjectionDiagnostic[];
}

export function buildResidentPlanObservationProjection(
  events: readonly KnowledgeEvent[]
): ResidentPlanObservationProjection {
  const plans = new Map<string, ResidentPlanEvent>();
  const plansByEventId = new Map<string, ResidentPlanEvent>();
  const observations = new Map<string, ResidentObservationEvent>();
  const projectedObservations: ResidentObservationProjectionRecord[] = [];
  const diagnostics: ResidentPlanObservationProjectionDiagnostic[] = [];

  for (const event of events) {
    if (event.type === "agent.resident-plan.recorded.v1") {
      const key = planKey(event);
      const prior = plans.get(key);
      if (prior !== undefined && !samePlan(prior, event)) {
        diagnostics.push(Object.freeze({ code: "duplicate-plan-idempotency-key" }));
      } else if (prior === undefined) {
        plans.set(key, event);
        plansByEventId.set(event.id, event);
      }
      continue;
    }
    if (event.type === "agent.resident-observation.recorded.v1") {
      const plan = plansByEventId.get(event.payload.planReadback.planRecordEventId);
      if (plan === undefined || !sameIdentity(plan, event)) {
        diagnostics.push(Object.freeze({ code: "observation-plan-readback-invalid" }));
        continue;
      }
      const key = observationKey(event);
      const prior = observations.get(key);
      if (prior !== undefined && !sameObservation(prior, event)) {
        diagnostics.push(Object.freeze({ code: "duplicate-observation-idempotency-key" }));
        continue;
      }
      if (prior === undefined) {
        observations.set(key, event);
        projectedObservations.push(freezeObservation(event));
      }
    }
  }

  for (const observation of observations.values()) {
    const plan = plansByEventId.get(observation.payload.planReadback.planRecordEventId);
    if (plan !== undefined && isSupersededPlan(plan, plansByEventId.values())) {
      diagnostics.push(Object.freeze({ code: "observation-plan-superseded" }));
    }
  }

  if (diagnostics.length > 0) {
    return Object.freeze({
      state: "blocked",
      plans: Object.freeze([]),
      observations: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics)
    });
  }

  return Object.freeze({
    state: "ready",
    plans: Object.freeze([...plans.values()].map(freezePlan)),
    observations: Object.freeze(projectedObservations),
    diagnostics: Object.freeze([])
  });
}

function planKey(event: ResidentPlanEvent): string {
  const payload = event.payload;
  return [payload.taskId, payload.attemptId, payload.runId, payload.planRevision, payload.policyHash].join("|");
}

function observationKey(event: ResidentObservationEvent): string {
  const payload = event.payload;
  return [payload.planReadback.planRecordEventId, payload.observationOrdinal, payload.category].join("|");
}

function samePlan(left: ResidentPlanEvent, right: ResidentPlanEvent): boolean {
  return left.payload.descriptorHash === right.payload.descriptorHash &&
    sameIdentityPayload(left.payload, right.payload);
}

function sameObservation(left: ResidentObservationEvent, right: ResidentObservationEvent): boolean {
  return left.payload.observationHash === right.payload.observationHash &&
    left.payload.planReadback.planRecordEventId === right.payload.planReadback.planRecordEventId &&
    sameIdentityPayload(left.payload, right.payload);
}

function sameIdentity(
  plan: ResidentPlanEvent,
  observation: ResidentObservationEvent
): boolean {
  const left = plan.payload;
  const right = observation.payload;
  return sameIdentityPayload(left, right) &&
    observation.payload.planReadback.taskId === left.taskId &&
    observation.payload.planReadback.attemptId === left.attemptId &&
    observation.payload.planReadback.runId === left.runId;
}

function sameIdentityPayload(
  left: ResidentPlanEvent["payload"] | ResidentObservationEvent["payload"],
  right: ResidentPlanEvent["payload"] | ResidentObservationEvent["payload"]
): boolean {
  return left.residentAgentId === right.residentAgentId &&
    left.taskId === right.taskId &&
    left.attemptId === right.attemptId &&
    left.runId === right.runId &&
    left.policyId === right.policyId &&
    left.policyVersion === right.policyVersion &&
    left.policyHash === right.policyHash &&
    left.authorityHash === right.authorityHash &&
    left.causationEventId === right.causationEventId &&
    left.correlationId === right.correlationId &&
    sameArray(left.sourceEventIds, right.sourceEventIds) &&
    sameArray(left.contextArtifactHashes, right.contextArtifactHashes) &&
    left.budget.maxSteps === right.budget.maxSteps &&
    left.budget.remainingSteps === right.budget.remainingSteps &&
    left.budget.contextBytes === right.budget.contextBytes;
}

function isSupersededPlan(plan: ResidentPlanEvent, candidates: Iterable<ResidentPlanEvent>): boolean {
  for (const candidate of candidates) {
    if (
      candidate.id !== plan.id &&
      sameIdentityPayload(candidate.payload, plan.payload) &&
      candidate.payload.planRevision > plan.payload.planRevision
    ) {
      return true;
    }
  }
  return false;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezePlan(event: ResidentPlanEvent): ResidentPlanProjectionRecord {
  return Object.freeze({
    eventId: event.id,
    taskId: event.payload.taskId,
    attemptId: event.payload.attemptId,
    runId: event.payload.runId,
    planRevision: event.payload.planRevision,
    sourceEventIds: Object.freeze([...event.payload.sourceEventIds]),
    contextArtifactHashes: Object.freeze([...event.payload.contextArtifactHashes]),
    authorityHash: event.payload.authorityHash
  });
}

function freezeObservation(event: ResidentObservationEvent): ResidentObservationProjectionRecord {
  return Object.freeze({
    eventId: event.id,
    planRecordEventId: event.payload.planReadback.planRecordEventId,
    taskId: event.payload.taskId,
    attemptId: event.payload.attemptId,
    runId: event.payload.runId,
    observationOrdinal: event.payload.observationOrdinal,
    category: event.payload.category
  });
}
