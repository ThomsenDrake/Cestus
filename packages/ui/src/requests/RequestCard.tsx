import type { PrrRequestCard } from "./request-types.js";

interface RequestCardProps {
  readonly card: PrrRequestCard;
  readonly selected: boolean;
  readonly onSelectRequest: (prrRequestId: string) => void;
}

const severityClasses: Record<PrrRequestCard["severity"], string> = {
  critical: "border-[var(--signal-red)] text-[var(--signal-red)]",
  high: "border-[var(--signal-amber)] text-[var(--signal-amber)]",
  medium: "border-[var(--signal-cyan)] text-[var(--signal-cyan)]",
  low: "border-[var(--console-line)] text-[var(--muted-amber)]"
};

export function RequestCard({ card, selected, onSelectRequest }: RequestCardProps) {
  return (
    <button
      type="button"
      aria-label={`Select ${card.title}`}
      onClick={() => onSelectRequest(card.prrRequestId)}
      className={[
        "relative grid min-h-64 w-full grid-rows-[auto_1fr_auto] border bg-[var(--console-void)]/72 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-cyan)]",
        selected
          ? "border-[var(--signal-cyan)] shadow-[0_0_0_1px_var(--signal-cyan)]"
          : "border-[var(--console-line)] hover:border-[var(--signal-amber)] hover:bg-[var(--console-panel)]/72"
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2"
      />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-[var(--paper-light)] sm:text-sm">{card.title}</span>
        <span className="mt-1 block font-mono text-base text-[var(--muted-amber)] sm:text-sm">{card.prrRequestId}</span>
      </span>
      <span className="mt-4 grid content-start gap-2">
        <span className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-2 text-base sm:text-sm">
          <span className={`w-fit border px-2 py-1 font-mono ${severityClasses[card.severity]}`}>{card.severity}</span>
          <span className="truncate font-mono text-[var(--muted-amber)]">{card.deadlineLabel}</span>
        </span>
        <CardFact label="Provider" value={card.providerLabel} />
        <CardFact label="Fee" value={card.feeSignal} />
        <CardFact label="Evidence packets" value={String(card.productionCount)} />
      </span>
      <span className="mt-4 border-t border-[var(--console-line)] pt-3">
        <span className="block truncate font-mono text-base text-[var(--signal-amber)] sm:text-sm">
          {card.nextActionLabel}
        </span>
      </span>
    </button>
  );
}

function CardFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-2 text-base sm:text-sm">
      <span className="truncate font-mono text-[var(--muted-amber)]">{label}</span>
      <span className="truncate text-[var(--paper-light)]">{value}</span>
    </span>
  );
}
