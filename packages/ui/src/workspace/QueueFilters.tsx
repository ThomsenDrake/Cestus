import type { QueueFilter } from "./command-types.js";

interface QueueFiltersProps {
  readonly activeFilter: QueueFilter;
  readonly onFilterChange: (filter: QueueFilter) => void;
}

const filters: readonly { readonly label: string; readonly value: QueueFilter }[] = [
  { label: "All", value: "all" },
  { label: "Deadlines", value: "deadline" },
  { label: "Signals", value: "signal" },
  { label: "Evidence", value: "evidence" },
  { label: "Advisories", value: "advisory" },
  { label: "Diagnostics", value: "diagnostic" }
];

export function QueueFilters({ activeFilter, onFilterChange }: QueueFiltersProps) {
  return (
    <div aria-label="Queue filters" className="flex gap-2 overflow-x-auto">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          aria-pressed={activeFilter === filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={[
            "relative min-h-9 shrink-0 border px-3 py-2 text-base sm:text-sm",
            activeFilter === filter.value
              ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
              : "border-[var(--console-line)] text-[var(--muted-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
          />
          {filter.label}
        </button>
      ))}
    </div>
  );
}
