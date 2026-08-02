import type { CommandQueueItem } from "./command-types.js";

interface PriorityQueueProps {
  readonly items: readonly CommandQueueItem[];
  readonly selectedItemId: string | undefined;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
  readonly emptyMessage?: string | undefined;
}

const severityClasses: Record<CommandQueueItem["severity"], string> = {
  critical: "border-[var(--signal-red)] text-[var(--signal-red)]",
  high: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  medium: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  low: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function PriorityQueue({
  items,
  selectedItemId,
  onSelectItem,
  onMarkReviewed,
  emptyMessage = "No urgent work is waiting in this filter."
}: PriorityQueueProps) {
  if (items.length === 0) {
    return (
      <div className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-5 text-base text-pretty text-[var(--muted-amber)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div role="list" aria-label="Priority queue" className="border-y border-[var(--console-line)]">
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          selected={item.id === selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
        />
      ))}
    </div>
  );
}

function QueueRow({
  item,
  selected,
  onSelectItem,
  onMarkReviewed
}: {
  readonly item: CommandQueueItem;
  readonly selected: boolean;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
}) {
  return (
    <div
      role="listitem"
      className={[
        "border-t border-[var(--console-line)] bg-[var(--console-void)]/72 p-3 first:border-t-0",
        selected ? "bg-[var(--console-panel)]/72 outline outline-1 -outline-offset-1 outline-[var(--signal-cyan)]" : ""
      ].join(" ")}
    >
      <div className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)] md:items-start">
        <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${severityClasses[item.severity]}`}>
          {item.severity}
        </div>
        <button
          type="button"
          aria-label={`Select ${item.title}`}
          onClick={() => onSelectItem(item.id)}
          className="relative min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          <div className="truncate text-base font-medium text-[var(--paper-light)] sm:text-sm">{item.title}</div>
          <div className="mt-1 truncate text-base text-[var(--muted-amber)] sm:text-sm">{item.context}</div>
        </button>
      </div>
      <div className="mt-3 grid gap-3 border-t border-[var(--console-line)] pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="font-mono text-base text-[var(--paper-light)] sm:text-sm">{item.state}</div>
          <div className="mt-1 truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">
            {item.kind} / {item.sourceLabel}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Mark ${item.title} reviewed`}
          onClick={() => onMarkReviewed(item.id)}
          className="relative min-h-9 justify-self-start border border-[var(--console-line)] px-3 py-2 text-base text-[var(--signal-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)] sm:text-sm md:justify-self-end"
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          {item.reviewed ? "Reviewed" : "Mark reviewed"}
        </button>
      </div>
    </div>
  );
}
