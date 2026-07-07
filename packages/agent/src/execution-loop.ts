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
  readonly currentPreviewHash: string;
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

const defaultResidentAgentId = "agent_default";
const fakeReadModelProjectionName = "fake-agent-execution-loop";

export function createFakeAgentExecutionLoop(input: CreateFakeAgentExecutionLoopInput) {
  const gateway = createAgentToolGateway({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now
  });
  const residentAgentId = input.residentAgentId ?? defaultResidentAgentId;
  const requestedInputs = new Map<string, RequestFakeAgentApprovalInput>();

  return Object.freeze({
    async requestApprovalOnly(command: RequestFakeAgentApprovalInput): Promise<WaitingForApprovalResult> {
      const requested = await gateway.requestTool({
        toolRequestId: command.toolRequestId,
        residentAgentId,
        taskId: command.taskId,
        runId: command.runId,
        toolId: command.toolId,
        toolVersion: String(command.toolVersion ?? "0.1.0"),
        sideEffectClass: command.sideEffectClass,
        requiredApprovalClass: command.approvalClass as NonNullable<RequestAgentToolInput["requiredApprovalClass"]>,
        preview: command.preview,
        ...(command.scope === undefined ? {} : { scope: command.scope }),
        ...(command.estimatedEffect === undefined ? {} : { estimatedEffect: command.estimatedEffect }),
        ...(command.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: command.inputArtifactHashes })
      });
      requestedInputs.set(command.toolRequestId, command);

      return Object.freeze({
        state: "waiting-for-approval" as const,
        toolRequestId: requested.payload.toolRequestId,
        previewHash: requested.payload.previewHash,
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

      if (
        command.currentPreviewHash !== state.request.payload.previewHash ||
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
      const registeredRequest = requestedInputs.get(command.toolRequestId);
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
          ...(registeredRequest === undefined ? {} : { taskId: registeredRequest.taskId })
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
