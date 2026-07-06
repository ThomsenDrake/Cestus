import type {
  ApproveProviderParsingInput,
  ApproveRawImportInput,
  ImportApprovedInput,
  IngestionDiagnosticsInput,
  IngestionJobDto,
  IngestionRuntimeDiagnosticDto,
  IngestionWorkspaceDto,
  RetryIngestionJobInput
} from "./ingestion-types.js";

interface IngestionWorkspaceProps {
  readonly workspace: IngestionWorkspaceDto | undefined;
  readonly loadState: "idle" | "loading" | "loaded" | "error";
  readonly loadError?: string | undefined;
  readonly jobs?: readonly IngestionJobDto[];
  readonly diagnostics?: readonly IngestionRuntimeDiagnosticDto[];
  readonly onApproveRawImport?: (input: ApproveRawImportInput) => void;
  readonly onImportApproved?: (input: ImportApprovedInput) => void;
  readonly onApproveProviderParsing?: (input: ApproveProviderParsingInput) => void;
  readonly onRetryJob?: (input: RetryIngestionJobInput) => void;
  readonly onLoadDiagnostics?: (input: IngestionDiagnosticsInput) => void;
}

const uiActorId = "actor_ui_local";

export function IngestionWorkspace({
  workspace,
  loadState,
  loadError,
  jobs = [],
  diagnostics = [],
  onApproveRawImport,
  onImportApproved,
  onApproveProviderParsing,
  onRetryJob,
  onLoadDiagnostics
}: IngestionWorkspaceProps) {
  const review = workspace?.review;
  const allDiagnostics = [
    ...(workspace?.diagnostics ?? []),
    ...(review?.diagnostics ?? []),
    ...diagnostics
  ];

  return (
    <section aria-label="Ingestion workspace" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Public evidence intake</p>
          <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Ingestion</h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--muted-amber)] sm:text-sm">
            {workspaceLabel(workspace, loadState)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Approve raw import"
            input={review === undefined ? undefined : approveRawImportInput(review)}
            onAction={onApproveRawImport}
          />
          <ActionButton
            label="Run approved import"
            input={review === undefined ? undefined : importApprovedInput(review)}
            onAction={onImportApproved}
          />
          <ActionButton
            label="Approve provider parsing"
            input={review === undefined ? undefined : approveProviderInput(review)}
            onAction={onApproveProviderParsing}
          />
        </div>
      </div>

      {loadState === "loading" || loadState === "idle" ? (
        <section aria-label="Ingestion loading state" className="border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading ingestion workspace</p>
          <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            Reading the mounted workspace state from the local ingestion runtime.
          </p>
        </section>
      ) : null}

      {loadState === "error" ? (
        <section aria-label="Ingestion load error" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
          <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Ingestion unavailable</p>
          <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
            {loadError ?? "The ingestion workspace DTO could not be loaded."}
          </p>
        </section>
      ) : null}

      {workspace !== undefined && !workspace.mounted ? (
        <section aria-label="Workspace not mounted" className="border border-[var(--signal-amber)] bg-[var(--console-panel)] p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Workspace not mounted</p>
          <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
            {workspace.diagnostics[0]?.message ?? "Portable workspace is not mounted."}
          </p>
        </section>
      ) : null}

      {workspace?.mounted === true && review === undefined ? (
        <section aria-label="Source registration state" className="border border-[var(--console-line)] bg-[var(--console-panel)] p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">No source collection selected</p>
          <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            Source mounting and registration are handled by the local workspace layer.
          </p>
        </section>
      ) : null}

      {review !== undefined ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryMetric label="Observed" value={countLabel(review.totals.observedFiles, "observed file")} />
            <SummaryMetric label="Unique content" value={countLabel(review.totals.uniqueContent, "unique item")} />
            <SummaryMetric label="Estimated growth" value={formatBytes(review.totals.estimatedNewBlobBytes)} />
            <SummaryMetric label="Import batch" value={review.latestImportBatchId ?? "No import batch"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <section aria-label="Dry-run totals" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <div className="border-b border-[var(--console-line)] px-4 py-3">
                <h2 className="text-base font-semibold text-[var(--paper-light)]">Dry-run review</h2>
                <p className="mt-1 text-sm text-[var(--paper-light)]">{review.label}</p>
                <p className="mt-1 font-mono text-xs text-[var(--muted-amber)]">
                  {review.latestScanBatchId ?? "No scan batch"}
                </p>
              </div>
              <dl className="divide-y divide-[var(--console-line)]">
                <StatRow label="Source collection" value={review.sourceCollectionId} />
                <StatRow label="Observed files" value={String(review.totals.observedFiles)} />
                <StatRow label="Unique content" value={countLabel(review.totals.uniqueContent, "unique item")} />
                <StatRow label="Duplicate occurrences" value={String(review.totals.duplicateOccurrences)} />
                <StatRow label="Skipped" value={String(review.totals.skipped)} />
                <StatRow label="Source bytes" value={formatBytes(review.totals.bytes)} />
                <StatRow label="New blob bytes" value={formatBytes(review.totals.estimatedNewBlobBytes)} />
              </dl>
            </section>

            <section aria-label="Approval gates" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <div className="border-b border-[var(--console-line)] px-4 py-3">
                <h2 className="text-base font-semibold text-[var(--paper-light)]">Approval gates</h2>
              </div>
              <div className="space-y-3 px-4 py-3 text-sm">
                <GateState
                  label="Raw import"
                  state={review.approvalRequired ? "Human approval required" : "Approval recorded"}
                />
                <GateState
                  label="Import execution"
                  state={review.latestImportBatchId === undefined ? "Waiting for approval" : review.latestImportBatchId}
                />
                <GateState label="Provider parsing" state={providerGateState(review.parseJobs)} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Duplicate content" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--console-line)] px-4 py-3">
                <h2 className="text-base font-semibold text-[var(--paper-light)]">Duplicates</h2>
                <p className="font-mono text-xs text-[var(--signal-amber)]">
                  {countLabel(review.totals.duplicateOccurrences, "duplicate occurrence")}
                </p>
              </div>
              {review.duplicateGroups.length > 0 ? (
                <ul className="divide-y divide-[var(--console-line)]">
                  {review.duplicateGroups.map((group) => (
                    <li key={group.contentHash} className="grid gap-1 px-4 py-3">
                      <span className="font-mono text-xs break-all text-[var(--muted-amber)]">{group.contentHash}</span>
                      <span className="text-sm text-[var(--paper-light)]">
                        {countLabel(group.occurrenceCount, "source occurrence")}
                      </span>
                      {group.evidenceId === undefined ? null : (
                        <span className="font-mono text-xs text-[var(--signal-cyan)]">{group.evidenceId}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">No duplicate content detected.</p>
              )}
            </section>

            <section aria-label="Evidence links" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <div className="border-b border-[var(--console-line)] px-4 py-3">
                <h2 className="text-base font-semibold text-[var(--paper-light)]">Evidence links</h2>
              </div>
              {review.evidenceLinks.length > 0 ? (
                <ul className="divide-y divide-[var(--console-line)]">
                  {review.evidenceLinks.map((link) => (
                    <li key={`${link.contentHash}-${link.evidenceId}`} className="grid gap-1 px-4 py-3">
                      <span className="font-mono text-xs text-[var(--signal-cyan)]">{link.evidenceId}</span>
                      <span className="font-mono text-xs break-all text-[var(--muted-amber)]">{link.contentHash}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">No evidence links recorded.</p>
              )}
            </section>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Ingestion jobs" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <div className="border-b border-[var(--console-line)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--paper-light)]">Jobs</h2>
          </div>
          {jobs.length > 0 ? (
            <ul className="divide-y divide-[var(--console-line)]">
              {jobs.map((job) => (
                <li key={job.jobId} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[var(--paper-light)]">{job.jobId}</p>
                    <p className="mt-1 text-sm text-[var(--muted-amber)]">
                      {job.kind} · {job.state}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!job.retryable || onRetryJob === undefined}
                    onClick={() => onRetryJob?.({ jobId: job.jobId })}
                    className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] disabled:opacity-55 sm:text-sm"
                  >
                    Retry {job.jobId}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">No ingestion jobs reported.</p>
          )}
        </section>

        <section aria-label="Ingestion diagnostics" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--console-line)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--paper-light)]">Diagnostics</h2>
            <button
              type="button"
              disabled={onLoadDiagnostics === undefined}
              onClick={() => onLoadDiagnostics?.(review?.sourceCollectionId === undefined ? {} : { sourceCollectionId: review.sourceCollectionId })}
              className="min-h-9 border border-[var(--console-line)] px-3 py-1.5 text-sm text-[var(--signal-amber)] disabled:opacity-55"
            >
              Refresh diagnostics
            </button>
          </div>
          {allDiagnostics.length > 0 ? (
            <ul className="divide-y divide-[var(--console-line)]">
              {allDiagnostics.map((diagnostic, index) => (
                <li key={diagnosticKey(diagnostic, index)} className="grid gap-1 px-4 py-3">
                  <span className={`font-mono text-xs uppercase ${severityClassName(diagnostic.severity)}`}>
                    {diagnostic.severity}
                  </span>
                  <span className="text-sm text-[var(--paper-light)]">{diagnostic.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">No diagnostics reported.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function ActionButton<Input extends object>({
  label,
  input,
  onAction
}: {
  readonly label: string;
  readonly input: Input | undefined;
  readonly onAction: ((input: Input) => void) | undefined;
}) {
  return (
    <button
      type="button"
      disabled={input === undefined || onAction === undefined}
      onClick={() => {
        if (input !== undefined) {
          onAction?.(input);
        }
      }}
      className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] disabled:opacity-55 sm:text-sm"
    >
      {label}
    </button>
  );
}

function SummaryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="border border-[var(--console-line)] bg-[var(--console-panel)] px-4 py-3">
      <p className="font-mono text-xs uppercase text-[var(--muted-amber)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--paper-light)]">{value}</p>
    </div>
  );
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-[var(--muted-amber)]">{label}</dt>
      <dd className="text-right font-mono text-[var(--paper-light)]">{value}</dd>
    </div>
  );
}

function GateState({ label, state }: { readonly label: string; readonly state: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-[var(--console-line)] bg-[var(--console-panel-raised)] px-3 py-2">
      <span className="text-[var(--muted-amber)]">{label}</span>
      <span className="text-right font-mono text-xs text-[var(--paper-light)]">{state}</span>
    </div>
  );
}

function workspaceLabel(workspace: IngestionWorkspaceDto | undefined, loadState: IngestionWorkspaceProps["loadState"]) {
  if (workspace?.mounted === true) {
    return workspace.label ?? "Mounted ingestion workspace";
  }
  if (workspace?.mounted === false) {
    return "Portable workspace not mounted";
  }
  return loadState === "error" ? "Ingestion runtime unavailable" : "Awaiting local ingestion runtime";
}

function approveRawImportInput(review: NonNullable<IngestionWorkspaceDto["review"]>): ApproveRawImportInput | undefined {
  if (review.latestScanBatchId === undefined) {
    return undefined;
  }

  return {
    sourceCollectionId: review.sourceCollectionId,
    scanBatchId: review.latestScanBatchId,
    importBatchId: review.latestImportBatchId ?? importBatchIdForScan(review.latestScanBatchId),
    approvedBy: uiActorId
  };
}

function importApprovedInput(review: NonNullable<IngestionWorkspaceDto["review"]>): ImportApprovedInput | undefined {
  if (review.latestScanBatchId === undefined || review.latestImportBatchId === undefined) {
    return undefined;
  }

  return {
    sourceCollectionId: review.sourceCollectionId,
    scanBatchId: review.latestScanBatchId,
    importBatchId: review.latestImportBatchId
  };
}

function approveProviderInput(review: NonNullable<IngestionWorkspaceDto["review"]>): ApproveProviderParsingInput | undefined {
  if (review.latestImportBatchId === undefined) {
    return undefined;
  }

  return {
    providerJobId: `provider_${normalizeIdPart(review.latestImportBatchId)}`,
    sourceCollectionId: review.sourceCollectionId,
    importBatchId: review.latestImportBatchId,
    provider: { name: "mistral-document-ai", version: "0.1.0" },
    approvedBy: uiActorId,
    eligibleMediaTypes: ["application/pdf"],
    maxBytesPerFile: 50000000
  };
}

function importBatchIdForScan(scanBatchId: string): string {
  return `imp_${normalizeIdPart(scanBatchId.replace(/^scan_/, ""))}`;
}

function normalizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function providerGateState(parseJobs: readonly NonNullable<IngestionWorkspaceDto["review"]>["parseJobs"][number][]) {
  const providerJob = parseJobs.find((job) => job.lane === "provider");
  if (providerJob === undefined) {
    return "Approval required before byte transfer";
  }
  return `${providerJob.parser.name} ${providerJob.state}`;
}

function diagnosticKey(diagnostic: IngestionRuntimeDiagnosticDto, index: number) {
  return diagnostic.diagnosticId ?? `${diagnostic.severity}-${diagnostic.category}-${index}`;
}

function countLabel(count: number, singular: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : `${singular}s`}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return countLabel(bytes, "byte");
  }

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function severityClassName(severity: IngestionRuntimeDiagnosticDto["severity"]) {
  switch (severity) {
    case "error":
      return "text-[var(--signal-red)]";
    case "warning":
      return "text-[var(--signal-amber)]";
    case "info":
      return "text-[var(--signal-cyan)]";
  }
}
