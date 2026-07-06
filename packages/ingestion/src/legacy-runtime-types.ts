import { legacySecretSafeDiagnosticTextSchema } from "./legacy-types.js";

export type LegacyImportCommandName =
  | "legacy artifact-ask"
  | "legacy inspect"
  | "legacy report"
  | "legacy quarantine"
  | "legacy approve-import"
  | "legacy import"
  | "legacy staging-preview"
  | "legacy approve-staging"
  | "legacy stage";

export const legacyImportErrorCodes = [
  "LEGACY_IMPORT_INVALID_ARGUMENTS",
  "LEGACY_IMPORT_WORKSPACE_NOT_MOUNTED",
  "LEGACY_IMPORT_WORKSPACE_NOT_WRITABLE",
  "LEGACY_IMPORT_SOURCE_REQUIRED",
  "LEGACY_IMPORT_SOURCE_NOT_REGISTERED",
  "LEGACY_IMPORT_REPORT_REQUIRED",
  "LEGACY_IMPORT_REPORT_NOT_FOUND",
  "LEGACY_IMPORT_RAW_IMPORT_APPROVAL_REQUIRED",
  "LEGACY_IMPORT_STAGING_APPROVAL_REQUIRED",
  "LEGACY_IMPORT_EVIDENCE_LINK_REQUIRED",
  "LEGACY_IMPORT_CANDIDATE_SET_MISMATCH",
  "LEGACY_IMPORT_ACCEPTED_EVENT_FORBIDDEN",
  "LEGACY_IMPORT_COMMAND_UNSUPPORTED",
  "LEGACY_IMPORT_RUNTIME_INTERNAL"
] as const;

export type LegacyImportErrorCode = typeof legacyImportErrorCodes[number];

export const legacyImportNextActions = {
  reviewReport: "review legacy report",
  approveRawImport: "approve raw import",
  runRawImport: "run raw import",
  previewStaging: "preview ontology staging",
  approveStaging: "approve ontology staging",
  stageApprovedAssertions: "stage approved assertion proposals",
  inspectQuarantine: "inspect quarantine entries"
} as const;

export type LegacyImportNextAction =
  typeof legacyImportNextActions[keyof typeof legacyImportNextActions];

export interface LegacyImportWorkspaceDto {
  readonly workspaceId: string;
  readonly label: string;
}

export interface LegacyImportDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: string;
  readonly message: string;
}

export interface LegacyImportRuntimeError {
  readonly code: LegacyImportErrorCode;
  readonly command: LegacyImportCommandName;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics: readonly LegacyImportDiagnosticDto[];
}

export type LegacyImportRuntimeResult<T extends object = Record<string, never>> =
  | LegacyImportRuntimeSuccess<T>
  | { readonly ok: false; readonly error: LegacyImportRuntimeError };

type LegacyImportReservedSuccessDataKey =
  | "ok"
  | "error"
  | "command"
  | "workspace"
  | "sourceCollectionId"
  | "scanBatchId"
  | "eventIds"
  | "nextActions";

type LegacyImportSuccessData<T extends object> =
  T & { readonly [Key in Extract<keyof T, LegacyImportReservedSuccessDataKey>]: never };

export type LegacyImportRuntimeSuccess<T extends object = Record<string, never>> =
  Readonly<{
    ok: true;
    command: LegacyImportCommandName;
    workspace?: LegacyImportWorkspaceDto;
    sourceCollectionId?: string;
    scanBatchId?: string;
    eventIds: readonly string[];
    nextActions: readonly LegacyImportNextAction[];
  } & T>;

export function stableLegacyImportError(input: {
  readonly code: LegacyImportErrorCode;
  readonly command: LegacyImportCommandName;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
  readonly diagnostics?: readonly LegacyImportDiagnosticDto[];
}): LegacyImportRuntimeResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: input.code,
      command: input.command,
      message: legacySecretSafeText(input.message),
      allowedRepairActions: Object.freeze(input.allowedRepairActions.map(legacySecretSafeText)),
      diagnostics: Object.freeze((input.diagnostics ?? []).map(stableLegacyImportDiagnostic))
    })
  });
}

export function stableLegacyImportSuccess<T extends object>(input: {
  readonly command: LegacyImportCommandName;
  readonly workspace?: LegacyImportWorkspaceDto;
  readonly sourceCollectionId?: string;
  readonly scanBatchId?: string;
  readonly eventIds?: readonly string[];
  readonly nextActions?: readonly LegacyImportNextAction[];
  readonly data?: LegacyImportSuccessData<T>;
}): LegacyImportRuntimeResult<T> {
  assertNoReservedSuccessDataKeys(input.data);

  const common = {
    ...(input.data ?? {}),
    ok: true,
    command: input.command,
    ...(input.workspace === undefined ? {} : { workspace: stableLegacyImportWorkspace(input.workspace) }),
    ...(input.sourceCollectionId === undefined ? {} : { sourceCollectionId: input.sourceCollectionId }),
    ...(input.scanBatchId === undefined ? {} : { scanBatchId: input.scanBatchId }),
    eventIds: Object.freeze([...(input.eventIds ?? [])]),
    nextActions: Object.freeze([...(input.nextActions ?? [])])
  } as LegacyImportRuntimeSuccess<T>;

  return Object.freeze(common);
}

const legacyImportReservedSuccessDataKeys = new Set<LegacyImportReservedSuccessDataKey>([
  "ok",
  "error",
  "command",
  "workspace",
  "sourceCollectionId",
  "scanBatchId",
  "eventIds",
  "nextActions"
]);

function assertNoReservedSuccessDataKeys(data: object | undefined): void {
  if (data === undefined) {
    return;
  }

  for (const key of Object.keys(data)) {
    if (legacyImportReservedSuccessDataKeys.has(key as LegacyImportReservedSuccessDataKey)) {
      throw new Error(`Data contains reserved legacy import success envelope field: ${key}`);
    }
  }
}

function stableLegacyImportWorkspace(workspace: LegacyImportWorkspaceDto): LegacyImportWorkspaceDto {
  return Object.freeze({
    workspaceId: workspace.workspaceId,
    label: legacySecretSafeText(workspace.label)
  });
}

function stableLegacyImportDiagnostic(
  diagnostic: LegacyImportDiagnosticDto
): LegacyImportDiagnosticDto {
  return Object.freeze({
    ...(diagnostic.diagnosticId === undefined ? {} : { diagnosticId: diagnostic.diagnosticId }),
    severity: diagnostic.severity,
    category: legacySecretSafeText(diagnostic.category),
    message: legacySecretSafeText(diagnostic.message)
  });
}

function legacySecretSafeText(value: string): string {
  const result = legacySecretSafeDiagnosticTextSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Legacy import runtime text must be secret-safe: ${issue?.message ?? result.error.message}`);
  }
  return result.data;
}
