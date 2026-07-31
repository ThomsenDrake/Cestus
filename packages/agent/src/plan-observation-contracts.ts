import {
  validateKnowledgeEvent,
  validateResidentLoopEventSequence,
  type AppendableKnowledgeEvent,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf
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
      return Object.freeze({ event: await readBackPlan(options.ledger, appended, input) });
    },

    async recordObservation(input: RecordResidentObservationInput): Promise<ResidentObservationRecord> {
      const streamId = residentLoopStreamId(input.identity);
      const existing = await options.ledger.readStream(streamId);
      const referencedPlan = existing.find((event): event is ResidentPlanEvent =>
        event.id === input.planRecordEventId && event.type === "agent.resident-plan.recorded.v1"
      );
      if (
        referencedPlan !== undefined &&
        sameIdentity(referencedPlan.payload, input.identity) &&
        isSupersededPlan(referencedPlan, existing)
      ) {
        throw new Error("Resident observation cannot bind a superseded plan revision.");
      }
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
      return Object.freeze({ event: await readBackObservation(options.ledger, appended, input) });
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
  input: RecordResidentPlanInput
): Promise<ResidentPlanEvent> {
  const readback = await ledger.readStream(residentLoopStreamId(input.identity));
  const plan = readback.find((event): event is ResidentPlanEvent =>
    event.id === appended.id && event.type === "agent.resident-plan.recorded.v1"
  );
  if (plan === undefined || !samePlan(plan, input)) {
    throw new Error("Resident plan append did not produce an exact durable readback.");
  }
  return plan;
}

async function readBackObservation(
  ledger: EventLedger,
  appended: KnowledgeEvent,
  input: RecordResidentObservationInput
): Promise<ResidentObservationEvent> {
  const readback = await ledger.readStream(residentLoopStreamId(input.identity));
  const observation = readback.find((event): event is ResidentObservationEvent =>
    event.id === appended.id && event.type === "agent.resident-observation.recorded.v1"
  );
  if (observation === undefined || !sameObservation(observation, input)) {
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
  return plan !== undefined && sameIdentity(plan.payload, identity) && !isSupersededPlan(plan, events)
    ? plan
    : undefined;
}

function isSupersededPlan(plan: ResidentPlanEvent, events: readonly KnowledgeEvent[]): boolean {
  return events.some((event): boolean =>
    event.type === "agent.resident-plan.recorded.v1" &&
    event.id !== plan.id &&
    sameIdentity(event.payload, plan.payload) &&
    event.payload.planRevision > plan.payload.planRevision
  );
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

export type ResidentPlanEventV2 = KnowledgeEventOf<"agent.resident-plan.recorded.v2">;
export type ResidentObservationEventV2 = KnowledgeEventOf<"agent.resident-observation.recorded.v2">;
export type ResidentToolStepEventV2 = KnowledgeEventOf<"agent.resident-tool-step.recorded.v2">;
export type ResidentSuspensionEventV2 = KnowledgeEventOf<"agent.resident-loop.suspended.v2">;
export type ResidentResultEventV2 = KnowledgeEventOf<"agent.resident-loop.result.recorded.v2">;

export type ResidentLoopIdentityV2 = Pick<
  ResidentPlanEventV2["payload"],
  "residentAgentId" | "workspaceId" | "taskId" | "attemptId" | "runId"
>;

export interface ResidentLoopReplayV2 {
  readonly identity: ResidentLoopIdentityV2;
  readonly events: readonly (
    ResidentPlanEventV2 |
    ResidentObservationEventV2 |
    ResidentToolStepEventV2 |
    ResidentSuspensionEventV2 |
    ResidentResultEventV2
  )[];
  readonly plans: readonly ResidentPlanEventV2[];
  readonly observations: readonly ResidentObservationEventV2[];
  readonly toolSteps: readonly ResidentToolStepEventV2[];
  readonly suspensions: readonly ResidentSuspensionEventV2[];
  readonly results: readonly ResidentResultEventV2[];
}

export interface ResidentPlanObservationStoreV2 {
  appendPlan(input: unknown): Promise<ResidentPlanEventV2>;
  appendObservation(input: unknown): Promise<ResidentObservationEventV2>;
  appendToolStep(input: unknown): Promise<ResidentToolStepEventV2>;
  appendSuspension(input: unknown): Promise<ResidentSuspensionEventV2>;
  appendResult(input: unknown): Promise<ResidentResultEventV2>;
  readPlan(eventId: string): Promise<ResidentPlanEventV2 | undefined>;
  readObservation(eventId: string): Promise<ResidentObservationEventV2 | undefined>;
  readToolStep(eventId: string): Promise<ResidentToolStepEventV2 | undefined>;
  readSuspension(eventId: string): Promise<ResidentSuspensionEventV2 | undefined>;
  readResult(eventId: string): Promise<ResidentResultEventV2 | undefined>;
  readReplay(identity: ResidentLoopIdentityV2): Promise<ResidentLoopReplayV2>;
}

type ResidentLoopEventV2 =
  | ResidentPlanEventV2
  | ResidentObservationEventV2
  | ResidentToolStepEventV2
  | ResidentSuspensionEventV2
  | ResidentResultEventV2;

type ResidentLoopEventTypeV2 = ResidentLoopEventV2["type"];
type ResidentLoopPayloadV2ByType = {
  [Type in ResidentLoopEventTypeV2]: Extract<ResidentLoopEventV2, { type: Type }>["payload"];
};

/**
 * The V2 store is separate from the released V1 recorder. Every write is
 * parsed from a descriptor-copied snapshot, admitted with stream and global
 * concurrency, then returned only from its exact durable reread.
 */
export function createResidentPlanObservationStoreV2(
  options: CreateResidentPlanObservationStoreInput
): ResidentPlanObservationStoreV2 {
  return Object.freeze({
    appendPlan: async (input: unknown) =>
      await appendResidentLoopV2(options, "agent.resident-plan.recorded.v2", input),
    appendObservation: async (input: unknown) =>
      await appendResidentLoopV2(options, "agent.resident-observation.recorded.v2", input),
    appendToolStep: async (input: unknown) =>
      await appendResidentLoopV2(options, "agent.resident-tool-step.recorded.v2", input),
    appendSuspension: async (input: unknown) =>
      await appendResidentLoopV2(options, "agent.resident-loop.suspended.v2", input),
    appendResult: async (input: unknown) =>
      await appendResidentLoopV2(options, "agent.resident-loop.result.recorded.v2", input),
    readPlan: async (eventId: string) =>
      await readResidentLoopV2Event(options.ledger, eventId, "agent.resident-plan.recorded.v2"),
    readObservation: async (eventId: string) =>
      await readResidentLoopV2Event(options.ledger, eventId, "agent.resident-observation.recorded.v2"),
    readToolStep: async (eventId: string) =>
      await readResidentLoopV2Event(options.ledger, eventId, "agent.resident-tool-step.recorded.v2"),
    readSuspension: async (eventId: string) =>
      await readResidentLoopV2Event(options.ledger, eventId, "agent.resident-loop.suspended.v2"),
    readResult: async (eventId: string) =>
      await readResidentLoopV2Event(options.ledger, eventId, "agent.resident-loop.result.recorded.v2"),
    readReplay: async (identity: ResidentLoopIdentityV2) =>
      await readResidentLoopV2Replay(options.ledger, copyResidentLoopV2Identity(identity))
  });
}

async function appendResidentLoopV2<Type extends ResidentLoopEventTypeV2>(
  options: CreateResidentPlanObservationStoreInput,
  type: Type,
  input: unknown
): Promise<Extract<ResidentLoopEventV2, { type: Type }>> {
  const payload = parseResidentLoopV2Payload(options, type, input);
  const identity = residentLoopV2Identity(payload);
  const streamId = residentLoopStreamId(identity);
  const [stream, allEvents] = await Promise.all([
    options.ledger.readStream(streamId),
    options.ledger.readAll()
  ]);
  const residentStream = stream.filter(isResidentLoopV2Event);
  const stableKey = residentLoopV2StableKey(type, payload);
  const prior = residentStream.find((event) =>
    event.type === type &&
    residentLoopV2StableKey(type, event.payload) === stableKey
  );
  if (prior !== undefined) {
    if (canonicalJson(prior.payload) !== canonicalJson(payload)) {
      throw new Error(`Resident V2 ${type} stable key already binds different canonical bytes.`);
    }
    return copyResidentLoopV2Event(
      prior as Extract<ResidentLoopEventV2, { type: Type }>
    );
  }
  if (type === "agent.resident-plan.recorded.v2") {
    assertGloballyUnusedToolRequestIds(
      payload as ResidentPlanEventV2["payload"],
      allEvents
    );
  }

  const appendable = {
    type,
    version: 1,
    streamId,
    context: {
      actor: options.actor,
      occurredAt: options.now(),
      causationId: payload.causationId,
      correlationId: payload.correlationId,
      coreVersion: options.coreVersion ?? "0.1.0",
      packVersions: options.packVersions ?? { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  } as AppendableKnowledgeEvent;

  let appended: KnowledgeEvent;
  try {
    appended = await options.ledger.append(appendable, {
      expectedNextSequence: stream.length + 1,
      expectedGlobalEventCount: allEvents.length
    });
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      throw new Error("Resident V2 append conflicted; reread the durable stream and global ledger before retrying.");
    }
    throw error;
  }

  const reread = (await options.ledger.readStream(streamId)).find((event) => event.id === appended.id);
  if (
    reread === undefined ||
    reread.type !== type ||
    canonicalJson(reread.payload) !== canonicalJson(payload)
  ) {
    throw new Error("Resident V2 append did not produce its exact canonical durable reread.");
  }
  const replay = (await options.ledger.readStream(streamId)).filter(isResidentLoopV2Event);
  const validated = validateResidentLoopEventSequence(replay);
  if (!validated.success) {
    throw new Error(`Resident V2 durable prefix is invalid: ${validated.issues.join("; ")}`);
  }
  return copyResidentLoopV2Event(
    reread as Extract<ResidentLoopEventV2, { type: Type }>
  );
}

function parseResidentLoopV2Payload<Type extends ResidentLoopEventTypeV2>(
  options: CreateResidentPlanObservationStoreInput,
  type: Type,
  input: unknown
): ResidentLoopPayloadV2ByType[Type] {
  const copied = copyPlainOwnData(input);
  if (copied === undefined || copied === null || typeof copied !== "object" || Array.isArray(copied)) {
    throw new Error(`Resident V2 ${type} payload must be plain own-data.`);
  }
  const identity = residentLoopV2Identity(copied as Record<string, unknown>);
  const candidate = {
    id: "evt_resident_v2_pending_validation",
    type,
    version: 1,
    streamId: residentLoopStreamId(identity),
    sequence: 1,
    context: {
      actor: options.actor,
      occurredAt: options.now(),
      causationId: Reflect.get(copied, "causationId"),
      correlationId: Reflect.get(copied, "correlationId"),
      coreVersion: options.coreVersion ?? "0.1.0",
      packVersions: options.packVersions ?? { core: "0.1.0", agent: "0.1.0" }
    },
    payload: copied
  };
  const parsed = validateKnowledgeEvent(candidate);
  if (!parsed.success || parsed.data.type !== type) {
    throw new Error(`Resident V2 ${type} payload failed its canonical parser.`);
  }
  return parsed.data.payload as ResidentLoopPayloadV2ByType[Type];
}

function residentLoopV2Identity(payload: Record<string, unknown>): ResidentLoopIdentityV2 {
  const identity = {
    residentAgentId: payload.residentAgentId,
    workspaceId: payload.workspaceId,
    taskId: payload.taskId,
    attemptId: payload.attemptId,
    runId: payload.runId
  };
  if (
    identity.residentAgentId !== "agent_default" ||
    !Object.values(identity).every((value) => typeof value === "string" && value.length > 0)
  ) {
    throw new Error("Resident V2 payload requires its complete loop identity.");
  }
  return Object.freeze(identity) as ResidentLoopIdentityV2;
}

function copyResidentLoopV2Identity(identity: ResidentLoopIdentityV2): ResidentLoopIdentityV2 {
  return residentLoopV2Identity(copyPlainOwnData(identity) as Record<string, unknown>);
}

function isResidentLoopV2Event(event: KnowledgeEvent): event is ResidentLoopEventV2 {
  return event.type === "agent.resident-plan.recorded.v2" ||
    event.type === "agent.resident-observation.recorded.v2" ||
    event.type === "agent.resident-tool-step.recorded.v2" ||
    event.type === "agent.resident-loop.suspended.v2" ||
    event.type === "agent.resident-loop.result.recorded.v2";
}

async function readResidentLoopV2Event<Type extends ResidentLoopEventTypeV2>(
  ledger: EventLedger,
  eventId: string,
  type: Type
): Promise<Extract<ResidentLoopEventV2, { type: Type }> | undefined> {
  const event = (await ledger.readAll()).find((candidate) => candidate.id === eventId);
  if (event === undefined) return undefined;
  if (event.type !== type || !validateKnowledgeEvent(event).success) {
    throw new Error(`Resident V2 event ${eventId} does not match ${type}.`);
  }
  return copyResidentLoopV2Event(
    event as Extract<ResidentLoopEventV2, { type: Type }>
  );
}

async function readResidentLoopV2Replay(
  ledger: EventLedger,
  identity: ResidentLoopIdentityV2
): Promise<ResidentLoopReplayV2> {
  const events = (await ledger.readStream(residentLoopStreamId(identity))).filter(isResidentLoopV2Event);
  if (events.length > 0) {
    const validated = validateResidentLoopEventSequence(events);
    if (!validated.success) {
      throw new Error(`Resident V2 durable replay is invalid: ${validated.issues.join("; ")}`);
    }
  }
  const frozenEvents = Object.freeze(
    events.map((event) => copyResidentLoopV2Event(event))
  );
  return Object.freeze({
    identity,
    events: frozenEvents,
    plans: Object.freeze(frozenEvents.filter((event): event is ResidentPlanEventV2 =>
      event.type === "agent.resident-plan.recorded.v2")),
    observations: Object.freeze(frozenEvents.filter((event): event is ResidentObservationEventV2 =>
      event.type === "agent.resident-observation.recorded.v2")),
    toolSteps: Object.freeze(frozenEvents.filter((event): event is ResidentToolStepEventV2 =>
      event.type === "agent.resident-tool-step.recorded.v2")),
    suspensions: Object.freeze(frozenEvents.filter((event): event is ResidentSuspensionEventV2 =>
      event.type === "agent.resident-loop.suspended.v2")),
    results: Object.freeze(frozenEvents.filter((event): event is ResidentResultEventV2 =>
      event.type === "agent.resident-loop.result.recorded.v2"))
  });
}

function residentLoopV2StableKey(type: ResidentLoopEventTypeV2, payload: Record<string, unknown>): string {
  if (type === "agent.resident-plan.recorded.v2") return `plan:${String(payload.planId)}`;
  if (type === "agent.resident-observation.recorded.v2") return `observation:${String(payload.observationId)}`;
  if (type === "agent.resident-tool-step.recorded.v2") {
    const readback = payload.gatewayReadbacks as Record<string, unknown>;
    return `tool:${String(payload.toolRequestId)}:${String(readback.stage)}:${String(payload.state)}`;
  }
  if (type === "agent.resident-loop.suspended.v2") {
    const checkpoint = payload.checkpoint as Record<string, unknown>;
    return `suspension:${String(checkpoint.orchestrationCheckpointEventId)}:${String(payload.suspensionCategory)}`;
  }
  const finalObservation = payload.finalObservationReadback as Record<string, unknown>;
  return `result:${String(payload.planId)}:${String(payload.planRevision)}:${String(finalObservation.observationEventId)}:${String(payload.outcome)}:${String(payload.category)}`;
}

function assertGloballyUnusedToolRequestIds(
  payload: ResidentPlanEventV2["payload"],
  allEvents: readonly KnowledgeEvent[]
): void {
  const requested = payload.steps.map((step) => step.toolRequestId);
  if (new Set(requested).size !== requested.length) {
    throw new Error("Resident V2 plan repeats a stable tool request ID.");
  }
  const burned = new Set<string>();
  for (const event of allEvents) {
    if (event.type === "agent.resident-plan.recorded.v2") {
      for (const step of event.payload.steps) burned.add(step.toolRequestId);
    } else if (event.type.startsWith("agent.resident-domain.")) {
      const locator = Reflect.get(event.payload, "logicalLocator") as Record<string, unknown> | undefined;
      const toolRequestId = locator === undefined ? undefined : Reflect.get(locator, "toolRequestId");
      if (typeof toolRequestId === "string") burned.add(toolRequestId);
    }
  }
  const reused = requested.find((toolRequestId) => burned.has(toolRequestId));
  if (reused !== undefined) {
    throw new Error(`Resident V2 stable tool request ID ${reused} is already durably burned.`);
  }
}

function copyPlainOwnData(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "undefined") {
    return value;
  }
  if (typeof value !== "object") throw new Error("Resident V2 input must contain only plain own-data.");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) throw new Error("Resident V2 input cannot contain symbol keys.");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("Resident V2 input arrays must use the default prototype.");
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("Resident V2 input arrays must be dense own-data.");
      }
      copy.push(copyPlainOwnData(descriptor.value));
    }
    if (keys.length !== value.length + 1) throw new Error("Resident V2 input arrays cannot carry extra properties.");
    return Object.freeze(copy);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Resident V2 input objects must use a plain prototype.");
  }
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string" || key.length === 0) throw new Error("Resident V2 input keys must be nonempty strings.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("Resident V2 input must not contain accessors or hidden properties.");
    }
    copy[key] = copyPlainOwnData(descriptor.value);
  }
  return Object.freeze(copy);
}

function copyResidentLoopV2Event<Type extends ResidentLoopEventTypeV2>(
  event: Extract<ResidentLoopEventV2, { type: Type }>
): Extract<ResidentLoopEventV2, { type: Type }> {
  return copyPlainOwnData(event) as Extract<ResidentLoopEventV2, { type: Type }>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
