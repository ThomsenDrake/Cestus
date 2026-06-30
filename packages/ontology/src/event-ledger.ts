import { randomUUID } from "node:crypto";
import {
  validateKnowledgeEvent,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent
} from "./contracts.js";

export type { AppendableKnowledgeEvent } from "./contracts.js";

export interface AppendOptions {
  expectedNextSequence?: number;
}

export interface EventLedger {
  append(event: AppendableKnowledgeEvent, options?: AppendOptions): Promise<KnowledgeEvent>;
  readStream(streamId: string): Promise<KnowledgeEvent[]>;
  readAll(): Promise<KnowledgeEvent[]>;
}

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryEventLedger implements EventLedger {
  private readonly events: KnowledgeEvent[] = [];

  async append(event: AppendableKnowledgeEvent, options: AppendOptions = {}): Promise<KnowledgeEvent> {
    const nextSequence = this.events.filter((stored) => stored.streamId === event.streamId).length + 1;

    if (options.expectedNextSequence !== undefined && options.expectedNextSequence !== nextSequence) {
      throw new Error(
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
