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
    expect(ref.safeSummary).toMatch(/working memory/i);
    expect(ref.sizeBytes).toBeLessThanOrEqual(16_384);
    expect(JSON.stringify(ref)).not.toContain("raw evidence");
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
