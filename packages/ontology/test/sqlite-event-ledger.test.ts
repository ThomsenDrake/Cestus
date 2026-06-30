import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../src/sqlite-event-ledger.js";
import type { AppendableKnowledgeEvent } from "../src/event-ledger.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-ledger-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const context = {
  actor: { id: "actor_system", kind: "system" as const, label: "test runner" },
  occurredAt: "2026-06-30T17:00:00.000Z",
  correlationId: "corr_sqlite",
  coreVersion: "0.1.0",
  packVersions: { core: "0.1.0" }
};

function evidenceEvent(evidenceId: string): AppendableKnowledgeEvent<"evidence.ingested"> {
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

describe("SQLiteEventLedger", () => {
  it("persists and reopens committed events", async () => {
    const dbPath = join(dir, "ontology.db");
    const ledger = new SQLiteEventLedger(dbPath);
    const committed = await ledger.append(evidenceEvent("ev_sqlite_001"));
    ledger.close();

    const reopened = new SQLiteEventLedger(dbPath);
    const events = await reopened.readAll();
    reopened.close();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(committed.id);
    expect(events[0]?.sequence).toBe(1);
  });

  it("enforces stream sequence uniqueness", async () => {
    const ledger = new SQLiteEventLedger(join(dir, "ontology.db"));
    await ledger.append(evidenceEvent("ev_sqlite_002"), { expectedNextSequence: 1 });

    await expect(ledger.append(evidenceEvent("ev_sqlite_002"), { expectedNextSequence: 1 })).rejects.toThrow(
      "Concurrency conflict"
    );

    ledger.close();
  });

  it("preserves global append order across streams", async () => {
    const ledger = new SQLiteEventLedger(join(dir, "ontology.db"));
    const first = await ledger.append(evidenceEvent("ev_sqlite_003"));
    const second = await ledger.append(evidenceEvent("ev_sqlite_004"));
    const third = await ledger.append(evidenceEvent("ev_sqlite_003"));

    const allEvents = await ledger.readAll();
    ledger.close();

    expect(allEvents.map((event) => event.id)).toEqual([first.id, second.id, third.id]);
    expect(allEvents.map((event) => event.sequence)).toEqual([1, 1, 2]);
  });

  it("does not mutate stored state when append validation fails", async () => {
    const ledger = new SQLiteEventLedger(join(dir, "ontology.db"));
    await ledger.append(evidenceEvent("ev_sqlite_005"));

    await expect(
      ledger.append({
        ...evidenceEvent("ev_sqlite_006"),
        payload: {
          ...evidenceEvent("ev_sqlite_006").payload,
          evidenceId: "not-valid"
        }
      })
    ).rejects.toThrow("Invalid knowledge event");

    const allEvents = await ledger.readAll();
    ledger.close();

    expect(allEvents).toHaveLength(1);
    expect((allEvents[0]?.payload as { evidenceId: string } | undefined)?.evidenceId).toBe("ev_sqlite_005");
  });
});
