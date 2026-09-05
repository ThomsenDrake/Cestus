import { useEffect, useMemo, useState } from "react";
import { buildPrrWorkspaceViewModel } from "./request-model.js";
import type { PrrViewMode, PrrWorkspaceData, PrrWorkspaceViewContext } from "./request-types.js";
import { RequestBoard } from "./RequestBoard.js";
import { RequestCommandBar } from "./RequestCommandBar.js";
import { RequestSignalMap } from "./RequestSignalMap.js";

interface RequestWorkspaceProps {
  readonly workspace: PrrWorkspaceData;
  readonly onOpenBuilder: () => void;
  readonly onOpenRequestDetail: () => void;
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (prrRequestId: string) => void;
  readonly onActiveViewChange?: (context: PrrWorkspaceViewContext) => void;
}

export function RequestWorkspace({
  workspace,
  onOpenBuilder,
  onOpenRequestDetail,
  selectedRequestId,
  onSelectRequest,
  onActiveViewChange
}: RequestWorkspaceProps) {
  const [savedViewId, setSavedViewId] = useState("all-active");
  const [viewMode, setViewMode] = useState<PrrViewMode | undefined>(undefined);
  const model = useMemo(
    () => buildPrrWorkspaceViewModel(workspace, { savedViewId, selectedRequestId, viewMode }),
    [workspace, savedViewId, selectedRequestId, viewMode]
  );

  useEffect(() => {
    onActiveViewChange?.({ savedViewId: model.activeView.id, viewMode: model.viewMode });
  }, [model.activeView.id, model.viewMode, onActiveViewChange]);

  function handleSavedViewChange(nextSavedViewId: string) {
    setSavedViewId(nextSavedViewId);
    setViewMode(undefined);
  }

  function handleSelectRequest(prrRequestId: string) {
    onSelectRequest(prrRequestId);
    onOpenRequestDetail();
  }

  return (
    <section aria-label="Requests workspace" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[var(--console-line)] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Signal operations board</p>
          <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Requests</h1>
        </div>
        <button
          type="button"
          onClick={onOpenBuilder}
          className="relative min-h-10 w-fit border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          Open guided builder
        </button>
      </div>
      <RequestCommandBar
        savedViews={model.savedViews}
        activeViewId={model.activeView.id}
        viewMode={model.viewMode}
        onSavedViewChange={handleSavedViewChange}
        onViewModeChange={setViewMode}
      />
      {model.viewMode === "signal-map" ? (
        <RequestSignalMap map={model.signalMap} />
      ) : (
        <RequestBoard lanes={model.lanes} selectedRequestId={selectedRequestId} onSelectRequest={handleSelectRequest} />
      )}
    </section>
  );
}
