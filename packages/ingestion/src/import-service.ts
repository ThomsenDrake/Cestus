import { createHash } from "node:crypto";
import { z } from "zod";
import { EvidenceService } from "../../ontology/src/evidence-service.js";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { WorkspaceBlobStore } from "./mount-contract.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type ContentHash = `sha256:${string}`;

const sourceCollectionIdSchema = z.string().regex(/^src_[a-zA-Z0-9_-]+$/);
const scanBatchIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]+$/);
const importBatchIdSchema = z.string().regex(/^imp_[a-zA-Z0-9_-]+$/);
const occurrenceIdSchema = z.string().regex(/^occ_[a-zA-Z0-9_-]+$/);
const importApprovedOccurrencesInputSchema = z.object({
  sourceCollectionId: sourceCollectionIdSchema,
  scanBatchId: scanBatchIdSchema,
  importBatchId: importBatchIdSchema,
  occurrences: z.array(z.object({
    occurrenceId: occurrenceIdSchema,
    content: z.instanceof(Buffer),
    sourcePath: z.string().min(1),
    mediaType: z.string().min(1)
  }).strict()).min(1)
}).strict();

export interface IngestionImportServiceDependencies {
  ledger: EventLedger;
  blobStore: WorkspaceBlobStore;
  actor: ActorRef;
}

export interface ApproveImportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
  approvedBy: string;
  approvedAt?: string;
}

export interface ImportOccurrenceInput {
  occurrenceId: string;
  content: Buffer;
  sourcePath: string;
  mediaType: string;
}

export interface ImportApprovedOccurrencesInput {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
  occurrences: ImportOccurrenceInput[];
}

export interface ImportApprovedOccurrencesResult {
  totals: {
    evidenceCreated: number;
    occurrencesLinked: number;
    duplicatesReused: number;
    skipped: number;
  };
}

interface OccurrenceGroup {
  contentHash: ContentHash;
  representative: ImportOccurrenceInput;
  occurrenceIds: string[];
}

export class IngestionImportService {
  private readonly evidenceService: EvidenceService;

  constructor(private readonly dependencies: IngestionImportServiceDependencies) {
    this.evidenceService = new EvidenceService({
      ledger: dependencies.ledger,
      blobStore: dependencies.blobStore as FileBlobStore
    });
  }

  async approveImport(input: ApproveImportInput): Promise<KnowledgeEventOf<"ingestion.import.approved">> {
    this.assertHumanApprovalActor(input.approvedBy);
    const event: AppendableKnowledgeEvent<"ingestion.import.approved"> = {
      type: "ingestion.import.approved",
      version: 1,
      streamId: this.importStreamId(input),
      context: this.context(`corr_${input.importBatchId}`),
      payload: {
        importBatchId: input.importBatchId,
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt ?? new Date().toISOString()
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "ingestion.import.approved") {
      throw new Error(`Unexpected event type appended for import approval: ${appended.type}`);
    }

    return appended;
  }

  private assertHumanApprovalActor(approvedBy: string): void {
    if (this.dependencies.actor.kind !== "human" || approvedBy !== this.dependencies.actor.id) {
      throw new Error("Raw import approval requires the configured human service actor.");
    }
  }

  async importApprovedOccurrences(
    input: ImportApprovedOccurrencesInput
  ): Promise<ImportApprovedOccurrencesResult> {
    this.validateImportRequest(input);
    const approval = await this.findApproval(input);

    if (approval === undefined) {
      throw new Error(
        `Import approval is required before importing ${input.sourceCollectionId}/${input.scanBatchId}/${input.importBatchId}`
      );
    }

    const groups = this.groupOccurrencesByContentHash(input.occurrences);
    const existingEvents = await this.dependencies.ledger.readAll();
    const existingCompletion = this.findCompletedImport(existingEvents, input);

    if (existingCompletion !== undefined) {
      return { totals: existingCompletion.payload.totals };
    }

    for (const group of groups.values()) {
      const deterministicEvidenceId = this.evidenceIdForContentHash(group.contentHash);
      const existingEvidence = this.findExistingEvidence(existingEvents, deterministicEvidenceId, group.contentHash);
      const evidenceId = existingEvidence?.payload.evidenceId ?? deterministicEvidenceId;

      if (existingEvidence === undefined) {
        const evidence = await this.evidenceService.ingest({
          evidenceId,
          content: group.representative.content,
          mediaType: group.representative.mediaType,
          source: {
            kind: "dataset",
            label: `Public ingestion import ${input.sourceCollectionId}/${input.importBatchId}`,
            uri: this.sourceUri(input, group.contentHash)
          },
          actor: this.dependencies.actor
        });
        existingEvents.push(evidence);
      }

      const unlinkedOccurrenceIds = this.unlinkedOccurrenceIds(existingEvents, input, group);

      if (unlinkedOccurrenceIds.length > 0) {
        const linked = await this.appendEvidenceLinked(input, group, evidenceId, unlinkedOccurrenceIds, approval.id);
        existingEvents.push(linked);
      }
    }

    const totals = this.importTotals(existingEvents, input, groups);
    await this.appendImportCompleted(input, totals, approval.id);

    return { totals };
  }

  private validateImportRequest(input: ImportApprovedOccurrencesInput): void {
    const result = importApprovedOccurrencesInputSchema.safeParse(input);

    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.length === 0 ? "import request" : issue?.path.join(".");
      throw new Error(`Invalid import request ${path}: ${issue?.message ?? result.error.message}`);
    }
  }

  private async findApproval(
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
  ): Promise<KnowledgeEventOf<"ingestion.import.approved"> | undefined> {
    const importEvents = await this.dependencies.ledger.readStream(this.importStreamId(input));
    return importEvents.find(
      (event): event is KnowledgeEventOf<"ingestion.import.approved"> =>
        event.type === "ingestion.import.approved" &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.scanBatchId === input.scanBatchId &&
        event.payload.importBatchId === input.importBatchId &&
        event.context.actor.kind === "human" &&
        event.payload.approvedBy === event.context.actor.id
    );
  }

  private groupOccurrencesByContentHash(occurrences: ImportOccurrenceInput[]): Map<ContentHash, OccurrenceGroup> {
    const groups = new Map<ContentHash, OccurrenceGroup>();

    for (const occurrence of occurrences) {
      const contentHash = this.contentHashFor(occurrence.content);
      const existing = groups.get(contentHash);

      if (existing === undefined) {
        groups.set(contentHash, {
          contentHash,
          representative: occurrence,
          occurrenceIds: [occurrence.occurrenceId]
        });
      } else {
        existing.occurrenceIds.push(occurrence.occurrenceId);
      }
    }

    return groups;
  }

  private findCompletedImport(
    events: Awaited<ReturnType<EventLedger["readAll"]>>,
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
  ): KnowledgeEventOf<"ingestion.import.completed"> | undefined {
    return events.find(
      (event): event is KnowledgeEventOf<"ingestion.import.completed"> =>
        event.type === "ingestion.import.completed" &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.scanBatchId === input.scanBatchId &&
        event.payload.importBatchId === input.importBatchId
    );
  }

  private findExistingEvidence(
    events: Awaited<ReturnType<EventLedger["readAll"]>>,
    deterministicEvidenceId: string,
    contentHash: ContentHash
  ): KnowledgeEventOf<"evidence.ingested"> | undefined {
    const deterministicEvidence = events.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === deterministicEvidenceId
    );

    if (deterministicEvidence !== undefined && deterministicEvidence.payload.contentHash !== contentHash) {
      throw new Error(`Evidence ${deterministicEvidenceId} already exists with a different content hash`);
    }

    if (deterministicEvidence !== undefined) {
      return deterministicEvidence;
    }

    return events.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.contentHash === contentHash
    );
  }

  private unlinkedOccurrenceIds(
    events: Awaited<ReturnType<EventLedger["readAll"]>>,
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">,
    group: OccurrenceGroup
  ): string[] {
    const linkedOccurrenceIds = new Set<string>();

    for (const event of events) {
      if (
        event.type === "ingestion.evidence.linked" &&
        event.payload.importBatchId === input.importBatchId &&
        event.payload.sourceCollectionId === input.sourceCollectionId &&
        event.payload.contentHash === group.contentHash &&
        event.streamId === this.evidenceLinkStreamId(input, group.contentHash)
      ) {
        for (const occurrenceId of event.payload.occurrenceIds) {
          linkedOccurrenceIds.add(occurrenceId);
        }
      }
    }

    return group.occurrenceIds.filter((occurrenceId) => !linkedOccurrenceIds.has(occurrenceId));
  }

  private importTotals(
    events: Awaited<ReturnType<EventLedger["readAll"]>>,
    input: ImportApprovedOccurrencesInput,
    groups: Map<ContentHash, OccurrenceGroup>
  ): ImportApprovedOccurrencesResult["totals"] {
    let evidenceCreated = 0;
    const linkedOccurrenceIds = new Set<string>();

    for (const group of groups.values()) {
      const evidenceId = this.evidenceIdForContentHash(group.contentHash);
      const currentImportEvidence = events.find(
        (event): event is KnowledgeEventOf<"evidence.ingested"> =>
          event.type === "evidence.ingested" &&
          event.payload.evidenceId === evidenceId &&
          event.payload.contentHash === group.contentHash &&
          event.payload.source.uri === this.sourceUri(input, group.contentHash)
      );

      if (currentImportEvidence !== undefined) {
        evidenceCreated += 1;
      }

      for (const event of events) {
        if (
          event.type === "ingestion.evidence.linked" &&
          event.payload.importBatchId === input.importBatchId &&
          event.payload.sourceCollectionId === input.sourceCollectionId &&
          event.payload.contentHash === group.contentHash &&
          event.streamId === this.evidenceLinkStreamId(input, group.contentHash)
        ) {
          for (const occurrenceId of event.payload.occurrenceIds) {
            linkedOccurrenceIds.add(occurrenceId);
          }
        }
      }
    }

    const expectedOccurrenceIds = new Set(input.occurrences.map((occurrence) => occurrence.occurrenceId));
    const occurrencesLinked = [...linkedOccurrenceIds].filter((occurrenceId) => expectedOccurrenceIds.has(occurrenceId)).length;

    return {
      evidenceCreated,
      occurrencesLinked,
      duplicatesReused: input.occurrences.length - evidenceCreated,
      skipped: 0
    };
  }

  private async appendEvidenceLinked(
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">,
    group: OccurrenceGroup,
    evidenceId: string,
    occurrenceIds: string[],
    approvalEventId: string
  ): Promise<KnowledgeEventOf<"ingestion.evidence.linked">> {
    const event: AppendableKnowledgeEvent<"ingestion.evidence.linked"> = {
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: this.evidenceLinkStreamId(input, group.contentHash),
      context: this.context(`corr_${input.importBatchId}`, approvalEventId),
      payload: {
        evidenceId,
        importBatchId: input.importBatchId,
        sourceCollectionId: input.sourceCollectionId,
        contentHash: group.contentHash,
        occurrenceIds
      }
    };

    const appended = await this.dependencies.ledger.append(event);

    if (appended.type !== "ingestion.evidence.linked") {
      throw new Error(`Unexpected event type appended for evidence linkage: ${appended.type}`);
    }

    return appended;
  }

  private async appendImportCompleted(
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">,
    totals: ImportApprovedOccurrencesResult["totals"],
    approvalEventId: string
  ): Promise<KnowledgeEventOf<"ingestion.import.completed">> {
    const event: AppendableKnowledgeEvent<"ingestion.import.completed"> = {
      type: "ingestion.import.completed",
      version: 1,
      streamId: this.importStreamId(input),
      context: this.context(`corr_${input.importBatchId}`, approvalEventId),
      payload: {
        importBatchId: input.importBatchId,
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        completedAt: new Date().toISOString(),
        totals
      }
    };

    const appended = await this.dependencies.ledger.append(event, { expectedNextSequence: 2 });

    if (appended.type !== "ingestion.import.completed") {
      throw new Error(`Unexpected event type appended for import completion: ${appended.type}`);
    }

    return appended;
  }

  private contentHashFor(content: Buffer): ContentHash {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`;
  }

  private evidenceIdForContentHash(contentHash: ContentHash): string {
    return `ev_ing_${createHash("sha256").update(contentHash).digest("hex")}`;
  }

  private sourceUri(
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "importBatchId">,
    contentHash: ContentHash
  ): string {
    const digest = contentHash.replace("sha256:", "");
    return `cestus://ingestion/source-collections/${input.sourceCollectionId}/imports/${input.importBatchId}/content/${digest}`;
  }

  private importStreamId(
    input: Pick<ApproveImportInput | ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">
  ): string {
    return `ingestion_import_${input.sourceCollectionId}_${input.scanBatchId}_${input.importBatchId}`;
  }

  private evidenceLinkStreamId(
    input: Pick<ImportApprovedOccurrencesInput, "sourceCollectionId" | "scanBatchId" | "importBatchId">,
    contentHash: ContentHash
  ): string {
    return `ingestion_evidence_link_${input.sourceCollectionId}_${input.scanBatchId}_${input.importBatchId}_${contentHash.replace("sha256:", "")}`;
  }

  private context(correlationId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    };
  }
}
