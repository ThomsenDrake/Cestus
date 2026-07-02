import type { CommandQueueItem } from "./command-types.js";

interface PriorityQueueProps {
  readonly items: readonly CommandQueueItem[];
  readonly selectedItemId: string | undefined;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
}

const severityClasses: Record<CommandQueueItem["severity"], string> = {
  critical: "border-[var(--cestus-red)]/60 text-[var(--cestus-red)]",
  high: "border-[var(--cestus-amber)]/60 text-[var(--cestus-amber)]",
  medium: "border-[var(--cestus-cyan)]/50 text-[var(--cestus-cyan)]",
  low: "border-white/20 text-[var(--cestus-muted-soft)]"
};

export function PriorityQueue({ items, selectedItemId, onSelectItem, onMarkReviewed }: PriorityQueueProps) {
  if (items.length === 0) {
    return (
      <div className="border border-white/10 p-5 text-base text-pretty text-[var(--cestus-muted-strong)]">
        No urgent work is waiting in this filter.
      </div>
    );
  }

  return (
    <div data-uidotsh-pick="Queue density" className="contents">
      <div data-uidotsh-option="Compact table (current)" className="contents">
        <QueueList
          items={items}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
          mode="compact"
        />
      </div>
      <div data-uidotsh-option="Split row" className="contents" hidden>
        <QueueList
          items={items}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
          mode="split"
        />
      </div>
      <div data-uidotsh-option="Grouped by severity" className="contents" hidden>
        <GroupedQueueList
          items={items}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
        />
      </div>
    </div>
  );
}

function QueueList({
  items,
  selectedItemId,
  onSelectItem,
  onMarkReviewed,
  mode
}: PriorityQueueProps & { readonly mode: "compact" | "split" }) {
  return (
    <div className={mode === "compact" ? "space-y-2" : "grid gap-3"} role="list" aria-label="Priority queue">
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          selected={item.id === selectedItemId}
          onSelectItem={onSelectItem}
          onMarkReviewed={onMarkReviewed}
          mode={mode}
        />
      ))}
    </div>
  );
}

function GroupedQueueList({ items, selectedItemId, onSelectItem, onMarkReviewed }: PriorityQueueProps) {
  const groups = ["critical", "high", "medium", "low"] as const;

  return (
    <div className="space-y-4">
      {groups.map((severity) => {
        const groupItems = items.filter((item) => item.severity === severity);
        if (groupItems.length === 0) {
          return null;
        }

        return (
          <section key={severity} aria-label={`${severity} priority`}>
            <h3 className="mb-2 font-mono text-base text-[var(--cestus-muted-strong)] sm:text-sm">{severity}</h3>
            <div className="space-y-2" role="list" aria-label={`${severity} priority queue`}>
              {groupItems.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedItemId}
                  onSelectItem={onSelectItem}
                  onMarkReviewed={onMarkReviewed}
                  mode="compact"
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function QueueRow({
  item,
  selected,
  onSelectItem,
  onMarkReviewed,
  mode
}: {
  readonly item: CommandQueueItem;
  readonly selected: boolean;
  readonly onSelectItem: (itemId: string) => void;
  readonly onMarkReviewed: (itemId: string) => void;
  readonly mode: "compact" | "split";
}) {
  return (
    <div
      role="listitem"
      className={[
        mode === "compact"
          ? "grid gap-3 border p-3 md:grid-cols-[7rem_minmax(0,1fr)_9rem_9rem]"
          : "grid gap-4 border border-l-4 p-4 md:grid-cols-[minmax(0,1fr)_10rem]",
        selected ? "border-[var(--cestus-cyan)]/70 bg-[var(--cestus-cyan)]/10" : "border-white/10 bg-white/[0.03]"
      ].join(" ")}
    >
      <div className={`w-fit border px-2 py-1 font-mono text-base sm:text-sm ${severityClasses[item.severity]}`}>
        {item.severity}
      </div>
      <button
        type="button"
        aria-label={`Select ${item.title}`}
        onClick={() => onSelectItem(item.id)}
        className="relative min-w-0 text-left"
      >
        <span
          aria-hidden="true"
          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
        />
        <div className="truncate text-base font-medium text-[var(--cestus-text)]">{item.title}</div>
        <div className="mt-1 truncate text-base text-[var(--cestus-muted-strong)] sm:text-sm">{item.context}</div>
      </button>
      <div className="font-mono text-base text-[var(--cestus-muted-soft)] sm:text-sm">{item.state}</div>
      <button
        type="button"
        aria-label={`Mark ${item.title} reviewed`}
        onClick={() => onMarkReviewed(item.id)}
        className="relative min-h-9 justify-self-start border border-white/10 px-3 py-2 text-base text-[var(--cestus-amber)] hover:border-white/20 hover:bg-white/5 sm:text-sm md:justify-self-end"
      >
        <span
          aria-hidden="true"
          className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
        />
        {item.reviewed ? "Reviewed" : "Mark reviewed"}
      </button>
    </div>
  );
}
