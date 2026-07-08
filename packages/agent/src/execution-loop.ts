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
  readonly taskId?: string;
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

interface StoredFakeToolRequestMetadata {
  readonly taskId: string;
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

export function createFakeAgentExecutionLoop(input: CreateFakeAgentExecutionLoopInput) {
  const gateway = createAgentToolGateway({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now
  });
  const residentAgentId = input.residentAgentId ?? defaultResidentAgentId;
  const requestMetadataById = new Map<string, StoredFakeToolRequestMetadata>();

  return Object.freeze({
    async requestApprovalOnly(command: RequestFakeAgentApprovalInput): Promise<WaitingForApprovalResult> {
      const toolVersion = String(command.toolVersion ?? "0.1.0");
      const canonicalPreview = buildCanonicalFakeToolPreview({
        toolRequestId: command.toolRequestId,
        residentAgentId,
        taskId: command.taskId,
        runId: command.runId,
        toolId: command.toolId,
        toolVersion,
        sideEffectClass: command.sideEffectClass,
        requiredApprovalClass: command.approvalClass,
        preview: command.preview,
        ...(command.scope === undefined ? {} : { scope: command.scope }),
        ...(command.estimatedEffect === undefined ? {} : { estimatedEffect: command.estimatedEffect }),
        ...(command.preview.relatedEventIds === undefined ? {} : { sourceEventIds: command.preview.relatedEventIds }),
        ...(command.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: command.inputArtifactHashes })
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
      requestMetadataById.set(command.toolRequestId, { taskId: command.taskId });

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
      if (approval.context.actor.kind !== "human") {
        await gateway.failTool({
          toolRequestId: command.toolRequestId,
          category: "permission-denied",
          message: "Tool resume requires an exact human approval.",
          retryable: false,
          allowedActions: ["request a human approval for the current preview"]
        });
        throw new Error("Tool resume requires an exact human approval.");
      }

      const requestMetadata = requestMetadataById.get(command.toolRequestId);
      if (requestMetadata === undefined) {
        await gateway.failTool({
          toolRequestId: command.toolRequestId,
          category: "approval-stale",
          message: "Tool request preview metadata is unavailable for resume.",
          retryable: false,
          allowedActions: ["rebuild the tool preview and request a new approval"]
        });
        throw new Error("Tool request preview metadata is unavailable for resume.");
      }
      const currentPreviewHash = hashStablePreview(buildCanonicalFakeToolPreview({
        toolRequestId: state.request.payload.toolRequestId,
        residentAgentId: state.request.payload.requestedBy,
        taskId: requestMetadata.taskId,
        runId: state.request.payload.runId,
        toolId: state.request.payload.toolId,
        toolVersion: state.request.payload.toolVersion,
        sideEffectClass: state.request.payload.sideEffectClass,
        requiredApprovalClass: state.request.payload.requiredApprovalClass,
        preview: command.currentPreview,
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
          taskId: requestMetadata.taskId
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

      const completed = await gateway.completeTool({
        toolRequestId: command.toolRequestId,
        approvedPreviewHash: approval.payload.approvedPreviewHash,
        result: normalizeFakeToolResult(fakeResult)
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
  const safeDisplayPreview = secretSafeJsonValue(input.preview);
  const inputArtifactHashes = input.inputArtifactHashes ?? input.preview.artifactHashes;
  const scope = input.scope ?? input.preview.scope ?? input.preview.summary;
  const estimatedEffect = input.estimatedEffect ?? input.preview.estimatedEffect ?? input.preview.summary;

  return Object.freeze({
    summary: input.preview.summary,
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
    ...(input.preview.affectedRefs === undefined ? {} : { affectedRefs: secretSafeJsonValue(input.preview.affectedRefs) }),
    ...(input.sourceEventIds === undefined ? {} : { relatedEventIds: [...input.sourceEventIds], sourceEventIds: [...input.sourceEventIds] }),
    ...(input.preview.artifactHashes === undefined ? {} : { artifactHashes: [...input.preview.artifactHashes] }),
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
    return value.map((item) => stabilizeJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const stable: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      stable[key] = stabilizeJsonValue(record[key]);
    }
    return stable;
  }

  return value;
}

function secretSafeJsonValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    assertAgentSecretSafeText(value, "preview text");
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => secretSafeJsonValue(item));
  }

  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throw new Error("Preview content must be JSON-compatible.");
    }

    const safe: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      assertAgentSecretSafeText(key, "preview key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error("Preview content must be JSON-compatible.");
      }
      safe[key] = secretSafeJsonValue(descriptor.value);
    }
    return safe;
  }

  throw new Error("Preview content must be JSON-compatible.");
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeFakeToolResult(result: FakeAgentToolExecutorResult): AgentToolResult {
  return {
    eventIds: [...result.eventIds],
    artifactHashes: [...result.artifactHashes],
    readModelChanges: result.readModelChanges.map(normalizeReadModelChange),
    ...(result.resultSummary === undefined ? {} : { resultSummary: result.resultSummary })
  };
}

function normalizeReadModelChange(change: string | AgentToolReadModelChange): AgentToolReadModelChange {
  if (typeof change === "string") {
    return {
      projectionName: fakeReadModelProjectionName,
      change
    };
  }

  return {
    projectionName: change.projectionName,
    change: change.change,
    ...(change.relatedIds === undefined ? {} : { relatedIds: [...change.relatedIds] })
  };
}

async function failForActiveLocks(
  gateway: ReturnType<typeof createAgentToolGateway>,
  toolRequestId: string,
  activeLocks: readonly FakeAgentActiveLock[]
): Promise<void> {
  for (const lock of activeLocks) {
    try {
      assertAgentSecretSafeText(lock.lockId, "active lock id");
      assertAgentSecretSafeText(lock.category, "active lock category");
      assertAgentSecretSafeText(lock.message, "active lock message");
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
