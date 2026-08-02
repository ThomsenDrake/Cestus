import { filterQueueItems, getQueueEmptyMessage } from "./command-model.js";
import type { CommandBoardViewModel, QueueFilter } from "./command-types.js";
import { PriorityQueue } from "./PriorityQueue.js";
import { QueueFilters } from "./QueueFilters.js";
import { RuntimeSourceStatus } from "./RuntimeSourceStatus.js";
import { SignalStrip } from "./SignalStrip.js";
import { TacticalPanel } from "./TacticalPanel.js";

interface CommandDashboardProps {
  readonly model: CommandBoardViewModel;
  readonly activeFilter: QueueFilter;
  readonly selectedItemId: string | undefined;
  readonly onFilterChange: (filter: QueueFilter) => void;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
  readonly onNavigate?: ((moduleId: string) => void) | undefined;
}

export function CommandDashboard({
  model,
  activeFilter,
  selectedItemId,
  onFilterChange,
  onSelectItem,
  onMarkReviewed,
  onNavigate = () => undefined
}: CommandDashboardProps) {
  const visibleItems = filterQueueItems(model.queueItems, activeFilter);
  const emptyMessage = getQueueEmptyMessage(visibleItems, model.runtimeSources, activeFilter);

  return (
    <section aria-label="Central tactical field" className="space-y-5">
      <div className="border-b border-[var(--console-line)] pb-4">
        <p className="font-mono text-base text-[var(--signal-amber)] sm:text-sm">Public records operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-balance text-[var(--paper-light)]">Command</h1>
      </div>
      <SignalStrip metrics={model.statusMetrics} />
      <RuntimeSourceStatus sources={model.runtimeSources} onNavigate={onNavigate} />
      <section className="space-y-3" aria-labelledby="priority-queue-heading">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 id="priority-queue-heading" className="text-lg font-semibold text-balance text-[var(--paper-light)]">
            Priority queue
          </h2>
          <QueueFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />
        </div>
        <PriorityQueue
          items={visibleItems}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
          emptyMessage={emptyMessage}
        />
      </section>
      <div className="grid gap-3 xl:grid-cols-3">
        {model.tacticalPanels.map((panel) => (
          <TacticalPanel key={panel.id} panel={panel} />
        ))}
      </div>
    </section>
  );
}
