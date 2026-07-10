import { describe, expect, it } from "vitest";
import { buildAgentProjection } from "../src/projection.js";
import type { AgentProjection } from "../src/projection.js";
import {
  buildAgentMemoryDetail,
  buildAgentMemoryList,
  buildAgentMemorySummaryContextPack,
  buildAgentMemorySummaryResolvedContextPack
} from "../src/memory.js";
import { verifyResolvedContextPack } from "../src/context-packs.js";
import { operationalContextPackPayloadParsers } from "../src/operational-context-packs.js";
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
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    });

    expect(ref.contextPackId).toBe("agent-memory-summary.v1");
    expect(ref.version).toBe(1);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_memory_recorded_workspace_policy"]));
    expect(ref.sourceEventIds).toEqual(["evt_agent_policy_installed_default"]);
    expect(ref.provenanceRefs).toEqual(expect.arrayContaining(["evt_agent_policy_installed_default"]));
    expect(ref.safeSummary).toMatch(/working memory/i);
    expect(ref.sizeBytes).toBeLessThanOrEqual(16_384);
    expect(ref.projectionHighWaterMark).toBe(42);
    expect(ref.stalenessInputs).toEqual([{
      kind: "projection-high-water-mark",
      ref: "agent.projection.memory",
      value: "42"
    }]);
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

  it("keeps the ref wrapper aligned with the canonical resolved builder for a bounded snapshot", () => {
    const memorySnapshot = boundedMemorySnapshot();
    const input = {
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    };

    const resolved = buildAgentMemorySummaryResolvedContextPack(input);
    const ref = buildAgentMemorySummaryContextPack(input);

    expect(ref).toEqual(resolved.ref);
    expect(verifyResolvedContextPack(
      resolved,
      operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]
    )).toEqual(resolved);
    expect(resolved.payload).toMatchObject({
      schemaVersion: "agent-memory-summary.v1",
      memory: {
        truthBoundary: { authoritativeForOntology: false },
        projectionHighWaterMark: 42,
        sourceEventIds: ["evt_agent_policy_installed_default"],
        artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
      }
    });
    expect(JSON.stringify(resolved.payload)).not.toMatch(/accepted ontology|ontology truth/i);
  });

  it("requires an authoritative proof before summarizing an empty memory projection", () => {
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot: emptyMemorySnapshot(),
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      sizeBudgetBytes: 16_384
    })).toThrow(/missing-empty-proof/);
  });

  it("builds a stable proven empty-memory summary pack and rejects mismatched proof sources", () => {
    const input = {
      memorySnapshot: emptyMemorySnapshot(),
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      sizeBudgetBytes: 16_384,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 0,
        sourceEventCount: 0,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "first-run"
      }
    };

    expect(buildAgentMemorySummaryContextPack(input)).toMatchObject({
      provenanceRefs: ["empty-projection:agent.projection.memory:workspace:ws_case_001:hwm:0"],
      projectionHighWaterMark: 0,
      stalenessInputs: [{
        kind: "projection-high-water-mark",
        ref: "agent.projection.memory",
        value: "0"
      }]
    });
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, projectionHighWaterMark: 1 }
    })).toThrow(/projection-source-mismatch/);
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, scope: { kind: "workspace", id: "ws_other_001" } }
    })).toThrow(/projection-source-mismatch/);
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, projectionName: "agent.projection.task-run-history" }
    })).toThrow(/projection-source-mismatch/);
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, generatedAt: "2026-07-09T12:30:01.000Z" }
    })).toThrow(/projection-source-mismatch/);
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, sourceEventCount: 1 }
    })).toThrow(/projection-source-mismatch/);
  });

  it("blocks unprovenanced active memory instead of recasting it as a proven empty projection", () => {
    const memorySnapshot = {
      ...emptyMemorySnapshot(),
      activeMemory: [{
        memoryId: "mem_unprovenanced",
        scope: "workspace",
        memoryKind: "agent-observation",
        summary: "This item lacks source evidence.",
        confidence: 0.4,
        sourceEventIds: [],
        artifactHashes: []
      }],
      aggregateCounts: { active: 1, totalCount: 1 },
      window: { ...emptyMemorySnapshot().window, totalCount: 1 }
    };

    expect(() => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      sizeBudgetBytes: 16_384,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 0,
        sourceEventCount: 0,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "first-run"
      }
    })).toThrow(/missing-provenance/);
  });

  it("rejects direct memory snapshots whose visible active memory exceeds the bounded window", () => {
    const memorySnapshot = {
      ...boundedMemorySnapshot(),
      activeMemory: [
        ...boundedMemorySnapshot().activeMemory,
        {
          memoryId: "mem_second",
          scope: "workspace",
          memoryKind: "agent-observation",
          summary: "Second visible memory item.",
          confidence: 0.7,
          sourceEventIds: ["evt_agent_memory_second"],
          artifactHashes: []
        }
      ],
      aggregateCounts: { active: 2, totalCount: 2 },
      sourceEventIds: ["evt_agent_policy_installed_default", "evt_agent_memory_second"],
      window: { ...boundedMemorySnapshot().window, limit: 1, totalCount: 2, hasMore: true }
    };

    expect(() => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    })).toThrow("blocked.unbounded-source");
  });

  it("rejects accessor-backed direct memory snapshots without invoking getters", () => {
    let getterInvoked = false;
    const memorySnapshot = { ...boundedMemorySnapshot() } as Record<string, unknown>;
    Object.defineProperty(memorySnapshot, "window", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return boundedMemorySnapshot().window;
      }
    });

    expect(() => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot: memorySnapshot as never,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    })).toThrow(/accessor|plain|payload-shape/);
    expect(getterInvoked).toBe(false);
  });

  it("strictly validates direct memory item enums, confidence, refs, and complete window metadata", () => {
    const base = boundedMemorySnapshot();
    const firstItem = base.activeMemory[0]!;
    const invalidSnapshots = [
      { ...base, activeMemory: [{ ...firstItem, scope: "global" }] },
      { ...base, activeMemory: [{ ...firstItem, memoryKind: "working-note" }] },
      { ...base, activeMemory: [{ ...firstItem, confidence: 1.01 }] },
      { ...base, activeMemory: [{ ...firstItem, sourceEventIds: ["not_an_event"] }] },
      { ...base, activeMemory: [{ ...firstItem, artifactHashes: ["sha256:not-a-hash"] }] },
      { ...base, window: { ...base.window, order: "newest records first" } },
      { ...base, window: { ...base.window, hasMore: "yes" } },
      { ...base, window: { ...base.window, totalCount: -1 } },
      { ...base, window: { ...base.window, omissionCodes: ["omitted.unknown"] } }
    ];

    for (const memorySnapshot of invalidSnapshots) {
      expect(() => buildAgentMemorySummaryResolvedContextPack({
        memorySnapshot: memorySnapshot as never,
        generatedAt: "2026-07-09T12:30:00.000Z",
        policyVersion: "agent-policy-v1",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 42,
        sizeBudgetBytes: 16_384
      })).toThrow(/blocked\.(invalid-payload-shape|unbounded-source)|UTC timestamp/);
    }
  });

  it("rejects authoritative empty memory snapshots that retain artifact provenance", () => {
    const input = {
      memorySnapshot: { ...emptyMemorySnapshot(), artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] },
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      sizeBudgetBytes: 16_384,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 0,
        sourceEventCount: 0,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "empty.active-memory"
      }
    } as const;

    expect(() => buildAgentMemorySummaryResolvedContextPack(input)).toThrow("blocked.projection-source-mismatch");
  });

  it("rejects empty proof when aggregate counts report active memory outside the bounded window", () => {
    const memorySnapshot = {
      ...emptyMemorySnapshot(),
      aggregateCounts: { active: 1, totalCount: 1 },
      window: { ...emptyMemorySnapshot().window, hasMore: true, totalCount: 1 }
    };

    expect(() => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      sizeBudgetBytes: 16_384,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 0,
        sourceEventCount: 0,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "first-run"
      }
    })).toThrow(/projection-source-mismatch/);
  });

  it("accepts lifecycle-empty active memory with a nonzero source count and stable omission proof", () => {
    const memorySnapshot = {
      ...emptyMemorySnapshot(),
      projectionHighWaterMark: 3,
      aggregateCounts: { active: 0, totalCount: 3 },
      window: { ...emptyMemorySnapshot().window, omissionCodes: ["omitted.out-of-scope"] as const }
    };
    const input = {
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 3,
      sizeBudgetBytes: 16_384,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 3,
        sourceEventCount: 3,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "empty.active-memory"
      }
    } as const;

    const resolved = buildAgentMemorySummaryResolvedContextPack(input);
    expect(resolved.payload).toMatchObject({
      source: { generatedAt: input.generatedAt, policyVersion: input.policyVersion, scope: input.scope },
      memory: {
        activeMemory: [],
        aggregateCounts: { active: 0, totalCount: 3 },
        window: { totalCount: 0, omissionCodes: ["omitted.out-of-scope"] },
        emptyProof: { sourceEventCount: 3 }
      }
    });
    expect(() => buildAgentMemorySummaryResolvedContextPack({
      ...input,
      emptyMemoryProof: { ...input.emptyMemoryProof, sourceEventCount: 2 }
    })).toThrow("blocked.projection-source-mismatch");
  });

  it("rejects non-empty memory whose window or aggregate totals do not cover visible items", () => {
    const base = boundedMemorySnapshot({ totalCount: 1, omissionCodes: [] });
    const invalid = [
      { ...base, aggregateCounts: { active: 0, totalCount: 0 } },
      { ...base, window: { ...base.window, totalCount: 0, hasMore: false } },
      { ...base, window: { ...base.window, totalCount: 1, hasMore: true } }
    ];
    for (const memorySnapshot of invalid) {
      expect(() => buildAgentMemorySummaryResolvedContextPack({
        memorySnapshot,
        generatedAt: "2026-07-09T12:30:00.000Z",
        policyVersion: "agent-policy-v1",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 42,
        sizeBudgetBytes: 16_384
      })).toThrow(/blocked\.(unbounded-source|projection-source-mismatch)/);
    }
  });

  it("rejects unprovenanced active memory through the exact payload parser", () => {
    const resolved = buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot: {
        ...boundedMemorySnapshot({ totalCount: 1, omissionCodes: [] }),
        window: { ...boundedMemorySnapshot({ totalCount: 1, omissionCodes: [] }).window, hasMore: false }
      },
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    });
    const payload = structuredClone(resolved.payload) as { memory: { activeMemory: Array<{ sourceEventIds: string[]; artifactHashes: string[] }>; sourceEventIds: string[]; artifactHashes: string[] } };
    payload.memory.activeMemory[0]!.sourceEventIds = [];
    payload.memory.activeMemory[0]!.artifactHashes = [];
    payload.memory.sourceEventIds = [];
    payload.memory.artifactHashes = [];

    expect(() => operationalContextPackPayloadParsers["agent-memory-summary.v1@1"](payload as never, resolved.ref)).toThrow(/provenance|payload/i);
  });

  it("keeps bounded item output stable as omitted history grows", () => {
    const small = boundedMemorySnapshot({ totalCount: 10_000, omissionCodes: ["omitted.out-of-scope"] });
    const large = boundedMemorySnapshot({ totalCount: 100_000, omissionCodes: ["omitted.out-of-scope", "omitted.size-budget"] });
    const build = (memorySnapshot: ReturnType<typeof boundedMemorySnapshot>) => buildAgentMemorySummaryResolvedContextPack({
      memorySnapshot,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 16_384
    });

    const smallPayload = build(small).payload as { memory: { activeMemory: unknown[]; aggregateCounts: Record<string, number> } };
    const largePayload = build(large).payload as { memory: { activeMemory: unknown[]; aggregateCounts: Record<string, number> } };

    expect(largePayload.memory.activeMemory).toHaveLength(smallPayload.memory.activeMemory.length);
    expect(largePayload.memory.aggregateCounts.totalCount).toBe(100_000);
    expect(smallPayload.memory.aggregateCounts.totalCount).toBe(10_000);
  });

  it("keeps projection-adapter provenance and output bounded as active memory grows", () => {
    const build = (projection: AgentProjection, maxItems: number) => buildAgentMemorySummaryResolvedContextPack({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 42,
      sizeBudgetBytes: 100_000_000,
      maxItems
    });
    const projection = projectionWithActiveMemory(10_000);
    const small = build(projection, 25);
    const large = build(projection, 10_000);
    const largePayload = large.payload as { memory: { activeMemory: { memoryId: string }[]; aggregateCounts: Record<string, number> } };

    expect(largePayload.memory.activeMemory).toHaveLength(25);
    expect(largePayload.memory.aggregateCounts.active).toBe(10_000);
    expect(largePayload.memory.activeMemory[0]?.memoryId).toBe("mem_projection_09999");
    expect(large.ref.provenanceRefs).toHaveLength(small.ref.provenanceRefs.length);
    expect(large.ref.provenanceRefs).toHaveLength(51);
    expect(large.ref.sizeBytes).toBe(small.ref.sizeBytes);
    const reversed = build({ ...projection, activeMemory: [...projection.activeMemory].reverse() } as AgentProjection, 25);
    expect((reversed.payload as { memory: { activeMemory: { memoryId: string }[] } }).memory.activeMemory).toEqual(largePayload.memory.activeMemory);
    expect(verifyResolvedContextPack(
      large,
      operationalContextPackPayloadParsers["agent-memory-summary.v1@1"]
    )).toEqual(large);
  });

  it("builds a stable empty-memory summary pack for first-run workspaces", () => {
    const projection = buildAgentProjection([]);

    const ref = buildAgentMemorySummaryContextPack({
      projection,
      generatedAt: "2026-07-09T12:30:00.000Z",
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      projectionHighWaterMark: 0,
      emptyMemoryProof: {
        projectionName: "agent.projection.memory",
        scope: { kind: "workspace", id: "ws_case_001" },
        projectionHighWaterMark: 0,
        sourceEventCount: 0,
        generatedAt: "2026-07-09T12:30:00.000Z",
        emptyReasonCode: "first-run"
      },
      sizeBudgetBytes: 16_384
    });

    expect(ref).toMatchObject({
      contextPackId: "agent-memory-summary.v1",
      version: 1,
      policyVersion: "agent-policy-v1",
      scope: { kind: "workspace", id: "ws_case_001" },
      sourceEventIds: [],
      artifactHashes: [],
      provenanceRefs: ["empty-projection:agent.projection.memory:workspace:ws_case_001:hwm:0"],
      stalenessInputs: [{
        kind: "projection-high-water-mark",
        ref: "agent.projection.memory",
        value: "0"
      }]
    });
    expect(ref.safeSummary).toBe("0 active working memory items; not ontology truth.");
  });
});

function boundedMemorySnapshot(overrides: Partial<{ totalCount: number; omissionCodes: readonly "omitted.out-of-scope"[] | readonly ("omitted.out-of-scope" | "omitted.size-budget")[] }> = {}) {
  return {
    projectionHighWaterMark: 42,
    projectionSourceRef: "agent.projection.memory",
    activeMemory: [{
      memoryId: "mem_workspace_policy",
      scope: "workspace",
      memoryKind: "policy-caveat",
      summary: "Use the workspace policy before proposing actions.",
      confidence: 0.9,
      sourceEventIds: ["evt_agent_policy_installed_default"],
      artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    }],
    aggregateCounts: { active: 1, totalCount: overrides.totalCount ?? 10_000 },
    sourceEventIds: ["evt_agent_policy_installed_default"],
    artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    window: {
      order: "createdAt:asc",
      limit: 1,
      hasMore: true,
      totalCount: overrides.totalCount ?? 10_000,
      omissionCodes: overrides.omissionCodes ?? ["omitted.out-of-scope"]
    }
  };
}

function emptyMemorySnapshot() {
  return {
    projectionHighWaterMark: 0,
    projectionSourceRef: "agent.projection.memory",
    activeMemory: [],
    aggregateCounts: { active: 0, totalCount: 0 },
    sourceEventIds: [],
    artifactHashes: [],
    window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] }
  };
}

function projectionWithActiveMemory(count: number): AgentProjection {
  return {
    activeMemory: Array.from({ length: count }, (_, index) => ({
      memoryId: `mem_projection_${String(index).padStart(5, "0")}`,
      scope: "workspace",
      memoryKind: "agent-observation",
      summary: "A bounded projection memory item.",
      confidence: 0.5,
      sourceEventIds: [`evt_agent_memory_source_${index}`],
      artifactHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      eventIds: [`evt_agent_memory_recorded_${index}`],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, count - index)).toISOString()
    }))
  } as unknown as AgentProjection;
}

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
