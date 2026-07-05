import { afterEach, describe, expect, it, vi } from "vitest";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { buildIngestionProjection } from "../src/projection.js";
import { FakeDocumentAiProvider, ProviderParseApprovalService } from "../src/provider-adapter.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

afterEach(() => {
  vi.useRealTimers();
});

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
    expect(projection.providerApprovals.get("ingestion_provider_src_drive_001_imp_001_provider_001")).toMatchObject({
      approvedEventId: event.id,
      policy: "send-all-technically-eligible"
    });
  });

  it("returns the existing provider approval when retried without an explicit approvedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T17:30:00.000Z"));
    const ledger = new InMemoryEventLedger();
    const approvals = new ProviderParseApprovalService({
      ledger,
      actor
    });
    const input = {
      providerJobId: "provider_002",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf"],
      maxBytesPerFile: 50000000
    };

    const first = await approvals.approveProviderBatch(input);
    vi.setSystemTime(new Date("2026-07-05T17:31:00.000Z"));
    const retried = await approvals.approveProviderBatch(input);

    expect(retried).toEqual(first);
    expect(retried.payload.approvedAt).toBe("2026-07-05T17:30:00.000Z");
    expect(await ledger.readAll()).toHaveLength(1);
  });

  it("rejects credential-shaped provider fields without appending or echoing the secret value", async () => {
    const ledger = new InMemoryEventLedger();
    const approvals = new ProviderParseApprovalService({
      ledger,
      actor
    });

    await expect(
      approvals.approveProviderBatch({
        providerJobId: "provider_003",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "apiKey=sk_live_12345", version: "0.1.0" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000
      })
    ).rejects.toThrow(/credential-shaped/i);

    await expect(
      approvals.approveProviderBatch({
        providerJobId: "provider_004",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "Authorization: Bearer sk_live_67890" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000
      })
    ).rejects.toThrow(/credential-shaped/i);

    expect(await ledger.readAll()).toHaveLength(0);

    for (const thrownInput of [
      { provider: { name: "apiKey=sk_live_12345", version: "0.1.0" }, secret: "sk_live_12345" },
      { provider: { name: "mistral-document-ai", version: "Authorization: Bearer sk_live_67890" }, secret: "sk_live_67890" }
    ]) {
      try {
        await approvals.approveProviderBatch({
          providerJobId: "provider_005",
          sourceCollectionId: "src_drive_001",
          importBatchId: "imp_001",
          approvedBy: "actor_investigator",
          eligibleMediaTypes: ["application/pdf"],
          maxBytesPerFile: 50000000,
          provider: thrownInput.provider
        });
      } catch (error) {
        expect(String(error)).not.toContain(thrownInput.secret);
      }
    }
  });

  it("rejects credential-shaped actor labels before any provider approval append", async () => {
    const ledger = new InMemoryEventLedger();

    expect(() => new ProviderParseApprovalService({
      ledger,
      actor: {
        id: "actor_investigator",
        kind: "human" as const,
        label: "Authorization: Bearer sk_live_actor"
      }
    })).toThrow(/credential-shaped/i);
    expect(await ledger.readAll()).toHaveLength(0);

    try {
      new ProviderParseApprovalService({
        ledger,
        actor: {
          id: "actor_investigator",
          kind: "human" as const,
          label: "Authorization: Bearer sk_live_actor"
        }
      });
    } catch (error) {
      expect(String(error)).not.toContain("sk_live_actor");
    }
  });

  it("validates provider approval IDs, byte limits, and canonicalizes eligible media types", async () => {
    const ledger = new InMemoryEventLedger();
    const approvals = new ProviderParseApprovalService({
      ledger,
      actor
    });

    await expect(
      approvals.approveProviderBatch({
        providerJobId: "job_001",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 50000000
      })
    ).rejects.toThrow(/invalid provider approval/i);
    await expect(
      approvals.approveProviderBatch({
        providerJobId: "provider_006",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: [],
        maxBytesPerFile: 50000000
      })
    ).rejects.toThrow(/invalid provider approval/i);
    await expect(
      approvals.approveProviderBatch({
        providerJobId: "provider_007",
        sourceCollectionId: "src_drive_001",
        importBatchId: "imp_001",
        provider: { name: "mistral-document-ai", version: "0.1.0" },
        approvedBy: "actor_investigator",
        eligibleMediaTypes: ["application/pdf"],
        maxBytesPerFile: 0
      })
    ).rejects.toThrow(/invalid provider approval/i);

    const approved = await approvals.approveProviderBatch({
      providerJobId: "provider_008",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["image/png", "application/pdf", "application/pdf"],
      maxBytesPerFile: 50000000
    });
    const retried = await approvals.approveProviderBatch({
      providerJobId: "provider_008",
      sourceCollectionId: "src_drive_001",
      importBatchId: "imp_001",
      provider: { name: "mistral-document-ai", version: "0.1.0" },
      approvedBy: "actor_investigator",
      eligibleMediaTypes: ["application/pdf", "image/png"],
      maxBytesPerFile: 50000000
    });

    expect(approved.payload.eligibleMediaTypes).toEqual(["application/pdf", "image/png"]);
    expect(retried).toEqual(approved);
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
