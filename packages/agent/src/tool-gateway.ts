import { createHash } from "node:crypto";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { AppendOptions, EventLedger } from "../../ontology/src/event-ledger.js";
import { approvalClassForSideEffect, type AgentApprovalClass } from "./permission-policy.js";
import type { AgentToolSideEffectClass } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import {
  isResidentLoopSchedulerCompletionEvidence,
  type ResidentLoopSchedulerCompletionEvidence
} from "./resident-loop-scheduler-completion.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;
const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const artifactHashPattern = /^sha256:[a-f0-9]{64}$/;
const arrayIndexNamePattern = /^(0|[1-9]\d*)$/;
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

export interface CreateAgentToolGatewayInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
}

export interface AgentToolPreview {
  readonly summary: string;
  readonly relatedEventIds?: readonly string[];
  readonly artifactHashes?: readonly string[];
  readonly scope?: string;
  readonly estimatedEffect?: string;
  readonly [key: string]: unknown;
}

export interface RequestAgentToolInput {
  readonly toolRequestId: string;
  readonly residentAgentId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly toolId: string;
  readonly toolVersion?: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly preview: AgentToolPreview;
  readonly requiredApprovalClass?: AgentApprovalClass;
  readonly scope?: string;
  readonly estimatedEffect?: string;
  readonly inputArtifactHashes?: readonly string[];
  readonly residentSourceBoundary?: ResidentSourceBoundaryBinding;
}

/** Durable, path-free authority binding for a resident source boundary request. */
export interface ResidentSourceBoundaryBinding {
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly manifestArtifactHash: `sha256:${string}`;
  readonly manifestHash: `sha256:${string}`;
  readonly regularFileCount: number;
  readonly includedFileCount: number;
  readonly excludedFileCount: number;
  readonly totalBytes: number;
}

export interface ApproveAgentToolInput {
  readonly toolRequestId: string;
  readonly approvedPreviewHash: string;
  readonly actor: ActorRef;
  readonly rationale: string;
  readonly expectedGlobalEventCount?: number;
}

export interface DenyAgentToolInput {
  readonly toolRequestId: string;
  readonly actor: ActorRef;
  readonly rationale: string;
}

export interface ClaimAgentToolExecutionInput {
  readonly toolRequestId: string;
  readonly approvedPreviewHash: string;
  readonly leaseExpiresAt: string;
}

export interface AgentToolReadModelChange {
  readonly projectionName: string;
  readonly change: string;
  readonly relatedIds?: readonly string[];
}

export interface AgentToolResult {
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly string[];
  readonly readModelChanges: readonly AgentToolReadModelChange[];
  readonly resultSummary?: string;
}

export interface CompleteAgentToolInput {
  readonly toolRequestId: string;
  readonly approvedPreviewHash?: string;
  readonly result: AgentToolResult;
}

export type AgentToolFailureCategory =
  | "provider-unavailable"
  | "provider-rate-limited"
  | "credential-missing"
  | "credential-revoked"
  | "approval-required"
  | "approval-denied"
  | "approval-stale"
  | "permission-denied"
  | "secret-detected"
  | "legal-lock-active"
  | "lock-active"
  | "projection-lag"
  | "context-budget-exceeded"
  | "missing-provenance"
  | "provenance-missing"
  | "model-output-invalid"
  | "domain-gate-failed"
  | "stale-source"
  | "external-effect-failed"
  | "data-loss-risk";

export interface FailAgentToolInput {
  readonly toolRequestId: string;
  readonly category: AgentToolFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

export function createAgentToolGateway(input: CreateAgentToolGatewayInput) {
  const gateway = {
    async requestTool(command: RequestAgentToolInput) {
      await assertNewToolRequest(input.ledger, command.toolRequestId);
      const preview = sanitizeAgentToolPreview(command.preview);
      const previewHash = hashAgentToolPreview(preview);
      const requiredApprovalClass = command.requiredApprovalClass ?? approvalClassForSideEffect(command.sideEffectClass);
      const scope = command.scope ?? preview.scope ?? preview.summary;
      const estimatedEffect = command.estimatedEffect ?? preview.estimatedEffect ?? preview.summary;
      assertNonEmptySecretSafeString(scope, "tool request scope");
      assertNonEmptySecretSafeString(estimatedEffect, "tool request estimated effect");
      const sourceEventIds = sanitizeEventIds(preview.relatedEventIds, "preview related event id");
      const inputArtifactHashes = sanitizeArtifactHashes(
        command.inputArtifactHashes ?? preview.artifactHashes,
        "input artifact hash"
      );
      const residentSourceBoundary = command.residentSourceBoundary === undefined
        ? undefined
        : copyResidentSourceBoundaryBinding(command.residentSourceBoundary);
      const event: AppendableKnowledgeEvent<"agent.tool.requested"> = {
        type: "agent.tool.requested",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`),
        payload: {
          toolRequestId: command.toolRequestId,
          runId: command.runId,
          toolId: command.toolId,
          toolVersion: command.toolVersion ?? "0.1.0",
          requestedBy: command.residentAgentId,
          sideEffectClass: command.sideEffectClass,
          requiredApprovalClass,
          previewHash,
          scope,
          estimatedEffect,
          ...optionalArray("sourceEventIds", sourceEventIds),
          ...optionalArray("inputArtifactHashes", inputArtifactHashes),
          ...(residentSourceBoundary === undefined ? {} : { residentSourceBoundary })
        }
      };
      return appendToolEvent(input.ledger, event, { expectedNextSequence: 1 });
    },

    async approveTool(command: ApproveAgentToolInput) {
      if (command.actor.kind !== "human") {
        throw new Error("Tool approval requires a human actor.");
      }
      assertAgentSecretSafeText(command.rationale, "approval rationale");

      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      assertNotClosed(state);
      if (state.request.payload.requiredApprovalClass === "none") {
        throw new Error("Tool request does not require human approval.");
      }
      assertIndependentApprovalActor(command.actor, state.request.payload.requestedBy, input.actor.id);
      assertFreshPreviewHash(command.approvedPreviewHash, state.request.payload.previewHash);

      const event: AppendableKnowledgeEvent<"agent.tool.approved"> = {
        type: "agent.tool.approved",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`, command.actor, state.request.id),
        payload: {
          toolRequestId: command.toolRequestId,
          approvedBy: command.actor.id,
          approvedPreviewHash: command.approvedPreviewHash,
          approvalClass: state.request.payload.requiredApprovalClass,
          rationale: command.rationale,
          approvedAt: input.now()
        }
      };
      return appendToolEvent(input.ledger, event, {
        ...nextToolRequestAppendOptions(state),
        ...(command.expectedGlobalEventCount === undefined
          ? {}
          : { expectedGlobalEventCount: command.expectedGlobalEventCount })
      });
    },

    async denyTool(command: DenyAgentToolInput) {
      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      if (command.actor.kind !== "human" && command.actor.kind !== "system") {
        throw new Error("Tool denial requires a human or policy actor.");
      }
      if (state.request.payload.residentSourceBoundary !== undefined && command.actor.kind !== "human") {
        throw new Error("Resident source boundary denial requires a human actor.");
      }
      assertAgentSecretSafeText(command.rationale, "denial rationale");
      assertNotTerminal(state, "denied");

      const event: AppendableKnowledgeEvent<"agent.tool.denied"> = {
        type: "agent.tool.denied",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`, command.actor, state.latest.id),
        payload: {
          toolRequestId: command.toolRequestId,
          deniedBy: command.actor.id,
          rationale: command.rationale,
          deniedAt: input.now(),
          approvalClass: state.request.payload.requiredApprovalClass
        }
      };
      return appendToolEvent(input.ledger, event, nextToolRequestAppendOptions(state));
    },

    async claimExecution(command: ClaimAgentToolExecutionInput) {
      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      assertNotClosed(state);
      const claimedAt = input.now();

      if (state.request.payload.requiredApprovalClass === "none") {
        throw new Error("Tool execution claims require an approved tool request.");
      }
      if (state.approval === undefined) {
        throw new Error("Human approval is required before claiming this tool request.");
      }
      assertStoredApprovalUsable(state.approval, state.request, input.actor.id);
      assertFreshPreviewHash(command.approvedPreviewHash, state.request.payload.previewHash);
      assertLeaseExpiresAfterClaim(command.leaseExpiresAt, claimedAt);

      if (state.executionClaim !== undefined && !executionClaimLeaseExpired(state.executionClaim, claimedAt)) {
        throw new Error("Tool execution is already claimed until its lease expires.");
      }

      const event: AppendableKnowledgeEvent<"agent.tool.execution.claimed"> = {
        type: "agent.tool.execution.claimed",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`, input.actor, state.latest.id),
        payload: {
          toolRequestId: command.toolRequestId,
          claimedBy: input.actor.id,
          claimedAt,
          approvedPreviewHash: command.approvedPreviewHash,
          leaseExpiresAt: command.leaseExpiresAt
        }
      };
      return appendToolEvent(input.ledger, event, nextToolRequestAppendOptions(state));
    },

    async completeTool(command: CompleteAgentToolInput) {
      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      assertNotClosed(state);

      const requestPreviewHash = state.request.payload.previewHash;
      const requiresApproval = state.request.payload.requiredApprovalClass !== "none";
      if (requiresApproval) {
        if (state.approval === undefined) {
          throw new Error("Human approval is required before completing this tool request.");
        }
        if (command.approvedPreviewHash === undefined) {
          throw new Error("Approved preview hash is required before completing this tool request.");
        }
        assertStoredApprovalUsable(state.approval, state.request, input.actor.id);
        assertFreshPreviewHash(command.approvedPreviewHash, requestPreviewHash);
      } else {
        if (state.approval !== undefined) {
          throw new Error("No-approval tool requests cannot consume approval events.");
        }
        if (command.approvedPreviewHash !== undefined) {
          assertFreshPreviewHash(command.approvedPreviewHash, requestPreviewHash);
        }
      }

      const result = sanitizeAgentToolResult(command.result);
      for (const change of result.readModelChanges) {
        assertAgentSecretSafeText(change.projectionName, "read model projection name");
        assertAgentSecretSafeText(change.change, "read model change");
      }
      const resultSummary = result.resultSummary ?? "Tool completed.";
      assertAgentSecretSafeText(resultSummary, "tool result summary");

      const event: AppendableKnowledgeEvent<"agent.tool.completed"> = {
        type: "agent.tool.completed",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(
          input,
          `corr_${command.toolRequestId}`,
          input.actor,
          state.latest.id
        ),
        payload: {
          toolRequestId: command.toolRequestId,
          completedAt: input.now(),
          eventIds: [...result.eventIds],
          artifactHashes: [...result.artifactHashes],
          readModelChanges: result.readModelChanges.map((change) => ({
            projectionName: change.projectionName,
            change: change.change,
            ...optionalArray("relatedIds", change.relatedIds)
          })),
          resultSummary
        }
      };
      return appendToolEvent(input.ledger, event, nextToolRequestAppendOptions(state));
    },

    async completeToolFromSchedulerEvidence(evidence: ResidentLoopSchedulerCompletionEvidence) {
      if (!isResidentLoopSchedulerCompletionEvidence(evidence)) {
        throw new Error("Scheduler completion requires exact reread evidence.");
      }
      const state = await readToolRequestState(input.ledger, evidence.toolRequestId);
      assertNotClosed(state);
      if (state.request.payload.runId !== evidence.runId) {
        throw new Error("Scheduler completion run does not match the tool request.");
      }
      if (
        state.executionClaim === undefined ||
        state.executionClaim.id !== evidence.executionClaimEventId ||
        state.executionClaim.payload.toolRequestId !== evidence.toolRequestId ||
        state.executionClaim.payload.approvedPreviewHash !== state.request.payload.previewHash
      ) {
        throw new Error("Scheduler completion requires the exact durable execution claim.");
      }
      return await gateway.completeTool({
        toolRequestId: evidence.toolRequestId,
        approvedPreviewHash: evidence.approvedPreviewHash,
        result: evidence.result
      });
    },

    async failTool(command: FailAgentToolInput) {
      assertAgentSecretSafeText(command.message, "tool failure message");
      for (const action of command.allowedActions) {
        assertAgentSecretSafeText(action, "tool failure allowed action");
      }

      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      assertNotTerminal(state, "marked failed");

      const event: AppendableKnowledgeEvent<"agent.tool.failed"> = {
        type: "agent.tool.failed",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`, input.actor, state.latest.id),
        payload: {
          toolRequestId: command.toolRequestId,
          failedAt: input.now(),
          category: command.category,
          message: command.message,
          retryable: command.retryable,
          allowedActions: [...command.allowedActions]
        }
      };
      return appendToolEvent(input.ledger, event, nextToolRequestAppendOptions(state));
    }
  };

  const { completeTool: _structuralCompletion, ...publicGateway } = gateway;
  return Object.freeze(publicGateway);
}

function copyResidentSourceBoundaryBinding(value: ResidentSourceBoundaryBinding): ResidentSourceBoundaryBinding {
  const record = dataRecordFromObject(value, "resident source boundary binding");
  rejectUnsupportedKeys(record, [
    "workflowId", "workspaceId", "sourceCollectionId", "sourceIdentity", "sourceRootHash",
    "discoveryArtifactHash", "discoveryHash", "manifestArtifactHash", "manifestHash",
    "regularFileCount", "includedFileCount", "excludedFileCount", "totalBytes"
  ], "resident source boundary binding");
  for (const key of ["workflowId", "workspaceId", "sourceCollectionId", "sourceIdentity"] as const) {
    assertNonEmptySecretSafeString(record[key], `resident source boundary ${key}`);
    if (typeof record[key] !== "string" || /[\\/]/.test(record[key])) {
      throw new Error(`resident source boundary ${key} must be a path-free identifier.`);
    }
  }
  for (const key of ["sourceRootHash", "discoveryArtifactHash", "discoveryHash", "manifestArtifactHash", "manifestHash"] as const) {
    if (typeof record[key] !== "string" || !artifactHashPattern.test(record[key])) {
      throw new Error(`resident source boundary ${key} must be a sha256 hash.`);
    }
  }
  for (const key of ["regularFileCount", "includedFileCount", "excludedFileCount", "totalBytes"] as const) {
    if (!Number.isSafeInteger(record[key]) || (record[key] as number) < 0) throw new Error(`resident source boundary ${key} must be non-negative.`);
  }
  if (record.regularFileCount !== (record.includedFileCount as number) + (record.excludedFileCount as number)) {
    throw new Error("resident source boundary counts must partition regular files.");
  }
  return Object.freeze({
    workflowId: record.workflowId as string,
    workspaceId: record.workspaceId as string,
    sourceCollectionId: record.sourceCollectionId as string,
    sourceIdentity: record.sourceIdentity as string,
    sourceRootHash: record.sourceRootHash as `sha256:${string}`,
    discoveryArtifactHash: record.discoveryArtifactHash as `sha256:${string}`,
    discoveryHash: record.discoveryHash as `sha256:${string}`,
    manifestArtifactHash: record.manifestArtifactHash as `sha256:${string}`,
    manifestHash: record.manifestHash as `sha256:${string}`,
    regularFileCount: record.regularFileCount as number,
    includedFileCount: record.includedFileCount as number,
    excludedFileCount: record.excludedFileCount as number,
    totalBytes: record.totalBytes as number
  });
}

export function hashAgentToolPreview(preview: AgentToolPreview): `sha256:${string}` {
  const safePreview = sanitizeAgentToolPreview(preview);
  const digest = createHash("sha256").update(stableJsonStringify(safePreview)).digest("hex");
  return `sha256:${digest}`;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stabilizeJsonValue(value));
}

function stabilizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stabilizeJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const stable = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      stable[key] = stabilizeJsonValue(record[key]);
    }
    return stable;
  }

  return value;
}

function sanitizeAgentToolPreview(preview: AgentToolPreview): AgentToolPreview {
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

function sanitizeAgentToolResult(result: AgentToolResult): AgentToolResult {
  const record = dataRecordFromObject(result, "tool result");
  rejectUnsupportedKeys(record, ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"], "tool result");
  const eventIds = sanitizeRequiredEventIds(record.eventIds, "tool result event id");
  const artifactHashes = sanitizeRequiredArtifactHashes(record.artifactHashes, "tool result artifact hash");
  const readModelChanges = sanitizeReadModelChanges(record.readModelChanges);
  let resultSummary: string | undefined;

  if (Object.hasOwn(record, "resultSummary")) {
    assertNonEmptySecretSafeString(record.resultSummary, "tool result summary");
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
  const values = sanitizeJsonArray(value, "tool result read model changes");
  return values.map((item) => {
    const change = dataRecordFromObject(item, "tool result read model change");
    rejectUnsupportedKeys(change, ["projectionName", "change", "relatedIds"], "tool result read model change");
    assertNonEmptySecretSafeString(change.projectionName, "read model projection name");
    assertNonEmptySecretSafeString(change.change, "read model change");
    const relatedIds = sanitizeRelatedIds(change.relatedIds, "read model related id");

    return {
      projectionName: change.projectionName,
      change: change.change,
      ...(relatedIds === undefined ? {} : { relatedIds })
    };
  });
}

function sanitizePlainJsonObject(value: unknown, label: string): Record<string, unknown> {
  const safe = Object.create(null) as Record<string, unknown>;
  for (const [key, entryValue] of dataEntriesFromObject(value, label)) {
    safe[key] = sanitizeJsonValue(entryValue, `${label} ${key}`);
  }
  return safe;
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

function dataRecordFromObject(value: unknown, label: string): Record<string, unknown> {
  const record = Object.create(null) as Record<string, unknown>;
  for (const [key, entryValue] of dataEntriesFromObject(value, label)) {
    record[key] = entryValue;
  }
  return record;
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

function rejectUnsupportedKeys(record: Record<string, unknown>, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function sanitizeRequiredEventIds(value: unknown, label: string): string[] {
  const eventIds = sanitizeEventIds(value, label);
  if (eventIds === undefined) {
    throw new Error(`${label} list is required.`);
  }
  return eventIds;
}

function sanitizeEventIds(value: unknown, label: string): string[] | undefined {
  return sanitizeValidatedStringArray(value, label, (item) => {
    if (!eventIdPattern.test(item)) {
      throw new Error(`${label} must be a valid event ID.`);
    }
  });
}

function sanitizeRequiredArtifactHashes(value: unknown, label: string): string[] {
  const hashes = sanitizeArtifactHashes(value, label);
  if (hashes === undefined) {
    throw new Error(`${label} list is required.`);
  }
  return hashes;
}

function sanitizeArtifactHashes(value: unknown, label: string): string[] | undefined {
  return sanitizeValidatedStringArray(value, label, (item) => {
    if (!artifactHashPattern.test(item)) {
      throw new Error(`${label} must be a valid artifact hash.`);
    }
  });
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

function agentContext(input: CreateAgentToolGatewayInput, correlationId: string, actor = input.actor, causationId?: string) {
  return {
    actor,
    occurredAt: input.now(),
    correlationId,
    coreVersion: agentCoreVersion,
    packVersions: agentPackVersions,
    ...(causationId === undefined ? {} : { causationId })
  };
}

function optionalArray<Key extends string, Value>(key: Key, values: readonly Value[] | undefined): { [Property in Key]?: Value[] } {
  return values === undefined ? {} : { [key]: [...values] } as { [Property in Key]?: Value[] };
}

function toolRequestStreamId(toolRequestId: string): string {
  return `agent_tool_request_${toolRequestId}`;
}

async function appendToolEvent<Type extends ToolRequestEvent["type"]>(
  ledger: EventLedger,
  event: AppendableKnowledgeEvent<Type>,
  options?: AppendOptions
): Promise<KnowledgeEventOf<Type>> {
  return await ledger.append(event, options) as KnowledgeEventOf<Type>;
}

interface ToolRequestState {
  readonly request: KnowledgeEventOf<"agent.tool.requested">;
  readonly approval?: KnowledgeEventOf<"agent.tool.approved">;
  readonly executionClaim?: KnowledgeEventOf<"agent.tool.execution.claimed">;
  readonly denial?: KnowledgeEventOf<"agent.tool.denied">;
  readonly completed?: KnowledgeEventOf<"agent.tool.completed">;
  readonly failure?: KnowledgeEventOf<"agent.tool.failed">;
  readonly latest: ToolRequestEvent;
}

type ToolRequestEvent =
  | KnowledgeEventOf<"agent.tool.requested">
  | KnowledgeEventOf<"agent.tool.approved">
  | KnowledgeEventOf<"agent.tool.execution.claimed">
  | KnowledgeEventOf<"agent.tool.denied">
  | KnowledgeEventOf<"agent.tool.completed">
  | KnowledgeEventOf<"agent.tool.failed">;

async function assertNewToolRequest(ledger: EventLedger, toolRequestId: string): Promise<void> {
  const events = await ledger.readStream(toolRequestStreamId(toolRequestId));
  if (events.some((event) => event.type === "agent.tool.requested")) {
    throw new Error("Tool request already exists; create a new toolRequestId for a changed preview.");
  }
}

async function readToolRequestState(ledger: EventLedger, toolRequestId: string): Promise<ToolRequestState> {
  const events = (await ledger.readStream(toolRequestStreamId(toolRequestId))).filter(isToolRequestEvent);
  const request = events.find((event): event is KnowledgeEventOf<"agent.tool.requested"> => event.type === "agent.tool.requested");

  if (request === undefined) {
    throw new Error("Tool request was not found.");
  }

  const approval = lastOfType(events, "agent.tool.approved");
  const executionClaim = lastOfType(events, "agent.tool.execution.claimed");
  const denial = lastOfType(events, "agent.tool.denied");
  const completed = lastOfType(events, "agent.tool.completed");
  const failure = lastOfType(events, "agent.tool.failed");

  return {
    request,
    latest: events.at(-1) ?? request,
    ...(approval === undefined ? {} : { approval }),
    ...(executionClaim === undefined ? {} : { executionClaim }),
    ...(denial === undefined ? {} : { denial }),
    ...(completed === undefined ? {} : { completed }),
    ...(failure === undefined ? {} : { failure })
  };
}

function nextToolRequestAppendOptions(state: ToolRequestState): AppendOptions {
  return { expectedNextSequence: state.latest.sequence + 1 };
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

function assertNotClosed(state: ToolRequestState): void {
  if (state.denial !== undefined) {
    throw new Error("Tool request was denied and cannot complete.");
  }
  if (state.failure !== undefined) {
    throw new Error("Tool request failed and cannot complete.");
  }
  if (state.completed !== undefined) {
    throw new Error("Tool request already completed.");
  }
}

function assertNotTerminal(state: ToolRequestState, action: string): void {
  if (state.completed !== undefined) {
    throw new Error(`Completed tool requests cannot be ${action}.`);
  }
  if (state.denial !== undefined) {
    throw new Error(`Denied tool requests cannot be ${action}.`);
  }
  if (state.failure !== undefined) {
    throw new Error(`Failed tool requests cannot be ${action}.`);
  }
}

function assertFreshPreviewHash(candidateHash: string, expectedHash: string): void {
  if (candidateHash !== expectedHash) {
    throw new Error("Stale approval preview hash does not match the requested preview.");
  }
}

function assertLeaseExpiresAfterClaim(leaseExpiresAt: string, claimedAt: string): void {
  if (Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)) {
    throw new Error("Tool execution claim lease must expire after the claim time.");
  }
}

function executionClaimLeaseExpired(
  claim: KnowledgeEventOf<"agent.tool.execution.claimed">,
  now: string
): boolean {
  return Date.parse(claim.payload.leaseExpiresAt) <= Date.parse(now);
}

function assertIndependentApprovalActor(actor: ActorRef, requestedBy: string, gatewayActorId: string): void {
  if (actor.id === requestedBy || actor.id === gatewayActorId) {
    throw new Error("Tool approval requires an independent human actor.");
  }
}

function assertStoredApprovalUsable(
  approval: KnowledgeEventOf<"agent.tool.approved">,
  request: KnowledgeEventOf<"agent.tool.requested">,
  gatewayActorId: string
): void {
  if (
    approval.context.actor.kind !== "human" ||
    approval.context.actor.id !== approval.payload.approvedBy ||
    approval.context.causationId !== request.id ||
    approval.payload.approvalClass !== request.payload.requiredApprovalClass ||
    approval.payload.approvedPreviewHash !== request.payload.previewHash ||
    approval.context.actor.id === request.payload.requestedBy ||
    approval.context.actor.id === request.context.actor.id ||
    approval.context.actor.id === gatewayActorId
  ) {
    throw new Error("Stored tool approval is not usable.");
  }
}
