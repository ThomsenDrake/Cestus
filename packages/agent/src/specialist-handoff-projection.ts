import { createHash } from "node:crypto";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  verifySpecialistHandoffManifest,
  type SpecialistHandoffManifest
} from "./specialist-handoff-manifest.js";
import type { SpecialistWorkflowHandoffDto } from "./specialist-handoffs.js";
import type { SpecialistHandoffProjectionState } from "./projection-types.js";

type HandoffStatus = SpecialistWorkflowHandoffDto["status"];
type ContentHash = `sha256:${string}`;
type HandoffPreparedEvent = KnowledgeEventOf<"agent.specialist-handoff.prepared">;
type HandoffRecordedEvent = KnowledgeEventOf<"agent.specialist-handoff.recorded">;
type FinalOutputEvent = KnowledgeEventOf<"agent.specialist-run.step.recorded">;
type RunStartedEvent = KnowledgeEventOf<"agent.specialist-run.started">;
type RunTerminalEvent =
  | KnowledgeEventOf<"agent.specialist-run.completed">
  | KnowledgeEventOf<"agent.specialist-run.failed">;
type TaskStatusEvent = KnowledgeEventOf<"agent.task.status.changed">;

export type { SpecialistHandoffProjectionState };

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
  readonly state: Exclude<SpecialistHandoffProjectionState, "no-output" | "inconsistent">;
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
  readonly state: SpecialistHandoffProjectionState;
  readonly handoffs: readonly SpecialistWorkflowHandoffDto[];
  readonly selectedHandoff?: SpecialistWorkflowHandoffDto;
  readonly history: readonly SpecialistHandoffProjectionEntry[];
  readonly diagnostics: readonly SpecialistHandoffProjectionDiagnostic[];
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
  readonly manifest: SpecialistHandoffManifest;
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
  readonly finalOutputs: readonly IndexedEvent<FinalOutputEvent>[];
  readonly prepared: readonly IndexedEvent<HandoffPreparedEvent>[];
  readonly recorded: readonly IndexedEvent<HandoffRecordedEvent>[];
  readonly terminals: readonly IndexedEvent<RunTerminalEvent>[];
  readonly taskStatuses: readonly IndexedEvent<TaskStatusEvent>[];
  readonly diagnostics: SpecialistHandoffProjectionDiagnostic[];
}

interface IndexedEvent<Event extends KnowledgeEvent> {
  readonly event: Event;
  readonly index: number;
}

export async function buildSpecialistHandoffProjection(
  input: BuildSpecialistHandoffProjectionInput
): Promise<SpecialistHandoffProjection> {
  const context = collectContext(input);
  const history: SpecialistHandoffProjectionEntry[] = [];

  const finalOutputs = selectFinalOutputs(context);
  for (const finalOutput of finalOutputs) {
    history.push(outputPersistedEntry(finalOutput));
  }

  const preparedById = new Map<string, PreparedRecord>();
  for (const prepared of context.prepared) {
    const prior = preparedById.get(prepared.event.id);
    if (prior === undefined) {
      preparedById.set(prepared.event.id, { event: prepared.event, index: prepared.index });
      history.push(handoffPendingEntry(prepared.event));
      continue;
    }

    if (!sameCanonicalValue(prior.event.payload, prepared.event.payload)) {
      addDiagnostic(context, {
        code: "conflicting-prepared",
        message: "Conflicting prepared handoff events share an event id.",
        event: prepared.event,
        artifactHashes: [prepared.event.payload.handoffManifestHash]
      });
    }
  }

  const verified: VerifiedHandoffRecord[] = [];
  for (const recorded of context.recorded) {
    const prepared = preparedById.get(recorded.event.payload.preparedEventId);
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

  const handoffs = Object.freeze(verified.map((record) => record.handoff));
  const supersededIds = supersededHandoffIds(verified);
  const selectedRecord = [...verified].reverse().find((record) => !supersededIds.has(record.handoff.handoffId));

  for (const record of verified) {
    history.push(recordedEntry(record, supersededIds.get(record.handoff.handoffId)));
  }

  if (context.diagnostics.length > 0) {
    return freezeProjection({
      state: "inconsistent",
      handoffs,
      history,
      diagnostics: context.diagnostics
    });
  }

  if (selectedRecord !== undefined && isTaskCompleted(context, selectedRecord)) {
    history.push(taskCompletedEntry(selectedRecord));
    return freezeProjection({
      state: "task-completed",
      handoffs,
      selectedHandoff: selectedRecord.handoff,
      history,
      diagnostics: []
    });
  }

  if (selectedRecord !== undefined) {
    return freezeProjection({
      state: "handoff-recorded",
      handoffs,
      selectedHandoff: selectedRecord.handoff,
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
  for (const event of input.events) {
    if (event.type === "agent.specialist-run.started") {
      runIdentities.set(event.payload.runId, {
        runId: event.payload.runId,
        ...(event.payload.taskId === undefined ? {} : { taskId: event.payload.taskId }),
        runType: event.payload.runType,
        residentAgentId: event.payload.residentAgentId
      });
    }
  }

  const finalOutputs: IndexedEvent<FinalOutputEvent>[] = [];
  const prepared: IndexedEvent<HandoffPreparedEvent>[] = [];
  const recorded: IndexedEvent<HandoffRecordedEvent>[] = [];
  const terminals: IndexedEvent<RunTerminalEvent>[] = [];
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
    finalOutputs,
    prepared,
    recorded,
    terminals,
    taskStatuses,
    diagnostics: []
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
    event.payload.outputArtifactHashes !== undefined;
}

function selectFinalOutputs(context: ProjectionContext): readonly IndexedEvent<FinalOutputEvent>[] {
  if (context.finalOutputs.length === 0) {
    return [];
  }

  const firstByScope = new Map<string, IndexedEvent<FinalOutputEvent>>();
  for (const finalOutput of context.finalOutputs) {
    const scope = finalOutputScopeKey(context, finalOutput.event);
    const prior = firstByScope.get(scope);
    if (prior === undefined) {
      firstByScope.set(scope, finalOutput);
      continue;
    }

    if (!sameFinalOutput(prior.event, finalOutput.event)) {
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

function finalOutputScopeKey(context: ProjectionContext, event: FinalOutputEvent): string {
  const runIdentity = context.runIdentities.get(event.payload.runId);
  return [
    event.payload.runId,
    runIdentity?.taskId ?? "",
    runIdentity?.runType ?? "",
    event.payload.stepId
  ].join("\u0000");
}

function sameFinalOutput(left: FinalOutputEvent, right: FinalOutputEvent): boolean {
  return left.payload.runId === right.payload.runId &&
    left.payload.stepId === right.payload.stepId &&
    left.payload.stepSchemaId === right.payload.stepSchemaId &&
    left.payload.idempotencyKey === right.payload.idempotencyKey &&
    sameStringArray(left.payload.outputArtifactHashes ?? [], right.payload.outputArtifactHashes ?? []);
}

function handoffCausationIsValid(prepared: HandoffPreparedEvent, recorded: HandoffRecordedEvent): boolean {
  const expectedPreparedCausation = prepared.payload.supersedesHandoffId === undefined
    ? prepared.payload.finalOutputEventId
    : prepared.payload.supersedesEventId;
  return expectedPreparedCausation !== undefined &&
    prepared.context.causationId === expectedPreparedCausation &&
    recorded.context.causationId === prepared.id;
}

async function readAndVerifyManifest(
  context: ProjectionContext,
  recorded: HandoffRecordedEvent
): Promise<
  | { readonly ok: true; readonly manifest: SpecialistHandoffManifest; readonly handoff: SpecialistWorkflowHandoffDto }
  | { readonly ok: false }
> {
  let bytes: Buffer;
  try {
    bytes = await context.manifestReader.get(recorded.payload.handoffManifestHash as ContentHash);
  } catch {
    addDiagnostic(context, {
      code: "manifest-missing",
      message: "Recorded handoff manifest is not available by its content hash.",
      event: recorded,
      handoffId: recorded.payload.handoffId,
      artifactHashes: [recorded.payload.handoffManifestHash]
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
      event: recorded,
      handoffId: recorded.payload.handoffId,
      artifactHashes: [recorded.payload.handoffManifestHash, rawHash]
    });
    return { ok: false };
  }

  if (rawHash !== recorded.payload.handoffManifestHash) {
    addDiagnostic(context, {
      code: "manifest-hash-mismatch",
      message: "Recorded handoff manifest bytes do not match the ledger content hash.",
      event: recorded,
      handoffId: recorded.payload.handoffId,
      artifactHashes: [recorded.payload.handoffManifestHash, rawHash]
    });
    return { ok: false };
  }

  try {
    const handoff = verifySpecialistHandoffManifest({
      manifest: parsed,
      handoffManifestHash: recorded.payload.handoffManifestHash as ContentHash,
      verifiedAt: recorded.payload.verifiedAt
    });
    return { ok: true, manifest: parsed as SpecialistHandoffManifest, handoff };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handoff manifest verification failed.";
    addDiagnostic(context, {
      code: manifestVerificationCode(message),
      message: "Recorded handoff manifest failed DTO verification.",
      event: recorded,
      handoffId: recorded.payload.handoffId,
      artifactHashes: [recorded.payload.handoffManifestHash]
    });
    return { ok: false };
  }
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
  manifest: SpecialistHandoffManifest
): string | undefined {
  if (!compactBindingMatchesManifest(prepared.payload, manifest) || !compactBindingMatchesManifest(recorded.payload, manifest)) {
    return "compact-binding-mismatch";
  }

  const runIdentity = context.runIdentities.get(manifest.runId);
  if (runIdentity !== undefined && (
    runIdentity.taskId !== manifest.taskId ||
    runIdentity.runType !== manifest.runType ||
    runIdentity.residentAgentId !== manifest.residentAgentId
  )) {
    return "compact-binding-mismatch";
  }

  const finalOutput = findFinalOutputForManifest(context, manifest);
  if (finalOutput === undefined) {
    return "final-output-mismatch";
  }

  const finalPayload = finalOutput.event.payload;
  if (
    finalPayload.stepKind !== "final-output" ||
    finalPayload.stepSchemaId === undefined ||
    finalPayload.idempotencyKey === undefined ||
    finalPayload.stepId !== manifest.finalOutputStepId ||
    !sameStringArray(finalPayload.outputArtifactHashes ?? [], outputArtifactHashes(manifest))
  ) {
    return "final-output-mismatch";
  }

  return undefined;
}

function findFinalOutputForManifest(
  context: ProjectionContext,
  manifest: SpecialistHandoffManifest
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
  manifest: SpecialistHandoffManifest
): boolean {
  return payload.handoffId === manifest.handoffId &&
    payload.handoffRevision === manifest.handoffRevision &&
    payload.handoffDtoHash === manifest.handoffDtoHash &&
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
    prior.manifest.finalOutputEventId === next.manifest.finalOutputEventId &&
    sameStringArray(outputArtifactHashes(prior.manifest), outputArtifactHashes(next.manifest)) &&
    sameStringArray(prior.handoff.toolRequestIds, next.handoff.toolRequestIds) &&
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

function isTaskCompleted(context: ProjectionContext, selected: VerifiedHandoffRecord): boolean {
  if (selected.handoff.status !== "ready-for-review" || selected.handoff.taskId === undefined) {
    return false;
  }

  const terminal = context.terminals.find((item) =>
    item.index > selected.recordedIndex &&
    item.event.type === "agent.specialist-run.completed" &&
    item.event.payload.runId === selected.handoff.runId &&
    item.event.context.causationId === selected.recorded.id
  );
  if (terminal === undefined) {
    return false;
  }

  return context.taskStatuses.some((item) =>
    item.index > terminal.index &&
    item.event.payload.taskId === selected.handoff.taskId &&
    item.event.payload.runId === selected.handoff.runId &&
    item.event.payload.status === "completed" &&
    item.event.context.causationId === terminal.event.id
  );
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

function outputArtifactHashes(manifest: SpecialistHandoffManifest): readonly ContentHash[] {
  return manifest.outputArtifacts.map((artifact) => artifact.artifactHash);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hashBuffer(bytes: Buffer): ContentHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function freezeProjection(projection: SpecialistHandoffProjection): SpecialistHandoffProjection {
  return Object.freeze({
    state: projection.state,
    handoffs: Object.freeze([...projection.handoffs]),
    ...(projection.selectedHandoff === undefined ? {} : { selectedHandoff: projection.selectedHandoff }),
    history: Object.freeze(projection.history.map((entry) => freezeEntry(entry))),
    diagnostics: Object.freeze(projection.diagnostics.map((diagnostic) => freezeDiagnostic(diagnostic)))
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
