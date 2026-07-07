import { pathToFileURL } from "node:url";
import type {
  ApproveProviderParsingInput,
  ApproveRawImportInput,
  DryRunScanInput,
  ImportApprovedInput,
  IngestionDiagnosticsInput,
  ListIngestionJobsInput,
  RegisterSourceInput,
  RetryIngestionJobInput
} from "./runtime.js";
import type { LegacyImportRuntime } from "./legacy-runtime.js";
import type {
  IngestionMountResult,
  IngestionWorkspaceMountResolver,
  MountedWorkspace
} from "./mount-contract.js";
import type { IngestionReviewDto } from "./read-api.js";
import type { LegacyMigrationReviewDto } from "./legacy-read-api.js";
import { firstLegacyArtifactAsk } from "./legacy-types.js";

export const ingestionOperationalCommands = [
  "create-workspace",
  "register-source",
  "dry-run",
  "approve-import",
  "import",
  "jobs",
  "list-jobs",
  "retry",
  "approve-provider",
  "diagnostics"
] as const;

export const legacyIngestionCommands = [
  "legacy artifact-ask",
  "legacy inspect",
  "legacy report",
  "legacy quarantine",
  "legacy approve-import",
  "legacy import",
  "legacy staging-preview",
  "legacy approve-staging",
  "legacy stage"
] as const;

export type IngestionOperationalCommand = typeof ingestionOperationalCommands[number];
export type LegacyIngestionCommand = typeof legacyIngestionCommands[number];
export type IngestionCommandName =
  | "summary-json"
  | "legacy-artifact-ask-json"
  | "legacy-report-json"
  | LegacyIngestionCommand
  | IngestionOperationalCommand;

export interface IngestionCommandInput {
  command: IngestionCommandName | string;
  argv?: readonly string[];
  dto?: IngestionReviewDto | LegacyMigrationReviewDto;
  env?: Record<string, string | undefined>;
  mountResolver?: IngestionWorkspaceMountResolver;
  runtimeFactory?: IngestionCliRuntimeFactory;
  legacyRuntimeFactory?: LegacyImportCliRuntimeFactory;
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

export interface IngestionCliRuntimeFactoryInput {
  readonly mountedWorkspace: MountedWorkspace;
}

export type IngestionCliRuntimeFactory = (input: IngestionCliRuntimeFactoryInput) => IngestionCliRuntime;

export interface LegacyImportCliRuntimeFactoryInput {
  readonly mountedWorkspace: MountedWorkspace;
}

export type LegacyImportCliRuntimeFactory = (input: LegacyImportCliRuntimeFactoryInput) => LegacyImportRuntime;

export interface IngestionCliRuntime {
  registerSource(input: RegisterSourceInput): Promise<unknown> | unknown;
  dryRunScan(input: DryRunScanInput): Promise<unknown> | unknown;
  approveRawImport(input: ApproveRawImportInput): Promise<unknown> | unknown;
  importApproved(input: ImportApprovedInput): Promise<unknown> | unknown;
  listJobs(input: ListIngestionJobsInput): Promise<unknown> | unknown;
  retryJob(input: RetryIngestionJobInput): Promise<unknown> | unknown;
  approveProviderParsing(input: ApproveProviderParsingInput): Promise<unknown> | unknown;
  diagnostics(input: IngestionDiagnosticsInput): Promise<unknown> | unknown;
}

export type NormalizedIngestionCliArgs =
  | { readonly kind: "help" }
  | { readonly kind: "command"; readonly command: string; readonly argv: readonly string[] };

export function normalizeIngestionCliArgs(argv: readonly string[]): NormalizedIngestionCliArgs {
  const withProgramRemoved = argv[0] === "cestus" ? argv.slice(1) : argv;
  const normalized = withProgramRemoved[0] === "ingest" ? withProgramRemoved.slice(1) : withProgramRemoved;

  if (normalized.length === 0 || normalized.includes("--help") || normalized.includes("-h")) {
    return { kind: "help" };
  }

  if (normalized[0] === "legacy" && normalized[1] !== undefined) {
    return {
      kind: "command",
      command: `legacy ${normalized[1]}`,
      argv: normalized.slice(2)
    };
  }

  return {
    kind: "command",
    command: normalized[0] ?? "",
    argv: normalized.slice(1)
  };
}

export function handleIngestionCommand(input: IngestionCommandInput): string | Promise<string> {
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

  if (input.command === "legacy artifact-ask") {
    return formatCliJson({
      ok: true,
      command: input.command,
      firstArtifactAsk: firstLegacyArtifactAsk
    });
  }

  if (isLegacyRuntimeCommand(input.command)) {
    return handleLegacyRuntimeCommand(input.command, input);
  }

  if (input.command === "create-workspace") {
    return formatCliJson(unsupportedCommand(input.command));
  }

  if (isIngestionOperationalCommand(input.command)) {
    if (isRuntimeCommand(input.command)) {
      return handleRuntimeCommand(input.command, input);
    }
  }

  return formatCliJson(unsupportedCommand(input.command));
}

export function formatIngestionCliUsage(executableName = "cestus-ingest"): string {
  return [
    `Usage: ${executableName} [ingest] <command> [options]`,
    "",
    "Commands:",
    "  summary-json        Print a stable JSON ingestion review DTO.",
    "  register-source     Register a read-only source collection.",
    "  dry-run             Run a hash-computing dry-run inventory.",
    "  approve-import      Approve a dry-run batch for raw import.",
    "  import              Import approved unique evidence blobs.",
    "  jobs                List ingestion jobs.",
    "  retry               Retry a failed ingestion job.",
    "  approve-provider    Approve an outbound provider parse batch.",
    "  diagnostics         Inspect ingestion diagnostics.",
    "  legacy artifact-ask Print the first legacy artifact ask as JSON.",
    "  legacy inspect      Inspect an old-Cestus root and store a migration report.",
    "  legacy report       Print a selected or latest migration report.",
    "  legacy quarantine   Print quarantine entries from a migration report.",
    "  legacy approve-import",
    "                      Approve raw legacy import for a completed scan.",
    "  legacy import       Execute approved raw legacy import.",
    "  legacy staging-preview",
    "                      Preview evidence-tied legacy assertion candidates.",
    "  legacy approve-staging",
    "                      Approve selected legacy assertion candidates.",
    "  legacy stage        Stage approved legacy candidates as assertion proposals.",
    "",
    "Options:",
    "  --workspace <root>  Portable workspace root to resolve through the mount layer.",
    "  --help              Show this help.",
    "",
    "Examples:",
    "  cestus ingest dry-run --workspace <root> --source-id src_drive_001 --scan scan_001",
    "  cestus ingest register-source --workspace <root> --source /Volumes/OldArchive --source-id src_old_archive --label \"Old archive\"",
    "  cestus ingest legacy inspect --workspace <root> --source <old-root> --source-id src_old_cestus --scan scan_old_cestus_001 --label \"Old Cestus\""
  ].join("\n");
}

async function handleRuntimeCommand(
  command: IngestionRuntimeCommand,
  input: IngestionCommandInput
): Promise<string> {
  if (input.mountResolver === undefined || input.runtimeFactory === undefined) {
    return formatCliJson(runtimeWiringRequired(command));
  }

  let argv: ParsedArgv;
  try {
    argv = parseArgv(input.argv ?? []);
  } catch (error) {
    return formatCliJson(cliInvalidArguments(command, error));
  }

  const env = input.env ?? process.env;
  const workspaceRoot = optionValue(argv, "workspace") ?? env.CESTUS_WORKSPACE_ROOT;
  const mountResult = await input.mountResolver.resolve({
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    env
  });

  if (!mountResult.ok) {
    return formatCliJson(mountFailure(mountResult));
  }

  const runtime = input.runtimeFactory({ mountedWorkspace: mountResult.workspace });
  const result = await stableRuntimeCall(command, runtime, argv);

  return formatCliJson(result);
}

async function handleLegacyRuntimeCommand(
  command: LegacyIngestionRuntimeCommand,
  input: IngestionCommandInput
): Promise<string> {
  if (input.mountResolver === undefined || input.legacyRuntimeFactory === undefined) {
    return formatCliJson(legacyRuntimeWiringRequired(command));
  }

  let argv: ParsedArgv;
  let commandInput: unknown;
  try {
    argv = parseArgv(input.argv ?? []);
    commandInput = legacyRuntimeInput(command, argv);
  } catch (error) {
    return formatCliJson(legacyCliInvalidArguments(command, error));
  }

  const env = input.env ?? process.env;
  const workspaceRoot = optionValue(argv, "workspace") ?? env.CESTUS_WORKSPACE_ROOT;
  const mountResult = await input.mountResolver.resolve({
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    env
  });

  if (!mountResult.ok) {
    return formatCliJson(legacyMountFailure(command, mountResult));
  }

  const runtime = input.legacyRuntimeFactory({ mountedWorkspace: mountResult.workspace });
  const result = await stableLegacyRuntimeCall(command, runtime, commandInput);

  return formatCliJson(result);
}

async function stableRuntimeCall(
  command: IngestionRuntimeCommand,
  runtime: IngestionCliRuntime,
  argv: ParsedArgv
): Promise<unknown> {
  try {
    return await callRuntime(command, runtime, argv);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INGESTION_CLI_INVALID_ARGUMENTS",
        command,
        message: error instanceof Error ? error.message : "Invalid ingestion CLI arguments.",
        diagnostics: []
      }
    };
  }
}

async function stableLegacyRuntimeCall(
  command: LegacyIngestionRuntimeCommand,
  runtime: LegacyImportRuntime,
  input: unknown
): Promise<unknown> {
  try {
    return await callLegacyRuntime(command, runtime, input);
  } catch {
    return legacyRuntimeInternalError(command);
  }
}

async function callRuntime(
  command: IngestionRuntimeCommand,
  runtime: IngestionCliRuntime,
  argv: ParsedArgv
): Promise<unknown> {
  switch (command) {
    case "register-source":
      return runtime.registerSource(registerSourceInput(argv));
    case "dry-run":
      return runtime.dryRunScan(dryRunInput(argv));
    case "approve-import":
      return runtime.approveRawImport(approveImportInput(argv));
    case "import":
      return runtime.importApproved(importInput(argv));
    case "jobs":
    case "list-jobs":
      return runtime.listJobs(optionalSourceInput(argv));
    case "retry":
      return runtime.retryJob(retryInput(argv));
    case "approve-provider":
      return runtime.approveProviderParsing(approveProviderInput(argv));
    case "diagnostics":
      return runtime.diagnostics(optionalSourceInput(argv));
  }
}

function legacyRuntimeInput(command: LegacyIngestionRuntimeCommand, argv: ParsedArgv): unknown {
  switch (command) {
    case "legacy inspect":
      const sourceRoot = requiredOption(argv, "source");
      return {
        sourceCollectionId: requiredOption(argv, "source-id"),
        label: requiredOption(argv, "label"),
        sourceRoot,
        scanBatchId: requiredOption(argv, "scan")
      };
    case "legacy report":
    case "legacy quarantine":
    case "legacy staging-preview":
      return legacyReportSelectionInput(argv);
    case "legacy approve-import":
      return {
        sourceCollectionId: requiredOption(argv, "source-id"),
        scanBatchId: requiredOption(argv, "scan"),
        importBatchId: requiredOption(argv, "import"),
        approvedBy: requiredOption(argv, "approved-by")
      };
    case "legacy import":
      return {
        sourceCollectionId: requiredOption(argv, "source-id"),
        scanBatchId: requiredOption(argv, "scan"),
        importBatchId: requiredOption(argv, "import")
      };
    case "legacy approve-staging":
      return {
        sourceCollectionId: requiredOption(argv, "source-id"),
        scanBatchId: requiredOption(argv, "scan"),
        legacyReportId: requiredOption(argv, "report"),
        stagingBatchId: requiredOption(argv, "staging"),
        approvedBy: requiredOption(argv, "approved-by"),
        approvedAssertionCandidateIds: requiredOptionValues(argv, "candidate")
      };
    case "legacy stage":
      return {
        sourceCollectionId: requiredOption(argv, "source-id"),
        scanBatchId: requiredOption(argv, "scan"),
        legacyReportId: requiredOption(argv, "report"),
        stagingBatchId: requiredOption(argv, "staging")
      };
  }
}

function legacyReportSelectionInput(argv: ParsedArgv): {
  readonly sourceCollectionId: string;
  readonly legacyReportId?: string;
} {
  const legacyReportId = optionValue(argv, "report");

  return {
    sourceCollectionId: requiredOption(argv, "source-id"),
    ...(legacyReportId === undefined ? {} : { legacyReportId })
  };
}

function callLegacyRuntime(
  command: LegacyIngestionRuntimeCommand,
  runtime: LegacyImportRuntime,
  input: unknown
): Promise<unknown> {
  switch (command) {
    case "legacy inspect":
      return runtime.inspect(input as Parameters<LegacyImportRuntime["inspect"]>[0]);
    case "legacy report":
      return runtime.report(input as Parameters<LegacyImportRuntime["report"]>[0]);
    case "legacy quarantine":
      return runtime.quarantine(input as Parameters<LegacyImportRuntime["quarantine"]>[0]);
    case "legacy approve-import":
      return runtime.approveRawImport(input as Parameters<LegacyImportRuntime["approveRawImport"]>[0]);
    case "legacy import":
      return runtime.importApproved(input as Parameters<LegacyImportRuntime["importApproved"]>[0]);
    case "legacy staging-preview":
      return runtime.stagingPreview(input as Parameters<LegacyImportRuntime["stagingPreview"]>[0]);
    case "legacy approve-staging":
      return runtime.approveStaging(input as Parameters<LegacyImportRuntime["approveStaging"]>[0]);
    case "legacy stage":
      return runtime.stageApproved(input as Parameters<LegacyImportRuntime["stageApproved"]>[0]);
  }
}

function registerSourceInput(argv: ParsedArgv): RegisterSourceInput {
  const sourceRoot = requiredOption(argv, "source");

  return {
    sourceCollectionId: requiredOption(argv, "source-id"),
    label: requiredOption(argv, "label"),
    rootUri: pathToFileURL(sourceRoot).href,
    sourceRoot
  };
}

function dryRunInput(argv: ParsedArgv): DryRunScanInput {
  return {
    sourceCollectionId: requiredOption(argv, "source-id"),
    scanBatchId: requiredOption(argv, "scan")
  };
}

function approveImportInput(argv: ParsedArgv): ApproveRawImportInput {
  return {
    sourceCollectionId: requiredOption(argv, "source-id"),
    scanBatchId: requiredOption(argv, "scan"),
    importBatchId: requiredOption(argv, "import"),
    approvedBy: requiredOption(argv, "approved-by")
  };
}

function importInput(argv: ParsedArgv): ImportApprovedInput {
  return {
    sourceCollectionId: requiredOption(argv, "source-id"),
    scanBatchId: requiredOption(argv, "scan"),
    importBatchId: requiredOption(argv, "import")
  };
}

function optionalSourceInput(argv: ParsedArgv): ListIngestionJobsInput & IngestionDiagnosticsInput {
  const sourceCollectionId = optionValue(argv, "source-id");

  return sourceCollectionId === undefined ? {} : { sourceCollectionId };
}

function retryInput(argv: ParsedArgv): RetryIngestionJobInput {
  return {
    jobId: requiredOption(argv, "job")
  };
}

function approveProviderInput(argv: ParsedArgv): ApproveProviderParsingInput {
  return {
    providerJobId: requiredOption(argv, "provider-job"),
    sourceCollectionId: requiredOption(argv, "source-id"),
    importBatchId: requiredOption(argv, "import"),
    provider: {
      name: requiredOption(argv, "provider"),
      version: requiredOption(argv, "provider-version")
    },
    approvedBy: requiredOption(argv, "approved-by"),
    eligibleMediaTypes: optionValues(argv, "media-type"),
    maxBytesPerFile: positiveIntegerOption(argv, "max-bytes")
  };
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

function legacyRuntimeWiringRequired(command: LegacyIngestionRuntimeCommand): IngestionCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "INGESTION_RUNTIME_WIRING_REQUIRED",
      command,
      message: `Command ${command} needs a legacy runtime wiring object; pure CLI handlers do not use hidden globals.`
    }
  };
}

function unsupportedCommand(command: string): IngestionCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "INGESTION_COMMAND_UNSUPPORTED",
      command,
      message: `Unsupported ingestion command ${command}.`
    }
  };
}

function isIngestionOperationalCommand(command: string): command is IngestionOperationalCommand {
  return ingestionOperationalCommands.some((candidate) => candidate === command);
}

const ingestionRuntimeCommands = [
  "register-source",
  "dry-run",
  "approve-import",
  "import",
  "jobs",
  "list-jobs",
  "retry",
  "approve-provider",
  "diagnostics"
] as const;

type IngestionRuntimeCommand = typeof ingestionRuntimeCommands[number];

const legacyRuntimeCommands = [
  "legacy inspect",
  "legacy report",
  "legacy quarantine",
  "legacy approve-import",
  "legacy import",
  "legacy staging-preview",
  "legacy approve-staging",
  "legacy stage"
] as const;

type LegacyIngestionRuntimeCommand = typeof legacyRuntimeCommands[number];

function isRuntimeCommand(command: IngestionOperationalCommand): command is IngestionRuntimeCommand {
  return ingestionRuntimeCommands.some((candidate) => candidate === command);
}

function isLegacyRuntimeCommand(command: string): command is LegacyIngestionRuntimeCommand {
  return legacyRuntimeCommands.some((candidate) => candidate === command);
}

interface ParsedArgv {
  readonly options: ReadonlyMap<string, readonly string[]>;
}

function parseArgv(argv: readonly string[]): ParsedArgv {
  const options = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || !token.startsWith("--")) {
      continue;
    }

    const withoutPrefix = token.slice(2);
    const [rawName, inlineValue] = withoutPrefix.split("=", 2);
    if (rawName === undefined || rawName.length === 0) {
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new Error(`Missing value for ingestion CLI option --${rawName}.`);
    }

    pushOption(options, rawName, value);
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { options };
}

function pushOption(options: Map<string, string[]>, name: string, value: string): void {
  const values = options.get(name) ?? [];
  values.push(value);
  options.set(name, values);
}

function optionValue(argv: ParsedArgv, name: string): string | undefined {
  return argv.options.get(name)?.at(-1);
}

function optionValues(argv: ParsedArgv, name: string): string[] {
  return [...(argv.options.get(name) ?? [])];
}

function requiredOptionValues(argv: ParsedArgv, name: string): string[] {
  const values = optionValues(argv, name);
  if (values.length === 0) {
    throw new Error(`Missing required ingestion CLI option --${name}.`);
  }

  return values;
}

function requiredOption(argv: ParsedArgv, name: string): string {
  const value = optionValue(argv, name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required ingestion CLI option --${name}.`);
  }

  return value;
}

function positiveIntegerOption(argv: ParsedArgv, name: string): number {
  const rawValue = requiredOption(argv, name);
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Option --${name} must be a finite positive integer.`);
  }

  return value;
}

function cliInvalidArguments(command: IngestionRuntimeCommand, error: unknown) {
  return {
    ok: false,
    error: {
      code: "INGESTION_CLI_INVALID_ARGUMENTS",
      command,
      message: error instanceof Error ? error.message : "Invalid ingestion CLI arguments.",
      diagnostics: []
    }
  };
}

function legacyCliInvalidArguments(command: LegacyIngestionRuntimeCommand, error: unknown) {
  return {
    ok: false,
    error: {
      code: "LEGACY_IMPORT_INVALID_ARGUMENTS",
      command,
      message: error instanceof Error ? error.message : "Invalid legacy ingestion CLI arguments.",
      diagnostics: []
    }
  };
}

function legacyRuntimeInternalError(command: LegacyIngestionRuntimeCommand) {
  return {
    ok: false,
    error: {
      code: "LEGACY_IMPORT_RUNTIME_INTERNAL",
      command,
      message: "Legacy import runtime failed while handling the command.",
      allowedRepairActions: [
        "retry the legacy import command",
        "inspect legacy import diagnostics",
        "report the issue with the command context"
      ],
      diagnostics: []
    }
  };
}

function mountFailure(result: Extract<IngestionMountResult, { ok: false }>) {
  return {
    ok: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      allowedRepairActions: [...result.error.allowedRepairActions],
      diagnostics: []
    }
  };
}

function legacyMountFailure(
  command: LegacyIngestionRuntimeCommand,
  result: Extract<IngestionMountResult, { ok: false }>
) {
  return {
    ok: false,
    error: {
      code: legacyWorkspaceErrorCode(result.error.code),
      command,
      message: result.error.message,
      allowedRepairActions: [...result.error.allowedRepairActions],
      diagnostics: []
    }
  };
}

function legacyWorkspaceErrorCode(code: string): string {
  return code === "INGESTION_WORKSPACE_NOT_WRITABLE"
    ? "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE"
    : "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED";
}

function formatCliJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
