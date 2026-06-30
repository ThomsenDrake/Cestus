import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateKnowledgeEvent, type KnowledgeEvent } from "./contracts.js";
import type { AppendableKnowledgeEvent, AppendOptions, EventLedger } from "./event-ledger.js";

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
    const nextSequence = this.nextSequence(event.streamId);

    if (options.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(
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
        throw new Error(`Concurrency conflict for ${event.streamId}: sequence ${nextSequence} already exists`);
      }
      throw error;
    }

    return cloneSnapshot(committed);
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
}
