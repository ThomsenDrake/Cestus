import type { OperatorSafeActionDto, OperatorStatusSectionDto } from "./operator-status-types.js";

interface OperatorStatusBandProps {
  readonly section: OperatorStatusSectionDto;
  readonly primaryAction: OperatorSafeActionDto | undefined;
  readonly selected: boolean;
  readonly onSelect: (sectionId: OperatorStatusSectionDto["sectionId"]) => void;
}

const stateToneClasses: Record<OperatorStatusSectionDto["state"], string> = {
  ready: "border-[var(--signal-green)]/60 text-[var(--signal-green)]",
  degraded: "border-[var(--signal-amber)]/60 text-[var(--signal-amber)]",
  "action-required": "border-[var(--signal-cyan)]/60 text-[var(--signal-cyan)]",
  blocked: "border-[var(--signal-red)]/60 text-[var(--signal-red)]",
  unavailable: "border-[var(--signal-red)]/60 text-[var(--signal-red)]"
};

const metricToneClasses: Record<OperatorStatusSectionDto["metrics"][number]["tone"], string> = {
  attention: "text-[var(--signal-amber)]",
  danger: "text-[var(--signal-red)]",
  healthy: "text-[var(--signal-green)]",
  machine: "text-[var(--signal-cyan)]",
  neutral: "text-[var(--muted-amber)]"
};

export function OperatorStatusBand({ section, primaryAction, selected, onSelect }: OperatorStatusBandProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(section.sectionId)}
      className={[
        "relative min-h-40 border bg-[var(--console-void)]/72 p-3 text-left hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]",
        selected ? "border-[var(--signal-cyan)]" : "border-[var(--console-line)]"
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
      />
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="truncate text-base font-semibold text-[var(--paper-light)] sm:text-sm">{section.label}</span>
          <span className="mt-1 text-base text-[var(--muted-amber)] sm:text-sm">{section.headline}</span>
        </span>
        <span className={`shrink-0 border px-2 py-1 font-mono text-base sm:text-sm ${stateToneClasses[section.state]}`}>
          {stateLabel(section.state)}
        </span>
      </span>
      <span className="mt-4 grid gap-2 sm:grid-cols-2">
        {section.metrics.map((metric) => (
          <span key={metric.metricId} className="min-w-0 border-t border-[var(--console-line)] pt-2">
            <span className="truncate text-base text-[var(--muted-amber)] sm:text-sm">{metric.label}</span>
            <span className={`mt-1 font-mono text-base sm:text-sm ${metricToneClasses[metric.tone]}`}>{metric.value}</span>
          </span>
        ))}
      </span>
      {primaryAction === undefined ? null : (
        <span className="mt-4 border-t border-[var(--console-line)] pt-3 font-mono text-base text-[var(--signal-amber)] sm:text-sm">
          {primaryAction.label}
        </span>
      )}
    </button>
  );
}

function stateLabel(state: OperatorStatusSectionDto["state"]): string {
  switch (state) {
    case "action-required":
      return "action";
    case "blocked":
      return "blocked";
    case "degraded":
      return "degraded";
    case "ready":
      return "ready";
    case "unavailable":
      return "unavailable";
  }
}
