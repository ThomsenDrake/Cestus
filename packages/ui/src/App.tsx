import { useEffect, useMemo, useState } from "react";
import { buildCommandBoardViewModel, getSelectedCommandItem } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { IngestionWorkspace } from "./ingestion/IngestionWorkspace.js";
import {
  httpIngestionWorkspaceAdapter,
  type IngestionWorkspaceAdapter
} from "./ingestion/ingestion-adapter.js";
import type {
  ApproveProviderParsingInput,
  ApproveRawImportInput,
  ImportApprovedInput,
  IngestionActionResult,
  IngestionJobActionResult,
  IngestionJobDto,
  IngestionRuntimeDiagnosticDto,
  IngestionWorkspaceDto,
  RetryIngestionJobInput
} from "./ingestion/ingestion-types.js";
import {
  httpRequestsAdapter,
  type RequestsCreateDraftInput,
  type RequestsWorkspaceAdapter
} from "./requests/request-adapter.js";
import { RequestBuilder } from "./requests/RequestBuilder.js";
import { RequestDetailModal } from "./requests/RequestDetailModal.js";
import { buildPrrBuilderModel, getSelectedPrrRequest } from "./requests/request-model.js";
import { RequestWorkspace } from "./requests/RequestWorkspace.js";
import { RequestWorkspaceIntelligenceRail } from "./requests/RequestWorkspaceIntelligenceRail.js";
import type { PrrDetailModel, PrrWorkspaceData, PrrWorkspaceViewContext } from "./requests/request-types.js";
import { CommandDashboard } from "./workspace/CommandDashboard.js";
import { DecisionRail } from "./workspace/DecisionRail.js";
import { OpsShell } from "./workspace/OpsShell.js";
import { workspaceModules } from "./workspace/workspace-nav.js";

const implementedModuleIds = new Set(["command", "requests"]);
implementedModuleIds.add("ingestion");

interface AppProps {
  readonly requestsAdapter?: RequestsWorkspaceAdapter;
  readonly ingestionAdapter?: IngestionWorkspaceAdapter;
}

export function App({
  requestsAdapter = httpRequestsAdapter,
  ingestionAdapter = httpIngestionWorkspaceAdapter
}: AppProps = {}) {
  const [activeModuleId, setActiveModuleId] = useState("command");
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [reviewedItemIds, setReviewedItemIds] = useState<readonly string[]>([]);
  const [selectedPrrRequestId, setSelectedPrrRequestId] = useState<string | undefined>("prr_req_001");
  const [, setSelectedPrrRequest] = useState<PrrDetailModel | undefined>();
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
  const [ingestionJobs, setIngestionJobs] = useState<readonly IngestionJobDto[]>([]);
  const [ingestionDiagnostics, setIngestionDiagnostics] = useState<readonly IngestionRuntimeDiagnosticDto[]>([]);
  const model = useMemo(
    () => buildCommandBoardViewModel({ ...commandWorkspaceFixture, reviewedItemIds }),
    [reviewedItemIds]
  );
  const selectedItem = getSelectedCommandItem(model, selectedItemId);
  const requestsActive = activeModuleId === "requests";
  const ingestionActive = activeModuleId === "ingestion";
  const selectedPrrModalRequest = useMemo(
    () => (requestsWorkspace === undefined ? undefined : getSelectedPrrRequest(requestsWorkspace, selectedPrrRequestId)),
    [requestsWorkspace, selectedPrrRequestId]
  );
  const requestBuilderVisible =
    requestsActive && requestBuilderOpen && requestsWorkspace !== undefined && requestsLoadState === "loaded";
  const requestDetailModalVisible =
    requestsActive && requestDetailModalOpen && requestsWorkspace !== undefined && requestsLoadState === "loaded";

  useEffect(() => {
    if (!requestsActive) {
      return;
    }

    if (requestsWorkspace !== undefined && loadedRequestsAdapter === requestsAdapter) {
      return;
    }

    let canceled = false;
    setRequestDetailModalOpen(false);
    setSelectedPrrRequest(undefined);
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
        setSelectedPrrRequest(undefined);
        setSelectedPrrRequestId(undefined);
        setRequestDetailModalOpen(false);
        setRequestsLoadState("error");
        setRequestsLoadError(error instanceof Error ? error.message : "Requests workspace could not be loaded.");
      });

    return () => {
      canceled = true;
    };
  }, [loadedRequestsAdapter, requestsActive, requestsAdapter, requestsReloadKey, requestsWorkspace]);

  useEffect(() => {
    if (!pendingRequestBuilderOpen || !requestsActive || requestsWorkspace === undefined || requestsLoadState !== "loaded") {
      return;
    }

    setRequestBuilderDiagnostic(undefined);
    setRequestBuilderOpen(true);
    setPendingRequestBuilderOpen(false);
  }, [pendingRequestBuilderOpen, requestsActive, requestsLoadState, requestsWorkspace]);

  useEffect(() => {
    if (!ingestionActive) {
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
        const sourceCollectionId = workspace.review?.sourceCollectionId;
        const [jobs, diagnosticResult] = workspace.mounted
          ? await Promise.all([
              ingestionAdapter.listJobs(sourceCollectionId === undefined ? {} : { sourceCollectionId }),
              ingestionAdapter.loadDiagnostics(sourceCollectionId === undefined ? {} : { sourceCollectionId })
            ])
          : [{ jobs: [] }, { diagnostics: workspace.diagnostics }];

        if (canceled) {
          return;
        }

        setIngestionWorkspace(workspace);
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
        setIngestionLoadError(error instanceof Error ? error.message : "Ingestion workspace could not be loaded.");
      });

    return () => {
      canceled = true;
    };
  }, [ingestionActive, ingestionAdapter, ingestionReloadKey, ingestionWorkspace, loadedIngestionAdapter]);

  const commandMain = (
    <CommandDashboard
      model={model}
      activeFilter={activeFilter}
      selectedItemId={selectedItemId}
      onFilterChange={setActiveFilter}
      onSelectItem={setSelectedItemId}
      onMarkReviewed={(itemId) => setReviewedItemIds((current) => [...new Set([...current, itemId])])}
    />
  );
  const requestsMain = renderRequestsMain({
    requestsWorkspace,
    requestsLoadState,
    requestsLoadError,
    selectedPrrRequestId,
    onOpenBuilder: () => setRequestBuilderOpen(true),
    onOpenRequestDetail: () => setRequestDetailModalOpen(true),
    onSelectRequest: setSelectedPrrRequestId,
    onSelectedRequestChange: setSelectedPrrRequest,
    onActiveViewChange: setRequestsViewContext,
    onRetry: () => {
      setRequestsWorkspace(undefined);
      setLoadedRequestsAdapter(undefined);
      setSelectedPrrRequest(undefined);
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
      onApproveRawImport={handleApproveRawImport}
      onImportApproved={handleImportApproved}
      onApproveProviderParsing={handleApproveProviderParsing}
      onRetryJob={handleRetryIngestionJob}
      onLoadDiagnostics={handleLoadIngestionDiagnostics}
    />
  );
  const commandDecisionRail = (
    <DecisionRail
      agentBrief={model.agentBrief}
      defaultVotes={model.decisionRail.defaultVotes}
      selectedItem={selectedItem}
      onClearSelection={() => setSelectedItemId(undefined)}
    />
  );
  function handleModuleSelect(moduleId: string) {
    if (implementedModuleIds.has(moduleId)) {
      setActiveModuleId(moduleId);
      if (moduleId !== "requests") {
        setRequestDetailModalOpen(false);
        setRequestBuilderOpen(false);
        setRequestBuilderDiagnostic(undefined);
        setPendingRequestBuilderOpen(false);
      }
    }
  }

  function handleNewRequest() {
    if (requestsActive && requestsWorkspace !== undefined && requestsLoadState === "loaded") {
      setRequestBuilderDiagnostic(undefined);
      setRequestBuilderOpen(true);
      return;
    }

    if (ingestionActive) {
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

  function handleApproveProviderParsing(input: ApproveProviderParsingInput) {
    void runIngestionAction(() => ingestionAdapter.approveProviderParsing(input));
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

  async function runIngestionAction(action: () => Promise<IngestionActionResult>) {
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
      await refreshIngestionSupportState(result.review.sourceCollectionId);
    } catch {
      setIngestionDiagnostics([
        {
          severity: "error",
          category: "ingestion",
          message: "Ingestion action failed. Reload the workspace and try again."
        }
      ]);
    }
  }

  async function runIngestionJobAction(action: () => Promise<IngestionJobActionResult>) {
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

      await refreshIngestionSupportState(result.review?.sourceCollectionId ?? result.job.sourceCollectionId);
    } catch {
      setIngestionDiagnostics([
        {
          severity: "error",
          category: "ingestion",
          message: "Ingestion job action failed. Reload the workspace and try again."
        }
      ]);
    }
  }

  async function refreshIngestionSupportState(sourceCollectionId: string | undefined) {
    const input = sourceCollectionId === undefined ? {} : { sourceCollectionId };
    const [jobs, diagnosticResult] = await Promise.all([
      ingestionAdapter.listJobs(input),
      ingestionAdapter.loadDiagnostics(input)
    ]);
    setIngestionJobs(jobs.jobs);
    setIngestionDiagnostics([
      ...(jobs.diagnostics ?? []),
      ...diagnosticResult.diagnostics
    ]);
  }

  const commandOrRequestsModeLabel = requestsActive ? "Requests" : "Command";
  const modeLabel = ingestionActive ? "Ingestion" : commandOrRequestsModeLabel;
  const searchLabel = requestsActive ? "Requests search" : ingestionActive ? "Ingestion search" : "Command search";
  const searchPlaceholder = requestsActive
    ? "Search requests, agencies, evidence, and correspondence"
    : ingestionActive
      ? "Search source collections, scans, duplicates, and diagnostics"
      : "Search requests, evidence, agencies, and assertions";
  const mainId = requestsActive ? "requests" : ingestionActive ? "ingestion" : "command";
  const main = requestsActive ? requestsMain : ingestionActive ? ingestionMain : commandMain;
  const decisionRail = requestsActive ? (
    <RequestWorkspaceIntelligenceRail
      workspace={requestsWorkspace}
      savedViewId={requestsViewContext.savedViewId}
      viewMode={requestsViewContext.viewMode}
    />
  ) : (
    commandDecisionRail
  );

  return (
    <>
      <div aria-hidden={requestBuilderVisible || requestDetailModalVisible ? "true" : undefined}>
        <OpsShell
          modules={workspaceModules}
          activeModuleId={activeModuleId}
          workspaceName="Cestus Local"
          modeLabel={modeLabel}
          ledgerLabel="Ledger synced"
          syncLabel={requestsActive ? "PRR sync local" : "Local sync live"}
          deploymentLabel="Solo laptop"
          searchLabel={searchLabel}
          searchPlaceholder={searchPlaceholder}
          mainId={mainId}
          mainLabel={ingestionActive ? "Ingestion workspace" : requestsActive ? "Requests workspace" : "Command workspace"}
          onNewRequest={handleNewRequest}
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

function renderRequestsMain({
  requestsWorkspace,
  requestsLoadState,
  requestsLoadError,
  selectedPrrRequestId,
  onOpenBuilder,
  onOpenRequestDetail,
  onSelectRequest,
  onSelectedRequestChange,
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
  readonly onSelectedRequestChange: (selectedRequest: PrrDetailModel | undefined) => void;
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
        onSelectedRequestChange={onSelectedRequestChange}
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
