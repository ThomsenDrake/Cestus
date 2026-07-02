import { z } from "zod";

export const assertionExtractionQueueItemSchema = z.object({
  queueItemId: z.string().regex(/^q_[a-zA-Z0-9_-]+$/),
  prrRequestId: z.string().regex(/^prr_[a-zA-Z0-9_-]+$/),
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  jurisdictionPack: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }).strict(),
  extractionMode: z.enum(["production-metadata", "correspondence-metadata"]),
  priority: z.enum(["low", "normal", "high"])
}).strict();

export type AssertionExtractionQueueItem = z.infer<typeof assertionExtractionQueueItemSchema>;

export class InMemoryAssertionExtractionQueue {
  private readonly items: AssertionExtractionQueueItem[] = [];

  async enqueue(item: AssertionExtractionQueueItem): Promise<void> {
    const parsed = assertionExtractionQueueItemSchema.parse(item);

    if (this.items.some((existing) => existing.queueItemId === parsed.queueItemId)) {
      throw new Error(`Extraction queue item ${parsed.queueItemId} already exists`);
    }

    this.items.push(structuredClone(parsed));
  }

  async list(): Promise<AssertionExtractionQueueItem[]> {
    return this.items.map((item) => structuredClone(item));
  }
}
