import { describe, expect, it } from "vitest";
import {
  assertApprovedMessageInput,
  FakeCorrespondenceAdapter
} from "../src/correspondence-adapter.js";

describe("CorrespondenceAdapter", () => {
  it("sends only through the human-approved send path", async () => {
    const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });
    const result = await adapter.sendApprovedMessage({
      idempotencyKey: "send_prr_req_001_corr_001",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Records Request",
      body: "Please provide records.",
      approvedBy: "actor_investigator",
      attachments: []
    });

    expect(result.provider).toBe("gmail");
    expect(result.providerMessageId).toBe("fake_msg_send_prr_req_001_corr_001");
    expect(result.providerThreadId).toBe("fake_thread_send_prr_req_001_corr_001");
    expect(result.rawMetadata).toMatchObject({
      idempotencyKey: "send_prr_req_001_corr_001",
      approvedBy: "actor_investigator"
    });
    expect("sendMessage" in adapter).toBe(false);
  });

  it("surfaces provider credential modes without requiring live credentials", async () => {
    await expect(
      new FakeCorrespondenceAdapter({ provider: "gmail" }).capabilities()
    ).resolves.toMatchObject({
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth"
    });

    await expect(
      new FakeCorrespondenceAdapter({ provider: "imap-smtp" }).capabilities()
    ).resolves.toMatchObject({
      provider: "imap-smtp",
      credentialMode: "external-secret"
    });

    await expect(
      new FakeCorrespondenceAdapter({ provider: "himalaya" }).capabilities()
    ).resolves.toMatchObject({
      provider: "himalaya",
      credentialMode: "external-config"
    });
  });

  it("syncs deterministic inbound messages without credentials", async () => {
    const adapter = new FakeCorrespondenceAdapter({
      provider: "himalaya",
      syncedMessages: [
        {
          providerMessageId: "inbound_001",
          providerThreadId: "thread_001",
          from: "records@example.gov",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          body: "We received your request."
        }
      ]
    });

    await expect(adapter.syncSince("checkpoint_001")).resolves.toEqual({
      checkpoint: "fake_checkpoint_himalaya_checkpoint_001",
      messages: [
        {
          provider: "himalaya",
          providerMessageId: "inbound_001",
          providerThreadId: "thread_001",
          from: "records@example.gov",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          body: "We received your request.",
          rawMetadata: {
            checkpoint: "checkpoint_001",
            provider: "himalaya"
          }
        }
      ]
    });
  });

  it("snapshots constructor sync messages before callers mutate them", async () => {
    type FakeSyncedMessages = NonNullable<
      ConstructorParameters<typeof FakeCorrespondenceAdapter>[0]["syncedMessages"]
    >;
    const syncedMessages: FakeSyncedMessages = [
      {
        providerMessageId: "inbound_001",
        providerThreadId: "thread_001",
        from: "records@example.gov",
        to: ["investigator@example.org"],
        subject: "Acknowledgement",
        receivedAt: "2026-07-01T15:00:00.000Z",
        body: "We received your request.",
        attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:original" }],
        rawMetadata: { source: "seed" }
      }
    ];
    const adapter = new FakeCorrespondenceAdapter({ provider: "gmail", syncedMessages });

    syncedMessages[0]!.subject = "Mutated subject";
    syncedMessages[0]!.to.push("mutated@example.org");
    const attachmentRefs = syncedMessages[0]!.attachmentRefs!;
    attachmentRefs[0]!.contentHash = "sha256:mutated";
    syncedMessages.push({
      providerMessageId: "inbound_002",
      from: "late@example.gov",
      to: ["investigator@example.org"],
      subject: "Late mutation",
      receivedAt: "2026-07-01T16:00:00.000Z"
    });

    await expect(adapter.syncSince("checkpoint_001")).resolves.toMatchObject({
      messages: [
        {
          provider: "gmail",
          providerMessageId: "inbound_001",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:original" }],
          rawMetadata: { source: "seed" }
        }
      ]
    });
    await expect(adapter.syncSince("checkpoint_001")).resolves.toHaveProperty("messages.length", 1);
  });

  it.each([
    ["idempotencyKey", { idempotencyKey: " " }, "idempotencyKey is required"],
    ["from", { from: "" }, "from is required"],
    ["to", { to: [] }, "to must include at least one recipient"],
    ["blank recipient", { to: ["records@example.gov", " "] }, "to[1] is required"],
    ["subject", { subject: " " }, "subject is required"],
    ["body", { body: "" }, "body is required"],
    ["approvedBy", { approvedBy: " " }, "approvedBy is required for one-click send"]
  ])("rejects invalid approved send input: %s", async (_name, override, message) => {
    const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });

    await expect(
      adapter.sendApprovedMessage({
        idempotencyKey: "send_prr_req_001_corr_001",
        from: "investigator@example.org",
        to: ["foia@example.gov"],
        subject: "Records Request",
        body: "Please provide records.",
        approvedBy: "actor_investigator",
        attachments: [],
        ...override
      })
    ).rejects.toThrow(message);
  });

  it.each([
    ["idempotencyKey", { idempotencyKey: " " }, "idempotencyKey is required"],
    ["from", { from: "" }, "from is required"],
    ["to", { to: [] }, "to must include at least one recipient"],
    ["blank recipient", { to: ["records@example.gov", " "] }, "to[1] is required"],
    ["blank cc recipient", { cc: ["records@example.gov", " "] }, "cc[1] is required"],
    ["subject", { subject: " " }, "subject is required"],
    ["body", { body: "" }, "body is required"],
    ["approvedBy", { approvedBy: " " }, "approvedBy is required for one-click send"]
  ])("shared approved-send validator rejects invalid input: %s", (_name, override, message) => {
    expect(() =>
      assertApprovedMessageInput({
        idempotencyKey: "send_prr_req_001_corr_001",
        from: "investigator@example.org",
        to: ["foia@example.gov"],
        subject: "Records Request",
        body: "Please provide records.",
        approvedBy: "actor_investigator",
        attachments: [],
        ...override
      })
    ).toThrow(message);
  });

  it("shared approved-send validator rejects missing approval actor", () => {
    const { approvedBy: _approvedBy, ...inputWithoutApproval } = {
      idempotencyKey: "send_prr_req_001_corr_001",
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      subject: "Records Request",
      body: "Please provide records.",
      approvedBy: "actor_investigator",
      attachments: []
    };

    expect(() => assertApprovedMessageInput(inputWithoutApproval)).toThrow(
      "approvedBy is required for one-click send"
    );
  });

  it("rejects missing approval actor with the one-click send approval error", async () => {
    const adapter = new FakeCorrespondenceAdapter({ provider: "gmail" });

    await expect(
      adapter.sendApprovedMessage({
        idempotencyKey: "send_prr_req_001_corr_001",
        from: "investigator@example.org",
        to: ["foia@example.gov"],
        subject: "Records Request",
        body: "Please provide records.",
        attachments: []
      } as never)
    ).rejects.toThrow("approvedBy is required for one-click send");
  });
});
