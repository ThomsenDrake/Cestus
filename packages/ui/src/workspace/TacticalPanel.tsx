import type { TacticalPanelModel } from "./command-types.js";

interface TacticalPanelProps {
  readonly panel: TacticalPanelModel;
}

const toneClasses: Record<TacticalPanelModel["items"][number]["tone"], string> = {
  amber: "text-[var(--cestus-amber)]",
  red: "text-[var(--cestus-red)]",
  green: "text-[var(--cestus-green)]",
  cyan: "text-[var(--cestus-cyan)]",
  neutral: "text-[#c8c2b8]"
};

export function TacticalPanel({ panel }: TacticalPanelProps) {
  return (
    <section aria-label={panel.title} className="border border-white/10 p-4">
      <h2 className="text-base font-semibold text-balance">{panel.title}</h2>
      <ul role="list" className="mt-4 space-y-3">
        {panel.items.map((item) => (
          <li key={item.id} className="border-l border-white/10 pl-3">
            <div className="truncate text-base font-medium text-[var(--cestus-text)] sm:text-sm">{item.title}</div>
            <div className={`mt-1 font-mono text-base sm:text-sm ${toneClasses[item.tone]}`}>{item.meta}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
