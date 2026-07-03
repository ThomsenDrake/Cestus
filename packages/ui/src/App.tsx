import { useMemo, useState } from "react";
import { buildCommandBoardViewModel, getSelectedCommandItem } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { prrWorkspaceFixture } from "./requests/request-fixtures.js";
import { RequestWorkspace } from "./requests/RequestWorkspace.js";
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
  const requestsMain = <RequestWorkspace fixture={prrWorkspaceFixture} onOpenBuilder={() => undefined} />;
  const commandDecisionRail = (
    <DecisionRail
      agentBrief={model.agentBrief}
      defaultVotes={model.decisionRail.defaultVotes}
      selectedItem={selectedItem}
      onClearSelection={() => setSelectedItemId(undefined)}
    />
  );
  const requestsDecisionRail = (
    <aside aria-label="Request detail rail" className="h-full p-4 lg:p-5">
      Select a request to inspect next action.
    </aside>
  );
  function handleModuleSelect(moduleId: string) {
    if (implementedModuleIds.has(moduleId)) {
      setActiveModuleId(moduleId);
    }
  }

  return (
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
      onNewRequest={() => undefined}
      onModuleSelect={handleModuleSelect}
      main={requestsActive ? requestsMain : commandMain}
      decisionRail={requestsActive ? requestsDecisionRail : commandDecisionRail}
    />
  );
}
