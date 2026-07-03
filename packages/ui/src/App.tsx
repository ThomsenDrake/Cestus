import { useMemo, useState } from "react";
import { buildCommandBoardViewModel, getSelectedCommandItem } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { prrWorkspaceFixture } from "./requests/request-fixtures.js";
import { RequestBuilder } from "./requests/RequestBuilder.js";
import { RequestDetailRail } from "./requests/RequestDetailRail.js";
import { RequestWorkspace } from "./requests/RequestWorkspace.js";
import type { PrrDetailModel } from "./requests/request-types.js";
import { CommandDashboard } from "./workspace/CommandDashboard.js";
import { DecisionRail } from "./workspace/DecisionRail.js";
import { OpsShell } from "./workspace/OpsShell.js";
import { workspaceModules } from "./workspace/workspace-nav.js";

const implementedModuleIds = new Set(["command", "requests"]);

export function App() {
  const [activeModuleId, setActiveModuleId] = useState("command");
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [reviewedItemIds, setReviewedItemIds] = useState<readonly string[]>([]);
  const [selectedPrrRequestId, setSelectedPrrRequestId] = useState<string | undefined>("prr_req_001");
  const [selectedPrrRequest, setSelectedPrrRequest] = useState<PrrDetailModel | undefined>();
  const [requestBuilderOpen, setRequestBuilderOpen] = useState(false);
  const model = useMemo(
    () => buildCommandBoardViewModel({ ...commandWorkspaceFixture, reviewedItemIds }),
    [reviewedItemIds]
  );
  const selectedItem = getSelectedCommandItem(model, selectedItemId);
  const requestsActive = activeModuleId === "requests";
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
  const requestsMain = (
    <RequestWorkspace
      fixture={prrWorkspaceFixture}
      selectedRequestId={selectedPrrRequestId}
      onOpenBuilder={() => setRequestBuilderOpen(true)}
      onSelectRequest={setSelectedPrrRequestId}
      onSelectedRequestChange={setSelectedPrrRequest}
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
    }
  }

  function handleNewRequest() {
    if (requestsActive) {
      setRequestBuilderOpen(true);
    }
  }

  return (
    <>
      <OpsShell
        modules={workspaceModules}
        activeModuleId={activeModuleId}
        workspaceName="Cestus Local"
        modeLabel={requestsActive ? "Requests" : "Command"}
        ledgerLabel="Ledger synced"
        syncLabel={requestsActive ? "PRR sync local" : "Local sync live"}
        deploymentLabel="Solo laptop"
        searchLabel={requestsActive ? "Requests search" : "Command search"}
        searchPlaceholder={
          requestsActive
            ? "Search requests, agencies, evidence, and correspondence"
            : "Search requests, evidence, agencies, and assertions"
        }
        mainId={requestsActive ? "requests" : "command"}
        mainLabel={requestsActive ? "Requests workspace" : "Command workspace"}
        onNewRequest={handleNewRequest}
        onModuleSelect={handleModuleSelect}
        main={requestsActive ? requestsMain : commandMain}
        decisionRail={requestsActive ? <RequestDetailRail selectedRequest={selectedPrrRequest} /> : commandDecisionRail}
      />
      {requestsActive && requestBuilderOpen ? (
        <RequestBuilder builder={prrWorkspaceFixture.builder} onClose={() => setRequestBuilderOpen(false)} />
      ) : null}
    </>
  );
}
