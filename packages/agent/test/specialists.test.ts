import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";
import { approvedAgentSpecialistRunTypes, specialistExecutionStatusFor } from "../src/specialists.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const fixedNow = () => "2026-07-07T19:45:00.000Z";
const mvpRunTypes = [
  "prr-negotiation",
  "evidence-triage",
  "timeline-builder",
  "contradiction-finder",
  "investigation-planner",
  "report-builder"
] as const;

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

  it("fails closed for ontology bootstrap without reporting MVP workflow readiness", () => {
    expect(specialistExecutionStatusFor("ontology-bootstrap")).toEqual({
      enabled: false,
      diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
      registeredWorkflowMode: false,
      residentAgentId: "agent_default",
      executionReady: false,
      prerequisiteContractIds: [],
      requiredContextPackIds: [],
      missingExecutionCapabilities: [
        "specialist workflow descriptor",
        "specialist workflow runner",
        "model provider readiness",
        "domain adapter readiness"
      ],
      allowedRepairActions: [
        "review the approved resident-agent foundation",
        "create a focused specialist implementation plan",
        "select one of the registered MVP specialist workflow modes before wiring workflow execution"
      ]
    });
  });

  it("reports registered MVP specialist metadata without enabling execution", () => {
    for (const runType of mvpRunTypes) {
      const descriptor = specialistWorkflowDescriptorFor(runType);
      const status = specialistExecutionStatusFor(runType);

      expect(status).toEqual({
        enabled: false,
        diagnosticCode: "AGENT_SPECIALIST_WORKFLOW_NOT_ENABLED",
        registeredWorkflowMode: true,
        residentAgentId: "agent_default",
        executionReady: false,
        prerequisiteContractIds: descriptor.prerequisiteContractIds,
        requiredContextPackIds: descriptor.contextPacks.map((pack) => pack.contextPackId),
        missingExecutionCapabilities: [
          "specialist workflow runner",
          "model provider readiness",
          "domain adapter readiness"
        ],
        allowedRepairActions: [
          "review the approved resident-agent foundation",
          "create a focused specialist implementation plan",
          `wire specialist workflow readiness for ${descriptor.prerequisiteContractIds.join(", ")}`,
          `construct required context packs: ${descriptor.contextPacks.map((pack) => pack.contextPackId).join(", ")}`,
          "keep specialist execution disabled until a scheduler/resumer invokes an approved workflow runner"
        ]
      });
      expect(status.residentAgentId).toBe("agent_default");
      expect(status.enabled).toBe(false);
      expect(status.executionReady).toBe(false);
      expect(status.allowedRepairActions.join(" ")).not.toMatch(/\bland\b|contracts are absent|contracts still need/i);
    }
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
          "create a focused specialist implementation plan",
          "select one of the registered MVP specialist workflow modes before wiring workflow execution"
        ]
      }
    });
    expect(await ledger.readAll()).toHaveLength(eventCountBefore);
  });
});
