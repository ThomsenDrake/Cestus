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
          provider: "imap-smtp",
          providerMessageId: "gmail_inbound_001",
          providerThreadId: "gmail_thread_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          cc: ["records@example.gov"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
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
    expect(synced).toEqual({
      checkpoint: "gmail_checkpoint_001",
      messages: [
        {
          provider: "gmail",
          providerMessageId: "gmail_inbound_001",
          providerThreadId: "gmail_thread_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          cc: ["records@example.gov"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
          rawMetadata: { providerLabel: "gmail" }
        }
      ]
    });
    expect(synced).not.toBe(syncResult);
    expect(synced.messages).not.toBe(syncResult.messages);
    expect(synced.messages[0]).not.toBe(syncResult.messages[0]);
    expect(synced.messages[0]!.to).not.toBe(syncResult.messages[0]!.to);
    expect(synced.messages[0]!.cc).not.toBe(syncResult.messages[0]!.cc);
    expect(synced.messages[0]!.attachmentRefs).not.toBe(syncResult.messages[0]!.attachmentRefs);
    expect(synced.messages[0]!.rawMetadata).not.toBe(syncResult.messages[0]!.rawMetadata);
    expect(syncSince).toHaveBeenCalledWith("gmail_checkpoint_000");
    expect(JSON.stringify({ capabilities, sent })).not.toContain("refresh_secret_never_expose");
  });

  it("protects Gmail sync results from upstream and returned-result mutation", async () => {
    const syncResult: SyncResult = {
      checkpoint: "gmail_checkpoint_001",
      messages: [
        {
          provider: "imap-smtp",
          providerMessageId: "gmail_inbound_001",
          providerThreadId: "gmail_thread_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          cc: ["records@example.gov"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
          rawMetadata: { tracking: "original" }
        }
      ]
    };
    const adapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client: {
        async send() {
          throw new Error("send should not be called");
        },
        async syncSince() {
          return syncResult;
        }
      }
    });

    const synced = await adapter.syncSince("gmail_checkpoint_000");
    syncResult.messages[0]!.to.push("upstream-mutated@example.org");
    syncResult.messages[0]!.cc!.push("upstream-cc@example.org");
    syncResult.messages[0]!.attachmentRefs![0]!.contentHash = "sha256:mutated";
    syncResult.messages[0]!.rawMetadata.tracking = "upstream-mutated";

    expect(synced.messages[0]).toMatchObject({
      provider: "gmail",
      to: ["investigator@example.org"],
      cc: ["records@example.gov"],
      attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
      rawMetadata: { tracking: "original" }
    });

    const stableSyncResult: SyncResult = {
      checkpoint: "gmail_checkpoint_002",
      messages: [
        {
          provider: "imap-smtp",
          providerMessageId: "gmail_inbound_002",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          subject: "Second Acknowledgement",
          receivedAt: "2026-07-01T16:00:00.000Z",
          rawMetadata: { tracking: "stable" }
        }
      ]
    };
    const stableAdapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client: {
        async send() {
          throw new Error("send should not be called");
        },
        async syncSince() {
          return stableSyncResult;
        }
      }
    });
    const first = await stableAdapter.syncSince();
    first.messages[0]!.to.push("returned-mutated@example.org");
    first.messages[0]!.rawMetadata.tracking = "returned-mutated";

    await expect(stableAdapter.syncSince()).resolves.toMatchObject({
      messages: [
        {
          provider: "gmail",
          to: ["investigator@example.org"],
          rawMetadata: { tracking: "stable" }
        }
      ]
    });
  });

  it("rejects Gmail sync raw metadata with secret-looking keys", async () => {
    const adapter = new GmailCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      client: {
        async send() {
          throw new Error("send should not be called");
        },
        async syncSince() {
          return syncResultWithRawMetadata("gmail", { oauthToken: "never-store-this" });
        }
      }
    });

    await expect(adapter.syncSince()).rejects.toThrow(
      "gmail sync message[0] rawMetadata key oauthToken is not allowed"
    );
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
    const syncResult: SyncResult = {
      checkpoint: "imap_checkpoint_001",
      messages: [
        {
          provider: "gmail",
          providerMessageId: "imap_inbound_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          rawMetadata: { providerLabel: "imap" }
        }
      ]
    };
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
    expect(synced).toEqual({
      checkpoint: "imap_checkpoint_001",
      messages: [
        {
          provider: "imap-smtp",
          providerMessageId: "imap_inbound_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          rawMetadata: { providerLabel: "imap" }
        }
      ]
    });
    expect(synced).not.toBe(syncResult);
    expect(synced.messages).not.toBe(syncResult.messages);
    expect(synced.messages[0]).not.toBe(syncResult.messages[0]);
    expect(synced.messages[0]!.to).not.toBe(syncResult.messages[0]!.to);
    expect(synced.messages[0]!.rawMetadata).not.toBe(syncResult.messages[0]!.rawMetadata);
    expect(syncSince).toHaveBeenCalledWith("imap_checkpoint_000");
    expect(JSON.stringify({ capabilities, sent })).not.toContain("secret_never_expose");
  });

  it("protects IMAP sync results from upstream and returned-result mutation", async () => {
    const syncResult: SyncResult = {
      checkpoint: "imap_checkpoint_001",
      messages: [
        {
          provider: "gmail",
          providerMessageId: "imap_inbound_001",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          cc: ["records@example.gov"],
          subject: "Acknowledgement",
          receivedAt: "2026-07-01T15:00:00.000Z",
          attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
          rawMetadata: { tracking: "original" }
        }
      ]
    };
    const adapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp: {
        async send() {
          throw new Error("send should not be called");
        }
      },
      imap: {
        async syncSince() {
          return syncResult;
        }
      }
    });

    const synced = await adapter.syncSince("imap_checkpoint_000");
    syncResult.messages[0]!.to.push("upstream-mutated@example.org");
    syncResult.messages[0]!.cc!.push("upstream-cc@example.org");
    syncResult.messages[0]!.attachmentRefs![0]!.contentHash = "sha256:mutated";
    syncResult.messages[0]!.rawMetadata.tracking = "upstream-mutated";

    expect(synced.messages[0]).toMatchObject({
      provider: "imap-smtp",
      to: ["investigator@example.org"],
      cc: ["records@example.gov"],
      attachmentRefs: [{ filename: "ack.pdf", contentHash: "sha256:ack" }],
      rawMetadata: { tracking: "original" }
    });

    const stableSyncResult: SyncResult = {
      checkpoint: "imap_checkpoint_002",
      messages: [
        {
          provider: "gmail",
          providerMessageId: "imap_inbound_002",
          from: "foia@example.gov",
          to: ["investigator@example.org"],
          subject: "Second Acknowledgement",
          receivedAt: "2026-07-01T16:00:00.000Z",
          rawMetadata: { tracking: "stable" }
        }
      ]
    };
    const stableAdapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp: {
        async send() {
          throw new Error("send should not be called");
        }
      },
      imap: {
        async syncSince() {
          return stableSyncResult;
        }
      }
    });
    const first = await stableAdapter.syncSince();
    first.messages[0]!.to.push("returned-mutated@example.org");
    first.messages[0]!.rawMetadata.tracking = "returned-mutated";

    await expect(stableAdapter.syncSince()).resolves.toMatchObject({
      messages: [
        {
          provider: "imap-smtp",
          to: ["investigator@example.org"],
          rawMetadata: { tracking: "stable" }
        }
      ]
    });
  });

  it("rejects IMAP sync raw metadata with secret-looking keys", async () => {
    const adapter = new ImapSmtpCorrespondenceAdapter({
      accountEmail: "investigator@example.org",
      smtp: {
        async send() {
          throw new Error("send should not be called");
        }
      },
      imap: {
        async syncSince() {
          return syncResultWithRawMetadata("imap-smtp", { smtpPassword: "never-store-this" });
        }
      }
    });

    await expect(adapter.syncSince()).rejects.toThrow(
      "imap-smtp sync message[0] rawMetadata key smtpPassword is not allowed"
    );
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
    expect(commands[1]?.args).toEqual([
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
      ]);
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

  it("sends Himalaya messages without cc using exact ordered arguments", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        return {
          stdout: JSON.stringify({ id: "himalaya_msg_002", sentAt: "2026-07-01T16:00:00.000Z" }),
          stderr: ""
        };
      }
    });
    const { cc: _cc, ...withoutCc } = approvedMessage;

    await adapter.sendApprovedMessage(withoutCc);

    expect(commands).toEqual([
      {
        command: "himalaya",
        args: [
          "--account",
          "records",
          "message",
          "send",
          "--from",
          "investigator@example.org",
          "--to",
          "foia@example.gov",
          "--subject",
          "Records Request",
          "--body",
          "Please provide records.",
          "--output",
          "json"
        ]
      }
    ]);
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

  it("rejects valid Himalaya sync JSON without a compatible messages array", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({ checkpoint: "himalaya_checkpoint_003", envelopes: [] }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "Himalaya sync output must include a messages array"
    );
  });

  it("rejects malformed Himalaya sync message entries with indexed errors", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_004",
          messages: [
            {
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z"
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] providerMessageId is required"
    );
  });

  it("rejects Himalaya sync raw metadata with secret-looking keys", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_005",
          messages: [
            {
              id: "himalaya_inbound_002",
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z",
              rawMetadata: { configPath: "/home/user/.config/himalaya/config.toml" }
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] rawMetadata key configPath is not allowed"
    );
  });

  it("rejects malformed Himalaya sync cc instead of omitting it", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_006",
          messages: [
            {
              id: "himalaya_inbound_003",
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              cc: ["records@example.gov", 42],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z"
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] cc must be an array of strings"
    );
  });

  it("rejects malformed Himalaya sync raw metadata shape", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_007",
          messages: [
            {
              id: "himalaya_inbound_004",
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z",
              rawMetadata: "not-an-object"
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] rawMetadata must be an object"
    );
  });

  it("rejects malformed Himalaya sync attachment refs instead of omitting them", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_008",
          messages: [
            {
              id: "himalaya_inbound_005",
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z",
              attachmentRefs: [{ filename: "ack.pdf", contentHash: 42 }]
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] attachmentRefs[0].contentHash is required"
    );
  });

  it("rejects malformed Himalaya sync thread id aliases instead of omitting them", async () => {
    const threadIdAdapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_009",
          messages: [
            {
              id: "himalaya_inbound_006",
              threadId: 42,
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z"
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(threadIdAdapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] providerThreadId is required"
    );

    const providerThreadIdAdapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_010",
          messages: [
            {
              id: "himalaya_inbound_007",
              providerThreadId: 42,
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z"
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(providerThreadIdAdapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] providerThreadId is required"
    );
  });

  it("rejects malformed Himalaya sync body instead of omitting it", async () => {
    const adapter = new HimalayaCliAdapter({
      profile: "records",
      runCommand: async () => ({
        stdout: JSON.stringify({
          checkpoint: "himalaya_checkpoint_011",
          messages: [
            {
              id: "himalaya_inbound_008",
              from: "foia@example.gov",
              to: ["investigator@example.org"],
              subject: "Acknowledgement",
              receivedAt: "2026-07-01T17:00:00.000Z",
              body: 42
            }
          ]
        }),
        stderr: ""
      })
    });

    await expect(adapter.syncSince("checkpoint_001")).rejects.toThrow(
      "himalaya sync message[0] body is required"
    );
  });
});

function syncResultWithRawMetadata(
  provider: SyncResult["messages"][number]["provider"],
  rawMetadata: Record<string, string>
): SyncResult {
  return {
    checkpoint: "checkpoint_001",
    messages: [
      {
        provider,
        providerMessageId: "inbound_001",
        from: "foia@example.gov",
        to: ["investigator@example.org"],
        subject: "Acknowledgement",
        receivedAt: "2026-07-01T15:00:00.000Z",
        rawMetadata
      }
    ]
  };
}
