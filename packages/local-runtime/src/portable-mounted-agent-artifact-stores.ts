import { join } from "node:path";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { mountPortableWorkspace } from "../../workspace/src/index.js";
import type { SpecialistHandoffManifestStore } from "../../agent/src/specialist-runner-kernel.js";
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
  readonly runType: string;
}

export interface PortableMountedAgentHandoffBinding {
  readonly schemaVersion: "portable-mounted-agent-handoff-binding.v1";
  readonly preparationBinder: MountedSpecialistHandoffPreparationBinder;
  readonly materialStore: SpecialistHandoffManifestStore;
  readonly manifestStore: SpecialistHandoffManifestStore;
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
  readonly runType: string;
}

type CursorPhase =
  | "initial"
  | "started"
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
        const binding = normalizeBinding(input);
        cursor = {
          authorityOperation: state.authorityOperation,
          origin: state.origin,
          binding,
          accepted: undefined,
          phase: "initial",
          lastRelevantEventId: undefined,
          handoffEventIds: [],
          burned: false
        };
        await inspectCursor(cursor);

        const remounted = remountCurrent(cursor.origin);
        const materialStore = createCursorBoundStore(
          cursor,
          new FileBlobStore(join(remounted.paths.derivativeRoot, "specialist-handoff-material"))
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
        const handoffBinding = Object.freeze({
          schemaVersion: "portable-mounted-agent-handoff-binding.v1" as const,
          preparationBinder,
          materialStore,
          manifestStore
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
    const events = await cursor.origin.ledger.readAll();
    assertOriginCurrent(cursor);
    const encoded = encodeEvents(events);
    if (cursor.accepted === undefined) {
      const initial = deriveInitialState(events, cursor.binding);
      cursor.phase = initial.phase;
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
    let lastRelevantEventId = cursor.lastRelevantEventId;
    const newEventIds: string[] = [];
    for (const event of events.slice(cursor.accepted.length)) {
      const previousPhase = phase;
      const advanced = advancePhase(phase, event, cursor.binding, lastRelevantEventId);
      phase = advanced.phase;
      lastRelevantEventId = advanced.eventId;
      if (!(previousPhase === "initial" && advanced.phase === "started")) {
        newEventIds.push(advanced.eventId);
      }
    }
    cursor.phase = phase;
    cursor.lastRelevantEventId = lastRelevantEventId;
    cursor.handoffEventIds.push(...newEventIds.filter((eventId) => eventId !== `evt_started_${cursor.binding.approvedRunId}`));
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

function createCursorBoundStore(cursor: CursorState, store: FileBlobStore): SpecialistHandoffManifestStore {
  return Object.freeze({
    async put(content: Buffer) {
      const stored = await inspectAround(cursor, async () => await store.put(content));
      return Object.freeze({ contentHash: stored.contentHash, sizeBytes: stored.sizeBytes });
    },
    async get(contentHash: `sha256:${string}`) {
      return await inspectAround(cursor, async () => await store.get(contentHash));
    }
  });
}

async function inspectAround<T>(cursor: CursorState, operation: () => Promise<T>): Promise<T> {
  await inspectCursor(cursor);
  try {
    const result = await operation();
    await inspectCursor(cursor);
    return result;
  } catch (error) {
    try {
      await inspectCursor(cursor);
    } catch {
      throw authorityError();
    }
    throw error;
  }
}

function deriveInitialState(events: readonly KnowledgeEvent[], binding: RunBinding): {
  readonly phase: CursorPhase;
  readonly lastRelevantEventId: string | undefined;
  readonly handoffEventIds: readonly string[];
} {
  let phase: CursorPhase = "initial";
  let lastRelevantEventId: string | undefined;
  const handoffEventIds: string[] = [];
  for (const event of events) {
    if (!isBoundEvent(event, binding)) continue;
    const previousPhase = phase;
    const advanced = advancePhase(phase, event, binding, lastRelevantEventId);
    phase = advanced.phase;
    lastRelevantEventId = advanced.eventId;
    if (!(previousPhase === "initial" && advanced.phase === "started")) {
      handoffEventIds.push(advanced.eventId);
    }
  }
  return Object.freeze({
    phase,
    lastRelevantEventId,
    handoffEventIds: Object.freeze(handoffEventIds)
  });
}

function advancePhase(
  phase: CursorPhase,
  event: KnowledgeEvent,
  binding: RunBinding,
  predecessor: string | undefined
): { readonly phase: CursorPhase; readonly eventId: string } {
  const record = ownDataRecord(event);
  const payload = ownDataRecord(record.payload);
  const context = ownDataRecord(record.context);
  const actor = ownDataRecord(context.actor);
  if (
    record.version !== 1
    || typeof record.id !== "string"
    || !/^evt_[a-zA-Z0-9_-]+$/.test(record.id)
    || typeof record.streamId !== "string"
    || actor.kind !== "agent"
  ) {
    throw authorityError();
  }
  const type = record.type;
  if (type === "agent.specialist-run.started") {
    if (
      phase !== "initial"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.residentAgentId !== "agent_default"
    ) {
      throw authorityError();
    }
    return { phase: "started", eventId: record.id };
  }
  if (type === "agent.specialist-run.step.recorded") {
    if (
      phase !== "started"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.stepKind !== "final-output"
      || typeof payload.stepId !== "string"
      || typeof payload.stepSchemaId !== "string"
      || !isHash(payload.handoffMaterialArtifactHash)
    ) {
      throw authorityError();
    }
    return { phase: "final-output", eventId: record.id };
  }
  if (type === "agent.specialist-handoff.prepared") {
    if (
      phase !== "final-output"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.finalOutputEventId !== predecessor
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "handoff-prepared", eventId: record.id };
  }
  if (type === "agent.specialist-handoff.recorded") {
    if (
      phase !== "handoff-prepared"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || payload.taskId !== binding.taskId
      || payload.runType !== binding.runType
      || payload.preparedEventId !== predecessor
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "handoff-recorded", eventId: record.id };
  }
  if (type === "agent.specialist-run.completed" || type === "agent.specialist-run.failed") {
    if (
      phase !== "handoff-recorded"
      || record.streamId !== `agent_run_${binding.approvedRunId}`
      || payload.runId !== binding.approvedRunId
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "run-terminal", eventId: record.id };
  }
  if (type === "agent.task.orchestration.completed") {
    if (
      phase !== "run-terminal"
      || record.streamId !== `agent_task_${binding.taskId}`
      || payload.taskId !== binding.taskId
      || payload.runId !== binding.approvedRunId
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "orchestration-completed", eventId: record.id };
  }
  if (type === "agent.task.status.changed") {
    if (
      phase !== "orchestration-completed"
      || record.streamId !== `agent_task_${binding.taskId}`
      || payload.taskId !== binding.taskId
      || payload.runId !== binding.approvedRunId
      || (payload.status !== "completed" && payload.status !== "failed")
      || context.causationId !== predecessor
    ) {
      throw authorityError();
    }
    return { phase: "task-status", eventId: record.id };
  }
  throw authorityError();
}

function isBoundEvent(event: KnowledgeEvent, binding: RunBinding): boolean {
  const record = ownDataRecord(event);
  const payload = ownDataRecord(record.payload);
  return payload.runId === binding.approvedRunId || payload.taskId === binding.taskId;
}

function isExpectedPredecessor(phase: CursorPhase, kind: MountedHandoffAuthorityEffectKind): boolean {
  return (
    (kind === "final-output" && phase === "started")
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
  const record = exactOwnDataRecord(value, ["taskId", "attemptId", "approvedRunId", "runType"]);
  const taskId = requiredText(record.taskId);
  const attemptId = requiredText(record.attemptId);
  const approvedRunId = requiredText(record.approvedRunId);
  const runType = requiredText(record.runType);
  return Object.freeze({ taskId, attemptId, approvedRunId, runType });
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

function encodeEvents(value: unknown): readonly Uint8Array[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw authorityError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Object.keys(descriptors).length !== expected.size || Object.keys(descriptors).some((key) => !expected.has(key))) {
    throw authorityError();
  }
  return Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor)) throw authorityError();
    return Buffer.from(JSON.stringify(descriptor.value), "utf8");
  }));
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

function isHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function authorityError(): Error {
  return new Error("portable-mounted-handoff-authority-invalid");
}
