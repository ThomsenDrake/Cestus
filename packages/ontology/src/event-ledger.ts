import { createHash, randomUUID } from "node:crypto";
import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "./contracts.js";

export type { AppendableKnowledgeEvent } from "./contracts.js";

export interface AppendOptions {
  expectedNextSequence?: number;
  expectedGlobalEventCount?: number;
}

export interface AppendBatchOptions {
  decisionId: string;
  expectedGlobalEventCount: number;
  /** Expected next sequence before this decision, for each guarded stream. */
  expectedNextSequences?: Record<string, number>;
}

/** Validate bounds and fingerprint canonical JSON, independent of object-key order. */
export function prepareAppendBatch(events: AppendableKnowledgeEvent[], options: AppendBatchOptions): {
  events: AppendableKnowledgeEvent[];
  fingerprint: string;
} {
  if (!Array.isArray(events) || events.length < 1 || events.length > 100 ||
    !options || typeof options.decisionId !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(options.decisionId) ||
    !Number.isSafeInteger(options.expectedGlobalEventCount) || options.expectedGlobalEventCount < 0) {
    throw new Error("Invalid batch: require 1–100 events, a stable decision identity, and a nonnegative revision.");
  }
  if (options.expectedNextSequences !== undefined &&
    (options.expectedNextSequences === null || typeof options.expectedNextSequences !== "object" ||
      Array.isArray(options.expectedNextSequences) || Object.keys(options.expectedNextSequences).length > 100 ||
      Object.entries(options.expectedNextSequences).some(([stream, sequence]) =>
        !stream || !Number.isSafeInteger(sequence) || sequence < 1))) {
    throw new Error("Invalid batch: stream preconditions must be positive integer sequences.");
  }
  const snapshot = cloneSnapshot(events);
  const serialized = JSON.stringify(snapshot, (_key, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    }
    return value;
  });
  if (Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Invalid batch: serialized events exceed 2 MiB.");
  }
  return { events: snapshot, fingerprint: createHash("sha256").update(serialized).digest("hex") };
}

export interface EventLedger {
  append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent>;
  /** Retry with identical event content returns the original committed decision. */
  appendBatch(events: AppendableKnowledgeEvent[], options: AppendBatchOptions): Promise<KnowledgeEvent[]>;
  readStream(streamId: string): Promise<KnowledgeEvent[]>;
  readAll(): Promise<KnowledgeEvent[]>;
}

export class ConcurrencyConflictError extends Error {
  readonly code = "CONCURRENCY_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}

export function isConcurrencyConflict(error: unknown): error is ConcurrencyConflictError {
  return error instanceof ConcurrencyConflictError;
}

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryEventLedger implements EventLedger {
  private readonly events: KnowledgeEvent[] = [];
  private readonly decisions = new Map<string, { fingerprint: string; events: KnowledgeEvent[] }>();

  async appendBatch(events: AppendableKnowledgeEvent[], options: AppendBatchOptions): Promise<KnowledgeEvent[]> {
    const prepared = prepareAppendBatch(events, options);
    const receipt = this.decisions.get(options.decisionId);
    if (receipt) {
      if (receipt.fingerprint !== prepared.fingerprint) {
        throw new ConcurrencyConflictError("Concurrency conflict: decision identity already has different content.");
      }
      return cloneSnapshot(receipt.events);
    }
    if (options.expectedGlobalEventCount !== this.events.length) {
      throw new ConcurrencyConflictError("Concurrency conflict: batch global revision is stale.");
    }
    const sequences = new Map<string, number>();
    for (const stored of this.events) sequences.set(stored.streamId, stored.sequence + 1);
    for (const [stream, expected] of Object.entries(options.expectedNextSequences ?? {})) {
      if ((sequences.get(stream) ?? 1) !== expected) {
        throw new ConcurrencyConflictError("Concurrency conflict: batch stream revision is stale.");
      }
    }
    const committed = prepared.events.map((event) => {
      const sequence = sequences.get(event.streamId) ?? 1;
      const result = validateKnowledgeEvent({ ...event, id: `evt_${randomUUID().replaceAll("-", "")}`, sequence });
      if (!result.success) throw new Error(`Invalid knowledge event: ${result.error.message}`);
      sequences.set(event.streamId, sequence + 1);
      return cloneSnapshot(result.data);
    });
    // No await or externally supplied callback between preparation and commit.
    this.events.push(...committed);
    this.decisions.set(options.decisionId, { fingerprint: prepared.fingerprint, events: committed });
    return cloneSnapshot(committed);
  }

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    const globalEventCount = this.events.length;
    const nextSequence = this.events.filter((stored) => stored.streamId === event.streamId).length + 1;

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
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      sequence: nextSequence
    };
    const result = validateKnowledgeEvent(candidate);

    if (!result.success) {
      throw new Error(`Invalid knowledge event: ${result.error.message}`);
    }

    const committed = cloneSnapshot(result.data);
    this.events.push(committed);
    return cloneSnapshot(committed);
  }

  async readStream(streamId: string): Promise<KnowledgeEvent[]> {
    return this.events
      .filter((event) => event.streamId === streamId)
      .map((event) => cloneSnapshot(event));
  }

  async readAll(): Promise<KnowledgeEvent[]> {
    return this.events.map((event) => cloneSnapshot(event));
  }
}
