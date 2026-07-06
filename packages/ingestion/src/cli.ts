import type { IngestionReviewDto } from "./read-api.js";
import type { LegacyMigrationReviewDto } from "./legacy-read-api.js";
import { firstLegacyArtifactAsk } from "./legacy-types.js";

export const ingestionOperationalCommands = [
  "create-workspace",
  "register-source",
  "dry-run",
  "approve-import",
  "import",
  "list-jobs",
  "retry",
  "approve-provider",
  "diagnostics"
] as const;

export type IngestionOperationalCommand = typeof ingestionOperationalCommands[number];
export type IngestionCommandName =
  | "summary-json"
  | "legacy-artifact-ask-json"
  | "legacy-report-json"
  | IngestionOperationalCommand;

export interface SummaryJsonCommandInput {
  command: "summary-json";
  dto?: IngestionReviewDto;
  runtime?: unknown;
}

export interface LegacyArtifactAskJsonCommandInput {
  command: "legacy-artifact-ask-json";
  runtime?: unknown;
}

export interface LegacyReportJsonCommandInput {
  command: "legacy-report-json";
  dto: LegacyMigrationReviewDto;
  runtime?: unknown;
}

export interface IngestionOperationalCommandInput {
  command: IngestionOperationalCommand;
  runtime?: unknown;
}

export type IngestionCommandInput =
  | SummaryJsonCommandInput
  | LegacyArtifactAskJsonCommandInput
  | LegacyReportJsonCommandInput
  | IngestionOperationalCommandInput;

type UnknownIngestionCommandInput<Command extends string> = Command extends IngestionCommandName
  ? never
  : {
    command: Command;
    dto?: unknown;
    runtime?: unknown;
  };

interface RuntimeIngestionCommandInput {
  command: string;
  dto?: unknown;
  runtime?: unknown;
}

export interface IngestionCliErrorOutput {
  ok: false;
  error: {
    code: string;
    command: string;
    message: string;
  };
}

export function handleIngestionCommand(input: IngestionCommandInput): string;
export function handleIngestionCommand<Command extends string>(
  input: UnknownIngestionCommandInput<Command>
): string;
export function handleIngestionCommand(input: RuntimeIngestionCommandInput): string {
  if (input.command === "summary-json") {
    if (input.dto === undefined) {
      return formatCliJson({
        ok: false,
        error: {
          code: "INGESTION_SUMMARY_DTO_REQUIRED",
          command: input.command,
          message: "Command summary-json needs an ingestion review DTO."
        }
      });
    }

    return formatCliJson(stableReviewDto(input.dto as IngestionReviewDto));
  }

  if (input.command === "legacy-artifact-ask-json") {
    return `${JSON.stringify({ firstArtifactAsk: firstLegacyArtifactAsk }, null, 2)}\n`;
  }

  if (input.command === "legacy-report-json") {
    if (input.dto === undefined) {
      throw new Error("Command legacy-report-json needs a legacy migration review DTO.");
    }

    return `${JSON.stringify(input.dto, null, 2)}\n`;
  }

  if (isIngestionOperationalCommand(input.command)) {
    return formatCliJson(runtimeWiringRequired(input.command));
  }

  return formatCliJson({
    ok: false,
    error: {
      code: "INGESTION_COMMAND_UNSUPPORTED",
      command: input.command,
      message: `Unsupported ingestion command ${input.command}.`
    }
  });
}

export function formatIngestionCliUsage(executableName = "cestus-ingest"): string {
  return [
    `Usage: ${executableName} <command> [options]`,
    "",
    "Commands:",
    "  summary-json        Print a stable JSON ingestion review DTO.",
    "  create-workspace    Create or select a portable Cestus workspace.",
    "  register-source     Register a read-only source collection.",
    "  dry-run             Run a hash-computing dry-run inventory.",
    "  approve-import      Approve a dry-run batch for raw import.",
    "  import              Import approved unique evidence blobs.",
    "  list-jobs           List ingestion jobs.",
    "  retry               Retry a failed ingestion job.",
    "  approve-provider    Approve an outbound provider parse batch.",
    "  diagnostics         Inspect ingestion diagnostics.",
    "",
    "Options:",
    "  --help              Show this help.",
    "",
    "Operational commands require an explicit runtime wiring object in a future task."
  ].join("\n");
}

function stableReviewDto(dto: IngestionReviewDto): IngestionReviewDto {
  return {
    sourceCollectionId: dto.sourceCollectionId,
    label: dto.label,
    ...(dto.latestScanBatchId === undefined ? {} : { latestScanBatchId: dto.latestScanBatchId }),
    ...(dto.latestImportBatchId === undefined ? {} : { latestImportBatchId: dto.latestImportBatchId }),
    totals: {
      observedFiles: dto.totals.observedFiles,
      uniqueContent: dto.totals.uniqueContent,
      duplicateOccurrences: dto.totals.duplicateOccurrences,
      skipped: dto.totals.skipped,
      bytes: dto.totals.bytes,
      estimatedNewBlobBytes: dto.totals.estimatedNewBlobBytes
    },
    approvalRequired: dto.approvalRequired,
    duplicateGroups: dto.duplicateGroups.map((group) => ({
      contentHash: group.contentHash,
      occurrenceCount: group.occurrenceCount,
      occurrenceIds: [...group.occurrenceIds],
      sourcePaths: [...group.sourcePaths],
      ...(group.evidenceId === undefined ? {} : { evidenceId: group.evidenceId })
    })),
    evidenceLinks: dto.evidenceLinks.map((link) => ({
      contentHash: link.contentHash,
      evidenceId: link.evidenceId,
      occurrenceIds: [...link.occurrenceIds]
    })),
    parseJobs: dto.parseJobs.map((job) => ({
      parseJobId: job.parseJobId,
      evidenceId: job.evidenceId,
      lane: job.lane,
      parser: {
        name: job.parser.name,
        version: job.parser.version
      },
      state: job.state
    })),
    diagnostics: dto.diagnostics.map((diagnostic) => ({
      diagnosticId: diagnostic.diagnosticId,
      severity: diagnostic.severity,
      category: diagnostic.category,
      message: diagnostic.message
    }))
  };
}

function runtimeWiringRequired(command: IngestionOperationalCommand): IngestionCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "INGESTION_RUNTIME_WIRING_REQUIRED",
      command,
      message: `Command ${command} needs a runtime wiring object; pure CLI handlers do not use hidden globals.`
    }
  };
}

function isIngestionOperationalCommand(command: string): command is IngestionOperationalCommand {
  return ingestionOperationalCommands.some((candidate) => candidate === command);
}

function formatCliJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
