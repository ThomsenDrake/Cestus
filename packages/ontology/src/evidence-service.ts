import type { z } from "zod";
import {
  actorRefSchema,
  sourceRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import type { FileBlobStore } from "./blob-store.js";
import type { EventLedger } from "./event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type SourceRef = z.infer<typeof sourceRefSchema>;

export interface EvidenceIngestionInput {
  evidenceId: string;
  content: Buffer;
  mediaType: string;
  source: SourceRef;
  actor: ActorRef;
}

interface EvidenceServiceDependencies {
  blobStore: FileBlobStore;
  ledger: EventLedger;
}

export class EvidenceService {
  constructor(private readonly dependencies: EvidenceServiceDependencies) {}

  async ingest(input: EvidenceIngestionInput): Promise<KnowledgeEventOf<"evidence.ingested">> {
    const stored = await this.dependencies.blobStore.put(input.content);
    const event: AppendableKnowledgeEvent<"evidence.ingested"> = {
      type: "evidence.ingested",
      version: 1,
      streamId: `evidence_${input.evidenceId}`,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.evidenceId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: input.evidenceId,
        source: input.source,
        contentHash: stored.contentHash,
        mediaType: input.mediaType,
        sizeBytes: stored.sizeBytes
      }
    };

    const appended = await this.dependencies.ledger.append(event);

    if (appended.type !== "evidence.ingested") {
      throw new Error(`Unexpected event type appended for evidence ingestion: ${appended.type}`);
    }

    return appended;
  }
}
