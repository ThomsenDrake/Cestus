import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { ContactRef, CorrespondenceProvider, JurisdictionPackRef } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

interface PrrLifecycleDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

interface CreateRequestInput {
  prrRequestId: string;
  jurisdictionPack: JurisdictionPackRef;
  agency: ContactRef;
  requester: ContactRef;
  requestText: string;
}

interface MarkRequestSentInput {
  prrRequestId: string;
  correspondenceId: string;
  provider: CorrespondenceProvider;
  providerMessageId: string;
  providerThreadId?: string;
  idempotencyKey: string;
  subject: string;
  bodyHash: string;
  attachmentEvidenceIds: string[];
  sentAt: string;
  approvedBy: string;
  rawMetadata: Record<string, string>;
}

export class PrrLifecycleService {
  constructor(private readonly dependencies: PrrLifecycleDependencies) {}

  async createRequest(input: CreateRequestInput): Promise<KnowledgeEventOf<"prr.request.created">> {
    const event: AppendableKnowledgeEvent<"prr.request.created"> = {
      type: "prr.request.created",
      version: 1,
      streamId: input.prrRequestId,
      context: this.context(`corr_${input.prrRequestId}`),
      payload: {
        ...input,
        status: "draft"
      }
    };

    return this.appendTyped(event, "prr.request.created", 1);
  }

  async markRequestSent(input: MarkRequestSentInput): Promise<KnowledgeEventOf<"prr.request.sent">> {
    const events = await this.dependencies.ledger.readStream(input.prrRequestId);
    const created = events.find((event) => event.type === "prr.request.created");

    if (!created) {
      throw new Error(`Cannot send request ${input.prrRequestId} before it is created`);
    }

    const sent = events.find((event) => event.type === "prr.request.sent");
    if (sent) {
      throw new Error(`Cannot send request ${input.prrRequestId} more than once`);
    }

    const event: AppendableKnowledgeEvent<"prr.request.sent"> = {
      type: "prr.request.sent",
      version: 1,
      streamId: input.prrRequestId,
      context: this.context(created.context.correlationId, created.id),
      payload: input
    };

    return this.appendTyped(event, "prr.request.sent", events.length + 1);
  }

  private context(correlationId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    };
  }

  private async appendTyped<Type extends KnowledgeEvent["type"]>(
    event: AppendableKnowledgeEvent<Type>,
    expectedType: Type,
    expectedNextSequence?: number
  ): Promise<KnowledgeEventOf<Type>> {
    const appended = await this.dependencies.ledger.append(
      event,
      expectedNextSequence === undefined ? {} : { expectedNextSequence }
    );

    if (appended.type !== expectedType) {
      throw new Error(`Unexpected event type ${appended.type}`);
    }

    return appended as KnowledgeEventOf<Type>;
  }
}
