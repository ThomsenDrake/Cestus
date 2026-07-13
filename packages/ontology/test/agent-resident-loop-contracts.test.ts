import { describe, expect, it } from "vitest";
import { eventContracts, validateKnowledgeEvent } from "../src/contracts.js";

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const context = {
  actor: { id: "actor_resident_agent", kind: "agent" as const, label: "Resident Agent" },
  occurredAt: "2026-07-13T18:00:00.000Z",
  causationId: "evt_admission_001",
  correlationId: "corr_resident_loop_001",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0", agent: "0.1.0" }
};

function event(id: string, type: string, payload: Record<string, unknown>) {
  return {
    id,
    type,
    version: 1,
    streamId: "agent_resident_loop_task_001_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_run_001",
    sequence: 1,
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
  descriptorHash: hash,
  planRecordEventId: planEventId
};

const planReadback = {
  planRecordEventId: planEventId,
  taskId: identity.taskId,
  attemptId: identity.attemptId,
  runId: identity.runId
};

function fixtureEvents() {
  return [
    event(planEventId, "agent.resident-plan.recorded.v1", plan),
    event("evt_resident_observation_001", "agent.resident-observation.recorded.v1", {
      ...identity,
      planReadback,
      observationOrdinal: 1,
      category: "context-ready",
      observationHash: hash
    }),
    event("evt_resident_step_001", "agent.resident-tool-step.recorded.v1", {
      ...identity,
      planReadback,
      stepOrdinal: 1,
      toolRequestId: "toolreq_001",
      toolId: "tool_read_workspace",
      toolVersion: "1.0.0",
      previewHash: hash,
      toolEventId: "evt_tool_requested_001"
    }),
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
    }),
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
        resultEventId,
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        runId: identity.runId
      }
    })
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
      ...observation,
      payload: { ...observation.payload, planReadback: { ...planReadback, planRecordEventId: "evt_forged_plan_001" } }
    }).success).toBe(false);
    expect(validateKnowledgeEvent({
      ...step,
      payload: { ...step.payload, planReadback: { ...planReadback, runId: "run_other" } }
    }).success).toBe(false);
    const inherited = Object.create(planEvent.payload) as Record<string, unknown>;
    expect(validateKnowledgeEvent({ ...planEvent, payload: inherited }).success).toBe(false);
    const { terminalReadback: _terminalReadback, ...withoutTerminalReadback } = result.payload;
    expect(validateKnowledgeEvent({ ...result, payload: withoutTerminalReadback }).success).toBe(false);
    expectValid(suspended);
  });
});
