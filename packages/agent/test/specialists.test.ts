import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const fixedNow = () => "2026-07-07T19:45:00.000Z";

describe("resident agent specialist registry", () => {
  it("registers approved specialist run types under the resident identity", () => {
    expect(approvedAgentSpecialistRunTypes).toEqual([
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]);
  });

  it("fails closed for workflow execution that belongs to follow-up plans", () => {
    expect(specialistExecutionStatusFor("ontology-bootstrap")).toEqual({
      enabled: false,
      diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
      allowedRepairActions: [
        "review the approved resident-agent foundation",
        "create a focused specialist implementation plan"
      ]
    });
  });

  it("permits appending started events for every approved run type without executing specialist workflows", async () => {
    for (const runType of approvedAgentSpecialistRunTypes) {
      const ledger = new InMemoryEventLedger();
      const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

      await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
      const result = await runtime.startRun({
        runId: `run_${runType.replaceAll("-", "_")}`,
        runType,
        scope: { kind: "workspace", refs: ["ws_case_001"] }
      });

      const events = await ledger.readAll();
      expect(result).toMatchObject({ ok: true });
      expect(events.filter((event) => event.type === "agent.specialist-run.started")).toHaveLength(1);
      expect(events.some((event) => event.type === "agent.specialist-run.completed")).toBe(false);
      expect(events.some((event) => event.type === "agent.specialist-run.step.recorded")).toBe(false);
    }
  });

  it("rejects unsupported run types without appending runtime events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: fixedNow });

    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    const eventCountBefore = (await ledger.readAll()).length;
    const result = await runtime.startRun({
      runId: "run_unsupported",
      runType: "legacy-bootstrap" as never,
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });

    expect(result).toEqual({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Specialist workflow is not enabled for this run type.",
        allowedRepairActions: [
          "review the approved resident-agent foundation",
          "create a focused specialist implementation plan"
        ]
      }
    });
    expect(await ledger.readAll()).toHaveLength(eventCountBefore);
  });
});
