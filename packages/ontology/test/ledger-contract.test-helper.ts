import { describe, expect, it } from "vitest";
import type { KnowledgeEvent } from "../src/contracts.js";
import type { AppendableKnowledgeEvent, EventLedger } from "../src/event-ledger.js";

interface LedgerHarness {
  ledger: EventLedger;
  cleanup?: () => void | Promise<void>;
}

interface LedgerContractOptions {
  createLedger: () => LedgerHarness | Promise<LedgerHarness>;
  supportsGlobalOrder?: boolean;
}

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_ledger_contract",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

export function evidenceEvent(evidenceId: string): AppendableKnowledgeEvent<"evidence.ingested"> {
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

function evidencePayload(event: KnowledgeEvent): { evidenceId: string; sizeBytes: number } {
  return event.payload as { evidenceId: string; sizeBytes: number };
}

async function useLedger<T>(
  createLedger: LedgerContractOptions["createLedger"],
  run: (ledger: EventLedger) => Promise<T>
): Promise<T> {
  const harness = await createLedger();

  try {
    return await run(harness.ledger);
  } finally {
    await harness.cleanup?.();
  }
}

export function describeEventLedgerContract(name: string, options: LedgerContractOptions): void {
  describe(name, () => {
    it("assigns per-stream sequences", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        const first = await ledger.append(evidenceEvent("ev_contract_001"));
        const second = await ledger.append(evidenceEvent("ev_contract_001"));
        const otherStream = await ledger.append(evidenceEvent("ev_contract_002"));

        expect(first.id).toMatch(/^evt_/);
        expect(first.sequence).toBe(1);
        expect(second.sequence).toBe(2);
        expect(otherStream.sequence).toBe(1);
      });
    });

    const globalOrderIt = options.supportsGlobalOrder === false ? it.skip : it;
    globalOrderIt("readAll preserves global append order across streams", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        const first = await ledger.append(evidenceEvent("ev_contract_003"));
        const second = await ledger.append(evidenceEvent("ev_contract_004"));
        const third = await ledger.append(evidenceEvent("ev_contract_003"));

        const allEvents = await ledger.readAll();

        expect(allEvents.map((event) => event.id)).toEqual([first.id, second.id, third.id]);
        expect(allEvents.map((event) => event.sequence)).toEqual([1, 1, 2]);
      });
    });

    it("readStream filters by stream and preserves stream order", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        const first = await ledger.append(evidenceEvent("ev_contract_005"));
        await ledger.append(evidenceEvent("ev_contract_006"));
        const second = await ledger.append(evidenceEvent("ev_contract_005"));

        const streamEvents = await ledger.readStream("evidence_ev_contract_005");

        expect(streamEvents.map((event) => event.id)).toEqual([first.id, second.id]);
        expect(streamEvents.map((event) => event.sequence)).toEqual([1, 2]);
      });
    });

    it("rejects optimistic concurrency conflicts", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        await ledger.append(evidenceEvent("ev_contract_007"), { expectedNextSequence: 1 });

        await expect(ledger.append(evidenceEvent("ev_contract_007"), { expectedNextSequence: 1 })).rejects.toThrow(
          "Concurrency conflict"
        );
      });
    });

    it("rejects invalid appends without mutating stored state", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        await ledger.append(evidenceEvent("ev_contract_008"));

        await expect(
          ledger.append({
            ...evidenceEvent("ev_contract_009"),
            payload: {
              ...evidenceEvent("ev_contract_009").payload,
              evidenceId: "not-valid"
            }
          })
        ).rejects.toThrow("Invalid knowledge event");

        const allEvents = await ledger.readAll();

        expect(allEvents).toHaveLength(1);
        expect(evidencePayload(allEvents[0] as KnowledgeEvent).evidenceId).toBe("ev_contract_008");
      });
    });

    it("returns append and read snapshots that cannot mutate stored events", async () => {
      await useLedger(options.createLedger, async (ledger) => {
        const appended = await ledger.append(evidenceEvent("ev_contract_010"));
        evidencePayload(appended).sizeBytes = 999;

        const firstRead = await ledger.readStream("evidence_ev_contract_010");
        expect(evidencePayload(firstRead[0] as KnowledgeEvent).sizeBytes).toBe(128);

        evidencePayload(firstRead[0] as KnowledgeEvent).sizeBytes = 777;

        const secondRead = await ledger.readStream("evidence_ev_contract_010");
        expect(evidencePayload(secondRead[0] as KnowledgeEvent).sizeBytes).toBe(128);
      });
    });
  });
}
