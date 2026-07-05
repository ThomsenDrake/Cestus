import type { IngestionProjection } from "./projection.js";
import type { IngestionOccurrenceSummary } from "./projection.js";

export interface IngestionReviewDuplicateGroupDto {
  contentHash: string;
  occurrenceCount: number;
  occurrenceIds: string[];
  sourcePaths: string[];
  evidenceId?: string;
}

export interface IngestionReviewDto {
  sourceCollectionId: string;
  label: string;
  latestScanBatchId?: string;
  latestImportBatchId?: string;
  totals: {
    observedFiles: number;
    uniqueContent: number;
    duplicateOccurrences: number;
    skipped: number;
    bytes: number;
    estimatedNewBlobBytes: number;
  };
  approvalRequired: boolean;
  duplicateGroups: IngestionReviewDuplicateGroupDto[];
  evidenceLinks: Array<{
    contentHash: string;
    evidenceId: string;
    occurrenceIds: string[];
  }>;
  parseJobs: Array<{
    parseJobId: string;
    evidenceId: string;
    lane: "local" | "provider";
    parser: { name: string; version: string };
    state: "queued" | "running" | "succeeded" | "failed";
  }>;
  diagnostics: Array<{
    diagnosticId: string;
    severity: "info" | "warning" | "error";
    category: "ingestion" | "validation" | "projection" | "migration" | "deduplication";
    message: string;
  }>;
}

const emptyTotals = {
  observedFiles: 0,
  uniqueContent: 0,
  duplicateOccurrences: 0,
  skipped: 0,
  bytes: 0,
  estimatedNewBlobBytes: 0
};

export function buildIngestionReviewDto(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto {
  const source = projection.sources.get(sourceCollectionId);

  if (source === undefined) {
    throw new Error(`Unknown source collection ${sourceCollectionId}`);
  }

  const latestScan = source.latestScanBatchId === undefined
    ? undefined
    : projection.scans.get(source.latestScanBatchId);
  const approvalBatchIds = source.latestScanBatchId === undefined
    ? []
    : projection.importApprovalsByScanBatchId.get(source.latestScanBatchId) ?? [];
  const completionBatchIds = source.latestScanBatchId === undefined
    ? []
    : projection.importCompletionsByScanBatchId.get(source.latestScanBatchId) ?? [];

  return {
    sourceCollectionId,
    label: source.label,
    ...(source.latestScanBatchId === undefined ? {} : { latestScanBatchId: source.latestScanBatchId }),
    ...(source.latestImportBatchId === undefined ? {} : { latestImportBatchId: source.latestImportBatchId }),
    totals: latestScan?.totals ?? emptyTotals,
    approvalRequired: latestScan?.state === "completed" && approvalBatchIds.length === 0,
    duplicateGroups: duplicateGroupsForSource(projection, sourceCollectionId),
    evidenceLinks: evidenceLinksForSource(projection, sourceCollectionId),
    parseJobs: parseJobsForSource(projection, sourceCollectionId),
    diagnostics: diagnosticsForSource(projection, sourceCollectionId)
  };
}

function duplicateGroupsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDuplicateGroupDto[] {
  return [...projection.duplicatesByHash.entries()]
    .map(([contentHash, occurrenceIds]) => {
      const sourceOccurrences = occurrenceIds
        .map((occurrenceId) => projection.occurrencesById.get(occurrenceId))
        .filter((occurrence): occurrence is IngestionOccurrenceSummary =>
          occurrence !== undefined && occurrence.sourceCollectionId === sourceCollectionId
        );

      if (sourceOccurrences.length < 2) {
        return undefined;
      }

      return {
        contentHash,
        occurrenceCount: sourceOccurrences.length,
        occurrenceIds: sourceOccurrences.map((occurrence) => occurrence.occurrenceId).sort(compareCodeUnits),
        sourcePaths: sourceOccurrences.map((occurrence) => occurrence.sourcePath).sort(compareCodeUnits),
        ...(projection.evidenceByHash.get(contentHash) === undefined
          ? {}
          : { evidenceId: projection.evidenceByHash.get(contentHash) })
      };
    })
    .filter((group): group is IngestionReviewDuplicateGroupDto => group !== undefined)
    .sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash));
}

function evidenceLinksForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["evidenceLinks"] {
  return [...projection.evidenceLinks.values()]
    .filter((link) => link.sourceCollectionId === sourceCollectionId)
    .map((link) => ({
      contentHash: link.contentHash,
      evidenceId: link.evidenceId,
      occurrenceIds: [...link.occurrenceIds].sort(compareCodeUnits)
    }))
    .sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash));
}

function parseJobsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["parseJobs"] {
  return [...projection.parseJobs.values()]
    .filter((job) => job.sourceCollectionId === sourceCollectionId)
    .map((job) => ({
      parseJobId: job.parseJobId,
      evidenceId: job.evidenceId,
      lane: job.lane,
      parser: { ...job.parser },
      state: job.state
    }))
    .sort((left, right) => compareCodeUnits(left.parseJobId, right.parseJobId));
}

function diagnosticsForSource(
  projection: IngestionProjection,
  sourceCollectionId: string
): IngestionReviewDto["diagnostics"] {
  const diagnosticIds = projection.diagnosticsBySourceCollectionId.get(sourceCollectionId) ?? [];

  return diagnosticIds
    .map((diagnosticId) => projection.diagnostics.get(diagnosticId))
    .filter((diagnostic) => diagnostic !== undefined)
    .map((diagnostic) => ({
      diagnosticId: diagnostic.diagnosticId,
      severity: diagnostic.severity,
      category: diagnostic.category,
      message: diagnostic.message
    }))
    .sort((left, right) => compareCodeUnits(left.diagnosticId, right.diagnosticId));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
