import type {
  ActorRef,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { ConcurrencyConflictError, type EventLedger } from "../../ontology/src/event-ledger.js";

type ResidentPlanEvent = KnowledgeEventOf<"agent.resident-plan.recorded.v1">;
type ResidentObservationEvent = KnowledgeEventOf<"agent.resident-observation.recorded.v1">;

export type ResidentLoopIdentity = Omit<ResidentPlanEvent["payload"], "planRevision" | "descriptorHash">;

export interface CreateResidentPlanObservationStoreInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly coreVersion?: string | undefined;
  readonly packVersions?: Readonly<Record<string, string>> | undefined;
}

export interface RecordResidentPlanInput {
  readonly identity: ResidentLoopIdentity;
  readonly planRevision: number;
  readonly descriptorHash: string;
}

export interface RecordResidentObservationInput {
  readonly identity: ResidentLoopIdentity;
  readonly planRecordEventId: string;
  readonly observationOrdinal: number;
  readonly category: string;
  readonly observationHash: string;
}

export interface ResidentPlanRecord {
  readonly event: ResidentPlanEvent;
}

export interface ResidentObservationRecord {
  readonly event: ResidentObservationEvent;
}

export interface ResidentPlanObservationStore {
  recordPlan(input: RecordResidentPlanInput): Promise<ResidentPlanRecord>;
  recordObservation(input: RecordResidentObservationInput): Promise<ResidentObservationRecord>;
}

export function residentLoopStreamId(identity: Pick<ResidentLoopIdentity, "taskId" | "attemptId" | "runId">): string {
  return `agent_resident_loop_${identity.taskId}_${identity.attemptId}_${identity.runId}`;
}

export function createResidentPlanObservationStore(
  options: CreateResidentPlanObservationStoreInput
): ResidentPlanObservationStore {
  return Object.freeze({
    async recordPlan(input: RecordResidentPlanInput): Promise<ResidentPlanRecord> {
      const streamId = residentLoopStreamId(input.identity);
      const existing = await options.ledger.readStream(streamId);
      const matching = existing.find((event): event is ResidentPlanEvent =>
        event.type === "agent.resident-plan.recorded.v1" &&
        event.payload.planRevision === input.planRevision &&
        event.payload.policyHash === input.identity.policyHash
      );
      if (matching !== undefined) {
        if (!samePlan(matching, input)) {
          throw new Error("Resident plan idempotency key already binds different provenance.");
        }
        return Object.freeze({ event: matching });
      }

      const appended = await appendPlan(options, input, existing.length + 1);
      return Object.freeze({ event: await readBackPlan(options.ledger, appended, input.identity) });
    },

    async recordObservation(input: RecordResidentObservationInput): Promise<ResidentObservationRecord> {
      const streamId = residentLoopStreamId(input.identity);
      const existing = await options.ledger.readStream(streamId);
      const plan = findPlanReadback(existing, input.planRecordEventId, input.identity);
      if (plan === undefined) {
        throw new Error("Resident observation requires an exact prior plan readback.");
      }
      const matching = existing.find((event): event is ResidentObservationEvent =>
        event.type === "agent.resident-observation.recorded.v1" &&
        event.payload.planReadback.planRecordEventId === input.planRecordEventId &&
        event.payload.observationOrdinal === input.observationOrdinal &&
        event.payload.category === input.category
      );
      if (matching !== undefined) {
        if (!sameObservation(matching, input)) {
          throw new Error("Resident observation idempotency key already binds different provenance.");
        }
        return Object.freeze({ event: matching });
      }

      const appended = await appendObservation(options, input, existing.length + 1);
      return Object.freeze({ event: await readBackObservation(options.ledger, appended, input.identity, plan.id) });
    }
  });
}

async function appendPlan(
  options: CreateResidentPlanObservationStoreInput,
  input: RecordResidentPlanInput,
  expectedNextSequence: number
): Promise<KnowledgeEvent> {
  try {
    return await options.ledger.append({
      type: "agent.resident-plan.recorded.v1",
      version: 1,
      streamId: residentLoopStreamId(input.identity),
      context: eventContext(options, input.identity),
      payload: {
        ...input.identity,
        planRevision: input.planRevision,
        descriptorHash: input.descriptorHash
      }
    }, { expectedNextSequence });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      throw new Error("Resident plan append conflicted; reread the durable stream before retrying.");
    }
    throw error;
  }
}

async function appendObservation(
  options: CreateResidentPlanObservationStoreInput,
  input: RecordResidentObservationInput,
  expectedNextSequence: number
): Promise<KnowledgeEvent> {
  try {
    return await options.ledger.append({
      type: "agent.resident-observation.recorded.v1",
      version: 1,
      streamId: residentLoopStreamId(input.identity),
      context: eventContext(options, input.identity),
      payload: {
        ...input.identity,
        planReadback: {
          planRecordEventId: input.planRecordEventId,
          taskId: input.identity.taskId,
          attemptId: input.identity.attemptId,
          runId: input.identity.runId
        },
        observationOrdinal: input.observationOrdinal,
        category: input.category,
        observationHash: input.observationHash
      }
    }, { expectedNextSequence });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      throw new Error("Resident observation append conflicted; reread the durable stream before retrying.");
    }
    throw error;
  }
}

function eventContext(options: CreateResidentPlanObservationStoreInput, identity: ResidentLoopIdentity) {
  return {
    actor: options.actor,
    occurredAt: options.now(),
    causationId: identity.causationEventId,
    correlationId: identity.correlationId,
    coreVersion: options.coreVersion ?? "0.1.0",
    packVersions: options.packVersions ?? { core: "0.1.0", agent: "0.1.0" }
  };
}

async function readBackPlan(
  ledger: EventLedger,
  appended: KnowledgeEvent,
  identity: ResidentLoopIdentity
): Promise<ResidentPlanEvent> {
  const readback = await ledger.readStream(residentLoopStreamId(identity));
  const plan = readback.find((event): event is ResidentPlanEvent =>
    event.id === appended.id && event.type === "agent.resident-plan.recorded.v1"
  );
  if (plan === undefined || !sameIdentity(plan.payload, identity)) {
    throw new Error("Resident plan append did not produce an exact durable readback.");
  }
  return plan;
}

async function readBackObservation(
  ledger: EventLedger,
  appended: KnowledgeEvent,
  identity: ResidentLoopIdentity,
  planRecordEventId: string
): Promise<ResidentObservationEvent> {
  const readback = await ledger.readStream(residentLoopStreamId(identity));
  const observation = readback.find((event): event is ResidentObservationEvent =>
    event.id === appended.id && event.type === "agent.resident-observation.recorded.v1"
  );
  if (
    observation === undefined ||
    !sameIdentity(observation.payload, identity) ||
    observation.payload.planReadback.planRecordEventId !== planRecordEventId
  ) {
    throw new Error("Resident observation append did not produce an exact durable readback.");
  }
  return observation;
}

function findPlanReadback(
  events: readonly KnowledgeEvent[],
  eventId: string,
  identity: ResidentLoopIdentity
): ResidentPlanEvent | undefined {
  const plan = events.find((event): event is ResidentPlanEvent =>
    event.id === eventId && event.type === "agent.resident-plan.recorded.v1"
  );
  return plan !== undefined && sameIdentity(plan.payload, identity) ? plan : undefined;
}

function samePlan(event: ResidentPlanEvent, input: RecordResidentPlanInput): boolean {
  return sameIdentity(event.payload, input.identity) &&
    event.payload.planRevision === input.planRevision &&
    event.payload.descriptorHash === input.descriptorHash;
}

function sameObservation(event: ResidentObservationEvent, input: RecordResidentObservationInput): boolean {
  return sameIdentity(event.payload, input.identity) &&
    event.payload.planReadback.planRecordEventId === input.planRecordEventId &&
    event.payload.observationOrdinal === input.observationOrdinal &&
    event.payload.category === input.category &&
    event.payload.observationHash === input.observationHash;
}

function sameIdentity(payload: ResidentPlanEvent["payload"] | ResidentObservationEvent["payload"], identity: ResidentLoopIdentity): boolean {
  return payload.residentAgentId === identity.residentAgentId &&
    payload.taskId === identity.taskId &&
    payload.attemptId === identity.attemptId &&
    payload.runId === identity.runId &&
    payload.policyId === identity.policyId &&
    payload.policyVersion === identity.policyVersion &&
    payload.policyHash === identity.policyHash &&
    payload.authorityHash === identity.authorityHash &&
    payload.causationEventId === identity.causationEventId &&
    payload.correlationId === identity.correlationId &&
    sameArray(payload.sourceEventIds, identity.sourceEventIds) &&
    sameArray(payload.contextArtifactHashes, identity.contextArtifactHashes) &&
    payload.budget.maxSteps === identity.budget.maxSteps &&
    payload.budget.remainingSteps === identity.budget.remainingSteps &&
    payload.budget.contextBytes === identity.budget.contextBytes;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
