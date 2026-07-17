import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentToolReadModelChange, AgentToolResult } from "./tool-gateway.js";

const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const artifactHashPattern = /^sha256:[a-f0-9]{64}$/;
const arrayIndexNamePattern = /^(0|[1-9]\d*)$/;
const unsafeDtoKeys = new Set(["__proto__", "constructor", "prototype"]);

export interface CreateResidentLoopSchedulerCompletionAdapterInput {
  readonly ledger: EventLedger;
}

export interface ResidentLoopSchedulerCompletionReadInput {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly approvedPreviewHash: string;
  readonly executionClaimEventId: string;
  readonly result: AgentToolResult;
}

export interface ResidentLoopSchedulerCompletionEvidence {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly approvedPreviewHash: string;
  readonly executionClaimEventId: string;
  readonly result: AgentToolResult;
}

const issuedEvidence = new WeakSet<object>();

/**
 * Internal scheduler-only result verifier. A descriptor result is a claim, not
 * completion authority: the matching resident tool-step has to be durably
 * reread from the ledger before the gateway can append completion.
 */
export function createResidentLoopSchedulerCompletionAdapter(
  input: CreateResidentLoopSchedulerCompletionAdapterInput
) {
  return Object.freeze({
    async reread(command: ResidentLoopSchedulerCompletionReadInput): Promise<ResidentLoopSchedulerCompletionEvidence> {
      const result = copyResult(command.result);
      const stream = await input.ledger.readStream(toolRequestStreamId(command.toolRequestId));
      const allEvents = await input.ledger.readAll();

      assertCurrentGatewayState(stream, command);
      assertDurableResultEvidence(allEvents, command, result);

      // Reread the tool stream after reading the evidence so a concurrent
      // terminal record cannot be treated as an executable completion.
      assertCurrentGatewayState(await input.ledger.readStream(toolRequestStreamId(command.toolRequestId)), command);
      const evidence: ResidentLoopSchedulerCompletionEvidence = Object.freeze({
        toolRequestId: command.toolRequestId,
        runId: command.runId,
        approvedPreviewHash: command.approvedPreviewHash,
        executionClaimEventId: command.executionClaimEventId,
        result
      });
      issuedEvidence.add(evidence);
      return evidence;
    }
  });
}

export function isResidentLoopSchedulerCompletionEvidence(value: unknown): value is ResidentLoopSchedulerCompletionEvidence {
  return typeof value === "object" && value !== null && issuedEvidence.has(value);
}

function assertCurrentGatewayState(events: readonly KnowledgeEvent[], command: ResidentLoopSchedulerCompletionReadInput): void {
  const requests = events.filter((event) => event.type === "agent.tool.requested");
  if (requests.length !== 1) {
    throw new Error("Completion requires exactly one durable tool request.");
  }
  const request = requests[0];
  if (
    request === undefined ||
    request.payload.toolRequestId !== command.toolRequestId ||
    request.payload.runId !== command.runId ||
    request.payload.toolId !== command.toolId ||
    request.payload.toolVersion !== command.toolVersion ||
    request.payload.previewHash !== command.approvedPreviewHash
  ) {
    throw new Error("Completion request identity does not match durable gateway state.");
  }

  if (events.some((event) => event.type === "agent.tool.completed" || event.type === "agent.tool.denied" || event.type === "agent.tool.failed")) {
    throw new Error("Completion requires a nonterminal durable tool request stream.");
  }

  const approvals = events.filter((event) => event.type === "agent.tool.approved");
  if (approvals.length !== 1 || approvals[0]?.payload.approvedPreviewHash !== command.approvedPreviewHash) {
    throw new Error("Completion approval does not match durable gateway state.");
  }

  const claims = events.filter((event) => event.type === "agent.tool.execution.claimed");
  if (
    claims.length !== 1 ||
    claims[0]?.id !== command.executionClaimEventId ||
    claims[0]?.payload.toolRequestId !== command.toolRequestId ||
    claims[0]?.payload.approvedPreviewHash !== command.approvedPreviewHash
  ) {
    throw new Error("Completion requires the exact durable execution claim.");
  }
}

function assertDurableResultEvidence(
  events: readonly KnowledgeEvent[],
  command: ResidentLoopSchedulerCompletionReadInput,
  result: AgentToolResult
): void {
  if (result.eventIds.length === 0) {
    throw new Error("Completion requires durable result evidence.");
  }
  if (new Set(result.eventIds).size !== result.eventIds.length) {
    throw new Error("Completion result evidence must not duplicate event IDs.");
  }

  const eventIds = new Set(events.map((event) => event.id));
  if (result.eventIds.some((eventId) => !eventIds.has(eventId))) {
    throw new Error("Completion result evidence is not durably readable.");
  }

  const evidence = events.filter((event): event is Extract<KnowledgeEvent, { type: "agent.resident-tool-step.recorded.v1" }> =>
    event.type === "agent.resident-tool-step.recorded.v1" &&
    event.payload.toolRequestId === command.toolRequestId &&
    event.payload.runId === command.runId &&
    event.payload.toolId === command.toolId &&
    event.payload.toolVersion === command.toolVersion &&
    event.payload.previewHash === command.approvedPreviewHash &&
    event.context.causationId === command.executionClaimEventId
  );
  if (evidence.length !== 1) {
    throw new Error("Completion requires one exact durable resident tool-step evidence record.");
  }
  const evidenceEvent = evidence[0];
  if (
    evidenceEvent === undefined ||
    (!result.eventIds.includes(evidenceEvent.id) && !result.eventIds.includes(evidenceEvent.payload.toolEventId))
  ) {
    throw new Error("Completion result evidence does not bind the durable resident tool-step.");
  }
  if (result.artifactHashes.some((hash) => !evidenceEvent.payload.contextArtifactHashes.includes(hash))) {
    throw new Error("Completion artifact evidence does not match the durable resident tool-step.");
  }

  for (const change of result.readModelChanges) {
    if (change.relatedIds !== undefined && change.relatedIds.some((id) => !result.eventIds.includes(id) && !result.artifactHashes.includes(id))) {
      throw new Error("Completion read-model evidence is not bound to the durable result.");
    }
  }
}

function copyResult(value: AgentToolResult): AgentToolResult {
  const record = dataRecord(value, "completion result");
  rejectUnsupportedKeys(record, ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"], "completion result");
  const eventIds = copyStringArray(record.eventIds, "completion result event ID", eventIdPattern);
  const artifactHashes = copyStringArray(record.artifactHashes, "completion result artifact hash", artifactHashPattern);
  const readModelChanges = copyReadModelChanges(record.readModelChanges);
  const resultSummary = record.resultSummary === undefined
    ? undefined
    : copySecretSafeString(record.resultSummary, "completion result summary");
  return Object.freeze({
    eventIds,
    artifactHashes,
    readModelChanges,
    ...(resultSummary === undefined ? {} : { resultSummary })
  });
}

function copyReadModelChanges(value: unknown): readonly AgentToolReadModelChange[] {
  return copyArray(value, "completion read-model changes").map((item) => {
    const record = dataRecord(item, "completion read-model change");
    rejectUnsupportedKeys(record, ["projectionName", "change", "relatedIds"], "completion read-model change");
    const relatedIds = record.relatedIds === undefined
      ? undefined
      : copyStringArray(record.relatedIds, "completion read-model related ID");
    return Object.freeze({
      projectionName: copySecretSafeString(record.projectionName, "completion read-model projection name"),
      change: copySecretSafeString(record.change, "completion read-model change"),
      ...(relatedIds === undefined ? {} : { relatedIds })
    });
  });
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    if (unsafeDtoKeys.has(key)) {
      throw new Error(`${label} must not contain unsafe fields.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must not contain hidden or accessor-backed fields.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function copyStringArray(value: unknown, label: string, pattern?: RegExp): readonly string[] {
  return Object.freeze(copyArray(value, `${label} list`).map((item) => {
    const copied = copySecretSafeString(item, label);
    if (pattern !== undefined && !pattern.test(copied)) {
      throw new Error(`${label} must be canonical.`);
    }
    return copied;
  }));
}

function copyArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must be an array.`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key !== "length" && (!arrayIndexNamePattern.test(key) || Number(key) >= value.length)) {
      throw new Error(`${label} must not contain custom fields.`);
    }
  }
  const copied: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must not contain sparse, hidden, or accessor-backed values.`);
    }
    copied.push(descriptor.value);
  }
  return Object.freeze(copied);
}

function copySecretSafeString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, label);
  return value;
}

function toolRequestStreamId(toolRequestId: string): string {
  return `agent_tool_request_${toolRequestId}`;
}
