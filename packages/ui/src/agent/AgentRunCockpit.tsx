import { useMemo, useState } from "react";
import type {
  AgentCockpitContextPackDto,
  AgentCockpitDto,
  AgentCockpitMemorySnippetDto,
  AgentCockpitModelAuditDto
} from "./agent-types.js";

type CockpitView = "Queue" | "Run" | "Audit" | "Handoff";

interface AgentRunCockpitProps {
  readonly cockpit: AgentCockpitDto;
}

const cockpitViews: readonly CockpitView[] = ["Queue", "Run", "Audit", "Handoff"];

export function AgentRunCockpit({ cockpit }: AgentRunCockpitProps) {
  const [view, setView] = useState<CockpitView>("Queue");
  const selectedRunRecord = cockpit.selectedRun;
  const activeRun = selectedRunRecord ?? cockpit.runQueue[0];

  const summary = useMemo(() => {
    const doingLabel = activeRun === undefined
      ? "No run selected"
      : `${activeRun.runType} | ${activeRun.state}`;
    return [
      { label: "Watching", value: countLabel(cockpit.taskQueue.length, "task") },
      { label: "Doing", value: doingLabel },
      {
        label: "Needs",
        value: countLabel(selectedRunRecord?.pendingApprovalIds.length ?? activeRun?.pendingApprovalCount ?? 0, "pending approval")
      },
      {
        label: "Blocked",
        value: countLabel(selectedRunRecord?.blockedReasons.length ?? activeRun?.blockedReasonCount ?? 0, "blocked reason")
      },
      { label: "Changed", value: countLabel(selectedRunRecord?.handoff?.artifactHashes.length ?? 0, "handoff artifact") },
      {
        label: "Evidence",
        value: countLabel((selectedRunRecord?.modelInvocations.length ?? activeRun?.modelInvocationCount ?? 0) + cockpit.memorySnippets.length, "evidence item")
      }
    ] as const;
  }, [activeRun, cockpit.memorySnippets.length, cockpit.taskQueue.length, selectedRunRecord]);

  return (
    <section aria-label="Agent run cockpit" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summary.map((item) => (
          <SummaryCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div role="tablist" aria-label="Agent run cockpit views" className="flex flex-wrap gap-2 border-b border-[var(--console-line)] pb-2">
        {cockpitViews.map((cockpitView) => (
          <button
            key={cockpitView}
            type="button"
            role="tab"
            aria-selected={view === cockpitView}
            onClick={() => setView(cockpitView)}
            className={`min-h-10 border px-3 py-2 text-base sm:min-h-9 sm:text-sm ${
              view === cockpitView
                ? "border-[var(--signal-cyan)] text-[var(--paper-light)]"
                : "border-[var(--console-line)] text-[var(--muted-amber)]"
            }`}
          >
            {cockpitView}
          </button>
        ))}
      </div>

      {view === "Queue" ? (
        <section aria-label="Run queue" className="space-y-4">
          <section className="space-y-2">
            <SectionHeader title="Task queue" meta={countLabel(cockpit.taskQueue.length, "task")} />
            {cockpit.taskQueue.length > 0 ? (
              <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                {cockpit.taskQueue.map((task) => (
                  <li key={task.taskId} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                    <div className="min-w-0">
                      <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{task.title}</p>
                      <p className="mt-1 break-all font-mono text-base text-[var(--signal-amber)] sm:text-sm">
                        {task.taskId}
                        {task.runId === undefined ? "" : ` | ${task.runId}`}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                        {task.priority} | {task.status}
                      </p>
                      <p className="mt-1 break-words text-base text-[var(--paper-light)] sm:text-sm">
                        {task.statusReason ?? "Task is awaiting or tracking resident work."}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No tasks are currently watching the resident.</EmptyState>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeader title="Run queue" meta={countLabel(cockpit.runQueue.length, "run")} />
            {cockpit.runQueue.length > 0 ? (
              <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                {cockpit.runQueue.map((run) => {
                  const selected = activeRun?.runId === run.runId;
                  return (
                    <li key={run.runId} className={`grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] ${selected ? "bg-[var(--console-void)]/72" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">
                          {run.runType}
                          {selected ? " | selected" : ""}
                        </p>
                        <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{run.runId}</p>
                      </div>
                      <dl className="grid gap-2 md:grid-cols-2">
                        <InlineStat label="State" value={run.state} />
                        <InlineStat label="Steps" value={countLabel(run.currentStepCount, "step")} />
                        <InlineStat label="Model audits" value={countLabel(run.modelInvocationCount, "audit")} />
                        <InlineStat label="Needs" value={countLabel(run.pendingApprovalCount, "approval")} />
                        <InlineStat label="Blocked" value={countLabel(run.blockedReasonCount, "reason")} />
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No runs are currently queued.</EmptyState>
            )}
          </section>
        </section>
      ) : null}

      {view === "Run" ? (
        <section aria-label="Selected run detail" className="space-y-4">
          {activeRun === undefined ? (
            <EmptyState>No run is selected.</EmptyState>
          ) : (
            <section className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Selected run" meta={activeRun.runId} />
              <div className="space-y-4 px-4 py-4">
                <dl className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Run type" value={activeRun.runType} />
                  <DetailRow label="State" value={activeRun.state} />
                  <DetailRow label="Task" value={activeRun.taskId ?? "unlinked task"} breakAll />
                  <DetailRow label="Started" value={activeRun.startedAt} />
                  <DetailRow label="Current steps" value={countLabel(activeRun.currentStepCount, "step")} />
                  <DetailRow label="Model audits" value={countLabel(activeRun.modelInvocationCount, "audit")} />
                  <DetailRow label="Needs" value={countLabel(selectedRunRecord?.pendingApprovalIds.length ?? activeRun.pendingApprovalCount, "approval")} />
                  <DetailRow label="Blocked" value={countLabel(selectedRunRecord?.blockedReasons.length ?? activeRun.blockedReasonCount, "reason")} />
                </dl>

                {(selectedRunRecord?.summary ?? activeRun.summary) === undefined ? null : (
                  <p className="text-base text-[var(--paper-light)] sm:text-sm">{selectedRunRecord?.summary ?? activeRun.summary}</p>
                )}

                <div className="space-y-2">
                  <SubsectionHeader title="Run steps" />
                  {selectedRunRecord?.stepIds.length ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.stepIds.map((stepId) => (
                        <li key={stepId} className="px-4 py-2 font-mono text-base text-[var(--signal-cyan)] sm:text-sm break-all">
                          {stepId}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No run steps reported.</EmptyState>
                  )}
                </div>

                <div className="space-y-2">
                  <SubsectionHeader title="Pending approvals" />
                  {selectedRunRecord?.pendingApprovalIds.length ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.pendingApprovalIds.map((approvalId) => (
                        <li key={approvalId} className="px-4 py-2">
                          <p data-approval-ref={approvalId} className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{approvalId}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No pending approvals reported for the selected run.</EmptyState>
                  )}
                </div>

                <div className="space-y-2">
                  <SubsectionHeader title="Blocked reasons" />
                  {selectedRunRecord?.blockedReasons.length ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.blockedReasons.map((blockedReason) => (
                        <li key={blockedReason} className="px-4 py-2 break-words text-base text-[var(--paper-light)] sm:text-sm">
                          {blockedReason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No blocked reasons reported for the selected run.</EmptyState>
                  )}
                </div>
              </div>
            </section>
          )}
        </section>
      ) : null}

      {view === "Audit" ? (
        <section aria-label="Selected run audit" className="space-y-4">
          {selectedRunRecord === undefined ? (
            <EmptyState>No run is selected.</EmptyState>
          ) : (
            <>
              <section className="space-y-2">
                <SectionHeader title="Model invocation audit" meta={countLabel(selectedRunRecord.modelInvocations.length, "invocation")} />
                {selectedRunRecord.modelInvocations.length > 0 ? (
                  <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                    {selectedRunRecord.modelInvocations.map((audit) => (
                      <li key={audit.invocationId} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{audit.providerId}</p>
                          <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{audit.invocationId}</p>
                        </div>
                        <dl className="grid gap-2 md:grid-cols-2">
                          <InlineStat label="Model" value={audit.modelFamily} />
                          <InlineStat label="Status" value={audit.status} />
                          <InlineStat label="Input hash" value={audit.inputArtifactHash} breakAll />
                          <InlineStat label="Output hash" value={audit.outputArtifactHash ?? "not reported"} breakAll />
                          <InlineStat label="Usage" value={audit.usageSummary ?? "usage not reported"} />
                          {audit.failureCategory === undefined ? null : <InlineStat label="Failure" value={audit.failureCategory} />}
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No model invocation audit is available for the selected run.</EmptyState>
                )}
              </section>

              <section className="space-y-2">
                <SectionHeader title="Context packs" meta={countLabel(selectedRunRecord.contextPacks.length, "pack")} />
                {selectedRunRecord.contextPacks.length > 0 ? (
                  <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                    {selectedRunRecord.contextPacks.map((pack) => (
                      <li key={`${pack.contextPackId}:${pack.contentHash}`} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{pack.contextPackId}</p>
                          <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{pack.contentHash}</p>
                          <p className="mt-2 text-base text-[var(--paper-light)] sm:text-sm">{pack.safeSummary}</p>
                        </div>
                        <dl className="grid gap-2 md:grid-cols-2">
                          <InlineStat label="Omission count" value={countLabel(contextPackOmissionCount(pack), "omission")} />
                          <InlineStat label="Staleness inputs" value={countLabel(contextPackStalenessInputCount(pack), "staleness input")} />
                          <InlineStat label="Generated" value={pack.generatedAt} />
                          <InlineStat label="Provenance refs" value={countLabel(pack.provenanceRefs.length, "ref")} />
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No context packs were summarized for the selected run.</EmptyState>
                )}
              </section>

              <section className="space-y-2">
                <SectionHeader title="Memory snippets" meta={countLabel(cockpit.memorySnippets.length, "snippet")} />
                {cockpit.memorySnippets.length > 0 ? (
                  <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                    {cockpit.memorySnippets.map((memory) => (
                      <li key={memory.memoryId} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{memory.scope}</p>
                          <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{memory.memoryId}</p>
                          <p className="mt-2 text-base text-[var(--paper-light)] sm:text-sm">{memory.summary}</p>
                        </div>
                        <dl className="grid gap-2 md:grid-cols-2">
                          <InlineStat label="Confidence" value={memory.confidence.toFixed(2)} />
                          <InlineStat label="Source refs" value={countLabel(memory.sourceEventIds.length, "ref")} />
                          <InlineStat label="Artifact hashes" value={countLabel(memory.artifactHashes.length, "hash")} />
                          <InlineStat label="Created" value={memory.createdAt} />
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No active memory snippets are reported for the selected run.</EmptyState>
                )}
              </section>
            </>
          )}
        </section>
      ) : null}

      {view === "Handoff" ? (
        <section aria-label="Selected run handoff" className="space-y-4">
          {selectedRunRecord?.handoff === undefined ? (
            <EmptyState>No handoff artifacts are ready for human review.</EmptyState>
          ) : (
            <section className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Handoff artifacts" meta={selectedRunRecord.handoff.state} />
              <div className="space-y-4 px-4 py-4">
                <p className="text-base text-[var(--paper-light)] sm:text-sm">{selectedRunRecord.handoff.summary}</p>
                <div className="space-y-2">
                  <SubsectionHeader title="Artifact hashes" />
                  <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                    {selectedRunRecord.handoff.artifactHashes.map((artifactHash) => (
                      <li key={artifactHash} className="px-4 py-2 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                        {artifactHash}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <SubsectionHeader title="Related evidence" />
                  {selectedRunRecord.handoff.relatedEventIds.length > 0 ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.handoff.relatedEventIds.map((eventId) => (
                        <li key={eventId} className="px-4 py-2 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                          {eventId}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No related evidence events were reported.</EmptyState>
                  )}
                </div>
              </div>
            </section>
          )}
        </section>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 border border-[var(--console-line)] bg-[var(--console-panel)] px-3 py-2">
      <div className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</div>
      <div className="mt-1 break-words font-mono text-base text-[var(--paper-light)] sm:text-sm">{value}</div>
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

function SubsectionHeader({ title }: { readonly title: string }) {
  return <h3 className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{title}</h3>;
}

function DetailRow({
  label,
  value,
  breakAll = false
}: {
  readonly label: string;
  readonly value: string;
  readonly breakAll?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{label}</dt>
      <dd className={`min-w-0 text-base text-[var(--muted-amber)] sm:text-sm ${breakAll ? "break-all" : "break-words"}`}>{value}</dd>
    </div>
  );
}

function InlineStat({ label, value, breakAll = false }: { readonly label: string; readonly value: string; readonly breakAll?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</dt>
      <dd className={`mt-1 text-base text-[var(--paper-light)] sm:text-sm ${breakAll ? "break-all" : "break-words"}`}>{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { readonly children: string }) {
  return <p className="border border-[var(--console-line)] bg-[var(--console-void)]/48 px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">{children}</p>;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function contextPackStalenessInputCount(pack: AgentCockpitContextPackDto): number {
  return (pack.sourceEventIds?.length ?? 0) + (pack.artifactHashes?.length ?? 0);
}

function contextPackOmissionCount(pack: AgentCockpitContextPackDto): number {
  return Math.max(pack.provenanceRefs.length - contextPackStalenessInputCount(pack), 0);
}
