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

  private streamId(sourceCollectionId: string): string {
    return `ingestion_source_${sourceCollectionId}`;
  }
}
