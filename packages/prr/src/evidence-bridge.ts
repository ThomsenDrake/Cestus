import type { z } from "zod";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import {
  actorRefSchema,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { EvidenceService } from "../../ontology/src/evidence-service.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface PrrEvidenceBridgeDependencies {
  ledger: EventLedger;
  blobStore: FileBlobStore;
  actor: ActorRef;
}

export interface ProductionArtifactInput {
  prrRequestId: string;
  evidenceId: string;
  filename: string;
  mediaType: string;
  content: Buffer;
}

const prrRequestIdPattern = /^prr_[a-zA-Z0-9_-]+$/;
const evidenceIdPattern = /^ev_[a-zA-Z0-9_-]+$/;
const safeFilenamePattern = /^[a-zA-Z0-9._-]+$/;

export class PrrEvidenceBridge {
  private readonly actor: ActorRef;
  private readonly evidenceService: EvidenceService;

  constructor(dependencies: PrrEvidenceBridgeDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);
    if (!actor.success) {
      throw new Error(`Invalid PRR evidence bridge actor: ${actor.error.message}`);
    }

    this.actor = actor.data;
    this.evidenceService = new EvidenceService({
      ledger: dependencies.ledger,
      blobStore: dependencies.blobStore
    });
  }

  async ingestProductionArtifact(
    input: ProductionArtifactInput
  ): Promise<KnowledgeEventOf<"evidence.ingested">> {
    const artifact = this.validateProductionArtifact(input);

    return this.evidenceService.ingest({
      evidenceId: artifact.evidenceId,
      content: artifact.content,
      mediaType: artifact.mediaType,
      actor: this.actor,
      source: {
        kind: "file",
        label: `PRR production ${artifact.filename}`,
        uri: `cestus:prr/${artifact.prrRequestId}/productions/${artifact.filename}`
      }
    });
  }

  private validateProductionArtifact(input: ProductionArtifactInput): ProductionArtifactInput {
    if (!prrRequestIdPattern.test(input.prrRequestId)) {
      throw new Error("Invalid PRR request ID");
    }
    if (!evidenceIdPattern.test(input.evidenceId)) {
      throw new Error("Invalid evidence ID");
    }

    if (input.filename.trim().length === 0) {
      throw new Error("Production artifact filename is required");
    }
    if (this.isUnsafeFilename(input.filename)) {
      throw new Error("Production artifact filename is unsafe for PRR source URI");
    }

    const mediaType = input.mediaType.trim();
    if (mediaType.length === 0) {
      throw new Error("Production artifact media type is required");
    }

    if (!Buffer.isBuffer(input.content) || input.content.byteLength === 0) {
      throw new Error("Production artifact content must be a non-empty Buffer");
    }

    return {
      ...input,
      mediaType
    };
  }

  private isUnsafeFilename(filename: string): boolean {
    return (
      filename === "." ||
      filename === ".." ||
      !safeFilenamePattern.test(filename)
    );
  }
}
