import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { describe, expect, it } from "vitest";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";
import { createResidentLoopToolGateway } from "../src/resident-loop-tool-gateway.js";
import { createAgentToolGateway } from "../src/tool-gateway.js";

describe("resident-loop tool gateway", () => {
  it("derives durable request, human decision, claim, and result readbacks through the private completion route", async () => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));

    expect(request).toMatchObject({
      taskId: "task_gateway",
      attemptId: "attempt_gateway",
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
        actor: agentActor,
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
});

async function prepareFixture() {
  const ledger = new InMemoryEventLedger();
  const source = await appendEvidence(ledger, { evidenceId: "ev_gateway_source" });
  const planStore = createResidentPlanObservationStore({ ledger, actor: agentActor, now: fixedNow });
  const plan = await planStore.recordPlan({
    identity: {
      residentAgentId: "agent_default",
      taskId: "task_gateway",
      attemptId: "attempt_gateway",
      runId: "run_gateway",
      policyId: "policy_gateway",
      policyVersion: "1.0.0",
      policyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      authorityHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourceEventIds: [source.id],
      contextArtifactHashes: [],
      budget: { maxSteps: 1, remainingSteps: 1, contextBytes: 0 },
      causationEventId: source.id,
      correlationId: "corr_gateway_plan"
    },
    planRevision: 0,
    descriptorHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  });
  const agentGateway = createAgentToolGateway({ ledger, actor: agentActor, now: fixedNow });
  return {
    ledger,
    plan,
    agentGateway,
    approvalGateway: createAgentToolGateway({ ledger, actor: schedulerActor, now: fixedNow }),
    bridge: createResidentLoopToolGateway({ ledger, gateway: agentGateway })
  };
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
const schedulerActor: ActorRef = { id: "scheduler_gateway", kind: "system", label: "Gateway Scheduler" };
const humanActor: ActorRef = { id: "human_gateway", kind: "human", label: "Gateway Reviewer" };
const domainServiceActor: ActorRef = { id: "gateway_domain", kind: "system", label: "Gateway Domain Service" };
