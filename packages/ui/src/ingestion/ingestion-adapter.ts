import type {
  ApproveProviderParsingInput,
  ApproveRawImportInput,
  DryRunScanInput,
  ImportApprovedInput,
  IngestionActionResult,
  IngestionDiagnosticsDto,
  IngestionDiagnosticsInput,
  IngestionJobActionResult,
  IngestionJobDto,
  IngestionJobListDto,
  IngestionReviewDto,
  IngestionSourceDto,
  IngestionSourceListDto,
  LoadIngestionReviewInput,
  IngestionRuntimeDiagnosticDto,
  IngestionRuntimeError,
  IngestionWorkspaceDto,
  ListIngestionJobsInput,
  RegisterSourceInput,
  RetryIngestionJobInput
} from "./ingestion-types.js";

export interface IngestionWorkspaceAdapter {
  loadWorkspace(): Promise<IngestionWorkspaceDto>;
  listSources(): Promise<IngestionSourceListDto>;
  loadReview(input: LoadIngestionReviewInput): Promise<IngestionActionResult>;
  runLocalParsing(input: ListIngestionJobsInput): Promise<IngestionJobListDto>;
  registerSource(input: RegisterSourceInput): Promise<IngestionActionResult>;
  dryRunScan(input: DryRunScanInput): Promise<IngestionActionResult>;
  approveRawImport(input: ApproveRawImportInput): Promise<IngestionActionResult>;
  importApproved(input: ImportApprovedInput): Promise<IngestionActionResult>;
  listJobs(input: ListIngestionJobsInput): Promise<IngestionJobListDto>;
  retryJob(input: RetryIngestionJobInput): Promise<IngestionJobActionResult>;
  approveProviderParsing(input: ApproveProviderParsingInput): Promise<IngestionActionResult>;
  loadDiagnostics(input: IngestionDiagnosticsInput): Promise<IngestionDiagnosticsDto>;
}

export interface HttpIngestionWorkspaceAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
}

export interface StaticIngestionWorkspaceAdapterOptions {
  readonly jobs?: IngestionJobListDto;
  readonly sources?: IngestionSourceListDto;
  readonly diagnostics?: IngestionDiagnosticsDto;
  readonly actionResult?: IngestionActionResult;
  readonly jobActionResult?: IngestionJobActionResult;
}

const forbiddenBodyFields = new Set([
  "workspace",
  "workspaceRoot",
  "workspacePath",
  "storagePath",
  "sqlitePath",
  "blobRoot"
]);

export function createHttpIngestionWorkspaceAdapter(
  options: HttpIngestionWorkspaceAdapterOptions = {}
): IngestionWorkspaceAdapter {
  const baseUrl = options.baseUrl ?? "";
  const credentials = options.credentials ?? "same-origin";
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return Object.freeze({
    async loadWorkspace() {
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/workspace`, {
        credentials,
        headers: authHeaders(options.authToken),
        method: "GET"
      });
      return workspaceDtoFromJson(response);
    },
    async listSources() {
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/sources`, {
        credentials, headers: authHeaders(options.authToken), method: "GET"
      });
      if (isRuntimeFailure(response)) throw new Error(safeMessage(response.error.message));
      if (!isJsonObject(response) || !arrayOf(response.sources, isSourceDto)) {
        throw new Error("Ingestion runtime returned invalid sources payload.");
      }
      return { sources: response.sources.map((source) => ({ ...source, label: safeMessage(source.label) })) };
    },
    async loadReview(input: LoadIngestionReviewInput) {
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/review${queryString(input)}`, {
        credentials, headers: authHeaders(options.authToken), method: "GET"
      });
      return actionResultFromJson(response);
    },
    async runLocalParsing(input: ListIngestionJobsInput) {
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/parse/run`, {
        credentials, headers: { ...authHeaders(options.authToken), "content-type": "application/json" },
        method: "POST", body: JSON.stringify(stripForbiddenBodyFields(input))
      });
      return jobListDtoFromJson(response);
    },
    registerSource(input: RegisterSourceInput) {
      return postAction(fetcher, `${baseUrl}/api/ingestion/sources`, input, credentials, options.authToken);
    },
    dryRunScan(input: DryRunScanInput) {
      return postAction(fetcher, `${baseUrl}/api/ingestion/scans/dry-run`, input, credentials, options.authToken);
    },
    approveRawImport(input: ApproveRawImportInput) {
      return postAction(fetcher, `${baseUrl}/api/ingestion/imports/approve`, input, credentials, options.authToken);
    },
    importApproved(input: ImportApprovedInput) {
      return postAction(fetcher, `${baseUrl}/api/ingestion/imports/run`, input, credentials, options.authToken);
    },
    async listJobs(input: ListIngestionJobsInput) {
      const query = queryString(input);
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/jobs${query}`, {
        credentials,
        headers: authHeaders(options.authToken),
        method: "GET"
      });
      return jobListDtoFromJson(response);
    },
    retryJob(input: RetryIngestionJobInput) {
      return postJobAction(fetcher, `${baseUrl}/api/ingestion/jobs/retry`, input, credentials, options.authToken);
    },
    approveProviderParsing(input: ApproveProviderParsingInput) {
      return postAction(
        fetcher,
        `${baseUrl}/api/ingestion/provider-parsing/approve`,
        input,
        credentials,
        options.authToken
      );
    },
    async loadDiagnostics(input: IngestionDiagnosticsInput) {
      const query = queryString(input);
      const response = await getJson(fetcher, `${baseUrl}/api/ingestion/diagnostics${query}`, {
        credentials,
        headers: authHeaders(options.authToken),
        method: "GET"
      });
      return diagnosticsDtoFromJson(response);
    }
  });
}

export const httpIngestionWorkspaceAdapter = createHttpIngestionWorkspaceAdapter();

export function createStaticIngestionWorkspaceAdapter(
  workspace: IngestionWorkspaceDto,
  options: StaticIngestionWorkspaceAdapterOptions = {}
): IngestionWorkspaceAdapter {
  let currentWorkspace = workspace;
  const actionResult =
    options.actionResult ??
    ({
      ok: false,
      error: {
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "This ingestion adapter cannot perform runtime actions.",
        allowedRepairActions: ["use an HTTP ingestion adapter"],
        diagnostics: []
      }
    } satisfies IngestionActionResult);

  async function action(): Promise<IngestionActionResult> {
    if (actionResult.ok) {
      currentWorkspace = { ...currentWorkspace, review: actionResult.review };
    }
    return actionResult;
  }

  return Object.freeze({
    async loadWorkspace() {
      return currentWorkspace;
    },
    async listSources() {
      return options.sources ?? { sources: currentWorkspace.review === undefined ? [] : [{
        sourceCollectionId: currentWorkspace.review.sourceCollectionId,
        label: currentWorkspace.review.label,
        scanBatchIds: [], importBatchIds: [], diagnosticIds: []
      }] };
    },
    async loadReview(input: LoadIngestionReviewInput) {
      if (currentWorkspace.review?.sourceCollectionId === input.sourceCollectionId) {
        return { ok: true as const, review: currentWorkspace.review, eventIds: [] };
      }
      return actionResult;
    },
    async runLocalParsing() { return options.jobs ?? { jobs: [] }; },
    registerSource: action,
    dryRunScan: action,
    approveRawImport: action,
    importApproved: action,
    async listJobs() {
      return options.jobs ?? { jobs: [] };
    },
    async retryJob() {
      return options.jobActionResult ?? {
        ok: false,
        error: {
          code: "INGESTION_RUNTIME_INTERNAL",
          message: "This ingestion adapter cannot retry jobs.",
          allowedRepairActions: ["use an HTTP ingestion adapter"],
          diagnostics: []
        }
      };
    },
    approveProviderParsing: action,
    async loadDiagnostics() {
      return options.diagnostics ?? { diagnostics: currentWorkspace.diagnostics };
    }
  });
}

async function getJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new Error("Ingestion runtime request failed.");
  }

  try {
    const value = await response.json();
    if (!response.ok && !isRuntimeFailure(value)) {
      throw new Error(`Ingestion runtime returned HTTP ${response.status}.`);
    }
    return value;
  } catch {
    throw new Error(response.ok ? "Ingestion runtime returned invalid JSON." : `Ingestion runtime returned HTTP ${response.status}.`);
  }
}

async function postAction(
  fetcher: typeof fetch,
  url: string,
  input: object,
  credentials: RequestCredentials,
  authToken: string | undefined
): Promise<IngestionActionResult> {
  const response = await getJson(fetcher, url, {
    body: JSON.stringify(stripForbiddenBodyFields(input)),
    credentials,
    headers: {
      ...authHeaders(authToken),
      "content-type": "application/json"
    },
    method: "POST"
  });
  return actionResultFromJson(response);
}

async function postJobAction(
  fetcher: typeof fetch,
  url: string,
  input: object,
  credentials: RequestCredentials,
  authToken: string | undefined
): Promise<IngestionJobActionResult> {
  const response = await getJson(fetcher, url, {
    body: JSON.stringify(stripForbiddenBodyFields(input)),
    credentials,
    headers: {
      ...authHeaders(authToken),
      "content-type": "application/json"
    },
    method: "POST"
  });
  return jobActionResultFromJson(response);
}

function workspaceDtoFromJson(value: unknown): IngestionWorkspaceDto {
  if (isRuntimeFailure(value)) {
    return unmountedWorkspaceFromError(value.error);
  }

  if (isJsonObject(value) && value.ok === true && isWorkspaceDto(value.workspace)) {
    return safeWorkspaceDto(value.workspace);
  }

  if (isWorkspaceDto(value)) {
    return safeWorkspaceDto(value);
  }

  throw new Error("Ingestion runtime returned invalid workspace payload.");
}

function unmountedWorkspaceFromError(error: IngestionRuntimeError): IngestionWorkspaceDto {
  return {
    mounted: false,
    diagnostics: [
      ...error.diagnostics.map(safeDiagnostic),
      {
        severity: "error",
        category: "workspace",
        message: safeMessage(error.message)
      }
    ]
  };
}

function actionResultFromJson(value: unknown): IngestionActionResult {
  if (isRuntimeFailure(value)) {
    return { ok: false, error: safeError(value.error) };
  }

  if (!isJsonObject(value) || value.ok !== true || !isReviewDto(value.review)) {
    return {
      ok: false,
      error: {
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Ingestion runtime returned an invalid action payload.",
        allowedRepairActions: ["retry the ingestion action"],
        diagnostics: []
      }
    };
  }

  return {
    ok: true,
    review: safeReviewDto(value.review),
    eventIds: stringArray(value.eventIds) ?? [],
    ...(typeof value.scanBatchId === "string" ? { scanBatchId: value.scanBatchId } : {}),
    ...(typeof value.inventoryHash === "string" ? { inventoryHash: value.inventoryHash } : {}),
    ...(typeof value.importBatchId === "string" ? { importBatchId: value.importBatchId } : {}),
    ...(isImportTotals(value.totals) ? { totals: value.totals } : {})
  };
}

function jobActionResultFromJson(value: unknown): IngestionJobActionResult {
  if (isRuntimeFailure(value)) {
    return { ok: false, error: safeError(value.error) };
  }

  if (!isJsonObject(value) || value.ok !== true || !isJobDto(value.job)) {
    return {
      ok: false,
      error: {
        code: "INGESTION_RUNTIME_INTERNAL",
        message: "Ingestion runtime returned an invalid job action payload.",
        allowedRepairActions: ["retry the ingestion job action"],
        diagnostics: []
      }
    };
  }

  return {
    ok: true,
    job: safeJobDto(value.job),
    ...(isReviewDto(value.review) ? { review: safeReviewDto(value.review) } : {}),
    eventIds: stringArray(value.eventIds) ?? []
  };
}

function jobListDtoFromJson(value: unknown): IngestionJobListDto {
  if (isJsonObject(value) && value.ok === true && arrayOf(value.jobs, isJobDto)) {
    return {
      jobs: value.jobs.map(safeJobDto),
      ...(arrayOf(value.diagnostics, isDiagnosticDto) ? { diagnostics: value.diagnostics.map(safeDiagnostic) } : {})
    };
  }

  if (isJsonObject(value) && arrayOf(value.jobs, isJobDto)) {
    return {
      jobs: value.jobs.map(safeJobDto),
      ...(arrayOf(value.diagnostics, isDiagnosticDto) ? { diagnostics: value.diagnostics.map(safeDiagnostic) } : {})
    };
  }

  if (isRuntimeFailure(value)) {
    return {
      jobs: [],
      diagnostics: [
        ...value.error.diagnostics.map(safeDiagnostic),
        safeDiagnosticFromError(value.error)
      ]
    };
  }

  throw new Error("Ingestion runtime returned invalid jobs payload.");
}

function diagnosticsDtoFromJson(value: unknown): IngestionDiagnosticsDto {
  if (isJsonObject(value) && value.ok === true && arrayOf(value.diagnostics, isDiagnosticDto)) {
    return { diagnostics: value.diagnostics.map(safeDiagnostic) };
  }

  if (isJsonObject(value) && arrayOf(value.diagnostics, isDiagnosticDto)) {
    return { diagnostics: value.diagnostics.map(safeDiagnostic) };
  }

  if (isRuntimeFailure(value)) {
    return {
      diagnostics: [
        ...value.error.diagnostics.map(safeDiagnostic),
        safeDiagnosticFromError(value.error)
      ]
    };
  }

  throw new Error("Ingestion runtime returned invalid diagnostics payload.");
}

function safeWorkspaceDto(workspace: IngestionWorkspaceDto): IngestionWorkspaceDto {
  return {
    mounted: workspace.mounted,
    ...(workspace.workspaceId === undefined ? {} : { workspaceId: safeMessage(workspace.workspaceId) }),
    ...(workspace.label === undefined ? {} : { label: safeMessage(workspace.label) }),
    ...(workspace.capabilities === undefined ? {} : { capabilities: { ...workspace.capabilities } }),
    ...(workspace.review === undefined ? {} : { review: safeReviewDto(workspace.review) }),
    diagnostics: workspace.diagnostics.map(safeDiagnostic)
  };
}

function safeReviewDto(review: IngestionReviewDto): IngestionReviewDto {
  return {
    sourceCollectionId: safeMessage(review.sourceCollectionId),
    label: safeMessage(review.label),
    ...(review.latestScanBatchId === undefined ? {} : { latestScanBatchId: safeMessage(review.latestScanBatchId) }),
    ...(review.latestImportBatchId === undefined ? {} : { latestImportBatchId: safeMessage(review.latestImportBatchId) }),
    totals: { ...review.totals },
    approvalRequired: review.approvalRequired,
    ...(review.importCompleted === undefined ? {} : { importCompleted: review.importCompleted }),
    ...(review.approvedImportBatchId === undefined ? {} : { approvedImportBatchId: review.approvedImportBatchId }),
    ...(review.files === undefined ? {} : { files: review.files.map((file) => ({
      ...file, sourcePath: safeSourcePath(file.sourcePath), status: safeMessage(file.status)
    })) }),
    duplicateGroups: review.duplicateGroups.map((group) => ({
      contentHash: safeMessage(group.contentHash),
      occurrenceCount: group.occurrenceCount,
      ...(group.occurrenceIds === undefined ? {} : { occurrenceIds: group.occurrenceIds.map(safeMessage) }),
      ...(group.sourcePaths === undefined ? {} : { sourcePaths: group.sourcePaths.map(safeMessage) }),
      ...(group.evidenceId === undefined ? {} : { evidenceId: safeMessage(group.evidenceId) })
    })),
    evidenceLinks: review.evidenceLinks.map((link) => ({
      contentHash: safeMessage(link.contentHash),
      evidenceId: safeMessage(link.evidenceId),
      occurrenceIds: link.occurrenceIds.map(safeMessage)
    })),
    parseJobs: review.parseJobs.map((job) => ({
      parseJobId: safeMessage(job.parseJobId),
      evidenceId: safeMessage(job.evidenceId),
      lane: job.lane,
      parser: {
        name: safeMessage(job.parser.name),
        version: safeMessage(job.parser.version)
      },
      state: job.state,
      ...(job.coverageStatus === undefined ? {} : { coverageStatus: job.coverageStatus })
    })),
    diagnostics: review.diagnostics.map(safeDiagnostic)
  };
}

function safeSourcePath(sourcePath: string): string {
  if (sourcePath.startsWith("/") || /^[A-Za-z]:/.test(sourcePath)) return safeMessage(sourcePath);
  return sourcePath.split("/").map(safeMessage).join("/");
}

function safeJobDto(job: IngestionJobDto): IngestionJobDto {
  return { ...job, ...(job.message === undefined ? {} : { message: safeMessage(job.message) }) };
}

function safeError(error: IngestionRuntimeError): IngestionRuntimeError {
  return {
    code: safeMessage(error.code),
    message: safeMessage(error.message),
    allowedRepairActions: error.allowedRepairActions.map(safeMessage),
    diagnostics: error.diagnostics.map(safeDiagnostic)
  };
}

function safeDiagnostic(diagnostic: IngestionRuntimeDiagnosticDto): IngestionRuntimeDiagnosticDto {
  return {
    ...(diagnostic.diagnosticId === undefined ? {} : { diagnosticId: safeMessage(diagnostic.diagnosticId) }),
    severity: diagnostic.severity,
    category: safeMessage(diagnostic.category),
    message: safeMessage(diagnostic.message)
  };
}

function safeDiagnosticFromError(error: IngestionRuntimeError): IngestionRuntimeDiagnosticDto {
  return {
    severity: "error",
    category: "ingestion",
    message: safeMessage(error.message)
  };
}

function stripForbiddenBodyFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbiddenBodyFields);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbiddenBodyFields.has(key))
      .map(([key, nested]) => [key, stripForbiddenBodyFields(nested)])
  );
}

function queryString(input: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(stripForbiddenBodyFields(input) as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value);
    }
  }
  const text = params.toString();
  return text.length === 0 ? "" : `?${text}`;
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

function isRuntimeFailure(value: unknown): value is { readonly ok: false; readonly error: IngestionRuntimeError } {
  return isJsonObject(value) && value.ok === false && isRuntimeError(value.error);
}

function isRuntimeError(value: unknown): value is IngestionRuntimeError {
  return (
    isJsonObject(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    arrayOf(value.allowedRepairActions, isString) &&
    arrayOf(value.diagnostics, isDiagnosticDto)
  );
}

function isWorkspaceDto(value: unknown): value is IngestionWorkspaceDto {
  return (
    isJsonObject(value) &&
    typeof value.mounted === "boolean" &&
    (value.workspaceId === undefined || typeof value.workspaceId === "string") &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.review === undefined || isReviewDto(value.review)) &&
    arrayOf(value.diagnostics, isDiagnosticDto)
  );
}

function isReviewDto(value: unknown): value is IngestionReviewDto {
  return (
    isJsonObject(value) &&
    typeof value.sourceCollectionId === "string" &&
    typeof value.label === "string" &&
    isJsonObject(value.totals) &&
    typeof value.totals.observedFiles === "number" &&
    typeof value.totals.uniqueContent === "number" &&
    typeof value.totals.duplicateOccurrences === "number" &&
    typeof value.totals.skipped === "number" &&
    typeof value.totals.bytes === "number" &&
    typeof value.totals.estimatedNewBlobBytes === "number" &&
    typeof value.approvalRequired === "boolean" &&
    arrayOf(value.duplicateGroups, isJsonObject) &&
    arrayOf(value.evidenceLinks, isJsonObject) &&
    arrayOf(value.parseJobs, isJsonObject) &&
    arrayOf(value.diagnostics, isDiagnosticDto)
  );
}

function isImportTotals(value: unknown): value is NonNullable<Extract<IngestionActionResult, { ok: true }>["totals"]> {
  return (
    isJsonObject(value) &&
    typeof value.evidenceCreated === "number" &&
    typeof value.occurrencesLinked === "number" &&
    typeof value.duplicatesReused === "number" &&
    typeof value.skipped === "number"
  );
}

function isSourceDto(value: unknown): value is IngestionSourceDto {
  return isJsonObject(value) && typeof value.sourceCollectionId === "string" && typeof value.label === "string"
    && arrayOf(value.scanBatchIds, isString) && arrayOf(value.importBatchIds, isString)
    && arrayOf(value.diagnosticIds, isString);
}

function isJobDto(value: unknown): value is IngestionJobDto {
  return (
    isJsonObject(value) &&
    typeof value.jobId === "string" &&
    typeof value.kind === "string" &&
    typeof value.state === "string" &&
    typeof value.retryable === "boolean" &&
    (value.coverageStatus === undefined || value.coverageStatus === "complete" || value.coverageStatus === "partial") &&
    (value.message === undefined || typeof value.message === "string") &&
    arrayOf(value.diagnosticIds, isString)
  );
}

function isDiagnosticDto(value: unknown): value is IngestionRuntimeDiagnosticDto {
  return (
    isJsonObject(value) &&
    (value.diagnosticId === undefined || typeof value.diagnosticId === "string") &&
    (value.severity === "info" || value.severity === "warning" || value.severity === "error") &&
    typeof value.category === "string" &&
    typeof value.message === "string"
  );
}

function stringArray(value: unknown): readonly string[] | undefined {
  return arrayOf(value, isString) ? value : undefined;
}

function arrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeMessage(message: string): string {
  return message
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(?:password|passwd|secret|token|oauth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|credential|credentials)\s*[:=]\s*[^\s,;]+/gi,
      (match) => {
        const separator = match.includes(":") ? ":" : "=";
        return `${match.slice(0, match.indexOf(separator))}${separator}[redacted]`;
      }
    )
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----/gi, "[redacted]")
    .replace(/-----END [^-]*PRIVATE KEY-----/gi, "[redacted]")
    .replace(/\b[A-Za-z]:\\[^\s"',;)]+/g, "[path redacted]")
    .replace(/(?<![:/])\/(?!\/)[^\s"',;)]+/g, "[path redacted]");
}
