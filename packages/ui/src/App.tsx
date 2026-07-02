import { useMemo, useState } from "react";
import { buildCommandBoardViewModel } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import type { QueueFilter } from "./workspace/command-types.js";
import { CommandDashboard } from "./workspace/CommandDashboard.js";
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

  return (
    <OpsShell
      modules={workspaceModules}
      activeModuleId="command"
      workspaceName="Cestus Local"
      syncLabel="Local ledger synced"
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
      contextRail={
        <aside aria-label="Context rail" className="p-4">
          Agent brief
        </aside>
      }
    />
  );
}
