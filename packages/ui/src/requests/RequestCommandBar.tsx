import type { PrrSavedView, PrrViewMode } from "./request-types.js";

interface RequestCommandBarProps {
  readonly savedViews: readonly PrrSavedView[];
  readonly activeViewId: string;
  readonly viewMode: PrrViewMode;
  readonly onSavedViewChange: (savedViewId: string) => void;
  readonly onViewModeChange: (viewMode: PrrViewMode) => void;
}

const modeControls: readonly { readonly label: string; readonly value: PrrViewMode }[] = [
  { label: "Board view", value: "board" },
  { label: "Signal map", value: "signal-map" }
];

export function RequestCommandBar({
  savedViews,
  activeViewId,
  viewMode,
  onSavedViewChange,
  onViewModeChange
}: RequestCommandBarProps) {
  return (
    <section
      aria-label="Requests command controls"
      className="grid gap-3 border-y border-[var(--console-line)] py-3 md:grid-cols-[minmax(12rem,18rem)_auto] md:items-end md:justify-between"
    >
      <label className="grid gap-2 text-base text-[var(--muted-amber)] sm:text-sm">
        <span className="font-mono">Saved PRR view</span>
        <select
          value={activeViewId}
          onChange={(event) => onSavedViewChange(event.target.value)}
          className="min-h-10 border border-[var(--console-line)] bg-[var(--console-void)] px-3 py-2 text-base text-[var(--paper-light)] outline-none focus:border-[var(--signal-cyan)] sm:text-sm"
        >
          {savedViews.map((view) => (
            <option key={view.id} value={view.id} className="bg-[var(--console-void)] text-[var(--paper-light)]">
              {view.label}
            </option>
          ))}
        </select>
      </label>
      <div aria-label="Request view mode" className="flex gap-2 overflow-x-auto">
        {modeControls.map((control) => (
          <button
            key={control.value}
            type="button"
            aria-pressed={viewMode === control.value}
            onClick={() => onViewModeChange(control.value)}
            className={[
              "relative min-h-10 shrink-0 border px-3 py-2 text-base sm:text-sm",
              viewMode === control.value
                ? "border-[var(--signal-orange)] bg-[var(--signal-orange)]/12 text-[var(--paper-light)]"
                : "border-[var(--console-line)] text-[var(--muted-amber)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] hover:text-[var(--paper-light)]"
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
            {control.label}
          </button>
        ))}
      </div>
    </section>
  );
}
