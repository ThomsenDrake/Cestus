import type { CorrespondenceProvider } from "./types.js";

export type CredentialMode = "cestus-oauth" | "external-secret" | "external-config";

export interface AdapterCapabilities {
  provider: CorrespondenceProvider;
  canSend: boolean;
  canSync: boolean;
  canFetchAttachments: boolean;
  credentialMode: CredentialMode;
}

export interface ApprovedMessageAttachment {
  filename: string;
  contentHash: string;
}

export interface ApprovedMessageInput {
  idempotencyKey: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  approvedBy: string;
  attachments: ApprovedMessageAttachment[];
}

export interface SentMessageResult {
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string;
  sentAt: string;
  rawMetadata: Record<string, string>;
}

export interface SyncedMessage {
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  receivedAt: string;
  body?: string;
  attachmentRefs?: ApprovedMessageAttachment[];
  rawMetadata: Record<string, string>;
}

export interface SyncResult {
  checkpoint: string;
  messages: SyncedMessage[];
}

export interface CorrespondenceAdapter {
  capabilities(): Promise<AdapterCapabilities>;
  sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult>;
  syncSince(checkpoint?: string): Promise<SyncResult>;
}

type FakeSyncedMessage = Omit<SyncedMessage, "provider" | "rawMetadata"> & {
  rawMetadata?: Record<string, string>;
};

export interface FakeCorrespondenceAdapterOptions {
  provider: CorrespondenceProvider;
  syncedMessages?: FakeSyncedMessage[];
}

export class FakeCorrespondenceAdapter implements CorrespondenceAdapter {
  private readonly provider: CorrespondenceProvider;
  private readonly syncedMessages: FakeSyncedMessage[];

  constructor(options: FakeCorrespondenceAdapterOptions) {
    this.provider = options.provider;
    this.syncedMessages = options.syncedMessages ?? [];
  }

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: this.provider,
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      credentialMode: credentialModeForProvider(this.provider)
    };
  }

  async sendApprovedMessage(input: ApprovedMessageInput): Promise<SentMessageResult> {
    validateApprovedMessageInput(input);

    return {
      provider: this.provider,
      providerMessageId: `fake_msg_${input.idempotencyKey}`,
      providerThreadId: `fake_thread_${input.idempotencyKey}`,
      sentAt: "2026-07-01T16:00:00.000Z",
      rawMetadata: {
        approvedBy: input.approvedBy,
        idempotencyKey: input.idempotencyKey,
        provider: this.provider
      }
    };
  }

  async syncSince(checkpoint = "start"): Promise<SyncResult> {
    return {
      checkpoint: `fake_checkpoint_${this.provider}_${checkpoint}`,
      messages: this.syncedMessages.map((message) => this.toSyncedMessage(message, checkpoint))
    };
  }

  private toSyncedMessage(message: FakeSyncedMessage, checkpoint: string): SyncedMessage {
    const synced: SyncedMessage = {
      provider: this.provider,
      providerMessageId: message.providerMessageId,
      from: message.from,
      to: [...message.to],
      subject: message.subject,
      receivedAt: message.receivedAt,
      rawMetadata: {
        checkpoint,
        provider: this.provider,
        ...message.rawMetadata
      }
    };

    if (message.providerThreadId !== undefined) {
      synced.providerThreadId = message.providerThreadId;
    }
    if (message.cc !== undefined) {
      synced.cc = [...message.cc];
    }
    if (message.body !== undefined) {
      synced.body = message.body;
    }
    if (message.attachmentRefs !== undefined) {
      synced.attachmentRefs = message.attachmentRefs.map((attachment) => ({ ...attachment }));
    }

    return synced;
  }
}

function credentialModeForProvider(provider: CorrespondenceProvider): CredentialMode {
  if (provider === "gmail") {
    return "cestus-oauth";
  }
  if (provider === "himalaya") {
    return "external-config";
  }
  return "external-secret";
}

function validateApprovedMessageInput(input: ApprovedMessageInput): void {
  requireNonBlank(input.idempotencyKey, "idempotencyKey is required");
  requireNonBlank(input.from, "from is required");
  if (input.to.length === 0) {
    throw new Error("to must include at least one recipient");
  }
  input.to.forEach((recipient, index) => {
    requireNonBlank(recipient, `to[${index}] is required`);
  });
  requireNonBlank(input.subject, "subject is required");
  requireNonBlank(input.body, "body is required");
  requireNonBlank(input.approvedBy, "approvedBy is required for one-click send");
}

function requireNonBlank(value: string | undefined, message: string): void {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(message);
  }
}
