import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrEvidenceBridge } from "../src/evidence-bridge.js";

const actor = { id: "actor_system", kind: "system" as const, label: "PRR evidence bridge" };

function createBridge() {
  const ledger = new InMemoryEventLedger();
  const blobRoot = join(mkdtempSync(join(tmpdir(), "prr-bridge-")), "blobs");
  const blobStore = new FileBlobStore(blobRoot);
  const bridge = new PrrEvidenceBridge({ ledger, blobStore, actor });
  return { blobRoot, blobStore, bridge, ledger };
}

function listFiles(rootDir: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(rootDir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
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
      filename: "contracts_2024-final.pdf",
      mediaType: "text/plain",
      content
    });

    expect(event.payload.source.uri).toBe("cestus:prr/prr_req_001/productions/contracts_2024-final.pdf");
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

  it("rejects unsafe production filenames before blob storage or ledger append", async () => {
    const unsafeFilenames = [
      "../appeal.pdf",
      "folder/contracts.pdf",
      "folder\\contracts.pdf",
      "contract.pdf#v2",
      "contract.pdf?x=y",
      "contract%2Ffinal.pdf",
      "a:b.pdf",
      "a@b.pdf",
      "a;b.pdf",
      "a=b.pdf",
      "[draft].pdf",
      " contracts.pdf",
      "contracts.pdf ",
      ".",
      "..",
      "contract\u0000.pdf",
      "contract\u001f.pdf",
      "   "
    ];

    for (const filename of unsafeFilenames) {
      const { blobRoot, bridge, ledger } = createBridge();

      await expect(
        bridge.ingestProductionArtifact({
          prrRequestId: "prr_req_001",
          evidenceId: "ev_prr_production_004",
          filename,
          mediaType: "application/pdf",
          content: Buffer.from("contract bytes")
        }),
        filename
      ).rejects.toThrow(/filename/);
      await expect(ledger.readAll(), filename).resolves.toEqual([]);
      expect(listFiles(blobRoot), filename).toEqual([]);
    }
  });

  it("rejects an invalid actor before blob storage or ledger append", async () => {
    const ledger = new InMemoryEventLedger();
    const blobRoot = join(mkdtempSync(join(tmpdir(), "prr-bridge-")), "blobs");
    const blobStore = new FileBlobStore(blobRoot);

    expect(
      () =>
        new PrrEvidenceBridge({
          ledger,
          blobStore,
          actor: { id: "x", kind: "system", label: "" } as never
        })
    ).toThrow(/actor/);

    await expect(ledger.readAll()).resolves.toEqual([]);
    expect(listFiles(blobRoot)).toEqual([]);
  });
});
