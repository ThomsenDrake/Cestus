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

const followUpInput = {
  prrRequestId: "prr_req_001",
  correspondenceId: "corr_followup_001",
  provider: "gmail" as const,
  from: "investigator@example.org",
  to: ["foia@example.gov"],
  subject: "Follow-up on records request",
  body: "Please provide a status update.",
  approvedBy: "actor_investigator"
};

const attachmentContentHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
      providerThreadId: "fake_thread_send_prr_req_001_corr_req_001",
      idempotencyKey: "send_prr_req_001_corr_req_001",
      subject: "Records Request",
      bodyHash: "sha256:a287a8dc2603ddfe9fdef494238ebd54741c9e2dc811a88f3ffe1cf3fb1e37fe",
      attachmentEvidenceIds: [],
      sentAt: "2026-07-01T16:00:00.000Z",
      approvedBy: "actor_investigator",
      rawMetadata: {
        approvedBy: "actor_investigator",
        idempotencyKey: "send_prr_req_001_corr_req_001",
        provider: "gmail"
      }
    });
  });

  it("records attachment evidence IDs in the sent request event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: new FakeCorrespondenceAdapter({ provider: "gmail" }) }
    });

    const event = await service.sendInitialRequest({
      ...initialSendInput,
      attachments: [
        {
          evidenceId: "ev_prr_attachment_001",
          filename: "request-exhibit.pdf",
          contentHash: attachmentContentHash
        }
      ]
    });

    expect(event.payload.attachmentEvidenceIds).toEqual(["ev_prr_attachment_001"]);
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

  it("rejects missing approval before calling the adapter or appending a sent event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });
    const { approvedBy: _approvedBy, ...inputWithoutApproval } = initialSendInput;

    await expect(
      service.sendInitialRequest(
        inputWithoutApproval as Parameters<PrrCorrespondenceService["sendInitialRequest"]>[0]
      )
    ).rejects.toThrow("approvedBy is required for one-click send");
    expect(adapter.sendCalls).toBe(0);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("blocks duplicate initial sends through lifecycle duplicate protection", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });

    await service.sendInitialRequest(initialSendInput);
    const sentEventsBeforeDuplicate = await sentEventCount(ledger);

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Cannot send request prr_req_001 more than once"
    );
    expect(adapter.sendCalls).toBe(1);
    await expect(sentEventCount(ledger)).resolves.toBe(sentEventsBeforeDuplicate);
  });

  it("rejects missing request streams before calling the adapter or appending a sent event", async () => {
    const ledger = new InMemoryEventLedger();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Cannot send request prr_req_001 before it is created"
    );
    expect(adapter.sendCalls).toBe(0);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
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

  it("rejects secret-looking adapter raw metadata before appending a sent event", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", { oauthToken: "never-store-this" });
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result metadata contains a disallowed key"
    );
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects an initial provider result with a mismatched provider before lifecycle append", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", {}, "imap-smtp");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result did not match requested provider gmail"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects an initial provider result without a message id before lifecycle append", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", {}, "gmail", " ");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result did not include a message id"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects an initial provider result with an invalid sent timestamp before lifecycle append", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", {}, "gmail", undefined, "not-a-date");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result did not include a valid sent timestamp"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects an initial provider result with a secret-shaped metadata value before lifecycle append", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", { tracking: "Bearer abcdefghijklmnop" });
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result metadata contains a secret-shaped value"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(sentEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects secret-shaped provider message and thread references before lifecycle append", async () => {
    const messageLedger = await ledgerWithCreatedRequest();
    const messageAdapter = new RecordingAdapter("gmail", {}, "gmail", "Bearer abcdefghijklmnop");
    const messageService = new PrrCorrespondenceService({
      ledger: messageLedger,
      actor,
      adapters: { gmail: messageAdapter }
    });
    await expect(messageService.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result contains a secret-shaped reference"
    );
    await expect(sentEventCount(messageLedger)).resolves.toBe(0);

    const threadLedger = await ledgerWithCreatedRequest();
    const threadAdapter = new RecordingAdapter(
      "gmail",
      {},
      "gmail",
      "safe_message_001",
      undefined,
      "api key abcdefghijklmnop"
    );
    const threadService = new PrrCorrespondenceService({
      ledger: threadLedger,
      actor,
      adapters: { gmail: threadAdapter }
    });
    await expect(threadService.sendInitialRequest(initialSendInput)).rejects.toThrow(
      "Provider result contains a secret-shaped reference"
    );
    await expect(sentEventCount(threadLedger)).resolves.toBe(0);
  });

  it("sends an approved follow-up after the initial request and records only the follow-up event contract", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail", { accountEmail: "investigator@example.org" });
    const service = new PrrCorrespondenceService({
      ledger,
      actor,
      adapters: { gmail: adapter }
    });
    await service.sendInitialRequest(initialSendInput);

    const event = await service.sendFollowUp(followUpInput);

    expect(event.type).toBe("prr.followup.sent");
    expect(event.payload).toEqual({
      prrRequestId: "prr_req_001",
      correspondenceId: "corr_followup_001",
      provider: "gmail",
      providerMessageId: "recorded_followup_prr_req_001_corr_followup_001",
      subject: "Follow-up on records request",
      bodyHash: "sha256:74f76dc0610d620f2d90a082667030ef34b6db922e2303c71d12d9d7c00ac2e4",
      sentAt: "2026-07-01T16:00:00.000Z",
      approvedBy: "actor_investigator"
    });
    expect(adapter.lastInput?.idempotencyKey).toBe("followup_prr_req_001_corr_followup_001");
    expect(event.payload).not.toHaveProperty("rawMetadata");
    expect(event.payload).not.toHaveProperty("providerThreadId");
  });

  it("rejects invalid follow-up attachments before the provider is called", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp({
      ...followUpInput,
      attachments: [{ filename: "follow-up.pdf", contentHash: attachmentContentHash, evidenceId: "invalid" }]
    })).rejects.toThrow("attachments[0].evidenceId is invalid");

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects valid follow-up attachments when the lifecycle event cannot attest them", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp({
      ...followUpInput,
      attachments: [{
        filename: "follow-up.pdf",
        contentHash: attachmentContentHash,
        evidenceId: "ev_followup_001"
      }]
    })).rejects.toThrow("Follow-up attachments are not supported until the lifecycle event can attest them");

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects a follow-up without approval before the provider is called", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });
    const { approvedBy: _approvedBy, ...inputWithoutApproval } = followUpInput;

    await expect(service.sendFollowUp(
      inputWithoutApproval as Parameters<PrrCorrespondenceService["sendFollowUp"]>[0]
    )).rejects.toThrow("approvedBy is required for one-click send");

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("requires a created request with an initial sent event before sending a follow-up", async () => {
    const ledger = await ledgerWithCreatedRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Cannot send follow-up for prr_req_001 before the initial request is sent"
    );

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects follow-ups for closed requests before the provider is called", async () => {
    const ledger = await ledgerWithSentRequest();
    await appendRequestClosed(ledger);
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Cannot send follow-up for closed request prr_req_001"
    );

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects duplicate follow-up correspondence IDs before the provider is called", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });
    await service.sendFollowUp(followUpInput);

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Cannot send duplicate correspondence corr_followup_001 for request prr_req_001"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(1);
  });

  it("rejects a follow-up correspondence ID already used for the initial request", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp({ ...followUpInput, correspondenceId: initialSendInput.correspondenceId })).rejects.toThrow(
      "Cannot send duplicate correspondence corr_req_001 for request prr_req_001"
    );

    expect(adapter.sendCalls).toBe(0);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects a mismatched provider result without appending a follow-up event", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail", {}, "imap-smtp");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Provider result did not match requested provider gmail"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("does not append a follow-up event when the provider fails", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new FailingAdapter("gmail");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow("Provider unavailable");

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects secret-shaped follow-up metadata without appending a follow-up event", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail", { oauthToken: "never-store-this" });
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Provider result metadata contains a disallowed key"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects a follow-up provider result without a message id before lifecycle append", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail", {}, "gmail", " ");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Provider result did not include a message id"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects a follow-up provider result with an invalid sent timestamp before lifecycle append", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail", {}, "gmail", undefined, "not-a-date");
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Provider result did not include a valid sent timestamp"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });

  it("rejects a follow-up provider result with a secret-shaped metadata value before lifecycle append", async () => {
    const ledger = await ledgerWithSentRequest();
    const adapter = new RecordingAdapter("gmail", { tracking: "Bearer abcdefghijklmnop" });
    const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });

    await expect(service.sendFollowUp(followUpInput)).rejects.toThrow(
      "Provider result metadata contains a secret-shaped value"
    );

    expect(adapter.sendCalls).toBe(1);
    await expect(followUpEventCount(ledger)).resolves.toBe(0);
  });
});

async function ledgerWithCreatedRequest(): Promise<InMemoryEventLedger> {
  const ledger = new InMemoryEventLedger();
  const lifecycle = new PrrLifecycleService({ ledger, actor });
  await lifecycle.createRequest(createRequestInput);
  return ledger;
}

async function ledgerWithSentRequest(
  adapter: CorrespondenceAdapter = new RecordingAdapter("gmail")
): Promise<InMemoryEventLedger> {
  const ledger = await ledgerWithCreatedRequest();
  const service = new PrrCorrespondenceService({ ledger, actor, adapters: { gmail: adapter } });
  await service.sendInitialRequest(initialSendInput);
  return ledger;
}

async function sentEventCount(ledger: EventLedger): Promise<number> {
  const events = await ledger.readAll();
  return events.filter((event) => event.type === "prr.request.sent").length;
}

async function followUpEventCount(ledger: EventLedger): Promise<number> {
  const events = await ledger.readAll();
  return events.filter((event) => event.type === "prr.followup.sent").length;
}

async function appendRequestClosed(ledger: EventLedger): Promise<void> {
  const events = await ledger.readStream(initialSendInput.prrRequestId);
  const created = events.find((event) => event.type === "prr.request.created");
  if (created === undefined) {
    throw new Error("Test setup requires a created request");
  }

  await ledger.append({
    type: "prr.request.closed",
    version: 1,
    streamId: initialSendInput.prrRequestId,
    context: {
      actor,
      occurredAt: "2026-07-02T16:00:00.000Z",
      correlationId: created.context.correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    },
    payload: {
      prrRequestId: initialSendInput.prrRequestId,
      closedAt: "2026-07-02T16:00:00.000Z",
      closedBy: actor.id,
      reason: "fulfilled"
    }
  });
}

class RecordingAdapter implements CorrespondenceAdapter {
  lastInput?: ApprovedMessageInput;
  sendCalls = 0;

  constructor(
    private readonly provider: CorrespondenceProvider,
    private readonly rawMetadata: Record<string, string> = {},
    private readonly resultProvider: CorrespondenceProvider = provider,
    private readonly providerMessageId?: string,
    private readonly sentAt?: string,
    private readonly providerThreadId?: string
  ) {}

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
    this.sendCalls += 1;
    this.lastInput = {
      ...input,
      to: [...input.to],
      attachments: input.attachments.map((attachment) => ({ ...attachment }))
    };
    if (input.cc !== undefined) {
      this.lastInput.cc = [...input.cc];
    }
    return {
      provider: this.resultProvider,
      providerMessageId: this.providerMessageId ?? `recorded_${input.idempotencyKey}`,
      ...(this.providerThreadId === undefined ? {} : { providerThreadId: this.providerThreadId }),
      sentAt: this.sentAt ?? "2026-07-01T16:00:00.000Z",
      rawMetadata: this.rawMetadata
    };
  }

  async syncSince(): Promise<SyncResult> {
    return { checkpoint: "recording", messages: [] };
  }
}

class FailingAdapter extends RecordingAdapter {
  override async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    this.sendCalls += 1;
    this.lastInput = {
      ...input,
      to: [...input.to],
      attachments: input.attachments.map((attachment) => ({ ...attachment }))
    };
    throw new Error("Provider unavailable");
  }
}
