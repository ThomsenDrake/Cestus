import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { createAgentRuntime } from "../src/runtime.js";

const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const now = () => "2026-07-09T13:00:00.000Z";

describe("agent runtime memory", () => {
  it("records provenance-backed memory without appending ontology truth events", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    const result = await runtime.recordMemory({
      memoryId: "mem_case_goal",
      scope: "investigation",
      memoryKind: "agent-observation",
      summary: "The current investigation is prioritizing fee-waiver evidence gaps.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.82
    });

    expect(result).toMatchObject({ ok: true, memoryId: "mem_case_goal" });
    expect((await runtime.listMemory({ state: "active" })).items.map((item) => item.memoryId)).toEqual(["mem_case_goal"]);
    expect((await ledger.readAll()).map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "assertion.accepted",
      "entity.resolved",
      "relationship.accepted",
      "prr.request.sent",
      "agent.lock.cleared"
    ]));
  });

  it("rejects unproven memory and redacts unsafe summaries", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: agentActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });

    const result = await runtime.recordMemory({
      memoryId: "mem_unproven",
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: `Remember ${unsafeCredentialText()}`,
      confidence: 0.5
    });

    expect(result).toMatchObject({ ok: false, error: { category: "agent" } });
    expect(JSON.stringify(result)).not.toContain("unsafe-memory-value");
    expect(await ledger.readAll()).toHaveLength(1);
  });

  it("lets a human supersede and retract memory through new events only", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.recordMemory({
      memoryId: "mem_old_style",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers terse summaries.",
      sourceEventIds: ["evt_agent_task_created"],
      confidence: 0.9
    });

    await runtime.supersedeMemory({
      memoryId: "mem_old_style",
      supersededByMemoryId: "mem_new_style",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Case owner prefers concise summaries with source IDs.",
      sourceEventIds: ["evt_agent_task_updated"],
      confidence: 0.95,
      rationale: "Preference clarified during review."
    });
    await runtime.retractMemory({
      memoryId: "mem_new_style",
      rationale: "Operator removed this preference."
    });

    const events = await ledger.readAll();
    expect(events.map((event) => event.type)).toEqual([
      "agent.identity.initialized",
      "agent.memory.recorded",
      "agent.memory.recorded",
      "agent.memory.superseded",
      "agent.memory.retracted"
    ]);
    const list = await runtime.listMemory({ state: "all" });
    expect(list.items.find((item) => item.memoryId === "mem_old_style")?.state).toBe("superseded");
    expect(list.items.find((item) => item.memoryId === "mem_new_style")?.state).toBe("retracted");
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}
