import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrEvidenceBridge } from "../src/evidence-bridge.js";

const actor = { id: "actor_system", kind: "system" as const, label: "PRR evidence bridge" };

function createBridge() {
  const ledger = new InMemoryEventLedger();
  const blobStore = new FileBlobStore(join(mkdtempSync(join(tmpdir(), "prr-bridge-")), "blobs"));
  const bridge = new PrrEvidenceBridge({ ledger, blobStore, actor });
  return { bridge, blobStore, ledger };
}

describe("PrrEvidenceBridge", () => {
  it("ingests a production file as evidence with PRR source metadata", async () => {
    const { bridge } = createBridge();

    const event = await bridge.ingestProductionArtifact({
      prrRequestId: "prr_req_001",
      evidenceId: "ev_prr_production_001",
      filename: "contracts.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("contract bytes")
    });

    expect(event.type).toBe("evidence.ingested");
    expect(event.payload.evidenceId).toBe("ev_prr_production_001");
    expect(event.payload.source).toEqual({
      kind: "file",
      label: "PRR production contracts.pdf",
      uri: "cestus:prr/prr_req_001/productions/contracts.pdf"
    });
    expect(event.payload.mediaType).toBe("application/pdf");
    expect(event.payload.sizeBytes).toBe(Buffer.byteLength("contract bytes"));
  });

  it("stores raw bytes retrievable by content hash", async () => {
    const { blobStore, bridge } = createBridge();
    const content = Buffer.from("responsive production bytes");

    const event = await bridge.ingestProductionArtifact({
      prrRequestId: "prr_req_001",
      evidenceId: "ev_prr_production_002",
      filename: "responsive-records.txt",
      mediaType: "text/plain",
      content
    });

    const contentHash = event.payload.contentHash as `sha256:${string}`;
    await expect(blobStore.get(contentHash)).resolves.toEqual(content);
  });

  it("rejects invalid production artifact inputs before ingestion", async () => {
    const invalidInputs = [
      {
        label: "bad PRR request ID",
        input: {
          prrRequestId: "request-001",
          evidenceId: "ev_prr_production_003",
          filename: "contracts.pdf",
          mediaType: "application/pdf",
          content: Buffer.from("contract bytes")
        },
        error: /Invalid PRR request ID/
      },
      {
        label: "bad evidence ID",
        input: {
          prrRequestId: "prr_req_001",
          evidenceId: "evidence-003",
          filename: "contracts.pdf",
          mediaType: "application/pdf",
          content: Buffer.from("contract bytes")
        },
        error: /Invalid evidence ID/
      },
      {
        label: "blank filename",
        input: {
          prrRequestId: "prr_req_001",
          evidenceId: "ev_prr_production_003",
          filename: "   ",
          mediaType: "application/pdf",
          content: Buffer.from("contract bytes")
        },
        error: /filename/
      },
      {
        label: "blank media type",
        input: {
          prrRequestId: "prr_req_001",
          evidenceId: "ev_prr_production_003",
          filename: "contracts.pdf",
          mediaType: " ",
          content: Buffer.from("contract bytes")
        },
        error: /media type/
      },
      {
        label: "empty content",
        input: {
          prrRequestId: "prr_req_001",
          evidenceId: "ev_prr_production_003",
          filename: "contracts.pdf",
          mediaType: "application/pdf",
          content: Buffer.alloc(0)
        },
        error: /content/
      }
    ];

    for (const { error, input, label } of invalidInputs) {
      const { bridge, ledger } = createBridge();

      await expect(bridge.ingestProductionArtifact(input), label).rejects.toThrow(error);
      await expect(ledger.readAll(), label).resolves.toEqual([]);
    }
  });
});
