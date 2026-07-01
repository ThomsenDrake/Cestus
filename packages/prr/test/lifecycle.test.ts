import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrLifecycleService } from "../src/lifecycle.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

describe("PrrLifecycleService", () => {
  it("creates a draft request event", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    const event = await service.createRequest({
      prrRequestId: "prr_req_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Example Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Please provide contracts with Example Vendor from 2024."
    });

    expect(event.type).toBe("prr.request.created");
    expect(event.streamId).toBe("prr_req_001");
    expect(event.payload.status).toBe("draft");
  });

  it("prevents sending a request before a draft exists", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    await expect(
      service.markRequestSent({
        prrRequestId: "prr_req_missing",
        correspondenceId: "corr_prr_001",
        provider: "gmail",
        providerMessageId: "msg_123",
        subject: "Records Request",
        bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        sentAt: "2026-07-01T16:00:00.000Z",
        approvedBy: "actor_investigator"
      })
    ).rejects.toThrow("Cannot send request prr_req_missing before it is created");
  });
});
