import type { IngestionReviewDto } from "./ingestion-types.js";

interface IngestionWorkspaceProps {
  readonly review: IngestionReviewDto;
}

export function IngestionWorkspace({ review }: IngestionWorkspaceProps) {
  return (
    <section aria-label="Ingestion workspace" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Public evidence intake</p>
          <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Ingestion</h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--muted-amber)] sm:text-sm">{review.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] opacity-65 sm:text-sm"
          >
            Approve raw import
          </button>
          <button
            type="button"
            disabled
            className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--muted-amber)] opacity-55 sm:text-sm"
          >
            Approve provider parsing
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryMetric label="Observed" value={countLabel(review.totals.observedFiles, "observed file")} />
        <SummaryMetric label="Unique content" value={countLabel(review.totals.uniqueContent, "unique item")} />
        <SummaryMetric label="Estimated growth" value={formatBytes(review.totals.estimatedNewBlobBytes)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <section aria-label="Dry-run totals" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <div className="border-b border-[var(--console-line)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--paper-light)]">Dry-run review</h2>
            <p className="mt-1 font-mono text-xs text-[var(--muted-amber)]">{review.latestScanBatchId ?? "No scan batch"}</p>
          </div>
          <dl className="divide-y divide-[var(--console-line)]">
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
              state={review.approvalRequired ? "Human approval required" : "No approval required"}
            />
            <GateState label="Provider parsing" state="Disabled until provider job wiring exists" />
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
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-[var(--muted-amber)]">No duplicate content detected.</p>
          )}
        </section>

        <section aria-label="Ingestion diagnostics" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <div className="border-b border-[var(--console-line)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--paper-light)]">Diagnostics</h2>
          </div>
          {review.diagnostics.length > 0 ? (
            <ul className="divide-y divide-[var(--console-line)]">
              {review.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.severity}-${index}`} className="grid gap-1 px-4 py-3">
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

function severityClassName(severity: IngestionReviewDto["diagnostics"][number]["severity"]) {
  switch (severity) {
    case "error":
      return "text-[var(--signal-red)]";
    case "warning":
      return "text-[var(--signal-amber)]";
    case "info":
      return "text-[var(--signal-cyan)]";
  }
}
