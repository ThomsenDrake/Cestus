import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "./contracts.js";
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
    const payload: AppendableKnowledgeEvent<"assertion.proposed">["payload"] = {
      assertionId: input.assertionId,
      evidenceId: input.evidenceId,
      ...(input.subjectRef === undefined ? {} : { subjectRef: input.subjectRef }),
      predicate: input.predicate,
      object: input.object,
      confidence: input.confidence,
      reviewState: "proposed"
    };
    const event: AppendableKnowledgeEvent<"assertion.proposed"> = {
      type: "assertion.proposed",
      version: 1,
      streamId: this.streamId(input.assertionId),
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
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
    const streamId = this.streamId(input.assertionId);
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const proposed = streamEvents.find(
      (event): event is KnowledgeEventOf<"assertion.proposed"> =>
        event.type === "assertion.proposed" && event.payload.assertionId === input.assertionId
    );

    if (proposed === undefined) {
      throw new Error(`Cannot accept assertion ${input.assertionId} without an assertion.proposed event`);
    }

    const event: AppendableKnowledgeEvent<"assertion.accepted"> = {
      type: "assertion.accepted",
      version: 1,
      streamId,
      context: {
        actor: input.actor,
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

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: streamEvents.length + 1 });

    if (appended.type !== "assertion.accepted") {
      throw new Error(`Unexpected event type appended for assertion acceptance: ${appended.type}`);
    }

    return appended;
  }

  private streamId(assertionId: string): string {
    return `assertion_${assertionId}`;
  }
}
