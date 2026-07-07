import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

describe("buildAgentProjection", () => {
  it("rebuilds resident identity, tasks, runs, tools, memory, permissions, and locks", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);

    expect(projection.identity?.residentAgentId).toBe("agent_default");
    expect(projection.tasks.get("task_provider_readiness")?.status).toBe("waiting-for-approval");
    expect(projection.runs.get("run_provider_readiness")?.runType).toBe("evidence-triage");
    expect(projection.toolRequests.get("toolreq_provider_preview")?.state).toBe("requested");
    expect(projection.activeMemory.map((memory) => memory.memoryId)).toEqual(["mem_workspace_policy"]);
    expect(projection.permissions.get("perm_read_workspace")?.state).toBe("granted");
    expect(projection.locks.get("lock_legal_escalation")?.state).toBe("active");
  });

  it("is deterministic across replay and preserves memory history after retraction", () => {
    const first = buildAgentProjection(goldenAgentLedgerEvents);
    const second = buildAgentProjection([...goldenAgentLedgerEvents]);

    expect(JSON.stringify(first.toDto())).toEqual(JSON.stringify(second.toDto()));
    expect(first.memoryHistory.get("mem_retracted_context")?.state).toBe("retracted");
    expect(first.activeMemory.some((memory) => memory.memoryId === "mem_retracted_context")).toBe(false);
  });
});
