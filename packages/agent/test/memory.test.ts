import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import {
  buildAgentMemoryDetail,
  buildAgentMemoryList,
  buildAgentMemorySummaryContextPack
} from "../src/memory.js";
import { goldenAgentLedgerEvents } from "./fixtures/golden-agent-ledger.js";

describe("agent memory surface", () => {
  it("lists active, superseded, and retracted memory with visible non-authoritative state", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const dto = buildAgentMemoryList({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      filters: { state: "all" }
    });

    expect(dto.schemaVersion).toBe("agent-memory-list.v1");
    expect(dto.truthBoundary.authoritativeForOntology).toBe(false);
    expect(dto.items.map((item) => item.state)).toEqual(expect.arrayContaining(["active", "superseded", "retracted"]));
    expect(dto.items.every((item) => item.sourceEventIds.length + item.artifactHashes.length > 0)).toBe(true);
  });

  it("builds a detail DTO with event history and source refs", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const detail = buildAgentMemoryDetail({
      projection,
      memoryId: "mem_superseded_context",
      generatedAt: "2026-07-09T12:30:00.000Z"
    });

    expect(detail).toMatchObject({
      schemaVersion: "agent-memory-detail.v1",
      memory: {
        memoryId: "mem_superseded_context",
        state: "superseded"
      },
      truthBoundary: { authoritativeForOntology: false }
    });
    expect(detail?.history.map((entry) => entry.eventType)).toContain("agent.memory.superseded");
  });

  it("builds a stable budgeted agent-memory-summary.v1 context pack from active memory only", () => {
    const projection = buildAgentProjection(goldenAgentLedgerEvents);
    const ref = buildAgentMemorySummaryContextPack({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sizeBudgetBytes: 16_384
    });

    expect(ref.contextPackId).toBe("agent-memory-summary.v1");
    expect(ref.version).toBe(1);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_memory_recorded_workspace_policy"]));
    expect(ref.sourceEventIds).toEqual(["evt_agent_policy_installed_default"]);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_policy_installed_default"]));
    expect(ref.safeSummary).toMatch(/working memory/i);
    expect(ref.sizeBytes).toBeLessThanOrEqual(16_384);
    expect(JSON.stringify(ref)).not.toContain("raw evidence");
  });

  it("builds detail history from the actual recorded lifecycle event types", () => {
    const projection = buildAgentProjection([
      {
        id: "evt_agent_memory_recorded_history_mix",
        type: "agent.memory.recorded",
        version: 1,
        streamId: "agent_memory_mem_history_mix",
        sequence: 1,
        context: agentContext("2026-07-09T12:00:00.000Z"),
        payload: {
          memoryId: "mem_history_mix",
          residentAgentId: "agent_default",
          scope: "workspace",
          summary: "Record a memory that is later superseded and then retracted.",
          sourceEventIds: ["evt_agent_task_created_provider_readiness"],
          confidence: 0.7,
          createdAt: "2026-07-09T12:00:00.000Z"
        }
      },
      {
        id: "evt_agent_memory_superseded_history_mix",
        type: "agent.memory.superseded",
        version: 1,
        streamId: "agent_memory_mem_history_mix",
        sequence: 2,
        context: humanContext("2026-07-09T12:05:00.000Z", "evt_agent_memory_recorded_history_mix"),
        payload: {
          memoryId: "mem_history_mix",
          supersededByMemoryId: "mem_workspace_policy",
          supersededBy: "actor_case_owner",
          rationale: "Prefer the canonical workspace policy memory.",
          supersededAt: "2026-07-09T12:05:00.000Z"
        }
      },
      {
        id: "evt_agent_memory_retracted_history_mix",
        type: "agent.memory.retracted",
        version: 1,
        streamId: "agent_memory_mem_history_mix",
        sequence: 3,
        context: humanContext("2026-07-09T12:10:00.000Z", "evt_agent_memory_superseded_history_mix"),
        payload: {
          memoryId: "mem_history_mix",
          retractedBy: "actor_case_owner",
          rationale: "Remove the superseded memory from consideration entirely.",
          retractedAt: "2026-07-09T12:10:00.000Z"
        }
      }
    ]);

    const detail = buildAgentMemoryDetail({
      projection,
      memoryId: "mem_history_mix",
      generatedAt: "2026-07-09T12:30:00.000Z"
    });

    expect(detail?.memory.state).toBe("retracted");
    expect(detail?.history).toEqual([
      {
        eventId: "evt_agent_memory_recorded_history_mix",
        eventType: "agent.memory.recorded",
        occurredAt: "2026-07-09T12:00:00.000Z"
      },
      {
        eventId: "evt_agent_memory_superseded_history_mix",
        eventType: "agent.memory.superseded",
        occurredAt: "2026-07-09T12:05:00.000Z"
      },
      {
        eventId: "evt_agent_memory_retracted_history_mix",
        eventType: "agent.memory.retracted",
        occurredAt: "2026-07-09T12:10:00.000Z"
      }
    ]);
  });

  it("fails closed when no active memory has real provenance for the summary pack", () => {
    const projection = buildAgentProjection([]);

    expect(() =>
      buildAgentMemorySummaryContextPack({
        projection,
        generatedAt: "2026-07-09T12:30:00.000Z",
        policyVersion: "agent-policy-v1",
        scope: { kind: "workspace", id: "ws_case_001" },
        sizeBudgetBytes: 16_384
      })
    ).toThrow(/agent-memory-summary\.v1 requires active memory with real provenance/i);
  });
});

function agentContext(occurredAt: string) {
  return {
    actor: { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" },
    occurredAt,
    correlationId: "corr_memory_history_mix",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}

function humanContext(occurredAt: string, causationId: string) {
  return {
    actor: { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" },
    occurredAt,
    causationId,
    correlationId: "corr_memory_history_mix",
    coreVersion: "0.1.0",
    packVersions: { core: "0.1.0", agent: "0.1.0" }
  };
}
