import type { z } from "zod";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type AssertionObject = string | number | boolean | null;

export interface AssertionProposalInput {
  assertionId: string;
  evidenceId: string;
  subjectRef?: string;
  predicate: string;
  object: AssertionObject;
  confidence: number;
  actor: ActorRef;
}

export interface AssertionAcceptanceInput {
  assertionId: string;
  acceptedBy: string;
  rationale: string;
  actor: ActorRef;
}

interface AssertionServiceDependencies {
  ledger: EventLedger;
}

export class AssertionService {
  constructor(private readonly dependencies: AssertionServiceDependencies) {}

  async propose(input: AssertionProposalInput): Promise<KnowledgeEventOf<"assertion.proposed">> {
    const evidence = await this.findIngestedEvidence(input.evidenceId);
    if (!evidence) {
      throw new Error(`Cannot propose assertion ${input.assertionId} without evidence ${input.evidenceId}`);
    }

    const payload: AppendableKnowledgeEvent<"assertion.proposed">["payload"] = {
      assertionId: input.assertionId,
      evidenceId: input.evidenceId,
      ...(input.subjectRef === undefined ? {} : { subjectRef: input.subjectRef }),
      predicate: input.predicate,
      object: input.object,
      confidence: input.confidence,
      reviewState: "proposed"
    };
    const streamId = this.streamId(input.assertionId);
    const existingEvents = await this.dependencies.ledger.readStream(streamId);
    const existingProposal = existingEvents.find(
      (event): event is KnowledgeEventOf<"assertion.proposed"> =>
        event.type === "assertion.proposed"
    );
    if (existingProposal !== undefined) {
      if (
        JSON.stringify(existingProposal.payload) !== JSON.stringify(payload)
        || JSON.stringify(existingProposal.context.actor) !== JSON.stringify(input.actor)
        || existingProposal.context.causationId !== evidence.id
      ) {
        throw new Error(`Assertion proposal ${input.assertionId} conflicts with exact retry material`);
      }
      return existingProposal;
    }
    if (existingEvents.length > 0) {
      throw new Error(`Assertion proposal ${input.assertionId} conflicts with existing stream state`);
    }
    const event: AppendableKnowledgeEvent<"assertion.proposed"> = {
      type: "assertion.proposed",
      version: 1,
      streamId,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        causationId: evidence.id,
        correlationId: `corr_${input.assertionId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload
    };

    const appended = await this.dependencies.ledger.append(event);

    if (appended.type !== "assertion.proposed") {
      throw new Error(`Unexpected event type appended for assertion proposal: ${appended.type}`);
    }

    return appended;
  }

  async accept(input: AssertionAcceptanceInput): Promise<KnowledgeEventOf<"assertion.accepted">> {
    const actor = actorRefSchema.safeParse(input.actor);
    if (!actor.success) {
      throw new Error(`Invalid assertion review actor: ${actor.error.message}`);
    }
    if (actor.data.kind !== "human") {
      throw new Error("Assertion acceptance requires a human review actor");
    }
    if (input.acceptedBy !== actor.data.id) {
      throw new Error("Assertion acceptance acceptedBy must match the human review actor");
    }

    const streamId = this.streamId(input.assertionId);
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const proposed = streamEvents.find(
      (event): event is KnowledgeEventOf<"assertion.proposed"> =>
        event.type === "assertion.proposed" && event.payload.assertionId === input.assertionId
    );

    if (proposed === undefined) {
      throw new Error(`Cannot accept assertion ${input.assertionId} without an assertion.proposed event`);
    }
    const existing = this.findAcceptance(streamEvents, input.assertionId, proposed.id);
    if (existing !== undefined) {
      return existing;
    }

    const event: AppendableKnowledgeEvent<"assertion.accepted"> = {
      type: "assertion.accepted",
      version: 1,
      streamId,
      context: {
        actor: actor.data,
        occurredAt: new Date().toISOString(),
        causationId: proposed.id,
        correlationId: proposed.context.correlationId,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId: input.assertionId,
        acceptedBy: input.acceptedBy,
        rationale: input.rationale
      }
    };

    let appended;
    try {
      appended = await this.dependencies.ledger.append(event, { expectedNextSequence: streamEvents.length + 1 });
    } catch (error) {
      const currentEvents = await this.dependencies.ledger.readStream(streamId);
      const concurrent = this.findAcceptance(currentEvents, input.assertionId, proposed.id);
      if (concurrent !== undefined) {
        return concurrent;
      }
      throw error;
    }

    if (appended.type !== "assertion.accepted") {
      throw new Error(`Unexpected event type appended for assertion acceptance: ${appended.type}`);
    }

    return appended;
  }

  private findAcceptance(
    events: readonly KnowledgeEvent[],
    assertionId: string,
    proposalEventId: string
  ): KnowledgeEventOf<"assertion.accepted"> | undefined {
    return events.find(
      (event): event is KnowledgeEventOf<"assertion.accepted"> =>
        event.type === "assertion.accepted" &&
        event.payload.assertionId === assertionId &&
        event.context.causationId === proposalEventId
    );
  }

  private streamId(assertionId: string): string {
    return `assertion_${assertionId}`;
  }

  private async findIngestedEvidence(evidenceId: string): Promise<KnowledgeEventOf<"evidence.ingested"> | undefined> {
    const streamEvents = await this.dependencies.ledger.readStream(`evidence_${evidenceId}`);
    return streamEvents.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
    );
  }
}
