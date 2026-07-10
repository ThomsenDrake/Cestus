import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateKnowledgeEvent, type KnowledgeEvent } from "./contracts.js";
import {
  ConcurrencyConflictError,
  type AppendableKnowledgeEvent,
  type AppendOptions,
  type EventLedger
} from "./event-ledger.js";

interface StoredEventRow {
  id: string;
  type: string;
  version: number;
  stream_id: string;
  stream_sequence: number;
  context_json: string;
  payload_json: string;
}

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function eventId(): string {
  return `evt_${randomUUID().replaceAll("-", "")}`;
}

export class SQLiteEventLedger implements EventLedger {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ontology_events (
        global_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        version INTEGER NOT NULL,
        stream_id TEXT NOT NULL,
        stream_sequence INTEGER NOT NULL,
        context_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stream_id, stream_sequence)
      );
    `);
  }

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    let transactionOpen = false;

    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;

      const globalEventCount = this.globalEventCount();
      const nextSequence = this.nextSequence(event.streamId);

      if (options.expectedGlobalEventCount !== undefined && options.expectedGlobalEventCount !== globalEventCount) {
        throw new ConcurrencyConflictError(
          `Concurrency conflict for ${event.streamId}: expected global event count ${options.expectedGlobalEventCount}, current global event count ${globalEventCount}`
        );
      }

      if (options.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
        throw new ConcurrencyConflictError(
          `Concurrency conflict for ${event.streamId}: expected sequence ${options.expectedNextSequence}, next sequence ${nextSequence}`
        );
      }

      const candidate = {
        ...cloneSnapshot(event),
        id: eventId(),
        sequence: nextSequence
      };
      const result = validateKnowledgeEvent(candidate);

      if (!result.success) {
        throw new Error(`Invalid knowledge event: ${result.error.message}`);
      }

      const committed = cloneSnapshot(result.data);

      try {
        this.db
          .prepare(`
            INSERT INTO ontology_events (id, type, version, stream_id, stream_sequence, context_json, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            committed.id,
            committed.type,
            committed.version,
            committed.streamId,
            committed.sequence,
            JSON.stringify(committed.context),
            JSON.stringify(committed.payload)
          );
      } catch (error) {
        if (this.isConstraintError(error)) {
          throw new ConcurrencyConflictError(
            `Concurrency conflict for ${event.streamId}: sequence ${nextSequence} already exists`
          );
        }
        throw error;
      }

      this.db.exec("COMMIT");
      transactionOpen = false;

      return cloneSnapshot(committed);
    } catch (error) {
      if (transactionOpen) {
        this.rollbackTransaction();
      }
      if (this.isContentionError(error)) {
        throw new ConcurrencyConflictError(`Concurrency conflict for ${event.streamId}: SQLite database contention`);
      }
      throw error;
    }
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    const rows = this.db
      .prepare(`
        SELECT id, type, version, stream_id, stream_sequence, context_json, payload_json
        FROM ontology_events
        WHERE stream_id = ?
        ORDER BY stream_sequence ASC
      `)
      .all(streamId) as unknown as StoredEventRow[];

    return rows.map((row) => this.eventFromRow(row));
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    const rows = this.db
      .prepare(`
        SELECT id, type, version, stream_id, stream_sequence, context_json, payload_json
        FROM ontology_events
        ORDER BY global_sequence ASC
      `)
      .all() as unknown as StoredEventRow[];

    return rows.map((row) => this.eventFromRow(row));
  }

  close(): void {
    this.db.close();
  }

  private nextSequence(streamId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(stream_sequence), 0) + 1 AS next_sequence FROM ontology_events WHERE stream_id = ?")
      .get(streamId) as { next_sequence: number | bigint } | undefined;

    return Number(row?.next_sequence ?? 1);
  }

  private globalEventCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS event_count FROM ontology_events")
      .get() as { event_count: number | bigint } | undefined;

    return Number(row?.event_count ?? 0);
  }

  private eventFromRow(row: StoredEventRow): KnowledgeEvent {
    let context: unknown;
    let payload: unknown;

    try {
      context = JSON.parse(row.context_json);
      payload = JSON.parse(row.payload_json);
    } catch (error) {
      throw new Error(`Stored knowledge event ${row.id} is invalid JSON: ${(error as Error).message}`);
    }

    const result = validateKnowledgeEvent({
      id: row.id,
      type: row.type,
      version: row.version,
      streamId: row.stream_id,
      sequence: row.stream_sequence,
      context,
      payload
    });

    if (!result.success) {
      throw new Error(`Stored knowledge event ${row.id} is invalid: ${result.error.message}`);
    }

    return cloneSnapshot(result.data);
  }

  private isConstraintError(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ERR_SQLITE_ERROR" &&
      error.message.includes("constraint")
    );
  }

  private isContentionError(error: unknown): boolean {
    return error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ERR_SQLITE_ERROR" &&
      /database is (?:busy|locked)|SQLITE_(?:BUSY|LOCKED)/i.test(error.message);
  }

  private rollbackTransaction(): void {
    try {
      this.db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures while preserving the original append error.
    }
  }
}
