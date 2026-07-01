import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import {
  type AdapterCapabilities,
  type ApprovedMessageInput,
  type CorrespondenceAdapter,
  FakeCorrespondenceAdapter,
  type SentMessageResult,
  type SyncResult
} from "../src/correspondence-adapter.js";
import { PrrCorrespondenceService } from "../src/correspondence-service.js";
import { PrrLifecycleService } from "../src/lifecycle.js";
import type { CorrespondenceProvider } from "../src/types.js";

const actor = { id: "actor_investigator", kind: "human" as const, label: "Investigator" };

const createRequestInput = {
  prrRequestId: "prr_req_001",
  jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
  agency: { name: "Example Agency", email: "foia@example.gov" },
  requester: { name: "Investigator", email: "investigator@example.org" },
  requestText: "Please provide records."
};

const initialSendInput = {
  prrRequestId: "prr_req_001",
  correspondenceId: "corr_req_001",
  provider: "gmail" as const,
  from: "investigator@example.org",
  to: ["foia@example.gov"],
  subject: "Records Request",
  body: "Please provide records.",
  approvedBy: "actor_investigator"
};

describe("PrrCorrespondenceService", () => {
  it("one-click sends after human approval and records a request sent event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    const event = await service.sendInitialRequest(initialSendInput);

    expect(event.type).toBe("prr.request.sent");
    expect(event.payload).toMatchObject({
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_req_001",
      provider: "gmail",
      providerMessageId: "fake_msg_send_prr_req_001_corr_req_001",
      subject: "Records Request",
      bodyHash: sha256("Please provide records."),
      sentAt: "2026-07-01T16:00:00.000Z",
      approvedBy: "actor_investigator"
    });
  });

  it("passes a deterministic idempotency key into the adapter result", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    const event = await service.sendInitialRequest(initialSendInput);

    expect(event.payload.providerMessageId).toBe("fake_msg_send_prr_req_001_corr_req_001");
  });

  it("throws for a missing adapter before appending a sent lifecycle event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: {}
    });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "No correspondence adapter configured for gmail"
    );
    await expect(sentEventCount(ledger)).resolves.toBe(0);
    await expect(ledger.readAll()).resolves.toHaveLength(1);
  });

  it("lets approved-send validation reject blank approval without appending a sent event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    await expect(service.sendInitialRequest({ ...initialSendInput, approvedBy: " " })).rejects.toThrow(
      "approvedBy is required for one-click send"
    );
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("blocks duplicate initial sends through lifecycle duplicate protection", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    await service.sendInitialRequest(initialSendInput);

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Cannot send request prr_req_001 more than once"
    );
    await expect(sentEventCount(ledger)).resolves.toBe(1);
  });

  it("passes optional cc through to the configured adapter", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });

    await service.sendInitialRequest({
      ...initialSendInput,
      cc: ["records@example.gov", "custodian@example.gov"]
    });

    expect(adapter.lastInput?.cc).toEqual(["records@example.gov", "custodian@example.gov"]);
  });
});

async function ledgerWithCreatedRequest(): Promise<InMemoryEventLedger> {
  const ledger = new InMemoryEventLedger();
  const lifecycle = new PrrLifecycleService({ ledger, actor });
  await lifecycle.createRequest(createRequestInput);
  return ledger;
}

async function sentEventCount(ledger: EventLedger): Promise<number> {
  const events = await ledger.readAll();
  return events.filter((event) => event.type === "prr.request.sent").length;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

class RecordingAdapter implements CorrespondenceAdapter {
  lastInput?: ApprovedMessageInput;

  constructor(private readonly provider: CorrespondenceProvider) {}

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: this.provider,
      canSend: true,
      canSync: false,
      canFetchAttachments: false,
      credentialMode: "external-config"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    this.lastInput = {
      ...input,
      to: [...input.to],
      attachments: input.attachments.map((attachment) => ({ ...attachment }))
    };
    if (input.cc !== undefined) {
      this.lastInput.cc = [...input.cc];
    }
    return {
      provider: this.provider,
      providerMessageId: `recorded_${input.idempotencyKey}`,
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: {}
    };
  }

  async syncSince(): Promise<SyncResult> {
    return { checkpoint: "recording", messages: [] };
  }
}
