import { buildCommandBoardViewModel } from "./workspace/command-model.js";
import { commandWorkspaceFixture } from "./workspace/command-fixtures.js";
import { OpsShell } from "./workspace/OpsShell.js";
import { workspaceModules } from "./workspace/workspace-nav.js";

const model = buildCommandBoardViewModel(commandWorkspaceFixture);

export function App() {
  return (
    <OpsShell
      modules={workspaceModules}
      activeModuleId="command"
      workspaceName="Cestus Local"
      syncLabel="Local ledger synced"
      onNewRequest={() => undefined}
      main={
        <section>
          <h1 className="text-2xl font-semibold text-balance">Command</h1>
          <p className="mt-2 text-base text-pretty text-[#c8c2b8] sm:text-sm">
            {model.queueItems.length} signals ready for review.
          </p>
        </section>
      }
      contextRail={
        <aside aria-label="Context rail" className="p-4">
          Agent brief
        </aside>
      }
    />
  );
}
