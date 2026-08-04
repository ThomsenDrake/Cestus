import { createHash } from "node:crypto";
import { types } from "node:util";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  canonicalSpecialistHandoffMaterialBytes,
  canonicalSpecialistHandoffJson,
  parseSpecialistHandoffMaterial,
  parseAuthorityBoundSpecialistHandoffManifest,
  specialistHandoffManifestV2SchemaVersion,
  verifyAuthorityBoundSpecialistHandoffManifest,
  verifySpecialistHandoffManifest,
  type AuthorityBoundSpecialistHandoffManifest,
  type SpecialistHandoffManifest,
  type SpecialistHandoffMaterial
} from "./specialist-handoff-manifest.js";
import type { SpecialistWorkflowHandoffDto } from "./specialist-handoffs.js";
import { productionSpecialistPromptRegistrationFor } from "./production-specialist-prompts.js";
import type { SpecialistHandoffProjectionState as LegacySpecialistHandoffProjectionState } from "./projection-types.js";
import { specialistWorkflowDescriptorFor } from "./specialist-workflows.js";
import type { AgentSpecialistRunType } from "./specialists.js";
import type { HandoffAuthorityBinding } from "./specialist-handoff-authority.js";

type HandoffStatus = SpecialistWorkflowHandoffDto["status"];
type ContentHash = `sha256:${string}`;
type AnySpecialistHandoffManifest = SpecialistHandoffManifest | AuthorityBoundSpecialistHandoffManifest;
type HandoffPreparedEvent = KnowledgeEventOf<"agent.specialist-handoff.prepared">;
type HandoffRecordedEvent = KnowledgeEventOf<"agent.specialist-handoff.recorded">;
type FinalOutputEvent = KnowledgeEventOf<"agent.specialist-run.step.recorded">;
type RunStartedEvent = KnowledgeEventOf<"agent.specialist-run.started">;
type RunTerminalEvent =
  | KnowledgeEventOf<"agent.specialist-run.completed">
  | KnowledgeEventOf<"agent.specialist-run.failed">;
type OrchestrationCompletedEvent = KnowledgeEventOf<"agent.task.orchestration.completed">;
type TaskStatusEvent = KnowledgeEventOf<"agent.task.status.changed">;

type AuthorityAwareSpecialistHandoffProjectionState = LegacySpecialistHandoffProjectionState | "legacy-unbound";

export interface SpecialistHandoffManifestReader {
  get(contentHash: ContentHash): Promise<Buffer>;
}

export interface BuildSpecialistHandoffProjectionInput {
  readonly events: readonly KnowledgeEvent[];
  readonly manifestReader: SpecialistHandoffManifestReader;
  readonly runId?: string;
  readonly taskId?: string;
}

export interface SpecialistHandoffProjectionDiagnostic {
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly allowedRepairActions: readonly string[];
}

export interface SpecialistHandoffProjectionEntry {
  readonly state: Exclude<AuthorityAwareSpecialistHandoffProjectionState, "no-output" | "inconsistent">;
  readonly runId: string;
  readonly taskId?: string;
  readonly handoffId?: string;
  readonly finalOutputEventId?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly supersededByHandoffId?: string;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly string[];
}

export interface SpecialistHandoffProjection {
  readonly state: AuthorityAwareSpecialistHandoffProjectionState;
  readonly handoffs: readonly SpecialistWorkflowHandoffDto[];
  readonly selectedHandoff?: SpecialistWorkflowHandoffDto;
  readonly selectedReadback?: SpecialistHandoffReadback;
  readonly history: readonly SpecialistHandoffProjectionEntry[];
  readonly diagnostics: readonly SpecialistHandoffProjectionDiagnostic[];
}

/** The frozen Task119 HandoffReadback.v1 shape, produced only from replay. */
export interface SpecialistHandoffReadback {
  readonly outcome: "verified";
  readonly handoffId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly manifestSchemaVersion: typeof specialistHandoffManifestV2SchemaVersion;
  readonly manifestHash: ContentHash;
  readonly finalOutputStepId: string;
  readonly finalOutputEventId: string;
  readonly preparedEventId: string;
  readonly recordedEventId: string;
  readonly terminalRunEventId: string;
  readonly taskStatusEventId: string;
  readonly authorityBinding: HandoffAuthorityBinding;
  readonly diagnostics: readonly {
    readonly category: "terminal-status-conflict" | "handoff-readback";
    readonly retry: "none" | "after-remount" | "after-repair" | "after-review";
    readonly safeMessage: string;
    readonly eventIds: readonly string[];
    readonly artifactHashes: readonly ContentHash[];
  }[];
}

interface RunIdentity {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: string;
  readonly residentAgentId: string;
}

interface PreparedRecord {
  readonly event: HandoffPreparedEvent;
  readonly index: number;
}

interface RecordedRecord {
  readonly event: HandoffRecordedEvent;
  readonly index: number;
}

interface VerifiedHandoffRecord {
  readonly handoff: SpecialistWorkflowHandoffDto;
  readonly manifest: AnySpecialistHandoffManifest;
  readonly manifestHash: ContentHash;
  readonly prepared: HandoffPreparedEvent;
  readonly recorded: HandoffRecordedEvent;
  readonly preparedIndex: number;
  readonly recordedIndex: number;
}

interface ProjectionContext {
  readonly events: readonly KnowledgeEvent[];
  readonly manifestReader: SpecialistHandoffManifestReader;
  readonly runId: string | undefined;
  readonly taskId: string | undefined;
  readonly runIdentities: ReadonlyMap<string, RunIdentity>;
  readonly runStartedEvents: ReadonlyMap<string, readonly IndexedEvent<RunStartedEvent>[]>;
  readonly finalOutputs: readonly IndexedEvent<FinalOutputEvent>[];
  readonly prepared: readonly IndexedEvent<HandoffPreparedEvent>[];
  readonly recorded: readonly IndexedEvent<HandoffRecordedEvent>[];
  readonly terminals: readonly IndexedEvent<RunTerminalEvent>[];
  readonly orchestrationCompletions: readonly IndexedEvent<OrchestrationCompletedEvent>[];
  readonly taskStatuses: readonly IndexedEvent<TaskStatusEvent>[];
  readonly diagnostics: SpecialistHandoffProjectionDiagnostic[];
}

interface IndexedEvent<Event extends KnowledgeEvent> {
  readonly event: Event;
  readonly index: number;
}

interface ExactResidentLoopIdentityAndAuthority {
  readonly taskId: string;
  readonly runId: string;
  readonly authorityBinding: HandoffAuthorityBinding;
}

interface InternalSpecialistHandoffProjectionPort {
  readFull(
    input: ExactResidentLoopIdentityAndAuthority
  ): Promise<SpecialistHandoffProjection | undefined>;
}

interface InternalSpecialistHandoffProjectionDependencies {
  readonly ledger: {
    readAll(): Promise<readonly KnowledgeEvent[]>;
  };
  readonly handoffReader: {
    readExact(contentHash: ContentHash): Promise<Uint8Array>;
  };
}

export default function createInternalSpecialistHandoffProjectionPort(
  dependencies: InternalSpecialistHandoffProjectionDependencies
): InternalSpecialistHandoffProjectionPort {
  const readAll = dependencies.ledger.readAll.bind(dependencies.ledger);
  const readExact = dependencies.handoffReader.readExact.bind(dependencies.handoffReader);
  return Object.freeze({
    async readFull(
      input: ExactResidentLoopIdentityAndAuthority
    ): Promise<SpecialistHandoffProjection | undefined> {
      const projection = await buildSpecialistHandoffProjection({
        events: await readAll(),
        manifestReader: {
          async get(contentHash: ContentHash): Promise<Buffer> {
            return Buffer.from(await readExact(contentHash));
          }
        },
        taskId: input.taskId,
        runId: input.runId
      });
      const readback = projection.selectedReadback;
      if (
        projection.state !== "task-completed" ||
        projection.diagnostics.length !== 0 ||
        readback === undefined ||
        readback.diagnostics.length !== 0 ||
        readback.taskId !== input.taskId ||
        readback.runId !== input.runId ||
        !sameCanonicalValue(readback.authorityBinding, input.authorityBinding) ||
        readback.recordedEventId.length === 0 ||
        readback.terminalRunEventId.length === 0 ||
        readback.taskStatusEventId.length === 0 ||
        readback.manifestHash.length === 0
      ) {
        return undefined;
      }
      return deeplyFrozenPlainOwnDataCopy(projection);
    }
  });
}

export async function buildSpecialistHandoffProjection(
  input: BuildSpecialistHandoffProjectionInput
): Promise<SpecialistHandoffProjection> {
  const context = collectContext(input);
  const history: SpecialistHandoffProjectionEntry[] = [];

  const finalOutputs = await selectFinalOutputs(context);
  for (const finalOutput of finalOutputs) {
    history.push(outputPersistedEntry(finalOutput));
  }

  const pendingPreparedRecords: PreparedRecord[] = [];
  const preparedByEventId = new Map<string, PreparedRecord>();
  const preparedByHandoffId = new Map<string, PreparedRecord>();
  for (const prepared of context.prepared) {
    const record = { event: prepared.event, index: prepared.index };
    const priorByEventId = preparedByEventId.get(prepared.event.id);
    if (priorByEventId !== undefined && !sameCanonicalValue(priorByEventId.event.payload, prepared.event.payload)) {
      addDiagnostic(context, {
        code: "conflicting-prepared",
        message: "Conflicting prepared handoff events share an event id.",
        event: prepared.event,
        handoffId: prepared.event.payload.handoffId,
        relatedEventIds: [priorByEventId.event.id],
        artifactHashes: [prepared.event.payload.handoffManifestHash]
      });
      continue;
    }
    if (priorByEventId !== undefined) {
      continue;
    }

    preparedByEventId.set(prepared.event.id, record);

    const priorByHandoffId = preparedByHandoffId.get(prepared.event.payload.handoffId);
    if (priorByHandoffId === undefined) {
      preparedByHandoffId.set(prepared.event.payload.handoffId, record);
      pendingPreparedRecords.push(record);
      continue;
    }

    if (!sameCanonicalValue(priorByHandoffId.event.payload, prepared.event.payload)) {
      addDiagnostic(context, {
        code: "conflicting-prepared",
        message: "Prepared handoff events reuse a handoff ID with different compact bindings.",
        event: prepared.event,
        handoffId: prepared.event.payload.handoffId,
        relatedEventIds: [priorByHandoffId.event.id],
        artifactHashes: [
          priorByHandoffId.event.payload.handoffManifestHash,
          prepared.event.payload.handoffManifestHash
        ]
      });
    }
  }

  for (const prepared of pendingPreparedRecords) {
    if (await validatePreparedHandoff(context, prepared.event)) {
      history.push(handoffPendingEntry(prepared.event));
    }
  }

  const verified: VerifiedHandoffRecord[] = [];
  const recordedByPreparedEventId = new Map<string, RecordedRecord>();
  for (const recorded of context.recorded) {
    const prepared = preparedByEventId.get(recorded.event.payload.preparedEventId);
    if (prepared === undefined) {
      addDiagnostic(context, {
        code: "recorded-without-prepared",
        message: "Recorded handoff does not reference an earlier prepared event.",
        event: recorded.event,
        handoffId: recorded.event.payload.handoffId,
        artifactHashes: [recorded.event.payload.handoffManifestHash]
      });
      continue;
    }

    const priorRecorded = recordedByPreparedEventId.get(recorded.event.payload.preparedEventId);
    if (priorRecorded !== undefined) {
      if (!sameRecordedRetry(priorRecorded.event, recorded.event)) {
        addDiagnostic(context, {
          code: "conflicting-recorded",
          message: "Recorded handoff events reuse a prepared event with different readback bindings.",
          event: recorded.event,
          handoffId: recorded.event.payload.handoffId,
          relatedEventIds: [priorRecorded.event.id, recorded.event.payload.preparedEventId],
          artifactHashes: [
            priorRecorded.event.payload.handoffManifestHash,
            recorded.event.payload.handoffManifestHash
          ]
        });
      }
      continue;
    }

    if (prepared.index >= recorded.index) {
      addDiagnostic(context, {
        code: "recorded-before-prepared",
        message: "Recorded handoff appears before its prepared event.",
        event: recorded.event,
        handoffId: recorded.event.payload.handoffId,
        relatedEventIds: [prepared.event.id]
      });
      continue;
    }

    recordedByPreparedEventId.set(recorded.event.payload.preparedEventId, { event: recorded.event, index: recorded.index });

    if (!handoffCausationIsValid(prepared.event, recorded.event)) {
      addDiagnostic(context, {
        code: "handoff-causation-mismatch",
        message: "Prepared and recorded handoff causation must follow final-output, prior recorded handoff, and prepared event IDs.",
        event: recorded.event,
        handoffId: recorded.event.payload.handoffId,
        relatedEventIds: [prepared.event.id, prepared.event.payload.finalOutputEventId],
        artifactHashes: [recorded.event.payload.handoffManifestHash]
      });
      continue;
    }

    if (!compactBindingsAgree(prepared.event.payload, recorded.event.payload)) {
      addDiagnostic(context, {
        code: "compact-binding-mismatch",
        message: "Prepared and recorded handoff compact bindings disagree.",
        event: recorded.event,
        handoffId: recorded.event.payload.handoffId,
        relatedEventIds: [prepared.event.id],
        artifactHashes: [recorded.event.payload.handoffManifestHash]
      });
      continue;
    }

    const manifestResult = await readAndVerifyManifest(context, recorded.event);
    if (!manifestResult.ok) {
      continue;
    }

    const manifest = manifestResult.manifest;
    const bindingError = validateBindingAgainstManifest(context, prepared.event, recorded.event, manifest);
    if (bindingError !== undefined) {
      addDiagnostic(context, {
        code: bindingError,
        message: "Ledger compact binding, manifest, DTO, or final-output refs disagree.",
        event: recorded.event,
        handoffId: recorded.event.payload.handoffId,
        relatedEventIds: [prepared.event.id, manifest.finalOutputEventId],
        artifactHashes: [recorded.event.payload.handoffManifestHash, ...recorded.event.payload.outputArtifactHashes]
      });
      if (manifest.supersedesHandoffId !== undefined) {
        addDiagnostic(context, {
          code: "supersession-violation",
          message: "Supersession changed the final-output or output artifact anchor.",
          event: recorded.event,
          handoffId: recorded.event.payload.handoffId,
          relatedEventIds: [prepared.event.id, manifest.finalOutputEventId],
          artifactHashes: [recorded.event.payload.handoffManifestHash, ...recorded.event.payload.outputArtifactHashes]
        });
      }
      continue;
    }

    verified.push({
      handoff: manifestResult.handoff,
      manifest,
      manifestHash: recorded.event.payload.handoffManifestHash as ContentHash,
      prepared: prepared.event,
      recorded: recorded.event,
      preparedIndex: prepared.index,
      recordedIndex: recorded.index
    });
  }

  validateVerifiedHandoffs(context, verified);
  validateTerminalOrder(context, verified);

  const authorityBound = verified.filter((record) => record.manifest.schemaVersion === specialistHandoffManifestV2SchemaVersion);
  const legacy = verified.filter((record) => record.manifest.schemaVersion !== specialistHandoffManifestV2SchemaVersion);
  const handoffs = Object.freeze(authorityBound.map((record) => record.handoff));
  const supersededIds = supersededHandoffIds(verified);
  const selectedRecord = [...authorityBound].reverse().find((record) => !supersededIds.has(record.handoff.handoffId));

  for (const record of verified) {
    history.push(record.manifest.schemaVersion === specialistHandoffManifestV2SchemaVersion
      ? recordedEntry(record, supersededIds.get(record.handoff.handoffId))
      : legacyUnboundEntry(record, supersededIds.get(record.handoff.handoffId)));
  }

  if (context.diagnostics.length > 0) {
    return freezeProjection({
      state: "inconsistent",
      handoffs,
      history,
      diagnostics: context.diagnostics
    });
  }

  if (selectedRecord !== undefined) {
    const readback = completeAuthorityBoundReadback(context, selectedRecord);
    if (readback !== undefined) {
      history.push(taskCompletedEntry(selectedRecord));
      return freezeProjection({
        state: "task-completed",
        handoffs,
        selectedHandoff: selectedRecord.handoff,
        selectedReadback: readback,
        history,
        diagnostics: []
      });
    }
    return freezeProjection({
      state: "handoff-recorded",
      handoffs,
      selectedHandoff: selectedRecord.handoff,
      history,
      diagnostics: []
    });
  }

  if (legacy.length > 0) {
    const selectedLegacy = [...legacy].reverse().find((record) => !supersededIds.has(record.handoff.handoffId));
    return freezeProjection({
      state: "legacy-unbound",
      handoffs: Object.freeze(legacy.map((record) => record.handoff)),
      ...(selectedLegacy === undefined ? {} : { selectedHandoff: selectedLegacy.handoff }),
      history,
      diagnostics: []
    });
  }

  if (context.prepared.length > 0) {
    return freezeProjection({
      state: "handoff-pending",
      handoffs: [],
      history,
      diagnostics: []
    });
  }

  if (finalOutputs.length > 0) {
    return freezeProjection({
      state: "output-persisted",
      handoffs: [],
      history,
      diagnostics: []
    });
  }

  return freezeProjection({
    state: "no-output",
    handoffs: [],
    history: [],
    diagnostics: []
  });
}

function collectContext(input: BuildSpecialistHandoffProjectionInput): ProjectionContext {
  const runIdentities = new Map<string, RunIdentity>();
  const runStartedEvents = new Map<string, IndexedEvent<RunStartedEvent>[]>();
  input.events.forEach((event, index) => {
    if (event.type === "agent.specialist-run.started") {
      const started = runStartedEvents.get(event.payload.runId) ?? [];
      started.push({ event, index });
      runStartedEvents.set(event.payload.runId, started);
      if (!runIdentities.has(event.payload.runId)) {
        runIdentities.set(event.payload.runId, runIdentityForStartedEvent(event));
      }
    }
  });

  const finalOutputs: IndexedEvent<FinalOutputEvent>[] = [];
  const prepared: IndexedEvent<HandoffPreparedEvent>[] = [];
  const recorded: IndexedEvent<HandoffRecordedEvent>[] = [];
  const terminals: IndexedEvent<RunTerminalEvent>[] = [];
  const orchestrationCompletions: IndexedEvent<OrchestrationCompletedEvent>[] = [];
  const taskStatuses: IndexedEvent<TaskStatusEvent>[] = [];

  input.events.forEach((event, index) => {
    if (!eventMatchesFilter(event, input, runIdentities)) {
      return;
    }

    switch (event.type) {
      case "agent.specialist-run.step.recorded":
        if (isExactFinalOutput(event)) {
          finalOutputs.push({ event, index });
        }
        break;
      case "agent.specialist-handoff.prepared":
        prepared.push({ event, index });
        break;
      case "agent.specialist-handoff.recorded":
        recorded.push({ event, index });
        break;
      case "agent.specialist-run.completed":
      case "agent.specialist-run.failed":
        terminals.push({ event, index });
        break;
      case "agent.task.orchestration.completed":
        orchestrationCompletions.push({ event, index });
        break;
      case "agent.task.status.changed":
        taskStatuses.push({ event, index });
        break;
      default:
        break;
    }
  });

  return {
    events: input.events,
    manifestReader: input.manifestReader,
    runId: input.runId,
    taskId: input.taskId,
    runIdentities,
    runStartedEvents,
    finalOutputs,
    prepared,
    recorded,
    terminals,
    orchestrationCompletions,
    taskStatuses,
    diagnostics: []
  };
}

function runIdentityForStartedEvent(event: RunStartedEvent): RunIdentity {
  return {
    runId: event.payload.runId,
    ...(event.payload.taskId === undefined ? {} : { taskId: event.payload.taskId }),
    runType: event.payload.runType,
    residentAgentId: event.payload.residentAgentId
  };
}

function eventMatchesFilter(
  event: KnowledgeEvent,
  input: Pick<BuildSpecialistHandoffProjectionInput, "runId" | "taskId">,
  runIdentities: ReadonlyMap<string, RunIdentity>
): boolean {
  const runId = runIdForEvent(event);
  if (input.runId !== undefined && runId !== undefined && runId !== input.runId) {
    return false;
  }

  if (input.taskId === undefined) {
    return true;
  }

  const taskId = taskIdForEvent(event, runIdentities);
  return taskId === input.taskId;
}

function runIdForEvent(event: KnowledgeEvent): string | undefined {
  switch (event.type) {
    case "agent.specialist-run.started":
    case "agent.specialist-run.step.recorded":
    case "agent.specialist-run.completed":
    case "agent.specialist-run.failed":
    case "agent.specialist-handoff.prepared":
    case "agent.specialist-handoff.recorded":
    case "agent.task.orchestration.completed":
      return event.payload.runId;
    case "agent.task.status.changed":
      return event.payload.runId;
    default:
      return undefined;
  }
}

function taskIdForEvent(event: KnowledgeEvent, runIdentities: ReadonlyMap<string, RunIdentity>): string | undefined {
  switch (event.type) {
    case "agent.specialist-run.started":
    case "agent.specialist-handoff.prepared":
    case "agent.specialist-handoff.recorded":
    case "agent.task.orchestration.completed":
      return event.payload.taskId;
    case "agent.task.status.changed":
      return event.payload.taskId;
    default: {
      const runId = runIdForEvent(event);
      return runId === undefined ? undefined : runIdentities.get(runId)?.taskId;
    }
  }
}

function isExactFinalOutput(event: FinalOutputEvent): boolean {
  return event.payload.stepKind === "final-output" &&
    event.payload.stepSchemaId !== undefined &&
    event.payload.idempotencyKey !== undefined &&
    event.payload.handoffMaterialArtifactHash !== undefined &&
    event.payload.outputArtifactHashes !== undefined;
}

async function selectFinalOutputs(context: ProjectionContext): Promise<readonly IndexedEvent<FinalOutputEvent>[]> {
  if (context.finalOutputs.length === 0) {
    return [];
  }

  const firstByScope = new Map<string, IndexedEvent<FinalOutputEvent>>();
  for (const finalOutput of context.finalOutputs) {
    await validateFinalOutputForProjection(context, finalOutput.event);
    const scope = finalOutputScopeKey(context, finalOutput.event);
    const prior = firstByScope.get(scope);
    if (prior === undefined) {
      firstByScope.set(scope, finalOutput);
      continue;
    }

    if (!sameFinalOutput(prior.event, finalOutput.event) && !(await isSupersessionFinalOutput(context, prior.event, finalOutput.event))) {
      addDiagnostic(context, {
        code: "conflicting-final-output",
        message: "Conflicting final-output step events exist for the same projection scope.",
        event: finalOutput.event,
        relatedEventIds: [prior.event.id, finalOutput.event.id],
        artifactHashes: [
          ...(prior.event.payload.outputArtifactHashes ?? []),
          ...(finalOutput.event.payload.outputArtifactHashes ?? [])
        ]
      });
    }
  }

  return context.finalOutputs;
}

async function validateFinalOutputForProjection(
  context: ProjectionContext,
  finalOutput: FinalOutputEvent
): Promise<void> {
  const runStartedEvents = context.runStartedEvents.get(finalOutput.payload.runId) ?? [];
  const runStarted = runStartedEvents[0];
  if (runStarted === undefined || runStartedEvents.length !== 1) {
    addDiagnostic(context, {
      code: "run-identity-mismatch",
      message: "Final-output step requires exactly one ledger-bound run identity.",
      event: finalOutput
    });
    return;
  }

  const runIdentity = runIdentityForStartedEvent(runStarted.event);
  const expectedStepSchemaId = authoritativeFinalOutputStepSchemaId(runIdentity.runType);
  if (
    finalOutput.payload.stepKind !== "final-output" ||
    expectedStepSchemaId === undefined ||
    finalOutput.payload.stepSchemaId !== expectedStepSchemaId ||
    finalOutput.payload.idempotencyKey === undefined ||
    finalOutput.payload.handoffMaterialArtifactHash === undefined ||
    finalOutput.payload.outputArtifactHashes === undefined
  ) {
    addDiagnostic(context, {
      code: "final-output-mismatch",
      message: "Final-output step does not match production schema authority or durable handoff bindings.",
      event: finalOutput,
      artifactHashes: finalOutput.payload.outputArtifactHashes ?? []
    });
    return;
  }

  const material = await readFinalOutputMaterialForProjection(
    context,
    finalOutput,
    finalOutput.payload.handoffMaterialArtifactHash as ContentHash
  );
  if (material === undefined) {
    return;
  }

  const inputHashes = new Set(finalOutput.payload.inputArtifactHashes ?? []);
  const outputHashes = finalOutput.payload.outputArtifactHashes ?? [];
  const eventIds = new Set(context.events.map((event) => event.id));
  if (finalOutput.payload.idempotencyKey !== expectedFinalOutputIdempotencyKey(
    finalOutput.payload.runId,
    runIdentity.taskId,
    runIdentity.runType,
    material,
    finalOutput.payload.handoffMaterialArtifactHash as ContentHash
  )) {
    addDiagnostic(context, {
      code: "idempotency-key-mismatch",
      message: "Final-output step idempotency key does not match its ledger-bound material identity.",
      event: finalOutput,
      artifactHashes: [finalOutput.payload.handoffMaterialArtifactHash as ContentHash]
    });
    return;
  }
  if (
    !sameStringArray(outputHashes, material.outputArtifacts.map((artifact) => artifact.artifactHash)) ||
    !material.contextPackRefs.every((ref) =>
      inputHashes.has(ref.contentHash) &&
      (ref.artifactHashes ?? []).every((hash) => inputHashes.has(hash)) &&
      (ref.sourceEventIds ?? []).every((id) => eventIds.has(id))
    ) ||
    (material.promptArtifactHash !== undefined && !inputHashes.has(material.promptArtifactHash)) ||
    !material.sourceEventIds.every((id) => eventIds.has(id)) ||
    !material.relatedEventIds.every((id) => eventIds.has(id)) ||
    !toolRequestsAreLedgerBoundForMaterial(context, finalOutput.payload.runId, material)
  ) {
    addDiagnostic(context, {
      code: "final-output-mismatch",
      message: "Final-output durable material disagrees with ledger-bound artifacts, events, or tool requests.",
      event: finalOutput,
      artifactHashes: outputHashes
    });
  }
}

function expectedFinalOutputIdempotencyKey(
  runId: string,
  taskId: string | undefined,
  runType: string,
  material: Pick<SpecialistHandoffMaterial, "status">,
  materialHash: ContentHash
): string {
  return `specialist-final-output:${runId}:${taskId ?? "none"}:${runType}:${material.status}:${materialHash}`;
}

async function readFinalOutputMaterialForProjection(
  context: ProjectionContext,
  event: FinalOutputEvent,
  contentHash: ContentHash
): Promise<SpecialistHandoffMaterial | undefined> {
  let bytes: Buffer;
  try {
    bytes = await context.manifestReader.get(contentHash);
  } catch {
    addDiagnostic(context, {
      code: "handoff-material-missing",
      message: "Final-output handoff material is unavailable by its ledger-bound content hash.",
      event,
      artifactHashes: [contentHash]
    });
    return undefined;
  }
  if (!Buffer.isBuffer(bytes) || hashBuffer(bytes) !== contentHash) {
    addDiagnostic(context, {
      code: "handoff-material-hash-mismatch",
      message: "Final-output handoff material bytes do not match the ledger content hash.",
      event,
      artifactHashes: [contentHash, ...(Buffer.isBuffer(bytes) ? [hashBuffer(bytes)] : [])]
    });
    return undefined;
  }
  try {
    const material = parseSpecialistHandoffMaterial(JSON.parse(bytes.toString("utf8")) as unknown);
    if (!canonicalSpecialistHandoffMaterialBytes(material).equals(bytes)) {
      throw new Error("noncanonical");
    }
    return material;
  } catch {
    addDiagnostic(context, {
      code: "handoff-material-mismatch",
      message: "Final-output handoff material bytes are noncanonical or malformed.",
      event,
      artifactHashes: [contentHash]
    });
    return undefined;
  }
}

async function isSupersessionFinalOutput(
  context: ProjectionContext,
  prior: FinalOutputEvent,
  candidate: FinalOutputEvent
): Promise<boolean> {
  if (
    prior.payload.runId !== candidate.payload.runId ||
    prior.payload.stepId !== candidate.payload.stepId ||
    prior.payload.stepSchemaId !== candidate.payload.stepSchemaId ||
    !sameStringArray(prior.payload.inputArtifactHashes ?? [], candidate.payload.inputArtifactHashes ?? []) ||
    !sameStringArray(prior.payload.outputArtifactHashes ?? [], candidate.payload.outputArtifactHashes ?? [])
  ) {
    return false;
  }
  return await finalOutputMaterialIsAnchoredSupersession(context, candidate);
}

async function finalOutputMaterialIsAnchoredSupersession(
  context: ProjectionContext,
  candidate: FinalOutputEvent
): Promise<boolean> {
  const materialHash = candidate.payload.handoffMaterialArtifactHash as ContentHash | undefined;
  if (materialHash === undefined) {
    return false;
  }
  const material = await readCanonicalMaterialByHash(context, materialHash);
  if (
    material === undefined ||
    material.supersedesHandoffId === undefined ||
    material.supersedesEventId === undefined
  ) {
    return false;
  }
  const priorRecorded = context.recorded.find((record) =>
    record.event.id === material.supersedesEventId &&
    record.event.payload.handoffId === material.supersedesHandoffId &&
    record.event.payload.runId === candidate.payload.runId
  );
  if (priorRecorded === undefined) {
    return false;
  }
  const priorMaterial = await readCanonicalMaterialByHash(
    context,
    priorRecorded.event.payload.handoffMaterialArtifactHash as ContentHash
  );
  return priorMaterial !== undefined && sameSupersessionMaterialAnchor(priorMaterial, material);
}

async function readCanonicalMaterialByHash(
  context: ProjectionContext,
  contentHash: ContentHash
): Promise<SpecialistHandoffMaterial | undefined> {
  let bytes: Buffer;
  try {
    bytes = await context.manifestReader.get(contentHash);
  } catch {
    return undefined;
  }
  if (!Buffer.isBuffer(bytes) || hashBuffer(bytes) !== contentHash) {
    return undefined;
  }
  try {
    const material = parseSpecialistHandoffMaterial(JSON.parse(bytes.toString("utf8")) as unknown);
    return canonicalSpecialistHandoffMaterialBytes(material).equals(bytes) ? material : undefined;
  } catch {
    return undefined;
  }
}

function sameSupersessionMaterialAnchor(
  prior: SpecialistHandoffMaterial,
  next: SpecialistHandoffMaterial
): boolean {
  return prior.status === next.status &&
    prior.investigationId === next.investigationId &&
    sameCanonicalValue(prior.contextPackRefs, next.contextPackRefs) &&
    prior.promptArtifactHash === next.promptArtifactHash &&
    sameCanonicalValue(prior.outputArtifacts, next.outputArtifacts) &&
    sameStringArray(prior.outputArtifacts.map((item) => item.artifactHash), next.outputArtifacts.map((item) => item.artifactHash)) &&
    sameStringArray(prior.toolRequestIds, next.toolRequestIds) &&
    sameCanonicalValue(prior.approvalRequirements, next.approvalRequirements) &&
    sameCanonicalValue(prior.failure, next.failure) &&
    sameStringArray(prior.sourceEventIds, next.sourceEventIds) &&
    sameStringArray(prior.relatedEventIds, next.relatedEventIds);
}

function finalOutputScopeKey(context: ProjectionContext, event: FinalOutputEvent): string {
  const runIdentity = context.runIdentities.get(event.payload.runId);
  return [
    event.payload.runId,
    runIdentity?.taskId ?? "",
    runIdentity?.runType ?? ""
  ].join("\u0000");
}

function sameFinalOutput(left: FinalOutputEvent, right: FinalOutputEvent): boolean {
  return left.payload.runId === right.payload.runId &&
    left.payload.stepId === right.payload.stepId &&
    left.payload.stepSchemaId === right.payload.stepSchemaId &&
    left.payload.idempotencyKey === right.payload.idempotencyKey &&
    left.payload.handoffMaterialArtifactHash === right.payload.handoffMaterialArtifactHash &&
    sameStringArray(left.payload.inputArtifactHashes ?? [], right.payload.inputArtifactHashes ?? []) &&
    sameStringArray(left.payload.outputArtifactHashes ?? [], right.payload.outputArtifactHashes ?? []);
}

async function validatePreparedHandoff(context: ProjectionContext, prepared: HandoffPreparedEvent): Promise<boolean> {
  if (!preparedHandoffCausationIsValid(prepared)) {
    addDiagnostic(context, {
      code: "handoff-causation-mismatch",
      message: "Prepared handoff causation must point to final output or the superseded recorded handoff.",
      event: prepared,
      handoffId: prepared.payload.handoffId,
      relatedEventIds: [prepared.payload.finalOutputEventId],
      artifactHashes: [prepared.payload.handoffManifestHash]
    });
    return false;
  }

  const manifestResult = await readAndVerifyManifest(context, prepared);
  if (!manifestResult.ok) {
    return false;
  }

  const bindingError = validatePreparedBindingAgainstManifest(context, prepared, manifestResult.manifest);
  if (bindingError !== undefined) {
    addDiagnostic(context, {
      code: bindingError,
      message: "Prepared handoff compact binding, manifest, DTO, or final-output refs disagree.",
      event: prepared,
      handoffId: prepared.payload.handoffId,
      relatedEventIds: [manifestResult.manifest.finalOutputEventId],
      artifactHashes: [prepared.payload.handoffManifestHash, ...prepared.payload.outputArtifactHashes]
    });
    return false;
  }

  return true;
}

function preparedHandoffCausationIsValid(prepared: HandoffPreparedEvent): boolean {
  const expectedPreparedCausation = prepared.payload.supersedesHandoffId === undefined
    ? prepared.payload.finalOutputEventId
    : prepared.payload.supersedesEventId;
  return expectedPreparedCausation !== undefined &&
    prepared.context.causationId === expectedPreparedCausation;
}

function handoffCausationIsValid(prepared: HandoffPreparedEvent, recorded: HandoffRecordedEvent): boolean {
  return preparedHandoffCausationIsValid(prepared) &&
    recorded.context.causationId === prepared.id;
}

function isAuthorityBoundPayload(
  payload: HandoffPreparedEvent["payload"] | HandoffRecordedEvent["payload"]
): payload is Extract<HandoffPreparedEvent["payload"], { readonly manifestSchemaVersion: "agent-specialist-handoff-manifest.v2" }> {
  return (payload as { readonly manifestSchemaVersion?: unknown }).manifestSchemaVersion === specialistHandoffManifestV2SchemaVersion &&
    typeof (payload as { readonly authorityBinding?: unknown }).authorityBinding === "object" &&
    (payload as { readonly authorityBinding?: unknown }).authorityBinding !== null;
}

function sameRecordedRetry(left: HandoffRecordedEvent, right: HandoffRecordedEvent): boolean {
  return left.context.causationId === right.context.causationId &&
    sameCanonicalValue(left.payload, right.payload);
}

async function readAndVerifyManifest(
  context: ProjectionContext,
  event: HandoffPreparedEvent | HandoffRecordedEvent
): Promise<
  | { readonly ok: true; readonly manifest: SpecialistHandoffManifest | AuthorityBoundSpecialistHandoffManifest; readonly handoff: SpecialistWorkflowHandoffDto; readonly material: SpecialistHandoffMaterial }
  | { readonly ok: false }
> {
  let bytes: Buffer;
  try {
    bytes = await context.manifestReader.get(event.payload.handoffManifestHash as ContentHash);
  } catch {
    addDiagnostic(context, {
      code: "manifest-missing",
      message: "Recorded handoff manifest is not available by its content hash.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [event.payload.handoffManifestHash]
    });
    return { ok: false };
  }

  const rawHash = hashBuffer(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    addDiagnostic(context, {
      code: "manifest-malformed",
      message: "Recorded handoff manifest bytes are not parseable canonical JSON.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [event.payload.handoffManifestHash, rawHash]
    });
    return { ok: false };
  }

  if (rawHash !== event.payload.handoffManifestHash) {
    addDiagnostic(context, {
      code: "manifest-hash-mismatch",
      message: "Recorded handoff manifest bytes do not match the ledger content hash.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [event.payload.handoffManifestHash, rawHash]
    });
    return { ok: false };
  }

  try {
    const authorityBound = isAuthorityBoundPayload(event.payload);
    if (authorityBound && !canonicalSpecialistHandoffJson(parsed).equals(bytes)) {
      throw new Error("authority-bound manifest bytes are not canonical");
    }
    const handoff = authorityBound
      ? verifyAuthorityBoundSpecialistHandoffManifest({
        manifest: parsed,
        handoffManifestHash: event.payload.handoffManifestHash as ContentHash,
        ...("verifiedAt" in event.payload ? { verifiedAt: event.payload.verifiedAt } : {})
      })
      : verifySpecialistHandoffManifest({
        manifest: parsed,
        handoffManifestHash: event.payload.handoffManifestHash as ContentHash,
        ...("verifiedAt" in event.payload ? { verifiedAt: event.payload.verifiedAt } : {})
      });
    const manifest = authorityBound
      ? parseAuthorityBoundSpecialistHandoffManifest(parsed)
      : parsed as SpecialistHandoffManifest;
    const materialResult = await readAndVerifyMaterial(context, event, manifest);
    if (!materialResult.ok) return { ok: false };
    return { ok: true, manifest, handoff, material: materialResult.material };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handoff manifest verification failed.";
    addDiagnostic(context, {
      code: manifestVerificationCode(message),
      message: "Recorded handoff manifest failed DTO verification.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [event.payload.handoffManifestHash]
    });
    return { ok: false };
  }
}

async function readAndVerifyMaterial(
  context: ProjectionContext,
  event: HandoffPreparedEvent | HandoffRecordedEvent,
  manifest: AnySpecialistHandoffManifest
): Promise<{ readonly ok: true; readonly material: SpecialistHandoffMaterial } | { readonly ok: false }> {
  const expectedHash = event.payload.handoffMaterialArtifactHash as ContentHash;
  let bytes: Buffer;
  try {
    bytes = await context.manifestReader.get(expectedHash);
  } catch {
    addDiagnostic(context, {
      code: "handoff-material-missing",
      message: "Ledger-bound handoff material is unavailable by its content hash.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [expectedHash]
    });
    return { ok: false };
  }
  if (hashBuffer(bytes) !== expectedHash) {
    addDiagnostic(context, {
      code: "handoff-material-hash-mismatch",
      message: "Handoff material bytes do not match the ledger content hash.",
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [expectedHash, hashBuffer(bytes)]
    });
    return { ok: false };
  }
  try {
    const material = parseSpecialistHandoffMaterial(JSON.parse(bytes.toString("utf8")) as unknown);
    const mismatch = materialMismatchField(material, manifest);
    if (!canonicalSpecialistHandoffMaterialBytes(material).equals(bytes) || mismatch !== undefined) {
      throw new Error(mismatch ?? "canonical-bytes");
    }
    return { ok: true, material };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    addDiagnostic(context, {
      code: "handoff-material-mismatch",
      message: `Handoff material bytes are noncanonical or disagree with the manifest (${detail}).`,
      event,
      handoffId: event.payload.handoffId,
      artifactHashes: [expectedHash]
    });
    return { ok: false };
  }
}

function materialMismatchField(material: SpecialistHandoffMaterial, manifest: AnySpecialistHandoffManifest): string | undefined {
  const comparisons: Array<readonly [string, unknown, unknown]> = [
    ["status", material.status, manifest.status],
    ["safeSummary", material.safeSummary, manifest.safeSummary],
    ["investigationId", material.investigationId, manifest.investigationId],
    ["contextPackRefs", material.contextPackRefs, manifest.contextPackRefs],
    ["promptArtifactHash", material.promptArtifactHash, manifest.promptArtifactHash],
    ["outputArtifacts", material.outputArtifacts, manifest.outputArtifacts],
    ["toolRequestIds", material.toolRequestIds, manifest.toolRequestIds],
    ["approvalRequirements", material.approvalRequirements, manifest.approvalRequirements],
    ["nextSafeActions", material.nextSafeActions, manifest.nextSafeActions],
    ["failure", material.failure, manifest.failure],
    ["sourceEventIds", material.sourceEventIds, manifest.sourceEventIds],
    ["relatedEventIds", material.relatedEventIds, manifest.relatedEventIds],
    ["supersedesHandoffId", material.supersedesHandoffId, manifest.supersedesHandoffId],
    ["supersedesEventId", material.supersedesEventId, manifest.supersedesEventId]
  ];
  for (const [field, left, right] of comparisons) {
    if (left === undefined && right === undefined) continue;
    if (left === undefined || right === undefined || !sameCanonicalValue(left, right)) return field;
  }
  return undefined;
}

function manifestVerificationCode(message: string): string {
  if (/handoff|DTO|agree/i.test(message)) {
    return "manifest-dto-mismatch";
  }
  if (/hash/i.test(message)) {
    return "manifest-hash-mismatch";
  }
  return "manifest-malformed";
}

function validateBindingAgainstManifest(
  context: ProjectionContext,
  prepared: HandoffPreparedEvent,
  recorded: HandoffRecordedEvent,
  manifest: AnySpecialistHandoffManifest
): string | undefined {
  const preparedError = validatePreparedBindingAgainstManifest(context, prepared, manifest);
  if (preparedError !== undefined) {
    return preparedError;
  }

  if (!handoffIdempotencyKeyIsDeterministic(recorded.payload)) {
    return "idempotency-key-mismatch";
  }

  if (!compactBindingMatchesManifest(recorded.payload, manifest)) {
    return "compact-binding-mismatch";
  }

  if (!payloadFamilyMatchesManifest(prepared.payload, manifest) || !payloadFamilyMatchesManifest(recorded.payload, manifest)) {
    return "authority-binding-mismatch";
  }

  if (manifest.schemaVersion === specialistHandoffManifestV2SchemaVersion &&
    (!isAuthorityBoundPayload(prepared.payload) || !isAuthorityBoundPayload(recorded.payload) ||
      !sameCanonicalValue(prepared.payload.authorityBinding, manifest.authorityBinding) ||
      !sameCanonicalValue(recorded.payload.authorityBinding, manifest.authorityBinding))) {
    return "authority-binding-mismatch";
  }

  return undefined;
}

function validatePreparedBindingAgainstManifest(
  context: ProjectionContext,
  prepared: HandoffPreparedEvent,
  manifest: AnySpecialistHandoffManifest
): string | undefined {
  if (!handoffIdempotencyKeyIsDeterministic(prepared.payload)) {
    return "idempotency-key-mismatch";
  }

  if (!compactBindingMatchesManifest(prepared.payload, manifest)) {
    return "compact-binding-mismatch";
  }

  if (!payloadFamilyMatchesManifest(prepared.payload, manifest)) {
    return "authority-binding-mismatch";
  }

  const runStartedEvents = context.runStartedEvents.get(manifest.runId) ?? [];
  const runStarted = runStartedEvents[0];
  if (runStarted === undefined || runStartedEvents.length !== 1) {
    return "run-identity-mismatch";
  }
  const runIdentity = runIdentityForStartedEvent(runStarted.event);
  if (
    runIdentity.taskId !== manifest.taskId ||
    runIdentity.runType !== manifest.runType ||
    runIdentity.residentAgentId !== manifest.residentAgentId
  ) {
    return "run-identity-mismatch";
  }

  const finalOutput = findFinalOutputForManifest(context, manifest);
  if (finalOutput === undefined) {
    return "final-output-mismatch";
  }

  const finalPayload = finalOutput.event.payload;
  const inputHashes = new Set(finalPayload.inputArtifactHashes ?? []);
  const eventIds = new Set(context.events.map((event) => event.id));
  const expectedStepSchemaId = authoritativeFinalOutputStepSchemaId(runIdentity.runType);
  if (!toolRequestsAreLedgerBound(context, manifest)) {
    return "tool-request-mismatch";
  }
  if (
    finalPayload.stepKind !== "final-output" ||
    expectedStepSchemaId === undefined ||
    finalPayload.stepSchemaId !== expectedStepSchemaId ||
    finalPayload.idempotencyKey === undefined ||
    finalPayload.handoffMaterialArtifactHash !== manifest.handoffMaterialArtifactHash ||
    finalPayload.stepId !== manifest.finalOutputStepId ||
    !sameStringArray(finalPayload.outputArtifactHashes ?? [], outputArtifactHashes(manifest)) ||
    !manifest.contextPackRefs.every((ref) =>
      inputHashes.has(ref.contentHash) &&
      (ref.artifactHashes ?? []).every((hash) => inputHashes.has(hash)) &&
      (ref.sourceEventIds ?? []).every((id) => eventIds.has(id))
    ) ||
    (manifest.promptArtifactHash !== undefined && !inputHashes.has(manifest.promptArtifactHash)) ||
    !manifest.sourceEventIds.every((id) => eventIds.has(id)) ||
    !manifest.relatedEventIds.every((id) => eventIds.has(id))
  ) {
    return "final-output-mismatch";
  }

  return undefined;
}

function toolRequestsAreLedgerBound(
  context: ProjectionContext,
  manifest: AnySpecialistHandoffManifest
): boolean {
  return toolRequestsAreLedgerBoundForMaterial(context, manifest.runId, manifest);
}

function toolRequestsAreLedgerBoundForMaterial(
  context: ProjectionContext,
  runId: string,
  material: Pick<SpecialistHandoffMaterial, "toolRequestIds" | "approvalRequirements" | "nextSafeActions" | "failure">
): boolean {
  const topLevelToolRequestIds = new Set(material.toolRequestIds);
  if (!nestedHandoffToolRequestIds(material).every((toolRequestId) => topLevelToolRequestIds.has(toolRequestId))) {
    return false;
  }
  return material.toolRequestIds.every((toolRequestId) => context.events.some((event) =>
    event.type === "agent.tool.requested" &&
    event.payload.toolRequestId === toolRequestId &&
    event.payload.runId === runId
  ));
}

function nestedHandoffToolRequestIds(
  handoff: Pick<AnySpecialistHandoffManifest, "approvalRequirements" | "nextSafeActions" | "failure">
): readonly string[] {
  const requestIds: string[] = [];
  for (const requirement of handoff.approvalRequirements) {
    if (requirement.toolRequestId !== undefined) requestIds.push(requirement.toolRequestId);
  }
  for (const action of handoff.nextSafeActions) {
    if (action.toolRequestId !== undefined) requestIds.push(action.toolRequestId);
  }
  if (handoff.failure?.toolRequestId !== undefined) {
    requestIds.push(handoff.failure.toolRequestId);
  }
  return requestIds;
}

function expectedHandoffIdempotencyKey(payload: HandoffPreparedEvent["payload"] | HandoffRecordedEvent["payload"]): string {
  return `specialist-handoff:${payload.runId}:${payload.taskId ?? "none"}:${payload.runType}:${payload.status}:${payload.handoffManifestHash}`;
}

function handoffIdempotencyKeyIsDeterministic(
  payload: HandoffPreparedEvent["payload"] | HandoffRecordedEvent["payload"]
): boolean {
  return payload.idempotencyKey === expectedHandoffIdempotencyKey(payload);
}

function findFinalOutputForManifest(
  context: ProjectionContext,
  manifest: AnySpecialistHandoffManifest
): IndexedEvent<FinalOutputEvent> | undefined {
  return context.finalOutputs.find((item) =>
    item.event.id === manifest.finalOutputEventId &&
    item.event.payload.runId === manifest.runId
  );
}

function compactBindingsAgree(
  prepared: HandoffPreparedEvent["payload"],
  recorded: HandoffRecordedEvent["payload"]
): boolean {
  const { preparedEventId: _preparedEventId, verifiedAt: _verifiedAt, ...recordedCompact } = recorded;
  return sameCanonicalValue(prepared, recordedCompact);
}

function compactBindingMatchesManifest(
  payload: HandoffPreparedEvent["payload"] | HandoffRecordedEvent["payload"],
  manifest: AnySpecialistHandoffManifest
): boolean {
  return payload.handoffId === manifest.handoffId &&
    payload.handoffRevision === manifest.handoffRevision &&
    payload.handoffDtoHash === manifest.handoffDtoHash &&
    payload.handoffMaterialArtifactHash === manifest.handoffMaterialArtifactHash &&
    payload.runId === manifest.runId &&
    payload.taskId === manifest.taskId &&
    payload.runType === manifest.runType &&
    payload.residentAgentId === manifest.residentAgentId &&
    payload.status === manifest.status &&
    payload.safeSummary === manifest.safeSummary &&
    payload.finalOutputStepId === manifest.finalOutputStepId &&
    payload.finalOutputEventId === manifest.finalOutputEventId &&
    sameStringArray(payload.contextPackHashes, manifest.contextPackRefs.map((ref) => ref.contentHash)) &&
    payload.promptArtifactHash === manifest.promptArtifactHash &&
    sameStringArray(payload.outputArtifactHashes, outputArtifactHashes(manifest)) &&
    sameStringArray(payload.toolRequestIds, manifest.toolRequestIds) &&
    sameStringArray(payload.sourceEventIds, manifest.sourceEventIds) &&
    sameStringArray(payload.relatedEventIds, manifest.relatedEventIds) &&
    payload.supersedesHandoffId === manifest.supersedesHandoffId &&
    payload.supersedesEventId === manifest.supersedesEventId;
}

function payloadFamilyMatchesManifest(
  payload: HandoffPreparedEvent["payload"] | HandoffRecordedEvent["payload"],
  manifest: AnySpecialistHandoffManifest
): boolean {
  return manifest.schemaVersion === specialistHandoffManifestV2SchemaVersion
    ? isAuthorityBoundPayload(payload)
    : !isAuthorityBoundPayload(payload);
}

function validateVerifiedHandoffs(context: ProjectionContext, records: readonly VerifiedHandoffRecord[]): void {
  const byHandoffId = new Map<string, VerifiedHandoffRecord>();

  for (const record of records) {
    const previous = byHandoffId.get(record.handoff.handoffId);
    if (previous !== undefined) {
      if (previous.manifestHash !== record.manifestHash || previous.handoff.handoffRevision !== record.handoff.handoffRevision) {
        addDiagnostic(context, {
          code: "same-revision-manifest-change",
          message: "A handoff reused the same durable identity with changed presentation bytes.",
          event: record.recorded,
          handoffId: record.handoff.handoffId,
          relatedEventIds: [previous.recorded.id],
          artifactHashes: [previous.manifestHash, record.manifestHash]
        });
      }
      continue;
    }

    byHandoffId.set(record.handoff.handoffId, record);
  }

  for (const record of records) {
    if (record.handoff.handoffRevision > 1 && record.manifest.supersedesHandoffId === undefined) {
      addDiagnostic(context, {
        code: "supersession-violation",
        message: "Higher-revision handoffs must explicitly supersede a prior recorded handoff.",
        event: record.recorded,
        handoffId: record.handoff.handoffId,
        relatedEventIds: [record.recorded.id],
        artifactHashes: [record.manifestHash]
      });
      continue;
    }

    if (record.manifest.supersedesHandoffId === undefined) {
      continue;
    }

    const prior = byHandoffId.get(record.manifest.supersedesHandoffId);
    if (
      prior === undefined ||
      prior.recordedIndex >= record.recordedIndex ||
      record.manifest.supersedesEventId !== prior.recorded.id ||
      record.handoff.handoffId === prior.handoff.handoffId ||
      record.handoff.handoffRevision !== prior.handoff.handoffRevision + 1 ||
      !sameSupersessionAnchor(prior, record)
    ) {
      addDiagnostic(context, {
        code: "supersession-violation",
        message: "Handoff supersession is not causal, same-run, same-output, and revision-incremented.",
        event: record.recorded,
        handoffId: record.handoff.handoffId,
        relatedEventIds: [record.manifest.supersedesEventId ?? record.recorded.id],
        artifactHashes: [record.manifestHash]
      });
    }
  }
}

function sameSupersessionAnchor(prior: VerifiedHandoffRecord, next: VerifiedHandoffRecord): boolean {
  return prior.handoff.runId === next.handoff.runId &&
    prior.handoff.taskId === next.handoff.taskId &&
    prior.handoff.runType === next.handoff.runType &&
    prior.handoff.residentAgentId === next.handoff.residentAgentId &&
    prior.handoff.status === next.handoff.status &&
    prior.manifest.finalOutputStepId === next.manifest.finalOutputStepId &&
    prior.manifest.promptArtifactHash === next.manifest.promptArtifactHash &&
    sameCanonicalValue(prior.manifest.contextPackRefs, next.manifest.contextPackRefs) &&
    sameCanonicalValue(prior.manifest.outputArtifacts, next.manifest.outputArtifacts) &&
    sameStringArray(outputArtifactHashes(prior.manifest), outputArtifactHashes(next.manifest)) &&
    sameStringArray(prior.handoff.toolRequestIds, next.handoff.toolRequestIds) &&
    sameCanonicalValue(prior.manifest.approvalRequirements, next.manifest.approvalRequirements) &&
    sameCanonicalValue(prior.manifest.failure, next.manifest.failure) &&
    sameStringArray(prior.manifest.sourceEventIds, next.manifest.sourceEventIds) &&
    sameStringArray(prior.manifest.relatedEventIds, next.manifest.relatedEventIds);
}

function validateTerminalOrder(context: ProjectionContext, verified: readonly VerifiedHandoffRecord[]): void {
  for (const terminal of context.terminals) {
    const sameRunRecords = verified.filter((record) => record.handoff.runId === terminal.event.payload.runId);
    const sameRunFinalOutputs = context.finalOutputs.filter((item) => item.event.payload.runId === terminal.event.payload.runId);

    if (terminal.event.type === "agent.specialist-run.failed" && sameRunRecords.length === 0 && sameRunFinalOutputs.length === 0) {
      continue;
    }

    const beforeTerminal = sameRunRecords.filter((record) => record.recordedIndex < terminal.index);
    if (beforeTerminal.length === 0) {
      addDiagnostic(context, {
        code: "terminal-before-handoff",
        message: "Terminal run state appears before a verified recorded handoff.",
        event: terminal.event,
        relatedEventIds: sameRunRecords.map((record) => record.recorded.id),
        artifactHashes: terminal.event.type === "agent.specialist-run.completed" ? terminal.event.payload.outputArtifactHashes : []
      });
      continue;
    }

    const selected = beforeTerminal.at(-1);
    if (selected === undefined) {
      continue;
    }

    if (terminal.event.context.causationId !== selected.recorded.id) {
      addDiagnostic(context, {
        code: "terminal-causation-mismatch",
        message: "Terminal run state must be caused by the verified recorded handoff.",
        event: terminal.event,
        handoffId: selected.handoff.handoffId,
        relatedEventIds: [selected.recorded.id],
        artifactHashes: terminal.event.type === "agent.specialist-run.completed" ? terminal.event.payload.outputArtifactHashes : []
      });
      continue;
    }

    if (!terminalMatchesHandoffStatus(terminal.event, selected.handoff.status)) {
      addDiagnostic(context, {
        code: "terminal-status-mismatch",
        message: "Terminal run state must agree with the verified handoff status.",
        event: terminal.event,
        handoffId: selected.handoff.handoffId,
        relatedEventIds: [selected.recorded.id],
        artifactHashes: terminal.event.type === "agent.specialist-run.completed" ? terminal.event.payload.outputArtifactHashes : []
      });
      continue;
    }

    if (terminal.event.type === "agent.specialist-run.completed" &&
      !sameStringArray(terminal.event.payload.outputArtifactHashes, outputArtifactHashes(selected.manifest))) {
      addDiagnostic(context, {
        code: "terminal-output-mismatch",
        message: "Completed run output hashes disagree with the verified handoff.",
        event: terminal.event,
        handoffId: selected.handoff.handoffId,
        relatedEventIds: [selected.recorded.id],
        artifactHashes: terminal.event.payload.outputArtifactHashes
      });
    }
  }
}

function terminalMatchesHandoffStatus(terminal: RunTerminalEvent, status: HandoffStatus): boolean {
  return terminal.type === "agent.specialist-run.failed"
    ? status === "failed"
    : status !== "failed";
}

function completeAuthorityBoundReadback(
  context: ProjectionContext,
  record: VerifiedHandoffRecord
): SpecialistHandoffReadback | undefined {
  if (
    record.manifest.schemaVersion !== specialistHandoffManifestV2SchemaVersion ||
    record.handoff.taskId === undefined ||
    !isAuthorityBoundPayload(record.prepared.payload) ||
    !isAuthorityBoundPayload(record.recorded.payload) ||
    !sameCanonicalValue(record.prepared.payload.authorityBinding, record.manifest.authorityBinding) ||
    !sameCanonicalValue(record.recorded.payload.authorityBinding, record.manifest.authorityBinding)
  ) {
    return undefined;
  }
  const terminals = context.terminals.filter((item) =>
    item.index > record.recordedIndex &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.context.causationId === record.recorded.id &&
    terminalMatchesHandoffStatus(item.event, record.handoff.status) &&
    (item.event.type !== "agent.specialist-run.completed" ||
      sameStringArray(item.event.payload.outputArtifactHashes, outputArtifactHashes(record.manifest)))
  );
  if (terminals.length !== 1) return undefined;
  const terminal = terminals[0]!;
  const orchestrationCompletions = context.orchestrationCompletions.filter((item) =>
    item.index > terminal.index &&
    item.event.payload.taskId === record.handoff.taskId &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.payload.runType === record.handoff.runType &&
    item.event.context.causationId === terminal.event.id &&
    item.event.payload.specialistRunCompletedEventId === terminal.event.id &&
    item.event.payload.finalOutputStepEventId === record.manifest.finalOutputEventId &&
    item.event.payload.handoffPreparedEventId === record.prepared.id &&
    item.event.payload.handoffRecordedEventId === record.recorded.id &&
    item.event.payload.handoffReadback.handoffId === record.handoff.handoffId &&
    item.event.payload.handoffReadback.handoffManifestHash === record.manifestHash &&
    item.event.payload.handoffReadback.handoffRecordedEventId === record.recorded.id &&
    item.event.payload.handoffReadback.verifiedAt === record.recorded.payload.verifiedAt
  );
  if (orchestrationCompletions.length !== 1) return undefined;
  const orchestration = orchestrationCompletions[0]!;
  const expectedStatus = terminal.event.type === "agent.specialist-run.completed" ? "completed" : "failed";
  const taskStatuses = context.taskStatuses.filter((item) =>
    item.index > orchestration.index &&
    item.event.payload.taskId === record.handoff.taskId &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.payload.status === expectedStatus &&
    item.event.context.causationId === orchestration.event.id
  );
  if (taskStatuses.length !== 1) return undefined;
  const taskStatus = taskStatuses[0]!;
  return Object.freeze({
    outcome: "verified",
    handoffId: record.handoff.handoffId,
    taskId: record.handoff.taskId,
    runId: record.handoff.runId,
    manifestSchemaVersion: specialistHandoffManifestV2SchemaVersion,
    manifestHash: record.manifestHash,
    finalOutputStepId: record.manifest.finalOutputStepId,
    finalOutputEventId: record.manifest.finalOutputEventId,
    preparedEventId: record.prepared.id,
    recordedEventId: record.recorded.id,
    terminalRunEventId: terminal.event.id,
    taskStatusEventId: taskStatus.event.id,
    authorityBinding: Object.freeze({ ...record.manifest.authorityBinding }),
    diagnostics: Object.freeze([])
  });
}

function isTaskCompleted(
  context: ProjectionContext,
  selected: VerifiedHandoffRecord,
  verified: readonly VerifiedHandoffRecord[]
): boolean {
  if (selected.handoff.status !== "ready-for-review" || selected.handoff.taskId === undefined) {
    return false;
  }

  if (hasCompletedTaskChain(context, selected)) {
    return true;
  }

  return verified.some((record) =>
    record.recordedIndex < selected.recordedIndex &&
    sameCompletionAnchor(record, selected) &&
    hasCompletedTaskChain(context, record)
  );
}

function hasCompletedTaskChain(context: ProjectionContext, record: VerifiedHandoffRecord): boolean {
  if (record.handoff.status !== "ready-for-review" || record.handoff.taskId === undefined) {
    return false;
  }

  const terminals = context.terminals.filter((item) =>
    item.index > record.recordedIndex &&
    item.event.type === "agent.specialist-run.completed" &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.context.causationId === record.recorded.id &&
    sameStringArray(item.event.payload.outputArtifactHashes, outputArtifactHashes(record.manifest))
  );
  if (terminals.length !== 1) {
    return false;
  }
  const terminal = terminals[0]!;
  if (record.manifest.schemaVersion !== specialistHandoffManifestV2SchemaVersion) {
    return context.taskStatuses.some((item) =>
      item.index > terminal.index &&
      item.event.payload.taskId === record.handoff.taskId &&
      item.event.payload.runId === record.handoff.runId &&
      item.event.payload.status === "completed" &&
      item.event.context.causationId === terminal.event.id
    );
  }

  const orchestrationCompletions = context.orchestrationCompletions.filter((item) =>
    item.index > terminal.index &&
    item.event.payload.taskId === record.handoff.taskId &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.payload.runType === record.handoff.runType &&
    item.event.context.causationId === terminal.event.id &&
    item.event.payload.specialistRunCompletedEventId === terminal.event.id &&
    item.event.payload.finalOutputStepEventId === record.manifest.finalOutputEventId &&
    item.event.payload.handoffPreparedEventId === record.prepared.id &&
    item.event.payload.handoffRecordedEventId === record.recorded.id &&
    item.event.payload.handoffReadback.handoffId === record.handoff.handoffId &&
    item.event.payload.handoffReadback.handoffManifestHash === record.manifestHash &&
    item.event.payload.handoffReadback.handoffRecordedEventId === record.recorded.id &&
    item.event.payload.handoffReadback.verifiedAt === record.recorded.payload.verifiedAt
  );
  if (orchestrationCompletions.length !== 1) return false;
  const orchestration = orchestrationCompletions[0]!;
  return context.taskStatuses.filter((item) =>
    item.index > orchestration.index &&
    item.event.payload.taskId === record.handoff.taskId &&
    item.event.payload.runId === record.handoff.runId &&
    item.event.payload.status === "completed" &&
    item.event.context.causationId === orchestration.event.id
  ).length === 1;
}

function sameCompletionAnchor(prior: VerifiedHandoffRecord, next: VerifiedHandoffRecord): boolean {
  return prior.handoff.runId === next.handoff.runId &&
    prior.handoff.taskId === next.handoff.taskId &&
    prior.handoff.runType === next.handoff.runType &&
    prior.handoff.residentAgentId === next.handoff.residentAgentId &&
    prior.handoff.status === next.handoff.status &&
    prior.manifest.finalOutputStepId === next.manifest.finalOutputStepId &&
    prior.manifest.promptArtifactHash === next.manifest.promptArtifactHash &&
    sameCanonicalValue(prior.manifest.contextPackRefs, next.manifest.contextPackRefs) &&
    sameCanonicalValue(prior.manifest.outputArtifacts, next.manifest.outputArtifacts) &&
    sameStringArray(outputArtifactHashes(prior.manifest), outputArtifactHashes(next.manifest)) &&
    sameStringArray(prior.handoff.toolRequestIds, next.handoff.toolRequestIds) &&
    sameCanonicalValue(prior.manifest.approvalRequirements, next.manifest.approvalRequirements) &&
    sameCanonicalValue(prior.manifest.failure, next.manifest.failure) &&
    sameStringArray(prior.manifest.sourceEventIds, next.manifest.sourceEventIds) &&
    sameStringArray(prior.manifest.relatedEventIds, next.manifest.relatedEventIds);
}

export function authoritativeFinalOutputStepSchemaId(runType: string): string | undefined {
  if (runType === "ontology-bootstrap") {
    return "ontology-bootstrap-handoff.v1";
  }
  try {
    const typedRunType = runType as Exclude<AgentSpecialistRunType, "ontology-bootstrap">;
    const descriptor = specialistWorkflowDescriptorFor(typedRunType);
    const registration = productionSpecialistPromptRegistrationFor(typedRunType);
    if (descriptor.promptTemplate.handoffSchemaId !== registration.handoffSchemaId) {
      return undefined;
    }
    return registration.handoffSchemaId;
  } catch {
    return undefined;
  }
}

function outputPersistedEntry(finalOutput: IndexedEvent<FinalOutputEvent>): SpecialistHandoffProjectionEntry {
  return freezeEntry({
    state: "output-persisted",
    runId: finalOutput.event.payload.runId,
    finalOutputEventId: finalOutput.event.id,
    eventIds: [finalOutput.event.id],
    artifactHashes: finalOutput.event.payload.outputArtifactHashes ?? []
  });
}

function handoffPendingEntry(prepared: HandoffPreparedEvent): SpecialistHandoffProjectionEntry {
  return freezeEntry({
    state: "handoff-pending",
    runId: prepared.payload.runId,
    ...(prepared.payload.taskId === undefined ? {} : { taskId: prepared.payload.taskId }),
    handoffId: prepared.payload.handoffId,
    finalOutputEventId: prepared.payload.finalOutputEventId,
    preparedEventId: prepared.id,
    eventIds: [prepared.id],
    artifactHashes: [prepared.payload.handoffManifestHash, ...prepared.payload.outputArtifactHashes]
  });
}

function recordedEntry(
  record: VerifiedHandoffRecord,
  supersededByHandoffId: string | undefined
): SpecialistHandoffProjectionEntry {
  return freezeEntry({
    state: "handoff-recorded",
    runId: record.handoff.runId,
    ...(record.handoff.taskId === undefined ? {} : { taskId: record.handoff.taskId }),
    handoffId: record.handoff.handoffId,
    finalOutputEventId: record.manifest.finalOutputEventId,
    preparedEventId: record.prepared.id,
    recordedEventId: record.recorded.id,
    ...(supersededByHandoffId === undefined ? {} : { supersededByHandoffId }),
    eventIds: [record.prepared.id, record.recorded.id],
    artifactHashes: [record.manifestHash, ...outputArtifactHashes(record.manifest)]
  });
}

function legacyUnboundEntry(
  record: VerifiedHandoffRecord,
  supersededByHandoffId: string | undefined
): SpecialistHandoffProjectionEntry {
  return freezeEntry({
    state: "legacy-unbound",
    runId: record.handoff.runId,
    ...(record.handoff.taskId === undefined ? {} : { taskId: record.handoff.taskId }),
    handoffId: record.handoff.handoffId,
    finalOutputEventId: record.manifest.finalOutputEventId,
    preparedEventId: record.prepared.id,
    recordedEventId: record.recorded.id,
    ...(supersededByHandoffId === undefined ? {} : { supersededByHandoffId }),
    eventIds: [record.prepared.id, record.recorded.id],
    artifactHashes: [record.manifestHash, ...outputArtifactHashes(record.manifest)]
  });
}

function taskCompletedEntry(record: VerifiedHandoffRecord): SpecialistHandoffProjectionEntry {
  return freezeEntry({
    state: "task-completed",
    runId: record.handoff.runId,
    ...(record.handoff.taskId === undefined ? {} : { taskId: record.handoff.taskId }),
    handoffId: record.handoff.handoffId,
    finalOutputEventId: record.manifest.finalOutputEventId,
    preparedEventId: record.prepared.id,
    recordedEventId: record.recorded.id,
    eventIds: [record.prepared.id, record.recorded.id],
    artifactHashes: [record.manifestHash, ...outputArtifactHashes(record.manifest)]
  });
}

function supersededHandoffIds(records: readonly VerifiedHandoffRecord[]): ReadonlyMap<string, string> {
  const superseded = new Map<string, string>();
  const ids = new Set(records.map((record) => record.handoff.handoffId));
  for (const record of records) {
    const supersedes = record.manifest.supersedesHandoffId;
    if (supersedes !== undefined && ids.has(supersedes)) {
      superseded.set(supersedes, record.handoff.handoffId);
    }
  }
  return superseded;
}

function addDiagnostic(
  context: ProjectionContext,
  input: {
    readonly code: string;
    readonly message: string;
    readonly event: KnowledgeEvent;
    readonly handoffId?: string;
    readonly relatedEventIds?: readonly string[];
    readonly artifactHashes?: readonly string[];
  }
): void {
  context.diagnostics.push(Object.freeze({
    severity: "error",
    code: input.code,
    message: input.message,
    ...(runIdForEvent(input.event) === undefined ? {} : { runId: runIdForEvent(input.event)! }),
    ...(taskIdForEvent(input.event, context.runIdentities) === undefined ? {} : { taskId: taskIdForEvent(input.event, context.runIdentities)! }),
    ...(input.handoffId === undefined ? {} : { handoffId: input.handoffId }),
    relatedEventIds: Object.freeze([input.event.id, ...(input.relatedEventIds ?? [])]),
    artifactHashes: Object.freeze([...(input.artifactHashes ?? [])]),
    allowedRepairActions: Object.freeze(["resume handoff recording from ledger state"])
  }));
}

function outputArtifactHashes(manifest: AnySpecialistHandoffManifest): readonly ContentHash[] {
  return manifest.outputArtifacts.map((artifact) => artifact.artifactHash);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return canonicalSpecialistHandoffJson(left).equals(canonicalSpecialistHandoffJson(right));
}

function deeplyFrozenPlainOwnDataCopy<T>(value: T): T {
  return copyPlainOwnDataValue(value) as T;
}

function copyPlainOwnDataValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value !== "object" || types.isProxy(value)) {
    return rejectNonPlainReadback();
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return rejectNonPlainReadback();
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return rejectNonPlainReadback();
    }
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      lengthDescriptor.enumerable ||
      lengthDescriptor.get !== undefined ||
      lengthDescriptor.set !== undefined ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      Object.keys(descriptors).length !== lengthDescriptor.value + 1
    ) {
      return rejectNonPlainReadback();
    }
    const copy: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return rejectNonPlainReadback();
      }
      copy.push(copyPlainOwnDataValue(descriptor.value));
    }
    return Object.freeze(copy);
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return rejectNonPlainReadback();
  }
  const copy: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return rejectNonPlainReadback();
    }
    Object.defineProperty(copy, key, {
      value: copyPlainOwnDataValue(descriptor.value),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return Object.freeze(copy);
}

function rejectNonPlainReadback(): never {
  throw new Error("specialist handoff readback must be plain own data");
}

function hashBuffer(bytes: Buffer): ContentHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function freezeProjection(projection: SpecialistHandoffProjection): SpecialistHandoffProjection {
  return Object.freeze({
    state: projection.state,
    handoffs: Object.freeze([...projection.handoffs]),
    ...(projection.selectedHandoff === undefined ? {} : { selectedHandoff: projection.selectedHandoff }),
    ...(projection.selectedReadback === undefined ? {} : { selectedReadback: freezeReadback(projection.selectedReadback) }),
    history: Object.freeze(projection.history.map((entry) => freezeEntry(entry))),
    diagnostics: Object.freeze(projection.diagnostics.map((diagnostic) => freezeDiagnostic(diagnostic)))
  });
}

function freezeReadback(readback: SpecialistHandoffReadback): SpecialistHandoffReadback {
  return Object.freeze({
    ...readback,
    authorityBinding: Object.freeze({ ...readback.authorityBinding }),
    diagnostics: Object.freeze(readback.diagnostics.map((diagnostic) => Object.freeze({
      ...diagnostic,
      eventIds: Object.freeze([...diagnostic.eventIds]),
      artifactHashes: Object.freeze([...diagnostic.artifactHashes])
    })))
  });
}

function freezeEntry(entry: SpecialistHandoffProjectionEntry): SpecialistHandoffProjectionEntry {
  return Object.freeze({
    state: entry.state,
    runId: entry.runId,
    ...(entry.taskId === undefined ? {} : { taskId: entry.taskId }),
    ...(entry.handoffId === undefined ? {} : { handoffId: entry.handoffId }),
    ...(entry.finalOutputEventId === undefined ? {} : { finalOutputEventId: entry.finalOutputEventId }),
    ...(entry.preparedEventId === undefined ? {} : { preparedEventId: entry.preparedEventId }),
    ...(entry.recordedEventId === undefined ? {} : { recordedEventId: entry.recordedEventId }),
    ...(entry.supersededByHandoffId === undefined ? {} : { supersededByHandoffId: entry.supersededByHandoffId }),
    eventIds: Object.freeze([...entry.eventIds]),
    artifactHashes: Object.freeze([...entry.artifactHashes])
  });
}

function freezeDiagnostic(diagnostic: SpecialistHandoffProjectionDiagnostic): SpecialistHandoffProjectionDiagnostic {
  return Object.freeze({
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.runId === undefined ? {} : { runId: diagnostic.runId }),
    ...(diagnostic.taskId === undefined ? {} : { taskId: diagnostic.taskId }),
    ...(diagnostic.handoffId === undefined ? {} : { handoffId: diagnostic.handoffId }),
    relatedEventIds: Object.freeze([...diagnostic.relatedEventIds]),
    artifactHashes: Object.freeze([...diagnostic.artifactHashes]),
    allowedRepairActions: Object.freeze([...diagnostic.allowedRepairActions])
  });
}
