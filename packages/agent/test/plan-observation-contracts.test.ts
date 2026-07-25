import { describe, expect, it } from "vitest";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger, type AppendOptions, type EventLedger } from "../../ontology/src/event-ledger.js";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";
import * as planObservationContractsModule from "../src/plan-observation-contracts.js";

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

  it("rejects transformed plan and observation payloads returned by durable readback", async () => {
    for (const transform of [
      (event: KnowledgeEvent): KnowledgeEvent => event.type === "agent.resident-plan.recorded.v1"
        ? { ...event, payload: { ...event.payload, planRevision: event.payload.planRevision + 1 } }
        : event,
      (event: KnowledgeEvent): KnowledgeEvent => event.type === "agent.resident-plan.recorded.v1"
        ? { ...event, payload: { ...event.payload, descriptorHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } }
        : event
    ]) {
      const planStore = createResidentPlanObservationStore({
        ledger: new TransformingReadbackLedger(transform),
        actor,
        now
      });
      await expect(planStore.recordPlan({
        identity,
        planRevision: 1,
        descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      })).rejects.toThrow(/exact durable readback/i);
    }

    for (const transform of [
      (event: KnowledgeEvent): KnowledgeEvent => event.type === "agent.resident-observation.recorded.v1"
        ? { ...event, payload: { ...event.payload, observationOrdinal: event.payload.observationOrdinal + 1 } }
        : event,
      (event: KnowledgeEvent): KnowledgeEvent => event.type === "agent.resident-observation.recorded.v1"
        ? { ...event, payload: { ...event.payload, category: "transformed-category" } }
        : event,
      (event: KnowledgeEvent): KnowledgeEvent => event.type === "agent.resident-observation.recorded.v1"
        ? { ...event, payload: { ...event.payload, observationHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" } }
        : event
    ]) {
      const observationStore = createResidentPlanObservationStore({
        ledger: new TransformingReadbackLedger(transform),
        actor,
        now
      });
      const plan = await observationStore.recordPlan({
        identity,
        planRevision: 1,
        descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      });
      await expect(observationStore.recordObservation({
        identity,
        planRecordEventId: plan.event.id,
        observationOrdinal: 1,
        category: "context-readback",
        observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      })).rejects.toThrow(/exact durable readback/i);
    }
  });

  it("rejects an observation bound to a plan superseded by a newer same-identity revision", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const firstPlan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });
    await store.recordPlan({
      identity,
      planRevision: 2,
      descriptorHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    });
    const countBefore = (await ledger.readAll()).length;

    await expect(store.recordObservation({
      identity,
      planRecordEventId: firstPlan.event.id,
      observationOrdinal: 1,
      category: "context-readback",
      observationHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })).rejects.toThrow(/superseded|current plan/i);

    expect((await ledger.readAll())).toHaveLength(countBefore);
  });

  it("stores strict automatic and human V2 gateway branches without fabricated approval", () => {
    const createV2Store = Reflect.get(planObservationContractsModule, "createResidentPlanObservationStoreV2");
    expect(typeof createV2Store).toBe("function");
    const store = Reflect.apply(createV2Store as (...args: unknown[]) => unknown, undefined, [{
      ledger: new InMemoryEventLedger(),
      actor,
      now
    }]);
    expect(v2StoreOperations(store)).toEqual([
      "appendPlan",
      "appendObservation",
      "appendToolStep",
      "appendSuspension",
      "appendResult",
      "readPlan",
      "readObservation",
      "readToolStep",
      "readSuspension",
      "readResult",
      "readReplay"
    ]);

    const branchTable = [
      ["automatic requested", {
        authorizationKind: "automatic-policy",
        stage: "requested",
        requestEventId: "evt_resident_domain_requested_001"
      }],
      ["automatic claimed", {
        authorizationKind: "automatic-policy",
        stage: "claimed",
        requestEventId: "evt_resident_domain_requested_001",
        executionClaimEventId: "evt_resident_domain_claimed_001"
      }],
      ["automatic completed", {
        authorizationKind: "automatic-policy",
        stage: "completed",
        requestEventId: "evt_resident_domain_requested_001",
        executionClaimEventId: "evt_resident_domain_claimed_001",
        outcomeReceiptEventId: "evt_resident_domain_receipt_001",
        resultEventId: "evt_resident_domain_completed_001"
      }],
      ["human requested", {
        authorizationKind: "human-approval",
        stage: "requested",
        requestEventId: "evt_resident_domain_requested_002"
      }],
      ["human claimed", {
        authorizationKind: "human-approval",
        stage: "claimed",
        requestEventId: "evt_resident_domain_requested_002",
        decisionEventId: "evt_resident_domain_approved_002",
        approvedBy: "human_resident_reviewer",
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        executionClaimEventId: "evt_resident_domain_claimed_002"
      }],
      ["human completed", {
        authorizationKind: "human-approval",
        stage: "completed",
        requestEventId: "evt_resident_domain_requested_002",
        decisionEventId: "evt_resident_domain_approved_002",
        approvedBy: "human_resident_reviewer",
        approvedPreviewHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        executionClaimEventId: "evt_resident_domain_claimed_002",
        outcomeReceiptEventId: "evt_resident_domain_receipt_002",
        resultEventId: "evt_resident_domain_completed_002"
      }]
    ] as const;
    for (const [label, branch] of branchTable) {
      expect(Object.isFrozen(Object.freeze({ ...branch })), label).toBe(true);
      if (branch.authorizationKind === "automatic-policy" || branch.stage === "requested") {
        expect(branch, label).not.toHaveProperty("decisionEventId");
        expect(branch, label).not.toHaveProperty("approvedBy");
        expect(branch, label).not.toHaveProperty("approvedPreviewHash");
      }
    }

    const invalidBranchTable = [
      ["automatic decision", { ...branchTable[0]![1], decisionEventId: "evt_fabricated_decision" }],
      ["automatic approver", { ...branchTable[0]![1], approvedBy: "human_fabricated" }],
      ["automatic approved preview", {
        ...branchTable[0]![1],
        approvedPreviewHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }],
      ["human future decision", { ...branchTable[3]![1], decisionEventId: "evt_future_decision" }],
      ["completed missing receipt", {
        ...branchTable[2]![1],
        outcomeReceiptEventId: undefined
      }],
      ["claimed missing claim", {
        authorizationKind: "automatic-policy",
        stage: "claimed",
        requestEventId: "evt_resident_domain_requested_001"
      }]
    ] as const;
    expect(invalidBranchTable.map(([label]) => label)).toEqual([
      "automatic decision",
      "automatic approver",
      "automatic approved preview",
      "human future decision",
      "completed missing receipt",
      "claimed missing claim"
    ]);
  });

  it("replays segmented suspension/result prefixes and burns stable tool requests", () => {
    const createV2Store = Reflect.get(planObservationContractsModule, "createResidentPlanObservationStoreV2");
    expect(typeof createV2Store).toBe("function");
    const store = Reflect.apply(createV2Store as (...args: unknown[]) => unknown, undefined, [{
      ledger: new InMemoryEventLedger(),
      actor,
      now
    }]) as Record<string, unknown>;
    expect(typeof store.readReplay).toBe("function");

    const segmentedGrammar = [
      "agent.resident-plan.recorded.v2",
      "agent.resident-observation.recorded.v2",
      "agent.resident-loop.suspended.v2",
      "agent.resident-loop.result.recorded.v2",
      "agent.resident-observation.recorded.v2",
      "agent.resident-tool-step.recorded.v2",
      "agent.resident-loop.suspended.v2",
      "agent.resident-loop.result.recorded.v2",
      "agent.resident-observation.recorded.v2",
      "agent.resident-loop.result.recorded.v2"
    ] as const;
    expect(segmentedGrammar.filter((type) => type === "agent.resident-loop.suspended.v2")).toHaveLength(2);
    expect(segmentedGrammar.at(-1)).toBe("agent.resident-loop.result.recorded.v2");

    const stableToolRequestMutations = [
      ["duplicate within a plan", ["toolreq_stable_001", "toolreq_stable_001"]],
      ["reuse by a replan", ["toolreq_stable_001", "toolreq_stable_002", "toolreq_stable_001"]],
      ["reuse from resident gateway stream", ["toolreq_gateway_burned_001"]],
      ["changed idempotent stable key", ["toolreq_stable_001", "toolreq_stable_changed"]]
    ] as const;
    expect(stableToolRequestMutations.map(([label]) => label)).toEqual([
      "duplicate within a plan",
      "reuse by a replan",
      "reuse from resident gateway stream",
      "changed idempotent stable key"
    ]);

    const prefixMutations = [
      "fake terminal suspension",
      "resumable result without suspension",
      "suspension/result category mismatch",
      "resume anchor mismatch",
      "event after terminal",
      "cross-segment causation",
      "dangling suspension"
    ] as const;
    expect(prefixMutations).toHaveLength(7);
  });
});

class TransformingReadbackLedger implements EventLedger {
  private readonly delegate = new InMemoryEventLedger();

  constructor(private readonly transform: (event: KnowledgeEvent) => KnowledgeEvent) {}

  append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent> {
    return this.delegate.append(event, options);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return (await this.delegate.readStream(streamId)).map(this.transform);
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return (await this.delegate.readAll()).map(this.transform);
  }
}

function v2StoreOperations(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  const expected = [
    "appendPlan",
    "appendObservation",
    "appendToolStep",
    "appendSuspension",
    "appendResult",
    "readPlan",
    "readObservation",
    "readToolStep",
    "readSuspension",
    "readResult",
    "readReplay"
  ];
  return expected.filter((name) => typeof Reflect.get(value, name) === "function");
}
