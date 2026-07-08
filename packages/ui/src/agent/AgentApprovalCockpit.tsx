import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowPathIcon, CheckCircleIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import type {
  ApproveToolRequestInput,
  DenyToolRequestInput
} from "./agent-adapter.js";
import type {
  AgentApprovalCockpitDto
} from "./agent-types.js";

type DecisionState = "idle" | "submitting" | "error";
type QueueBucketName = "pending" | "blocked" | "stale" | "resumable" | "denied" | "completed" | "failed";
type CockpitEntry = {
  readonly bucket: QueueBucketName;
  readonly item: AgentApprovalCockpitDto["queue"]["pending"][number];
};

interface AgentApprovalCockpitProps {
  readonly cockpit: AgentApprovalCockpitDto;
  readonly decisionState: DecisionState;
  readonly onApprove?: ((input: ApproveToolRequestInput) => void) | undefined;
  readonly onDeny?: ((input: DenyToolRequestInput) => void) | undefined;
}

const visibleQueueOrder: readonly QueueBucketName[] = [
  "pending",
  "blocked",
  "stale",
  "resumable",
  "denied",
  "completed",
  "failed"
];

export function AgentApprovalCockpit({
  cockpit,
  decisionState,
  onApprove,
  onDeny
}: AgentApprovalCockpitProps) {
  const entries = useMemo(
    () =>
      visibleQueueOrder.flatMap((bucket) =>
        cockpit.queue[bucket].map((item): CockpitEntry => ({ bucket, item }))
      ),
    [cockpit]
  );
  const [selectedToolRequestId, setSelectedToolRequestId] = useState<string | undefined>(
    entries[0]?.item.toolRequestId
  );
  const [rationale, setRationale] = useState("");

  useEffect(() => {
    const nextDefault = entries[0]?.item.toolRequestId;
    if (nextDefault === undefined) {
      setSelectedToolRequestId(undefined);
      return;
    }
    if (selectedToolRequestId === undefined || !entries.some((entry) => entry.item.toolRequestId === selectedToolRequestId)) {
      setSelectedToolRequestId(nextDefault);
    }
  }, [entries, selectedToolRequestId]);

  useEffect(() => {
    setRationale("");
  }, [selectedToolRequestId]);

  const selectedEntry = entries.find((entry) => entry.item.toolRequestId === selectedToolRequestId) ?? entries[0];
  const selectedItem = selectedEntry?.item;
  const selectedBucket = selectedEntry?.bucket;
  const isTerminal = selectedEntry === undefined
    ? true
    : selectedEntry.bucket === "denied" || selectedEntry.bucket === "completed" || selectedEntry.bucket === "failed";
  const isBlockedBucket = selectedBucket === "blocked";
  const isStaleBucket = selectedBucket === "stale";
  const hasActiveLocks = (selectedItem?.activeLocks.length ?? 0) > 0;
  const hasBlockingReasons = (selectedItem?.blockingReasons.length ?? 0) > 0;
  const hasStaleState = selectedItem?.stale === true || selectedItem?.staleness.state === "stale";
  const detailAffectedRefs = selectedItem === undefined
    ? []
    : selectedItem.affectedRefs.filter((ref) => !selectedItem.review.evidenceRefs.some(
      (evidenceRef) => evidenceRef.kind === ref.kind && evidenceRef.id === ref.id
    ) && !selectedItem.review.artifactRefs.some(
      (artifactRef) => artifactRef.kind === ref.kind && artifactRef.id === ref.id
    ));
  const rationaleMissing = rationale.trim().length === 0;
  const approvalDisabled = selectedItem === undefined
    || isTerminal
    || isBlockedBucket
    || isStaleBucket
    || hasStaleState
    || selectedItem.staleness.approvable === false
    || hasActiveLocks
    || hasBlockingReasons
    || rationaleMissing
    || onApprove === undefined
    || decisionState === "submitting";
  const denialDisabled = selectedItem === undefined
    || isTerminal
    || rationaleMissing
    || onDeny === undefined
    || decisionState === "submitting";

  return (
    <section aria-label="Agent approval cockpit" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <SummaryMetric label="Pending" value={countLabel(cockpit.summary.pendingCount, "request")} />
        <SummaryMetric label="Blocked" value={countLabel(cockpit.summary.blockedCount, "request")} />
        <SummaryMetric label="Stale" value={countLabel(cockpit.summary.staleCount, "request")} />
        <SummaryMetric label="Resumable" value={countLabel(cockpit.summary.resumableCount, "request")} />
        <SummaryMetric label="Terminal" value={countLabel(cockpit.summary.terminalCount, "request")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <section aria-label="Approval queue" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <SectionHeader title="Approval queue" meta={countLabel(entries.length, "visible request")} />
          {entries.length === 0 ? (
            <EmptyState>No approval requests are currently visible.</EmptyState>
          ) : (
            <ul role="list" className="divide-y divide-[var(--console-line)]">
              {entries.map((entry) => {
                const selected = entry.item.toolRequestId === selectedItem?.toolRequestId;
                return (
                  <li key={`${entry.bucket}:${entry.item.toolRequestId}`}>
                    <button
                      type="button"
                      aria-label={`Select approval request ${entry.item.toolRequestId}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedToolRequestId(entry.item.toolRequestId)}
                      className={`w-full px-4 py-3 text-left ${selected ? "bg-[var(--console-void)]/72" : "bg-transparent"} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--signal-cyan)]`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{entry.bucket}</p>
                          <p className="mt-1 break-all text-base text-[var(--paper-light)] sm:text-sm">{entry.item.toolRequestId}</p>
                        </div>
                        <p className="shrink-0 font-mono text-base text-[var(--muted-amber)] sm:text-sm">{entry.item.staleness.state}</p>
                      </div>
                      <p className="mt-2 break-words text-base text-[var(--muted-amber)] sm:text-sm">{entry.item.previewSummary}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Approval request detail" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
          <SectionHeader
            title="Approval detail"
            meta={selectedItem?.toolRequestId ?? "no request selected"}
          />
          {selectedItem === undefined ? (
            <EmptyState>Select a request to inspect its approval contract.</EmptyState>
          ) : (
            <div className="space-y-4 px-4 py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)]">
                <div className="space-y-4">
                  <DetailSection title="Review facts">
                    <DetailRow label="What" value={selectedItem.review.what} />
                    <DetailRow label="Why" value={selectedItem.review.why} />
                    <DetailRow label="What data leaves or changes" value={selectedItem.review.dataLeavesOrChanges} />
                    <DetailRow label="Risk and lock status" value={selectedItem.review.riskAndLockStatus} />
                    <DetailRow label="What happens after approval" value={selectedItem.review.whatHappensAfterApproval} />
                    <DetailList label="What prevents stale or unsafe execution" values={selectedItem.review.staleOrUnsafePrevention} />
                    <DetailList
                      label="Decision contract"
                      values={[
                        selectedItem.approvalContract.afterApproval,
                        cockpit.decisionContract.afterApproval
                      ]}
                    />
                  </DetailSection>

                    <DetailSection title="Evidence and provenance">
                      <RefList label="Evidence refs" refs={selectedItem.review.evidenceRefs} />
                      <RefList label="Artifact refs" refs={selectedItem.review.artifactRefs} />
                      <RefList label="Affected refs" refs={detailAffectedRefs} />
                      <ContextPackList refs={selectedItem.contextPackRefs} />
                    </DetailSection>
                </div>

                <div className="space-y-4">
                  <DetailSection title="Approval surface">
                    <DetailRow label="Preview hash" value={selectedItem.previewHash} breakAll />
                    <DetailRow label="Required approval class" value={selectedItem.requiredApprovalClass} />
                    <DetailRow label="Side-effect class" value={selectedItem.sideEffectClass} />
                    <DetailRow label="Staleness state" value={selectedItem.staleness.state} />
                    <DetailRow label="Tool" value={`${selectedItem.toolId} @ ${selectedItem.toolVersion}`} breakAll />
                    <DetailRow label="Run" value={selectedItem.runId} breakAll />
                    <DetailRow label="Task" value={selectedItem.taskId} breakAll />
                    {selectedItem.providerByteTransferNote === undefined ? null : (
                      <DetailRow label="Provider transfer note" value={selectedItem.providerByteTransferNote} />
                    )}
                    {selectedItem.staleness.currentPreviewHash === undefined ? null : (
                      <DetailRow label="Current preview hash" value={selectedItem.staleness.currentPreviewHash} breakAll />
                    )}
                    {selectedItem.staleness.guidance === undefined ? null : (
                      <DetailRow label="Staleness guidance" value={selectedItem.staleness.guidance} />
                    )}
                    <LockList locks={selectedItem.activeLocks} />
                    <DetailList label="Blocking reasons" values={selectedItem.blockingReasons} emptyText="No blocking reasons." />
                    <TerminalDetail item={selectedItem} />
                  </DetailSection>

                  <form
                    className="space-y-3 border border-[var(--console-line)] bg-[var(--console-void)]/48 p-3"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <label className="grid gap-2">
                      <span className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Decision rationale</span>
                      <textarea
                        name="decision-rationale"
                        aria-label="Decision rationale"
                        rows={4}
                        value={rationale}
                        onChange={(event) => setRationale(event.currentTarget.value)}
                        className="min-h-28 w-full resize-y border border-[var(--console-line)] bg-[var(--command-black)] px-3 py-2 text-base text-[var(--paper-light)] outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={approvalDisabled}
                        onClick={() => {
                          if (selectedItem === undefined || approvalDisabled) {
                            return;
                          }
                          onApprove?.({
                            toolRequestId: selectedItem.toolRequestId,
                            approvedPreviewHash: selectedItem.previewHash,
                            rationale: rationale.trim()
                          });
                        }}
                        className="relative inline-flex min-h-10 items-center gap-2 border border-[var(--signal-green)] px-3 py-2 text-base text-[var(--signal-green)] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9 sm:text-sm"
                      >
                        {decisionState === "submitting" ? (
                          <ArrowPathIcon aria-hidden="true" className="size-4 animate-spin" />
                        ) : (
                          <CheckCircleIcon aria-hidden="true" className="size-4" />
                        )}
                        Approve exact preview
                      </button>
                      <button
                        type="button"
                        disabled={denialDisabled}
                        onClick={() => {
                          if (selectedItem === undefined || denialDisabled) {
                            return;
                          }
                          onDeny?.({
                            toolRequestId: selectedItem.toolRequestId,
                            rationale: rationale.trim()
                          });
                        }}
                        className="relative inline-flex min-h-10 items-center gap-2 border border-[var(--signal-red)] px-3 py-2 text-base text-[var(--signal-red)] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9 sm:text-sm"
                      >
                        <NoSymbolIcon aria-hidden="true" className="size-4" />
                        Deny request
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
      <div className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums text-[var(--paper-light)]">{value}</div>
    </div>
  );
}

function SectionHeader({ title, meta }: { readonly title: string; readonly meta: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-[var(--console-line)] px-4 py-3 md:flex-row md:items-center md:justify-between">
      <h2 className="text-base font-semibold text-[var(--paper-light)]">{title}</h2>
      <p className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{meta}</p>
    </div>
  );
}

function DetailSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="border border-[var(--console-line)] bg-[var(--console-void)]/32 p-3">
      <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function DetailRow(
  {
    label,
    value,
    breakAll = false
  }: {
    readonly label: string;
    readonly value: string;
    readonly breakAll?: boolean | undefined;
  }
) {
  return (
    <div className="grid gap-1">
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</p>
      <p className={`${breakAll ? "break-all" : "break-words"} text-base text-[var(--paper-light)] sm:text-sm`}>{value}</p>
    </div>
  );
}

function DetailList(
  {
    label,
    values,
    emptyText = "None recorded."
  }: {
    readonly label: string;
    readonly values: readonly string[];
    readonly emptyText?: string | undefined;
  }
) {
  return (
    <div className="grid gap-2">
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</p>
      {values.length === 0 ? (
        <p className="text-base text-[var(--muted-amber)] sm:text-sm">{emptyText}</p>
      ) : (
        <ul role="list" className="space-y-2">
          {values.map((value) => (
            <li key={value} className="break-words text-base text-[var(--paper-light)] sm:text-sm">{value}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RefList(
  {
    label,
    refs
  }: {
    readonly label: string;
    readonly refs: readonly { readonly kind: string; readonly id: string; readonly hash?: string | undefined; readonly label?: string | undefined }[];
  }
) {
  return (
    <div className="grid gap-2">
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</p>
      {refs.length === 0 ? (
        <p className="text-base text-[var(--muted-amber)] sm:text-sm">None recorded.</p>
      ) : (
        <ul role="list" className="space-y-2">
          {refs.map((ref) => (
            <li key={`${ref.kind}:${ref.id}`} className="grid gap-1">
              <p className="font-mono text-base text-[var(--paper-light)] sm:text-sm">{ref.kind}</p>
              <p className="break-all text-base text-[var(--signal-cyan)] sm:text-sm">{ref.id}</p>
              {ref.label === undefined ? null : (
                <p className="break-words text-base text-[var(--muted-amber)] sm:text-sm">{ref.label}</p>
              )}
              {ref.hash === undefined ? null : (
                <p className="break-all text-base text-[var(--muted-amber)] sm:text-sm">{ref.hash}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContextPackList({
  refs
}: {
  readonly refs: readonly {
    readonly contextPackId: string;
    readonly version: number;
    readonly contentHash: string;
    readonly sizeBytes: number;
    readonly generatedAt: string;
    readonly safeSummary: string;
    readonly provenanceRefs: readonly string[];
    readonly projectionHighWaterMark?: number | undefined;
  }[];
}) {
  if (refs.length === 0) {
    return <DetailList label="Context packs" values={[]} emptyText="No context packs recorded." />;
  }

  return (
    <div className="grid gap-2">
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Context packs</p>
      <ul role="list" className="space-y-2">
        {refs.map((ref) => (
          <li key={`${ref.contextPackId}:${ref.version}`} className="grid gap-1">
            <p className="break-all text-base text-[var(--paper-light)] sm:text-sm">{ref.contextPackId}</p>
            <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">v{ref.version}</p>
            <p className="break-words text-base text-[var(--muted-amber)] sm:text-sm">{ref.safeSummary}</p>
            <p className="break-all text-base text-[var(--muted-amber)] sm:text-sm">{ref.contentHash}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LockList({
  locks
}: {
  readonly locks: readonly { readonly lockId: string; readonly category: string; readonly message: string }[];
}) {
  if (locks.length === 0) {
    return <DetailList label="Active locks" values={[]} emptyText="No active locks." />;
  }

  return (
    <div className="grid gap-2">
      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">Active locks</p>
      <ul role="list" className="space-y-2">
        {locks.map((lock) => (
          <li key={lock.lockId} className="grid gap-1">
            <p className="break-all text-base text-[var(--paper-light)] sm:text-sm">{lock.lockId}</p>
            <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">{lock.category}</p>
            <p className="break-words text-base text-[var(--muted-amber)] sm:text-sm">{lock.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TerminalDetail({
  item
}: {
  readonly item: AgentApprovalCockpitDto["queue"]["pending"][number];
}) {
  const values: string[] = [];

  if (item.approval !== undefined) {
    values.push(`Approved by ${item.approval.approvedBy} at ${item.approval.approvedAt}.`);
  }
  if (item.denial !== undefined) {
    values.push(`Denied by ${item.denial.deniedBy} at ${item.denial.deniedAt}.`);
    values.push(item.denial.rationale);
  }
  if (item.completion !== undefined) {
    values.push(`Completed at ${item.completion.completedAt}.`);
    if (item.completion.resultSummary !== undefined) {
      values.push(item.completion.resultSummary);
    }
  }
  if (item.failure !== undefined) {
    values.push(`Failure category: ${item.failure.category}.`);
    values.push(item.failure.message);
  }

  return <DetailList label="Terminal decision and result details" values={values} emptyText="No terminal decision or result details." />;
}

function EmptyState({ children }: { readonly children: string }) {
  return <p className="px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">{children}</p>;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
