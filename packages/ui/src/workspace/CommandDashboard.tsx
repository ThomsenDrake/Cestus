import { filterQueueItems } from "./command-model.js";
import type { CommandBoardViewModel, QueueFilter } from "./command-types.js";
import { PriorityQueue } from "./PriorityQueue.js";
import { QueueFilters } from "./QueueFilters.js";
import { StatusStrip } from "./StatusStrip.js";
import { TacticalPanel } from "./TacticalPanel.js";

interface CommandDashboardProps {
  readonly model: CommandBoardViewModel;
  readonly activeFilter: QueueFilter;
  readonly selectedItemId: string | undefined;
  readonly onFilterChange: (filter: QueueFilter) => void;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
}

export function CommandDashboard({
  model,
  activeFilter,
  selectedItemId,
  onFilterChange,
  onSelectItem,
  onMarkReviewed
}: CommandDashboardProps) {
  const visibleItems = filterQueueItems(model.queueItems, activeFilter);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-base text-[var(--cestus-cyan)] sm:text-sm">Daily command center</p>
        <h1 className="mt-1 text-2xl font-semibold text-balance">Command</h1>
      </div>
      <StatusStrip metrics={model.statusMetrics} />
      <section className="space-y-3" aria-labelledby="priority-queue-heading">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 id="priority-queue-heading" className="text-lg font-semibold text-balance">
            Priority queue
          </h2>
          <QueueFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />
        </div>
        <PriorityQueue
          items={visibleItems}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
        />
      </section>
      <div className="grid gap-3 xl:grid-cols-3">
        {model.tacticalPanels.map((panel) => (
          <TacticalPanel key={panel.id} panel={panel} />
        ))}
      </div>
    </div>
  );
}
