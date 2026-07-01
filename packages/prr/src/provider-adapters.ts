import {
  assertApprovedMessageInput,
  type AdapterCapabilities,
  type ApprovedMessageInput,
  type CorrespondenceAdapter,
  type SentMessageResult,
  type SyncedMessage,
  type SyncResult
} from "./correspondence-adapter.js";

interface ProviderSendResult {
  providerMessageId: string;
  providerThreadId?: string;
  sentAt: string;
}

export interface GmailClientPort {
  send(input: ApprovedMessageInput): Promise<ProviderSendResult>;
  syncSince(checkpoint?: string): Promise<SyncResult>;
}

export interface SmtpClientPort {
  send(input: ApprovedMessageInput): Promise<ProviderSendResult>;
}

export interface ImapClientPort {
  syncSince(checkpoint?: string): Promise<SyncResult>;
}

export class GmailCorrespondenceAdapter implements CorrespondenceAdapter {
  constructor(
    private readonly options: {
      accountEmail: string;
      client: GmailClientPort;
    }
  ) {}

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "cestus-oauth"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    assertApprovedMessageInput(input);

    const sent = await this.options.client.send(input);
    const result: SentMessageResult = {
      provider: "gmail",
      providerMessageId: sent.providerMessageId,
      sentAt: sent.sentAt,
      rawMetadata: { accountEmail: this.options.accountEmail }
    };
    if (sent.providerThreadId !== undefined) {
      result.providerThreadId = sent.providerThreadId;
    }
    return result;
  }

  async syncSince(checkpoint?: string): Promise<SyncResult> {
    return this.options.client.syncSince(checkpoint);
  }
}

export class ImapSmtpCorrespondenceAdapter implements CorrespondenceAdapter {
  constructor(
    private readonly options: {
      accountEmail: string;
      smtp: SmtpClientPort;
      imap: ImapClientPort;
    }
  ) {}

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: "imap-smtp",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-secret"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    assertApprovedMessageInput(input);

    const sent = await this.options.smtp.send(input);
    const result: SentMessageResult = {
      provider: "imap-smtp",
      providerMessageId: sent.providerMessageId,
      sentAt: sent.sentAt,
      rawMetadata: { accountEmail: this.options.accountEmail }
    };
    if (sent.providerThreadId !== undefined) {
      result.providerThreadId = sent.providerThreadId;
    }
    return result;
  }

  async syncSince(checkpoint?: string): Promise<SyncResult> {
    return this.options.imap.syncSince(checkpoint);
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export class HimalayaCliAdapter implements CorrespondenceAdapter {
  constructor(
    private readonly options: {
      profile: string;
      runCommand: CommandRunner;
    }
  ) {}

  async capabilities(): Promise<AdapterCapabilities> {
    await this.options.runCommand("himalaya", ["--version"]);
    return {
      provider: "himalaya",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: "external-config"
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    assertApprovedMessageInput(input);

    const result = await this.options.runCommand("himalaya", this.buildSendArgs(input));
    const parsed = parseHimalayaSendOutput(result.stdout);
    const sent: SentMessageResult = {
      provider: "himalaya",
      providerMessageId: parsed.messageId,
      sentAt: parsed.sentAt ?? new Date().toISOString(),
      rawMetadata: { profile: this.options.profile }
    };
    if (parsed.threadId !== undefined) {
      sent.providerThreadId = parsed.threadId;
    }
    return sent;
  }

  async syncSince(checkpoint = "start"): Promise<SyncResult> {
    const result = await this.options.runCommand("himalaya", [
      "--account",
      this.options.profile,
      "envelope",
      "list",
      "--output",
      "json"
    ]);
    const parsed = parseHimalayaSyncOutput(result.stdout);
    return {
      checkpoint: parsed.checkpoint ?? checkpoint,
      messages: parsed.messages
    };
  }

  private buildSendArgs(input: ApprovedMessageInput): string[] {
    const args = [
      "--account",
      this.options.profile,
      "message",
      "send",
      "--from",
      input.from,
      "--to",
      input.to.join(","),
      "--subject",
      input.subject,
      "--body",
      input.body,
      "--output",
      "json"
    ];

    if (input.cc !== undefined && input.cc.length > 0) {
      args.splice(10, 0, "--cc", input.cc.join(","));
    }

    return args;
  }
}

function parseHimalayaSendOutput(stdout: string): {
  messageId: string;
  threadId?: string;
  sentAt?: string;
} {
  const parsed = parseJson(stdout, "Himalaya send output was not valid JSON");
  if (!isRecord(parsed)) {
    throw new Error("Himalaya send output did not include a message id");
  }

  const messageId = stringValue(parsed.id) ?? stringValue(parsed.messageId);
  if (messageId === undefined) {
    throw new Error("Himalaya send output did not include a message id");
  }

  const result: { messageId: string; threadId?: string; sentAt?: string } = { messageId };
  const threadId = stringValue(parsed.threadId) ?? stringValue(parsed.thread_id);
  if (threadId !== undefined) {
    result.threadId = threadId;
  }
  const sentAt = stringValue(parsed.sentAt) ?? stringValue(parsed.sent_at);
  if (sentAt !== undefined) {
    result.sentAt = sentAt;
  }
  return result;
}

function parseHimalayaSyncOutput(stdout: string): { checkpoint?: string; messages: SyncedMessage[] } {
  const parsed = parseJson(stdout || "[]", "Himalaya sync output was not valid JSON");

  if (Array.isArray(parsed)) {
    return { messages: parseSyncedMessages(parsed) };
  }

  if (isRecord(parsed)) {
    const messages = Array.isArray(parsed.messages) ? parseSyncedMessages(parsed.messages) : [];
    const checkpoint = stringValue(parsed.checkpoint);
    return checkpoint === undefined ? { messages } : { checkpoint, messages };
  }

  return { messages: [] };
}

function parseSyncedMessages(values: unknown[]): SyncedMessage[] {
  const messages: SyncedMessage[] = [];
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }

    const providerMessageId = stringValue(value.providerMessageId) ?? stringValue(value.id);
    const from = stringValue(value.from);
    const subject = stringValue(value.subject);
    const receivedAt = stringValue(value.receivedAt) ?? stringValue(value.date);
    const to = stringArrayValue(value.to);
    if (
      providerMessageId === undefined ||
      from === undefined ||
      to === undefined ||
      subject === undefined ||
      receivedAt === undefined
    ) {
      continue;
    }

    const message: SyncedMessage = {
      provider: "himalaya",
      providerMessageId,
      from,
      to,
      subject,
      receivedAt,
      rawMetadata: { provider: "himalaya" }
    };

    const providerThreadId = stringValue(value.providerThreadId) ?? stringValue(value.threadId);
    if (providerThreadId !== undefined) {
      message.providerThreadId = providerThreadId;
    }
    const cc = stringArrayValue(value.cc);
    if (cc !== undefined) {
      message.cc = cc;
    }
    const body = stringValue(value.body);
    if (body !== undefined) {
      message.body = body;
    }

    messages.push(message);
  }
  return messages;
}

function parseJson(stdout: string, message: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return [...value] as string[];
}

