import { isProxy } from "node:util/types";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { residentLoopStreamId } from "./plan-observation-contracts.js";
import type { AgentApprovalClass } from "./permission-policy.js";
import type { AgentToolSideEffectClass } from "./projection-types.js";
import {
  createResidentLoopSchedulerCompletionAdapter,
} from "./resident-loop-scheduler-completion.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import {
  createAgentToolGateway,
  type AgentToolReadModelChange,
  type AgentToolResult,
  type AgentToolPreview
} from "./tool-gateway.js";

type ResidentPlanEvent = KnowledgeEventOf<"agent.resident-plan.recorded.v1">;
type ToolRequestEvent = KnowledgeEventOf<"agent.tool.requested">;
type ToolApprovalEvent = KnowledgeEventOf<"agent.tool.approved">;
type ToolExecutionClaimEvent = KnowledgeEventOf<"agent.tool.execution.claimed">;
type ToolCompletionEvent = KnowledgeEventOf<"agent.tool.completed">;

const eventIdPattern = /^evt_[a-zA-Z0-9_-]+$/;
const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
const issuedReadbacks = new WeakSet<object>();
const issuedPlanBytes = new WeakMap<object, string>();
const residentGatewayActor = Object.freeze({ id: "agent_default", kind: "agent" as const, label: "Cestus Agent" });

export interface ResidentLoopToolGatewayInput {
  readonly ledger: EventLedger;
  readonly now: () => string;
}

export interface ResidentLoopToolRequestInput {
  readonly toolRequestId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly planRecordEventId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: string;
  readonly preview: {
    readonly summary: string;
    readonly scope: string;
    readonly estimatedEffect: string;
  };
}

export interface ResidentLoopToolGatewayReadback {
  readonly schemaVersion: "resident-loop-tool-gateway-readback.v1";
  readonly planRecordEventId: string;
  readonly requestEventId: string;
  readonly decisionEventId?: string;
  readonly executionClaimEventId?: string;
  readonly resultEventId?: string;
  readonly toolRequestId: string;
  readonly residentAgentId: "agent_default";
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly previewHash: string;
  readonly approvalClass: string;
  readonly approvedBy?: string;
  readonly policyHash: string;
  readonly authorityHash: string;
  readonly sourceEventIds: readonly string[];
  readonly contextArtifactHashes: readonly string[];
  readonly resultEvidenceEventIds?: readonly string[];
}

export function createResidentLoopToolGateway(input: ResidentLoopToolGatewayInput) {
  const completionAdapter = createResidentLoopSchedulerCompletionAdapter({ ledger: input.ledger });
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: residentGatewayActor, now: input.now });

  return Object.freeze({
    async requestAndReadback(value: ResidentLoopToolRequestInput): Promise<ResidentLoopToolGatewayReadback> {
      const command = copyRequest(value);
      const plan = await readCurrentPlan(input.ledger, command);
      const sourceEventIds = Object.freeze([plan.id, ...plan.payload.sourceEventIds]);
      const preview: AgentToolPreview = Object.freeze({
        summary: command.preview.summary,
        scope: command.preview.scope,
        estimatedEffect: command.preview.estimatedEffect,
        taskId: command.taskId,
        attemptId: command.attemptId,
        runId: command.runId,
        planRecordEventId: command.planRecordEventId,
        toolId: command.toolId,
        toolVersion: command.toolVersion,
        relatedEventIds: sourceEventIds,
        artifactHashes: plan.payload.contextArtifactHashes
      });
      const requested = await gateway.requestTool({
        toolRequestId: command.toolRequestId,
        residentAgentId: plan.payload.residentAgentId,
        taskId: command.taskId,
        runId: command.runId,
        toolId: command.toolId,
        toolVersion: command.toolVersion,
        sideEffectClass: command.sideEffectClass,
        requiredApprovalClass: command.approvalClass as AgentApprovalClass,
        preview,
        scope: command.preview.scope,
        estimatedEffect: command.preview.estimatedEffect,
        inputArtifactHashes: plan.payload.contextArtifactHashes
      });
      return issue(await readCurrentGatewayState(input, command, requested.id, "request", undefined, planBytes(plan)));
    },

    async readRequest(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback> {
      const issued = requireIssued(value, "request");
      return issue(await readCurrentGatewayState(input, issued, issued.requestEventId, "request", undefined, requiredPlanBytes(issued)));
    },

    async readDecision(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback> {
      const issued = requireIssued(value, "decision");
      return issue(await readCurrentGatewayState(input, issued, issued.requestEventId, "decision", undefined, requiredPlanBytes(issued)));
    },

    async executeAndReadback(
      value: ResidentLoopToolGatewayReadback,
      execute: (readback: ResidentLoopToolGatewayReadback) => Promise<AgentToolResult>
    ): Promise<ResidentLoopToolGatewayReadback> {
      const issued = requireIssued(value, "execution");
      if (typeof execute !== "function" || isProxy(execute)) {
        throw new Error("Resident-loop execution must be a non-proxy function.");
      }
      const beforeExecution = await readCurrentGatewayState(
        input, issued, issued.requestEventId, "claim", undefined, requiredPlanBytes(issued)
      );
      const rawResult = await execute(beforeExecution.readback);
      const afterExecution = await readCurrentGatewayState(
        input, beforeExecution.readback, beforeExecution.readback.requestEventId, "claim", undefined, beforeExecution.planBytes
      );
      const result = copyResult(rawResult);
      const evidence = await completionAdapter.reread({
        toolRequestId: afterExecution.readback.toolRequestId,
        runId: afterExecution.readback.runId,
        toolId: afterExecution.readback.toolId,
        toolVersion: afterExecution.readback.toolVersion,
        approvedPreviewHash: afterExecution.readback.previewHash,
        executionClaimEventId: requiredClaimEventId(afterExecution.readback),
        result
      });
      const completionGlobalEventCount = (await input.ledger.readAll()).length;
      const beforeCompletion = await readCurrentGatewayState(
        input, afterExecution.readback, afterExecution.readback.requestEventId, "claim", undefined, afterExecution.planBytes
      );
      const completionGateway = createAgentToolGateway({
        ledger: createCompletionGuardedLedger(input.ledger, completionGlobalEventCount),
        actor: residentGatewayActor,
        now: input.now
      });
      const completed = await completionGateway.completeToolFromSchedulerEvidence(evidence);
      return issue(await readCurrentGatewayState(
        input, beforeCompletion.readback, beforeCompletion.readback.requestEventId, "result", completed.id, beforeCompletion.planBytes
      ));
    },

    async readResult(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback> {
      const issued = requireIssued(value, "result");
      const resultEventId = issued.resultEventId;
      if (resultEventId === undefined) {
        throw new Error("Resident-loop result readback requires an issued completion readback.");
      }
      return issue(await readCurrentGatewayState(
        input, issued, issued.requestEventId, "result", resultEventId, requiredPlanBytes(issued)
      ));
    }
  });
}

type RequestSnapshot = Readonly<ResidentLoopToolRequestInput>;
interface CurrentGatewayState {
  readonly readback: ResidentLoopToolGatewayReadback;
  readonly planBytes: string;
}

function createCompletionGuardedLedger(ledger: EventLedger, expectedGlobalEventCount: number): EventLedger {
  return Object.freeze({
    async append(event, options) {
      if (options?.expectedGlobalEventCount !== undefined) {
        throw new Error("Resident-loop completion guard does not accept a second global ledger precondition.");
      }
      return await ledger.append(event, { ...options, expectedGlobalEventCount });
    },
    async readStream(streamId) {
      return await ledger.readStream(streamId);
    },
    async readAll() {
      return await ledger.readAll();
    }
  });
}

async function readCurrentGatewayState(
  input: ResidentLoopToolGatewayInput,
  binding: RequestSnapshot | ResidentLoopToolGatewayReadback,
  requestEventId: string,
  stage: "request" | "decision" | "claim" | "result",
  expectedResultEventId?: string,
  expectedPlanBytes?: string
): Promise<CurrentGatewayState> {
  const plan = await readCurrentPlan(input.ledger, binding);
  const selectedPlanBytes = planBytes(plan);
  if (expectedPlanBytes !== undefined && selectedPlanBytes !== expectedPlanBytes) {
    throw new Error("Resident-loop complete selected plan changed during durable gateway reread.");
  }
  const stream = await input.ledger.readStream(toolRequestStreamId(binding.toolRequestId));
  const requests = stream.filter((event): event is ToolRequestEvent => event.type === "agent.tool.requested");
  if (requests.length !== 1 || requests[0]?.id !== requestEventId) {
    throw new Error("Resident-loop gateway requires exactly one exact durable request readback.");
  }
  const request = requests[0];
  assertRequestMatches(plan, binding, request);

  const approval = readExactApproval(stream, request, binding, stage);
  const claim = readExactClaim(stream, request, approval, binding, input.now, stage);
  const completion = readExactCompletion(stream, request, claim, stage, expectedResultEventId);
  const rereadPlan = await readCurrentPlan(input.ledger, binding);
  if (selectedPlanBytes !== planBytes(rereadPlan)) {
    throw new Error("Resident-loop complete selected plan changed during durable gateway reread.");
  }

  return Object.freeze({
    readback: Object.freeze({
      schemaVersion: "resident-loop-tool-gateway-readback.v1",
      planRecordEventId: plan.id,
      requestEventId: request.id,
      ...(approval === undefined ? {} : { decisionEventId: approval.id, approvedBy: approval.payload.approvedBy }),
      ...(claim === undefined ? {} : { executionClaimEventId: claim.id }),
      ...(completion === undefined
        ? {}
        : { resultEventId: completion.id, resultEvidenceEventIds: Object.freeze([...completion.payload.eventIds]) }),
      toolRequestId: binding.toolRequestId,
      residentAgentId: "agent_default",
      taskId: plan.payload.taskId,
      attemptId: plan.payload.attemptId,
      runId: plan.payload.runId,
      toolId: request.payload.toolId,
      toolVersion: request.payload.toolVersion,
      sideEffectClass: request.payload.sideEffectClass,
      previewHash: request.payload.previewHash,
      approvalClass: request.payload.requiredApprovalClass,
      policyHash: plan.payload.policyHash,
      authorityHash: plan.payload.authorityHash,
      sourceEventIds: Object.freeze([...plan.payload.sourceEventIds]),
      contextArtifactHashes: Object.freeze([...plan.payload.contextArtifactHashes])
    }),
    planBytes: selectedPlanBytes
  });
}

async function readCurrentPlan(
  ledger: EventLedger,
  binding: Pick<ResidentLoopToolRequestInput, "taskId" | "attemptId" | "runId" | "planRecordEventId">
): Promise<ResidentPlanEvent> {
  const stream = await ledger.readStream(residentLoopStreamId(binding));
  const plan = stream.find((event): event is ResidentPlanEvent =>
    event.id === binding.planRecordEventId && event.type === "agent.resident-plan.recorded.v1"
  );
  if (
    plan === undefined ||
    plan.payload.residentAgentId !== "agent_default" ||
    plan.payload.taskId !== binding.taskId ||
    plan.payload.attemptId !== binding.attemptId ||
    plan.payload.runId !== binding.runId ||
    stream.some((event) =>
      event.type === "agent.resident-plan.recorded.v1" &&
      event.id !== plan.id &&
      samePlanIdentity(event, plan) &&
      event.payload.planRevision > plan.payload.planRevision
    )
  ) {
    throw new Error("Resident-loop gateway requires a current exact Task120 plan readback.");
  }
  return plan;
}

function assertRequestMatches(
  plan: ResidentPlanEvent,
  binding: RequestSnapshot | ResidentLoopToolGatewayReadback,
  request: ToolRequestEvent
): void {
  const expectedSources = [plan.id, ...plan.payload.sourceEventIds];
  if (
    request.payload.toolRequestId !== binding.toolRequestId ||
    request.payload.runId !== plan.payload.runId ||
    request.payload.toolId !== binding.toolId ||
    request.payload.toolVersion !== binding.toolVersion ||
    request.payload.requestedBy !== "agent_default" ||
    request.payload.sideEffectClass !== binding.sideEffectClass ||
    request.payload.requiredApprovalClass !== binding.approvalClass ||
    !sameStrings(request.payload.sourceEventIds ?? [], expectedSources) ||
    !sameStrings(request.payload.inputArtifactHashes ?? [], plan.payload.contextArtifactHashes) ||
    ("previewHash" in binding && request.payload.previewHash !== binding.previewHash) ||
    ("policyHash" in binding && (plan.payload.policyHash !== binding.policyHash || plan.payload.authorityHash !== binding.authorityHash))
  ) {
    throw new Error("Resident-loop request readback does not match exact plan, tool, preview, or provenance facts.");
  }
}

function readExactApproval(
  stream: readonly KnowledgeEvent[],
  request: ToolRequestEvent,
  binding: RequestSnapshot | ResidentLoopToolGatewayReadback,
  stage: "request" | "decision" | "claim" | "result"
): ToolApprovalEvent | undefined {
  const approvals = stream.filter((event): event is ToolApprovalEvent => event.type === "agent.tool.approved");
  const terminal = stream.some((event) => event.type === "agent.tool.denied" || event.type === "agent.tool.failed");
  if (terminal || (stage !== "result" && stream.some((event) => event.type === "agent.tool.completed"))) {
    throw new Error("Resident-loop gateway current stream is terminal.");
  }
  if (stage === "request") {
    if (approvals.length > 0) {
      throw new Error("Resident-loop request readback changed before its initial reread.");
    }
    return undefined;
  }
  if (approvals.length !== 1) {
    throw new Error("Resident-loop gateway requires exactly one independent human decision readback.");
  }
  const approval = approvals[0];
  if (
    approval === undefined ||
    approval.payload.toolRequestId !== request.payload.toolRequestId ||
    approval.payload.approvedPreviewHash !== request.payload.previewHash ||
    approval.payload.approvalClass !== request.payload.requiredApprovalClass ||
    approval.context.causationId !== request.id ||
    approval.context.actor.kind !== "human" ||
    approval.context.actor.id !== approval.payload.approvedBy ||
    approval.context.actor.id === request.payload.requestedBy ||
    ("decisionEventId" in binding && binding.decisionEventId !== undefined && approval.id !== binding.decisionEventId) ||
    ("approvedBy" in binding && binding.approvedBy !== undefined && approval.payload.approvedBy !== binding.approvedBy)
  ) {
    throw new Error("Resident-loop gateway requires an exact independent human approval readback.");
  }
  return approval;
}

function readExactClaim(
  stream: readonly KnowledgeEvent[],
  request: ToolRequestEvent,
  approval: ToolApprovalEvent | undefined,
  binding: RequestSnapshot | ResidentLoopToolGatewayReadback,
  now: () => string,
  stage: "request" | "decision" | "claim" | "result"
): ToolExecutionClaimEvent | undefined {
  const claims = stream.filter((event): event is ToolExecutionClaimEvent => event.type === "agent.tool.execution.claimed");
  if (stage === "request" || stage === "decision") {
    if (claims.length > 0) {
      throw new Error("Resident-loop gateway execution claim appeared before its durable readback.");
    }
    return undefined;
  }
  if (approval === undefined || claims.length !== 1) {
    throw new Error("Resident-loop gateway requires exactly one current execution claim.");
  }
  const claim = claims[0];
  if (
    claim === undefined ||
    claim.payload.toolRequestId !== request.payload.toolRequestId ||
    claim.payload.approvedPreviewHash !== request.payload.previewHash ||
    claim.context.causationId !== approval.id ||
    claim.payload.claimedBy !== "agent_default" ||
    claim.context.actor.id !== "agent_default" ||
    claim.context.actor.kind !== "agent" ||
    Date.parse(claim.payload.leaseExpiresAt) <= Date.parse(now()) ||
    ("executionClaimEventId" in binding &&
      binding.executionClaimEventId !== undefined &&
      claim.id !== binding.executionClaimEventId)
  ) {
    throw new Error("Resident-loop gateway execution claim is stale or does not match the durable approval.");
  }
  return claim;
}

function readExactCompletion(
  stream: readonly KnowledgeEvent[],
  request: ToolRequestEvent,
  claim: ToolExecutionClaimEvent | undefined,
  stage: "request" | "decision" | "claim" | "result",
  expectedResultEventId: string | undefined
): ToolCompletionEvent | undefined {
  const completions = stream.filter((event): event is ToolCompletionEvent => event.type === "agent.tool.completed");
  if (stage !== "result") {
    if (completions.length > 0) {
      throw new Error("Resident-loop completion was substituted before the private completion route.");
    }
    return undefined;
  }
  if (claim === undefined || completions.length !== 1 || expectedResultEventId === undefined) {
    throw new Error("Resident-loop gateway requires exactly one durable completion readback.");
  }
  const completion = completions[0];
  if (
    completion === undefined ||
    completion.id !== expectedResultEventId ||
    completion.payload.toolRequestId !== request.payload.toolRequestId ||
    completion.context.causationId !== claim.id ||
    completion.payload.eventIds.length === 0 ||
    new Set(completion.payload.eventIds).size !== completion.payload.eventIds.length
  ) {
    throw new Error("Resident-loop completion readback does not match exact request, claim, and result evidence.");
  }
  return completion;
}

function copyRequest(value: ResidentLoopToolRequestInput): RequestSnapshot {
  const record = dataRecord(value, "resident-loop tool request");
  rejectUnknown(record, [
    "toolRequestId", "taskId", "attemptId", "runId", "planRecordEventId", "toolId", "toolVersion",
    "sideEffectClass", "approvalClass", "preview"
  ], "resident-loop tool request");
  const preview = dataRecord(record.preview, "resident-loop tool preview");
  rejectUnknown(preview, ["summary", "scope", "estimatedEffect"], "resident-loop tool preview");
  const command = Object.freeze({
    toolRequestId: safeString(record.toolRequestId, "tool request ID", undefined, "toolreq_"),
    taskId: safeString(record.taskId, "task ID"),
    attemptId: safeString(record.attemptId, "attempt ID"),
    runId: safeString(record.runId, "run ID"),
    planRecordEventId: safeString(record.planRecordEventId, "plan record event ID", eventIdPattern),
    toolId: safeString(record.toolId, "tool ID"),
    toolVersion: safeString(record.toolVersion, "tool version"),
    sideEffectClass: safeString(record.sideEffectClass, "tool side-effect class") as AgentToolSideEffectClass,
    approvalClass: safeString(record.approvalClass, "tool approval class"),
    preview: Object.freeze({
      summary: safeString(preview.summary, "tool preview summary"),
      scope: safeString(preview.scope, "tool preview scope"),
      estimatedEffect: safeString(preview.estimatedEffect, "tool preview estimated effect")
    })
  });
  if (command.approvalClass === "none") {
    throw new Error("Resident-loop gateway requires an independent human approval class.");
  }
  return command;
}

function requireIssued(value: ResidentLoopToolGatewayReadback, stage: string): ResidentLoopToolGatewayReadback {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    !issuedReadbacks.has(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getOwnPropertyNames(value).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw new Error(`Resident-loop ${stage} requires issued readback capability.`);
  }
  return value;
}

function issue(state: CurrentGatewayState): ResidentLoopToolGatewayReadback {
  const frozen = Object.freeze(state.readback);
  issuedReadbacks.add(frozen);
  issuedPlanBytes.set(frozen, state.planBytes);
  return frozen;
}

function copyResult(value: AgentToolResult): AgentToolResult {
  const record = dataRecord(value, "resident-loop execution result");
  rejectUnknown(record, ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"], "resident-loop execution result");
  const eventIds = copyStringArray(record.eventIds, "resident-loop result event ID", eventIdPattern);
  const artifactHashes = copyStringArray(record.artifactHashes, "resident-loop result artifact hash", /^sha256:[a-f0-9]{64}$/);
  const readModelChanges = copyReadModelChanges(record.readModelChanges);
  const resultSummary = record.resultSummary === undefined
    ? undefined
    : safeString(record.resultSummary, "resident-loop result summary");
  return Object.freeze({
    eventIds,
    artifactHashes,
    readModelChanges,
    ...(resultSummary === undefined ? {} : { resultSummary })
  });
}

function copyReadModelChanges(value: unknown): readonly AgentToolReadModelChange[] {
  return copyArray(value, "resident-loop read-model changes").map((item) => {
    const record = dataRecord(item, "resident-loop read-model change");
    rejectUnknown(record, ["projectionName", "change", "relatedIds"], "resident-loop read-model change");
    const relatedIds = record.relatedIds === undefined
      ? undefined
      : copyStringArray(record.relatedIds, "resident-loop related ID");
    return Object.freeze({
      projectionName: safeString(record.projectionName, "resident-loop projection name"),
      change: safeString(record.change, "resident-loop projection change"),
      ...(relatedIds === undefined ? {} : { relatedIds })
    });
  });
}

function copyStringArray(value: unknown, label: string, pattern?: RegExp, prefix?: string): readonly string[] {
  const copied = copyArray(value, `${label} list`).map((item) => safeString(item, label, pattern, prefix));
  if (new Set(copied).size !== copied.length) {
    throw new Error(`${label} list must not contain duplicates.`);
  }
  return Object.freeze(copied);
}

function copyArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must be a non-proxy plain array.`);
  }
  const copied: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must not contain sparse or accessor-backed values.`);
    }
    copied.push(descriptor.value);
  }
  if (Object.getOwnPropertyNames(value).some((key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key))) {
    throw new Error(`${label} must not contain custom fields.`);
  }
  return Object.freeze(copied);
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new Error(`${label} must be a non-proxy plain object.`);
  }
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (unsafeKeys.has(key) || descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must not contain unsafe, hidden, or accessor-backed fields.`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

function rejectUnknown(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(record).some((key) => !accepted.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function safeString(value: unknown, label: string, pattern?: RegExp, prefix?: string): string {
  if (typeof value !== "string" || value.length === 0 || (pattern !== undefined && !pattern.test(value)) || (prefix !== undefined && !value.startsWith(prefix))) {
    throw new Error(`${label} must be canonical.`);
  }
  assertAgentSecretSafeText(value, label);
  return value;
}

function requiredPlanBytes(value: ResidentLoopToolGatewayReadback): string {
  const bytes = issuedPlanBytes.get(value);
  if (bytes === undefined) {
    throw new Error("Resident-loop readback does not retain an exact selected plan binding.");
  }
  return bytes;
}

function samePlanIdentity(left: ResidentPlanEvent, right: ResidentPlanEvent): boolean {
  return left.payload.residentAgentId === right.payload.residentAgentId &&
    left.payload.taskId === right.payload.taskId &&
    left.payload.attemptId === right.payload.attemptId &&
    left.payload.runId === right.payload.runId;
}

function planBytes(plan: ResidentPlanEvent): string {
  const bytes = JSON.stringify(plan);
  if (bytes === undefined) {
    throw new Error("Resident-loop selected plan must have exact durable bytes.");
  }
  return bytes;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requiredClaimEventId(value: ResidentLoopToolGatewayReadback): string {
  if (value.executionClaimEventId === undefined) {
    throw new Error("Resident-loop execution requires an exact durable claim readback.");
  }
  return value.executionClaimEventId;
}

function toolRequestStreamId(toolRequestId: string): string {
  return `agent_tool_request_${toolRequestId}`;
}
