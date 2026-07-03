import type { TacticalPanelModel } from "./command-types.js";

interface TacticalPanelProps {
  readonly panel: TacticalPanelModel;
}

const toneClasses: Record<TacticalPanelModel["items"][number]["tone"], string> = {
  amber: "text-[var(--signal-amber)]",
  red: "text-[var(--signal-red)]",
  green: "text-[var(--signal-green)]",
  cyan: "text-[var(--signal-cyan)]",
  neutral: "text-[var(--muted-amber)]"
};

export function TacticalPanel({ panel }: TacticalPanelProps) {
  return (
    <section aria-label={panel.title} className="border border-[var(--console-line)] bg-[var(--console-void)]/72 p-3">
      <h2 className="text-base font-semibold text-balance text-[var(--paper-light)]">{panel.title}</h2>
      <ul role="list" className="mt-4 space-y-3">
        {panel.items.map((item, index) => (
          <li key={item.id} className={index === 0 ? "" : "border-t border-[var(--console-line)] pt-3"}>
            <div className="truncate text-base font-medium text-[var(--paper-light)] sm:text-sm">{item.title}</div>
            <div className={`mt-1 font-mono text-base sm:text-sm ${toneClasses[item.tone]}`}>{item.meta}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
