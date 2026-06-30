import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../src/blob-store.js";
import { EvidenceService } from "../src/evidence-service.js";
import { InMemoryEventLedger } from "../src/event-ledger.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-evidence-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("EvidenceService", () => {
  it("stores raw content and appends an evidence.ingested event", async () => {
    const blobStore = new FileBlobStore(dir);
    const ledger = new InMemoryEventLedger();
    const service = new EvidenceService({ blobStore, ledger });
    const content = Buffer.from("public record body");

    const event = await service.ingest({
      evidenceId: "ev_service_001",
      content,
      mediaType: "text/plain",
      source: { kind: "file", label: "record.txt", uri: "file:///records/record.txt" },
      actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" }
    });

    const storedContent = await blobStore.get(event.payload.contentHash as `sha256:${string}`);
    const streamEvents = await ledger.readStream("evidence_ev_service_001");

    expect(storedContent.toString("utf8")).toBe("public record body");
    expect(streamEvents).toHaveLength(1);
    expect(streamEvents[0]).toEqual(event);
    expect(event).toMatchObject({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_service_001",
      sequence: 1,
      context: {
        actor: { id: "actor_reviewer", kind: "human", label: "Reviewer" },
        correlationId: "corr_ev_service_001",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_service_001",
        source: { kind: "file", label: "record.txt", uri: "file:///records/record.txt" },
        mediaType: "text/plain",
        sizeBytes: content.byteLength
      }
    });
    expect(event.context.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(event.payload.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
