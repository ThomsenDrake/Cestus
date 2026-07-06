export interface IngestionRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: string;
  readonly message: string;
}

export interface IngestionReviewDto {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly latestScanBatchId?: string;
  readonly latestImportBatchId?: string;
  readonly totals: {
    readonly observedFiles: number;
    readonly uniqueContent: number;
    readonly duplicateOccurrences: number;
    readonly skipped: number;
    readonly bytes: number;
    readonly estimatedNewBlobBytes: number;
  };
  readonly approvalRequired: boolean;
  readonly duplicateGroups: readonly IngestionReviewDuplicateGroupDto[];
  readonly evidenceLinks: readonly IngestionEvidenceLinkDto[];
  readonly parseJobs: readonly IngestionParseJobDto[];
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export interface IngestionReviewDuplicateGroupDto {
  readonly contentHash: string;
  readonly occurrenceCount: number;
  readonly occurrenceIds?: readonly string[];
  readonly sourcePaths?: readonly string[];
  readonly evidenceId?: string;
}

export interface IngestionEvidenceLinkDto {
  readonly contentHash: string;
  readonly evidenceId: string;
  readonly occurrenceIds: readonly string[];
}

export interface IngestionParseJobDto {
  readonly parseJobId: string;
  readonly evidenceId: string;
  readonly lane: "local" | "provider";
  readonly parser: {
    readonly name: string;
    readonly version: string;
  };
  readonly state: "queued" | "running" | "succeeded" | "failed";
}

export interface IngestionWorkspaceDto {
  readonly mounted: boolean;
  readonly workspaceId?: string;
  readonly label?: string;
  readonly capabilities?: {
    readonly canReadLedger: boolean;
    readonly canAppendLedger: boolean;
    readonly canWriteBlobs: boolean;
    readonly canWriteDerivatives: boolean;
    readonly canWriteJobState: boolean;
  };
  readonly review?: IngestionReviewDto;
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export interface RegisterSourceInput {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly rootUri: string;
  readonly sourceRoot: string;
}

export interface DryRunScanInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
}

export interface ApproveRawImportInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly approvedBy: string;
}

export interface ImportApprovedInput {
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
}

export interface ListIngestionJobsInput {
  readonly sourceCollectionId?: string;
}

export interface RetryIngestionJobInput {
  readonly jobId: string;
}

export interface ApproveProviderParsingInput {
  readonly providerJobId: string;
  readonly sourceCollectionId: string;
  readonly importBatchId: string;
  readonly provider: {
    readonly name: string;
    readonly version: string;
  };
  readonly approvedBy: string;
  readonly eligibleMediaTypes: readonly string[];
  readonly maxBytesPerFile: number;
}

export interface IngestionDiagnosticsInput {
  readonly sourceCollectionId?: string;
}

export interface IngestionRuntimeError {
  readonly code: string;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export type IngestionActionResult =
  | {
      readonly ok: true;
      readonly review: IngestionReviewDto;
      readonly eventIds: readonly string[];
      readonly scanBatchId?: string;
      readonly inventoryHash?: string;
      readonly importBatchId?: string;
      readonly totals?: {
        readonly evidenceCreated: number;
        readonly occurrencesLinked: number;
        readonly duplicatesReused: number;
        readonly skipped: number;
      };
    }
  | {
      readonly ok: false;
      readonly error: IngestionRuntimeError;
    };

export type IngestionJobActionResult =
  | {
      readonly ok: true;
      readonly job: IngestionJobDto;
      readonly review?: IngestionReviewDto;
      readonly eventIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: IngestionRuntimeError;
    };

export interface IngestionJobListDto {
  readonly jobs: readonly IngestionJobDto[];
  readonly diagnostics?: readonly IngestionRuntimeDiagnosticDto[];
}

export interface IngestionJobDto {
  readonly jobId: string;
  readonly kind: "scan" | "import" | "local-parse" | "provider-parse";
  readonly state: "queued" | "running" | "succeeded" | "failed" | "skipped";
  readonly retryable: boolean;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly evidenceId?: string;
  readonly diagnosticIds: readonly string[];
}

export interface IngestionDiagnosticsDto {
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}
