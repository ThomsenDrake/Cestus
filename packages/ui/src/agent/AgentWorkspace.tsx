import type {
  AgentApprovalCockpitDto,
  AgentCockpitDto,
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  RecordMemoryInput,
  RetractMemoryInput,
  SupersedeMemoryInput,
  AgentStatusDto,
  CreateAgentTaskInput,
  OntologyBootstrapRouteDto
} from "./agent-types.js";
import { providerSetupCardsFromReadiness } from "./provider-setup-cards.js";
import type {
  ApproveToolRequestInput,
  DenyToolRequestInput
} from "./agent-adapter.js";
import { AgentApprovalCockpit } from "./AgentApprovalCockpit.js";
import { AgentMemoryPanel } from "./AgentMemoryPanel.js";
import { AgentRunCockpit } from "./AgentRunCockpit.js";
import { AgentTaskComposer } from "./AgentTaskComposer.js";

interface AgentWorkspaceProps {
  readonly cockpit?: AgentCockpitDto | undefined;
  readonly status: AgentStatusDto | undefined;
  readonly approvalCockpit?: AgentApprovalCockpitDto | undefined;
  readonly memoryList?: AgentMemoryListDto | undefined;
  readonly memoryDetail?: AgentMemoryDetailDto | undefined;
  readonly decisionState?: "idle" | "submitting" | "error" | undefined;
  readonly ontologyBootstrapRoutes?: readonly OntologyBootstrapRouteDto[] | undefined;
  readonly loadState: "idle" | "loading" | "loaded" | "error";
  readonly loadError?: string | undefined;
  readonly onRefresh?: (() => void) | undefined;
  readonly onCreateTask?: ((input: CreateAgentTaskInput) => Promise<unknown>) | undefined;
  readonly onMemoryFilterChange?: ((filters: AgentMemoryFiltersDto) => void) | undefined;
  readonly onSelectMemory?: ((memoryId: string) => void) | undefined;
  readonly onRecordMemory?: ((input: RecordMemoryInput) => void) | undefined;
  readonly onSupersedeMemory?: ((input: SupersedeMemoryInput) => void) | undefined;
  readonly onRetractMemory?: ((input: RetractMemoryInput) => void) | undefined;
  readonly onApproveToolRequest?: ((input: ApproveToolRequestInput) => void) | undefined;
  readonly onDenyToolRequest?: ((input: DenyToolRequestInput) => void) | undefined;
}

export function AgentWorkspace({
  cockpit,
  status,
  approvalCockpit,
  memoryList,
  memoryDetail,
  decisionState = "idle",
  ontologyBootstrapRoutes = [],
  loadState,
  onRefresh,
  onCreateTask,
  onMemoryFilterChange,
  onSelectMemory,
  onRecordMemory,
  onSupersedeMemory,
  onRetractMemory,
  onApproveToolRequest,
  onDenyToolRequest
}: AgentWorkspaceProps) {
  const identity = status?.identity;
  const activeLocks = status?.locks.filter((lock) => lock.state === "active") ?? [];
  const requestedTools = status?.toolRequests.filter((request) => request.state === "requested") ?? [];
  const runsById = new Map((status?.runs ?? []).map((run) => [run.runId, run]));
  const providerReadinessCards = status?.providerReadiness === undefined
    ? []
    : providerSetupCardsFromReadiness(status.providerReadiness);
  const ontologyBootstrapRuns = status?.runs.filter((run) => run.runType === "ontology-bootstrap") ?? [];
  const ontologyRoutesByRunId = new Map(ontologyBootstrapRoutes.map((route) => [route.runId, route]));

  return (
    <section aria-label="Resident agent workspace" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Resident identity</p>
          <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Agent</h1>
          <p className="mt-2 max-w-3xl text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            {identity === undefined ? "Resident agent status is loading from the local runtime." : identity.label}
          </p>
        </div>
        {onRefresh === undefined ? null : (
          <button
            type="button"
            onClick={onRefresh}
            className="relative min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] sm:min-h-9 sm:text-sm"
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            Refresh agent status
          </button>
        )}
      </div>

      {loadState === "loading" || loadState === "idle" ? (
        <section aria-label="Agent loading state" className="border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading resident agent</p>
          <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            Reading browser-safe agent-status.v1 from the local runtime.
          </p>
        </section>
      ) : null}

      {loadState === "error" ? (
        <section aria-label="Agent load error" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
          <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Agent unavailable</p>
          <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
            Agent workspace could not be loaded.
          </p>
        </section>
      ) : null}

      {status === undefined ? null : (
        <>
          {cockpit === undefined ? null : (
            <AgentTaskComposer
              cockpit={cockpit}
              status={status}
              onCreateTask={onCreateTask}
              onRefresh={onRefresh}
            />
          )}

          {cockpit === undefined ? null : <AgentRunCockpit cockpit={cockpit} />}

          <div className="grid gap-3 md:grid-cols-5">
            <SummaryMetric label="Pending" value={countLabel(status.pendingApprovalCount, "pending approval")} />
            <SummaryMetric label="Locks" value={countLabel(status.activeLockCount, "active lock")} />
            <SummaryMetric label="Providers" value={countLabel(status.providers.length, "provider")} />
            <SummaryMetric label="Tasks" value={countLabel(status.tasks.length, "task")} />
            <SummaryMetric label="Memory" value={countLabel(status.activeMemory.length, "memory item")} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
            <section aria-label="Resident agent identity" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Identity" meta={status.schemaVersion} />
              <dl className="divide-y divide-[var(--console-line)]">
                <StatRow label="Resident" value={identity?.residentAgentId ?? status.residentAgentId ?? "agent status unavailable"} />
                <StatRow label="Workspace" value={identity?.workspaceId ?? "workspace not reported"} />
                <StatRow label="Policy" value={identity?.policyId ?? "policy not reported"} />
                <StatRow label="Run types" value={identity?.allowedRunTypes.join(", ") || "no run types reported"} />
              </dl>
            </section>

            <section aria-label="Active locks" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Active locks" meta={countLabel(activeLocks.length, "active lock")} />
              {activeLocks.length > 0 ? (
                <ul role="list" className="divide-y divide-[var(--console-line)]">
                  {activeLocks.map((lock) => (
                    <li key={lock.lockId} className="grid gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{lock.kind}</p>
                        <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">{lock.reason}</p>
                      </div>
                      <ProvenanceRefs refs={[...lock.eventIds, ...lock.relatedEventIds]} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>No active locks reported.</EmptyState>
              )}
            </section>
          </div>

          {approvalCockpit === undefined ? null : (
            <AgentApprovalCockpit
              cockpit={approvalCockpit}
              decisionState={decisionState}
              onApprove={onApproveToolRequest}
              onDeny={onDenyToolRequest}
            />
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <section aria-label="Agent providers" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Providers" meta={countLabel(status.providers.length, "provider")} />
              {status.providers.length > 0 ? (
                <ul role="list" className="divide-y divide-[var(--console-line)]">
                  {status.providers.map((provider) => (
                    <li key={provider.providerId} className="grid gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{provider.label}</p>
                        <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">{provider.providerId}</p>
                      </div>
                      <dl className="grid gap-2 md:grid-cols-3">
                        <InlineStat label="Endpoint" value={provider.endpointKind} />
                        <InlineStat label="Models" value={provider.modelFamilies.join(", ")} />
                        <InlineStat label="Credentials" value={provider.credentialKinds.join(", ")} />
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>No providers reported.</EmptyState>
              )}
            </section>

            <section aria-label="Provider readiness" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader
                title="Provider readiness"
                meta={status.providerReadiness?.schemaVersion ?? "not reported"}
              />
              {providerReadinessCards.length > 0 ? (
                <ul role="list" className="divide-y divide-[var(--console-line)]">
                  {providerReadinessCards.map((card) => (
                    <li key={card.providerId} className="grid gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{card.label}</p>
                        <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">{card.providerId}</p>
                      </div>
                      <dl className="grid gap-2 md:grid-cols-3">
                        <InlineStat label="State" value={card.state} />
                        <InlineStat label="Health" value={card.credentialHealth} />
                        <InlineStat label="Data posture" value={card.dataHandlingPosture} />
                        <InlineStat label="Approval" value={card.requiredApprovalClass} />
                        <InlineStat label="Capabilities" value={card.capabilitySummary.join(", ")} />
                        <InlineStat label="Actions" value={card.safeActionIds.join(", ") || "no action"} />
                        {card.credentialRefId === undefined ? null : (
                          <InlineStat label="Credential ref" value={card.credentialRefId} />
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>No provider readiness reported.</EmptyState>
              )}
            </section>

            <section aria-label="Agent diagnostics" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Diagnostics" meta={countLabel(status.diagnostics.length, "diagnostic")} />
              {status.diagnostics.length > 0 ? (
                <ul role="list" className="divide-y divide-[var(--console-line)]">
                  {status.diagnostics.map((diagnostic, index) => (
                    <li key={diagnostic.diagnosticId ?? `diagnostic:${index}`} className="grid gap-1 px-4 py-3">
                      <p className={`font-mono text-base sm:text-sm ${severityClassName(diagnostic.severity)}`}>
                        {diagnostic.severity} | {diagnostic.category}
                      </p>
                      <p className="text-base text-pretty text-[var(--paper-light)] sm:text-sm">{diagnostic.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>No diagnostics reported.</EmptyState>
              )}
            </section>
          </div>

          <section aria-label="Agent tasks" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
            <SectionHeader title="Tasks and runs" meta={countLabel(status.tasks.length, "task")} />
            {status.tasks.length > 0 ? (
              <ul role="list" className="divide-y divide-[var(--console-line)]">
                {status.tasks.map((task) => {
                  const run = task.runId === undefined ? undefined : runsById.get(task.runId);
                  return (
                    <li key={task.taskId} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.5fr)]">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{task.title}</p>
                        <p className="mt-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                          {task.taskId} | {task.status}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                          {run?.runType ?? "no run"}
                        </p>
                        <ProvenanceRefs refs={[...task.eventIds, ...task.sourceEventIds, ...(run?.eventIds ?? [])]} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No resident agent tasks reported.</EmptyState>
            )}
          </section>

          {ontologyBootstrapRuns.length > 0 ? (
            <section aria-label="Ontology bootstrap review" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
              <SectionHeader title="Ontology bootstrap" meta={countLabel(ontologyBootstrapRuns.length, "run")} />
              <ul role="list" className="divide-y divide-[var(--console-line)]">
                {ontologyBootstrapRuns.map((run) => {
                  const route = ontologyRoutesByRunId.get(run.runId);
                  const pendingForRun = status.toolRequests
                    .filter((request) => request.runId === run.runId && request.state === "requested");
                  const pendingToolRequestIds = route?.pendingApprovalToolRequestIds.length
                    ? route.pendingApprovalToolRequestIds
                    : pendingForRun.map((request) => request.toolRequestId);
                  const reviewBundleHash = route?.reviewBundleHash ?? run.outputArtifactHashes[0] ?? "review bundle pending";
                  const candidateBundleCount = route?.candidateBundleCount ?? Math.max(run.outputArtifactHashes.length - 2, 0);
                  const nextCursor = formatOntologyBootstrapCursor(route);
                  const nextAction = route?.nextSafeAction?.label ?? (pendingForRun.length > 0
                    ? "Review pending ontology bootstrap request"
                    : run.state === "completed"
                      ? "Inspect review bundle outputs"
                      : "Continue ontology bootstrap review");
                  return (
                    <li key={run.runId} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                      <div className="min-w-0">
                        <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{run.runId}</p>
                        <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
                          {run.taskId ?? "unlinked task"} | {run.state}
                        </p>
                        <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                          {reviewBundleHash}
                        </p>
                        {pendingToolRequestIds.length > 0 ? (
                          <div className="mt-2 min-w-0 space-y-1">
                            {pendingToolRequestIds.map((toolRequestId) => (
                              <p key={toolRequestId} className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">
                                {toolRequestId}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <dl className="grid gap-2">
                        <InlineStat label="Phase" value={route?.phase ?? run.runType} />
                        <InlineStat label="Candidate bundles" value={countLabel(candidateBundleCount, "candidate bundle")} />
                        <InlineStat label="Next cursor" value={nextCursor} />
                        <InlineStat label="Next action" value={nextAction} />
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-label="Agent tool requests" className="border border-[var(--console-line)] bg-[var(--console-panel)]">
            <SectionHeader
              title={approvalCockpit === undefined ? "Tool requests" : "Tool request ledger"}
              meta={countLabel(requestedTools.length, "pending approval")}
            />
            {status.toolRequests.length > 0 ? (
              <ul role="list" className="divide-y divide-[var(--console-line)]">
                {status.toolRequests.map((request) => (
                  <li key={request.toolRequestId} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.6fr)]">
                    <div className="min-w-0">
                      <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">{request.toolRequestId}</p>
                      <p className="mt-1 text-base text-pretty text-[var(--paper-light)] sm:text-sm">{request.estimatedEffect}</p>
                      <p className="mt-1 break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{request.previewHash}</p>
                    </div>
                    <dl className="grid gap-2">
                      <InlineStat label="Side effect" value={request.sideEffectClass} />
                      <InlineStat label="Approval" value={request.requiredApprovalClass} />
                      <InlineStat label="State" value={request.state} />
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No tool requests reported.</EmptyState>
            )}
          </section>

          <AgentMemoryPanel
            memoryList={memoryList}
            memoryDetail={memoryDetail}
            loadState={loadState}
            onFilterChange={onMemoryFilterChange}
            onSelectMemory={onSelectMemory}
            onRecordMemory={onRecordMemory}
            onSupersedeMemory={onSupersedeMemory}
            onRetractMemory={onRetractMemory}
          />
        </>
      )}
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
      <h2 className="text-base font-semibold text-balance text-[var(--paper-light)]">{title}</h2>
      <p className="truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">{meta}</p>
    </div>
  );
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-base font-medium text-[var(--paper-light)] sm:text-sm">{label}</dt>
      <dd className="min-w-0 break-words text-base text-[var(--muted-amber)] sm:text-sm">{value}</dd>
    </div>
  );
}

function InlineStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-base text-[var(--muted-amber)] sm:text-sm">{label}</dt>
      <dd className="mt-1 break-words text-base text-[var(--paper-light)] sm:text-sm">{value}</dd>
    </div>
  );
}

function ProvenanceRefs({ refs }: { readonly refs: readonly string[] }) {
  const visibleRefs = [...new Set(refs)].slice(0, 4);
  if (visibleRefs.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-1">
      {visibleRefs.map((ref) => (
        <p key={ref} className="break-all font-mono text-base text-[var(--signal-cyan)] sm:text-sm">{ref}</p>
      ))}
    </div>
  );
}

function EmptyState({ children }: { readonly children: string }) {
  return <p className="px-4 py-3 text-base text-[var(--muted-amber)] sm:text-sm">{children}</p>;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatOntologyBootstrapCursor(route: OntologyBootstrapRouteDto | undefined): string {
  if (route?.nextCursor === undefined) {
    return "not reported";
  }
  if (route.nextCursor.nextOffset === undefined) {
    return `${route.nextCursor.totalCandidates} candidates complete`;
  }
  return `${route.nextCursor.nextOffset} of ${route.nextCursor.totalCandidates}`;
}

function severityClassName(severity: AgentStatusDto["diagnostics"][number]["severity"]): string {
  if (severity === "error") {
    return "text-[var(--signal-red)]";
  }
  if (severity === "warning") {
    return "text-[var(--signal-amber)]";
  }
  return "text-[var(--signal-cyan)]";
}
