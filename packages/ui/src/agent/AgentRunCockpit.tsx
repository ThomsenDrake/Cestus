import { useMemo, useState } from "react";
import type {
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
  const serverSelectedRun = cockpit.selectedRun;
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    serverSelectedRun?.runId ?? cockpit.runQueue[0]?.runId
  );
  const selectedRunSummary =
    cockpit.runQueue.find((run) => run.runId === selectedRunId) ??
    (serverSelectedRun?.runId === selectedRunId ? serverSelectedRun : undefined) ??
    cockpit.runQueue[0] ??
    serverSelectedRun;
  const selectedRunRecord = serverSelectedRun?.runId === selectedRunSummary?.runId
    ? serverSelectedRun
    : undefined;
  const activeRun = selectedRunRecord ?? selectedRunSummary;

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
      { label: "Changed", value: countLabel(selectedRunRecord?.handoff?.outputArtifacts.length ?? 0, "handoff artifact") },
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
                        <div className="min-w-0">
                          <dt className="sr-only">Selection</dt>
                          <dd>
                            <button
                              type="button"
                              aria-label={`Select run ${run.runId}`}
                              aria-pressed={selected}
                              onClick={() => setSelectedRunId(run.runId)}
                              className="min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-cyan)] sm:min-h-9 sm:text-sm"
                            >
                              Select
                            </button>
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No runs are currently queued.</EmptyState>
            )}
          </section>

          <section aria-label="Specialist workflow readiness" className="space-y-2">
            <SectionHeader
              title="Specialist readiness"
              meta={countLabel(cockpit.specialists.readiness.length, "specialist")}
            />
            {cockpit.specialists.readiness.length > 0 ? (
              <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-panel)]">
                {cockpit.specialists.readiness.map((readiness) => {
                  const descriptor = cockpit.specialists.registry.descriptors.find((candidate) =>
                    candidate.runType === readiness.runType
                  );
                  return (
                    <li key={readiness.runType} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">
                          {descriptor?.label ?? readiness.runType}
                        </p>
                        <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                          {readiness.runType} | {descriptor?.residentIdentity ?? "agent_default"}
                        </p>
                        {descriptor?.purpose === undefined ? null : (
                          <p className="mt-2 text-base text-[var(--paper-light)] sm:text-sm">{descriptor.purpose}</p>
                        )}
                        <p className="mt-2 font-mono text-base text-[var(--signal-amber)] sm:text-sm">
                          {readiness.status} | {readiness.category}
                        </p>
                        <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                          executionReady: {String(readiness.executionReady)}
                        </p>
                      </div>
                      <dl className="grid gap-2 md:grid-cols-2">
                        <InlineStat label="Contracts" value={listLabel(readiness.missingContractIds)} />
                        <InlineStat label="Missing context" value={listLabel(readiness.missingContextPackIds)} />
                        <InlineStat label="Stale context" value={listLabel(readiness.staleContextPackIds)} />
                        <InlineStat label="Projection HW" value={listLabel(readiness.missingProjectionHighWaterMarkIds)} />
                        <InlineStat label="Provenance ctx" value={listLabel(readiness.missingProvenanceContextPackIds)} />
                        <InlineStat label="Provider" value={readiness.missingProviderStates.map((state) => `${state.providerId}:${state.state}`).join(", ") || "ready"} />
                        <InlineStat label="Adapters" value={listLabel(readiness.missingAdapterFamilies)} />
                        <InlineStat label="Prompts" value={listLabel(readiness.missingPromptTemplateIds)} />
                        <InlineStat label="Approvals" value={listLabel(readiness.missingApprovalClasses)} />
                        <InlineStat label="Locks" value={listLabel(readiness.activeLockIds)} />
                        <InlineStat label="Next" value={listLabel(readiness.nextSafeActions)} />
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No specialist readiness was reported.</EmptyState>
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
                {selectedRunRecord === undefined ? (
                  <RunFallbackNotice
                    label="Active queued run"
                    run={activeRun}
                    note="Detailed selected-run fields are unavailable yet; showing the active queue run only."
                  />
                ) : null}
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
            activeRun === undefined ? (
              <EmptyState>No run is selected.</EmptyState>
            ) : (
              <>
                <RunFallbackNotice
                  label="Active queued run"
                  run={activeRun}
                  note="Detailed selected-run audit is unavailable yet; showing the active queue run only."
                />
                <EmptyState>No selected-run audit details are available yet.</EmptyState>
              </>
            )
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
                          <InlineStat label="Omissions" value={countLabel(audit.omissionCount, "omission")} />
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
                          <InlineStat label="Staleness inputs" value={countLabel(pack.stalenessInputCount, "staleness input")} />
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
            activeRun === undefined ? (
              <EmptyState>No handoff artifacts are ready for human review.</EmptyState>
            ) : (
              <>
                <RunFallbackNotice
                  label="Active queued run"
                  run={activeRun}
                  note="Detailed selected-run handoff is unavailable yet; showing the active queue run only."
                />
                <EmptyState>No selected-run handoff artifacts are available yet.</EmptyState>
              </>
            )
          ) : (
            <section className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Handoff artifacts" meta={selectedRunRecord.handoff.status} />
              <div className="space-y-4 px-4 py-4">
                <p className="text-base text-[var(--paper-light)] sm:text-sm">{selectedRunRecord.handoff.safeSummary}</p>
                <div className="space-y-2">
                  <SubsectionHeader title="Output artifacts" />
                  {selectedRunRecord.handoff.outputArtifacts.length > 0 ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.handoff.outputArtifacts.map((artifact) => (
                        <li key={artifact.artifactId} className="grid gap-2 px-4 py-2 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                          <div className="min-w-0">
                            <p className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{artifact.artifactId}</p>
                            <p className="mt-1 text-base text-[var(--paper-light)] sm:text-sm">{artifact.artifactKind} | {artifact.schemaId}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{artifact.artifactHash}</p>
                            <p className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{artifact.safeSummary}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No output artifacts were reported.</EmptyState>
                  )}
                </div>
                <div className="space-y-2">
                  <SubsectionHeader title="Context packs" />
                  {selectedRunRecord.handoff.contextPackRefs.length > 0 ? (
                    <ul role="list" className="divide-y divide-[var(--console-line)] border border-[var(--console-line)] bg-[var(--console-void)]/48">
                      {selectedRunRecord.handoff.contextPackRefs.map((pack) => (
                        <li key={`${pack.contextPackId}:${pack.contentHash}`} className="grid gap-1 px-4 py-2">
                          <p className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{pack.contextPackId}</p>
                          <p className="break-all font-mono text-base text-[var(--muted-amber)] sm:text-sm">{pack.contentHash}</p>
                          <p className="text-base text-[var(--paper-light)] sm:text-sm">{pack.safeSummary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState>No context pack refs were reported.</EmptyState>
                  )}
                </div>
                <dl className="grid gap-3 md:grid-cols-3">
                  <InlineStat label="Tool requests" value={listLabel(selectedRunRecord.handoff.toolRequestIds)} />
                  <InlineStat
                    label="Approvals"
                    value={listLabel(selectedRunRecord.handoff.approvalRequirements.map((approval) => approval.approvalClass))}
                  />
                  <InlineStat
                    label="Next safe actions"
                    value={listLabel(selectedRunRecord.handoff.nextSafeActions.map((action) => action.label))}
                  />
                </dl>
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
      <p className="break-all font-mono text-base text-[var(--muted-amber)] sm:text-sm">{meta}</p>
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

function RunFallbackNotice({
  label,
  run,
  note
}: {
  readonly label: string;
  readonly run: AgentCockpitDto["runQueue"][number];
  readonly note: string;
}) {
  return (
    <section aria-label={label} className="space-y-2 border border-[var(--console-line)] bg-[var(--console-void)]/48 px-4 py-3">
      <dl className="grid gap-2 lg:grid-cols-3">
        <DetailRow label="Run ID" value={run.runId} breakAll />
        <DetailRow label="Run type" value={run.runType} />
        <DetailRow label="State" value={run.state} />
      </dl>
      <p className="text-base text-[var(--muted-amber)] sm:text-sm">{note}</p>
    </section>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function listLabel(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
