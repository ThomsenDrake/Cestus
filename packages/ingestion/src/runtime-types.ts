import type { IngestionReviewDto } from "./read-api.js";

export const ingestionErrorCodes = [
  "INGESTION_WORKSPACE_NOT_MOUNTED",
  "INGESTION_WORKSPACE_NOT_WRITABLE",
  "INGESTION_SOURCE_NOT_REGISTERED",
  "INGESTION_SCAN_REQUIRED",
  "INGESTION_IMPORT_APPROVAL_REQUIRED",
  "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
  "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH",
  "INGESTION_PROVIDER_APPROVAL_REQUIRED",
  "INGESTION_PROVIDER_SEND_NOT_PERMITTED",
  "INGESTION_JOB_NOT_RETRYABLE",
  "INGESTION_HTTP_STORAGE_PATH_FORBIDDEN",
  "INGESTION_COMMAND_UNSUPPORTED",
  "INGESTION_RUNTIME_INTERNAL"
] as const;

export type IngestionErrorCode = typeof ingestionErrorCodes[number];

export interface IngestionRuntimeError {
  readonly code: IngestionErrorCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics: readonly IngestionRuntimeDiagnosticDto[];
}

export interface IngestionRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: string;
  readonly message: string;
}

export type IngestionRuntimeResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: IngestionRuntimeError };

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

export interface IngestionActionResult {
  readonly review: IngestionReviewDto;
  readonly eventIds: readonly string[];
}

export interface IngestionSourceListDto {
  readonly sources: readonly IngestionSourceDto[];
}

export interface IngestionSourceDto {
  readonly sourceCollectionId: string;
  readonly label: string;
  readonly latestScanBatchId?: string;
  readonly latestImportBatchId?: string;
  readonly scanBatchIds: readonly string[];
  readonly importBatchIds: readonly string[];
  readonly diagnosticIds: readonly string[];
}

export interface IngestionScanResultDto extends IngestionActionResult {
  readonly scanBatchId: string;
  readonly inventoryHash: string;
}

export interface IngestionImportResultDto extends IngestionActionResult {
  readonly importBatchId: string;
  readonly totals: {
    readonly evidenceCreated: number;
    readonly occurrencesLinked: number;
    readonly duplicatesReused: number;
    readonly skipped: number;
  };
}

export interface IngestionJobListDto {
  readonly jobs: readonly IngestionJobDto[];
}

export interface IngestionJobResultDto {
  readonly job: IngestionJobDto;
  readonly review?: IngestionReviewDto;
  readonly eventIds: readonly string[];
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

export function stableIngestionError(input: {
  readonly code: IngestionErrorCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics?: readonly IngestionRuntimeDiagnosticDto[];
}): IngestionRuntimeResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: input.code,
      message: input.message,
      allowedRepairActions: Object.freeze([...input.allowedRepairActions]),
      diagnostics: Object.freeze((input.diagnostics ?? []).map(stableIngestionDiagnostic))
    })
  });
}

function stableIngestionDiagnostic(
  diagnostic: IngestionRuntimeDiagnosticDto
): IngestionRuntimeDiagnosticDto {
  return Object.freeze({
    ...(diagnostic.diagnosticId === undefined ? {} : { diagnosticId: diagnostic.diagnosticId }),
    severity: diagnostic.severity,
    category: diagnostic.category,
    message: diagnostic.message
  });
}
