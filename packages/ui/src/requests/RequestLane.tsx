import type { PrrAgencyGroup, PrrLaneModel } from "./request-types.js";
import { RequestCard } from "./RequestCard.js";

interface RequestLaneProps {
  readonly lane: PrrLaneModel;
  readonly selectedRequestId: string | undefined;
  readonly onSelectRequest: (prrRequestId: string) => void;
}

const heatClasses: Record<PrrAgencyGroup["heat"], string> = {
  amber: "text-[var(--signal-amber)]",
  red: "text-[var(--signal-red)]",
  green: "text-[var(--signal-green)]",
  cyan: "text-[var(--signal-cyan)]",
  neutral: "text-[var(--muted-amber)]"
};

export function RequestLane({ lane, selectedRequestId, onSelectRequest }: RequestLaneProps) {
  const cardCount = lane.agencyGroups.reduce((total, group) => total + group.cards.length, 0);

  return (
    <section
      aria-label={lane.label}
      className="grid min-h-[26rem] grid-rows-[auto_1fr] border border-[var(--console-line)] bg-[var(--console-panel)]/72"
    >
      <div className="flex min-h-16 items-start justify-between gap-3 border-b border-[var(--console-line)] p-3">
        <h2 className="text-base font-semibold text-balance text-[var(--paper-light)]">{lane.label}</h2>
        <div className="shrink-0 border border-[var(--console-line)] px-2 py-1 font-mono text-base text-[var(--muted-amber)] sm:text-sm">
          {cardCount}
        </div>
      </div>
      {cardCount === 0 ? (
        <div className="p-3 text-base text-pretty text-[var(--muted-amber)] sm:text-sm">
          No requests are currently routed to this action state.
        </div>
      ) : (
        <div className="space-y-3 p-3">
          {lane.agencyGroups.map((group) => (
            <section key={group.agencyId} aria-label={group.agencyName} className="space-y-2">
              <div className="min-w-0 border-b border-[var(--console-line)] pb-2">
                <h3 className={`truncate text-base font-semibold sm:text-sm ${heatClasses[group.heat]}`}>
                  {group.agencyName}
                </h3>
                <div className="mt-1 truncate font-mono text-base text-[var(--muted-amber)] sm:text-sm">
                  {group.jurisdictionLabel} / {group.summary}
                </div>
              </div>
              <div className="grid gap-2">
                {group.cards.map((card) => (
                  <RequestCard
                    key={card.id}
                    card={card}
                    selected={selectedRequestId === card.prrRequestId}
                    onSelectRequest={onSelectRequest}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
