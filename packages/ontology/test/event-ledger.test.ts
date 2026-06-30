import { describe, expect, it } from "vitest";
import { InMemoryEventLedger, type AppendableKnowledgeEvent } from "../src/event-ledger.js";

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_ledger",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

function evidenceEvent(evidenceId: string): AppendableKnowledgeEvent {
  return {
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context,
    payload: {
      evidenceId,
      source: { kind: "file", label: `${evidenceId}.pdf` },
      contentHash: "sha256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544",
      mediaType: "application/pdf",
      sizeBytes: 128
    }
  };
}

describe("InMemoryEventLedger", () => {
  it("assigns event ids and stream sequences", async () => {
    const ledger = new InMemoryEventLedger();
    const first = await ledger.append(evidenceEvent("ev_001"));
    const second = await ledger.append(evidenceEvent("ev_001"));

    expect(first.id).toMatch(/^evt_/);
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
  });

  it("enforces optimistic concurrency", async () => {
    const ledger = new InMemoryEventLedger();
    await ledger.append(evidenceEvent("ev_002"), { expectedNextSequence: 1 });

    await expect(ledger.append(evidenceEvent("ev_002"), { expectedNextSequence: 1 })).rejects.toThrow(
      "Concurrency conflict"
    );
  });

  it("returns immutable snapshots", async () => {
    const ledger = new InMemoryEventLedger();
    const event = await ledger.append(evidenceEvent("ev_003"));
    (event.payload as { sizeBytes: number }).sizeBytes = 999;

    const stored = await ledger.readStream("evidence_ev_003");
    expect((stored[0]?.payload as { sizeBytes: number }).sizeBytes).toBe(128);
  });
});
