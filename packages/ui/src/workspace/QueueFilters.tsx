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
              ? "border-[var(--cestus-cyan)]/50 bg-[var(--cestus-cyan)]/10 text-[var(--cestus-text)]"
              : "border-white/10 text-[#b8afa3] hover:border-white/20 hover:bg-white/5 hover:text-[var(--cestus-text)]"
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
