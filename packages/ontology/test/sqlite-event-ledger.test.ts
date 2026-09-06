import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { ConcurrencyConflictError, isConcurrencyConflict } from "../src/event-ledger.js";
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
  it.each(["second event", "decision receipt"])("rolls back the whole batch when SQLite interrupts the %s write", async (point) => {
    const path = dbPath();
    const ledger = new SQLiteEventLedger(path);
    const injection = new DatabaseSync(path);
    const target = point === "second event" ? "ontology_events" : "ontology_decisions";
    const condition = point === "second event" ? "WHEN NEW.stream_id = 'evidence_ev_interrupt_second'" : "";
    injection.exec(`CREATE TRIGGER interrupt_decision BEFORE INSERT ON ${target} ${condition}
      BEGIN SELECT RAISE(ABORT, 'injected transaction interruption'); END;`);
    const events = [evidenceEvent("ev_interrupt_first"), evidenceEvent("ev_interrupt_second")];
    const decision = { decisionId: "decision_interrupt", expectedGlobalEventCount: 0 };
    await expect(ledger.appendBatch(events, decision)).rejects.toThrow("injected transaction interruption");
    expect(await ledger.readAll()).toEqual([]);
    expect(injection.prepare("SELECT COUNT(*) AS n FROM ontology_decisions").get()).toEqual({ n: 0 });
    injection.exec("DROP TRIGGER interrupt_decision");
    injection.close();
    ledger.close();

    const reopened = new SQLiteEventLedger(path);
    const committed = await reopened.appendBatch(events, decision);
    expect(committed.map((event) => event.sequence)).toEqual([1, 1]);
    expect(await reopened.appendBatch(events, decision)).toEqual(committed);
    expect(await reopened.readAll()).toEqual(committed);
    reopened.close();
  });

  it("recovers without half a decision after the writer process exits immediately before COMMIT", async () => {
    const path = dbPath();
    const events = [evidenceEvent("ev_crash_first"), evidenceEvent("ev_crash_second")];
    const decision = { decisionId: "decision_process_crash", expectedGlobalEventCount: 0 };
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { SQLiteEventLedger } from ${JSON.stringify(new URL("../src/sqlite-event-ledger.ts", import.meta.url).href)};
      const ledger = new SQLiteEventLedger(process.argv[1]);
      const originalExec = ledger.db.exec.bind(ledger.db);
      ledger.db.exec = (statement) => {
        if (statement === "COMMIT") process.exit(71);
        return originalExec(statement);
      };
      await ledger.appendBatch(JSON.parse(process.argv[2]), JSON.parse(process.argv[3]));
    `, path, JSON.stringify(events), JSON.stringify(decision)], { encoding: "utf8", timeout: 10_000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(71);
    const recovered = new SQLiteEventLedger(path);
    expect(await recovered.readAll()).toEqual([]);
    const committed = await recovered.appendBatch(events, decision);
    expect(committed.map((event) => event.sequence)).toEqual([1, 1]);
    expect(await recovered.appendBatch(events, decision)).toEqual(committed);
    expect(await recovered.readAll()).toHaveLength(2);
    recovered.close();
  });

  it("recovers decision receipts and rejects competing connections at a stale revision", async () => {
    const path = dbPath();
    const first = new SQLiteEventLedger(path);
    const second = new SQLiteEventLedger(path);
    const events = [evidenceEvent("ev_restart_first"), evidenceEvent("ev_restart_second")];
    const decision = { decisionId: "decision_restart", expectedGlobalEventCount: 0 };
    const committed = await first.appendBatch(events, decision);
    await expect(second.appendBatch([evidenceEvent("ev_competitor")], {
      decisionId: "decision_competitor", expectedGlobalEventCount: 0
    })).rejects.toBeInstanceOf(ConcurrencyConflictError);
    first.close();
    second.close();
    const reopened = new SQLiteEventLedger(path);
    await reopened.append(evidenceEvent("ev_after_restart"));
    expect(await reopened.appendBatch(events, decision)).toEqual(committed);
    expect(await reopened.readAll()).toHaveLength(3);
    reopened.close();
  });

  it("rolls back a guarded append when its synchronous precommit guard fails", async () => {
    const ledger = new SQLiteEventLedger(dbPath());
    const guardFailure = new Error("mounted workspace is no longer current");

    await expect(ledger.appendWithPrecommitGuard(
      evidenceEvent("ev_sqlite_guarded_rollback"),
      { expectedGlobalEventCount: 0, expectedNextSequence: 1 },
      () => {
        throw guardFailure;
      }
    )).rejects.toBe(guardFailure);
    expect(await ledger.readAll()).toEqual([]);

    const committed = await ledger.append(evidenceEvent("ev_sqlite_guarded_rollback"), {
      expectedGlobalEventCount: 0,
      expectedNextSequence: 1
    });
    expect(committed.sequence).toBe(1);
    ledger.close();
  });

  it("commits a guarded append through the canonical event path after its guard succeeds", async () => {
    const ledger = new SQLiteEventLedger(dbPath());
    let guardCalls = 0;

    const committed = await ledger.appendWithPrecommitGuard(
      evidenceEvent("ev_sqlite_guarded_commit"),
      { expectedGlobalEventCount: 0, expectedNextSequence: 1 },
      () => {
        guardCalls += 1;
      }
    );

    expect(guardCalls).toBe(1);
    expect(await ledger.readAll()).toEqual([committed]);
    ledger.close();
  });

  it("throws a structured concurrency error while preserving the message", async () => {
    const ledger = new SQLiteEventLedger(dbPath());
    await ledger.append(evidenceEvent("ev_sqlite_conflict"));

    await expect(ledger.append(evidenceEvent("ev_sqlite_conflict"), { expectedNextSequence: 1 }))
      .rejects.toBeInstanceOf(ConcurrencyConflictError);
    await expect(ledger.append(evidenceEvent("ev_sqlite_conflict"), { expectedNextSequence: 1 }))
      .rejects.toThrow("Concurrency conflict");

    ledger.close();
  });

  it("normalizes BEGIN IMMEDIATE locked errors as structured concurrency conflicts", async () => {
    const ledger = new SQLiteEventLedger(dbPath());
    const db = (ledger as unknown as { db: { exec(statement: string): void } }).db;
    const originalExec = db.exec.bind(db);

    db.exec = (statement: string) => {
      if (statement === "BEGIN IMMEDIATE") {
        throw Object.assign(new Error("database is locked"), { code: "ERR_SQLITE_ERROR" });
      }
      originalExec(statement);
    };

    try {
      await ledger.append(evidenceEvent("ev_sqlite_locked"));
      throw new Error("expected SQLite contention to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ConcurrencyConflictError);
      expect(isConcurrencyConflict(error)).toBe(true);
      expect((error as Error).message).toBe("Concurrency conflict for evidence_ev_sqlite_locked: SQLite database contention");
    } finally {
      ledger.close();
    }
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
