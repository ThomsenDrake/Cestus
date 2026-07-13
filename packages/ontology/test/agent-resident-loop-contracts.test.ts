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
