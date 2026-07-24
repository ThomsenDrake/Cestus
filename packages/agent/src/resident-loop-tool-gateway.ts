import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import type {
  AppendableKnowledgeEvent,
  KnowledgeEvent,
  KnowledgeEventOf
} from "../../ontology/src/contracts.js";
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
  hashAgentToolPreview,
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
  readonly residentDomainExecutionPort?: unknown;
  readonly reverifyBeforeEffect?: () => Promise<unknown>;
  readonly reverifyAfterEffect?: () => Promise<unknown>;
  readonly createTrustedToolRequestId?: () => string;
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

export interface ResidentLoopToolGateway {
  requestAndReadback(value: ResidentLoopToolRequestInput): Promise<ResidentLoopToolGatewayReadback>;
  readRequest(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback>;
  readDecision(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback>;
  executeAndReadback(
    value: ResidentLoopToolGatewayReadback,
    execute: (readback: ResidentLoopToolGatewayReadback) => Promise<AgentToolResult>
  ): Promise<ResidentLoopToolGatewayReadback>;
  readResult(value: ResidentLoopToolGatewayReadback): Promise<ResidentLoopToolGatewayReadback>;
}

export function createResidentLoopToolGateway(
  input: ResidentLoopToolGatewayInput
): ResidentLoopToolGateway {
  if (input.residentDomainExecutionPort !== undefined) {
    return createResidentDomainGateway(input) as unknown as ResidentLoopToolGateway;
  }
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

type ResidentPlanV2Event = KnowledgeEventOf<"agent.resident-plan.recorded.v2">;
type ResidentRequestedEvent = KnowledgeEventOf<"agent.resident-domain.requested.v1">;
type ResidentHumanApprovedEvent = KnowledgeEventOf<"agent.resident-domain.human-approved.v1">;
type ResidentClaimedEvent = KnowledgeEventOf<"agent.resident-domain.execution-claimed.v1">;
type ResidentOutcomeEvent = KnowledgeEventOf<"agent.resident-domain.outcome-observed.v1">;
type ResidentCompletedEvent = KnowledgeEventOf<"agent.resident-domain.completed.v1">;
type ResidentDeniedEvent = KnowledgeEventOf<"agent.resident-domain.denied.v1">;
type ResidentFailedEvent = KnowledgeEventOf<"agent.resident-domain.failed.v1">;
type ResidentLogicalLocator =
  ResidentRequestedEvent["payload"]["logicalLocator"];

interface ResidentPortDescriptor {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: string;
  readonly requiredApprovalClass: string;
}

interface ResidentPortPreview {
  readonly catalogOrdinal: number;
  readonly executionCapabilityHash: string;
  readonly implementationRevision: string;
  readonly descriptor: ResidentPortDescriptor;
  readonly currentPreview: {
    readonly preview: AgentToolPreview;
    readonly sourceEventIds: readonly string[];
    readonly inputArtifactHashes: readonly string[];
    readonly provenanceRefs: readonly string[];
    readonly activeLocks: readonly unknown[];
    readonly freshnessChecks: readonly Readonly<Record<string, unknown>>[];
  };
}

interface ResidentLiveStage {
  readonly owner: object;
  readonly stage: "requested" | "human-approved";
  readonly locator: ResidentLogicalLocator;
  readonly plan: ResidentPlanV2Event;
  readonly request: ResidentRequestedEvent;
  readonly portPreview: ResidentPortPreview;
  readonly approval?: ResidentHumanApprovedEvent;
}

interface ResidentPermitState {
  readonly port: object;
  readonly input: object;
  readonly catalogOrdinal: number;
  issueResidentDomainInvocationAttestation(attestation: object): object;
}

interface ResidentDomainInvocationAttestation {
  readonly schemaVersion: "resident-domain-invocation-attestation.v1";
  readonly executionClaimEventId: string;
  readonly executionCapabilityHash: `sha256:${string}`;
  readonly catalogOrdinal: number;
  readonly implementationRevision: string;
  readonly residentInvocationInputHash: `sha256:${string}`;
  readonly evidenceMode:
    | "new-ledger-events"
    | "idempotent-existing-ledger-events"
    | "nonledger-projection-artifacts";
  readonly preInvocationLedgerFingerprint: `sha256:${string}`;
  readonly postInvocationLedgerFingerprint: `sha256:${string}`;
  readonly result: {
    readonly eventIds: readonly string[];
    readonly artifactHashes: readonly string[];
    readonly readModelChanges: readonly {
      readonly projectionName: string;
      readonly change: string;
      readonly relatedIds?: readonly string[];
    }[];
    readonly resultSummary: string;
  };
}

interface ValidatedResidentRecoveryPrefix {
  readonly request: ResidentRequestedEvent;
  readonly approval?: ResidentHumanApprovedEvent;
  readonly claim?: ResidentClaimedEvent;
  readonly receipt?: ResidentOutcomeEvent;
  readonly completed?: ResidentCompletedEvent;
  readonly denial?: ResidentDeniedEvent;
  readonly failure?: ResidentFailedEvent;
}

const issuedResidentLiveStages = new WeakMap<object, ResidentLiveStage>();
const issuedResidentPermits = new WeakMap<object, ResidentPermitState>();
const issuedResidentInvocationAttestations = new WeakSet<object>();
const consumedResidentInvocationAttestations = new WeakSet<object>();

function createResidentDomainGateway(input: ResidentLoopToolGatewayInput): object {
  const ledger = input.ledger;
  const port = requireResidentGatewayObject(
    input.residentDomainExecutionPort,
    "resident domain execution port"
  );
  const beforeEffect = requireResidentGatewayFunction(
    input.reverifyBeforeEffect,
    "resident before-effect reverification"
  );
  const afterEffect = requireResidentGatewayFunction(
    input.reverifyAfterEffect,
    "resident after-effect reverification"
  );
  const createTrustedId = requireResidentGatewayFunction(
    input.createTrustedToolRequestId,
    "resident trusted tool-request ID factory"
  );
  if (typeof input.now !== "function" || isProxy(input.now)) {
    throw new Error("Resident domain gateway requires a non-proxy clock.");
  }
  const owner = Object.freeze({});

  async function preparePlannedStepBindings(value: unknown): Promise<readonly object[]> {
    const plan = residentGatewayRecord(value, "resident planned-step binding input");
    rejectResidentGatewayUnknown(plan, [
      "workspaceId",
      "residentAgentId",
      "taskId",
      "attemptId",
      "runId",
      "planId",
      "planRevision",
      "steps"
    ], "resident planned-step binding input");
    const identity = {
      workspaceId: residentGatewayString(plan.workspaceId, "resident workspace ID"),
      residentAgentId: residentGatewayString(plan.residentAgentId, "resident agent ID"),
      taskId: residentGatewayString(plan.taskId, "resident task ID"),
      attemptId: residentGatewayString(plan.attemptId, "resident attempt ID"),
      runId: residentGatewayString(plan.runId, "resident run ID"),
      planId: residentGatewayString(plan.planId, "resident plan ID"),
      planRevision: residentGatewayNonnegativeInteger(plan.planRevision, "resident plan revision")
    };
    const steps = residentGatewayArray(plan.steps, "resident planned steps");
    const seenIds = new Set<string>();
    const bindings: object[] = [];
    for (const rawStep of steps) {
      const step = residentGatewayRecord(rawStep, "resident planned step");
      rejectResidentGatewayUnknown(
        step,
        ["ordinal", "toolId", "toolVersion"],
        "resident planned step"
      );
      const ordinal = residentGatewayNonnegativeInteger(step.ordinal, "resident step ordinal");
      const toolId = residentGatewayString(step.toolId, "resident tool ID");
      const toolVersion = residentGatewayString(step.toolVersion, "resident tool version");
      const selected = await callResidentPort(port, {
        phase: "binding",
        toolId,
        toolVersion
      });
      const selectedRecord = residentGatewayRecord(selected, "resident port binding response");
      const toolRequestId = Reflect.apply(createTrustedId, undefined, []);
      if (
        typeof toolRequestId !== "string" ||
        !toolRequestId.startsWith("toolreq_") ||
        seenIds.has(toolRequestId)
      ) {
        throw new Error("Resident trusted tool-request ID factory returned a noncanonical or duplicate ID.");
      }
      seenIds.add(toolRequestId);
      const executionCapabilityHash = residentGatewayHashString(
        selectedRecord.executionCapabilityHash,
        "resident execution capability hash"
      );
      bindings.push(Object.freeze({
        ...identity,
        ordinal,
        toolRequestId,
        toolId,
        toolVersion,
        executionCapabilityHash
      }));
    }
    return Object.freeze(bindings);
  }

  async function requestFreshAuthorized(value: unknown): Promise<object> {
    const locator = copyResidentLogicalLocator(value);
    const plan = await requireResidentPlan(ledger, locator);
    const portPreview = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => requireResidentPortPreview(port, locator)
    );
    if (portPreview.executionCapabilityHash !== locator.executionCapabilityHash) {
      throw new Error("Resident execution port capability hash does not match the durable logical locator.");
    }
    const step = requireResidentPlanStep(plan, locator);
    const previewHash = hashAgentToolPreview(portPreview.currentPreview.preview);
    const authorizationKind =
      portPreview.catalogOrdinal === 10 ? "automatic-policy" : "human-approval";
    const correlationId = plan.payload.correlationId;
    const requestInput: Extract<
      AppendableKnowledgeEvent,
      { readonly type: "agent.resident-domain.requested.v1" }
    > = {
      type: "agent.resident-domain.requested.v1",
      version: 1,
      streamId: residentGatewayDomainStreamId(locator),
      context: residentGatewayEventContext(
        plan.id,
        correlationId,
        input.now()
      ),
      payload: {
        schemaVersion: "resident-domain-requested.v1",
        logicalLocator: locator as never,
        executionCapabilityHash: locator.executionCapabilityHash as `sha256:${string}`,
        causationId: plan.id,
        correlationId,
        authorizationKind,
        planRecordEventId: plan.id,
        previewHash,
        allowlistEntryHash: step.allowlistEntryHash,
        sideEffectClass: portPreview.descriptor.sideEffectClass as never,
        expectedSafeOutputClass: step.expectedSafeOutputClass,
        requiredApprovalClass: portPreview.descriptor.requiredApprovalClass as never,
        sourceEventIds: [...plan.payload.sourceEventIds],
        contextPackRefs: [...plan.payload.contextPackRefs],
        inputArtifactHashes: [...portPreview.currentPreview.inputArtifactHashes] as `sha256:${string}`[],
        policy: plan.payload.policy,
        authority: plan.payload.authority,
        budget: plan.payload.budget
      }
    };
    const request = await appendAndRereadResidentLifecycleEvent(
      ledger,
      requestInput,
      1,
      locator,
      plan,
      portPreview.catalogOrdinal,
      portPreview.implementationRevision,
      beforeEffect,
      afterEffect,
      input.now()
    );
    return issueResidentLiveStage({
      owner,
      stage: "requested",
      locator,
      plan,
      request,
      portPreview
    });
  }

  async function readFreshHumanDecision(value: unknown): Promise<object> {
    const live = requireResidentLiveStage(value, owner, "requested");
    issuedResidentLiveStages.delete(value as object);
    if (live.request.payload.authorizationKind !== "human-approval") {
      throw new Error("Resident human decision read requires a human-approval request.");
    }
    const stream = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => ledger.readStream(residentGatewayDomainStreamId(live.locator))
    );
    const trustedCurrentTime = input.now();
    const prefix = validateResidentRecoveryPrefix(
      stream,
      live.locator,
      live.plan,
      live.portPreview.catalogOrdinal,
      live.portPreview.implementationRevision,
      undefined,
      trustedCurrentTime
    );
    if (
      residentGatewayCanonicalJson(prefix.request) !==
        residentGatewayCanonicalJson(live.request)
    ) {
      throw new Error("Resident human decision request changed from its exact durable prefix.");
    }
    if (prefix.denial !== undefined || prefix.failure !== undefined) {
      throw new Error("Resident human decision is denied, revoked, or terminal.");
    }
    if (
      prefix.approval === undefined ||
      prefix.claim !== undefined ||
      prefix.receipt !== undefined ||
      prefix.completed !== undefined
    ) {
      throw new Error("Resident human decision requires exactly one durable approval.");
    }
    const approval = prefix.approval;
    assertResidentLiveApprovalDeadline(
      live.request,
      live.plan,
      trustedCurrentTime
    );
    return issueResidentLiveStage({
      ...live,
      stage: "human-approved",
      approval
    });
  }

  async function executeFreshAuthorized(value: unknown): Promise<object> {
    const live = requireResidentLiveStage(value, owner);
    const automatic =
      live.request.payload.authorizationKind === "automatic-policy";
    if (
      (automatic && live.stage !== "requested") ||
      (!automatic && live.stage !== "human-approved")
    ) {
      throw new Error("Resident execution requires the exact fresh authorized stage.");
    }
    issuedResidentLiveStages.delete(value as object);
    const authorization = automatic
      ? Object.freeze({ authorizationKind: "automatic-policy" as const })
      : Object.freeze({
          authorizationKind: "human-approval" as const,
          decisionEventId: live.approval!.payload.decisionEventId,
          approvedBy: live.approval!.payload.approvedBy,
          approvedPreviewHash: live.approval!.payload.approvedPreviewHash
        });
    const causationId = live.approval?.id ?? live.request.id;
    const streamId = residentGatewayDomainStreamId(live.locator);
    const currentStream = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => ledger.readStream(streamId)
    );
    const trustedCurrentTime = input.now();
    const currentPrefix = validateResidentRecoveryPrefix(
      currentStream,
      live.locator,
      live.plan,
      live.portPreview.catalogOrdinal,
      live.portPreview.implementationRevision,
      undefined,
      trustedCurrentTime
    );
    assertFreshResidentExecutionPrefix(
      currentPrefix,
      live,
      trustedCurrentTime
    );
    const claimInput: Extract<
      AppendableKnowledgeEvent,
      { readonly type: "agent.resident-domain.execution-claimed.v1" }
    > = {
      type: "agent.resident-domain.execution-claimed.v1",
      version: 1,
      streamId,
      context: residentGatewayEventContext(
        causationId,
        live.request.payload.correlationId,
        input.now()
      ),
      payload: {
        schemaVersion: "resident-domain-execution-claimed.v1",
        logicalLocator: live.locator as never,
        executionCapabilityHash:
          live.request.payload.executionCapabilityHash,
        causationId,
        correlationId: live.request.payload.correlationId,
        requestEventId: live.request.id,
        authorization,
        claimedAt: input.now()
      }
    };
    const claim = await appendAndRereadResidentLifecycleEvent(
      ledger,
      claimInput,
      currentStream.length + 1,
      live.locator,
      live.plan,
      live.portPreview.catalogOrdinal,
      live.portPreview.implementationRevision,
      beforeEffect,
      afterEffect,
      input.now()
    );
    const canonicalResidentInvocationBase = {
      authorizationKind: live.request.payload.authorizationKind,
      logicalLocator: live.locator,
      requestEventId: live.request.id,
      executionClaimEventId: claim.id,
      authorization,
      previewHash: live.request.payload.previewHash
    };
    const canonicalResidentInvocationInput = Object.freeze(
      live.approval === undefined
        ? {
            ...canonicalResidentInvocationBase,
            currentPreview: live.portPreview.currentPreview
          }
        : {
            ...canonicalResidentInvocationBase,
            approvedPreviewHash: live.approval.payload.approvedPreviewHash,
            approvedBy: live.approval.payload.approvedBy,
            currentPreview: live.portPreview.currentPreview
          }
    );
    const permit = mintResidentPermit(
      port,
      canonicalResidentInvocationInput,
      live.portPreview.catalogOrdinal
    );
    const attestation = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => invokeResidentPort(
        port,
        permit,
        canonicalResidentInvocationInput
      )
    );
    const envelope = consumeResidentDomainInvocationAttestation(
      attestation,
      live,
      claim,
      canonicalResidentInvocationInput
    );
    const outcomeEnvelope = {
      logicalLocator: live.locator,
      executionCapabilityHash:
        live.request.payload.executionCapabilityHash,
      requestEventId: live.request.id,
      executionClaimEventId: claim.id,
      authorization,
      catalogOrdinal: envelope.catalogOrdinal,
      implementationRevision: envelope.implementationRevision,
      evidenceMode: envelope.evidenceMode,
      residentInvocationInputHash: envelope.residentInvocationInputHash,
      outcomeDisposition: "completed" as const,
      preInvocationLedgerFingerprint:
        envelope.preInvocationLedgerFingerprint,
      postInvocationLedgerFingerprint:
        envelope.postInvocationLedgerFingerprint,
      domainEventIds: [...envelope.result.eventIds],
      artifactHashes: [...envelope.result.artifactHashes],
      readModelChanges: envelope.result.readModelChanges.map(
        (change) => change.projectionName
      ),
      resultSummary: envelope.result.resultSummary
    };
    const envelopeHash = residentGatewayHash(outcomeEnvelope);
    const receiptInput: Extract<
      AppendableKnowledgeEvent,
      { readonly type: "agent.resident-domain.outcome-observed.v1" }
    > = {
      type: "agent.resident-domain.outcome-observed.v1",
      version: 1,
      streamId,
      context: residentGatewayEventContext(
        claim.id,
        live.request.payload.correlationId,
        input.now()
      ),
      payload: {
        schemaVersion: "resident-domain-outcome-observed.v1",
        causationId: claim.id,
        correlationId: live.request.payload.correlationId,
        ...outcomeEnvelope,
        envelopeHash
      }
    };
    const receipt = await appendAndRereadResidentLifecycleEvent(
      ledger,
      receiptInput,
      currentStream.length + 2,
      live.locator,
      live.plan,
      live.portPreview.catalogOrdinal,
      live.portPreview.implementationRevision,
      beforeEffect,
      afterEffect,
      input.now()
    );
    const artifactHashes = residentGatewayStringArray(
      envelope.result.artifactHashes,
      "resident result artifact hashes"
    );
    const completed = await appendResidentCompletion(
      ledger,
      live.locator,
      live.request,
      claim,
      receipt,
      authorization,
      envelopeHash,
      artifactHashes,
      currentStream.length + 3,
      input.now(),
      live.plan,
      live.portPreview.catalogOrdinal,
      live.portPreview.implementationRevision,
      beforeEffect,
      afterEffect,
      input.now()
    );
    return Object.freeze({
      authorizationKind: live.request.payload.authorizationKind,
      stage: "completed",
      logicalLocator: live.locator,
      executionCapabilityHash:
        live.request.payload.executionCapabilityHash,
      requestEventId: live.request.id,
      ...(live.approval === undefined
        ? {}
        : {
            decisionEventId: live.approval.payload.decisionEventId,
            approvedBy: live.approval.payload.approvedBy,
            approvedPreviewHash:
              live.approval.payload.approvedPreviewHash
          }),
      executionClaimEventId: claim.id,
      outcomeReceiptEventId: receipt.id,
      resultEventId: completed.id
    });
  }

  async function rereadAndIssueFromLedger(value: unknown): Promise<object> {
    const locator = copyResidentLogicalLocator(value);
    const plan = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => requireResidentPlan(ledger, locator)
    );
    const portPreview = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => requireResidentPortPreview(port, locator)
    );
    if (
      portPreview.executionCapabilityHash !==
        locator.executionCapabilityHash
    ) {
      throw new Error("Resident recovery locator does not match the mounted execution port.");
    }
    const streamId = residentGatewayDomainStreamId(locator);
    const stream = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => ledger.readStream(streamId)
    );
    const allEvents = await awaitResidentCurrent(
      beforeEffect,
      afterEffect,
      () => ledger.readAll()
    );
    const prefix = validateResidentRecoveryPrefix(
      stream,
      locator,
      plan,
      portPreview.catalogOrdinal,
      portPreview.implementationRevision,
      allEvents,
      input.now()
    );
    const {
      request,
      approval,
      claim,
      receipt,
      denial,
      failure
    } = prefix;
    let { completed } = prefix;
    if (denial !== undefined) {
      return Object.freeze({
        ...residentRecoveryBase(request, locator),
        stage: "denied",
        denialEventId: denial.id
      });
    }
    if (failure !== undefined) {
      const failureProof = failure.payload.failure;
      return Object.freeze({
        ...residentRecoveryBase(
          request,
          locator,
          failureProof.failurePhase === "pre-approval" ||
          failureProof.failurePhase === "pre-claim"
            ? undefined
            : approval
        ),
        stage: "failed",
        failurePhase: failureProof.failurePhase,
        ...(failureProof.failurePhase === "post-claim"
          ? {
              executionClaimEventId: claim!.id,
              outcomeReceiptEventId: receipt!.id
            }
          : {}),
        resultEventId: failure.id
      });
    }
    if (completed !== undefined) {
      return residentRecoveryReadback(
        request,
        locator,
        approval,
        claim,
        receipt,
        completed
      );
    }
    if (receipt !== undefined) {
      if (claim === undefined) {
        throw new Error("Resident recovery outcome receipt has no execution claim.");
      }
      if (receipt.payload.outcomeDisposition === "failed") {
        const failed = await appendResidentPostClaimFailure(
          ledger,
          locator,
          request,
          approval,
          claim,
          receipt,
          stream.length + 1,
          input.now(),
          plan,
          portPreview.catalogOrdinal,
          portPreview.implementationRevision,
          beforeEffect,
          afterEffect,
          input.now()
        );
        return residentRecoveryFailureReadback(
          request,
          locator,
          approval,
          claim,
          receipt,
          failed
        );
      }
      completed = await appendResidentCompletion(
        ledger,
        locator,
        request,
        claim,
        receipt,
        receipt.payload.authorization,
        residentGatewayHashString(
          receipt.payload.envelopeHash,
          "resident recovery envelope hash"
        ),
        receipt.payload.artifactHashes,
        stream.length + 1,
        input.now(),
        plan,
        portPreview.catalogOrdinal,
        portPreview.implementationRevision,
        beforeEffect,
        afterEffect,
        input.now()
      );
      return residentRecoveryReadback(
        request,
        locator,
        approval,
        claim,
        receipt,
        completed
      );
    }
    if (claim !== undefined) {
      return Object.freeze({
        ...residentRecoveryBase(request, locator, approval),
        stage: "claimed",
        category: "effect-outcome-unknown",
        executionClaimEventId: claim.id
      });
    }
    if (request.payload.authorizationKind === "human-approval" && approval !== undefined) {
      return Object.freeze({
        ...residentRecoveryBase(request, locator, approval),
        stage: "human-approved"
      });
    }
    return Object.freeze({
      ...residentRecoveryBase(request, locator, approval),
      stage: "requested"
    });
  }

  return Object.freeze({
    preparePlannedStepBindings,
    requestFreshAuthorized,
    readFreshHumanDecision,
    executeFreshAuthorized,
    rereadAndIssueFromLedger
  });
}

function issueResidentLiveStage(input: ResidentLiveStage): object {
  const issued = Object.freeze({
    authorizationKind: input.request.payload.authorizationKind,
    stage: input.stage,
    logicalLocator: input.locator,
    executionCapabilityHash:
      input.request.payload.executionCapabilityHash,
    requestEventId: input.request.id,
    ...(input.approval === undefined
      ? {}
      : {
          decisionEventId: input.approval.payload.decisionEventId,
          approvedBy: input.approval.payload.approvedBy,
          approvedPreviewHash: input.approval.payload.approvedPreviewHash
        })
  });
  issuedResidentLiveStages.set(issued, input);
  return issued;
}

function requireResidentLiveStage(
  value: unknown,
  owner: object,
  expectedStage?: ResidentLiveStage["stage"]
): ResidentLiveStage {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new Error("Resident execution requires a fresh issued permit stage.");
  }
  const live = issuedResidentLiveStages.get(value);
  if (live === undefined) {
    throw new Error("Resident execution stage was not freshly issued or was already consumed.");
  }
  if (live.owner !== owner) {
    throw new Error("Resident execution stage belongs to a foreign gateway binding or port.");
  }
  if (expectedStage !== undefined && live.stage !== expectedStage) {
    throw new Error("Resident execution stage does not match the required fresh decision stage.");
  }
  return live;
}

function assertFreshResidentExecutionPrefix(
  prefix: ValidatedResidentRecoveryPrefix,
  live: ResidentLiveStage,
  trustedCurrentTime: string
): void {
  if (
    residentGatewayCanonicalJson(prefix.request) !==
      residentGatewayCanonicalJson(live.request) ||
    (
      live.approval === undefined
        ? prefix.approval !== undefined
        : (
            prefix.approval === undefined ||
            residentGatewayCanonicalJson(prefix.approval) !==
              residentGatewayCanonicalJson(live.approval)
          )
    ) ||
    prefix.claim !== undefined ||
    prefix.receipt !== undefined ||
    prefix.completed !== undefined ||
    prefix.denial !== undefined ||
    prefix.failure !== undefined
  ) {
    throw new Error(
      "Resident fresh execution requires the exact unclaimed canonical lifecycle prefix."
    );
  }
  if (live.approval !== undefined) {
    assertResidentLiveApprovalDeadline(
      live.request,
      live.plan,
      trustedCurrentTime
    );
  }
}

function mintResidentPermit(
  port: object,
  input: object,
  catalogOrdinal: number
): object {
  const permit = Object.freeze({});
  let issuedAttestation = false;
  issuedResidentPermits.set(permit, Object.freeze({
    port,
    input,
    catalogOrdinal,
    issueResidentDomainInvocationAttestation(attestation: object) {
      if (
        issuedAttestation ||
        attestation === null ||
        typeof attestation !== "object"
      ) {
        throw new Error("Resident invocation attestation issuer accepts one object result.");
      }
      issuedAttestation = true;
      issuedResidentInvocationAttestations.add(attestation);
      return attestation;
    }
  }));
  return permit;
}

function consumeResidentDomainInvocationAttestation(
  value: unknown,
  live: ResidentLiveStage,
  claim: ResidentClaimedEvent,
  canonicalResidentInvocationInput: object
): ResidentDomainInvocationAttestation {
  if (value === null || typeof value !== "object") {
    throw new Error("Resident invocation attestation requires a complete result object.");
  }
  const expectedKeys = [
    "schemaVersion",
    "executionClaimEventId",
    "executionCapabilityHash",
    "catalogOrdinal",
    "implementationRevision",
    "residentInvocationInputHash",
    "evidenceMode",
    "preInvocationLedgerFingerprint",
    "postInvocationLedgerFingerprint",
    "result"
  ];
  if (
    Reflect.get(value, "schemaVersion") !==
      "resident-domain-invocation-attestation.v1"
  ) {
    throw new Error("Resident invocation attestation schema and result are incomplete.");
  }
  if (consumedResidentInvocationAttestations.has(value)) {
    throw new Error("Resident invocation attestation was already consumed and cannot be replayed.");
  }
  if (!issuedResidentInvocationAttestations.has(value)) {
    throw new Error("Resident invocation attestation lacks its private issued brand.");
  }
  issuedResidentInvocationAttestations.delete(value);
  consumedResidentInvocationAttestations.add(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !keys.includes(key))
  ) {
    throw new Error("Resident invocation attestation schema and result are incomplete.");
  }
  const schemaVersion = Reflect.get(value, "schemaVersion");
  const executionClaimEventId = Reflect.get(value, "executionClaimEventId");
  const executionCapabilityHash = Reflect.get(
    value,
    "executionCapabilityHash"
  );
  const catalogOrdinal = Reflect.get(value, "catalogOrdinal");
  const implementationRevision = Reflect.get(value, "implementationRevision");
  const residentInvocationInputHash = Reflect.get(
    value,
    "residentInvocationInputHash"
  );
  const evidenceMode = Reflect.get(value, "evidenceMode");
  const preInvocationLedgerFingerprint = Reflect.get(
    value,
    "preInvocationLedgerFingerprint"
  );
  const postInvocationLedgerFingerprint = Reflect.get(
    value,
    "postInvocationLedgerFingerprint"
  );
  if (
    schemaVersion !== "resident-domain-invocation-attestation.v1" ||
    executionClaimEventId !== claim.id ||
    executionCapabilityHash !== live.request.payload.executionCapabilityHash ||
    catalogOrdinal !== live.portPreview.catalogOrdinal ||
    implementationRevision !== live.portPreview.implementationRevision ||
    residentInvocationInputHash !==
      residentGatewayHash(canonicalResidentInvocationInput) ||
    ![
      "new-ledger-events",
      "idempotent-existing-ledger-events",
      "nonledger-projection-artifacts"
    ].includes(String(evidenceMode)) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(preInvocationLedgerFingerprint)) ||
    !/^sha256:[a-f0-9]{64}$/.test(String(postInvocationLedgerFingerprint))
  ) {
    throw new Error("Resident invocation attestation does not match its claim, catalog, implementation, or invocation.");
  }
  const result = copyResidentAttestedResult(Reflect.get(value, "result"));
  return {
    schemaVersion,
    executionClaimEventId,
    executionCapabilityHash:
      executionCapabilityHash as `sha256:${string}`,
    catalogOrdinal,
    implementationRevision,
    residentInvocationInputHash:
      residentInvocationInputHash as `sha256:${string}`,
    evidenceMode: evidenceMode as ResidentDomainInvocationAttestation["evidenceMode"],
    preInvocationLedgerFingerprint:
      preInvocationLedgerFingerprint as `sha256:${string}`,
    postInvocationLedgerFingerprint:
      postInvocationLedgerFingerprint as `sha256:${string}`,
    result
  };
}

function copyResidentAttestedResult(
  value: unknown
): ResidentDomainInvocationAttestation["result"] {
  const result = residentGatewayRecord(
    value,
    "resident invocation attestation result"
  );
  rejectResidentGatewayUnknown(
    result,
    ["eventIds", "artifactHashes", "readModelChanges", "resultSummary"],
    "resident invocation attestation result"
  );
  if (Object.keys(result).length !== 4) {
    throw new Error("Resident invocation attestation result is incomplete.");
  }
  const readModelChanges = residentGatewayArray(
    result.readModelChanges,
    "resident invocation attestation read-model changes"
  ).map((value) => {
    const change = residentGatewayRecord(
      value,
      "resident invocation attestation read-model change"
    );
    rejectResidentGatewayUnknown(
      change,
      ["projectionName", "change", "relatedIds"],
      "resident invocation attestation read-model change"
    );
    return {
      projectionName: residentGatewayString(
        change.projectionName,
        "resident invocation attestation projection name"
      ),
      change: residentGatewayString(
        change.change,
        "resident invocation attestation projection change"
      ),
      ...(change.relatedIds === undefined
        ? {}
        : {
            relatedIds: residentGatewayStringArray(
              change.relatedIds,
              "resident invocation attestation related IDs"
            )
          })
    };
  });
  return {
    eventIds: residentGatewayStringArray(
      result.eventIds,
      "resident invocation attestation event IDs"
    ),
    artifactHashes: residentGatewayStringArray(
      result.artifactHashes,
      "resident invocation attestation artifact hashes"
    ),
    readModelChanges,
    resultSummary: residentGatewayString(
      result.resultSummary,
      "resident invocation attestation result summary"
    )
  };
}

async function callResidentPort(port: object, command: object): Promise<unknown> {
  const operation = Reflect.get(port, "prepareResidentDomainExecution");
  if (typeof operation !== "function" || isProxy(operation)) {
    throw new Error("Resident execution port does not expose its package-owned preparation operation.");
  }
  return await Reflect.apply(operation, port, [command]);
}

async function invokeResidentPort(
  port: object,
  permit: object,
  input: object
): Promise<unknown> {
  const operation = Reflect.get(port, "invokeAndAttest");
  if (typeof operation !== "function" || isProxy(operation)) {
    throw new Error("Resident execution port does not expose its package-owned invocation operation.");
  }
  return await Reflect.apply(operation, port, [permit, input]);
}

async function requireResidentPortPreview(
  port: object,
  locator: Readonly<Record<string, unknown>>
): Promise<ResidentPortPreview> {
  const raw = await callResidentPort(port, {
    phase: "preview",
    logicalLocator: locator
  });
  const response = residentGatewayRecord(raw, "resident execution port preview response");
  const descriptor = residentGatewayRecord(
    response.descriptor,
    "resident execution port descriptor"
  );
  const current = residentGatewayRecord(
    response.currentPreview,
    "resident current preview response"
  );
  const preview = requireResidentGatewayObject(
    current.preview,
    "resident current tool preview"
  ) as AgentToolPreview;
  return {
    catalogOrdinal: residentGatewayNonnegativeInteger(
      response.catalogOrdinal,
      "resident catalog ordinal"
    ),
    executionCapabilityHash: residentGatewayHashString(
      response.executionCapabilityHash,
      "resident execution capability hash"
    ),
    implementationRevision: residentGatewayString(
      response.implementationRevision,
      "resident implementation revision"
    ),
    descriptor: {
      toolId: residentGatewayString(descriptor.toolId, "resident descriptor tool ID"),
      toolVersion: residentGatewayString(descriptor.toolVersion, "resident descriptor tool version"),
      sideEffectClass: residentGatewayString(
        descriptor.sideEffectClass,
        "resident descriptor side-effect class"
      ),
      requiredApprovalClass: residentGatewayString(
        descriptor.requiredApprovalClass,
        "resident descriptor approval class"
      )
    },
    currentPreview: {
      preview,
      sourceEventIds: residentGatewayStringArray(
        current.sourceEventIds,
        "resident current source event IDs"
      ),
      inputArtifactHashes: residentGatewayStringArray(
        current.inputArtifactHashes,
        "resident current input artifact hashes"
      ),
      provenanceRefs: residentGatewayStringArray(
        current.provenanceRefs,
        "resident current provenance refs"
      ),
      activeLocks: residentGatewayArray(
        current.activeLocks,
        "resident current active locks"
      ),
      freshnessChecks: residentGatewayArray(
        current.freshnessChecks,
        "resident current freshness checks"
      ).map((value) => {
        const check = residentGatewayRecord(value, "resident freshness check");
        return Object.freeze({ ...check });
      })
    }
  };
}

async function requireResidentPlan(
  ledger: EventLedger,
  locator: Readonly<Record<string, unknown>>
): Promise<ResidentPlanV2Event> {
  const stream = await ledger.readStream(
    `agent_resident_loop_${locator.taskId}_${locator.attemptId}_${locator.runId}`
  );
  const plans = stream.filter(
    (event): event is ResidentPlanV2Event =>
      event.type === "agent.resident-plan.recorded.v2" &&
      event.payload.workspaceId === locator.workspaceId &&
      event.payload.residentAgentId === locator.residentAgentId &&
      event.payload.taskId === locator.taskId &&
      event.payload.attemptId === locator.attemptId &&
      event.payload.runId === locator.runId &&
      event.payload.planId === locator.planId &&
      event.payload.planRevision === locator.planRevision
  );
  if (plans.length !== 1) {
    throw new Error("Resident logical locator requires one exact durable V2 plan.");
  }
  const plan = plans[0]!;
  requireResidentPlanStep(plan, locator);
  return plan;
}

function requireResidentPlanStep(
  plan: ResidentPlanV2Event,
  locator: Readonly<Record<string, unknown>>
): ResidentPlanV2Event["payload"]["steps"][number] {
  const steps = plan.payload.steps.filter((step) =>
    step.ordinal === locator.stepOrdinal &&
    step.toolRequestId === locator.toolRequestId &&
    step.toolId === locator.toolId &&
    step.toolVersion === locator.toolVersion &&
    step.executionCapabilityHash === locator.executionCapabilityHash
  );
  if (steps.length !== 1) {
    throw new Error("Resident logical locator does not match one exact durable plan step.");
  }
  return steps[0]!;
}

function validateResidentRecoveryPrefix(
  stream: readonly KnowledgeEvent[],
  locator: Readonly<Record<string, unknown>>,
  plan: ResidentPlanV2Event,
  catalogOrdinal: number,
  implementationRevision: string,
  allEvents: readonly KnowledgeEvent[] | undefined,
  trustedCurrentTime: string
): ValidatedResidentRecoveryPrefix {
  if (
    stream.length === 0 ||
    stream[0]?.type !== "agent.resident-domain.requested.v1"
  ) {
    throw new Error("Resident recovery requires a canonical request-first prefix.");
  }
  const request = stream[0];
  const correlationId = request.payload.correlationId;
  const authorizationKind = request.payload.authorizationKind;
  const step = requireResidentPlanStep(plan, locator);
  if (
    request.payload.planRecordEventId !== plan.id ||
    request.payload.executionCapabilityHash !==
      locator.executionCapabilityHash ||
    residentGatewayCanonicalJson(request.payload.logicalLocator) !==
      residentGatewayCanonicalJson(locator) ||
    request.payload.causationId !== plan.id ||
    request.context.causationId !== plan.id ||
    request.payload.correlationId !== plan.payload.correlationId ||
    request.context.correlationId !== plan.payload.correlationId ||
    request.context.actor.kind !== "agent" ||
    request.context.actor.id !== residentGatewayActor.id ||
    !Number.isFinite(Date.parse(request.context.occurredAt)) ||
    request.payload.allowlistEntryHash !== step.allowlistEntryHash ||
    request.payload.expectedSafeOutputClass !== step.expectedSafeOutputClass ||
    !sameStrings(request.payload.sourceEventIds, plan.payload.sourceEventIds) ||
    residentGatewayCanonicalJson(request.payload.contextPackRefs) !==
      residentGatewayCanonicalJson(plan.payload.contextPackRefs) ||
    residentGatewayCanonicalJson(request.payload.policy) !==
      residentGatewayCanonicalJson(plan.payload.policy) ||
    residentGatewayCanonicalJson(request.payload.authority) !==
      residentGatewayCanonicalJson(plan.payload.authority) ||
    residentGatewayCanonicalJson(request.payload.budget) !==
      residentGatewayCanonicalJson(plan.payload.budget) ||
    (authorizationKind === "automatic-policy"
      ? request.payload.requiredApprovalClass !== "none"
      : request.payload.requiredApprovalClass === "none") ||
    (authorizationKind === "automatic-policy") !== (catalogOrdinal === 10)
  ) {
    throw new Error("Resident recovery request does not match its plan, locator, catalog, or causation.");
  }

  let approval: ResidentHumanApprovedEvent | undefined;
  let claim: ResidentClaimedEvent | undefined;
  let receipt: ResidentOutcomeEvent | undefined;
  let completed: ResidentCompletedEvent | undefined;
  let denial: ResidentDeniedEvent | undefined;
  let failure: ResidentFailedEvent | undefined;
  let stage:
    | "requested"
    | "human-approved"
    | "claimed"
    | "receipted"
    | "terminal" = "requested";

  for (let index = 0; index < stream.length; index += 1) {
    const event = stream[index]!;
    const payload = event.payload as Readonly<Record<string, unknown>>;
    if (
      event.sequence !== index + 1 ||
      event.streamId !== request.streamId ||
      residentGatewayCanonicalJson(
        Reflect.get(payload, "logicalLocator")
      ) !== residentGatewayCanonicalJson(locator) ||
      Reflect.get(payload, "executionCapabilityHash") !==
        locator.executionCapabilityHash ||
      Reflect.get(payload, "correlationId") !== correlationId ||
      event.context.correlationId !== correlationId
    ) {
      throw new Error("Resident recovery prefix has a gap, foreign locator, hash, or correlation.");
    }
    if (index === 0) {
      continue;
    }
    if (stage === "terminal") {
      throw new Error("Resident recovery prefix contains a second terminal event.");
    }

    switch (event.type) {
      case "agent.resident-domain.human-approved.v1":
        if (
          stage !== "requested" ||
          authorizationKind !== "human-approval" ||
          approval !== undefined ||
          event.payload.requestEventId !== request.id ||
          event.payload.authorizationKind !== "human-approval" ||
          event.payload.approvedPreviewHash !== request.payload.previewHash ||
          event.payload.approvedBy !== event.context.actor.id ||
          event.context.actor.kind !== "human" ||
          event.context.actor.id === residentGatewayActor.id
        ) {
          throw new Error("Resident recovery human approval does not match its canonical request.");
        }
        assertResidentApprovalChronology(
          request,
          event,
          plan,
          trustedCurrentTime
        );
        approval = event;
        stage = "human-approved";
        break;
      case "agent.resident-domain.execution-claimed.v1": {
        if (
          claim !== undefined ||
          (
            authorizationKind === "automatic-policy"
              ? stage !== "requested"
              : stage !== "human-approved"
          ) ||
          event.payload.requestEventId !== request.id
        ) {
          throw new Error("Resident recovery execution claim is outside its canonical branch.");
        }
        const expectedAuthorization = approval === undefined
          ? { authorizationKind: "automatic-policy" }
          : {
              authorizationKind: "human-approval",
              decisionEventId: approval.payload.decisionEventId,
              approvedBy: approval.payload.approvedBy,
              approvedPreviewHash: approval.payload.approvedPreviewHash
            };
        if (
          residentGatewayCanonicalJson(event.payload.authorization) !==
            residentGatewayCanonicalJson(expectedAuthorization)
        ) {
          throw new Error("Resident recovery execution claim has authorization branch drift.");
        }
        claim = event;
        stage = "claimed";
        break;
      }
      case "agent.resident-domain.outcome-observed.v1":
        if (
          stage !== "claimed" ||
          claim === undefined ||
          receipt !== undefined ||
          event.payload.requestEventId !== request.id ||
          event.payload.executionClaimEventId !== claim.id ||
          residentGatewayCanonicalJson(event.payload.authorization) !==
            residentGatewayCanonicalJson(claim.payload.authorization)
        ) {
          throw new Error("Resident recovery outcome receipt does not match its canonical claim.");
        }
        validateResidentOutcomeReceipt(
          event,
          claim,
          catalogOrdinal,
          implementationRevision,
          allEvents
        );
        receipt = event;
        stage = "receipted";
        break;
      case "agent.resident-domain.completed.v1":
        if (
          stage !== "receipted" ||
          claim === undefined ||
          receipt === undefined ||
          completed !== undefined ||
          event.payload.requestEventId !== request.id ||
          event.payload.executionClaimEventId !== claim.id ||
          event.payload.outcomeReceiptEventId !== receipt.id ||
          receipt.payload.outcomeDisposition !== "completed" ||
          event.payload.resultHash !== receipt.payload.envelopeHash ||
          !sameStrings(
            event.payload.resultArtifactHashes,
            receipt.payload.artifactHashes
          ) ||
          residentGatewayCanonicalJson(event.payload.authorization) !==
            residentGatewayCanonicalJson(claim.payload.authorization)
        ) {
          throw new Error("Resident recovery completed terminal does not match its exact receipt.");
        }
        completed = event;
        stage = "terminal";
        break;
      case "agent.resident-domain.denied.v1":
        if (
          stage !== "requested" ||
          authorizationKind !== "human-approval" ||
          event.payload.requestEventId !== request.id ||
          event.payload.authorizationKind !== "human-approval" ||
          event.payload.deniedBy !== event.context.actor.id ||
          event.context.actor.kind !== "human"
        ) {
          throw new Error("Resident recovery denied decision does not match its exact human request.");
        }
        denial = event;
        stage = "terminal";
        break;
      case "agent.resident-domain.failed.v1": {
        const phase = event.payload.failure.failurePhase;
        const validStage =
          (phase === "pre-claim" &&
            authorizationKind === "automatic-policy" &&
            stage === "requested") ||
          (phase === "pre-approval" &&
            authorizationKind === "human-approval" &&
            stage === "requested") ||
          (phase === "post-approval-pre-claim" &&
            authorizationKind === "human-approval" &&
            stage === "human-approved" &&
            approval !== undefined) ||
          (phase === "post-claim" &&
            stage === "receipted" &&
            claim !== undefined &&
            receipt !== undefined &&
            receipt.payload.outcomeDisposition === "failed");
        if (!validStage || event.payload.requestEventId !== request.id) {
          throw new Error("Resident recovery failure is outside its canonical lifecycle phase.");
        }
        if (
          phase === "post-approval-pre-claim" &&
          (
            event.payload.failure.decisionEventId !==
              approval!.payload.decisionEventId ||
            event.payload.failure.approvedBy !== approval!.payload.approvedBy ||
            event.payload.failure.approvedPreviewHash !==
              approval!.payload.approvedPreviewHash
          )
        ) {
          throw new Error("Resident recovery failure has foreign human approval evidence.");
        }
        if (
          phase === "post-claim" &&
          (
            event.payload.failure.executionClaimEventId !== claim!.id ||
            event.payload.failure.outcomeReceiptEventId !== receipt!.id
          )
        ) {
          throw new Error("Resident recovery post-claim failure has foreign receipt evidence.");
        }
        if (
          event.payload.failureProofHash !==
            residentGatewayHash({
              requestEventId: request.id,
              failure: event.payload.failure
            })
        ) {
          throw new Error("Resident recovery failure proof hash is not canonical.");
        }
        failure = event;
        stage = "terminal";
        break;
      }
      default:
        throw new Error("Resident recovery prefix contains a noncanonical event family.");
    }

    const expectedCausationId =
      event.type === "agent.resident-domain.failed.v1" &&
      event.payload.failure.failurePhase !== "post-claim"
        ? request.id
        : stream[index - 1]!.id;
    if (
      Reflect.get(payload, "causationId") !== expectedCausationId ||
      event.context.causationId !== expectedCausationId
    ) {
      throw new Error("Resident recovery prefix contains causation drift.");
    }
  }

  return {
    request,
    ...(approval === undefined ? {} : { approval }),
    ...(claim === undefined ? {} : { claim }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(completed === undefined ? {} : { completed }),
    ...(denial === undefined ? {} : { denial }),
    ...(failure === undefined ? {} : { failure })
  };
}

function assertResidentApprovalChronology(
  request: ResidentRequestedEvent,
  approval: ResidentHumanApprovedEvent,
  plan: ResidentPlanV2Event,
  trustedCurrentTime: string
): void {
  const requestTime = Date.parse(request.context.occurredAt);
  const approvalTime = Date.parse(approval.context.occurredAt);
  const currentTime = Date.parse(trustedCurrentTime);
  const deadline =
    requestTime + plan.payload.budget.ceilings.approvalSuspensionMs;
  if (
    !Number.isFinite(requestTime) ||
    !Number.isFinite(approvalTime) ||
    !Number.isFinite(currentTime) ||
    approvalTime < requestTime ||
    approvalTime > deadline ||
    approvalTime > currentTime
  ) {
    throw new Error(
      "Resident human approval chronology must be request <= approval <= deadline and approval <= trusted current time."
    );
  }
}

function assertResidentLiveApprovalDeadline(
  request: ResidentRequestedEvent,
  plan: ResidentPlanV2Event,
  trustedCurrentTime: string
): void {
  const requestTime = Date.parse(request.context.occurredAt);
  const currentTime = Date.parse(trustedCurrentTime);
  const deadline =
    requestTime + plan.payload.budget.ceilings.approvalSuspensionMs;
  if (
    !Number.isFinite(requestTime) ||
    !Number.isFinite(currentTime) ||
    currentTime > deadline
  ) {
    throw new Error("Resident human approval deadline expired before execution.");
  }
}

function validateResidentOutcomeReceipt(
  receipt: ResidentOutcomeEvent,
  claim: ResidentClaimedEvent,
  catalogOrdinal: number,
  implementationRevision: string,
  allEvents: readonly KnowledgeEvent[] | undefined
): void {
  if (
    allEvents === undefined ||
    ![2, 3, 4, 5, 6, 7, 9, 10].includes(catalogOrdinal) ||
    receipt.payload.catalogOrdinal !== catalogOrdinal ||
    receipt.payload.implementationRevision !== implementationRevision ||
    new Set(receipt.payload.domainEventIds).size !==
      receipt.payload.domainEventIds.length ||
    new Set(receipt.payload.artifactHashes).size !==
      receipt.payload.artifactHashes.length ||
    new Set(receipt.payload.readModelChanges).size !==
      receipt.payload.readModelChanges.length ||
    receipt.payload.readModelChanges.length === 0
  ) {
    throw new Error(
      "Resident recovery receipt has incomplete catalog, revision, or domain output evidence."
    );
  }
  const envelope = {
    logicalLocator: receipt.payload.logicalLocator,
    executionCapabilityHash: receipt.payload.executionCapabilityHash,
    requestEventId: receipt.payload.requestEventId,
    executionClaimEventId: receipt.payload.executionClaimEventId,
    authorization: receipt.payload.authorization,
    catalogOrdinal: receipt.payload.catalogOrdinal,
    implementationRevision: receipt.payload.implementationRevision,
    evidenceMode: receipt.payload.evidenceMode,
    residentInvocationInputHash: receipt.payload.residentInvocationInputHash,
    outcomeDisposition: receipt.payload.outcomeDisposition,
    preInvocationLedgerFingerprint:
      receipt.payload.preInvocationLedgerFingerprint,
    postInvocationLedgerFingerprint:
      receipt.payload.postInvocationLedgerFingerprint,
    domainEventIds: receipt.payload.domainEventIds,
    artifactHashes: receipt.payload.artifactHashes,
    readModelChanges: receipt.payload.readModelChanges,
    resultSummary: receipt.payload.resultSummary
  };
  if (receipt.payload.envelopeHash !== residentGatewayHash(envelope)) {
    throw new Error(
      "Resident recovery receipt envelope hash does not cover its exact evidence and outcome."
    );
  }
  const receiptIndex = allEvents.findIndex((event) => event.id === receipt.id);
  const claimIndex = allEvents.findIndex((event) => event.id === claim.id);
  if (
    receiptIndex < 0 ||
    claimIndex < 0 ||
    claimIndex >= receiptIndex
  ) {
    throw new Error("Resident recovery receipt is not ordered after its exact claim.");
  }
  const beforeReceipt = allEvents.slice(0, receiptIndex);
  const expectedEventType = new Map<number, string>([
    [2, "prr.request.sent"],
    [3, "prr.followup.sent"],
    [4, "assertion.accepted"],
    [5, "export.generated"],
    [6, "report.generated"],
    [9, "legacy.ontology.staging.approved"],
    [10, "assertion.proposed"]
  ]).get(catalogOrdinal);
  const selectedEvents = receipt.payload.domainEventIds.map((eventId) =>
    allEvents.find((event) => event.id === eventId)
  );
  if (
    selectedEvents.some((event) => event === undefined) ||
    (
      expectedEventType !== undefined &&
      selectedEvents.some((event) => event?.type !== expectedEventType)
    )
  ) {
    throw new Error(
      "Resident recovery receipt domain event evidence is absent or outside its catalog family."
    );
  }

  switch (receipt.payload.evidenceMode) {
    case "new-ledger-events": {
      const firstDomainIndex = allEvents.findIndex(
        (event) => event.id === receipt.payload.domainEventIds[0]
      );
      const newEvents = allEvents.slice(firstDomainIndex, receiptIndex);
      if (
        catalogOrdinal === 7 ||
        receipt.payload.domainEventIds.length === 0 ||
        firstDomainIndex <= claimIndex ||
        !sameStrings(
          newEvents.map((event) => event.id),
          receipt.payload.domainEventIds
        ) ||
        receipt.payload.preInvocationLedgerFingerprint !==
          residentGatewayHash(allEvents.slice(0, firstDomainIndex)) ||
        receipt.payload.postInvocationLedgerFingerprint !==
          residentGatewayHash(beforeReceipt)
      ) {
        throw new Error(
          "Resident recovery receipt does not prove exact new-ledger-event evidence."
        );
      }
      break;
    }
    case "idempotent-existing-ledger-events": {
      const fingerprint = residentGatewayHash(beforeReceipt);
      if (
        catalogOrdinal === 7 ||
        receipt.payload.domainEventIds.length === 0 ||
        receipt.payload.preInvocationLedgerFingerprint !== fingerprint ||
        receipt.payload.postInvocationLedgerFingerprint !== fingerprint
      ) {
        throw new Error(
          "Resident recovery receipt does not prove exact idempotent ledger evidence."
        );
      }
      break;
    }
    case "nonledger-projection-artifacts": {
      const fingerprint = residentGatewayHash(beforeReceipt);
      if (
        catalogOrdinal !== 7 ||
        receipt.payload.domainEventIds.length !== 0 ||
        receipt.payload.artifactHashes.length === 0 ||
        receipt.payload.preInvocationLedgerFingerprint !== fingerprint ||
        receipt.payload.postInvocationLedgerFingerprint !== fingerprint
      ) {
        throw new Error(
          "Resident recovery receipt does not prove exact nonledger projection evidence."
        );
      }
      break;
    }
  }
}

function copyResidentLogicalLocator(value: unknown): ResidentLogicalLocator {
  const locator = residentGatewayRecord(value, "resident logical locator");
  rejectResidentGatewayUnknown(locator, [
    "workspaceId",
    "residentAgentId",
    "taskId",
    "attemptId",
    "runId",
    "planId",
    "planRevision",
    "stepOrdinal",
    "toolRequestId",
    "toolId",
    "toolVersion",
    "executionCapabilityHash"
  ], "resident logical locator");
  const residentAgentId = residentGatewayString(
    locator.residentAgentId,
    "resident agent ID"
  );
  if (residentAgentId !== "agent_default") {
    throw new Error("Resident logical locator requires the canonical resident agent.");
  }
  return Object.freeze({
    workspaceId: residentGatewayString(locator.workspaceId, "resident workspace ID"),
    residentAgentId,
    taskId: residentGatewayString(locator.taskId, "resident task ID"),
    attemptId: residentGatewayString(locator.attemptId, "resident attempt ID"),
    runId: residentGatewayString(locator.runId, "resident run ID"),
    planId: residentGatewayString(locator.planId, "resident plan ID"),
    planRevision: residentGatewayNonnegativeInteger(locator.planRevision, "resident plan revision"),
    stepOrdinal: residentGatewayNonnegativeInteger(locator.stepOrdinal, "resident step ordinal"),
    toolRequestId: residentGatewayString(locator.toolRequestId, "resident tool request ID"),
    toolId: residentGatewayString(locator.toolId, "resident tool ID"),
    toolVersion: residentGatewayString(locator.toolVersion, "resident tool version"),
    executionCapabilityHash: residentGatewayHashString(
      locator.executionCapabilityHash,
      "resident execution capability hash"
    )
  });
}

async function appendResidentCompletion(
  ledger: EventLedger,
  locator: ResidentLogicalLocator,
  request: ResidentRequestedEvent,
  claim: ResidentClaimedEvent,
  receipt: ResidentOutcomeEvent,
  authorization: ResidentClaimedEvent["payload"]["authorization"],
  resultHash: `sha256:${string}`,
  artifactHashes: readonly string[],
  expectedNextSequence: number,
  occurredAt: string,
  plan: ResidentPlanV2Event,
  catalogOrdinal: number,
  implementationRevision: string,
  beforeEffect: (...args: readonly unknown[]) => unknown,
  afterEffect: (...args: readonly unknown[]) => unknown,
  trustedCurrentTime: string
): Promise<ResidentCompletedEvent> {
  if (receipt.payload.outcomeDisposition !== "completed") {
    throw new Error("Resident completion requires an exact completed outcome receipt.");
  }
  const completedInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.completed.v1" }
  > = {
    type: "agent.resident-domain.completed.v1",
    version: 1,
    streamId: residentGatewayDomainStreamId(locator),
    context: residentGatewayEventContext(
      receipt.id,
      request.payload.correlationId,
      occurredAt
    ),
    payload: {
      schemaVersion: "resident-domain-completed.v1",
      logicalLocator: locator,
      executionCapabilityHash: request.payload.executionCapabilityHash,
      causationId: receipt.id,
      correlationId: request.payload.correlationId,
      requestEventId: request.id,
      executionClaimEventId: claim.id,
      outcomeReceiptEventId: receipt.id,
      authorization,
      resultHash,
      resultArtifactHashes: [...artifactHashes]
    }
  };
  return await appendAndRereadResidentLifecycleEvent(
    ledger,
    completedInput,
    expectedNextSequence,
    locator,
    plan,
    catalogOrdinal,
    implementationRevision,
    beforeEffect,
    afterEffect,
    trustedCurrentTime
  );
}

async function appendResidentPostClaimFailure(
  ledger: EventLedger,
  locator: ResidentLogicalLocator,
  request: ResidentRequestedEvent,
  approval: ResidentHumanApprovedEvent | undefined,
  claim: ResidentClaimedEvent,
  receipt: ResidentOutcomeEvent,
  expectedNextSequence: number,
  occurredAt: string,
  plan: ResidentPlanV2Event,
  catalogOrdinal: number,
  implementationRevision: string,
  beforeEffect: (...args: readonly unknown[]) => unknown,
  afterEffect: (...args: readonly unknown[]) => unknown,
  trustedCurrentTime: string
): Promise<ResidentFailedEvent> {
  if (receipt.payload.outcomeDisposition !== "failed") {
    throw new Error("Resident post-claim failure requires an exact failed outcome receipt.");
  }
  const failure = approval === undefined
    ? {
        authorizationKind: "automatic-policy" as const,
        failurePhase: "post-claim" as const,
        executionClaimEventId: claim.id,
        outcomeReceiptEventId: receipt.id
      }
    : {
        authorizationKind: "human-approval" as const,
        failurePhase: "post-claim" as const,
        decisionEventId: approval.payload.decisionEventId,
        approvedBy: approval.payload.approvedBy,
        approvedPreviewHash: approval.payload.approvedPreviewHash,
        executionClaimEventId: claim.id,
        outcomeReceiptEventId: receipt.id
      };
  const failureInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.failed.v1" }
  > = {
    type: "agent.resident-domain.failed.v1",
    version: 1,
    streamId: residentGatewayDomainStreamId(locator),
    context: residentGatewayEventContext(
      receipt.id,
      request.payload.correlationId,
      occurredAt
    ),
    payload: {
      schemaVersion: "resident-domain-failed.v1",
      logicalLocator: locator as never,
      executionCapabilityHash: request.payload.executionCapabilityHash,
      causationId: receipt.id,
      correlationId: request.payload.correlationId,
      requestEventId: request.id,
      failure,
      failureCategory: "resident-domain-effect-failed",
      safeMessage:
        "The exact resident-domain invocation has a durable failed outcome receipt.",
      failureProofHash: residentGatewayHash({
        requestEventId: request.id,
        failure
      })
    }
  };
  return await appendAndRereadResidentLifecycleEvent(
    ledger,
    failureInput,
    expectedNextSequence,
    locator,
    plan,
    catalogOrdinal,
    implementationRevision,
    beforeEffect,
    afterEffect,
    trustedCurrentTime
  );
}

function residentRecoveryReadback(
  request: ResidentRequestedEvent,
  locator: Readonly<Record<string, unknown>>,
  approval: ResidentHumanApprovedEvent | undefined,
  claim: ResidentClaimedEvent | undefined,
  receipt: ResidentOutcomeEvent | undefined,
  completed: ResidentCompletedEvent
): object {
  return Object.freeze({
    ...residentRecoveryBase(request, locator, approval),
    stage: "completed",
    ...(claim === undefined ? {} : { executionClaimEventId: claim.id }),
    ...(receipt === undefined ? {} : { outcomeReceiptEventId: receipt.id }),
    resultEventId: completed.id
  });
}

function residentRecoveryFailureReadback(
  request: ResidentRequestedEvent,
  locator: Readonly<Record<string, unknown>>,
  approval: ResidentHumanApprovedEvent | undefined,
  claim: ResidentClaimedEvent,
  receipt: ResidentOutcomeEvent,
  failed: ResidentFailedEvent
): object {
  return Object.freeze({
    ...residentRecoveryBase(request, locator, approval),
    stage: "failed",
    failurePhase: "post-claim",
    executionClaimEventId: claim.id,
    outcomeReceiptEventId: receipt.id,
    resultEventId: failed.id
  });
}

function residentRecoveryBase(
  request: ResidentRequestedEvent,
  locator: Readonly<Record<string, unknown>>,
  approval?: ResidentHumanApprovedEvent
): object {
  return {
    authorizationKind: request.payload.authorizationKind,
    logicalLocator: locator,
    executionCapabilityHash: request.payload.executionCapabilityHash,
    requestEventId: request.id,
    ...(approval === undefined
      ? {}
      : {
          decisionEventId: approval.payload.decisionEventId,
          approvedBy: approval.payload.approvedBy,
          approvedPreviewHash: approval.payload.approvedPreviewHash
        })
  };
}

type ResidentLifecycleEventType =
  | "agent.resident-domain.requested.v1"
  | "agent.resident-domain.execution-claimed.v1"
  | "agent.resident-domain.outcome-observed.v1"
  | "agent.resident-domain.completed.v1"
  | "agent.resident-domain.failed.v1";

async function appendAndRereadResidentLifecycleEvent<
  T extends ResidentLifecycleEventType
>(
  ledger: EventLedger,
  event: AppendableKnowledgeEvent<T>,
  expectedNextSequence: number,
  locator: Readonly<Record<string, unknown>>,
  plan: ResidentPlanV2Event,
  catalogOrdinal: number,
  implementationRevision: string,
  beforeEffect: (...args: readonly unknown[]) => unknown,
  afterEffect: (...args: readonly unknown[]) => unknown,
  trustedCurrentTime: string,
  revalidateAroundAwait = true
): Promise<KnowledgeEventOf<T>> {
  const appended = await awaitResidentCurrentIfRequired(
    revalidateAroundAwait,
    beforeEffect,
    afterEffect,
    () => ledger.append(event, { expectedNextSequence })
  );
  const stream = await awaitResidentCurrentIfRequired(
    revalidateAroundAwait,
    beforeEffect,
    afterEffect,
    () => ledger.readStream(residentGatewayDomainStreamId(locator))
  );
  const allEvents = await awaitResidentCurrentIfRequired(
    revalidateAroundAwait,
    beforeEffect,
    afterEffect,
    () => ledger.readAll()
  );
  validateResidentRecoveryPrefix(
    stream,
    locator,
    plan,
    catalogOrdinal,
    implementationRevision,
    allEvents,
    trustedCurrentTime
  );
  const durable = stream.find((candidate) => candidate.id === appended.id);
  if (
    appended.type !== event.type ||
    durable === undefined ||
    durable.type !== event.type ||
    residentGatewayCanonicalJson(durable) !==
      residentGatewayCanonicalJson(appended)
  ) {
    throw new Error(
      "Resident lifecycle append return does not match its exact durable assigned identity and canonical bytes."
    );
  }
  const {
    id: _durableId,
    sequence: _durableSequence,
    ...durableInput
  } = durable;
  if (
    residentGatewayCanonicalJson(durableInput) !==
      residentGatewayCanonicalJson(event)
  ) {
    throw new Error(
      "Resident lifecycle durable reread does not match the exact canonical append input."
    );
  }
  return durable as KnowledgeEventOf<T>;
}

async function awaitResidentCurrentIfRequired<T>(
  required: boolean,
  beforeEffect: (...args: readonly unknown[]) => unknown,
  afterEffect: (...args: readonly unknown[]) => unknown,
  operation: () => Promise<T>
): Promise<T> {
  return required
    ? await awaitResidentCurrent(beforeEffect, afterEffect, operation)
    : await operation();
}

async function awaitResidentCurrent<T>(
  beforeEffect: (...args: readonly unknown[]) => unknown,
  afterEffect: (...args: readonly unknown[]) => unknown,
  operation: () => Promise<T>
): Promise<T> {
  await requireCurrentResidentReverification(beforeEffect);
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    await requireCurrentResidentReverification(afterEffect);
    throw error;
  }
  await requireCurrentResidentReverification(afterEffect);
  return result;
}

async function requireCurrentResidentReverification(
  operation: (...args: readonly unknown[]) => unknown
): Promise<void> {
  const result = await Reflect.apply(operation, undefined, []);
  const record = residentGatewayRecord(
    result,
    "resident execution reverification result"
  );
  if (record.kind !== "current") {
    throw new Error("Resident execution reverification is no longer current.");
  }
}

function residentGatewayEventContext(
  causationId: string,
  correlationId: string,
  occurredAt: string
) {
  return {
    actor: residentGatewayActor,
    occurredAt,
    causationId,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function residentGatewayDomainStreamId(
  locator: Readonly<Record<string, unknown>>
): string {
  return `agent_resident_domain_${createHash("sha256")
    .update(residentGatewayCanonicalJson(locator))
    .digest("hex")}`;
}

function residentGatewayRecord(value: unknown, label: string): Record<string, unknown> {
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
  const entries: [string, unknown][] = [];
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      unsafeKeys.has(key)
    ) {
      throw new Error(`${label} must contain only enumerable own data properties.`);
    }
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}

function residentGatewayArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value)) {
    throw new Error(`${label} must be a non-proxy array.`);
  }
  return Object.freeze([...value]);
}

function residentGatewayStringArray(value: unknown, label: string): readonly string[] {
  const values = residentGatewayArray(value, label);
  if (values.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must contain canonical strings.`);
  }
  const strings = values as readonly string[];
  return Object.freeze([...strings]);
}

function requireResidentGatewayObject(value: unknown, label: string): object {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new Error(`${label} must be a non-proxy object.`);
  }
  return value;
}

function requireResidentGatewayFunction(
  value: unknown,
  label: string
): (...args: readonly unknown[]) => unknown {
  if (typeof value !== "function" || isProxy(value)) {
    throw new Error(`${label} must be a non-proxy function.`);
  }
  return value as (...args: readonly unknown[]) => unknown;
}

function residentGatewayString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be canonical.`);
  }
  assertAgentSecretSafeText(value, label);
  return value;
}

function residentGatewayHashString(
  value: unknown,
  label: string
): `sha256:${string}` {
  const text = residentGatewayString(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${label} must be a canonical SHA-256 value.`);
  }
  return text as `sha256:${string}`;
}

function residentGatewayNonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
  return value;
}

function rejectResidentGatewayUnknown(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
}

function residentGatewayHash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(residentGatewayCanonicalJson(value))
    .digest("hex")}`;
}

function residentGatewayCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(residentGatewayCanonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${residentGatewayCanonicalJson(
        Reflect.get(value, key)
      )}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

type RequestSnapshot = Readonly<ResidentLoopToolRequestInput>;
interface CurrentGatewayState {
  readonly readback: ResidentLoopToolGatewayReadback;
  readonly planBytes: string;
}

function createCompletionGuardedLedger(ledger: EventLedger, expectedGlobalEventCount: number): EventLedger {
  const guarded: EventLedger = {
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
  };
  return Object.freeze(guarded);
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

function consumeResidentDomainExecutionPermit(
  permit: unknown,
  port: unknown,
  input: unknown
): ResidentPermitState {
  if (
    permit === null ||
    typeof permit !== "object" ||
    isProxy(permit)
  ) {
    throw new Error("Resident execution permit must be a live issued object.");
  }
  const binding = issuedResidentPermits.get(permit);
  if (binding === undefined) {
    throw new Error("Resident execution permit was not issued or was already consumed.");
  }
  issuedResidentPermits.delete(permit);
  if (binding.port !== port || binding.input !== input) {
    throw new Error("Resident execution permit does not match its exact port and invocation binding.");
  }
  return binding;
}

const residentDomainExecutionPermitConsumer = Object.freeze({
  consumeResidentDomainExecutionPermit
});

export default residentDomainExecutionPermitConsumer;
