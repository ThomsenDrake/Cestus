import type { ActorRef, KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";
import { createResidentLoopToolGateway, type ResidentLoopToolGatewayReadback } from "../src/resident-loop-tool-gateway.js";
import { createAgentToolGateway, type RequestAgentToolInput } from "../src/tool-gateway.js";

describe("resident-loop tool gateway", () => {
  it("derives durable request, human decision, claim, and result readbacks through the private completion route", async () => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));

    expect(request).toMatchObject({
      taskId: "task_gateway",
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runId: "run_gateway",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      planRecordEventId: fixture.plan.event.id,
      requestEventId: expect.stringMatching(/^evt_/)
    });

    await fixture.approvalGateway.approveTool({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      actor: humanActor,
      rationale: "Human approval binds this exact durable preview."
    });
    const decision = await fixture.bridge.readDecision(request);
    const claim = await fixture.agentGateway.claimExecution({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      leaseExpiresAt: "2026-07-19T12:05:00.000Z"
    });

    const completed = await fixture.bridge.executeAndReadback(decision, async (execution) => {
      expect(execution.executionClaimEventId).toBe(claim.id);
      const domainResult = await appendEvidence(fixture.ledger, {
        evidenceId: "ev_gateway_durable_result",
        causationId: claim.id
      });
      return {
        eventIds: [domainResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "The independently appended domain result is durable."
      };
    });
    const reread = await fixture.bridge.readResult(completed);

    expect(reread).toMatchObject({
      requestEventId: request.requestEventId,
      decisionEventId: decision.decisionEventId,
      executionClaimEventId: claim.id,
      resultEventId: expect.stringMatching(/^evt_/)
    });
    expect((await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`)).at(-1)?.type)
      .toBe("agent.tool.completed");
  });

  it("rejects copied, structural, extra-key, cross-request, and self-issued approval readbacks", async () => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));

    await expect(fixture.bridge.readDecision({ ...request })).rejects.toThrow(/issued readback/i);
    await expect(fixture.bridge.readDecision({ ...request, extra: true } as typeof request)).rejects.toThrow(/issued readback/i);
    await expect(fixture.bridge.readDecision({ ...request, toolRequestId: "toolreq_other" })).rejects.toThrow(/issued readback/i);

    await fixture.ledger.append({
      type: "agent.tool.approved",
      version: 1,
      streamId: `agent_tool_request_${request.toolRequestId}`,
      context: {
        actor: { id: agentActor.id, kind: "human", label: "Forged self-approval" },
        occurredAt: fixedNow(),
        causationId: request.requestEventId,
        correlationId: `corr_${request.toolRequestId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        toolRequestId: request.toolRequestId,
        approvedBy: agentActor.id,
        approvedPreviewHash: request.previewHash,
        approvalClass: "ledger-review",
        rationale: "The resident cannot approve its own request.",
        approvedAt: fixedNow()
      }
    }, { expectedNextSequence: 2 });

    await expect(fixture.bridge.readDecision(request)).rejects.toThrow(/independent human/i);
    expect((await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`)).some(
      (event) => event.type === "agent.tool.completed"
    )).toBe(false);
  });

  it("rejects post-readback terminal substitution before completion", async () => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));
    await fixture.approvalGateway.approveTool({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      actor: humanActor,
      rationale: "Human approval binds this exact durable preview."
    });
    const decision = await fixture.bridge.readDecision(request);
    const claim = await fixture.agentGateway.claimExecution({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      leaseExpiresAt: "2026-07-19T12:05:00.000Z"
    });

    await expect(fixture.bridge.executeAndReadback(decision, async () => {
      const result = await appendEvidence(fixture.ledger, {
        evidenceId: "ev_gateway_substituted_result",
        causationId: claim.id
      });
      await fixture.approvalGateway.denyTool({
        toolRequestId: request.toolRequestId,
        actor: humanActor,
        rationale: "A durable denial arrived while execution was suspended."
      });
      return {
        eventIds: [result.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "This result must not complete after the denial."
      };
    })).rejects.toThrow(/terminal|current/i);

    expect((await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`)).some(
      (event) => event.type === "agent.tool.completed"
    )).toBe(false);
  });

  it("rejects an old plan when a newer same resident/task/attempt/run plan changes every policy and provenance binding", async () => {
    const fixture = await prepareFixture();
    const newerSource = await appendEvidence(fixture.ledger, { evidenceId: "ev_gateway_newer_source" });
    await fixture.planStore.recordPlan({
      identity: {
        residentAgentId: "agent_default",
        taskId: fixture.plan.event.payload.taskId,
        attemptId: fixture.plan.event.payload.attemptId,
        runId: fixture.plan.event.payload.runId,
        policyId: "agent_policy_gateway_rev2",
        policyVersion: "2.0.0",
        policyHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        authorityHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        sourceEventIds: [newerSource.id],
        contextArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
        budget: { maxSteps: 2, remainingSteps: 2, contextBytes: 1 },
        causationEventId: newerSource.id,
        correlationId: "corr_gateway_plan_rev2"
      },
      planRevision: 2,
      descriptorHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });

    await expect(fixture.bridge.requestAndReadback(requestInput(fixture))).rejects.toThrow(/current exact Task120 plan/i);
    expect((await fixture.ledger.readStream(`agent_tool_request_${requestInput(fixture).toolRequestId}`)).length).toBe(0);
  });

  it("rejects complete selected-plan byte substitution across the request await", async () => {
    const fixture = await prepareFixture();
    const bridge = createBridge(
      mutateSelectedPlanAfterFirstRead(fixture.ledger, fixture.plan.event.id, fixture.plan.event.streamId),
      fixture.agentGateway
    );

    await expect(bridge.requestAndReadback(requestInput(fixture))).rejects.toThrow(/plan changed|current exact Task120 plan/i);
    expect((await fixture.ledger.readStream(`agent_tool_request_${requestInput(fixture).toolRequestId}`)).some(
      (event) => event.type === "agent.tool.completed"
    )).toBe(false);
  });

  it.each([
    { claimedBy: "agent_gateway_other", actor: agentActor },
    { claimedBy: agentActor.id, actor: foreignAgentActor }
  ])("rejects execution claims not issued by exact agent_default (%o)", async ({ claimedBy, actor }) => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));
    await fixture.approvalGateway.approveTool({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      actor: humanActor,
      rationale: "Human approval binds this exact durable preview."
    });
    const decision = await fixture.bridge.readDecision(request);
    const claim = await appendStructuralClaim(fixture.ledger, decision, actor, claimedBy);

    let executions = 0;
    await expect(fixture.bridge.executeAndReadback(decision, async () => {
      executions += 1;
      const result = await appendEvidence(fixture.ledger, {
        evidenceId: `ev_gateway_wrong_claim_${claimedBy}`,
        causationId: claim.id
      });
      return {
        eventIds: [result.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "A foreign execution claim must never execute or complete."
      };
    })).rejects.toThrow(/execution claim/i);

    expect(executions).toBe(0);
    expect((await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`)).some(
      (event) => event.type === "agent.tool.completed"
    )).toBe(false);
  });

  it("ignores unbranded structural request and completion gateways while preserving exact durable side-effect and completion authority", async () => {
    const fixture = await prepareFixture();
    const alternateGateway = createAgentToolGateway({ ledger: fixture.ledger, actor: alternateGatewayActor, now: fixedNow });
    let structuralRequestCalls = 0;
    let structuralCompletionCalls = 0;
    const structuralGateway = {
      async requestTool(command: RequestAgentToolInput) {
        structuralRequestCalls += 1;
        return await fixture.agentGateway.requestTool({
          ...command,
          sideEffectClass: "ledger-proposal",
          requiredApprovalClass: "human-review"
        });
      },
      async completeToolFromSchedulerEvidence(evidence: Parameters<typeof alternateGateway.completeToolFromSchedulerEvidence>[0]) {
        structuralCompletionCalls += 1;
        return await alternateGateway.completeToolFromSchedulerEvidence(evidence);
      }
    };
    const bridge = createBridge(fixture.ledger, structuralGateway);
    const command = {
      ...requestInput(fixture),
      sideEffectClass: "read-only" as const,
      approvalClass: "human-review" as const
    };

    const request = await bridge.requestAndReadback(command);
    await fixture.approvalGateway.approveTool({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      actor: humanActor,
      rationale: "Human approval binds this exact durable preview."
    });
    const decision = await bridge.readDecision(request);
    await fixture.agentGateway.claimExecution({
      toolRequestId: request.toolRequestId,
      approvedPreviewHash: request.previewHash,
      leaseExpiresAt: "2026-07-19T12:05:00.000Z"
    });
    const completed = await bridge.executeAndReadback(decision, async (execution) => {
      const result = await appendEvidence(fixture.ledger, {
        evidenceId: "ev_gateway_structural_authority",
        causationId: requiredExecutionClaimEventId(execution)
      });
      return {
        eventIds: [result.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "Only the genuine resident gateway may complete this request."
      };
    });
    const stream = await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`);
    const durableRequest = stream.find((event) => event.type === "agent.tool.requested");
    const completion = stream.find((event) => event.id === completed.resultEventId);

    expect({
      structuralRequestCalls,
      structuralCompletionCalls,
      durableSideEffectClass: durableRequest?.payload.sideEffectClass,
      readbackSideEffectClass: (request as ResidentLoopToolGatewayReadback & { sideEffectClass?: string }).sideEffectClass,
      completionActor: completion?.context.actor.id
    }).toEqual({
      structuralRequestCalls: 0,
      structuralCompletionCalls: 0,
      durableSideEffectClass: command.sideEffectClass,
      readbackSideEffectClass: command.sideEffectClass,
      completionActor: agentActor.id
    });
  });
});

async function prepareFixture() {
  const ledger = new InMemoryEventLedger();
  const source = await appendEvidence(ledger, { evidenceId: "ev_gateway_source" });
  const planStore = createResidentPlanObservationStore({ ledger, actor: agentActor, now: fixedNow });
  const plan = await planStore.recordPlan({
    identity: {
      residentAgentId: "agent_default",
      taskId: "task_gateway",
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runId: "run_gateway",
      policyId: "agent_policy_gateway",
      policyVersion: "1.0.0",
      policyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      authorityHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourceEventIds: [source.id],
      contextArtifactHashes: ["sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
      budget: { maxSteps: 1, remainingSteps: 1, contextBytes: 0 },
      causationEventId: source.id,
      correlationId: "corr_gateway_plan"
    },
    planRevision: 1,
    descriptorHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  });
  const agentGateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
  return {
    ledger,
    plan,
    planStore,
    agentGateway,
    approvalGateway: createAgentToolGateway({ ledger, actor: schedulerActor, now: fixedNow }),
    bridge: createBridge(ledger, agentGateway)
  };
}

function createBridge(
  ledger: EventLedger,
  gateway: Pick<ReturnType<typeof createAgentToolGateway>, "requestTool" | "completeToolFromSchedulerEvidence">
) {
  return createResidentLoopToolGateway({ ledger, gateway, now: fixedNow } as unknown as Parameters<typeof createResidentLoopToolGateway>[0]);
}

function requiredExecutionClaimEventId(readback: ResidentLoopToolGatewayReadback): string {
  if (readback.executionClaimEventId === undefined) {
    throw new Error("Test fixture must supply an execution claim before domain evidence.");
  }
  return readback.executionClaimEventId;
}

function mutateSelectedPlanAfterFirstRead(
  ledger: InMemoryEventLedger,
  planId: string,
  planStreamId: string
): EventLedger {
  let planReads = 0;
  return {
    append: ledger.append.bind(ledger),
    readAll: ledger.readAll.bind(ledger),
    async readStream(streamId: string): Promise<KnowledgeEvent[]> {
      const events = await ledger.readStream(streamId);
      if (streamId !== planStreamId || ++planReads === 1) {
        return events;
      }
      return events.map((event): KnowledgeEvent => {
        if (event.id !== planId || event.type !== "agent.resident-plan.recorded.v1") {
          return event;
        }
        const plan: KnowledgeEventOf<"agent.resident-plan.recorded.v1"> = event;
        return {
          ...plan,
          payload: {
            ...plan.payload,
            descriptorHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
          }
        };
      });
    }
  };
}

async function appendStructuralClaim(
  ledger: InMemoryEventLedger,
  decision: ResidentLoopToolGatewayReadback,
  actor: ActorRef,
  claimedBy: string
) {
  if (decision.decisionEventId === undefined) {
    throw new Error("Test fixture must produce a durable approval before its claim.");
  }
  return await ledger.append({
    type: "agent.tool.execution.claimed",
    version: 1,
    streamId: `agent_tool_request_${decision.toolRequestId}`,
    context: {
      actor,
      occurredAt: fixedNow(),
      causationId: decision.decisionEventId,
      correlationId: `corr_${decision.toolRequestId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      toolRequestId: decision.toolRequestId,
      claimedBy,
      claimedAt: fixedNow(),
      approvedPreviewHash: decision.previewHash,
      leaseExpiresAt: "2026-07-19T12:05:00.000Z"
    }
  }, { expectedNextSequence: 3 });
}

function requestInput(fixture: Awaited<ReturnType<typeof prepareFixture>>) {
  return {
    toolRequestId: "toolreq_gateway",
    taskId: fixture.plan.event.payload.taskId,
    attemptId: fixture.plan.event.payload.attemptId,
    runId: fixture.plan.event.payload.runId,
    planRecordEventId: fixture.plan.event.id,
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review" as const,
    approvalClass: "ledger-review" as const,
    preview: {
      summary: "Review the exact resident-loop gateway request.",
      scope: "resident-loop gateway test",
      estimatedEffect: "append durable test evidence only"
    }
  };
}

async function appendEvidence(
  ledger: InMemoryEventLedger,
  input: { readonly evidenceId: string; readonly causationId?: string }
) {
  return await ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${input.evidenceId}`,
    context: {
      actor: domainServiceActor,
      occurredAt: fixedNow(),
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      correlationId: `corr_${input.evidenceId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      evidenceId: input.evidenceId,
      source: { kind: "manual", label: "Resident-loop gateway evidence" },
      contentHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      mediaType: "application/json",
      sizeBytes: 1
    }
  });
}

const fixedNow = () => "2026-07-19T12:00:00.000Z";

const agentActor: ActorRef = { id: "agent_default", kind: "agent", label: "Cestus Agent" };
const foreignAgentActor: ActorRef = { id: "agent_gateway_other", kind: "agent", label: "Foreign Gateway Agent" };
const alternateGatewayActor: ActorRef = { id: "gateway_structural_alt", kind: "system", label: "Structural Gateway" };
const schedulerActor: ActorRef = { id: "scheduler_gateway", kind: "system", label: "Gateway Scheduler" };
const humanActor: ActorRef = { id: "human_gateway", kind: "human", label: "Gateway Reviewer" };
const domainServiceActor: ActorRef = { id: "gateway_domain", kind: "system", label: "Gateway Domain Service" };
