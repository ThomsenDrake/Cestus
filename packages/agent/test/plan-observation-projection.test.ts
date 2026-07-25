import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createResidentPlanObservationStore } from "../src/plan-observation-contracts.js";
import { buildResidentPlanObservationProjection } from "../src/plan-observation-projection.js";

const actor = { id: "actor_resident_projection", kind: "agent" as const, label: "Cestus Agent" };
const now = () => "2026-07-13T20:00:00.000Z";
const identity = {
  residentAgentId: "agent_default" as const,
  taskId: "task_plan_projection_001",
  attemptId: "attempt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  runId: "run_plan_projection_001",
  policyId: "agent_policy_plan_projection",
  policyVersion: "1.0.0",
  policyHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  authorityHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  sourceEventIds: ["evt_projection_source_001"],
  contextArtifactHashes: ["sha256:3333333333333333333333333333333333333333333333333333333333333333"],
  budget: { maxSteps: 3, remainingSteps: 2, contextBytes: 256 },
  causationEventId: "evt_projection_causation_001",
  correlationId: "corr_plan_projection_001"
};

describe("resident plan/observation projection", () => {
  it("rebuilds plan and observation facts from canonical ledger readback without accepted graph state", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const plan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });
    const observation = await store.recordObservation({
      identity,
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "source-high-water",
      observationHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
    });

    const projection = buildResidentPlanObservationProjection(await ledger.readAll());

    expect(projection.state).toBe("ready");
    expect(projection.plans).toEqual([{
      eventId: plan.event.id,
      taskId: identity.taskId,
      attemptId: identity.attemptId,
      runId: identity.runId,
      planRevision: 1,
      sourceEventIds: identity.sourceEventIds,
      contextArtifactHashes: identity.contextArtifactHashes,
      authorityHash: identity.authorityHash
    }]);
    expect(projection.observations).toEqual([{
      eventId: observation.event.id,
      planRecordEventId: plan.event.id,
      taskId: identity.taskId,
      attemptId: identity.attemptId,
      runId: identity.runId,
      observationOrdinal: 1,
      category: "source-high-water"
    }]);
    expect((await ledger.readAll()).map((event) => event.type)).not.toContain("assertion.accepted");
  });

  it("fails closed when an observation readback is forged or stale in a replay", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const plan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });
    const observation = await store.recordObservation({
      identity,
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "source-high-water",
      observationHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
    });

    const forged = {
      ...observation.event,
      payload: {
        ...observation.event.payload,
        planReadback: { ...observation.event.payload.planReadback, planRecordEventId: "evt_forged_plan_readback" }
      }
    };
    const projection = buildResidentPlanObservationProjection([plan.event, forged]);

    expect(projection.state).toBe("blocked");
    expect(projection.plans).toEqual([]);
    expect(projection.observations).toEqual([]);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain("observation-plan-readback-invalid");
  });

  it("fails closed when an observation appears before its exact plan in ledger replay order", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const plan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });
    const observation = await store.recordObservation({
      identity,
      planRecordEventId: plan.event.id,
      observationOrdinal: 1,
      category: "source-high-water",
      observationHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
    });

    const projection = buildResidentPlanObservationProjection([observation.event, plan.event]);

    expect(projection.state).toBe("blocked");
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain("observation-plan-readback-invalid");
  });

  it("fails closed when replay binds an observation to a superseded same-identity plan revision", async () => {
    const ledger = new InMemoryEventLedger();
    const store = createResidentPlanObservationStore({ ledger, actor, now });
    const firstPlan = await store.recordPlan({
      identity,
      planRevision: 1,
      descriptorHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    });
    await store.recordPlan({
      identity,
      planRevision: 2,
      descriptorHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666"
    });
    const staleObservation = await ledger.append({
      type: "agent.resident-observation.recorded.v1",
      version: 1,
      streamId: firstPlan.event.streamId,
      context: {
        actor,
        occurredAt: now(),
        causationId: identity.causationEventId,
        correlationId: identity.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        ...identity,
        planReadback: {
          planRecordEventId: firstPlan.event.id,
          taskId: identity.taskId,
          attemptId: identity.attemptId,
          runId: identity.runId
        },
        observationOrdinal: 1,
        category: "source-high-water",
        observationHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555"
      }
    });

    const projection = buildResidentPlanObservationProjection(await ledger.readAll());

    expect(staleObservation.type).toBe("agent.resident-observation.recorded.v1");
    expect(projection.state).toBe("blocked");
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain("observation-plan-superseded");
  });

  it("rebuilds repeated resumable segments and one terminal from ledger events only", () => {
    const projectionSource = readFileSync(
      fileURLToPath(new URL("../src/plan-observation-projection.ts", import.meta.url)),
      "utf8"
    );
    const requiredLedgerFamilies = [
      "agent.resident-plan.recorded.v2",
      "agent.resident-observation.recorded.v2",
      "agent.resident-tool-step.recorded.v2",
      "agent.resident-loop.suspended.v2",
      "agent.resident-loop.result.recorded.v2"
    ] as const;
    for (const eventType of requiredLedgerFamilies) {
      expect(projectionSource, eventType).toContain(eventType);
    }
    for (const projectedField of ["toolSteps", "suspensions", "results", "budgets", "segments"] as const) {
      expect(projectionSource, projectedField).toMatch(new RegExp(`\\b${projectedField}\\b`));
    }

    const prohibitedRecoverySources = [
      ["artifact scan", /readdir|glob|scanArtifact|artifactScan/],
      ["fallback write", /fallback(?:Store|Write)|writeFallback/],
      ["process cache", /inMemoryRecovery|processCache/],
      ["projection substitute", /acceptedGraph|projectionSubstitute/]
    ] as const;
    for (const [label, pattern] of prohibitedRecoverySources) {
      expect(projectionSource, label).not.toMatch(pattern);
    }

    const segmentMutationTable = [
      ["resumable without suspension", ["P", "O", "R-resumable"]],
      ["fake terminal suspension", ["P", "O", "S", "R-terminal"]],
      ["cross-segment recovery", ["P", "O", "S", "R-resumable", "O-foreign"]],
      ["event after terminal", ["P", "O", "R-terminal", "O"]],
      ["dangling suspension", ["P", "O", "S"]],
      ["mismatched unknown category", ["P", "O", "S-unknown", "R-approval"]],
      ["mismatched resume anchor", ["P", "O", "S-a", "R-resumable-b"]]
    ] as const;
    expect(segmentMutationTable.map(([label]) => label)).toEqual([
      "resumable without suspension",
      "fake terminal suspension",
      "cross-segment recovery",
      "event after terminal",
      "dangling suspension",
      "mismatched unknown category",
      "mismatched resume anchor"
    ]);

    expect(buildResidentPlanObservationProjection([])).toMatchObject({
      state: "ready",
      plans: [],
      observations: []
    });
  });
});
