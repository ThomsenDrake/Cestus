import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";

const actor = { id: "actor_resident_planner", kind: "agent" as const, label: "Cestus Agent" };
const now = () => "2026-07-13T20:00:00.000Z";

const identity = {
  residentAgentId: "agent_default" as const,
  taskId: "task_plan_observation_001",
  attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  runId: "run_plan_observation_001",
  policyId: "agent_policy_plan_observation",
  policyVersion: "1.0.0",
  policyHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  authorityHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  sourceEventIds: ["evt_plan_source_001"],
  contextArtifactHashes: ["sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
  budget: { maxSteps: 4, remainingSteps: 4, contextBytes: 512 },
  causationEventId: "evt_plan_causation_001",
  correlationId: "corr_plan_observation_001"
};

describe("resident plan/observation contracts", () => {
  it("appends and reads back an exact plan before recording a bound observation", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });

    const plan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });
    const observation = await store.recordObservation({
      identity,
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    });

    expect(plan.event).toMatchObject({
      type: "agent.resident-plan.recorded.v1",
      payload: { ...identity, planRevision: 1 }
    });
    expect(observation.event).toMatchObject({
      type: "agent.resident-observation.recorded.v1",
      payload: {
        ...identity,
        planReadback: {
          planRecordEventId: plan.event.id,
          taskId: identity.taskId,
          attemptId: identity.attemptId,
          runId: identity.runId
        },
        observationOrdinal: 1
      }
    });
    expect((await ledger.readStream(plan.event.streamId)).map((event) => event.id)).toEqual([
      plan.event.id,
      observation.event.id
    ]);
  });

  it("returns the exact plan readback for the same idempotency key without appending a duplicate", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const input = {
      identity,
      planRevision: 1,
      descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    };

    const first = await store.recordPlan(input);
    const replay = await store.recordPlan(input);

    expect(replay.event.id).toBe(first.event.id);
    expect((await ledger.readStream(first.event.streamId))).toHaveLength(1);
    await expect(store.recordPlan({
      ...input,
      descriptorHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    })).rejects.toThrow(/idempotency|plan/i);
    expect((await ledger.readStream(first.event.streamId))).toHaveLength(1);
  });

  it("rejects forged or cross-run plan provenance before appending an observation", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const plan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });
    const countBefore = (await ledger.readAll()).length;

    await expect(store.recordObservation({
      identity: { ...identity, runId: "run_plan_observation_other" },
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })).rejects.toThrow(/plan|run|provenance/i);
    await expect(store.recordObservation({
      identity: {
        ...identity,
        authorityHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      },
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })).rejects.toThrow(/plan|provenance/i);
    await expect(store.recordObservation({
      identity: { ...identity, sourceEventIds: ["evt_plan_source_other"] },
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })).rejects.toThrow(/plan|provenance/i);
    await expect(store.recordObservation({
      identity,
      planRecordEventId: "evt_forged_plan_readback",
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })).rejects.toThrow(/plan|readback|provenance/i);

    expect((await ledger.readAll())).toHaveLength(countBefore);
  });
});
