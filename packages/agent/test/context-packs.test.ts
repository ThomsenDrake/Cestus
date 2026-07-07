import { describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  contextPackDescriptorSchema,
  contextPackRefSchema,
  createContextPackRegistry,
  hashAgentContextPack
} from "../src/context-packs.js";

describe("agent context packs", () => {
  it("validates descriptor metadata for explicit context assembly", () => {
    const descriptor = contextPackDescriptorSchema.parse({
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      label: "Accepted graph projection",
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    });

    expect(descriptor.contextPackId).toBe("accepted-graph-projection.v1");
  });

  it("builds stable context pack hashes from sorted JSON", () => {
    const left = hashAgentContextPack({ b: 2, a: 1 });
    const right = hashAgentContextPack({ a: 1, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects secret-shaped summaries and refs", () => {
    expect(() =>
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "api key sk-live-value",
        provenanceRefs: []
      })
    ).toThrow(/secret/i);
  });

  it("registers fake context builders by stable id", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "One prior task event.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      contextPackId: "task-run-history.v1",
      provenanceRefs: ["evt_agent_task"]
    });
  });
});
