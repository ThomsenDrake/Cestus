import { describe, expect, it } from "vitest";
import {
  assertionExtractionQueueItemSchema,
  InMemoryAssertionExtractionQueue,
  type AssertionExtractionQueueItem
} from "../src/extraction-queue.js";

function queueItem(overrides: Partial<AssertionExtractionQueueItem> = {}): AssertionExtractionQueueItem {
  return {
    queueItemId: "q_prr_001",
    prrRequestId: "prr_req_001",
    evidenceId: "ev_prr_production_001",
    jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
    extractionMode: "production-metadata",
    priority: "normal",
    ...overrides
  };
}

describe("AssertionExtractionQueue", () => {
  it("queues production evidence for future assertion extraction", async () => {
    const queue = new InMemoryAssertionExtractionQueue();

    await queue.enqueue(queueItem());

    expect(await queue.list()).toEqual([queueItem()]);
  });

  it("rejects duplicate queue item IDs", async () => {
    const queue = new InMemoryAssertionExtractionQueue();

    await queue.enqueue(queueItem());

    await expect(
      queue.enqueue(queueItem({ evidenceId: "ev_prr_production_002", priority: "high" }))
    ).rejects.toThrow(/already exists/);
  });

  it("validates IDs, extraction modes, and priorities with the schema", () => {
    const invalidItems = [
      queueItem({ queueItemId: "queue-001" }),
      queueItem({ prrRequestId: "request-001" }),
      queueItem({ evidenceId: "evidence-001" }),
      queueItem({ extractionMode: "full-text" as AssertionExtractionQueueItem["extractionMode"] }),
      queueItem({ priority: "urgent" as AssertionExtractionQueueItem["priority"] })
    ];

    for (const item of invalidItems) {
      expect(assertionExtractionQueueItemSchema.safeParse(item).success).toBe(false);
    }
  });

  it("returns clones so caller mutation cannot alter the internal queue", async () => {
    const queue = new InMemoryAssertionExtractionQueue();
    await queue.enqueue(queueItem());

    const listed = await queue.list();
    expect(listed).toHaveLength(1);

    const first = listed[0];
    if (first === undefined) {
      throw new Error("Expected one queued item");
    }
    first.priority = "high";
    first.jurisdictionPack.version = "mutated";

    expect(await queue.list()).toEqual([queueItem()]);
  });
});
