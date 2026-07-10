import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { ConcurrencyConflictError } from "../src/event-ledger.js";
import { SQLiteEventLedger } from "../src/sqlite-event-ledger.js";
import { describeEventLedgerContract, evidenceEvent } from "./ledger-contract.test-helper.js";

const dirs: string[] = [];

function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-ledger-"));
  dirs.push(dir);
  return join(dir, "ontology.db");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describeEventLedgerContract("SQLiteEventLedger", {
  createLedger: () => {
    const ledger = new SQLiteEventLedger(dbPath());
    return {
      ledger,
      cleanup: () => ledger.close()
    };
  }
});

describe("SQLiteEventLedger", () => {
  it("throws a structured concurrency error while preserving the message", async () => {
    const ledger = new SQLiteEventLedger(dbPath());
    await ledger.append(evidenceEvent("ev_sqlite_conflict"));

    await expect(ledger.append(evidenceEvent("ev_sqlite_conflict"), { expectedNextSequence: 1 }))
      .rejects.toBeInstanceOf(ConcurrencyConflictError);
    await expect(ledger.append(evidenceEvent("ev_sqlite_conflict"), { expectedNextSequence: 1 }))
      .rejects.toThrow("Concurrency conflict");

    ledger.close();
  });

  it("persists and reopens committed events", async () => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    const committed = await ledger.append(evidenceEvent("ev_sqlite_001"));
    ledger.close();

    const reopened = new SQLiteEventLedger(path);
    const events = await reopened.readAll();
    reopened.close();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(committed.id);
    expect(events[0]?.sequence).toBe(1);
  });

  it("allocates the next stream sequence from the stored max sequence", async () => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    await ledger.append(evidenceEvent("ev_sqlite_002"));
    await ledger.append(evidenceEvent("ev_sqlite_002"));
    ledger.close();

    const db = new DatabaseSync(path);
    db.prepare("DELETE FROM ontology_events WHERE stream_id = ? AND stream_sequence = ?").run(
      "evidence_ev_sqlite_002",
      1
    );
    db.close();

    const reopened = new SQLiteEventLedger(path);
    const committed = await reopened.append(evidenceEvent("ev_sqlite_002"));
    reopened.close();

    expect(committed.sequence).toBe(3);
  });

  it("rejects invalid persisted payloads at read time", async () => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    const committed = await ledger.append(evidenceEvent("ev_sqlite_003"));
    ledger.close();

    const db = new DatabaseSync(path);
    db.prepare("UPDATE ontology_events SET payload_json = ? WHERE id = ?").run(
      JSON.stringify({ evidenceId: "not-valid" }),
      committed.id
    );
    db.close();

    const reopened = new SQLiteEventLedger(path);
    await expect(reopened.readAll()).rejects.toThrow(`Stored knowledge event ${committed.id} is invalid`);
    reopened.close();
  });

  it("keeps stream sequence uniqueness at the SQLite constraint layer", async () => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    const committed = await ledger.append(evidenceEvent("ev_sqlite_004"));
    ledger.close();

    const db = new DatabaseSync(path);

    expect(() => {
      db.prepare(`
        INSERT INTO ontology_events (id, type, version, stream_id, stream_sequence, context_json, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "evt_direct_duplicate_sequence",
        committed.type,
        committed.version,
        committed.streamId,
        committed.sequence,
        JSON.stringify(committed.context),
        JSON.stringify(committed.payload)
      );
    }).toThrow(/constraint/i);

    db.close();
  });

  it("blocks interleaved SQLite writers from slipping past expected global event count guards", async () => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    await ledger.append(evidenceEvent("ev_sqlite_005a"));

    const otherDb = new DatabaseSync(path);
    const originalNextSequence = (
      ledger as unknown as { nextSequence: (streamId: string) => number }
    ).nextSequence.bind(ledger);
    let interleavedOutcome: "blocked" | "committed" | undefined;

    (ledger as unknown as { nextSequence: (streamId: string) => number }).nextSequence = (streamId: string) => {
      try {
        const interleaved = evidenceEvent("ev_sqlite_005b");
        otherDb
          .prepare(`
            INSERT INTO ontology_events (id, type, version, stream_id, stream_sequence, context_json, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            "evt_interleaved_global_count_guard",
            interleaved.type,
            interleaved.version,
            interleaved.streamId,
            1,
            JSON.stringify(interleaved.context),
            JSON.stringify(interleaved.payload)
          );
        interleavedOutcome = "committed";
      } catch {
        interleavedOutcome = "blocked";
      }

      return originalNextSequence(streamId);
    };

    const committed = await ledger.append(evidenceEvent("ev_sqlite_005c"), {
      expectedGlobalEventCount: 1
    });

    const allEvents = await ledger.readAll();

    expect(committed.sequence).toBe(1);
    expect(interleavedOutcome).toBe("blocked");
    expect(allEvents.map((event) => event.payload)).toEqual([
      expect.objectContaining({ evidenceId: "ev_sqlite_005a" }),
      expect.objectContaining({ evidenceId: "ev_sqlite_005c" })
    ]);

    otherDb.close();
    ledger.close();
  });
});
