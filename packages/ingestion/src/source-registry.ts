import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const localFilesystemAdapter = { name: "local-filesystem", version: "0.1.0" } as const;

export interface IngestionSourceRegistryDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

export interface RegisterLocalSourceInput {
  sourceCollectionId: string;
  label: string;
  rootUri: string;
  workspaceUri: string;
}

export interface UpdateSourceLabelInput {
  sourceCollectionId: string;
  label: string;
  rationale?: string;
}

export class IngestionSourceRegistry {
  constructor(private readonly dependencies: IngestionSourceRegistryDependencies) {}

  async registerLocalSource(input: RegisterLocalSourceInput): Promise<KnowledgeEventOf<"ingestion.source.registered">> {
    const streamId = this.streamId(input.sourceCollectionId);
    const existingEvents = await this.dependencies.ledger.readStream(streamId);

    if (existingEvents.length > 0) {
      throw new Error(`Source collection ${input.sourceCollectionId} is already registered`);
    }

    const event: AppendableKnowledgeEvent<"ingestion.source.registered"> = {
      type: "ingestion.source.registered",
      version: 1,
      streamId,
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.sourceCollectionId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        sourceCollectionId: input.sourceCollectionId,
        label: input.label,
        mode: "read-only",
        adapter: localFilesystemAdapter,
        rootUri: input.rootUri,
        workspaceUri: input.workspaceUri
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "ingestion.source.registered") {
      throw new Error(`Unexpected event type appended for source registration: ${appended.type}`);
    }

    return appended;
  }

  async updateSourceLabel(
    input: UpdateSourceLabelInput
  ): Promise<KnowledgeEventOf<"ingestion.source.label.updated">> {
    const streamId = this.streamId(input.sourceCollectionId);
    const existingEvents = await this.dependencies.ledger.readStream(streamId);
    const registered = existingEvents.find(
      (event): event is KnowledgeEventOf<"ingestion.source.registered"> =>
        event.type === "ingestion.source.registered" &&
        event.payload.sourceCollectionId === input.sourceCollectionId
    );

    if (existingEvents.length === 0 || registered === undefined) {
      throw new Error(`Source collection ${input.sourceCollectionId} is not registered`);
    }

    let currentLabel = registered.payload.label;
    for (const existing of existingEvents) {
      if (
        existing.type === "ingestion.source.label.updated" &&
        existing.payload.sourceCollectionId === input.sourceCollectionId
      ) {
        currentLabel = existing.payload.label;
      }
    }

    const nextLabel = input.label.trim();
    if (nextLabel.length === 0) {
      throw new Error("Source label must be a non-empty string");
    }
    if (nextLabel === currentLabel) {
      throw new Error(`Source collection ${input.sourceCollectionId} already has that label`);
    }

    const rationale = input.rationale === undefined ? undefined : input.rationale.trim();
    if (input.rationale !== undefined && rationale === "") {
      throw new Error("Rationale must be a non-empty string when provided");
    }

    const lastEvent = existingEvents.at(-1)!;
    const event: AppendableKnowledgeEvent<"ingestion.source.label.updated"> = {
      type: "ingestion.source.label.updated",
      version: 1,
      streamId,
      context: {
        actor: this.dependencies.actor,
        occurredAt: new Date().toISOString(),
        causationId: lastEvent.id,
        correlationId: `corr_${input.sourceCollectionId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        sourceCollectionId: input.sourceCollectionId,
        label: nextLabel,
        previousLabel: currentLabel,
        ...(rationale === undefined ? {} : { rationale }),
        actor: this.dependencies.actor
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: existingEvents.length + 1
    });

    if (appended.type !== "ingestion.source.label.updated") {
      throw new Error(`Unexpected event type appended for source label update: ${appended.type}`);
    }

    return appended;
  }

  private streamId(sourceCollectionId: string): string {
    return `ingestion_source_${sourceCollectionId}`;
  }
}
