import { createHash } from "node:crypto";
import type { z } from "zod";
import { actorRefSchema, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  assertApprovedMessageInput,
  type ApprovedMessageAttachment,
  type CorrespondenceAdapter
} from "./correspondence-adapter.js";
import { PrrLifecycleService } from "./lifecycle.js";
import type { CorrespondenceProvider } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type AdapterMap = Partial<Record<CorrespondenceProvider, CorrespondenceAdapter>>;

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

export class PrrCorrespondenceService {
  constructor(private readonly dependencies: PrrCorrespondenceDependencies) {}

  async sendInitialRequest(input: SendInitialRequestInput): Promise<KnowledgeEventOf<"prr.request.sent">> {
    const adapter = this.dependencies.adapters[input.provider];
    if (adapter === undefined) {
      throw new Error(`No correspondence adapter configured for ${input.provider}`);
    }

    const approvedMessageInput = {
      idempotencyKey: `send_${input.prrRequestId}_${input.correspondenceId}`,
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

    const lifecycle = new PrrLifecycleService({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    return lifecycle.markRequestSent({
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
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
