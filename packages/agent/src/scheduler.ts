import type { ActorRef, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentProjection } from "./projection.js";
import type { ProjectedAgentToolRequest } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import {
  createAgentToolGateway,
  hashAgentToolPreview,
  type AgentToolFailureCategory,
  type AgentToolResult
} from "./tool-gateway.js";
import {
  agentSchedulerWakeResultDtoSchema,
  type AgentApprovedToolActiveLock,
  type AgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolExecutionResult,
  type AgentApprovedToolFreshnessCheck,
  type AgentApprovedToolPreviewResult,
  type AgentSchedulerItemSummaryDto,
  type AgentSchedulerWakeResultDto
} from "./scheduler-types.js";

export interface CreateAgentSchedulerInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly descriptors: readonly AgentApprovedToolExecutorDescriptor[];
}

type AgentToolGateway = ReturnType<typeof createAgentToolGateway>;

type ToolRequestEvent =
  | KnowledgeEventOf<"agent.tool.requested">
  | KnowledgeEventOf<"agent.tool.approved">
  | KnowledgeEventOf<"agent.tool.execution.claimed">
  | KnowledgeEventOf<"agent.tool.denied">
  | KnowledgeEventOf<"agent.tool.completed">
  | KnowledgeEventOf<"agent.tool.failed">;

interface ToolRequestStreamState {
  readonly request: KnowledgeEventOf<"agent.tool.requested">;
  readonly requestCount: number;
  readonly approval?: KnowledgeEventOf<"agent.tool.approved">;
  readonly executionClaim?: KnowledgeEventOf<"agent.tool.execution.claimed">;
  readonly denial?: KnowledgeEventOf<"agent.tool.denied">;
  readonly completed?: KnowledgeEventOf<"agent.tool.completed">;
  readonly failure?: KnowledgeEventOf<"agent.tool.failed">;
}

interface SafePreviewResult {
  readonly preview: AgentApprovedToolPreviewResult["preview"];
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly activeLocks: readonly AgentApprovedToolActiveLock[];
  readonly freshnessChecks: readonly AgentApprovedToolFreshnessCheck[];
}

const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const artifactHashPattern = /^sha256:[a-f0-9]{64}$/;
const arrayIndexNamePattern = /^(0|[1-9]\d*)$/;
const unsafeDtoKeys = new Set(["__proto__", "constructor", "prototype"]);
const schedulerAllowedNextActions = ["refresh agent status", "inspect agent approval queue"] as const;
const executionClaimLeaseMs = 5 * 60 * 1000;

export function createAgentScheduler(input: CreateAgentSchedulerInput) {
  const descriptorRegistry = new Map(
    input.descriptors.map((descriptor) => [descriptorKey(descriptor.toolId, descriptor.toolVersion), descriptor])
  );
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now });

  return Object.freeze({
    async wake(): Promise<AgentSchedulerWakeResultDto> {
      const events = await input.ledger.readAll();
      const projection = buildAgentProjection(events);
      const candidates = [...projection.toolRequests.values()].filter(isApprovedOpenRequest);
      const items: AgentSchedulerItemSummaryDto[] = [];
      const eventIds: string[] = [];

      for (const request of candidates) {
        const descriptor = descriptorRegistry.get(descriptorKey(request.toolId, request.toolVersion));
        const item = descriptor === undefined
          ? await handleDescriptorlessRequest(input.ledger, gateway, request)
          : await consumeApprovedRequest(input.ledger, gateway, input.actor.id, input.now, descriptor, request);
        items.push(item);
        eventIds.push(...item.eventIds);
      }

      const completedCount = items.filter((item) => item.state === "completed").length;
      const failedCount = items.filter((item) => item.state === "failed").length;
      const blockedCount = items.filter((item) => item.state === "blocked").length;
      return agentSchedulerWakeResultDtoSchema.parse({
        schemaVersion: "agent-scheduler-wake-result.v1",
        generatedAt: input.now(),
        examinedCount: candidates.length,
        resumedCount: completedCount,
        completedCount,
        blockedCount,
        failedCount,
        eventIds,
        allowedNextActions: [...schedulerAllowedNextActions],
        items
      });
    }
  });
}

async function handleDescriptorlessRequest(
  ledger: EventLedger,
  gateway: AgentToolGateway,
  request: ProjectedAgentToolRequest
): Promise<AgentSchedulerItemSummaryDto> {
  const streamState = await readToolRequestStreamState(ledger, request.toolRequestId);
  if (hasOpenExecutionClaim(streamState)) {
    return notReadyItem(
      request,
      "Tool execution is already claimed and requires inspection before retry.",
      "execution-claimed"
    );
  }

  try {
    return await failRequest(
      gateway,
      request,
      "permission-denied",
      "Approved tool descriptor is unavailable.",
      false,
      ["install or register the approved tool descriptor"]
    );
  } catch (error) {
    const latestState = await readToolRequestStreamState(ledger, request.toolRequestId);
    if (hasOpenExecutionClaim(latestState)) {
      return notReadyItem(
        request,
        "Tool execution is already claimed and requires inspection before retry.",
        "execution-claimed"
      );
    }
    if (isTerminalStreamState(latestState)) {
      return notReadyItem(request, "Tool request is no longer open.");
    }
    throw error;
  }
}

function descriptorKey(toolId: string, toolVersion: string): string {
  return `${toolId}\u0000${toolVersion}`;
}

function isApprovedOpenRequest(request: ProjectedAgentToolRequest): boolean {
  return (request.state === "approved" || request.state === "executing") &&
    request.completedAt === undefined &&
    request.failedAt === undefined &&
    request.deniedAt === undefined;
}

async function consumeApprovedRequest(
  ledger: EventLedger,
  gateway: AgentToolGateway,
  schedulerActorId: string,
  now: () => string,
  descriptor: AgentApprovedToolExecutorDescriptor,
  request: ProjectedAgentToolRequest
): Promise<AgentSchedulerItemSummaryDto> {
  if (
    descriptor.sideEffectClass !== request.sideEffectClass ||
    descriptor.approvalClass !== request.requiredApprovalClass
  ) {
    return await failRequest(
      gateway,
      request,
      "permission-denied",
      "Approved tool descriptor does not match the requested approval class.",
      false,
      ["register a descriptor for the requested approval class"]
    );
  }

  const streamState = await readToolRequestStreamState(ledger, request.toolRequestId);
  if (streamState === undefined) {
    return await failRequest(
      gateway,
      request,
      "permission-denied",
      "Approved tool request was not found in the ledger stream.",
      false,
      ["refresh agent status before retrying"]
    );
  }
  if (streamState.completed !== undefined || streamState.denial !== undefined || streamState.failure !== undefined) {
    return notReadyItem(request, "Tool request is no longer open.");
  }
  if (streamState.executionClaim !== undefined) {
    return notReadyItem(
      request,
      "Tool execution is already claimed and requires inspection before retry.",
      "execution-claimed"
    );
  }
  if (streamState.requestCount > 1) {
    return await failRequest(
      gateway,
      request,
      "permission-denied",
      "Tool request stream contains duplicate request records.",
      false,
      ["create a new tool request with a unique id"]
    );
  }

  const approval = streamState.approval;
  if (approval === undefined || !isStoredApprovalUsable(approval, streamState.request, schedulerActorId)) {
    return await failRequest(
      gateway,
      request,
      "permission-denied",
      "Tool execution requires a usable independent human approval.",
      false,
      ["request a human approval for the current preview"]
    );
  }

  let rawPreviewResult: AgentApprovedToolPreviewResult;
  try {
    rawPreviewResult = await descriptor.buildCurrentPreview({
      toolRequestId: request.toolRequestId,
      runId: request.runId,
      toolId: request.toolId,
      toolVersion: request.toolVersion,
      requestedPreviewHash: request.previewHash
    });
  } catch {
    return await failRequest(
      gateway,
      request,
      "external-effect-failed",
      "Descriptor preview rebuild failed before execution.",
      true,
      ["inspect scheduler diagnostics"]
    );
  }

  let previewResult: SafePreviewResult;
  try {
    previewResult = sanitizePreviewResult(rawPreviewResult);
  } catch (error) {
    return await failRequest(
      gateway,
      request,
      categoryForSanitizationError(error, "model-output-invalid"),
      messageForSanitizationError(error, "Descriptor preview result failed validation."),
      false,
      ["fix descriptor result validation"]
    );
  }

  let currentPreviewHash: `sha256:${string}`;
  try {
    currentPreviewHash = hashAgentToolPreview(previewResult.preview);
  } catch (error) {
    return await failRequest(
      gateway,
      request,
      categoryForSanitizationError(error, "secret-detected"),
      messageForSanitizationError(error, "Descriptor preview failed secret-safety validation."),
      false,
      ["request a revised preview approval"]
    );
  }

  if (
    currentPreviewHash !== request.previewHash ||
    currentPreviewHash !== streamState.request.payload.previewHash ||
    currentPreviewHash !== approval.payload.approvedPreviewHash
  ) {
    return await failRequest(
      gateway,
      request,
      "approval-stale",
      "Approved preview hash no longer matches the current preview.",
      false,
      ["request a revised preview approval"],
      currentPreviewHash
    );
  }

  if (previewResult.activeLocks.length > 0) {
    return await failRequest(
      gateway,
      request,
      "legal-lock-active",
      "Active lock blocks approved tool execution.",
      true,
      ["clear active locks before retrying"],
      currentPreviewHash
    );
  }

  if (previewResult.sourceEventIds.length + previewResult.inputArtifactHashes.length + previewResult.provenanceRefs.length === 0) {
    return await failRequest(
      gateway,
      request,
      "provenance-missing",
      "Approved tool execution requires provenance before execution.",
      false,
      ["restore provenance and request a new approval"],
      currentPreviewHash
    );
  }

  if (
    !stringArraysEqual(previewResult.sourceEventIds, request.sourceEventIds) ||
    !stringArraysEqual(previewResult.inputArtifactHashes, request.inputArtifactHashes)
  ) {
    return await failRequest(
      gateway,
      request,
      "approval-stale",
      "Approved source or artifact references no longer match the request.",
      false,
      ["request a revised preview approval"],
      currentPreviewHash
    );
  }

  if (previewResult.freshnessChecks.some((check) => !check.ok)) {
    return await failRequest(
      gateway,
      request,
      "projection-lag",
      "Approved tool execution is blocked by stale read models.",
      true,
      ["rebuild stale projections before retrying"],
      currentPreviewHash
    );
  }

  let claim: KnowledgeEventOf<"agent.tool.execution.claimed">;
  try {
    claim = await gateway.claimExecution({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: approval.payload.approvedPreviewHash,
      leaseExpiresAt: claimLeaseExpiresAt(now())
    });
  } catch {
    return notReadyItem(
      request,
      "Tool execution claim could not be recorded.",
      "execution-claimed",
      currentPreviewHash
    );
  }

  let executionResult: AgentApprovedToolExecutionResult;
  try {
    executionResult = await descriptor.executeApproved({
      toolRequestId: request.toolRequestId,
      runId: request.runId,
      toolId: request.toolId,
      toolVersion: request.toolVersion,
      sideEffectClass: request.sideEffectClass,
      approvalClass: request.requiredApprovalClass,
      previewHash: request.previewHash,
      approvedPreviewHash: approval.payload.approvedPreviewHash,
      approvedBy: approval.payload.approvedBy,
      sourceEventIds: previewResult.sourceEventIds,
      inputArtifactHashes: previewResult.inputArtifactHashes,
      provenanceRefs: previewResult.provenanceRefs
    });
  } catch {
    return await failRequest(
      gateway,
      request,
      "external-effect-failed",
      "Approved tool execution failed before producing a safe result.",
      true,
      ["inspect scheduler diagnostics"],
      currentPreviewHash,
      [claim.id]
    );
  }

  return await completeRequest(gateway, request, approval.payload.approvedPreviewHash, executionResult, currentPreviewHash, claim.id);
}

async function completeRequest(
  gateway: AgentToolGateway,
  request: ProjectedAgentToolRequest,
  approvedPreviewHash: string,
  result: AgentToolResult,
  currentPreviewHash: string,
  claimEventId?: string
): Promise<AgentSchedulerItemSummaryDto> {
  try {
    const completed = await gateway.completeTool({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash,
      result
    });
    return itemForRequest(request, {
      state: "completed",
      currentPreviewHash,
      eventIds: [...optionalEventId(claimEventId), completed.id],
      allowedNextActions: ["refresh agent status"]
    });
  } catch (error) {
    return await failRequest(
      gateway,
      request,
      categoryForSanitizationError(error, "model-output-invalid"),
      messageForSanitizationError(error, "Descriptor result failed validation before completion."),
      false,
      ["fix descriptor result validation"],
      currentPreviewHash,
      optionalEventId(claimEventId)
    );
  }
}

async function failRequest(
  gateway: AgentToolGateway,
  request: ProjectedAgentToolRequest,
  category: AgentToolFailureCategory,
  message: string,
  retryable: boolean,
  allowedActions: readonly string[],
  currentPreviewHash?: string,
  priorEventIds: readonly string[] = []
): Promise<AgentSchedulerItemSummaryDto> {
  const failed = await gateway.failTool({
    toolRequestId: request.toolRequestId,
    category,
    message,
    retryable,
    allowedActions
  });
  return itemForRequest(request, {
    state: "failed",
    category,
    message,
    currentPreviewHash,
    eventIds: [...priorEventIds, failed.id],
    allowedNextActions: [...allowedActions]
  });
}

function notReadyItem(
  request: ProjectedAgentToolRequest,
  message: string,
  category = "permission-denied",
  currentPreviewHash?: string
): AgentSchedulerItemSummaryDto {
  return itemForRequest(request, {
    state: "not-ready",
    category,
    message,
    currentPreviewHash,
    eventIds: [],
    allowedNextActions: [...schedulerAllowedNextActions]
  });
}

function itemForRequest(
  request: ProjectedAgentToolRequest,
  patch: Omit<Partial<AgentSchedulerItemSummaryDto>, "toolRequestId" | "runId" | "toolId" | "toolVersion" | "approvalClass" | "previewHash">
): AgentSchedulerItemSummaryDto {
  return {
    toolRequestId: request.toolRequestId,
    runId: request.runId,
    toolId: request.toolId,
    toolVersion: request.toolVersion,
    state: patch.state ?? "not-ready",
    approvalClass: request.requiredApprovalClass,
    previewHash: request.previewHash,
    ...(patch.currentPreviewHash === undefined ? {} : { currentPreviewHash: patch.currentPreviewHash }),
    ...(patch.category === undefined ? {} : { category: patch.category }),
    ...(patch.message === undefined ? {} : { message: patch.message }),
    eventIds: [...(patch.eventIds ?? [])],
    allowedNextActions: [...(patch.allowedNextActions ?? schedulerAllowedNextActions)]
  };
}

function hasOpenExecutionClaim(streamState: ToolRequestStreamState | undefined): boolean {
  return streamState?.executionClaim !== undefined &&
    streamState.completed === undefined &&
    streamState.denial === undefined &&
    streamState.failure === undefined;
}

function isTerminalStreamState(streamState: ToolRequestStreamState | undefined): boolean {
  return streamState?.completed !== undefined ||
    streamState?.denial !== undefined ||
    streamState?.failure !== undefined;
}

async function readToolRequestStreamState(
  ledger: EventLedger,
  toolRequestId: string
): Promise<ToolRequestStreamState | undefined> {
  const events = (await ledger.readStream(toolRequestStreamId(toolRequestId))).filter(isToolRequestEvent);
  const requests = events.filter((event): event is KnowledgeEventOf<"agent.tool.requested"> => event.type === "agent.tool.requested");
  const request = requests[0];
  if (request === undefined) {
    return undefined;
  }

  const approval = lastOfType(events, "agent.tool.approved");
  const executionClaim = lastOfType(events, "agent.tool.execution.claimed");
  const denial = lastOfType(events, "agent.tool.denied");
  const completed = lastOfType(events, "agent.tool.completed");
  const failure = lastOfType(events, "agent.tool.failed");
  return {
    request,
    requestCount: requests.length,
    ...(approval === undefined ? {} : { approval }),
    ...(executionClaim === undefined ? {} : { executionClaim }),
    ...(denial === undefined ? {} : { denial }),
    ...(completed === undefined ? {} : { completed }),
    ...(failure === undefined ? {} : { failure })
  };
}

function isToolRequestEvent(event: unknown): event is ToolRequestEvent {
  return typeof event === "object" &&
    event !== null &&
    "type" in event &&
    typeof event.type === "string" &&
    event.type.startsWith("agent.tool.");
}

function lastOfType<Type extends ToolRequestEvent["type"]>(
  events: readonly ToolRequestEvent[],
  type: Type
): Extract<ToolRequestEvent, { type: Type }> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === type) {
      return event as Extract<ToolRequestEvent, { type: Type }>;
    }
  }
  return undefined;
}

function isStoredApprovalUsable(
  approval: KnowledgeEventOf<"agent.tool.approved">,
  request: KnowledgeEventOf<"agent.tool.requested">,
  schedulerActorId: string
): boolean {
  return approval.context.actor.kind === "human" &&
    approval.context.actor.id === approval.payload.approvedBy &&
    approval.context.causationId === request.id &&
    approval.payload.approvalClass === request.payload.requiredApprovalClass &&
    approval.payload.approvedPreviewHash === request.payload.previewHash &&
    approval.context.actor.id !== request.payload.requestedBy &&
    approval.context.actor.id !== request.context.actor.id &&
    approval.context.actor.id !== schedulerActorId;
}

function sanitizePreviewResult(value: AgentApprovedToolPreviewResult): SafePreviewResult {
  const result = dataRecordFromObject(value, "descriptor preview result");
  rejectUnsupportedKeys(
    result,
    ["preview", "sourceEventIds", "inputArtifactHashes", "provenanceRefs", "activeLocks", "freshnessChecks"],
    "descriptor preview result"
  );

  return {
    preview: result.preview as AgentApprovedToolPreviewResult["preview"],
    sourceEventIds: sanitizeStringArray(result.sourceEventIds, "descriptor source event id", validateEventId),
    inputArtifactHashes: sanitizeStringArray(result.inputArtifactHashes, "descriptor input artifact hash", validateArtifactHash),
    provenanceRefs: sanitizeStringArray(result.provenanceRefs, "descriptor provenance ref", () => undefined),
    activeLocks: sanitizeActiveLocks(result.activeLocks),
    freshnessChecks: sanitizeFreshnessChecks(result.freshnessChecks)
  };
}

function sanitizeActiveLocks(value: unknown): readonly AgentApprovedToolActiveLock[] {
  return sanitizeArray(value, "descriptor active lock list").map((item) => {
    const lock = dataRecordFromObject(item, "descriptor active lock");
    rejectUnsupportedKeys(lock, ["lockId", "category", "message"], "descriptor active lock");
    assertNonEmptySecretSafeString(lock.lockId, "descriptor active lock id");
    assertNonEmptySecretSafeString(lock.category, "descriptor active lock category");
    assertNonEmptySecretSafeString(lock.message, "descriptor active lock message");
    return Object.freeze({
      lockId: lock.lockId,
      category: lock.category,
      message: lock.message
    });
  });
}

function sanitizeFreshnessChecks(value: unknown): readonly AgentApprovedToolFreshnessCheck[] {
  return sanitizeArray(value, "descriptor freshness check list").map((item) => {
    const check = dataRecordFromObject(item, "descriptor freshness check");
    rejectUnsupportedKeys(check, ["name", "expected", "actual", "ok"], "descriptor freshness check");
    assertNonEmptySecretSafeString(check.name, "descriptor freshness check name");
    assertNonEmptySecretSafeString(check.expected, "descriptor freshness check expected value");
    assertNonEmptySecretSafeString(check.actual, "descriptor freshness check actual value");
    if (typeof check.ok !== "boolean") {
      throw new Error("descriptor freshness check ok value must be a boolean.");
    }
    return Object.freeze({
      name: check.name,
      expected: check.expected,
      actual: check.actual,
      ok: check.ok
    });
  });
}

function sanitizeStringArray(
  value: unknown,
  label: string,
  validate: (item: string, label: string) => void
): readonly string[] {
  const values = sanitizeArray(value, `${label} list`);
  return Object.freeze(values.map((item) => {
    assertNonEmptySecretSafeString(item, label);
    validate(item, label);
    return item;
  }));
}

function sanitizeArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    if (name === "length") {
      continue;
    }
    if (!isArrayIndexName(name) || Number(name) >= value.length) {
      throw new Error(`${label} must not contain custom array fields.`);
    }
  }

  const safe: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must not contain sparse, hidden, or accessor-backed values.`);
    }
    safe.push(descriptor.value);
  }
  return Object.freeze(safe);
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) {
    throw new Error(`${label} must be a plain JSON object.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }

  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    assertSafeDtoKey(key, `${label} key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must not contain accessors.`);
    }
    if (!descriptor.enumerable) {
      throw new Error(`${label} must not contain hidden fields.`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function assertSafeDtoKey(value: string, label: string): void {
  assertAgentSecretSafeText(value, label);
  if (unsafeDtoKeys.has(value)) {
    throw new Error(`${label} must be safe.`);
  }
}

function assertNonEmptySecretSafeString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, label);
}

function validateEventId(item: string, label: string): void {
  if (!eventIdPattern.test(item)) {
    throw new Error(`${label} must be a valid event ID.`);
  }
}

function validateArtifactHash(item: string, label: string): void {
  if (!artifactHashPattern.test(item)) {
    throw new Error(`${label} must be a valid artifact hash.`);
  }
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function claimLeaseExpiresAt(claimedAt: string): string {
  return new Date(Date.parse(claimedAt) + executionClaimLeaseMs).toISOString();
}

function optionalEventId(eventId: string | undefined): readonly string[] {
  return eventId === undefined ? [] : [eventId];
}

function categoryForSanitizationError(error: unknown, fallback: AgentToolFailureCategory): AgentToolFailureCategory {
  return isSecretSafetyError(error) ? "secret-detected" : fallback;
}

function messageForSanitizationError(error: unknown, fallback: string): string {
  return isSecretSafetyError(error) ? "Descriptor output failed secret-safety validation." : fallback;
}

function isSecretSafetyError(error: unknown): boolean {
  return error instanceof Error && /secret-safe|secret|token|credential|password|api key|authorization/i.test(error.message);
}

function isArrayIndexName(value: string): boolean {
  if (!arrayIndexNamePattern.test(value)) {
    return false;
  }
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === value;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toolRequestStreamId(toolRequestId: string): string {
  return `agent_tool_request_${toolRequestId}`;
}
