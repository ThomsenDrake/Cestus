import { useMemo, useState } from "react";
import { buildCommandBoardViewModel, getSelectedCommandItem } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { CommandDashboard } from "./workspace/CommandDashboard.js";
import { DecisionRail } from "./workspace/DecisionRail.js";
import { OpsShell } from "./workspace/OpsShell.js";
import { workspaceModules } from "./workspace/workspace-nav.js";

export function App() {
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [reviewedItemIds, setReviewedItemIds] = useState<readonly string[]>([]);
  const model = useMemo(
    () => buildCommandBoardViewModel({ ...commandWorkspaceFixture, reviewedItemIds }),
    [reviewedItemIds]
  );
  const selectedItem = getSelectedCommandItem(model, selectedItemId);

  return (
    <OpsShell
      modules={workspaceModules}
      activeModuleId="command"
      workspaceName="Cestus Local"
      modeLabel="Command"
      ledgerLabel="Ledger synced"
      syncLabel="Local sync live"
      deploymentLabel="Solo laptop"
      onNewRequest={() => undefined}
      main={
        <CommandDashboard
          model={model}
          activeFilter={activeFilter}
          selectedItemId={selectedItemId}
          onFilterChange={setActiveFilter}
          onSelectItem={setSelectedItemId}
          onMarkReviewed={(itemId) => setReviewedItemIds((current) => [...new Set([...current, itemId])])}
        />
      }
      decisionRail={
        <DecisionRail
          agentBrief={model.agentBrief}
          defaultVotes={model.decisionRail.defaultVotes}
          selectedItem={selectedItem}
          onClearSelection={() => setSelectedItemId(undefined)}
        />
      }
    />
  );
}
