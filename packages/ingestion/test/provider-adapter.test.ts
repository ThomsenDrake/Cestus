import { describe, expect, it } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildIngestionProjection } from "../src/projection.js";
import { FakeDocumentAiProvider, ProviderParseApprovalService } from "../src/provider-adapter.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("provider parser approval gate", () => {
  it("records batch approval before provider parsing is allowed without persisting secret-shaped fields", async () => {
    const ledger = new InMemoryEventLedger();
    const approvals = new ProviderParseApprovalService({
      ledger,
      actor
    });

    const event = await approvals.approveProviderBatch({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-05T17:30:00.000Z",
      eligibleMediaTypes: ["application/pdf", "image/png"],
      maxBytesPerFile: 50000000
    });

    expect(event.type).toBe("ingestion.provider.approved");
    expect(event.payload).toMatchObject({
      providerJobId: "provider_001",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      approvedAt: "2026-07-05T17:30:00.000Z",
      eligibleMediaTypes: ["application/pdf", "image/png"],
      maxBytesPerFile: 50000000,
      policy: "send-all-technically-eligible"
    });
    expect(validateKnowledgeEvent(event).success).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/token|secret|password/i);

    const projection = buildIngestionProjection(await ledger.readAll());
    expect(projection.providerApprovals.get("provider_001")).toMatchObject({
      approvedEventId: event.id,
      policy: "send-all-technically-eligible"
    });
  });

  it("fake provider parses eligible files and rejects oversized files", async () => {
    const provider = new FakeDocumentAiProvider({
      name: "mistral-document-ai",
      supportedMediaTypes: ["application/pdf"],
      maxBytesPerFile: 10
    });

    await expect(
      provider.parse({
        evidenceId: "ev_pdf",
        mediaType: "application/pdf",
        content: Buffer.from("12345")
      })
    ).resolves.toEqual({ text: "fake parsed text for ev_pdf", warnings: [] });

    await expect(
      provider.parse({
        evidenceId: "ev_big",
        mediaType: "application/pdf",
        content: Buffer.from("12345678901")
      })
    ).rejects.toThrow(/oversized/i);
  });

  it("fake provider rejects unsupported media types before parsing", async () => {
    const provider = new FakeDocumentAiProvider({
      name: "mistral-document-ai",
      supportedMediaTypes: ["application/pdf"],
      maxBytesPerFile: 10
    });

    await expect(
      provider.parse({
        evidenceId: "ev_png",
        mediaType: "image/png",
        content: Buffer.from("12345")
      })
    ).rejects.toThrow(/unsupported media type/i);
  });
});
