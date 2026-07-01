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
    return normalizeSyncResult("gmail", await this.options.client.syncSince(checkpoint));
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
    return normalizeSyncResult("imap-smtp", await this.options.imap.syncSince(checkpoint));
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
    return normalizeSyncResult("himalaya", parseHimalayaSyncOutput(result.stdout, checkpoint));
  }

  private buildSendArgs(input: ApprovedMessageInput): string[] {
    const args: string[] = [];
    args.push("--account", this.options.profile);
    args.push("message", "send");
    args.push("--from", input.from);
    args.push("--to", input.to.join(","));

    if (input.cc !== undefined && input.cc.length > 0) {
      args.push("--cc", input.cc.join(","));
    }

    args.push("--subject", input.subject);
    args.push("--body", input.body);
    args.push("--output", "json");
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

function parseHimalayaSyncOutput(stdout: string, fallbackCheckpoint: string): {
  checkpoint: string;
  messages: unknown[];
} {
  const parsed = parseJson(stdout || "[]", "Himalaya sync output was not valid JSON");

  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) {
    throw new Error("Himalaya sync output must include a messages array");
  }

  const checkpoint = stringValue(parsed.checkpoint) ?? fallbackCheckpoint;
  return {
    checkpoint,
    messages: parseHimalayaMessages(parsed.messages)
  };
}

function parseHimalayaMessages(values: unknown[]): unknown[] {
  return values.map((value, index) => {
    if (!isRecord(value)) {
      throw new Error(`himalaya sync message[${index}] must be an object`);
    }

    const message: Record<string, unknown> = {
      provider: "himalaya",
      to: value.to,
      rawMetadata: value.rawMetadata ?? { provider: "himalaya" }
    };

    const providerMessageId = stringValue(value.providerMessageId) ?? stringValue(value.id);
    if (providerMessageId !== undefined) {
      message.providerMessageId = providerMessageId;
    }
    const providerThreadId = stringValue(value.providerThreadId) ?? stringValue(value.threadId);
    if (providerThreadId !== undefined) {
      message.providerThreadId = providerThreadId;
    }
    const from = stringValue(value.from);
    if (from !== undefined) {
      message.from = from;
    }
    if ("cc" in value) {
      message.cc = value.cc;
    }
    const subject = stringValue(value.subject);
    if (subject !== undefined) {
      message.subject = subject;
    }
    const receivedAt = stringValue(value.receivedAt) ?? stringValue(value.date);
    if (receivedAt !== undefined) {
      message.receivedAt = receivedAt;
    }
    const body = stringValue(value.body);
    if (body !== undefined) {
      message.body = body;
    }
    if ("attachmentRefs" in value) {
      message.attachmentRefs = value.attachmentRefs;
    }

    return message;
  });
}

function normalizeSyncResult(
  provider: AdapterCapabilities["provider"],
  result: unknown
): SyncResult {
  if (!isRecord(result)) {
    throw new Error(`${provider} sync result must be an object`);
  }

  const checkpoint = stringValue(result.checkpoint);
  if (checkpoint === undefined) {
    throw new Error(`${provider} sync checkpoint is required`);
  }

  if (!Array.isArray(result.messages)) {
    throw new Error(`${provider} sync messages must be an array`);
  }

  return {
    checkpoint,
    messages: result.messages.map((message, index) => normalizeSyncedMessage(provider, message, index))
  };
}

function normalizeSyncedMessage(
  provider: AdapterCapabilities["provider"],
  value: unknown,
  index: number
): SyncedMessage {
  if (!isRecord(value)) {
    throw new Error(`${provider} sync message[${index}] must be an object`);
  }

  const prefix = `${provider} sync message[${index}]`;
  const providerMessageId = requiredString(value.providerMessageId, `${prefix} providerMessageId is required`);
  const from = requiredString(value.from, `${prefix} from is required`);
  const subject = requiredString(value.subject, `${prefix} subject is required`);
  const receivedAt = requiredString(value.receivedAt, `${prefix} receivedAt is required`);
  const to = requiredRecipientArray(value.to, `${prefix} to`);

  const message: SyncedMessage = {
    provider,
    providerMessageId,
    from,
    to,
    subject,
    receivedAt,
    rawMetadata: normalizeRawMetadata(provider, value.rawMetadata, index)
  };

  const providerThreadId = optionalString(value.providerThreadId, `${prefix} providerThreadId is required`);
  if (providerThreadId !== undefined) {
    message.providerThreadId = providerThreadId;
  }
  const cc = optionalStringArray(value.cc, `${prefix} cc`);
  if (cc !== undefined) {
    message.cc = cc;
  }
  const body = optionalString(value.body, `${prefix} body is required`);
  if (body !== undefined) {
    message.body = body;
  }
  const attachmentRefs = normalizeAttachmentRefs(value.attachmentRefs, prefix);
  if (attachmentRefs !== undefined) {
    message.attachmentRefs = attachmentRefs;
  }

  return message;
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

function requiredString(value: unknown, message: string): string {
  const normalized = stringValue(typeof value === "string" ? value.trim() : value);
  if (normalized === undefined) {
    throw new Error(message);
  }
  return normalized;
}

function optionalString(value: unknown, message: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, message);
}

function requiredStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => requiredString(item, `${label}[${index}] is required`));
}

function requiredRecipientArray(value: unknown, label: string): string[] {
  const recipients = requiredStringArray(value, label);
  if (recipients.length === 0) {
    throw new Error(`${label} must include at least one recipient`);
  }
  return recipients;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return requiredStringArray(value, label);
}

function normalizeAttachmentRefs(value: unknown, prefix: string): SyncedMessage["attachmentRefs"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${prefix} attachmentRefs must be an array`);
  }
  return value.map((attachment, index) => {
    if (!isRecord(attachment)) {
      throw new Error(`${prefix} attachmentRefs[${index}] must be an object`);
    }
    return {
      filename: requiredString(attachment.filename, `${prefix} attachmentRefs[${index}].filename is required`),
      contentHash: requiredString(
        attachment.contentHash,
        `${prefix} attachmentRefs[${index}].contentHash is required`
      )
    };
  });
}

function normalizeRawMetadata(
  provider: AdapterCapabilities["provider"],
  value: unknown,
  index: number
): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${provider} sync message[${index}] rawMetadata must be an object`);
  }

  const metadata: Record<string, string> = {};
  for (const [key, metadataValue] of Object.entries(value)) {
    if (/token|secret|password|oauth|credential|config/i.test(key)) {
      throw new Error(`${provider} sync message[${index}] rawMetadata key ${key} is not allowed`);
    }
    if (typeof metadataValue !== "string") {
      throw new Error(`${provider} sync message[${index}] rawMetadata key ${key} must be a string`);
    }
    metadata[key] = metadataValue;
  }
  return metadata;
}
