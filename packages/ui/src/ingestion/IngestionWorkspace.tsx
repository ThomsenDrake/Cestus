import { useState } from "react";
import type {
  ApproveRawImportInput,
  DryRunScanInput,
  RegisterSourceInput,
  LoadIngestionReviewInput,
  ListIngestionJobsInput,
  IngestionSourceDto,
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
  readonly sources?: readonly IngestionSourceDto[];
  readonly busy?: boolean;
  readonly onRegisterSource?: (input: RegisterSourceInput) => void;
  readonly onSelectSource?: (input: LoadIngestionReviewInput) => void;
  readonly onDryRunScan?: (input: DryRunScanInput) => void;
  readonly onRunLocalParsing?: (input: ListIngestionJobsInput) => void;
  readonly onOpenEvidence?: (evidenceId: string) => void;
  readonly diagnostics?: readonly IngestionRuntimeDiagnosticDto[];
  readonly onApproveRawImport?: (input: ApproveRawImportInput) => void;
  readonly onImportApproved?: (input: ImportApprovedInput) => void;
  readonly onRetryJob?: (input: RetryIngestionJobInput) => void;
  readonly onLoadDiagnostics?: (input: IngestionDiagnosticsInput) => void;
}

const uiActorId = "actor_ui_local";

export function IngestionWorkspace({
  workspace,
  loadState,
  loadError,
  jobs = [],
  sources = [],
  busy = false,
  onRegisterSource,
  onSelectSource,
  onDryRunScan,
  onRunLocalParsing,
  onOpenEvidence,
  diagnostics = [],
  onApproveRawImport,
  onImportApproved,
  onRetryJob,
  onLoadDiagnostics
}: IngestionWorkspaceProps) {
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const review = workspace?.review;
  const actionsAvailable = workspace?.mounted === true && loadState === "loaded" && !busy;
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
            onAction={actionsAvailable ? onApproveRawImport : undefined}
          />
          <ActionButton
            label="Run approved import"
            input={review === undefined ? undefined : importApprovedInput(review)}
            onAction={actionsAvailable ? onImportApproved : undefined}
          />
          <ActionButton
            label={jobs.some(job => job.kind === "local-parse" && job.state === "running") ? "Recover interrupted extraction" : "Extract queued documents"}
            input={review !== undefined && jobs.some((job) => job.kind === "local-parse" && (job.state === "queued" || job.state === "running"))
              ? { sourceCollectionId: review.sourceCollectionId } : undefined}
            onAction={actionsAvailable ? onRunLocalParsing : undefined}
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
        <section aria-label="Ingestion workspace not connected" className="border border-[var(--signal-amber)] bg-[var(--console-panel)] p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Ingestion workspace not connected</p>
          <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
            {workspace.diagnostics[0]?.message ?? "Portable workspace is not mounted."}
          </p>
        </section>
      ) : null}

      {workspace?.mounted === true ? (
        <section aria-label="Source registration and selection" className="space-y-4 border border-[var(--console-line)] bg-[var(--console-panel)] p-4">
          <h2 className="text-base font-semibold text-[var(--paper-light)]">Source folders</h2>
          <p className="text-sm text-[var(--muted-amber)]">
            Register a folder on this machine. Scanning reads filenames and bytes without changing the source;
            importing copies approved originals into the mounted workspace.
          </p>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            if (!actionsAvailable || !sourceLabel.trim() || !sourcePath.startsWith("/")) return;
            onRegisterSource?.({ sourceCollectionId: `src_${crypto.randomUUID()}`, label: sourceLabel.trim(),
              sourceRoot: sourcePath, rootUri: `file://${sourcePath.split("/").map(encodeURIComponent).join("/")}` });
          }}>
            <label className="grid gap-1 text-sm text-[var(--paper-light)]">
              Source label
              <input required value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)}
                disabled={!actionsAvailable} className="min-h-11 min-w-0 border border-[var(--console-line)] bg-[var(--console-panel-raised)] px-3" />
            </label>
            <label className="grid gap-1 text-sm text-[var(--paper-light)]">
              Source folder path
              <input required value={sourcePath} onChange={(event) => setSourcePath(event.target.value)}
                placeholder="/absolute/path/to/records" autoComplete="off" spellCheck={false}
                disabled={!actionsAvailable} className="min-h-11 min-w-0 border border-[var(--console-line)] bg-[var(--console-panel-raised)] px-3" />
            </label>
            <button type="submit" disabled={!actionsAvailable || onRegisterSource === undefined || !sourceLabel.trim() || !sourcePath.startsWith("/")}
              className="min-h-11 border border-[var(--console-line)] px-3 py-2 text-sm text-[var(--signal-amber)] disabled:opacity-55 md:col-span-2">
              Register source folder
            </button>
          </form>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid min-w-0 flex-1 gap-1 text-sm text-[var(--paper-light)]">
              Registered source
              <select value={review?.sourceCollectionId ?? ""} disabled={!actionsAvailable || onSelectSource === undefined}
                onChange={(event) => { if (event.target.value) onSelectSource?.({ sourceCollectionId: event.target.value }); }}
                className="min-h-11 min-w-0 border border-[var(--console-line)] bg-[var(--console-panel-raised)] px-3">
                <option value="">Select a saved source</option>
                {review !== undefined && !sources.some((source) => source.sourceCollectionId === review.sourceCollectionId)
                  ? <option value={review.sourceCollectionId}>{review.label}</option> : null}
                {sources.map((source) => <option key={source.sourceCollectionId} value={source.sourceCollectionId}>{source.label}</option>)}
              </select>
            </label>
            <ActionButton label="Reopen saved review" input={review === undefined ? undefined : { sourceCollectionId: review.sourceCollectionId }}
              onAction={actionsAvailable ? onSelectSource : undefined} />
            <button type="button" disabled={!actionsAvailable || review === undefined || onDryRunScan === undefined}
              onClick={() => { if (review !== undefined) onDryRunScan?.({ sourceCollectionId: review.sourceCollectionId, scanBatchId: `scan_${crypto.randomUUID()}` }); }}
              className="min-h-11 border border-[var(--console-line)] px-3 py-2 text-sm text-[var(--signal-amber)] disabled:opacity-55">
              Scan source folder
            </button>
          </div>
          <p className="text-sm text-[var(--muted-amber)]">Local extraction supports UTF-8 text, CSV, and text-bearing PDFs.
            Scanned PDFs and images require OCR, which is not supported in this local path.</p>
          {busy ? <p role="status" className="text-sm text-[var(--signal-amber)]">Processing this action. Jobs and diagnostics will refresh when it finishes.</p> : null}
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
                  state={rawImportGateState(review)}
                />
                <GateState
                  label="Import execution"
                  state={importExecutionGateState(review)}
                />
                <p className="text-[var(--muted-amber)]">This approval covers the displayed scan only. Originals remain unchanged.
                  External processing requires a separate exact-content approval in the evidence reader.</p>
              </div>
            </section>
          </div>

          {review.files !== undefined ? (
            <section aria-label="Documents in this scan" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <h2 className="border-b border-[var(--console-line)] px-4 py-3 text-base font-semibold text-[var(--paper-light)]">Documents in this scan</h2>
              <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">Approval imports this entire scanned batch. Review the filenames, sizes, and skipped records before approving.</p>
              <ul className="max-h-96 overflow-auto divide-y divide-[var(--console-line)]">
                {review.files.map((file) => <li key={file.occurrenceId} className="grid gap-1 px-4 py-3">
                  <span className="break-all text-sm text-[var(--paper-light)]">{file.sourcePath}</span>
                  <span className="text-xs text-[var(--muted-amber)]">{formatBytes(file.byteLength)} · {file.status}</span>
                  <span className="break-all font-mono text-xs text-[var(--muted-amber)]">{file.contentHash}</span>
                </li>)}
              </ul>
            </section>
          ) : null}

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
                      <button type="button" disabled={onOpenEvidence === undefined} onClick={() => onOpenEvidence?.(link.evidenceId)}
                        className="min-h-10 text-left font-mono text-xs break-all text-[var(--signal-cyan)] underline disabled:no-underline">
                        Read {link.evidenceId}
                      </button>
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
                    <p className="font-mono text-xs break-all text-[var(--paper-light)]">{job.jobId}</p>
                    <p className="mt-1 text-sm text-[var(--muted-amber)]">
                      {job.kind} · {job.state}
                    </p>
                    {job.message === undefined ? null : <p className="mt-1 text-sm text-[var(--paper-light)]">{job.message}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={!actionsAvailable || !job.retryable || onRetryJob === undefined}
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
      <dd className="min-w-0 break-all text-right font-mono text-[var(--paper-light)]">{value}</dd>
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
    return "No ingestion workspace connected";
  }
  return loadState === "error" ? "Ingestion runtime unavailable" : "Awaiting local ingestion runtime";
}

function approveRawImportInput(review: NonNullable<IngestionWorkspaceDto["review"]>): ApproveRawImportInput | undefined {
  if (!review.approvalRequired || review.latestScanBatchId === undefined) {
    return undefined;
  }

  return {
    sourceCollectionId: review.sourceCollectionId,
    scanBatchId: review.latestScanBatchId,
    importBatchId: `imp_${crypto.randomUUID()}`,
    approvedBy: uiActorId
  };
}

function importApprovedInput(review: NonNullable<IngestionWorkspaceDto["review"]>): ImportApprovedInput | undefined {
  const importBatchId = review.approvedImportBatchId ?? review.latestImportBatchId;
  if (
    review.latestScanBatchId === undefined ||
    review.approvalRequired ||
    importBatchId === undefined ||
    isImportCompleted(review)
  ) {
    return undefined;
  }

  return {
    sourceCollectionId: review.sourceCollectionId,
    scanBatchId: review.latestScanBatchId,
    importBatchId
  };
}

function rawImportGateState(review: NonNullable<IngestionWorkspaceDto["review"]>) {
  if (review.approvalRequired) {
    return "Human approval required";
  }
  return review.latestImportBatchId === undefined ? "Waiting for dry-run" : "Approval recorded";
}

function importExecutionGateState(review: NonNullable<IngestionWorkspaceDto["review"]>) {
  if (isImportCompleted(review)) {
    return "Imported evidence ready";
  }
  if (review.approvalRequired) return "Waiting for approval";
  return review.approvedImportBatchId ?? review.latestImportBatchId ?? "Waiting for approval";
}

function isImportCompleted(review: NonNullable<IngestionWorkspaceDto["review"]>) {
  return review.importCompleted ?? (!review.approvalRequired && review.evidenceLinks.length > 0);
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
