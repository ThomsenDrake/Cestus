import { describe, expect, it } from "vitest";
import { eventContracts, knowledgeEventSchema, validateKnowledgeEvent, validateResidentLoopEventSequence, type AppendableKnowledgeEvent } from "../src/contracts.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const context = {
  actor: { id: "actor_resident_agent", kind: "agent" as const, label: "Resident Agent" },
  occurredAt: "2026-07-13T18:00:00.000Z",
  causationId: "evt_admission_001",
  correlationId: "corr_resident_loop_001",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
};

function event(id: string, type: string, payload: Record<string, unknown>, sequence: number) {
  return {
    id,
    type,
    version: 1,
    streamId: "agent_resident_loop_task_001_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_001",
    sequence,
    context,
    payload
  };
}

const identity = {
  residentAgentId: "agent_default",
  taskId: "task_001",
  attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  runId: "run_001",
  policyId: "agent_policy_default",
  policyVersion: "v1",
  policyHash: hash,
  authorityHash: hash,
  sourceEventIds: ["evt_source_001"],
  contextArtifactHashes: [hash],
  budget: { maxSteps: 3, remainingSteps: 2, contextBytes: 1024 },
  causationEventId: "evt_admission_001",
  correlationId: "corr_resident_loop_001"
};

const planEventId = "evt_resident_plan_task_001_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_001";
const resultEventId = "evt_resident_result_task_001_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_001";

const plan = {
  ...identity,
  planRevision: 1,
  descriptorHash: hash
};

const planReadback = {
  planRecordEventId: planEventId,
  taskId: identity.taskId,
  attemptId: identity.attemptId,
  runId: identity.runId
};

function fixtureEvents() {
  return [
    event(planEventId, "agent.resident-plan.recorded.v1", plan, 1),
    event("evt_resident_observation_001", "agent.resident-observation.recorded.v1", {
      ...identity,
      planReadback,
      observationOrdinal: 1,
      category: "context-ready",
      observationHash: hash
    }, 2),
    event("evt_resident_step_001", "agent.resident-tool-step.recorded.v1", {
      ...identity,
      planReadback,
      stepOrdinal: 1,
      toolRequestId: "toolreq_001",
      toolId: "tool_read_workspace",
      toolVersion: "1.0.0",
      previewHash: hash,
      toolEventId: "evt_tool_requested_001"
    }, 3),
    event("evt_resident_suspended_001", "agent.resident-loop.suspended.v1", {
      ...identity,
      planReadback,
      finalObservationReadback: {
        observationEventId: "evt_resident_observation_001",
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        runId: identity.runId
      },
      suspensionCategory: "budget-exhausted",
      resumeIdempotencyKey: "resident-loop:run_001:resume"
    }, 4),
    event(resultEventId, "agent.resident-loop.result.recorded.v1", {
      ...identity,
      planReadback,
      finalObservationReadback: {
        observationEventId: "evt_resident_observation_001",
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        runId: identity.runId
      },
      outcome: "completed",
      resultHash: hash,
      terminalReadback: {
        finalObservationEventId: "evt_resident_observation_001",
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        runId: identity.runId
      }
    }, 5)
  ] as const;
}

const v2BudgetCeilings = {
  planRevisions: 4,
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

const v2HardMaximums = {
  planRevisions: 4,
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

const v2BudgetFields = [
  "planRevisions",
  "observationRecords",
  "toolSteps",
  "providerInvocations",
  "providerRequestBytes",
  "providerResponseBytes",
  "contextBytes",
  "derivativeArtifactBytes",
  "activeExecutionMs",
  "approvalSuspensionMs"
] as const;

type V2BudgetField = typeof v2BudgetFields[number];
type V2BudgetUsage = Record<V2BudgetField, number>;

function v2BudgetUsage(values: Partial<V2BudgetUsage> = {}): V2BudgetUsage {
  return Object.fromEntries(v2BudgetFields.map((field) => [field, values[field] ?? 0])) as V2BudgetUsage;
}

function v2BudgetSnapshot(consumed: V2BudgetUsage, actionConsumption: V2BudgetUsage) {
  return {
    ceilings: v2BudgetCeilings,
    consumed,
    remaining: Object.fromEntries(v2BudgetFields.map((field) => [field, v2BudgetCeilings[field] - consumed[field]])) as V2BudgetUsage,
    actionConsumption
  };
}

function advanceV2Budget(consumed: V2BudgetUsage, actionConsumption: V2BudgetUsage): V2BudgetUsage {
  return Object.fromEntries(v2BudgetFields.map((field) => [field, consumed[field] + actionConsumption[field]])) as V2BudgetUsage;
}

const v2Binding = {
  residentAgentId: "agent_default",
  workspaceId: "ws_001",
  taskId: "task_001",
  attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  runId: "run_001",
  runMode: "evidence-triage",
  workflowDescriptor: {
    workflowDescriptorId: "workflow_evidence_triage",
    workflowDescriptorVersion: "v1",
    workflowDescriptorHash: hash
  },
  policy: {
    policyId: "agent_policy_default",
    policyVersion: "v1",
    policyHash: hash
  },
  authority: {
    workspaceIdentityHash: hash,
    mountGeneration: "mount_001",
    ledgerStoreIdentity: "ledger_001",
    artifactStoreIdentity: "artifact_001",
    ledgerHighWaterEventId: "evt_source_002",
    policyHash: hash,
    activeLocksHash: hash
  },
  sourceEventIds: ["evt_source_001", "evt_source_002"],
  contextPackRefs: [
    { contextPackId: "context_pack_001", contentHash: hash },
    { contextPackId: "context_pack_002", contentHash: hash }
  ],
  causationId: "evt_admission_001",
  correlationId: "corr_resident_loop_001"
};

const v2PlanEventId = "evt_resident_v2_plan_task_001_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_001";
const v2ObservationEventId = "evt_resident_v2_observation_001";
const v2ToolStepEventId = "evt_resident_v2_step_001";
const v2SuspensionEventId = "evt_resident_v2_suspension_001";

const v2PlanReadback = {
  planRecordEventId: v2PlanEventId,
  workspaceId: v2Binding.workspaceId,
  residentAgentId: v2Binding.residentAgentId,
  taskId: v2Binding.taskId,
  attemptId: v2Binding.attemptId,
  runId: v2Binding.runId,
  planId: "plan_001",
  planRevision: 0
};

function v2FixtureEvents() {
  let consumed = v2BudgetUsage();
  const nextBudget = (actionConsumption: V2BudgetUsage) => {
    consumed = advanceV2Budget(consumed, actionConsumption);
    return v2BudgetSnapshot(consumed, actionConsumption);
  };
  const planBudget = nextBudget(v2BudgetUsage({ planRevisions: 1, contextBytes: 512 }));
  const observationBudget = nextBudget(v2BudgetUsage({
    observationRecords: 1,
    providerInvocations: 1,
    providerRequestBytes: 128,
    providerResponseBytes: 256
  }));
  const toolStepBudget = nextBudget(v2BudgetUsage({ toolSteps: 1, derivativeArtifactBytes: 1024 }));
  const suspensionBudget = nextBudget(v2BudgetUsage({ approvalSuspensionMs: 5 }));
  const resultBudget = nextBudget(v2BudgetUsage({ activeExecutionMs: 10 }));
  return [
    event(v2PlanEventId, "agent.resident-plan.recorded.v2", {
      ...v2Binding,
      budget: planBudget,
      schemaVersion: "resident-plan-record.v2",
      planId: "plan_001",
      planRevision: 0,
      priorPlanReadback: null,
      steps: [{
        ordinal: 1,
        purpose: "inspect evidence",
        toolId: "tool_read_workspace",
        toolVersion: "1.0.0",
        allowlistEntryHash: hash,
        expectedSafeOutputClass: "observation",
        prerequisiteStepOrdinals: []
      }, {
        ordinal: 2,
        purpose: "record the bounded observation",
        toolId: "tool_read_workspace",
        toolVersion: "1.0.0",
        allowlistEntryHash: hash,
        expectedSafeOutputClass: "observation",
        prerequisiteStepOrdinals: [1]
      }]
    }, 1),
    event(v2ObservationEventId, "agent.resident-observation.recorded.v2", {
      ...v2Binding,
      budget: observationBudget,
      schemaVersion: "resident-observation-record.v2",
      observationId: "observation_001",
      planId: "plan_001",
      planRevision: 0,
      planReadback: v2PlanReadback,
      stepOrdinal: 1,
      kind: "tool-result",
      safeSummary: "Evidence inspection completed.",
      artifactHashes: [hash],
      toolRequestId: "toolreq_001",
      modelInvocationEventId: "evt_invocation_001"
    }, 2),
    event(v2ToolStepEventId, "agent.resident-tool-step.recorded.v2", {
      ...v2Binding,
      budget: toolStepBudget,
      schemaVersion: "resident-tool-step-record.v2",
      planId: "plan_001",
      planRevision: 0,
      planReadback: v2PlanReadback,
      stepOrdinal: 1,
      toolRequestId: "toolreq_001",
      toolId: "tool_read_workspace",
      toolVersion: "1.0.0",
      allowlistEntryHash: hash,
      sideEffectClass: "read-only",
      requiredApprovalClass: "none",
      state: "executed",
      previewHash: hash,
      gatewayReadbacks: {
        requestEventId: "evt_tool_requested_001",
        decisionEventId: "evt_tool_approved_001",
        resultEventId: "evt_tool_completed_001"
      },
      inputArtifactHashes: [hash],
      resultArtifactHashes: [hash]
    }, 3),
    event(v2SuspensionEventId, "agent.resident-loop.suspended.v2", {
      ...v2Binding,
      budget: suspensionBudget,
      schemaVersion: "resident-loop-suspension.v2",
      planId: "plan_001",
      planRevision: 0,
      planReadback: v2PlanReadback,
      finalObservationReadback: {
        observationEventId: v2ObservationEventId,
        workspaceId: v2Binding.workspaceId,
        residentAgentId: v2Binding.residentAgentId,
        taskId: v2Binding.taskId,
        attemptId: v2Binding.attemptId,
        runId: v2Binding.runId,
        planId: "plan_001",
        planRevision: 0
      },
      suspensionCategory: "approval-required",
      checkpoint: {
        checkpointEventId: v2SuspensionEventId,
        requestEventId: "evt_tool_requested_001",
        decisionEventId: "evt_tool_approved_001",
        resumptionDeadlineAt: "2026-07-14T18:00:00.000Z",
        nextSafeAction: "await-human-review"
      }
    }, 4),
    event("evt_resident_v2_result_001", "agent.resident-loop.result.recorded.v2", {
      ...v2Binding,
      budget: resultBudget,
      schemaVersion: "resident-loop-result.v2",
      planId: "plan_001",
      planRevision: 0,
      planReadback: v2PlanReadback,
      finalObservationReadback: {
        observationEventId: v2ObservationEventId,
        workspaceId: v2Binding.workspaceId,
        residentAgentId: v2Binding.residentAgentId,
        taskId: v2Binding.taskId,
        attemptId: v2Binding.attemptId,
        runId: v2Binding.runId,
        planId: "plan_001",
        planRevision: 0
      },
      outcome: "completed",
      category: "handoff-recorded",
      resultHash: hash,
      handoffReadback: {
        outcome: "verified",
        handoffId: "handoff_001_1111111111111111",
        taskId: v2Binding.taskId,
        runId: v2Binding.runId,
        manifestSchemaVersion: "agent-specialist-handoff-manifest.v2",
        manifestHash: hash,
        finalOutputStepId: "step_run_001_final_output",
        finalOutputEventId: "evt_final_output_001",
        preparedEventId: "evt_handoff_prepared_001",
        recordedEventId: "evt_handoff_recorded_001",
        terminalRunEventId: "evt_run_completed_001",
        taskStatusEventId: "evt_task_completed_001",
        authorityBinding: v2Binding.authority,
        diagnostics: [{
          category: "terminal-status-conflict",
          retry: "after-review",
          safeMessage: "Review the verified handoff state.",
          eventIds: ["evt_handoff_recorded_001"],
          artifactHashes: [hash]
        }]
      }
    }, 5)
  ] as const;
}

function v2ReplayWithPlanRecords(planRecordCount: number) {
  const [basePlan, baseObservation, baseToolStep, baseSuspension, baseResult] = v2FixtureEvents();
  const replay: ReturnType<typeof v2FixtureEvents>[number][] = [];
  let consumed = v2BudgetUsage();
  const nextBudget = (actionConsumption: V2BudgetUsage) => {
    consumed = advanceV2Budget(consumed, actionConsumption);
    return v2BudgetSnapshot(consumed, actionConsumption);
  };
  let priorPlanEventId: string | undefined;
  let finalPlanReadback: Record<string, unknown> | undefined;
  let finalObservationReadback: Record<string, unknown> | undefined;

  for (let planRevision = 0; planRevision < planRecordCount; planRevision += 1) {
    const planEventId = planRevision === 0 ? v2PlanEventId : `evt_resident_v2_plan_${planRevision + 1}`;
    const planReadback = {
      ...v2PlanReadback,
      planRecordEventId: planEventId,
      planRevision
    };
    replay.push(event(planEventId, "agent.resident-plan.recorded.v2", {
      ...basePlan.payload,
      budget: nextBudget(v2BudgetUsage({
        planRevisions: 1,
        ...(planRevision === 0 ? { contextBytes: 512 } : {})
      })),
      planRevision,
      priorPlanReadback: priorPlanEventId === undefined ? null : {
        ...v2PlanReadback,
        planRecordEventId: priorPlanEventId,
        priorPlanRecordEventId: priorPlanEventId,
        planRevision: planRevision - 1
      }
    }, replay.length + 1));
    replay.push(event(`evt_resident_v2_observation_${planRevision + 1}`, "agent.resident-observation.recorded.v2", {
      ...baseObservation.payload,
      budget: nextBudget(v2BudgetUsage({
        observationRecords: 1,
        ...(planRevision === 0 ? {
          providerInvocations: 1,
          providerRequestBytes: 128,
          providerResponseBytes: 256
        } : {})
      })),
      observationId: `observation_${planRevision + 1}`,
      planRevision,
      planReadback
    }, replay.length + 1));
    const observationEvent = replay[replay.length - 1]!;
    replay.push(event(`evt_resident_v2_step_${planRevision + 1}`, "agent.resident-tool-step.recorded.v2", {
      ...baseToolStep.payload,
      budget: nextBudget(v2BudgetUsage({
        toolSteps: 1,
        ...(planRevision === 0 ? { derivativeArtifactBytes: 1024 } : {})
      })),
      planRevision,
      planReadback
    }, replay.length + 1));
    priorPlanEventId = planEventId;
    finalPlanReadback = planReadback;
    finalObservationReadback = {
      observationEventId: observationEvent.id,
      workspaceId: v2Binding.workspaceId,
      residentAgentId: v2Binding.residentAgentId,
      taskId: v2Binding.taskId,
      attemptId: v2Binding.attemptId,
      runId: v2Binding.runId,
      planId: "plan_001",
      planRevision
    };
  }

  const suspensionEventId = `evt_resident_v2_suspension_${planRecordCount}`;
  replay.push(event(suspensionEventId, "agent.resident-loop.suspended.v2", {
    ...baseSuspension.payload,
    budget: nextBudget(v2BudgetUsage({ approvalSuspensionMs: 5 })),
    planRevision: planRecordCount - 1,
    planReadback: finalPlanReadback,
    finalObservationReadback,
    checkpoint: {
      ...(baseSuspension.payload.checkpoint as Record<string, unknown>),
      checkpointEventId: suspensionEventId
    }
  }, replay.length + 1));
  replay.push(event(`evt_resident_v2_result_${planRecordCount}`, "agent.resident-loop.result.recorded.v2", {
    ...baseResult.payload,
    budget: nextBudget(v2BudgetUsage({ activeExecutionMs: 10 })),
    planRevision: planRecordCount - 1,
    planReadback: finalPlanReadback,
    finalObservationReadback
  }, replay.length + 1));
  return replay;
}

function expectValid(candidate: ReturnType<typeof fixtureEvents>[number]) {
  const parsed = validateKnowledgeEvent(candidate);
  expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
}

describe("resident loop ontology contracts", () => {
  it("registers exactly the five frozen resident-loop event contracts", () => {
    expect(Object.keys(eventContracts)).toEqual(expect.arrayContaining([
      "agent.resident-plan.recorded.v1",
      "agent.resident-observation.recorded.v1",
      "agent.resident-tool-step.recorded.v1",
      "agent.resident-loop.suspended.v1",
      "agent.resident-loop.result.recorded.v1"
    ]));

    for (const candidate of fixtureEvents()) {
      expectValid(candidate);
    }
  });

  it.each([
    ["unknown field", (candidate: ReturnType<typeof fixtureEvents>[number]) => ({ ...candidate, payload: { ...candidate.payload, extra: true } })],
    ["missing identity", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { residentAgentId: _residentAgentId, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing policy", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { policyHash: _policyHash, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing authority", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { authorityHash: _authorityHash, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing source", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { sourceEventIds: _sourceEventIds, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing context", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { contextArtifactHashes: _contextArtifactHashes, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing budget", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { budget: _budget, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing causation", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { causationEventId: _causationEventId, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }],
    ["missing correlation", (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { correlationId: _correlationId, ...payload } = candidate.payload;
      return { ...candidate, payload };
    }]
  ])("rejects a resident loop payload with %s", (_name, mutate) => {
    for (const candidate of fixtureEvents()) {
      expect(validateKnowledgeEvent(mutate(candidate)).success).toBe(false);
    }
  });

  it("rejects forged plan readback, cross-run identity, unsafe own-data, and a terminal-looking result without readback", () => {
    const [planEvent, observation, step, suspended, result] = fixtureEvents();
    expect(validateKnowledgeEvent({
      ...step,
      payload: { ...step.payload, planReadback: { ...planReadback, runId: "run_other" } }
    }).success).toBe(false);
    const inherited = Object.create(planEvent.payload) as Record<string, unknown>;
    expect(validateKnowledgeEvent({ ...planEvent, payload: inherited }).success).toBe(false);
    const sourceEventIdsWithHiddenField = [...identity.sourceEventIds];
    Object.defineProperty(sourceEventIdsWithHiddenField, "hidden", {
      value: "unexpected",
      enumerable: false
    });
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, sourceEventIds: sourceEventIdsWithHiddenField }
    }).success).toBe(false);
    const sourceEventIdsWithSymbol = [...identity.sourceEventIds];
    Object.defineProperty(sourceEventIdsWithSymbol, Symbol("hidden"), { value: "unexpected" });
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, sourceEventIds: sourceEventIdsWithSymbol }
    }).success).toBe(false);
    const sourceEventIdsWithAccessor = [...identity.sourceEventIds];
    Object.defineProperty(sourceEventIdsWithAccessor, "unexpected", {
      enumerable: true,
      get: () => "unexpected"
    });
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, sourceEventIds: sourceEventIdsWithAccessor }
    }).success).toBe(false);
    const sourceEventIdsWithCustomPrototype = [...identity.sourceEventIds];
    Object.setPrototypeOf(sourceEventIdsWithCustomPrototype, { unexpected: true });
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, sourceEventIds: sourceEventIdsWithCustomPrototype }
    }).success).toBe(false);
    const payloadWithThrowingAccessor = { ...planEvent.payload };
    Object.defineProperty(payloadWithThrowingAccessor, "unexpected", {
      enumerable: true,
      get: () => {
        throw new Error("payload accessor must not run");
      }
    });
    expect(() => validateKnowledgeEvent({ ...planEvent, payload: payloadWithThrowingAccessor })).not.toThrow();
    expect(validateKnowledgeEvent({ ...planEvent, payload: payloadWithThrowingAccessor }).success).toBe(false);
    let payloadAccessorCalls = 0;
    const eventWithThrowingPayloadAccessor = { ...planEvent } as Record<string, unknown>;
    Object.defineProperty(eventWithThrowingPayloadAccessor, "payload", {
      enumerable: true,
      get: () => {
        payloadAccessorCalls += 1;
        throw new Error("top-level payload accessor must not run");
      }
    });
    const accessorResult = validateKnowledgeEvent(eventWithThrowingPayloadAccessor);
    expect(accessorResult.success).toBe(false);
    expect(payloadAccessorCalls).toBe(0);

    const payloadWithReflectiveTrap = new Proxy({ ...planEvent.payload }, {
      ownKeys: () => {
        throw new Error("payload reflection must not escape validation");
      }
    });
    expect(() => validateKnowledgeEvent({ ...planEvent, payload: payloadWithReflectiveTrap })).not.toThrow();
    expect(validateKnowledgeEvent({ ...planEvent, payload: payloadWithReflectiveTrap }).success).toBe(false);
    const { terminalReadback: _terminalReadback, ...withoutTerminalReadback } = result.payload;
    expect(validateKnowledgeEvent({ ...result, payload: withoutTerminalReadback }).success).toBe(false);
    expectValid(suspended);
  });

  it("rejects sparse, boxed, custom-prototype, and nested accessor data without reading getters", () => {
    const [planEvent] = fixtureEvents();
    const sparseSourceEventIds = new Array(2) as string[];
    sparseSourceEventIds[0] = identity.sourceEventIds[0]!;
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, sourceEventIds: sparseSourceEventIds }
    }).success).toBe(false);

    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, policyHash: new String(identity.policyHash) }
    }).success).toBe(false);

    const budgetWithCustomPrototype = { ...identity.budget };
    Object.setPrototypeOf(budgetWithCustomPrototype, { inherited: true });
    expect(validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, budget: budgetWithCustomPrototype }
    }).success).toBe(false);

    let nestedAccessorCalls = 0;
    const budgetWithThrowingAccessor = { ...identity.budget };
    Object.defineProperty(budgetWithThrowingAccessor, "remainingSteps", {
      enumerable: true,
      get: () => {
        nestedAccessorCalls += 1;
        throw new Error("nested payload accessor must not run");
      }
    });
    const nestedAccessorResult = validateKnowledgeEvent({
      ...planEvent,
      payload: { ...planEvent.payload, budget: budgetWithThrowingAccessor }
    });
    expect(nestedAccessorResult.success).toBe(false);
    expect(nestedAccessorCalls).toBe(0);
  });

  it("makes the exported schema reject untrusted payload shapes without executing them", () => {
    const [planEvent] = fixtureEvents();
    let topLevelAccessorCalls = 0;
    const eventWithThrowingPayloadAccessor = { ...planEvent } as Record<string, unknown>;
    Object.defineProperty(eventWithThrowingPayloadAccessor, "payload", {
      enumerable: true,
      get: () => {
        topLevelAccessorCalls += 1;
        throw new Error("exported schema payload accessor must not run");
      }
    });
    let topLevelResult: ReturnType<typeof knowledgeEventSchema.safeParse> | undefined;
    expect(() => {
      topLevelResult = knowledgeEventSchema.safeParse(eventWithThrowingPayloadAccessor);
    }).not.toThrow();
    expect(topLevelResult?.success).toBe(false);
    expect(topLevelAccessorCalls).toBe(0);

    let nestedAccessorCalls = 0;
    const budgetWithThrowingAccessor = { ...identity.budget };
    Object.defineProperty(budgetWithThrowingAccessor, "remainingSteps", {
      enumerable: true,
      get: () => {
        nestedAccessorCalls += 1;
        throw new Error("exported schema nested accessor must not run");
      }
    });
    let nestedResult: ReturnType<typeof knowledgeEventSchema.safeParse> | undefined;
    expect(() => {
      nestedResult = knowledgeEventSchema.safeParse({
        ...planEvent,
        payload: { ...planEvent.payload, budget: budgetWithThrowingAccessor }
      });
    }).not.toThrow();
    expect(nestedResult?.success).toBe(false);
    expect(nestedAccessorCalls).toBe(0);

    const payloadWithReflectiveTrap = new Proxy({ ...planEvent.payload }, {
      ownKeys: () => {
        throw new Error("exported schema reflection trap must not escape");
      }
    });
    let reflectiveResult: ReturnType<typeof knowledgeEventSchema.safeParse> | undefined;
    expect(() => {
      reflectiveResult = knowledgeEventSchema.safeParse({ ...planEvent, payload: payloadWithReflectiveTrap });
    }).not.toThrow();
    expect(reflectiveResult?.success).toBe(false);
  });

  it("appends and replays the ordered five-event fixture through the ledger", async () => {
    const ledger = new InMemoryEventLedger();
    const [planFixture, observationFixture, stepFixture, suspendedFixture, resultFixture] = fixtureEvents();
    const appendable = (candidate: ReturnType<typeof fixtureEvents>[number]) => {
      const { id: _id, sequence: _sequence, ...rest } = candidate;
      return rest as unknown as AppendableKnowledgeEvent;
    };
    const planEvent = await ledger.append(appendable(planFixture));
    const observationEvent = await ledger.append(appendable({
      ...observationFixture,
      payload: { ...observationFixture.payload, planReadback: { ...planReadback, planRecordEventId: planEvent.id } }
    }));
    const stepEvent = await ledger.append(appendable({
      ...stepFixture,
      payload: { ...stepFixture.payload, planReadback: { ...planReadback, planRecordEventId: planEvent.id } }
    }));
    const suspendedEvent = await ledger.append(appendable({
      ...suspendedFixture,
      payload: {
        ...suspendedFixture.payload,
        planReadback: { ...planReadback, planRecordEventId: planEvent.id },
        finalObservationReadback: {
          ...(suspendedFixture.payload.finalObservationReadback as Record<string, unknown>),
          observationEventId: observationEvent.id
        }
      }
    }));
    const resultEvent = await ledger.append(appendable({
      ...resultFixture,
      payload: {
        ...resultFixture.payload,
        planReadback: { ...planReadback, planRecordEventId: planEvent.id },
        finalObservationReadback: {
          ...(resultFixture.payload.finalObservationReadback as Record<string, unknown>),
          observationEventId: observationEvent.id
        },
        terminalReadback: {
          ...(resultFixture.payload.terminalReadback as Record<string, unknown>),
          finalObservationEventId: observationEvent.id
        }
      }
    }));

    const replay = await ledger.readStream(planEvent.streamId);
    expect(replay.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(replay.map((event) => event.id)).toEqual([planEvent.id, observationEvent.id, stepEvent.id, suspendedEvent.id, resultEvent.id]);
    expect(validateResidentLoopEventSequence(replay).success).toBe(true);
    expect(validateResidentLoopEventSequence([
      ...replay.slice(0, 1),
      { ...replay[1]!, payload: { ...replay[1]!.payload, planReadback: { ...planReadback, planRecordEventId: "evt_forged_plan" } } },
      ...replay.slice(2)
    ] as unknown as typeof replay).success).toBe(false);
  });
});

describe("resident loop ontology contracts v2", () => {
  it("preserves accepted v1 replay while requiring the complete strict v2 five-event family", () => {
    for (const candidate of fixtureEvents()) {
      expectValid(candidate);
    }

    expect(Object.keys(eventContracts)).toEqual(expect.arrayContaining([
      "agent.resident-plan.recorded.v2",
      "agent.resident-observation.recorded.v2",
      "agent.resident-tool-step.recorded.v2",
      "agent.resident-loop.suspended.v2",
      "agent.resident-loop.result.recorded.v2"
    ]));

    const replay = v2FixtureEvents();
    for (const candidate of replay) {
      expectValid(candidate);
    }
    expect(validateResidentLoopEventSequence(replay as never).success).toBe(true);
  });

  it("replays durable budget progression through a fourth plan record and rejects an over-limit revision", () => {
    expect(validateResidentLoopEventSequence(v2ReplayWithPlanRecords(4) as never).success).toBe(true);
    expect(validateResidentLoopEventSequence(v2ReplayWithPlanRecords(5) as never).success).toBe(false);
  });

  it.each([
    ["observation", 1, "observationRecords"],
    ["tool step", 2, "toolSteps"],
    ["result", 4, "activeExecutionMs"]
  ] as const)("rejects a v2 replay with missing %s budget consumption", (_label, index, field) => {
    const replay = v2FixtureEvents();
    expect(validateResidentLoopEventSequence(replay as never).success).toBe(true);
    const candidate = replay[index]!;
    const budget = candidate.payload.budget as {
      actionConsumption: Record<string, number>;
    };
    expect(validateResidentLoopEventSequence([
      ...replay.slice(0, index),
      {
        ...candidate,
        payload: {
          ...candidate.payload,
          budget: {
            ...budget,
            actionConsumption: { ...budget.actionConsumption, [field]: 0 }
          }
        }
      },
      ...replay.slice(index + 1)
    ] as never).success).toBe(false);
  });

  function resumableV2Replay() {
    const replay = v2FixtureEvents();
    const result = replay[4]!;
    const { handoffReadback: _handoffReadback, ...withoutHandoff } = result.payload;
    return [
      ...replay.slice(0, 4),
      {
        ...result,
        payload: {
          ...withoutHandoff,
          outcome: "resumable",
          category: "approval-required",
          resumeAnchor: {
            checkpointEventId: v2SuspensionEventId,
            resumptionDeadlineAt: "2026-07-14T18:00:00.000Z",
            nextSafeAction: "await-human-review"
          }
        }
      }
    ];
  }

  it.each([
    ["checkpoint", { checkpointEventId: "evt_unrelated_checkpoint_001" }],
    ["deadline", { resumptionDeadlineAt: "2026-07-15T18:00:00.000Z" }],
    ["next action", { nextSafeAction: "retry-unrelated-action" }]
  ] as const)("rejects a resumable result anchored to an unrelated suspension %s", (_label, mutate) => {
    const replay = resumableV2Replay();
    expect(validateResidentLoopEventSequence(replay as never).success).toBe(true);
    const result = replay[4]!;
    expect(validateResidentLoopEventSequence([
      ...replay.slice(0, 4),
      {
        ...result,
        payload: {
          ...result.payload,
          resumeAnchor: {
            ...(result.payload.resumeAnchor as Record<string, unknown>),
            ...mutate
          }
        }
      }
    ] as never).success).toBe(false);
  });

  it.each([
    ["authority-stale", "resumable", "failed"],
    ["context-stale", "resumable", "failed"],
    ["allowlist-mismatch", "failed", "resumable"],
    ["provenance-missing", "failed", "resumable"],
    ["secret-detected", "failed", "resumable"]
  ] as const)("exposes a safe %s category only for its permitted outcome", (category, validOutcome, invalidOutcome) => {
    const result = v2FixtureEvents()[4]!;
    const { handoffReadback: _handoffReadback, ...withoutHandoff } = result.payload;
    const resumableAnchor = {
      checkpointEventId: v2SuspensionEventId,
      resumptionDeadlineAt: "2026-07-14T18:00:00.000Z",
      nextSafeAction: "await-human-review"
    };
    expect(validateKnowledgeEvent({
      ...result,
      payload: {
        ...withoutHandoff,
        outcome: validOutcome,
        category,
        ...(validOutcome === "resumable" ? { resumeAnchor: resumableAnchor } : {})
      }
    }).success).toBe(true);
    expect(validateKnowledgeEvent({
      ...result,
      payload: {
        ...withoutHandoff,
        outcome: invalidOutcome,
        category,
        ...(invalidOutcome === "resumable" ? { resumeAnchor: resumableAnchor } : {})
      }
    }).success).toBe(false);
  });

  it.each(Object.entries(v2HardMaximums))(
    "rejects a %s ceiling above its hard maximum even when accounting is conserved",
    (field, hardMaximum) => {
      const [plan] = v2FixtureEvents();
      const candidate = {
        ...plan,
        payload: {
          ...plan.payload,
          budget: {
            ...(plan.payload.budget as Record<string, unknown>),
            ceilings: {
              ...((plan.payload.budget as { ceilings: Record<string, unknown> }).ceilings),
              [field]: hardMaximum + 1
            },
            consumed: {
              ...((plan.payload.budget as { consumed: Record<string, unknown> }).consumed),
              [field]: 0
            },
            remaining: {
              ...((plan.payload.budget as { remaining: Record<string, unknown> }).remaining),
              [field]: hardMaximum + 1
            }
          }
        }
      };
      expect(validateKnowledgeEvent(candidate).success).toBe(false);
    }
  );

  it.each([
    ["failed handoff-recorded", "failed", "handoff-recorded", undefined],
    ["resumable validation-failed", "resumable", "validation-failed", {
      checkpointEventId: v2SuspensionEventId,
      nextSafeAction: "repair-the-safe-boundary",
      resumptionDeadlineAt: "2026-07-15T18:00:00.000Z"
    }],
    ["failed approval-required", "failed", "approval-required", undefined]
  ] as const)("rejects an invalid %s outcome/category pair", (_label, outcome, category, resumeAnchor) => {
    const result = v2FixtureEvents()[4]!;
    const { handoffReadback: _handoffReadback, ...withoutHandoff } = result.payload;
    expect(validateKnowledgeEvent({
      ...result,
      payload: {
        ...withoutHandoff,
        outcome,
        category,
        ...(resumeAnchor === undefined ? {} : { resumeAnchor })
      }
    }).success).toBe(false);
  });

  it.each([
    ["undeclared ordinal", (replay: ReturnType<typeof v2FixtureEvents>) => [
      ...replay.slice(0, 2),
      { ...replay[2]!, payload: { ...replay[2]!.payload, stepOrdinal: 3 } },
      ...replay.slice(3)
    ]],
    ["declared ordinal with swapped tool binding", (replay: ReturnType<typeof v2FixtureEvents>) => [
      ...replay.slice(0, 2),
      { ...replay[2]!, payload: { ...replay[2]!.payload, toolId: "tool_other_workspace" } },
      ...replay.slice(3)
    ]],
    ["declared ordinal with swapped allowlist entry", (replay: ReturnType<typeof v2FixtureEvents>) => [
      ...replay.slice(0, 2),
      { ...replay[2]!, payload: { ...replay[2]!.payload, allowlistEntryHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" } },
      ...replay.slice(3)
    ]]
  ])("rejects a replayed tool step with %s", (_label, mutate) => {
    expect(validateResidentLoopEventSequence(mutate(v2FixtureEvents()) as never).success).toBe(false);
  });

  it.each([
    ["self prerequisite", (steps: Record<string, unknown>[]) => [
      { ...steps[0]!, prerequisiteStepOrdinals: [1] },
      steps[1]!
    ]],
    ["future prerequisite", (steps: Record<string, unknown>[]) => [
      { ...steps[0]!, prerequisiteStepOrdinals: [2] },
      steps[1]!
    ]],
    ["missing prerequisite", (steps: Record<string, unknown>[]) => [
      { ...steps[0]!, prerequisiteStepOrdinals: [99] },
      steps[1]!
    ]]
  ])("rejects a plan with a %s", (_label, mutate) => {
    const [plan] = v2FixtureEvents();
    expect(validateKnowledgeEvent({
      ...plan,
      payload: {
        ...plan.payload,
        steps: mutate(plan.payload.steps as Record<string, unknown>[])
      }
    }).success).toBe(false);
  });

  it.each([
    ["manifest schema version", (handoff: Record<string, unknown>) => {
      const { manifestSchemaVersion: _manifestSchemaVersion, ...narrow } = handoff;
      return narrow;
    }],
    ["final output step ID", (handoff: Record<string, unknown>) => {
      const { finalOutputStepId: _finalOutputStepId, ...narrow } = handoff;
      return narrow;
    }],
    ["H diagnostics", (handoff: Record<string, unknown>) => {
      const { diagnostics: _diagnostics, ...narrow } = handoff;
      return narrow;
    }],
    ["H diagnostic retry", (handoff: Record<string, unknown>) => ({
      ...handoff,
      diagnostics: (handoff.diagnostics as Record<string, unknown>[]).map((diagnostic) => {
        const { retry: _retry, ...narrow } = diagnostic;
        return narrow;
      })
    })],
    ["H diagnostic event IDs", (handoff: Record<string, unknown>) => ({
      ...handoff,
      diagnostics: (handoff.diagnostics as Record<string, unknown>[]).map((diagnostic) => {
        const { eventIds: _eventIds, ...narrow } = diagnostic;
        return narrow;
      })
    })],
    ["H diagnostic artifact hashes", (handoff: Record<string, unknown>) => ({
      ...handoff,
      diagnostics: (handoff.diagnostics as Record<string, unknown>[]).map((diagnostic) => {
        const { artifactHashes: _artifactHashes, ...narrow } = diagnostic;
        return narrow;
      })
    })],
    ["forged local safeDiagnostics proxy", (handoff: Record<string, unknown>) => {
      const { diagnostics: _diagnostics, manifestSchemaVersion: _manifestSchemaVersion, finalOutputStepId: _finalOutputStepId, ...narrow } = handoff;
      return { ...narrow, safeDiagnostics: [{ category: "handoff-recorded", nextSafeAction: "review-handoff" }] };
    }]
  ])("rejects a completed result with a narrowed %s H substitute", (_label, mutate) => {
    const result = v2FixtureEvents()[4]!;
    expect(validateKnowledgeEvent({
      ...result,
      payload: {
        ...result.payload,
        handoffReadback: mutate(result.payload.handoffReadback as Record<string, unknown>)
      }
    }).success).toBe(false);
  });

  it.each([
    ["plan missing workspace identity", 0, (candidate: Record<string, unknown>) => {
      const { workspaceId: _workspaceId, ...payload } = candidate;
      return payload;
    }],
    ["plan missing descriptor binding", 0, (candidate: Record<string, unknown>) => {
      const { workflowDescriptor: _workflowDescriptor, ...payload } = candidate;
      return payload;
    }],
    ["plan missing policy binding", 0, (candidate: Record<string, unknown>) => {
      const { policy: _policy, ...payload } = candidate;
      return payload;
    }],
    ["plan mismatched authority policy", 0, (candidate: Record<string, unknown>) => ({
      ...candidate,
      authority: { ...(candidate.authority as Record<string, unknown>), policyHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222" }
    })],
    ["plan malformed ten-counter accounting", 0, (candidate: Record<string, unknown>) => ({
      ...candidate,
      budget: {
        ...(candidate.budget as Record<string, unknown>),
        remaining: { ...((candidate.budget as { remaining: Record<string, unknown> }).remaining), toolSteps: 10 }
      }
    })],
    ["observation missing plan readback", 1, (candidate: Record<string, unknown>) => {
      const { planReadback: _planReadback, ...payload } = candidate;
      return payload;
    }],
    ["observation changed plan identity", 1, (candidate: Record<string, unknown>) => ({
      ...candidate,
      planReadback: { ...(candidate.planReadback as Record<string, unknown>), planId: "plan_other" }
    })],
    ["tool step missing exact allowlist binding", 2, (candidate: Record<string, unknown>) => {
      const { allowlistEntryHash: _allowlistEntryHash, ...payload } = candidate;
      return payload;
    }],
    ["tool step missing preview binding", 2, (candidate: Record<string, unknown>) => {
      const { previewHash: _previewHash, ...payload } = candidate;
      return payload;
    }],
    ["tool step missing durable gateway readback", 2, (candidate: Record<string, unknown>) => {
      const { gatewayReadbacks: _gatewayReadbacks, ...payload } = candidate;
      return payload;
    }],
    ["suspension missing durable checkpoint", 3, (candidate: Record<string, unknown>) => {
      const { checkpoint: _checkpoint, ...payload } = candidate;
      return payload;
    }],
    ["suspension changed final-observation identity", 3, (candidate: Record<string, unknown>) => ({
      ...candidate,
      finalObservationReadback: {
        ...(candidate.finalObservationReadback as Record<string, unknown>),
        runId: "run_other"
      }
    })],
    ["completed result missing complete H readback", 4, (candidate: Record<string, unknown>) => {
      const { handoffReadback: _handoffReadback, ...payload } = candidate;
      return payload;
    }],
    ["completed result with incomplete H lifecycle proof", 4, (candidate: Record<string, unknown>) => ({
      ...candidate,
      handoffReadback: {
        ...(candidate.handoffReadback as Record<string, unknown>),
        terminalRunEventId: undefined
      }
    })],
    ["resumable result without resume anchor", 4, (candidate: Record<string, unknown>) => {
      const { handoffReadback: _handoffReadback, ...payload } = candidate;
      return { ...payload, outcome: "resumable", category: "approval-required" };
    }]
  ])("rejects %s", (_label, index, mutate) => {
    const candidate = v2FixtureEvents()[index]!;
    expect(validateKnowledgeEvent({ ...candidate, payload: mutate(candidate.payload) }).success).toBe(false);
  });

  it("rejects unknown and unsafe own-data v2 input without reading an accessor", () => {
    const [plan] = v2FixtureEvents();
    expect(validateKnowledgeEvent({ ...plan, payload: { ...plan.payload, unexpected: true } }).success).toBe(false);

    const payloadWithAccessor = { ...plan.payload };
    let accessorCalls = 0;
    Object.defineProperty(payloadWithAccessor, "unexpected", {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        throw new Error("v2 accessor must not run");
      }
    });
    expect(validateKnowledgeEvent({ ...plan, payload: payloadWithAccessor }).success).toBe(false);
    expect(accessorCalls).toBe(0);
  });
});
