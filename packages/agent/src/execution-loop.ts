import { createHash } from "node:crypto";
import type { ActorRef, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { AgentToolApprovalClass, AgentToolSideEffectClass } from "./projection-types.js";
import {
  createAgentToolGateway,
  type AgentToolPreview,
  type AgentToolReadModelChange,
  type AgentToolResult,
  type RequestAgentToolInput
} from "./tool-gateway.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export interface FakeAgentToolExecutorInput {
  readonly toolRequestId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  readonly previewHash: string;
  readonly approvedPreviewHash: string;
}

export interface FakeAgentToolExecutorResult {
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly readModelChanges: readonly (string | AgentToolReadModelChange)[];
  readonly resultSummary?: string;
}

export interface FakeAgentToolExecutor {
  execute(input: FakeAgentToolExecutorInput): FakeAgentToolExecutorResult | Promise<FakeAgentToolExecutorResult>;
}

export interface FakeAgentActiveLock {
  readonly lockId: string;
  readonly category: string;
  readonly message: string;
}

export interface CreateFakeAgentExecutionLoopInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly executor: FakeAgentToolExecutor;
  readonly residentAgentId?: string;
}

export interface RequestFakeAgentApprovalInput {
  readonly taskId: string;
  readonly runId: string;
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion?: string | number;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  readonly preview: AgentToolPreview;
  readonly scope?: string;
  readonly estimatedEffect?: string;
  readonly inputArtifactHashes?: readonly string[];
}

export interface WaitingForApprovalResult {
  readonly state: "waiting-for-approval";
  readonly toolRequestId: string;
  readonly previewHash: string;
  readonly eventId: string;
}

export interface ApproveFakeAgentToolInput {
  readonly toolRequestId: string;
  readonly actor: ActorRef;
  readonly approvedPreviewHash: string;
  readonly rationale: string;
}

export interface ResumeApprovedFakeToolInput {
  readonly toolRequestId: string;
  readonly taskId: string;
  readonly currentPreview: AgentToolPreview;
  readonly activeLocks: readonly FakeAgentActiveLock[];
}

export interface CompletedFakeToolResult {
  readonly state: "completed";
  readonly toolRequestId: string;
  readonly eventId: string;
}

type ToolRequestEvent =
  | KnowledgeEventOf<"agent.tool.requested">
  | KnowledgeEventOf<"agent.tool.approved">
  | KnowledgeEventOf<"agent.tool.denied">
  | KnowledgeEventOf<"agent.tool.completed">
  | KnowledgeEventOf<"agent.tool.failed">;

interface ToolRequestState {
  readonly request: KnowledgeEventOf<"agent.tool.requested">;
  readonly approval?: KnowledgeEventOf<"agent.tool.approved">;
  readonly denial?: KnowledgeEventOf<"agent.tool.denied">;
  readonly completed?: KnowledgeEventOf<"agent.tool.completed">;
  readonly failure?: KnowledgeEventOf<"agent.tool.failed">;
}

interface CanonicalFakeToolPreviewInput {
  readonly toolRequestId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly residentAgentId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly requiredApprovalClass: AgentToolApprovalClass;
  readonly preview: AgentToolPreview;
  readonly scope?: string;
  readonly estimatedEffect?: string;
  readonly sourceEventIds?: readonly string[];
  readonly inputArtifactHashes?: readonly string[];
}

type CanonicalFakeToolPreview = AgentToolPreview & {
  readonly scope: string;
  readonly estimatedEffect: string;
  readonly inputArtifactHashes?: readonly string[];
};

const defaultResidentAgentId = "agent_default";
const fakeReadModelProjectionName = "fake-agent-execution-loop";
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const artifactHashPattern = /^sha256:[a-f0-9]{64}$/;
const arrayIndexNamePattern = /^(0|[1-9]\d*)$/;
const invalidFakeToolResultMessage = "Fake tool result failed validation.";
const secretShapedDtoKeyTerms = new Set([
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "oauth",
  "passwd",
  "password",
  "secret",
  "token"
]);
const unsafeDtoKeys = new Set(["__proto__", "constructor", "prototype"]);

export function createFakeAgentExecutionLoop(input: CreateFakeAgentExecutionLoopInput) {
  const gateway = createAgentToolGateway({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now
  });
  const residentAgentId = input.residentAgentId ?? defaultResidentAgentId;

  return Object.freeze({
    async requestApprovalOnly(command: RequestFakeAgentApprovalInput): Promise<WaitingForApprovalResult> {
      if (command.approvalClass === "none") {
        throw new Error("Approval-only tool request requires a human approval class.");
      }

      const toolVersion = String(command.toolVersion ?? "0.1.0");
      const preview = sanitizeFakeToolPreview(command.preview);
      const sourceEventIds = sanitizeEventIds(preview.relatedEventIds, "preview related event id");
      const previewArtifactHashes = sanitizeArtifactHashes(preview.artifactHashes, "preview artifact hash");
      const inputArtifactHashes = sanitizeArtifactHashes(command.inputArtifactHashes, "input artifact hash") ?? previewArtifactHashes;
      const scope = optionalSecretSafeString(command.scope ?? preview.scope, "tool request scope");
      const estimatedEffect = optionalSecretSafeString(
        command.estimatedEffect ?? preview.estimatedEffect,
        "tool request estimated effect"
      );
      const canonicalPreview = buildCanonicalFakeToolPreview({
        toolRequestId: command.toolRequestId,
        residentAgentId,
        taskId: command.taskId,
        runId: command.runId,
        toolId: command.toolId,
        toolVersion,
        sideEffectClass: command.sideEffectClass,
        requiredApprovalClass: command.approvalClass,
        preview,
        ...(scope === undefined ? {} : { scope }),
        ...(estimatedEffect === undefined ? {} : { estimatedEffect }),
        ...(sourceEventIds === undefined ? {} : { sourceEventIds }),
        ...(inputArtifactHashes === undefined ? {} : { inputArtifactHashes })
      });
      const previewHash = hashStablePreview(canonicalPreview);
      const requested = await gateway.requestTool({
        toolRequestId: command.toolRequestId,
        residentAgentId,
        taskId: command.taskId,
        runId: command.runId,
        toolId: command.toolId,
        toolVersion,
        sideEffectClass: command.sideEffectClass,
        requiredApprovalClass: command.approvalClass as NonNullable<RequestAgentToolInput["requiredApprovalClass"]>,
        preview: canonicalPreview,
        scope: canonicalPreview.scope,
        estimatedEffect: canonicalPreview.estimatedEffect,
        ...(canonicalPreview.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: canonicalPreview.inputArtifactHashes })
      });
      if (requested.payload.previewHash !== previewHash) {
        throw new Error("Runtime preview hash did not match the gateway preview hash.");
      }

      return Object.freeze({
        state: "waiting-for-approval" as const,
        toolRequestId: requested.payload.toolRequestId,
        previewHash,
        eventId: requested.id
      });
    },

    async approveForTest(command: ApproveFakeAgentToolInput) {
      return await gateway.approveTool(command);
    },

    async resumeApprovedTool(command: ResumeApprovedFakeToolInput): Promise<CompletedFakeToolResult> {
      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      assertRequestOpenForResume(state);
      const approval = state.approval;

      if (approval === undefined) {
        throw new Error("Human approval is required before resume.");
      }
      if (!isStoredApprovalUsable(approval, state.request, input.actor.id)) {
        await gateway.failTool({
          toolRequestId: command.toolRequestId,
          category: "permission-denied",
          message: "Tool resume requires a usable human approval.",
          retryable: false,
          allowedActions: ["request a human approval for the current preview"]
        });
        throw new Error("Tool resume requires a usable human approval.");
      }

      const currentPreview = sanitizeFakeToolPreview(command.currentPreview);
      const currentPreviewHash = hashStablePreview(buildCanonicalFakeToolPreview({
        toolRequestId: state.request.payload.toolRequestId,
        residentAgentId: state.request.payload.requestedBy,
        taskId: command.taskId,
        runId: state.request.payload.runId,
        toolId: state.request.payload.toolId,
        toolVersion: state.request.payload.toolVersion,
        sideEffectClass: state.request.payload.sideEffectClass,
        requiredApprovalClass: state.request.payload.requiredApprovalClass,
        preview: currentPreview,
        scope: state.request.payload.scope,
        estimatedEffect: state.request.payload.estimatedEffect,
        ...(state.request.payload.sourceEventIds === undefined ? {} : { sourceEventIds: state.request.payload.sourceEventIds }),
        ...(state.request.payload.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: state.request.payload.inputArtifactHashes })
      }));

      if (
        currentPreviewHash !== state.request.payload.previewHash ||
        approval.payload.approvedPreviewHash !== state.request.payload.previewHash
      ) {
        await gateway.failTool({
          toolRequestId: command.toolRequestId,
          category: "approval-stale",
          message: "Approved preview hash no longer matches the current preview.",
          retryable: false,
          allowedActions: ["request a revised preview approval"]
        });
        throw new Error("Stale approval preview hash does not match the current preview.");
      }

      if (command.activeLocks.length > 0) {
        await failForActiveLocks(gateway, command.toolRequestId, command.activeLocks);
        throw new Error("Active lock blocks approved tool resume.");
      }

      let fakeResult: FakeAgentToolExecutorResult;
      try {
        fakeResult = await input.executor.execute({
          toolRequestId: state.request.payload.toolRequestId,
          runId: state.request.payload.runId,
          toolId: state.request.payload.toolId,
          toolVersion: state.request.payload.toolVersion,
          sideEffectClass: state.request.payload.sideEffectClass,
          approvalClass: state.request.payload.requiredApprovalClass,
          previewHash: state.request.payload.previewHash,
          approvedPreviewHash: approval.payload.approvedPreviewHash,
          taskId: command.taskId
        });
      } catch {
        await gateway.failTool({
          toolRequestId: command.toolRequestId,
          category: "external-effect-failed",
          message: "Fake executor failed before producing a safe result.",
          retryable: true,
          allowedActions: ["inspect fake executor diagnostics"]
        });
        throw new Error("Fake executor failed before producing a safe result.");
      }

      let result: AgentToolResult;
      try {
        result = normalizeAndValidateFakeToolResult(fakeResult);
      } catch {
        await failForInvalidFakeToolResult(gateway, command.toolRequestId);
        throw new Error(invalidFakeToolResultMessage);
      }

      const completed = await gateway.completeTool({
        toolRequestId: command.toolRequestId,
        approvedPreviewHash: approval.payload.approvedPreviewHash,
        result
      });

      return Object.freeze({
        state: "completed" as const,
        toolRequestId: completed.payload.toolRequestId,
        eventId: completed.id
      });
    }
  });
}

function buildCanonicalFakeToolPreview(input: CanonicalFakeToolPreviewInput): CanonicalFakeToolPreview {
  const preview = sanitizeFakeToolPreview(input.preview);
  const safeDisplayPreview = sanitizeJsonValue(preview, "preview display");
  const sourceEventIds = sanitizeEventIds(input.sourceEventIds, "preview source event id");
  const artifactHashes = sanitizeArtifactHashes(preview.artifactHashes, "preview artifact hash");
  const inputArtifactHashes = sanitizeArtifactHashes(input.inputArtifactHashes, "input artifact hash") ?? artifactHashes;
  const summary = preview.summary;
  assertNonEmptySecretSafeString(summary, "preview summary");
  const scope = input.scope ?? optionalSecretSafeString(preview.scope, "preview scope") ?? summary;
  const estimatedEffect = input.estimatedEffect ?? optionalSecretSafeString(preview.estimatedEffect, "preview estimated effect") ?? summary;

  return Object.freeze({
    summary,
    toolRequestId: input.toolRequestId,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    residentAgentId: input.residentAgentId,
    runId: input.runId,
    taskId: input.taskId,
    sideEffectClass: input.sideEffectClass,
    requiredApprovalClass: input.requiredApprovalClass,
    displayPreview: safeDisplayPreview,
    scope,
    estimatedEffect,
    ...(Object.hasOwn(preview, "affectedRefs") ? { affectedRefs: sanitizeJsonValue(preview.affectedRefs, "preview affectedRefs") } : {}),
    ...(sourceEventIds === undefined ? {} : { relatedEventIds: [...sourceEventIds], sourceEventIds: [...sourceEventIds] }),
    ...(artifactHashes === undefined ? {} : { artifactHashes: [...artifactHashes] }),
    ...(inputArtifactHashes === undefined ? {} : { inputArtifactHashes: [...inputArtifactHashes] })
  });
}

function hashStablePreview(preview: AgentToolPreview): `sha256:${string}` {
  const digest = createHash("sha256").update(stableJsonStringify(preview)).digest("hex");
  return `sha256:${digest}`;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stabilizeJsonValue(value));
}

function stabilizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return sanitizeJsonArray(value, "stable preview array").map((item) => stabilizeJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const stable = Object.create(null) as Record<string, unknown>;
    for (const [key, entryValue] of dataEntriesFromObject(value, "stable preview object")) {
      stable[key] = stabilizeJsonValue(entryValue);
    }
    return stable;
  }

  return value;
}

function sanitizeFakeToolPreview(preview: AgentToolPreview): AgentToolPreview {
  const normalized = sanitizePlainJsonObject(preview, "preview");
  assertNonEmptySecretSafeString(normalized.summary, "preview summary");

  if (Object.hasOwn(normalized, "scope")) {
    assertNonEmptySecretSafeString(normalized.scope, "preview scope");
  }
  if (Object.hasOwn(normalized, "estimatedEffect")) {
    assertNonEmptySecretSafeString(normalized.estimatedEffect, "preview estimated effect");
  }
  if (Object.hasOwn(normalized, "relatedEventIds")) {
    normalized.relatedEventIds = sanitizeEventIds(normalized.relatedEventIds, "preview related event id");
  }
  if (Object.hasOwn(normalized, "artifactHashes")) {
    normalized.artifactHashes = sanitizeArtifactHashes(normalized.artifactHashes, "preview artifact hash");
  }

  return Object.freeze(normalized) as AgentToolPreview;
}

function sanitizePlainJsonObject(value: unknown, label: string): Record<string, unknown> {
  const safe = Object.create(null) as Record<string, unknown>;
  for (const [key, entryValue] of dataEntriesFromObject(value, label)) {
    safe[key] = sanitizeJsonValue(entryValue, `${label} ${key}`);
  }
  return safe;
}

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  const record = Object.create(null) as Record<string, unknown>;
  for (const [key, entryValue] of dataEntriesFromObject(value, label)) {
    record[key] = entryValue;
  }
  return record;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function sanitizeJsonValue(value: unknown, label: string): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    assertAgentSecretSafeText(value, `${label} text`);
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be JSON-compatible.`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return sanitizeJsonArray(value, label);
  }

  if (typeof value === "object" && value !== null) {
    return Object.freeze(sanitizePlainJsonObject(value, label));
  }

  throw new Error(`${label} must be JSON-compatible.`);
}

function sanitizeJsonArray(value: unknown, label: string): readonly unknown[] {
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
    safe.push(sanitizeJsonValue(descriptor.value, `${label} item`));
  }

  return Object.freeze(safe);
}

function dataEntriesFromObject(value: unknown, label: string): Array<readonly [string, unknown]> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) {
    throw new Error(`${label} must be a plain JSON object.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must not contain symbol-keyed fields.`);
  }

  const entries: Array<readonly [string, unknown]> = [];
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    assertSafeDtoKey(key, `${label} key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`${label} must not contain accessors.`);
    }
    if (!descriptor.enumerable) {
      throw new Error(`${label} must not contain hidden fields.`);
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function sanitizeEventIds(value: unknown, label: string): string[] | undefined {
  return sanitizeValidatedStringArray(value, label, (item) => {
    if (!eventIdPattern.test(item)) {
      throw new Error(`${label} must be a valid event ID.`);
    }
  });
}

function sanitizeRequiredEventIds(value: unknown, label: string): string[] {
  const eventIds = sanitizeEventIds(value, label);
  if (eventIds === undefined) {
    throw new Error(`${label} list is required.`);
  }
  return eventIds;
}

function sanitizeArtifactHashes(value: unknown, label: string): string[] | undefined {
  return sanitizeValidatedStringArray(value, label, (item) => {
    if (!artifactHashPattern.test(item)) {
      throw new Error(`${label} must be a valid artifact hash.`);
    }
  });
}

function sanitizeRequiredArtifactHashes(value: unknown, label: string): string[] {
  const artifactHashes = sanitizeArtifactHashes(value, label);
  if (artifactHashes === undefined) {
    throw new Error(`${label} list is required.`);
  }
  return artifactHashes;
}

function sanitizeRelatedIds(value: unknown, label: string): string[] | undefined {
  return sanitizeValidatedStringArray(value, label, () => undefined);
}

function sanitizeValidatedStringArray(
  value: unknown,
  label: string,
  validate: (item: string) => void
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = sanitizeJsonArray(value, `${label} list`);
  const strings: string[] = [];
  for (const item of values) {
    assertNonEmptySecretSafeString(item, label);
    validate(item);
    strings.push(item);
  }
  return strings;
}

function optionalSecretSafeString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertNonEmptySecretSafeString(value, label);
  return value;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isArrayIndexName(value: string): boolean {
  if (!arrayIndexNamePattern.test(value)) {
    return false;
  }
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === value;
}

function normalizeAndValidateFakeToolResult(result: unknown): AgentToolResult {
  const record = dataRecordFromObject(result, "fake tool result");
  rejectUnsupportedKeys(record, ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"], "fake tool result");
  const eventIds = sanitizeRequiredEventIds(record.eventIds, "fake tool result event id");
  const artifactHashes = sanitizeRequiredArtifactHashes(record.artifactHashes, "fake tool result artifact hash");
  const readModelChanges = sanitizeReadModelChanges(record.readModelChanges);
  let resultSummary: string | undefined;

  if (Object.hasOwn(record, "resultSummary")) {
    assertNonEmptySecretSafeString(record.resultSummary, "fake tool result summary");
    resultSummary = record.resultSummary;
  }

  return Object.freeze({
    eventIds,
    artifactHashes,
    readModelChanges,
    ...(resultSummary === undefined ? {} : { resultSummary })
  });
}

function sanitizeReadModelChanges(value: unknown): AgentToolReadModelChange[] {
  const values = sanitizeJsonArray(value, "fake tool result read model changes");
  return values.map(normalizeReadModelChange);
}

function normalizeReadModelChange(change: unknown): AgentToolReadModelChange {
  if (typeof change === "string") {
    assertNonEmptySecretSafeString(change, "fake tool result read model change");
    return {
      projectionName: fakeReadModelProjectionName,
      change
    };
  }

  const record = dataRecordFromObject(change, "fake tool result read model change");
  rejectUnsupportedKeys(record, ["projectionName", "change", "relatedIds"], "fake tool result read model change");
  assertNonEmptySecretSafeString(record.projectionName, "fake tool result projection name");
  assertNonEmptySecretSafeString(record.change, "fake tool result read model change");
  const relatedIds = sanitizeRelatedIds(record.relatedIds, "fake tool result related id");

  return {
    projectionName: record.projectionName,
    change: record.change,
    ...(relatedIds === undefined ? {} : { relatedIds })
  };
}

function assertNonEmptySecretSafeString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, label);
}

function assertSafeDtoKey(value: string, label: string): void {
  assertAgentSecretSafeText(value, label);
  if (unsafeDtoKeys.has(value)) {
    throw new Error(`${label} must be safe.`);
  }
  if (isSecretShapedDtoKey(value)) {
    throw new Error(`${label} must be secret-safe.`);
  }
}

function isSecretShapedDtoKey(value: string): boolean {
  const segments = normalizeDtoKeySegments(value);
  if (segments.some((segment) => secretShapedDtoKeyTerms.has(segment))) {
    return true;
  }

  return hasKeySegments(segments, "api", "key") ||
    hasKeySegments(segments, "access", "key") ||
    hasKeySegments(segments, "private", "key");
}

function normalizeDtoKeySegments(value: string): string[] {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0);
}

function hasKeySegments(segments: readonly string[], ...requiredSegments: readonly string[]): boolean {
  return requiredSegments.every((segment) => segments.includes(segment));
}

async function failForInvalidFakeToolResult(
  gateway: ReturnType<typeof createAgentToolGateway>,
  toolRequestId: string
): Promise<void> {
  await gateway.failTool({
    toolRequestId,
    category: "model-output-invalid",
    message: invalidFakeToolResultMessage,
    retryable: false,
    allowedActions: ["inspect the fake executor result mapper", "rerun with a schema-valid fake result"]
  });
}

async function failForActiveLocks(
  gateway: ReturnType<typeof createAgentToolGateway>,
  toolRequestId: string,
  activeLocks: readonly FakeAgentActiveLock[]
): Promise<void> {
  try {
    sanitizeActiveLocks(activeLocks);
  } catch {
    await gateway.failTool({
      toolRequestId,
      category: "secret-detected",
      message: "Active lock metadata was not secret-safe.",
      retryable: false,
      allowedActions: ["inspect secret-safe lock diagnostics"]
    });
    throw new Error("Active lock metadata was not secret-safe.");
  }

  // Queue DTOs expose generic "lock-active"; gateway failure events stay on
  // "legal-lock-active" until the ontology adds a broader failure category.
  await gateway.failTool({
    toolRequestId,
    category: "legal-lock-active",
    message: "Active legal export or data-loss lock blocks resume.",
    retryable: false,
    allowedActions: ["clear the lock through the human-governed domain workflow"]
  });
}

function sanitizeActiveLocks(activeLocks: unknown): readonly FakeAgentActiveLock[] {
  const locks = sanitizeJsonArray(activeLocks, "active locks");
  return locks.map((lock) => {
    const record = dataRecordFromObject(lock, "active lock");
    rejectUnsupportedKeys(record, ["lockId", "category", "message"], "active lock");
    assertNonEmptySecretSafeString(record.lockId, "active lock id");
    assertNonEmptySecretSafeString(record.category, "active lock category");
    assertNonEmptySecretSafeString(record.message, "active lock message");

    return Object.freeze({
      lockId: record.lockId,
      category: record.category,
      message: record.message
    });
  });
}

function assertRequestOpenForResume(state: ToolRequestState): void {
  if (state.denial !== undefined) {
    throw new Error("Denied tool requests cannot resume.");
  }
  if (state.completed !== undefined) {
    throw new Error("Completed tool requests cannot resume.");
  }
  if (state.failure !== undefined) {
    throw new Error("Failed tool requests cannot resume.");
  }
}

function isStoredApprovalUsable(
  approval: KnowledgeEventOf<"agent.tool.approved">,
  request: KnowledgeEventOf<"agent.tool.requested">,
  runtimeActorId: string
): boolean {
  return approval.context.actor.kind === "human" &&
    approval.context.actor.id === approval.payload.approvedBy &&
    approval.context.causationId === request.id &&
    approval.payload.approvalClass === request.payload.requiredApprovalClass &&
    approval.payload.approvedPreviewHash === request.payload.previewHash &&
    approval.context.actor.id !== request.payload.requestedBy &&
    approval.context.actor.id !== runtimeActorId;
}

async function readToolRequestState(ledger: EventLedger, toolRequestId: string): Promise<ToolRequestState> {
  const events = (await ledger.readStream(toolRequestStreamId(toolRequestId))).filter(isToolRequestEvent);
  const request = events.find((event): event is KnowledgeEventOf<"agent.tool.requested"> => event.type === "agent.tool.requested");

  if (request === undefined) {
    throw new Error("Tool request was not found.");
  }

  const approval = lastOfType(events, "agent.tool.approved");
  const denial = lastOfType(events, "agent.tool.denied");
  const completed = lastOfType(events, "agent.tool.completed");
  const failure = lastOfType(events, "agent.tool.failed");

  return {
    request,
    ...(approval === undefined ? {} : { approval }),
    ...(denial === undefined ? {} : { denial }),
    ...(completed === undefined ? {} : { completed }),
    ...(failure === undefined ? {} : { failure })
  };
}

function toolRequestStreamId(toolRequestId: string): string {
  return `agent_tool_request_${toolRequestId}`;
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
