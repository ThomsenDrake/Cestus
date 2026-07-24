import { createHash } from "node:crypto";
import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { describe, expect, it } from "vitest";
import * as domainExecutionDispatcherModule from "../src/domain-execution-dispatcher.js";
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

  it("rejects a newer plan racing the official completion append without leaving completion behind", async () => {
    const fixture = await prepareFixture();
    const command = requestInput(fixture);
    const newerSource = await appendEvidence(fixture.ledger, { evidenceId: "ev_gateway_completion_race_source" });
    const race = injectNewPlanAtCompletionBoundary(fixture, command.toolRequestId, newerSource.id);
    const bridge = createBridge(race.ledger, fixture.agentGateway);
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

    await expect(bridge.executeAndReadback(decision, async (execution) => {
      const result = await appendEvidence(fixture.ledger, {
        evidenceId: "ev_gateway_completion_race_result",
        causationId: requiredExecutionClaimEventId(execution)
      });
      return {
        eventIds: [result.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "A plan race must conflict before official completion."
      };
    })).rejects.toThrow(/current|conflict/i);

    expect(race.wasInjected()).toBe(true);
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

  it("issues isolated resident lifecycle stages and never reexecutes a reread claim", async () => {
    const automatic = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "completed"
    });
    const human = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "human-approval",
      terminal: "completed"
    });
    expectCanonicalResidentDomainPrefix(automatic.events);
    expectCanonicalResidentDomainPrefix(human.events);

    const automaticReread = reflectedOperation(
      automatic.gateway,
      "rereadAndIssueFromLedger"
    );
    const humanReread = reflectedOperation(
      human.gateway,
      "rereadAndIssueFromLedger"
    );
    expect(automatic.preparedBinding).toEqual(expect.objectContaining({
      ordinal: automatic.locator.stepOrdinal,
      toolRequestId: automatic.locator.toolRequestId,
      executionCapabilityHash: automatic.locator.executionCapabilityHash
    }));
    expect(human.preparedBinding).toEqual(expect.objectContaining({
      ordinal: human.locator.stepOrdinal,
      toolRequestId: human.locator.toolRequestId,
      executionCapabilityHash: human.locator.executionCapabilityHash
    }));
    expect(automatic.composition.safeIdCalls).toBe(1);
    expect(human.composition.safeIdCalls).toBe(1);

    const beforeAutomatic = (await automatic.ledger.readAll()).length;
    const beforeHuman = (await human.ledger.readAll()).length;
    const automaticCompleted = await Reflect.apply(
      automaticReread,
      automatic.gateway,
      [automatic.locator]
    );
    const humanCompleted = await Reflect.apply(
      humanReread,
      human.gateway,
      [human.locator]
    );
    expect(automaticCompleted).toEqual(expect.objectContaining({
      authorizationKind: "automatic-policy",
      stage: "completed",
      requestEventId: automatic.request.id,
      executionClaimEventId: requiredPrefixEvent(automatic.claim, "claim").id,
      outcomeReceiptEventId: automatic.receipt?.id,
      resultEventId: automatic.terminal?.id
    }));
    expect(humanCompleted).toEqual(expect.objectContaining({
      authorizationKind: "human-approval",
      stage: "completed",
      requestEventId: human.request.id,
      decisionEventId: human.decision?.id,
      executionClaimEventId: requiredPrefixEvent(human.claim, "claim").id,
      outcomeReceiptEventId: human.receipt?.id,
      resultEventId: human.terminal?.id
    }));
    await Reflect.apply(automaticReread, automatic.gateway, [automatic.locator]);
    await Reflect.apply(humanReread, human.gateway, [human.locator]);
    expect(await automatic.ledger.readAll()).toHaveLength(beforeAutomatic);
    expect(await human.ledger.readAll()).toHaveLength(beforeHuman);
    expect(automatic.effects.count).toBe(0);
    expect(human.effects.count).toBe(0);
  });

  it("requires a live one-shot dispatcher permit and durable outcome receipt", async () => {
    const fresh = await prepareResidentGatewayHarness({
      authorizationKind: "automatic-policy",
      suffix: "fresh"
    });
    const requestFresh = reflectedOperation(
      fresh.gateway,
      "requestFreshAuthorized"
    );
    const execute = reflectedOperation(fresh.gateway, "executeFreshAuthorized");
    const requested = await Reflect.apply(
      requestFresh,
      fresh.gateway,
      [fresh.locator]
    );
    expect(requested).toEqual(expect.objectContaining({
      authorizationKind: "automatic-policy",
      stage: "requested",
      executionCapabilityHash: fresh.locator.executionCapabilityHash
    }));
    const [first, concurrent] = await Promise.allSettled([
      Reflect.apply(execute, fresh.gateway, [requested]),
      Reflect.apply(execute, fresh.gateway, [requested])
    ]);
    expect([first.status, concurrent.status].sort()).toEqual([
      "fulfilled",
      "rejected"
    ]);
    expect(fresh.effects.count).toBe(1);
    expect(fresh.composition.beforeEffectCalls).toBeGreaterThan(0);
    expect(fresh.composition.afterEffectCalls).toBeGreaterThan(0);

    await expect(Reflect.apply(execute, fresh.gateway, [requested]))
      .rejects.toThrow(/permit|consum|claimed|issued/i);
    const recoveredRequest = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "requested",
      suffix: "reread-request"
    });
    const reread = reflectedOperation(
      recoveredRequest.gateway,
      "rereadAndIssueFromLedger"
    );
    const rereadRequested = await Reflect.apply(
      reread,
      recoveredRequest.gateway,
      [recoveredRequest.locator]
    );
    const recoveredExecute = reflectedOperation(
      recoveredRequest.gateway,
      "executeFreshAuthorized"
    );
    await expect(Reflect.apply(
      recoveredExecute,
      recoveredRequest.gateway,
      [rereadRequested]
    )).rejects.toThrow(/fresh|permit|issued|recovery|reread/i);
    expect(recoveredRequest.effects.count).toBe(0);

    const foreign = await prepareResidentGatewayHarness({
      authorizationKind: "automatic-policy",
      suffix: "foreign"
    });
    const foreignExecute = reflectedOperation(foreign.gateway, "executeFreshAuthorized");
    await expect(Reflect.apply(foreignExecute, foreign.gateway, [requested]))
      .rejects.toThrow(/binding|locator|port|issued|foreign/i);
    expect(foreign.effects.count).toBe(0);

    const stream = await fresh.ledger.readStream(residentDomainStreamId(fresh.locator));
    expectCanonicalResidentDomainPrefix(stream);
    expect(stream.filter((event) =>
      event.type === "agent.resident-domain.execution-claimed.v1"
    )).toHaveLength(1);
    expect(stream.filter((event) =>
      event.type === "agent.resident-domain.outcome-observed.v1"
    )).toHaveLength(1);

    const human = await prepareResidentGatewayHarness({
      authorizationKind: "human-approval",
      suffix: "fresh-human"
    });
    const requestHuman = reflectedOperation(
      human.gateway,
      "requestFreshAuthorized"
    );
    const readFreshDecision = reflectedOperation(
      human.gateway,
      "readFreshHumanDecision"
    );
    const executeHuman = reflectedOperation(
      human.gateway,
      "executeFreshAuthorized"
    );
    const humanRequested = await Reflect.apply(
      requestHuman,
      human.gateway,
      [human.locator]
    );
    const independentApproval = await appendIndependentResidentHumanApproval(
      human.ledger,
      human.locator,
      "fresh-human"
    );
    const humanApproved = await Reflect.apply(
      readFreshDecision,
      human.gateway,
      [humanRequested]
    );
    expect(humanApproved).toEqual(expect.objectContaining({
      authorizationKind: "human-approval",
      stage: "human-approved",
      requestEventId: independentApproval.payload.requestEventId,
      decisionEventId: independentApproval.payload.decisionEventId,
      approvedBy: humanActor.id,
      approvedPreviewHash: independentApproval.payload.approvedPreviewHash
    }));
    const humanCompleted = await Reflect.apply(
      executeHuman,
      human.gateway,
      [humanApproved]
    );
    expect(humanCompleted).toEqual(expect.objectContaining({
      authorizationKind: "human-approval",
      stage: "completed"
    }));
    expect(human.effects.count).toBe(1);
    await expect(Reflect.apply(
      readFreshDecision,
      human.gateway,
      [humanRequested]
    )).rejects.toThrow(/consum|fresh|issued|decision/i);

    const recoveredHuman = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "human-approval",
      terminal: "requested",
      suffix: "reread-human-approved"
    });
    const rereadHuman = reflectedOperation(
      recoveredHuman.gateway,
      "rereadAndIssueFromLedger"
    );
    const recoveryOnlyRequested = await Reflect.apply(
      rereadHuman,
      recoveredHuman.gateway,
      [recoveredHuman.locator]
    );
    expect(recoveryOnlyRequested).toEqual(expect.objectContaining({
      authorizationKind: "human-approval",
      stage: "requested"
    }));
    const recoveredHumanReadDecision = reflectedOperation(
      recoveredHuman.gateway,
      "readFreshHumanDecision"
    );
    const recoveredHumanExecute = reflectedOperation(
      recoveredHuman.gateway,
      "executeFreshAuthorized"
    );
    await appendIndependentResidentHumanApproval(
      recoveredHuman.ledger,
      recoveredHuman.locator,
      "reread-human-approved"
    );
    await expect(Reflect.apply(
      recoveredHumanReadDecision,
      recoveredHuman.gateway,
      [recoveryOnlyRequested]
    )).rejects.toThrow(/fresh|recovery|reread|issued/i);
    await expect(Reflect.apply(
      recoveredHumanExecute,
      recoveredHuman.gateway,
      [recoveryOnlyRequested]
    )).rejects.toThrow(/fresh|recovery|reread|permit|issued/i);
    const recoveryOnlyApproved = await Reflect.apply(
      rereadHuman,
      recoveredHuman.gateway,
      [recoveredHuman.locator]
    );
    expect(recoveryOnlyApproved).toEqual(expect.objectContaining({
      authorizationKind: "human-approval",
      stage: "human-approved"
    }));
    await expect(Reflect.apply(
      recoveredHumanReadDecision,
      recoveredHuman.gateway,
      [recoveryOnlyApproved]
    )).rejects.toThrow(/fresh|recovery|reread|issued/i);
    await expect(Reflect.apply(
      recoveredHumanExecute,
      recoveredHuman.gateway,
      [recoveryOnlyApproved]
    )).rejects.toThrow(/fresh|recovery|reread|permit|issued/i);
    expect(recoveredHuman.effects.count).toBe(0);

    await proveHostileResidentHumanDecisionMatrix();
  });

  it("seals claim-without-receipt as effect-outcome-unknown", async () => {
    for (const authorizationKind of [
      "automatic-policy",
      "human-approval"
    ] as const) {
      const claimed = await appendCanonicalResidentDomainPrefix({
        authorizationKind,
        terminal: "claimed",
        suffix: authorizationKind
      });
      expectCanonicalResidentDomainPrefix(claimed.events);
      const reread = reflectedOperation(
        claimed.gateway,
        "rereadAndIssueFromLedger"
      );
      const unknown = await Reflect.apply(
        reread,
        claimed.gateway,
        [claimed.locator]
      );
      expect(unknown).toEqual(expect.objectContaining({
        authorizationKind,
        stage: "claimed",
        category: "effect-outcome-unknown",
        requestEventId: claimed.request.id,
        executionClaimEventId: requiredPrefixEvent(claimed.claim, "claim").id
      }));
      expect(claimed.effects.count).toBe(0);
      expect(await claimed.ledger.readStream(
        residentDomainStreamId(claimed.locator)
      )).toHaveLength(claimed.events.length);
    }

    const receipted = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "receipt",
      suffix: "receipt"
    });
    expectCanonicalResidentDomainPrefix(receipted.events);
    const reread = reflectedOperation(
      receipted.gateway,
      "rereadAndIssueFromLedger"
    );
    const recovered = await Reflect.apply(
      reread,
      receipted.gateway,
      [receipted.locator]
    );
    expect(recovered).toEqual(expect.objectContaining({
      authorizationKind: "automatic-policy",
      stage: "completed",
      requestEventId: receipted.request.id,
      executionClaimEventId:
        requiredPrefixEvent(receipted.claim, "claim").id,
      outcomeReceiptEventId: receipted.receipt?.id,
      resultEventId: expect.stringMatching(/^evt_/)
    }));
    expect(receipted.effects.count).toBe(0);
    const recoveredStream = await receipted.ledger.readStream(
      residentDomainStreamId(receipted.locator)
    );
    expectCanonicalResidentDomainPrefix(recoveredStream);
    expect(recoveredStream.at(-1)?.context.causationId)
      .toBe(receipted.receipt?.id);
  });
});

type ResidentAuthorizationKind = "automatic-policy" | "human-approval";
type ResidentPrefixTerminal = "requested" | "claimed" | "receipt" | "completed";

interface CanonicalResidentPrefix {
  readonly ledger: InMemoryEventLedger;
  readonly gateway: object;
  readonly effects: { count: number };
  readonly composition: ResidentGatewayCompositionCounts;
  readonly preparedBinding: Readonly<Record<string, unknown>>;
  readonly locator: ResidentLogicalLocator;
  readonly events: readonly KnowledgeEvent[];
  readonly request: KnowledgeEvent;
  readonly decision?: KnowledgeEvent;
  readonly claim?: KnowledgeEvent;
  readonly receipt?: KnowledgeEvent;
  readonly terminal?: KnowledgeEvent;
}

interface ResidentGatewayCompositionCounts {
  safeIdCalls: number;
  beforeEffectCalls: number;
  afterEffectCalls: number;
}

interface ResidentGatewayHarness {
  readonly ledger: InMemoryEventLedger;
  readonly gateway: object;
  readonly effects: { count: number };
  readonly composition: ResidentGatewayCompositionCounts;
  readonly source: KnowledgeEvent;
  readonly plan: KnowledgeEvent;
  readonly preparedBinding: Readonly<Record<string, unknown>>;
  readonly locator: ResidentLogicalLocator;
}

interface UnknownResidentDomainApi {
  readonly create: (input: unknown) => Promise<unknown>;
  readonly bind: (input: unknown) => unknown;
}

type ResidentRequestedAppend = Extract<
  AppendableKnowledgeEvent,
  { readonly type: "agent.resident-domain.requested.v1" }
>;
type ResidentLogicalLocator =
  ResidentRequestedAppend["payload"]["logicalLocator"];
type ResidentBudget = ResidentRequestedAppend["payload"]["budget"];

function createRevisedGateway(
  ledger: EventLedger,
  residentDomainExecutionPort: unknown,
  composition: ResidentGatewayCompositionCounts,
  suffix: string,
  now: () => string = fixedNow
): object {
  const gateway = Reflect.apply(createResidentLoopToolGateway, undefined, [{
    ledger,
    now,
    residentDomainExecutionPort,
    async reverifyBeforeEffect() {
      composition.beforeEffectCalls += 1;
      return Object.freeze({ kind: "current" });
    },
    async reverifyAfterEffect() {
      composition.afterEffectCalls += 1;
      return Object.freeze({ kind: "current" });
    },
    createTrustedToolRequestId() {
      composition.safeIdCalls += 1;
      return `toolreq_gateway_${suffix}_${composition.safeIdCalls}`;
    }
  }]);
  if (typeof gateway !== "object" || gateway === null) {
    throw new Error("Resident gateway constructor returned no object.");
  }
  return gateway;
}

function reflectedOperation(target: object, name: string): (...args: unknown[]) => unknown {
  const operation = Reflect.get(target, name);
  expect(typeof operation, `${name} must be an executable operation`).toBe("function");
  if (typeof operation !== "function") {
    throw new Error(`Resident gateway operation ${name} is unavailable.`);
  }
  return (...args: unknown[]) => Reflect.apply(operation, target, args);
}

function residentDomainApi(module: object): UnknownResidentDomainApi {
  const candidate = Reflect.get(module, "default");
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Object.isFrozen(candidate)
  ) {
    throw new Error("Task12 resident dispatcher default API is absent.");
  }
  const create = Reflect.get(
    candidate,
    "createPackageOwnedResidentDomainExecutionCapability"
  );
  const bind = Reflect.get(
    candidate,
    "bindPackageOwnedResidentDomainExecutionPort"
  );
  if (typeof create !== "function" || typeof bind !== "function") {
    throw new Error("Task12 resident dispatcher issuer or binder is absent.");
  }
  return {
    create(input: unknown) {
      return Promise.resolve(Reflect.apply(create, candidate, [input]));
    },
    bind(input: unknown) {
      return Reflect.apply(bind, candidate, [input]);
    }
  };
}

function isFrozenOpaqueObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.isFrozen(value);
}

function requiredPreparedBinding(
  value: unknown
): Readonly<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("Resident gateway must prepare exactly one binding.");
  }
  const binding = value[0];
  if (typeof binding !== "object" || binding === null) {
    throw new Error("Resident gateway prepared binding is absent.");
  }
  return binding as Readonly<Record<string, unknown>>;
}

function requiredPrefixEvent(
  event: KnowledgeEvent | undefined,
  label: string
): KnowledgeEvent {
  if (event === undefined) {
    throw new Error(`Canonical resident prefix is missing its ${label}.`);
  }
  return event;
}

function requiredStringProperty(
  value: Readonly<Record<string, unknown>>,
  key: string,
  pattern: RegExp
): string {
  const field = Reflect.get(value, key);
  if (typeof field !== "string" || !pattern.test(field)) {
    throw new Error(`Resident gateway ${key} is not canonical.`);
  }
  return field;
}

function residentLegacyContext(
  ledger: InMemoryEventLedger,
  effects: { count: number },
  source: KnowledgeEvent,
  suffix: string
): Readonly<Record<string, unknown>> {
  const reportHash =
    "sha256:9999999999999999999999999999999999999999999999999999999999999999";
  const candidateSetHash =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const candidateId = `legacy_candidate_gateway_${suffix}`;
  const assertionId = `as_legacy_${createHash("sha256").update([
    "src_gateway_legacy",
    "scan_gateway_legacy",
    `stage_gateway_${suffix}`,
    candidateSetHash,
    candidateId
  ].join(":")).digest("hex")}`;
  const runtime = {
    async stagingPreview() {
      return {
        ok: true as const,
        command: "legacy staging-preview",
        sourceCollectionId: "src_gateway_legacy",
        legacyReportId: `legacy_report_gateway_${suffix}`,
        reportHash,
        candidateSetHash,
        candidates: [{
          candidateId,
          evidenceId: Reflect.get(source.payload, "evidenceId"),
          evidenceContentHash: Reflect.get(source.payload, "contentHash"),
          sourcePath: "gateway-fixture.json"
        }],
        nextActions: []
      };
    },
    async approveStaging(_input: Readonly<Record<string, unknown>>) {
      effects.count += 1;
      const approved = await ledger.append({
        type: "legacy.ontology.staging.approved",
        version: 1,
        streamId:
          `legacy_staging_src_gateway_legacy_scan_gateway_legacy_stage_gateway_${suffix}`,
        context: residentEventContext(source.id, `corr_gateway_approval_${suffix}`, humanActor),
        payload: {
          stagingBatchId: `stage_gateway_${suffix}`,
          legacyReportId: `legacy_report_gateway_${suffix}`,
          sourceCollectionId: "src_gateway_legacy",
          scanBatchId: "scan_gateway_legacy",
          reportHash,
          candidateSetHash,
          approvedBy: humanActor.id,
          approvedAt: fixedNow(),
          approvedAssertionCandidateIds: [candidateId]
        }
      });
      return {
        ok: true as const,
        command: "legacy approve-staging",
        sourceCollectionId: "src_gateway_legacy",
        scanBatchId: "scan_gateway_legacy",
        eventIds: [approved.id],
        nextActions: [],
        legacyReportId: `legacy_report_gateway_${suffix}`,
        stagingBatchId: `stage_gateway_${suffix}`,
        reportHash,
        candidateSetHash,
        approvedAssertionCandidateIds: [candidateId]
      };
    },
    async stageApproved() {
      effects.count += 1;
      const proposed = await ledger.append({
        type: "assertion.proposed",
        version: 1,
        streamId: `assertion_${assertionId}`,
        context: residentEventContext(source.id, `corr_gateway_effect_${suffix}`),
        payload: {
          assertionId,
          evidenceId: Reflect.get(source.payload, "evidenceId"),
          predicate: "legacy.gateway.fixture",
          object: candidateId,
          confidence: 0.8,
          reviewState: "proposed"
        }
      });
      return {
        ok: true as const,
        command: "legacy stage",
        sourceCollectionId: "src_gateway_legacy",
        scanBatchId: "scan_gateway_legacy",
        eventIds: [proposed.id],
        nextActions: [],
        legacyReportId: `legacy_report_gateway_${suffix}`,
        stagingBatchId: `stage_gateway_${suffix}`,
        proposedAssertionIds: [assertionId]
      };
    }
  };
  return {
    runtime,
    ledger,
    residentAgentId: "agent_default",
    sourceCollectionId: "src_gateway_legacy",
    scanBatchId: "scan_gateway_legacy",
    stagingBatchId: `stage_gateway_${suffix}`,
    legacyReportId: `legacy_report_gateway_${suffix}`,
    reportHash,
    candidateSetHash,
    selectedCandidateIds: [candidateId]
  };
}

async function prepareResidentGatewayHarness(input: {
  readonly authorizationKind: ResidentAuthorizationKind;
  readonly suffix: string;
  readonly now?: () => string;
}): Promise<ResidentGatewayHarness> {
  const workspaceId = "ws_gateway";
  const residentAgentId = "agent_default";
  const taskId = "task_gateway";
  const attemptId =
    "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const runId = "run_gateway";
  const planId = `plan_gateway_${input.suffix}`;
  const planRevision = 0;
  const stepOrdinal = 1;
  const toolId = input.authorizationKind === "automatic-policy"
    ? "legacy.staging.execute"
    : "legacy.staging.approve";
  const toolVersion = "0.1.0";
  const ledger = new InMemoryEventLedger();
  const effects = { count: 0 };
  const composition: ResidentGatewayCompositionCounts = {
    safeIdCalls: 0,
    beforeEffectCalls: 0,
    afterEffectCalls: 0
  };
  const source = await appendEvidence(ledger, {
    evidenceId: `ev_resident_domain_${input.suffix}`
  });
  const residentApi = residentDomainApi(domainExecutionDispatcherModule);
  const capability = await residentApi.create({
    kind: "legacy-staging",
    workspaceId,
    residentAgentId,
    taskId,
    context: residentLegacyContext(ledger, effects, source, input.suffix)
  });
  expect(capability).toSatisfy(isFrozenOpaqueObject);
  const port = residentApi.bind({
    capability,
    mountedLedger: ledger,
    workspaceId,
    residentAgentId,
    taskId
  });
  expect(port).toSatisfy(isFrozenOpaqueObject);
  const gateway = createRevisedGateway(
    ledger,
    port,
    composition,
    input.suffix,
    input.now
  );
  expect(Object.isFrozen(gateway)).toBe(true);
  const prepare = reflectedOperation(gateway, "preparePlannedStepBindings");
  const rawBindings = await Reflect.apply(prepare, gateway, [{
    workspaceId,
    residentAgentId,
    taskId,
    attemptId,
    runId,
    planId,
    planRevision,
    steps: [{ ordinal: stepOrdinal, toolId, toolVersion }]
  }]);
  expect(rawBindings).toEqual([
    expect.objectContaining({
      ordinal: stepOrdinal,
      toolRequestId: expect.stringMatching(/^toolreq_/),
      executionCapabilityHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    })
  ]);
  const preparedBinding = requiredPreparedBinding(rawBindings);
  const toolRequestId = requiredStringProperty(
    preparedBinding,
    "toolRequestId",
    /^toolreq_/
  );
  const executionCapabilityHash = requiredStringProperty(
    preparedBinding,
    "executionCapabilityHash",
    /^sha256:[a-f0-9]{64}$/
  ) as `sha256:${string}`;
  const plan = await appendCanonicalResidentPlan(ledger, source.id, {
    workspaceId,
    residentAgentId,
    taskId,
    attemptId,
    runId,
    planId,
    planRevision,
    stepOrdinal,
    toolRequestId,
    toolId,
    toolVersion,
    executionCapabilityHash,
    suffix: input.suffix
  });
  const locator: ResidentLogicalLocator = deepFreezePlain({
    workspaceId,
    residentAgentId,
    taskId,
    attemptId,
    runId,
    planId,
    planRevision,
    stepOrdinal,
    toolRequestId,
    toolId,
    toolVersion,
    executionCapabilityHash
  });
  return {
    ledger,
    gateway,
    effects,
    composition,
    source,
    plan,
    preparedBinding,
    locator
  };
}

async function appendIndependentResidentHumanApproval(
  ledger: InMemoryEventLedger,
  locator: ResidentLogicalLocator,
  suffix: string
): Promise<KnowledgeEventOf<"agent.resident-domain.human-approved.v1">> {
  return appendResidentHumanApproval(ledger, locator, suffix);
}

interface ResidentHumanApprovalOptions {
  readonly actor?: ActorRef;
  readonly occurredAt?: string;
  readonly approvedPreviewHash?: `sha256:${string}`;
  readonly expectedNextSequence?: number;
}

async function appendResidentHumanApproval(
  ledger: InMemoryEventLedger,
  locator: ResidentLogicalLocator,
  suffix: string,
  options: ResidentHumanApprovalOptions = {}
): Promise<KnowledgeEventOf<"agent.resident-domain.human-approved.v1">> {
  const streamId = residentDomainStreamId(locator);
  const stream = await ledger.readStream(streamId);
  const requested = stream.find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.requested.v1"> =>
      event.type === "agent.resident-domain.requested.v1"
  );
  if (requested === undefined) {
    throw new Error("Fresh resident request was not durably appended.");
  }
  const actor = options.actor ?? humanActor;
  const approved = await ledger.append({
    type: "agent.resident-domain.human-approved.v1",
    version: 1,
    streamId,
    context: residentEventContext(
      requested.id,
      requested.payload.correlationId,
      actor,
      options.occurredAt
    ),
    payload: {
      schemaVersion: "resident-domain-human-approved.v1",
      logicalLocator: locator,
      executionCapabilityHash: locator.executionCapabilityHash,
      causationId: requested.id,
      correlationId: requested.payload.correlationId,
      authorizationKind: "human-approval",
      requestEventId: requested.id,
      decisionEventId: `evt_independent_human_decision_${suffix}`,
      approvedBy: actor.id,
      approvedPreviewHash:
        options.approvedPreviewHash ?? requested.payload.previewHash
    }
  }, { expectedNextSequence: options.expectedNextSequence ?? 2 });
  if (approved.type !== "agent.resident-domain.human-approved.v1") {
    throw new Error("Independent resident human approval was not appended.");
  }
  return approved;
}

async function appendResidentHumanDenial(
  ledger: InMemoryEventLedger,
  locator: ResidentLogicalLocator,
  suffix: string,
  expectedNextSequence: number
): Promise<KnowledgeEventOf<"agent.resident-domain.denied.v1">> {
  const streamId = residentDomainStreamId(locator);
  const stream = await ledger.readStream(streamId);
  const requested = stream.find(
    (event): event is KnowledgeEventOf<"agent.resident-domain.requested.v1"> =>
      event.type === "agent.resident-domain.requested.v1"
  );
  if (requested === undefined) {
    throw new Error("Resident human denial requires the durable request.");
  }
  const denied = await ledger.append({
    type: "agent.resident-domain.denied.v1",
    version: 1,
    streamId,
    context: residentEventContext(
      requested.id,
      requested.payload.correlationId,
      humanActor
    ),
    payload: {
      schemaVersion: "resident-domain-denied.v1",
      logicalLocator: locator,
      executionCapabilityHash: locator.executionCapabilityHash,
      causationId: requested.id,
      correlationId: requested.payload.correlationId,
      authorizationKind: "human-approval",
      requestEventId: requested.id,
      deniedBy: humanActor.id,
      denialReason: `Independent human ${suffix} decision.`
    }
  }, { expectedNextSequence });
  if (denied.type !== "agent.resident-domain.denied.v1") {
    throw new Error("Independent resident human denial was not appended.");
  }
  return denied;
}

interface LiveHumanDecisionCase {
  readonly harness: ResidentGatewayHarness;
  readonly requested: unknown;
  readonly readDecision: (...args: unknown[]) => unknown;
  readonly execute: (...args: unknown[]) => unknown;
}

async function prepareLiveHumanDecisionCase(
  suffix: string,
  now?: () => string
): Promise<LiveHumanDecisionCase> {
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: "human-approval",
    suffix,
    ...(now === undefined ? {} : { now })
  });
  const request = reflectedOperation(
    harness.gateway,
    "requestFreshAuthorized"
  );
  const requested = await Reflect.apply(request, harness.gateway, [
    harness.locator
  ]);
  return {
    harness,
    requested,
    readDecision: reflectedOperation(
      harness.gateway,
      "readFreshHumanDecision"
    ),
    execute: reflectedOperation(
      harness.gateway,
      "executeFreshAuthorized"
    )
  };
}

async function proveHostileResidentHumanDecisionMatrix(): Promise<void> {
  const zero = await prepareLiveHumanDecisionCase("decision-zero");
  await expect(Reflect.apply(
    zero.readDecision,
    zero.harness.gateway,
    [zero.requested]
  )).rejects.toThrow(/decision|approval|exactly one|unavailable/i);
  await expectNoResidentHumanExecution(zero);

  const multiple = await prepareLiveHumanDecisionCase("decision-multiple");
  await appendResidentHumanApproval(
    multiple.harness.ledger,
    multiple.harness.locator,
    "decision-multiple-first"
  );
  await appendResidentHumanApproval(
    multiple.harness.ledger,
    multiple.harness.locator,
    "decision-multiple-second",
    { expectedNextSequence: 3 }
  );
  await expect(Reflect.apply(
    multiple.readDecision,
    multiple.harness.gateway,
    [multiple.requested]
  )).rejects.toThrow(/multiple|exactly one|decision|approval/i);
  await expectNoResidentHumanExecution(multiple);

  const selfIssued = await prepareLiveHumanDecisionCase(
    "decision-self-issued"
  );
  await appendResidentHumanApproval(
    selfIssued.harness.ledger,
    selfIssued.harness.locator,
    "decision-self-issued",
    { actor: agentActor }
  );
  await expect(Reflect.apply(
    selfIssued.readDecision,
    selfIssued.harness.gateway,
    [selfIssued.requested]
  )).rejects.toThrow(/self|independent|human|decision|approval/i);
  await expectNoResidentHumanExecution(selfIssued);

  const stale = await prepareLiveHumanDecisionCase("decision-stale");
  await appendResidentHumanApproval(
    stale.harness.ledger,
    stale.harness.locator,
    "decision-stale",
    { occurredAt: "2026-07-18T12:00:00.000Z" }
  );
  await expect(Reflect.apply(
    stale.readDecision,
    stale.harness.gateway,
    [stale.requested]
  )).rejects.toThrow(/stale|current|decision|approval/i);
  await expectNoResidentHumanExecution(stale);

  let currentTime = fixedNow();
  const expired = await prepareLiveHumanDecisionCase(
    "decision-expired",
    () => currentTime
  );
  await appendResidentHumanApproval(
    expired.harness.ledger,
    expired.harness.locator,
    "decision-expired"
  );
  currentTime = "2026-07-21T12:00:00.000Z";
  await expect(Reflect.apply(
    expired.readDecision,
    expired.harness.gateway,
    [expired.requested]
  )).rejects.toThrow(/expired|deadline|stale|decision|approval/i);
  await expectNoResidentHumanExecution(expired);

  const denied = await prepareLiveHumanDecisionCase("decision-denied");
  await appendResidentHumanDenial(
    denied.harness.ledger,
    denied.harness.locator,
    "denied",
    2
  );
  await expect(Reflect.apply(
    denied.readDecision,
    denied.harness.gateway,
    [denied.requested]
  )).rejects.toThrow(/denied|terminal|decision|approval/i);
  await expectNoResidentHumanExecution(denied);

  const revoked = await prepareLiveHumanDecisionCase("decision-revoked");
  await appendResidentHumanApproval(
    revoked.harness.ledger,
    revoked.harness.locator,
    "decision-revoked"
  );
  await appendResidentHumanDenial(
    revoked.harness.ledger,
    revoked.harness.locator,
    "revoked",
    3
  );
  await expect(Reflect.apply(
    revoked.readDecision,
    revoked.harness.gateway,
    [revoked.requested]
  )).rejects.toThrow(/revoked|denied|terminal|decision|approval/i);
  await expectNoResidentHumanExecution(revoked);

  const mismatched = await prepareLiveHumanDecisionCase(
    "decision-preview-mismatch"
  );
  await appendResidentHumanApproval(
    mismatched.harness.ledger,
    mismatched.harness.locator,
    "decision-preview-mismatch",
    {
      approvedPreviewHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  );
  await expect(Reflect.apply(
    mismatched.readDecision,
    mismatched.harness.gateway,
    [mismatched.requested]
  )).rejects.toThrow(/preview|mismatch|decision|approval/i);
  await expectNoResidentHumanExecution(mismatched);
}

async function expectNoResidentHumanExecution(
  input: LiveHumanDecisionCase
): Promise<void> {
  await expect(Reflect.apply(
    input.execute,
    input.harness.gateway,
    [input.requested]
  )).rejects.toThrow(/human|approval|fresh|decision|issued|permit/i);
  const stream = await input.harness.ledger.readStream(
    residentDomainStreamId(input.harness.locator)
  );
  expect(stream.some((event) =>
    event.type === "agent.resident-domain.execution-claimed.v1" ||
    event.type === "agent.resident-domain.outcome-observed.v1" ||
    event.type === "agent.resident-domain.completed.v1"
  )).toBe(false);
  expect(input.harness.effects.count).toBe(0);
}

async function appendCanonicalResidentDomainPrefix(input: {
  readonly authorizationKind: ResidentAuthorizationKind;
  readonly terminal: ResidentPrefixTerminal;
  readonly suffix?: string;
}): Promise<CanonicalResidentPrefix> {
  const suffix = input.suffix ?? "canonical";
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: input.authorizationKind,
    suffix
  });
  const {
    ledger,
    gateway,
    effects,
    composition,
    source,
    plan,
    preparedBinding,
    locator
  } = harness;
  const capabilityHash = locator.executionCapabilityHash;
  const streamId = residentDomainStreamId(locator);
  const correlationId = `corr_gateway_${suffix}`;
  const requestedInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.requested.v1" }
  > = {
    type: "agent.resident-domain.requested.v1",
    version: 1,
    streamId,
    context: residentEventContext(plan.id, correlationId),
    payload: {
      schemaVersion: "resident-domain-requested.v1",
      logicalLocator: locator,
      executionCapabilityHash: capabilityHash,
      causationId: plan.id,
      correlationId,
      authorizationKind: input.authorizationKind,
      planRecordEventId: plan.id,
      previewHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      allowlistEntryHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      sideEffectClass: input.authorizationKind === "automatic-policy"
        ? "ledger-proposal"
        : "ledger-review",
      expectedSafeOutputClass: "proposal",
      requiredApprovalClass: input.authorizationKind === "automatic-policy"
        ? "none"
        : "ledger-review",
      sourceEventIds: [source.id],
      contextPackRefs: [{
        contextPackId: "context_pack_gateway",
        contentHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      }],
      inputArtifactHashes: [],
      policy: {
        policyId: "agent_policy_gateway",
        policyVersion: "policy_gateway_v1",
        policyHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      },
      authority: {
        workspaceIdentityHash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        mountGeneration: "mount_gateway",
        ledgerStoreIdentity: "ledger_gateway",
        artifactStoreIdentity: "artifact_gateway",
        ledgerHighWaterEventId: source.id,
        policyHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        activeLocksHash:
          "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      },
      budget: residentBudget(1, 1)
    }
  };
  const requested = await ledger.append(requestedInput, {
    expectedNextSequence: 1
  });
  const events: KnowledgeEvent[] = [requested];
  if (input.terminal === "requested") {
    return {
      ledger,
      gateway,
      effects,
      composition,
      preparedBinding,
      locator,
      events: Object.freeze(events),
      request: requested
    };
  }

  let decision: KnowledgeEvent | undefined;
  if (input.authorizationKind === "human-approval") {
    const decisionInput: Extract<
      AppendableKnowledgeEvent,
      { readonly type: "agent.resident-domain.human-approved.v1" }
    > = {
      type: "agent.resident-domain.human-approved.v1",
      version: 1,
      streamId,
      context: residentEventContext(requested.id, correlationId, humanActor),
      payload: {
        schemaVersion: "resident-domain-human-approved.v1",
        logicalLocator: locator,
        executionCapabilityHash: capabilityHash,
        causationId: requested.id,
        correlationId,
        authorizationKind: "human-approval",
        requestEventId: requested.id,
        decisionEventId: "evt_human_decision_gateway",
        approvedBy: humanActor.id,
        approvedPreviewHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    };
    decision = await ledger.append(decisionInput, {
      expectedNextSequence: 2
    });
    events.push(decision);
  }
  const authorization = input.authorizationKind === "automatic-policy"
    ? { authorizationKind: "automatic-policy" as const }
    : {
        authorizationKind: "human-approval" as const,
        decisionEventId: "evt_human_decision_gateway",
        approvedBy: humanActor.id,
        approvedPreviewHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      };
  const claimCausationId = decision?.id ?? requested.id;
  const claimInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.execution-claimed.v1" }
  > = {
    type: "agent.resident-domain.execution-claimed.v1",
    version: 1,
    streamId,
    context: residentEventContext(claimCausationId, correlationId),
    payload: {
      schemaVersion: "resident-domain-execution-claimed.v1",
      logicalLocator: locator,
      executionCapabilityHash: capabilityHash,
      causationId: claimCausationId,
      correlationId,
      requestEventId: requested.id,
      authorization,
      claimedAt: fixedNow()
    }
  };
  const claim = await ledger.append(claimInput, {
    expectedNextSequence: events.length + 1
  });
  events.push(claim);
  if (input.terminal === "claimed") {
    return {
      ledger,
      gateway,
      effects,
      composition,
      preparedBinding,
      locator,
      events: Object.freeze(events),
      request: requested,
      ...(decision === undefined ? {} : { decision }),
      claim
    };
  }

  const preInvocationLedgerFingerprint = ledgerFingerprint(
    await ledger.readAll()
  );
  const domainEvent = input.authorizationKind === "automatic-policy"
    ? await appendLegacyAssertionProposal(ledger, source, suffix)
    : await appendLegacyStagingApproval(ledger, suffix);
  const postInvocationLedgerFingerprint = ledgerFingerprint(
    await ledger.readAll()
  );
  const catalogOrdinal = input.authorizationKind === "automatic-policy" ? 10 : 9;
  const implementationRevision = input.authorizationKind === "automatic-policy"
    ? "legacy-staging-execution.adapter.v1"
    : "legacy-staging-approval.adapter.v1";
  const receiptEnvelope = {
    logicalLocator: locator,
    executionCapabilityHash: capabilityHash,
    requestEventId: requested.id,
    executionClaimEventId: claim.id,
    authorization,
    catalogOrdinal,
    implementationRevision,
    evidenceMode: "new-ledger-events" as const,
    residentInvocationInputHash: hashCanonical({
      logicalLocator: locator,
      requestEventId: requested.id,
      executionClaimEventId: claim.id,
      authorization
    }),
    outcomeDisposition: "completed" as const,
    preInvocationLedgerFingerprint,
    postInvocationLedgerFingerprint,
    domainEventIds: [domainEvent.id],
    artifactHashes: [],
    readModelChanges: ["legacy-staging"],
    resultSummary: "Canonical resident domain outcome."
  };
  const receiptInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.outcome-observed.v1" }
  > = {
    type: "agent.resident-domain.outcome-observed.v1",
    version: 1,
    streamId,
    context: residentEventContext(claim.id, correlationId),
    payload: {
      schemaVersion: "resident-domain-outcome-observed.v1",
      causationId: claim.id,
      correlationId,
      ...receiptEnvelope,
      envelopeHash: hashCanonical(receiptEnvelope)
    }
  };
  const receipt = await ledger.append(receiptInput, {
    expectedNextSequence: events.length + 1
  });
  events.push(receipt);
  if (input.terminal === "receipt") {
    return {
      ledger,
      gateway,
      effects,
      composition,
      preparedBinding,
      locator,
      events: Object.freeze(events),
      request: requested,
      ...(decision === undefined ? {} : { decision }),
      claim,
      receipt
    };
  }

  const terminalInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-domain.completed.v1" }
  > = {
    type: "agent.resident-domain.completed.v1",
    version: 1,
    streamId,
    context: residentEventContext(receipt.id, correlationId),
    payload: {
      schemaVersion: "resident-domain-completed.v1",
      logicalLocator: locator,
      executionCapabilityHash: capabilityHash,
      causationId: receipt.id,
      correlationId,
      requestEventId: requested.id,
      executionClaimEventId: claim.id,
      outcomeReceiptEventId: receipt.id,
      authorization,
      resultHash: hashCanonical(receiptEnvelope),
      resultArtifactHashes: []
    }
  };
  const terminal = await ledger.append(terminalInput, {
    expectedNextSequence: events.length + 1
  });
  events.push(terminal);
  return {
    ledger,
    gateway,
    effects,
    composition,
    preparedBinding,
    locator,
    events: Object.freeze(events),
    request: requested,
    ...(decision === undefined ? {} : { decision }),
    claim,
    receipt,
    terminal
  };
}

function expectCanonicalResidentDomainPrefix(events: readonly KnowledgeEvent[]): void {
  expect(events.length).toBeGreaterThan(0);
  for (const [index, event] of events.entries()) {
    const validation = validateKnowledgeEvent(event);
    expect(validation.success, JSON.stringify(validation)).toBe(true);
    expect(event.sequence).toBe(index + 1);
    expect(event.streamId).toBe(events[0]?.streamId);
    expect(event.payload).toEqual(expect.objectContaining({
      logicalLocator: Reflect.get(events[0]?.payload ?? {}, "logicalLocator"),
      executionCapabilityHash: Reflect.get(
        events[0]?.payload ?? {},
        "executionCapabilityHash"
      ),
      correlationId: Reflect.get(events[0]?.payload ?? {}, "correlationId")
    }));
    if (index > 0) {
      expect(event.context.causationId).toBe(events[index - 1]?.id);
      expect(Reflect.get(event.payload, "causationId"))
        .toBe(events[index - 1]?.id);
    }
  }
}

async function appendLegacyAssertionProposal(
  ledger: InMemoryEventLedger,
  source: KnowledgeEvent,
  suffix: string
): Promise<KnowledgeEvent> {
  const assertionId = `as_gateway_recovery_${suffix}`;
  const proposed = await ledger.append({
    type: "assertion.proposed",
    version: 1,
    streamId: `assertion_${assertionId}`,
    context: residentEventContext(
      source.id,
      `corr_gateway_domain_${suffix}`
    ),
    payload: {
      assertionId,
      evidenceId: Reflect.get(source.payload, "evidenceId"),
      predicate: "legacy.gateway.recovery",
      object: suffix,
      confidence: 0.8,
      reviewState: "proposed"
    }
  });
  const validation = validateKnowledgeEvent(proposed);
  expect(validation.success, JSON.stringify(validation)).toBe(true);
  return proposed;
}

async function appendLegacyStagingApproval(
  ledger: InMemoryEventLedger,
  suffix: string
): Promise<KnowledgeEvent> {
  const approved = await ledger.append({
    type: "legacy.ontology.staging.approved",
    version: 1,
    streamId:
      `legacy_staging_src_gateway_legacy_scan_gateway_legacy_stage_gateway_${suffix}`,
    context: residentEventContext(
      `evt_gateway_request_${suffix}`,
      `corr_gateway_domain_${suffix}`,
      humanActor
    ),
    payload: {
      stagingBatchId: `stage_gateway_${suffix}`,
      legacyReportId: `legacy_report_gateway_${suffix}`,
      sourceCollectionId: "src_gateway_legacy",
      scanBatchId: "scan_gateway_legacy",
      reportHash:
        "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      candidateSetHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      approvedBy: humanActor.id,
      approvedAt: fixedNow(),
      approvedAssertionCandidateIds: [`legacy_candidate_gateway_${suffix}`]
    }
  });
  const validation = validateKnowledgeEvent(approved);
  expect(validation.success, JSON.stringify(validation)).toBe(true);
  return approved;
}

function ledgerFingerprint(events: readonly KnowledgeEvent[]): `sha256:${string}` {
  return hashCanonical(events);
}

function hashCanonical(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex")}`;
}

async function appendCanonicalResidentPlan(
  ledger: InMemoryEventLedger,
  sourceEventId: string,
  input: {
    readonly workspaceId: string;
    readonly residentAgentId: "agent_default";
    readonly taskId: string;
    readonly attemptId: string;
    readonly runId: string;
    readonly planId: string;
    readonly planRevision: number;
    readonly stepOrdinal: number;
    readonly toolRequestId: string;
    readonly toolId: string;
    readonly toolVersion: string;
    readonly executionCapabilityHash: `sha256:${string}`;
    readonly suffix: string;
  }
): Promise<KnowledgeEvent> {
  const planInput: Extract<
    AppendableKnowledgeEvent,
    { readonly type: "agent.resident-plan.recorded.v2" }
  > = {
    type: "agent.resident-plan.recorded.v2",
    version: 1,
    streamId:
      `agent_resident_loop_${input.taskId}_${input.attemptId}_${input.runId}`,
    context: residentEventContext(
      sourceEventId,
      `corr_gateway_${input.suffix}`
    ),
    payload: {
      schemaVersion: "resident-plan-record.v2",
      residentAgentId: input.residentAgentId,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      runId: input.runId,
      runMode: "evidence-triage",
      workflowDescriptor: {
        workflowDescriptorId: "workflow_evidence_triage",
        workflowDescriptorVersion: "v1",
        workflowDescriptorHash:
          "sha256:8888888888888888888888888888888888888888888888888888888888888888"
      },
      policy: {
        policyId: "agent_policy_gateway",
        policyVersion: "policy_gateway_v1",
        policyHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      },
      authority: {
        workspaceIdentityHash:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        mountGeneration: "mount_gateway",
        ledgerStoreIdentity: "ledger_gateway",
        artifactStoreIdentity: "artifact_gateway",
        ledgerHighWaterEventId: sourceEventId,
        policyHash:
          "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        activeLocksHash:
          "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      },
      sourceEventIds: [sourceEventId],
      contextPackRefs: [{
        contextPackId: "context_pack_gateway",
        contentHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      }],
      budget: residentBudget(1, 1),
      causationId: sourceEventId,
      correlationId: `corr_gateway_${input.suffix}`,
      planId: input.planId,
      planRevision: input.planRevision,
      priorPlanReadback: null,
      replanObservationReadback: null,
      steps: [{
        ordinal: input.stepOrdinal,
        purpose: "Stage one evidence-tied legacy proposal.",
        toolId: input.toolId,
        toolVersion: input.toolVersion,
        allowlistEntryHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        expectedSafeOutputClass: "proposal",
        prerequisiteStepOrdinals: [],
        toolRequestId: input.toolRequestId,
        executionCapabilityHash: input.executionCapabilityHash
      }]
    }
  };
  return await ledger.append(planInput);
}

function residentBudget(
  consumedContextBytes: number,
  actionContextBytes: number
): ResidentBudget {
  const ceilings = {
    planRevisions: 3,
    observationRecords: 16,
    toolSteps: 12,
    providerInvocations: 3,
    providerRequestBytes: 1048576,
    providerResponseBytes: 1048576,
    contextBytes: 1048576,
    derivativeArtifactBytes: 16777216,
    activeExecutionMs: 900000,
    approvalSuspensionMs: 86400000
  };
  const zeroes = {
    planRevisions: 0,
    observationRecords: 0,
    toolSteps: 0,
    providerInvocations: 0,
    providerRequestBytes: 0,
    providerResponseBytes: 0,
    contextBytes: 0,
    derivativeArtifactBytes: 0,
    activeExecutionMs: 0,
    approvalSuspensionMs: 0
  };
  return {
    ceilings,
    consumed: { ...zeroes, contextBytes: consumedContextBytes },
    remaining: {
      ...ceilings,
      contextBytes: ceilings.contextBytes - consumedContextBytes
    },
    actionConsumption: { ...zeroes, contextBytes: actionContextBytes }
  };
}

function residentEventContext(
  causationId: string,
  correlationId: string,
  actor: ActorRef = agentActor,
  occurredAt: string = fixedNow()
) {
  return {
    actor,
    occurredAt,
    causationId,
    correlationId,
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function residentDomainStreamId(locator: Readonly<Record<string, unknown>>): string {
  return `agent_resident_domain_${createHash("sha256")
    .update(canonicalJson(locator))
    .digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function deepFreezePlain<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreezePlain(Reflect.get(value, key));
    }
    Object.freeze(value);
  }
  return value;
}

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

type GatewayFixture = Awaited<ReturnType<typeof prepareFixture>>;

function injectNewPlanAtCompletionBoundary(
  fixture: GatewayFixture,
  toolRequestId: string,
  newerSourceEventId: string
) {
  let planReads = 0;
  let injected = false;
  const ledger: EventLedger = {
    append: fixture.ledger.append.bind(fixture.ledger),
    readAll: fixture.ledger.readAll.bind(fixture.ledger),
    async readStream(streamId: string): Promise<KnowledgeEvent[]> {
      const events = await fixture.ledger.readStream(streamId);
      if (streamId === fixture.plan.event.streamId) {
        planReads += 1;
      }
      if (streamId === `agent_tool_request_${toolRequestId}` && planReads === 11 && !injected) {
        injected = true;
        await fixture.planStore.recordPlan({
          identity: {
            residentAgentId: "agent_default",
            taskId: fixture.plan.event.payload.taskId,
            attemptId: fixture.plan.event.payload.attemptId,
            runId: fixture.plan.event.payload.runId,
            policyId: "agent_policy_gateway_completion_race",
            policyVersion: "2.0.0",
            policyHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
            authorityHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
            sourceEventIds: [newerSourceEventId],
            contextArtifactHashes: ["sha256:8888888888888888888888888888888888888888888888888888888888888888"],
            budget: { maxSteps: 2, remainingSteps: 2, contextBytes: 1 },
            causationEventId: newerSourceEventId,
            correlationId: "corr_gateway_completion_race"
          },
          planRevision: 2,
          descriptorHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999"
        });
      }
      return events;
    }
  };
  return Object.freeze({ ledger, wasInjected: () => injected });
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
