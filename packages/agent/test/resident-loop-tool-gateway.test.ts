import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLegacyImportRuntime } from "../../ingestion/src/legacy-runtime.js";
import { sha256, stableJson } from "../../ingestion/src/legacy-report.js";
import { createFakeMountedWorkspace } from "../../ingestion/test/runtime-test-helpers.js";
import { writeLegacyCestusFixture } from "../../ingestion/test/fixtures/legacy-cestus-fixtures.js";
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
import {
  buildLegacyStagingApprovalPreview,
  legacyStagingExecuteDescriptor
} from "../src/adapters/legacy-staging.js";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";
import { createResidentLoopToolGateway, type ResidentLoopToolGatewayReadback } from "../src/resident-loop-tool-gateway.js";
import {
  createAgentToolGateway,
  hashAgentToolPreview,
  type RequestAgentToolInput
} from "../src/tool-gateway.js";

describe("resident-loop tool gateway", () => {
  it("derives durable request, human decision, claim, and result readbacks through the private completion route", async () => {
    const fixture = await prepareFixture();
    const request = await fixture.bridge.requestAndReadback(requestInput(fixture));
    const requestedEvent = requiredLegacyGatewayEvent(
      await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`),
      "agent.tool.requested"
    );

    expect(request).toEqual(expectedToolGatewayReadback(
      fixture,
      requestedEvent
    ));

    const approval = await fixture.approvalGateway.approveTool({
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

    let domainResultEventId: string | undefined;
    const completed = await fixture.bridge.executeAndReadback(decision, async (execution) => {
      expect(execution.executionClaimEventId).toBe(claim.id);
      const domainResult = await appendEvidence(fixture.ledger, {
        evidenceId: "ev_gateway_durable_result",
        causationId: claim.id
      });
      domainResultEventId = domainResult.id;
      return {
        eventIds: [domainResult.id],
        artifactHashes: [],
        readModelChanges: [],
        resultSummary: "The independently appended domain result is durable."
      };
    });
    const reread = await fixture.bridge.readResult(completed);

    if (domainResultEventId === undefined) {
      throw new Error("Resident-loop result fixture lacks its domain evidence.");
    }
    const completion = requiredLegacyGatewayEvent(
      await fixture.ledger.readStream(`agent_tool_request_${request.toolRequestId}`),
      "agent.tool.completed"
    );
    expect(reread).toEqual(expectedToolGatewayReadback(fixture, requestedEvent, {
      decisionEventId: approval.id,
      executionClaimEventId: claim.id,
      resultEventId: completion.id,
      approvedBy: humanActor.id,
      resultEvidenceEventIds: [domainResultEventId]
    }));
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
    expect(automatic.preparedBinding).toEqual({
      ordinal: automatic.locator.stepOrdinal,
      workspaceId: automatic.locator.workspaceId,
      residentAgentId: automatic.locator.residentAgentId,
      taskId: automatic.locator.taskId,
      attemptId: automatic.locator.attemptId,
      runId: automatic.locator.runId,
      planId: automatic.locator.planId,
      planRevision: automatic.locator.planRevision,
      toolRequestId: automatic.locator.toolRequestId,
      toolId: automatic.locator.toolId,
      toolVersion: automatic.locator.toolVersion,
      executionCapabilityHash: automatic.locator.executionCapabilityHash
    });
    expect(human.preparedBinding).toEqual({
      ordinal: human.locator.stepOrdinal,
      workspaceId: human.locator.workspaceId,
      residentAgentId: human.locator.residentAgentId,
      taskId: human.locator.taskId,
      attemptId: human.locator.attemptId,
      runId: human.locator.runId,
      planId: human.locator.planId,
      planRevision: human.locator.planRevision,
      toolRequestId: human.locator.toolRequestId,
      toolId: human.locator.toolId,
      toolVersion: human.locator.toolVersion,
      executionCapabilityHash: human.locator.executionCapabilityHash
    });
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
    expect(automaticCompleted).toEqual({
      authorizationKind: "automatic-policy",
      stage: "completed",
      logicalLocator: automatic.locator,
      executionCapabilityHash: automatic.locator.executionCapabilityHash,
      requestEventId: automatic.request.id,
      executionClaimEventId: requiredPrefixEvent(automatic.claim, "claim").id,
      outcomeReceiptEventId: automatic.receipt?.id,
      resultEventId: automatic.terminal?.id
    });
    expect(humanCompleted).toEqual({
      authorizationKind: "human-approval",
      stage: "completed",
      logicalLocator: human.locator,
      executionCapabilityHash: human.locator.executionCapabilityHash,
      requestEventId: human.request.id,
      decisionEventId: Reflect.get(
        human.decision?.payload ?? {},
        "decisionEventId"
      ),
      approvedBy: humanActor.id,
      approvedPreviewHash: Reflect.get(
        human.decision?.payload ?? {},
        "approvedPreviewHash"
      ),
      executionClaimEventId: requiredPrefixEvent(human.claim, "claim").id,
      outcomeReceiptEventId: human.receipt?.id,
      resultEventId: human.terminal?.id
    });
    await Reflect.apply(automaticReread, automatic.gateway, [automatic.locator]);
    await Reflect.apply(humanReread, human.gateway, [human.locator]);
    expect(await automatic.ledger.readAll()).toHaveLength(beforeAutomatic);
    expect(await human.ledger.readAll()).toHaveLength(beforeHuman);
    expect(automatic.effects.count).toBe(0);
    expect(human.effects.count).toBe(0);
  });

  it("refuses a fresh execution when the exact stream already has its permanent claim", async () => {
    const harness = await prepareResidentGatewayHarness({
      authorizationKind: "automatic-policy",
      suffix: "fresh-already-claimed"
    });
    const requestFresh = reflectedOperation(
      harness.gateway,
      "requestFreshAuthorized"
    );
    const executeFresh = reflectedOperation(
      harness.gateway,
      "executeFreshAuthorized"
    );
    const requested = await Reflect.apply(
      requestFresh,
      harness.gateway,
      [harness.locator]
    );
    const request = requiredResidentGatewayEvent(
      await harness.ledger.readStream(residentDomainStreamId(harness.locator)),
      "agent.resident-domain.requested.v1"
    );
    const existingClaim = await appendFreshResidentExecutionClaim(
      harness.ledger,
      harness.locator,
      request
    );

    const execution = await settledResidentRecovery(() => Reflect.apply(
      executeFresh,
      harness.gateway,
      [requested]
    ));
    const stream = await harness.ledger.readStream(
      residentDomainStreamId(harness.locator)
    );

    expect({
      ...execution,
      residentEventTypes: stream.map((event) => event.type),
      claimIds: stream
        .filter((event) =>
          event.type === "agent.resident-domain.execution-claimed.v1"
        )
        .map((event) => event.id),
      effects: harness.effects.count
    }).toEqual({
      outcome: "rejected",
      message: expect.stringMatching(/claim|canonical|prefix|terminal/i),
      residentEventTypes: [
        "agent.resident-domain.requested.v1",
        "agent.resident-domain.execution-claimed.v1"
      ],
      claimIds: [existingClaim.id],
      effects: 0
    });
  });

  it("rereads every assigned lifecycle identity instead of trusting substituted append returns", async () => {
    const cases = [
      {
        target: "agent.resident-domain.requested.v1",
        expectedEventTypes: ["agent.resident-domain.requested.v1"],
        expectedEffects: 0
      },
      {
        target: "agent.resident-domain.execution-claimed.v1",
        expectedEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.execution-claimed.v1"
        ],
        expectedEffects: 0
      },
      {
        target: "agent.resident-domain.outcome-observed.v1",
        expectedEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.execution-claimed.v1",
          "agent.resident-domain.outcome-observed.v1"
        ],
        expectedEffects: 1
      },
      {
        target: "agent.resident-domain.completed.v1",
        expectedEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.execution-claimed.v1",
          "agent.resident-domain.outcome-observed.v1",
          "agent.resident-domain.completed.v1"
        ],
        expectedEffects: 1
      }
    ] as const;

    const results = [];
    for (const [index, entry] of cases.entries()) {
      let ledger:
        | SubstitutingResidentAppendLedger
        | undefined;
      const harness = await prepareResidentGatewayHarness({
        authorizationKind: "automatic-policy",
        suffix: `substituted-append-${index}`,
        instrumentation: {
          createLedger() {
            ledger = new SubstitutingResidentAppendLedger(entry.target);
            return ledger;
          }
        }
      });
      if (ledger === undefined) {
        throw new Error("Substituted-append fixture did not create its ledger.");
      }
      const requestFresh = reflectedOperation(
        harness.gateway,
        "requestFreshAuthorized"
      );
      const executeFresh = reflectedOperation(
        harness.gateway,
        "executeFreshAuthorized"
      );
      const operation = async () => {
        const requested = await Reflect.apply(
          requestFresh,
          harness.gateway,
          [harness.locator]
        );
        return await Reflect.apply(
          executeFresh,
          harness.gateway,
          [requested]
        );
      };
      const outcome = await settledResidentRecovery(operation);
      const stream = await harness.ledger.readStream(
        residentDomainStreamId(harness.locator)
      );
      expectOntologyValidResidentEvents(ledger.substitutedReturns);
      results.push({
        target: entry.target,
        ...outcome,
        residentEventTypes: stream.map((event) => event.type),
        substitutedReturnCount: ledger.substitutedReturns.length,
        durableUsedSubstitutedReturn: ledger.substitutedReturns.some(
          (substituted) => stream.some((event) => event.id === substituted.id)
        ),
        effects: harness.effects.count
      });
    }

    expect(results).toEqual(cases.map((entry) => ({
      target: entry.target,
      outcome: "rejected",
      message: expect.stringMatching(/append|assigned|canonical|durable|identity|prefix|reread/i),
      residentEventTypes: entry.expectedEventTypes,
      substitutedReturnCount: 1,
      durableUsedSubstitutedReturn: false,
      effects: entry.expectedEffects
    })));
  });

  it("maps a complete failed recovery receipt only to the proven post-claim failure", async () => {
    const failedReceipt = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "receipt",
      suffix: "failed-receipt-only",
      receiptDisposition: "failed"
    });
    expectCanonicalResidentDomainPrefix(failedReceipt.events);
    const readFailedReceipt = reflectedOperation(
      failedReceipt.gateway,
      "rereadAndIssueFromLedger"
    );
    const failed = await Reflect.apply(
      readFailedReceipt,
      failedReceipt.gateway,
      [failedReceipt.locator]
    );
    const failedStream = await failedReceipt.ledger.readStream(
      residentDomainStreamId(failedReceipt.locator)
    );
    const failedTerminal = failedStream.find(
      (event) => event.type === "agent.resident-domain.failed.v1"
    );
    expect({
      readback: failed,
      terminalType: failedStream.at(-1)?.type,
      terminalCausationId: failedTerminal?.context.causationId,
      terminalFailure: failedTerminal?.payload.failure,
      hasCompleted: failedStream.some((event) =>
        event.type === "agent.resident-domain.completed.v1"
      ),
      effects: failedReceipt.effects.count
    }).toEqual({
      readback: {
        authorizationKind: "automatic-policy",
        stage: "failed",
        logicalLocator: failedReceipt.locator,
        executionCapabilityHash:
          failedReceipt.locator.executionCapabilityHash,
        requestEventId: failedReceipt.request.id,
        failurePhase: "post-claim",
        executionClaimEventId:
          requiredPrefixEvent(failedReceipt.claim, "claim").id,
        outcomeReceiptEventId:
          requiredPrefixEvent(failedReceipt.receipt, "receipt").id,
        resultEventId: expect.stringMatching(/^evt_[a-zA-Z0-9_-]+$/)
      },
      terminalType: "agent.resident-domain.failed.v1",
      terminalCausationId: failedReceipt.receipt?.id,
      terminalFailure: {
          authorizationKind: "automatic-policy",
          failurePhase: "post-claim",
          executionClaimEventId:
            requiredPrefixEvent(failedReceipt.claim, "claim").id,
          outcomeReceiptEventId:
            requiredPrefixEvent(failedReceipt.receipt, "receipt").id
      },
      hasCompleted: false,
      effects: 0
    });
  });

  it("rejects an incomplete recovery receipt instead of terminalizing it as completed", async () => {
    const incompleteReceipt = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "receipt",
      suffix: "incomplete-receipt-only",
      receiptEnvelopeHash:
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });
    expectOntologyValidResidentEvents(incompleteReceipt.events);
    const readIncompleteReceipt = reflectedOperation(
      incompleteReceipt.gateway,
      "rereadAndIssueFromLedger"
    );
    const incomplete = await settledResidentRecovery(() => Reflect.apply(
      readIncompleteReceipt,
      incompleteReceipt.gateway,
      [incompleteReceipt.locator]
    ));
    const incompleteStream = await incompleteReceipt.ledger.readStream(
      residentDomainStreamId(incompleteReceipt.locator)
    );
    expect({
      ...incomplete,
      residentEventTypes: incompleteStream.map((event) => event.type),
      effects: incompleteReceipt.effects.count
    }).toEqual({
      outcome: "rejected",
      message: expect.stringMatching(/complete|envelope|evidence|fingerprint|hash|receipt/i),
      residentEventTypes: [
        "agent.resident-domain.requested.v1",
        "agent.resident-domain.execution-claimed.v1",
        "agent.resident-domain.outcome-observed.v1"
      ],
      effects: 0
    });
  });

  it.each([
    { ordinal: 2, mutation: "duplicate-evidence" },
    { ordinal: 3, mutation: "invocation-input" },
    { ordinal: 4, mutation: "domain-context" },
    { ordinal: 5, mutation: "domain-payload" },
    { ordinal: 6, mutation: "result-identity" },
    { ordinal: 9, mutation: "authorization-branch" }
  ] as const)(
    "rejects a correctly self-hashed ordinal-$ordinal receipt with semantic $mutation drift",
    async ({ ordinal, mutation }) => {
      await expectSemanticResidentReceiptRejected(
        await appendSemanticResidentRecoveryReceipt({ ordinal, mutation })
      );
    }
  );

  it("recovers one exact real legacy candidate binding and rejects the complete independently self-hashed drift corpus", async () => {
    const legacyBinding = await prepareRealGatewayLegacyBinding();
    try {
      expect(legacyBinding.candidates[0]?.object).not.toBe(
        legacyBinding.candidates[0]?.candidateId
      );
      await expectSemanticResidentReceiptCompleted(
        await appendSemanticResidentRecoveryReceipt({
          ordinal: 10,
          mutation: "none",
          legacyBinding
        })
      );
      for (const mutation of [
        "predicate",
        "object",
        "confidence",
        "subjectRef-presence",
        "subjectRef-value",
        "evidence-content-hash",
        "candidate-order",
        "binding-hash"
      ] as const) {
        await expectSemanticResidentReceiptRejected(
          await appendSemanticResidentRecoveryReceipt({
            ordinal: 10,
            mutation,
            legacyBinding
          })
        );
      }
    } finally {
      legacyBinding.cleanup();
    }
  });

  it("rejects a correctly self-hashed legacy recovery prefix whose preview omits selected candidate binding hashes", async () => {
    const legacyBinding = await prepareRealGatewayLegacyBinding();
    try {
      await expectSemanticResidentReceiptRejected(
        await appendSemanticResidentRecoveryReceipt({
          ordinal: 10,
          mutation: "missing-binding-hashes",
          legacyBinding
        })
      );
    } finally {
      legacyBinding.cleanup();
    }
  });

  it.each([
    "candidate-order",
    "candidate-payload"
  ] as const)(
    "rejects a correctly self-hashed ordinal-10 receipt with %s drift",
    async (mutation) => {
      const legacyBinding = await prepareRealGatewayLegacyBinding();
      try {
        await expectSemanticResidentReceiptRejected(
          await appendSemanticResidentRecoveryReceipt({
            ordinal: 10,
            mutation,
            legacyBinding
          })
        );
      } finally {
        legacyBinding.cleanup();
      }
    }
  );

  it("rejects correctly self-hashed idempotent evidence that does not predate the permanent claim", async () => {
    await expectSemanticResidentReceiptRejected(
      await appendSemanticResidentRecoveryReceipt({
        ordinal: 2,
        mutation: "idempotent-after-claim"
      })
    );
  });

  it.each([
    "projection-artifacts",
    "projection-read-model"
  ] as const)(
    "rejects a correctly self-hashed ordinal-7 receipt with %s drift",
    async (mutation) => {
      await expectSemanticResidentReceiptRejected(
        await appendSemanticResidentRecoveryReceipt({
          ordinal: 7,
          mutation
        })
      );
    }
  );

  it("rejects human approvals after their deadline or the trusted current time", async () => {
    const cases = [
      {
        suffix: "approval-after-deadline",
        occurredAt: "2026-07-20T12:00:00.001Z"
      },
      {
        suffix: "approval-after-current-time",
        occurredAt: "2026-07-19T12:00:01.000Z"
      }
    ] as const;
    const results = [];

    for (const entry of cases) {
      const decision = await prepareLiveHumanDecisionCase(entry.suffix);
      await appendResidentHumanApproval(
        decision.harness.ledger,
        decision.harness.locator,
        entry.suffix,
        { occurredAt: entry.occurredAt }
      );
      const outcome = await settledResidentRecovery(() => Reflect.apply(
        decision.readDecision,
        decision.harness.gateway,
        [decision.requested]
      ));
      const stream = await decision.harness.ledger.readStream(
        residentDomainStreamId(decision.harness.locator)
      );
      results.push({
        suffix: entry.suffix,
        ...outcome,
        residentEventTypes: stream.map((event) => event.type),
        effects: decision.harness.effects.count
      });
    }

    expect(results).toEqual(cases.map((entry) => ({
      suffix: entry.suffix,
      outcome: "rejected",
      message: expect.stringMatching(/approval|chronology|current|deadline|future|stale/i),
      residentEventTypes: [
        "agent.resident-domain.requested.v1",
        "agent.resident-domain.human-approved.v1"
      ],
      effects: 0
    })));
  });

  it("reissues only exact completed denied failed and unknown resident prefixes", async () => {
    const cases = [
      {
        name: "automatic completed",
        authorizationKind: "automatic-policy",
        terminal: "completed"
      },
      {
        name: "human completed",
        authorizationKind: "human-approval",
        terminal: "completed"
      },
      {
        name: "human denied",
        authorizationKind: "human-approval",
        terminal: "denied"
      },
      {
        name: "automatic pre-claim failed",
        authorizationKind: "automatic-policy",
        terminal: "automatic-pre-claim-failed"
      },
      {
        name: "human pre-approval failed",
        authorizationKind: "human-approval",
        terminal: "human-pre-approval-failed"
      },
      {
        name: "human post-approval pre-claim failed",
        authorizationKind: "human-approval",
        terminal: "human-post-approval-pre-claim-failed"
      },
      {
        name: "automatic post-claim failed",
        authorizationKind: "automatic-policy",
        terminal: "post-claim-failed"
      },
      {
        name: "human post-claim failed",
        authorizationKind: "human-approval",
        terminal: "post-claim-failed"
      },
      {
        name: "automatic claim without receipt",
        authorizationKind: "automatic-policy",
        terminal: "claimed"
      },
      {
        name: "human claim without receipt",
        authorizationKind: "human-approval",
        terminal: "claimed"
      }
    ] as const;
    const results = await Promise.all(cases.map(async (entry) => {
      const prefix = await appendCanonicalResidentDomainPrefix({
        authorizationKind: entry.authorizationKind,
        terminal: entry.terminal,
        suffix: `exact-${entry.name.replaceAll(" ", "-")}`
      });
      expectOntologyValidResidentEvents(prefix.events);
      const reread = reflectedOperation(
        prefix.gateway,
        "rereadAndIssueFromLedger"
      );
      const readback = await Reflect.apply(
        reread,
        prefix.gateway,
        [prefix.locator]
      );
      expect(prefix.effects.count).toBe(0);
      expect(readback).toEqual(
        expectedRecoveryReadback(prefix, entry.terminal)
      );
      return {
        name: entry.name
      };
    }));

    expect(results).toEqual(cases.map(({ name }) => ({ name })));
  });

  it.each([
    "standalone completed",
    "gapped completed",
    "foreign completed",
    "mismatched completed",
    "receipt without claim",
    "terminal without receipt",
    "duplicate terminal",
    "second terminal",
    "authorization branch drift",
    "logical locator drift",
    "capability hash drift",
    "correlation drift",
    "causation drift"
  ] as const)("rejects hostile resident recovery prefix: %s", async (hostility) => {
    const hostile = await appendHostileResidentRecoveryPrefix(hostility);
    const bindingDrift =
      hostility === "logical locator drift" ||
      hostility === "capability hash drift";
    expectOntologyValidResidentEvents(
      bindingDrift ? hostile.events.slice(0, -1) : hostile.events
    );
    if (bindingDrift) {
      const targetStream = await hostile.ledger.readStream(
        residentDomainStreamId(hostile.locator)
      );
      expect(targetStream.at(-1)?.type)
        .toBe("agent.resident-domain.completed.v1");
      expect(targetStream.at(-1)?.payload).not.toEqual(
        expect.objectContaining({
          logicalLocator: hostile.locator,
          executionCapabilityHash: hostile.locator.executionCapabilityHash
        })
      );
    }
    const reread = reflectedOperation(
      hostile.gateway,
      "rereadAndIssueFromLedger"
    );
    const beforeIds = new Set(
      (await hostile.ledger.readAll()).map((event) => event.id)
    );
    const recovery = await settledResidentRecovery(() => Reflect.apply(
      reread,
      hostile.gateway,
      [hostile.locator]
    ));
    const appendedResidentEventTypes = (await hostile.ledger.readAll())
      .filter((event) =>
        !beforeIds.has(event.id) &&
        event.type.startsWith("agent.resident-domain.")
      )
      .map((event) => event.type);

    expect({
      ...recovery,
      appendedResidentEventTypes,
      effects: hostile.effects.count
    }).toEqual({
      outcome: "rejected",
      message: expect.stringMatching(
        /canonical|caus|correlation|foreign|gap|hash|locator|match|prefix|receipt|request|terminal/i
      ),
      appendedResidentEventTypes: [],
      effects: 0
    });
  });

  it("revalidates W immediately before and after package preview awaits", async () => {
    const results = await Promise.all([
      runPackagePreviewRevalidationCase("current", "current"),
      runPackagePreviewRevalidationCase("stale", "current"),
      runPackagePreviewRevalidationCase("current", "stale")
    ]);

    expect(results).toEqual([
      {
        beforeKind: "current",
        afterKind: "current",
        outcome: "fulfilled",
        trace: [
          "W:before",
          "preview:start",
          "preview:end",
          "W:after",
          "W:before",
          "W:after",
          "W:before",
          "W:after",
          "W:before",
          "W:after"
        ],
        residentEventTypes: ["agent.resident-domain.requested.v1"],
        effects: 0
      },
      {
        beforeKind: "stale",
        afterKind: "current",
        outcome: "rejected",
        trace: ["W:before"],
        residentEventTypes: [],
        effects: 0
      },
      {
        beforeKind: "current",
        afterKind: "stale",
        outcome: "rejected",
        trace: ["W:before", "preview:start", "preview:end", "W:after"],
        residentEventTypes: [],
        effects: 0
      }
    ]);
  });

  it("rejects a live request stage when W becomes stale during durable request publication", async () => {
    const results = await Promise.all([
      runRequestPublicationRevalidationCase("append"),
      runRequestPublicationRevalidationCase("stream-reread"),
      runRequestPublicationRevalidationCase("global-reread")
    ]);

    expect(results).toEqual([
      {
        boundary: "append",
        requestOutcome: "rejected",
        executionOutcome: "not-issued",
        trace: [
          "W:before:1",
          "preview:start",
          "preview:end",
          "W:after:1",
          "W:before:2",
          "request:append:start",
          "request:append:end",
          "W:after:2"
        ],
        residentEventTypes: ["agent.resident-domain.requested.v1"],
        effects: 0
      },
      {
        boundary: "stream-reread",
        requestOutcome: "rejected",
        executionOutcome: "not-issued",
        trace: [
          "W:before:1",
          "preview:start",
          "preview:end",
          "W:after:1",
          "W:before:2",
          "request:append:start",
          "request:append:end",
          "W:after:2",
          "W:before:3",
          "request:stream:start",
          "request:stream:end",
          "W:after:3"
        ],
        residentEventTypes: ["agent.resident-domain.requested.v1"],
        effects: 0
      },
      {
        boundary: "global-reread",
        requestOutcome: "rejected",
        executionOutcome: "not-issued",
        trace: [
          "W:before:1",
          "preview:start",
          "preview:end",
          "W:after:1",
          "W:before:2",
          "request:append:start",
          "request:append:end",
          "W:after:2",
          "W:before:3",
          "request:stream:start",
          "request:stream:end",
          "W:after:3",
          "W:before:4",
          "request:all:start",
          "request:all:end",
          "W:after:4"
        ],
        residentEventTypes: ["agent.resident-domain.requested.v1"],
        effects: 0
      }
    ]);
  });

  it("revalidates W immediately before and after human decision awaits", async () => {
    const results = await Promise.all([
      runHumanDecisionRevalidationCase("current", "current"),
      runHumanDecisionRevalidationCase("stale", "current"),
      runHumanDecisionRevalidationCase("current", "stale")
    ]);

    expect(results).toEqual([
      {
        beforeKind: "current",
        afterKind: "current",
        outcome: "fulfilled",
        trace: ["W:before", "decision:start", "decision:end", "W:after"],
        residentEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.human-approved.v1"
        ],
        effects: 0
      },
      {
        beforeKind: "stale",
        afterKind: "current",
        outcome: "rejected",
        trace: ["W:before"],
        residentEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.human-approved.v1"
        ],
        effects: 0
      },
      {
        beforeKind: "current",
        afterKind: "stale",
        outcome: "rejected",
        trace: ["W:before", "decision:start", "decision:end", "W:after"],
        residentEventTypes: [
          "agent.resident-domain.requested.v1",
          "agent.resident-domain.human-approved.v1"
        ],
        effects: 0
      }
    ]);
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
    const automaticRequestedEvent = requiredResidentGatewayEvent(
      await fresh.ledger.readStream(residentDomainStreamId(fresh.locator)),
      "agent.resident-domain.requested.v1"
    );
    expect(requested).toEqual({
      authorizationKind: "automatic-policy",
      stage: "requested",
      logicalLocator: fresh.locator,
      executionCapabilityHash: fresh.locator.executionCapabilityHash,
      requestEventId: automaticRequestedEvent.id
    });
    expectExactOwnKeys(requested, [
      "authorizationKind",
      "stage",
      "logicalLocator",
      "executionCapabilityHash",
      "requestEventId"
    ]);
    const [first, concurrent] = await Promise.allSettled([
      Reflect.apply(execute, fresh.gateway, [requested]),
      Reflect.apply(execute, fresh.gateway, [requested])
    ]);
    expect([first.status, concurrent.status].sort()).toEqual([
      "fulfilled",
      "rejected"
    ]);
    const stream = await fresh.ledger.readStream(
      residentDomainStreamId(fresh.locator)
    );
    const automaticClaim = requiredResidentGatewayEvent(
      stream,
      "agent.resident-domain.execution-claimed.v1"
    );
    const automaticReceipt = requiredResidentGatewayEvent(
      stream,
      "agent.resident-domain.outcome-observed.v1"
    );
    const automaticCompletion = requiredResidentGatewayEvent(
      stream,
      "agent.resident-domain.completed.v1"
    );
    const fulfilled = [first, concurrent].filter(
      (outcome): outcome is PromiseFulfilledResult<unknown> =>
        outcome.status === "fulfilled"
    );
    expect(fulfilled).toEqual([{
      status: "fulfilled",
      value: {
        authorizationKind: "automatic-policy",
        stage: "completed",
        logicalLocator: fresh.locator,
        executionCapabilityHash: fresh.locator.executionCapabilityHash,
        requestEventId: automaticRequestedEvent.id,
        executionClaimEventId: automaticClaim.id,
        outcomeReceiptEventId: automaticReceipt.id,
        resultEventId: automaticCompletion.id
      }
    }]);
    expectExactOwnKeys(fulfilled[0]?.value, [
      "authorizationKind",
      "stage",
      "logicalLocator",
      "executionCapabilityHash",
      "requestEventId",
      "executionClaimEventId",
      "outcomeReceiptEventId",
      "resultEventId"
    ]);
    expect([first, concurrent].filter(
      (outcome) => outcome.status === "rejected"
    )).toHaveLength(1);
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
    expect(rereadRequested).toEqual({
      authorizationKind: "automatic-policy",
      stage: "requested",
      logicalLocator: recoveredRequest.locator,
      executionCapabilityHash:
        recoveredRequest.locator.executionCapabilityHash,
      requestEventId: recoveredRequest.request.id
    });
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
    const humanRequestedEvent = requiredResidentGatewayEvent(
      await human.ledger.readStream(residentDomainStreamId(human.locator)),
      "agent.resident-domain.requested.v1"
    );
    expect(humanRequested).toEqual({
      authorizationKind: "human-approval",
      stage: "requested",
      logicalLocator: human.locator,
      executionCapabilityHash: human.locator.executionCapabilityHash,
      requestEventId: humanRequestedEvent.id
    });
    expectExactOwnKeys(humanRequested, [
      "authorizationKind",
      "stage",
      "logicalLocator",
      "executionCapabilityHash",
      "requestEventId"
    ]);
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
    expect(humanApproved).toEqual({
      authorizationKind: "human-approval",
      stage: "human-approved",
      logicalLocator: human.locator,
      executionCapabilityHash: human.locator.executionCapabilityHash,
      requestEventId: humanRequestedEvent.id,
      decisionEventId: independentApproval.payload.decisionEventId,
      approvedBy: humanActor.id,
      approvedPreviewHash: independentApproval.payload.approvedPreviewHash
    });
    const humanCompleted = await Reflect.apply(
      executeHuman,
      human.gateway,
      [humanApproved]
    );
    const humanStream = await human.ledger.readStream(
      residentDomainStreamId(human.locator)
    );
    const humanClaim = humanStream.find(
      (event) => event.type === "agent.resident-domain.execution-claimed.v1"
    );
    const humanReceipt = humanStream.find(
      (event) => event.type === "agent.resident-domain.outcome-observed.v1"
    );
    const humanTerminal = humanStream.find(
      (event) => event.type === "agent.resident-domain.completed.v1"
    );
    expect(humanCompleted).toEqual({
      authorizationKind: "human-approval",
      stage: "completed",
      logicalLocator: human.locator,
      executionCapabilityHash: human.locator.executionCapabilityHash,
      requestEventId: humanRequestedEvent.id,
      decisionEventId: independentApproval.payload.decisionEventId,
      approvedBy: humanActor.id,
      approvedPreviewHash: independentApproval.payload.approvedPreviewHash,
      executionClaimEventId: requiredPrefixEvent(humanClaim, "claim").id,
      outcomeReceiptEventId: requiredPrefixEvent(humanReceipt, "receipt").id,
      resultEventId: requiredPrefixEvent(humanTerminal, "terminal").id
    });
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
    expect(recoveryOnlyRequested).toEqual({
      authorizationKind: "human-approval",
      stage: "requested",
      logicalLocator: recoveredHuman.locator,
      executionCapabilityHash:
        recoveredHuman.locator.executionCapabilityHash,
      requestEventId: recoveredHuman.request.id
    });
    const recoveredHumanReadDecision = reflectedOperation(
      recoveredHuman.gateway,
      "readFreshHumanDecision"
    );
    const recoveredHumanExecute = reflectedOperation(
      recoveredHuman.gateway,
      "executeFreshAuthorized"
    );
    const recoveredApproval = await appendIndependentResidentHumanApproval(
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
    expect(recoveryOnlyApproved).toEqual({
      authorizationKind: "human-approval",
      stage: "human-approved",
      logicalLocator: recoveredHuman.locator,
      executionCapabilityHash:
        recoveredHuman.locator.executionCapabilityHash,
      requestEventId: recoveredHuman.request.id,
      decisionEventId: recoveredApproval.payload.decisionEventId,
      approvedBy: recoveredApproval.payload.approvedBy,
      approvedPreviewHash: recoveredApproval.payload.approvedPreviewHash
    });
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
      expect(unknown).toEqual({
        authorizationKind,
        stage: "claimed",
        category: "effect-outcome-unknown",
        logicalLocator: claimed.locator,
        executionCapabilityHash: claimed.locator.executionCapabilityHash,
        requestEventId: claimed.request.id,
        ...(claimed.decision === undefined
          ? {}
          : {
              decisionEventId: Reflect.get(
                claimed.decision.payload,
                "decisionEventId"
              ),
              approvedBy: Reflect.get(claimed.decision.payload, "approvedBy"),
              approvedPreviewHash: Reflect.get(
                claimed.decision.payload,
                "approvedPreviewHash"
              )
            }),
        executionClaimEventId: requiredPrefixEvent(claimed.claim, "claim").id
      });
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
    const recoveredStream = await receipted.ledger.readStream(
      residentDomainStreamId(receipted.locator)
    );
    const recoveredCompletion = requiredResidentGatewayEvent(
      recoveredStream,
      "agent.resident-domain.completed.v1"
    );
    expect(recovered).toEqual({
      authorizationKind: "automatic-policy",
      stage: "completed",
      logicalLocator: receipted.locator,
      executionCapabilityHash: receipted.locator.executionCapabilityHash,
      requestEventId: receipted.request.id,
      executionClaimEventId:
        requiredPrefixEvent(receipted.claim, "claim").id,
      outcomeReceiptEventId: receipted.receipt?.id,
      resultEventId: recoveredCompletion.id
    });
    expectExactOwnKeys(recovered, [
      "authorizationKind",
      "stage",
      "logicalLocator",
      "executionCapabilityHash",
      "requestEventId",
      "executionClaimEventId",
      "outcomeReceiptEventId",
      "resultEventId"
    ]);
    expect(receipted.effects.count).toBe(0);
    expectCanonicalResidentDomainPrefix(recoveredStream);
    expect(recoveredStream.at(-1)?.context.causationId)
      .toBe(receipted.receipt?.id);
  });
});

type ResidentAuthorizationKind = "automatic-policy" | "human-approval";
type ResidentPrefixTerminal =
  | "requested"
  | "claimed"
  | "receipt"
  | "completed"
  | "denied"
  | "automatic-pre-claim-failed"
  | "human-pre-approval-failed"
  | "human-post-approval-pre-claim-failed"
  | "post-claim-failed";

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
  readonly port: object;
  readonly effects: { count: number };
  readonly composition: ResidentGatewayCompositionCounts;
  readonly source: KnowledgeEvent;
  readonly plan: KnowledgeEvent;
  readonly preparedBinding: Readonly<Record<string, unknown>>;
  readonly locator: ResidentLogicalLocator;
}

type ResidentCurrentnessKind = "current" | "stale";
type ResidentRequestPublicationBoundary =
  | "append"
  | "stream-reread"
  | "global-reread";

interface ResidentGatewayHarnessInstrumentation {
  readonly createLedger?: () => InMemoryEventLedger;
  readonly onPackagePreview?: () => Promise<void>;
  readonly reverifyBeforeEffect?: () => Promise<unknown>;
  readonly reverifyAfterEffect?: () => Promise<unknown>;
}

class TargetStreamHostileResidentLedger extends InMemoryEventLedger {
  private readonly hostileEvents: KnowledgeEvent[] = [];

  injectTargetStreamHostile(event: KnowledgeEvent): void {
    this.hostileEvents.push(structuredClone(event));
  }

  override async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return [
      ...await super.readStream(streamId),
      ...this.hostileEvents
        .filter((event) => event.streamId === streamId)
        .map((event) => structuredClone(event))
    ];
  }

  override async readAll(): Promise<KnowledgeEvent[]> {
    return [
      ...await super.readAll(),
      ...this.hostileEvents.map((event) => structuredClone(event))
    ];
  }
}

type ResidentLifecycleAppendType =
  | "agent.resident-domain.requested.v1"
  | "agent.resident-domain.execution-claimed.v1"
  | "agent.resident-domain.outcome-observed.v1"
  | "agent.resident-domain.completed.v1";

class SubstitutingResidentAppendLedger extends InMemoryEventLedger {
  readonly substitutedReturns: KnowledgeEvent[] = [];

  constructor(private readonly target: ResidentLifecycleAppendType) {
    super();
  }

  override async append(
    event: AppendableKnowledgeEvent,
    options?: Parameters<EventLedger["append"]>[1]
  ): Promise<KnowledgeEvent> {
    const durable = await super.append(event, options);
    if (
      durable.type !== this.target ||
      this.substitutedReturns.length > 0
    ) {
      return durable;
    }
    const substituted = structuredClone({
      ...durable,
      id: "evt_substituted_resident_append_1"
    }) as KnowledgeEvent;
    const validation = validateKnowledgeEvent(substituted);
    if (!validation.success) {
      throw new Error(
        `Substituted resident append return is not schema-valid: ${validation.error.message}`
      );
    }
    this.substitutedReturns.push(substituted);
    return structuredClone(substituted);
  }
}

interface UnknownResidentDomainApi {
  readonly create: (input: unknown) => Promise<unknown>;
  readonly bind: (input: unknown) => unknown;
}

type ResidentRequestedAppend = Extract<
  AppendableKnowledgeEvent,
  { readonly type: "agent.resident-domain.requested.v1" }
>;
type ResidentRequestedEvent =
  KnowledgeEventOf<"agent.resident-domain.requested.v1">;
type ResidentHumanApprovedEvent =
  KnowledgeEventOf<"agent.resident-domain.human-approved.v1">;
type ResidentClaimedEvent =
  KnowledgeEventOf<"agent.resident-domain.execution-claimed.v1">;
type ResidentOutcomeEvent =
  KnowledgeEventOf<"agent.resident-domain.outcome-observed.v1">;
type ResidentFailureAppend = Extract<
  AppendableKnowledgeEvent,
  { readonly type: "agent.resident-domain.failed.v1" }
>;
type ResidentFailurePhase =
  ResidentFailureAppend["payload"]["failure"]["failurePhase"];
type ResidentLogicalLocator =
  ResidentRequestedAppend["payload"]["logicalLocator"];
type ResidentBudget = ResidentRequestedAppend["payload"]["budget"];

function createRevisedGateway(
  ledger: EventLedger,
  residentDomainExecutionPort: unknown,
  composition: ResidentGatewayCompositionCounts,
  suffix: string,
  now: () => string = fixedNow,
  instrumentation: ResidentGatewayHarnessInstrumentation = {}
): object {
  const gateway = Reflect.apply(createResidentLoopToolGateway, undefined, [{
    ledger,
    now,
    residentDomainExecutionPort,
    async reverifyBeforeEffect() {
      composition.beforeEffectCalls += 1;
      if (instrumentation.reverifyBeforeEffect !== undefined) {
        return await instrumentation.reverifyBeforeEffect();
      }
      return Object.freeze({ kind: "current" });
    },
    async reverifyAfterEffect() {
      composition.afterEffectCalls += 1;
      if (instrumentation.reverifyAfterEffect !== undefined) {
        return await instrumentation.reverifyAfterEffect();
      }
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

function isFrozenOpaqueObject(value: unknown): value is object {
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

function requiredResidentGatewayEvent<
  T extends
    | "agent.resident-domain.requested.v1"
    | "agent.resident-domain.execution-claimed.v1"
    | "agent.resident-domain.outcome-observed.v1"
    | "agent.resident-domain.completed.v1"
    | "agent.resident-domain.failed.v1"
>(
  events: readonly KnowledgeEvent[],
  type: T
): KnowledgeEventOf<T> {
  const matching = events.filter(
    (event): event is KnowledgeEventOf<T> => event.type === type
  );
  if (matching.length !== 1) {
    throw new Error(`Resident gateway requires exactly one durable ${type}.`);
  }
  return matching[0]!;
}

function expectExactOwnKeys(
  value: unknown,
  expectedKeys: readonly string[]
): void {
  if (typeof value !== "object" || value === null) {
    throw new Error("Resident gateway readback is not an object.");
  }
  expect(Reflect.ownKeys(value).map(String).sort()).toEqual(
    [...expectedKeys].sort()
  );
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
  suffix: string,
  instrumentation: ResidentGatewayHarnessInstrumentation = {}
): Readonly<Record<string, unknown>> {
  const reportHash =
    "sha256:9999999999999999999999999999999999999999999999999999999999999999";
  const candidateSetHash =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const candidateId = `legacy_candidate_gateway_${suffix}`;
  const assertionId = `as_legacy_${createHash("sha256").update([
    "src_gateway_legacy",
    "scan_gateway_legacy",
    `legacy_stage_gateway_${suffix}`,
    candidateSetHash,
    candidateId
  ].join(":")).digest("hex")}`;
  const runtime = {
    async stagingPreview() {
      if (instrumentation.onPackagePreview !== undefined) {
        await instrumentation.onPackagePreview();
      }
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
          predicate: "legacy.gateway.fixture",
          object: candidateId,
          confidence: 0.8,
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
          `legacy_staging_src_gateway_legacy_scan_gateway_legacy_legacy_stage_gateway_${suffix}`,
        context: residentEventContext(source.id, `corr_gateway_approval_${suffix}`, humanActor),
        payload: {
          stagingBatchId: `legacy_stage_gateway_${suffix}`,
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
        stagingBatchId: `legacy_stage_gateway_${suffix}`,
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
        stagingBatchId: `legacy_stage_gateway_${suffix}`,
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
    stagingBatchId: `legacy_stage_gateway_${suffix}`,
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
  readonly instrumentation?: ResidentGatewayHarnessInstrumentation;
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
  const ledger =
    input.instrumentation?.createLedger?.() ?? new InMemoryEventLedger();
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
    context: residentLegacyContext(
      ledger,
      effects,
      source,
      input.suffix,
      input.instrumentation
    )
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
  if (!isFrozenOpaqueObject(port)) {
    throw new Error("Resident dispatcher did not bind an opaque execution port.");
  }
  const gateway = createRevisedGateway(
    ledger,
    port,
    composition,
    input.suffix,
    input.now,
    input.instrumentation
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
  expect(rawBindings).toEqual([{
    ordinal: stepOrdinal,
    workspaceId,
    residentAgentId,
    taskId,
    attemptId,
    runId,
    planId,
    planRevision,
    toolRequestId,
    toolId,
    toolVersion,
    executionCapabilityHash
  }]);
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
    port,
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

async function appendFreshResidentExecutionClaim(
  ledger: InMemoryEventLedger,
  locator: ResidentLogicalLocator,
  request: ResidentRequestedEvent
): Promise<ResidentClaimedEvent> {
  const claim = await ledger.append({
    type: "agent.resident-domain.execution-claimed.v1",
    version: 1,
    streamId: residentDomainStreamId(locator),
    context: residentEventContext(
      request.id,
      request.payload.correlationId
    ),
    payload: {
      schemaVersion: "resident-domain-execution-claimed.v1",
      logicalLocator: locator,
      executionCapabilityHash: locator.executionCapabilityHash,
      causationId: request.id,
      correlationId: request.payload.correlationId,
      requestEventId: request.id,
      authorization: {
        authorizationKind: "automatic-policy"
      },
      claimedAt: fixedNow()
    }
  }, { expectedNextSequence: 2 });
  if (claim.type !== "agent.resident-domain.execution-claimed.v1") {
    throw new Error("Fresh resident claim fixture appended the wrong event type.");
  }
  return claim;
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

type SemanticResidentOrdinal = 2 | 3 | 4 | 5 | 6 | 7 | 9 | 10;
type SemanticReceiptMutation =
  | "none"
  | "duplicate-evidence"
  | "invocation-input"
  | "domain-context"
  | "domain-payload"
  | "result-identity"
  | "authorization-branch"
  | "predicate"
  | "object"
  | "confidence"
  | "subjectRef-presence"
  | "subjectRef-value"
  | "evidence-content-hash"
  | "candidate-order"
  | "candidate-payload"
  | "binding-hash"
  | "missing-binding-hashes"
  | "idempotent-after-claim"
  | "projection-artifacts"
  | "projection-read-model";

interface RealGatewayLegacyCandidate {
  readonly candidateId: string;
  readonly evidenceId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly predicate: string;
  readonly object: string | number | boolean | null;
  readonly confidence: number;
  readonly subjectRef?: string;
}

interface RealGatewayLegacyBinding {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly stagingBatchId: string;
  readonly legacyReportId: string;
  readonly reportHash: `sha256:${string}`;
  readonly candidateSetHash: `sha256:${string}`;
  readonly candidates: readonly [
    RealGatewayLegacyCandidate,
    RealGatewayLegacyCandidate
  ];
  readonly selectedCandidateBindingHashes: readonly [
    `sha256:${string}`,
    `sha256:${string}`
  ];
  readonly cleanup: () => void;
}

async function prepareRealGatewayLegacyBinding(): Promise<RealGatewayLegacyBinding> {
  const sourceRoot = mkdtempSync(join(tmpdir(), "gateway-real-legacy-"));
  writeLegacyCestusFixture(sourceRoot);
  writeFileSync(
    join(sourceRoot, "ontology", "claims.json"),
    JSON.stringify({
      legacyCestusType: "claims",
      claims: [{
        id: "legacy_gateway_binding_subject",
        subjectRef: "agency:gateway-primary",
        predicate: "agency.name",
        object: "Gateway Primary Agency",
        confidence: 0.93
      }]
    }, null, 2)
  );
  writeFileSync(
    join(sourceRoot, "ontology", "claims-secondary.json"),
    JSON.stringify({
      legacyCestusType: "claims",
      claims: [{
        id: "legacy_gateway_binding_secondary",
        predicate: "agency.status",
        object: "active",
        confidence: 0.81
      }]
    }, null, 2)
  );
  const workspace = createFakeMountedWorkspace(
    "Gateway real legacy binding workspace"
  );
  const runtime = createLegacyImportRuntime({
    mountedWorkspace: workspace,
    actor: humanActor
  });
  try {
    const sourceCollectionId = "src_task136_legacy_binding";
    const scanBatchId = "scan_task136_legacy_binding";
    const stagingBatchId = "legacy_stage_task136_legacy_binding";
    const inspected = await runtime.inspect({
      sourceCollectionId,
      label: "Task136 real legacy binding source",
      sourceRoot,
      scanBatchId
    });
    if (!inspected.ok) {
      throw new Error("Real gateway legacy inspection failed.");
    }
    const approvedImport = await runtime.approveRawImport({
      sourceCollectionId,
      scanBatchId,
      importBatchId: "imp_task136_legacy_binding",
      approvedBy: humanActor.id
    });
    if (!approvedImport.ok) {
      throw new Error("Real gateway legacy raw approval failed.");
    }
    const imported = await runtime.importApproved({
      sourceCollectionId,
      scanBatchId,
      importBatchId: "imp_task136_legacy_binding"
    });
    if (!imported.ok) {
      throw new Error("Real gateway legacy import failed.");
    }
    const staging = await runtime.stagingPreview({
      sourceCollectionId,
      legacyReportId: inspected.legacyReportId
    });
    if (!staging.ok || staging.candidates.length !== 2) {
      throw new Error(
        "Real gateway legacy preparation requires two evidence-tied candidates."
      );
    }
    const ordered = [...staging.candidates].sort((left, right) =>
      Number(Object.hasOwn(right, "subjectRef")) -
      Number(Object.hasOwn(left, "subjectRef"))
    );
    const candidates = [ordered[0]!, ordered[1]!] as const;
    if (
      !Object.hasOwn(candidates[0], "subjectRef") ||
      Object.hasOwn(candidates[1], "subjectRef")
    ) {
      throw new Error(
        "Real gateway legacy candidates lack both subjectRef presence states."
      );
    }
    const selectedCandidateIds = candidates.map(
      ({ candidateId }) => candidateId
    );
    const releasedPreview = buildLegacyStagingApprovalPreview({
      sourceCollectionId,
      scanBatchId,
      stagingBatchId,
      legacyReportId: inspected.legacyReportId,
      reportHash: inspected.reportHash,
      candidateSetHash: inspected.candidateSetHash,
      toolRequestId: "toolreq_gateway_real_legacy_preparation",
      toolId: legacyStagingExecuteDescriptor.toolId,
      toolVersion: legacyStagingExecuteDescriptor.toolVersion,
      runId: "run_gateway_real_legacy_preparation",
      taskId: "task_gateway_real_legacy_preparation",
      residentAgentId: "agent_default",
      preview: staging,
      selectedCandidateIds
    });
    expect(releasedPreview.selectedCandidateIds).toEqual(
      selectedCandidateIds
    );
    const bindingHashes = candidates.map(
      realGatewayLegacyCandidateBindingHash
    );
    return {
      sourceCollectionId,
      scanBatchId,
      stagingBatchId,
      legacyReportId: inspected.legacyReportId,
      reportHash: inspected.reportHash,
      candidateSetHash: inspected.candidateSetHash,
      candidates,
      selectedCandidateBindingHashes: [
        bindingHashes[0]!,
        bindingHashes[1]!
      ],
      cleanup() {
        rmSync(sourceRoot, { recursive: true, force: true });
        rmSync(workspace.rootDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(workspace.rootDir, { recursive: true, force: true });
    throw error;
  }
}

function realGatewayLegacyCandidateBindingHash(
  candidate: RealGatewayLegacyCandidate
): `sha256:${string}` {
  const subjectRefPresent = Object.hasOwn(candidate, "subjectRef");
  return sha256(
    "legacy-selected-candidate-binding.v1\n" +
    stableJson({
      candidateId: candidate.candidateId,
      evidenceId: candidate.evidenceId,
      evidenceContentHash: candidate.evidenceContentHash,
      predicate: candidate.predicate,
      object: candidate.object,
      confidence: candidate.confidence,
      subjectRef: {
        present: subjectRefPresent,
        value: subjectRefPresent ? candidate.subjectRef : null
      }
    })
  );
}

interface SemanticResidentReceiptFixture {
  readonly ledger: InMemoryEventLedger;
  readonly gateway: object;
  readonly locator: ResidentLogicalLocator;
  readonly effects: { count: number };
}

interface SemanticResidentCatalogFixture {
  readonly ordinal: SemanticResidentOrdinal;
  readonly toolId: string;
  readonly implementationRevision: string;
  readonly sideEffectClass:
    | "external-message-send"
    | "ledger-review"
    | "export-or-publication"
    | "destructive-or-repair"
    | "ledger-proposal";
  readonly requiredApprovalClass:
    | "external-message-send"
    | "ledger-review"
    | "export-or-publication"
    | "destructive-or-repair"
    | "none";
  readonly preview: Readonly<Record<string, unknown>>;
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly readModelChanges: readonly string[];
  readonly resultSummary: string;
  readonly legacyCandidates?: readonly [
    RealGatewayLegacyCandidate,
    RealGatewayLegacyCandidate
  ];
}

async function expectSemanticResidentReceiptCompleted(
  fixture: SemanticResidentReceiptFixture
): Promise<void> {
  const recover = reflectedOperation(
    fixture.gateway,
    "rereadAndIssueFromLedger"
  );
  const outcome = await settledResidentRecovery(() => Reflect.apply(
    recover,
    fixture.gateway,
    [fixture.locator]
  ));
  const residentEvents = await fixture.ledger.readStream(
    residentDomainStreamId(fixture.locator)
  );
  expect({
    ...outcome,
    residentEventTypes: residentEvents.map((event) => event.type),
    effects: fixture.effects.count
  }).toEqual({
    outcome: "fulfilled",
    residentEventTypes: [
      "agent.resident-domain.requested.v1",
      "agent.resident-domain.execution-claimed.v1",
      "agent.resident-domain.outcome-observed.v1",
      "agent.resident-domain.completed.v1"
    ],
    effects: 0
  });
}

async function expectSemanticResidentReceiptRejected(
  fixture: SemanticResidentReceiptFixture
): Promise<void> {
  const recover = reflectedOperation(
    fixture.gateway,
    "rereadAndIssueFromLedger"
  );
  const outcome = await settledResidentRecovery(() => Reflect.apply(
    recover,
    fixture.gateway,
    [fixture.locator]
  ));
  const residentEvents = await fixture.ledger.readStream(
    residentDomainStreamId(fixture.locator)
  );
  expect({
    ...outcome,
    residentEventTypes: residentEvents.map((event) => event.type),
    effects: fixture.effects.count
  }).toEqual({
    outcome: "rejected",
    message: expect.stringMatching(
      /semantic|catalog|receipt|invocation|event|context|payload|result|candidate|idempotent|projection/i
    ),
    residentEventTypes: expect.not.arrayContaining([
      "agent.resident-domain.completed.v1",
      "agent.resident-domain.failed.v1"
    ]),
    effects: 0
  });
}

async function appendSemanticResidentRecoveryReceipt(input: {
  readonly ordinal: SemanticResidentOrdinal;
  readonly mutation: SemanticReceiptMutation;
  readonly legacyBinding?: RealGatewayLegacyBinding;
}): Promise<SemanticResidentReceiptFixture> {
  const suffix = `semantic-${input.ordinal}-${input.mutation.replace(
    "authorization",
    "branch"
  )}`;
  const ledger = new InMemoryEventLedger();
  const firstLegacyCandidate = input.ordinal === 10
    ? input.legacyBinding?.candidates[0]
    : undefined;
  const secondLegacyCandidate = input.ordinal === 10
    ? input.legacyBinding?.candidates[1]
    : undefined;
  if (
    input.ordinal === 10 &&
    (firstLegacyCandidate === undefined || secondLegacyCandidate === undefined)
  ) {
    throw new Error(
      "Ordinal-10 semantic recovery requires real released legacy candidates."
    );
  }
  const source = await appendEvidence(ledger, {
    evidenceId:
      firstLegacyCandidate?.evidenceId ?? `ev_gateway_${suffix}_a`,
    ...(firstLegacyCandidate === undefined
      ? {}
      : {
          contentHash: input.mutation === "evidence-content-hash"
            ? hashCanonical({
                foreignEvidenceContentHash:
                  firstLegacyCandidate.evidenceContentHash
              })
            : firstLegacyCandidate.evidenceContentHash
        })
  });
  const secondSource = input.ordinal === 10
    ? await appendEvidence(ledger, {
        evidenceId: secondLegacyCandidate!.evidenceId,
        contentHash: secondLegacyCandidate!.evidenceContentHash
      })
    : undefined;
  const catalog = semanticResidentCatalogFixture(
    input.ordinal,
    suffix,
    source,
    input.legacyBinding,
    input.mutation
  );
  const workspaceId = "ws_gateway";
  const residentAgentId = "agent_default" as const;
  const taskId = "task_gateway";
  const attemptId =
    "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const runId = "run_gateway";
  const planId = `plan_gateway_${suffix}`;
  const planRevision = 0;
  const stepOrdinal = 1;
  const toolRequestId = `toolreq_gateway_${suffix}`;
  const toolVersion = "0.1.0";
  const executionCapabilityHash =
    "sha256:abababababababababababababababababababababababababababababababab";
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
    toolId: catalog.toolId,
    toolVersion,
    executionCapabilityHash,
    suffix
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
    toolId: catalog.toolId,
    toolVersion,
    executionCapabilityHash
  });
  const currentPreview = deepFreezePlain({
    preview: catalog.preview,
    sourceEventIds: [
      source.id,
      ...(secondSource === undefined ? [] : [secondSource.id])
    ],
    inputArtifactHashes: [
      "sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc"
    ],
    provenanceRefs: [`provenance_gateway_${suffix}`],
    activeLocks: [],
    freshnessChecks: [{
      name: "semantic-fixture",
      expected: "current",
      actual: "current",
      ok: true
    }]
  });
  const port = Object.freeze({
    async prepareResidentDomainExecution(command: unknown) {
      const phase = typeof command === "object" && command !== null
        ? Reflect.get(command, "phase")
        : undefined;
      if (phase !== "preview") {
        throw new Error("Semantic receipt fixture supports preview recovery only.");
      }
      return Object.freeze({
        catalogOrdinal: catalog.ordinal,
        executionCapabilityHash,
        implementationRevision: catalog.implementationRevision,
        descriptor: Object.freeze({
          toolId: catalog.toolId,
          toolVersion,
          sideEffectClass: catalog.sideEffectClass,
          requiredApprovalClass: catalog.requiredApprovalClass
        }),
        currentPreview
      });
    }
  });
  const effects = { count: 0 };
  const composition: ResidentGatewayCompositionCounts = {
    safeIdCalls: 0,
    beforeEffectCalls: 0,
    afterEffectCalls: 0
  };
  const gateway = createRevisedGateway(
    ledger,
    port,
    composition,
    suffix
  );
  const streamId = residentDomainStreamId(locator);
  const correlationId = `corr_gateway_${suffix}`;
  const previewHash = hashAgentToolPreview(
    catalog.preview as Parameters<typeof hashAgentToolPreview>[0]
  );
  const authorizationKind = input.ordinal === 10
    ? "automatic-policy" as const
    : "human-approval" as const;
  const request = await ledger.append({
    type: "agent.resident-domain.requested.v1",
    version: 1,
    streamId,
    context: residentEventContext(plan.id, correlationId),
    payload: {
      schemaVersion: "resident-domain-requested.v1",
      logicalLocator: locator,
      executionCapabilityHash,
      causationId: plan.id,
      correlationId,
      authorizationKind,
      planRecordEventId: plan.id,
      previewHash,
      allowlistEntryHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      sideEffectClass: catalog.sideEffectClass,
      expectedSafeOutputClass: "proposal",
      requiredApprovalClass: catalog.requiredApprovalClass,
      sourceEventIds: [source.id],
      contextPackRefs: [{
        contextPackId: "context_pack_gateway",
        contentHash:
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      }],
      inputArtifactHashes: [...currentPreview.inputArtifactHashes],
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
  }, { expectedNextSequence: 1 });
  if (request.type !== "agent.resident-domain.requested.v1") {
    throw new Error("Semantic receipt fixture appended the wrong request.");
  }
  const approval = authorizationKind === "human-approval"
    ? await ledger.append({
        type: "agent.resident-domain.human-approved.v1",
        version: 1,
        streamId,
        context: residentEventContext(
          request.id,
          correlationId,
          humanActor
        ),
        payload: {
          schemaVersion: "resident-domain-human-approved.v1",
          logicalLocator: locator,
          executionCapabilityHash,
          causationId: request.id,
          correlationId,
          authorizationKind: "human-approval",
          requestEventId: request.id,
          decisionEventId: `evt_human_decision_${suffix}`,
          approvedBy: humanActor.id,
          approvedPreviewHash: previewHash
        }
      }, { expectedNextSequence: 2 })
    : undefined;
  const authorization = authorizationKind === "automatic-policy"
    ? { authorizationKind: "automatic-policy" as const }
    : {
        authorizationKind: "human-approval" as const,
        decisionEventId: `evt_human_decision_${suffix}`,
        approvedBy: humanActor.id,
        approvedPreviewHash: previewHash
      };
  const claimCausationId = approval?.id ?? request.id;
  const claim = await ledger.append({
    type: "agent.resident-domain.execution-claimed.v1",
    version: 1,
    streamId,
    context: residentEventContext(claimCausationId, correlationId),
    payload: {
      schemaVersion: "resident-domain-execution-claimed.v1",
      logicalLocator: locator,
      executionCapabilityHash,
      causationId: claimCausationId,
      correlationId,
      requestEventId: request.id,
      authorization,
      claimedAt: fixedNow()
    }
  }, { expectedNextSequence: approval === undefined ? 2 : 3 });
  if (claim.type !== "agent.resident-domain.execution-claimed.v1") {
    throw new Error("Semantic receipt fixture appended the wrong claim.");
  }

  const preInvocationLedgerFingerprint = ledgerFingerprint(
    await ledger.readAll()
  );
  const domainEvents = await appendSemanticResidentDomainEvents({
    ledger,
    catalog,
    mutation: input.mutation,
    claim,
    source,
    secondSource,
    suffix
  });
  const postInvocationLedgerFingerprint = ledgerFingerprint(
    await ledger.readAll()
  );
  const evidenceMode = input.mutation === "idempotent-after-claim"
    ? "idempotent-existing-ledger-events" as const
    : input.ordinal === 7
      ? "nonledger-projection-artifacts" as const
      : "new-ledger-events" as const;
  const canonicalInvocationInput = {
    authorizationKind,
    logicalLocator: locator,
    requestEventId: request.id,
    executionClaimEventId: claim.id,
    authorization,
    previewHash,
    ...(authorizationKind === "human-approval"
      ? {
          approvedPreviewHash: previewHash,
          approvedBy: humanActor.id
        }
      : {}),
    currentPreview
  };
  const artifactHashes = input.mutation === "projection-artifacts"
    ? [hashCanonical("foreign projection artifact")]
    : catalog.artifactHashes;
  const readModelChanges = input.mutation === "projection-read-model"
    ? ["foreign-projection"]
    : catalog.readModelChanges;
  const resultSummary = input.mutation === "result-identity"
    ? "A well-formed but foreign result identity."
    : catalog.resultSummary;
  const receiptEnvelope = {
    logicalLocator: locator,
    executionCapabilityHash,
    requestEventId: request.id,
    executionClaimEventId: claim.id,
    authorization,
    catalogOrdinal: catalog.ordinal,
    implementationRevision: catalog.implementationRevision,
    evidenceMode,
    residentInvocationInputHash: input.mutation === "invocation-input"
      ? hashCanonical({
          ...canonicalInvocationInput,
          currentPreview: {
            ...currentPreview,
            preview: {
              ...catalog.preview,
              semanticDrift: "foreign-but-well-formed"
            }
          }
        })
      : hashCanonical(canonicalInvocationInput),
    outcomeDisposition: "completed" as const,
    preInvocationLedgerFingerprint:
      input.mutation === "idempotent-after-claim"
        ? postInvocationLedgerFingerprint
        : preInvocationLedgerFingerprint,
    postInvocationLedgerFingerprint,
    domainEventIds: domainEvents.map((event) => event.id),
    artifactHashes: [...artifactHashes],
    readModelChanges: [...readModelChanges],
    resultSummary
  };
  const receipt = await ledger.append({
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
  }, { expectedNextSequence: approval === undefined ? 3 : 4 });
  if (receipt.type !== "agent.resident-domain.outcome-observed.v1") {
    throw new Error("Semantic receipt fixture appended the wrong receipt.");
  }
  expectOntologyValidResidentEvents([
    request,
    ...(approval === undefined ? [] : [approval]),
    claim,
    receipt
  ]);
  domainEvents.forEach((event) => {
    const validation = validateKnowledgeEvent(event);
    expect(validation.success, JSON.stringify(validation)).toBe(true);
  });
  return { ledger, gateway, locator, effects };
}

function semanticResidentCatalogFixture(
  ordinal: SemanticResidentOrdinal,
  suffix: string,
  source: KnowledgeEvent,
  legacyBinding: RealGatewayLegacyBinding | undefined,
  mutation: SemanticReceiptMutation
): SemanticResidentCatalogFixture {
  const bodyHash =
    "sha256:3131313131313131313131313131313131313131313131313131313131313131";
  const outputHash =
    "sha256:4141414141414141414141414141414141414141414141414141414141414141";
  const candidateSetHash =
    "sha256:5151515151515151515151515151515151515151515151515151515151515151";
  const reportHash =
    "sha256:6161616161616161616161616161616161616161616161616161616161616161";
  const basePreview = {
    schemaVersion: "agent-domain-preview.v1",
    toolRequestId: `toolreq_gateway_${suffix}`,
    toolVersion: "0.1.0",
    runId: "run_gateway",
    taskId: "task_gateway",
    residentAgentId: "agent_default",
    summary: `Review semantic receipt ${suffix}.`,
    scope: `Bounded semantic receipt fixture ${suffix}.`,
    estimatedEffect: "Produce exactly the catalog-bound result."
  };
  switch (ordinal) {
    case 2:
    case 3: {
      const initial = ordinal === 2;
      const toolId = initial
        ? "prr.initial-send.execute"
        : "prr.follow-up.execute";
      return {
        ordinal,
        toolId,
        implementationRevision: initial
          ? "prr-initial-send-execution.adapter.v1"
          : "prr-follow-up-execution.adapter.v1",
        sideEffectClass: "external-message-send",
        requiredApprovalClass: "external-message-send",
        preview: {
          ...basePreview,
          toolId,
          prrRequestId: `prr_gateway_${suffix}`,
          correspondenceId: `corr_prr_gateway_${suffix}`,
          provider: "gmail",
          subject: `Gateway correspondence ${suffix}`,
          renderedBodyHash: bodyHash,
          providerIdempotencyKey: `send_gateway_${suffix}`,
          attachmentBindings: [{
            evidenceId: String(Reflect.get(source.payload, "evidenceId")),
            filename: "gateway-evidence.json",
            contentHash: String(Reflect.get(source.payload, "contentHash"))
          }]
        },
        artifactHashes: [],
        readModelChanges: [initial ? "prr" : "prr-timeline"],
        resultSummary:
          "PRR correspondence was recorded by the authoritative domain service."
      };
    }
    case 4:
      return {
        ordinal,
        toolId: "ontology.assertion.accept",
        implementationRevision:
          "accepted-graph-assertion-review.adapter.v1",
        sideEffectClass: "ledger-review",
        requiredApprovalClass: "ledger-review",
        preview: {
          ...basePreview,
          toolId: "ontology.assertion.accept",
          assertionId: `as_gateway_${suffix}`,
          proposalEventId: `evt_proposal_gateway_${suffix}`,
          evidenceId: String(Reflect.get(source.payload, "evidenceId")),
          evidenceEventId: source.id,
          evidenceContentHash: String(
            Reflect.get(source.payload, "contentHash")
          ),
          reviewerRationaleDraft:
            "The exact evidence supports this bounded assertion."
        },
        artifactHashes: [],
        readModelChanges: ["ontology-graph"],
        resultSummary:
          "The human-reviewed assertion was accepted through the ontology assertion service."
      };
    case 5:
    case 6: {
      const artifactKind = ordinal === 5 ? "export" : "report";
      const toolId = `governance.${artifactKind}.generate`;
      return {
        ordinal,
        toolId,
        implementationRevision: ordinal === 5
          ? "export-generation.adapter.v1"
          : "report-generation.adapter.v1",
        sideEffectClass: "export-or-publication",
        requiredApprovalClass: "export-or-publication",
        preview: {
          ...basePreview,
          toolId,
          artifactKind,
          artifactId: ordinal === 5
            ? `exp_gateway_${suffix}`
            : `report_gateway_${suffix}`,
          includedEvidenceIds: [
            String(Reflect.get(source.payload, "evidenceId"))
          ],
          includedContentHashes: [
            String(Reflect.get(source.payload, "contentHash"))
          ],
          sensitiveOptIns: [],
          defaultPublicSafeOnly: true,
          policy: {
            policyId: "gov_policy_gateway",
            version: "v1"
          },
          causationEventId: source.id,
          outputArtifactHash: outputHash
        },
        artifactHashes: [outputHash],
        readModelChanges: ["governance-generated-artifacts"],
        resultSummary:
          `Governance recorded the approved ${artifactKind} generation without publishing or transferring artifact bytes.`
      };
    }
    case 7:
      return {
        ordinal,
        toolId: "workspace.projection-rebuild.execute",
        implementationRevision:
          "workspace-projection-rebuild.adapter.v1",
        sideEffectClass: "destructive-or-repair",
        requiredApprovalClass: "destructive-or-repair",
        preview: {
          ...basePreview,
          toolId: "workspace.projection-rebuild.execute",
          expectedArtifactOutputs: [{
            artifactId: `projection_gateway_${suffix}`,
            artifactHash: outputHash,
            path: `generated/${suffix}.json`
          }]
        },
        artifactHashes: [outputHash],
        readModelChanges: ["workspace-projection-artifacts"],
        resultSummary:
          "Workspace-ops rebuilt the approved expendable projection artifacts."
      };
    case 9:
    case 10: {
      const automatic = ordinal === 10;
      if (automatic && legacyBinding === undefined) {
        throw new Error(
          "Ordinal-10 semantic catalog requires real legacy preparation."
        );
      }
      const legacyCandidates = automatic
        ? mutation === "missing-binding-hashes"
          ? legacyBinding!.candidates.map((candidate) => ({
              ...candidate,
              object: candidate.candidateId
            })) as unknown as RealGatewayLegacyBinding["candidates"]
          : legacyBinding!.candidates
        : undefined;
      const selectedCandidateIds = automatic
        ? legacyCandidates!.map(({ candidateId }) => candidateId)
        : [`legacy_candidate_gateway_${suffix}_a`];
      const selectedCandidateBindingHashes = automatic
        ? legacyCandidates!.map(realGatewayLegacyCandidateBindingHash)
        : [];
      if (automatic && mutation === "binding-hash") {
        selectedCandidateBindingHashes[0] = hashCanonical({
          foreignBindingHash: selectedCandidateBindingHashes[0]
        });
      }
      return {
        ordinal,
        toolId: automatic
          ? "legacy.staging.execute"
          : "legacy.staging.approve",
        implementationRevision: automatic
          ? "legacy-staging-execution.adapter.v1"
          : "legacy-staging-approval.adapter.v1",
        sideEffectClass: automatic ? "ledger-proposal" : "ledger-review",
        requiredApprovalClass: automatic ? "none" : "ledger-review",
        preview: {
          ...basePreview,
          toolId: automatic
            ? "legacy.staging.execute"
            : "legacy.staging.approve",
          sourceCollectionId: automatic
            ? legacyBinding!.sourceCollectionId
            : "src_gateway_semantic",
          scanBatchId: automatic
            ? legacyBinding!.scanBatchId
            : "scan_gateway_semantic",
          stagingBatchId: automatic
            ? legacyBinding!.stagingBatchId
            : `legacy_stage_gateway_${suffix}`,
          legacyReportId: automatic
            ? legacyBinding!.legacyReportId
            : `legacy_report_gateway_${suffix}`,
          reportHash: automatic ? legacyBinding!.reportHash : reportHash,
          candidateSetHash: automatic
            ? legacyBinding!.candidateSetHash
            : candidateSetHash,
          selectedCandidateIds,
          ...(
            automatic && mutation !== "missing-binding-hashes"
              ? { selectedCandidateBindingHashes }
              : {}
          ),
          importedEvidenceIds: [
            ...(automatic
              ? legacyCandidates!.map(({ evidenceId }) => evidenceId)
              : [String(Reflect.get(source.payload, "evidenceId"))])
          ],
          evidenceContentHashes: [
            ...(automatic
              ? legacyCandidates!.map(
                  ({ evidenceContentHash }) => evidenceContentHash
                )
              : [String(Reflect.get(source.payload, "contentHash"))])
          ]
        },
        artifactHashes: automatic ? [] : [reportHash, candidateSetHash],
        readModelChanges: ["legacy-staging"],
        resultSummary: automatic
          ? "Legacy ontology staging appended evidence-tied assertion proposals."
          : "Legacy ontology staging approval was recorded.",
        ...(automatic
          ? { legacyCandidates: legacyCandidates! }
          : {})
      };
    }
  }
}

async function appendSemanticResidentDomainEvents(input: {
  readonly ledger: InMemoryEventLedger;
  readonly catalog: SemanticResidentCatalogFixture;
  readonly mutation: SemanticReceiptMutation;
  readonly claim: ResidentClaimedEvent;
  readonly source: KnowledgeEvent;
  readonly secondSource: KnowledgeEvent | undefined;
  readonly suffix: string;
}): Promise<readonly KnowledgeEvent[]> {
  if (input.catalog.ordinal === 7) {
    return [];
  }
  const preview = input.catalog.preview;
  const foreignHuman: ActorRef = {
    id: "human_gateway_foreign",
    kind: "human",
    label: "Foreign Gateway Reviewer"
  };
  const actor = (
    input.mutation === "domain-context" ||
    input.mutation === "authorization-branch"
  )
    ? foreignHuman
    : humanActor;
  switch (input.catalog.ordinal) {
    case 2:
    case 3: {
      const initial = input.catalog.ordinal === 2;
      const appendCorrespondence = async () => await input.ledger.append({
        type: initial ? "prr.request.sent" : "prr.followup.sent",
        version: 1,
        streamId: `prr_${String(Reflect.get(preview, "prrRequestId"))}`,
        context: residentEventContext(
          input.claim.id,
          `corr_gateway_domain_${input.suffix}`,
          actor
        ),
        payload: {
          prrRequestId: String(Reflect.get(preview, "prrRequestId")),
          correspondenceId: String(
            Reflect.get(preview, "correspondenceId")
          ),
          provider: "gmail",
          providerMessageId: `msg_gateway_${input.suffix}`,
          ...(initial
            ? {
                providerThreadId: `thread_gateway_${input.suffix}`,
                idempotencyKey: String(
                  Reflect.get(preview, "providerIdempotencyKey")
                ),
                attachmentEvidenceIds: [
                  String(Reflect.get(input.source.payload, "evidenceId"))
                ],
                rawMetadata: {}
              }
            : {}),
          subject: String(Reflect.get(preview, "subject")),
          bodyHash: String(Reflect.get(preview, "renderedBodyHash")),
          sentAt: fixedNow(),
          approvedBy: actor.id
        }
      } as AppendableKnowledgeEvent);
      const first = await appendCorrespondence();
      return input.mutation === "duplicate-evidence"
        ? [first, await appendCorrespondence()]
        : [first];
    }
    case 4:
      return [await input.ledger.append({
        type: "assertion.accepted",
        version: 1,
        streamId: `assertion_${String(Reflect.get(preview, "assertionId"))}`,
        context: residentEventContext(
          String(Reflect.get(preview, "proposalEventId")),
          `corr_gateway_domain_${input.suffix}`,
          actor
        ),
        payload: {
          assertionId: String(Reflect.get(preview, "assertionId")),
          acceptedBy: actor.id,
          rationale: String(
            Reflect.get(preview, "reviewerRationaleDraft")
          )
        }
      })];
    case 5:
    case 6: {
      const artifactKind = input.catalog.ordinal === 5 ? "export" : "report";
      const expectedArtifactId = String(
        Reflect.get(preview, "artifactId")
      );
      const artifactId = input.mutation === "domain-payload"
        ? input.catalog.ordinal === 5
          ? "exp_gateway_foreign"
          : "report_gateway_foreign"
        : expectedArtifactId;
      return [await input.ledger.append({
        type: input.catalog.ordinal === 5
          ? "export.generated"
          : "report.generated",
        version: 1,
        streamId: `${artifactKind}_${artifactId}`,
        context: residentEventContext(
          String(Reflect.get(preview, "causationEventId")),
          `corr_gateway_domain_${input.suffix}`,
          humanActor
        ),
        payload: {
          ...(artifactKind === "export"
            ? { exportId: artifactId }
            : { reportId: artifactId }),
          generatedBy: humanActor.id,
          generatedAt: fixedNow(),
          policy: Reflect.get(preview, "policy"),
          includedEvidenceIds: Reflect.get(
            preview,
            "includedEvidenceIds"
          ),
          includedContentHashes: Reflect.get(
            preview,
            "includedContentHashes"
          ),
          sensitiveOptIns: [],
          defaultPublicSafeOnly: true
        }
      } as AppendableKnowledgeEvent)];
    }
    case 9:
      return [await input.ledger.append({
        type: "legacy.ontology.staging.approved",
        version: 1,
        streamId:
          `legacy_staging_src_gateway_semantic_scan_gateway_semantic_${String(Reflect.get(preview, "stagingBatchId"))}`,
        context: residentEventContext(
          input.claim.id,
          `corr_gateway_domain_${input.suffix}`,
          actor
        ),
        payload: {
          stagingBatchId: String(
            Reflect.get(preview, "stagingBatchId")
          ),
          legacyReportId: String(
            Reflect.get(preview, "legacyReportId")
          ),
          sourceCollectionId: String(
            Reflect.get(preview, "sourceCollectionId")
          ),
          scanBatchId: String(Reflect.get(preview, "scanBatchId")),
          reportHash: String(Reflect.get(preview, "reportHash")),
          candidateSetHash: String(
            Reflect.get(preview, "candidateSetHash")
          ),
          approvedBy: actor.id,
          approvedAt: fixedNow(),
          approvedAssertionCandidateIds: Reflect.get(
            preview,
            "selectedCandidateIds"
          )
        }
      } as AppendableKnowledgeEvent)];
    case 10: {
      const selected = [
        ...(Reflect.get(preview, "selectedCandidateIds") as readonly string[])
      ];
      const evidenceIds = [
        ...(Reflect.get(preview, "importedEvidenceIds") as readonly string[])
      ];
      const sources = [
        input.source,
        requiredPrefixEvent(input.secondSource, "second semantic evidence")
      ];
      const candidates = input.catalog.legacyCandidates;
      if (candidates === undefined) {
        throw new Error(
          "Ordinal-10 semantic domain evidence lacks real candidate bindings."
        );
      }
      const order = input.mutation === "candidate-order"
        ? [1, 0]
        : [0, 1];
      const events: KnowledgeEvent[] = [];
      for (const selectedIndex of order) {
        const candidateId = selected[selectedIndex]!;
        const evidenceId = evidenceIds[selectedIndex]!;
        const eventSource = sources[selectedIndex]!;
        const candidate = candidates[selectedIndex]!;
        const assertionId = `as_legacy_${createHash("sha256").update([
          String(Reflect.get(preview, "sourceCollectionId")),
          String(Reflect.get(preview, "scanBatchId")),
          String(Reflect.get(preview, "stagingBatchId")),
          String(Reflect.get(preview, "candidateSetHash")),
          candidateId
        ].join(":")).digest("hex")}`;
        events.push(await input.ledger.append({
          type: "assertion.proposed",
          version: 1,
          streamId: `assertion_${assertionId}`,
          context: residentEventContext(
            eventSource.id,
            `corr_gateway_domain_${input.suffix}`
          ),
          payload: {
            assertionId,
            evidenceId,
            predicate:
              input.mutation === "predicate" && selectedIndex === 0
                ? `${candidate.predicate}.foreign`
                : candidate.predicate,
            object:
              (
                input.mutation === "object" ||
                input.mutation === "candidate-payload"
              ) &&
              selectedIndex === 0
                ? `${String(candidate.object)} foreign`
                : candidate.object,
            confidence:
              input.mutation === "confidence" && selectedIndex === 0
                ? Math.max(0, candidate.confidence - 0.1)
                : candidate.confidence,
            ...(
              input.mutation === "subjectRef-presence" &&
              selectedIndex === 0
                ? {}
                : candidate.subjectRef === undefined
                  ? {}
                  : {
                      subjectRef:
                        input.mutation === "subjectRef-value" &&
                        selectedIndex === 0
                          ? `${candidate.subjectRef}_foreign`
                          : candidate.subjectRef
                    }
            ),
            reviewState: "proposed"
          }
        }));
      }
      return events;
    }
  }
}

async function appendCanonicalResidentDomainPrefix(input: {
  readonly authorizationKind: ResidentAuthorizationKind;
  readonly terminal: ResidentPrefixTerminal;
  readonly suffix?: string;
  readonly createLedger?: () => InMemoryEventLedger;
  readonly receiptDisposition?: "completed" | "failed";
  readonly receiptEnvelopeHash?: `sha256:${string}`;
}): Promise<CanonicalResidentPrefix> {
  const suffix = input.suffix ?? "canonical";
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: input.authorizationKind,
    suffix,
    ...(input.createLedger === undefined
      ? {}
      : { instrumentation: { createLedger: input.createLedger } })
  });
  const {
    ledger,
    gateway,
    port,
    effects,
    composition,
    source,
    plan,
    preparedBinding,
    locator
  } = harness;
  const rawPortPreview = await reflectedOperation(
    port,
    "prepareResidentDomainExecution"
  )({
    phase: "preview",
    logicalLocator: locator
  });
  if (typeof rawPortPreview !== "object" || rawPortPreview === null) {
    throw new Error("Canonical resident prefix lacks its package preview.");
  }
  const currentPreview = Reflect.get(rawPortPreview, "currentPreview");
  if (typeof currentPreview !== "object" || currentPreview === null) {
    throw new Error("Canonical resident prefix lacks its exact current preview.");
  }
  const preview = Reflect.get(currentPreview, "preview");
  if (typeof preview !== "object" || preview === null) {
    throw new Error("Canonical resident prefix lacks its exact tool preview.");
  }
  const previewHash = hashAgentToolPreview(
    preview as Parameters<typeof hashAgentToolPreview>[0]
  );
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
      previewHash,
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
      inputArtifactHashes: [
        ...(Reflect.get(currentPreview, "inputArtifactHashes") as readonly `sha256:${string}`[])
      ],
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
  if (requested.type !== "agent.resident-domain.requested.v1") {
    throw new Error("Canonical resident request fixture appended the wrong event type.");
  }
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

  if (input.terminal === "denied") {
    if (input.authorizationKind !== "human-approval") {
      throw new Error("Canonical resident denial must use human approval.");
    }
    const terminal = await appendCanonicalResidentDenial(
      ledger,
      locator,
      requested,
      correlationId,
      events.length + 1
    );
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
      terminal
    };
  }

  if (
    input.terminal === "automatic-pre-claim-failed" ||
    input.terminal === "human-pre-approval-failed"
  ) {
    const expectedAuthorization =
      input.terminal === "automatic-pre-claim-failed"
        ? "automatic-policy"
        : "human-approval";
    if (input.authorizationKind !== expectedAuthorization) {
      throw new Error("Canonical resident pre-claim failure uses the wrong authorization branch.");
    }
    const terminal = await appendCanonicalResidentFailure({
      ledger,
      locator,
      request: requested,
      correlationId,
      failurePhase:
        input.terminal === "automatic-pre-claim-failed"
          ? "pre-claim"
          : "pre-approval",
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
      terminal
    };
  }

  let decision: ResidentHumanApprovedEvent | undefined;
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
        approvedPreviewHash: previewHash
      }
    };
    const appendedDecision = await ledger.append(decisionInput, {
      expectedNextSequence: 2
    });
    if (appendedDecision.type !== "agent.resident-domain.human-approved.v1") {
      throw new Error("Canonical resident decision fixture appended the wrong event type.");
    }
    decision = appendedDecision;
    events.push(decision);
  }
  if (input.terminal === "human-post-approval-pre-claim-failed") {
    if (input.authorizationKind !== "human-approval" || decision === undefined) {
      throw new Error("Canonical post-approval failure requires its exact human decision.");
    }
    const terminal = await appendCanonicalResidentFailure({
      ledger,
      locator,
      request: requested,
      decision,
      correlationId,
      failurePhase: "post-approval-pre-claim",
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
      decision,
      terminal
    };
  }
  const authorization = input.authorizationKind === "automatic-policy"
    ? { authorizationKind: "automatic-policy" as const }
    : {
        authorizationKind: "human-approval" as const,
        decisionEventId: "evt_human_decision_gateway",
        approvedBy: humanActor.id,
        approvedPreviewHash: previewHash
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
  if (claim.type !== "agent.resident-domain.execution-claimed.v1") {
    throw new Error("Canonical resident claim fixture appended the wrong event type.");
  }
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
  const selectedCandidateIds = Reflect.get(preview, "selectedCandidateIds");
  const importedEvidenceIds = Reflect.get(preview, "importedEvidenceIds");
  if (
    !Array.isArray(selectedCandidateIds) ||
    !Array.isArray(importedEvidenceIds) ||
    selectedCandidateIds.length !== 1 ||
    importedEvidenceIds.length !== 1
  ) {
    throw new Error("Canonical legacy preview lacks its exact selected candidate.");
  }
  const domainEvent = input.authorizationKind === "automatic-policy"
    ? await appendLegacyAssertionProposal(
        ledger,
        source,
        suffix,
        String(selectedCandidateIds[0]),
        String(importedEvidenceIds[0]),
        String(Reflect.get(preview, "sourceCollectionId")),
        String(Reflect.get(preview, "scanBatchId")),
        String(Reflect.get(preview, "stagingBatchId")),
        String(Reflect.get(preview, "candidateSetHash"))
      )
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
      authorizationKind: input.authorizationKind,
      logicalLocator: locator,
      requestEventId: requested.id,
      executionClaimEventId: claim.id,
      authorization,
      previewHash,
      ...(input.authorizationKind === "human-approval"
        ? {
            approvedPreviewHash: previewHash,
            approvedBy: humanActor.id
          }
        : {}),
      currentPreview
    }),
    outcomeDisposition: input.receiptDisposition ??
      (input.terminal === "post-claim-failed"
        ? "failed" as const
        : "completed" as const),
    preInvocationLedgerFingerprint,
    postInvocationLedgerFingerprint,
    domainEventIds: [domainEvent.id],
    artifactHashes: input.authorizationKind === "automatic-policy"
      ? []
      : [
          String(Reflect.get(preview, "reportHash")) as `sha256:${string}`,
          String(Reflect.get(preview, "candidateSetHash")) as `sha256:${string}`
        ],
    readModelChanges: ["legacy-staging"],
    resultSummary: input.authorizationKind === "automatic-policy"
      ? "Legacy ontology staging appended evidence-tied assertion proposals."
      : "Legacy ontology staging approval was recorded."
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
      envelopeHash:
        input.receiptEnvelopeHash ?? hashCanonical(receiptEnvelope)
    }
  };
  const receipt = await ledger.append(receiptInput, {
    expectedNextSequence: events.length + 1
  });
  if (receipt.type !== "agent.resident-domain.outcome-observed.v1") {
    throw new Error("Canonical resident receipt fixture appended the wrong event type.");
  }
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

  const terminal = input.terminal === "post-claim-failed"
    ? await appendCanonicalResidentFailure({
        ledger,
        locator,
        request: requested,
        ...(decision === undefined ? {} : { decision }),
        claim,
        receipt,
        correlationId,
        failurePhase: "post-claim",
        expectedNextSequence: events.length + 1
      })
    : await ledger.append({
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
          resultArtifactHashes: [...receiptEnvelope.artifactHashes]
        }
      }, {
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

async function appendCanonicalResidentDenial(
  ledger: InMemoryEventLedger,
  locator: ResidentLogicalLocator,
  request: ResidentRequestedEvent,
  correlationId: string,
  expectedNextSequence: number
): Promise<KnowledgeEventOf<"agent.resident-domain.denied.v1">> {
  const denied = await ledger.append({
    type: "agent.resident-domain.denied.v1",
    version: 1,
    streamId: residentDomainStreamId(locator),
    context: residentEventContext(
      request.id,
      correlationId,
      humanActor
    ),
    payload: {
      schemaVersion: "resident-domain-denied.v1",
      logicalLocator: locator,
      executionCapabilityHash: locator.executionCapabilityHash,
      causationId: request.id,
      correlationId,
      authorizationKind: "human-approval",
      requestEventId: request.id,
      deniedBy: humanActor.id,
      denialReason: "Independent human denied this exact resident request."
    }
  }, { expectedNextSequence });
  if (denied.type !== "agent.resident-domain.denied.v1") {
    throw new Error("Canonical resident denial fixture appended the wrong event type.");
  }
  return denied;
}

async function appendCanonicalResidentFailure(input: {
  readonly ledger: InMemoryEventLedger;
  readonly locator: ResidentLogicalLocator;
  readonly request: ResidentRequestedEvent;
  readonly decision?: ResidentHumanApprovedEvent;
  readonly claim?: ResidentClaimedEvent;
  readonly receipt?: ResidentOutcomeEvent;
  readonly correlationId: string;
  readonly failurePhase: ResidentFailurePhase;
  readonly expectedNextSequence: number;
}): Promise<KnowledgeEventOf<"agent.resident-domain.failed.v1">> {
  const failure = (() => {
    switch (input.failurePhase) {
      case "pre-claim":
        return {
          authorizationKind: "automatic-policy" as const,
          failurePhase: "pre-claim" as const
        };
      case "pre-approval":
        return {
          authorizationKind: "human-approval" as const,
          failurePhase: "pre-approval" as const
        };
      case "post-approval-pre-claim": {
        const decision = requiredPrefixEvent(
          input.decision,
          "human decision"
        ) as ResidentHumanApprovedEvent;
        return {
          authorizationKind: "human-approval" as const,
          failurePhase: "post-approval-pre-claim" as const,
          decisionEventId: decision.payload.decisionEventId,
          approvedBy: decision.payload.approvedBy,
          approvedPreviewHash: decision.payload.approvedPreviewHash
        };
      }
      case "post-claim": {
        const claim = requiredPrefixEvent(
          input.claim,
          "execution claim"
        ) as ResidentClaimedEvent;
        const receipt = requiredPrefixEvent(
          input.receipt,
          "outcome receipt"
        ) as ResidentOutcomeEvent;
        if (input.request.payload.authorizationKind === "automatic-policy") {
          return {
            authorizationKind: "automatic-policy" as const,
            failurePhase: "post-claim" as const,
            executionClaimEventId: claim.id,
            outcomeReceiptEventId: receipt.id
          };
        }
        const decision = requiredPrefixEvent(
          input.decision,
          "human decision"
        ) as ResidentHumanApprovedEvent;
        return {
          authorizationKind: "human-approval" as const,
          failurePhase: "post-claim" as const,
          decisionEventId: decision.payload.decisionEventId,
          approvedBy: decision.payload.approvedBy,
          approvedPreviewHash: decision.payload.approvedPreviewHash,
          executionClaimEventId: claim.id,
          outcomeReceiptEventId: receipt.id
        };
      }
    }
  })();
  const causationId = input.failurePhase === "post-claim"
    ? requiredPrefixEvent(input.receipt, "outcome receipt").id
    : input.request.id;
  const failureInput: ResidentFailureAppend = {
    type: "agent.resident-domain.failed.v1",
    version: 1,
    streamId: residentDomainStreamId(input.locator),
    context: residentEventContext(causationId, input.correlationId),
    payload: {
      schemaVersion: "resident-domain-failed.v1",
      logicalLocator: input.locator,
      executionCapabilityHash: input.locator.executionCapabilityHash,
      causationId,
      correlationId: input.correlationId,
      requestEventId: input.request.id,
      failure,
      failureCategory: "resident-domain-causal-fixture",
      safeMessage: "The exact resident-domain operation has durable failure proof.",
      failureProofHash: hashCanonical({
        requestEventId: input.request.id,
        failure
      })
    }
  };
  const failed = await input.ledger.append(failureInput, {
    expectedNextSequence: input.expectedNextSequence
  });
  if (failed.type !== "agent.resident-domain.failed.v1") {
    throw new Error("Canonical resident failure fixture appended the wrong event type.");
  }
  return failed;
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

type HostileResidentRecoveryPrefix =
  | "standalone completed"
  | "gapped completed"
  | "foreign completed"
  | "mismatched completed"
  | "receipt without claim"
  | "terminal without receipt"
  | "duplicate terminal"
  | "second terminal"
  | "authorization branch drift"
  | "logical locator drift"
  | "capability hash drift"
  | "correlation drift"
  | "causation drift";

interface HostileResidentPrefix {
  readonly ledger: InMemoryEventLedger;
  readonly gateway: object;
  readonly locator: ResidentLogicalLocator;
  readonly effects: { count: number };
  readonly events: readonly KnowledgeEvent[];
}

async function appendHostileResidentRecoveryPrefix(
  hostility: HostileResidentRecoveryPrefix
): Promise<HostileResidentPrefix> {
  const suffix = `hostile-${createHash("sha256")
    .update(hostility)
    .digest("hex")
    .slice(0, 16)}`;
  if (hostility === "standalone completed") {
    const target = await prepareResidentGatewayHarness({
      authorizationKind: "automatic-policy",
      suffix
    });
    const donor = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "automatic-policy",
      terminal: "completed",
      suffix: `${suffix}-donor`
    });
    await appendRetargetedResidentEvent(
      target,
      requiredPrefixEvent(donor.terminal, "completed terminal"),
      {
        causationId: "evt_foreign_receipt",
        requestEventId: "evt_foreign_request",
        executionClaimEventId: "evt_foreign_claim",
        outcomeReceiptEventId: "evt_foreign_receipt"
      },
      {
        causationId: "evt_foreign_receipt"
      }
    );
    return hostileResidentPrefix(target);
  }

  if (hostility === "second terminal") {
    const target = await appendCanonicalResidentDomainPrefix({
      authorizationKind: "human-approval",
      terminal: "completed",
      suffix
    });
    await appendCanonicalResidentDenial(
      target.ledger,
      target.locator,
      target.request as ResidentRequestedEvent,
      residentPrefixCorrelation(target),
      target.events.length + 1
    );
    return hostileResidentPrefix(target);
  }

  const baseTerminal = (() => {
    switch (hostility) {
      case "gapped completed":
      case "receipt without claim":
        return "requested" as const;
      case "terminal without receipt":
        return "claimed" as const;
      case "foreign completed":
      case "mismatched completed":
      case "authorization branch drift":
      case "logical locator drift":
      case "capability hash drift":
      case "correlation drift":
      case "causation drift":
        return "receipt" as const;
      case "duplicate terminal":
        return "completed" as const;
    }
  })();
  const target = await appendCanonicalResidentDomainPrefix({
    authorizationKind: "automatic-policy",
    terminal: baseTerminal,
    suffix,
    ...(hostility === "logical locator drift" ||
    hostility === "capability hash drift"
      ? {
          createLedger: () => new TargetStreamHostileResidentLedger()
        }
      : {})
  });
  const donor = await appendCanonicalResidentDomainPrefix({
    authorizationKind: "automatic-policy",
    terminal: "completed",
    suffix: `${suffix}-donor`
  });
  const donorCompletion = requiredPrefixEvent(
    donor.terminal,
    "completed terminal"
  );
  const donorReceipt = requiredPrefixEvent(
    donor.receipt,
    "outcome receipt"
  );
  const targetClaim = target.claim;
  const targetReceipt = target.receipt;
  const requestId = target.request.id;
  const claimId = targetClaim?.id ?? "evt_missing_claim";
  const receiptId = targetReceipt?.id ?? "evt_missing_receipt";

  switch (hostility) {
    case "gapped completed":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: "evt_missing_receipt",
        requestEventId: requestId,
        executionClaimEventId: "evt_missing_claim",
        outcomeReceiptEventId: "evt_missing_receipt"
      }, { causationId: "evt_missing_receipt" });
      break;
    case "foreign completed":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: donorReceipt.id,
        requestEventId: donor.request.id,
        executionClaimEventId: requiredPrefixEvent(
          donor.claim,
          "donor claim"
        ).id,
        outcomeReceiptEventId: donorReceipt.id
      }, { causationId: donorReceipt.id });
      break;
    case "mismatched completed":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId,
        resultHash:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      }, { causationId: receiptId });
      break;
    case "receipt without claim":
      await appendRetargetedResidentEvent(target, donorReceipt, {
        causationId: "evt_missing_claim",
        requestEventId: requestId,
        executionClaimEventId: "evt_missing_claim"
      }, { causationId: "evt_missing_claim" });
      break;
    case "terminal without receipt":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: "evt_missing_receipt",
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: "evt_missing_receipt"
      }, { causationId: "evt_missing_receipt" });
      break;
    case "duplicate terminal":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId,
        resultHash: Reflect.get(target.terminal?.payload ?? {}, "resultHash")
      }, { causationId: receiptId });
      break;
    case "authorization branch drift":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId,
        authorization: {
          authorizationKind: "human-approval",
          decisionEventId: "evt_foreign_human_decision",
          approvedBy: humanActor.id,
          approvedPreviewHash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }
      }, { causationId: receiptId });
      break;
    case "logical locator drift":
      {
        const foreignLocator = deepFreezePlain({
          ...target.locator,
          toolRequestId: "toolreq_foreign_locator"
        });
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId,
        logicalLocator: foreignLocator
      }, { causationId: receiptId }, target.locator, true);
      break;
      }
    case "capability hash drift":
      {
        const foreignCapabilityHash =
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
        const foreignLocator = deepFreezePlain({
          ...target.locator,
          executionCapabilityHash: foreignCapabilityHash
        });
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId,
        logicalLocator: foreignLocator,
        executionCapabilityHash: foreignCapabilityHash
      }, { causationId: receiptId }, target.locator, true);
      break;
      }
    case "correlation drift":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: receiptId,
        correlationId: "corr_gateway_foreign",
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId
      }, {
        causationId: receiptId,
        correlationId: "corr_gateway_foreign"
      });
      break;
    case "causation drift":
      await appendRetargetedResidentEvent(target, donorCompletion, {
        causationId: requestId,
        requestEventId: requestId,
        executionClaimEventId: claimId,
        outcomeReceiptEventId: receiptId
      }, { causationId: requestId });
      break;
  }
  return hostileResidentPrefix(target);
}

async function appendRetargetedResidentEvent(
  target: Pick<
    CanonicalResidentPrefix,
    "ledger" | "locator" | "events"
  > | Pick<ResidentGatewayHarness, "ledger" | "locator">,
  donor: KnowledgeEvent,
  payloadOverrides: Readonly<Record<string, unknown>>,
  contextOverrides: Readonly<Record<string, unknown>>,
  streamLocator: ResidentLogicalLocator = target.locator,
  injectInvalidTargetBinding = false
): Promise<KnowledgeEvent> {
  const { id: _id, sequence: _sequence, ...appendable } = donor;
  const current = await target.ledger.readStream(
    residentDomainStreamId(streamLocator)
  );
  const correlationId = typeof payloadOverrides.correlationId === "string"
    ? payloadOverrides.correlationId
    : `corr_gateway_${target.locator.planId.toString().replace("plan_gateway_", "")}`;
  const candidate = {
    ...appendable,
    streamId: residentDomainStreamId(streamLocator),
    context: {
      ...donor.context,
      correlationId,
      ...contextOverrides
    },
    payload: {
      ...donor.payload,
      logicalLocator: target.locator,
      executionCapabilityHash: target.locator.executionCapabilityHash,
      correlationId,
      ...payloadOverrides
    },
    id: `evt_${createHash("sha256").update([
      "resident-hostile-target-binding",
      donor.id,
      JSON.stringify(payloadOverrides)
    ].join(":")).digest("hex").slice(0, 32)}`,
    sequence: current.length + 1
  };
  if (injectInvalidTargetBinding) {
    if (!(target.ledger instanceof TargetStreamHostileResidentLedger)) {
      throw new Error("Hostile target-stream fixture lacks its instrumented ledger.");
    }
    const event = structuredClone(candidate) as KnowledgeEvent;
    target.ledger.injectTargetStreamHostile(event);
    return event;
  }
  const { id: _candidateId, sequence: _candidateSequence, ...candidateInput } =
    candidate;
  const appended = await target.ledger.append(
    candidateInput as AppendableKnowledgeEvent,
    {
    expectedNextSequence: current.length + 1
    }
  );
  const validation = validateKnowledgeEvent(appended);
  expect(validation.success, JSON.stringify(validation)).toBe(true);
  return appended;
}

async function hostileResidentPrefix(
  input: Pick<
    CanonicalResidentPrefix,
    "ledger" | "gateway" | "locator" | "effects"
  > | ResidentGatewayHarness
): Promise<HostileResidentPrefix> {
  return {
    ledger: input.ledger,
    gateway: input.gateway,
    locator: input.locator,
    effects: input.effects,
    events: await input.ledger.readAll()
  };
}

function residentPrefixCorrelation(prefix: CanonicalResidentPrefix): string {
  const correlationId = Reflect.get(prefix.request.payload, "correlationId");
  if (typeof correlationId !== "string") {
    throw new Error("Resident prefix correlation is absent.");
  }
  return correlationId;
}

function expectOntologyValidResidentEvents(
  events: readonly KnowledgeEvent[]
): void {
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) {
    const validation = validateKnowledgeEvent(event);
    expect(validation.success, JSON.stringify(validation)).toBe(true);
  }
}

function expectedRecoveryReadback(
  prefix: CanonicalResidentPrefix,
  terminal: ResidentPrefixTerminal
): Readonly<Record<string, unknown>> {
  const authorizationKind = Reflect.get(
    prefix.request.payload,
    "authorizationKind"
  );
  const base = {
    authorizationKind,
    logicalLocator: prefix.locator,
    executionCapabilityHash: prefix.locator.executionCapabilityHash,
    requestEventId: prefix.request.id
  };
  const humanDecision = prefix.decision === undefined
    ? {}
    : {
        decisionEventId: Reflect.get(
          prefix.decision.payload,
          "decisionEventId"
        ),
        approvedBy: Reflect.get(prefix.decision.payload, "approvedBy"),
        approvedPreviewHash: Reflect.get(
          prefix.decision.payload,
          "approvedPreviewHash"
        )
      };

  if (terminal === "completed") {
    return {
      ...base,
      stage: "completed",
      ...humanDecision,
      executionClaimEventId: requiredPrefixEvent(prefix.claim, "claim").id,
      outcomeReceiptEventId: requiredPrefixEvent(prefix.receipt, "receipt").id,
      resultEventId: requiredPrefixEvent(prefix.terminal, "terminal").id
    };
  }
  if (terminal === "denied") {
    return {
      ...base,
      stage: "denied",
      denialEventId: requiredPrefixEvent(prefix.terminal, "terminal").id
    };
  }
  if (terminal === "claimed") {
    return {
      ...base,
      stage: "claimed",
      category: "effect-outcome-unknown",
      ...humanDecision,
      executionClaimEventId: requiredPrefixEvent(prefix.claim, "claim").id
    };
  }
  if (
    terminal === "automatic-pre-claim-failed" ||
    terminal === "human-pre-approval-failed" ||
    terminal === "human-post-approval-pre-claim-failed" ||
    terminal === "post-claim-failed"
  ) {
    const failurePhase = terminal === "automatic-pre-claim-failed"
      ? "pre-claim"
      : terminal === "human-pre-approval-failed"
        ? "pre-approval"
        : terminal === "human-post-approval-pre-claim-failed"
          ? "post-approval-pre-claim"
          : "post-claim";
    return {
      ...base,
      stage: "failed",
      failurePhase,
      ...(failurePhase === "pre-approval" || failurePhase === "pre-claim"
        ? {}
        : humanDecision),
      ...(failurePhase === "post-claim"
        ? {
            executionClaimEventId:
              requiredPrefixEvent(prefix.claim, "claim").id,
            outcomeReceiptEventId:
              requiredPrefixEvent(prefix.receipt, "receipt").id
          }
        : {}),
      resultEventId: requiredPrefixEvent(prefix.terminal, "terminal").id
    };
  }
  throw new Error(`Resident recovery terminal ${terminal} has no issued readback.`);
}

async function runPackagePreviewRevalidationCase(
  beforeKind: ResidentCurrentnessKind,
  afterKind: ResidentCurrentnessKind
) {
  const trace: string[] = [];
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: "automatic-policy",
    suffix: `preview-${beforeKind}-${afterKind}`,
    instrumentation: {
      async onPackagePreview() {
        trace.push("preview:start");
        await Promise.resolve();
        trace.push("preview:end");
      },
      async reverifyBeforeEffect() {
        trace.push("W:before");
        return Object.freeze({ kind: beforeKind });
      },
      async reverifyAfterEffect() {
        trace.push("W:after");
        return Object.freeze({ kind: afterKind });
      }
    }
  });
  const request = reflectedOperation(
    harness.gateway,
    "requestFreshAuthorized"
  );
  const outcome = await settledOutcome(() => Reflect.apply(
    request,
    harness.gateway,
    [harness.locator]
  ));
  const residentEvents = await harness.ledger.readStream(
    residentDomainStreamId(harness.locator)
  );
  return {
    beforeKind,
    afterKind,
    outcome,
    trace,
    residentEventTypes: residentEvents.map((event) => event.type),
    effects: harness.effects.count
  };
}

async function runRequestPublicationRevalidationCase(
  boundary: ResidentRequestPublicationBoundary
) {
  const trace: string[] = [];
  let requestActive = false;
  let beforeCalls = 0;
  let afterCalls = 0;
  const staleAfterCall = {
    append: 2,
    "stream-reread": 3,
    "global-reread": 4
  }[boundary];
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: "automatic-policy",
    suffix: `request-publication-${boundary}`,
    instrumentation: {
      createLedger() {
        return new class extends InMemoryEventLedger {
          override async append(
            event: AppendableKnowledgeEvent,
            options?: Parameters<EventLedger["append"]>[1]
          ) {
            const isRequest =
              requestActive &&
              event.type === "agent.resident-domain.requested.v1";
            if (isRequest) {
              trace.push("request:append:start");
            }
            const appended = await super.append(event, options);
            if (isRequest) {
              trace.push("request:append:end");
            }
            return appended;
          }

          override async readStream(streamId: string) {
            const isRequestReread =
              requestActive &&
              streamId.startsWith("agent_resident_domain_");
            if (isRequestReread) {
              trace.push("request:stream:start");
            }
            const events = await super.readStream(streamId);
            if (isRequestReread) {
              trace.push("request:stream:end");
            }
            return events;
          }

          override async readAll() {
            const isRequestReread =
              requestActive &&
              afterCalls >= 1;
            if (isRequestReread) {
              trace.push("request:all:start");
            }
            const events = await super.readAll();
            if (isRequestReread) {
              trace.push("request:all:end");
            }
            return events;
          }
        }();
      },
      async onPackagePreview() {
        if (requestActive) {
          trace.push("preview:start");
        }
        await Promise.resolve();
        if (requestActive) {
          trace.push("preview:end");
        }
      },
      async reverifyBeforeEffect() {
        if (!requestActive) {
          return Object.freeze({ kind: "current" });
        }
        beforeCalls += 1;
        trace.push(`W:before:${beforeCalls}`);
        return Object.freeze({ kind: "current" });
      },
      async reverifyAfterEffect() {
        if (!requestActive) {
          return Object.freeze({ kind: "current" });
        }
        afterCalls += 1;
        trace.push(`W:after:${afterCalls}`);
        return Object.freeze({
          kind: afterCalls === staleAfterCall ? "stale" : "current"
        });
      }
    }
  });
  const request = reflectedOperation(
    harness.gateway,
    "requestFreshAuthorized"
  );
  const execute = reflectedOperation(
    harness.gateway,
    "executeFreshAuthorized"
  );
  let requested: unknown;
  requestActive = true;
  const requestOutcome = await settledOutcome(async () => {
    requested = await Reflect.apply(
      request,
      harness.gateway,
      [harness.locator]
    );
  });
  requestActive = false;
  const executionOutcome = requested === undefined
    ? "not-issued"
    : await settledOutcome(() => Reflect.apply(
        execute,
        harness.gateway,
        [requested]
      ));
  const residentEvents = await harness.ledger.readStream(
    residentDomainStreamId(harness.locator)
  );
  return {
    boundary,
    requestOutcome,
    executionOutcome,
    trace,
    residentEventTypes: residentEvents.map((event) => event.type),
    effects: harness.effects.count
  };
}

async function runHumanDecisionRevalidationCase(
  beforeKind: ResidentCurrentnessKind,
  afterKind: ResidentCurrentnessKind
) {
  const trace: string[] = [];
  let observingDecision = false;
  const harness = await prepareResidentGatewayHarness({
    authorizationKind: "human-approval",
    suffix: `decision-revalidation-${beforeKind}-${afterKind}`,
    instrumentation: {
      createLedger() {
        return new class extends InMemoryEventLedger {
          override async readStream(streamId: string) {
            const decisionRead =
              observingDecision &&
              streamId.startsWith("agent_resident_domain_");
            if (decisionRead) {
              trace.push("decision:start");
            }
            const events = await super.readStream(streamId);
            if (decisionRead) {
              trace.push("decision:end");
            }
            return events;
          }
        }();
      },
      async reverifyBeforeEffect() {
        if (observingDecision) {
          trace.push("W:before");
          return Object.freeze({ kind: beforeKind });
        }
        return Object.freeze({ kind: "current" });
      },
      async reverifyAfterEffect() {
        if (observingDecision) {
          trace.push("W:after");
          return Object.freeze({ kind: afterKind });
        }
        return Object.freeze({ kind: "current" });
      }
    }
  });
  const request = reflectedOperation(
    harness.gateway,
    "requestFreshAuthorized"
  );
  const requested = await Reflect.apply(
    request,
    harness.gateway,
    [harness.locator]
  );
  await appendIndependentResidentHumanApproval(
    harness.ledger,
    harness.locator,
    `decision-revalidation-${beforeKind}-${afterKind}`
  );
  observingDecision = true;
  const readDecision = reflectedOperation(
    harness.gateway,
    "readFreshHumanDecision"
  );
  const outcome = await settledOutcome(() => Reflect.apply(
    readDecision,
    harness.gateway,
    [requested]
  ));
  observingDecision = false;
  const residentEvents = await harness.ledger.readStream(
    residentDomainStreamId(harness.locator)
  );
  return {
    beforeKind,
    afterKind,
    outcome,
    trace,
    residentEventTypes: residentEvents.map((event) => event.type),
    effects: harness.effects.count
  };
}

async function settledOutcome(
  operation: () => unknown
): Promise<"fulfilled" | "rejected"> {
  try {
    await operation();
    return "fulfilled";
  } catch {
    return "rejected";
  }
}

async function settledResidentRecovery(
  operation: () => unknown
): Promise<{
  readonly outcome: "fulfilled" | "rejected";
  readonly message?: string;
}> {
  try {
    await operation();
    return { outcome: "fulfilled" };
  } catch (error) {
    return {
      outcome: "rejected",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function appendLegacyAssertionProposal(
  ledger: InMemoryEventLedger,
  source: KnowledgeEvent,
  suffix: string,
  candidateId: string,
  evidenceId: string,
  sourceCollectionId: string,
  scanBatchId: string,
  stagingBatchId: string,
  candidateSetHash: string
): Promise<KnowledgeEvent> {
  const assertionId = `as_legacy_${createHash("sha256").update([
    sourceCollectionId,
    scanBatchId,
    stagingBatchId,
    candidateSetHash,
    candidateId
  ].join(":")).digest("hex")}`;
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
      evidenceId,
      predicate: "legacy.gateway.fixture",
      object: candidateId,
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
      `legacy_staging_src_gateway_legacy_scan_gateway_legacy_legacy_stage_gateway_${suffix}`,
    context: residentEventContext(
      `evt_gateway_request_${suffix}`,
      `corr_gateway_domain_${suffix}`,
      humanActor
    ),
    payload: {
      stagingBatchId: `legacy_stage_gateway_${suffix}`,
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

function expectedToolGatewayReadback(
  fixture: GatewayFixture,
  request: KnowledgeEventOf<"agent.tool.requested">,
  stageFields: Partial<Pick<
    ResidentLoopToolGatewayReadback,
    | "decisionEventId"
    | "executionClaimEventId"
    | "resultEventId"
    | "approvedBy"
    | "resultEvidenceEventIds"
  >> = {}
): ResidentLoopToolGatewayReadback {
  return {
    schemaVersion: "resident-loop-tool-gateway-readback.v1",
    planRecordEventId: fixture.plan.event.id,
    requestEventId: request.id,
    ...stageFields,
    toolRequestId: "toolreq_gateway",
    residentAgentId: "agent_default",
    taskId: "task_gateway",
    attemptId:
      "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "run_gateway",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    previewHash: request.payload.previewHash,
    approvalClass: "ledger-review",
    policyHash: fixture.plan.event.payload.policyHash,
    authorityHash: fixture.plan.event.payload.authorityHash,
    sourceEventIds: fixture.plan.event.payload.sourceEventIds,
    contextArtifactHashes: fixture.plan.event.payload.contextArtifactHashes
  };
}

function requiredLegacyGatewayEvent<
  T extends "agent.tool.requested" | "agent.tool.completed"
>(
  events: readonly KnowledgeEvent[],
  type: T
): KnowledgeEventOf<T> {
  const event = events.find(
    (candidate): candidate is KnowledgeEventOf<T> => candidate.type === type
  );
  if (event === undefined) {
    throw new Error(`Resident-loop gateway fixture lacks ${type}.`);
  }
  return event;
}

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
  input: {
    readonly evidenceId: string;
    readonly causationId?: string;
    readonly contentHash?: `sha256:${string}`;
  }
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
      contentHash: input.contentHash ??
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
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
