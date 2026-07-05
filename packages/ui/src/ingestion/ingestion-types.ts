export interface IngestionReviewDto {
  sourceCollectionId: string;
  label: string;
  latestScanBatchId?: string;
  totals: {
    observedFiles: number;
    uniqueContent: number;
    duplicateOccurrences: number;
    skipped: number;
    bytes: number;
    estimatedNewBlobBytes: number;
  };
  approvalRequired: boolean;
  duplicateGroups: Array<{ contentHash: string; occurrenceCount: number }>;
  diagnostics: Array<{ severity: "info" | "warning" | "error"; message: string }>;
}
