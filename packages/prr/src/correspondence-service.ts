import { createHash } from "node:crypto";
import { z } from "zod";
import { actorRefSchema, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  assertApprovedMessageInput,
  type ApprovedMessageAttachment,
  type CorrespondenceAdapter,
  type SentMessageResult
} from "./correspondence-adapter.js";
import { PrrLifecycleService } from "./lifecycle.js";
import type { CorrespondenceProvider } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type AdapterMap = Partial<Record<CorrespondenceProvider, CorrespondenceAdapter>>;

const sentAtSchema = z.string().datetime();
const secretShapedMetadataValuePattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)[a-z0-9._~+/=-]{3,}/i;

interface PrrCorrespondenceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
  adapters: AdapterMap;
}

interface SendInitialRequestInput {
  prrRequestId: string;
  correspondenceId: string;
  provider: CorrespondenceProvider;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  approvedBy: string;
  attachments?: ApprovedMessageAttachment[];
}

interface SendFollowUpInput extends SendInitialRequestInput {}

export class PrrCorrespondenceService {
  constructor(private readonly dependencies: PrrCorrespondenceDependencies) {}

  async sendInitialRequest(input: SendInitialRequestInput): Promise<KnowledgeEventOf<"prr.request.sent">> {
    const adapter = this.dependencies.adapters[input.provider];
    if (adapter === undefined) {
      throw new Error(`No correspondence adapter configured for ${input.provider}`);
    }

    const idempotencyKey = `send_${input.prrRequestId}_${input.correspondenceId}`;
    const approvedMessageInput = {
      idempotencyKey,
      from: input.from,
      to: input.to,
      ...(input.cc === undefined ? {} : { cc: input.cc }),
      subject: input.subject,
      body: input.body,
      approvedBy: input.approvedBy,
      attachments: input.attachments ?? []
    };
    assertApprovedMessageInput(approvedMessageInput);
    await this.assertRequestCanBeSent(input.prrRequestId);

    const sent = await adapter.sendApprovedMessage(approvedMessageInput);
    const rawMetadata = validateProviderResult(input.provider, sent);

    const lifecycle = new PrrLifecycleService({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    return lifecycle.markRequestSent({
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      provider: input.provider,
      providerMessageId: sent.providerMessageId,
      ...(sent.providerThreadId === undefined ? {} : { providerThreadId: sent.providerThreadId }),
      idempotencyKey,
      subject: input.subject,
      bodyHash: sha256(input.body),
      attachmentEvidenceIds: approvedMessageInput.attachments.flatMap((attachment) =>
        attachment.evidenceId === undefined ? [] : [attachment.evidenceId]
      ),
      sentAt: sent.sentAt,
      approvedBy: input.approvedBy,
      rawMetadata
    });
  }

  async sendFollowUp(input: SendFollowUpInput): Promise<KnowledgeEventOf<"prr.followup.sent">> {
    const idempotencyKey = `followup_${input.prrRequestId}_${input.correspondenceId}`;
    const approvedMessageInput = {
      idempotencyKey,
      from: input.from,
      to: input.to,
      ...(input.cc === undefined ? {} : { cc: input.cc }),
      subject: input.subject,
      body: input.body,
      approvedBy: input.approvedBy,
      attachments: input.attachments ?? []
    };
    assertApprovedMessageInput(approvedMessageInput);
    if (approvedMessageInput.attachments.length > 0) {
      throw new Error("Follow-up attachments are not supported until the lifecycle event can attest them");
    }
    await this.assertRequestCanReceiveFollowUp(input.prrRequestId, input.correspondenceId);

    const adapter = this.dependencies.adapters[input.provider];
    if (adapter === undefined) {
      throw new Error(`No correspondence adapter configured for ${input.provider}`);
    }

    const sent = await adapter.sendApprovedMessage(approvedMessageInput);
    validateProviderResult(input.provider, sent);

    const lifecycle = new PrrLifecycleService({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    return lifecycle.markFollowUpSent({
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      provider: input.provider,
      providerMessageId: sent.providerMessageId,
      subject: input.subject,
      bodyHash: sha256(input.body),
      sentAt: sent.sentAt,
      approvedBy: input.approvedBy
    });
  }

  private async assertRequestCanBeSent(prrRequestId: string): Promise<void> {
    const events = await this.dependencies.ledger.readStream(prrRequestId);
    const created = events.find((event) => event.type === "prr.request.created");
    if (created === undefined) {
      throw new Error(`Cannot send request ${prrRequestId} before it is created`);
    }

    const sent = events.find((event) => event.type === "prr.request.sent");
    if (sent !== undefined) {
      throw new Error(`Cannot send request ${prrRequestId} more than once`);
    }
  }

  private async assertRequestCanReceiveFollowUp(prrRequestId: string, correspondenceId: string): Promise<void> {
    const events = await this.dependencies.ledger.readStream(prrRequestId);
    const created = events.find((event) => event.type === "prr.request.created");
    if (created === undefined) {
      throw new Error(`Cannot send follow-up for ${prrRequestId} before it is created`);
    }

    const initialSent = events.find((event) => event.type === "prr.request.sent");
    if (initialSent === undefined) {
      throw new Error(`Cannot send follow-up for ${prrRequestId} before the initial request is sent`);
    }

    if (events.some((event) => event.type === "prr.request.closed")) {
      throw new Error(`Cannot send follow-up for closed request ${prrRequestId}`);
    }

    const duplicate = events.find(
      (event) =>
        (event.type === "prr.request.sent" || event.type === "prr.followup.sent") &&
        event.payload.correspondenceId === correspondenceId
    );
    if (duplicate !== undefined) {
      throw new Error(`Cannot send duplicate correspondence ${correspondenceId} for request ${prrRequestId}`);
    }
  }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function validateProviderResult(
  expectedProvider: CorrespondenceProvider,
  sent: SentMessageResult
): Record<string, string> {
  if (sent.provider !== expectedProvider) {
    throw new Error(`Provider result did not match requested provider ${expectedProvider}`);
  }
  if (sent.providerMessageId.trim().length === 0) {
    throw new Error("Provider result did not include a message id");
  }
  if (
    secretShapedMetadataValuePattern.test(sent.providerMessageId) ||
    (sent.providerThreadId !== undefined && secretShapedMetadataValuePattern.test(sent.providerThreadId))
  ) {
    throw new Error("Provider result contains a secret-shaped reference");
  }
  if (!sentAtSchema.safeParse(sent.sentAt).success) {
    throw new Error("Provider result did not include a valid sent timestamp");
  }

  return validateSentRawMetadata(sent.rawMetadata);
}

function validateSentRawMetadata(rawMetadata: Record<string, string>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (/token|secret|password|oauth|credential|config/i.test(key)) {
      throw new Error("Provider result metadata contains a disallowed key");
    }
    if (typeof value !== "string") {
      throw new Error("Provider result metadata contains an invalid value");
    }
    if (secretShapedMetadataValuePattern.test(value)) {
      throw new Error("Provider result metadata contains a secret-shaped value");
    }
    metadata[key] = value;
  }
  return metadata;
}
