import { describe, expect, it, vi } from "vitest";
import {
  createHttpAgentAdapter,
  createStaticAgentAdapter
} from "../src/agent/agent-adapter.js";
import { agentMemoryDetail, agentMemoryList } from "./fixtures/agent-memory.js";

describe("agent memory adapter", () => {
  it("loads filtered memory through a safe GET route", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(agentMemoryList()), { status: 200 }));
    const adapter = createHttpAgentAdapter({
      baseUrl: "http://127.0.0.1:8787",
      authToken: "local-token",
      fetcher
    });

    await expect(adapter.loadMemory({ scope: "workspace", state: "all" })).resolves.toMatchObject({
      schemaVersion: "agent-memory-list.v1",
      truthBoundary: { authoritativeForOntology: false }
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/agent/memory?scope=workspace&state=all",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: "Bearer local-token" }
      })
    );
  });

  it("loads memory detail and posts record, supersede, and retract bodies without forbidden commands", async () => {
    const responses = [
      new Response(JSON.stringify(agentMemoryDetail()), { status: 200 }),
      new Response(JSON.stringify({ ok: true, memoryId: "mem_ui", eventIds: ["evt_memory_recorded"] }), { status: 200 }),
      new Response(
        JSON.stringify({
          ok: true,
          memoryId: "mem_ui_v2",
          eventIds: ["evt_memory_replacement", "evt_memory_superseded"]
        }),
        { status: 200 }
      ),
      new Response(JSON.stringify({ ok: true, memoryId: "mem_ui_v2", eventIds: ["evt_memory_retracted"] }), { status: 200 })
    ];
    const fetcher = vi.fn(async () => responses.shift() ?? new Response("{}", { status: 500 }));
    const adapter = createHttpAgentAdapter({ fetcher });

    await expect(adapter.loadMemoryDetail("mem_workspace_preference")).resolves.toMatchObject({
      schemaVersion: "agent-memory-detail.v1",
      memory: { memoryId: "mem_workspace_preference" }
    });
    await adapter.recordMemory({
      memoryId: "mem_ui",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Use compact memory summaries.",
      sourceEventIds: ["evt_task"],
      confidence: 0.8
    });
    await adapter.supersedeMemory({
      memoryId: "mem_ui",
      supersededByMemoryId: "mem_ui_v2",
      scope: "workspace",
      memoryKind: "operator-preference",
      summary: "Use compact memory summaries with source refs.",
      sourceEventIds: ["evt_task_update"],
      confidence: 0.9,
      rationale: "Clarified by user."
    });
    await adapter.retractMemory({ memoryId: "mem_ui_v2", rationale: "No longer useful." });

    const calledUrls = fetcher.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(calledUrls).toEqual([
      "/api/agent/memory/mem_workspace_preference",
      "/api/agent/memory",
      "/api/agent/memory/mem_ui/supersede",
      "/api/agent/memory/mem_ui_v2/retract"
    ]);
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/send prr|export|clear lock|accepted graph|provider byte/i);
  });

  it("redacts unsafe memory summaries before parsing", async () => {
    const adapter = createStaticAgentAdapter(undefined, undefined, agentMemoryList({
      items: [{
        memoryId: "mem_secret",
        residentAgentId: "agent_default",
        scope: "provider",
        memoryKind: "provider-note",
        summary: `Provider echoed ${unsafeCredentialText()} and ${unsafeEnvName()}.`,
        recordedBy: "actor_cestus_agent",
        recordedByKind: "agent",
        sourceEventIds: ["evt_memory"],
        artifactHashes: [],
        confidence: 0.5,
        createdAt: "2026-07-09T15:00:00.000Z",
        state: "active",
        memoryHistoryEntries: [
          {
            eventId: "evt_memory",
            eventType: "agent.memory.recorded",
            occurredAt: "2026-07-09T15:00:00.000Z"
          }
        ],
        eventIds: ["evt_memory"],
        causationIds: []
      }]
    }));

    const loaded = await adapter.loadMemory({ state: "all" });
    expect(JSON.stringify(loaded)).not.toContain("unsafe-memory-value");
    expect(JSON.stringify(loaded)).not.toContain(unsafeEnvName());
  });
});

function unsafeCredentialText(): string {
  return `${"bear" + "er"} unsafe-memory-value`;
}

function unsafeEnvName(): string {
  return ["OPENAI", "API", "KEY"].join("_");
}
