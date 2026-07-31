import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  validateKnowledgeEvent,
  validateResidentLoopEventSequence
} from "../../ontology/src/contracts.js";

type DataRecord = Readonly<Record<string, unknown>>;
type CurrentnessToken = object;

interface ResidentPlanObservationPort {
  readReplay(identity: unknown): Promise<unknown>;
  appendPlan(input: unknown): Promise<unknown>;
  appendObservation(input: unknown): Promise<unknown>;
  appendToolStep(input: unknown): Promise<unknown>;
  appendResult(input: unknown): Promise<unknown>;
  readPlan(eventId: unknown): Promise<unknown>;
  readObservation(eventId: unknown): Promise<unknown>;
  readToolStep(eventId: unknown): Promise<unknown>;
  readResult(eventId: unknown): Promise<unknown>;
}

interface ResidentCandidateProviderPort {
  createInitialCandidate(input: unknown): Promise<unknown>;
  createReplanCandidate(input: unknown): Promise<unknown>;
}

interface ResidentGatewayPort {
  preparePlannedStepBindings(input: unknown): Promise<unknown>;
  requestFreshAuthorized(input: unknown): Promise<unknown>;
  readFreshHumanDecision(input: unknown): Promise<unknown>;
  executeFreshAuthorized(input: unknown): Promise<unknown>;
  rereadAndIssueFromLedger(input: unknown): Promise<unknown>;
  readCanonicalToolStepMaterial(input: unknown): unknown;
}

interface ResidentMountedAuthorityPort {
  reverifyAfterAwait(token: unknown): Promise<unknown>;
  suspendAndRelease(input: unknown, token: unknown): Promise<unknown>;
  recoverSuspensionPrefix(input: unknown): Promise<unknown>;
  reclaimAndReverify(input: unknown): Promise<unknown>;
}

interface ResidentHandoffProjectionPort {
  readFull(input: unknown): Promise<unknown>;
}

interface LoopState {
  token: CurrentnessToken | undefined;
  inFlight: boolean;
}

interface LoopContext {
  readonly planObservation: ResidentPlanObservationPort;
  readonly candidateProvider: ResidentCandidateProviderPort;
  readonly gateway: ResidentGatewayPort;
  readonly canonicalMaterial: (issued: unknown) => unknown;
  readonly mountedAuthority: ResidentMountedAuthorityPort;
  readonly handoffProjection: ResidentHandoffProjectionPort;
  readonly metadata: DataRecord;
  readonly state: LoopState;
}

interface ReplaySnapshot {
  readonly identity: DataRecord;
  readonly events: readonly DataRecord[];
  readonly plans: readonly DataRecord[];
  readonly observations: readonly DataRecord[];
  readonly toolSteps: readonly DataRecord[];
  readonly suspensions: readonly DataRecord[];
  readonly results: readonly DataRecord[];
}

interface BudgetSnapshot {
  readonly ceilings: DataRecord;
  readonly consumed: DataRecord;
  readonly remaining: DataRecord;
  readonly actionConsumption: DataRecord;
}

interface IssuedValue {
  readonly raw: object;
  readonly normalized: DataRecord;
}

const budgetFields = Object.freeze([
  "planRevisions",
  "observationRecords",
  "toolSteps",
  "providerInvocations",
  "providerRequestBytes",
  "providerResponseBytes",
  "contextBytes",
  "derivativeArtifactBytes",
  "activeExecutionMs",
  "approvalSuspensionMs"
] as const);

const hardMaximums: Readonly<Record<typeof budgetFields[number], number>> =
  Object.freeze({
    planRevisions: 3,
    observationRecords: 16,
    toolSteps: 12,
    providerInvocations: 3,
    providerRequestBytes: 1_048_576,
    providerResponseBytes: 1_048_576,
    contextBytes: 1_048_576,
    derivativeArtifactBytes: 16_777_216,
    activeExecutionMs: 900_000,
    approvalSuspensionMs: 86_400_000
  });

const hashPattern = /^sha256:[a-f0-9]{64}$/;
const workspaceIdPattern = /^ws_[a-zA-Z0-9_-]+$/;
const taskIdPattern = /^task_[a-zA-Z0-9_-]+$/;
const attemptIdPattern = /^attempt_[a-zA-Z0-9_-]+$/;
const runIdPattern = /^run_[a-zA-Z0-9_-]+$/;
const planIdPattern = /^plan_[a-zA-Z0-9_-]+$/;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;

export interface ResidentBoundedAgentLoop {
  readonly advance: (candidate: unknown) => Promise<unknown>;
  readonly resume: (input: unknown) => Promise<unknown>;
}

export interface IssuedResidentBoundedAgentLoop {
  readonly metadata: DataRecord;
  readonly loop: ResidentBoundedAgentLoop;
}

/**
 * The only bounded-loop issuer. Its positional ABI is intentionally narrow:
 * the concrete local-runtime factory supplies each already-issued capability.
 */
export function createResidentBoundedAgentLoopFromIssuedCapabilities(
  planObservationCapability: object,
  candidateProviderCapability: object,
  gateway: object,
  mountedAuthorityCapability: object,
  currentnessToken: CurrentnessToken,
  handoffProjectionCapability: object,
  rawMetadata: unknown,
  nowMonotonicMs: () => number
): IssuedResidentBoundedAgentLoop {
  const metadata = normalizeMetadata(rawMetadata);
  const planObservation = requireCapability<ResidentPlanObservationPort>(
    planObservationCapability,
    [
      "readReplay",
      "appendPlan",
      "appendObservation",
      "appendToolStep",
      "appendResult",
      "readPlan",
      "readObservation",
      "readToolStep",
      "readResult"
    ]
  );
  const candidateProvider = requireCapability<ResidentCandidateProviderPort>(
    candidateProviderCapability,
    ["createInitialCandidate", "createReplanCandidate"]
  );
  const issuedGateway = requireCapability<ResidentGatewayPort>(gateway, []);
  const canonicalMaterial = (issued: unknown): unknown =>
    (gateway as ResidentGatewayPort).readCanonicalToolStepMaterial(issued);
  const mountedAuthority = requireCapability<ResidentMountedAuthorityPort>(
    mountedAuthorityCapability,
    [
      "reverifyAfterAwait",
      "suspendAndRelease",
      "recoverSuspensionPrefix",
      "reclaimAndReverify"
    ]
  );
  const handoffProjection = requireCapability<ResidentHandoffProjectionPort>(
    handoffProjectionCapability,
    ["readFull"]
  );
  if (
    currentnessToken === null ||
    typeof currentnessToken !== "object" ||
    types.isProxy(currentnessToken) ||
    typeof nowMonotonicMs !== "function"
  ) {
    throw unavailable();
  }

  const state: LoopState = {
    token: currentnessToken,
    inFlight: false
  };
  const context: LoopContext = Object.freeze({
    planObservation,
    candidateProvider,
    gateway: issuedGateway,
    canonicalMaterial,
    mountedAuthority,
    handoffProjection,
    metadata,
    state
  });
  const loop = Object.freeze({
    advance: async (candidate: unknown): Promise<unknown> =>
      await withExclusiveLoop(state, async () =>
        await advanceResidentLoop(context, candidate)
      ),
    resume: async (input: unknown): Promise<unknown> =>
      await withExclusiveLoop(state, async () =>
        await resumeResidentLoop(context, input)
      )
  });
  return Object.freeze({ metadata, loop });
}

async function advanceResidentLoop(
  context: LoopContext,
  candidateInput: unknown
): Promise<unknown> {
  if (context.state.token === undefined) throw unavailable();
  const candidate = normalizeCandidate(candidateInput, "initial");
  const proposedPlan = requiredRecord(candidate, "proposedPlan");
  const providerPosture = requiredRecord(candidate, "providerPosture");
  const policyConstraints = requiredRecord(candidate, "policyConstraints");
  const identity = identityFromPlan(proposedPlan);
  validateMetadataBinding(context.metadata, proposedPlan, providerPosture);

  const replayRaw = await context.planObservation.readReplay(identity);
  await reverify(context);
  const replay = normalizeReplay(replayRaw, identity);

  if (replay.events.length !== 0) {
    return await completeFromReplay(context, replay, proposedPlan);
  }

  const createdRaw = await context.candidateProvider.createInitialCandidate(
    freezeOwnedData({
      proposedPlan,
      providerPosture,
      policyConstraints
    })
  );
  await reverify(context);
  const created = normalizeCandidate(createdRaw, "initial");
  if (!sameCanonical(created, candidate)) throw unavailable();

  const preparedRaw = await context.gateway.preparePlannedStepBindings(
    plannedStepBindingInput(proposedPlan)
  );
  await reverify(context);
  const bindings = normalizePlannedBindings(preparedRaw, proposedPlan);
  const boundPlan = boundPlanPayload(proposedPlan, bindings);

  const planEvent = await appendAndReadPlan(context, boundPlan);
  const observationBudget = advanceBudget(
    requiredRecord(boundPlan, "budget"),
    "observationRecords"
  );
  const observationPayload = contextObservationPayload(
    boundPlan,
    planEvent,
    observationBudget
  );
  const observationEvent = await appendAndReadObservation(
    context,
    observationPayload
  );
  const logicalLocator = logicalLocatorFor(boundPlan, bindings[0]!);
  const requested = await issuedBoundary(
    context,
    context.gateway.requestFreshAuthorized(logicalLocator)
  );
  let material = readCanonicalMaterial(context, requested);
  validateCanonicalMaterial(material, requested.normalized, bindings[0]!);

  let issuedForMaterial = requested;
  let approved: IssuedValue | undefined;
  const authorizationKind = requiredText(requested.normalized, "authorizationKind");
  if (authorizationKind === "human-approval") {
    const decision = await caughtIssuedBoundary(
      context,
      context.gateway.readFreshHumanDecision(requested.raw)
    );
    if (decision.ok) {
      approved = decision.value;
      requireIssuedStage(approved, "human-approved");
    } else {
      const reread = await issuedBoundary(
        context,
        context.gateway.rereadAndIssueFromLedger(logicalLocator)
      );
      requireIssuedStage(reread, "requested");
      issuedForMaterial = reread;
      material = readCanonicalMaterial(context, issuedForMaterial);
      validateCanonicalMaterial(material, reread.normalized, bindings[0]!);
    }
  } else if (authorizationKind !== "automatic-policy") {
    throw unavailable();
  }

  if (authorizationKind === "automatic-policy" || approved !== undefined) {
    const execution = await caughtIssuedBoundary(
      context,
      context.gateway.executeFreshAuthorized(
        approved === undefined ? requested.raw : approved.raw
      )
    );
    if (execution.ok) {
      requireIssuedStage(execution.value, "completed");
      issuedForMaterial = execution.value;
      material = readCanonicalMaterial(context, issuedForMaterial);
      validateCanonicalMaterial(material, execution.value.normalized, bindings[0]!);
    } else {
      const reread = await issuedBoundary(
        context,
        context.gateway.rereadAndIssueFromLedger(logicalLocator)
      );
      requireIssuedStage(reread, "claimed");
      issuedForMaterial = reread;
      material = readCanonicalMaterial(context, issuedForMaterial);
      validateCanonicalMaterial(material, reread.normalized, bindings[0]!);
    }
  }

  const toolBudget = advanceBudget(observationBudget, "toolSteps");
  const toolPayload = toolStepPayload(
    boundPlan,
    planEvent,
    toolBudget,
    material,
    bindings[0]!
  );
  const toolEvent = await appendAndReadToolStep(context, toolPayload);
  const finalObservationBudget = advanceBudget(toolBudget, "observationRecords");
  const finalObservationPayload = finalObservationPayloadFor(
    boundPlan,
    planEvent,
    toolEvent,
    finalObservationBudget,
    bindings[0]!
  );
  const finalObservationEvent = await appendAndReadObservation(
    context,
    finalObservationPayload
  );

  if (requiredText(issuedForMaterial.normalized, "stage") === "completed") {
    return await appendCompletedResult(
      context,
      boundPlan,
      planEvent,
      finalObservationEvent,
      finalObservationBudget
    );
  }

  const category = authorizationKind === "human-approval" && approved === undefined
    ? "approval-required"
    : "effect-outcome-unknown";
  const checkpoint = suspensionCheckpointCandidate(
    candidate,
    boundPlan,
    planEvent,
    finalObservationEvent,
    logicalLocator,
    requested.normalized,
    issuedForMaterial.normalized,
    approved?.normalized,
    category
  );
  const token = context.state.token;
  if (token === undefined) throw unavailable();
  context.state.token = undefined;
  return await context.mountedAuthority.suspendAndRelease(checkpoint, token);
}

async function resumeResidentLoop(
  context: LoopContext,
  inputValue: unknown
): Promise<unknown> {
  const input = normalizeResumeInput(inputValue);
  const locator = freezeOwnedData({
    taskId: requiredText(input, "taskId"),
    attemptId: requiredText(input, "attemptId"),
    runId: requiredText(input, "runId"),
    checkpointSemanticKey: requiredText(input, "checkpointSemanticKey")
  });
  validateResumeMetadata(context.metadata, locator);
  context.state.token = undefined;
  await context.mountedAuthority.recoverSuspensionPrefix(locator);
  const reclaimed = await context.mountedAuthority.reclaimAndReverify(locator);
  if (
    reclaimed === null ||
    typeof reclaimed !== "object" ||
    types.isProxy(reclaimed)
  ) {
    throw unavailable();
  }
  context.state.token = reclaimed;

  const proposedPlan = requiredRecord(input, "proposedPlan");
  const identity = identityFromResume(context.metadata, locator);
  const replayRaw = await context.planObservation.readReplay(identity);
  await reverify(context);
  const replay = normalizeReplay(replayRaw, identity);
  const suspended = validateSuspendedReplay(replay);
  const priorPlan = replay.plans[0]!;
  const priorPlanPayload = eventPayload(priorPlan);
  validateReplanIdentity(proposedPlan, priorPlanPayload, identity);

  const logicalLocator = requiredRecord(
    requiredRecord(eventPayload(suspended.suspension), "checkpoint"),
    "logicalLocator"
  );
  const reread = await issuedBoundary(
    context,
    context.gateway.rereadAndIssueFromLedger(logicalLocator)
  );
  requireIssuedStage(reread, "claimed");
  const oldBinding = bindingFromLocator(logicalLocator);
  const oldMaterial = readCanonicalMaterial(context, reread);
  validateCanonicalMaterial(oldMaterial, reread.normalized, oldBinding);

  const recoveryBudget = advanceBudget(
    requiredRecord(eventPayload(suspended.result), "budget"),
    "observationRecords"
  );
  const recoveryPayload = recoveryObservationPayload(
    priorPlanPayload,
    priorPlan,
    suspended.result,
    recoveryBudget
  );
  const recoveryObservation = await appendAndReadObservation(
    context,
    recoveryPayload
  );
  const extendedReplay = replayWithEvent(replay, recoveryObservation);
  const candidateInput = freezeOwnedData({
    priorPlan,
    priorPlanReadback: extendedReplay,
    replanObservationReadback: recoveryObservation,
    proposedPlan
  });
  const candidateRaw = await context.candidateProvider.createReplanCandidate(
    candidateInput
  );
  await reverify(context);
  const candidate = normalizeCandidate(candidateRaw, "replan");
  const expectedCandidate = freezeOwnedData({
    kind: "replan",
    ...candidateInput
  });
  if (!sameCanonical(candidate, expectedCandidate)) throw unavailable();

  const preparedRaw = await context.gateway.preparePlannedStepBindings(
    plannedStepBindingInput(proposedPlan)
  );
  await reverify(context);
  const bindings = normalizePlannedBindings(preparedRaw, proposedPlan);
  const boundPlan = boundPlanPayload(proposedPlan, bindings);
  const expectedReplanBudget = advanceBudget(recoveryBudget, "planRevisions");
  if (
    !sameCanonical(requiredRecord(boundPlan, "budget"), expectedReplanBudget)
  ) {
    throw unavailable();
  }

  const planEvent = await appendAndReadPlan(context, boundPlan);
  const observationBudget = advanceBudget(
    requiredRecord(boundPlan, "budget"),
    "observationRecords"
  );
  const observationPayload = contextObservationPayload(
    boundPlan,
    planEvent,
    observationBudget
  );
  const observationEvent = await appendAndReadObservation(
    context,
    observationPayload
  );
  const replanLocator = logicalLocatorFor(boundPlan, bindings[0]!);
  const requested = await issuedBoundary(
    context,
    context.gateway.requestFreshAuthorized(replanLocator)
  );
  requireIssuedStage(requested, "requested");
  const requestedMaterial = readCanonicalMaterial(context, requested);
  validateCanonicalMaterial(requestedMaterial, requested.normalized, bindings[0]!);
  const completed = await issuedBoundary(
    context,
    context.gateway.executeFreshAuthorized(requested.raw)
  );
  requireIssuedStage(completed, "completed");
  const completedMaterial = readCanonicalMaterial(context, completed);
  validateCanonicalMaterial(completedMaterial, completed.normalized, bindings[0]!);

  const toolBudget = advanceBudget(observationBudget, "toolSteps");
  const toolPayload = toolStepPayload(
    boundPlan,
    planEvent,
    toolBudget,
    completedMaterial,
    bindings[0]!
  );
  const toolEvent = await appendAndReadToolStep(context, toolPayload);
  const finalObservationBudget = advanceBudget(toolBudget, "observationRecords");
  const finalPayload = finalObservationPayloadFor(
    boundPlan,
    planEvent,
    toolEvent,
    finalObservationBudget,
    bindings[0]!
  );
  const finalObservation = await appendAndReadObservation(context, finalPayload);
  return await appendCompletedResult(
    context,
    boundPlan,
    planEvent,
    finalObservation,
    finalObservationBudget
  );
}

async function completeFromReplay(
  context: LoopContext,
  replay: ReplaySnapshot,
  proposedPlan: DataRecord
): Promise<unknown> {
  if (
    replay.events.length !== 5 ||
    replay.plans.length !== 1 ||
    replay.observations.length !== 2 ||
    replay.toolSteps.length !== 1 ||
    replay.suspensions.length !== 0 ||
    replay.results.length !== 1
  ) {
    throw unavailable();
  }
  const [planEvent, firstObservation, toolEvent, finalObservation, resultEvent] =
    replay.events;
  if (
    planEvent === undefined ||
    firstObservation === undefined ||
    toolEvent === undefined ||
    finalObservation === undefined ||
    resultEvent === undefined ||
    requiredText(planEvent, "type") !== "agent.resident-plan.recorded.v2" ||
    requiredText(firstObservation, "type") !==
      "agent.resident-observation.recorded.v2" ||
    requiredText(toolEvent, "type") !== "agent.resident-tool-step.recorded.v2" ||
    requiredText(finalObservation, "type") !==
      "agent.resident-observation.recorded.v2" ||
    requiredText(resultEvent, "type") !==
      "agent.resident-loop.result.recorded.v2"
  ) {
    throw unavailable();
  }
  validateResidentEventChain(replay.events);
  const durablePlan = eventPayload(planEvent);
  validateDurableReplayPlan(durablePlan, proposedPlan);
  validateCompletedReplayPayloads(
    durablePlan,
    planEvent,
    firstObservation,
    toolEvent,
    finalObservation
  );
  const resultPayload = eventPayload(resultEvent);
  const expectedResultPayload = completedResultPayload(
    durablePlan,
    planEvent,
    finalObservation,
    requiredRecord(eventPayload(finalObservation), "budget"),
    requiredRecord(resultPayload, "handoffReadback")
  );
  if (!sameCanonical(resultPayload, expectedResultPayload)) {
    throw unavailable();
  }
  const selectedReadback = await readVerifiedHandoff(
    context,
    identityFromPlan(durablePlan),
    requiredRecord(durablePlan, "authority"),
    resultPayload
  );
  if (
    requiredText(resultPayload, "resultHash") !==
      requiredText(selectedReadback, "manifestHash")
  ) {
    throw unavailable();
  }
  return resultEvent;
}

async function appendCompletedResult(
  context: LoopContext,
  plan: DataRecord,
  planEvent: DataRecord,
  finalObservationEvent: DataRecord,
  priorBudget: DataRecord
): Promise<unknown> {
  const identity = identityFromPlan(plan);
  const selectedReadback = await readVerifiedHandoff(
    context,
    identity,
    requiredRecord(plan, "authority")
  );
  const resultPayload = completedResultPayload(
    plan,
    planEvent,
    finalObservationEvent,
    priorBudget,
    selectedReadback
  );
  const appended = await context.planObservation.appendResult(resultPayload);
  await reverify(context);
  const event = normalizeResidentEvent(appended);
  requireEvent(event, "agent.resident-loop.result.recorded.v2", resultPayload);
  const readback = await context.planObservation.readResult(
    requiredText(event, "id")
  );
  await reverify(context);
  const normalizedReadback = normalizeResidentEvent(readback);
  if (!sameCanonical(normalizedReadback, event)) throw unavailable();
  return normalizedReadback;
}

function completedResultPayload(
  plan: DataRecord,
  planEvent: DataRecord,
  finalObservationEvent: DataRecord,
  finalObservationBudget: DataRecord,
  handoffReadback: DataRecord
): DataRecord {
  const budget = advanceBudget(
    finalObservationBudget,
    "activeExecutionMs"
  );
  return freezeOwnedData({
    schemaVersion: "resident-loop-result.v2",
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    workflowDescriptor: requiredRecord(plan, "workflowDescriptor"),
    policy: requiredRecord(plan, "policy"),
    authority: requiredRecord(plan, "authority"),
    sourceEventIds: requiredArray(plan, "sourceEventIds"),
    contextPackRefs: requiredArray(plan, "contextPackRefs"),
    budget,
    causationId: requiredText(finalObservationEvent, "id"),
    correlationId: requiredText(plan, "correlationId"),
    planId: requiredText(plan, "planId"),
    planRevision: requiredInteger(plan, "planRevision"),
    planReadback: planReadback(planEvent),
    finalObservationReadback: observationReadback(finalObservationEvent),
    outcome: "completed",
    category: "handoff-recorded",
    resultHash: requiredText(handoffReadback, "manifestHash"),
    handoffReadback
  });
}

async function appendAndReadPlan(
  context: LoopContext,
  payload: DataRecord
): Promise<DataRecord> {
  const appended = await context.planObservation.appendPlan(payload);
  await reverify(context);
  const event = normalizeResidentEvent(appended);
  requireEvent(event, "agent.resident-plan.recorded.v2", payload);
  const readback = await context.planObservation.readPlan(requiredText(event, "id"));
  await reverify(context);
  const normalizedReadback = normalizeResidentEvent(readback);
  if (!sameCanonical(normalizedReadback, event)) throw unavailable();
  return normalizedReadback;
}

async function appendAndReadObservation(
  context: LoopContext,
  payload: DataRecord
): Promise<DataRecord> {
  const appended = await context.planObservation.appendObservation(payload);
  await reverify(context);
  const event = normalizeResidentEvent(appended);
  requireEvent(event, "agent.resident-observation.recorded.v2", payload);
  const readback = await context.planObservation.readObservation(
    requiredText(event, "id")
  );
  await reverify(context);
  const normalizedReadback = normalizeResidentEvent(readback);
  if (!sameCanonical(normalizedReadback, event)) throw unavailable();
  return normalizedReadback;
}

async function appendAndReadToolStep(
  context: LoopContext,
  payload: DataRecord
): Promise<DataRecord> {
  const appended = await context.planObservation.appendToolStep(payload);
  await reverify(context);
  const event = normalizeResidentEvent(appended);
  requireEvent(event, "agent.resident-tool-step.recorded.v2", payload);
  const readback = await context.planObservation.readToolStep(
    requiredText(event, "id")
  );
  await reverify(context);
  const normalizedReadback = normalizeResidentEvent(readback);
  if (!sameCanonical(normalizedReadback, event)) throw unavailable();
  return normalizedReadback;
}

async function readVerifiedHandoff(
  context: LoopContext,
  identity: DataRecord,
  authorityBinding: DataRecord,
  terminalResult?: DataRecord
): Promise<DataRecord> {
  const hBinding = freezeOwnedData({
    taskId: identity.taskId,
    runId: identity.runId,
    authorityBinding
  });
  const facade = Object.freeze({
    readFull(input: unknown): Promise<unknown> {
      return Reflect.apply(
        context.handoffProjection.readFull,
        context.handoffProjection,
        [freezeOwnedData(input)]
      ) as Promise<unknown>;
    }
  });
  const raw = await facade.readFull({
    taskId: hBinding.taskId,
    runId: hBinding.runId,
    authorityBinding: hBinding.authorityBinding
  });
  await reverify(context);
  const projection = requiredNormalizedRecord(raw, [
    "state",
    "handoffs",
    "selectedHandoff",
    "selectedReadback",
    "history",
    "diagnostics"
  ]);
  if (
    requiredText(projection, "state") !== "task-completed" ||
    requiredArray(projection, "diagnostics").length !== 0
  ) {
    throw unavailable();
  }
  const handoffs = requiredArray(projection, "handoffs");
  const selectedHandoff = requiredRecord(projection, "selectedHandoff");
  const selectedReadback = requiredRecord(projection, "selectedReadback");
  if (
    handoffs.length !== 1 ||
    !sameCanonical(handoffs[0], selectedHandoff) ||
    requiredText(selectedReadback, "outcome") !== "verified" ||
    requiredText(selectedReadback, "taskId") !== requiredText(identity, "taskId") ||
    requiredText(selectedReadback, "runId") !== requiredText(identity, "runId") ||
    !sameCanonical(
      requiredRecord(selectedReadback, "authorityBinding"),
      authorityBinding
    ) ||
    requiredText(selectedHandoff, "handoffId") !==
      requiredText(selectedReadback, "handoffId") ||
    requiredText(selectedHandoff, "taskId") !== requiredText(identity, "taskId") ||
    requiredText(selectedHandoff, "runId") !== requiredText(identity, "runId") ||
    requiredText(selectedReadback, "recordedEventId").length === 0 ||
    requiredText(selectedReadback, "terminalRunEventId").length === 0 ||
    requiredText(selectedReadback, "taskStatusEventId").length === 0 ||
    !hashPattern.test(requiredText(selectedReadback, "manifestHash")) ||
    requiredArray(selectedReadback, "diagnostics").length !== 0
  ) {
    throw unavailable();
  }
  if (
    terminalResult !== undefined &&
    !sameCanonical(
      requiredRecord(terminalResult, "handoffReadback"),
      selectedReadback
    )
  ) {
    throw unavailable();
  }
  return selectedReadback;
}

function readCanonicalMaterial(
  context: LoopContext,
  issued: IssuedValue
): DataRecord {
  return requiredNormalizedRecord(
    context.canonicalMaterial(issued.raw),
    [
      "gatewayReadbacks",
      "allowlistEntryHash",
      "sideEffectClass",
      "requiredApprovalClass",
      "previewHash",
      "inputArtifactHashes",
      "resultArtifactHashes"
    ]
  );
}

async function issuedBoundary(
  context: LoopContext,
  promise: Promise<unknown>
): Promise<IssuedValue> {
  const raw = await promise;
  await reverify(context);
  if (raw === null || typeof raw !== "object" || types.isProxy(raw)) {
    throw unavailable();
  }
  return Object.freeze({
    raw,
    normalized: requiredNormalizedRecord(raw)
  });
}

async function caughtIssuedBoundary(
  context: LoopContext,
  promise: Promise<unknown>
): Promise<
  | Readonly<{ ok: true; value: IssuedValue }>
  | Readonly<{ ok: false }>
> {
  let raw: unknown;
  try {
    raw = await promise;
  } catch {
    await reverify(context);
    return Object.freeze({ ok: false });
  }
  await reverify(context);
  if (raw === null || typeof raw !== "object" || types.isProxy(raw)) {
    throw unavailable();
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      raw,
      normalized: requiredNormalizedRecord(raw)
    })
  });
}

async function reverify(context: LoopContext): Promise<void> {
  const token = context.state.token;
  if (token === undefined) throw unavailable();
  context.state.token = undefined;
  const reverified = await context.mountedAuthority.reverifyAfterAwait(token);
  const rawReadback = exactFrozenOwnDataRecord(reverified, ["kind", "token"]);
  if (rawReadback.kind !== "current") throw unavailable();
  const nextToken = rawReadback.token;
  if (
    nextToken === null ||
    typeof nextToken !== "object" ||
    types.isProxy(nextToken)
  ) {
    throw unavailable();
  }
  context.state.token = nextToken;
}

function normalizeMetadata(value: unknown): DataRecord {
  const metadata = requiredNormalizedRecord(value, [
    "schemaVersion",
    "residentAgentId",
    "workspace",
    "run",
    "providerPosture"
  ]);
  if (
    requiredText(metadata, "schemaVersion") !==
      "resident-loop-factory-ports.v1" ||
    requiredText(metadata, "residentAgentId") !== "agent_default"
  ) {
    throw unavailable();
  }
  const workspace = requiredRecord(metadata, "workspace", [
    "workspaceId",
    "mountInstanceId",
    "admissionGenerationId",
    "policyVersion",
    "policyDigest",
    "lockStateDigest",
    "highWaterMark",
    "highWaterOrdinal"
  ]);
  const run = requiredRecord(metadata, "run", ["taskId", "attemptId", "runId"]);
  const provider = requiredRecord(metadata, "providerPosture", [
    "selection",
    "capability",
    "approval",
    "binding"
  ]);
  requiredRecord(provider, "selection", [
    "providerId",
    "modelId",
    "adapterVersion"
  ]);
  requiredRecord(provider, "capability", [
    "capabilityId",
    "capabilityVersion",
    "capabilityHash",
    "capabilityRevision"
  ]);
  requiredRecord(provider, "approval", [
    "required",
    "approvalProfile",
    "requiredApprovalClass"
  ]);
  requiredRecord(provider, "binding", [
    "promptArtifactHash",
    "approvalPreviewHash"
  ]);
  requirePattern(workspace, "workspaceId", workspaceIdPattern);
  requirePattern(run, "taskId", taskIdPattern);
  requirePattern(run, "attemptId", attemptIdPattern);
  requirePattern(run, "runId", runIdPattern);
  requireHash(workspace, "policyDigest");
  requireHash(workspace, "lockStateDigest");
  requirePattern(workspace, "highWaterMark", eventIdPattern);
  requiredNonnegativeInteger(workspace, "highWaterOrdinal");
  return metadata;
}

function normalizeCandidate(value: unknown, expectedKind: "initial" | "replan"): DataRecord {
  const keys = expectedKind === "initial"
    ? ["kind", "proposedPlan", "providerPosture", "policyConstraints"]
    : [
        "kind",
        "priorPlan",
        "priorPlanReadback",
        "replanObservationReadback",
        "proposedPlan"
      ];
  const candidate = requiredNormalizedRecord(value, keys);
  if (requiredText(candidate, "kind") !== expectedKind) throw unavailable();
  const plan = requiredRecord(candidate, "proposedPlan");
  requirePattern(plan, "planId", planIdPattern);
  normalizeBudget(requiredRecord(plan, "budget"));
  return candidate;
}

function normalizeResumeInput(value: unknown): DataRecord {
  const input = requiredNormalizedRecord(value, [
    "taskId",
    "attemptId",
    "runId",
    "checkpointSemanticKey",
    "proposedPlan"
  ]);
  requirePattern(input, "taskId", taskIdPattern);
  requirePattern(input, "attemptId", attemptIdPattern);
  requirePattern(input, "runId", runIdPattern);
  const checkpoint = requiredText(input, "checkpointSemanticKey");
  if (!checkpoint.startsWith("resident-suspension-")) throw unavailable();
  requiredRecord(input, "proposedPlan");
  return input;
}

function normalizeReplay(value: unknown, identity: DataRecord): ReplaySnapshot {
  const replay = requiredNormalizedRecord(value, [
    "identity",
    "events",
    "plans",
    "observations",
    "toolSteps",
    "suspensions",
    "results"
  ]);
  const replayIdentity = requiredRecord(replay, "identity", [
    "residentAgentId",
    "workspaceId",
    "taskId",
    "attemptId",
    "runId"
  ]);
  if (!sameCanonical(replayIdentity, identity)) throw unavailable();
  const events = normalizeEventArray(requiredArray(replay, "events"));
  const plans = normalizeEventArray(requiredArray(replay, "plans"));
  const observations = normalizeEventArray(requiredArray(replay, "observations"));
  const toolSteps = normalizeEventArray(requiredArray(replay, "toolSteps"));
  const suspensions = normalizeEventArray(requiredArray(replay, "suspensions"));
  const results = normalizeEventArray(requiredArray(replay, "results"));
  const filtered = (type: string): readonly DataRecord[] =>
    events.filter((event) => requiredText(event, "type") === type);
  if (
    !sameCanonical(plans, filtered("agent.resident-plan.recorded.v2")) ||
    !sameCanonical(
      observations,
      filtered("agent.resident-observation.recorded.v2")
    ) ||
    !sameCanonical(toolSteps, filtered("agent.resident-tool-step.recorded.v2")) ||
    !sameCanonical(
      suspensions,
      filtered("agent.resident-loop.suspended.v2")
    ) ||
    !sameCanonical(results, filtered("agent.resident-loop.result.recorded.v2"))
  ) {
    throw unavailable();
  }
  for (const event of events) validateEventIdentity(event, identity);
  return Object.freeze({
    identity: replayIdentity,
    events,
    plans,
    observations,
    toolSteps,
    suspensions,
    results
  });
}

function validateSuspendedReplay(
  replay: ReplaySnapshot
): Readonly<{ suspension: DataRecord; result: DataRecord }> {
  if (
    replay.events.length !== 6 ||
    replay.plans.length !== 1 ||
    replay.observations.length !== 2 ||
    replay.toolSteps.length !== 1 ||
    replay.suspensions.length !== 1 ||
    replay.results.length !== 1
  ) {
    throw unavailable();
  }
  const typesInOrder = replay.events.map((event) => requiredText(event, "type"));
  if (!sameCanonical(typesInOrder, [
    "agent.resident-plan.recorded.v2",
    "agent.resident-observation.recorded.v2",
    "agent.resident-tool-step.recorded.v2",
    "agent.resident-observation.recorded.v2",
    "agent.resident-loop.suspended.v2",
    "agent.resident-loop.result.recorded.v2"
  ])) {
    throw unavailable();
  }
  validateResidentEventChain(replay.events);
  const suspension = replay.suspensions[0]!;
  const result = replay.results[0]!;
  const suspensionPayload = eventPayload(suspension);
  const resultPayload = eventPayload(result);
  if (
    !["approval-required", "effect-outcome-unknown"].includes(
      requiredText(suspensionPayload, "suspensionCategory")
    ) ||
    requiredText(resultPayload, "outcome") !== "resumable" ||
    requiredText(resultPayload, "category") !==
      requiredText(suspensionPayload, "suspensionCategory") ||
    requiredText(
      requiredRecord(resultPayload, "resumeAnchor"),
      "checkpointEventId"
    ) !== requiredText(suspension, "id")
  ) {
    throw unavailable();
  }
  return Object.freeze({ suspension, result });
}

function validateResidentEventChain(events: readonly DataRecord[]): void {
  const parsedEvents = events.map((event) => {
    const parsed = validateKnowledgeEvent(event);
    if (!parsed.success) throw unavailable();
    return parsed.data;
  });
  if (!validateResidentLoopEventSequence(parsedEvents).success) {
    throw unavailable();
  }

  let previousBudget: DataRecord | undefined;
  let previousSequence = 0;
  const ids = new Set<string>();
  for (const event of events) {
    const id = requirePattern(event, "id", eventIdPattern);
    const sequence = requiredPositiveInteger(event, "sequence");
    if (ids.has(id) || sequence <= previousSequence) throw unavailable();
    ids.add(id);
    previousSequence = sequence;
    const payload = eventPayload(event);
    const budget = requiredRecord(payload, "budget");
    normalizeBudget(budget);
    if (previousBudget !== undefined) {
      requireBudgetProgression(previousBudget, budget);
    }
    previousBudget = budget;
  }
}

function validateDurableReplayPlan(
  durablePlan: DataRecord,
  proposedPlan: DataRecord
): void {
  const durableSteps = requiredArray(durablePlan, "steps");
  const proposedSteps = requiredArray(proposedPlan, "steps");
  if (
    durableSteps.length !== proposedSteps.length ||
    durableSteps.length !== 1
  ) {
    throw unavailable();
  }
  const unboundSteps = durableSteps.map((value) => {
    const step = requiredRecordValue(value);
    requiredText(step, "toolRequestId");
    requireHash(step, "executionCapabilityHash");
    return freezeOwnedData(Object.fromEntries(
      Object.entries(step).filter(([key]) =>
        key !== "toolRequestId" && key !== "executionCapabilityHash"
      )
    ));
  });
  const unboundDurablePlan = freezeOwnedData({
    ...durablePlan,
    steps: unboundSteps
  });
  if (!sameCanonical(unboundDurablePlan, proposedPlan)) {
    throw unavailable();
  }
}

function validateCompletedReplayPayloads(
  durablePlan: DataRecord,
  planEvent: DataRecord,
  firstObservation: DataRecord,
  toolEvent: DataRecord,
  finalObservation: DataRecord
): void {
  const firstPayload = eventPayload(firstObservation);
  if (!sameCanonical(
    firstPayload,
    contextObservationPayload(
      durablePlan,
      planEvent,
      requiredRecord(firstPayload, "budget")
    )
  )) {
    throw unavailable();
  }

  const durableStep = requiredRecordValue(
    requiredArray(durablePlan, "steps")[0]
  );
  const toolPayload = eventPayload(toolEvent);
  const gatewayReadbacks = requiredRecord(toolPayload, "gatewayReadbacks");
  const toolMaterial = freezeOwnedData({
    gatewayReadbacks,
    allowlistEntryHash: requiredText(toolPayload, "allowlistEntryHash"),
    sideEffectClass: requiredText(toolPayload, "sideEffectClass"),
    requiredApprovalClass: requiredText(toolPayload, "requiredApprovalClass"),
    previewHash: requiredText(toolPayload, "previewHash"),
    inputArtifactHashes: requiredArray(toolPayload, "inputArtifactHashes"),
    resultArtifactHashes: requiredArray(toolPayload, "resultArtifactHashes")
  });
  if (
    requiredText(gatewayReadbacks, "stage") !== "completed" ||
    !sameCanonical(
      toolPayload,
      toolStepPayload(
        durablePlan,
        planEvent,
        requiredRecord(toolPayload, "budget"),
        toolMaterial,
        durableStep
      )
    )
  ) {
    throw unavailable();
  }

  const finalPayload = eventPayload(finalObservation);
  if (!sameCanonical(
    finalPayload,
    finalObservationPayloadFor(
      durablePlan,
      planEvent,
      toolEvent,
      requiredRecord(finalPayload, "budget"),
      durableStep
    )
  )) {
    throw unavailable();
  }
}

function validateMetadataBinding(
  metadata: DataRecord,
  plan: DataRecord,
  providerPosture: DataRecord
): void {
  const workspace = requiredRecord(metadata, "workspace");
  const run = requiredRecord(metadata, "run");
  const projectedProvider = requiredRecord(metadata, "providerPosture");
  const postureWorkspace = requiredRecord(providerPosture, "workspace");
  const postureRun = requiredRecord(providerPosture, "run");
  if (
    requiredText(plan, "residentAgentId") !==
      requiredText(metadata, "residentAgentId") ||
    requiredText(plan, "workspaceId") !== requiredText(workspace, "workspaceId") ||
    requiredText(plan, "taskId") !== requiredText(run, "taskId") ||
    requiredText(plan, "attemptId") !== requiredText(run, "attemptId") ||
    requiredText(plan, "runId") !== requiredText(run, "runId") ||
    !sameCanonical(postureWorkspace, workspace) ||
    !sameCanonical(postureRun, run) ||
    requiredText(providerPosture, "residentAgentId") !==
      requiredText(metadata, "residentAgentId") ||
    !sameCanonical(
      requiredRecord(projectedProvider, "selection"),
      selectKeys(requiredRecord(providerPosture, "selection"), [
        "providerId",
        "modelId",
        "adapterVersion"
      ])
    ) ||
    !sameCanonical(
      requiredRecord(projectedProvider, "capability"),
      selectKeys(requiredRecord(providerPosture, "capability"), [
        "capabilityId",
        "capabilityVersion",
        "capabilityHash",
        "capabilityRevision"
      ])
    ) ||
    !sameCanonical(
      requiredRecord(projectedProvider, "approval"),
      requiredRecord(providerPosture, "approval")
    ) ||
    !sameCanonical(
      requiredRecord(projectedProvider, "binding"),
      requiredRecord(providerPosture, "binding")
    )
  ) {
    throw unavailable();
  }
}

function validateResumeMetadata(metadata: DataRecord, locator: DataRecord): void {
  const run = requiredRecord(metadata, "run");
  if (
    requiredText(locator, "taskId") !== requiredText(run, "taskId") ||
    requiredText(locator, "attemptId") !== requiredText(run, "attemptId") ||
    requiredText(locator, "runId") !== requiredText(run, "runId") ||
    requiredText(locator, "checkpointSemanticKey") !==
      `resident-suspension-${requiredText(run, "taskId")}`
  ) {
    throw unavailable();
  }
}

function validateReplanIdentity(
  proposedPlan: DataRecord,
  priorPlan: DataRecord,
  identity: DataRecord
): void {
  if (
    requiredText(proposedPlan, "residentAgentId") !==
      requiredText(identity, "residentAgentId") ||
    requiredText(proposedPlan, "workspaceId") !==
      requiredText(identity, "workspaceId") ||
    requiredText(proposedPlan, "taskId") !== requiredText(identity, "taskId") ||
    requiredText(proposedPlan, "attemptId") !==
      requiredText(identity, "attemptId") ||
    requiredText(proposedPlan, "runId") !== requiredText(identity, "runId") ||
    requiredInteger(proposedPlan, "planRevision") !==
      requiredInteger(priorPlan, "planRevision") + 1
  ) {
    throw unavailable();
  }
}

function plannedStepBindingInput(plan: DataRecord): DataRecord {
  const steps = requiredArray(plan, "steps").map((value) => {
    const step = requiredRecordValue(value);
    return freezeOwnedData({
      ordinal: requiredPositiveInteger(step, "ordinal"),
      toolId: requiredText(step, "toolId"),
      toolVersion: requiredText(step, "toolVersion")
    });
  });
  return freezeOwnedData({
    workspaceId: requiredText(plan, "workspaceId"),
    residentAgentId: requiredText(plan, "residentAgentId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    planId: requiredText(plan, "planId"),
    planRevision: requiredInteger(plan, "planRevision"),
    steps
  });
}

function normalizePlannedBindings(
  value: unknown,
  plan: DataRecord
): readonly DataRecord[] {
  const normalized = normalizeFrozenData(value);
  if (!Array.isArray(normalized)) throw unavailable();
  const steps = requiredArray(plan, "steps");
  if (normalized.length !== steps.length || normalized.length !== 1) {
    throw unavailable();
  }
  return Object.freeze(normalized.map((entry, index) => {
    const binding = requiredRecordValue(entry, [
      "workspaceId",
      "residentAgentId",
      "taskId",
      "attemptId",
      "runId",
      "planId",
      "planRevision",
      "ordinal",
      "toolRequestId",
      "toolId",
      "toolVersion",
      "executionCapabilityHash"
    ]);
    const step = requiredRecordValue(steps[index]);
    if (
      requiredText(binding, "workspaceId") !== requiredText(plan, "workspaceId") ||
      requiredText(binding, "residentAgentId") !==
        requiredText(plan, "residentAgentId") ||
      requiredText(binding, "taskId") !== requiredText(plan, "taskId") ||
      requiredText(binding, "attemptId") !== requiredText(plan, "attemptId") ||
      requiredText(binding, "runId") !== requiredText(plan, "runId") ||
      requiredText(binding, "planId") !== requiredText(plan, "planId") ||
      requiredInteger(binding, "planRevision") !==
        requiredInteger(plan, "planRevision") ||
      requiredPositiveInteger(binding, "ordinal") !==
        requiredPositiveInteger(step, "ordinal") ||
      requiredText(binding, "toolId") !== requiredText(step, "toolId") ||
      requiredText(binding, "toolVersion") !== requiredText(step, "toolVersion") ||
      !hashPattern.test(requiredText(binding, "executionCapabilityHash"))
    ) {
      throw unavailable();
    }
    return binding;
  }));
}

function boundPlanPayload(
  proposedPlan: DataRecord,
  bindings: readonly DataRecord[]
): DataRecord {
  const steps = requiredArray(proposedPlan, "steps").map((value, index) => {
    const step = requiredRecordValue(value);
    const binding = bindings[index];
    if (binding === undefined) throw unavailable();
    return freezeOwnedData({
      ...step,
      toolRequestId: requiredText(binding, "toolRequestId"),
      executionCapabilityHash: requiredText(binding, "executionCapabilityHash")
    });
  });
  return freezeOwnedData({
    ...proposedPlan,
    budget: requiredRecord(proposedPlan, "budget"),
    steps
  });
}

function contextObservationPayload(
  plan: DataRecord,
  planEvent: DataRecord,
  budget: DataRecord
): DataRecord {
  const planId = requiredText(plan, "planId");
  return freezeOwnedData({
    schemaVersion: "resident-observation-record.v2",
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    workflowDescriptor: requiredRecord(plan, "workflowDescriptor"),
    policy: requiredRecord(plan, "policy"),
    authority: requiredRecord(plan, "authority"),
    sourceEventIds: requiredArray(plan, "sourceEventIds"),
    contextPackRefs: requiredArray(plan, "contextPackRefs"),
    budget,
    causationId: requiredText(planEvent, "id"),
    correlationId: requiredText(plan, "correlationId"),
    observationId: planId.replace(/^plan_/, "observation_"),
    planId,
    planRevision: requiredInteger(plan, "planRevision"),
    planReadback: planReadback(planEvent),
    stepOrdinal: 1,
    kind: "context-verified",
    safeSummary: "The bounded resident fixture is ready.",
    artifactHashes: requiredArray(plan, "contextPackRefs").map((entry) =>
      requiredText(requiredRecordValue(entry), "contentHash")
    )
  });
}

function recoveryObservationPayload(
  plan: DataRecord,
  planEvent: DataRecord,
  resumableResult: DataRecord,
  budget: DataRecord
): DataRecord {
  const planBase = requiredText(plan, "planId")
    .replace(/^plan_/, "")
    .replace(/_[0-9]+$/, "");
  return freezeOwnedData({
    schemaVersion: "resident-observation-record.v2",
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    workflowDescriptor: requiredRecord(plan, "workflowDescriptor"),
    policy: requiredRecord(plan, "policy"),
    authority: requiredRecord(plan, "authority"),
    sourceEventIds: requiredArray(plan, "sourceEventIds"),
    contextPackRefs: requiredArray(plan, "contextPackRefs"),
    budget,
    causationId: requiredText(resumableResult, "id"),
    correlationId: requiredText(plan, "correlationId"),
    observationId: `observation_${planBase}_recovery`,
    planId: requiredText(plan, "planId"),
    planRevision: requiredInteger(plan, "planRevision"),
    planReadback: planReadback(planEvent),
    stepOrdinal: 1,
    kind: "recovery",
    safeSummary: "The durable suspension prefix was recovered.",
    artifactHashes: []
  });
}

function toolStepPayload(
  plan: DataRecord,
  planEvent: DataRecord,
  budget: DataRecord,
  material: DataRecord,
  binding: DataRecord
): DataRecord {
  const gatewayReadbacks = requiredRecord(material, "gatewayReadbacks");
  const stage = requiredText(gatewayReadbacks, "stage");
  const causationId = stage === "completed"
    ? requiredText(gatewayReadbacks, "resultEventId")
    : stage === "requested"
      ? requiredText(gatewayReadbacks, "requestEventId")
      : requiredText(gatewayReadbacks, "executionClaimEventId");
  return freezeOwnedData({
    schemaVersion: "resident-tool-step-record.v2",
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    workflowDescriptor: requiredRecord(plan, "workflowDescriptor"),
    policy: requiredRecord(plan, "policy"),
    authority: requiredRecord(plan, "authority"),
    sourceEventIds: requiredArray(plan, "sourceEventIds"),
    contextPackRefs: requiredArray(plan, "contextPackRefs"),
    budget,
    causationId,
    correlationId: requiredText(plan, "correlationId"),
    planId: requiredText(plan, "planId"),
    planRevision: requiredInteger(plan, "planRevision"),
    planReadback: planReadback(planEvent),
    stepOrdinal: requiredPositiveInteger(binding, "ordinal"),
    toolRequestId: requiredText(binding, "toolRequestId"),
    toolId: requiredText(binding, "toolId"),
    toolVersion: requiredText(binding, "toolVersion"),
    allowlistEntryHash: requiredText(material, "allowlistEntryHash"),
    sideEffectClass: requiredText(material, "sideEffectClass"),
    requiredApprovalClass: requiredText(material, "requiredApprovalClass"),
    state: stage === "completed" ? "executed" : "suspended",
    previewHash: requiredText(material, "previewHash"),
    gatewayReadbacks,
    inputArtifactHashes: requiredArray(material, "inputArtifactHashes"),
    resultArtifactHashes: requiredArray(material, "resultArtifactHashes")
  });
}

function finalObservationPayloadFor(
  plan: DataRecord,
  planEvent: DataRecord,
  toolEvent: DataRecord,
  budget: DataRecord,
  binding: DataRecord
): DataRecord {
  const toolPayload = eventPayload(toolEvent);
  const planId = requiredText(plan, "planId");
  const revision = requiredInteger(plan, "planRevision");
  const base = planId.replace(/^plan_/, "").replace(/_[0-9]+$/, "");
  const observationId = revision === 0
    ? `observation_${base}_final`
    : `observation_${base}_final_${revision + 1}`;
  return freezeOwnedData({
    schemaVersion: "resident-observation-record.v2",
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    workflowDescriptor: requiredRecord(plan, "workflowDescriptor"),
    policy: requiredRecord(plan, "policy"),
    authority: requiredRecord(plan, "authority"),
    sourceEventIds: requiredArray(plan, "sourceEventIds"),
    contextPackRefs: requiredArray(plan, "contextPackRefs"),
    budget,
    causationId: requiredText(toolEvent, "id"),
    correlationId: requiredText(plan, "correlationId"),
    observationId,
    planId,
    planRevision: revision,
    planReadback: planReadback(planEvent),
    stepOrdinal: requiredPositiveInteger(binding, "ordinal"),
    kind: "tool-result",
    safeSummary: "The durable gateway state was observed.",
    artifactHashes: requiredArray(toolPayload, "resultArtifactHashes"),
    toolRequestId: requiredText(binding, "toolRequestId")
  });
}

function suspensionCheckpointCandidate(
  candidate: DataRecord,
  plan: DataRecord,
  planEvent: DataRecord,
  finalObservation: DataRecord,
  logicalLocator: DataRecord,
  requested: DataRecord,
  issued: DataRecord,
  approved: DataRecord | undefined,
  category: "approval-required" | "effect-outcome-unknown"
): DataRecord {
  const providerPosture = requiredRecord(candidate, "providerPosture");
  const checkpointedAt = requiredText(
    requiredRecord(providerPosture, "feasibility"),
    "assessedAt"
  );
  const deadline = new Date(Date.parse(checkpointedAt) + 3_600_000).toISOString();
  const binding = freezeOwnedData({
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    runMode: requiredText(plan, "runMode"),
    retryGeneration: 0,
    policy: requiredRecord(plan, "policy"),
    authority: freezeOwnedData({
      authorityBinding: requiredRecord(plan, "authority"),
      sourceEventIds: requiredArray(plan, "sourceEventIds"),
      contextPackRefs: requiredArray(plan, "contextPackRefs")
    }),
    providerPosture
  });
  const planId = requiredText(plan, "planId");
  const suspensionSemanticKey = semanticKey(
    "resident-loop-suspension",
    freezeOwnedData({ binding, planId })
  );
  const resultSemanticKey = semanticKey(
    "resident-loop-result",
    freezeOwnedData({
      binding,
      finalObservationId: requiredText(finalObservation, "id")
    })
  );
  if (suspensionSemanticKey === resultSemanticKey) throw unavailable();
  const nextSafeAction = category === "approval-required"
    ? "await-human-review"
    : "reconcile-effect-outcome";
  const instruction = freezeOwnedData({
    schemaVersion: "resident-loop-suspension-instruction.v1",
    residentAgentId: requiredText(plan, "residentAgentId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    planRecordEventId: requiredText(planEvent, "id"),
    finalObservationEventId: requiredText(finalObservation, "id"),
    suspensionCategory: category,
    requestEventId: requiredText(requested, "requestEventId"),
    resumptionDeadlineAt: deadline,
    nextSafeAction,
    suspensionSemanticKey,
    resultSemanticKey,
    ...(category === "effect-outcome-unknown" ? {
      logicalLocator,
      ...(approved === undefined ? {} : {
        decisionEventId: requiredText(approved, "decisionEventId"),
        approvedBy: requiredText(approved, "approvedBy"),
        approvedPreviewHash: requiredText(approved, "approvedPreviewHash")
      }),
      executionClaimEventId: requiredText(issued, "executionClaimEventId"),
      executionCapabilityHash: requiredText(
        logicalLocator,
        "executionCapabilityHash"
      )
    } : {})
  });
  return freezeOwnedData({
    taskId: requiredText(plan, "taskId"),
    runType: requiredText(plan, "runMode"),
    attemptId: requiredText(plan, "attemptId"),
    retryGeneration: 0,
    checkpointKind: "resident-loop-suspension",
    checkpointedAt,
    runId: requiredText(plan, "runId"),
    resumeIdempotencyKey: `resident-suspension-${requiredText(plan, "taskId")}`,
    contextBindings: [],
    residentLoopSuspension: instruction,
    safeNextActions: [nextSafeAction]
  });
}

function validateCanonicalMaterial(
  material: DataRecord,
  issued: DataRecord,
  binding: DataRecord
): void {
  requireHash(material, "allowlistEntryHash");
  requireHash(material, "previewHash");
  for (const key of ["inputArtifactHashes", "resultArtifactHashes"] as const) {
    for (const value of requiredArray(material, key)) {
      if (typeof value !== "string" || !hashPattern.test(value)) throw unavailable();
    }
  }
  const gatewayReadbacks = requiredRecord(material, "gatewayReadbacks");
  const stage = requiredText(issued, "stage");
  if (
    requiredText(gatewayReadbacks, "stage") !== stage ||
    requiredText(gatewayReadbacks, "authorizationKind") !==
      requiredText(issued, "authorizationKind") ||
    requiredText(gatewayReadbacks, "requestEventId") !==
      requiredText(issued, "requestEventId")
  ) {
    throw unavailable();
  }
  const locator = requiredRecord(issued, "logicalLocator");
  if (
    !sameCanonical(locator, logicalLocatorForRecord(binding)) ||
    requiredText(issued, "executionCapabilityHash") !==
      requiredText(binding, "executionCapabilityHash")
  ) {
    throw unavailable();
  }
  const allowedIssuedKeys = [
    "authorizationKind",
    "stage",
    "logicalLocator",
    "executionCapabilityHash",
    "requestEventId",
    ...(stage === "human-approved"
      ? ["decisionEventId", "approvedBy", "approvedPreviewHash"]
      : []),
    ...(stage === "claimed"
      ? [
          ...(requiredText(issued, "authorizationKind") === "human-approval"
            ? ["decisionEventId", "approvedBy", "approvedPreviewHash"]
            : []),
          "executionClaimEventId",
          "category"
        ]
      : []),
    ...(stage === "completed"
      ? [
          ...(requiredText(issued, "authorizationKind") === "human-approval"
            ? ["decisionEventId", "approvedBy", "approvedPreviewHash"]
            : []),
          "executionClaimEventId",
          "outcomeReceiptEventId",
          "resultEventId"
        ]
      : [])
  ];
  requireExactKeys(issued, allowedIssuedKeys);
}

function requireIssuedStage(value: IssuedValue, expected: string): void {
  if (requiredText(value.normalized, "stage") !== expected) throw unavailable();
}

function logicalLocatorFor(plan: DataRecord, binding: DataRecord): DataRecord {
  return freezeOwnedData({
    workspaceId: requiredText(binding, "workspaceId"),
    residentAgentId: requiredText(binding, "residentAgentId"),
    taskId: requiredText(binding, "taskId"),
    attemptId: requiredText(binding, "attemptId"),
    runId: requiredText(binding, "runId"),
    planId: requiredText(binding, "planId"),
    planRevision: requiredInteger(binding, "planRevision"),
    stepOrdinal: requiredPositiveInteger(binding, "ordinal"),
    toolRequestId: requiredText(binding, "toolRequestId"),
    toolId: requiredText(binding, "toolId"),
    toolVersion: requiredText(binding, "toolVersion"),
    executionCapabilityHash: requiredText(binding, "executionCapabilityHash")
  });
}

function logicalLocatorForRecord(binding: DataRecord): DataRecord {
  if (Object.hasOwn(binding, "stepOrdinal")) return binding;
  return logicalLocatorFor(binding, binding);
}

function bindingFromLocator(locator: DataRecord): DataRecord {
  return freezeOwnedData({
    workspaceId: requiredText(locator, "workspaceId"),
    residentAgentId: requiredText(locator, "residentAgentId"),
    taskId: requiredText(locator, "taskId"),
    attemptId: requiredText(locator, "attemptId"),
    runId: requiredText(locator, "runId"),
    planId: requiredText(locator, "planId"),
    planRevision: requiredInteger(locator, "planRevision"),
    ordinal: requiredPositiveInteger(locator, "stepOrdinal"),
    toolRequestId: requiredText(locator, "toolRequestId"),
    toolId: requiredText(locator, "toolId"),
    toolVersion: requiredText(locator, "toolVersion"),
    executionCapabilityHash: requiredText(locator, "executionCapabilityHash")
  });
}

function planReadback(planEvent: DataRecord): DataRecord {
  const plan = eventPayload(planEvent);
  return freezeOwnedData({
    planRecordEventId: requiredText(planEvent, "id"),
    workspaceId: requiredText(plan, "workspaceId"),
    residentAgentId: requiredText(plan, "residentAgentId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId"),
    planId: requiredText(plan, "planId"),
    planRevision: requiredInteger(plan, "planRevision")
  });
}

function observationReadback(event: DataRecord): DataRecord {
  const observation = eventPayload(event);
  return freezeOwnedData({
    observationEventId: requiredText(event, "id"),
    workspaceId: requiredText(observation, "workspaceId"),
    residentAgentId: requiredText(observation, "residentAgentId"),
    taskId: requiredText(observation, "taskId"),
    attemptId: requiredText(observation, "attemptId"),
    runId: requiredText(observation, "runId"),
    planId: requiredText(observation, "planId"),
    planRevision: requiredInteger(observation, "planRevision")
  });
}

function identityFromPlan(plan: DataRecord): DataRecord {
  return freezeOwnedData({
    residentAgentId: requiredText(plan, "residentAgentId"),
    workspaceId: requiredText(plan, "workspaceId"),
    taskId: requiredText(plan, "taskId"),
    attemptId: requiredText(plan, "attemptId"),
    runId: requiredText(plan, "runId")
  });
}

function identityFromResume(metadata: DataRecord, locator: DataRecord): DataRecord {
  return freezeOwnedData({
    residentAgentId: requiredText(metadata, "residentAgentId"),
    workspaceId: requiredText(requiredRecord(metadata, "workspace"), "workspaceId"),
    taskId: requiredText(locator, "taskId"),
    attemptId: requiredText(locator, "attemptId"),
    runId: requiredText(locator, "runId")
  });
}

function replayWithEvent(
  replay: ReplaySnapshot,
  event: DataRecord
): ReplaySnapshot {
  const events = Object.freeze([...replay.events, event]);
  return Object.freeze({
    identity: replay.identity,
    events,
    plans: replay.plans,
    observations: Object.freeze([...replay.observations, event]),
    toolSteps: replay.toolSteps,
    suspensions: replay.suspensions,
    results: replay.results
  });
}

function advanceBudget(
  previousValue: DataRecord,
  field: typeof budgetFields[number]
): DataRecord {
  const previous = normalizeBudget(previousValue);
  const actionConsumption = Object.fromEntries(
    budgetFields.map((name) => [name, name === field ? 1 : 0])
  );
  const consumed = Object.fromEntries(
    budgetFields.map((name) => [
      name,
      requiredNonnegativeInteger(previous.consumed, name) +
        requiredNonnegativeInteger(actionConsumption, name)
    ])
  );
  const remaining = Object.fromEntries(
    budgetFields.map((name) => [
      name,
      hardMaximums[name] - requiredNonnegativeInteger(consumed, name)
    ])
  );
  if (requiredNonnegativeInteger(consumed, field) > hardMaximums[field]) {
    throw unavailable();
  }
  return freezeOwnedData({
    ceilings: Object.fromEntries(
      budgetFields.map((name) => [name, hardMaximums[name]])
    ),
    consumed,
    remaining,
    actionConsumption
  });
}

function normalizeBudget(value: DataRecord): BudgetSnapshot {
  requireExactKeys(value, [
    "ceilings",
    "consumed",
    "remaining",
    "actionConsumption"
  ]);
  const ceilings = requiredRecord(value, "ceilings", budgetFields);
  const consumed = requiredRecord(value, "consumed", budgetFields);
  const remaining = requiredRecord(value, "remaining", budgetFields);
  const actionConsumption = requiredRecord(
    value,
    "actionConsumption",
    budgetFields
  );
  for (const field of budgetFields) {
    const ceiling = requiredNonnegativeInteger(ceilings, field);
    const used = requiredNonnegativeInteger(consumed, field);
    const left = requiredNonnegativeInteger(remaining, field);
    const action = requiredNonnegativeInteger(actionConsumption, field);
    if (
      ceiling !== hardMaximums[field] ||
      used > ceiling ||
      left !== ceiling - used ||
      action > used
    ) {
      throw unavailable();
    }
  }
  return Object.freeze({ ceilings, consumed, remaining, actionConsumption });
}

function requireBudgetProgression(previous: DataRecord, next: DataRecord): void {
  const before = normalizeBudget(previous);
  const after = normalizeBudget(next);
  for (const field of budgetFields) {
    if (
      requiredNonnegativeInteger(after.consumed, field) !==
        requiredNonnegativeInteger(before.consumed, field) +
          requiredNonnegativeInteger(after.actionConsumption, field)
    ) {
      throw unavailable();
    }
  }
}

function eventPayload(event: DataRecord): DataRecord {
  return requiredRecord(event, "payload");
}

function normalizeResidentEvent(value: unknown): DataRecord {
  const event = requiredNormalizedRecord(value, [
    "id",
    "type",
    "version",
    "streamId",
    "sequence",
    "context",
    "payload"
  ]);
  requirePattern(event, "id", eventIdPattern);
  requiredPositiveInteger(event, "sequence");
  requiredRecord(event, "context");
  requiredRecord(event, "payload");
  return event;
}

function normalizeEventArray(value: readonly unknown[]): readonly DataRecord[] {
  return Object.freeze(value.map((event) => normalizeResidentEvent(event)));
}

function requireEvent(
  event: DataRecord,
  type: string,
  payload: DataRecord
): void {
  if (
    requiredText(event, "type") !== type ||
    !sameCanonical(eventPayload(event), payload)
  ) {
    throw unavailable();
  }
}

function validateEventIdentity(event: DataRecord, identity: DataRecord): void {
  const payload = eventPayload(event);
  for (const key of [
    "residentAgentId",
    "workspaceId",
    "taskId",
    "attemptId",
    "runId"
  ]) {
    if (requiredText(payload, key) !== requiredText(identity, key)) {
      throw unavailable();
    }
  }
}

function requiredNormalizedRecord(
  value: unknown,
  keys?: readonly string[]
): DataRecord {
  const normalized = normalizeFrozenData(value);
  if (
    normalized === null ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    throw unavailable();
  }
  const record = normalized as DataRecord;
  if (keys !== undefined) requireExactKeys(record, keys);
  return record;
}

function exactFrozenOwnDataRecord(
  value: unknown,
  keys: readonly string[]
): DataRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw unavailable();
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function normalizeFrozenData(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw unavailable();
    return value;
  }
  if (
    typeof value !== "object" ||
    types.isProxy(value) ||
    !Object.isFrozen(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const lengthValue = lengthDescriptor?.value;
    if (
      typeof lengthValue !== "number" ||
      !Number.isSafeInteger(lengthValue) ||
      lengthValue < 0 ||
      Object.keys(descriptors).length !== lengthValue + 1
    ) {
      throw unavailable();
    }
    const result: unknown[] = [];
    for (let index = 0; index < lengthValue; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        throw unavailable();
      }
      result.push(normalizeFrozenData(descriptor.value));
    }
    return Object.freeze(result);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.hasOwn(descriptors, "__proto__")) throw unavailable();
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    result[key] = normalizeFrozenData(descriptor.value);
  }
  return Object.freeze(result);
}

function requiredRecord(
  record: DataRecord,
  key: string,
  keys?: readonly string[]
): DataRecord {
  return requiredRecordValue(record[key], keys);
}

function requiredRecordValue(
  value: unknown,
  keys?: readonly string[]
): DataRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value)
  ) {
    throw unavailable();
  }
  const record = value as DataRecord;
  if (keys !== undefined) requireExactKeys(record, keys);
  return record;
}

function requiredArray(record: DataRecord, key: string): readonly unknown[] {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    !Object.isFrozen(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireExactKeys(record: DataRecord, keys: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw unavailable();
  }
}

function requiredText(record: DataRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw unavailable();
  return value;
}

function requirePattern(record: DataRecord, key: string, pattern: RegExp): string {
  const value = requiredText(record, key);
  if (!pattern.test(value)) throw unavailable();
  return value;
}

function requireHash(record: DataRecord, key: string): string {
  return requirePattern(record, key, hashPattern);
}

function requiredInteger(record: DataRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw unavailable();
  }
  return value;
}

function requiredNonnegativeInteger(record: DataRecord, key: string): number {
  const value = requiredInteger(record, key);
  if (value < 0) throw unavailable();
  return value;
}

function requiredPositiveInteger(record: DataRecord, key: string): number {
  const value = requiredInteger(record, key);
  if (value <= 0) throw unavailable();
  return value;
}

function selectKeys(record: DataRecord, keys: readonly string[]): DataRecord {
  const selected: Record<string, unknown> = {};
  for (const key of keys) selected[key] = record[key];
  return freezeOwnedData(selected);
}

function freezeOwnedData<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeOwnedData(nested);
    Object.freeze(value);
  }
  return value;
}

function requireCapability<T>(
  value: object,
  methodNames: readonly string[]
): T {
  if (
    value === null ||
    typeof value !== "object" ||
    types.isProxy(value) ||
    !Object.isFrozen(value)
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const methodName of methodNames) {
    const descriptor = descriptors[methodName];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    ) {
      throw unavailable();
    }
  }
  return value as T;
}

async function withExclusiveLoop<T>(
  state: LoopState,
  operation: () => Promise<T>
): Promise<T> {
  if (state.inFlight) throw unavailable();
  state.inFlight = true;
  try {
    return await operation();
  } finally {
    state.inFlight = false;
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function semanticKey(namespace: string, value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(`${namespace}\n${canonicalJson(value)}`)
    .digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(
        Object.getOwnPropertyDescriptor(value, key)?.value
      )}`
    )
    .join(",")}}`;
}

function unavailable(): Error {
  return new Error("bounded resident agent loop is unavailable");
}
