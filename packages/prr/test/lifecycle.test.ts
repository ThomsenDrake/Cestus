import { describe, expect, it } from "vitest";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { PrrLifecycleService } from "../src/lifecycle.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

const createRequestInput = {
  prrRequestId: "prr_req_001",
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  agency: { name: "Example Agency", email: "foia@example.gov" },
  requester: { name: "Investigator", email: "investigator@example.org" },
  requestText: "Please provide contracts with Example Vendor from 2024."
};

const sentRequestInput = {
  prrRequestId: "prr_req_001",
  correspondenceId: "corr_prr_001",
  provider: "gmail" as const,
  providerMessageId: "msg_123",
  subject: "Records Request",
  bodyHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  sentAt: "2026-07-01T16:00:00.000Z",
  approvedBy: "actor_investigator"
};

describe("PrrLifecycleService", () => {
  it("creates a draft request event", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    const event = await service.createRequest(createRequestInput);

    expect(event.type).toBe("prr.request.created");
    expect(event.streamId).toBe("prr_req_001");
    expect(event.payload.status).toBe("draft");
  });

  it("prevents duplicate request creation for the same request stream", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    await service.createRequest(createRequestInput);

    await expect(service.createRequest(createRequestInput)).rejects.toThrow(
      "Concurrency conflict for prr_req_001"
    );
  });

  it("prevents sending a request before a draft exists", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });

    await expect(service.markRequestSent({ ...sentRequestInput, prrRequestId: "prr_req_missing" })).rejects.toThrow(
      "Cannot send request prr_req_missing before it is created"
    );
  });

  it("marks a created request as sent with causation and correlation links", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });
    const created = await service.createRequest(createRequestInput);

    const sent = await service.markRequestSent(sentRequestInput);

    expect(sent.type).toBe("prr.request.sent");
    expect(sent.sequence).toBe(2);
    expect(sent.context.causationId).toBe(created.id);
    expect(sent.context.correlationId).toBe(created.context.correlationId);
    expect(sent.payload).toEqual(sentRequestInput);
  });

  it("prevents duplicate request sent events for the same request stream", async () => {
    const ledger = new InMemoryEventLedger();
    const service = new PrrLifecycleService({ ledger, actor });
    await service.createRequest(createRequestInput);
    await service.markRequestSent(sentRequestInput);

    await expect(service.markRequestSent(sentRequestInput)).rejects.toThrow(
      "Cannot send request prr_req_001 more than once"
    );
  });
});
