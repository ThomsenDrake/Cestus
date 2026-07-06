import type { z } from "zod";
import type { FileBlobStore } from "../../ontology/src/blob-store.js";
import {
  actorRefSchema,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  IngestionImportService,
  type ApproveImportInput,
  type ImportApprovedOccurrencesResult
} from "./import-service.js";

type ActorRef = z.infer<typeof actorRefSchema>;

export interface LegacyRawImportServiceDependencies {
  ledger: EventLedger;
  blobStore: FileBlobStore;
  actor: ActorRef;
}

export interface LegacyReportFileRecord {
  occurrenceId: string;
  sourcePath: string;
  content: Buffer;
  mediaType: string;
}

export interface LegacyImportReportFilesInput {
  sourceCollectionId: string;
  scanBatchId: string;
  importBatchId: string;
  files: LegacyReportFileRecord[];
}

export type LegacyApproveRawImportInput = ApproveImportInput;

export class LegacyRawImportService {
  private readonly importService: IngestionImportService;

  constructor(dependencies: LegacyRawImportServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      const issue = actor.error.issues[0];
      throw new Error(`Invalid legacy raw import actor: ${issue?.message ?? actor.error.message}`);
    }

    this.importService = new IngestionImportService(dependencies);
  }

  async approveRawImport(input: LegacyApproveRawImportInput): Promise<KnowledgeEventOf<"ingestion.import.approved">> {
    return this.importService.approveImport(input);
  }

  async importReportFiles(input: LegacyImportReportFilesInput): Promise<ImportApprovedOccurrencesResult> {
    return this.importService.importApprovedOccurrences({
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      importBatchId: input.importBatchId,
      occurrences: input.files.map((file) => ({
        occurrenceId: file.occurrenceId,
        sourcePath: file.sourcePath,
        content: file.content,
        mediaType: file.mediaType
      }))
    });
  }
}
