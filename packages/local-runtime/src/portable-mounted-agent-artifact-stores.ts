import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { mountPortableWorkspace } from "../../workspace/src/index.js";
import type { SpecialistHandoffManifestStore } from "../../agent/src/specialist-runner-kernel.js";
import {
  hashCanonicalSpecialistHandoffJson,
  parseSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  issueMountedSpecialistHandoffAuthorityWitness,
  type HandoffAuthorityBinding,
  type MountedSpecialistHandoffAuthorityWitness
} from "../../agent/src/specialist-handoff-authority.js";
import { approvedAgentSpecialistRunTypes, type AgentSpecialistRunType } from "../../agent/src/specialists.js";
import { taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import {
  createMountedSpecialistHandoffPreparationBinder,
  type MountedSpecialistHandoffPreparationBinder
} from "./mounted-agent-artifact-stores.js";
import {
  inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores,
  type MountedArtifactAuthorityOperation
} from "./mounted-artifact-authority-operation.js";

export interface BindPortableMountedAgentHandoffInput {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: AgentSpecialistRunType;
  readonly retryGeneration: number;
  /** Required for the investigation-planner durable-start binding. */
  readonly investigationId?: string;
}

export interface PortableMountedAgentHandoffBinding {
  readonly schemaVersion: "portable-mounted-agent-handoff-binding.v1";
  readonly preparationBinder: MountedSpecialistHandoffPreparationBinder;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
  readonly authorityWitness: MountedSpecialistHandoffAuthorityWitness;
}

declare const mountedHandoffAuthorityControllerBrand: unique symbol;

export type MountedHandoffAuthorityController = Readonly<{
  readonly [mountedHandoffAuthorityControllerBrand]: true;
}>;

export interface FactoryPortableMountedAgentHandoffProducerResultV1 {
  readonly schemaVersion: "factory-portable-mounted-agent-handoff-result.v1";
  readonly binding: PortableMountedAgentHandoffBinding;
  readonly controller: MountedHandoffAuthorityController;
}

export type MountedHandoffAuthorityEffectKind =
  | "final-output"
  | "handoff-prepared"
  | "handoff-recorded"
  | "run-terminal"
  | "orchestration-completed"
  | "task-status";

export interface MountedHandoffAuthorityConsumptionReceiptV1 {
  readonly schemaVersion: "mounted-handoff-authority-consumed-receipt.v1";
  readonly eventIds: readonly string[];
}

interface PortableMountedAgentArtifactStoreProducer {
  bind(input: BindPortableMountedAgentHandoffInput): Promise<FactoryPortableMountedAgentHandoffProducerResultV1>;
}

interface ProducerState {
  readonly authorityOperation: MountedArtifactAuthorityOperation;
  readonly origin: CapturedOrigin;
  bound: boolean;
}

interface CapturedOrigin {
  readonly snapshot: SnapshotTuple;
  readonly workspace: WorkspaceTuple;
  readonly mounted: MountedTuple;
  readonly ledger: ReturnType<typeof inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores>["ledger"];
}

interface SnapshotTuple {
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly workspaceIdentityEventId: string;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly artifactStoreEvidenceId: string;
  readonly derivativeStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly admissionGenerationId: string;
}

interface WorkspaceTuple {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

interface MountedTuple {
  readonly workspaceId: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

interface RunBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
  readonly runType: AgentSpecialistRunType;
  readonly retryGeneration: number;
  readonly investigationId?: string;
  readonly authorityBinding?: HandoffAuthorityBinding;
}

interface ModelInvocationCursor {
  readonly startedEventId: string;
  readonly requestedEventId?: string;
  readonly invocationId?: string;
  readonly providerId?: string;
  readonly modelFamily?: string;
  readonly inputArtifactHash?: string;
  readonly terminalEventId?: string;
}

interface DispatchPreludeCursor {
  readonly claimEventId?: string;
  readonly claimSequence?: number;
  readonly leaseClaimGeneration?: number;
  readonly checkpointEventId?: string;
}

type NormalizedJson =
  | null
  | boolean
  | number
  | string
  | NormalizedJsonArray
  | NormalizedJsonRecord;

interface NormalizedJsonArray extends ReadonlyArray<NormalizedJson> {}

interface NormalizedJsonRecord {
  readonly [field: string]: NormalizedJson;
}

interface CanonicalHandoffBinding {
  readonly finalOutputEventId: string;
  readonly finalOutputStepId: string;
  readonly finalOutputIdempotencyKey: string;
  readonly stepSchemaId: string;
  readonly handoffMaterialArtifactHash: string;
  readonly inputArtifactHashes: readonly string[];
  readonly outputArtifactHashes: readonly string[];
  readonly handoffId?: string;
  readonly handoffRevision?: number;
  readonly handoffIdempotencyKey?: string;
  readonly handoffManifestHash?: string;
  readonly handoffDtoHash?: string;
  readonly handoffStatus?: string;
  readonly safeSummary?: string;
  readonly contextPackHashes?: readonly string[];
  readonly promptArtifactHash?: string;
  readonly toolRequestIds?: readonly string[];
  readonly sourceEventIds?: readonly string[];
  readonly relatedEventIds?: readonly string[];
  readonly verifiedAt?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly terminalEventId?: string;
  readonly terminalStatus?: "completed" | "failed";
  readonly authorityBinding?: HandoffAuthorityBinding;
}

type CursorPhase =
  | "initial"
  | "task-created"
  | "task-queued"
  | "task-running"
  | "started"
  | "started-running"
  | "final-output"
  | "handoff-prepared"
  | "handoff-recorded"
  | "run-terminal"
  | "orchestration-completed"
  | "task-status";

interface CursorState {
  readonly authorityOperation: MountedArtifactAuthorityOperation;
  readonly origin: CapturedOrigin;
  readonly binding: RunBinding;
  accepted: readonly Uint8Array[] | undefined;
  phase: CursorPhase;
  canonical: CanonicalHandoffBinding | undefined;
  modelInvocation: ModelInvocationCursor | undefined;
  prelude: DispatchPreludeCursor;
  lastRelevantEventId: string | undefined;
  readonly handoffEventIds: string[];
  burned: boolean;
}

const producerStates = new WeakMap<object, ProducerState>();
const controllerStates = new WeakMap<MountedHandoffAuthorityController, CursorState>();

export function createPortableMountedAgentArtifactStoreProducer(
  authorityOperation: MountedArtifactAuthorityOperation
): PortableMountedAgentArtifactStoreProducer {
  const origin = captureOrigin(authorityOperation);
  const producer = Object.freeze({
    async bind(this: object, input: BindPortableMountedAgentHandoffInput): Promise<FactoryPortableMountedAgentHandoffProducerResultV1> {
      const state = producerStates.get(this);
      if (state === undefined || state.bound) throw authorityError();
      state.bound = true;

      let cursor: CursorState | undefined;
      try {
        const binding = Object.freeze({
          ...normalizeBinding(input),
          authorityBinding: deriveHandoffAuthorityBinding(state.origin.snapshot)
        });
        cursor = {
          authorityOperation: state.authorityOperation,
          origin: state.origin,
          binding,
          accepted: undefined,
          phase: "initial",
          canonical: undefined,
          modelInvocation: undefined,
          prelude: Object.freeze({}),
          lastRelevantEventId: undefined,
          handoffEventIds: [],
          burned: false
        };
        await inspectCursor(cursor);

        const remounted = remountCurrent(cursor.origin);
        const materialStore = createCursorBoundStore(
          cursor,
          new FileBlobStore(join(remounted.paths.derivativeRoot, "specialist-handoff-material")),
          true
        );
        const manifestStore = createCursorBoundStore(
          cursor,
          new FileBlobStore(join(remounted.paths.derivativeRoot, "specialist-handoff-manifest"))
        );
        if (materialStore === manifestStore) throw authorityError();

        const preparationBinder = createMountedSpecialistHandoffPreparationBinder({
          authority: Object.freeze({
            authorityVersion: "mounted-workspace-runtime-authority.v1" as const,
            workspaceId: cursor.origin.snapshot.workspaceId,
            mountInstanceId: cursor.origin.snapshot.mountInstanceId,
            workspaceIdentityEventId: cursor.origin.snapshot.workspaceIdentityEventId,
            policyVersion: cursor.origin.snapshot.policyVersion,
            sourceHighWaterMark: cursor.origin.snapshot.highWaterOrdinal
          }),
          artifactStores: Object.freeze({
            storesVersion: "mounted-agent-artifact-stores.v1" as const,
            workspaceId: cursor.origin.snapshot.workspaceId,
            mountInstanceId: cursor.origin.snapshot.mountInstanceId,
            materialStore,
            manifestStore
          }),
          taskId: binding.taskId,
          attemptId: binding.attemptId,
          approvedRunId: binding.approvedRunId,
          runType: binding.runType
        });
        const authorityWitness = issueMountedSpecialistHandoffAuthorityWitness({
          authorityBinding: cursor.binding.authorityBinding!,
          taskLifecycle: {
            taskId: cursor.binding.taskId,
            attemptId: cursor.binding.attemptId,
            runId: cursor.binding.approvedRunId,
            runType: cursor.binding.runType,
            retryGeneration: cursor.binding.retryGeneration
          },
          revalidateCurrent: async () => await inspectCursor(cursor!)
        });
        const handoffBinding = Object.freeze({
          schemaVersion: "portable-mounted-agent-handoff-binding.v1" as const,
          preparationBinder,
          materialStore,
          manifestStore,
          authorityWitness
        });
        const controller = Object.freeze({}) as MountedHandoffAuthorityController;
        controllerStates.set(controller, cursor);
        await inspectCursor(cursor);
        return Object.freeze({
          schemaVersion: "factory-portable-mounted-agent-handoff-result.v1" as const,
          binding: handoffBinding,
          controller
        });
      } catch {
        if (cursor !== undefined) cursor.burned = true;
        throw authorityError();
      }
    }
  });
  producerStates.set(producer, { authorityOperation, origin, bound: false });
  return producer;
}

export async function beforeMountedHandoffAuthorityEffect(
  controller: MountedHandoffAuthorityController,
  kind: MountedHandoffAuthorityEffectKind
): Promise<void> {
  const cursor = cursorFor(controller);
  try {
    await inspectCursor(cursor);
    if (
      kind === "final-output" &&
      (!hasRequiredModelInvocationTranscript(cursor.binding, cursor.modelInvocation) || !hasCompleteDispatchPrelude(cursor.prelude))
    ) throw authorityError();
    if (!isExpectedPredecessor(cursor.phase, kind)) throw authorityError();
  } catch {
    cursor.burned = true;
    throw authorityError();
  }
}

export async function afterMountedHandoffAuthorityAppend(
  controller: MountedHandoffAuthorityController,
  kind: MountedHandoffAuthorityEffectKind,
  eventId: string
): Promise<void> {
  const cursor = cursorFor(controller);
  try {
    if (typeof eventId !== "string" || !/^evt_[a-zA-Z0-9_-]+$/.test(eventId)) throw authorityError();
    await inspectCursor(cursor);
    if (!isExpectedSuccessor(cursor.phase, kind) || cursor.lastRelevantEventId !== eventId) throw authorityError();
  } catch {
    cursor.burned = true;
    throw authorityError();
  }
}

export async function consumeMountedHandoffAuthorityController(
  controller: MountedHandoffAuthorityController,
  eventIds: readonly string[]
): Promise<MountedHandoffAuthorityConsumptionReceiptV1> {
  const cursor = cursorFor(controller);
  try {
    const normalized = normalizeEventIds(eventIds);
    await inspectCursor(cursor);
    if (
      cursor.phase !== "task-status"
      || normalized.length !== cursor.handoffEventIds.length
      || normalized.some((eventId, index) => eventId !== cursor.handoffEventIds[index])
    ) {
      throw authorityError();
    }
    cursor.burned = true;
    return Object.freeze({
      schemaVersion: "mounted-handoff-authority-consumed-receipt.v1" as const,
      eventIds: Object.freeze([...normalized])
    });
  } catch {
    cursor.burned = true;
    throw authorityError();
  }
}

function captureOrigin(authorityOperation: MountedArtifactAuthorityOperation): CapturedOrigin {
  try {
    const inspected = inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(authorityOperation);
    return Object.freeze({
      snapshot: snapshotTuple(inspected.snapshot),
      workspace: workspaceTuple(inspected.workspace),
      mounted: mountedTuple(inspected.mountedWorkspace),
      ledger: inspected.ledger
    });
  } catch {
    throw authorityError();
  }
}

async function inspectCursor(cursor: CursorState): Promise<void> {
  if (cursor.burned) throw authorityError();
  try {
    assertOriginCurrent(cursor);
    const events = normalizeLedgerEvents(await cursor.origin.ledger.readAll());
    assertOriginCurrent(cursor);
    const encoded = encodeEvents(events);
    if (cursor.accepted === undefined) {
      const initial = deriveInitialState(events, cursor.binding);
      cursor.phase = initial.phase;
      cursor.canonical = initial.canonical;
      cursor.modelInvocation = initial.modelInvocation;
      cursor.prelude = initial.prelude;
      cursor.lastRelevantEventId = initial.lastRelevantEventId;
      cursor.handoffEventIds.push(...initial.handoffEventIds);
      cursor.accepted = encoded;
      return;
    }
    if (encoded.length < cursor.accepted.length) throw authorityError();
    for (let index = 0; index < cursor.accepted.length; index += 1) {
      if (!sameBytes(cursor.accepted[index]!, encoded[index]!)) throw authorityError();
    }
    let phase = cursor.phase;
    let canonical = cursor.canonical;
    let modelInvocation = cursor.modelInvocation;
    let prelude = cursor.prelude;
    let lastRelevantEventId = cursor.lastRelevantEventId;
    const newEventIds: string[] = [];
    for (const event of events.slice(cursor.accepted.length)) {
      const nextPrelude = advanceDispatchPrelude(phase, prelude, event, cursor.binding, lastRelevantEventId);
      if (nextPrelude !== undefined) {
        prelude = nextPrelude;
        continue;
      }
      const advanced = advancePhase(phase, event, cursor.binding, lastRelevantEventId, canonical, prelude, modelInvocation);
      phase = advanced.phase;
      canonical = advanced.canonical;
      modelInvocation = advanced.modelInvocation;
      lastRelevantEventId = advanced.eventId;
      if (isHandoffEffectPhase(advanced.phase)) {
        newEventIds.push(advanced.eventId);
      }
    }
    cursor.phase = phase;
    cursor.canonical = canonical;
    cursor.modelInvocation = modelInvocation;
    cursor.prelude = prelude;
    cursor.lastRelevantEventId = lastRelevantEventId;
    cursor.handoffEventIds.push(...newEventIds);
    cursor.accepted = encoded;
  } catch {
    cursor.burned = true;
    throw authorityError();
  }
}

function assertOriginCurrent(cursor: CursorState): void {
  const inspected = inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores(cursor.authorityOperation);
  const current = Object.freeze({
    snapshot: snapshotTuple(inspected.snapshot),
    workspace: workspaceTuple(inspected.workspace),
    mounted: mountedTuple(inspected.mountedWorkspace),
    ledger: inspected.ledger
  });
  if (
    current.ledger !== cursor.origin.ledger
    || !sameSnapshotTuple(current.snapshot, cursor.origin.snapshot)
    || !sameWorkspaceTuple(current.workspace, cursor.origin.workspace)
    || !sameMountedTuple(current.mounted, cursor.origin.mounted)
  ) {
    throw authorityError();
  }
  remountCurrent(cursor.origin);
}

function remountCurrent(origin: CapturedOrigin) {
  const remounted = mountPortableWorkspace({
    rootDir: origin.workspace.rootDir,
    expectedWorkspaceId: origin.snapshot.workspaceId
  });
  if (!remounted.ok || !sameMountedTuple(origin.mounted, mountedTuple(remounted.workspace))) {
    throw authorityError();
  }
  return remounted.workspace;
}

function createCursorBoundStore(
  cursor: CursorState,
  store: FileBlobStore,
  requiresFinalOutputAuthority = false
): SpecialistHandoffManifestStore {
  return Object.freeze({
    async put(content: Buffer) {
      const stored = await inspectAround(
        cursor,
        async () => await store.put(content),
        requiresFinalOutputAuthority ? () => assertFinalOutputMaterialWriteAuthority(cursor, content) : undefined
      );
      return Object.freeze({ contentHash: stored.contentHash, sizeBytes: stored.sizeBytes });
    },
    async get(contentHash: `sha256:${string}`) {
      return await inspectAround(cursor, async () => await store.get(contentHash));
    }
  });
}

async function inspectAround<T>(
  cursor: CursorState,
  operation: () => Promise<T>,
  beforeOperation?: () => void
): Promise<T> {
  await inspectCursor(cursor);
  try {
    beforeOperation?.();
    const result = await operation();
    await inspectCursor(cursor);
    return result;
  } catch {
    try {
      await inspectCursor(cursor);
    } catch {
      throw authorityError();
    }
    throw artifactStoreOperationError();
  }
}

function assertFinalOutputMaterialWriteAuthority(cursor: CursorState, content: Buffer): void {
  if (
    isCanonicalFinalOutputMaterial(content) &&
    (cursor.phase === "started" || cursor.phase === "started-running") &&
    (!hasRequiredModelInvocationTranscript(cursor.binding, cursor.modelInvocation) || !hasCompleteDispatchPrelude(cursor.prelude))
  ) {
    cursor.burned = true;
    throw authorityError();
  }
}

function isCanonicalFinalOutputMaterial(content: Buffer): boolean {
  try {
    parseSpecialistHandoffMaterial(JSON.parse(content.toString("utf8")));
    return true;
  } catch {
    return false;
  }
}

function artifactStoreOperationError(): Error {
  return new Error("Mounted handoff artifact store operation failed.");
}

function deriveInitialState(events: readonly NormalizedJson[], binding: RunBinding): {
  readonly phase: CursorPhase;
  readonly canonical: CanonicalHandoffBinding | undefined;
  readonly modelInvocation: ModelInvocationCursor | undefined;
  readonly prelude: DispatchPreludeCursor;
  readonly lastRelevantEventId: string | undefined;
  readonly handoffEventIds: readonly string[];
} {
  let phase: CursorPhase = "initial";
  let canonical: CanonicalHandoffBinding | undefined;
  let modelInvocation: ModelInvocationCursor | undefined;
  let prelude: DispatchPreludeCursor = Object.freeze({});
  let lastRelevantEventId: string | undefined;
  const handoffEventIds: string[] = [];
  for (const event of events) {
    const nextPrelude = advanceDispatchPrelude(phase, prelude, event, binding, lastRelevantEventId);
    if (nextPrelude !== undefined) {
      prelude = nextPrelude;
      continue;
    }
    if (!isBoundEvent(event, binding) && !isModelInvocationTranscriptEvent(event, modelInvocation)) continue;
    const advanced = advancePhase(phase, event, binding, lastRelevantEventId, canonical, prelude, modelInvocation);
    phase = advanced.phase;
    canonical = advanced.canonical;
    modelInvocation = advanced.modelInvocation;
    lastRelevantEventId = advanced.eventId;
    if (isHandoffEffectPhase(advanced.phase)) {
      handoffEventIds.push(advanced.eventId);
    }
  }
  return Object.freeze({
    phase,
    canonical,
    modelInvocation,
    prelude,
    lastRelevantEventId,
    handoffEventIds: Object.freeze(handoffEventIds)
  });
}

function advancePhase(
  phase: CursorPhase,
  event: NormalizedJson,
  binding: RunBinding,
  predecessor: string | undefined,
  canonical: CanonicalHandoffBinding | undefined,
  prelude: DispatchPreludeCursor,
  modelInvocation: ModelInvocationCursor | undefined
): {
  readonly phase: CursorPhase;
  readonly eventId: string;
  readonly canonical: CanonicalHandoffBinding | undefined;
  readonly modelInvocation: ModelInvocationCursor | undefined;
} {
  const record = normalizedOwnDataRecord(event);
  const payload = normalizedOwnDataRecord(record.payload);
  const context = normalizedOwnDataRecord(record.context);
  const actor = normalizedOwnDataRecord(context.actor);
  if (
    record.version !== 1
    || typeof record.id !== "string"
    || !/^evt_[a-zA-Z0-9_-]+$/.test(record.id)
    || typeof record.streamId !== "string"
    || actor.kind !== "agent"
    || actor.id !== "agent_default"
  ) {
    throw authorityError();
  }
  const type = record.type;
  if (type === "agent.task.created") {
    if (
      phase !== "initial"
      || record.streamId !== `agent_task_${binding.taskId}`
      || payload.taskId !== binding.taskId
      || payload.residentAgentId !== "agent_default"
    ) {
      throw authorityError();
    }
    return { phase: "task-created", eventId: record.id, canonical: undefined, modelInvocation: undefined };
  }
  if (
    type === "agent.task.status.changed" &&
    (phase === "initial" || phase === "task-created" || phase === "task-queued" || phase === "started")
  ) {
    if (
      record.streamId !== `agent_task_${binding.taskId}`
      || payload.taskId !== binding.taskId
      || payload.changedBy !== "agent_default"
    ) {
      throw authorityError();
    }
    if (payload.status === "queued") {
      if (phase !== "task-created" || payload.runId !== undefined) throw authorityError();
      return { phase: "task-queued", eventId: record.id, canonical: undefined, modelInvocation: undefined };
    }
    if (payload.status === "running") {
      if (payload.runId !== binding.approvedRunId) throw authorityError();
      if (phase === "task-queued") return { phase: "task-running", eventId: record.id, canonical: undefined, modelInvocation: undefined };
      if (phase === "started") return { phase: "started-running", eventId: record.id, canonical, modelInvocation };
    }
    throw authorityError();
  }
  if (type === "agent.specialist-run.started") {
    if (
      (phase !== "initial" && phase !== "task-queued" && phase !== "task-running")
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.residentAgentId !== "agent_default"
      || payload.startedBy !== "agent_default"
      || (binding.investigationId !== undefined && payload.investigationId !== binding.investigationId)
    ) {
      throw authorityError();
    }
    return {
      phase: phase === "task-running" ? "started-running" : "started",
      eventId: record.id,
      canonical: undefined,
      modelInvocation: Object.freeze({ startedEventId: record.id })
    };
  }
  if (type === "agent.model-invocation.requested") {
    if (
      (phase !== "started" && phase !== "started-running")
      || modelInvocation === undefined
      || modelInvocation.requestedEventId !== undefined
      || !validateKnowledgeEvent(record).success
      || record.streamId !== `agent_model_invocation_${requiredText(payload.invocationId)}`
      || record.sequence !== 1
      || payload.runId !== binding.approvedRunId
      || payload.runType !== binding.runType
      || context.correlationId !== `corr_${payload.invocationId}`
      || context.causationId !== modelInvocation.startedEventId
      || !isHash(payload.inputArtifactHash)
    ) {
      throw authorityError();
    }
    return {
      phase,
      eventId: record.id,
      canonical,
      modelInvocation: Object.freeze({
        startedEventId: modelInvocation.startedEventId,
        requestedEventId: record.id,
        invocationId: requiredText(payload.invocationId),
        providerId: requiredText(payload.providerId),
        modelFamily: requiredText(payload.modelFamily),
        inputArtifactHash: requiredHash(payload.inputArtifactHash)
      })
    };
  }
  if (type === "agent.model-invocation.completed" || type === "agent.model-invocation.failed") {
    if (
      (phase !== "started" && phase !== "started-running")
      || modelInvocation?.requestedEventId === undefined
      || modelInvocation.terminalEventId !== undefined
      || !validateKnowledgeEvent(record).success
      || record.streamId !== `agent_model_invocation_${modelInvocation.invocationId}`
      || record.sequence !== 2
      || payload.runId !== binding.approvedRunId
      || payload.invocationId !== modelInvocation.invocationId
      || payload.providerId !== modelInvocation.providerId
      || context.correlationId !== `corr_${modelInvocation.invocationId}`
      || context.causationId !== modelInvocation.requestedEventId
      || (type === "agent.model-invocation.completed" && (
        payload.modelFamily !== modelInvocation.modelFamily || !isHash(payload.outputArtifactHash)
      ))
    ) {
      throw authorityError();
    }
    return {
      phase,
      eventId: record.id,
      canonical,
      modelInvocation: Object.freeze({ ...modelInvocation, terminalEventId: record.id })
    };
  }
  if (type === "agent.specialist-run.step.recorded") {
    if (
      (phase !== "started" && phase !== "started-running")
      || !hasRequiredModelInvocationTranscript(binding, modelInvocation)
      || !hasCompleteDispatchPrelude(prelude)
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.stepKind !== "final-output"
      || typeof payload.stepId !== "string"
      || typeof payload.stepSchemaId !== "string"
      || typeof payload.idempotencyKey !== "string"
      || !isHash(payload.handoffMaterialArtifactHash)
    ) {
      throw authorityError();
    }
    return {
      phase: "final-output",
      eventId: record.id,
      canonical: Object.freeze({
        finalOutputEventId: record.id,
        finalOutputStepId: payload.stepId,
        finalOutputIdempotencyKey: payload.idempotencyKey,
        stepSchemaId: payload.stepSchemaId,
        handoffMaterialArtifactHash: payload.handoffMaterialArtifactHash,
        inputArtifactHashes: normalizedHashArray(payload.inputArtifactHashes),
        outputArtifactHashes: normalizedHashArray(payload.outputArtifactHashes)
      }),
      modelInvocation
    };
  }
  if (type === "agent.specialist-handoff.prepared") {
    const finalOutput = requireCanonical(canonical);
    const authorityBinding = authorityBindingForPayload(payload, binding);
    if (
      phase !== "final-output"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.residentAgentId !== "agent_default"
      || payload.finalOutputEventId !== finalOutput.finalOutputEventId
      || payload.finalOutputStepId !== finalOutput.finalOutputStepId
      || payload.handoffMaterialArtifactHash !== finalOutput.handoffMaterialArtifactHash
      || !sameStringArrays(normalizedHashArray(payload.outputArtifactHashes), finalOutput.outputArtifactHashes)
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return {
      phase: "handoff-prepared",
      eventId: record.id,
      canonical: Object.freeze({
        ...finalOutput,
        handoffId: requiredText(payload.handoffId),
        handoffRevision: requiredPositiveInteger(payload.handoffRevision),
        handoffIdempotencyKey: requiredText(payload.idempotencyKey),
        handoffManifestHash: requiredHash(payload.handoffManifestHash),
        handoffDtoHash: requiredHash(payload.handoffDtoHash),
        handoffStatus: requiredText(payload.status),
        safeSummary: requiredText(payload.safeSummary),
        contextPackHashes: normalizedHashArray(payload.contextPackHashes),
        ...(Object.hasOwn(payload, "promptArtifactHash") ? { promptArtifactHash: requiredHash(payload.promptArtifactHash) } : {}),
        toolRequestIds: normalizedStringArray(payload.toolRequestIds),
        sourceEventIds: normalizedStringArray(payload.sourceEventIds),
        relatedEventIds: normalizedStringArray(payload.relatedEventIds),
        ...(authorityBinding === undefined ? {} : { authorityBinding }),
        preparedEventId: record.id
      }),
      modelInvocation
    };
  }
  if (type === "agent.specialist-handoff.recorded") {
    const prepared = requirePreparedCanonical(canonical);
    if (
      phase !== "handoff-prepared"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.residentAgentId !== "agent_default"
      || payload.preparedEventId !== prepared.preparedEventId
      || context.causationId !== prepared.preparedEventId
      || !samePreparedHandoffBinding(payload, prepared)
    ) {
      throw authorityError();
    }
    return {
      phase: "handoff-recorded",
      eventId: record.id,
      canonical: Object.freeze({
        ...prepared,
        recordedEventId: record.id,
        verifiedAt: requiredText(payload.verifiedAt)
      }),
      modelInvocation
    };
  }
  if (type === "agent.specialist-run.completed") {
    const recorded = requireRecordedCanonical(canonical);
    if (
      phase !== "handoff-recorded"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || context.causationId !== recorded.recordedEventId
      || !sameStringArrays(normalizedHashArray(payload.outputArtifactHashes), recorded.outputArtifactHashes)
    ) {
      throw authorityError();
    }
    return {
      phase: "run-terminal",
      eventId: record.id,
      canonical: Object.freeze({ ...recorded, terminalEventId: record.id, terminalStatus: "completed" }),
      modelInvocation
    };
  }
  if (type === "agent.specialist-run.failed") {
    const recorded = requireRecordedCanonical(canonical);
    const relatedEventIds = normalizedStringArray(payload.relatedEventIds);
    if (
      phase !== "handoff-recorded"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || context.causationId !== recorded.recordedEventId
      || !relatedEventIds.includes(recorded.recordedEventId)
    ) {
      throw authorityError();
    }
    return {
      phase: "run-terminal",
      eventId: record.id,
      canonical: Object.freeze({ ...recorded, terminalEventId: record.id, terminalStatus: "failed" }),
      modelInvocation
    };
  }
  if (type === "agent.task.orchestration.completed") {
    const terminal = requireTerminalCanonical(canonical);
    const handoffReadback = normalizedOwnDataRecord(payload.handoffReadback);
    if (
      phase !== "run-terminal"
      || record.streamId !== taskOrchestrationStreamId(binding.taskId, binding.runType)
      || payload.taskId !== binding.taskId
      || payload.runId !== binding.approvedRunId
      || payload.runType !== binding.runType
      || payload.attemptId !== binding.attemptId
      || payload.retryGeneration !== binding.retryGeneration
      || payload.finalOutputStepEventId !== terminal.finalOutputEventId
      || payload.handoffPreparedEventId !== terminal.preparedEventId
      || payload.handoffRecordedEventId !== terminal.recordedEventId
      || payload.specialistRunCompletedEventId !== terminal.terminalEventId
      || handoffReadback.handoffId !== terminal.handoffId
      || handoffReadback.handoffManifestHash !== terminal.handoffManifestHash
      || handoffReadback.handoffRecordedEventId !== terminal.recordedEventId
      || handoffReadback.verifiedAt !== terminal.verifiedAt
      || context.causationId !== terminal.terminalEventId
    ) {
      throw authorityError();
    }
    return { phase: "orchestration-completed", eventId: record.id, canonical: terminal, modelInvocation };
  }
  if (type === "agent.task.status.changed") {
    const terminal = requireTerminalCanonical(canonical);
    if (
      phase !== "orchestration-completed"
      || record.streamId !== `agent_task_${binding.taskId}`
      || payload.taskId !== binding.taskId
      || payload.runId !== binding.approvedRunId
      || payload.changedBy !== "agent_default"
      || payload.status !== terminal.terminalStatus
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "task-status", eventId: record.id, canonical: terminal, modelInvocation };
  }
  throw authorityError();
}

function isBoundEvent(event: NormalizedJson, binding: RunBinding): boolean {
  const record = normalizedOwnDataRecord(event);
  const payload = normalizedOwnDataRecord(record.payload);
  return payload.runId === binding.approvedRunId || payload.taskId === binding.taskId;
}

function advanceDispatchPrelude(
  phase: CursorPhase,
  prior: DispatchPreludeCursor,
  event: NormalizedJson,
  binding: RunBinding,
  predecessor: string | undefined
): DispatchPreludeCursor | undefined {
  const record = normalizedOwnDataRecord(event);
  const payload = normalizedOwnDataRecord(record.payload);
  if (
    record.type !== "agent.task.orchestration.claimed" &&
    record.type !== "agent.task.orchestration.checkpointed"
  ) {
    return undefined;
  }
  const expectedStreamId = taskOrchestrationStreamId(binding.taskId, binding.runType);
  const isCandidate =
    record.streamId === expectedStreamId ||
    payload.taskId === binding.taskId ||
    payload.runId === binding.approvedRunId ||
    payload.attemptId === binding.attemptId;
  if (!isCandidate) return undefined;
  const context = normalizedOwnDataRecord(record.context);
  const actor = normalizedOwnDataRecord(context.actor);
  if (
    !isPreStartDispatchPhase(phase)
    || !validateKnowledgeEvent(record).success
    || record.version !== 1
    || typeof record.id !== "string"
    || !/^evt_[a-zA-Z0-9_-]+$/.test(record.id)
    || typeof record.sequence !== "number"
    || !Number.isSafeInteger(record.sequence)
    || record.sequence < 1
    || record.streamId !== expectedStreamId
    || actor.kind !== "agent"
    || actor.id !== "agent_default"
    || context.correlationId !== `corr_${binding.taskId}`
    || payload.taskId !== binding.taskId
    || payload.runType !== binding.runType
    || payload.attemptId !== binding.attemptId
    || payload.retryGeneration !== binding.retryGeneration
  ) {
    throw authorityError();
  }
  if (record.type === "agent.task.orchestration.claimed") {
    if (
      prior.claimEventId !== undefined
      || prior.checkpointEventId !== undefined
      || predecessor === undefined
      || context.causationId !== predecessor
      || payload.causationEventId !== predecessor
      || payload.workerId !== "agent_default"
      || typeof payload.leaseClaimGeneration !== "number"
      || !Number.isSafeInteger(payload.leaseClaimGeneration)
      || payload.leaseClaimGeneration < 1
    ) {
      throw authorityError();
    }
    return Object.freeze({
      claimEventId: record.id,
      claimSequence: record.sequence,
      leaseClaimGeneration: payload.leaseClaimGeneration
    });
  }
  if (
    prior.claimEventId === undefined
    || prior.checkpointEventId !== undefined
    || record.sequence !== prior.claimSequence! + 1
    || payload.runId !== binding.approvedRunId
    || payload.checkpointKind !== "runner-dispatching"
    || payload.leaseClaimGeneration !== prior.leaseClaimGeneration
    || context.causationId !== prior.claimEventId
  ) {
    throw authorityError();
  }
  return Object.freeze({ ...prior, checkpointEventId: record.id });
}

function isModelInvocationTranscriptEvent(
  event: NormalizedJson,
  modelInvocation: ModelInvocationCursor | undefined
): boolean {
  if (modelInvocation === undefined) return false;
  const record = normalizedOwnDataRecord(event);
  return record.type === "agent.model-invocation.requested" ||
    record.type === "agent.model-invocation.completed" ||
    record.type === "agent.model-invocation.failed";
}

function isPreStartDispatchPhase(phase: CursorPhase): boolean {
  return phase === "task-queued" || phase === "task-running";
}

function hasCompleteDispatchPrelude(value: DispatchPreludeCursor): boolean {
  return value.claimEventId === undefined || value.checkpointEventId !== undefined;
}

function hasRequiredModelInvocationTranscript(
  binding: RunBinding,
  value: ModelInvocationCursor | undefined
): boolean {
  if (value?.requestedEventId !== undefined && value.terminalEventId === undefined) return false;
  if (binding.runType !== "investigation-planner") return true;
  return value?.requestedEventId !== undefined && value.terminalEventId !== undefined;
}

function isHandoffEffectPhase(phase: CursorPhase): boolean {
  return phase === "final-output" ||
    phase === "handoff-prepared" ||
    phase === "handoff-recorded" ||
    phase === "run-terminal" ||
    phase === "orchestration-completed" ||
    phase === "task-status";
}

function requireCanonical(value: CanonicalHandoffBinding | undefined): CanonicalHandoffBinding {
  if (value === undefined) throw authorityError();
  return value;
}

function requirePreparedCanonical(value: CanonicalHandoffBinding | undefined): CanonicalHandoffBinding & {
  readonly handoffId: string;
  readonly handoffRevision: number;
  readonly handoffIdempotencyKey: string;
  readonly handoffManifestHash: string;
  readonly handoffDtoHash: string;
  readonly handoffStatus: string;
  readonly safeSummary: string;
  readonly contextPackHashes: readonly string[];
  readonly toolRequestIds: readonly string[];
  readonly sourceEventIds: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly preparedEventId: string;
} {
  const canonical = requireCanonical(value);
  if (
    canonical.handoffId === undefined
    || canonical.handoffRevision === undefined
    || canonical.handoffIdempotencyKey === undefined
    || canonical.handoffManifestHash === undefined
    || canonical.handoffDtoHash === undefined
    || canonical.handoffStatus === undefined
    || canonical.safeSummary === undefined
    || canonical.contextPackHashes === undefined
    || canonical.toolRequestIds === undefined
    || canonical.sourceEventIds === undefined
    || canonical.relatedEventIds === undefined
    || canonical.preparedEventId === undefined
  ) {
    throw authorityError();
  }
  return canonical as CanonicalHandoffBinding & {
    readonly handoffId: string;
    readonly handoffRevision: number;
    readonly handoffIdempotencyKey: string;
    readonly handoffManifestHash: string;
    readonly handoffDtoHash: string;
    readonly handoffStatus: string;
    readonly safeSummary: string;
    readonly contextPackHashes: readonly string[];
    readonly toolRequestIds: readonly string[];
    readonly sourceEventIds: readonly string[];
    readonly relatedEventIds: readonly string[];
    readonly preparedEventId: string;
  };
}

function requireRecordedCanonical(value: CanonicalHandoffBinding | undefined): ReturnType<typeof requirePreparedCanonical> & {
  readonly recordedEventId: string;
  readonly verifiedAt: string;
} {
  const canonical = requirePreparedCanonical(value);
  if (canonical.recordedEventId === undefined || canonical.verifiedAt === undefined) throw authorityError();
  return canonical as ReturnType<typeof requirePreparedCanonical> & { readonly recordedEventId: string; readonly verifiedAt: string };
}

function requireTerminalCanonical(value: CanonicalHandoffBinding | undefined): ReturnType<typeof requireRecordedCanonical> & {
  readonly terminalEventId: string;
  readonly terminalStatus: "completed" | "failed";
} {
  const canonical = requireRecordedCanonical(value);
  if (canonical.terminalEventId === undefined || canonical.terminalStatus === undefined) throw authorityError();
  return canonical as ReturnType<typeof requireRecordedCanonical> & {
    readonly terminalEventId: string;
    readonly terminalStatus: "completed" | "failed";
  };
}

function samePreparedHandoffBinding(
  payload: NormalizedJsonRecord,
  canonical: ReturnType<typeof requirePreparedCanonical>
): boolean {
  const promptArtifactHash = Object.hasOwn(payload, "promptArtifactHash") ? requiredHash(payload.promptArtifactHash) : undefined;
  return (
    payload.handoffId === canonical.handoffId
    && payload.handoffRevision === canonical.handoffRevision
    && payload.idempotencyKey === canonical.handoffIdempotencyKey
    && payload.handoffManifestHash === canonical.handoffManifestHash
    && payload.handoffDtoHash === canonical.handoffDtoHash
    && payload.handoffMaterialArtifactHash === canonical.handoffMaterialArtifactHash
    && payload.status === canonical.handoffStatus
    && payload.safeSummary === canonical.safeSummary
    && payload.finalOutputStepId === canonical.finalOutputStepId
    && payload.finalOutputEventId === canonical.finalOutputEventId
    && promptArtifactHash === canonical.promptArtifactHash
    && sameStringArrays(normalizedHashArray(payload.contextPackHashes), canonical.contextPackHashes)
    && sameStringArrays(normalizedHashArray(payload.outputArtifactHashes), canonical.outputArtifactHashes)
    && sameStringArrays(normalizedStringArray(payload.toolRequestIds), canonical.toolRequestIds)
    && sameStringArrays(normalizedStringArray(payload.sourceEventIds), canonical.sourceEventIds)
    && sameStringArrays(normalizedStringArray(payload.relatedEventIds), canonical.relatedEventIds)
    && sameAuthorityBinding(payload, canonical.authorityBinding)
  );
}

function authorityBindingForPayload(
  payload: NormalizedJsonRecord,
  binding: RunBinding
): HandoffAuthorityBinding | undefined {
  const hasSchema = Object.hasOwn(payload, "manifestSchemaVersion");
  const hasAuthority = Object.hasOwn(payload, "authorityBinding");
  if (!hasSchema && !hasAuthority) return undefined;
  if (
    !hasSchema || !hasAuthority ||
    payload.manifestSchemaVersion !== "agent-specialist-handoff-manifest.v2" ||
    binding.authorityBinding === undefined ||
    !sameAuthorityBinding(payload, binding.authorityBinding)
  ) {
    throw authorityError();
  }
  return binding.authorityBinding;
}

function sameAuthorityBinding(payload: NormalizedJsonRecord, expected: HandoffAuthorityBinding | undefined): boolean {
  if (expected === undefined) {
    return !Object.hasOwn(payload, "authorityBinding") && !Object.hasOwn(payload, "manifestSchemaVersion");
  }
  if (
    payload.manifestSchemaVersion !== "agent-specialist-handoff-manifest.v2" ||
    !Object.hasOwn(payload, "authorityBinding")
  ) return false;
  const authority = normalizedOwnDataRecord(payload.authorityBinding);
  const fields = [
    "workspaceIdentityHash",
    "mountGeneration",
    "ledgerStoreIdentity",
    "artifactStoreIdentity",
    "ledgerHighWaterEventId",
    "policyHash",
    "activeLocksHash"
  ] as const;
  if (Object.getOwnPropertyNames(authority).length !== fields.length || fields.some((field) => authority[field] !== expected[field])) {
    return false;
  }
  return Object.getOwnPropertyNames(authority).every((field) => fields.includes(field as typeof fields[number]));
}

function isExpectedPredecessor(phase: CursorPhase, kind: MountedHandoffAuthorityEffectKind): boolean {
  return (
    (kind === "final-output" && (phase === "started" || phase === "started-running"))
    || (kind === "handoff-prepared" && phase === "final-output")
    || (kind === "handoff-recorded" && phase === "handoff-prepared")
    || (kind === "run-terminal" && phase === "handoff-recorded")
    || (kind === "orchestration-completed" && phase === "run-terminal")
    || (kind === "task-status" && phase === "orchestration-completed")
  );
}

function isExpectedSuccessor(phase: CursorPhase, kind: MountedHandoffAuthorityEffectKind): boolean {
  return (
    (kind === "final-output" && phase === "final-output")
    || (kind === "handoff-prepared" && phase === "handoff-prepared")
    || (kind === "handoff-recorded" && phase === "handoff-recorded")
    || (kind === "run-terminal" && phase === "run-terminal")
    || (kind === "orchestration-completed" && phase === "orchestration-completed")
    || (kind === "task-status" && phase === "task-status")
  );
}

function cursorFor(controller: MountedHandoffAuthorityController): CursorState {
  const cursor = controllerStates.get(controller);
  if (cursor === undefined || cursor.burned) throw authorityError();
  return cursor;
}

function normalizeBinding(value: BindPortableMountedAgentHandoffInput): RunBinding {
  const preliminary = ownDataRecord(value);
  const preliminaryRunType = requiredAgentSpecialistRunType(preliminary.runType);
  const record = exactOwnDataRecord(value, preliminaryRunType === "investigation-planner"
    ? ["taskId", "attemptId", "approvedRunId", "runType", "retryGeneration", "investigationId"]
    : ["taskId", "attemptId", "approvedRunId", "runType", "retryGeneration"]);
  const taskId = requiredText(record.taskId);
  const attemptId = requiredText(record.attemptId);
  const approvedRunId = requiredText(record.approvedRunId);
  const runType = requiredAgentSpecialistRunType(record.runType);
  const retryGeneration = requiredNonNegativeInteger(record.retryGeneration);
  const investigationId = runType === "investigation-planner" ? requiredText(record.investigationId) : undefined;
  return Object.freeze({
    taskId,
    attemptId,
    approvedRunId,
    runType,
    retryGeneration,
    ...(investigationId === undefined ? {} : { investigationId })
  });
}

function requiredAgentSpecialistRunType(value: unknown): AgentSpecialistRunType {
  if (typeof value !== "string" || !isAgentSpecialistRunType(value)) throw authorityError();
  return value;
}

function isAgentSpecialistRunType(value: string): value is AgentSpecialistRunType {
  return approvedAgentSpecialistRunTypes.some((candidate) => candidate === value);
}

function normalizeEventIds(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw authorityError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Object.keys(descriptors).length !== expected.size || Object.keys(descriptors).some((key) => !expected.has(key))) {
    throw authorityError();
  }
  const eventIds: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string" || !/^evt_[a-zA-Z0-9_-]+$/.test(descriptor.value)) {
      throw authorityError();
    }
    eventIds.push(descriptor.value);
  }
  return Object.freeze(eventIds);
}

function normalizeLedgerEvents(value: unknown): readonly NormalizedJson[] {
  const normalized = normalizeLedgerJson(value);
  if (!Array.isArray(normalized)) throw authorityError();
  return normalized;
}

function normalizeLedgerJson(value: unknown): NormalizedJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw authorityError();
    return value;
  }
  if (typeof value !== "object") throw authorityError();
  if (Array.isArray(value)) return normalizeLedgerArray(value);
  return normalizeLedgerRecord(value);
}

function normalizeLedgerArray(value: unknown[]): readonly NormalizedJson[] {
  if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || hasSerializationHook(Array.prototype)) {
    throw authorityError();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw authorityError();
  }
  const length = lengthDescriptor.value;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== length + 1 || !names.includes("length")) throw authorityError();
  const copy: NormalizedJson[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) throw authorityError();
    copy.push(normalizeLedgerJson(descriptor.value));
  }
  return Object.freeze(copy);
}

function normalizeLedgerRecord(value: object): Readonly<Record<string, NormalizedJson>> {
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0 || hasSerializationHook(Object.prototype)) {
    throw authorityError();
  }
  const copy: Record<string, NormalizedJson> = Object.create(null);
  for (const field of Object.getOwnPropertyNames(value)) {
    if (field === "toJSON") throw authorityError();
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !("value" in descriptor)) throw authorityError();
    copy[field] = normalizeLedgerJson(descriptor.value);
  }
  return Object.freeze(copy);
}

function hasSerializationHook(prototype: object | null): boolean {
  for (let current = prototype; current !== null; current = Object.getPrototypeOf(current)) {
    if (Object.getOwnPropertyDescriptor(current, "toJSON") !== undefined) return true;
  }
  return false;
}

function encodeEvents(value: readonly NormalizedJson[]): readonly Uint8Array[] {
  const encoded: Uint8Array[] = [];
  for (let index = 0; index < value.length; index += 1) {
    encoded.push(Buffer.from(encodeNormalizedJson(value[index]!), "utf8"));
  }
  return Object.freeze(encoded);
}

function encodeNormalizedJson(value: NormalizedJson): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  if (typeof value === "string") return encodePrimitiveString(value);
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      items.push(encodeNormalizedJson(value[index]!));
    }
    return `[${items.join(",")}]`;
  }
  const record = normalizedOwnDataRecord(value);
  const fields: string[] = [];
  for (const field of Object.getOwnPropertyNames(record)) {
    fields.push(`${encodePrimitiveString(field)}:${encodeNormalizedJson(record[field]!)}`);
  }
  return `{${fields.join(",")}}`;
}

function encodePrimitiveString(value: string): string {
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") throw authorityError();
  return encoded;
}

function snapshotTuple(value: ReturnType<typeof inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores>["snapshot"]): SnapshotTuple {
  return Object.freeze({
    workspaceId: value.workspaceId,
    mountInstanceId: value.mountInstanceId,
    workspaceIdentityEventId: value.workspaceIdentityEventId,
    mountEvidenceId: value.mountEvidenceId,
    authorityEvidenceId: value.authorityEvidenceId,
    ledgerStoreEvidenceId: value.ledgerStoreEvidenceId,
    artifactStoreEvidenceId: value.artifactStoreEvidenceId,
    derivativeStoreEvidenceId: value.derivativeStoreEvidenceId,
    policyVersion: value.policyVersion,
    policyDigest: value.policyDigest,
    lockStateDigest: value.lockStateDigest,
    highWaterMark: value.highWaterMark,
    highWaterOrdinal: value.highWaterOrdinal,
    admissionGenerationId: value.admissionGenerationId
  });
}

function deriveHandoffAuthorityBinding(snapshot: SnapshotTuple): HandoffAuthorityBinding {
  if (
    !/^evt_[a-zA-Z0-9_-]+$/.test(snapshot.workspaceIdentityEventId) ||
    !/^evt_[a-zA-Z0-9_-]+$/.test(snapshot.highWaterMark) ||
    !/^sha256:[a-f0-9]{64}$/.test(snapshot.policyDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(snapshot.lockStateDigest) ||
    snapshot.admissionGenerationId.length === 0 ||
    snapshot.ledgerStoreEvidenceId.length === 0 ||
    snapshot.artifactStoreEvidenceId.length === 0
  ) {
    throw authorityError();
  }
  return Object.freeze({
    workspaceIdentityHash: hashCanonicalSpecialistHandoffJson({
      schemaVersion: "mounted-handoff-workspace-identity.v1",
      workspaceId: snapshot.workspaceId,
      workspaceIdentityEventId: snapshot.workspaceIdentityEventId
    }),
    mountGeneration: snapshot.admissionGenerationId,
    ledgerStoreIdentity: snapshot.ledgerStoreEvidenceId,
    artifactStoreIdentity: snapshot.artifactStoreEvidenceId,
    ledgerHighWaterEventId: snapshot.highWaterMark,
    policyHash: snapshot.policyDigest as `sha256:${string}`,
    activeLocksHash: snapshot.lockStateDigest as `sha256:${string}`
  });
}

function workspaceTuple(value: ReturnType<typeof inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores>["workspace"]): WorkspaceTuple {
  return Object.freeze({
    workspaceId: value.workspaceId,
    rootDir: value.rootDir,
    manifestPath: value.manifestPath,
    ledgerPath: value.ledgerPath,
    blobRoot: value.blobRoot,
    derivativeRoot: value.derivativeRoot,
    jobRoot: value.jobRoot,
    projectionRoot: value.projectionRoot,
    cacheRoot: value.cacheRoot,
    configRoot: value.configRoot
  });
}

function mountedTuple(value: ReturnType<typeof inspectMountedArtifactAuthorityOperationForPortableMountedAgentArtifactStores>["mountedWorkspace"]): MountedTuple {
  return Object.freeze({
    workspaceId: value.workspaceId,
    rootDir: value.rootDir,
    manifestPath: value.manifestPath,
    ledgerPath: value.paths.ledgerPath,
    blobRoot: value.paths.blobRoot,
    derivativeRoot: value.paths.derivativeRoot,
    jobRoot: value.paths.jobRoot,
    projectionRoot: value.paths.projectionRoot,
    cacheRoot: value.paths.cacheRoot,
    configRoot: value.paths.configRoot
  });
}

function sameSnapshotTuple(left: SnapshotTuple, right: SnapshotTuple): boolean {
  return Object.keys(left).every((key) => left[key as keyof SnapshotTuple] === right[key as keyof SnapshotTuple]);
}

function sameWorkspaceTuple(left: WorkspaceTuple, right: WorkspaceTuple): boolean {
  return Object.keys(left).every((key) => left[key as keyof WorkspaceTuple] === right[key as keyof WorkspaceTuple]);
}

function sameMountedTuple(left: MountedTuple, right: MountedTuple): boolean {
  return Object.keys(left).every((key) => left[key as keyof MountedTuple] === right[key as keyof MountedTuple]);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function normalizedOwnDataRecord(value: NormalizedJson | undefined): NormalizedJsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) {
    throw authorityError();
  }
  for (const field of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (field === "toJSON" || descriptor === undefined || !("value" in descriptor)) throw authorityError();
  }
  return value as NormalizedJsonRecord;
}

function normalizedStringArray(value: NormalizedJson | undefined): readonly string[] {
  if (!Array.isArray(value)) throw authorityError();
  const copy: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string") throw authorityError();
    copy.push(item);
  }
  return Object.freeze(copy);
}

function normalizedHashArray(value: NormalizedJson | undefined): readonly string[] {
  const hashes = normalizedStringArray(value);
  if (hashes.some((hash) => !isHash(hash))) throw authorityError();
  return hashes;
}

function sameStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactOwnDataRecord(value: unknown, expectedFields: readonly string[]): Record<string, unknown> {
  const record = ownDataRecord(value);
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw authorityError();
  return record;
}

function ownDataRecord(value: unknown): Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
      throw authorityError();
    }
    const normalized: Record<string, unknown> = Object.create(null);
    for (const field of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw authorityError();
      normalized[field] = descriptor.value;
    }
    return Object.freeze(normalized);
  } catch {
    throw authorityError();
  }
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw authorityError();
  return value;
}

function requiredHash(value: unknown): string {
  if (!isHash(value)) throw authorityError();
  return value;
}

function requiredPositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw authorityError();
  return value;
}

function requiredNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw authorityError();
  return value;
}

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function authorityError(): Error {
  return new Error("portable-mounted-handoff-authority-invalid");
}
