import { createHash } from "node:crypto";
import type { ActorRef, AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { AppendOptions, EventLedger } from "../../ontology/src/event-ledger.js";
import { approvalClassForSideEffect, type AgentApprovalClass } from "./permission-policy.js";
import type { AgentToolSideEffectClass } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";

const agentCoreVersion = "0.1.0";
const agentPackVersions = { core: "0.1.0", agent: "0.1.0" } as const;

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
}

export interface ApproveAgentToolInput {
  readonly toolRequestId: string;
  readonly approvedPreviewHash: string;
  readonly actor: ActorRef;
  readonly rationale: string;
}

export interface DenyAgentToolInput {
  readonly toolRequestId: string;
  readonly actor: ActorRef;
  readonly rationale: string;
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
  | "credential-missing"
  | "credential-revoked"
  | "approval-required"
  | "approval-stale"
  | "permission-denied"
  | "secret-detected"
  | "legal-lock-active"
  | "projection-lag"
  | "provenance-missing"
  | "model-output-invalid"
  | "external-effect-failed";

export interface FailAgentToolInput {
  readonly toolRequestId: string;
  readonly category: AgentToolFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

export function createAgentToolGateway(input: CreateAgentToolGatewayInput) {
  return {
    async requestTool(command: RequestAgentToolInput) {
      await assertNewToolRequest(input.ledger, command.toolRequestId);
      const previewHash = hashPreview(command.preview);
      const requiredApprovalClass = command.requiredApprovalClass ?? approvalClassForSideEffect(command.sideEffectClass);
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
          scope: command.scope ?? command.preview.scope ?? command.preview.summary,
          estimatedEffect: command.estimatedEffect ?? command.preview.estimatedEffect ?? command.preview.summary,
          ...optionalArray("sourceEventIds", command.preview.relatedEventIds),
          ...optionalArray("inputArtifactHashes", command.inputArtifactHashes ?? command.preview.artifactHashes)
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
      return appendToolEvent(input.ledger, event);
    },

    async denyTool(command: DenyAgentToolInput) {
      if (command.actor.kind !== "human" && command.actor.kind !== "system") {
        throw new Error("Tool denial requires a human or policy actor.");
      }
      assertAgentSecretSafeText(command.rationale, "denial rationale");

      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      if (state.completed !== undefined) {
        throw new Error("Completed tool requests cannot be denied.");
      }

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
      return appendToolEvent(input.ledger, event);
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
        assertFreshPreviewHash(command.approvedPreviewHash, requestPreviewHash);
        assertFreshPreviewHash(state.approval.payload.approvedPreviewHash, requestPreviewHash);
      } else if (command.approvedPreviewHash !== undefined) {
        assertFreshPreviewHash(command.approvedPreviewHash, requestPreviewHash);
      }

      for (const change of command.result.readModelChanges) {
        assertAgentSecretSafeText(change.projectionName, "read model projection name");
        assertAgentSecretSafeText(change.change, "read model change");
      }
      const resultSummary = command.result.resultSummary ?? "Tool completed.";
      assertAgentSecretSafeText(resultSummary, "tool result summary");

      const event: AppendableKnowledgeEvent<"agent.tool.completed"> = {
        type: "agent.tool.completed",
        version: 1,
        streamId: toolRequestStreamId(command.toolRequestId),
        context: agentContext(input, `corr_${command.toolRequestId}`, input.actor, state.approval?.id ?? state.request.id),
        payload: {
          toolRequestId: command.toolRequestId,
          completedAt: input.now(),
          eventIds: [...command.result.eventIds],
          artifactHashes: [...command.result.artifactHashes],
          readModelChanges: command.result.readModelChanges.map((change) => ({
            projectionName: change.projectionName,
            change: change.change,
            ...optionalArray("relatedIds", change.relatedIds)
          })),
          resultSummary
        }
      };
      return appendToolEvent(input.ledger, event);
    },

    async failTool(command: FailAgentToolInput) {
      assertAgentSecretSafeText(command.message, "tool failure message");
      for (const action of command.allowedActions) {
        assertAgentSecretSafeText(action, "tool failure allowed action");
      }

      const state = await readToolRequestState(input.ledger, command.toolRequestId);
      if (state.completed !== undefined) {
        throw new Error("Completed tool requests cannot be marked failed.");
      }

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
      return appendToolEvent(input.ledger, event);
    }
  };
}

function hashPreview(preview: AgentToolPreview): `sha256:${string}` {
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
  readonly denial?: KnowledgeEventOf<"agent.tool.denied">;
  readonly completed?: KnowledgeEventOf<"agent.tool.completed">;
  readonly failure?: KnowledgeEventOf<"agent.tool.failed">;
  readonly latest: ToolRequestEvent;
}

type ToolRequestEvent =
  | KnowledgeEventOf<"agent.tool.requested">
  | KnowledgeEventOf<"agent.tool.approved">
  | KnowledgeEventOf<"agent.tool.denied">
  | KnowledgeEventOf<"agent.tool.completed">
  | KnowledgeEventOf<"agent.tool.failed">;

async function assertNewToolRequest(ledger: EventLedger, toolRequestId: string): Promise<void> {
  const events = await ledger.readStream(toolRequestStreamId(toolRequestId));
  if (events.some((event) => event.type === "agent.tool.requested")) {
    throw new Error(`Tool request ${toolRequestId} already exists; create a new toolRequestId for a changed preview.`);
  }
}

async function readToolRequestState(ledger: EventLedger, toolRequestId: string): Promise<ToolRequestState> {
  const events = (await ledger.readStream(toolRequestStreamId(toolRequestId))).filter(isToolRequestEvent);
  const request = events.find((event): event is KnowledgeEventOf<"agent.tool.requested"> => event.type === "agent.tool.requested");

  if (request === undefined) {
    throw new Error(`Tool request ${toolRequestId} was not found.`);
  }

  const approval = lastOfType(events, "agent.tool.approved");
  const denial = lastOfType(events, "agent.tool.denied");
  const completed = lastOfType(events, "agent.tool.completed");
  const failure = lastOfType(events, "agent.tool.failed");

  return {
    request,
    latest: events.at(-1) ?? request,
    ...(approval === undefined ? {} : { approval }),
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

function assertFreshPreviewHash(candidateHash: string, expectedHash: string): void {
  if (candidateHash !== expectedHash) {
    throw new Error("Stale approval preview hash does not match the requested preview.");
  }
}
