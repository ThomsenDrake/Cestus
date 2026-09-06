import { useEffect, useMemo, useRef, useState } from "react";
import { buildCommandBoardViewModel, getSelectedCommandItem } from "./workspace/command-model.js";
import {
  buildCommandBoardInputFromRuntime,
  type CommandRuntimeSource
} from "./workspace/command-runtime.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { AgentWorkspace } from "./agent/AgentWorkspace.js";
import {
  httpAgentAdapter,
  safeAgentText,
  runtimeUnavailableAgentStatus,
  type AgentAdapter
} from "./agent/agent-adapter.js";
import type {
  AgentApprovalCockpitDto,
  AgentCockpitDto,
  AgentMemoryDetailDto,
  AgentMemoryFiltersDto,
  AgentMemoryListDto,
  AgentStatusDto,
  OntologyBootstrapRouteDto,
  CreateAgentTaskInput
} from "./agent/agent-types.js";
import { IngestionWorkspace } from "./ingestion/IngestionWorkspace.js";
import {
  httpIngestionWorkspaceAdapter,
  type IngestionWorkspaceAdapter
} from "./ingestion/ingestion-adapter.js";
import type {
  ApproveRawImportInput,
  DryRunScanInput,
  RegisterSourceInput,
  LoadIngestionReviewInput,
  ListIngestionJobsInput,
  IngestionSourceDto,
  ImportApprovedInput,
  IngestionActionResult,
  IngestionJobActionResult,
  IngestionJobDto,
  IngestionRuntimeDiagnosticDto,
  IngestionWorkspaceDto,
  RetryIngestionJobInput
} from "./ingestion/ingestion-types.js";
import { EvidenceWorkspace } from "./evidence/EvidenceWorkspace.js";
import {
  httpEvidenceWorkspaceAdapter,
  type EvidenceWorkspaceAdapter
} from "./evidence/evidence-adapter.js";
import type {
  EvidenceWorkspaceDto,
  PrepareEvidenceAssertionCandidateInput
} from "./evidence/evidence-types.js";
import type { AppendGovernanceReviewInput } from "./governance/governance-types.js";
import { SharedOntologyWorkspace } from "./ontology/SharedOntologyWorkspace.js";
import { OntologyWorkspace } from "./ontology/OntologyWorkspace.js";
import {
  httpOntologyWorkspaceAdapter,
  type OntologyWorkspaceAdapter
} from "./ontology/ontology-adapter.js";
import type { OntologyWorkspaceDto } from "./ontology/ontology-types.js";
import {
  httpRequestsAdapter,
  type RequestsCreateDraftInput,
  type RequestsWorkspaceAdapter
} from "./requests/request-adapter.js";
import { OperatorCockpit } from "./operator-status/OperatorCockpit.js";
import {
  httpOperatorStatusAdapter,
  runtimeUnavailableStatus,
  type OperatorStatusAdapter
} from "./operator-status/operator-status-adapter.js";
import type { OperatorSafeActionDto, OperatorStatusDto } from "./operator-status/operator-status-types.js";
import { RequestBuilder } from "./requests/RequestBuilder.js";
import { RequestDetailModal } from "./requests/RequestDetailModal.js";
import { buildPrrBuilderModel, getSelectedPrrRequest } from "./requests/request-model.js";
import { RequestWorkspace } from "./requests/RequestWorkspace.js";
import { RequestWorkspaceIntelligenceRail } from "./requests/RequestWorkspaceIntelligenceRail.js";
import type { PrrWorkspaceData, PrrWorkspaceViewContext } from "./requests/request-types.js";
import { LocalWorkspaceStatus } from "./workspace/LocalWorkspaceStatus.js";
import { CommandDashboard } from "./workspace/CommandDashboard.js";
import { DecisionRail } from "./workspace/DecisionRail.js";
import { OpsShell } from "./workspace/OpsShell.js";
import { workspaceModules } from "./workspace/workspace-nav.js";
import { safeCommandText } from "./workspace/command-safety.js";

const implementedModuleIds = new Set(["command", "requests"]);
implementedModuleIds.add("ingestion");
implementedModuleIds.add("agents");
implementedModuleIds.add("ontology");
implementedModuleIds.add("evidence");

interface AppProps {
  readonly requestsAdapter?: RequestsWorkspaceAdapter;
  readonly ingestionAdapter?: IngestionWorkspaceAdapter;
  readonly evidenceAdapter?: EvidenceWorkspaceAdapter;
  readonly operatorStatusAdapter?: OperatorStatusAdapter;
  readonly agentAdapter?: AgentAdapter;
  readonly ontologyAdapter?: OntologyWorkspaceAdapter;
  readonly now?: (() => string) | undefined;
}

const systemNow = () => new Date().toISOString();

function evidenceIdFromHash(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return /^#evidence\/(ev_[a-zA-Z0-9_-]+)(?:\/[^/]+(?:\/\d+)?)?$/.exec(window.location.hash)?.[1];
}

export function App({
  requestsAdapter = httpRequestsAdapter,
  ingestionAdapter = httpIngestionWorkspaceAdapter,
  evidenceAdapter = httpEvidenceWorkspaceAdapter,
  operatorStatusAdapter = httpOperatorStatusAdapter,
  agentAdapter = httpAgentAdapter,
  ontologyAdapter = httpOntologyWorkspaceAdapter,
  now = systemNow
}: AppProps = {}) {
  const [commandOpenedAt] = useState(() => now());
  const [activeModuleId, setActiveModuleId] = useState(() => evidenceIdFromHash() === undefined ? "command" : "evidence");
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [reviewedItemIds, setReviewedItemIds] = useState<readonly string[]>([]);
  const [selectedPrrRequestId, setSelectedPrrRequestId] = useState<string | undefined>();
  const [requestBuilderOpen, setRequestBuilderOpen] = useState(false);
  const [requestDetailModalOpen, setRequestDetailModalOpen] = useState(false);
  const [requestsViewContext, setRequestsViewContext] = useState<PrrWorkspaceViewContext>({
    savedViewId: "all-active",
    viewMode: undefined
  });
  const [requestsWorkspace, setRequestsWorkspace] = useState<PrrWorkspaceData | undefined>();
  const [loadedRequestsAdapter, setLoadedRequestsAdapter] = useState<RequestsWorkspaceAdapter | undefined>();
  const [requestsLoadState, setRequestsLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [requestsLoadError, setRequestsLoadError] = useState<string | undefined>();
  const [requestsReloadKey, setRequestsReloadKey] = useState(0);
  const [requestBuilderSubmitting, setRequestBuilderSubmitting] = useState(false);
  const [requestBuilderDiagnostic, setRequestBuilderDiagnostic] = useState<string | undefined>();
  const [pendingRequestBuilderOpen, setPendingRequestBuilderOpen] = useState(false);
  const [ingestionWorkspace, setIngestionWorkspace] = useState<IngestionWorkspaceDto | undefined>();
  const [loadedIngestionAdapter, setLoadedIngestionAdapter] = useState<IngestionWorkspaceAdapter | undefined>();
  const [ingestionLoadState, setIngestionLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [ingestionLoadError, setIngestionLoadError] = useState<string | undefined>();
  const [ingestionReloadKey, setIngestionReloadKey] = useState(0);
  const [ingestionSources, setIngestionSources] = useState<readonly IngestionSourceDto[]>([]);
  const [ingestionBusy, setIngestionBusy] = useState(false);
  const ingestionActionPending = useRef(false);
  const [initialEvidenceId, setInitialEvidenceId] = useState(evidenceIdFromHash);
  useEffect(() => {
    function followEvidenceCitation() {
      const evidenceId = evidenceIdFromHash();
      if (evidenceId === undefined) return;
      setInitialEvidenceId(evidenceId);
      setActiveModuleId("evidence");
    }
    window.addEventListener("hashchange", followEvidenceCitation);
    return () => window.removeEventListener("hashchange", followEvidenceCitation);
  }, []);
  const [ingestionJobs, setIngestionJobs] = useState<readonly IngestionJobDto[]>([]);
  const [ingestionDiagnostics, setIngestionDiagnostics] = useState<readonly IngestionRuntimeDiagnosticDto[]>([]);
  const [evidenceWorkspace, setEvidenceWorkspace] = useState<EvidenceWorkspaceDto | undefined>();
  const [loadedEvidenceAdapter, setLoadedEvidenceAdapter] = useState<EvidenceWorkspaceAdapter | undefined>();
  const [evidenceLoadState, setEvidenceLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [evidenceLoadError, setEvidenceLoadError] = useState<string | undefined>();
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [ontologyWorkspace, setOntologyWorkspace] = useState<OntologyWorkspaceDto | undefined>();
  const [loadedOntologyAdapter, setLoadedOntologyAdapter] = useState<OntologyWorkspaceAdapter | undefined>();
  const [ontologyLoadState, setOntologyLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [ontologyLoadError, setOntologyLoadError] = useState<string | undefined>();
  const [ontologyReloadKey, setOntologyReloadKey] = useState(0);
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatusDto | undefined>();
  const [loadedOperatorStatusAdapter, setLoadedOperatorStatusAdapter] = useState<OperatorStatusAdapter | undefined>();
  const [operatorStatusReloadKey, setOperatorStatusReloadKey] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentStatusDto | undefined>();
  const [agentCockpit, setAgentCockpit] = useState<AgentCockpitDto | undefined>();
  const [agentApprovalCockpit, setAgentApprovalCockpit] = useState<AgentApprovalCockpitDto | undefined>();
  const [agentMemoryList, setAgentMemoryList] = useState<AgentMemoryListDto | undefined>();
  const [agentMemoryDetail, setAgentMemoryDetail] = useState<AgentMemoryDetailDto | undefined>();
  const [agentMemoryFilters, setAgentMemoryFilters] = useState<AgentMemoryFiltersDto>({
    scope: "all",
    state: "all"
  });
  const [selectedAgentMemoryId, setSelectedAgentMemoryId] = useState<string | undefined>();
  const [agentApprovalDecisionState, setAgentApprovalDecisionState] = useState<"idle" | "submitting" | "error">("idle");
  const [agentApprovalDiagnostic, setAgentApprovalDiagnostic] = useState<string | undefined>();
  const [agentOntologyBootstrapRoutes, setAgentOntologyBootstrapRoutes] = useState<readonly OntologyBootstrapRouteDto[]>([]);
  const [agentMemoryDiagnostic, setAgentMemoryDiagnostic] = useState<string | undefined>();
  const [agentLoadState, setAgentLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [agentLoadError, setAgentLoadError] = useState<string | undefined>();
  const [agentReloadKey, setAgentReloadKey] = useState(0);
  const [commandAgentStatus, setCommandAgentStatus] = useState<AgentStatusDto | undefined>();
  const [loadedCommandAgentAdapter, setLoadedCommandAgentAdapter] = useState<AgentAdapter | undefined>();
  const [commandAgentLoadState, setCommandAgentLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const model = useMemo(() => {
    const generatedAt = requestsWorkspace?.generatedAt
      ?? operatorStatus?.generatedAt
      ?? commandAgentStatus?.generatedAt
      ?? commandOpenedAt;
    const input = buildCommandBoardInputFromRuntime({
      generatedAt,
      requests: commandSource(
        requestsLoadState,
        requestsWorkspace,
        "diag_command_prr_unavailable",
        "PRR runtime is unavailable. No fixture data was substituted."
      ),
      evidence: commandSource(
        evidenceLoadState,
        evidenceWorkspace,
        "diag_command_evidence_unavailable",
        "Evidence runtime is unavailable. No fixture data was substituted."
      ),
      ingestion: commandSource(
        ingestionLoadState,
        ingestionWorkspace === undefined
          ? undefined
          : {
              workspace: ingestionWorkspace,
              jobs: { jobs: ingestionJobs },
              diagnostics: { diagnostics: ingestionDiagnostics }
            },
        "diag_command_ingestion_unavailable",
        "Ingestion runtime is unavailable. No fixture data was substituted."
      ),
      ontology: commandSource(
        ontologyLoadState,
        ontologyWorkspace,
        "diag_command_ontology_unavailable",
        "Ontology runtime is unavailable. No fixture data was substituted."
      ),
      operator: operatorStatus === undefined
        ? { state: "loading" }
        : { state: "ready", data: operatorStatus },
      agent: commandSource(
        commandAgentLoadState,
        commandAgentStatus,
        "diag_command_agent_unavailable",
        "Resident agent runtime is unavailable. No fixture data was substituted."
      )
    }, reviewedItemIds);
    return buildCommandBoardViewModel(input);
  }, [
    commandAgentLoadState,
    commandAgentStatus,
    commandOpenedAt,
    evidenceLoadState,
    evidenceWorkspace,
    ingestionDiagnostics,
    ingestionJobs,
    ingestionLoadState,
    ingestionWorkspace,
    ontologyLoadState,
    ontologyWorkspace,
    operatorStatus,
    requestsLoadState,
    requestsWorkspace,
    reviewedItemIds
  ]);
  const selectedItem = getSelectedCommandItem(model, selectedItemId);
  const commandActive = activeModuleId === "command";
  const requestsActive = activeModuleId === "requests";
  const ingestionActive = activeModuleId === "ingestion";
  const evidenceActive = activeModuleId === "evidence";
  const agentActive = activeModuleId === "agents";
  const ontologyActive = activeModuleId === "ontology";
  const requestsRequired = commandActive || requestsActive;
  const ingestionRequired = commandActive || ingestionActive;
  const evidenceRequired = commandActive || evidenceActive;
  const ontologyRequired = commandActive || ontologyActive;
  const selectedPrrModalRequest = useMemo(
    () => (requestsWorkspace === undefined ? undefined : getSelectedPrrRequest(requestsWorkspace, selectedPrrRequestId)),
    [requestsWorkspace, selectedPrrRequestId]
  );
  const requestBuilderVisible =
    requestsActive && requestBuilderOpen && requestsWorkspace !== undefined && requestsLoadState === "loaded";
  const requestDetailModalVisible =
    requestsActive && requestDetailModalOpen && requestsWorkspace !== undefined && requestsLoadState === "loaded";

  useEffect(() => {
    if (!commandActive) {
      return;
    }

    if (operatorStatus !== undefined && loadedOperatorStatusAdapter === operatorStatusAdapter) {
      return;
    }

    let canceled = false;

    operatorStatusAdapter
      .loadStatus()
      .then((status) => {
        if (canceled) {
          return;
        }

        setOperatorStatus(status);
        setLoadedOperatorStatusAdapter(operatorStatusAdapter);
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }

        setOperatorStatus(
          runtimeUnavailableStatus({
            message: error instanceof Error ? error.message : "Operator status runtime is unavailable."
          })
        );
        setLoadedOperatorStatusAdapter(operatorStatusAdapter);
      });

    return () => {
      canceled = true;
    };
  }, [commandActive, loadedOperatorStatusAdapter, operatorStatus, operatorStatusAdapter, operatorStatusReloadKey]);

  useEffect(() => {
    if (!requestsRequired) {
      return;
    }

    if (requestsWorkspace !== undefined && loadedRequestsAdapter === requestsAdapter) {
      return;
    }

    let canceled = false;
    setRequestDetailModalOpen(false);
    setRequestsLoadState("loading");
    setRequestsLoadError(undefined);

    requestsAdapter
      .loadRequestsWorkspace()
      .then((workspace) => {
        if (canceled) {
          return;
        }

        setRequestsWorkspace(workspace);
        setLoadedRequestsAdapter(requestsAdapter);
        setRequestsLoadState("loaded");
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }

        setRequestsWorkspace(undefined);
        setLoadedRequestsAdapter(undefined);
        setSelectedPrrRequestId(undefined);
        setRequestDetailModalOpen(false);
        setRequestsLoadState("error");
        setRequestsLoadError(
          safeCommandText(error instanceof Error ? error.message : "Requests workspace could not be loaded safely.")
        );
      });

    return () => {
      canceled = true;
    };
  }, [loadedRequestsAdapter, requestsAdapter, requestsReloadKey, requestsRequired, requestsWorkspace]);

  useEffect(() => {
    if (!pendingRequestBuilderOpen || !requestsActive || requestsWorkspace === undefined || requestsLoadState !== "loaded") {
      return;
    }

    setRequestBuilderDiagnostic(undefined);
    setRequestBuilderOpen(true);
    setPendingRequestBuilderOpen(false);
  }, [pendingRequestBuilderOpen, requestsActive, requestsLoadState, requestsWorkspace]);

  useEffect(() => {
    if (!ingestionRequired) {
      return;
    }

    if (ingestionWorkspace !== undefined && loadedIngestionAdapter === ingestionAdapter) {
      return;
    }

    let canceled = false;
    setIngestionLoadState("loading");
    setIngestionLoadError(undefined);

    ingestionAdapter
      .loadWorkspace()
      .then(async (workspace) => {
        const sourceResult = workspace.mounted ? await ingestionAdapter.listSources() : { sources: [] };
        let restoredWorkspace = workspace;
        const savedSourceId = readSavedIngestionSource(workspace.workspaceId);
        const sourceCollectionId = sourceResult.sources.find((source) => source.sourceCollectionId === savedSourceId)?.sourceCollectionId
          ?? workspace.review?.sourceCollectionId ?? sourceResult.sources[0]?.sourceCollectionId;
        if (workspace.mounted && sourceCollectionId !== undefined && workspace.review?.sourceCollectionId !== sourceCollectionId) {
          const restored = await ingestionAdapter.loadReview({ sourceCollectionId });
          if (!restored.ok) throw new Error("Saved ingestion review could not be loaded.");
          restoredWorkspace = { ...workspace, review: restored.review };
        }
        const [jobs, diagnosticResult] = workspace.mounted
          ? await Promise.all([
              ingestionAdapter.listJobs(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
              ingestionAdapter.loadDiagnostics(sourceCollectionId === undefined ? {} : { sourceCollectionId })
            ])
          : [{ jobs: [] }, { diagnostics: workspace.diagnostics }];

        if (canceled) {
          return;
        }

        setIngestionWorkspace(restoredWorkspace);
        setIngestionSources(sourceResult.sources);
        setLoadedIngestionAdapter(ingestionAdapter);
        setIngestionJobs(jobs.jobs);
        setIngestionDiagnostics([
          ...(jobs.diagnostics ?? []),
          ...diagnosticResult.diagnostics
        ]);
        setIngestionLoadState("loaded");
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }

        setIngestionWorkspace(undefined);
        setLoadedIngestionAdapter(undefined);
        setIngestionJobs([]);
        setIngestionDiagnostics([]);
        setIngestionLoadState("error");
        setIngestionLoadError("Ingestion workspace could not be loaded safely.");
      });

    return () => {
      canceled = true;
    };
  }, [ingestionAdapter, ingestionReloadKey, ingestionRequired, ingestionWorkspace, loadedIngestionAdapter]);

  useEffect(() => {
    if (!evidenceRequired) {
      return;
    }

    if (evidenceWorkspace !== undefined && loadedEvidenceAdapter === evidenceAdapter) {
      return;
    }

    let canceled = false;
    setEvidenceLoadState("loading");
    setEvidenceLoadError(undefined);

    evidenceAdapter
      .loadWorkspace()
      .then((workspace) => {
        if (canceled) {
          return;
        }
        setEvidenceWorkspace(workspace);
        setLoadedEvidenceAdapter(evidenceAdapter);
        setEvidenceLoadState("loaded");
      })
      .catch(() => {
        if (canceled) {
          return;
        }
        setEvidenceWorkspace(undefined);
        setLoadedEvidenceAdapter(undefined);
        setEvidenceLoadState("error");
        setEvidenceLoadError("Evidence workspace could not be loaded safely.");
      });

    return () => {
      canceled = true;
    };
  }, [evidenceAdapter, evidenceReloadKey, evidenceRequired, evidenceWorkspace, loadedEvidenceAdapter]);

  useEffect(() => {
    if (!ontologyRequired) {
      return;
    }

    if (ontologyWorkspace !== undefined && loadedOntologyAdapter === ontologyAdapter) {
      return;
    }

    let canceled = false;
    setOntologyLoadState("loading");
    setOntologyLoadError(undefined);

    ontologyAdapter
      .loadWorkspace()
      .then((workspace) => {
        if (canceled) {
          return;
        }

        setOntologyWorkspace(workspace);
        setLoadedOntologyAdapter(ontologyAdapter);
        setOntologyLoadState("loaded");
      })
      .catch(() => {
        if (canceled) {
          return;
        }

        setOntologyWorkspace(undefined);
        setLoadedOntologyAdapter(undefined);
        setOntologyLoadState("error");
        setOntologyLoadError("Ontology workspace could not be loaded safely.");
      });

    return () => {
      canceled = true;
    };
  }, [loadedOntologyAdapter, ontologyAdapter, ontologyReloadKey, ontologyRequired, ontologyWorkspace]);

  useEffect(() => {
    if (!commandActive) {
      return;
    }

    if (commandAgentStatus !== undefined && loadedCommandAgentAdapter === agentAdapter) {
      return;
    }

    let canceled = false;
    setCommandAgentLoadState("loading");

    agentAdapter
      .loadStatus()
      .then((status) => {
        if (canceled) {
          return;
        }
        setCommandAgentStatus(status);
        setLoadedCommandAgentAdapter(agentAdapter);
        setCommandAgentLoadState("loaded");
      })
      .catch(() => {
        if (canceled) {
          return;
        }
        setCommandAgentStatus(undefined);
        setLoadedCommandAgentAdapter(undefined);
        setCommandAgentLoadState("error");
      });

    return () => {
      canceled = true;
    };
  }, [agentAdapter, commandActive, commandAgentStatus, loadedCommandAgentAdapter]);

  useEffect(() => {
    if (!agentActive) {
      return;
    }

    let canceled = false;
    setAgentLoadState("loading");
    setAgentLoadError(undefined);
    setAgentApprovalDiagnostic(undefined);
    setAgentMemoryDiagnostic(undefined);

    Promise.all([
      agentAdapter.loadStatus(),
      agentAdapter.loadCockpit(),
      agentAdapter.loadApprovalCockpit(),
      agentAdapter.loadMemory(agentMemoryFilters)
    ])
      .then(([status, cockpit, approvalCockpit, memory]) => {
        if (canceled) {
          return;
        }

        setAgentStatus(status);
        setAgentCockpit(cockpit);
        setAgentApprovalCockpit(approvalCockpit);
        setAgentMemoryList(memory);
        setSelectedAgentMemoryId((current) => selectVisibleMemoryId(memory, current));
        setAgentLoadState("loaded");

        void loadOntologyBootstrapRoutes(agentAdapter, status).then((routes) => {
          if (!canceled) {
            setAgentOntologyBootstrapRoutes(routes);
          }
        });
      })
      .catch(() => {
        if (canceled) {
          return;
        }

        setAgentStatus(undefined);
        setAgentCockpit(undefined);
        setAgentApprovalCockpit(undefined);
        setAgentOntologyBootstrapRoutes([]);
        setAgentMemoryList(undefined);
        setAgentMemoryDetail(undefined);
        setSelectedAgentMemoryId(undefined);
        setAgentLoadState("error");
        setAgentLoadError("Agent workspace could not be loaded.");
      });

    return () => {
      canceled = true;
    };
  }, [agentActive, agentAdapter, agentMemoryFilters, agentReloadKey]);

  useEffect(() => {
    if (!agentActive || agentMemoryList === undefined) {
      return;
    }

    const memoryId = selectedAgentMemoryId ?? agentMemoryList.items[0]?.memoryId;
    if (memoryId === undefined) {
      setAgentMemoryDetail(undefined);
      return;
    }

    let canceled = false;
    agentAdapter
      .loadMemoryDetail(memoryId)
      .then((detail) => {
        if (canceled) {
          return;
        }

        setAgentMemoryDetail(detail);
      })
      .catch(() => {
        if (canceled) {
          return;
        }

        setAgentMemoryDetail(undefined);
      });

    return () => {
      canceled = true;
    };
  }, [agentActive, agentAdapter, agentMemoryList, selectedAgentMemoryId]);

  const commandMain = (
    <div className="space-y-6">
      {operatorStatus === undefined ? (
        <section aria-label="Operator cockpit loading state" className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-4">
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading operator cockpit</p>
          <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
            Loading the read-only operator status bridge.
          </p>
        </section>
      ) : (
        <OperatorCockpit
          status={operatorStatusForCommand(operatorStatus)}
          onNavigate={handleOperatorNavigate}
          onRefresh={handleRefreshOperatorStatus}
        />
      )}
      <section aria-label="Operational queue" className="space-y-4">
        <CommandDashboard
          model={model}
          activeFilter={activeFilter}
          selectedItemId={selectedItemId}
          onFilterChange={setActiveFilter}
          onSelectItem={setSelectedItemId}
          onMarkReviewed={(itemId) => setReviewedItemIds((current) => [...new Set([...current, itemId])])}
          onNavigate={handleCommandNavigate}
        />
      </section>
    </div>
  );
  const requestsMain = renderRequestsMain({
    requestsWorkspace,
    requestsLoadState,
    requestsLoadError,
    selectedPrrRequestId,
    onOpenBuilder: () => setRequestBuilderOpen(true),
    onOpenRequestDetail: () => setRequestDetailModalOpen(true),
    onSelectRequest: setSelectedPrrRequestId,
    onActiveViewChange: setRequestsViewContext,
    onRetry: () => {
      setRequestsWorkspace(undefined);
      setLoadedRequestsAdapter(undefined);
      setSelectedPrrRequestId(undefined);
      setRequestDetailModalOpen(false);
      setRequestBuilderOpen(false);
      setRequestBuilderDiagnostic(undefined);
      setPendingRequestBuilderOpen(false);
      setRequestsReloadKey((current) => current + 1);
    }
  });
  const ingestionMain = (
    <IngestionWorkspace
      workspace={ingestionWorkspace}
      loadState={ingestionLoadState}
      loadError={ingestionLoadError}
      jobs={ingestionJobs}
      diagnostics={ingestionDiagnostics}
      sources={ingestionSources}
      busy={ingestionBusy}
      onRegisterSource={handleRegisterSource}
      onSelectSource={handleSelectIngestionSource}
      onDryRunScan={handleDryRunScan}
      onRunLocalParsing={handleRunLocalParsing}
      onOpenEvidence={(evidenceId) => {
        window.location.hash = `evidence/${evidenceId}`;
        setInitialEvidenceId(evidenceId);
        setActiveModuleId("evidence");
      }}
      onApproveRawImport={handleApproveRawImport}
      onImportApproved={handleImportApproved}
      onRetryJob={handleRetryIngestionJob}
      onLoadDiagnostics={handleLoadIngestionDiagnostics}
    />
  );
  const evidenceMain = (
    <EvidenceWorkspace
      initialEvidenceId={initialEvidenceId}
      workspace={evidenceWorkspace}
      loadState={evidenceLoadState}
      loadError={evidenceLoadError}
      onRetry={() => {
        setEvidenceWorkspace(undefined);
        setLoadedEvidenceAdapter(undefined);
        setEvidenceLoadState("idle");
        setEvidenceLoadError(undefined);
        setEvidenceReloadKey((current) => current + 1);
      }}
      onPrepareAssertionCandidate={handlePrepareEvidenceAssertionCandidate}
      onAppendGovernanceReview={handleAppendGovernanceReview}
    />
  );
  const ontologyMain = (
    <div className="space-y-5 min-w-0">
    <SharedOntologyWorkspace />
    <details className="border border-[var(--console-line)] p-3" onToggle={event => {
      if (event.currentTarget.open) {
        setOntologyWorkspace(undefined);
        setLoadedOntologyAdapter(undefined);
        setOntologyLoadState("idle");
        setOntologyReloadKey(current => current + 1);
      }
    }}><summary>Legacy provenance</summary>
    <OntologyWorkspace
      workspace={ontologyWorkspace}
      loadState={ontologyLoadState}
      loadError={ontologyLoadError}
      onRetry={() => {
        setOntologyWorkspace(undefined);
        setLoadedOntologyAdapter(undefined);
        setOntologyLoadState("idle");
        setOntologyLoadError(undefined);
        setOntologyReloadKey((current) => current + 1);
      }}
    />
    </details>
    </div>
  );
  const agentMain = (
    <AgentWorkspace
      cockpit={agentCockpit}
      status={statusWithAgentDiagnostics(agentStatus, [
        agentApprovalDiagnostic,
        agentMemoryDiagnostic
      ])}
      approvalCockpit={agentApprovalCockpit}
      memoryList={agentMemoryList}
      memoryDetail={agentMemoryDetail}
      decisionState={agentApprovalDecisionState}
      ontologyBootstrapRoutes={agentOntologyBootstrapRoutes}
      loadState={agentLoadState}
      loadError={agentLoadError}
      onRefresh={handleRefreshAgentStatus}
      onCreateTask={handleCreateAgentTask}
      onPauseResidentWork={handlePauseResidentWork}
      onResumeResidentWork={handleResumeResidentWork}
      onRetryTask={handleRetryAgentTask}
      onCancelTask={handleCancelAgentTask}
      onMemoryFilterChange={setAgentMemoryFilters}
      onSelectMemory={setSelectedAgentMemoryId}
      onRecordMemory={handleRecordMemory}
      onSupersedeMemory={handleSupersedeMemory}
      onRetractMemory={handleRetractMemory}
      onApproveToolRequest={handleApproveToolRequest}
      onDenyToolRequest={handleDenyToolRequest}
    />
  );
  const commandDecisionRail = (
    <DecisionRail
      agentBrief={model.agentBrief}
      defaultVotes={model.decisionRail.defaultVotes}
      selectedItem={selectedItem}
      onClearSelection={() => setSelectedItemId(undefined)}
      onNavigate={handleCommandNavigate}
    />
  );
  function handleModuleSelect(moduleId: string) {
    if (implementedModuleIds.has(moduleId)) {
      setActiveModuleId(moduleId);
      if (moduleId === "agents") {
        setCommandAgentStatus(undefined);
        setLoadedCommandAgentAdapter(undefined);
        setCommandAgentLoadState("idle");
      }
      if (moduleId !== "requests") {
        setRequestDetailModalOpen(false);
        setRequestBuilderOpen(false);
        setRequestBuilderDiagnostic(undefined);
        setPendingRequestBuilderOpen(false);
      }
    }
  }

  function handleOperatorNavigate(target: OperatorSafeActionDto["target"]) {
    if (target !== undefined) {
      handleModuleSelect(target);
    }
  }

  function handleCommandNavigate(target: string) {
    if (target === "command") {
      handleRefreshOperatorStatus();
      return;
    }
    handleModuleSelect(target);
  }

  function handleRefreshOperatorStatus() {
    setOperatorStatus(undefined);
    setLoadedOperatorStatusAdapter(undefined);
    setOperatorStatusReloadKey((current) => current + 1);
  }

  function handleRefreshAgentStatus() {
    setAgentStatus(undefined);
    setAgentCockpit(undefined);
    setAgentApprovalCockpit(undefined);
    setAgentOntologyBootstrapRoutes([]);
    setAgentMemoryList(undefined);
    setAgentMemoryDetail(undefined);
    setSelectedAgentMemoryId(undefined);
    setAgentApprovalDecisionState("idle");
    setAgentApprovalDiagnostic(undefined);
    setAgentMemoryDiagnostic(undefined);
    setAgentLoadState("idle");
    setAgentLoadError(undefined);
    setAgentReloadKey((current) => current + 1);
  }

  async function handleCreateAgentTask(input: CreateAgentTaskInput) {
    setAgentApprovalDiagnostic(undefined);

    try {
      const result = await agentAdapter.createTask(input);
      await refreshAgentStateAfterMutation();
      return result;
    } catch (error: unknown) {
      setAgentApprovalDiagnostic(
        safeAgentText(error instanceof Error ? error.message : "Agent task creation could not be completed safely.")
      );
      throw error;
    }
  }

  function handlePauseResidentWork() {
    void runAgentSupervisionMutation(() => agentAdapter.pauseResidentWork());
  }

  function handleResumeResidentWork() {
    void runAgentSupervisionMutation(() => agentAdapter.resumeResidentWork());
  }

  function handleRetryAgentTask(taskId: string) {
    void runAgentSupervisionMutation(() => agentAdapter.retryTask(taskId));
  }

  function handleCancelAgentTask(taskId: string) {
    void runAgentSupervisionMutation(() => agentAdapter.cancelTask(taskId));
  }

  function handleApproveToolRequest(input: {
    readonly toolRequestId: string;
    readonly approvedPreviewHash: string;
    readonly rationale: string;
  }) {
    void runAgentApprovalDecision(() => agentAdapter.approveToolRequest(input));
  }

  function handleDenyToolRequest(input: {
    readonly toolRequestId: string;
    readonly rationale: string;
  }) {
    void runAgentApprovalDecision(() => agentAdapter.denyToolRequest(input));
  }

  function handleRecordMemory(input: Parameters<AgentAdapter["recordMemory"]>[0]) {
    void runAgentMemoryMutation(() => agentAdapter.recordMemory(input));
  }

  function handleSupersedeMemory(input: Parameters<AgentAdapter["supersedeMemory"]>[0]) {
    void runAgentMemoryMutation(() => agentAdapter.supersedeMemory(input));
  }

  function handleRetractMemory(input: Parameters<AgentAdapter["retractMemory"]>[0]) {
    void runAgentMemoryMutation(() => agentAdapter.retractMemory(input));
  }

  function handleNewRequest() {
    if (requestsActive && requestsWorkspace !== undefined && requestsLoadState === "loaded") {
      setRequestBuilderDiagnostic(undefined);
      setRequestBuilderOpen(true);
      return;
    }

    if (!requestsActive) {
      setRequestBuilderDiagnostic(undefined);
      setRequestBuilderOpen(false);
      setRequestDetailModalOpen(false);
      setPendingRequestBuilderOpen(true);
      setActiveModuleId("requests");
    }
  }

  async function handleCreateDraftRequest(input: RequestsCreateDraftInput) {
    setRequestBuilderSubmitting(true);
    setRequestBuilderDiagnostic(undefined);

    try {
      const result = await requestsAdapter.createDraftRequest(input);
      if (result.ok || result.workspaceStale !== true) {
        setRequestsWorkspace(result.workspace);
        setLoadedRequestsAdapter(requestsAdapter);
      }
      setRequestsLoadState("loaded");

      if (result.ok) {
        setSelectedPrrRequestId(result.prrRequestId);
        setRequestBuilderOpen(false);
        return;
      }

      setRequestBuilderDiagnostic(result.diagnostic.message);
    } catch {
      setRequestBuilderDiagnostic("Draft creation failed. Reload the Requests workspace and try again.");
    } finally {
      setRequestBuilderSubmitting(false);
    }
  }

  function handleApproveRawImport(input: ApproveRawImportInput) {
    void runIngestionAction(() => ingestionAdapter.approveRawImport(input));
  }

  function handleImportApproved(input: ImportApprovedInput) {
    void runIngestionAction(() => ingestionAdapter.importApproved(input));
  }

  function handleRegisterSource(input: RegisterSourceInput) {
    void runIngestionAction(() => ingestionAdapter.registerSource(input));
  }

  function handleSelectIngestionSource(input: LoadIngestionReviewInput) {
    void runIngestionAction(() => ingestionAdapter.loadReview(input));
  }

  function handleDryRunScan(input: DryRunScanInput) {
    void runIngestionAction(() => ingestionAdapter.dryRunScan(input));
  }

  async function handleRunLocalParsing(input: ListIngestionJobsInput) {
    if (ingestionActionPending.current) return;
    ingestionActionPending.current = true;
    setIngestionBusy(true);
    try {
      const result = await ingestionAdapter.runLocalParsing(input);
      setIngestionJobs(result.jobs);
      invalidateEvidenceWorkspace();
      if (input.sourceCollectionId !== undefined) {
        const restored = await ingestionAdapter.loadReview({ sourceCollectionId: input.sourceCollectionId });
        if (restored.ok) setIngestionWorkspace((current) => current === undefined ? current : { ...current, review: restored.review });
      }
      await refreshIngestionSupportStateAfterMutation(input.sourceCollectionId);
      if (result.diagnostics?.length) setIngestionDiagnostics((current) => [...current, ...result.diagnostics!]);
    } catch {
      setIngestionDiagnostics([{ severity: "error", category: "ingestion",
        message: "Extraction response was interrupted. Reopen the saved review to inspect persisted jobs before retrying." }]);
    } finally {
      ingestionActionPending.current = false;
      setIngestionBusy(false);
    }
  }

  function invalidateEvidenceWorkspace() {
    setEvidenceWorkspace(undefined);
    setLoadedEvidenceAdapter(undefined);
    setEvidenceReloadKey((current) => current + 1);
  }

  function handleRetryIngestionJob(input: RetryIngestionJobInput) {
    void runIngestionJobAction(() => ingestionAdapter.retryJob(input));
  }

  function handleLoadIngestionDiagnostics(input: { readonly sourceCollectionId?: string }) {
    void ingestionAdapter
      .loadDiagnostics(input)
      .then((result) => setIngestionDiagnostics(result.diagnostics))
      .catch(() => {
        setIngestionDiagnostics([
          {
            severity: "error",
            category: "ingestion",
            message: "Ingestion diagnostics could not be loaded."
          }
        ]);
      });
  }

  async function handlePrepareEvidenceAssertionCandidate(input: PrepareEvidenceAssertionCandidateInput) {
    const result = await evidenceAdapter.prepareAssertionCandidate(input);
    setEvidenceWorkspace(result.workspace);
    setLoadedEvidenceAdapter(evidenceAdapter);
    setEvidenceLoadState("loaded");
    setEvidenceLoadError(undefined);
    return result.candidate;
  }

  async function handleAppendGovernanceReview(input: AppendGovernanceReviewInput) {
    const result = await evidenceAdapter.appendGovernanceReview(input);
    setEvidenceWorkspace(result.workspace);
    setLoadedEvidenceAdapter(evidenceAdapter);
    setEvidenceLoadState("loaded");
    setEvidenceLoadError(undefined);
  }

  async function refreshAgentStateAfterMutation(preferredMemoryId?: string) {
    const [status, cockpit, approvalCockpit, memory] = await Promise.all([
      agentAdapter.loadStatus(),
      agentAdapter.loadCockpit(),
      agentAdapter.loadApprovalCockpit(),
      agentAdapter.loadMemory(agentMemoryFilters)
    ]);
    setAgentStatus(status);
    setAgentCockpit(cockpit);
    setAgentApprovalCockpit(approvalCockpit);
    setAgentMemoryList(memory);
    setSelectedAgentMemoryId((current) => selectVisibleMemoryId(memory, preferredMemoryId ?? current));
    if (memory.items.length === 0) {
      setAgentMemoryDetail(undefined);
    }
    setAgentOntologyBootstrapRoutes(await loadOntologyBootstrapRoutes(agentAdapter, status));
    setAgentLoadState("loaded");
    setAgentLoadError(undefined);
  }

  async function runAgentSupervisionMutation(action: () => Promise<unknown>) {
    setAgentApprovalDiagnostic(undefined);
    try {
      await action();
      await refreshAgentStateAfterMutation();
    } catch (error: unknown) {
      setAgentApprovalDiagnostic(
        safeAgentText(error instanceof Error ? error.message : "Resident supervision could not be changed safely.")
      );
    }
  }

  async function runIngestionAction(action: () => Promise<IngestionActionResult>) {
    if (ingestionActionPending.current) return;
    ingestionActionPending.current = true;
    setIngestionBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setIngestionDiagnostics([
          ...result.error.diagnostics,
          {
            severity: "error",
            category: "ingestion",
            message: result.error.message
          }
        ]);
        return;
      }

      setIngestionWorkspace((current) =>
        current === undefined
          ? {
              mounted: true,
              review: result.review,
              diagnostics: []
            }
          : {
              ...current,
              mounted: true,
              review: result.review
            }
      );
      saveIngestionSource(ingestionWorkspace?.workspaceId, result.review.sourceCollectionId);
      invalidateEvidenceWorkspace();
      await refreshIngestionSupportStateAfterMutation(result.review.sourceCollectionId);
    } catch {
      setIngestionDiagnostics([
        {
          severity: "error",
          category: "ingestion",
          message: "Ingestion action response was interrupted. Reopen the saved review to inspect persisted state before retrying."
        }
      ]);
    } finally {
      ingestionActionPending.current = false;
      setIngestionBusy(false);
    }
  }

  async function runIngestionJobAction(action: () => Promise<IngestionJobActionResult>) {
    if (ingestionActionPending.current) return;
    ingestionActionPending.current = true;
    setIngestionBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setIngestionDiagnostics([
          ...result.error.diagnostics,
          {
            severity: "error",
            category: "ingestion",
            message: result.error.message
          }
        ]);
        return;
      }

      const review = result.review;
      if (review !== undefined) {
        setIngestionWorkspace((current) =>
          current === undefined
            ? {
                mounted: true,
                review,
                diagnostics: []
              }
            : {
                ...current,
                mounted: true,
                review
              }
        );
      }

      invalidateEvidenceWorkspace();
      await refreshIngestionSupportStateAfterMutation(result.review?.sourceCollectionId ?? result.job.sourceCollectionId);
    } catch {
      setIngestionDiagnostics([
        {
          severity: "error",
          category: "ingestion",
          message: "Ingestion job action failed. Reload the workspace and try again."
        }
      ]);
    } finally {
      ingestionActionPending.current = false;
      setIngestionBusy(false);
    }
  }

  async function refreshIngestionSupportState(sourceCollectionId: string | undefined) {
    const input = sourceCollectionId === undefined ? {} : { sourceCollectionId };
    const [jobs, diagnosticResult, sourceResult] = await Promise.all([
      ingestionAdapter.listJobs(input),
      ingestionAdapter.loadDiagnostics(input),
      ingestionAdapter.listSources()
    ]);
    setIngestionSources(sourceResult.sources);
    setIngestionJobs(jobs.jobs);
    setIngestionDiagnostics([
      ...(jobs.diagnostics ?? []),
      ...diagnosticResult.diagnostics
    ]);
  }

  async function refreshIngestionSupportStateAfterMutation(sourceCollectionId: string | undefined) {
    try {
      await refreshIngestionSupportState(sourceCollectionId);
    } catch {
      setIngestionDiagnostics([
        {
          severity: "warning",
          category: "ingestion",
          message: "Ingestion support state could not be refreshed. The action completed; reload jobs and diagnostics if needed."
        }
      ]);
    }
  }

  async function runAgentApprovalDecision(
    decision: () => Promise<{ readonly approvalCockpit: AgentApprovalCockpitDto }>
  ) {
    setAgentApprovalDecisionState("submitting");
    setAgentApprovalDiagnostic(undefined);

    try {
      const result = await decision();
      setAgentApprovalCockpit(result.approvalCockpit);
      await refreshAgentStateAfterMutation();
      setAgentApprovalDecisionState("idle");
    } catch (error: unknown) {
      setAgentApprovalDecisionState("error");
      setAgentApprovalDiagnostic(
        safeAgentText(error instanceof Error ? error.message : "Agent approval decision could not be recorded.")
      );
    }
  }

  async function runAgentMemoryMutation(
    mutation: () => Promise<{ readonly memoryId: string }>
  ) {
    setAgentMemoryDiagnostic(undefined);

    try {
      const result = await mutation();
      await refreshAgentStateAfterMutation(result.memoryId);
    } catch (error: unknown) {
      setAgentMemoryDiagnostic(
        safeAgentText(error instanceof Error ? error.message : "Agent memory could not be updated.")
      );
    }
  }

  const commandOrRequestsModeLabel = requestsActive ? "Requests" : "Command";
  const modeLabel = ontologyActive
    ? "Ontology"
    : evidenceActive
      ? "Evidence"
    : agentActive
      ? "Agent"
      : ingestionActive
        ? "Ingestion"
        : commandOrRequestsModeLabel;
  const mainId = requestsActive
    ? "requests"
    : evidenceActive
      ? "evidence"
    : ingestionActive
      ? "ingestion"
      : ontologyActive
        ? "ontology"
        : agentActive
          ? "agents"
          : "command";
  const main = requestsActive
    ? requestsMain
    : evidenceActive
      ? evidenceMain
    : ingestionActive
      ? ingestionMain
      : ontologyActive
        ? ontologyMain
        : agentActive
          ? agentMain
          : commandMain;
  const decisionRail = requestsActive ? (
    <RequestWorkspaceIntelligenceRail
      workspace={requestsWorkspace}
      savedViewId={requestsViewContext.savedViewId}
      viewMode={requestsViewContext.viewMode}
    />
  ) : agentActive || ontologyActive || evidenceActive ? null : (
    commandDecisionRail
  );

  return (
    <>
      <div aria-hidden={requestBuilderVisible || requestDetailModalVisible ? "true" : undefined}>
        <LocalWorkspaceStatus />
        <OpsShell
          modules={workspaceModules}
          activeModuleId={activeModuleId}
          workspaceName="Cestus Local"
          modeLabel={modeLabel}
          mainId={mainId}
          mainLabel={ontologyActive ? "Ontology workspace" : evidenceActive ? "Evidence workspace" : agentActive ? "Agent workspace" : ingestionActive ? "Ingestion workspace" : requestsActive ? "Requests workspace" : "Command workspace"}
          onNewRequest={agentActive || ontologyActive || evidenceActive ? undefined : handleNewRequest}
          onModuleSelect={handleModuleSelect}
          main={main}
          decisionRail={decisionRail}
        />
      </div>
      {requestBuilderVisible ? (
        <RequestBuilder
          builder={{
            ...buildPrrBuilderModel(requestsWorkspace),
            jurisdictionPacks: requestsWorkspace.builder.jurisdictionPacks
          }}
          onClose={() => {
            setRequestBuilderOpen(false);
            setRequestBuilderDiagnostic(undefined);
          }}
          onSubmit={handleCreateDraftRequest}
          submitting={requestBuilderSubmitting}
          diagnosticMessage={requestBuilderDiagnostic}
        />
      ) : null}
      {requestDetailModalVisible ? (
        <RequestDetailModal selectedRequest={selectedPrrModalRequest} onClose={() => setRequestDetailModalOpen(false)} />
      ) : null}
    </>
  );
}

function commandSource<T>(
  loadState: "idle" | "loading" | "loaded" | "error",
  data: T | undefined,
  diagnosticId: string,
  message: string
): CommandRuntimeSource<T> {
  if (loadState === "loaded" && data !== undefined) {
    return { state: "ready", data };
  }
  if (loadState === "error" || (loadState === "loaded" && data === undefined)) {
    return { state: "unavailable", diagnosticId, message };
  }
  return { state: "loading" };
}

async function loadOntologyBootstrapRoutes(
  agentAdapter: AgentAdapter,
  status: AgentStatusDto
): Promise<readonly OntologyBootstrapRouteDto[]> {
  const runIds = [...new Set(
    status.runs
      .filter((run) => run.runType === "ontology-bootstrap")
      .map((run) => run.runId)
  )];

  if (runIds.length === 0) {
    return [];
  }

  const routes = await Promise.all(
    runIds.map(async (runId) => {
      try {
        return await agentAdapter.loadOntologyBootstrapRoute(runId);
      } catch {
        return undefined;
      }
    })
  );

  return routes.filter((route): route is OntologyBootstrapRouteDto => route !== undefined);
}

function operatorStatusForCommand(status: OperatorStatusDto): OperatorStatusDto {
  return {
    ...status,
    sections: status.sections.map((section) =>
      section.sectionId === "prr" ? { ...section, label: "PRR/Investigations" } : section
    )
  };
}

function statusWithAgentDiagnostics(
  status: AgentStatusDto | undefined,
  diagnosticMessages: readonly (string | undefined)[]
): AgentStatusDto | undefined {
  const messages = diagnosticMessages.filter((message): message is string => message !== undefined);
  if (messages.length === 0) {
    return status;
  }

  if (status === undefined) {
    const [message] = messages;
    return runtimeUnavailableAgentStatus(message === undefined ? {} : { message });
  }

  return {
    ...status,
    diagnostics: [
      ...status.diagnostics,
      ...messages.map((message, index) => ({
        diagnosticId: `diag_agent_workspace_${index + 1}`,
        severity: "error" as const,
        category: "agent" as const,
        message,
        allowedRepairActions: ["refresh agent status"]
      }))
    ]
  };
}

function selectVisibleMemoryId(
  memoryList: AgentMemoryListDto,
  preferredMemoryId: string | undefined
): string | undefined {
  if (preferredMemoryId !== undefined && memoryList.items.some((item) => item.memoryId === preferredMemoryId)) {
    return preferredMemoryId;
  }

  return memoryList.items[0]?.memoryId;
}

function renderRequestsMain({
  requestsWorkspace,
  requestsLoadState,
  requestsLoadError,
  selectedPrrRequestId,
  onOpenBuilder,
  onOpenRequestDetail,
  onSelectRequest,
  onActiveViewChange,
  onRetry
}: {
  readonly requestsWorkspace: PrrWorkspaceData | undefined;
  readonly requestsLoadState: "idle" | "loading" | "loaded" | "error";
  readonly requestsLoadError: string | undefined;
  readonly selectedPrrRequestId: string | undefined;
  readonly onOpenBuilder: () => void;
  readonly onOpenRequestDetail: () => void;
  readonly onSelectRequest: (prrRequestId: string) => void;
  readonly onActiveViewChange: (context: PrrWorkspaceViewContext) => void;
  readonly onRetry: () => void;
}) {
  if (requestsWorkspace !== undefined) {
    return (
      <RequestWorkspace
        workspace={requestsWorkspace}
        selectedRequestId={selectedPrrRequestId}
        onOpenBuilder={onOpenBuilder}
        onOpenRequestDetail={onOpenRequestDetail}
        onSelectRequest={onSelectRequest}
        onActiveViewChange={onActiveViewChange}
      />
    );
  }

  if (requestsLoadState === "error") {
    return (
      <section aria-label="Requests load error" className="border border-[var(--signal-red)] bg-[var(--console-panel)]/72 p-4">
        <p className="font-mono text-base text-[var(--signal-red)] sm:text-sm">Requests unavailable</p>
        <p className="mt-3 text-base text-pretty text-[var(--paper-light)] sm:text-sm">
          {requestsLoadError ?? "The replayed PRR workspace DTO could not be loaded."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="relative mt-4 min-h-10 border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          Retry loading Requests
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Requests loading state" className="border border-[var(--console-line)] bg-[var(--console-panel)]/72 p-4">
      <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Loading Requests workspace</p>
      <p className="mt-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
        Replaying the durable local PRR ledger into the workspace DTO.
      </p>
    </section>
  );
}

function readSavedIngestionSource(workspaceId: string | undefined): string | undefined {
  if (workspaceId === undefined) return undefined;
  try { return window.localStorage.getItem(`cestus.ingestion.source.${workspaceId}`) ?? undefined; }
  catch { return undefined; }
}

function saveIngestionSource(workspaceId: string | undefined, sourceCollectionId: string) {
  if (workspaceId === undefined) return;
  try { window.localStorage.setItem(`cestus.ingestion.source.${workspaceId}`, sourceCollectionId); }
  catch { /* Saved ledger sources remain available when browser storage is disabled. */ }
}
