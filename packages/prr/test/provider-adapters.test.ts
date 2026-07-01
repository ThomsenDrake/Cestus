import { describe, expect, it, vi } from "vitest";
import type { ApprovedMessageInput, SyncResult } from "../src/correspondence-adapter.js";
import {
  GmailCorrespondenceAdapter,
  HimalayaCliAdapter,
  ImapSmtpCorrespondenceAdapter
} from "../src/provider-adapters.js";

const approvedMessage: ApprovedMessageInput = {
  idempotencyKey: "send_prr_req_001_corr_001",
  from: "investigator@example.org",
  to: ["foia@example.gov"],
  cc: ["records@example.gov"],
  subject: "Records Request",
  body: "Please provide records.",
  approvedBy: "actor_investigator",
  attachments: []
};

describe("provider correspondence adapters", () => {
  it("exports provider adapters from the PRR package entrypoint", async () => {
    const prr = await import("../src/index.js");

    expect(prr.GmailCorrespondenceAdapter).toBe(GmailCorrespondenceAdapter);
    expect(prr.HimalayaCliAdapter).toBe(HimalayaCliAdapter);
    expect(prr.ImapSmtpCorrespondenceAdapter).toBe(ImapSmtpCorrespondenceAdapter);
  });

  it("wraps a Gmail client without exposing OAuth tokens", async () => {
    const syncResult: SyncResult = {
      checkpoint: "gmail_checkpoint_001",
      messages: [
        {
          provider: "gmail",
          providerMessageId: "gmail_inbound_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          rawMetadata: { providerLabel: "gmail" }
        }
      ]
    };
    const send = vi.fn(async (input: ApprovedMessageInput) => {
      expect(input.body).toBe("Please provide records.");
      return {
        providerMessageId: "gmail_msg_001",
        providerThreadId: "gmail_thread_001",
        sentAt: "2026-07-01T16:00:00.000Z"
      };
    });
    const syncSince = vi.fn(async () => syncResult);
    const client = {
      oauthRefreshToken: "refresh_secret_never_expose",
      send,
      syncSince
    };
    const adapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client
    });

    const capabilities = await adapter.capabilities();
    const sent = await adapter.sendApprovedMessage(approvedMessage);
    const synced = await adapter.syncSince("gmail_checkpoint_000");

    expect(capabilities).toEqual({
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth"
    });
    expect(sent).toEqual({
      provider: "gmail",
      providerMessageId: "gmail_msg_001",
      providerThreadId: "gmail_thread_001",
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: { accountEmail: "investigator@example.org" }
    });
    expect(synced).toBe(syncResult);
    expect(syncSince).toHaveBeenCalledWith("gmail_checkpoint_000");
    expect(JSON.stringify({ capabilities, sent })).not.toContain("refresh_secret_never_expose");
  });

  it("rejects missing Gmail approval before client send", async () => {
    const send = vi.fn();
    const adapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client: {
        send,
        async syncSince() {
          return { checkpoint: "gmail_checkpoint_001", messages: [] };
        }
      }
    });
    const { approvedBy: _approvedBy, ...withoutApproval } = approvedMessage;

    await expect(adapter.sendApprovedMessage(withoutApproval as never)).rejects.toThrow(
      "approvedBy is required for one-click send"
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("wraps IMAP and SMTP ports with external-secret credential mode", async () => {
    const syncResult: SyncResult = { checkpoint: "imap_checkpoint_001", messages: [] };
    const send = vi.fn(async (input: ApprovedMessageInput) => {
      expect(input.subject).toBe("Records Request");
      return {
        providerMessageId: "smtp_msg_001",
        sentAt: "2026-07-01T16:00:00.000Z"
      };
    });
    const syncSince = vi.fn(async () => syncResult);
    const smtp = {
      password: "smtp_secret_never_expose",
      send
    };
    const imap = {
      password: "imap_secret_never_expose",
      syncSince
    };
    const adapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp,
      imap
    });

    const capabilities = await adapter.capabilities();
    const sent = await adapter.sendApprovedMessage(approvedMessage);
    const synced = await adapter.syncSince("imap_checkpoint_000");

    expect(capabilities).toEqual({
      provider: "imap-smtp",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-secret"
    });
    expect(sent).toEqual({
      provider: "imap-smtp",
      providerMessageId: "smtp_msg_001",
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: { accountEmail: "investigator@example.org" }
    });
    expect(synced).toBe(syncResult);
    expect(syncSince).toHaveBeenCalledWith("imap_checkpoint_000");
    expect(JSON.stringify({ capabilities, sent })).not.toContain("secret_never_expose");
  });

  it("rejects malformed IMAP/SMTP recipients before SMTP send", async () => {
    const send = vi.fn();
    const adapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp: { send },
      imap: {
        async syncSince() {
          return { checkpoint: "imap_checkpoint_001", messages: [] };
        }
      }
    });

    await expect(
      adapter.sendApprovedMessage({ ...approvedMessage, to: ["foia@example.gov", " "] })
    ).rejects.toThrow("to[1] is required");
    expect(send).not.toHaveBeenCalled();
  });

  it("detects Himalaya capabilities and sends through the injected command runner", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        if (args.includes("--version")) {
          return { stdout: "himalaya 1.2.0\n", stderr: "" };
        }
        return {
          stdout: JSON.stringify({
            id: "himalaya_msg_001",
            threadId: "himalaya_thread_001",
            sentAt: "2026-07-01T16:00:00.000Z"
          }),
          stderr: ""
        };
      }
    });

    const capabilities = await adapter.capabilities();
    const sent = await adapter.sendApprovedMessage(approvedMessage);

    expect(capabilities).toEqual({
      provider: "himalaya",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-config"
    });
    expect(commands[0]).toEqual({ command: "himalaya", args: ["--version"] });
    expect(commands[1]?.command).toBe("himalaya");
    expect(commands[1]?.args).toEqual(
      expect.arrayContaining([
        "--account",
        "records",
        "message",
        "send",
        "--from",
        "investigator@example.org",
        "--to",
        "foia@example.gov",
        "--cc",
        "records@example.gov",
        "--subject",
        "Records Request",
        "--body",
        "Please provide records.",
        "--output",
        "json"
      ])
    );
    expect(sent).toEqual({
      provider: "himalaya",
      providerMessageId: "himalaya_msg_001",
      providerThreadId: "himalaya_thread_001",
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: { profile: "records" }
    });
    expect(JSON.stringify({ capabilities, sent })).not.toContain("himalaya_config");
  });

  it("throws a clear error when Himalaya send output is invalid JSON", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({ stdout: "not json", stderr: "" })
    });

    await expect(adapter.sendApprovedMessage(approvedMessage)).rejects.toThrow(
      "Himalaya send output was not valid JSON"
    );
  });

  it("throws a clear error when Himalaya send output omits the message id", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({ threadId: "himalaya_thread_001" }),
        stderr: ""
      })
    });

    await expect(adapter.sendApprovedMessage(approvedMessage)).rejects.toThrow(
      "Himalaya send output did not include a message id"
    );
  });

  it("rejects invalid Himalaya approved send input before command execution", async () => {
    const runCommand = vi.fn();
    const adapter = new HimalayaCliAdapter({ profile: "records", runCommand });

    await expect(adapter.sendApprovedMessage({ ...approvedMessage, approvedBy: " " })).rejects.toThrow(
      "approvedBy is required for one-click send"
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("syncs straightforward Himalaya JSON through the injected runner", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        return {
          stdout: JSON.stringify({
            checkpoint: "himalaya_checkpoint_002",
            messages: [
              {
                id: "himalaya_inbound_001",
                threadId: "himalaya_thread_001",
                from: "foia@example.gov",
                to: ["investigator@example.org"],
                cc: ["records@example.gov"],
                subject: "Acknowledgement",
                receivedAt: "2026-07-01T17:00:00.000Z",
                body: "We received your request."
              }
            ]
          }),
          stderr: ""
        };
      }
    });

    await expect(adapter.syncSince("checkpoint_001")).resolves.toEqual({
      checkpoint: "himalaya_checkpoint_002",
      messages: [
        {
          provider: "himalaya",
          providerMessageId: "himalaya_inbound_001",
          providerThreadId: "himalaya_thread_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          cc: ["records@example.gov"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T17:00:00.000Z",
          body: "We received your request.",
          rawMetadata: { provider: "himalaya" }
        }
      ]
    });
    expect(commands).toEqual([
      {
        command: "himalaya",
        args: ["--account", "records", "envelope", "list", "--output", "json"]
      }
    ]);
  });

  it("does not silently ignore invalid Himalaya sync JSON", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({ stdout: "{", stderr: "" })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "Himalaya sync output was not valid JSON"
    );
  });
});
